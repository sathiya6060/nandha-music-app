// Rule-based mixes (Spotify F-009 behaviour, clean room: behaviour
// only, no Spotify code/assets/copy). Pure functions over an
// already-loaded track list — NO ML, NO fake data. With today's
// 1-track catalog every mix degrades gracefully: it contains the real
// track (or is honestly empty when the rules exclude it). Hidden
// tracks (see hiddenTracks.js) are excluded from every mix, and liked
// tracks train the Weekly Mix (PT-018).
import { getDailyMixFrom } from './supabaseCatalog.js'

export const MIX_IDS = {
  WEEKLY: 'weekly-mix',
  RADAR: 'release-radar',
  DAYLIST: 'daylist',
  DAILY: 'daily-mix',
}

/** Deterministic seeded shuffle (mulberry32) — a mix is stable inside
 *  its refresh window and rotates when the window changes. */
export function seededShuffle(list, seedStr) {
  let a = 0
  for (let i = 0; i < String(seedStr).length; i += 1) {
    a = (a * 31 + String(seedStr).charCodeAt(i)) >>> 0
  }
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pool = [...(list || [])]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

/** Published tracks minus hidden ones. Never invents tracks. */
export function visibleTracks(list, { hiddenIds } = {}) {
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds || [])
  return (list || []).filter(
    (t) => t && t.status === 'published' && !hidden.has(t.id),
  )
}

/** ISO week key 'YYYY-Www' — the Weekly Mix refresh window (Mondays). */
export function getWeekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day + 3) // Thursday of this week
  const firstThursday = new Date(d.getFullYear(), 0, 4)
  const firstDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3)
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000))
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Weekly Mix (Discover-Weekly-style, PT-002): refreshes Mondays.
 * Liked tracks first (liking trains the mix, PT-018), then the rest
 * of the catalog — seeded by ISO week so the order rotates weekly.
 * Cap 30 (Spotify's Discover Weekly size).
 */
export function getWeeklyMix(tracks, { likedIds, hiddenIds, date = new Date(), limit = 30 } = {}) {
  const visible = visibleTracks(tracks, { hiddenIds })
  const liked = likedIds instanceof Set ? likedIds : new Set(likedIds || [])
  const weekKey = getWeekKey(date)
  const likedTracks = seededShuffle(visible.filter((t) => liked.has(t.id)), `weekly-liked-${weekKey}`)
  const rest = seededShuffle(visible.filter((t) => !liked.has(t.id)), `weekly-rest-${weekKey}`)
  return [...likedTracks, ...rest].slice(0, limit)
}

/**
 * Release Radar (PT-003/021): refreshes Fridays. New releases (last
 * 21 days) from followed artists — or from all label artists when
 * nothing is followed. Falls back to the newest releases when nothing
 * is new, flagged via `isFallback` so the UI labels it honestly
 * ("Latest from Nandha Music") instead of pretending it is fresh.
 */
export function getReleaseRadar(
  tracks,
  { followedArtistIds, hiddenIds, date = new Date(), daysBack = 21, limit = 20 } = {},
) {
  const visible = visibleTracks(tracks, { hiddenIds })
  const followed = followedArtistIds instanceof Set ? followedArtistIds : new Set(followedArtistIds || [])
  const pool = followed.size > 0
    ? visible.filter((t) => followed.has(t.artistId) || followed.has(t.artist))
    : visible
  const now = date.getTime()
  const cutoff = now - daysBack * 86400000
  const fresh = pool
    .filter((t) => {
      const rel = t.releaseDate ? Date.parse(t.releaseDate) : NaN
      return Number.isFinite(rel) && rel <= now && rel >= cutoff
    })
    .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)))
  if (fresh.length > 0) return { tracks: fresh.slice(0, limit), isFallback: false }
  const newest = [...pool]
    .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')))
    .slice(0, limit)
  return { tracks: newest, isFallback: true }
}

/** Daylist windows (PT-004): the mix changes several times a day. */
export function getDaylistWindow(date = new Date()) {
  const h = date.getHours()
  if (h >= 5 && h < 8) return { key: 'early-morning', titleEn: 'Early Morning Devotional', titleTa: 'அதிகாலை பக்தி', genres: ['Devotional', 'Sivan', 'Siddhar'] }
  if (h >= 8 && h < 10) return { key: 'morning', titleEn: 'Morning Devotional', titleTa: 'காலை பக்தி', genres: ['Devotional', 'Sivan', 'Siddhar'] }
  if (h >= 10 && h < 14) return { key: 'midday', titleEn: 'Midday Melody', titleTa: 'மதிய மெலடி', genres: ['Melody'] }
  if (h >= 14 && h < 18) return { key: 'afternoon', titleEn: 'Afternoon Melody', titleTa: 'மதிய மெலடி', genres: ['Melody'] }
  if (h >= 18 && h < 21) return { key: 'evening', titleEn: 'Evening Love', titleTa: 'மாலை காதல்', genres: ['Love'] }
  if (h >= 21 && h < 24) return { key: 'night', titleEn: 'Night Calm', titleTa: 'இரவு அமைதி', genres: ['Melody', 'Devotional'] }
  return { key: 'late-night', titleEn: 'Late Night Calm', titleTa: 'இரவு அமைதி', genres: ['Melody', 'Devotional'] }
}

/**
 * Daylist (PT-004): the daypart's tracks, order seeded by the window
 * key so it changes when the window changes. Empty (with the window
 * title) when the catalog has nothing for this part of the day.
 */
export function getDaylist(tracks, { hiddenIds, date = new Date() } = {}) {
  const win = getDaylistWindow(date)
  const visible = visibleTracks(tracks, { hiddenIds })
  const pool = visible.filter((t) => win.genres.includes(t.genre))
  return { ...win, tracks: seededShuffle(pool, `daylist-${win.key}-${date.toDateString()}`) }
}

/**
 * Radio-lite candidates (PT-016/017, F-018): tracks similar to the
 * seed — same genre first, then same artist, then anything else.
 * Never returns the seed itself, hidden tracks, or excluded ids.
 * With a 1-track catalog this is honestly empty (no fake tracks).
 */
export function getRadioCandidates(tracks, seedTrack, { hiddenIds, excludeIds, limit = 5 } = {}) {
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds || [])
  const exclude = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || [])
  const pool = (tracks || []).filter(
    (t) =>
      t &&
      t.status === 'published' &&
      t.id !== seedTrack?.id &&
      !hidden.has(t.id) &&
      !exclude.has(t.id),
  )
  const byGenre = pool.filter((t) => seedTrack && t.genre && t.genre === seedTrack.genre)
  const byArtist = pool.filter(
    (t) => seedTrack && t.artist && t.artist === seedTrack.artist && !byGenre.includes(t),
  )
  const rest = pool.filter((t) => !byGenre.includes(t) && !byArtist.includes(t))
  const seedKey = `${seedTrack?.id || 'none'}-${new Date().toDateString()}`
  return [
    ...seededShuffle(byGenre, `radio-genre-${seedKey}`),
    ...seededShuffle(byArtist, `radio-artist-${seedKey}`),
    ...seededShuffle(rest, `radio-rest-${seedKey}`),
  ].slice(0, limit)
}

/** One entry point for the Made For You hub + Mix pages. */
export function buildMix(id, tracks, ctx = {}) {
  const date = ctx.date || new Date()
  if (id === MIX_IDS.WEEKLY) {
    return { id, tracks: getWeeklyMix(tracks, { ...ctx, date }) }
  }
  if (id === MIX_IDS.RADAR) {
    const { tracks: radarTracks, isFallback } = getReleaseRadar(tracks, { ...ctx, date })
    return { id, tracks: radarTracks, isFallback }
  }
  if (id === MIX_IDS.DAYLIST) {
    const daylist = getDaylist(tracks, { ...ctx, date })
    return { id, tracks: daylist.tracks, window: daylist }
  }
  // Daily Mix — the existing day-seeded rotation (supabaseCatalog).
  return { id: MIX_IDS.DAILY, tracks: getDailyMixFrom(tracks, date) }
}
