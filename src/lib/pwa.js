/**
 * PWA helpers for Nandha Music.
 *
 * - registerServiceWorker(): registers /sw.js
 * - isInstallable / onInstallPrompt(): beforeinstallprompt capture
 * - cachePinnedTrack(track) / getPinnedTracks() / clearAudioCache():
 *   user-pinned audio only, Cache API ('nandha-audio'), max 50 entries
 *   LRU, 7-day TTL, never evicts the currently playing track.
 *
 * The currently playing track id is read from localStorage
 * ('nandha-now-playing-id'), written by PlayerContext.
 */

export const AUDIO_CACHE = 'nandha-audio-v2'
export const MAX_PINNED = 50
export const PIN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const META_KEY = 'nandha-pinned-meta'
const NOW_PLAYING_KEY = 'nandha-now-playing-id'

function readMeta() {
  try {
    const raw = localStorage.getItem(META_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeMeta(list) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable — cache still works, metadata is best-effort */
  }
}

function getNowPlayingId() {
  try {
    return localStorage.getItem(NOW_PLAYING_KEY)
  } catch {
    return null
  }
}

/** Resolve the best audio URL for a track (320 preferred for pinning). */
function audioUrlFor(track) {
  if (!track) return null
  return track.audio320 || track.audio128 || null
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return { ok: false, reason: 'service-worker-unsupported' }
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    // eslint-disable-next-line no-console
    console.log('[pwa] Service worker registered:', registration.scope)

    // Deploy freshness: when a NEW worker installs while an old one is
    // already controlling the page, reload ONCE so the fresh shell/chunks
    // take over instead of the stale cache. The flag guards against a
    // reload loop. `hadController` is captured BEFORE the new worker
    // takes over — controllerchange also fires on first install, when
    // there was no previous controller, and must NOT reload then.
    let reloading = false
    const hadController = Boolean(navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return
      reloading = true
      window.location.reload()
    })
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (!newWorker) return
      newWorker.addEventListener('statechange', () => {
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          // The new worker calls skipWaiting() on install, so it takes
          // over and the controllerchange handler above reloads once.
          // eslint-disable-next-line no-console
          console.log('[pwa] New service worker installed — updating')
        }
      })
    })

    return { ok: true, scope: registration.scope, registration }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[pwa] Service worker registration failed:', err)
    return { ok: false, reason: String(err?.message || err) }
  }
}

/* ------------------------------------------------------------------ */
/* Installability                                                      */
/* ------------------------------------------------------------------ */

let deferredPrompt = null
let installListeners = []

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the prompt so the app can show its own Install button later.
    event.preventDefault()
    deferredPrompt = event
    installListeners.forEach((fn) => {
      try {
        fn(true)
      } catch {
        /* ignore listener errors */
      }
    })
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installListeners.forEach((fn) => {
      try {
        fn(false)
      } catch {
        /* ignore */
      }
    })
  })
}

/** True once the browser has fired beforeinstallprompt (and not installed). */
export function isInstallable() {
  return deferredPrompt != null
}

/** Subscribe to installability changes. Returns an unsubscribe fn. */
export function onInstallPrompt(fn) {
  installListeners.push(fn)
  return () => {
    installListeners = installListeners.filter((f) => f !== fn)
  }
}

/** Show the deferred install prompt. Resolves true if the user accepted. */
export async function promptInstall() {
  if (!deferredPrompt) return false
  try {
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    const accepted = choice?.outcome === 'accepted'
    if (accepted) deferredPrompt = null
    return accepted
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Pinned audio (Cache API)                                            */
/* ------------------------------------------------------------------ */

/**
 * Pin a track's audio for offline playback.
 * Returns { ok, reason? }. Never pins sample tracks (no audio) and never
 * evicts the currently playing track.
 */
export async function cachePinnedTrack(track, opts = {}) {
  if (!track) return { ok: false, reason: 'no-track' }
  const url = audioUrlFor(track)
  if (!url) return { ok: false, reason: 'sample-track-no-audio' }
  if (!('caches' in window)) {
    return { ok: false, reason: 'cache-api-unsupported' }
  }
  const nowPlayingId = opts.currentTrackId || getNowPlayingId()
  try {
    const cache = await caches.open(AUDIO_CACHE)
    const already = await cache.match(url)
    const meta = readMeta().filter((m) => m.url !== url)
    const now = Date.now()

    if (!already) {
      const response = await fetch(url)
      if (!response.ok) {
        return { ok: false, reason: `fetch-failed-${response.status}` }
      }
      // Drop expired entries first, then enforce the 50-entry LRU cap.
      const live = meta.filter((m) => now - m.pinnedAt < PIN_TTL_MS)
      const evictable = live.filter((m) => String(m.trackId) !== String(nowPlayingId))
      while (live.length >= MAX_PINNED && evictable.length > 0) {
        const oldest = evictable.shift()
        const idx = live.indexOf(oldest)
        if (idx >= 0) live.splice(idx, 1)
        await cache.delete(oldest.url)
      }
      await cache.put(url, response)
      live.push({
        url,
        trackId: track.id,
        title: track.titleEn || track.titleTa || '',
        pinnedAt: now,
      })
      writeMeta(live)
    } else {
      // Refresh the pin timestamp (touch = most recently used).
      meta.push({
        url,
        trackId: track.id,
        title: track.titleEn || track.titleTa || '',
        pinnedAt: now,
      })
      writeMeta(meta)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) }
  }
}

/** List pinned tracks (newest first), pruning expired / missing entries. */
export async function getPinnedTracks() {
  if (!('caches' in window)) return []
  const now = Date.now()
  const meta = readMeta()
  const live = meta.filter((m) => now - m.pinnedAt < PIN_TTL_MS)
  if (live.length !== meta.length) writeMeta(live)
  try {
    const cache = await caches.open(AUDIO_CACHE)
    const keys = await cache.keys()
    const cachedUrls = new Set(keys.map((r) => r.url))
    const present = live.filter((m) => cachedUrls.has(new URL(m.url, location.origin).href))
    if (present.length !== live.length) writeMeta(present)
    return [...present].sort((a, b) => b.pinnedAt - a.pinnedAt)
  } catch {
    return [...live].sort((a, b) => b.pinnedAt - a.pinnedAt)
  }
}

/** Remove one pinned track from the audio cache. */
export async function unpinTrack(track) {
  const url = audioUrlFor(track)
  if (!url || !('caches' in window)) return false
  try {
    const cache = await caches.open(AUDIO_CACHE)
    await cache.delete(url)
    writeMeta(readMeta().filter((m) => m.url !== url))
    return true
  } catch {
    return false
  }
}

/** Is this track's audio already pinned? */
export async function isTrackPinned(track) {
  const url = audioUrlFor(track)
  if (!url || !('caches' in window)) return false
  try {
    const cache = await caches.open(AUDIO_CACHE)
    return Boolean(await cache.match(url))
  } catch {
    return false
  }
}

/** Clear the whole pinned-audio cache (keeps the currently playing track
 *  in memory only — the audio element keeps playing from its buffer). */
export async function clearAudioCache() {
  if (!('caches' in window)) return { ok: false, reason: 'cache-api-unsupported' }
  try {
    await caches.delete(AUDIO_CACHE)
    writeMeta([])
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) }
  }
}
