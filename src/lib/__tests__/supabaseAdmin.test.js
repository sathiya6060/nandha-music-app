// OCR fixes (27 Nov 2026): M3 lyrics-failure reporting, M5 publish
// without audio, M6 comma-safe title resolution, L6 upload validation.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock factories are hoisted, so the fake client must be built with
// vi.hoisted (top-level variables are not visible inside factories).
const { tableResults, fakeSupabase, queryLog, storageState } = vi.hoisted(() => {
  const tableResults = new Map()
  // Every chained call is logged ({ table, method, args }) so tests
  // can assert call ORDER (e.g. playlist upsert-before-delete, C5).
  const queryLog = []
  // Storage upload behaviour is swappable per test (hanging upload
  // for the C6 timeout test, capturing impl for the downscale test).
  const storageState = { uploadImpl: async () => ({ error: null }) }

  function makeQuery(table, result) {
    const q = {}
    const chain = (method) => (...args) => {
      queryLog.push({ table, method, args })
      return q
    }
    q.select = chain('select')
    q.eq = chain('eq')
    q.or = chain('or')
    q.in = chain('in')
    q.order = chain('order')
    q.limit = chain('limit')
    q.upsert = chain('upsert')
    q.insert = chain('insert')
    q.update = chain('update')
    q.delete = chain('delete')
    q.single = () => {
      queryLog.push({ table, method: 'single' })
      return Promise.resolve(result)
    }
    q.maybeSingle = () => {
      queryLog.push({ table, method: 'maybeSingle' })
      return Promise.resolve(result)
    }
    q.then = (onF, onR) => Promise.resolve(result).then(onF, onR)
    return q
  }

  const fakeSupabase = {
    // A table entry may be a single result (reused for every call,
    // as before) or an ARRAY of results consumed in order — one per
    // .from() call — for functions that query the same table several
    // times with different expected results.
    from: (table) => {
      const entry = tableResults.get(table) ?? { data: null, error: null }
      const result = Array.isArray(entry)
        ? entry.shift() ?? { data: null, error: null }
        : entry
      return makeQuery(table, result)
    },
    storage: {
      from: () => ({
        upload: (...args) => storageState.uploadImpl(...args),
        getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.example/covers/x.webp' } }),
      }),
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  }

  return { tableResults, fakeSupabase, queryLog, storageState }
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ARTIST_UUID = '11111111-2222-3333-4444-555555555555'
const TRACK_UUID = '22222222-3333-4444-5555-666666666666'
const ALBUM_UUID = '33333333-4444-5555-6666-777777777777'
const PLAYLIST_UUID = '44444444-5555-6666-7777-888888888888'

vi.mock('../supabase.js', () => ({
  supabase: fakeSupabase,
  isSupabaseConfigured: true,
}))

vi.mock('../cache.js', () => ({
  invalidateCatalog: async () => {},
}))

vi.mock('../supabaseCatalog.js', () => ({
  isUuid: (v) => UUID_RE.test(String(v || '')),
  resolveTrackDbIds: async (ids) =>
    new Map((ids || []).map((id) => [id, UUID_RE.test(String(id || '')) ? id : null])),
  clearCatalogRowCache: () => {},
}))

import {
  saveTrackToSupabase,
  saveLyricsToSupabase,
  matchRowByFields,
  validateAudioFile,
  validateCoverFile,
  deleteTrackFromSupabase,
  saveAlbumToSupabase,
  countArtistDependents,
  deleteArtistFromSupabase,
  savePlaylistToSupabase,
  uploadCover,
  withTimeout,
  NO_ROWS_ERROR,
  UPLOAD_TIMEOUT_MS,
} from '../supabaseAdmin.js'

describe('M5 — publish without audio is blocked', () => {
  it('throws before any DB work when publishing with no audio', async () => {
    await expect(
      saveTrackToSupabase({
        titleEn: 'No Audio Song',
        artistId: ARTIST_UUID,
        status: 'published',
        durationSec: 200,
      }),
    ).rejects.toThrow('Add an audio file before publishing')
  })

  it('allows a draft with no audio (180s placeholder stays draft-only)', async () => {
    const savedRow = {
      id: '22222222-3333-4444-5555-666666666666',
      slug: 'draft-no-audio',
      title_en: 'Draft Song',
      title_ta: null,
      artist_id: ARTIST_UUID,
      album_id: null,
      composer: null,
      lyricist: null,
      genre: 'Melody',
      language: 'Tamil',
      duration_sec: 180,
      audio_128_url: null,
      audio_320_url: null,
      cover_url: null,
      status: 'draft',
      plays: 0,
      release_date: null,
      hook_start_sec: 0,
      hook_duration_sec: 30,
      description: null,
      story: null,
      scheduled_at: null,
    }
    tableResults.set('tracks', { data: savedRow, error: null })
    tableResults.set('lyrics', { data: null, error: null })
    const saved = await saveTrackToSupabase({
      titleEn: 'Draft Song',
      artistId: ARTIST_UUID,
      status: 'draft',
      durationSec: 0,
      lyricsTa: [],
      lyricsEn: [],
    })
    expect(saved.status).toBe('draft')
    expect(saved.durationSec).toBe(180)
    expect(saved.lyricsOk).toBe(true)
  })
})

describe('M3 — lyrics save failure is reported, not swallowed', () => {
  beforeEach(() => {
    tableResults.clear()
  })

  it('saveLyricsToSupabase throws when the empty-lines delete fails', async () => {
    tableResults.set('lyrics', {
      data: null,
      error: { message: 'new row violates row-level security policy' },
    })
    await expect(
      saveLyricsToSupabase('22222222-3333-4444-5555-666666666666', { ta: [], en: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('row-level security') })
  })

  it('saveTrackToSupabase returns lyricsOk:false when the lyrics write fails', async () => {
    const savedRow = {
      id: '22222222-3333-4444-5555-666666666666',
      slug: 'lyrics-fail',
      title_en: 'Lyrics Fail',
      title_ta: null,
      artist_id: ARTIST_UUID,
      album_id: null,
      composer: null,
      lyricist: null,
      genre: 'Melody',
      language: 'Tamil',
      duration_sec: 200,
      audio_128_url: null,
      audio_320_url: null,
      cover_url: null,
      status: 'draft',
      plays: 0,
      release_date: null,
      hook_start_sec: 0,
      hook_duration_sec: 30,
      description: null,
      story: null,
      scheduled_at: null,
    }
    tableResults.set('tracks', { data: savedRow, error: null })
    tableResults.set('lyrics', {
      data: null,
      error: { message: 'new row violates row-level security policy' },
    })
    const saved = await saveTrackToSupabase({
      titleEn: 'Lyrics Fail',
      artistId: ARTIST_UUID,
      status: 'draft',
      durationSec: 200,
      lyricsTa: ['line one'],
      lyricsEn: [],
    })
    expect(saved.lyricsOk).toBe(false)
    expect(saved.lyricsError).toMatch(/row-level security/)
    // The track itself still saved — the caller shows a warning, not a failure.
    expect(saved.slug).toBe('lyrics-fail')
  })
})

describe('M6 — comma-safe title resolution', () => {
  const albums = [
    { id: 'a1', title_en: 'Love, Devotional', title_ta: '' },
    { id: 'a2', title_en: 'Melody', title_ta: 'மெலடி' },
  ]

  it('matches a title containing a comma on either field', () => {
    expect(matchRowByFields(albums, 'Love, Devotional', ['title_en', 'title_ta'])?.id).toBe('a1')
    expect(matchRowByFields(albums, 'மெலடி', ['title_en', 'title_ta'])?.id).toBe('a2')
  })

  it('returns null for no match and for empty input', () => {
    expect(matchRowByFields(albums, 'No Such Album', ['title_en', 'title_ta'])).toBeNull()
    expect(matchRowByFields(albums, '', ['title_en', 'title_ta'])).toBeNull()
    expect(matchRowByFields([], 'Melody', ['title_en', 'title_ta'])).toBeNull()
  })
})

describe('L6 — upload validation', () => {
  it('rejects a non-audio file for audio upload', () => {
    expect(() => validateAudioFile({ name: 'notes.txt', type: 'text/plain', size: 100 })).toThrow(
      'Please choose an audio file',
    )
  })

  it('rejects an oversized audio file', () => {
    expect(() =>
      validateAudioFile({ name: 'song.mp3', type: 'audio/mpeg', size: 26 * 1024 * 1024 }),
    ).toThrow(/too large/)
  })

  it('accepts a valid mp3 and rejects a non-image cover', () => {
    expect(validateAudioFile({ name: 'song.mp3', type: 'audio/mpeg', size: 1024 })).toBeTruthy()
    expect(() => validateCoverFile({ name: 'doc.pdf', type: 'application/pdf', size: 100 })).toThrow(
      'Please choose an image file',
    )
    expect(() =>
      validateCoverFile({ name: 'big.jpg', type: 'image/jpeg', size: 11 * 1024 * 1024 }),
    ).toThrow(/too large/)
  })
})

// ---------------------------------------------------------------------------
// Area C-ADMIN fix pass (28 Nov 2026): C3 row checks, C5 membership,
// C6 timeouts, C7 draft audio keep, pasted-report C4 artist cascade.
// ---------------------------------------------------------------------------

const SAVED_ROW = {
  id: TRACK_UUID,
  slug: 'test-track',
  title_en: 'Test Track',
  title_ta: null,
  artist_id: ARTIST_UUID,
  album_id: null,
  composer: null,
  lyricist: null,
  genre: 'Melody',
  language: 'Tamil',
  duration_sec: 200,
  audio_128_url: 'audio/test-track.mp3',
  audio_320_url: 'audio/test-track.mp3',
  cover_url: null,
  status: 'draft',
  plays: 0,
  release_date: null,
  hook_start_sec: 0,
  hook_duration_sec: 30,
  description: null,
  story: null,
  scheduled_at: null,
}

function resetAdminMocks() {
  tableResults.clear()
  queryLog.length = 0
  storageState.uploadImpl = async () => ({ error: null })
}

describe('C3 — row-count checks: never report success for a 0-row write', () => {
  beforeEach(resetAdminMocks)

  it('deleteTrack throws the no-rows error when RLS blocks the delete (0 rows)', async () => {
    tableResults.set('tracks', { data: [], error: null })
    await expect(deleteTrackFromSupabase({ slug: 'gone', id: 'gone' })).rejects.toThrow(
      NO_ROWS_ERROR,
    )
  })

  it('deleteTrack succeeds when the delete returns the row', async () => {
    tableResults.set('tracks', { data: [{ id: TRACK_UUID }], error: null })
    await expect(deleteTrackFromSupabase({ slug: 'test-track', id: 'test-track' })).resolves
      .toBeUndefined()
  })

  it('track update maps a PGRST116 (0 rows) to the no-rows error, not a cryptic code', async () => {
    tableResults.set('tracks', {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    })
    await expect(
      saveTrackToSupabase({
        id: TRACK_UUID,
        slug: 'test-track',
        titleEn: 'Test Track',
        artistId: ARTIST_UUID,
        status: 'draft',
        durationSec: 200,
        audio128: 'audio/test-track.mp3',
        audio320: 'audio/test-track.mp3',
        lyricsTa: [],
        lyricsEn: [],
      }),
    ).rejects.toThrow(NO_ROWS_ERROR)
  })

  it('a non-PGRST116 error is re-thrown unchanged', async () => {
    tableResults.set('tracks', {
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })
    await expect(
      saveTrackToSupabase({
        id: TRACK_UUID,
        slug: 'test-track',
        titleEn: 'Test Track',
        artistId: ARTIST_UUID,
        status: 'draft',
        durationSec: 200,
        audio128: 'audio/test-track.mp3',
        audio320: 'audio/test-track.mp3',
        lyricsTa: [],
        lyricsEn: [],
      }),
    ).rejects.toMatchObject({ message: 'duplicate key value' })
  })
})

describe('C6 — upload timeouts (storage-js has no AbortSignal)', () => {
  beforeEach(resetAdminMocks)
  afterEach(() => {
    vi.useRealTimers()
    storageState.uploadImpl = async () => ({ error: null })
  })

  it('withTimeout resolves a fast promise', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'Op')).resolves.toBe('ok')
  })

  it('withTimeout rejects with a timeout error when the promise hangs', async () => {
    vi.useFakeTimers()
    try {
      const p = withTimeout(new Promise(() => {}), 5000, 'Test op')
      const assertion = expect(p).rejects.toThrow('Test op timed out after 5 seconds')
      await vi.advanceTimersByTimeAsync(5001)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('uploadCover rejects (never hangs) when the storage upload never returns', async () => {
    vi.useFakeTimers()
    try {
      storageState.uploadImpl = () => new Promise(() => {})
      const p = uploadCover({ name: 'c.jpg', type: 'image/jpeg', size: 100 }, 'slug')
      const assertion = expect(p).rejects.toThrow('Cover upload timed out')
      await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1000)
      await assertion
    } finally {
      vi.useRealTimers()
      storageState.uploadImpl = async () => ({ error: null })
    }
  })

  it('cover downscale falls back to the original file in node (no document/createImageBitmap)', async () => {
    const upload = vi.fn(async () => ({ error: null }))
    storageState.uploadImpl = upload
    const url = await uploadCover({ name: 'big.png', type: 'image/png', size: 100 }, 'my-slug')
    expect(url).toBe('https://cdn.example/covers/x.webp')
    expect(upload).toHaveBeenCalledTimes(1)
    // The ORIGINAL file was uploaded (name unchanged) — downscale
    // returned null because document is undefined in node.
    expect(upload.mock.calls[0][1].name).toBe('big.png')
  })
})

describe('C5 — album save never wipes membership from an unloaded list', () => {
  beforeEach(resetAdminMocks)

  it('refuses to save when trackIdsLoaded is false', async () => {
    await expect(
      saveAlbumToSupabase(
        { titleEn: 'New Album', artistId: ARTIST_UUID },
        { trackIds: [], trackIdsLoaded: false },
      ),
    ).rejects.toThrow('Track list is not loaded yet')
  })

  it('inserts the album and syncs membership for the listed tracks', async () => {
    tableResults.set('albums', { data: { id: ALBUM_UUID }, error: null })
    // Current members query (empty) then the membership update.
    tableResults.set('tracks', [
      { data: [], error: null },
      { data: [{ id: TRACK_UUID }], error: null },
    ])
    const saved = await saveAlbumToSupabase(
      { titleEn: 'New Album', artistId: ARTIST_UUID, status: 'published' },
      { trackIds: [TRACK_UUID], trackIdsLoaded: true },
    )
    expect(saved.id).toBe(ALBUM_UUID)
    expect(saved.droppedTrackIds).toEqual([])
    // The membership update ran against the track (album_id set).
    const updates = queryLog.filter((c) => c.table === 'tracks' && c.method === 'update')
    expect(updates.length).toBe(1)
  })

  it('fails instead of silently reassigning to the first artist alphabetically (M30)', async () => {
    tableResults.set('artists', { data: null, error: null })
    await expect(
      saveAlbumToSupabase(
        { titleEn: 'No Artist Album', artist: 'Nandha Music' },
        { trackIds: [], trackIdsLoaded: true },
      ),
    ).rejects.toThrow('Artist not found in Supabase')
  })

  it('requires a title (M30)', async () => {
    await expect(
      saveAlbumToSupabase({ titleEn: '  ', artistId: ARTIST_UUID }, { trackIdsLoaded: true }),
    ).rejects.toThrow('An album title is required.')
  })
})

describe('Pasted-report C4 — artist delete counts dependents first', () => {
  beforeEach(resetAdminMocks)

  it('countArtistDependents returns album + track counts', async () => {
    tableResults.set('albums', { data: [{ id: 'a1' }], error: null })
    tableResults.set('tracks', { data: [{ id: 't1' }, { id: 't2' }], error: null })
    await expect(countArtistDependents({ id: ARTIST_UUID })).resolves.toEqual({
      artistId: ARTIST_UUID,
      albums: 1,
      tracks: 2,
    })
  })

  it('blocks the delete with the counts unless the cascade is confirmed', async () => {
    tableResults.set('albums', { data: [{ id: 'a1' }], error: null })
    tableResults.set('tracks', { data: [{ id: 't1' }], error: null })
    await expect(deleteArtistFromSupabase({ id: ARTIST_UUID })).rejects.toThrow(
      /1 album\(s\) and 1 track\(s\)/,
    )
  })

  it('deletes when confirmCascade is passed and the row is returned', async () => {
    tableResults.set('albums', { data: [{ id: 'a1' }], error: null })
    tableResults.set('tracks', { data: [{ id: 't1' }], error: null })
    tableResults.set('artists', { data: [{ id: ARTIST_UUID }], error: null })
    await expect(
      deleteArtistFromSupabase({ id: ARTIST_UUID }, { confirmCascade: true }),
    ).resolves.toBeUndefined()
  })

  it('an artist with no dependents deletes without confirmation', async () => {
    tableResults.set('albums', { data: [], error: null })
    tableResults.set('tracks', { data: [], error: null })
    tableResults.set('artists', { data: [{ id: ARTIST_UUID }], error: null })
    await expect(deleteArtistFromSupabase({ id: ARTIST_UUID })).resolves.toBeUndefined()
  })
})

describe('C5 — playlist save inserts before deleting (never delete-all-then-insert)', () => {
  beforeEach(resetAdminMocks)

  it('refuses to save when trackIdsLoaded is false', async () => {
    await expect(
      savePlaylistToSupabase(
        { id: PLAYLIST_UUID, titleEn: 'Mix' },
        { trackIds: [], trackIdsLoaded: false },
      ),
    ).rejects.toThrow('Track list is not loaded yet')
  })

  it('upserts the wanted rows BEFORE deleting the removed ones', async () => {
    const OLD_UUID = '55555555-6666-7777-8888-999999999999'
    const T1_UUID = '66666666-7777-8888-9999-000000000000'
    const T2_UUID = '77777777-8888-9999-0000-111111111111'
    tableResults.set('playlists', { data: { id: PLAYLIST_UUID }, error: null })
    // Current members, then the upsert result, then the delete result.
    tableResults.set('playlist_tracks', [
      { data: [{ track_id: OLD_UUID }, { track_id: T1_UUID }], error: null },
      { data: [{ track_id: T1_UUID }, { track_id: T2_UUID }], error: null },
      { data: [{ track_id: OLD_UUID }], error: null },
    ])
    const saved = await savePlaylistToSupabase(
      { id: PLAYLIST_UUID, titleEn: 'Mix' },
      { trackIds: [T1_UUID, T2_UUID], trackIdsLoaded: true },
    )
    expect(saved.id).toBe(PLAYLIST_UUID)
    expect(saved.droppedTrackIds).toEqual([])
    const playlistCalls = queryLog.filter((c) => c.table === 'playlist_tracks')
    const upsertIdx = playlistCalls.findIndex((c) => c.method === 'upsert')
    const deleteIdx = playlistCalls.findIndex((c) => c.method === 'delete')
    expect(upsertIdx).toBeGreaterThanOrEqual(0)
    expect(deleteIdx).toBeGreaterThanOrEqual(0)
    expect(upsertIdx).toBeLessThan(deleteIdx)
    // The upsert carried positions for the wanted rows.
    const upsertArgs = playlistCalls[upsertIdx].args[0]
    expect(upsertArgs).toEqual([
      { playlist_id: PLAYLIST_UUID, track_id: T1_UUID, position: 0 },
      { playlist_id: PLAYLIST_UUID, track_id: T2_UUID, position: 1 },
    ])
    // The delete removed only the old row.
    const deleteInArgs = playlistCalls
      .filter((c) => c.method === 'in')
      .map((c) => c.args)
    expect(deleteInArgs).toContainEqual(['track_id', [OLD_UUID]])
  })
})

describe('C7 — draft save keeps existing audio when the payload has a local path', () => {
  beforeEach(resetAdminMocks)

  it('a /assets/ audio path means "keep", not null', async () => {
    // fetchExistingAudioUrls (maybeSingle) then the track update.
    tableResults.set('tracks', [
      { data: { audio_128_url: 'audio/keep.mp3', audio_320_url: 'audio/keep.mp3' }, error: null },
      { data: { ...SAVED_ROW, slug: 'keep-audio', audio_128_url: 'audio/keep.mp3', audio_320_url: 'audio/keep.mp3' }, error: null },
    ])
    tableResults.set('lyrics', { data: null, error: null })
    const saved = await saveTrackToSupabase({
      id: TRACK_UUID,
      slug: 'keep-audio',
      titleEn: 'Keep Audio',
      artistId: ARTIST_UUID,
      status: 'draft',
      durationSec: 200,
      audio128: '/assets/keep-audio.mp3',
      audio320: '/assets/keep-audio.mp3',
      lyricsTa: [],
      lyricsEn: [],
    })
    expect(saved.audio128).toBe('audio/keep.mp3')
    expect(saved.audio320).toBe('audio/keep.mp3')
  })
})
