// Admin redesign — shell: nav groups + breadcrumb mapping.
// Pure-function tests — no DOM, no router needed.
import { describe, it, expect } from 'vitest'
import { NAV_GROUPS, NEW_MENU_ITEMS, getBreadcrumb } from '../../admin/lib/adminNav.js'

describe('NAV_GROUPS', () => {
  it('puts Dashboard ungrouped at the top, then Content / People / Insights / System', () => {
    expect(NAV_GROUPS.map((g) => g.groupKey)).toEqual([
      null,
      'admin.navContent',
      'admin.navPeople',
      'admin.navInsights',
      'admin.navSystem',
    ])
    expect(NAV_GROUPS[0].items).toEqual([{ to: '/admin', key: 'admin.dashboard', end: true }])
  })

  it('groups Tracks, Albums, Artists, Lyrics, Playlists under Content', () => {
    expect(NAV_GROUPS[1].items.map((i) => i.to)).toEqual([
      '/admin/tracks',
      '/admin/albums',
      '/admin/artists',
      '/admin/lyrics',
      '/admin/playlists',
    ])
  })

  it('groups Users under People, Analytics under Insights, Settings under System', () => {
    expect(NAV_GROUPS[2].items).toEqual([{ to: '/admin/users', key: 'admin.users' }])
    expect(NAV_GROUPS[3].items).toEqual([{ to: '/admin/analytics', key: 'admin.analytics' }])
    expect(NAV_GROUPS[4].items).toEqual([{ to: '/admin/settings', key: 'admin.siteSettings' }])
  })
})

describe('NEW_MENU_ITEMS', () => {
  it('links Track to its editor route and the rest to their list pages (inline editors)', () => {
    expect(NEW_MENU_ITEMS).toEqual([
      { to: '/admin/tracks/new', key: 'admin.newTrack' },
      { to: '/admin/albums', key: 'admin.newAlbum' },
      { to: '/admin/artists', key: 'admin.newArtist' },
      { to: '/admin/playlists', key: 'admin.newPlaylist' },
    ])
  })
})

describe('getBreadcrumb', () => {
  it('returns just Dashboard (current) for /admin', () => {
    expect(getBreadcrumb('/admin')).toEqual([{ labelKey: 'admin.dashboard', to: null }])
  })

  it('returns Dashboard + the section for list pages', () => {
    expect(getBreadcrumb('/admin/tracks')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.tracks', to: null },
    ])
    expect(getBreadcrumb('/admin/albums')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.albums', to: null },
    ])
    expect(getBreadcrumb('/admin/users')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.users', to: null },
    ])
    expect(getBreadcrumb('/admin/analytics')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.analytics', to: null },
    ])
    expect(getBreadcrumb('/admin/settings')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.siteSettings', to: null },
    ])
    expect(getBreadcrumb('/admin/artists')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.artists', to: null },
    ])
    expect(getBreadcrumb('/admin/lyrics')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.lyrics', to: null },
    ])
    expect(getBreadcrumb('/admin/playlists')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.playlists', to: null },
    ])
  })

  it('returns Dashboard + Tracks + New track for /admin/tracks/new', () => {
    expect(getBreadcrumb('/admin/tracks/new')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.tracks', to: '/admin/tracks' },
      { labelKey: 'admin.crumbNewTrack', to: null },
    ])
  })

  it('returns Dashboard + Tracks + Edit track for /admin/tracks/:id/edit', () => {
    expect(getBreadcrumb('/admin/tracks/vaazhvinil-orumurayenum/edit')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.tracks', to: '/admin/tracks' },
      { labelKey: 'admin.crumbEditTrack', to: null },
    ])
    expect(getBreadcrumb('/admin/tracks/33333333-4444-5555-6666-777777777777/edit')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.tracks', to: '/admin/tracks' },
      { labelKey: 'admin.crumbEditTrack', to: null },
    ])
  })

  it('tolerates a trailing slash', () => {
    expect(getBreadcrumb('/admin/tracks/')).toEqual([
      { labelKey: 'admin.dashboard', to: '/admin' },
      { labelKey: 'admin.tracks', to: null },
    ])
  })

  it('falls back to just Dashboard for unknown paths', () => {
    expect(getBreadcrumb('/admin/nope')).toEqual([{ labelKey: 'admin.dashboard', to: null }])
    expect(getBreadcrumb('')).toEqual([{ labelKey: 'admin.dashboard', to: null }])
  })
})
