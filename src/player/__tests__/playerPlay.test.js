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
// for this file only; nothing about it ships to the browser.
import { describe, it, expect, vi } from 'vitest'
import { JSDOM } from 'jsdom'

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

const vaazhvinil = {
  id: 'vaazhvinil-orumurayenum',
  titleEn: 'Vaazhvinil Orumurayenum',
  titleTa: 'வாழ்வினில் ஒருமுறையேனும்',
  artist: 'Nandha Music',
  durationSec: 224,
  audio128: 'audio/vaazhvinil-orumurayenum.mp3',
  audio320: 'audio/vaazhvinil-orumurayenum.mp3',
}
const malaiyoram = {
  id: 'malaiyoram-veesiya-kaatre',
  titleEn: 'Malaiyoram Veesiya Kaatre',
  titleTa: 'மலையோரம் வீசிய காற்றே',
  artist: 'Nandha Music',
  durationSec: 351,
  audio128: 'audio/malaiyoram-veesiya-kaatre.mp3',
  audio320: 'audio/malaiyoram-veesiya-kaatre.mp3',
}
const marakka = {
  id: 'marakka-mudiyuma',
  titleEn: 'Marakka Mudiyuma',
  titleTa: 'மறக்க முடியுமா?',
  artist: 'Nandha Music',
  durationSec: 254,
  audio128: 'audio/marakka-mudiyuma.mp3',
  audio320: 'audio/marakka-mudiyuma.mp3',
}

function setGlobal(key, value) {
  try {
    globalThis[key] = value
  } catch {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://nandhamusic.pages.dev/',
  })
  const { window } = dom
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'SVGElement',
    'HTMLAudioElement',
    'HTMLMediaElement',
    'HTMLImageElement',
    'Audio',
    'Image',
    'Node',
    'Element',
    'Text',
    'DocumentFragment',
    'Event',
    'CustomEvent',
    'MouseEvent',
    'KeyboardEvent',
    'FocusEvent',
    'localStorage',
    'sessionStorage',
    'location',
    'history',
    'self',
  ]) {
    if (key in window) setGlobal(key, window[key])
  }
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  globalThis.requestAnimationFrame =
    typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (cb) => setTimeout(cb, 0)
  globalThis.cancelAnimationFrame =
    typeof window.cancelAnimationFrame === 'function'
      ? window.cancelAnimationFrame.bind(window)
      : (id) => clearTimeout(id)
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
  globalThis.matchMedia = window.matchMedia
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // jsdom does not implement media playback — stub it so the
  // provider's <audio> element can load/play without throwing.
  window.HTMLMediaElement.prototype.play = () => Promise.resolve()
  window.HTMLMediaElement.prototype.pause = () => {}
  window.HTMLMediaElement.prototype.load = () => {}
}

async function renderPlayer() {
  installDom()
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
