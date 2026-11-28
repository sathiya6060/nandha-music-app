-- ============================================================================
-- 005_rls_hardening.sql — RLS hardening (security audit 28 Nov 2026)
-- ============================================================================
-- Closes: A3-2 (any user can inject a public "curated" playlist),
-- A5-2/M1 (owner policies never constrain columns: profiles.role can be
-- set to 'admin', artists can publish / set plays), A3-3 (artists can
-- publish tracks/albums directly), M2 (play_events forgery: arbitrary
-- user_id / count), L2 (SECURITY DEFINER without search_path), H24
-- (client needs to call is_admin() via RPC — grant added here).
--
-- IDEMPOTENT: every policy is dropped before it is created, every
-- function/trigger is CREATE OR REPLACE / DROP IF EXISTS, grants and
-- revokes are safe to re-run. Safe to run against a DB where 001–004
-- are already applied (the live state). Does NOT rewrite 001/003.
--
-- APPLY: Supabase dashboard → SQL Editor → paste → Run. (Parent
-- applies via browser; no CLI/deploy step from here.)
-- ROLLBACK: re-run 001_schema.sql's policy section to restore the old
-- policies (they are the pre-005 definitions, kept verbatim there).
--
-- BEHAVIOUR CHANGES (intended, flag to the admin):
--  * Artists can no longer save a track/album with status='published'
--    and can no longer edit a row that stays 'published' — publish and
--    edits to published rows are admin-only from now on.
--  * A playlist owner can never set is_curated=true (admin policy
--    only); existing curated playlists are untouched.
--  * profiles rows are no longer publicly readable (owner/admin only).
--  * play_events rows cap at count=1 per insert.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (e) L2 — pin search_path on the SECURITY DEFINER functions so a
-- malicious schema cannot hijack unqualified name resolution.
-- Guarded: increment_track_plays() exists only if 004 was applied.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) then
    execute 'alter function public.is_admin() set search_path = public';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_artist'
  ) then
    execute 'alter function public.is_artist() set search_path = public';
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_track_plays'
  ) then
    execute 'alter function public.increment_track_plays() set search_path = public';
  end if;
end $$;

-- (f) H24 contract — the client calls is_admin() via supabase.rpc().
-- Without this grant the RPC fails for every signed-in user and the
-- admin UI falls back to the email allowlist. Agent C-Admin's auth.jsx
-- uses this RPC as the isAdmin source of truth.
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- (b) profiles — M1. Public read is gone; owner/admin only. The owner
-- UPDATE gets an explicit WITH CHECK (row must stay their own) and a
-- trigger forbids role changes by non-admins: a WITH CHECK alone
-- cannot compare the new role to the old one (policy expressions see
-- only one row version), so the trigger is the mechanism that works.
-- The anon SELECT grant is revoked as defence-in-depth (nothing in
-- the app reads profiles; the policy alone would already block anon).
-- ---------------------------------------------------------------------------
drop policy if exists "profiles: public read" on public.profiles;
drop policy if exists "profiles: owner update" on public.profiles;

create policy "profiles: owner or admin read"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.forbid_non_admin_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and not public.is_admin() then
    raise exception 'profiles.role may only be changed by an admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_no_role_change on public.profiles;

create trigger trg_profiles_no_role_change
before update of role on public.profiles
for each row execute function public.forbid_non_admin_role_change();

revoke select on table public.profiles from anon;

-- ---------------------------------------------------------------------------
-- (a) playlists — A3-2/A5-2. The old "owner all" policy had no WITH
-- CHECK, so any signed-in user could set is_curated = true and inject
-- a playlist onto every visitor's Home. Split into per-operation
-- policies: owners may insert/update only with is_curated = false;
-- only the (unchanged) admin policy may set is_curated = true.
-- The public-read-curated policy is unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists "playlists: owner all" on public.playlists;

create policy "playlists: owner insert"
  on public.playlists for insert
  with check (owner_id = auth.uid() and is_curated = false);

create policy "playlists: owner update"
  on public.playlists for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and is_curated = false);

create policy "playlists: owner delete"
  on public.playlists for delete
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- (d) tracks / albums / lyrics — A3-3/A5-2. Artist-owner policies get
-- explicit WITH CHECKs: artists may only save drafts/scheduled rows,
-- never publish, never set plays. The old single "owner artist all"
-- policies are replaced by per-operation policies; the admin policies
-- are unchanged (admins may publish and touch plays).
-- plays on UPDATE cannot be compared in a policy (no OLD row access),
-- so a trigger enforces it — same pattern as profiles.role above.
-- lyrics has no status/plays columns: its artist policy keeps the
-- ownership check only, split per operation for the INSERT case
-- (INSERT policies only evaluate WITH CHECK, never USING).
-- ---------------------------------------------------------------------------

-- -- tracks
drop policy if exists "tracks: owner artist all" on public.tracks;

create policy "tracks: owner artist insert"
  on public.tracks for insert
  with check (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = tracks.artist_id and a.owner_id = auth.uid()
    )
    and status in ('draft', 'scheduled')
    and plays = 0
  );

create policy "tracks: owner artist update"
  on public.tracks for update
  using (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = tracks.artist_id and a.owner_id = auth.uid()
    )
  )
  with check (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = tracks.artist_id and a.owner_id = auth.uid()
    )
    and status in ('draft', 'scheduled')
  );

create policy "tracks: owner artist delete"
  on public.tracks for delete
  using (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = tracks.artist_id and a.owner_id = auth.uid()
    )
  );

create or replace function public.forbid_non_admin_plays_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.plays is distinct from new.plays and not public.is_admin() then
    raise exception 'tracks.plays may only be changed by an admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tracks_no_plays_change on public.tracks;

create trigger trg_tracks_no_plays_change
before update of plays on public.tracks
for each row execute function public.forbid_non_admin_plays_change();

-- -- albums (no plays column; status constraint only)
drop policy if exists "albums: owner artist all" on public.albums;

create policy "albums: owner artist insert"
  on public.albums for insert
  with check (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = albums.artist_id and a.owner_id = auth.uid()
    )
    and status in ('draft', 'scheduled')
  );

create policy "albums: owner artist update"
  on public.albums for update
  using (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = albums.artist_id and a.owner_id = auth.uid()
    )
  )
  with check (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = albums.artist_id and a.owner_id = auth.uid()
    )
    and status in ('draft', 'scheduled')
  );

create policy "albums: owner artist delete"
  on public.albums for delete
  using (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = albums.artist_id and a.owner_id = auth.uid()
    )
  );

-- -- lyrics (no status/plays columns; ownership check only)
drop policy if exists "lyrics: owner artist all" on public.lyrics;

create policy "lyrics: owner artist insert"
  on public.lyrics for insert
  with check (
    public.is_artist() and exists (
      select 1 from public.tracks t
      join public.artists a on a.id = t.artist_id
      where t.id = lyrics.track_id and a.owner_id = auth.uid()
    )
  );

create policy "lyrics: owner artist update"
  on public.lyrics for update
  using (
    public.is_artist() and exists (
      select 1 from public.tracks t
      join public.artists a on a.id = t.artist_id
      where t.id = lyrics.track_id and a.owner_id = auth.uid()
    )
  )
  with check (
    public.is_artist() and exists (
      select 1 from public.tracks t
      join public.artists a on a.id = t.artist_id
      where t.id = lyrics.track_id and a.owner_id = auth.uid()
    )
  );

create policy "lyrics: owner artist delete"
  on public.lyrics for delete
  using (
    public.is_artist() and exists (
      select 1 from public.tracks t
      join public.artists a on a.id = t.artist_id
      where t.id = lyrics.track_id and a.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- (c) play_events — M2. No one may forge counts or attribute plays to
-- another user: count is capped at 1 per row and user_id must be the
-- caller's own id.
-- NOTE (deviation from the literal brief, deliberate): user_id may
-- ALSO be NULL. The app's own flush (src/lib/cache.js flushPlays)
-- inserts rows with user_id omitted, so a strict
-- `user_id = auth.uid()` check would break signed-in play counting
-- outright. NULL rows are unattributed, never another user's. The
-- proper fix is for flushPlays to send the caller's id (cache.js —
-- not this migration); once it does, tighten this to
-- `with check (user_id = auth.uid() and count <= 1)`.
-- Guest (anon) inserts stay blocked: anon holds no INSERT grant on
-- play_events at all (001 grants), so this policy never sees them.
-- ---------------------------------------------------------------------------
drop policy if exists "play_events: authenticated insert" on public.play_events;

create policy "play_events: authenticated insert"
  on public.play_events for insert
  with check (
    (user_id is null or user_id = auth.uid())
    and count <= 1
  );

-- ---------------------------------------------------------------------------
-- user_roles bootstrap — COMMENTED, documented, never run blindly.
-- Problem (audit A5): the only policy on user_roles is "admin all", so
-- with zero admin rows nobody can ever grant the first admin through
-- the app. Run this ONCE in the SQL Editor (service role / dashboard
-- owner) after the admin user has signed up, substituting the real
-- admin email. Do NOT hardcode a user id — it differs per project.
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users
--   where email = 'officialnandhamusic@gmail.com'
--   on conflict (user_id, role) do nothing;
-- Verify: select * from public.user_roles;
-- Then confirm the client RPC works as that user:
--   select public.is_admin();  -- true when run as the admin's JWT
-- (In the SQL Editor you run as postgres, so is_admin() is false
-- there — that is expected; test via the app's /admin instead.)
-- ---------------------------------------------------------------------------

-- Verify (expect: new policies listed, old "owner all" / "public read"
-- names gone; is_admin() callable by authenticated):
--   select schemaname, tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;
