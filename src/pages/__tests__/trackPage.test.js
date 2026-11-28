// Track page resolution (28 Nov 2026).
//
// After a track is deleted from the DB, its public page still
// rendered the full song from the static fallback catalog — the
// page used the fallback whenever the DB did not resolve the
// track, conflating "deleted" with "DB unreachable". The fix:
// the fallback applies ONLY when a DB fetch actually failed; a
// DB-reached absence shows Not Found. These tests render the REAL
// Track page in jsdom with mocked data hooks and fail on the old
// unconditional fallback.
import { describe, it, expect, vi } from 'vitest'
import {
  installDom,
  mockVaazhvinil,
  mockMalaiyoram,
  mockMarakka,
} from '../../lib/__tests__/testHelpers.js'

const mockPageState = vi.hoisted(() => ({
  track: null,
  trackLoading: false,
  trackError: false,
  tracks: null,
  tracksLoading: false,
  tracksError: false,
}))

vi.mock('../../lib/supabaseCatalog.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTrack: () => ({
      data: mockPageState.track,
      isLoading: mockPageState.trackLoading,
      isError: mockPageState.trackError,
      refetch: vi.fn(),
    }),
    useTracks: () => ({
      data: mockPageState.tracks,
      isLoading: mockPageState.tracksLoading,
      isError: mockPageState.tracksError,
    }),
  }
})

vi.mock('../../lib/i18n.js', () => ({
  useI18n: () => ({ lang: 'en', setLang: () => {}, t: (k) => k, tp: (k) => k, locales: ['en'] }),
}))

vi.mock('../../player/PlayerContext.jsx', () => ({
  usePlayer: () => ({ play: vi.fn(), openPlayer: vi.fn(), addToQueue: vi.fn(), setNotice: vi.fn() }),
  formatTime: (s) => `${s}`,
}))

vi.mock('../../lib/shareCard.js', () => ({
  shareOrDownloadStoryCard: async () => 'shared',
}))

vi.mock('../../lib/pageMeta.js', () => ({
  setPageMeta: () => {},
  resetPageMeta: () => {},
}))

vi.mock('../../components/TrackRow.jsx', () => ({ default: () => null }))
vi.mock('../../components/PinButton.jsx', () => ({ default: () => null }))
vi.mock('../../components/HideButton.jsx', () => ({ default: () => null }))

const vaazhvinil = mockVaazhvinil()
const malaiyoram = mockMalaiyoram()
const marakka = mockMarakka()

async function renderTrackPage(route) {
  installDom(`https://nandhamusic.pages.dev${route}`)
  const { createElement: h, act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { MemoryRouter, Routes, Route } = await import('react-router-dom')
  const { default: Track } = await import('../Track.jsx')

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [route] },
        h(Routes, null, h(Route, { path: '/track/:id', element: h(Track) })),
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

function resetState() {
  mockPageState.track = null
  mockPageState.trackLoading = false
  mockPageState.trackError = false
  mockPageState.tracks = null
  mockPageState.tracksLoading = false
  mockPageState.tracksError = false
}

describe('Track page', () => {
  it('shows Not Found when the DB was reached and the track is absent (deleted)', async () => {
    resetState()
    mockPageState.tracks = [malaiyoram, marakka]
    mockPageState.track = null
    const { container, cleanup } = await renderTrackPage('/track/vaazhvinil-orumurayenum')
    try {
      expect(container.innerHTML).toContain('common.noResults')
      expect(container.innerHTML).not.toContain('Vaazhvinil Orumurayenum')
      expect(container.innerHTML).not.toContain('வாழ்வினில் ஒருமுறையேனும்')
    } finally {
      await cleanup()
    }
  })

  it('renders the fallback while the queries are still loading (no loading flash)', async () => {
    resetState()
    mockPageState.tracks = null
    mockPageState.tracksLoading = true
    mockPageState.track = null
    mockPageState.trackLoading = true
    const { container, cleanup } = await renderTrackPage('/track/vaazhvinil-orumurayenum')
    try {
      // The fallback is the instant placeholder while the DB is
      // still answering — the page must not sit on "Loading…" for
      // the full query time on a direct load.
      expect(container.innerHTML).toContain('Vaazhvinil Orumurayenum')
      expect(container.innerHTML).not.toContain('common.loading')
    } finally {
      await cleanup()
    }
  })

  it('renders the fallback track when the DB fetch actually failed', async () => {
    resetState()
    mockPageState.tracks = undefined
    mockPageState.tracksError = true
    mockPageState.track = undefined
    mockPageState.trackError = true
    const { container, cleanup } = await renderTrackPage('/track/vaazhvinil-orumurayenum')
    try {
      expect(container.innerHTML).toContain('Vaazhvinil Orumurayenum')
      expect(container.innerHTML).toContain('வாழ்வினில் ஒருமுறையேனும்')
    } finally {
      await cleanup()
    }
  })

  it('renders the DB track when it exists', async () => {
    resetState()
    mockPageState.tracks = [vaazhvinil, malaiyoram, marakka]
    mockPageState.track = vaazhvinil
    const { container, cleanup } = await renderTrackPage('/track/vaazhvinil-orumurayenum')
    try {
      expect(container.innerHTML).toContain('Vaazhvinil Orumurayenum')
      expect(container.innerHTML).toContain('Nandha Music')
    } finally {
      await cleanup()
    }
  })
})
