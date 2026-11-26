# Nandha Music App — Architecture

## Stack

- **React 19 + Vite 8**, plain JavaScript (no TypeScript), React Router 7,
  TanStack React Query 5.
- **Supabase (free tier)** — Postgres + Auth + Row Level Security. Metadata
  only: artists, albums, tracks, lyrics, playlists, likes, play events.
- **Cloudflare R2 (free tier)** — audio file storage + public delivery.
- **Upstash Redis (free tier, REST)** — optional shared cache (layer 3).
- **No backend server.** The browser talks to Supabase (PostgREST/Auth)
  and R2 directly; all secrets are env vars (`VITE_*`, see `src/lib/config.js`).

Brand: Amber Gold `#F59E0B`, Charcoal Slate `#1E293B`, Warm Sand `#FEF3C7`,
Steel Grey `#64748B`, White `#FFFFFF`. Tamil text: `Noto Sans Tamil`
(fallback `system-ui`).

## Data flow

There are two paths, deliberately separate:

```
Metadata path (small, structured, changes often)
  UI / React Query ──► Supabase PostgREST ──► Postgres (+ RLS)
  Demo mode (no Supabase env): UI ──► src/data/catalog.js (local, 200 tracks)

Audio path (large, static, bandwidth-heavy)
  Player ──► audioUrl(track, quality) ──► Cloudflare R2 public URL
             (or /assets/*.mp3 in demo mode — served from /public/assets)
  '128' kbps default (mobile data) · '320' kbps on Wi-Fi
```

A track row in Postgres never contains audio bytes — only
`audio_128_url` / `audio_320_url` pointing at R2. The player therefore
never waits on the database for bytes, and the database never pays
egress for audio.

## R2 vs Supabase storage — why the split

| | Supabase Storage (free) | Cloudflare R2 (free) |
|---|---|---|
| Storage | 1 GB | 10 GB |
| Egress | metered / paid beyond free allowance | **$0 egress** |

200 songs at ~9 MB each ≈ **1.8 GB** — already over Supabase free
storage before a single user listens, and every stream would cost
egress. R2 holds the whole catalog free and serves it free. Supabase
keeps what it is good at: structured metadata, auth, and RLS.

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
│ Map+TTL  │   │ versioned│   │ (Upstash)│   │ staleTime  │   │  / R2    │
└──────────┘   └──────────┘   └──────────┘   └────────────┘   └──────────┘
```

## Invalidation rules

- `invalidateTrack(id)` — track detail + track lists (memory, localStorage,
  Redis, React Query).
- `invalidateHome()` — home feed only.
- `invalidateSearch()` — all cached search results.
- `invalidateAlbum(id)` — album detail + track lists.
- `invalidatePlaylist(id)` / `invalidateLibrary(userId)` — same pattern.
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

## Demo mode

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing,
`isDemoMode` is true: `supabase` is `null`, the UI reads
`src/data/catalog.js` (1 real track + 199 clearly-marked samples),
audio plays from `/public/assets`, play counts stay local, and Redis
calls are skipped. Everything renders and plays without any account.

## Files

| File | Responsibility |
|---|---|
| `src/lib/config.js` | Env config, demo-mode flag, `audioUrl(track, quality)` |
| `src/lib/supabase.js` | Supabase client (null in demo mode) |
| `src/lib/cache.js` | 5-layer cache, invalidation, play buffering, rate limit |
| `src/data/catalog.js` | Local catalog: 1 real + 199 sample tracks, search, lookups |
| `supabase/migrations/001_schema.sql` | Postgres DDL + RLS |
| `docs/architecture.md` | This document |
| `docs/spec.md` | Product spec (PRD) |
