// Admin override store — localStorage-backed persistence for demo mode.
// All admin writes go through here. Overrides are merged over the static
// catalog data (src/data/catalog.js) so the shipped catalog is never edited.
// Every mutating helper also fires cache invalidation (best-effort: the
// cache module may not exist yet, so the dynamic import is swallowed).

const KEYS = {
  tracks: 'nandha-admin-tracks',
  albums: 'nandha-admin-albums',
  artists: 'nandha-admin-artists',
  playlists: 'nandha-admin-playlists',
  lyrics: 'nandha-admin-lyrics',
  users: 'nandha-admin-users',
  activity: 'nandha-activity-log',
  siteSettings: 'nandha-site-settings',
  noResultSearches: 'nandha-no-result-searches',
  songOfDay: 'nandha-song-of-day',
}

// Status values are lowercase in the catalog ('draft' | 'scheduled' |
// 'published' | 'unlisted' | 'deleted'). Labels come from the locale
// files via these keys — components call t(STATUS_LABEL_KEYS[status]).
export const STATUS_LABEL_KEYS = {
  draft: 'admin.statusDraft',
  scheduled: 'admin.statusScheduled',
  published: 'admin.statusPublished',
  unlisted: 'admin.statusUnlisted',
  deleted: 'admin.statusDeleted',
}

export const GENRE_LABEL_KEYS = {
  Devotional: 'admin.genreDevotional',
  Love: 'admin.genreLove',
  Melody: 'admin.genreMelody',
  Siddhar: 'admin.genreSiddhar',
  Sivan: 'admin.genreSivan',
}

export function normalizeStatus(status) {
  const v = String(status || '').toLowerCase()
  return STATUS_LABEL_KEYS[v] ? v : 'draft'
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    // localStorage quota (e.g. large data-URL photos) — keep the app alive.
    console.warn('[adminStore] localStorage write failed for', key, e)
  }
}

export function newId(prefix = 'admin') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

/** Best-effort cache invalidation. Safe when src/lib/cache.js is absent. */
export async function invalidateCaches(trackId) {
  try {
    const cache = await import('./cache.js')
    if (trackId && typeof cache.invalidateTrack === 'function') {
      await cache.invalidateTrack(trackId)
    }
    if (typeof cache.invalidateHome === 'function') await cache.invalidateHome()
    if (typeof cache.invalidateSearch === 'function') await cache.invalidateSearch()
  } catch {
    // cache.js not present yet — admin writes still persist locally.
  }
}

// ---------------------------------------------------------------- tracks
export function loadAdminTracks() {
  return readJson(KEYS.tracks, {})
}

/** Create or update one track override. Returns the saved track. */
export function saveAdminTrack(track) {
  const all = loadAdminTracks()
  const id = track.id || newId('track')
  const saved = { ...track, id, updatedAt: new Date().toISOString() }
  if (!track.createdAt) saved.createdAt = saved.updatedAt
  all[id] = saved
  writeJson(KEYS.tracks, all)
  return saved
}

/** Soft delete: status 'deleted' + deletedAt. Restorable via restoreAdminTrack. */
export function deleteAdminTrack(id) {
  const all = loadAdminTracks()
  const base = all[id]
  if (base) {
    all[id] = { ...base, status: 'deleted', deletedAt: new Date().toISOString() }
    writeJson(KEYS.tracks, all)
    return all[id]
  }
  // Track only exists in the static catalog: record a deletion tombstone.
  all[id] = { id, status: 'deleted', deletedAt: new Date().toISOString(), _tombstone: true }
  writeJson(KEYS.tracks, all)
  return all[id]
}

export function restoreAdminTrack(id) {
  const all = loadAdminTracks()
  const entry = all[id]
  if (!entry) return null
  if (entry._tombstone) {
    delete all[id]
  } else {
    const { deletedAt: _deletedAt, ...rest } = entry
    all[id] = { ...rest, status: rest.status === 'deleted' ? 'draft' : rest.status }
  }
  writeJson(KEYS.tracks, all)
  return all[id] || null
}

/**
 * Merge admin overrides over the static catalog tracks.
 * - Overrides replace / extend matching catalog tracks by id.
 * - Overrides with ids not in the catalog are appended (new tracks).
 * - Soft-deleted tracks are excluded unless includeDeleted is true.
 */
export function getMergedTracks(baseTracks = []) {
  const overrides = loadAdminTracks()
  const merged = []
  const seen = new Set()
  for (const base of baseTracks) {
    const over = overrides[base.id]
    if (over && over.status === 'deleted' && !over._tombstone) {
      // deleted override of a catalog track — drop it
      seen.add(base.id)
      continue
    }
    if (over && over._tombstone) {
      seen.add(base.id)
      continue
    }
    merged.push(over ? { ...base, ...over } : base)
    seen.add(base.id)
  }
  for (const [id, over] of Object.entries(overrides)) {
    if (seen.has(id)) continue
    if (over.status === 'deleted') continue
    merged.push(over)
  }
  return merged
}

// ---------------------------------------------------------------- albums
export function loadAdminAlbums() {
  return readJson(KEYS.albums, {})
}

export function saveAdminAlbum(album) {
  const all = loadAdminAlbums()
  const id = album.id || newId('album')
  const saved = { ...album, id, updatedAt: new Date().toISOString() }
  all[id] = saved
  writeJson(KEYS.albums, all)
  return saved
}

export function deleteAdminAlbum(id) {
  const all = loadAdminAlbums()
  delete all[id]
  writeJson(KEYS.albums, all)
}

export function getMergedAlbums(baseAlbums = []) {
  const overrides = loadAdminAlbums()
  const merged = baseAlbums.map((a) => (overrides[a.id] ? { ...a, ...overrides[a.id] } : a))
  const baseIds = new Set(baseAlbums.map((a) => a.id))
  for (const [id, over] of Object.entries(overrides)) {
    if (!baseIds.has(id)) merged.push(over)
  }
  return merged
}

// ---------------------------------------------------------------- artists
export function loadAdminArtists() {
  return readJson(KEYS.artists, {})
}

export function saveAdminArtist(artist) {
  const all = loadAdminArtists()
  const id = artist.id || newId('artist')
  const saved = { ...artist, id, updatedAt: new Date().toISOString() }
  all[id] = saved
  writeJson(KEYS.artists, all)
  return saved
}

export function deleteAdminArtist(id) {
  const all = loadAdminArtists()
  delete all[id]
  writeJson(KEYS.artists, all)
}

export function getMergedArtists(baseArtists = []) {
  const overrides = loadAdminArtists()
  const merged = baseArtists.map((a) => (overrides[a.id] ? { ...a, ...overrides[a.id] } : a))
  const baseIds = new Set(baseArtists.map((a) => a.id))
  for (const [id, over] of Object.entries(overrides)) {
    if (!baseIds.has(id)) merged.push(over)
  }
  return merged
}

// ---------------------------------------------------------------- playlists
export function loadAdminPlaylists() {
  return readJson(KEYS.playlists, {})
}

export function saveAdminPlaylist(playlist) {
  const all = loadAdminPlaylists()
  const id = playlist.id || newId('playlist')
  const saved = { ...playlist, id, updatedAt: new Date().toISOString() }
  all[id] = saved
  writeJson(KEYS.playlists, all)
  return saved
}

export function deleteAdminPlaylist(id) {
  const all = loadAdminPlaylists()
  delete all[id]
  writeJson(KEYS.playlists, all)
}

export function getMergedPlaylists(basePlaylists = []) {
  const overrides = loadAdminPlaylists()
  const merged = basePlaylists.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p))
  const baseIds = new Set(basePlaylists.map((p) => p.id))
  for (const [id, over] of Object.entries(overrides)) {
    if (!baseIds.has(id)) merged.push(over)
  }
  return merged
}

// ---------------------------------------------------------------- synced lyrics
export function loadSyncedLyrics() {
  return readJson(KEYS.lyrics, {})
}

/** lines: [{ time: 'mm:ss', ta: string, en: string }] */
export function saveSyncedLyrics(trackId, lines) {
  const all = loadSyncedLyrics()
  all[trackId] = { trackId, lines, updatedAt: new Date().toISOString() }
  writeJson(KEYS.lyrics, all)
  return all[trackId]
}

export function getSyncedLyrics(trackId) {
  const all = loadSyncedLyrics()
  return all[trackId]?.lines || null
}

// ---------------------------------------------------------------- users (demo)
export const SAMPLE_USERS = [
  { id: 'user-1', name: 'Sathiya', email: 'sathiya@nandhamusic.app', role: 'admin', blocked: false, joinedAt: '2026-11-20', plays: 1284 },
  { id: 'user-2', name: 'Siddha Guruji', email: 'guruji@nandhamusic.app', role: 'artist', blocked: false, joinedAt: '2026-11-21', plays: 0 },
  { id: 'user-3', name: 'Anitha', email: 'anitha@example.com', role: 'listener', blocked: false, joinedAt: '2026-11-22', plays: 342 },
  { id: 'user-4', name: 'Karthik', email: 'karthik@example.com', role: 'listener', blocked: false, joinedAt: '2026-11-24', plays: 187 },
  { id: 'user-5', name: 'Meena', email: 'meena@example.com', role: 'listener', blocked: true, joinedAt: '2026-11-25', plays: 96 },
]

export function loadUsers() {
  const stored = readJson(KEYS.users, null)
  if (stored) return stored
  writeJson(KEYS.users, SAMPLE_USERS)
  return SAMPLE_USERS
}

export function saveUsers(users) {
  writeJson(KEYS.users, users)
  return users
}

// ---------------------------------------------------------------- activity log
const SEED_ACTIVITY = [
  { id: 'act-seed-1', at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), actor: 'Sathiya', action: 'Published track', detail: 'Vaazhvinil Orumurayenum' },
  { id: 'act-seed-2', at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(), actor: 'Sathiya', action: 'Updated site settings', detail: 'Announcement banner text' },
  { id: 'act-seed-3', at: new Date(Date.now() - 1000 * 60 * 60 * 49).toISOString(), actor: 'Siddha Guruji', action: 'Edited lyrics', detail: 'Marakka Mudiyuma — synced lines' },
]

export function getActivityLog() {
  const stored = readJson(KEYS.activity, null)
  if (stored) return stored
  writeJson(KEYS.activity, SEED_ACTIVITY)
  return SEED_ACTIVITY
}

/** entry: { actor, action, detail } — at/id filled in automatically. */
export function logActivity(entry) {
  const log = getActivityLog()
  const full = { id: newId('act'), at: new Date().toISOString(), ...entry }
  const next = [full, ...log].slice(0, 100)
  writeJson(KEYS.activity, next)
  return full
}

// ---------------------------------------------------------------- site settings
export const DEFAULT_SITE_SETTINGS = {
  bioTa: '',
  bioEn: '',
  announcement: '',
  artistPickTrackId: '',
  pressPhotos: [],
  contactEmail: 'officialnandhamusic@gmail.com',
}

export function loadSiteSettings() {
  return { ...DEFAULT_SITE_SETTINGS, ...readJson(KEYS.siteSettings, {}) }
}

export function saveSiteSettings(settings) {
  const saved = { ...loadSiteSettings(), ...settings, updatedAt: new Date().toISOString() }
  writeJson(KEYS.siteSettings, saved)
  return saved
}

// ---------------------------------------------------------------- song of the day
// Matches catalog.js getSongOfTheDay: { date: today.toDateString(), trackId }.
// The override wins only when its date is today.
export function loadSongOfDay() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.songOfDay) || 'null')
  } catch {
    return null
  }
}

export function saveSongOfDay(trackId, date = new Date()) {
  const value = { date: date.toDateString(), trackId }
  try {
    localStorage.setItem(KEYS.songOfDay, JSON.stringify(value))
  } catch {
    // storage unavailable — caller still shows the pick for this session
  }
  return value
}

// ---------------------------------------------------------------- no-result searches
export function getNoResultSearches() {
  return readJson(KEYS.noResultSearches, [])
}

export function recordNoResultSearch(query) {
  const list = getNoResultSearches()
  const q = String(query || '').trim()
  if (!q) return list
  const existing = list.find((e) => e.query.toLowerCase() === q.toLowerCase())
  if (existing) {
    existing.count += 1
    existing.lastAt = new Date().toISOString()
  } else {
    list.push({ query: q, count: 1, lastAt: new Date().toISOString() })
  }
  writeJson(KEYS.noResultSearches, list)
  return list
}

export { KEYS as ADMIN_STORAGE_KEYS }
