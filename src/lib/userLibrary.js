import { supabase, isSupabaseConfigured } from './supabase.js'
import { resolveTrackDbIds } from './supabaseCatalog.js'

// Supabase sync for the user's library (item 8, 27 Nov 2026):
// likes, artist follows and user playlists sync to Supabase for
// signed-in users so they follow across devices. Guests stay
// local-only — localStorage is always the source of truth for the
// UI, and the remote is best-effort: any failure leaves the local
// data untouched (no data loss) and the app keeps working.
//
// Rules:
// - Sync runs ONLY for a real Supabase session with a uuid user id.
//   Guests never touch the remote.
// - If a table is missing (PGRST205 / 42P01 — migration 003 not
//   applied yet), remote sync switches off for the session and the
//   app stays local-only. Nothing is faked.
// - Write-through: toggleLiked / toggleFollow / playlist mutations
//   call syncLike / syncFollow / syncPlaylists (fire-and-forget).
// - Sign-in merge (syncAllOnSignIn): pull the remote library, union
//   it with the local one (local wins on a playlist conflict), then
//   push the local-only items. The module remembers the signed-in
//   user id (set by the merge, cleared on sign-out) so the
//   write-through calls need no user argument at the call site.
//
// Key names are duplicated here on purpose: this module must not
// import page components (Library.jsx / TrackRow.jsx own the keys;
// see the comments below). If a key ever changes, change it here too.
const LIKED_KEY = 'nandha-liked' // owned by src/components/TrackRow.jsx
const FOLLOWED_KEY = 'nandha-followed-artists' // owned by src/pages/Library.jsx
const USER_PLAYLISTS_KEY = 'nandha-user-playlists' // owned by src/pages/Library.jsx
const PLAYLIST_REMOTE_IDS_KEY = 'nandha-playlist-remote-ids' // local id -> remote uuid

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v)

let currentUserId = null
let remoteOff = false // set when a table is missing; stays off for the session
// M13: the sign-in merge runs a long await chain — without an abort
// signal a sign-out mid-merge let it keep writing the OLD user's
// library into localStorage (cross-account contamination). The merge
// owns one AbortController; clearSyncUser() aborts it, and every
// local write re-checks that the merge's user is still current.
let mergeController = null

/** True when the remote is usable for this user right now. */
export function isRemoteSyncOn(user) {
  const id = user?.id || currentUserId
  return (
    isSupabaseConfigured &&
    Boolean(supabase) &&
    isUuid(id) &&
    !remoteOff
  )
}

/** Abort the in-flight sign-in merge, if any. */
function abortMerge() {
  if (mergeController) {
    mergeController.abort()
    mergeController = null
  }
}

/** Throw when the merge was aborted or the user changed mid-merge. */
function throwIfMergeStale(signal, userId) {
  if (signal?.aborted || currentUserId !== userId) {
    throw new Error('merge-stale')
  }
}

function tableMissing(error) {
  const code = error?.code || ''
  const message = String(error?.message || '')
  return code === 'PGRST205' || code === '42P01' || /relation .* does not exist/i.test(message)
}

function readJsonSet(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function readJsonList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

function readPlaylistRemoteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAYLIST_REMOTE_IDS_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Reverse of resolveTrackDbIds: DB uuids -> UI slugs. The UI keys
 * likes and playlist tracks by slug (see supabaseCatalog.js — the
 * track `id` is its slug, the uuid lives in `dbId`), so a pull from
 * the remote must translate uuids back to slugs or the merged likes
 * would never match a track on this device. Unknown uuids pass
 * through unchanged (harmless — they match nothing locally).
 */
async function resolveTrackSlugs(uuids) {
  const out = new Map()
  const list = [...new Set((uuids || []).filter(Boolean))]
  if (list.length === 0 || !supabase) return out
  try {
    const { data, error } = await supabase
      .from('tracks')
      .select('id, slug')
      .in('id', list)
    if (!error && Array.isArray(data)) {
      for (const row of data) out.set(row.id, row.slug || row.id)
    }
  } catch {
    // offline — callers fall back to the uuids themselves
  }
  return out
}

/** Write one like through to liked_tracks (fire-and-forget). */
export async function syncLike(trackId, liked) {
  if (!isRemoteSyncOn() || !supabase) return { ok: false, reason: 'local-only' }
  try {
    const resolved = await resolveTrackDbIds([trackId])
    const uuid = resolved.get(trackId)
    if (!uuid) return { ok: false, reason: 'unresolved' }
    if (liked) {
      const { error } = await supabase
        .from('liked_tracks')
        .upsert({ user_id: currentUserId, track_id: uuid }, { onConflict: 'user_id,track_id' })
      if (error) {
        if (tableMissing(error)) remoteOff = true
        return { ok: false, reason: 'failed' }
      }
    } else {
      const { error } = await supabase
        .from('liked_tracks')
        .delete()
        .eq('user_id', currentUserId)
        .eq('track_id', uuid)
      if (error) {
        if (tableMissing(error)) remoteOff = true
        return { ok: false, reason: 'failed' }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** Write one follow through to followed_artists (fire-and-forget). */
export async function syncFollow(artistId, following) {
  if (!isRemoteSyncOn() || !supabase) return { ok: false, reason: 'local-only' }
  // Fallback-catalog artist ids are slugs, not uuids — those stay local.
  if (!isUuid(artistId)) return { ok: false, reason: 'local-only' }
  try {
    if (following) {
      const { error } = await supabase
        .from('followed_artists')
        .upsert({ user_id: currentUserId, artist_id: artistId }, { onConflict: 'user_id,artist_id' })
      if (error) {
        if (tableMissing(error)) remoteOff = true
        return { ok: false, reason: 'failed' }
      }
    } else {
      const { error } = await supabase
        .from('followed_artists')
        .delete()
        .eq('user_id', currentUserId)
        .eq('artist_id', artistId)
      if (error) {
        if (tableMissing(error)) remoteOff = true
        return { ok: false, reason: 'failed' }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

async function pushOnePlaylist(playlist, mapping) {
  const local = readJsonList(USER_PLAYLISTS_KEY)
  const mine = local.find((p) => String(p.id) === String(playlist.id))
  if (!mine) return
  const resolved = await resolveTrackDbIds(mine.trackIds || [])
  const trackUuids = (mine.trackIds || [])
    .map((id) => resolved.get(id))
    .filter(Boolean)
  let remoteId = mapping[String(mine.id)]
  if (!remoteId) {
    const { data, error } = await supabase
      .from('playlists')
      .insert({ title_en: mine.title || 'Playlist', owner_id: currentUserId, is_curated: false })
      .select('id')
      .single()
    if (error || !data?.id) {
      if (tableMissing(error)) remoteOff = true
      return
    }
    remoteId = data.id
    mapping[String(mine.id)] = remoteId
    writeJson(PLAYLIST_REMOTE_IDS_KEY, mapping)
  } else {
    const { error } = await supabase
      .from('playlists')
      .update({ title_en: mine.title || 'Playlist' })
      .eq('id', remoteId)
      .eq('owner_id', currentUserId)
    if (error) {
      if (tableMissing(error)) remoteOff = true
      return
    }
    const { error: deleteError } = await supabase.from('playlist_tracks').delete().eq('playlist_id', remoteId)
    // A failed delete must abort this playlist's push: the insert
    // below would conflict with the tracks that are still there.
    if (deleteError) {
      if (tableMissing(deleteError)) remoteOff = true
      return
    }
  }
  if (trackUuids.length > 0) {
    const { error } = await supabase.from('playlist_tracks').insert(
      trackUuids.map((trackId, i) => ({ playlist_id: remoteId, track_id: trackId, position: i })),
    )
    if (error && tableMissing(error)) remoteOff = true
  }
}

/** Push all local user playlists to the remote (fire-and-forget). */
export async function syncPlaylists() {
  if (!isRemoteSyncOn() || !supabase) return { ok: false, reason: 'local-only' }
  try {
    const mapping = readPlaylistRemoteIds()
    const local = readJsonList(USER_PLAYLISTS_KEY)
    for (const playlist of local) {
      if (remoteOff) break
      await pushOnePlaylist(playlist, mapping)
    }
    return { ok: !remoteOff, reason: remoteOff ? 'tables-missing' : undefined }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Sign-in merge: pull the remote library, union it with the local
 * one, then push the local-only items. Called once per sign-in (see
 * AppShell). Returns a summary; on any remote failure the local
 * data is left exactly as it was.
 */
export async function syncAllOnSignIn(user) {
  if (!isRemoteSyncOn(user) || !supabase) {
    currentUserId = null
    return { ok: false, reason: 'local-only' }
  }
  // A second sign-in cancels the first merge before starting its own.
  abortMerge()
  currentUserId = user.id
  const signal = new AbortController()
  mergeController = signal
  const summary = { likes: 0, follows: 0, playlists: 0 }
  try {
    // Likes: union remote + local, then push the local-only ones.
    // Remote ids are uuids; local ids are slugs — translate first.
    const { data: remoteLikes, error: likesError } = await supabase
      .from('liked_tracks')
      .select('track_id')
      .eq('user_id', user.id)
    throwIfMergeStale(signal.signal, user.id)
    if (likesError) {
      if (tableMissing(likesError)) remoteOff = true
      return { ok: false, reason: 'failed' }
    }
    const localLikes = readJsonSet(LIKED_KEY)
    const remoteLikeUuids = new Set((remoteLikes || []).map((r) => r.track_id))
    const slugByUuid = await resolveTrackSlugs([...remoteLikeUuids])
    const remoteLikeSlugs = new Set(
      [...remoteLikeUuids].map((u) => slugByUuid.get(u) || u),
    )
    const mergedLikes = new Set([...localLikes, ...remoteLikeSlugs])
    if (mergedLikes.size !== localLikes.size) {
      // M13: re-check the user immediately before every local write.
      throwIfMergeStale(signal.signal, user.id)
      writeJson(LIKED_KEY, [...mergedLikes])
      window.dispatchEvent(new CustomEvent('nandha-liked-changed'))
    }
    summary.likes = mergedLikes.size
    const localResolved = await resolveTrackDbIds([...localLikes])
    for (const [slug, uuid] of localResolved) {
      throwIfMergeStale(signal.signal, user.id)
      if (uuid && !remoteLikeUuids.has(uuid)) await syncLike(slug, true)
    }

    // Follows: same union, uuid ids only on the remote side.
    const { data: remoteFollows, error: followsError } = await supabase
      .from('followed_artists')
      .select('artist_id')
      .eq('user_id', user.id)
    throwIfMergeStale(signal.signal, user.id)
    if (followsError) {
      if (tableMissing(followsError)) remoteOff = true
      return { ok: false, reason: 'failed' }
    }
    const localFollows = readJsonSet(FOLLOWED_KEY)
    const remoteFollowIds = new Set((remoteFollows || []).map((r) => r.artist_id))
    const mergedFollows = new Set([...localFollows, ...remoteFollowIds])
    if (mergedFollows.size !== localFollows.size) {
      throwIfMergeStale(signal.signal, user.id)
      writeJson(FOLLOWED_KEY, [...mergedFollows])
      window.dispatchEvent(new CustomEvent('nandha-followed-changed'))
    }
    summary.follows = mergedFollows.size
    for (const id of localFollows) {
      throwIfMergeStale(signal.signal, user.id)
      if (isUuid(id) && !remoteFollowIds.has(id)) await syncFollow(id, true)
    }

    // Playlists: pull remote ones the device has never seen, then
    // push the local ones (local wins on a title/tracks conflict).
    const { data: remotePlaylists, error: playlistsError } = await supabase
      .from('playlists')
      .select('id, title_en, title_ta')
      .eq('owner_id', user.id)
      .eq('is_curated', false)
    throwIfMergeStale(signal.signal, user.id)
    if (playlistsError) {
      if (tableMissing(playlistsError)) remoteOff = true
      return { ok: false, reason: 'failed' }
    }
    const mapping = readPlaylistRemoteIds()
    const mappedRemoteIds = new Set(Object.values(mapping))
    const local = readJsonList(USER_PLAYLISTS_KEY)
    let changed = false
    for (const remote of remotePlaylists || []) {
      if (mappedRemoteIds.has(remote.id)) continue
      const { data: remoteTracks, error: remoteTracksError } = await supabase
        .from('playlist_tracks')
        .select('track_id, position')
        .eq('playlist_id', remote.id)
        .order('position')
      throwIfMergeStale(signal.signal, user.id)
      // A failed track read must NOT create an empty local copy: the
      // trailing syncPlaylists() would then delete the remote tracks
      // and insert nothing, wiping the playlist on both sides.
      // Skip this playlist and leave both sides untouched.
      if (remoteTracksError) {
        if (tableMissing(remoteTracksError)) remoteOff = true
        continue
      }
      // Remote track ids are uuids; local playlists store slugs.
      const remoteTrackUuids = (remoteTracks || []).map((r) => r.track_id)
      const trackSlugByUuid = await resolveTrackSlugs(remoteTrackUuids)
      const localId = `remote-${remote.id}`
      local.push({
        id: localId,
        title: remote.title_en || remote.title_ta || 'Playlist',
        description: '',
        cover: null,
        trackIds: remoteTrackUuids.map((u) => trackSlugByUuid.get(u) || u),
        isUser: true,
        createdAt: new Date().toISOString(),
      })
      mapping[localId] = remote.id
      changed = true
    }
    if (changed) {
      throwIfMergeStale(signal.signal, user.id)
      writeJson(USER_PLAYLISTS_KEY, local)
      writeJson(PLAYLIST_REMOTE_IDS_KEY, mapping)
      window.dispatchEvent(new CustomEvent('nandha-playlists-changed'))
    }
    summary.playlists = local.length
    throwIfMergeStale(signal.signal, user.id)
    await syncPlaylists()

    return { ok: true, ...summary }
  } catch (err) {
    // M13: aborted / superseded merges are not failures — they wrote
    // nothing after the user changed, which is the correct outcome.
    if (err?.message === 'merge-stale') return { ok: false, reason: 'aborted' }
    return { ok: false, reason: 'failed' }
  } finally {
    if (mergeController === signal) mergeController = null
  }
}

/** Sign-out: forget the sync user so later write-through calls stay local. */
export function clearSyncUser() {
  // M13: cancel any in-flight merge — its later writes must never
  // land after sign-out (cross-account contamination).
  abortMerge()
  currentUserId = null
}

/**
 * Orphan cleanup (#8/H11): drop liked ids that have no track in the
 * loaded catalog (deleted/renamed tracks). Callers must only call
 * this once the catalog has actually loaded — while it is still
 * loading, a Supabase-only id looks orphan and would be deleted.
 * Returns the removed ids (empty when nothing was pruned).
 */
export function pruneLikedIds(catalogIds) {
  const liked = readJsonSet(LIKED_KEY)
  const known = new Set((catalogIds || []).map((id) => String(id)))
  const removed = [...liked].filter((id) => !known.has(String(id)))
  if (removed.length === 0) return removed
  for (const id of removed) liked.delete(id)
  writeJson(LIKED_KEY, [...liked])
  window.dispatchEvent(new CustomEvent('nandha-liked-changed', { detail: { pruned: removed } }))
  return removed
}
