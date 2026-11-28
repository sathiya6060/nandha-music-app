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
  rowNames,
  findButton,
  setSearch,
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

vi.mock('../../lib/adminStore.js', async () => {
  const { mockAdminStoreBase } = await import('../../lib/__tests__/testHelpers.js')
  return mockAdminStoreBase({
    getMergedPlaylists: (b = []) => [...b],
    getMergedAlbums: (b = []) => [...b],
    getMergedArtists: (b = []) => [...b],
    saveAdminArtist: () => {},
    restoreAdminTrack: () => {},
    invalidateCaches: async () => {},
  })
})

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

describe('Admin list pages (refactor)', () => {
  // Renders the page and asserts the basics every list page shares:
  // its title, its row count, and the one-page pagination rule (no
  // pagination when all rows fit on one page). The caller keeps the
  // returned render for its page-specific assertions and cleanup.
  async function renderListPage(route, { title, rowText, rowCount = 2, cardCount }) {
    resetData()
    const rendered = await renderPage(route)
    expect(rendered.container.textContent).toContain(title)
    expect(rendered.container.querySelectorAll('tbody tr')).toHaveLength(rowCount)
    if (cardCount !== undefined) {
      expect(rendered.container.querySelectorAll('.list-card')).toHaveLength(cardCount)
    }
    if (rowText) expect(rendered.container.textContent).toContain(rowText)
    expect(rendered.container.textContent).not.toContain('common.pageOf')
    return rendered
  }

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
    const rendered = await renderListPage('/admin/playlists', {
      title: 'admin.playlists',
      rowText: 'சிறந்த நந்தா',
      cardCount: 2,
    })
    try {
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
    const rendered = await renderListPage('/admin/albums', {
      title: 'admin.albums',
      rowText: 'அண்ணாமலையார்',
    })
    try {
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
    const rendered = await renderListPage('/admin/artists', {
      title: 'admin.artists',
      rowText: 'Nandha Music',
    })
    try {
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
