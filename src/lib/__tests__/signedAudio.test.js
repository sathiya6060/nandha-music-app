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
// Seeded path form (audio_128_url / audio_320_url in the DB rows):
// the client must extract the bare file name and treat these as signed.
const MALAIYORAM = { id: 't3', audio128: 'audio/malaiyoram-veesiya-kaatre.mp3', audio320: 'audio/malaiyoram-veesiya-kaatre.mp3' }
const MARAKKA = { id: 't4', audio128: 'audio/marakka-mudiyuma.mp3', audio320: 'audio/marakka-mudiyuma.mp3' }

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

  it('is true for Malaiyoram and Marakka (seeded audio/ path form), at either quality', () => {
    expect(signedAudio.isSignedTrack(MALAIYORAM, '128')).toBe(true)
    expect(signedAudio.isSignedTrack(MALAIYORAM, '320')).toBe(true)
    expect(signedAudio.isSignedTrack(MARAKKA, '128')).toBe(true)
    expect(signedAudio.isSignedTrack(MARAKKA, '320')).toBe(true)
  })

  it('is true for a brand-new track file with no allowlist entry (C1)', () => {
    const NEW = { id: 't5', audio128: 'audio/a-brand-new-song.mp3', audio320: 'audio/a-brand-new-song.mp3' }
    expect(signedAudio.isSignedTrack(NEW, '128')).toBe(true)
    expect(signedAudio.isSignedTrack({ audio128: 'a-brand-new-song.mp3' }, '128')).toBe(true)
  })

  it('is false for local /assets paths and remote http(s) URLs, and picks the right quality field', () => {
    expect(signedAudio.isSignedTrack({ audio128: '/assets/other-song.mp3', audio320: '/assets/other-song.mp3' }, '128')).toBe(false)
    expect(signedAudio.isSignedTrack({ audio128: 'https://cdn.example.com/other.mp3' }, '128')).toBe(false)
    expect(signedAudio.isSignedTrack({ audio128: '/assets/other.mp3', audio320: 'vaazhvinil-orumurayenum.mp3' }, '128')).toBe(false)
    expect(signedAudio.isSignedTrack({ audio128: '/assets/other.mp3', audio320: 'vaazhvinil-orumurayenum.mp3' }, '320')).toBe(true)
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

  it('returns the local path for a local-asset track (no fetch)', async () => {
    const fetchMock = mockFetch()
    const LOCAL = { id: 't2', audio128: '/assets/other-song.mp3', audio320: '/assets/other-song.mp3' }
    await expect(signedAudio.resolvePlayableUrl(LOCAL, '128')).resolves.toBe('/assets/other-song.mp3')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mints a signed URL for a brand-new track file (no allowlist)', async () => {
    const signedUrl = 'https://example.supabase.co/storage/v1/object/sign/audio/a-brand-new-song.mp3?token=<redacted>'
    const fetchMock = mockFetch({ ok: true, json: async () => ({ url: signedUrl }) })
    const NEW = { id: 't5', audio128: 'audio/a-brand-new-song.mp3', audio320: 'audio/a-brand-new-song.mp3' }
    await expect(signedAudio.resolvePlayableUrl(NEW, '128')).resolves.toBe(signedUrl)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, opts] = fetchMock.mock.calls[0]
    expect(JSON.parse(opts.body).track).toBe('a-brand-new-song.mp3')
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

  it('mints a signed URL for Malaiyoram, sending the bare file name', async () => {
    const signedUrl = 'https://example.supabase.co/storage/v1/object/sign/audio/malaiyoram-veesiya-kaatre.mp3?token=abc'
    const fetchMock = mockFetch({ ok: true, json: async () => ({ url: signedUrl }) })
    await expect(signedAudio.resolvePlayableUrl(MALAIYORAM, '320')).resolves.toBe(signedUrl)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, opts] = fetchMock.mock.calls[0]
    expect(JSON.parse(opts.body).track).toBe('malaiyoram-veesiya-kaatre.mp3')
  })

  it('mints a signed URL for Marakka, sending the bare file name', async () => {
    const signedUrl = 'https://example.supabase.co/storage/v1/object/sign/audio/marakka-mudiyuma.mp3?token=abc'
    const fetchMock = mockFetch({ ok: true, json: async () => ({ url: signedUrl }) })
    await expect(signedAudio.resolvePlayableUrl(MARAKKA, '128')).resolves.toBe(signedUrl)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, opts] = fetchMock.mock.calls[0]
    expect(JSON.parse(opts.body).track).toBe('marakka-mudiyuma.mp3')
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

describe('resolvePlayableUrl — no Supabase configured', () => {
  it('falls back to the local silent mp3 for the signed track instead of an empty src', async () => {
    // No Supabase configured: config.supabaseUrl is '' so
    // getSignedAudioUrl throws 'supabase_not_configured'. The signed
    // file name is also the local 1s silent mp3 — the player must get
    // that path, not null (null leaves the <audio> with no src and
    // playback silently dead).
    vi.resetModules()
    vi.doMock('../config.js', async (importOriginal) => {
      const actual = await importOriginal()
      return {
        ...actual,
        config: { ...actual.config, supabaseUrl: '', supabaseAnonKey: '' },
      }
    })
    const unconfiguredSignedAudio = await import('../signedAudio.js')
    const fetchMock = mockFetch()
    const localTrack = { id: 't1', audio128: '/assets/vaazhvinil-orumurayenum.mp3', audio320: '/assets/vaazhvinil-orumurayenum.mp3' }
    await expect(unconfiguredSignedAudio.resolvePlayableUrl(localTrack, '128')).resolves.toBe('/assets/vaazhvinil-orumurayenum.mp3')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
