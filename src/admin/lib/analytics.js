// Admin redesign — dashboard / analytics / users / settings helpers.
//
// Pure functions only (no Supabase, no DOM, no localStorage) so they
// are unit-testable in Node. Used by Dashboard.jsx, Analytics.jsx and
// SiteSettings.jsx.

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function toDayKey(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isValidDate(value) {
  const d = new Date(value)
  return !Number.isNaN(d.getTime())
}

/**
 * Bucket play events into one bucket per day for the last `days`
 * days (today included, oldest first).
 * events: [{ played_at, count }] — count defaults to 1 when missing.
 * Returns [{ date: 'YYYY-MM-DD', plays }] — always `days` entries,
 * zero-filled. Events outside the window or with an unparseable
 * played_at are ignored (never counted, never thrown).
 */
export function bucketisePlaysByDay(events, days, now = new Date()) {
  const n = Math.max(1, Math.floor(days) || 1)
  const today = startOfDay(now)
  const buckets = []
  const byKey = new Map()
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * DAY_MS)
    const key = toDayKey(d)
    const bucket = { date: key, plays: 0 }
    buckets.push(bucket)
    byKey.set(key, bucket)
  }
  const earliest = buckets[0].date
  const latest = buckets[buckets.length - 1].date
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || !isValidDate(event.played_at)) continue
    const key = toDayKey(event.played_at)
    if (key < earliest || key > latest) continue
    const bucket = byKey.get(key)
    if (bucket) bucket.plays += Math.max(0, Number(event.count) || 1)
  }
  return buckets
}

export function totalPlays(buckets) {
  return (Array.isArray(buckets) ? buckets : []).reduce(
    (sum, b) => sum + (Number(b.plays) || 0),
    0,
  )
}

/**
 * Top tracks from raw play events.
 * events: [{ track_id, count }]; titlesById: Map<dbId|string, title>.
 * Returns [{ id, label, plays }] sorted by plays desc, capped at
 * `limit`. Rows whose track id has no known title are skipped —
 * a play for a deleted track must not appear as an unnamed row.
 */
export function aggregateTopTracks(events, titlesById, limit = 10) {
  const totals = new Map()
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || event.track_id == null) continue
    const id = String(event.track_id)
    totals.set(id, (totals.get(id) || 0) + Math.max(0, Number(event.count) || 1))
  }
  return [...totals.entries()]
    .filter(([id]) => titlesById instanceof Map && titlesById.has(id))
    .map(([id, plays]) => ({ id, label: titlesById.get(id), plays }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, Math.max(0, limit))
}

/**
 * "Needs attention" items for the Dashboard, derived from the merged
 * track objects (catalog shape: cover, audio128/audio320/audioName,
 * lyricsTa/lyricsEn, status, scheduledAt, releaseDate).
 *
 * Returns [{ kind, trackId, trackTitle }] where kind is one of
 * 'missing-cover' | 'missing-audio' | 'missing-lyrics' |
 * 'scheduled-soon'. One item per problem per track (a track missing
 * both cover and audio yields two rows — each links to the same
 * edit page, where both are fixed).
 *
 * Deliberately NOT included:
 * - "drafts older than 7 days": merged tracks carry no usable
 *   created/updated date (Supabase-mapped tracks have neither, the
 *   static catalog has none, local overrides do not stamp one), so
 *   age cannot be computed honestly.
 * - "failed uploads": no failed-upload log exists anywhere.
 */
export function deriveNeedsAttention(tracks, now = new Date()) {
  const items = []
  const nowMs = new Date(now).getTime()
  const weekMs = nowMs + 7 * DAY_MS
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!track || track.status === 'deleted') continue
    const title = track.titleTa || track.titleEn || track.id || 'Untitled'
    const id = track.id
    if (!track.cover) items.push({ kind: 'missing-cover', trackId: id, trackTitle: title })
    if (!track.audio128 && !track.audio320 && !track.audioName) {
      items.push({ kind: 'missing-audio', trackId: id, trackTitle: title })
    }
    const hasLyrics =
      (Array.isArray(track.lyricsTa) && track.lyricsTa.length > 0) ||
      (Array.isArray(track.lyricsEn) && track.lyricsEn.length > 0)
    if (!hasLyrics) items.push({ kind: 'missing-lyrics', trackId: id, trackTitle: title })
    if (track.status === 'scheduled') {
      const when = track.scheduledAt || track.releaseDate || null
      if (when && isValidDate(when)) {
        const whenMs = new Date(when).getTime()
        if (whenMs >= nowMs && whenMs <= weekMs) {
          items.push({ kind: 'scheduled-soon', trackId: id, trackTitle: title })
        }
      }
    }
  }
  return items
}

/**
 * Keys whose values differ between two flat settings objects.
 * Arrays/objects compare by JSON (pressPhotos); primitives by ===.
 * `updatedAt` is ignored — it is a save stamp, not a setting.
 */
export function changedFieldKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  const changed = []
  for (const key of keys) {
    if (key === 'updatedAt') continue
    const a = before?.[key]
    const b = after?.[key]
    const same =
      Array.isArray(a) || Array.isArray(b) || (a !== null && typeof a === 'object') || (b !== null && typeof b === 'object')
        ? JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
        : a === b
    if (!same) changed.push(key)
  }
  return changed
}
