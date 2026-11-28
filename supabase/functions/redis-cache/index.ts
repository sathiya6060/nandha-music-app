// Nandha Music — redis-cache Edge Function (Deno, Supabase).
//
// WRITE PROXY for the Upstash Redis cache. The browser NEVER holds the
// full-access Upstash REST token (Upstash skill: it is full database
// access, not a scoped client key) — so SET/DEL go through this
// function, which holds the token server-side in env vars. Reads are
// direct browser -> Upstash REST with a READ-ONLY token (see
// src/lib/redisGuard.js).
//
//   POST { op: 'set', key, value, ttlSeconds? }   -> { ok: true }
//   POST { op: 'del', keys: [...] }               -> { ok: true, deleted: n }
//
// Key allowlist (C3/L28 — strict, not a prefix): the ONLY key this
// function will ever write or delete is the exact home-feed key the
// app uses, `nandha:nandha-cache-v1:home` (redisGuard.js REDIS_PREFIX
// + the single cachedFetch guardKey 'home' from Home.jsx). No other
// `nandha:` key is accepted — the old prefix allowlist let anyone
// with the public anon key overwrite the shared home feed (cache
// poisoning) or delete up to 50 keys per request.
// SET values are schema-validated: they must parse as a JSON array of
// track-like objects (the shape useTracks() returns). Anything else
// is rejected with 400, so a forged feed cannot carry arbitrary
// titles, cover URLs, or audio URLs to every visitor.
// DEL tolerates mixed key arrays: the client sends 'home' together
// with dead keys ('tracks', 'search', 'track:<id>') that are never
// SET anywhere (see review M35) — only the home key is deleted, the
// rest are ignored, and the call still returns ok so admin
// invalidation of Home keeps working.
//
// Security notes (same pattern as get-audio-url):
// - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN come from the
//   function's env vars (Supabase dashboard -> Edge Functions ->
//   redis-cache -> Secrets). NEVER hard-coded, NEVER sent to the client.
// - The anon key the app sends only passes the Edge Function's JWT
//   check; it grants no Upstash access by itself.
// - Best-effort per-IP rate limit (30/min) stops casual abuse loops.
// - Value size capped at 1 MB and TTL at 1 day; a failed write is
//   NOT fatal — the app keeps serving from memory/localStorage/source.
//
// STORAGE CAP (free tier, enforced here — 28 Nov 2026): the live INFO
// on this database reports maxmemory 64 MB, policy noeviction — when
// full, Upstash rejects writes with OOM and never evicts anything on
// its own. Our keys self-clean via TTL (600s), so the cap below is a
// safety net, not the normal path: a SET is refused with
// 'storage_full' (507) once used_memory passes 80% of the live
// maxmemory, and the app serves from Supabase instead — no user error,
// no lag (the SET is fire-and-forget). INFO is a free operational
// command (Upstash does not bill it), so the check costs nothing.
// If the check itself errors, the write is allowed (fail open):
// Upstash's own OOM rejection is the backstop, and the app treats a
// failed SET as a plain cache skip.
//
// Deploy (no CLI needed): Supabase dashboard -> Edge Functions ->
// "Create a new function", name `redis-cache`, paste this file, set
// the two UPSTASH_* secrets, Deploy. Leave "Verify JWT" ON (default).
// DO NOT deploy until the Upstash database + read-only token exist.
// Until then the app works identically with Redis off (guard fallback).
// CODE FIXED, NEEDS DEPLOY — run after this file lands:
//   supabase functions deploy redis-cache

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Production origin only. http://localhost:5173 is allowlisted ONLY
// when the function secret ALLOW_LOCAL_DEV is set to "true" (A4-1).
const ALLOW_LOCAL_DEV = Deno.env.get("ALLOW_LOCAL_DEV") === "true";
const ALLOWED_ORIGINS = new Set(
  ALLOW_LOCAL_DEV
    ? ["https://nandhamusic.pages.dev", "http://localhost:5173"]
    : ["https://nandhamusic.pages.dev"],
);

// The single writable key: REDIS_PREFIX ('nandha:nandha-cache-v1:')
// + guardKey 'home' — the only cachedFetch key the app ever SETs
// (src/pages/Home.jsx:283 via useTracks({ guardKey: 'home' })).
const HOME_KEY = "nandha:nandha-cache-v1:home";
const MAX_VALUE_CHARS = 1_000_000; // 1 MB
const MAX_TTL_SECONDS = 86_400; // 1 day
const DEFAULT_TTL_SECONDS = 600; // 10 min
const MAX_HOME_TRACKS = 500;

// Best-effort per-IP rate limit (in-memory; resets on cold start).
// A4-4 residual: the key is the first x-forwarded-for entry, which a
// caller can spoof. Supabase Edge Functions expose no gateway-provided
// client-IP header, and Deno's remoteAddr here would be the Supabase
// gateway's own internal IP (identical for every request).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

// A4-2: unknown or missing origins get NO Access-Control-Allow-Origin
// header at all (fail closed) instead of defaulting to the production
// origin.
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function upstash(
  url: string,
  token: string,
  command: unknown[],
): Promise<{ ok: boolean; detail?: string; result?: unknown }> {
  try {
    // redis-connections skill §5: explicit timeout so a hung Upstash
    // call fails fast (502) instead of hanging the function — the app
    // falls back to memory/localStorage/source on any proxy failure.
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal:
        typeof AbortSignal?.timeout === "function"
          ? AbortSignal.timeout(5_000)
          : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, detail: `upstash HTTP ${res.status} ${text}`.slice(0, 200) };
    }
    const data = await res.json().catch(() => null);
    if (data && typeof data === "object" && "error" in data) {
      return { ok: false, detail: String((data as { error: unknown }).error).slice(0, 200) };
    }
    return { ok: true, result: (data as { result?: unknown } | null)?.result };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 200) };
  }
}

// Free-tier storage cap: refuse a SET once used_memory passes 80% of
// the live maxmemory (INFO, unbilled). Fail open on any check error.
const STORAGE_CAP_FRACTION = 0.8;

function parseInfoMemory(info: string): { used: number; max: number } | null {
  const used = /used_memory:(\d+)/.exec(info);
  const max = /maxmemory:(\d+)/.exec(info);
  if (!used || !max) return null;
  const u = Number(used[1]);
  const m = Number(max[1]);
  if (!Number.isFinite(u) || !Number.isFinite(m) || m <= 0) return null;
  return { used: u, max: m };
}

async function storageFull(url: string, token: string): Promise<boolean> {
  const r = await upstash(url, token, ["INFO", "memory"]);
  if (!r.ok || typeof r.result !== "string") return false;
  const mem = parseInfoMemory(r.result);
  if (!mem) return false;
  return mem.used >= mem.max * STORAGE_CAP_FRACTION;
}

// ---------------------------------------------------------------------------
// SET value schema (C3): the home feed is the JSON array useTracks()
// returns — track-like objects from mapTrack (supabaseCatalog.js).
// A value that is not that shape is rejected, so poisoned JSON can
// never reach the home feed. Fields outside the known set are
// rejected; nested values may only be primitives, arrays of
// primitives, or arrays of flat objects (lyrics/synced lines).
// ---------------------------------------------------------------------------
const TRACK_FIELDS = new Set([
  "id", "slug", "dbId", "titleEn", "titleTa", "artistId", "artist",
  "composer", "lyricist", "albumId", "album", "genre", "language",
  "durationSec", "audio128", "audio320", "cover", "coverOg", "status",
  "plays", "releaseDate", "hookStartSec", "hookDurationSec",
  "description", "storyTa", "storyEn", "storyCredit", "scheduledAt",
  "lyricsTa", "lyricsEn", "syncedLyrics",
]);

function isPrimitive(v: unknown): boolean {
  return v === null || typeof v === "string" || typeof v === "number" ||
    typeof v === "boolean";
}

function isFlatValue(v: unknown, depth: number): boolean {
  if (isPrimitive(v)) return true;
  if (depth > 2 || !Array.isArray(v)) return false;
  return v.every((item) => {
    if (isPrimitive(item)) return true;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.values(item as Record<string, unknown>)
        .every((leaf) => isPrimitive(leaf));
    }
    return false;
  });
}

function validHomeValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_HOME_TRACKS) return false;
  return parsed.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const track = item as Record<string, unknown>;
    // Every track needs an id and a title in at least one language.
    if (typeof track.id !== "string" || track.id.length === 0) return false;
    if (typeof track.titleEn !== "string" && typeof track.titleTa !== "string") {
      return false;
    }
    return Object.entries(track).every(([k, v]) =>
      TRACK_FIELDS.has(k) && isFlatValue(v, 0)
    );
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  // A4-3 (accepted): preflight stays unauthenticated and
  // un-rate-limited — standard preflight behaviour, leaks nothing.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, headers);
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return json({ error: "rate_limited" }, 429, headers);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, headers);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "invalid_body" }, 400, headers);
  }
  const { op } = body as { op?: unknown };
  if (op !== "set" && op !== "del") {
    return json({ error: "op_not_allowed" }, 403, headers);
  }

  const restUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const restToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!restUrl || !restToken) {
    return json({ error: "server_misconfigured" }, 500, headers);
  }

  if (op === "set") {
    const { key, value, ttlSeconds } = body as {
      key?: unknown;
      value?: unknown;
      ttlSeconds?: unknown;
    };
    // Strict allowlist: only the exact home key (C3).
    if (key !== HOME_KEY) {
      return json({ error: "key_not_allowed" }, 403, headers);
    }
    if (typeof value !== "string" || value.length > MAX_VALUE_CHARS) {
      return json({ error: "value_not_allowed" }, 400, headers);
    }
    if (!validHomeValue(value)) {
      return json({ error: "value_not_allowed" }, 400, headers);
    }
    const ttl =
      typeof ttlSeconds === "number" && Number.isFinite(ttlSeconds)
        ? Math.min(Math.max(Math.floor(ttlSeconds), 60), MAX_TTL_SECONDS)
        : DEFAULT_TTL_SECONDS;
    // Free-tier storage cap: refuse the write (507) instead of letting
    // Upstash OOM — the app treats it as a plain cache skip and serves
    // from Supabase. DEL is never capped (it frees space).
    if (await storageFull(restUrl, restToken)) {
      return json({ error: "storage_full" }, 507, headers);
    }
    const r = await upstash(restUrl, restToken, ["SET", key, value, "EX", ttl]);
    if (!r.ok) return json({ error: "upstash_failed", detail: r.detail }, 502, headers);
    return json({ ok: true }, 200, headers);
  }

  // op === 'del' (L28): only the exact home key is ever deleted.
  // The client also sends dead keys ('tracks', 'search', 'track:<id>')
  // that no SET ever creates — those are ignored, not rejected, so
  // invalidateCatalog's mixed ['home', 'tracks', 'search'] call still
  // evicts Home instead of failing outright.
  const { keys } = body as { keys?: unknown };
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 50) {
    return json({ error: "keys_not_allowed" }, 400, headers);
  }
  if (!keys.every((k) => typeof k === "string")) {
    return json({ error: "keys_not_allowed" }, 400, headers);
  }
  const allowed = [...new Set(keys.filter((k) => k === HOME_KEY))];
  if (allowed.length === 0) {
    return json({ ok: true, deleted: 0 }, 200, headers);
  }
  const r = await upstash(restUrl, restToken, ["DEL", ...allowed]);
  if (!r.ok) return json({ error: "upstash_failed", detail: r.detail }, 502, headers);
  return json({ ok: true, deleted: allowed.length }, 200, headers);
});
