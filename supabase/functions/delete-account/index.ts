// Nandha Music — delete-account Edge Function (Deno, Supabase).
//
// Deletes the CALLER's own account: the function verifies the JWT
// from the Authorization header, deletes the user's library rows
// (liked_tracks, followed_artists, playlists — playlist_tracks go
// away via cascade) and then the Auth user itself.
//
// Security:
// - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY come
//   from the function's env vars (Supabase dashboard -> Edge Functions
//   -> delete-account -> Secrets). The service_role key is NEVER
//   hard-coded, NEVER sent to the client, NEVER in the repo.
// - The caller can only delete THEMSELF: the user id comes from the
//   verified JWT (auth.getUser), never from the request body.
// - No rate-limit map here: account deletion is a rare, deliberate
//   action (the client confirms twice); a per-IP limit would only
//   add a false sense of safety on a destructive endpoint.
//
// Deploy (needs a human with Supabase dashboard access):
//   1. Dashboard -> Edge Functions -> "Create a new function",
//      name `delete-account`, paste this file. Leave "Verify JWT" ON.
//   2. Edge Functions -> delete-account -> Secrets, add
//      SERVICE_ROLE_KEY = <the project's service_role key>.
//      (SUPABASE_URL and SUPABASE_ANON_KEY are set automatically.)
//   Or with the CLI: `supabase functions deploy delete-account` then
//   `supabase secrets set SERVICE_ROLE_KEY=...`.
// Until deployed, the app's Profile page shows the honest "email us"
// message (deleteAccount.js returns 'not-deployed' on 404) — the
// deletion is never faked client-side.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const ALLOWED_ORIGINS = new Set([
  "https://nandhamusic.pages.dev",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://nandhamusic.pages.dev";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: "misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Verify the caller's JWT with the anon client — the user id comes
  // from this verified token, never from the request body.
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  // Admin client (service_role) — deletes the user's rows, then the user.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const userId = user.id;

  // Library rows first (playlists cascade to playlist_tracks).
  await admin.from("liked_tracks").delete().eq("user_id", userId);
  await admin.from("followed_artists").delete().eq("user_id", userId);
  await admin.from("playlists").delete().eq("owner_id", userId).eq("is_curated", false);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return new Response(JSON.stringify({ ok: false, error: "delete_failed" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});
