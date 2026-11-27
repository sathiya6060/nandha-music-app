// U-03 — signed-audio URL resolution (pure parts + mocked Edge Function).
// config is mocked so the Supabase URL is deterministic and no .env file
// is needed; fetch is stubbed per test. The module is re-imported fresh
// per test (vi.resetModules) so the in-memory signed-URL cache is empty.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    config: { ...actual.config, supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'test-anon-key' },
  }
})

const SIGNED = { id: 't1', audio128: 'vaazhvinil-orumurayenum.mp3', audio320: 'vaazhvinil-orumurayenum.mp3' }
const OTHER = { id: 't2', audio128: 'other-song.mp3', audio320: 'other-song.mp3' }

let signedAudio

beforeEach(async () => {
  vi.resetModules()
  signedAudio = await import('../signedAudio.js')
})

function mockFetch(response) {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('isSignedTrack', () => {
  it('is true for the signed track file at either quality', () => {
    expect(signedAudio.isSignedTrack(SIGNED, '128')).toBe(true)
    expect(signedAudio.isSignedTrack(SIGNED, '320')).toBe(true)
  })

  it('is false for any other file, and picks the right quality field', () => {
    expect(signedAudio.isSignedTrack(OTHER, '128')).toBe(false)
    expect(signedAudio.isSignedTrack({ audio128: 'other.mp3', audio320: 'vaazhvinil-orumurayenum.mp3' }, '128')).toBe(false)
    expect(signedAudio.isSignedTrack({ audio128: 'other.mp3', audio320: 'vaazhvinil-orumurayenum.mp3' }, '320')).toBe(true)
  })

  it('is false when the track has no audio path', () => {
    expect(signedAudio.isSignedTrack({}, '128')).toBe(false)
    expect(signedAudio.isSignedTrack(null, '128')).toBe(false)
  })
})

describe('dropSignedAudioUrl', () => {
  it('does not throw for unknown files', () => {
    expect(() => signedAudio.dropSignedAudioUrl('never-cached.mp3')).not.toThrow()
  })
})

describe('resolvePlayableUrl', () => {
  it('returns null for a null track', async () => {
    await expect(signedAudio.resolvePlayableUrl(null)).resolves.toBeNull()
  })

  it('returns the local path for a non-signed track (no fetch)', async () => {
    const fetchMock = mockFetch()
    await expect(signedAudio.resolvePlayableUrl(OTHER, '128')).resolves.toBe('other-song.mp3')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mints a signed URL for the signed track via the Edge Function', async () => {
    const signedUrl = 'https://example.supabase.co/storage/v1/object/sign/audio/vaazhvinil-orumurayenum.mp3?token=abc'
    const fetchMock = mockFetch({ ok: true, json: async () => ({ url: signedUrl }) })
    await expect(signedAudio.resolvePlayableUrl(SIGNED, '128')).resolves.toBe(signedUrl)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [calledUrl, opts] = fetchMock.mock.calls[0]
    expect(calledUrl).toContain('/functions/v1/get-audio-url')
    expect(JSON.parse(opts.body).track).toBe('vaazhvinil-orumurayenum.mp3')
  })

  it('reuses a still-fresh signed URL without a second fetch', async () => {
    const signedUrl = 'https://example.supabase.co/storage/v1/object/sign/audio/x.mp3?token=abc'
    const fetchMock = mockFetch({ ok: true, json: async () => ({ url: signedUrl }) })
    await signedAudio.resolvePlayableUrl(SIGNED, '128')
    await signedAudio.resolvePlayableUrl(SIGNED, '128')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns null when the Edge Function fails (no dead link for the player)', async () => {
    mockFetch({ ok: false, status: 403, json: async () => ({}) })
    await expect(signedAudio.resolvePlayableUrl(SIGNED, '128')).resolves.toBeNull()
  })

  it('returns null when the fetch itself throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    await expect(signedAudio.resolvePlayableUrl(SIGNED, '128')).resolves.toBeNull()
  })
})
