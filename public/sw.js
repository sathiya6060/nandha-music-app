/* Nandha Music service worker.
 *
 * - Navigation (app shell): NETWORK-FIRST — fetch fresh, cache the fresh
 *   response, fall back to the cached shell ONLY when the network fails
 *   (offline). A stale shell can never be served while the network works,
 *   so every deployment reaches returning phones.
 * - Scripts / styles / fonts: cache-first (Vite hashes them), BUT only
 *   cache a response whose Content-Type matches the expected type. A
 *   response with an HTML content-type is NEVER cached under an asset
 *   URL — the old v1 worker cached Pages' SPA-fallback HTML under .js
 *   URLs, which then failed to parse and left a blank page.
 * - /sw.js and /version.json: network-first, NEVER cached.
 * - Covers / images: cache-first, capped at 200 entries / 30 days.
 * - API / metadata: network-first, short-lived cache fallback.
 * - Audio: ONLY user-pinned tracks are served from / stored in the
 *   'nandha-audio-v2' cache. Unpinned audio is fetched from the network
 *   and NEVER cached here (pinning is done by src/lib/pwa.js).
 * - Versioned cache names (v2); activation deletes every v1 cache, so
 *   the poisoned v1 entries are gone for good. skipWaiting + clients.claim.
 */

const SHELL_CACHE = 'nandha-shell-v2'
const API_CACHE = 'nandha-api-v2'
const AUDIO_CACHE = 'nandha-audio-v2'
const COVER_CACHE = 'nandha-covers-v2'

const MAX_COVERS = 200
const COVER_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const API_TTL_MS = 5 * 60 * 1000 // 5 minutes

const APP_SHELL = [
  '/',
  '/index.html',
  '/assets/nandha-logo.png',
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

/** Never cache /sw.js or /version.json — freshness checks must hit the network. */
function isFreshnessRequest(request) {
  const url = new URL(request.url)
  return (
    url.origin === self.location.origin &&
    (url.pathname === '/sw.js' || url.pathname === '/version.json')
  )
}

/**
 * Expected Content-Type for a cacheable asset, by destination/extension.
 * Returns null for "no cacheable asset type" (e.g. documents).
 * An HTML response is NEVER cacheable under an asset URL.
 */
function expectedAssetType(request) {
  const url = new URL(request.url)
  const path = url.pathname.toLowerCase()
  if (request.destination === 'script' || path.endsWith('.js') || path.endsWith('.mjs')) {
    return 'javascript'
  }
  if (request.destination === 'style' || path.endsWith('.css')) return 'css'
  if (
    request.destination === 'font' ||
    path.endsWith('.woff2') ||
    path.endsWith('.woff') ||
    path.endsWith('.ttf') ||
    path.endsWith('.otf')
  ) {
    return 'font'
  }
  if (request.destination === 'image' || isCoverRequest(request)) return 'image'
  return null
}

function isCacheableAssetResponse(request, response) {
  if (!response || !response.ok) return false
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  // Poison guard: HTML must never be stored under an asset URL.
  if (contentType.includes('text/html')) return false
  const expected = expectedAssetType(request)
  if (!expected) return false
  if (expected === 'javascript') return contentType.includes('javascript')
  if (expected === 'css') return contentType.includes('css')
  if (expected === 'font') {
    return (
      contentType.includes('font') ||
      contentType.includes('octet-stream') ||
      contentType.includes('x-font')
    )
  }
  if (expected === 'image') {
    return contentType.includes('image') || contentType.includes('svg')
  }
  return false
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

  // 0. Freshness files — always network, never cached.
  if (isFreshnessRequest(request)) {
    event.respondWith(fetch(request))
    return
  }

  // 1. Audio — pinned only. Serve from 'nandha-audio-v2' if pinned,
  //    otherwise go to network and DO NOT cache the response.
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
          if (isCacheableAssetResponse(request, response)) {
            cache.put(request, response.clone()).catch(() => {})
            trimCache(COVER_CACHE, MAX_COVERS)
          }
          return response
        } catch {
          // Offline + not cached: fall back to the app icon if it was a
          // cover-ish request, else rethrow.
          const fallback = await cache.match('/assets/nandha-logo.png')
          if (fallback) return fallback
          throw new Error('offline')
        }
      })(),
    )
    return
  }

  // 4. Navigation (app shell) — NETWORK-FIRST. Fetch fresh, cache the
  //    fresh shell, fall back to the cached shell ONLY when offline.
  //    This is what makes every deployment reach returning phones.
  if (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html'
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE)
        try {
          const response = await fetch(request)
          if (response.ok && url.origin === self.location.origin) {
            const contentType = (response.headers.get('content-type') || '').toLowerCase()
            if (contentType.includes('text/html')) {
              cache.put('/index.html', response.clone()).catch(() => {})
            }
          }
          return response
        } catch {
          const shell =
            (await cache.match(request, { ignoreSearch: true })) ||
            (await cache.match('/index.html'))
          if (shell) return shell
          throw new Error('offline')
        }
      })(),
    )
    return
  }

  // 5. Scripts / styles / fonts + anything else same-origin — cache-first
  //    (Vite hashes them), but ONLY for a matching Content-Type. An HTML
  //    response under an asset URL is never cached (poison guard).
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      const cached = await cache.match(request)
      if (cached) return cached
      try {
        const response = await fetch(request)
        if (
          response.ok &&
          url.origin === self.location.origin &&
          isCacheableAssetResponse(request, response)
        ) {
          cache.put(request, response.clone()).catch(() => {})
        }
        return response
      } catch {
        throw new Error('offline')
      }
    })(),
  )
})
