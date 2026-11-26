// OCR fixes (27 Nov 2026): M3 lyrics-failure reporting, M5 publish
// without audio, M6 comma-safe title resolution, L6 upload validation.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted, so the fake client must be built with
// vi.hoisted (top-level variables are not visible inside factories).
const { tableResults, fakeSupabase } = vi.hoisted(() => {
  const tableResults = new Map()

  function makeQuery(result) {
    const q = {}
    const chain = () => q
    q.select = chain
    q.eq = chain
    q.or = chain
    q.in = chain
    q.order = chain
    q.limit = chain
    q.upsert = chain
    q.insert = chain
    q.update = chain
    q.delete = chain
    q.single = () => Promise.resolve(result)
    q.maybeSingle = () => Promise.resolve(result)
    q.then = (onF, onR) => Promise.resolve(result).then(onF, onR)
    return q
  }

  const fakeSupabase = {
    from: (table) => makeQuery(tableResults.get(table) ?? { data: null, error: null }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.example/covers/x.webp' } }),
      }),
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  }

  return { tableResults, fakeSupabase }
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ARTIST_UUID = '11111111-2222-3333-4444-555555555555'

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
