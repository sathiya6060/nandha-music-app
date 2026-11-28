// Admin list pages regression test (28 Nov 2026).
//
// The four admin list pages were refactored onto the shared
// useAdminList hook + AdminList components. This file renders the
// REAL pages in jsdom with mocked data hooks and guards that each
// page still shows its own columns, rows, cards, toolbar, pagination
// rule, bulk bar, empty state and delete dialog — the refactor must
// not drop a column or change a page's behaviour. The shared
// machinery itself (search/sort/select/delete) is covered by
// adminList.test.js. jsdom is a devDependency for these render tests;
// nothing about it ships to the browser.
import { describe, it, expect, vi } from 'vitest'
import {
  installDom,
  mockVaazhvinil,
  mockMalaiyoram,
  mockMarakka,
} from '../../lib/__tests__/testHelpers.js'

const mockData = vi.hoisted(() => ({
  tracks: [],
  albums: [],
  playlists: [],
  artists: [],
  tracksLoading: false,
  albumsLoading: false,
  playlistsLoading: false,
  artistsLoading: false,
  writesEnabled: false,
}))

vi.mock('../../lib/supabaseCatalog.js', () => ({
  useTracks: () => ({
    data: mockData.tracks,
    isLoading: mockData.tracksLoading,
    refetch: vi.fn(),
  }),
  useAlbums: () => ({
    data: mockData.albums,
    isLoading: mockData.albumsLoading,
    refetch: vi.fn(),
  }),
  usePlaylists: () => ({
    data: mockData.playlists,
    isLoading: mockData.playlistsLoading,
    refetch: vi.fn(),
  }),
  useArtists: () => ({
    data: mockData.artists,
    isLoading: mockData.artistsLoading,
    refetch: vi.fn(),
  }),
  getCatalogSource: () => 'supabase',
}))

vi.mock('../../lib/supabase.js', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

vi.mock('../../lib/auth.jsx', () => ({
  useAuth: () => ({
    user: { email: 'officialnandhamusic@gmail.com' },
    isAdmin: true,
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('../../lib/i18n.js', () => ({
  useI18n: () => ({ lang: 'en', setLang: () => {}, t: (k) => k, tp: (k) => k, locales: ['en'] }),
}))

vi.mock('../../lib/toast.jsx', () => ({ useToast: () => () => {} }))

vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseWritesEnabled: () => mockData.writesEnabled,
  saveTrackToSupabase: async () => ({}),
  deleteTrackFromSupabase: async () => {},
  savePlaylistToSupabase: async () => ({}),
  deletePlaylistFromSupabase: async () => {},
  saveAlbumToSupabase: async () => ({}),
  deleteAlbumFromSupabase: async () => {},
  saveArtistToSupabase: async () => ({}),
  deleteArtistFromSupabase: async () => {},
  countArtistDependents: async () => ({ albums: 0, tracks: 0 }),
  adminErrorMessage: () => 'err',
  adminDeleteErrorMessage: () => 'delete failed',
  withTimeout: (p) => p,
  SAVE_TIMEOUT_MS: 180000,
}))

vi.mock('../../lib/adminStore.js', () => ({
  getMergedTracks: (b = []) => [...b],
  getMergedPlaylists: (b = []) => [...b],
  getMergedAlbums: (b = []) => [...b],
  getMergedArtists: (b = []) => [...b],
  saveAdminArtist: () => {},
  restoreAdminTrack: () => {},
  invalidateCaches: async () => {},
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

const MOCK_PLAYLISTS = [
  {
    id: 'pl-best',
    name: 'சிறந்த நந்தா',
    description: 'Best of Nandha',
    trackIds: ['vaazhvinil-orumurayenum', 'malaiyoram-veesiya-kaatre'],
    cover: '',
  },
  { id: 'pl-love', name: 'Love Songs', description: '', trackIds: ['marakka-mudiyuma'], cover: '' },
]

const MOCK_ALBUMS = [
  {
    id: 'al-annamalaiyar',
    titleTa: 'அண்ணாமலையார்',
    titleEn: 'Annamalaiyar',
    releaseDate: '2026-12-10',
    cover: '',
    trackIds: ['vaazhvinil-orumurayenum'],
  },
  { id: 'al-malaiyoram', titleTa: 'மலையோரம்', titleEn: 'Malaiyoram', releaseDate: '', cover: '', trackIds: [] },
]

const MOCK_ARTISTS = [
  { id: 'ar-nandha', name: 'Nandha Music', nameTa: 'நந்தா மியூசிக்', bioEn: 'Tamil music label', bioTa: '', photo: '' },
  { id: 'ar-guruji', name: 'Siddha Guruji', nameTa: '', bioEn: 'Composer', bioTa: '', photo: '' },
]

const PAGES = {
  '/admin/tracks': { file: '../TracksAdmin.jsx', title: 'admin.tracks' },
  '/admin/playlists': { file: '../PlaylistsAdmin.jsx', title: 'admin.playlists' },
  '/admin/albums': { file: '../AlbumsAdmin.jsx', title: 'admin.albums' },
  '/admin/artists': { file: '../ArtistsAdmin.jsx', title: 'admin.artists' },
}

function resetData() {
  mockData.tracks = [mockVaazhvinil(), mockMalaiyoram(), mockMarakka()]
  mockData.albums = MOCK_ALBUMS
  mockData.playlists = MOCK_PLAYLISTS
  mockData.artists = MOCK_ARTISTS
  mockData.tracksLoading = false
  mockData.albumsLoading = false
  mockData.playlistsLoading = false
  mockData.artistsLoading = false
  mockData.writesEnabled = false
}

async function renderPage(route) {
  installDom(`https://nandhamusic.pages.dev${route}`)
  const { createElement: h, act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { MemoryRouter, Routes, Route } = await import('react-router-dom')
  const { default: Page } = await import(PAGES[route].file)

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      h(
        MemoryRouter,
        { initialEntries: [route] },
        h(Routes, null, h(Route, { path: route, element: h(Page) })),
      ),
    )
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  return {
    container,
    act,
    cleanup: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

function rowNames(container) {
  return [...container.querySelectorAll('tbody tr td:nth-child(3)')].map((td) => td.textContent)
}

function findButton(container, text) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text))
}

async function setSearch(container, act, value) {
  const input = container.querySelector('input[type="search"]')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 250))
  })
}

describe('Admin list pages (refactor)', () => {
  it('Tracks: columns, rows, cards, search, bulk bar, always-on pagination', async () => {
    resetData()
    const rendered = await renderPage('/admin/tracks')
    try {
      expect(rendered.container.textContent).toContain('admin.tracks')
      // Table columns + all three tracks.
      expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(3)
      expect(rendered.container.textContent).toContain('வாழ்வினில் ஒருமுறையேனும்')
      expect(rendered.container.textContent).toContain('மலையோரம் வீசிய காற்றே')
      // Mobile cards render the same rows.
      expect(rendered.container.querySelectorAll('.list-card')).toHaveLength(3)
      // Search narrows to one track. ('malaiyoram' would match two:
      // the shared mock Marakka inherits album 'Malaiyoram'.)
      await setSearch(rendered.container, rendered.act, 'vaazhvinil')
      expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(1)
      await setSearch(rendered.container, rendered.act, '')
      expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(3)
      // Select-all shows the bulk bar with publish + unpublish.
      await rendered.act(async () => {
        rendered.container.querySelector('thead input[type="checkbox"]').click()
      })
      expect(rendered.container.textContent).toContain('admin.selectedCount')
      expect(findButton(rendered.container, 'common.publish')).toBeTruthy()
      expect(findButton(rendered.container, 'common.unpublish')).toBeTruthy()
      // Tracks always renders pagination (even on one page).
      expect(rendered.container.textContent).toContain('common.pageOf')
      // Delete opens the confirm dialog.
      await rendered.act(async () => {
        findButton(rendered.container, 'common.delete').click()
      })
      expect(rendered.container.textContent).toContain('admin.deleteNoUndo')
    } finally {
      await rendered.cleanup()
    }
  })

  it('Tracks: loading skeleton and empty state', async () => {
    resetData()
    mockData.tracksLoading = true
    const loading = await renderPage('/admin/tracks')
    try {
      expect(loading.container.querySelectorAll('.list-skeleton-row')).toHaveLength(5)
    } finally {
      await loading.cleanup()
    }
    resetData()
    mockData.tracks = []
    const empty = await renderPage('/admin/tracks')
    try {
      expect(empty.container.textContent).toContain('admin.noTracksFound')
      expect(findButton(empty.container, 'admin.addFirstTrack')).toBeTruthy()
    } finally {
      await empty.cleanup()
    }
  })

  it('Playlists: rows, count sort, pagination hidden on one page', async () => {
    resetData()
    const rendered = await renderPage('/admin/playlists')
    try {
      expect(rendered.container.textContent).toContain('admin.playlists')
      expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(2)
      expect(rendered.container.querySelectorAll('.list-card')).toHaveLength(2)
      expect(rendered.container.textContent).toContain('சிறந்த நந்தா')
      // 2 rows fit on one page: no pagination (Playlists rule).
      expect(rendered.container.textContent).not.toContain('common.pageOf')
      // Sort by track count: Love (1) before Best (2) ascending.
      await rendered.act(async () => {
        findButton(rendered.container, 'admin.tracks').click()
      })
      expect(rowNames(rendered.container)[0]).toContain('Love Songs')
    } finally {
      await rendered.cleanup()
    }
  })

  it('Albums: rows and delete dialog with type-to-confirm', async () => {
    resetData()
    const rendered = await renderPage('/admin/albums')
    try {
      expect(rendered.container.textContent).toContain('admin.albums')
      expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(2)
      expect(rendered.container.textContent).toContain('அண்ணாமலையார்')
      expect(rendered.container.textContent).not.toContain('common.pageOf')
      // Delete opens the impact dialog with the typed-name input.
      await rendered.act(async () => {
        findButton(rendered.container, 'common.delete').click()
      })
      expect(rendered.container.textContent).toContain('admin.albumDeleteImpact')
      expect(rendered.container.querySelector('.confirm-dialog__type-input')).toBeTruthy()
    } finally {
      await rendered.cleanup()
    }
  })

  it('Artists: rows, and delete with writes disabled shows the error, no dialog', async () => {
    resetData()
    const rendered = await renderPage('/admin/artists')
    try {
      expect(rendered.container.textContent).toContain('admin.artists')
      expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(2)
      expect(rendered.container.textContent).toContain('Nandha Music')
      expect(rendered.container.textContent).not.toContain('common.pageOf')
      // Writes are disabled in this harness: handleDelete errors
      // instead of opening the cascade dialog.
      await rendered.act(async () => {
        findButton(rendered.container, 'common.delete').click()
        await new Promise((r) => setTimeout(r, 50))
      })
      expect(rendered.container.textContent).toContain('admin.dbNotConnected')
      expect(rendered.container.querySelector('[role="alertdialog"]')).toBeNull()
    } finally {
      await rendered.cleanup()
    }
  })
})
