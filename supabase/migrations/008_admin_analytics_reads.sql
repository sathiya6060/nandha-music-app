-- ============================================================================
-- Nandha Music — 008_admin_analytics_reads.sql (admin redesign, 28 Nov 2026)
--
-- WHAT IT UNLOCKS: the Dashboard Likes + Followers metrics.
--   * liked_tracks has ONLY an owner-only policy (001_schema.sql:
--     "liked_tracks: owner all"), so an admin client counting all
--     likes gets 0 rows / a permission error. Until this migration is
--     applied, the Dashboard HIDES the Likes metric instead of
--     showing 0.
--   * followed_artists already has an admin policy in
--     003_user_library.sql ("followed_artists: admin all"), so the
--     Followers metric works as soon as 003 is applied. The
--     "followed_artists: admin read" policy below is a belt-and-braces
--     re-creation (idempotent, select-only) so the Dashboard does not
--     depend on 003 having been applied; it does NOT replace or drop
--     the 003 policy.
--
-- APPLY: Supabase dashboard → SQL Editor → paste → Run. (A separate
-- browser task applies migrations; this file is NOT applied by the
-- agent that wrote it, and no SQL was run against the live database.)
-- IDEMPOTENT: each policy is dropped before it is created; re-running
-- is safe. Grants follow the H1 pattern from 001 (RLS alone is not
-- enough — without the authenticated SELECT grant PostgREST answers
-- 42501).
-- ============================================================================

-- -- liked_tracks: admins may read every user's likes (count only is
-- -- used by the Dashboard; no write access is granted).
drop policy if exists "liked_tracks: admin read" on public.liked_tracks;

create policy "liked_tracks: admin read"
  on public.liked_tracks for select
  using (public.is_admin());

-- -- followed_artists: admins may read every user's follows.
-- -- (003 already grants "admin all"; this select-only policy is the
-- -- same read in the 008 style so the metric works even if 003 was
-- -- skipped. The 003 policy is left untouched.)
drop policy if exists "followed_artists: admin read" on public.followed_artists;

create policy "followed_artists: admin read"
  on public.followed_artists for select
  using (public.is_admin());

-- GRANTs (H1 pattern from 001): the admin client reads these tables
-- as `authenticated`; without the grant the policy never gets a
-- chance to allow the read.
grant select on table public.liked_tracks to authenticated;
grant select on table public.followed_artists to authenticated;

-- Verify (expect: both policies listed):
--   select schemaname, tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public'
--     and policyname in ('liked_tracks: admin read', 'followed_artists: admin read')
--   order by tablename, policyname;
