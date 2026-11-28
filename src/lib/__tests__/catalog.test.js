// Catalog is real-only (S10 smoke test).
//
// The 199 sample tracks were deleted 26 Nov 2026 (real data only).
// These tests fail loudly if any placeholder content comes back.
import { describe, it, expect } from 'vitest'
import {
  tracks,
  albums,
  artists,
  playlists,
  REAL_TRACK_ID,
} from '../../data/catalog.js'

describe('real-only catalog', () => {
  it('has exactly one track: Vaazhvinil Orumurayenum', () => {
    expect(tracks).toHaveLength(1)
    expect(tracks[0].id).toBe(REAL_TRACK_ID)
    expect(tracks[0].titleEn).toBe('Vaazhvinil Orumurayenum')
  })

  it('has no sample/placeholder flags anywhere', () => {
    const all = [...tracks, ...albums, ...artists, ...playlists]
    for (const item of all) {
      expect(item.isSample).toBeUndefined()
      expect(JSON.stringify(item)).not.toMatch(/isSample|Sample Track/i)
    }
  })

  it('the real track is playable and has the small cover variant', () => {
    const track = tracks[0]
    expect(track.audio128).toBeTruthy()
    expect(track.audio320).toBeTruthy()
    expect(track.status).toBe('published')
    // S9: cards use the 800px WebP, not the 3000px 1.5 MB JPG.
    expect(track.cover).toBe('/assets/vaazhvinil-cover-800.webp')
  })

  it('playlists reference only the real track', () => {
    for (const playlist of playlists) {
      const ids = playlist.trackIds || []
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) expect(id).toBe(REAL_TRACK_ID)
    }
  })

  it('carries no lyrics — the DB lyrics table is the source of truth', () => {
    // 28 Nov 2026: the 4 opening lines that used to sit here leaked
    // into the editor and created a phantom English lyrics row on
    // save. The fallback must never carry lyrics.
    const track = tracks[0]
    expect(track.lyricsTa ?? []).toEqual([])
    expect(track.lyricsEn ?? []).toEqual([])
  })

  it('albums and artists are real-only too', () => {
    expect(albums).toHaveLength(1)
    expect(albums[0].id).toBe('annamalaiyar')
    expect(artists.map((a) => a.id).sort()).toEqual([
      'nandha-music',
      'siddha-guruji',
    ])
  })
})
