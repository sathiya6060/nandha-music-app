/**
 * Nandha Music — 5-layer free caching.
 *
 * Layers (cheapest / fastest first):
 *   1. In-memory Map cache with TTL (this module)
 *   2. localStorage cache for lists (versioned, survives reload)
 *   3. Upstash Redis via REST (shared across devices; no-op when unconfigured)
 *   4. React Query defaults (`queryClientOptions`) — staleTime per query type
 *   5. Supabase / R2 origin (the source of truth; reached only on a miss)
 *
 * Every layer fails gracefully: a missing/unconfigured layer is skipped,
 * never throws, and the caller still gets data from the next layer down.
 * Nothing here stores credentials — the Upstash token comes from env
 * (see src/lib/config.js) and is only ever sent to the configured REST URL.
 */
import { config, isRedisConfigured } from './config.js';
import { supabase } from './supabase.js';

// ---------------------------------------------------------------------------
// TTLs
// ---------------------------------------------------------------------------
export const TTL = {
  homeFeedMs: 10 * 60 * 1000, // 10 min
  searchMs: 5 * 60 * 1000, // 5 min
  trackDetailMs: 60 * 60 * 1000, // 1 hr
  listsMs: 5 * 60 * 1000, // 5 min (localStorage lists)
};

export const CACHE_VERSION = 'nandha-cache-v1';
const LS_PREFIX = `${CACHE_VERSION}:`;

// ---------------------------------------------------------------------------
// Layer 1 — in-memory Map cache with TTL
// ---------------------------------------------------------------------------
const memoryCache = new Map(); // key -> { value, expiresAt }

export function memoryGet(key) {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function memorySet(key, value, ttlMs = TTL.homeFeedMs) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function memoryDelete(key) {
  memoryCache.delete(key);
}

export function memoryClear(prefix = '') {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}

/** Get-or-fetch helper: memory first, then `fetcher()`, then store. */
export async function memoryCached(key, fetcher, ttlMs = TTL.homeFeedMs) {
  const hit = memoryGet(key);
  if (hit !== undefined) return hit;
  const value = await fetcher();
  memorySet(key, value, ttlMs);
  return value;
}

// ---------------------------------------------------------------------------
// Layer 2 — localStorage cache for lists (versioned)
// ---------------------------------------------------------------------------
function lsAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

function lsKey(key) {
  return `${LS_PREFIX}${key}`;
}

export function lsGet(key) {
  if (!lsAvailable()) return undefined;
  try {
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return undefined;
    const { value, expiresAt, version } = JSON.parse(raw);
    if (version !== CACHE_VERSION || Date.now() > expiresAt) {
      localStorage.removeItem(lsKey(key));
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

export function lsSet(key, value, ttlMs = TTL.listsMs) {
  if (!lsAvailable()) return;
  try {
    localStorage.setItem(
      lsKey(key),
      JSON.stringify({ value, expiresAt: Date.now() + ttlMs, version: CACHE_VERSION }),
    );
  } catch {
    // Quota exceeded / private mode — lists just won't persist. Fine.
  }
}

export function lsDelete(key) {
  if (!lsAvailable()) return;
  try {
    localStorage.removeItem(lsKey(key));
  } catch {
    /* ignore */
  }
}

export function lsClear(prefix = '') {
  if (!lsAvailable()) return;
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX + prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Layer 3 — Upstash Redis REST client (fetch-based, best-effort)
// ---------------------------------------------------------------------------
let redisWarnedOnce = false;

function redisWarn(message) {
  if (redisWarnedOnce) return;
  redisWarnedOnce = true;
  console.warn(`[cache] Redis unavailable: ${message} — continuing without Redis.`);
}

async function redisFetch(path, options = {}) {
  if (!isRedisConfigured) {
    redisWarn('VITE_UPSTASH_REDIS_REST_URL / VITE_UPSTASH_REDIS_REST_TOKEN not set.');
    return null;
  }
  try {
    const res = await fetch(`${config.upstashRedisUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.upstashRedisToken}`,
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      redisWarn(`REST request failed (HTTP ${res.status}).`);
      return null;
    }
    return await res.json();
  } catch (err) {
    redisWarn(err?.message ?? String(err));
    return null;
  }
}

const redisKey = (key) => `nandha:${CACHE_VERSION}:${key}`;

/** GET a JSON value from Redis. Returns undefined on miss / unconfigured. */
export async function redisGet(key) {
  const data = await redisFetch(`/get/${encodeURIComponent(redisKey(key))}`);
  if (!data || typeof data.result !== 'string') return undefined;
  try {
    return JSON.parse(data.result);
  } catch {
    return data.result;
  }
}

/** SET a JSON value in Redis with TTL (seconds). Best-effort, never throws. */
export async function redisSet(key, value, ttlSeconds = 600) {
  const payload = encodeURIComponent(JSON.stringify(value));
  await redisFetch(`/set/${encodeURIComponent(redisKey(key))}/${payload}?EX=${ttlSeconds}`, {
    method: 'POST',
  });
}

/** DEL one or more keys from Redis. Best-effort, never throws. */
export async function redisDel(...keys) {
  if (keys.length === 0) return;
  const path = keys.map((k) => encodeURIComponent(redisKey(k))).join('/');
  await redisFetch(`/del/${path}`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Layer 4 — React Query defaults + cache keys
// ---------------------------------------------------------------------------
export const queryClientOptions = {
  defaultOptions: {
    queries: {
      // Lists (home feed, albums, playlists): fresh for 5 min.
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
};

/** Per-query-type stale times (ms) — use as overrides per useQuery call. */
export const staleTimes = {
  lists: 5 * 60 * 1000, // home, albums, playlists
  search: 2 * 60 * 1000,
  library: 1 * 60 * 1000, // liked tracks / library
  trackDetail: 60 * 60 * 1000,
};

export const cacheKeys = {
  track: (id) => ['track', id],
  tracks: (filters = {}) => ['tracks', filters],
  home: () => ['home'],
  search: (query) => ['search', (query ?? '').trim().toLowerCase()],
  album: (id) => ['album', id],
  playlist: (id) => ['playlist', id],
  library: (userId = 'me') => ['library', userId],
};

// ---------------------------------------------------------------------------
// Invalidation — clears memory + localStorage + Redis (best-effort),
// and forwards to React Query when a client has been bound (layer 4).
// ---------------------------------------------------------------------------
let boundQueryClient = null;

/**
 * React Query invalidation hook: the app calls this once with its
 * QueryClient (created in main.jsx) so cache invalidations also bust
 * React Query. Safe to never call — the other layers still clear.
 */
export function bindQueryClient(queryClient) {
  boundQueryClient = queryClient ?? null;
  return boundQueryClient;
}

export function getQueryClient() {
  return boundQueryClient;
}

function invalidateQueryClient(predicate) {
  if (!boundQueryClient) return;
  try {
    boundQueryClient.invalidateQueries({ predicate });
  } catch {
    /* ignore — React Query is optional */
  }
}

function memoryKeyFor(cacheKeyArray) {
  return cacheKeyArray.join(':');
}

export async function invalidateTrack(id) {
  memoryDelete(memoryKeyFor(cacheKeys.track(id)));
  memoryDelete(memoryKeyFor(cacheKeys.tracks()));
  lsDelete(`track:${id}`);
  lsDelete('tracks');
  await redisDel(`track:${id}`, 'tracks');
  invalidateQueryClient(
    (q) => q.queryKey[0] === 'track' || q.queryKey[0] === 'tracks',
  );
}

export async function invalidateHome() {
  memoryDelete(memoryKeyFor(cacheKeys.home()));
  lsDelete('home');
  await redisDel('home');
  invalidateQueryClient((q) => q.queryKey[0] === 'home');
}

export async function invalidateSearch() {
  memoryClear('search:');
  lsClear('search:');
  // Redis: search keys are per-query; without SCAN over REST we clear the
  // known prefix bucket instead of enumerating — callers that cached a
  // specific query should also call redisDel(`search:<query>`).
  await redisDel('search');
  invalidateQueryClient((q) => q.queryKey[0] === 'search');
}

export async function invalidateAlbum(id) {
  memoryDelete(memoryKeyFor(cacheKeys.album(id)));
  memoryDelete(memoryKeyFor(cacheKeys.tracks()));
  lsDelete(`album:${id}`);
  lsDelete('tracks');
  await redisDel(`album:${id}`, 'tracks');
  invalidateQueryClient(
    (q) => (q.queryKey[0] === 'album' && q.queryKey[1] === id) || q.queryKey[0] === 'tracks',
  );
}

export async function invalidatePlaylist(id) {
  memoryDelete(memoryKeyFor(cacheKeys.playlist(id)));
  lsDelete(`playlist:${id}`);
  await redisDel(`playlist:${id}`);
  invalidateQueryClient(
    (q) => q.queryKey[0] === 'playlist' && q.queryKey[1] === id,
  );
}

export async function invalidateLibrary(userId = 'me') {
  memoryDelete(memoryKeyFor(cacheKeys.library(userId)));
  lsDelete(`library:${userId}`);
  await redisDel(`library:${userId}`);
  invalidateQueryClient((q) => q.queryKey[0] === 'library');
}

// ---------------------------------------------------------------------------
// Play-count buffering — never write on every play.
// ---------------------------------------------------------------------------
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const playBuffer = new Map(); // trackId -> count
let flushTimer = null;
let visibilityListenerAttached = false;

function ensureFlushTimer() {
  if (flushTimer !== null) return;
  flushTimer = setInterval(() => {
    void flushPlays();
  }, FLUSH_INTERVAL_MS);
  // Don't keep a Node/vite process alive just for the flush timer.
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

function ensureVisibilityFlush() {
  if (visibilityListenerAttached || typeof document === 'undefined') return;
  visibilityListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPlays();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => void flushPlays());
  }
}

/**
 * Record a play locally. Buffered in memory; flushed to Supabase
 * `play_events` every 5 min or when the tab is hidden/closed — never on
 * every play. No-op in demo mode (no Supabase) — counts stay local only.
 */
export function recordPlay(trackId) {
  if (!trackId) return;
  playBuffer.set(trackId, (playBuffer.get(trackId) ?? 0) + 1);
  ensureFlushTimer();
  ensureVisibilityFlush();
}

/** Flush buffered play counts to Supabase `play_events`. Best-effort. */
export async function flushPlays() {
  if (playBuffer.size === 0) return { flushed: 0 };
  const entries = [...playBuffer.entries()];
  playBuffer.clear();
  if (!supabase) return { flushed: 0, skipped: 'demo-mode' };
  try {
    const rows = entries.map(([track_id, count]) => ({
      track_id,
      count,
      played_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('play_events').insert(rows);
    if (error) throw error;
    return { flushed: entries.length };
  } catch (err) {
    // Put the counts back so the next flush retries them.
    entries.forEach(([track_id, count]) => {
      playBuffer.set(track_id, (playBuffer.get(track_id) ?? 0) + count);
    });
    console.warn('[cache] play flush failed, will retry:', err?.message ?? err);
    return { flushed: 0, error: err?.message ?? String(err) };
  }
}

/** For tests / admin: how many plays are buffered and not yet flushed. */
export function bufferedPlayCount() {
  let total = 0;
  for (const n of playBuffer.values()) total += n;
  return total;
}

// ---------------------------------------------------------------------------
// Client-side rate limiting — simple in-memory token bucket.
// ---------------------------------------------------------------------------
const RATE_LIMIT = 100; // requests
const RATE_WINDOW_MS = 60 * 1000; // per minute, per action
const buckets = new Map(); // action -> { tokens, updatedAt }

/**
 * Token-bucket guard: 100 requests / minute per action by default.
 * @returns {boolean} true = allowed, false = rate-limited (drop / retry later).
 */
export function rateLimit(action, limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
  const now = Date.now();
  let bucket = buckets.get(action);
  if (!bucket) {
    bucket = { tokens: limit, updatedAt: now };
    buckets.set(action, bucket);
  }
  const elapsed = now - bucket.updatedAt;
  const refill = Math.floor((elapsed / windowMs) * limit);
  if (refill > 0) {
    bucket.tokens = Math.min(limit, bucket.tokens + refill);
    bucket.updatedAt = now;
  }
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

/** Remaining tokens for an action (for UI / debugging). */
export function rateLimitRemaining(action, limit = RATE_LIMIT) {
  return buckets.get(action)?.tokens ?? limit;
}

export function resetRateLimits() {
  buckets.clear();
}
