// Item 8 (OCR fix, 27 Nov 2026): a failed playlist_tracks read during
// the sign-in merge must NOT wipe the playlist. Before the fix the
// error was ignored, an empty local copy was created, and the
// trailing syncPlaylists() then deleted the remote tracks.
import { describe, expect, it, beforeEach, vi } from 'vitest'

const shared = vi.hoisted(() => ({ calls: [], results: new Map() }))
const calls = shared.calls
const results = shared.results

function query(table, result) {
  const q = {
    select: (...a) => { calls.push([table, 'select', ...a]); return q },
    eq: (...a) => { calls.push([table, 'eq', ...a]); return q },
    order: (...a) => { calls.push([table, 'order', ...a]); return q },
    in: (...a) => { calls.push([table, 'in', ...a]); return q },
    upsert: (...a) => { calls.push([table, 'upsert', ...a]); return q },
    insert: (...a) => { calls.push([table, 'insert', ...a]); return q },
    update: (...a) => { calls.push([table, 'update', ...a]); return q },
    delete: (...a) => { calls.push([table, 'delete', ...a]); return q },
    single: (...a) => { calls.push([table, 'single', ...a]); return q },
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  }
  return q
}

vi.mock('../supabase.js', () => ({
  supabase: { from: (table) => query(table, shared.results.get(table) || { data: [], error: null }) },
  isSupabaseConfigured: true,
}))
vi.mock('../config.js', () => ({ isDemoMode: false }))
vi.mock('../supabaseCatalog.js', () => ({
  resolveTrackDbIds: async () => new Map(),
}))

import { syncAllOnSignIn, clearSyncUser } from '../userLibrary.js'

function stubStorage() {
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { dispatchEvent: () => {} })
  return store
}

describe('syncAllOnSignIn playlist pull', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    clearSyncUser()
  })

  it('skips a playlist whose tracks fail to read — nothing is wiped', async () => {
    const store = stubStorage()
    const user = { id: '11111111-2222-3333-4444-555555555555' }
    results.set('liked_tracks', { data: [], error: null })
    results.set('followed_artists', { data: [], error: null })
    results.set('playlists', {
      data: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', title_en: 'Mine', title_ta: null }],
      error: null,
    })
    // The tracks read fails (network flake): the playlist must be
    // left alone on both sides — no empty local copy, no remote delete.
    results.set('playlist_tracks', { data: null, error: { code: 'PGRST000', message: 'boom' } })

    const summary = await syncAllOnSignIn(user)

    expect(summary.ok).toBe(true)
    expect(store.has('nandha-user-playlists')).toBe(false)
    expect(store.has('nandha-playlist-remote-ids')).toBe(false)
    const deletes = calls.filter(([t, m]) => t === 'playlist_tracks' && m === 'delete')
    expect(deletes).toEqual([])
  })
})
