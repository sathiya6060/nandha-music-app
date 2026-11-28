// Admin redesign — shell: nav structure + breadcrumb mapping.
// Pure helpers (no React, no i18n calls): AdminLayout renders the
// labels with t(item.key). Group headings are sentence case, quiet
// labels — never all-caps.
//
// Album / Artist / Playlist creation lives inline on their list
// pages (AlbumsAdmin etc. open an editor panel with editing='new');
// there is no /admin/albums/new route, so the "+ New" menu links to
// those list pages and the Track entry goes to /admin/tracks/new.
export const NAV_GROUPS = [
  {
    groupKey: null,
    items: [{ to: '/admin', key: 'admin.dashboard', end: true }],
  },
  {
    groupKey: 'admin.navContent',
    items: [
      { to: '/admin/tracks', key: 'admin.tracks' },
      { to: '/admin/albums', key: 'admin.albums' },
      { to: '/admin/artists', key: 'admin.artists' },
      { to: '/admin/lyrics', key: 'admin.lyrics' },
      { to: '/admin/playlists', key: 'admin.playlists' },
    ],
  },
  {
    groupKey: 'admin.navPeople',
    items: [{ to: '/admin/users', key: 'admin.users' }],
  },
  {
    groupKey: 'admin.navInsights',
    items: [{ to: '/admin/analytics', key: 'admin.analytics' }],
  },
  {
    groupKey: 'admin.navSystem',
    items: [{ to: '/admin/settings', key: 'admin.siteSettings' }],
  },
]

// "+ New" menu entries: Track has its own editor route; Album /
// Artist / Playlist open on their list page (inline editor there).
export const NEW_MENU_ITEMS = [
  { to: '/admin/tracks/new', key: 'admin.newTrack' },
  { to: '/admin/albums', key: 'admin.newAlbum' },
  { to: '/admin/artists', key: 'admin.newArtist' },
  { to: '/admin/playlists', key: 'admin.newPlaylist' },
]

const SECTION_LABEL_KEYS = {
  '/admin/tracks': 'admin.tracks',
  '/admin/albums': 'admin.albums',
  '/admin/artists': 'admin.artists',
  '/admin/lyrics': 'admin.lyrics',
  '/admin/playlists': 'admin.playlists',
  '/admin/users': 'admin.users',
  '/admin/analytics': 'admin.analytics',
  '/admin/settings': 'admin.siteSettings',
}

// Breadcrumb for an admin pathname. Returns crumbs in order; each is
// { labelKey, to } where `to` is the link target, or null for the
// current page (the last crumb). Unknown paths fall back to just
// Dashboard — the admin gate redirects those to /admin anyway.
export function getBreadcrumb(pathname) {
  // S8786: strip trailing slashes without a quantified regex — a
  // plain loop is provably linear and Sonar flags the /\/+$/ form.
  let path = String(pathname || '')
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  if (!path || path === '/') path = '/admin'
  const dashboard = { labelKey: 'admin.dashboard', to: '/admin' }
  if (path === '/admin') return [{ ...dashboard, to: null }]
  if (path === '/admin/tracks/new') {
    return [
      dashboard,
      { labelKey: 'admin.tracks', to: '/admin/tracks' },
      { labelKey: 'admin.crumbNewTrack', to: null },
    ]
  }
  if (/^\/admin\/tracks\/[^/]+\/edit$/.test(path)) {
    return [
      dashboard,
      { labelKey: 'admin.tracks', to: '/admin/tracks' },
      { labelKey: 'admin.crumbEditTrack', to: null },
    ]
  }
  const sectionKey = SECTION_LABEL_KEYS[path]
  if (sectionKey) return [dashboard, { labelKey: sectionKey, to: null }]
  return [{ ...dashboard, to: null }]
}
