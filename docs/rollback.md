# Nandha Music — Rollback + keep-alive (S11, 27 Nov 2026)

## Rollback

Cloudflare Pages keeps **every** deployment — a bad deploy is never
destructive. Roll back in one of two ways:

### Option A — Dashboard (fastest, no rebuild)

1. Cloudflare dashboard → Workers & Pages → `nandha-music` →
   **Deployments**.
2. Find the last good deployment (see "Deployment ids" below for the
   known-good ones) → **⋯ → Rollback to deployment** (or "Retry
   deployment" on that row, depending on the dashboard wording).
3. Wait for the deployment to go live, then verify:
   `https://nandha-music.pages.dev/` renders at 390px, the track
   page plays, and `/version.json` shows the rolled-back `buildId`.

### Option B — Redeploy the previous build

1. Rebuild the previous known-good source (GitHub repo
   `sathiya6060/nandha-music-app`, previous commit) with
   `npm run build` — or, if the old `dist/` is still on disk, use it
   as-is.
2. Deploy it with the deploy script (do NOT hand-roll the API calls):
   `python3 ~/workspace/custom-connectors/custom.cloudflare/bin/pages_deploy.py`
   It prints the new deployment id — record it below / in MEMORY.md.
3. Verify as in Option A, step 3.

### Deployment ids (record every deploy here AND in MEMORY.md)

| Deployment id | Date (IST) | Build id | What shipped |
|---|---|---|---|
| `48a96ba1` | 26 Nov 2026 23:30 | `mwxuwajb-48082d52` | Emil UI polish + OCR fixes + Ponytail deletions + redisGuard (latest known-good before Phase 4) |
| `37a6f0d0` | 26 Nov 2026 22:47 | `mwxtc7fu-3428bbec` | redisGuard + tiered load-balancing |
| `26dbac4b` | 26 Nov 2026 22:30 | `mwxsoy37-05831e7e` | Ponytail deletions |

> Before Phase 4 these ids lived ONLY in MEMORY.md. Keep this table
> updated on every deploy — the dashboard lists deployments too, but
> this table is the fast path when the site is down and nobody
> remembers which id was good.

### What rollback does NOT fix

- **Supabase data** (tracks/albums/playlists/roles) — rollback only
  restores the frontend build. A bad admin edit is undone in the
  admin panel / Supabase dashboard, not by redeploying.
- **The service worker**: a rolled-back build ships its own `sw.js`;
  a tab that already holds the newer SW updates on next visit (the
  app shows the "New version available — Refresh" banner). A poisoned
  SW cache still needs one full tab close + fresh reopen.
- **Signed audio URLs** are minted per play (300 s) — unaffected.

## Keep-alive ping (not built yet — future work)

**Why:** Supabase free projects **pause after 7 days idle** and
Upstash free databases **archive after 30 days idle**. A small
scheduled ping solves both; none exists yet.

**What to ping (important):** pinging the static
`https://nandha-music.pages.dev/version.json` only proves Pages is
up — it never touches Supabase or Upstash, so it keeps **nothing**
alive. A real keep-alive must exercise both backends:

- **Supabase:** any read that reaches PostgREST — e.g. a scheduled
  headless load of the home page (the home feed queries tracks), or a
  `GET` to the Supabase REST endpoint for `tracks?select=id&limit=1`
  with the anon key.
- **Upstash:** a Redis-guarded read — the same home-page load does it
  once Redis is configured (guard tier: memory → localStorage →
  Redis → source). Until Redis is configured there is nothing to keep
  alive on the Upstash side.

**How often:** at least every **6 days** for Supabase (inside the
7-day pause window) and every **29 days** for Upstash — in practice
one scheduled run **daily** (or weekly at minimum) covers both, and
daily traffic from real listeners already counts.

**How (when built):** a cron that loads the home page headlessly (the
existing `mobile-verify/` scripts already do this shape) or a tiny
scheduled Edge Function — NOT a third-party uptime service, and NOT a
ping that writes data (no play events, no writes of any kind).
