// Area C-ADMIN fix pass (28 Nov 2026): M38 — deleteAccount accepts
// a 204 / empty-body / {} success (the old code required the body to
// contain { ok: true }, so a successful deletion was reported as
// failed) and has a 15s fetch timeout.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { getSessionState } = vi.hoisted(() => ({
  getSessionState: { session: { access_token: 'test-token' } },
}))

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    config: { ...actual.config, supabaseUrl: 'https://example.supabase.co' },
  }
})

vi.mock('../supabase.js', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: getSessionState.session } }),
    },
  },
}))

import { deleteAccount, DELETE_ACCOUNT_TIMEOUT_MS } from '../deleteAccount.js'

function mockFetch(status, body) {
  const fetchMock = vi.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  getSessionState.session = { access_token: 'test-token' }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('deleteAccount (M38)', () => {
  it('204 No Content counts as deleted', async () => {
    mockFetch(204, '')
    await expect(deleteAccount()).resolves.toEqual({ ok: true })
  })

  it('200 with an empty body counts as deleted', async () => {
    mockFetch(200, '   ')
    await expect(deleteAccount()).resolves.toEqual({ ok: true })
  })

  it('200 with {} counts as deleted', async () => {
    mockFetch(200, '{}')
    await expect(deleteAccount()).resolves.toEqual({ ok: true })
  })

  it('200 with { ok: true } counts as deleted', async () => {
    mockFetch(200, JSON.stringify({ ok: true }))
    await expect(deleteAccount()).resolves.toEqual({ ok: true })
  })

  it('200 with { ok: false } is a failure', async () => {
    mockFetch(200, JSON.stringify({ ok: false, error: 'nope' }))
    await expect(deleteAccount()).resolves.toEqual({ ok: false, reason: 'failed' })
  })

  it('200 with an unparseable body is a failure', async () => {
    mockFetch(200, 'not-json{{{')
    await expect(deleteAccount()).resolves.toEqual({ ok: false, reason: 'failed' })
  })

  it('404 means the function is not deployed', async () => {
    mockFetch(404, 'not found')
    await expect(deleteAccount()).resolves.toEqual({ ok: false, reason: 'not-deployed' })
  })

  it('a 500 is a failure, not "not deployed"', async () => {
    mockFetch(500, 'boom')
    await expect(deleteAccount()).resolves.toEqual({ ok: false, reason: 'failed' })
  })

  it('no session means no-session (no fetch)', async () => {
    getSessionState.session = null
    const fetchMock = mockFetch(204, '')
    await expect(deleteAccount()).resolves.toEqual({ ok: false, reason: 'no-session' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls the Edge Function with the session token', async () => {
    const fetchMock = mockFetch(204, '')
    await deleteAccount()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.supabase.co/functions/v1/delete-account',
    )
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
  })

  it('times out after 15s instead of hanging forever', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn(
        (_url, { signal } = {}) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            )
          }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const p = deleteAccount()
      const assertion = expect(p).resolves.toEqual({ ok: false, reason: 'failed' })
      await vi.advanceTimersByTimeAsync(DELETE_ACCOUNT_TIMEOUT_MS + 1000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
