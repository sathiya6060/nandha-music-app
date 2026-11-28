// Nandha Music — get-audio-url Edge Function (Deno, Supabase).
//
// Mints a SHORT-LIVED signed URL for the real tracks stored in
// the PRIVATE Supabase Storage bucket "audio". The browser never sees a
// permanent audio URL: the player asks this function when playback starts,
// and the URL dies soon after, so a shared/copied link stops working.
//
// Security notes (see security-and-hardening skill):
// - The service_role key comes from the auto-injected env vars
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. It is NEVER hard-coded,
//   NEVER sent to the client, and NEVER put in .env.
// - Authorization is checked server-side on EVERY request. The track
//   must exist in the DB with status='published' and its stored audio
//   path must name the requested file (checked with the service-role
//   client, so RLS cannot be used to fake a row). Unpublishing a track
//   therefore revokes its audio, and a new track plays with no code
//   change — the old hardcoded 3-file allowlist is gone (C1/H26/M7).
// - TIERED EXPIRY (C2 residual, honest): the 5-second guest gate is
//   still enforced client-side only, so anonymous callers can still
//   mint a URL — but only a 60 s one, while a verified user JWT gets
//   300 s. A 60 s URL is enough for the 5 s guest preview and dies
//   before a full song can be harvested through it; a full user-JWT
//   -only gate would break the guest preview, so it is deliberately
//   NOT implemented here. The anon key the player sends as `apikey` /
//   Authorization is the public publishable key (safe in the client
//   by design); it only passes the Edge Function's JWT check, it
//   grants no storage access.
// - A strictly one-time token would break playback: the browser makes
//   many Range requests per play (buffering, seeks). A short-lived
//   signed URL is the correct shape — one URL per play session, dead
//   soon after.
//
// Deploy (no CLI needed): Supabase dashboard → Edge Functions →
// "Create a new function", name `get-audio-url`, paste this file,
// Deploy. Leave "Verify JWT" ON (default) — the player sends the anon
// key, which passes the JWT check.
// CODE FIXED, NEEDS DEPLOY — run after this file lands:
//   supabase functions deploy get-audio-url

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

// Production origin only. http://localhost:5173 is allowlisted ONLY
// when the function secret ALLOW_LOCAL_DEV is set to "true" (A4-1) —
// a production deployment must not trust a dev origin.
const ALLOW_LOCAL_DEV = Deno.env.get("ALLOW_LOCAL_DEV") === "true";
const ALLOWED_ORIGINS = new Set(
  ALLOW_LOCAL_DEV
    ? ["https://nandhamusic.pages.dev", "http://localhost:5173"]
    : ["https://nandhamusic.pages.dev"],
);

// Candidate object paths inside bucket "audio", in order. The dashboard
// upload stored the file under an "audio/" folder ("audio/<file>"); if a
// future upload stores it flat, the bare filename is tried second.
const BUCKET = "audio";
// Authenticated listeners get a full-play URL; anonymous callers (guest
// preview) get a 60 s URL — long enough for the 5 s preview, too short
// to harvest a full song through (see header notes).
const SIGNED_URL_EXPIRY_AUTH_SECONDS = 300;
const SIGNED_URL_EXPIRY_ANON_SECONDS = 60;

// A requested file name must be a plain .mp3 basename: no slashes, no
// "..", no query string. The DB check below is the real gate; this just
// keeps malformed input out of the storage call and the PostgREST filter.
const TRACK_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.mp3$/;
const MAX_TRACK_LEN = 128;

// Best-effort per-IP rate limit (in-memory; resets on cold start).
// 30 mint requests per IP per minute is far above real listening
// (one mint per play) and stops casual URL-harvesting loops.
// A4-4 residual: the key is the first x-forwarded-for entry, which a
// caller can spoof. Supabase Edge Functions expose no gateway-provided
// client-IP header, and Deno's remoteAddr here would be the Supabase
// gateway's own internal IP (identical for every request), so there is
// no better key available server-side. The tiered 60 s anonymous
// expiry bounds what a rotated-IP harvest can take.
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
// origin. A browser on an unknown origin is refused; curl/same-origin
// callers are unaffected by CORS.
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

// Is the caller's JWT a verified user session (role 'authenticated')
// rather than the public anon key (role 'anon')? The gateway has
// already verified the JWT signature ("Verify JWT" ON); decoding the
// payload here only reads its role claim — it grants nothing by itself.
// Anything unparseable is treated as anonymous (short expiry).
function isAuthenticatedCaller(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { role?: unknown };
    return payload.role === "authenticated";
  } catch {
    return false;
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

  let track: unknown;
  try {
    ({ track } = await req.json());
  } catch {
    return json({ error: "invalid_json" }, 400, headers);
  }
  if (
    typeof track !== "string" ||
    track.length > MAX_TRACK_LEN ||
    !TRACK_FILE_RE.test(track)
  ) {
    return json({ error: "track_not_allowed" }, 403, headers);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "server_misconfigured" }, 500, headers);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // DB gate (C1/C2/M7): the track must exist with status='published'
  // and one of its stored audio paths must name exactly this file.
  // Stored forms are `audio/<file>.mp3` (admin upload) or the bare
  // file name. The charset check above keeps `track` safe to embed in
  // the PostgREST `or` filter (no commas, parens, or wildcards).
  // A draft/scheduled/missing track gets the same 403 as a bad name,
  // so the response does not leak which case it was.
  const { data: rows, error: dbError } = await supabase
    .from("tracks")
    .select("id")
    .eq("status", "published")
    .or(
      `audio_128_url.eq.audio/${track},audio_320_url.eq.audio/${track},audio_128_url.eq.${track},audio_320_url.eq.${track}`,
    )
    .limit(1);
  if (dbError) {
    return json({ error: "db_check_failed" }, 500, headers);
  }
  if (!rows || rows.length === 0) {
    return json({ error: "track_not_allowed" }, 403, headers);
  }

  const expirySeconds = isAuthenticatedCaller(req)
    ? SIGNED_URL_EXPIRY_AUTH_SECONDS
    : SIGNED_URL_EXPIRY_ANON_SECONDS;

  let signedUrl: string | null = null;
  let lastError: string | null = null;
  for (const path of [`audio/${track}`, track]) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expirySeconds);
    if (!error && data?.signedUrl) {
      signedUrl = data.signedUrl;
      break;
    }
    lastError = error?.message ?? "unknown";
  }

  if (!signedUrl) {
    return json({ error: "sign_failed", detail: lastError }, 500, headers);
  }

  return json(
    { url: signedUrl, expiresIn: expirySeconds },
    200,
    headers,
  );
});
