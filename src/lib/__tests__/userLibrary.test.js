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
vi.mock('../supabaseCatalog.js', () => ({
  resolveTrackDbIds: async () => new Map(),
}))

import { syncAllOnSignIn, clearSyncUser, pruneLikedIds } from '../userLibrary.js'

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

  // M13: a sign-out mid-merge must cancel the merge — the old code
  // kept awaiting and wrote the signed-out user's remote likes into
  // localStorage (cross-account contamination).
  it('sign-out mid-merge aborts it — nothing is written locally', async () => {
    const store = stubStorage()
    const user = { id: '11111111-2222-3333-4444-555555555555' }
    // One remote like that would merge into localStorage if the
    // merge ran to completion.
    results.set('liked_tracks', {
      data: [{ track_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }],
      error: null,
    })
    results.set('followed_artists', { data: [], error: null })
    results.set('playlists', { data: [], error: null })

    const merging = syncAllOnSignIn(user)
    // Sign out before any awaited query resolves.
    clearSyncUser()
    const summary = await merging

    expect(summary).toEqual({ ok: false, reason: 'aborted' })
    expect(store.has('nandha-liked')).toBe(false)
    expect(store.has('nandha-followed-artists')).toBe(false)
    expect(store.has('nandha-user-playlists')).toBe(false)
  })

  it('a second sign-in supersedes the first merge', async () => {
    const store = stubStorage()
    const first = { id: '11111111-2222-3333-4444-555555555555' }
    const second = { id: '22222222-3333-4444-5555-666666666666' }
    results.set('liked_tracks', { data: [], error: null })
    results.set('followed_artists', { data: [], error: null })
    results.set('playlists', { data: [], error: null })

    const firstMerge = syncAllOnSignIn(first)
    const secondSummary = await syncAllOnSignIn(second)
    const firstSummary = await firstMerge

    expect(firstSummary).toEqual({ ok: false, reason: 'aborted' })
    expect(secondSummary.ok).toBe(true)
    expect(store.has('nandha-liked')).toBe(false)
  })
})

describe('pruneLikedIds (#8/H11)', () => {
  beforeEach(() => {
    calls.length = 0
    results.clear()
    clearSyncUser()
  })

  it('drops only ids missing from the catalog', () => {
    const store = stubStorage()
    store.set('nandha-liked', JSON.stringify(['vaazhvinil-orumurayenum', 'deleted-track', 'another-gone']))
    const removed = pruneLikedIds(['vaazhvinil-orumurayenum', 'malaiyoram-veesiya-kaatre'])
    expect(removed.sort()).toEqual(['another-gone', 'deleted-track'])
    expect(JSON.parse(store.get('nandha-liked'))).toEqual(['vaazhvinil-orumurayenum'])
  })

  it('is a no-op when everything is in the catalog', () => {
    const store = stubStorage()
    store.set('nandha-liked', JSON.stringify(['vaazhvinil-orumurayenum']))
    expect(pruneLikedIds(['vaazhvinil-orumurayenum'])).toEqual([])
    expect(JSON.parse(store.get('nandha-liked'))).toEqual(['vaazhvinil-orumurayenum'])
  })
})
