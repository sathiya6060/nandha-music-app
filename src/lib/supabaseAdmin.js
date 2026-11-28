// Nandha Music — Supabase admin WRITES (Phase 1 / B1).
//
// Admin upserts/deletes go to the Supabase tables with the signed-in
// user's session. The client admin lock is the is_admin() RPC result
// (src/lib/auth.jsx calls supabase.rpc('is_admin') once per session;
// the email allowlist is only the fallback while that RPC is
// unavailable — see the contract in auth.jsx). RLS (user_roles) is
// still the real gate: every write below verifies rows were affected
// and throws 'No rows affected — check admin role/RLS' when a write
// silently affects 0 rows (e.g. the user_roles row is missing).
//
// Rules:
// - NEVER the service_role key: only the anon client (supabase.js).
// - Audio uploads go to the existing private bucket "audio"; the stored
//   audio_128_url/audio_320_url stay Storage object paths like
//   'audio/<file>.mp3', never public URLs (signed-URL playback stays).
// - Cover uploads go to bucket "covers" (exists; public). If the bucket
//   were missing, the caller gets a 'covers-bucket' error and the UI shows
//   "Covers bucket not set up yet — ask the admin to create it in
//   Supabase" instead of crashing.
// - The tracks/albums tables only accept status draft/scheduled/
//   published (DB check). UI-only 'unlisted' is stored as 'draft';
//   'deleted' is a hard delete (no deleted status in the DB).
// - The artists table has NO photo column; lyrics go to the `lyrics`
//   table; artist photos are returned so the caller can keep a local
//   override (see ArtistsAdmin). Tracks DO have hook/lyricist/
//   description/story/scheduled_at columns (002_gapfix_columns.sql);
//   featuredArtists deliberately has NO column — the editor shows a
//   "not stored yet" note instead of silently discarding it.
// - RLS: writes need a user_roles row with role 'admin' (set up in the
//   database). An RLS failure surfaces "Admin role not set up in the
//   database yet"; a missing table GRANT surfaces the permissions
//   message. Nothing fails silently, and a failed Supabase write NEVER
//   falls back to localStorage (that would fake a success).
import { supabase, isSupabaseConfigured } from './supabase.js'
import { invalidateCatalog } from './cache.js'
import { isUuid, resolveTrackDbIds, clearCatalogRowCache } from './supabaseCatalog.js'


// ---------------------------------------------------------------------------
// Admin role warning (M4) — a visible "admin role not set up" indicator
// in the admin shell. Set when an admin call fails with an RLS or
// permission error; cleared by the next successful admin write (i.e.
// once the user_roles row exists, it disappears by itself).
// ---------------------------------------------------------------------------
let roleWarning = false
const roleWarningListeners = new Set()

export function getAdminRoleWarning() {
  return roleWarning
}

/** Subscribe to role-warning changes; returns an unsubscribe function. */
export function onAdminRoleWarning(listener) {
  roleWarningListeners.add(listener)
  return () => roleWarningListeners.delete(listener)
}

function setAdminRoleWarning(value) {
  if (roleWarning === value) return
  roleWarning = value
  for (const fn of roleWarningListeners) fn(value)
}

// Called for every admin error surfaced to the UI. ONLY a genuine
// row-level-security failure raises the shell indicator (H5): a
// missing table GRANT (42501), a storage-bucket policy failure, or a
// network error is a different problem with its own message, and the
// flag clears when the error kind changes — a stale "role not set up"
// banner must never stick for the session.
let lastAdminErrorKind = null
function noteAdminErrorKind(kind) {
  if (kind === 'rls') {
    lastAdminErrorKind = 'rls'
    setAdminRoleWarning(true)
    return
  }
  if (lastAdminErrorKind === 'rls') setAdminRoleWarning(false)
  lastAdminErrorKind = kind
}

/** True when admin writes should go to Supabase (not localStorage). */
export function supabaseWritesEnabled() {
  return isSupabaseConfigured
}

/** Classify a Supabase/storage error for the admin UI. */
function classifySupabaseError(error) {
  const message = String(error?.message || error || '')
  const code = String(error?.code || '')
  if (code === 'audio-bucket-missing') {
    return { kind: 'audio-bucket', message }
  }
  if (/bucket not found/i.test(message) || /BucketNotFound/i.test(message)) {
    return { kind: 'covers-bucket', message }
  }
  // H5: a storage RLS failure (bucket policy) is NOT a missing admin
  // role — it gets its own message and never raises the role banner.
  // Storage uploaders tag these with code 'storage-rls' (see
  // uploadAudio/uploadCover); the message check covers errors that
  // arrive untagged.
  if (code === 'storage-rls') {
    return { kind: 'storage', message }
  }
  if (/row-level security/i.test(message)) {
    return { kind: 'rls', message }
  }
  // H5: 42501 / "permission denied for table" is a missing GRANT, not
  // a missing admin role. It keeps its own message (dbPermissionsMissing)
  // and must NOT raise the role banner.
  if (/permission denied for table/i.test(message) || code === '42501') {
    return { kind: 'permissions', message }
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return { kind: 'network', message }
  }
  return { kind: 'unknown', message }
}

/**
 * Localised admin-facing message for a failed write. `t` is the i18n
 * translate function; the raw detail is appended for unknown errors so
 * the admin can report it.
 */
export function adminErrorMessage(error, t) {
  const { kind, message } = classifySupabaseError(error)
  noteAdminErrorKind(kind)
  if (kind === 'rls') return t('admin.roleNotSetup')
  if (kind === 'covers-bucket') return t('admin.coversBucketMissing')
  if (kind === 'audio-bucket') return t('admin.audioBucketMissing')
  if (kind === 'permissions') return t('admin.dbPermissionsMissing')
  if (kind === 'storage') return message ? `${t('admin.saveFailed')} — ${message}` : t('admin.saveFailed')
  if (kind === 'network') return `${t('admin.saveFailed')} — ${message}`
  return message ? `${t('admin.saveFailed')} — ${message}` : t('admin.saveFailed')
}

export function adminDeleteErrorMessage(error, t) {
  const { kind, message } = classifySupabaseError(error)
  noteAdminErrorKind(kind)
  if (kind === 'rls') return t('admin.roleNotSetup')
  if (kind === 'permissions') return t('admin.dbPermissionsMissing')
  return message ? `${t('admin.deleteFailed')} — ${message}` : t('admin.deleteFailed')
}

/** Invalidate public + admin caches after a successful write. */
export async function invalidateAfterWrite(trackId) {
  clearCatalogRowCache()
  // A write succeeded, so the DB role/grants work — clear the warning.
  setAdminRoleWarning(false)
  lastAdminErrorKind = null
  await invalidateCatalog(trackId)
}

export const UPLOAD_TIMEOUT_MS = 60 * 1000 // C6: storage uploads never hang silently
export const SAVE_TIMEOUT_MS = 180 * 1000 // C6: overall TrackEditor save timeout

/**
 * Race a promise against a timeout. storage-js v2.119.2 upload() has
 * NO AbortSignal parameter (verified against the installed package),
 * so the timeout cannot abort the underlying fetch — it only stops
 * the UI waiting forever. That is safe here: audio uploads are
 * upsert:true (a late finish just overwrites the same path) and cover
 * uploads use a unique Date.now() path (a late finish leaves one
 * orphaned object, never a wrong cover).
 */
export function withTimeout(promise, ms, label) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label || 'Operation'} timed out after ${Math.round(ms / 1000)} seconds`)
      err.code = 'timeout'
      reject(err)
    }, ms)
  })
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer !== null) clearTimeout(timer)
    }),
    timeout,
  ])
}

// ---------------------------------------------------------------------------
// Row-count checks (pasted-report C3): a Supabase update/delete that
// RLS silently blocks returns 0 rows with NO error. Every admin
// write below verifies rows were affected and throws the same
// message, so the UI can never report "Deleted/Saved" for a no-op.
// ---------------------------------------------------------------------------
export const NO_ROWS_ERROR = 'No rows affected — check admin role/RLS'

function noRowsError() {
  return new Error(NO_ROWS_ERROR)
}

/**
 * `.select().single()` turns "0 rows" into a PGRST116 error. Map that
 * (and only that) to the no-rows message; any other error re-throws
 * unchanged. Returns the row on success.
 */
function singleRowOrThrow({ data, error }) {
  if (error) {
    if (error.code === 'PGRST116') throw noRowsError()
    throw error
  }
  if (!data) throw noRowsError()
  return data
}

/**
 * `.delete().select()` / `.update().select()` without .single():
 * the returned rows ARE the affected rows — 0 means RLS blocked it.
 * (One deliberate exception: the lyrics cleanup delete in
 * saveLyricsToSupabase — deleting lyrics that were never there is a
 * legitimate no-op, so it does not use this helper.)
 */
function rowsOrThrow({ data, error }) {
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) throw noRowsError()
  return data
}

function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || `track-${Date.now().toString(36)}`
}

function dbStatus(status) {
  const s = String(status || '').toLowerCase()
  return ['draft', 'scheduled', 'published'].includes(s) ? s : 'draft'
}

function extOf(file) {
  const name = String(file?.name || '')
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg'
}

/** Read an audio file's duration in the browser (null on failure). */
function getAudioDurationSec(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null)
    try {
      const url = URL.createObjectURL(file)
      const audio = new Audio()
      const done = (value) => {
        URL.revokeObjectURL(url)
        resolve(value)
      }
      const timer = setTimeout(() => done(null), 8000)
      audio.onloadedmetadata = () => {
        clearTimeout(timer)
        done(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : null)
      }
      audio.onerror = () => {
        clearTimeout(timer)
        done(null)
      }
      audio.src = url
    } catch {
      resolve(null)
    }
  })
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // 25 MB
const MAX_COVER_BYTES = 10 * 1024 * 1024 // 10 MB

function fileError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

/** L6: validate an audio file BEFORE any upload. Throws on bad type/size. */
export function validateAudioFile(file) {
  if (!file) throw fileError('invalid-type', 'Please choose an audio file (MP3).')
  const name = String(file.name || '').toLowerCase()
  const isAudio =
    String(file.type || '').startsWith('audio/') ||
    /\.(mp3|m4a|wav|ogg|flac)$/.test(name)
  if (!isAudio) throw fileError('invalid-type', 'Please choose an audio file (MP3).')
  if (file.size > MAX_AUDIO_BYTES) {
    const err = fileError('too-big', `File is too large (max ${MAX_AUDIO_BYTES / (1024 * 1024)} MB).`)
    err.maxLabel = `${MAX_AUDIO_BYTES / (1024 * 1024)} MB`
    throw err
  }
  return file
}

/** L6: validate a cover image BEFORE any upload. Throws on bad type/size. */
export function validateCoverFile(file) {
  if (!file) throw fileError('invalid-type', 'Please choose an image file.')
  const name = String(file.name || '').toLowerCase()
  const isImage =
    String(file.type || '').startsWith('image/') ||
    /\.(jpe?g|png|webp|gif)$/.test(name)
  if (!isImage) throw fileError('invalid-type', 'Please choose an image file.')
  if (file.size > MAX_COVER_BYTES) {
    const err = fileError('too-big', `File is too large (max ${MAX_COVER_BYTES / (1024 * 1024)} MB).`)
    err.maxLabel = `${MAX_COVER_BYTES / (1024 * 1024)} MB`
    throw err
  }
  return file
}

/**
 * M1: downscale a cover to max 800px wide WebP via canvas, so the
 * stored cover IS the small variant (cards/player never download a
 * 3000px original). Returns the downscaled File, or null when
 * conversion is unavailable/fails — the caller then uploads the
 * original instead of failing the save.
 */
async function downscaleCoverToWebP(file) {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 800 / bitmap.width)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, width, height)
    if (typeof bitmap.close === 'function') bitmap.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
    if (!blob) return null
    const base = String(file.name || 'cover').replace(/\.[^.]+$/, '') || 'cover'
    return new File([blob], `${base}.webp`, { type: 'image/webp' })
  } catch {
    return null
  }
}

async function resolveArtistId(artistIdOrName) {
  if (!artistIdOrName) return null
  if (isUuid(artistIdOrName)) return artistIdOrName
  const { data, error } = await supabase
    .from('artists')
    .select('id')
    .eq('name', String(artistIdOrName))
    .maybeSingle()
  if (!error && data?.id) return data.id
  return null
}

/**
 * M6: exact-match a row by value across several text fields, client
 * side. PostgREST `.or(title_en.eq.X,title_ta.eq.X)` parses commas as
 * filter separators, so a title like "Love, Devotional" produced a
 * malformed filter and resolved to null (or a duplicate row). Fetching
 * the small table and matching here is comma-proof. Exported for tests.
 */
export function matchRowByFields(rows, value, fields) {
  const wanted = String(value || '').trim()
  if (!wanted) return null
  for (const row of rows || []) {
    for (const field of fields) {
      if (String(row?.[field] || '').trim() === wanted) return row
    }
  }
  return null
}

async function resolveAlbumId(albumIdOrTitle) {
  if (!albumIdOrTitle) return null
  if (isUuid(albumIdOrTitle)) return albumIdOrTitle
  const { data, error } = await supabase
    .from('albums')
    .select('id, title_en, title_ta')
    .limit(500)
  if (error || !Array.isArray(data)) return null
  return matchRowByFields(data, albumIdOrTitle, ['title_en', 'title_ta'])?.id || null
}

/** Upload an mp3 to the private "audio" bucket. Returns the object path. */
async function uploadAudio(file, slug) {
  validateAudioFile(file)
  const path = `audio/${slug}.mp3`
  const { error } = await withTimeout(
    supabase.storage
      .from('audio')
      .upload(path, file, { upsert: true, contentType: file.type || 'audio/mpeg' }),
    UPLOAD_TIMEOUT_MS,
    'Audio upload',
  )
  if (error) {
    if (/bucket not found/i.test(error.message || '')) {
      const err = new Error('Audio bucket not found')
      err.code = 'audio-bucket-missing'
      throw err
    }
    if (/row-level security/i.test(error.message || '')) {
      // H5: tag storage RLS so the UI never blames the admin role.
      const err = new Error(error.message)
      err.code = 'storage-rls'
      throw err
    }
    throw error
  }
  return path
}

/**
 * Upload an image to the "covers" bucket. Returns the public URL.
 * Throws a 'covers-bucket' error when the bucket does not exist.
 * The file is downscaled to max 800px WebP first (M1); when that
 * fails the original is uploaded instead — never a failed save.
 */
export async function uploadCover(file, slug) {
  validateCoverFile(file)
  const uploadFile = (await downscaleCoverToWebP(file)) || file
  const path = `covers/${slug}-${Date.now()}.${extOf(uploadFile)}`
  const { error } = await withTimeout(
    supabase.storage.from('covers').upload(path, uploadFile, {
      upsert: false,
      contentType: uploadFile.type || 'image/jpeg',
    }),
    UPLOAD_TIMEOUT_MS,
    'Cover upload',
  )
  if (error) {
    if (/row-level security/i.test(error.message || '')) {
      // H5: tag storage RLS so the UI never blames the admin role.
      const err = new Error(error.message)
      err.code = 'storage-rls'
      throw err
    }
    throw error
  }
  const { data } = supabase.storage.from('covers').getPublicUrl(path)
  return data?.publicUrl || path
}

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------
/**
 * C7: read the stored audio URLs for a track, so an edit that does
 * not replace the audio keeps them. A local /assets/ path (or any
 * non-storage path) in the edit payload means "keep", never null —
 * nulling it would silently un-publish the track's audio.
 */
async function fetchExistingAudioUrls({ dbId, id, slug }) {
  try {
    let query = supabase.from('tracks').select('audio_128_url, audio_320_url')
    if (dbId || isUuid(id)) query = query.eq('id', dbId || id)
    else if (slug) query = query.eq('slug', slug)
    else return { audio128: null, audio320: null }
    const { data, error } = await query.maybeSingle()
    if (error || !data) return { audio128: null, audio320: null }
    return { audio128: data.audio_128_url || null, audio320: data.audio_320_url || null }
  } catch {
    return { audio128: null, audio320: null }
  }
}

export async function saveTrackToSupabase(uiTrack, { audioFile = null, coverFile = null } = {}) {
  const slug = uiTrack.slug || slugify(uiTrack.titleEn || uiTrack.titleTa)
  const isEdit = Boolean(uiTrack.dbId) || isUuid(uiTrack.id)

  let audioPath128 = uiTrack.audio128 || null
  let audioPath320 = uiTrack.audio320 || null
  // Storage paths only: a local /assets path or data URL is not an
  // object path. C7: on an edit without a new audio file, such a path
  // means "keep the stored audio" — read it from the DB instead of
  // nulling the track's audio (which silently broke playback).
  const isStoragePath = (v) => typeof v === 'string' && /^audio\//.test(v)
  if (!audioFile && (!isStoragePath(audioPath128) || !isStoragePath(audioPath320))) {
    const existing = await fetchExistingAudioUrls({ dbId: uiTrack.dbId, id: uiTrack.id, slug })
    if (!isStoragePath(audioPath128)) audioPath128 = existing.audio128
    if (!isStoragePath(audioPath320)) audioPath320 = existing.audio320
  }
  if (!isStoragePath(audioPath128)) audioPath128 = null
  if (!isStoragePath(audioPath320)) audioPath320 = null
  if (audioFile) {
    const path = await uploadAudio(audioFile, slug)
    audioPath128 = path
    audioPath320 = path
  }

  // M5: a track may NOT be published without audio. This check runs
  // before any DB work (fail fast) and before the cover upload.
  const wantPublish = dbStatus(uiTrack.status) === 'published'
  const hasAudio = Boolean(audioPath128 || audioPath320)
  if (wantPublish && !hasAudio) {
    throw new Error('Add an audio file before publishing')
  }

  let coverUrl = uiTrack.cover || null
  if (typeof coverUrl === 'string' && (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:'))) {
    // Data/blob URLs cannot be stored; re-upload instead.
    coverUrl = null
  }
  if (coverFile) coverUrl = await uploadCover(coverFile, slug)

  // Prefer a uuid id; a fallback string id ('nandha-music') is NOT a
  // DB id — resolve by display name instead.
  const artistId = isUuid(uiTrack.artistId)
    ? uiTrack.artistId
    : await resolveArtistId(uiTrack.artist || uiTrack.artistId)
  const albumId = isUuid(uiTrack.albumId)
    ? uiTrack.albumId
    : await resolveAlbumId(uiTrack.album || uiTrack.albumId)

  // M5: a track may NOT be published without audio (checked above,
  // before any DB work). Drafts keep the 180s placeholder below ONLY
  // as an invisible draft default — it never reaches listeners,
  // because publish requires real audio with a real duration (from
  // the file, or from the stored row on edit).
  let durationSec = Number(uiTrack.durationSec) || 0
  if (!durationSec && audioFile) durationSec = (await getAudioDurationSec(audioFile)) || 0
  if (!durationSec && wantPublish) {
    // Published and no duration could be read from the file or the
    // stored row — never show a fabricated duration to listeners.
    throw new Error('Could not read the audio duration — try another audio file')
  }
  if (!durationSec) durationSec = 180 // Draft-only placeholder (see M5 note above).

  const row = {
    slug,
    title_en: (uiTrack.titleEn || '').trim() || (uiTrack.titleTa || '').trim(),
    title_ta: (uiTrack.titleTa || '').trim() || null,
    artist_id: artistId,
    album_id: albumId,
    composer: (uiTrack.composer || '').trim() || null,
    // M2: these columns exist since 002_gapfix_columns.sql — they
    // used to be silently dropped on the Supabase path.
    lyricist: (uiTrack.lyricist || '').trim() || null,
    genre: uiTrack.genre || 'Melody',
    language: uiTrack.language || 'Tamil',
    duration_sec: durationSec,
    audio_128_url: audioPath128,
    audio_320_url: audioPath320,
    cover_url: coverUrl,
    status: dbStatus(uiTrack.status),
    release_date: uiTrack.releaseDate || null,
    hook_start_sec: Math.max(0, Number(uiTrack.hookStartSec) || 0),
    hook_duration_sec: Math.max(1, Number(uiTrack.hookDurationSec) || 30),
    description: (uiTrack.description || '').trim() || null,
    story: (uiTrack.storyTa || uiTrack.story || '').trim() || null,
    scheduled_at: uiTrack.scheduledAt || null,
  }
  if (!row.artist_id) {
    throw new Error('Artist not found in Supabase — pick an artist that exists in the database')
  }

  const TRACK_SELECT =
    'id, slug, title_en, title_ta, artist_id, album_id, composer, lyricist, genre, language, duration_sec, audio_128_url, audio_320_url, cover_url, status, plays, release_date, hook_start_sec, hook_duration_sec, description, story, scheduled_at'

  let saved
  if (isEdit) {
    // C3: .single() maps "0 rows affected" (RLS blocked the write)
    // to the no-rows error instead of a cryptic PGRST116.
    saved = singleRowOrThrow(
      await supabase
        .from('tracks')
        .update(row)
        .eq('id', uiTrack.dbId || uiTrack.id)
        .select(TRACK_SELECT)
        .single(),
    )
  } else {
    // New track: upsert on slug so a retry does not create a duplicate.
    saved = singleRowOrThrow(
      await supabase
        .from('tracks')
        .upsert(row, { onConflict: 'slug' })
        .select(TRACK_SELECT)
        .single(),
    )
  }

  // Plain-text lyrics from the editor -> lyrics table (ta + en rows).
  // M3: a lyrics failure is REPORTED (lyricsOk/lyricsError on the
  // returned object) — the editor shows a warning and stays on the
  // form instead of navigating away as if everything succeeded.
  const taLines = Array.isArray(uiTrack.lyricsTa) ? uiTrack.lyricsTa : []
  const enLines = Array.isArray(uiTrack.lyricsEn) ? uiTrack.lyricsEn : []
  let lyricsOk = true
  let lyricsError = null
  try {
    await saveLyricsToSupabase(saved.id, {
      ta: taLines,
      en: enLines,
      synced: false,
    })
  } catch (err) {
    lyricsOk = false
    lyricsError = err?.message || String(err)
    console.warn('[supabaseAdmin] lyrics save failed after track save:', lyricsError)
  }

  await invalidateAfterWrite(slug)
  return {
    id: saved.slug,
    slug: saved.slug,
    dbId: saved.id,
    titleEn: saved.title_en,
    titleTa: saved.title_ta,
    artistId: saved.artist_id,
    artist: uiTrack.artist || '',
    composer: saved.composer,
    lyricist: saved.lyricist || '',
    albumId: saved.album_id,
    album: uiTrack.album || '',
    genre: saved.genre,
    language: saved.language,
    durationSec: saved.duration_sec,
    audio128: saved.audio_128_url,
    audio320: saved.audio_320_url,
    cover: saved.cover_url,
    status: saved.status,
    plays: Number(saved.plays) || 0,
    releaseDate: saved.release_date,
    hookStartSec: saved.hook_start_sec ?? 0,
    hookDurationSec: saved.hook_duration_sec ?? 30,
    description: saved.description || '',
    storyTa: saved.story || '',
    scheduledAt: saved.scheduled_at || null,
    lyricsTa: taLines,
    lyricsEn: enLines,
    lyricsOk,
    lyricsError,
  }
}

export async function deleteTrackFromSupabase(uiTrack) {
  const column = uiTrack.dbId || isUuid(uiTrack.id) ? 'id' : 'slug'
  const value = uiTrack.dbId || uiTrack.id
  // C3: .select() proves the row was really deleted — an RLS-blocked
  // delete returns 0 rows with no error, which used to report success.
  rowsOrThrow(await supabase.from('tracks').delete().eq(column, value).select('id'))
  await invalidateAfterWrite(uiTrack.slug || uiTrack.id)
}

// ---------------------------------------------------------------------------
// Lyrics (synced or plain). lines: [{ time: 'mm:ss', ta, en }]
// ---------------------------------------------------------------------------
function timeToSec(time) {
  if (!time) return null
  const m = String(time).trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export async function saveLyricsToSupabase(trackDbId, { ta = [], en = [], lines = null, synced = false } = {}) {
  if (!trackDbId) throw new Error('No track selected')
  const taLines = lines
    ? lines.map((l) => ({ text: l.ta || '', startSec: timeToSec(l.time) }))
    : (Array.isArray(ta) ? ta : []).map((text) => ({ text: String(text), startSec: null }))
  const enLines = lines
    ? lines.map((l) => ({ text: l.en || '', startSec: timeToSec(l.time) }))
    : (Array.isArray(en) ? en : []).map((text) => ({ text: String(text), startSec: null }))
  const isSynced = synced || taLines.some((l) => l.startSec != null) || enLines.some((l) => l.startSec != null)

  for (const [lang, rows] of [['ta', taLines], ['en', enLines]]) {
    const cleaned = rows.filter((l) => l.text && l.text.trim())
    if (cleaned.length === 0) {
      // M3: a failed delete (e.g. RLS before the user_roles row
      // exists) must throw — the caller reports it instead of
      // showing success while old lyrics stay in place.
      const { error: deleteError } = await supabase
        .from('lyrics')
        .delete()
        .eq('track_id', trackDbId)
        .eq('lang', lang)
      if (deleteError) throw deleteError
      continue
    }
    // C3: .select() proves the upsert landed — an RLS-blocked upsert
    // returns 0 rows with no error.
    rowsOrThrow(
      await supabase
        .from('lyrics')
        .upsert(
          { track_id: trackDbId, lang, lines: cleaned, synced: isSynced },
          { onConflict: 'track_id,lang' },
        )
        .select('track_id'),
    )
  }
  await invalidateAfterWrite()
}

// Resolve a UI album/artist/playlist to its DB uuid by title/name.
// Needed when the UI only knows a fallback string id ('annamalaiyar')
// for a row that exists in Supabase under a uuid.
async function resolveAlbumDbId(uiAlbum) {
  if (isUuid(uiAlbum?.id)) return uiAlbum.id
  const title = (uiAlbum?.titleEn || uiAlbum?.titleTa || '').trim()
  if (!title) return null
  const { data, error } = await supabase
    .from('albums')
    .select('id, title_en, title_ta')
    .limit(500)
  if (error || !Array.isArray(data)) return null
  return matchRowByFields(data, title, ['title_en', 'title_ta'])?.id || null
}

async function resolveArtistDbId(uiArtist) {
  if (isUuid(uiArtist?.id)) return uiArtist.id
  const name = (uiArtist?.name || uiArtist?.nameTa || '').trim()
  if (!name) return null
  const { data, error } = await supabase
    .from('artists')
    .select('id, name, name_ta')
    .limit(500)
  if (error || !Array.isArray(data)) return null
  return matchRowByFields(data, name, ['name', 'name_ta'])?.id || null
}

async function resolvePlaylistDbId(uiPlaylist) {
  if (isUuid(uiPlaylist?.id)) return uiPlaylist.id
  const title = (uiPlaylist?.titleEn || uiPlaylist?.name || '').trim()
  if (!title) return null
  const { data } = await supabase
    .from('playlists')
    .select('id')
    .eq('title_en', title)
    .maybeSingle()
  return data?.id || null
}

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------
export async function saveAlbumToSupabase(uiAlbum, { coverFile = null, trackIds = [], trackIdsLoaded = true } = {}) {
  const title = (uiAlbum.titleEn || '').trim() || (uiAlbum.titleTa || '').trim()
  if (!title) throw new Error('An album title is required.')
  // C5: never save membership from a list that is not loaded yet —
  // the editor's 1-track fallback snapshot would null every real
  // member. Callers pass trackIdsLoaded=false while useTracks is
  // still loading; the save is refused instead of wiping membership.
  if (!trackIdsLoaded) {
    throw new Error('Track list is not loaded yet — wait for it to load, then save again.')
  }
  const albumId = await resolveAlbumDbId(uiAlbum)
  const isEdit = Boolean(albumId)
  let coverUrl = uiAlbum.cover || null
  if (typeof coverUrl === 'string' && (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:'))) coverUrl = null
  if (coverFile) coverUrl = await uploadCover(coverFile, slugify(uiAlbum.titleEn || uiAlbum.titleTa))

  const artistId = isUuid(uiAlbum.artistId)
    ? uiAlbum.artistId
    : await resolveArtistId(uiAlbum.artist || uiAlbum.artistId)
  const row = {
    title_en: title,
    title_ta: (uiAlbum.titleTa || '').trim() || null,
    artist_id: artistId,
    genre: uiAlbum.genre || null,
    cover_url: coverUrl,
    release_date: uiAlbum.releaseDate || null,
    status: dbStatus(uiAlbum.status || 'published'),
  }
  // M30: never silently reassign to the first artist alphabetically —
  // a missing artist is an error the admin must fix.
  if (!row.artist_id) {
    throw new Error('Artist not found in Supabase — pick an artist that exists in the database')
  }

  let saved
  if (isEdit) {
    saved = singleRowOrThrow(
      await supabase.from('albums').update(row).eq('id', albumId).select('id').single(),
    )
  } else {
    saved = singleRowOrThrow(
      await supabase.from('albums').insert(row).select('id').single(),
    )
  }

  // Track membership: tracks.album_id is the ordering source of truth
  // (albums have no trackIds column). Sync it to the editor's list.
  // M4: ids that cannot be resolved (e.g. RLS hides draft tracks
  // before the user_roles row exists) are returned as droppedTrackIds
  // so the UI can warn instead of silently dropping them.
  // L4: membership update failures are collected and thrown — the
  // album row itself saved, but the caller must know the sync failed.
  let droppedTrackIds = []
  if (Array.isArray(trackIds)) {
    const dbIds = await resolveTrackDbIds(trackIds)
    droppedTrackIds = trackIds.filter((id) => !dbIds.get(id))
    const wanted = new Set(trackIds.map((id) => dbIds.get(id)).filter(Boolean))
    const { data: current, error: currentError } = await supabase
      .from('tracks')
      .select('id')
      .eq('album_id', saved.id)
    if (currentError) throw currentError
    const membershipErrors = []
    for (const rowTrack of current || []) {
      if (!wanted.has(rowTrack.id)) {
        try {
          // C3: .select() proves the unassign landed; an RLS-blocked
          // update returns 0 rows with no error.
          rowsOrThrow(
            await supabase.from('tracks').update({ album_id: null }).eq('id', rowTrack.id).select('id'),
          )
        } catch {
          membershipErrors.push(rowTrack.id)
        }
      }
    }
    for (const dbId of wanted) {
      try {
        rowsOrThrow(
          await supabase.from('tracks').update({ album_id: saved.id }).eq('id', dbId).select('id'),
        )
      } catch {
        membershipErrors.push(dbId)
      }
    }
    if (membershipErrors.length > 0) {
      throw new Error(
        `Album saved, but membership could not be updated for ${membershipErrors.length} track(s)`,
      )
    }
  }

  await invalidateAfterWrite()
  return { ...uiAlbum, id: saved.id, cover: coverUrl, droppedTrackIds }
}

export async function deleteAlbumFromSupabase(uiAlbum) {
  const albumId = await resolveAlbumDbId(uiAlbum)
  if (!albumId) throw new Error('Album not found in Supabase')
  // C3: .select() proves the row was really deleted.
  rowsOrThrow(await supabase.from('albums').delete().eq('id', albumId).select('id'))
  await invalidateAfterWrite()
}

// ---------------------------------------------------------------------------
// Artists (no photo column — photo upload URL is returned for a local
// override; see ArtistsAdmin)
// ---------------------------------------------------------------------------
export async function saveArtistToSupabase(uiArtist, { photoFile = null } = {}) {
  const artistId = await resolveArtistDbId(uiArtist)
  const isEdit = Boolean(artistId)
  const socials = {}
  for (const [k, v] of Object.entries(uiArtist.socials || {})) {
    if (typeof v === 'string' && v.trim()) socials[k] = v.trim()
  }
  let photoUrl = null
  if (photoFile) photoUrl = await uploadCover(photoFile, slugify(uiArtist.name || uiArtist.nameTa))

  const row = {
    name: (uiArtist.name || '').trim() || (uiArtist.nameTa || '').trim(),
    name_ta: (uiArtist.nameTa || '').trim() || null,
    bio_en: (uiArtist.bioEn || '').trim() || null,
    bio_ta: (uiArtist.bioTa || '').trim() || null,
    socials,
  }
  let saved
  if (isEdit) {
    saved = singleRowOrThrow(
      await supabase.from('artists').update(row).eq('id', artistId).select('id').single(),
    )
  } else {
    saved = singleRowOrThrow(
      await supabase.from('artists').insert(row).select('id').single(),
    )
  }
  await invalidateAfterWrite()
  return { id: saved.id, photoUrl }
}

/**
 * Pasted-report C4: deleting an artist cascades (001 on delete
 * cascade) to ALL of their albums + tracks. Count the dependents
 * first — the caller shows the counts and must pass
 * { confirmCascade: true } (after a typed-name confirmation) before
 * the delete runs. Without it, a non-empty artist is never deleted.
 */
export async function countArtistDependents(uiArtist) {
  const artistId = await resolveArtistDbId(uiArtist)
  if (!artistId) return { artistId: null, albums: 0, tracks: 0 }
  const [albumsRes, tracksRes] = await Promise.all([
    supabase.from('albums').select('id').eq('artist_id', artistId),
    supabase.from('tracks').select('id').eq('artist_id', artistId),
  ])
  if (albumsRes.error) throw albumsRes.error
  if (tracksRes.error) throw tracksRes.error
  return {
    artistId,
    albums: Array.isArray(albumsRes.data) ? albumsRes.data.length : 0,
    tracks: Array.isArray(tracksRes.data) ? tracksRes.data.length : 0,
  }
}

export async function deleteArtistFromSupabase(uiArtist, { confirmCascade = false } = {}) {
  const { artistId, albums, tracks } = await countArtistDependents(uiArtist)
  if (!artistId) throw new Error('Artist not found in Supabase')
  if ((albums > 0 || tracks > 0) && !confirmCascade) {
    throw new Error(
      `Cannot delete this artist yet — ${albums} album(s) and ${tracks} track(s) still belong to them. Move or delete those first, or confirm the cascade by typing the artist name.`,
    )
  }
  // C3: .select() proves the row was really deleted.
  rowsOrThrow(await supabase.from('artists').delete().eq('id', artistId).select('id'))
  await invalidateAfterWrite()
}

// ---------------------------------------------------------------------------
// Playlists (curated; track order via playlist_tracks.position)
// ---------------------------------------------------------------------------
export async function savePlaylistToSupabase(uiPlaylist, { coverFile = null, trackIds = [], trackIdsLoaded = true } = {}) {
  // C5: same loaded-list guard as albums — an unloaded (empty) track
  // list must never wipe the playlist's membership.
  if (!trackIdsLoaded) {
    throw new Error('Track list is not loaded yet — wait for it to load, then save again.')
  }
  const playlistId = await resolvePlaylistDbId(uiPlaylist)
  const isEdit = Boolean(playlistId)
  let coverUrl = uiPlaylist.cover || null
  if (typeof coverUrl === 'string' && (coverUrl.startsWith('data:') || coverUrl.startsWith('blob:'))) coverUrl = null
  if (coverFile) coverUrl = await uploadCover(coverFile, slugify(uiPlaylist.titleEn || uiPlaylist.name))

  const { data: { user } } = await supabase.auth.getUser()
  const row = {
    title_en: (uiPlaylist.titleEn || uiPlaylist.name || '').trim(),
    title_ta: (uiPlaylist.titleTa || '').trim() || null,
    description_en: (uiPlaylist.descriptionEn || uiPlaylist.description || '').trim() || null,
    description_ta: (uiPlaylist.descriptionTa || '').trim() || null,
    cover_url: coverUrl,
    owner_id: user?.id || null,
    is_curated: true,
  }
  let saved
  if (isEdit) {
    saved = singleRowOrThrow(
      await supabase.from('playlists').update(row).eq('id', playlistId).select('id').single(),
    )
  } else {
    saved = singleRowOrThrow(
      await supabase.from('playlists').insert(row).select('id').single(),
    )
  }

  // M4: ids that cannot be resolved (e.g. RLS hides draft tracks
  // before the user_roles row exists) are returned as droppedTrackIds
  // so the UI can warn instead of silently dropping them.
  // C5: NEVER delete-all-then-insert. Insert/upsert the wanted rows
  // FIRST (positions included — playlist_tracks PK is
  // (playlist_id, track_id), so upsert also fixes moved positions),
  // THEN delete only the rows the admin actually removed. If the
  // insert fails, the old membership is still intact.
  let droppedTrackIds = []
  if (Array.isArray(trackIds)) {
    const dbIds = await resolveTrackDbIds(trackIds)
    droppedTrackIds = trackIds.filter((id) => !dbIds.get(id))
    const wanted = trackIds.map((id) => dbIds.get(id)).filter(Boolean)
    const { data: current, error: currentError } = await supabase
      .from('playlist_tracks')
      .select('track_id')
      .eq('playlist_id', saved.id)
    if (currentError) throw currentError
    const currentIds = new Set((current || []).map((r) => r.track_id))
    const wantedSet = new Set(wanted)
    const rows = wanted.map((track_id, i) => ({ playlist_id: saved.id, track_id, position: i }))
    if (rows.length > 0) {
      const upserted = rowsOrThrow(
        await supabase
          .from('playlist_tracks')
          .upsert(rows, { onConflict: 'playlist_id,track_id' })
          .select('track_id'),
      )
      if (upserted.length !== rows.length) {
        throw new Error(
          `Playlist saved, but only ${upserted.length} of ${rows.length} track(s) could be added`,
        )
      }
    }
    const toDelete = [...currentIds].filter((id) => !wantedSet.has(id))
    if (toDelete.length > 0) {
      const deleted = rowsOrThrow(
        await supabase
          .from('playlist_tracks')
          .delete()
          .eq('playlist_id', saved.id)
          .in('track_id', toDelete)
          .select('track_id'),
      )
      if (deleted.length !== toDelete.length) {
        throw new Error(
          `Playlist saved, but only ${deleted.length} of ${toDelete.length} removed track(s) could be deleted`,
        )
      }
    }
  }

  await invalidateAfterWrite()
  return { ...uiPlaylist, id: saved.id, cover: coverUrl, droppedTrackIds }
}

export async function deletePlaylistFromSupabase(uiPlaylist) {
  const playlistId = await resolvePlaylistDbId(uiPlaylist)
  if (!playlistId) throw new Error('Playlist not found in Supabase')
  // C3: .select() proves the row was really deleted.
  rowsOrThrow(await supabase.from('playlists').delete().eq('id', playlistId).select('id'))
  await invalidateAfterWrite()
}
