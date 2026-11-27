// Nandha Music — short-lived signed audio URLs (Spotify-like protection).
//
// The real track lives in a PRIVATE Supabase Storage bucket. The browser
// never sees a permanent audio URL: the player asks the get-audio-url
// Edge Function for a signed URL (300 s expiry) when playback starts, and
// refetches once if the URL expires mid-play.
//
// L3 (26 Nov 2026): the 1-second SILENT mp3 at /assets/vaazhvinil-
// orumurayenum.mp3 IS still in the Pages bundle — deliberately. The old
// public URL for that path used to serve the full song (cached at the
// edge for 7 days); the silent file is what keeps that URL harmless.
// Do NOT delete it in future builds — removing it would let the stale
// edge cache serve the song again.
//
// The anon key sent here is the public publishable key (safe in the
// client by design) — it only passes the Edge Function's JWT check.
// No secret ever leaves the server.

import { config, audioUrl } from './config.js'

/** The real tracks whose audio is served signed, never public.
 *  Keep in sync with ALLOWED_TRACKS in
 *  supabase/functions/get-audio-url/index.ts — a track added to one
 *  and not the other can never play (the client never asks the
 *  function) or is refused by it (403 track_not_allowed). */
const SIGNED_TRACK_FILES = new Set([
  'vaazhvinil-orumurayenum.mp3',
  'malaiyoram-veesiya-kaatre.mp3',
  'marakka-mudiyuma.mp3',
])

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

export function fileNameOf(track, quality = '128') {
  const localPath = quality === '320' ? track?.audio320 : track?.audio128
  if (!localPath) return ''
  return String(localPath).split('/').filter(Boolean).pop() || ''
}

/** True when this track's audio must come from a signed URL. */
export function isSignedTrack(track, quality = '128') {
  return SIGNED_TRACK_FILES.has(fileNameOf(track, quality))
}

/** Mint (or reuse a still-fresh) signed URL for a file name. */
async function getSignedAudioUrl(fileName) {
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

/** Drop every cached signed URL (stop: no track keeps a live URL). */
export function dropAllSignedAudioUrls() {
  for (const file of SIGNED_TRACK_FILES) cache.delete(file)
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
      // Demo mode (no Supabase configured): the signed file name is
      // also the local 1s silent mp3 at /assets/… — play that file
      // instead of failing with an empty src. The file is silence, so
      // nothing protected is exposed; production always has Supabase
      // configured, so this branch never runs there and the signed
      // path stays mandatory.
      if (!config.supabaseUrl) return audioUrl(track, quality)
      return null
    }
  }
  return audioUrl(track, quality)
}
