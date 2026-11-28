# Nandha Music — Setup

How to bring a fresh checkout (or a rebuilt Supabase project) to the
live state, in order. Nothing here is a new feature — it documents the
deploy path, the migration order, and the dashboard steps the repo
cannot do by itself.

## 1. App

```bash
npm install
cp .env.example .env   # fill in real values; NEVER commit .env
npm run dev            # http://localhost:5173
```

Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(publishable key — public-safe by design). Optional:
`VITE_UPSTASH_REDIS_REST_URL` / `VITE_UPSTASH_REDIS_REST_TOKEN`
(**read-only** token only — see §5), `VITE_REDIS_MONTHLY_BUDGET`
(default 450000). `VITE_AUDIO_BASE_URL` stays unset (no R2 bucket;
audio is signed Supabase Storage URLs).

Node: see `engines` in `package.json`
(`^20.19.0 || >=22.12.0` — what Vite 8 requires).

## 2. Database — migrations, in order

Apply in the Supabase dashboard → SQL Editor (or `supabase db push`
if linked). **Do not rewrite 001/003** — they are already applied
live and are not idempotent; re-running them errors.

| File | State |
| --- | --- |
| `001_schema.sql` | Applied live. Not idempotent — do not re-run. |
| `002_gapfix_columns.sql` | Applied live. |
| `003_user_library.sql` | Applied live. Not idempotent — do not re-run. |
| `004_play_counts_trigger.sql` | Applied live. Trigger is idempotent; the backfill now has a `plays = 0` guard (L1) but **must still not be re-run live** without cause. |
| `005_rls_hardening.sql` | **NEW, 28 Nov 2026 — apply.** Idempotent (drop-before-create everywhere). Closes curated-playlist injection, profiles public read + role self-grant, artist publish/plays, play-count forgery; pins `search_path` on the SECURITY DEFINER functions; grants `authenticated` EXECUTE on `is_admin()` so the client can call it via RPC. |
| `006_storage_policies.sql` | **NEW, 28 Nov 2026 — apply.** Idempotent. Storage RLS for the `audio` (private, admin-only) and `covers` (public read, admin-only write) buckets. Conservative version derived from code — verify against the live policy list first (see the file header). |

Verify after applying 005/006 with the queries at the bottom of
each file (policy lists).

## 3. First admin (user_roles bootstrap)

The only policy on `user_roles` is admin-only, so with zero admin
rows nobody can grant the first admin through the app. After the
admin user has signed up, run once in the SQL Editor (do NOT hardcode
a user id — it differs per project):

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
where email = 'officialnandhamusic@gmail.com'
on conflict (user_id, role) do nothing;
```

The same block is kept as a comment in `005_rls_hardening.sql`.
The client checks admin via `supabase.rpc('is_admin')` (granted in
005); the email allowlist in `auth.jsx` is only a UI-routing
fallback if that RPC errors.

## 4. Edge Functions — deploy after any change

```bash
supabase functions deploy get-audio-url
supabase functions deploy redis-cache
supabase functions deploy delete-account
```

Leave **Verify JWT ON** for all three. Secrets:
`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
are **auto-injected** — no manual secret is needed any more
(`delete-account` previously needed a manually-set `SERVICE_ROLE_KEY`;
that name is retired — do not re-add it). `redis-cache` needs the two
`UPSTASH_REDIS_REST_*` secrets set in the dashboard (full-access
token, server-side only). `ALLOW_LOCAL_DEV=true` is the only way to
allowlist `http://localhost:5173` for CORS; it is off by default in
production.

What changed 28 Nov 2026 (code fixed, deploy pending): `get-audio-url`
checks the DB (track exists AND `status='published'`) instead of a
hardcoded 3-file allowlist, with tiered expiry (300 s authenticated,
60 s anonymous — the guest 5 s preview still works, but anonymous
minting of full songs is time-boxed, not eliminated; see the file
header). `redis-cache` accepts only the exact home key
`nandha:nandha-cache-v1:home` and schema-validates SET values.

## 5. Upstash token scope — dashboard check (H25, needs-dashboard)

The browser token's scope cannot be verified from code. In the
Upstash console → the Redis database → REST API → confirm the token
in `VITE_UPSTASH_REDIS_REST_TOKEN` is the **read-only** token: in the
browser devtools, `GET <rest-url>/get/<any-key>` with that token must
succeed, while `SET` (e.g. `POST <rest-url>` with
`["SET","probe","x"]`) must fail with an authorization error. If the
token can write, rotate it to a read-only token immediately — a
full-access token in a `VITE_*` variable is baked into the public JS
bundle. The full-access token lives ONLY in the `redis-cache` Edge
Function env.

## 6. Repo-vs-deploy drift (A1-5)

The live site serves files that are NOT in version control, because
deploys run from local `dist/` via wrangler:

- `public/assets/` — `nandha-lockup.png`, `nandha-logo.png`,
  `nandha-og.jpg`, `vaazhvinil-cover-800.webp`, `vaazhvinil-cover.jpg`,
  `vaazhvinil-orumurayenum.mp3` (the deliberate 1-second silent mp3 —
  do NOT delete it; it keeps the old public URL for that path harmless)
- `public/version.json` (rewritten by `prebuild` on every build)

Wrangler uploads whatever is in local `dist/`, so a file present
locally ships with no review and a file missing locally is lost from
the deploy. Do NOT move binaries into the repo to "fix" this without
the user's say-so (they cannot be committed without GitHub writes
anyway, and the app dir is not a git repo). Before any deploy, check
`dist/` actually contains the assets above.

## 7. Deploy (Cloudflare Pages, wrangler only)

```bash
bash scripts/pre-deploy-check.sh   # UNPIPED — never through tail/grep
python3 ~/workspace/custom-connectors/custom.cloudflare/bin/pages_deploy.py
```

The script runs `npx -y wrangler@4 pages deploy <dist>
--project-name nandhamusic --branch main`. Wrangler (not the
direct-upload API) is what applies `public/_headers` — a
direct-upload deploy would silently lose CSP/HSTS/cache rules.
`wrangler.toml` in the repo pins the project name; the script's CLI
flags override it. After a deploy, verify the live `buildId` changed
(`curl https://nandhamusic.pages.dev/version.json`).

## 8. Dashboard steps the repo cannot do (needs-dashboard)

These live in Supabase / Cloudflare dashboards, not in code — the
parent applies them via browser:

1. Supabase Auth → URL Configuration: Site URL
   `https://nandhamusic.pages.dev`; add redirect URLs (including
   `http://localhost:5173`).
2. Confirm email confirmation is enabled for sign-ups (decides
   whether an attacker can re-register the admin email — audit A2-4)
   and whether CAPTCHA/Turnstile is on for auth (A2-10).
3. Cloudflare Pages → Production env vars (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, Upstash read-only token); redeploy after
   setting.
4. Verify live: the 7 pre-existing storage policies vs `006`
   (remove contradicting ones only after 006 is in place); the
   `user_roles` row for the admin exists; Edge Function deploy state
   matches the repo files.
5. `mobile-verify/` stays in the repo tree for now (Agent A depends
   on `mobile-verify/proxy.js` for harness runs this pass). Moving it
   out of the published tree — and removing the unauthenticated local
   forward proxy in `proxy.js` — needs a user decision; it is NOT
   shipped in `dist/`.
