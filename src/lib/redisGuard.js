/**
 * Nandha Music — free-tier Redis guard (Upstash).
 *
 * The Upstash free tier is 500,000 commands/month, 64 MB engine cap
 * (250 MB billing), 10 GB bandwidth, NO card, NO overage billing
 * possible (the account simply stops serving past the limit). This module makes sure the app stays
 * inside that budget and degrades gracefully instead of breaking:
 *
 *   - Monthly budget: 450,000 commands by default (90% of the free
 *     tier), overridable via VITE_REDIS_MONTHLY_BUDGET. A per-device
 *     counter in localStorage (keyed by YYYY-MM) is incremented on
 *     every Redis call THIS device makes.
 *   - HONEST LIMIT: that counter caps per-device use only. The
 *     account-wide guard is the circuit breaker below: a quota error
 *     (429) is seen by EVERY device, so all devices shed load together
 *     the moment the account limit is hit.
 *   - Tiered fetch: memory -> localStorage -> Redis GET -> loader()
 *     (Supabase/static). Redis SETs go through the write proxy only.
 *   - Circuit breaker: 3 consecutive Redis failures (or any 429/quota
 *     error) -> OPEN for 5 min (no Redis calls, serve fallback) ->
 *     HALF-OPEN with one probe -> CLOSED on success.
 *   - Priority shedding: past 70% of the per-device monthly budget,
 *     Redis is skipped for 'low' priority keys; at 100% Redis is off
 *     for the rest of the month (per device). High: home, track.
 *     Low: everything else. Search is never wired through Redis at
 *     all — unique queries would burn the budget.
 *   - Graceful degradation: a Redis failure NEVER throws into the UI.
 *     Every path falls back to memory / localStorage / source.
 *
 * TOKEN SAFETY (Upstash skill): the browser must NEVER hold the
 * full-access REST token — it is full database access, not a scoped
 * client key. Reads below use VITE_UPSTASH_REDIS_REST_TOKEN, which
 * MUST be a READ-ONLY token created in the Upstash console (see the
 * one-time console warning in guardedRedisGet). Writes (SET/DEL) are
 * NEVER made from the browser: they go through the `redis-cache`
 * Supabase Edge Function, which holds the full-access token
 * server-side. When the env token is empty (today), Redis is off and
 * everything falls back — that is the correct current behavior.
 */
import { config, isRedisConfigured } from './config.js';
import { supabase } from './supabase.js';

const SHED_AT_PCT = 70;
const CIRCUIT_FAILURES = 3;
const CIRCUIT_OPEN_MS = 5 * 60 * 1000;
const REDIS_TIMEOUT_MS = 5_000;

// Same key shape as cache.js: `nandha:<CACHE_VERSION>:<key>`.
// Keep in sync with CACHE_VERSION in src/lib/cache.js.
const REDIS_PREFIX = 'nandha:nandha-cache-v1:';
const BUDGET_KEY_PREFIX = 'nandha-redis-budget:';

/** Full Upstash key for a cache key (shared with cache.js invalidation). */
function redisKeyFor(key) {
  return `${REDIS_PREFIX}${key}`;
}

// ---------------------------------------------------------------------------
// Per-device monthly budget counter (localStorage, keyed by YYYY-MM)
// ---------------------------------------------------------------------------
function monthKey() {
  const d = new Date();
  return `${BUDGET_KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function storageGet(k) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
  } catch {
    return null;
  }
}

function storageSet(k, v) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
  } catch {
    /* storage unavailable (private mode) — budget tracking degrades to 0 */
  }
}

function readUsed() {
  const n = Number.parseInt(storageGet(monthKey()) ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Count one Redis command for this device. 1 per REST call, counted
 * even when the call fails (conservative: a failed call may still have
 * counted server-side, and the budget is a safety ceiling, not a bill).
 */
function countCommand() {
  const used = readUsed() + 1;
  storageSet(monthKey(), String(used));
  return used;
}

// ---------------------------------------------------------------------------
// Circuit breaker (module memory; a quota error is the global signal)
// ---------------------------------------------------------------------------
let consecutiveFailures = 0;
let circuitOpenedAt = 0; // 0 = closed
let halfOpenProbeInFlight = false;

function circuitState() {
  if (circuitOpenedAt === 0) return 'closed';
  if (Date.now() - circuitOpenedAt >= CIRCUIT_OPEN_MS) return 'half-open';
  return 'open';
}

function recordSuccess() {
  consecutiveFailures = 0;
  circuitOpenedAt = 0;
}

function openCircuit() {
  circuitOpenedAt = Date.now();
  consecutiveFailures = 0;
}

function recordFailure(isQuota) {
  if (isQuota) {
    openCircuit();
    return;
  }
  consecutiveFailures += 1;
  if (consecutiveFailures >= CIRCUIT_FAILURES) openCircuit();
}

// ---------------------------------------------------------------------------
// Guarded Redis GET (reads only; write proxy below does SET/DEL)
// ---------------------------------------------------------------------------
let tokenWarningShown = false;

function warnReadOnlyTokenOnce() {
  if (tokenWarningShown || typeof console === 'undefined') return;
  tokenWarningShown = true;
  console.warn(
    '[redisGuard] VITE_UPSTASH_REDIS_REST_TOKEN is bundled into the client — '
    + 'it MUST be a READ-ONLY token (Upstash console → Redis → REST API → '
    + 'read-only token). NEVER put the full-access token here; writes go '
    + 'through the redis-cache Edge Function, which holds it server-side.',
  );
}

function redisAllowedFor(priority) {
  if (!isRedisConfigured) return false;
  if (circuitState() === 'open') return false;
  const used = readUsed();
  if (used >= config.redisMonthlyBudget) return false;
  if (priority === 'low' && used >= (config.redisMonthlyBudget * SHED_AT_PCT) / 100) return false;
  return true;
}

async function guardedRedisGet(key) {
  if (!isRedisConfigured) return { hit: false, skipped: 'unconfigured' };
  if (circuitState() === 'open') return { hit: false, skipped: 'circuit-open' };
  if (readUsed() >= config.redisMonthlyBudget) return { hit: false, skipped: 'budget-exhausted' };
  if (circuitState() === 'half-open') {
    if (halfOpenProbeInFlight) return { hit: false, skipped: 'half-open-probe' };
    halfOpenProbeInFlight = true;
  }
  warnReadOnlyTokenOnce();
  countCommand();
  try {
    const res = await fetch(
      `${config.upstashRedisUrl}/get/${encodeURIComponent(redisKeyFor(key))}`,
      {
        headers: { Authorization: `Bearer ${config.upstashRedisToken}` },
        signal:
          typeof AbortSignal?.timeout === 'function'
            ? AbortSignal.timeout(REDIS_TIMEOUT_MS)
            : undefined,
      },
    );
    if (res.status === 429) {
      recordFailure(true);
      return { hit: false, skipped: 'quota' };
    }
    if (!res.ok) {
      recordFailure(false);
      return { hit: false, skipped: `http-${res.status}` };
    }
    recordSuccess();
    const data = await res.json().catch(() => null);
    if (data && typeof data.result === 'string') {
      try {
        return { hit: true, value: JSON.parse(data.result) };
      } catch {
        return { hit: false, skipped: 'bad-json' };
      }
    }
    return { hit: false, skipped: 'miss' };
  } catch {
    recordFailure(false);
    return { hit: false, skipped: 'error' };
  } finally {
    halfOpenProbeInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Write proxy — SET/DEL go through the redis-cache Edge Function, never
// direct from the browser. Gated on isRedisConfigured: with Redis
// unconfigured (today) this returns false WITHOUT firing any request,
// so a cache miss never calls the undeployed Edge Function (that used
// to log a CORS error + 404 on every Home/Track load). Callers fall
// back to memory/localStorage only.
// ---------------------------------------------------------------------------
async function invokeWriteProxy(body) {
  if (!isRedisConfigured) return false;
  if (!supabase) return false;
  countCommand(); // conservative: the proxy spends 1 Upstash command
  try {
    const { data, error } = await supabase.functions.invoke('redis-cache', { body });
    if (error || !data?.ok) return false;
    return true;
  } catch {
    return false;
  }
}

/** SET one key via the write proxy. Best-effort, never throws. */
async function redisSetViaProxy(key, value, ttlSeconds = 600) {
  return invokeWriteProxy({
    op: 'set',
    key: redisKeyFor(key),
    value: JSON.stringify(value),
    ttlSeconds,
  });
}

/** DEL keys via the write proxy. Best-effort, never throws. */
export async function redisDelViaProxy(...keys) {
  if (keys.length === 0) return false;
  return invokeWriteProxy({ op: 'del', keys: keys.map(redisKeyFor) });
}

// ---------------------------------------------------------------------------
// Tiered cachedFetch — memory -> localStorage -> Redis -> loader()
// ---------------------------------------------------------------------------
const memoryCache = new Map(); // key -> { value, expiresAt }
const inflight = new Map(); // key -> Promise (request coalescing)

function memoryGet(key) {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function memorySet(key, value, ttlSeconds) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function lsKey(key) {
  return `nandha-cache-v1:${key}`;
}

function lsGet(key) {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(lsKey(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(lsKey(key));
      return undefined;
    }
    return parsed.value;
  } catch {
    return undefined;
  }
}

function lsSet(key, value, ttlSeconds) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      lsKey(key),
      JSON.stringify({ value, expiresAt: Date.now() + ttlSeconds * 1000 }),
    );
  } catch {
    /* storage full/unavailable — memory tier still serves this session */
  }
}

async function runCachedFetch(key, loader, { ttlSeconds = 600, priority = 'low' } = {}) {
  const mem = memoryGet(key);
  if (mem !== undefined) return mem;
  const ls = lsGet(key);
  if (ls !== undefined) {
    memorySet(key, ls, ttlSeconds);
    return ls;
  }
  if (redisAllowedFor(priority)) {
    const r = await guardedRedisGet(key);
    if (r.hit) {
      memorySet(key, r.value, ttlSeconds);
      lsSet(key, r.value, ttlSeconds);
      return r.value;
    }
  }
  // Source of truth. A loader error propagates to the caller (React Query
  // shows its error state; Track keeps its sync value) — only Redis
  // failures are swallowed here, never source failures.
  const value = await loader();
  if (value !== undefined && value !== null) {
    memorySet(key, value, ttlSeconds);
    lsSet(key, value, ttlSeconds);
    // Fire-and-forget: the SET must never block the return value.
    void redisSetViaProxy(key, value, ttlSeconds);
  }
  return value;
}

/**
 * Tiered cached read with request coalescing: identical concurrent
 * calls share one Redis call / one loader run. Never throws for a
 * Redis failure — falls back to memory / localStorage / loader().
 *
 * @param {string} key  Cache key (e.g. 'home', 'track:<id>').
 * @param {Function} loader  () => value|Promise<value> — source of truth.
 * @param {object} [opts]  { ttlSeconds=600, priority='low'|'high' }.
 */
export function cachedFetch(key, loader, options = {}) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = runCachedFetch(key, loader, options).finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/**
 * Drop cachedFetch entries (memory tier + in-flight coalescing) for
 * one key, or all when no key is given. Called by cache.js
 * invalidateCatalog after an admin write, so the next read re-runs
 * the loader instead of serving a stale tier-1 hit. This touches
 * NO gating state — the budget counter and circuit breaker are
 * unchanged.
 */
export function invalidateCachedFetch(key) {
  if (key) {
    memoryCache.delete(key)
    inflight.delete(key)
    return
  }
  memoryCache.clear()
  inflight.clear()
}

/** Read-only guard status (safe to expose for diagnostics / the admin UI). */
export function getRedisGuardStatus() {
  const used = readUsed();
  const budget = config.redisMonthlyBudget;
  return {
    enabled: isRedisConfigured && circuitState() !== 'open' && used < budget,
    used,
    budget,
    pctUsed: budget > 0 ? Math.round((used / budget) * 1000) / 10 : 0,
    circuit: circuitState(),
    redisConfigured: isRedisConfigured,
  };
}
