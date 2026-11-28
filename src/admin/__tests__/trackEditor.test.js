// Track editor regression test (28 Nov 2026).
//
// The editor crashed deterministically on mount — for new AND existing
// tracks — because useUnsavedGuard called react-router's useBlocker,
// which throws "useBlocker must be used within a data router" in this
// app's <BrowserRouter> setup (App.jsx). The public track page was
// fine; only the editor mounts that hook. These tests render the REAL
// TrackEditor (new + edit) in jsdom with mocked data hooks and fail
// if the mount throws again — a node-only test suite cannot catch
// render crashes, so this file is the guard. jsdom is a devDependency
// for this file only; nothing about it ships to the browser.
import { describe, it, expect, vi } from 'vitest'
import { JSDOM } from 'jsdom'

// Mutable mock state (one file, one module registry): each test sets
// the track the mocked useTrack returns before rendering.
const mockTrackState = vi.hoisted(() => ({ track: null, loading: false }))

vi.mock('../../lib/supabaseCatalog.js', () => ({
  useTrack: () => ({
    data: mockTrackState.track,
    isLoading: mockTrackState.loading,
    refetch: vi.fn(),
  }),
  useAlbums: () => ({
    data: [
      {
        id: 'bc0a6b06-9aa2-48e5-a2e5-3cdd1737a462',
        titleTa: 'மலையோரம் வீசிய காற்றே',
        titleEn: 'Malaiyoram Veesiya Kaatre (Original Motion Picture Soundtrack)',
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useArtists: () => ({
    data: [{ id: '24f966e7-6182-4ee9-aab8-668b64ff96c0', name: 'Nandha Music', nameEn: 'Nandha Music' }],
    isLoading: false,
    refetch: vi.fn(),
  }),
  getCatalogSource: () => 'supabase',
}))

vi.mock('../../lib/auth.jsx', () => ({
  useAuth: () => ({
    user: { email: 'officialnandhamusic@gmail.com' },
    role: 'admin',
    isAdmin: true,
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('../../lib/i18n.js', () => ({
  useI18n: () => ({
    lang: 'en',
    setLang: () => {},
    t: (k) => k,
    tp: (k) => k,
    locales: ['en', 'ta', 'hi'],
  }),
}))

vi.mock('../../lib/toast.jsx', () => ({ useToast: () => () => {} }))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseWritesEnabled: false,
  saveTrackToSupabase: async () => ({}),
  adminErrorMessage: () => 'err',
  validateAudioFile: () => {},
  validateCoverFile: () => {},
  withTimeout: (p) => p,
  SAVE_TIMEOUT_MS: 180000,
}))

vi.mock('../../lib/adminStore.js', () => ({
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
}))

// The mapped Malaiyoram row (shape of mapTrack output for the live
// Supabase row, slug malaiyoram-veesiya-kaatre) — the edit case loads
// this through the mocked useTrack.
const MALAIYORAM_TRACK = {
  id: 'malaiyoram-veesiya-kaatre',
  slug: 'malaiyoram-veesiya-kaatre',
  dbId: '8e0efaed-0b28-4c12-b3bb-f7bffc9cd4ab',
  titleEn: 'Malaiyoram Veesiya Kaatre',
  titleTa: 'மலையோரம் வீசிய காற்றே',
  artistId: '24f966e7-6182-4ee9-aab8-668b64ff96c0',
  artist: 'Nandha Music',
  composer: '',
  lyricist: '',
  albumId: 'bc0a6b06-9aa2-48e5-a2e5-3cdd1737a462',
  album: 'Malaiyoram Veesiya Kaatre (Original Motion Picture Soundtrack)',
  genre: 'Love',
  language: 'Tamil',
  durationSec: 351,
  audio128: 'audio/malaiyoram-veesiya-kaatre.mp3',
  audio320: 'audio/malaiyoram-veesiya-kaatre.mp3',
  cover: 'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/malaiyoram-veesiya-kaatre-cover-800.jpg',
  status: 'published',
  plays: 11,
  releaseDate: null,
  hookStartSec: 63,
  hookDurationSec: 12,
  description: '',
  storyTa: '',
  storyEn: '',
  scheduledAt: null,
  lyricsTa: [],
  lyricsEn: [],
}

function setGlobal(key, value) {
  try {
    globalThis[key] = value
  } catch {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
  }
}

function installDom(url) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url })
  const { window } = dom
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'SVGElement',
    'HTMLAudioElement',
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
}

async function renderEditor(route) {
  installDom(`https://nandhamusic.pages.dev${route}`)
  const { createElement: h, act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { MemoryRouter, Routes, Route } = await import('react-router-dom')
  const { default: TrackEditor } = await import('../TrackEditor.jsx')

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [route] },
        h(
          Routes,
          null,
          h(Route, { path: '/admin/tracks/new', element: h(TrackEditor) }),
          h(Route, { path: '/admin/tracks/:id/edit', element: h(TrackEditor) }),
        ),
      ),
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  return {
    container,
    cleanup: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('TrackEditor', () => {
  it('renders the new-track editor without crashing', async () => {
    mockTrackState.track = null
    mockTrackState.loading = false
    const { container, cleanup } = await renderEditor('/admin/tracks/new')
    try {
      expect(container.innerHTML).not.toContain('Something went wrong')
      expect(container.innerHTML).toContain('admin.editorStepBasics')
      expect(container.innerHTML).toContain('admin.titleTa')
    } finally {
      await cleanup()
    }
  })

  it('renders the edit-track editor with the track loaded', async () => {
    mockTrackState.track = MALAIYORAM_TRACK
    mockTrackState.loading = false
    const { container, cleanup } = await renderEditor('/admin/tracks/malaiyoram-veesiya-kaatre/edit')
    try {
      expect(container.innerHTML).not.toContain('Something went wrong')
      expect(container.innerHTML).toContain('admin.editorStepBasics')
      // The init effect fills the form from the loaded track.
      const titleInput = container.querySelector('input')
      expect(titleInput?.value).toBe('மலையோரம் வீசிய காற்றே')
    } finally {
      await cleanup()
    }
  })
})
