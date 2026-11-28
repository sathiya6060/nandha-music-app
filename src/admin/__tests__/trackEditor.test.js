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
// for these render tests; nothing about it ships to the browser.
import { describe, it, expect, vi } from 'vitest'
import { installDom } from '../../lib/__tests__/testHelpers.js'

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

async function renderEditor(route) {
  installDom(`https://nandhamusic.pages.dev${route}`)
  const { createElement: h, act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { MemoryRouter, Routes, Route } = await import('react-router-dom')
  const { default: TrackEditor } = await import('../TrackEditor.jsx')

  // A fresh element on every render — re-rendering the SAME element
  // object makes React bail out (identical props), so the mocked
  // hook's new data would never be read.
  const renderTree = () =>
    h(
      MemoryRouter,
      { initialEntries: [route] },
      h(
        Routes,
        null,
        h(Route, { path: '/admin/tracks/new', element: h(TrackEditor) }),
        h(Route, { path: '/admin/tracks/:id/edit', element: h(TrackEditor) }),
      ),
    )
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(renderTree())
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  return {
    container,
    act,
    // Re-render the tree after the mocked hook state changes —
    // simulates the DB row arriving after the fallback.
    rerender: async () => {
      await act(async () => {
        root.render(renderTree())
      })
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

function clickStep(container, act, labelKey) {
  const btn = [...container.querySelectorAll('button')].find((b) =>
    b.textContent.includes(labelKey),
  )
  if (!btn) throw new Error(`step tab ${labelKey} not found`)
  return act(async () => {
    btn.click()
  })
}

// The lyrics textareas carry no name attribute — select by label.
function textareaFor(container, labelKey) {
  const label = [...container.querySelectorAll('label')].find((l) =>
    l.textContent.includes(labelKey),
  )
  return label?.querySelector('textarea') ?? null
}

// The DB's 40 Tamil lines for Vaazhvinil (live row, 28 Nov 2026).
const DB_LYRICS_TA = [
  'வாழ்வினில் ஒருமுறையேனும்',
  'அந்த மலையை சுற்றிவர வேண்டும்',
  'வாழ்க்கையின் நோக்கமும் புரியும்',
  'அண்ணாமலையானின் பேரருளும் கிடைக்கும்',
  ...Array.from({ length: 36 }, (_, i) => `DB Tamil line ${i + 5}`),
]

// The mapped DB row for Vaazhvinil (shape of mapTrack output for
// the live Supabase row, id 02bf3f77-0b5c-4dfc-8d68-030ff076d47e).
const VAAZHVINIL_DB_TRACK = {
  id: 'vaazhvinil-orumurayenum',
  slug: 'vaazhvinil-orumurayenum',
  dbId: '02bf3f77-0b5c-4dfc-8d68-030ff076d47e',
  titleEn: 'Vaazhvinil Orumurayenum',
  titleTa: 'வாழ்வினில் ஒருமுறையேனும்',
  artistId: '24f966e7-6182-4ee9-aab8-668b64ff96c0',
  artist: 'Nandha Music',
  composer: 'Siddha Guruji',
  lyricist: '',
  albumId: 'fbb9ed80-6e06-409d-a9a5-f0ced14a1c63',
  album: 'அண்ணாமலையார்',
  genre: 'Devotional',
  language: 'Tamil',
  durationSec: 224,
  audio128: 'audio/vaazhvinil-orumurayenum.mp3',
  audio320: 'audio/vaazhvinil-orumurayenum.mp3',
  cover: 'https://example.test/vaazhvinil-cover.webp',
  status: 'published',
  plays: 0,
  releaseDate: '2026-12-10',
  hookStartSec: 0,
  hookDurationSec: 30,
  description: '',
  storyTa: '',
  storyEn: '',
  scheduledAt: null,
  lyricsTa: DB_LYRICS_TA,
  lyricsEn: [],
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

  it('shows the DB lyrics (40 Tamil lines) on reopen, never the 4 fallback lines', async () => {
    // The DB row is still in flight: the form must NOT initialise
    // from the synchronous fallback entry.
    mockTrackState.track = null
    mockTrackState.loading = true
    const { container, act, rerender, cleanup } = await renderEditor(
      '/admin/tracks/vaazhvinil-orumurayenum/edit',
    )
    try {
      await clickStep(container, act, 'admin.editorStepLyrics')
      const taBefore = textareaFor(container, 'admin.lyricsTa')
      expect(taBefore.value).toBe('')

      // The real DB track arrives a moment later — the form must
      // re-initialise from it (same id, so an id-only guard blocks
      // this and the stale 4 fallback lines survive).
      mockTrackState.track = VAAZHVINIL_DB_TRACK
      mockTrackState.loading = false
      await rerender()

      const taAfter = textareaFor(container, 'admin.lyricsTa')
      const enAfter = textareaFor(container, 'admin.lyricsEn')
      const lines = taAfter.value.split('\n')
      expect(lines).toHaveLength(40)
      expect(lines[0]).toBe('வாழ்வினில் ஒருமுறையேனும்')
      expect(taAfter.value).not.toContain('அண்ணாமலையாரே அருள் தாரும்')
      expect(enAfter.value).toBe('')
    } finally {
      await cleanup()
    }
  })

  it('shows the stored audio file and duration on reopen (Malaiyoram)', async () => {
    mockTrackState.track = MALAIYORAM_TRACK
    mockTrackState.loading = false
    const { container, act, cleanup } = await renderEditor(
      '/admin/tracks/malaiyoram-veesiya-kaatre/edit',
    )
    try {
      // Media tab: the stored mp3 is displayed even though no new
      // file was picked in this session.
      await clickStep(container, act, 'admin.editorStepMedia')
      expect(container.textContent).toContain('malaiyoram-veesiya-kaatre.mp3')

      // Preview hook tab: the real duration instead of "unknown".
      await clickStep(container, act, 'admin.editorStepHook')
      expect(container.textContent).toContain('5:51')
      expect(container.textContent).not.toContain('admin.editorUnknownDuration')
    } finally {
      await cleanup()
    }
  })
})
