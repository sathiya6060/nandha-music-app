// M1/M2 read layer: mapTrack serves the 800px WebP for cards, keeps
// the original for OG, and reads the 002 columns instead of hardcoded
// hook values.
import { describe, it, expect } from 'vitest'
import { mapTrack } from '../supabaseCatalog.js'

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
})
