# Nandha Music App — Architecture

## Stack

- **React 19 + Vite 8**, plain JavaScript (no TypeScript), React Router 7,
  TanStack React Query 5.
- **Supabase (free tier)** — Postgres + Auth + Row Level Security. Metadata
  only: artists, albums, tracks, lyrics, playlists, likes, play events.
- **Supabase Storage (free tier)** — audio file storage, delivered as
  short-lived signed URLs minted per play by the `get-audio-url` Edge
  Function (see `src/lib/signedAudio.js`). Cloudflare R2 was the
  original plan but is NOT used — the R2 account needs a card, which
  is blocked, so no R2 bucket exists and `VITE_AUDIO_BASE_URL` is unset.
- **Upstash Redis (free tier, REST)** — optional shared cache (layer 3).
- **No backend server.** The browser talks to Supabase (PostgREST/Auth/
  Storage via signed URLs) directly; all secrets are env vars
  (`VITE_*`, see `src/lib/config.js`).

Brand: Amber Gold `#F59E0B`, Charcoal Slate `#1E293B`, Warm Sand `#FEF3C7`,
Steel Grey `#64748B`, White `#FFFFFF`. Tamil text: `Noto Sans Tamil`
(fallback `system-ui`).

## Data flow

There are two paths, deliberately separate:

```
Metadata path (small, structured, changes often)
  UI / React Query ──► Supabase PostgREST ──► Postgres (+ RLS)
  Demo mode (no Supabase env): UI ──► src/data/catalog.js (local, 1 real track)

Audio path (large, static, bandwidth-heavy)
  Player ──► resolvePlayableUrl(track, quality) ──► Supabase Edge
             Function `get-audio-url` ──► short-lived signed Supabase
             Storage URL (300 s; the one real mp3 also ships in
             /public/assets as the local fallback)
  '128' kbps default (mobile data) · '320' kbps on Wi-Fi
```

A track row in Postgres never contains audio bytes — only
`audio_128_url` / `audio_320_url` pointing at Supabase Storage. The
player therefore never waits on the database for bytes, and the
database never pays egress for audio.

## Supabase Storage vs R2 — why there is no split any more

The original design split audio to Cloudflare R2 (10 GB free, $0
egress) because 200 songs at ~9 MB each ≈ 1.8 GB would not fit
Supabase free storage (1 GB). That plan is NOT live: the R2 account
needs a card, which is blocked, so no R2 bucket exists. Reality
today: 1 real track, whose mp3 ships in `/public/assets` and in
Supabase Storage, delivered as a signed URL per play. If the catalog
ever grows toward 200 songs, revisit storage then — R2 (or a paid
Supabase tier) becomes the decision to make at that point, not now.

## 5-layer caching (src/lib/cache.js)

```
Request
  1. In-memory Map (TTL: home 10 min · search 5 min · track 1 hr)
  2. localStorage, versioned key `nandha-cache-v1` (lists, 5 min)
  3. Upstash Redis via REST (shared across devices; no-op if unconfigured)
  4. React Query (`queryClientOptions` — staleTime lists 5 min,
     search 2 min, library 1 min; `cacheKeys.*` helpers)
  5. Supabase origin (or local catalog in demo mode)
```

Every layer fails gracefully: an unconfigured/missing layer is skipped,
never throws. Layer 1–2 live in the browser, layer 3 is shared,
layer 4 is the React data layer, layer 5 is the source of truth.

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐   ┌──────────┐
│ Memory   │──►│localStor.│──►│  Redis   │──►│React Query │──►│ Supabase │
│ Map+TTL  │   │ versioned│   │ (Upstash)│   │ staleTime  │   │ Storage  │
└──────────┘   └──────────┘   └──────────┘   └────────────┘   └──────────┘
```

## Invalidation rules

- `invalidateTrack(id)` — track detail + track lists (memory, localStorage,
  Redis, React Query).
- `invalidateHome()` — home feed only.
- `invalidateSearch()` — all cached search results.
- Album / playlist / library invalidation is handled by `invalidateCatalog()` — the
  narrow `invalidateAlbum` / `invalidatePlaylist` / `invalidateLibrary` helpers were
  removed (dead code, no callers).
- All invalidation is best-effort across layers: a Redis failure never
  blocks the UI; React Query invalidation only runs when the app has
  bound its client via `bindQueryClient()` (see `src/lib/cache.js`).
- Rule of thumb: **mutate → invalidate the narrowest key** (one track,
  one album), never wipe the whole cache on a single edit.

## Play counts

`recordPlay(trackId)` only increments an in-memory counter. `flushPlays()`
writes the buffered counts to Supabase `play_events` **every 5 minutes**
or on `visibilitychange` / `beforeunload` — never on every play, so a
listening session costs one batched write instead of hundreds.

## Rate limiting

Client-side token bucket in `src/lib/cache.js`: **100 requests/minute
per action** (`rateLimit(action)`). It protects the free tiers from
accidental loops (e.g. a runaway search box); it is not a security
boundary — real enforcement is RLS on the server.

## Security headers (S7, 27 Nov 2026)

`public/_headers` (served by Cloudflare Pages) sets CSP, HSTS,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy` and `Permissions-Policy` on every route. CSP notes:

- `script-src 'unsafe-inline'` is REQUIRED: `index.html` carries the
  inline boot-guard script (shows a Reload button instead of a silent
  blank page when React fails to mount). The script is first-party,
  static, and touches no user data.
- `style-src 'unsafe-inline'` is REQUIRED: the app sets inline
  `style={{}}` attributes throughout (React inline styles).
- `fonts.googleapis.com` / `fonts.gstatic.com`: Noto Sans Tamil +
  Inter (Google Fonts stays as-is — self-hosting is out of scope).
- `*.supabase.co`: Supabase PostgREST/Auth/Storage + the
  `get-audio-url` Edge Function (signed audio URLs).
- `*.upstash.io`: Upstash Redis REST (guarded reads via redisGuard.js).
- `media-src` allows `blob:` (Media Session / audio element) and
  `https://*.supabase.co` (signed audio).

## Demo mode

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing,
`isDemoMode` is true: `supabase` is `null`, the UI reads
`src/data/catalog.js` (1 real track only — the 199 sample tracks were
deleted 26 Nov 2026, real data only),
audio plays from `/public/assets`, play counts stay local, and Redis
calls are skipped. Everything renders and plays without any account.

## Files

| File | Responsibility |
|---|---|
| `src/lib/config.js` | Env config, demo-mode flag, `audioUrl(track, quality)` |
| `src/lib/supabase.js` | Supabase client (null in demo mode) |
| `src/lib/cache.js` | 5-layer cache, invalidation, play buffering, rate limit |
| `src/data/catalog.js` | Local catalog: 1 real track only, search, lookups |
| `supabase/migrations/001_schema.sql` | Postgres DDL + RLS |
| `docs/architecture.md` | This document |
| `docs/spec.md` | Product spec (PRD) |
