// Admin override store — localStorage-backed persistence for admin
// overrides (e.g. the artist photo, which has no DB column) and local
// reads (merged catalog, activity log, site settings, song of day).
// Admin writes go to Supabase (src/lib/supabaseAdmin.js); only the
// artist-photo override is still written here. Overrides are merged over
// the static catalog data (src/data/catalog.js) so the shipped catalog
// is never edited.
// Every mutating helper also fires cache invalidation (static import —
// S9: the dynamic import() used to be here, but cache.js is statically
// imported elsewhere, so it split nothing).
import { invalidateTrack, invalidateHome, invalidateSearch } from './cache.js'
import { sanitizeTrackOverride, sanitizeAdminOverride } from './validateStored.js'

// A3-6 (28 Nov 2026): validate stored overrides before merging — a
// tampered stored object must not smuggle unchecked fields into a
// track/album/artist. Invalid overrides are dropped, never merged.
function cleanOverrides(all, sanitize) {
  const clean = {}
  for (const [id, over] of Object.entries(all || {})) {
    const c = sanitize(over)
    if (c) clean[id] = c
  }
  return clean
}

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

function newId(prefix = 'admin') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`
  // No randomUUID (very old browser): use the CSPRNG getRandomValues —
  // never Math.random, which Sonar S2245 flags in security contexts.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${prefix}-${Date.now().toString(36)}-${hex}`
  }
  return `${prefix}-${Date.now().toString(36)}`
}

/** Best-effort cache invalidation. */
export async function invalidateCaches(trackId) {
  try {
    if (trackId && typeof invalidateTrack === 'function') {
      await invalidateTrack(trackId)
    }
    if (typeof invalidateHome === 'function') await invalidateHome()
    if (typeof invalidateSearch === 'function') await invalidateSearch()
  } catch {
    // Invalidation never blocks an admin write.
  }
}

// ---------------------------------------------------------------- tracks
function loadAdminTracks() {
  return readJson(KEYS.tracks, {})
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
  const overrides = cleanOverrides(loadAdminTracks(), sanitizeTrackOverride)
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
function loadAdminAlbums() {
  return readJson(KEYS.albums, {})
}

export function getMergedAlbums(baseAlbums = []) {
  const overrides = cleanOverrides(loadAdminAlbums(), sanitizeAdminOverride)
  const merged = baseAlbums.map((a) => (overrides[a.id] ? { ...a, ...overrides[a.id] } : a))
  const baseIds = new Set(baseAlbums.map((a) => a.id))
  for (const [id, over] of Object.entries(overrides)) {
    if (!baseIds.has(id)) merged.push(over)
  }
  return merged
}

// ---------------------------------------------------------------- artists
function loadAdminArtists() {
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

export function getMergedArtists(baseArtists = []) {
  const overrides = cleanOverrides(loadAdminArtists(), sanitizeAdminOverride)
  const merged = baseArtists.map((a) => (overrides[a.id] ? { ...a, ...overrides[a.id] } : a))
  const baseIds = new Set(baseArtists.map((a) => a.id))
  for (const [id, over] of Object.entries(overrides)) {
    if (!baseIds.has(id)) merged.push(over)
  }
  return merged
}

// ---------------------------------------------------------------- playlists
function loadAdminPlaylists() {
  return readJson(KEYS.playlists, {})
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

// ---------------------------------------------------------------- users
// No seeded users: the list starts empty and fills only with real
// accounts (26 Nov 2026 — dummy data removed per user instruction).
export function loadUsers() {
  const stored = readJson(KEYS.users, null)
  if (stored) return stored
  return []
}

export function saveUsers(users) {
  writeJson(KEYS.users, users)
  return users
}

// ---------------------------------------------------------------- activity log
// No seeded activity: the log starts empty and fills only with real
// admin actions (26 Nov 2026 — dummy data removed per user instruction).
export function getActivityLog() {
  const stored = readJson(KEYS.activity, null)
  if (stored) return stored
  return []
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
const DEFAULT_SITE_SETTINGS = {
  bioTa: '',
  bioEn: '',
  announcement: '',
  artistPickTrackId: '',
  pressPhotos: [],
  contactEmail: 'officialnandhamusic@gmail.com',
  // Link preview image (Admin → Site Settings): the image shown when the
  // site link is shared. Default is the brand OG card (1200x630).
  previewImage: '/assets/nandha-og.jpg',
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
