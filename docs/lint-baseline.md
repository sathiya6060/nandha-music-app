# Lint baseline (S10, 27 Nov 2026)

`npx oxlint` — **34 warnings, 0 errors** (was 233 warnings on 27 Nov
2026 before this pass). `scripts/pre-deploy-check.sh` gates on
`--max-warnings 40`, so the count cannot silently grow again.

## Spotify batch (27 Nov 2026) — count held at 34

The batch briefly pushed the count to 41 warnings + 1 error; all of it
was fixed in the batch, not documented away:

- `src/pages/MixPage.jsx` — `react-hooks(rules-of-hooks)` ERROR: the
  `sub` useMemo sat after an `if (!meta) return …`. All hooks now run
  before the early returns.
- `react(purity)` ×2 — `new Date()` in `Home.jsx` MadeForYou and
  `MixPage.jsx` memos. Fixed by not passing `date` at all: `buildMix`
  defaults to `new Date()` internally.
- `react(set-state-in-effect)` ×1 — the sleep-countdown effect reset
  `sleepRemainingSec` synchronously. The reset moved into the
  `clearSleepTimer` event handler.
- `eslint(no-unused-vars)` ×4 in `mobile-verify/` (left by the
  test-case analysis batch, not the app): dead `sec` helper in
  `full-suite.js` removed, `groupPwa(page, vp, errors)` params renamed
  `_vp`/`_errors`, unused `catch (e)` in `diag-deploy-1280.js` → bare
  `catch {`.

## What was fixed in this pass (199 warnings)

| Fix | Count | How |
|---|---|---|
| Vendored Chrome DevTools files linted by accident | 187 | `mobile-verify/.cache/**` added to `.oxlintrc.json` `ignorePatterns` — that directory is Puppeteer's downloaded Chrome (`inspector_overlay/main.js`, `gdocs_script.js`, …), not project code. Its `no-unused-expressions` (182), `no-eval`, `const-comparisons`, `constructor-super` and one `no-unused-vars` were never ours. |
| Unused vars in `mobile-verify/` scripts | 13 | Renamed to `_`-prefixed names (`_t`, `_reg`, `_started`, …) or removed the binding (`catch {` for unused catch params — oxlint does not exempt `_`-prefixed catch params). Scripts are ad-hoc headless checks; behaviour unchanged. |
| `react(use-memo)` in `PlayerContext.jsx` | 1 | `useMemo(readQueue, [])` → `useMemo(() => readQueue(), [])`. |
| New test exports in `PlayerContext.jsx` | +2 | `guestPreviewEnded` and `stoppedPlayerState` are exported for the Vitest suite; each adds one `only-export-components` warning (accepted, see below). (`PREVIEW_SECONDS` is a const export, allowed by `.oxlintrc.json`.) Net: 233 − 187 − 13 − 1 + 2 = **34**. |

## Remaining 34 warnings (accepted — documented, not ignored)

All 34 are in `src/`; there are 0 in `mobile-verify/` now.

### `react(set-state-in-effect)` — 10 (accepted)

Effects that sync React state with an external system — exactly what
effects are for. Refactoring them into render would break the sync.

- `src/lib/auth.jsx:77` — session restore (Supabase `getSession` /
  `onAuthStateChange`).
- `src/components/TopBar.jsx:29` — search input mirrors the `?q=` /
  `?genre=` URL params.
- `src/components/ConsentBanner.jsx:20`, `src/pages/Search.jsx:47,54`,
  `src/pages/Artist.jsx:41`, `src/pages/PlaylistDetail.jsx:51`,
  `src/player/MobilePlayer.jsx:190`, `src/admin/TrackEditor.jsx:132`,
  `src/player/PlayerContext.jsx:218` — storage-event / prop /
  player-state mirrors (same pattern: an outside change lands in
  state via an effect).

### `react(only-export-components)` — 14 (accepted)

Fast Refresh only. The modules deliberately export constants and
helpers alongside components — splitting them into separate files
would churn every importer for a dev-only warning.

- `src/lib/auth.jsx` (3): `ADMIN_EMAILS`, `DEMO_ROLES`, `useAuth`.
- `src/components/TrackRow.jsx` (4): `getLikedIds` + helpers.
- `src/pages/Library.jsx` (2): `getFollowedArtistIds`, `FOLLOWED_KEY`.
- `src/player/PlayerContext.jsx` (5): `PREVIEW_SECONDS`,
  `guestPreviewEnded`, `stoppedPlayerState`, `formatTime`,
  `usePlayer`. (The first three are test exports added by S10.)

### `react-hooks(exhaustive-deps)` — 6 (accepted, DO NOT "fix")

All six are the same deliberate pattern: an admin `useMemo` lists a
`version` / `sotdVersion` state value it does not read, because
bumping that value is how the admin forces the memo to recompute
after a localStorage-backed edit. Removing the dep would break the
admin refresh (stale lists after save).

- `src/admin/TracksAdmin.jsx:59`, `AlbumsAdmin.jsx:41`,
  `ArtistsAdmin.jsx:59`, `PlaylistsAdmin.jsx:44`,
  `UsersAdmin.jsx:22`, `src/admin/SiteSettings.jsx:51`.

### `react(purity)` — 1 (accepted)

- `src/admin/SiteSettings.jsx:53` — `new Date().toLocaleDateString()`
  for today's label. Time-dependent by nature; the admin page
  re-renders on every edit, so the label is always current. (Wrapping
  it in `useMemo` was tried and reverted: the rule still flags the
  factory, and it would have gone stale across midnight.)

### `react(preserve-manual-memoization)` — 2 (accepted)

- `src/pages/Discover.jsx:139,160` — the `goTo` scroll callback is
  memoised on `[feed.length]`; the compiler cannot preserve it. The
  callback is correct; the warning is about compiler optimisation
  only.

### `react(refs)` — 1 (accepted)

- `src/pages/Discover.jsx:131` — `isPlayingRef.current = …` during
  render, mirroring the live play state for the autoplay effect.
  Deliberate (commented in the file); moving it into an effect would
  read a stale value on the first autoplay tick.
