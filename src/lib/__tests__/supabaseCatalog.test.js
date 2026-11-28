// M1/M2 read layer: mapTrack serves the 800px WebP for cards, keeps
// the original for OG, and reads the 002 columns instead of hardcoded
// hook values.
import { describe, it, expect } from 'vitest'
import { mapTrack, slugify, findByIdOrSlug, getCatalogSource, setCatalogSource, onCatalogSourceChange } from '../supabaseCatalog.js'

const baseRow = {
  id: '33333333-4444-5555-6666-777777777777',
  slug: 'test-song',
  title_en: 'Test Song',
  title_ta: 'டெஸ்ட் பாடல்',
  artist_id: null,
  album_id: null,
  composer: 'Siddha Guruji',
  lyricist: 'Siddha Guruji',
  genre: 'Devotional',
  language: 'Tamil',
  duration_sec: 200,
  audio_128_url: 'audio/test-song.mp3',
  audio_320_url: 'audio/test-song.mp3',
  cover_url: '/assets/vaazhvinil-cover.jpg',
  status: 'published',
  plays: 0,
  release_date: '2026-12-10',
  hook_start_sec: 12,
  hook_duration_sec: 20,
  description: 'About this song',
  story: 'A story',
  scheduled_at: null,
}

describe('mapTrack (M1/M2)', () => {
  it('serves the 800px WebP as cover and keeps the JPG for OG', () => {
    const track = mapTrack(baseRow)
    expect(track.cover).toBe('/assets/vaazhvinil-cover-800.webp')
    expect(track.coverOg).toBe('/assets/vaazhvinil-cover.jpg')
  })

  it('reads hook/lyricist/description/story from the DB row', () => {
    const track = mapTrack(baseRow)
    expect(track.hookStartSec).toBe(12)
    expect(track.hookDurationSec).toBe(20)
    expect(track.lyricist).toBe('Siddha Guruji')
    expect(track.description).toBe('About this song')
    expect(track.storyTa).toBe('A story')
    expect(track.scheduledAt).toBeNull()
  })

  it('defaults hook timing when the DB columns are null', () => {
    const track = mapTrack({ ...baseRow, hook_start_sec: null, hook_duration_sec: null })
    expect(track.hookStartSec).toBe(0)
    expect(track.hookDurationSec).toBe(30)
  })

  it('never injects fallback lyrics — the DB lyrics table owns lyrics', () => {
    // 28 Nov 2026: mapTrack unconditionally overwrote the track's
    // lyrics with the fallback's 4 opening lines, so the editor
    // showed 4 stale lines instead of the DB's 40 — and a save
    // then created a phantom English lyrics row. Mapped tracks
    // carry no lyrics until the lyrics-table query attaches them.
    const track = mapTrack({ ...baseRow, slug: 'vaazhvinil-orumurayenum' })
    expect(track.lyricsTa).toEqual([])
    expect(track.lyricsEn).toEqual([])
  })
})

// B1/H8: slug resolution — /album/annamalaiyar and
// /artist/nandha-music are slugs, the DB rows carry uuids.
describe('slugify / findByIdOrSlug', () => {
  const artists = [
    { id: '24f966e7-6182-4ee9-aab8-668b64ff96c0', slug: 'nandha-music', name: 'Nandha Music' },
    { id: 'siddha-guruji', slug: 'siddha-guruji', name: 'Siddha Guruji' },
  ]
  const albums = [
    { id: 'fbb9ed80-6e06-409d-a9a5-f0ced14a1c63', slug: 'annamalaiyar', titleEn: 'Annamalaiyar', titleTa: 'அண்ணாமலையார்' },
  ]

  it('slugifies Latin names', () => {
    expect(slugify('Nandha Music')).toBe('nandha-music')
    expect(slugify('Annamalaiyar')).toBe('annamalaiyar')
    expect(slugify('  Marakka Mudiyuma? ')).toBe('marakka-mudiyuma')
    expect(slugify('')).toBe('')
  })

  it('finds an artist by slug', () => {
    expect(findByIdOrSlug(artists, 'nandha-music')).toBe(artists[0])
  })

  it('finds an artist by DB uuid', () => {
    expect(findByIdOrSlug(artists, '24f966e7-6182-4ee9-aab8-668b64ff96c0')).toBe(artists[0])
  })

  it('finds an album by slug and by uuid', () => {
    expect(findByIdOrSlug(albums, 'annamalaiyar')).toBe(albums[0])
    expect(findByIdOrSlug(albums, 'fbb9ed80-6e06-409d-a9a5-f0ced14a1c63')).toBe(albums[0])
  })

  it('finds by slugified name even without a slug field', () => {
    expect(findByIdOrSlug([{ id: 'x', name: 'Nandha Music' }], 'nandha-music').id).toBe('x')
  })

  it('returns null for unknown ids and empty input', () => {
    expect(findByIdOrSlug(artists, 'no-such-artist')).toBeNull()
    expect(findByIdOrSlug(artists, '')).toBeNull()
    expect(findByIdOrSlug([], 'nandha-music')).toBeNull()
  })
})

// Admin redesign — shell: onCatalogSourceChange drives the env chip
// ("Checking…" until the first fetch settles, then Live / Demo data).
// NOTE: these tests share the module-level settled flag and must run
// in file order — the first test asserts the pre-settle behaviour
// before any test in this block settles the source.
describe('onCatalogSourceChange', () => {
  it('does not call the listener immediately before any fetch settles', () => {
    const seen = []
    const unsubscribe = onCatalogSourceChange((source) => seen.push(source))
    expect(seen).toEqual([])
    unsubscribe()
  })

  it('notifies on the first settle, even when the value stays fallback', () => {
    const seen = []
    const unsubscribe = onCatalogSourceChange((source) => seen.push(source))
    setCatalogSource('fallback')
    expect(seen).toEqual(['fallback'])
    expect(getCatalogSource()).toBe('fallback')
    unsubscribe()
  })

  it('notifies on flips but not on repeats of the same value', () => {
    const seen = []
    const unsubscribe = onCatalogSourceChange((source) => seen.push(source))
    // Already settled, so subscribing calls back immediately.
    expect(seen).toEqual(['fallback'])
    setCatalogSource('supabase')
    setCatalogSource('supabase')
    setCatalogSource('fallback')
    setCatalogSource('fallback')
    expect(seen).toEqual(['fallback', 'supabase', 'fallback'])
    unsubscribe()
  })

  it('calls a late subscriber immediately with the settled source', () => {
    setCatalogSource('supabase')
    const seen = []
    const unsubscribe = onCatalogSourceChange((source) => seen.push(source))
    expect(seen).toEqual(['supabase'])
    unsubscribe()
    setCatalogSource('fallback')
  })

  it('stops notifying after unsubscribe', () => {
    const seen = []
    const unsubscribe = onCatalogSourceChange((source) => seen.push(source))
    expect(seen).toEqual(['fallback'])
    unsubscribe()
    setCatalogSource('supabase')
    expect(seen).toEqual(['fallback'])
    setCatalogSource('fallback')
  })

  it('keeps getCatalogSource in sync and coerces unknown values to fallback', () => {
    setCatalogSource('supabase')
    expect(getCatalogSource()).toBe('supabase')
    setCatalogSource('whatever')
    expect(getCatalogSource()).toBe('fallback')
  })
})
