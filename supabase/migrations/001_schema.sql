-- ============================================================================
-- Nandha Music — 001_schema.sql
-- Postgres DDL + Row Level Security for the Supabase (free tier) project.
--
-- Apply with:  supabase db push
--   (after creating the free Supabase project and linking it:
--    `supabase link --project-ref <ref>`)
--
-- Design notes:
--   * Metadata lives in Postgres; audio files live in Cloudflare R2
--     (see docs/architecture.md for why — 200 songs ~1.8 GB exceeds the
--     Supabase free 1 GB storage limit, and R2 has zero egress fees).
--     The tracks table therefore stores audio URLs, not audio bytes.
--   * Roles are stored in user_roles (not in auth.users metadata) so they
--     can be changed by an admin without touching Auth.
--   * Public (anon) users may READ published content only. All writes are
--     admin-only, except artists may edit their OWN tracks/albums.
--   * pg_trgm is used for Tamil/English fuzzy title search; if the
--     extension is unavailable on a host, the btree indexes still work
--     and the trigram index creation is the only part to skip.
-- ============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'listener'
    check (role in ('listener', 'artist', 'admin')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One user can hold several roles (e.g. artist + admin). `profiles.role`
-- is the display/default role; `user_roles` is what policies check.
create table if not exists public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('listener', 'artist', 'admin')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Catalog: artists, albums, tracks, lyrics
-- ---------------------------------------------------------------------------
create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ta text,
  bio_en text,
  bio_ta text,
  socials jsonb not null default '{}'::jsonb,
  -- Which auth user owns this artist profile (artist-role editing).
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  title_en text not null,
  title_ta text,
  artist_id uuid not null references public.artists (id) on delete cascade,
  genre text,
  cover_url text,
  release_date date,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  -- Stable public slug used by the app (e.g. 'vaazhvinil-orumurayenum').
  slug text not null unique,
  title_en text not null,
  title_ta text,
  artist_id uuid not null references public.artists (id) on delete cascade,
  album_id uuid references public.albums (id) on delete set null,
  composer text,
  genre text,
  language text not null default 'Tamil',
  duration_sec integer not null check (duration_sec > 0),
  -- Audio lives in Cloudflare R2; store the public URLs, not the bytes.
  audio_128_url text,
  audio_320_url text,
  cover_url text,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published')),
  plays bigint not null default 0,
  release_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lyrics (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  lang text not null default 'ta' check (lang in ('ta', 'en')),
  -- Ordered lines: [{ "text": "...", "startSec": 12.5 }, ...]
  -- `startSec` is null for unsynced (plain) lyrics.
  lines jsonb not null default '[]'::jsonb,
  synced boolean not null default false,
  unique (track_id, lang)
);

-- ---------------------------------------------------------------------------
-- Playlists & likes
-- ---------------------------------------------------------------------------
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  title_en text not null,
  title_ta text,
  description_en text,
  description_ta text,
  cover_url text,
  owner_id uuid references auth.users (id) on delete set null,
  is_curated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  position integer not null default 0,
  primary key (playlist_id, track_id)
);

create table if not exists public.liked_tracks (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  liked_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

-- ---------------------------------------------------------------------------
-- Play events — written by the client in buffered batches (see
-- src/lib/cache.js recordPlay/flushPlays: every 5 min, never per play).
-- ---------------------------------------------------------------------------
create table if not exists public.play_events (
  id bigint generated always as identity primary key,
  track_id uuid not null references public.tracks (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  count integer not null default 1 check (count > 0),
  played_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================
-- Full-text / fuzzy search on track titles + artist name.
-- pg_trgm gin index: supports Tamil + English substring / similarity search.
create index if not exists idx_tracks_search_trgm
  on public.tracks
  using gin ((title_en || ' ' || coalesce(title_ta, '') || ' ' || coalesce(composer, '')) gin_trgm_ops);

create index if not exists idx_tracks_album_id   on public.tracks (album_id);
create index if not exists idx_tracks_artist_id  on public.tracks (artist_id);
create index if not exists idx_tracks_status     on public.tracks (status);
create index if not exists idx_tracks_genre      on public.tracks (genre);
create index if not exists idx_tracks_slug       on public.tracks (slug);
create index if not exists idx_albums_artist_id  on public.albums (artist_id);
create index if not exists idx_albums_status     on public.albums (status);
create index if not exists idx_playlist_tracks_position
  on public.playlist_tracks (playlist_id, position);
create index if not exists idx_play_events_track_id
  on public.play_events (track_id, played_at desc);
create index if not exists idx_liked_tracks_user
  on public.liked_tracks (user_id, liked_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.user_roles      enable row level security;
alter table public.artists         enable row level security;
alter table public.albums          enable row level security;
alter table public.tracks          enable row level security;
alter table public.lyrics          enable row level security;
alter table public.playlists       enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.liked_tracks    enable row level security;
alter table public.play_events     enable row level security;

-- Helper: is the current user an admin? (reads user_roles; SECURITY DEFINER
-- so the check itself is not blocked by RLS on user_roles.)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_artist()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'artist'
  );
$$;

-- -- Profiles: anyone can read a public profile; a user manages their own.
create policy "profiles: public read"
  on public.profiles for select using (true);
create policy "profiles: owner update"
  on public.profiles for update using (auth.uid() = id);
create policy "profiles: admin all"
  on public.profiles for all using (public.is_admin());

-- -- user_roles: only admins may read/change roles (prevents privilege lift).
create policy "user_roles: admin all"
  on public.user_roles for all using (public.is_admin());

-- -- Artists: public read; admin manages; an artist edits their own row.
create policy "artists: public read"
  on public.artists for select using (true);
create policy "artists: admin all"
  on public.artists for all using (public.is_admin());
create policy "artists: owner update"
  on public.artists for update using (owner_id = auth.uid());

-- -- Albums: public reads PUBLISHED only; admin manages all; an artist
-- -- manages albums belonging to an artist profile they own.
create policy "albums: public read published"
  on public.albums for select using (status = 'published');
create policy "albums: admin all"
  on public.albums for all using (public.is_admin());
create policy "albums: owner artist all"
  on public.albums for all using (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = albums.artist_id and a.owner_id = auth.uid()
    )
  );

-- -- Tracks: public reads PUBLISHED only; admin manages all; an artist
-- -- manages tracks of an artist profile they own (artist_id match).
create policy "tracks: public read published"
  on public.tracks for select using (status = 'published');
create policy "tracks: admin all"
  on public.tracks for all using (public.is_admin());
create policy "tracks: owner artist all"
  on public.tracks for all using (
    public.is_artist() and exists (
      select 1 from public.artists a
      where a.id = tracks.artist_id and a.owner_id = auth.uid()
    )
  );

-- -- Lyrics: public reads lyrics of published tracks; writes follow tracks.
create policy "lyrics: public read published track"
  on public.lyrics for select using (
    exists (
      select 1 from public.tracks t
      where t.id = lyrics.track_id and t.status = 'published'
    )
  );
create policy "lyrics: admin all"
  on public.lyrics for all using (public.is_admin());
create policy "lyrics: owner artist all"
  on public.lyrics for all using (
    public.is_artist() and exists (
      select 1 from public.tracks t
      join public.artists a on a.id = t.artist_id
      where t.id = lyrics.track_id and a.owner_id = auth.uid()
    )
  );

-- -- Playlists: curated (public) playlists are readable by all; a user's
-- -- own playlists are readable/writable by that user; admin manages all.
create policy "playlists: public read curated"
  on public.playlists for select using (is_curated = true or owner_id = auth.uid());
create policy "playlists: owner all"
  on public.playlists for all using (owner_id = auth.uid());
create policy "playlists: admin all"
  on public.playlists for all using (public.is_admin());

create policy "playlist_tracks: public read curated"
  on public.playlist_tracks for select using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id
        and (p.is_curated = true or p.owner_id = auth.uid())
    )
  );
create policy "playlist_tracks: owner all"
  on public.playlist_tracks for all using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id and p.owner_id = auth.uid()
    )
  );
create policy "playlist_tracks: admin all"
  on public.playlist_tracks for all using (public.is_admin());

-- -- Liked tracks: a user sees/manages only their own likes.
create policy "liked_tracks: owner all"
  on public.liked_tracks for all using (auth.uid() = user_id);

-- -- Play events: anyone signed in may insert (buffered counts); only
-- -- admins may read the raw rows (aggregates are served via views/RPC).
create policy "play_events: authenticated insert"
  on public.play_events for insert with check (auth.uid() is not null);
create policy "play_events: admin read"
  on public.play_events for select using (public.is_admin());

-- ============================================================================
-- Table GRANTs (H1 — OpenCodeReview, 27 Nov 2026)
-- ----------------------------------------------------------------------------
-- The RLS policies above are NOT enough on their own: Postgres also
-- requires table privileges, and the migration originally shipped NONE.
-- Without these GRANTs PostgREST answers 42501 ("permission denied for
-- table tracks") for anon AND authenticated, and the app silently falls
-- back to the static catalog — B1 (Supabase-backed catalog) does not
-- work live at all. Run this section once in the Supabase SQL Editor
-- (it is idempotent — re-running is safe). Do NOT grant anything on
-- public.user_roles to anon: the client never reads it (is_admin() is
-- SECURITY DEFINER and reads it as the function owner).
-- ============================================================================
grant select
  on table public.tracks, public.albums, public.artists, public.lyrics,
    public.playlists, public.playlist_tracks, public.profiles
  to anon, authenticated;

grant select, insert, update, delete
  on table public.tracks, public.albums, public.artists, public.lyrics,
    public.playlists, public.playlist_tracks, public.profiles,
    public.play_events, public.liked_tracks
  to authenticated;

-- play_events.id is an identity column: inserts need sequence usage.
grant usage, select on sequence public.play_events_id_seq to authenticated;
