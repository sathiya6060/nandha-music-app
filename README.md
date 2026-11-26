# Nandha Music — Streaming App (v1)

**Nandha Music — YOUR BEAT. YOUR ECHO.** Official Tamil music label web app:
Spotify-style streaming, rebuilt from scratch as a **monolith** (one Vite SPA +
Supabase backend-as-a-service). Free tier only. Tamil + English + Hindi UI.
Mobile-first — the mobile player and bottom navigation are the top priority.

## What is built (v1)

- **Auth** — email + Google login (Supabase Auth); roles admin / artist /
  listener with Supabase RLS (admin-only writes). Demo mode when no keys are
  set: pick a role in the admin demo bar, no real account needed.
- **Home** — Popular Tracks, New Releases, Browse by Genre, time-of-day
  sections (Morning Devotional 5–10, Afternoon Melody, Evening Love 6–9,
  Night Calm), rule-based **Your Daily Mix**, **Song of the Day**, Bhakti
  streak hero + morning Aarti alarm.
- **Discover feed** (`/discover`) — vertical full-screen hook cards
  (15–30 s hook clip from `hookStartSec`, Tamil lyric line, cover), swipe
  up = next, heart = save, share = WhatsApp.
- **Search** — 300 ms debounce, server-style search, 20-result cap;
  no-result queries are logged for the admin to see what fans want.
- **Library / Liked / Playlists** — create, follow, share; liked songs in
  localStorage in demo mode.
- **Player** — play/pause, seek, queue, shuffle, repeat, volume, lyrics,
  128/320 kbps switch, preload-next-track-only, Media Session API
  (lock-screen controls), swipe-to-skip, 8-sec Canvas loop behind the
  track, **About the Song** story card (swipe up), synced lyrics
  front-and-centre (split-view ≥1024 px, stacked on mobile).
- **Artist + Album pages** — Nandha Music artist page, composer
  Siddha Guruji credit, Press Kit link.
- **Full editable admin panel** (`/admin`) — dashboard, tracks (paginated,
  filters, bulk publish), track editor (Tamil+English title, artist,
  composer, genre, lyrics, audio+cover upload, hook start/duration,
  schedule/publish/unpublish, soft delete with 30-day restore), albums
  (drag-order via up/down), artists, synced lyrics, curated playlists,
  users/roles, analytics (plays, top cities, no-result searches), site
  settings incl. Song-of-the-Day pick and EPK content.
- **Inbuilt caching (5 layers, all free)** — see Architecture below.
- **EPK page** (`/epk`) — public press kit: bio (Tamil+English), press
  photos, best tracks with embedded player, highlights, social/streaming
  links, contact officialnandhamusic@gmail.com, current release
  *Vaazhvinil Orumurayenum*.
- **Share + SEO** — og:image (Vaazhvinil cover), meta/Twitter tags,
  `public/sitemap.xml`, PWA manifest + service worker (installable,
  offline pinned audio max 50 tracks LRU).
- **i18n** — Tamil (default) + English + Hindi, all 297 keys in each
  locale. Add a language = one file in `src/locales/` + one line in
  `src/lib/i18n.js`. Language switcher in the top bar.
- **Accessibility** — WCAG 2.2 AA target: semantic HTML, one h1 per page,
  aria-labels on icon buttons, focus-visible gold rings, 4.5:1 text
  contrast (bottom-nav inactive labels use a Warm Sand tint, not Steel
  Grey, for this reason), 44 px touch targets, `lang="ta"` on Tamil
  strings, reduced-motion respected.

## Run locally

```bash
cd nandha-music-app
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/ (verified passing)
npm run preview  # serve dist/ locally, e.g. http://localhost:4173
```

No keys are needed to run it: without Supabase/R2/Upstash keys the app
runs in **demo mode** (real track + 199 clearly-marked sample tracks,
localStorage-backed likes/playlists/admin edits).

## Free-tier setup (what Sathiya must create — no credentials in this repo)

1. **Supabase** (free): create a project at supabase.com → SQL Editor →
   run `supabase/migrations/001_schema.sql` (tables + RLS) → copy the
   project URL + anon key into `.env` (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`). Free limits: 500 MB DB, 1 GB storage,
   5 GB egress, 50K monthly users. Note: free projects pause after
   7 days idle — keep a tiny scheduled ping or expect a cold start.
2. **Cloudflare R2** (free): create a bucket, upload audio files
   (128 kbps + 320 kbps per track), make the bucket public via an
   `r2.dev` domain → set `VITE_AUDIO_BASE_URL`. Free: 10 GB storage,
   **zero egress fees**. This is where audio lives, because 200 songs
   at 320 kbps ≈ 1.8 GB — it does NOT fit Supabase free storage (1 GB)
   or egress (5 GB).
3. **Firebase Hosting** (free): `firebase init hosting`, `firebase deploy`
   with `dist/` as the public folder. Replace the placeholder domain
   `nandha-music.web.app` in `public/sitemap.xml` and the EPK share URLs
   with the real hosting domain.
4. **Upstash Redis** (free, optional): create a REST database → set
   `VITE_UPSTASH_REDIS_REST_URL` + `VITE_UPSTASH_REDIS_REST_TOKEN`.
   Without it the app falls back to in-memory + localStorage caching.
   Free: 256 MB, 500K commands/month. (Also pauses/archives after
   30 days idle — same ping solves it.)
5. Copy `.env.example` to `.env` and fill the four values above.
   **Never commit `.env`.**

## Architecture

```
User (mobile PWA / desktop)
  └─ Vite SPA (monolith — one build, no microservices/Kafka/K8s)
       ├─ Metadata path: Supabase Postgres (+ RLS) ──► React Query SWR
       │     └─ Upstash Redis (server cache: home 10 min, search 5 min,
       │        play-count flush every 5 min, rate limiting)
       ├─ Audio path: Cloudflare R2 ──► CDN, HTTP Range (~512 KB chunks)
       │     (audio NEVER touches the API servers)
       ├─ Covers/app shell: Cloudflare CDN + service-worker cache-first
       └─ Client cache: React Query stale-while-revalidate + Cache API
          (pinned audio only, max 50, LRU, 7-day TTL)
```

**Scale decision (1K users): monolith + in-memory caching.** At ~1K
requests the correct shape is a monolith with in-memory caching, not
microservices. The in-memory Map cache is the primary server-side cache;
Redis is a bonus layer for shared reads.

**Invalidation (admin edits):** delete Redis keys `track:{id}`,
`search:*`, `home:*`; React Query invalidates `['tracks']`,
`['track', id]`; covers get a NEW file name on change so the CDN never
serves a stale image; never purge the whole CDN.

## Demo vs real content

- **Real:** 1 track — *Vaazhvinil Orumurayenum* (Annamalaiyar devotional),
  audio `public/assets/vaazhvinil-orumurayenum.mp3` (320 kbps, 44.1 kHz),
  cover `public/assets/vaazhvinil-cover.jpg` (v7 final). Its 4 lyric
  lines are SAMPLE lines (flagged `isSampleLyrics: true`) — the full
  lyrics come from the admin once the release is live.
- **Sample:** 199 tracks labelled `isSample: true` ("Sample Track N —
  Coming Soon", no audio/cover) so pagination, virtual scroll, search,
  Discover and the player queue can be verified with 200+ rows. They
  show a brand placeholder and cannot play.
- **Still needed from Sathiya:** the other 39 songs' MP3s + lyrics
  (on his phone), then upload via the admin panel or R2; Supabase /
  R2 / Firebase / Upstash free-project keys (see setup above).

## Brand

Exact palette only: Amber Gold `#F59E0B`, Charcoal Slate `#1E293B`,
Warm Sand `#FEF3C7`, Steel Grey `#64748B`, Pure White `#FFFFFF`.
Logo: transparent orange N (`public/assets/nandha-logo.png`), lockup
N-first + "NANDHA MUSIC" (`nandha-lockup.png` — RGB on white, used as a
press asset, not on dark surfaces), DP (`nandha-dp.png`). Never the
rejected black-background gold NM logo; no logo redesign. Tamil:
Noto Sans Tamil Bold. Tagline: YOUR BEAT. YOUR ECHO.

## P1 (next) / P2 (later)

- **P1:** Upstash Redis wiring live (code is ready, keys pending),
  admin analytics depth, PWA offline pinned downloads UI polish, synced
  Tamil lyrics for all tracks, artist pages (bio/socials/Artist Pick),
  SEO sitemap regeneration, activity log, axe-core audit pass.
- **P2:** Girivalam Journey Mode (14 km listening journey), lyric quiz,
  artist stories, comments, Jam/shared listening, Song Pulse skip-map,
  playlist folders/pins, karaoke, Premium payments (Razorpay/UPI),
  recommendations ("Because you listened to…"), mobile app (Flutter).
- **Skipped deliberately:** AI DJ, lossless audio, Clips format,
  playlist import, subscriptions/ads/2FA (P2), microservices/Kafka/K8s.

## Known limitations (honest)

- **Not browser-tested:** touch-swipe feel, canvas animation rendering,
  lock-screen Media Session, hook-seek timing, service-worker install
  flow — verified by build + unit assertions only. A live-browser pass
  (and axe-core run — chromedriver download timed out in this VM) is
  still needed before launch.
- **Main JS chunk is 614 KB** (React + router + React Query + Supabase
  client) — Vite warns above 500 KB. Lazy-loading the Supabase client
  is the P1 fix; first load is still fast (gzip 175 KB) with lazy
  images and code-split routes.
- **`play_events` RLS allows anonymous inserts** so guest plays can be
  buffered — it only permits inserting count rows, but confirm this
  trade-off before going live.
- **Aarti alarm** fires only while the app/tab is open (Notification
  API). True background alarms need a push server (P2).
- **Sitemap domain is a placeholder** (`nandha-music.web.app`) — replace
  with the real Firebase Hosting domain at deploy.
- BeMusic (CodeCanyon) was a **feature reference only** — no code,
  branding, or assets from it (or Spotify/rithamly) are in this repo.
