// Admin health snapshot + storage probe (admin redesign, shared
// components). Pure-function tests — no DOM, no Supabase needed.
import { describe, it, expect } from 'vitest'
import { getHealthSnapshot, checkStorageHealth } from '../../admin/lib/adminHealth.js'

describe('getHealthSnapshot', () => {
  it('reports live data source + ok role + ok storage when everything is healthy', () => {
    expect(
      getHealthSnapshot({ catalogSource: 'supabase', roleWarning: false, storage: 'ok' }),
    ).toEqual({
      dataSource: { status: 'live', labelKey: 'admin.statusDataLive' },
      role: { status: 'ok' },
      storage: { status: 'ok' },
    })
  })

  it('reports fallback data source with the fallback label key', () => {
    const snap = getHealthSnapshot({ catalogSource: 'fallback', roleWarning: false, storage: 'ok' })
    expect(snap.dataSource).toEqual({ status: 'fallback', labelKey: 'admin.statusDataFallback' })
  })

  it('treats any non-supabase catalog source as fallback', () => {
    expect(getHealthSnapshot({ catalogSource: undefined }).dataSource.status).toBe('fallback')
    expect(getHealthSnapshot({}).dataSource.status).toBe('fallback')
    expect(getHealthSnapshot({ catalogSource: 'whatever' }).dataSource.status).toBe('fallback')
  })

  it('reports a missing role when the role warning is set', () => {
    expect(getHealthSnapshot({ roleWarning: true }).role).toEqual({ status: 'missing' })
  })

  it('reports an unknown role when no warning value is given', () => {
    expect(getHealthSnapshot({}).role).toEqual({ status: 'unknown' })
    expect(getHealthSnapshot({ roleWarning: null }).role).toEqual({ status: 'unknown' })
  })

  it('passes storage through, and coerces anything else to unknown', () => {
    expect(getHealthSnapshot({ storage: 'fail' }).storage).toEqual({ status: 'fail' })
    expect(getHealthSnapshot({ storage: 'unknown' }).storage).toEqual({ status: 'unknown' })
    expect(getHealthSnapshot({ storage: 'broken' }).storage).toEqual({ status: 'unknown' })
    expect(getHealthSnapshot({}).storage).toEqual({ status: 'unknown' })
  })
})

describe('checkStorageHealth', () => {
  function fakeClient(listFn, seen) {
    return {
      storage: {
        from: (bucket) => {
          if (seen) seen.bucket = bucket
          return { list: listFn }
        },
      },
    }
  }

  it("returns 'unknown' with no client", async () => {
    expect(await checkStorageHealth(null)).toBe('unknown')
    expect(await checkStorageHealth(undefined)).toBe('unknown')
    expect(await checkStorageHealth({})).toBe('unknown')
  })

  it("lists 1 object from the 'covers' bucket and returns 'ok' on success", async () => {
    const seen = {}
    const client = fakeClient(async (path, options) => {
      seen.path = path
      seen.options = options
      return { data: [{ name: 'x.jpg' }], error: null }
    }, seen)
    expect(await checkStorageHealth(client)).toBe('ok')
    expect(seen.bucket).toBe('covers')
    expect(seen.path).toBe('')
    expect(seen.options).toEqual({ limit: 1 })
  })

  it("returns 'fail' when Storage answers with an error", async () => {
    const client = fakeClient(async () => ({ data: null, error: { message: 'bucket not found' } }))
    expect(await checkStorageHealth(client)).toBe('fail')
  })

  it("returns 'fail' when the list call throws", async () => {
    const client = fakeClient(async () => {
      throw new Error('network down')
    })
    expect(await checkStorageHealth(client)).toBe('fail')
  })

  it("returns 'unknown' when the probe never answers (timeout wins)", async () => {
    const client = fakeClient(() => new Promise(() => {}))
    expect(await checkStorageHealth(client, { timeoutMs: 10 })).toBe('unknown')
  })

  it('falls back to the default timeout for an invalid timeoutMs', async () => {
    // A probe that answers at once must still resolve 'ok' even with
    // a nonsense timeout — the default (5000ms) applies instead.
    const client = fakeClient(async () => ({ data: [], error: null }))
    expect(await checkStorageHealth(client, { timeoutMs: -1 })).toBe('ok')
    expect(await checkStorageHealth(client, { timeoutMs: Number.NaN })).toBe('ok')
  })
})
