// Config helpers (S8786) — trailing-slash stripping + audio URL fallback.
import { describe, it, expect } from 'vitest'
import { stripTrailingSlashes, audioUrl } from '../config.js'

describe('stripTrailingSlashes', () => {
  it('strips one or many trailing slashes', () => {
    expect(stripTrailingSlashes('https://example.supabase.co/')).toBe('https://example.supabase.co')
    expect(stripTrailingSlashes('https://example.supabase.co///')).toBe('https://example.supabase.co')
    expect(stripTrailingSlashes('https://example.supabase.co')).toBe('https://example.supabase.co')
  })

  it('leaves interior slashes and non-slash endings alone', () => {
    expect(stripTrailingSlashes('a/b/c')).toBe('a/b/c')
    expect(stripTrailingSlashes('')).toBe('')
    expect(stripTrailingSlashes('/')).toBe('')
    expect(stripTrailingSlashes('///')).toBe('')
  })

  it('returns empty for non-strings', () => {
    expect(stripTrailingSlashes(null)).toBe('')
    expect(stripTrailingSlashes(undefined)).toBe('')
  })
})

describe('audioUrl (no R2 configured in tests)', () => {
  it('returns null for a null track or a track with no audio', () => {
    expect(audioUrl(null)).toBeNull()
    expect(audioUrl({})).toBeNull()
    expect(audioUrl({ audio128: null, audio320: null })).toBeNull()
  })

  it('returns the stored local path as-is and picks the right quality', () => {
    const track = { audio128: 'audio/song.mp3', audio320: 'audio/song-hq.mp3' }
    expect(audioUrl(track, '128')).toBe('audio/song.mp3')
    expect(audioUrl(track, '320')).toBe('audio/song-hq.mp3')
  })
})
