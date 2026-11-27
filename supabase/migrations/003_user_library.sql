-- ============================================================================
-- Nandha Music — 003_user_library.sql (item 8, 27 Nov 2026)
--
-- Supabase sync for the user's library: artist follows. Likes and
-- playlists already had tables in 001 (liked_tracks, playlists,
-- playlist_tracks) — only followed_artists was missing.
--
-- The client (src/lib/userLibrary.js) syncs likes, follows and
-- playlists for signed-in users so they follow across devices;
-- guests stay local-only. If this migration is NOT applied yet, the
-- client detects the missing table (PGRST205) and stays local-only —
-- nothing breaks, nothing is faked.
--
-- Apply in the Supabase SQL Editor (parent dashboard step) BEFORE
-- relying on sync: the app works identically without it (local-only).
-- Idempotent — re-running is safe.
-- ============================================================================

create table if not exists public.followed_artists (
  user_id uuid not null references auth.users (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

create index if not exists idx_followed_artists_user
  on public.followed_artists (user_id, created_at desc);

alter table public.followed_artists enable row level security;

-- A user sees/manages only their own follows (same pattern as
-- liked_tracks in 001).
create policy "followed_artists: owner all"
  on public.followed_artists for all using (auth.uid() = user_id);

-- Admins may read follows (same pattern as the other library tables).
create policy "followed_artists: admin all"
  on public.followed_artists for all using (public.is_admin());

-- GRANTs (H1 pattern from 001): RLS alone is not enough — without
-- these, PostgREST answers 42501 and the client falls back to
-- local-only.
grant select, insert, update, delete
  on table public.followed_artists
  to authenticated;
