// Shared jsdom + mock-track helpers for the tests that render real
// components in jsdom (28 Nov 2026).
//
// The jsdom setup (~60 lines) and the three-song mock tracks used to
// be copied into every render test — playerPlay, trackPage and
// trackEditor each carried their own installDom, and playerPlay,
// playerPlayTarget and trackPage each carried their own
// vaazhvinil/malaiyoram/marakka literals. SonarQube flagged the
// copies as duplicated new code on PR #14, so they live here once
// and every test imports them. Nothing in this file ships to the
// browser; it is only imported by *.test.js files.
import { JSDOM } from 'jsdom'

const DEFAULT_URL = 'https://nandhamusic.pages.dev/'

function setGlobal(key, value) {
  try {
    globalThis[key] = value
  } catch {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
}

// Install a fresh jsdom window onto globalThis (the vitest
// environment is node — there is no DOM until this runs).
// `media: true` also stubs HTMLMediaElement playback: jsdom does not
// implement it, so the player tests need play/pause/load to resolve
// instead of throwing.
export function installDom(url = DEFAULT_URL, { media = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url })
  const { window } = dom
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'SVGElement',
    'HTMLAudioElement',
    ...(media ? ['HTMLMediaElement'] : []),
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
  if (media) {
    // jsdom does not implement media playback — stub it so the
    // provider's <audio> element can load/play without throwing.
    window.HTMLMediaElement.prototype.play = () => Promise.resolve()
    window.HTMLMediaElement.prototype.pause = () => {}
    window.HTMLMediaElement.prototype.load = () => {}
  }
}

// Canonical mock tracks — the three live songs in UI-track shape
// (the mapTrack output shape). Each call returns a fresh object so
// tests cannot leak mutations into each other; `overrides` tailors
// one field without copying the whole literal again.
export function mockVaazhvinil(overrides = {}) {
  return {
    id: 'vaazhvinil-orumurayenum',
    slug: 'vaazhvinil-orumurayenum',
    titleTa: 'வாழ்வினில் ஒருமுறையேனும்',
    titleEn: 'Vaazhvinil Orumurayenum',
    artist: 'Nandha Music',
    artistId: 'nandha-music',
    album: 'Annamalaiyar',
    albumId: 'annamalaiyar',
    genre: 'Devotional',
    language: 'Tamil',
    durationSec: 224,
    audio128: 'audio/vaazhvinil-orumurayenum.mp3',
    audio320: 'audio/vaazhvinil-orumurayenum.mp3',
    cover: '/assets/vaazhvinil-cover-800.webp',
    status: 'published',
    lyricsTa: [],
    lyricsEn: [],
    ...overrides,
  }
}

export function mockMalaiyoram(overrides = {}) {
  return {
    id: 'malaiyoram-veesiya-kaatre',
    slug: 'malaiyoram-veesiya-kaatre',
    titleTa: 'மலையோரம் வீசிய காற்றே',
    titleEn: 'Malaiyoram Veesiya Kaatre',
    artist: 'Nandha Music',
    artistId: 'nandha-music',
    album: 'Malaiyoram',
    albumId: 'malaiyoram',
    genre: 'Love',
    language: 'Tamil',
    durationSec: 351,
    audio128: 'audio/malaiyoram-veesiya-kaatre.mp3',
    audio320: 'audio/malaiyoram-veesiya-kaatre.mp3',
    cover: 'https://example.test/malaiyoram.jpg',
    status: 'published',
    lyricsTa: [],
    lyricsEn: [],
    ...overrides,
  }
}

export function mockMarakka(overrides = {}) {
  return {
    ...mockMalaiyoram(),
    id: 'marakka-mudiyuma',
    slug: 'marakka-mudiyuma',
    titleTa: 'மறக்க முடியுமா?',
    titleEn: 'Marakka Mudiyuma',
    durationSec: 254,
    audio128: 'audio/marakka-mudiyuma.mp3',
    audio320: 'audio/marakka-mudiyuma.mp3',
    ...overrides,
  }
}

// DOM helpers shared by the admin render tests (28 Nov 2026).
// adminList.test.js and adminListPages.test.js each carried their own
// rowNames / findButton / setSearch — SonarQube flagged the copies
// as duplicated new code on PR #15, so they live here once.
// `column` is the 1-based td whose text is the row name (the harness
// table puts it in column 2, the real pages in column 3).
export function rowNames(container, column = 3) {
  return [...container.querySelectorAll(`tbody tr td:nth-child(${column})`)].map(
    (td) => td.textContent,
  )
}

export function findButton(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text))
}

export async function setSearch(container, act, value) {
  const input = container.querySelector('input[type="search"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 250))
  })
}

// Shared adminStore mock base for the render tests (28 Nov 2026).
// trackEditor.test.js and adminListPages.test.js each carried the same
// label-key literals + normalizeStatus inside their vi.mock factories
// — SonarQube flagged them as duplicated new code on PR #15, so the
// base lives here once and each test merges its own extras over it.
// Use it via an async vi.mock factory — mock factories are hoisted
// and cannot reference top-level imports, so the helper is imported
// inside the factory:
//   vi.mock('../../lib/adminStore.js', async () => {
//     const { mockAdminStoreBase } = await import('../../lib/__tests__/testHelpers.js')
//     return mockAdminStoreBase({ getMergedPlaylists: (b = []) => [...b] })
//   })
export function mockAdminStoreBase(extra = {}) {
  return {
    getMergedTracks: (b = []) => [...b],
    logActivity: () => {},
    STATUS_LABEL_KEYS: {
      draft: 'admin.statusDraft',
      scheduled: 'admin.statusScheduled',
      published: 'admin.statusPublished',
      unlisted: 'admin.statusUnlisted',
      deleted: 'admin.statusDeleted',
    },
    GENRE_LABEL_KEYS: {
      Devotional: 'admin.genreDevotional',
      Love: 'admin.genreLove',
      Melody: 'admin.genreMelody',
      Siddhar: 'admin.genreSiddhar',
      Sivan: 'admin.genreSivan',
    },
    normalizeStatus: (s) => {
      const v = String(s || '').toLowerCase()
      return ['draft', 'scheduled', 'published', 'unlisted', 'deleted'].includes(v) ? v : 'draft'
    },
    ...extra,
  }
}
