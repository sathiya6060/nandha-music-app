// Nandha Music — short-lived signed audio URLs (Spotify-like protection).
//
// The real track lives in a PRIVATE Supabase Storage bucket. The browser
// never sees a permanent audio URL: the player asks the get-audio-url
// Edge Function for a signed URL (300 s expiry) when playback starts, and
// refetches once if the URL expires mid-play. The permanent /assets mp3
// is gone from the Pages bundle, so there is no public file to share.
//
// The anon key sent here is the public publishable key (safe in the
// client by design) — it only passes the Edge Function's JWT check.
// No secret ever leaves the server.

import { config, audioUrl } from './config.js'

/** The one real track whose audio is served signed, never public. */
export const SIGNED_TRACK_FILE = 'vaazhvinil-orumurayenum.mp3'

const SIGNED_URL_TTL_MS = 300_000
// Reuse a cached URL until 60 s before expiry, so a play/pause or a
// quality switch inside one session does not mint a fresh URL each time.
const REUSE_CUTOFF_MS = 60_000

// fileName -> { url, fetchedAt }
const cache = new Map()

function functionUrl() {
  if (!config.supabaseUrl) return ''
  return `${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/get-audio-url`
}

function fileNameOf(track, quality = '128') {
  const localPath = quality === '320' ? track?.audio320 : track?.audio128
  if (!localPath) return ''
  return String(localPath).split('/').filter(Boolean).pop() || ''
}

/** True when this track's audio must come from a signed URL. */
export function isSignedTrack(track, quality = '128') {
  return fileNameOf(track, quality) === SIGNED_TRACK_FILE
}

/** Mint (or reuse a still-fresh) signed URL for a file name. */
export async function getSignedAudioUrl(fileName) {
  const url = functionUrl()
  if (!url) throw new Error('supabase_not_configured')
  const cached = cache.get(fileName)
  if (
    cached &&
    Date.now() - cached.fetchedAt < SIGNED_URL_TTL_MS - REUSE_CUTOFF_MS
  ) {
    return cached.url
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
    },
    body: JSON.stringify({ track: fileName }),
  })
  if (!res.ok) {
    const err = new Error(`signed_url_failed_${res.status}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  if (!data?.url) throw new Error('signed_url_empty')
  cache.set(fileName, { url: data.url, fetchedAt: Date.now() })
  return data.url
}

/** Drop a cached signed URL (after an expiry error, so the next fetch mints fresh). */
export function dropSignedAudioUrl(fileName) {
  cache.delete(fileName)
}

/**
 * Resolve the playable URL for a track. Async: the signed track is
 * fetched from the Edge Function; every other track falls back to the
 * synchronous audioUrl() (local file / R2). Returns null when the signed
 * URL cannot be minted — callers show "could not play" instead of
 * pointing the player at a dead link.
 *
 * NOTE: audioUrl() itself stays synchronous (it cannot await a network
 * fetch) — the player resolves through this function instead.
 */
export async function resolvePlayableUrl(track, quality = '128') {
  if (!track) return null
  if (isSignedTrack(track, quality)) {
    try {
      return await getSignedAudioUrl(fileNameOf(track, quality))
    } catch {
      return null
    }
  }
  return audioUrl(track, quality)
}
