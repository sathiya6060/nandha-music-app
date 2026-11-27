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
//   POST { op: 'del', keys: [...] }               -> { ok: true }
//
// Key allowlist: every key must start with 'nandha:' — the app only
// ever writes keys under `nandha:nandha-cache-v1:`. Anything else is
// rejected (403), so a compromised anon key cannot touch other data.
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
// Deploy (no CLI needed): Supabase dashboard -> Edge Functions ->
// "Create a new function", name `redis-cache`, paste this file, set
// the two UPSTASH_* secrets, Deploy. Leave "Verify JWT" ON (default).
// DO NOT deploy until the Upstash database + read-only token exist.
// Until then the app works identically with Redis off (guard fallback).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = new Set([
  "https://nandhamusic.pages.dev",
  "http://localhost:5173",
]);

// Allowlist: keys must live under the app's cache namespace.
const KEY_PREFIX = "nandha:";
const MAX_VALUE_CHARS = 1_000_000; // 1 MB
const MAX_TTL_SECONDS = 86_400; // 1 day
const DEFAULT_TTL_SECONDS = 600; // 10 min

// Best-effort per-IP rate limit (in-memory; resets on cold start).
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

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://nandhamusic.pages.dev";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
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

function validKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.startsWith(KEY_PREFIX) &&
    key.length > KEY_PREFIX.length &&
    key.length <= 512
  );
}

async function upstash(
  url: string,
  token: string,
  command: unknown[],
): Promise<{ ok: boolean; detail?: string }> {
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
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 200) };
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

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
    if (!validKey(key)) {
      return json({ error: "key_not_allowed" }, 403, headers);
    }
    if (typeof value !== "string" || value.length > MAX_VALUE_CHARS) {
      return json({ error: "value_not_allowed" }, 400, headers);
    }
    const ttl =
      typeof ttlSeconds === "number" && Number.isFinite(ttlSeconds)
        ? Math.min(Math.max(Math.floor(ttlSeconds), 60), MAX_TTL_SECONDS)
        : DEFAULT_TTL_SECONDS;
    const r = await upstash(restUrl, restToken, ["SET", key, value, "EX", ttl]);
    if (!r.ok) return json({ error: "upstash_failed", detail: r.detail }, 502, headers);
    return json({ ok: true }, 200, headers);
  }

  // op === 'del'
  const { keys } = body as { keys?: unknown };
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 50) {
    return json({ error: "keys_not_allowed" }, 400, headers);
  }
  if (!keys.every(validKey)) {
    return json({ error: "key_not_allowed" }, 403, headers);
  }
  const r = await upstash(restUrl, restToken, ["DEL", ...keys]);
  if (!r.ok) return json({ error: "upstash_failed", detail: r.detail }, 502, headers);
  return json({ ok: true }, 200, headers);
});
