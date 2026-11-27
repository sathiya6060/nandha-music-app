// Nandha Music — get-audio-url Edge Function (Deno, Supabase).
//
// Mints a SHORT-LIVED signed URL (300 s) for the real tracks stored in
// the PRIVATE Supabase Storage bucket "audio". The browser never sees a
// permanent audio URL: the player asks this function when playback starts,
// and the URL dies 5 minutes later, so a shared/copied link stops working.
//
// Security notes (see security-and-hardening skill):
// - The service_role key comes from the auto-injected env vars
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. It is NEVER hard-coded,
//   NEVER sent to the client, and NEVER put in .env.
// - Authorization is checked server-side on EVERY request: the track name
//   is allowlisted (three files only), and the signed URL itself is validated
//   by Supabase Storage (signature + expiry) on every Range request.
// - The anon key the player sends as `apikey` / Authorization is the
//   public publishable key (safe in the client by design); it only passes
//   the Edge Function's JWT check, it grants no storage access.
// - A strictly one-time token would break playback: the browser makes
//   many Range requests per play (buffering, seeks). A 300 s signed URL
//   is the correct shape — one URL per play session, dead soon after.
//
// Deploy (no CLI needed): Supabase dashboard → Edge Functions →
// "Create a new function", name `get-audio-url`, paste this file,
// Deploy. Leave "Verify JWT" ON (default) — the player sends the anon
// key, which passes the JWT check.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const ALLOWED_ORIGINS = new Set([
  "https://nandha-music.pages.dev",
  "http://localhost:5173",
]);

// Allowlist: the ONLY audio files this function will ever sign.
// (27 Nov 2026: Vaazhvinil + Malaiyoram + Marakka — the three real tracks.)
const ALLOWED_TRACKS = new Set([
  "vaazhvinil-orumurayenum.mp3",
  "malaiyoram-veesiya-kaatre.mp3",
  "marakka-mudiyuma.mp3",
]);

// Candidate object paths inside bucket "audio", in order. The dashboard
// upload stored the file under an "audio/" folder ("audio/<file>"); if a
// future upload stores it flat, the bare filename is tried second.
const BUCKET = "audio";
const SIGNED_URL_EXPIRY_SECONDS = 300;

// Best-effort per-IP rate limit (in-memory; resets on cold start).
// 30 mint requests per IP per minute is far above real listening
// (one mint per play) and stops casual URL-harvesting loops.
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
      : "https://nandha-music.pages.dev";
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
  if (typeof track !== "string" || !ALLOWED_TRACKS.has(track)) {
    return json({ error: "track_not_allowed" }, 403, headers);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "server_misconfigured" }, 500, headers);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let signedUrl: string | null = null;
  let lastError: string | null = null;
  for (const path of [`audio/${track}`, track]) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
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
    { url: signedUrl, expiresIn: SIGNED_URL_EXPIRY_SECONDS },
    200,
    headers,
  );
});
