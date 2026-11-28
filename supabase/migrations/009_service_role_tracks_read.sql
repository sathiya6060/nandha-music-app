-- ============================================================================
-- Nandha Music — 009_service_role_tracks_read.sql (28 Nov 2026)
--
-- The get-audio-url Edge Function's DB gate (C1 fix) checks the tracks
-- table through PostgREST with the service_role key. That query failed
-- live with 42501 "permission denied for table tracks" — the
-- service_role role never had a table-level SELECT grant on tracks
-- (the old allowlist function never touched the table, so nothing
-- noticed). The anon/authenticated reads work because their grants
-- come from the RLS policies; service_role bypasses RLS but still
-- needs the table privilege. This one grant is the whole fix.
--
-- Scope is deliberately narrow: SELECT on public.tracks only, for
-- service_role only. No other table, no INSERT/UPDATE/DELETE.
-- Idempotent — re-running is safe.
-- ============================================================================

grant select on public.tracks to service_role;
