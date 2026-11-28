// Nandha Music — Supabase catalog READ layer (Phase 1 / B1).
//
// Public pages and the player read through this module, NOT through
// src/data/catalog.js directly. catalog.js is FALLBACK ONLY: when
// Supabase is unconfigured, unreachable, errors, or returns no rows,
// the static catalog (today's 1 real track) is used so the app keeps
// working offline.
//
// Shape: DB rows are mapped to the UI shape catalog.js already uses
// (titleEn/titleTa, artist, album, audio128/audio320, cover, ...).
// One deliberate difference: the UI `id` of a track is its `slug`
// ('vaazhvinil-orumurayenum'), because routes (/track/:id), likes,
// the persisted player queue and the admin localStorage overrides all
// key tracks by slug. The DB uuid lives in `dbId` and is used for
// writes, lyrics and playlist membership (see supabaseAdmin.js and
// resolveTrackDbIds()).
//
// RLS reminder (supabase/migrations/001_schema.sql): anon reads
// PUBLISHED rows only; a signed-in admin (user_roles row) reads all.
// The anon role ALSO needs table GRANTs (GRANT SELECT ... TO anon) —
// without them PostgREST answers 42501 and this module falls back to
// the static catalog instead of crashing.
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from './supabase.js'
import { cachedFetch } from './redisGuard.js'
import { queryClientOptions } from './cache.js'
import { cardCoverUrl } from './coverUrl.js'
import { foldForSearch, trackMatchesQuery } from './searchMatch.js'
import {
  tracks as fallbackTracks,
  albums as fallbackAlbums,
  artists as fallbackArtists,
  playlists as fallbackPlaylists,
  getDaypart,
  getTrack as getFallbackTrack,
  REAL_TRACK_ID,
} from '../data/catalog.js'

const QUERY_DEFAULTS = queryClientOptions?.defaultOptions?.queries ?? {}
const STALE_TIME = 5 * 60 * 1000

// In-memory cache for the small artists/albums tables: every catalog
// fetch joins against them, and without this each hook (tracks,
// albums, playlists, track detail) re-fetched both tables. Only
// successful non-empty reads are cached; failures always re-try.
// Cleared on every admin write (supabaseAdmin.invalidateAfterWrite).
const ROW_CACHE_TTL_MS = 5 * 60 * 1000
let artistsRowsCache = null // { at, rows }
let albumsRowsCache = null
export function clearCatalogRowCache() {
  artistsRowsCache = null
  albumsRowsCache = null
}

// Last source that served catalog data ('supabase' | 'fallback').
// Read-only diagnostic for smoke tests (window.nandhaCatalog, main.jsx).
let lastSource = 'fallback'
export function getCatalogSource() {
  return lastSource
}

// Admin shell subscription (admin redesign — shell): the env chip
// ("Live" / "Demo data" / "Checking…") needs to re-render when a
// fetch settles. setCatalogSource() is the single place that assigns
// lastSource — every fetcher below goes through it — and it notifies
// listeners on the first settle and on every flip (a repeat of the
// same value is not an update). A listener added after a fetch has
// settled is called immediately with the current source, so a shell
// that mounts late still shows the right chip instead of
// "Checking…" forever; before any fetch settles, nobody is called.
let catalogSourceSettled = false
const catalogSourceListeners = new Set()
export function setCatalogSource(value) {
  const next = value === 'supabase' ? 'supabase' : 'fallback'
  const changed = next !== lastSource
  const firstSettle = !catalogSourceSettled
  lastSource = next
  catalogSourceSettled = true
  if (changed || firstSettle) {
    for (const listener of [...catalogSourceListeners]) listener(next)
  }
}
export function onCatalogSourceChange(listener) {
  catalogSourceListeners.add(listener)
  if (catalogSourceSettled) listener(lastSource)
  return () => {
    catalogSourceListeners.delete(listener)
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value) {
  return UUID_RE.test(String(value || ''))
}

/**
 * URL slug for a Latin name/title ("Nandha Music" -> "nandha-music").
 * Tamil-only strings collapse to '' — callers fall back to the id.
 */
export function slugify(value) {
  // S8786: no quantified negated class — single-char replacement plus
  // split/filter/join collapses runs and trims edges with the same
  // result as the old /[^a-z0-9]+/g + /^-+|-+$/g pair.
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-')
}

/**
 * Resolve a route id that may be a DB uuid, a slug, or a slugified
 * name/title (B1/H8): /album/annamalaiyar and /artist/nandha-music
 * are the slugs the app itself links to, while the DB rows carry
 * uuids. Matches id first, then the mapped `slug`, then a slugified
 * name/title, so both forms keep working.
 */
export function findByIdOrSlug(list, idOrSlug) {
  const key = String(idOrSlug || '')
  if (!key) return null
  return (
    (list || []).find((item) => {
      if (!item) return false
      if (String(item.id) === key) return true
      if (item.slug === key) return true
      const names = [item.name, item.nameEn, item.nameTa, item.titleEn, item.titleTa, item.title]
      return names.some((n) => n && slugify(n) === key)
    }) || null
  )
}

// slug -> DB uuid, populated by every successful fetch. Used by
// cache.js flushPlays (play_events.track_id is a uuid FK) and by
// supabaseAdmin.js (playlist membership, lyrics).
const slugToDbId = new Map()
function registerTrackDbIds(list) {
  for (const tr of list || []) {
    if (tr?.slug && tr?.dbId) slugToDbId.set(tr.slug, tr.dbId)
    if (tr?.id && tr?.dbId) slugToDbId.set(tr.id, tr.dbId)
  }
}

/** Resolve UI track ids (slugs) to DB uuids. Unknown ids map to null. */
export async function resolveTrackDbIds(ids) {
  const out = new Map()
  const needLookup = []
  for (const id of ids || []) {
    if (!id) continue
    if (isUuid(id)) {
      out.set(id, id)
      continue
    }
    if (slugToDbId.has(id)) out.set(id, slugToDbId.get(id))
    else needLookup.push(id)
  }
  if (needLookup.length > 0 && supabase) {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('id, slug')
        .in('slug', needLookup)
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          slugToDbId.set(row.slug, row.id)
          out.set(row.slug, row.id)
        }
      }
    } catch {
      /* offline — unresolved ids stay null */
    }
  }
  for (const id of ids || []) {
    if (!out.has(id)) out.set(id, null)
  }
  return out
}

// ---------------------------------------------------------------------------
// Mappers — DB row -> UI shape (mirrors src/data/catalog.js exactly)
// ---------------------------------------------------------------------------
function mapArtist(row) {
  if (!row) return null
  return {
    id: row.id,
    // B1/H8: the route id is the slug ('nandha-music'); the DB id is
    // a uuid. Expose both so pages can link + resolve either form.
    slug: slugify(row.name) || slugify(row.name_ta) || row.id,
    name: row.name || '',
    nameEn: row.name || '',
    nameTa: row.name_ta || '',
    bioEn: row.bio_en || '',
    bioTa: row.bio_ta || '',
    socials: row.socials && typeof row.socials === 'object' ? row.socials : {},
    photo: null, // artists table has no photo column (see supabaseAdmin.js)
  }
}

function mapAlbum(row, artistsById = new Map()) {
  if (!row) return null
  const artist = artistsById.get(row.artist_id)
  return {
    id: row.id,
    slug: slugify(row.title_en) || slugify(row.title_ta) || row.id,
    titleEn: row.title_en || '',
    titleTa: row.title_ta || '',
    title: row.title_en || row.title_ta || '',
    artistId: row.artist_id || null,
    artist: artist?.name || '',
    genre: row.genre || '',
    cover: cardCoverUrl(row.cover_url),
    coverOg: row.cover_url || null,
    releaseDate: row.release_date || null,
    status: row.status || 'draft',
  }
}

export function mapTrack(row, artistsById = new Map(), albumsById = new Map()) {
  if (!row) return null
  const artist = artistsById.get(row.artist_id)
  const album = albumsById.get(row.album_id)
  const track = {
    id: row.slug || row.id,
    slug: row.slug || '',
    dbId: row.id,
    titleEn: row.title_en || '',
    titleTa: row.title_ta || '',
    artistId: row.artist_id || null,
    artist: artist?.name || '',
    composer: row.composer || '',
    lyricist: row.lyricist || '',
    albumId: row.album_id || null,
    album: album ? album.titleTa || album.titleEn || '' : '',
    genre: row.genre || '',
    language: row.language || 'Tamil',
    durationSec: Number(row.duration_sec) || 0,
    // Storage object paths (e.g. 'audio/vaazhvinil-orumurayenum.mp3'),
    // NEVER public URLs — playback mints signed URLs (signedAudio.js).
    audio128: row.audio_128_url || null,
    audio320: row.audio_320_url || null,
    // M1: cards/player get the 800px WebP variant; coverOg keeps the
    // original for OG/social. See src/lib/coverUrl.js.
    cover: cardCoverUrl(row.cover_url),
    coverOg: row.cover_url || null,
    status: row.status || 'draft',
    plays: Number(row.plays) || 0,
    releaseDate: row.release_date || null,
    // M2: hook timing, description and story now come from the DB
    // (002_gapfix_columns.sql) instead of hardcoded values.
    hookStartSec: row.hook_start_sec ?? 0,
    hookDurationSec: row.hook_duration_sec ?? 30,
    description: row.description || '',
    storyTa: row.story || '',
    storyEn: '',
    scheduledAt: row.scheduled_at || null,
    lyricsTa: [],
    lyricsEn: [],
    syncedLyrics: null,
  }
  // The seeded track's story lives only in the static catalog
  // until an admin fills the DB columns — carry it over so
  // Discover, Song of the Day and the player story card keep working.
  // DB values win when present; the fallback only fills gaps.
  // Lyrics are DB-owned (lyrics table): the fallback only fills the
  // gap when the track has no lines at all, and must never
  // overwrite DB lines (28 Nov 2026: the 4-line placeholder
  // overwrote the 40 DB lines in the editor and a save then
  // created a phantom English lyrics row).
  if (track.slug === REAL_TRACK_ID) {
    const fb = getFallbackTrack(REAL_TRACK_ID)
    if (fb) {
      if (!track.storyTa) track.storyTa = fb.storyTa
      if (!track.storyEn) track.storyEn = fb.storyEn
      track.storyCredit = fb.storyCredit
      if (track.lyricsTa.length === 0 && Array.isArray(fb.lyricsTa) && fb.lyricsTa.length > 0) {
        track.lyricsTa = fb.lyricsTa
      }
      if (track.lyricsEn.length === 0 && Array.isArray(fb.lyricsEn) && fb.lyricsEn.length > 0) {
        track.lyricsEn = fb.lyricsEn
      }
    }
  }
  return track
}

function mapPlaylist(row, tracksByDbId = new Map()) {
  if (!row) return null
  const trackIds = []
  for (const link of row.playlist_tracks || []) {
    const tr = tracksByDbId.get(link.track_id)
    if (tr) trackIds.push(tr.id)
  }
  return {
    id: row.id,
    titleEn: row.title_en || '',
    titleTa: row.title_ta || '',
    title: row.title_en || row.title_ta || '',
    descriptionEn: row.description_en || '',
    descriptionTa: row.description_ta || '',
    description: row.description_en || row.description_ta || '',
    cover: cardCoverUrl(row.cover_url),
    coverOg: row.cover_url || null,
    trackIds,
    is_curated: row.is_curated === true,
    isCurated: row.is_curated === true,
  }
}

// ---------------------------------------------------------------------------
// Raw fetchers — Supabase first, static fallback on any failure/empty.
// Each returns { list, source } internally; the exported fetch* helpers
// return just the list (fallback applied) for hook consumption.
// ---------------------------------------------------------------------------

// Track column lists. FULL includes the M2 columns from
// 002_gapfix_columns.sql; LEGACY is the pre-002 list. Until 002 is
// applied live, a FULL select fails with Postgres 42703 (undefined
// column) — queryTracks() retries once with LEGACY so the catalog
// keeps serving Supabase data instead of dropping to the static
// fallback. Writes do NOT retry: a missing column on save must fail
// loudly (see supabaseAdmin.js), never silently drop fields.
const TRACK_COLUMNS_FULL =
  'id, slug, title_en, title_ta, artist_id, album_id, composer, lyricist, genre, language, duration_sec, audio_128_url, audio_320_url, cover_url, status, plays, release_date, hook_start_sec, hook_duration_sec, description, story, scheduled_at'
const TRACK_COLUMNS_LEGACY =
  'id, slug, title_en, title_ta, artist_id, album_id, composer, genre, language, duration_sec, audio_128_url, audio_320_url, cover_url, status, plays, release_date'

/** Run a track query builder with the full column list, retrying once with the legacy list on 42703. */
async function queryTracks(build) {
  const first = await build(TRACK_COLUMNS_FULL)
  if (first.error?.code === '42703') {
    return build(TRACK_COLUMNS_LEGACY)
  }
  return first
}

async function fetchArtistsRows() {
  if (artistsRowsCache && Date.now() - artistsRowsCache.at < ROW_CACHE_TTL_MS) {
    return { rows: artistsRowsCache.rows, source: 'supabase' }
  }
  if (!isSupabaseConfigured || !supabase) return { rows: null, source: 'fallback' }
  const { data, error } = await supabase
    .from('artists')
    .select('id, name, name_ta, bio_en, bio_ta, socials')
    .order('name', { ascending: true })
  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.warn('[supabaseCatalog] artists read failed, using fallback:', error.message)
    return { rows: null, source: 'fallback' }
  }
  artistsRowsCache = { at: Date.now(), rows: data }
  return { rows: data, source: 'supabase' }
}

async function fetchAlbumsRows() {
  if (albumsRowsCache && Date.now() - albumsRowsCache.at < ROW_CACHE_TTL_MS) {
    return { rows: albumsRowsCache.rows, source: 'supabase' }
  }
  if (!isSupabaseConfigured || !supabase) return { rows: null, source: 'fallback' }
  const { data, error } = await supabase
    .from('albums')
    .select('id, title_en, title_ta, artist_id, genre, cover_url, release_date, status')
    .order('release_date', { ascending: false, nullsFirst: false })
  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.warn('[supabaseCatalog] albums read failed, using fallback:', error.message)
    return { rows: null, source: 'fallback' }
  }
  albumsRowsCache = { at: Date.now(), rows: data }
  return { rows: data, source: 'supabase' }
}

async function fetchTracksRows({ publishedOnly = true } = {}) {
  if (!isSupabaseConfigured || !supabase) return { rows: null, source: 'fallback' }
  const { data, error } = await queryTracks((columns) => {
    let query = supabase
      .from('tracks')
      .select(columns)
      .order('release_date', { ascending: false, nullsFirst: false })
    if (publishedOnly) query = query.eq('status', 'published')
    return query
  })
  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.warn('[supabaseCatalog] tracks read failed, using fallback:', error.message)
    return { rows: null, source: 'fallback' }
  }
  return { rows: data, source: 'supabase' }
}

/** Shared join context (artists + albums) for track/playlist mapping. */
async function fetchJoinContext() {
  const [artistsRes, albumsRes] = await Promise.all([fetchArtistsRows(), fetchAlbumsRows()])
  const artistsById = new Map()
  const albumsById = new Map()
  const artistList = artistsRes.rows
    ? artistsRes.rows.map(mapArtist)
    : [...fallbackArtists]
  const albumList = albumsRes.rows
    ? albumsRes.rows.map((r) => mapAlbum(r, new Map(artistList.map((a) => [a.id, a]))))
    : [...fallbackAlbums]
  for (const a of artistList) artistsById.set(a.id, a)
  for (const al of albumList) albumsById.set(al.id, al)
  return { artistsById, albumsById, artistList, albumList }
}

async function fetchArtists() {
  const { rows } = await fetchArtistsRows()
  const list = rows ? rows.map(mapArtist) : [...fallbackArtists]
  setCatalogSource(rows ? 'supabase' : 'fallback')
  return list
}

async function fetchAlbums() {
  const { artistsById } = await fetchJoinContext()
  const { rows } = await fetchAlbumsRows()
  const list = rows ? rows.map((r) => mapAlbum(r, artistsById)) : [...fallbackAlbums]
  setCatalogSource(rows ? 'supabase' : 'fallback')
  return list
}

async function fetchTracks({ publishedOnly = true } = {}) {
  const { artistsById, albumsById } = await fetchJoinContext()
  const { rows } = await fetchTracksRows({ publishedOnly })
  if (!rows) {
    setCatalogSource('fallback')
    return [...fallbackTracks].filter((t) => !publishedOnly || t.status === 'published')
  }
  setCatalogSource('supabase')
  const list = rows.map((r) => mapTrack(r, artistsById, albumsById))
  registerTrackDbIds(list)
  // H17: fetchTrack attached lyrics, fetchTracks did not — so the
  // player (which plays list tracks) showed "Lyrics coming soon"
  // even though the lyrics table has rows. One lyrics query for the
  // whole list; DB rows win, fallback lines stay when there are none.
  try {
    const lyricsByTrack = await fetchLyricsMap()
    for (const track of list) {
      const lyrics = lyricsByTrack.get(track.dbId)
      if (lyrics && (lyrics.ta.length > 0 || lyrics.en.length > 0)) {
        track.lyricsTa = lyrics.ta
        track.lyricsEn = lyrics.en
        track.syncedLyrics = lyrics.synced
      }
    }
  } catch {
    /* lyrics are optional — keep the fallback lines */
  }
  return list
}

async function fetchPlaylists({ admin = false } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    setCatalogSource('fallback')
    return [...fallbackPlaylists]
  }
  const { artistsById, albumsById } = await fetchJoinContext()
  const { rows: trackRows } = await fetchTracksRows({ publishedOnly: false })
  const tracksByDbId = new Map()
  if (trackRows) {
    for (const r of trackRows) {
      const mapped = mapTrack(r, artistsById, albumsById)
      tracksByDbId.set(r.id, mapped)
    }
    registerTrackDbIds([...tracksByDbId.values()])
  } else {
    for (const t of fallbackTracks) tracksByDbId.set(t.id, t)
  }
  let query = supabase
    .from('playlists')
    .select('id, title_en, title_ta, description_en, description_ta, cover_url, is_curated, playlist_tracks(track_id, position)')
    .order('created_at', { ascending: false })
  if (!admin) query = query.eq('is_curated', true)
  const { data, error } = await query
  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.warn('[supabaseCatalog] playlists read failed, using fallback:', error.message)
    setCatalogSource('fallback')
    return [...fallbackPlaylists]
  }
  setCatalogSource('supabase')
  return data.map((row) => {
    const ordered = [...(row.playlist_tracks || [])].sort((a, b) => (a.position || 0) - (b.position || 0))
    return mapPlaylist({ ...row, playlist_tracks: ordered }, tracksByDbId)
  })
}

/** One track by slug (public route id) or DB uuid, with lyrics attached.
 *  Exported for tests (see fetchTrack.test.js). */
export async function fetchTrack(idOrSlug) {
  if (!idOrSlug) return null
  const fb = getFallbackTrack(String(idOrSlug))
  if (!isSupabaseConfigured || !supabase) {
    setCatalogSource('fallback')
    return fb
  }
  const { artistsById, albumsById } = await fetchJoinContext()
  let row = null
  // L2: track each query's error separately. A plain "not found" miss
  // (no row, no error) must not warn, and an error on the first query
  // must not be reported when the second query finds the row.
  let firstError = null
  let secondError = null
  const first = await queryTracks((columns) =>
    supabase
      .from('tracks')
      .select(columns)
      .eq('slug', String(idOrSlug))
      .maybeSingle(),
  )
  if (!first.error) row = first.data
  else firstError = first.error
  if (!row && isUuid(idOrSlug)) {
    const second = await queryTracks((columns) =>
      supabase
        .from('tracks')
        .select(columns)
        .eq('id', String(idOrSlug))
        .maybeSingle(),
    )
    if (!second.error) row = second.data
    else secondError = second.error
  }
  if (!row && (firstError || secondError)) {
    console.warn(
      '[supabaseCatalog] track read failed, using fallback:',
      (firstError || secondError).message,
    )
    // M17: a query error is not a 404 — throw so React Query marks
    // the track query failed (one retry, then the error state) instead
    // of caching `undefined` as a successful result, which latched
    // the Track page on "No results found" for the 5-min staleTime
    // (live repro 28 Nov 2026: client-side nav showed the dead end
    // while the fetch was still in flight / had failed).
    throw firstError || secondError
  }
  if (!row) {
    // The DB answered and the track is simply absent (deleted) —
    // that is a 404, not an outage. Return null so the Track page
    // shows Not Found; the static fallback is only for when the DB
    // itself cannot be reached (28 Nov 2026: a deleted Vaazhvinil
    // still rendered its full page from the fallback catalog).
    setCatalogSource('supabase')
    return null
  }
  setCatalogSource('supabase')
  const track = mapTrack(row, artistsById, albumsById)
  registerTrackDbIds([track])
  // Lyrics (no rows seeded today — empty is fine, fallback lines stay).
  try {
    const lyrics = await fetchLyricsForTrack(row.id)
    if (lyrics.ta.length > 0 || lyrics.en.length > 0) {
      track.lyricsTa = lyrics.ta
      track.lyricsEn = lyrics.en
      track.syncedLyrics = lyrics.synced
    }
  } catch {
    /* lyrics are optional — keep the fallback lines */
  }
  return track
}

/** Shape raw lyrics rows (one track, any langs) into { ta, en, synced }. */
function shapeLyricsRows(rows) {
  const byLang = {}
  for (const row of rows || []) byLang[row.lang] = row
  const toTexts = (row) =>
    (Array.isArray(row?.lines) ? row.lines : [])
      .map((l) => (typeof l === 'string' ? l : l?.text || ''))
      .filter(Boolean)
  const ta = toTexts(byLang.ta)
  const en = toTexts(byLang.en)
  let synced = null
  const syncedRow = byLang.ta || byLang.en
  if (syncedRow?.synced) {
    const taLines = Array.isArray(byLang.ta?.lines) ? byLang.ta.lines : []
    const enLines = Array.isArray(byLang.en?.lines) ? byLang.en.lines : []
    synced = taLines.map((l, i) => ({
      t: typeof l?.startSec === 'number' ? l.startSec : null,
      ta: typeof l === 'string' ? l : l?.text || '',
      en: typeof enLines[i] === 'string' ? enLines[i] : enLines[i]?.text || null,
    })).filter((l) => l.ta || l.en)
    if (synced.length === 0) synced = null
  }
  return { ta, en, synced }
}

/** All lyrics rows, grouped by track DB uuid — one query for fetchTracks. */
async function fetchLyricsMap() {
  const out = new Map()
  if (!isSupabaseConfigured || !supabase) return out
  const { data, error } = await supabase
    .from('lyrics')
    .select('track_id, lang, lines, synced')
  if (error || !Array.isArray(data)) return out
  const byTrack = new Map()
  for (const row of data) {
    if (!row?.track_id) continue
    if (!byTrack.has(row.track_id)) byTrack.set(row.track_id, [])
    byTrack.get(row.track_id).push(row)
  }
  for (const [id, rows] of byTrack) out.set(id, shapeLyricsRows(rows))
  return out
}

/** Lyrics rows for a track DB uuid -> plain + synced shapes. */
export async function fetchLyricsForTrack(trackDbId) {
  const empty = { ta: [], en: [], synced: null }
  if (!trackDbId || !isSupabaseConfigured || !supabase) return empty
  const { data, error } = await supabase
    .from('lyrics')
    .select('lang, lines, synced')
    .eq('track_id', trackDbId)
  if (error || !Array.isArray(data)) return empty
  return shapeLyricsRows(data)
}

// ---------------------------------------------------------------------------
// React Query hooks (query keys match src/lib/cache.js invalidation)
// ---------------------------------------------------------------------------
export function useTracks({ publishedOnly = true, guardKey = null } = {}) {
  return useQuery({
    // A guarded query gets its own key: without the `cache` field it
    // collides with the plain ['tracks', {publishedOnly}] query that
    // PlayerContext / AartiAlarmWatcher mount globally, and React Query
    // runs only one queryFn for the shared key — the unguarded one —
    // so the guarded cachedFetch (and Redis) never executed at all.
    queryKey: ['tracks', { publishedOnly, ...(guardKey ? { cache: guardKey } : {}) }],
    queryFn: async () => {
      const loader = () => fetchTracks({ publishedOnly })
      if (guardKey) return cachedFetch(guardKey, loader, { ttlSeconds: 600, priority: 'high' })
      return loader()
    },
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
  })
}

export function useTrack(idOrSlug) {
  return useQuery({
    queryKey: ['track', idOrSlug],
    queryFn: () => fetchTrack(idOrSlug),
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
    enabled: Boolean(idOrSlug),
  })
}

export function useAlbums() {
  return useQuery({
    queryKey: ['albums'],
    queryFn: () => fetchAlbums(),
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
  })
}

export function useArtists() {
  return useQuery({
    queryKey: ['artists'],
    queryFn: () => fetchArtists(),
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
  })
}

export function usePlaylists({ admin = false } = {}) {
  return useQuery({
    queryKey: ['playlists', { admin }],
    queryFn: () => fetchPlaylists({ admin }),
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
  })
}

// ---------------------------------------------------------------------------
// List helpers over an already-loaded track list (same rules as
// catalog.js, but parameterised so pages use Supabase data, not the
// static module list). Song of the Day honours the admin localStorage
// override, exactly like catalog.js getSongOfTheDay.
// ---------------------------------------------------------------------------
export function searchTracksIn(list, query, { limit = 20 } = {}) {
  if (!foldForSearch(query)) return []
  const results = []
  for (const t of list || []) {
    if (t.status !== 'published') continue
    // Item 10: folded match — a Tamil query matches the Latin title
    // and a Latin query matches the Tamil title/album shown on cards.
    if (trackMatchesQuery(t, query)) {
      results.push(t)
      if (results.length >= limit) break
    }
  }
  return results
}

export function getDaypartTracksFrom(list, date = new Date()) {
  const part = getDaypart(date)
  return (list || [])
    .filter((t) => t.status === 'published' && part.genres.includes(t.genre))
    .slice(0, 20)
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function getDailyMixFrom(list, date = new Date(), limit = 20) {
  const published = (list || []).filter((t) => t.status === 'published')
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000)
  const rand = mulberry32(dayOfYear * 7919 + 13)
  const pool = [...published]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const mix = pool.slice(0, limit)
  const real = published.find((t) => t.id === REAL_TRACK_ID)
  if (real && !mix.some((t) => t.id === REAL_TRACK_ID)) mix[0] = real
  return mix
}

export function getSongOfTheDayFrom(list, date = new Date()) {
  try {
    const override = JSON.parse(localStorage.getItem('nandha-song-of-day') || 'null')
    if (override && override.date === date.toDateString()) {
      const t = (list || []).find((tr) => tr.id === override.trackId)
      if (t) return t
    }
  } catch { /* ignore */ }
  const devotionals = (list || []).filter((t) => t.status === 'published' && t.genre === 'Devotional')
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000)
  return devotionals[dayOfYear % devotionals.length]
    || (list || []).find((t) => t.id === REAL_TRACK_ID)
    || null
}
