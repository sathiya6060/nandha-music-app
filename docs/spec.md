# Nandha Music App — Product Spec (PRD, v1)

## Vision

A Spotify-style streaming web app for Nandha Music — Tamil love,
melody, devotional, Siddhar and Sivan songs — free to listen, fast on
mobile data, and fully manageable by the label without a developer.

## v1 scope

- **Browse & play:** home feed, albums, artists, playlists, search
  (Tamil + English, case-insensitive), full player with 128 / 320 kbps
  quality switch, queue, liked songs.
- **Catalog:** 1 real release at launch — *Vaazhvinil Orumurayenum*
  (2026-12-10). No sample tracks: the 199 placeholders that used to
  pad the UI to 200-track scale were deleted 26 Nov 2026 (real data
  only) — new songs arrive via the admin panel / Supabase, never from
  generators.
- **Lyrics:** Tamil + English lines per track; synced lyrics are a
  stretch goal, plain lines ship first.
- **Admin panel:** full editable admin (tracks, albums, artists,
  playlists, lyrics, release status draft / scheduled / published).
- **Accounts:** listener signup/login (Supabase Auth), likes, library.
- **Performance (free tier):** 5-layer caching, play-count buffering,
  signed Supabase Storage audio delivery — must handle 1,000 users
  without slowing down or exceeding free-tier limits. (Cloudflare R2
  was the original audio plan; it is NOT used — the R2 account needs
  a card, which is blocked.)

## Roles

| Role | Can |
|---|---|
| Listener | Browse/search/play published songs, like tracks, build own playlists |
| Artist | All listener powers + edit their OWN tracks/albums/lyrics |
| Admin | Everything: all content, all users' roles, curated playlists, releases |

Roles live in `user_roles` and are enforced by Postgres RLS
(`supabase/migrations/001_schema.sql`), not just by hiding buttons.

## User stories

**Listener**
- As a listener, I can open the app and immediately play a song with no
  login (demo/guest mode).
- As a listener, I can search "vaazhvinil" or "வாழ்வினில்" and find the
  song in under a second.
- As a listener, I can like a song and find it later in My Library.
- As a listener on mobile data, music plays at 128 kbps; on Wi-Fi I can
  switch to 320 kbps.

**Artist (Siddha Guruji)**
- As an artist, I can edit the lyrics and cover of my own songs, but I
  cannot edit another artist's songs.
- As an artist, I can see play counts for my own tracks.

**Admin (Nandha Music)**
- As an admin, I can add a track, set its status to draft → scheduled →
  published, and have it appear on the home feed when published.
- As an admin, I can create a curated playlist (e.g. "Sivan Songs") and
  order its tracks.
- As an admin, I can grant the artist role to a user.

## Non-goals (v1)

- **Subscriptions / payments** — free tier only; no paid plans in v1.
- **Ads** — no ad slots, no ad SDK.
- **2FA** — P2 (post-v1 hardening item, not a launch blocker).
- Offline downloads, podcasts, social feed, comments, merch store.

## Success criteria (v1)

- Home feed loads in < 2 s on a mid-range phone (cached < 500 ms).
- 200+ songs play without stutter; search returns in < 1 s.
- Zero cost at 1,000 monthly users (all free tiers: Supabase, Upstash).
- Admin can publish a new song end-to-end without code changes.

## Open items

- Real mp3s + lyrics for the 40-song catalog are still with Sathiya —
  album grouping and full catalog import are blocked until they arrive
  (see album plan in project notes).
- Spotify pitch for *Vaazhvinil Orumurayenum* is a separate distribution
  task (RouteNote), not part of this app.
