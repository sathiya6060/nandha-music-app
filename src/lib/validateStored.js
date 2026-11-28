// Schema validation for device-local (localStorage) data restored at
// startup (audit A3-6, 28 Nov 2026). Every JSON.parse site was already
// try/catch-guarded, but none validated shape: a tampered stored queue
// entry with a forged audio URL would be played, and admin overrides
// were spread over catalog tracks unchecked. Exploitation needs
// localStorage write access (same-origin script or physical device),
// so this is self-only (Low) — but cheap to close: validate shapes at
// the restore sites and drop what does not match. Anything dropped
// here is rebuilt from the catalog / Supabase on next use; nothing
// the user entered through the app UI is lost (the admin panel only
// ever saves flat fields of the types below).

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function isFlatPrimitive(value) {
  if (value === null) return true
  const t = typeof value
  if (t === 'string' || t === 'boolean') return true
  return t === 'number' && Number.isFinite(value)
}

// ---------------------------------------------------------------------------
// Player queue (PlayerContext readQueue / readUserQueue)
// ---------------------------------------------------------------------------
const QUEUE_STRING_FIELDS = ['audio128', 'audio320', 'cover', 'title', 'titleEn', 'artist', 'artistId', 'album', 'albumId', 'composer', 'genre', 'language']
const QUEUE_NUMBER_FIELDS = ['durationSec', 'duration', 'plays']

/** A restored queue entry must be a plain object with a non-empty string
 *  id, flat primitive values only, and the right types for any audio /
 *  cover / title / duration field present. Anything else is dropped,
 *  never played. */
export function isValidQueueEntry(entry) {
  if (!isPlainObject(entry) || !isNonEmptyString(entry.id)) return false
  for (const value of Object.values(entry)) {
    if (!isFlatPrimitive(value)) return false
  }
  for (const field of QUEUE_STRING_FIELDS) {
    if (entry[field] !== undefined && typeof entry[field] !== 'string') return false
  }
  for (const field of QUEUE_NUMBER_FIELDS) {
    if (entry[field] !== undefined && (typeof entry[field] !== 'number' || !Number.isFinite(entry[field]))) return false
  }
  return true
}

/** Keep only valid entries from a restored queue array. */
export function sanitizeQueue(entries) {
  if (!Array.isArray(entries)) return []
  return entries.filter(isValidQueueEntry)
}

// ---------------------------------------------------------------------------
// Admin overrides (adminStore getMergedTracks / Albums / Artists)
// ---------------------------------------------------------------------------
// Track override fields the admin panel ever saves (camelCase app shape;
// see src/data/catalog.js + the track editor). Unknown fields are
// dropped so a tampered stored object cannot smuggle nested payloads
// into a track. _tombstone / deletedAt are part of the soft-delete flow
// and must survive validation.
const TRACK_OVERRIDE_FIELDS = {
  id: 'string',
  title: 'string',
  titleEn: 'string',
  artist: 'string',
  artistId: 'string',
  composer: 'string',
  album: 'string',
  albumId: 'string',
  genre: 'string',
  language: 'string',
  cover: 'string',
  audio128: 'string',
  audio320: 'string',
  status: 'string',
  updatedAt: 'string',
  createdAt: 'string',
  deletedAt: 'string',
  durationSec: 'number',
  plays: 'number',
  _tombstone: 'boolean',
}

/** Strip unknown / wrongly-typed fields from a stored track override.
 *  Returns a cleaned copy, or null when the override is not a plain
 *  object with a non-empty string id. */
export function sanitizeTrackOverride(over) {
  if (!isPlainObject(over) || !isNonEmptyString(over.id)) return null
  const clean = { id: over.id }
  for (const [field, type] of Object.entries(TRACK_OVERRIDE_FIELDS)) {
    if (field === 'id') continue
    const value = over[field]
    if (value === undefined) continue
    if (type === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) clean[field] = value
    } else if (typeof value === type) {
      clean[field] = value
    }
  }
  return clean
}

/** Generic guard for admin overrides of other entities (albums,
 *  artists): plain object with a string id and flat primitive values
 *  only — nested objects/arrays are dropped with the field. */
export function sanitizeAdminOverride(over) {
  if (!isPlainObject(over) || !isNonEmptyString(over.id)) return null
  const clean = { id: over.id }
  for (const [field, value] of Object.entries(over)) {
    if (field === 'id') continue
    if (isFlatPrimitive(value)) clean[field] = value
  }
  return clean
}
