// Area C-ADMIN fix pass (28 Nov 2026): redisGuard budget counting,
// circuit breaker (open / half-open), priority shedding, write-proxy
// gating. Follows the redis-agent-skills guidance: the guard is the
// account-wide safety net (a quota 429 is seen by every device), the
// per-device localStorage counter is only a local ceiling, and writes
// never go direct from the browser — they go through the redis-cache
// Edge Function (write proxy), gated on isRedisConfigured.
//
// The module is re-imported fresh per test (vi.resetModules) so the
// circuit breaker, memory cache and budget counter start clean. The
// config mock reads a hoisted mutable state, so each test can choose
// "configured" vs "unconfigured" before importing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockState, invokeCalls, lsStore } = vi.hoisted(() => {
  const mockState = {
    configured: true,
    budget: 100,
    url: 'https://example.upstash.io',
    token: 'read-only-token',
  }
  const invokeCalls = []
  const lsStore = new Map()
  return { mockState, invokeCalls, lsStore }
})

vi.mock('../config.js', () => {
  // Getters (not plain values): vi.resetModules() does NOT re-run a
  // vi.mock factory, so the mocked exports must read the CURRENT
  // mockState on every access — otherwise toggling `configured`
  // per test would have no effect.
  const config = {}
  Object.defineProperties(config, {
    upstashRedisUrl: { get: () => (mockState.configured ? mockState.url : '') },
    upstashRedisToken: { get: () => (mockState.configured ? mockState.token : '') },
    redisMonthlyBudget: { get: () => mockState.budget },
  })
  const mocked = {}
  Object.defineProperties(mocked, {
    config: { get: () => config },
    isRedisConfigured: { get: () => mockState.configured },
  })
  return mocked
})

vi.mock('../supabase.js', () => ({
  supabase: {
    functions: {
      invoke: async (...args) => {
        invokeCalls.push(args)
        return { data: { ok: true }, error: null }
      },
    },
  },
}))

function budgetKey() {
  const d = new Date()
  return `nandha-redis-budget:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function setUsed(n) {
  lsStore.set(budgetKey(), String(n))
}

function readUsed() {
  return Number.parseInt(lsStore.get(budgetKey()) ?? '0', 10)
}

function missResponse() {
  return { status: 200, ok: true, json: async () => ({ result: null }) }
}

let fetchMock
let guard
let now

async function loadGuard() {
  vi.resetModules()
  guard = await import('../redisGuard.js')
  return guard
}

beforeEach(() => {
  mockState.configured = true
  mockState.budget = 100
  invokeCalls.length = 0
  lsStore.clear()
  fetchMock = vi.fn(async () => missResponse())
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('localStorage', {
    getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
    setItem: (k, v) => lsStore.set(k, String(v)),
    removeItem: (k) => lsStore.delete(k),
    clear: () => lsStore.clear(),
    get length() {
      return lsStore.size
    },
    key: (i) => [...lsStore.keys()][i] ?? null,
  })
  now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  // Silence the one-time read-only-token console warning.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('budget counting', () => {
  it('counts the Redis GET (and the fire-and-forget SET) against the monthly budget', async () => {
    await loadGuard()
    const value = await guard.cachedFetch('home', async () => ({ tracks: [] }), {
      priority: 'high',
    })
    expect(value).toEqual({ tracks: [] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // The SET via the write proxy is fire-and-forget — let it run.
    await new Promise((r) => setTimeout(r, 0))
    // 1 GET + 1 SET = 2 commands counted for this device.
    expect(readUsed()).toBe(2)
    expect(guard.getRedisGuardStatus().used).toBe(2)
    expect(guard.getRedisGuardStatus().pctUsed).toBe(2)
  })

  it('skips Redis entirely once the per-device budget is exhausted', async () => {
    setUsed(100)
    await loadGuard()
    const value = await guard.cachedFetch('home', async () => 'from-loader', {
      priority: 'high',
    })
    expect(value).toBe('from-loader')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(guard.getRedisGuardStatus().enabled).toBe(false)
  })
})

describe('priority shedding (70% of budget)', () => {
  it('sheds low-priority keys past 70% but still serves high-priority keys', async () => {
    setUsed(70)
    await loadGuard()
    const low = await guard.cachedFetch('low-key', async () => 'low-value', {
      priority: 'low',
    })
    expect(low).toBe('low-value')
    expect(fetchMock).not.toHaveBeenCalled()

    const high = await guard.cachedFetch('high-key', async () => 'high-value', {
      priority: 'high',
    })
    expect(high).toBe('high-value')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not shed low-priority keys below 70%', async () => {
    setUsed(69)
    await loadGuard()
    await guard.cachedFetch('low-key', async () => 'low-value', { priority: 'low' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('circuit breaker', () => {
  it('opens after 3 consecutive failures and stops calling Redis', async () => {
    fetchMock = vi.fn(async () => {
      throw new Error('network down')
    })
    vi.stubGlobal('fetch', fetchMock)
    await loadGuard()
    // Three distinct keys (a loader hit is cached per key, so the
    // same key would never reach Redis twice).
    for (const key of ['k1', 'k2', 'k3']) {
      const v = await guard.cachedFetch(key, async () => `loaded-${key}`)
      expect(v).toBe(`loaded-${key}`)
    }
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(guard.getRedisGuardStatus().circuit).toBe('open')

    const v4 = await guard.cachedFetch('k4', async () => 'loaded-k4')
    expect(v4).toBe('loaded-k4')
    // Circuit open: no 4th Redis call, the loader serves it.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('opens immediately on a quota (429) error — the account-wide signal', async () => {
    fetchMock = vi.fn(async () => ({ status: 429, ok: false, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    await loadGuard()
    const v = await guard.cachedFetch('k1', async () => 'loaded-k1')
    expect(v).toBe('loaded-k1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(guard.getRedisGuardStatus().circuit).toBe('open')

    await guard.cachedFetch('k2', async () => 'loaded-k2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('half-opens after 5 minutes and closes on a successful probe', async () => {
    fetchMock = vi.fn(async () => {
      throw new Error('network down')
    })
    vi.stubGlobal('fetch', fetchMock)
    await loadGuard()
    for (const key of ['k1', 'k2', 'k3']) {
      await guard.cachedFetch(key, async () => `loaded-${key}`)
    }
    expect(guard.getRedisGuardStatus().circuit).toBe('open')

    // Still open just before the 5-minute window ends.
    now += 5 * 60 * 1000 - 1
    await guard.cachedFetch('k4', async () => 'loaded-k4')
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Past the window: one probe call is allowed, and a success
    // closes the circuit again.
    now += 2
    fetchMock = vi.fn(async () => missResponse())
    vi.stubGlobal('fetch', fetchMock)
    const v = await guard.cachedFetch('k5', async () => 'loaded-k5')
    expect(v).toBe('loaded-k5')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(guard.getRedisGuardStatus().circuit).toBe('closed')

    // The next key goes through Redis normally again.
    await guard.cachedFetch('k6', async () => 'loaded-k6')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('write proxy gating', () => {
  it('does not call the Edge Function when Redis is unconfigured', async () => {
    mockState.configured = false
    await loadGuard()
    const ok = await guard.redisDelViaProxy('home')
    expect(ok).toBe(false)
    expect(invokeCalls).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls the write proxy (never Upstash directly) when configured', async () => {
    await loadGuard()
    const ok = await guard.redisDelViaProxy('home')
    expect(ok).toBe(true)
    expect(invokeCalls).toHaveLength(1)
    expect(invokeCalls[0][0]).toBe('redis-cache')
    expect(invokeCalls[0][1].body.op).toBe('del')
    expect(invokeCalls[0][1].body.keys).toEqual(['nandha:nandha-cache-v1:home'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cachedFetch with Redis unconfigured serves the loader and never fetches', async () => {
    mockState.configured = false
    await loadGuard()
    const v = await guard.cachedFetch('home', async () => 'from-loader', { priority: 'high' })
    expect(v).toBe('from-loader')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(guard.getRedisGuardStatus().redisConfigured).toBe(false)
  })
})
