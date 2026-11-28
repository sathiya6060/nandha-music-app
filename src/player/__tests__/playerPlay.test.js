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

vi.mock('../../lib/signedAudio.js', () => ({
  resolvePlayableUrl: async () => 'https://example.test/audio.mp3',
  isSignedTrack: () => false,
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
