// Player play() regression test (28 Nov 2026).
//
// Pressing Play on a track that is NOT in the given queue used to
// play queue[0] instead: play() did `findIndex` (-1) and then
// `target = idx >= 0 ? idx : 0`, so Malaiyoram played Vaazhvinil
// and a draft's Play played Vaazhvinil too. The fix appends the
// requested track and plays the appended index. These tests render
// the REAL PlayerProvider in jsdom and call its real play() — a
// helper-only test would stay green if play() stopped calling the
// helper, so the provider is the guard. jsdom is a devDependency
// for these render tests; nothing about it ships to the browser.
import { describe, it, expect, vi } from 'vitest'
import {
  installDom,
  mockVaazhvinil,
  mockMalaiyoram,
  mockMarakka,
} from '../../lib/__tests__/testHelpers.js'

vi.mock('../../lib/auth.jsx', () => ({
  useAuth: () => ({ user: null, isAdmin: false, loading: false }),
}))

vi.mock('../../lib/cache.js', () => ({
  recordPlay: () => {},
  flushPlays: async () => {},
}))

vi.mock('../../lib/supabaseCatalog.js', () => ({
  useTracks: () => ({ data: [], isLoading: false }),
}))

vi.mock('../../lib/mixes.js', () => ({
  getRadioCandidates: () => [],
}))

vi.mock('../../lib/pwa.js', () => ({
  getPinnedAudioBlobUrl: async () => null,
}))

// The signed-audio mock is mutable so load-error tests can make the
// mint fail on the signed retry (isSigned + a counting resolveImpl)
// while the play() tests keep the default success behaviour.
const mockSignedAudio = vi.hoisted(() => ({
  isSigned: false,
  resolveImpl: async () => 'https://example.test/audio.mp3',
}))

vi.mock('../../lib/signedAudio.js', () => ({
  resolvePlayableUrl: (...args) => mockSignedAudio.resolveImpl(...args),
  isSignedTrack: () => mockSignedAudio.isSigned,
  dropSignedAudioUrl: () => {},
  dropAllSignedAudioUrls: () => {},
  fileNameOf: (t) => t?.id || '',
}))

const vaazhvinil = mockVaazhvinil()
const malaiyoram = mockMalaiyoram()
const marakka = mockMarakka()

async function renderPlayer() {
  installDom('https://nandhamusic.pages.dev/', { media: true })
  const { createElement: h, act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { PlayerProvider, usePlayer } = await import('../PlayerContext.jsx')

  let latestPlayer = null
  function Probe() {
    latestPlayer = usePlayer()
    return null
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(h(PlayerProvider, null, h(Probe)))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  return {
    get player() {
      return latestPlayer
    },
    act,
    container,
    cleanup: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('PlayerProvider play()', () => {
  it('plays the requested track when it is NOT in the queue — never queue[0]', async () => {
    const rendered = await renderPlayer()
    try {
      await rendered.act(async () => {
        rendered.player.play(malaiyoram, [vaazhvinil, marakka])
        await new Promise((r) => setTimeout(r, 50))
      })
      const current = rendered.player
      expect(current.queue.map((t) => t.id)).toEqual([
        'vaazhvinil-orumurayenum',
        'marakka-mudiyuma',
        'malaiyoram-veesiya-kaatre',
      ])
      expect(current.queueIndex).toBe(2)
      expect(current.track?.id).toBe('malaiyoram-veesiya-kaatre')
    } finally {
      await rendered.cleanup()
    }
  })

  it('plays the track at its own index when it IS in the queue', async () => {
    const rendered = await renderPlayer()
    try {
      await rendered.act(async () => {
        rendered.player.play(vaazhvinil, [vaazhvinil, marakka])
        await new Promise((r) => setTimeout(r, 50))
      })
      const current = rendered.player
      expect(current.queue).toHaveLength(2)
      expect(current.queueIndex).toBe(0)
      expect(current.track?.id).toBe('vaazhvinil-orumurayenum')
    } finally {
      await rendered.cleanup()
    }
  })
})

describe('PlayerProvider load error (28 Nov 2026 live-verify)', () => {
  // Live: pressing Play on Malaiyoram put it in the Now Playing bar at
  // 0:00 but it never started; ~18s later the bar switched to
  // Vaazhvinil. The queue[0] fallback was already fixed (above), but
  // onError still skipped to the next playable on a load failure. A
  // track that cannot start must show "Could not play this track" and
  // STOP — never silently play a different song. Natural end-advance
  // (onEnded → next) is untouched.
  const resetSignedMock = () => {
    mockSignedAudio.isSigned = false
    mockSignedAudio.resolveImpl = async () => 'https://example.test/audio.mp3'
  }

  it('a failed signed retry stops with the notice — never plays the next track', async () => {
    mockSignedAudio.isSigned = true
    let mintCalls = 0
    mockSignedAudio.resolveImpl = async () => {
      mintCalls += 1
      // First mint (initial load) succeeds; the signed retry fails.
      return mintCalls === 1 ? 'https://example.test/malaiyoram.mp3' : null
    }
    const rendered = await renderPlayer()
    try {
      await rendered.act(async () => {
        rendered.player.play(malaiyoram, [malaiyoram, vaazhvinil, marakka])
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(rendered.player.track?.id).toBe('malaiyoram-veesiya-kaatre')
      expect(rendered.player.isPlaying).toBe(true)
      // Simulate the audio element failing to load (slow/failed mint).
      const audioEl = rendered.container.querySelector('audio')
      await rendered.act(async () => {
        audioEl.dispatchEvent(new Event('error'))
        await new Promise((r) => setTimeout(r, 100))
      })
      const current = rendered.player
      expect(current.track?.id).toBe('malaiyoram-veesiya-kaatre')
      expect(current.isPlaying).toBe(false)
      expect(current.notice).toMatch(/Could not play/)
    } finally {
      resetSignedMock()
      await rendered.cleanup()
    }
  })

  it('a second load error (retry used up, no pinned copy) also stops — never skips', async () => {
    mockSignedAudio.isSigned = true
    // Every mint succeeds, so the signed retry re-attaches — but the
    // element fails again, reaching the final fallback.
    mockSignedAudio.resolveImpl = async () => 'https://example.test/audio.mp3'
    const rendered = await renderPlayer()
    try {
      await rendered.act(async () => {
        rendered.player.play(malaiyoram, [malaiyoram, vaazhvinil, marakka])
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(rendered.player.track?.id).toBe('malaiyoram-veesiya-kaatre')
      const audioEl = rendered.container.querySelector('audio')
      await rendered.act(async () => {
        audioEl.dispatchEvent(new Event('error'))
        await new Promise((r) => setTimeout(r, 100))
      })
      // Retry re-attached the same track; it is still Malaiyoram.
      expect(rendered.player.track?.id).toBe('malaiyoram-veesiya-kaatre')
      await rendered.act(async () => {
        audioEl.dispatchEvent(new Event('error'))
        await new Promise((r) => setTimeout(r, 100))
      })
      const current = rendered.player
      expect(current.track?.id).toBe('malaiyoram-veesiya-kaatre')
      expect(current.isPlaying).toBe(false)
      expect(current.notice).toMatch(/Could not play/)
    } finally {
      resetSignedMock()
      await rendered.cleanup()
    }
  })
})
