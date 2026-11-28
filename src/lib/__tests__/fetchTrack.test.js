// fetchTrack resolution (28 Nov 2026).
//
// After a track is deleted from the DB, its public page still
// rendered the full song from the static fallback catalog —
// fetchTrack returned the fallback entry whenever the DB row was
// absent, conflating "deleted" with "DB unreachable". The fix:
// the DB answering with no row is a 404 (null); the fallback is
// only for when the DB itself cannot be reached. These tests fail
// on the old `return fb` and pass on the null.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  trackRow: null,
  trackError: null,
  artists: [],
  albums: [],
  lyrics: [],
}))

// Thenable query builder: every chain method returns the builder;
// awaiting it resolves to the canned result for its table.
vi.mock('../supabase.js', () => {
  function makeBuilder(table) {
    const builder = {
      select() {
        return builder
      },
      eq() {
        return builder
      },
      order() {
        return builder
      },
      in() {
        return builder
      },
      limit() {
        return builder
      },
      maybeSingle() {
        return builder
      },
      then(resolve, reject) {
        let result
        if (table === 'tracks') result = { data: mockDb.trackRow, error: mockDb.trackError }
        else if (table === 'artists') result = { data: mockDb.artists, error: null }
        else if (table === 'albums') result = { data: mockDb.albums, error: null }
        else if (table === 'lyrics') result = { data: mockDb.lyrics, error: null }
        else result = { data: null, error: null }
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return builder
  }
  return {
    isSupabaseConfigured: true,
    supabase: { from: (table) => makeBuilder(table) },
  }
})

import { fetchTrack, clearCatalogRowCache, getCatalogSource } from '../supabaseCatalog.js'

const artistRow = {
  id: '24f966e7-6182-4ee9-aab8-668b64ff96c0',
  name: 'Nandha Music',
  name_ta: 'நந்தா மியூசிக்',
  bio_en: '',
  bio_ta: '',
  socials: {},
}
const albumRow = {
  id: 'fbb9ed80-6e06-409d-a9a5-f0ced14a1c63',
  title_en: 'Annamalaiyar',
  title_ta: 'அண்ணாமலையார்',
  artist_id: '24f966e7-6182-4ee9-aab8-668b64ff96c0',
  genre: 'Devotional',
  cover_url: null,
  release_date: '2026-12-10',
  status: 'published',
}
const trackRow = {
  id: '658c2d3e-26ee-49b9-b22f-57ae9fe7d0ae',
  slug: 'vaazhvinil-orumurayenum',
  title_en: 'Vaazhvinil Orumurayenum',
  title_ta: 'வாழ்வினில் ஒருமுறையேனும்',
  artist_id: '24f966e7-6182-4ee9-aab8-668b64ff96c0',
  album_id: 'fbb9ed80-6e06-409d-a9a5-f0ced14a1c63',
  composer: 'Siddha Guruji',
  lyricist: null,
  genre: 'Devotional',
  language: 'Tamil',
  duration_sec: 224,
  audio_128_url: 'audio/vaazhvinil-orumurayenum.mp3',
  audio_320_url: 'audio/vaazhvinil-orumurayenum.mp3',
  cover_url: '/assets/vaazhvinil-cover-800.webp',
  status: 'published',
  plays: 1,
  release_date: '2026-12-10',
  hook_start_sec: 0,
  hook_duration_sec: 30,
  description: null,
  story: null,
  scheduled_at: null,
}

beforeEach(() => {
  clearCatalogRowCache()
  mockDb.trackRow = null
  mockDb.trackError = null
  mockDb.artists = [artistRow]
  mockDb.albums = [albumRow]
  mockDb.lyrics = []
})

describe('fetchTrack', () => {
  it('returns null when the DB was reached and the track is absent (deleted) — not the fallback', async () => {
    mockDb.trackRow = null
    mockDb.trackError = null
    const track = await fetchTrack('vaazhvinil-orumurayenum')
    expect(track).toBeNull()
    expect(getCatalogSource()).toBe('supabase')
  })

  it('returns the mapped DB track when the row exists', async () => {
    mockDb.trackRow = trackRow
    const track = await fetchTrack('vaazhvinil-orumurayenum')
    expect(track).not.toBeNull()
    expect(track.slug).toBe('vaazhvinil-orumurayenum')
    expect(track.titleTa).toBe('வாழ்வினில் ஒருமுறையேனும்')
    expect(track.artist).toBe('Nandha Music')
    expect(track.album).toBe('அண்ணாமலையார்')
  })

  it('throws on a query error instead of silently serving the fallback', async () => {
    mockDb.trackRow = null
    mockDb.trackError = { message: 'connection failed', code: 'XX000' }
    await expect(fetchTrack('vaazhvinil-orumurayenum')).rejects.toMatchObject({
      message: 'connection failed',
    })
  })

  it('returns null for an empty id', async () => {
    expect(await fetchTrack('')).toBeNull()
    expect(await fetchTrack(null)).toBeNull()
  })
})
