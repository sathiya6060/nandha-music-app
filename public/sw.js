/* Nandha Music service worker.
 *
 * - App shell + covers: cache-first ('nandha-shell-v1', covers capped at
 *   200 entries / 30 days).
 * - API / metadata: network-first, short-lived cache fallback.
 * - Audio: ONLY user-pinned tracks are served from / stored in the
 *   'nandha-audio' cache. Unpinned audio is fetched from the network and
 *   NEVER cached here (pinning is done by src/lib/pwa.js).
 * - Versioned cache names, skipWaiting + clients.claim.
 */

const SHELL_CACHE = 'nandha-shell-v1'
const API_CACHE = 'nandha-api-v1'
const AUDIO_CACHE = 'nandha-audio'
const COVER_CACHE = 'nandha-covers-v1'

const MAX_COVERS = 200
const COVER_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const API_TTL_MS = 5 * 60 * 1000 // 5 minutes

const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg',
]

// --- helpers ------------------------------------------------------------

function isAudioRequest(request) {
  const url = new URL(request.url)
  if (request.destination === 'audio') return true
  return /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(url.pathname)
}

function isCoverRequest(request) {
  if (request.destination === 'image') return true
  return /\.(png|jpe?g|webp|avif|svg)$/i.test(new URL(request.url).pathname)
}

function isApiRequest(request) {
  const url = new URL(request.url)
  return (
    url.pathname.startsWith('/api/') ||
    url.origin.includes('supabase.co') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/')
  )
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName)
    const keys = await cache.keys()
    if (keys.length <= maxEntries) return
    // Cache.keys() returns in insertion order — delete the oldest first.
    const excess = keys.slice(0, keys.length - maxEntries)
    await Promise.all(excess.map((key) => cache.delete(key)))
  } catch {
    /* trimming is best-effort */
  }
}

async function trimCoversByAge() {
  try {
    const cache = await caches.open(COVER_CACHE)
    const keys = await cache.keys()
    const now = Date.now()
    await Promise.all(
      keys.map(async (key) => {
        const res = await cache.match(key)
        const dateHeader = res?.headers.get('date')
        const storedAt = dateHeader ? Date.parse(dateHeader) : NaN
        if (Number.isFinite(storedAt) && now - storedAt > COVER_TTL_MS) {
          await cache.delete(key)
        }
      }),
    )
  } catch {
    /* best-effort */
  }
}

// --- lifecycle ----------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await cache.addAll(APP_SHELL)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const allowed = new Set([SHELL_CACHE, API_CACHE, AUDIO_CACHE, COVER_CACHE])
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => !allowed.has(name)).map((name) => caches.delete(name)),
      )
      await trimCoversByAge()
      await self.clients.claim()
    })(),
  )
})

// --- fetch routing ------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Only handle same-origin + Supabase origins; leave everything else alone.
  if (url.origin !== self.location.origin && !url.origin.includes('supabase.co')) {
    return
  }

  // 1. Audio — pinned only. Serve from 'nandha-audio' if pinned, otherwise
  //    go to network and DO NOT cache the response.
  if (isAudioRequest(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(AUDIO_CACHE)
        const pinned = await cache.match(request, { ignoreSearch: true })
        if (pinned) return pinned
        // Range requests (seeking) must hit the network directly.
        return fetch(request)
      })(),
    )
    return
  }

  // 2. API / metadata — network-first, 5-minute cache fallback.
  if (isApiRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) {
            const cache = await caches.open(API_CACHE)
            cache.put(request, response.clone()).catch(() => {})
          }
          return response
        } catch {
          const cache = await caches.open(API_CACHE)
          const cached = await cache.match(request)
          if (cached) {
            const dateHeader = cached.headers.get('date')
            const storedAt = dateHeader ? Date.parse(dateHeader) : NaN
            if (!Number.isFinite(storedAt) || Date.now() - storedAt < API_TTL_MS) {
              return cached
            }
          }
          throw new Error('offline')
        }
      })(),
    )
    return
  }

  // 3. Covers / images — cache-first, capped at 200 entries / 30 days.
  if (isCoverRequest(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(COVER_CACHE)
        const cached = await cache.match(request, { ignoreSearch: true })
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response.ok) {
            cache.put(request, response.clone()).catch(() => {})
            trimCache(COVER_CACHE, MAX_COVERS)
          }
          return response
        } catch {
          // Offline + not cached: fall back to the app icon if it was a
          // cover-ish request, else rethrow.
          const fallback = await cache.match('/favicon.svg')
          if (fallback) return fallback
          throw new Error('offline')
        }
      })(),
    )
    return
  }

  // 4. App shell + everything else same-origin — cache-first, then network.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      const cached = await cache.match(request, { ignoreSearch: true })
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (response.ok && url.origin === self.location.origin) {
          cache.put(request, response.clone()).catch(() => {})
        }
        return response
      } catch {
        if (request.mode === 'navigate') {
          const shell = await cache.match('/index.html')
          if (shell) return shell
        }
        throw new Error('offline')
      }
    })(),
  )
})
