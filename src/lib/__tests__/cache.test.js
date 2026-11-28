// Area C-ADMIN fix pass (28 Nov 2026): cache.js recordPlay /
// flushPlays (slug→UUID resolution, drop-unresolvable, M12 re-queue
// only resolvable rows) and M35 (only the 'home' Redis key is ever
// deleted — 'tracks' / 'search' keys can never exist).
//
// The module is re-imported fresh per test (vi.resetModules) so the
// play buffer starts empty. The supabase + supabaseCatalog mocks read
// hoisted mutable state, so each test controls resolution and insert
// failures.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const UUID1 = '11111111-2222-3333-4444-555555555555'
const UUID2 = '22222222-3333-4444-5555-666666666666'

const { resolveState, insertState, insertCalls, redisDelCalls, supabaseState } = vi.hoisted(() => {
  const resolveState = { map: {} }
  const insertState = { error: null }
  const insertCalls = []
  const redisDelCalls = []
  const supabaseState = { value: null }
  return { resolveState, insertState, insertCalls, redisDelCalls, supabaseState }
})

vi.mock('../redisGuard.js', () => ({
  redisDelViaProxy: async (...keys) => {
    redisDelCalls.push(keys)
    return true
  },
  invalidateCachedFetch: () => {},
}))

vi.mock('../supabase.js', () => ({
  get supabase() {
    return supabaseState.value
  },
}))

vi.mock('../supabaseCatalog.js', () => ({
  resolveTrackDbIds: async (ids) =>
    new Map((ids || []).map((id) => [id, resolveState.map[id] ?? null])),
}))

function fakeSupabase() {
  return {
    from: (table) => ({
      insert: async (rows) => {
        insertCalls.push({ table, rows })
        return { error: insertState.error }
      },
    }),
  }
}

let cache

async function loadCache() {
  vi.resetModules()
  cache = await import('../cache.js')
  return cache
}

beforeEach(() => {
  resolveState.map = {}
  insertState.error = null
  insertCalls.length = 0
  redisDelCalls.length = 0
  supabaseState.value = fakeSupabase()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recordPlay / flushPlays', () => {
  it('flushes buffered counts with slugs resolved to DB uuids', async () => {
    await loadCache()
    resolveState.map = { slug1: UUID1, slug2: UUID2 }
    cache.recordPlay('slug1')
    cache.recordPlay('slug1')
    cache.recordPlay('slug2')
    const res = await cache.flushPlays()
    expect(res).toEqual({ flushed: 2 })
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0].table).toBe('play_events')
    expect(insertCalls[0].rows).toEqual([
      { track_id: UUID1, count: 2, played_at: expect.any(String) },
      { track_id: UUID2, count: 1, played_at: expect.any(String) },
    ])
    // Buffer is empty after a successful flush.
    expect(await cache.flushPlays()).toEqual({ flushed: 0 })
    expect(insertCalls).toHaveLength(1)
  })

  it('drops rows that cannot be resolved (local-only track) and never retries them', async () => {
    await loadCache()
    resolveState.map = { known: UUID1 }
    cache.recordPlay('known')
    cache.recordPlay('unknown-local')
    const res = await cache.flushPlays()
    expect(res).toEqual({ flushed: 1 })
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0].rows).toHaveLength(1)
    expect(insertCalls[0].rows[0].track_id).toBe(UUID1)
    // The dropped row is gone for good — the next flush is a no-op.
    expect(await cache.flushPlays()).toEqual({ flushed: 0 })
    expect(insertCalls).toHaveLength(1)
  })

  it('returns no-db-id when nothing resolves, and drops those rows', async () => {
    await loadCache()
    resolveState.map = {}
    cache.recordPlay('local-only')
    const res = await cache.flushPlays()
    expect(res).toEqual({ flushed: 0, skipped: 'no-db-id' })
    expect(insertCalls).toHaveLength(0)
    expect(await cache.flushPlays()).toEqual({ flushed: 0 })
  })

  it('M12: on insert failure only the RESOLVABLE rows are re-queued', async () => {
    await loadCache()
    resolveState.map = { known: UUID1 }
    insertState.error = { message: 'insert failed' }
    cache.recordPlay('known')
    cache.recordPlay('known')
    cache.recordPlay('unknown-local')
    const failed = await cache.flushPlays()
    expect(failed.flushed).toBe(0)
    expect(failed.error).toMatch(/insert failed/)
    expect(insertCalls).toHaveLength(1)

    // The insert works now: only the resolvable row retries, with
    // its count preserved; the dropped row never comes back.
    insertState.error = null
    const retried = await cache.flushPlays()
    expect(retried).toEqual({ flushed: 1 })
    expect(insertCalls).toHaveLength(2)
    expect(insertCalls[1].rows).toEqual([
      { track_id: UUID1, count: 2, played_at: expect.any(String) },
    ])
    expect(await cache.flushPlays()).toEqual({ flushed: 0 })
  })

  it('empty buffer is a no-op', async () => {
    await loadCache()
    expect(await cache.flushPlays()).toEqual({ flushed: 0 })
    expect(insertCalls).toHaveLength(0)
  })

  it('no-supabase path returns skipped and does not insert', async () => {
    supabaseState.value = null
    await loadCache()
    cache.recordPlay('slug1')
    const res = await cache.flushPlays()
    expect(res).toEqual({ flushed: 0, skipped: 'no-supabase' })
    expect(insertCalls).toHaveLength(0)
  })
})

describe('M35 — Redis DELs only ever target the home key', () => {
  it('invalidateCatalog deletes only "home" from Redis', async () => {
    await loadCache()
    await cache.invalidateCatalog()
    expect(redisDelCalls).toEqual([['home']])
  })

  it('invalidateTrack does not call Redis at all', async () => {
    await loadCache()
    await cache.invalidateTrack('some-track')
    expect(redisDelCalls).toEqual([])
  })

  it('invalidateSearch does not call Redis at all', async () => {
    await loadCache()
    await cache.invalidateSearch()
    expect(redisDelCalls).toEqual([])
  })

  it('invalidateHome deletes only "home"', async () => {
    await loadCache()
    await cache.invalidateHome()
    expect(redisDelCalls).toEqual([['home']])
  })
})
