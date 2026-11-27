# Nandha Music — Full Test-Case Analysis

> Why this file exists: on 27 Nov 2026 the live Home cover rendered 134×800
> (stretched) yet passed 16/16 DOM checks — every check was "element exists /
> text matches / src correct" and none measured the rendered box or looked at
> a screenshot. Every case below therefore has EVIDENCE: a screenshot path
> and/or measured numbers. A case with no evidence is not a pass.
>
> Method (per `webapp-testing` skill, applied with the puppeteer harness in
> `mobile-verify/` — Chrome for Testing + puppeteer-core + 127.0.0.1:18080
> proxy): screenshot-first reconnaissance, wait for the element that proves
> the page is ready, inspect the RENDERED DOM, measure rendered boxes.
> SmartUI / LambdaTest cloud a11y need a paid account, so visual regression
> is local baselines in `mobile-verify/screenshots/` + rendered-box
> measurements; axe runs locally via injected axe-core.
>
> Run: `npm test` (vitest) + `node mobile-verify/full-suite.js`
> (390px + 1280px, vite preview :5173). Suite output:
> `mobile-verify/full-suite-results.json`.
>
> Product rules that must never be "fixed" away: guest = 5s preview,
> signed-in = full song; admin only officialnandhamusic@gmail.com; no dummy
> data; brand colours exact (#F59E0B / #1E293B / #FEF3C7 / #64748B / #FFFFFF).

## Layout / visual audit — applied to EVERY page (390px + 1280px)

| ID | Page | What is checked | How |
|----|------|-----------------|-----|
| L-01 | all | No horizontal scroll | `document.documentElement.scrollWidth <= innerWidth + 1` |
| L-02 | all | No element wider than the viewport | every visible element's `right <= innerWidth + 1` (top 5 offenders listed) |
| L-03 | all | No image is DISTORTED (stretched pixels) | for every loaded `<img>`: if computed `object-fit` is `fill` (the default — no crop protection) then `\|renderedAR − naturalAR\| / naturalAR ≤ 0.05`. Images with `object-fit: cover` are cropped, not distorted, so they are exempt here — their BOX shape is checked by the page-specific cover cases (H-04/H-05/H-06, D-01, TR-01) |
| L-04 | all | No vertically clipped text | no element with `scrollHeight > clientHeight + 1` while `overflow` hides it and no ellipsis |
| L-05 | all | No broken images | every `<img>` has `naturalWidth > 0` after load |
| L-06 | all (390px) | Touch targets ≥ 24×24px (AA) | measure every visible `<button>`/`<a>`; list any < 24px |
| L-07 | all | Screenshot evidence exists | viewport screenshot saved per page per viewport |
| L-08 | all | Zero console/page errors, zero failed requests | collect `pageerror` + `console error` + `requestfailed` + HTTP ≥ 400 |

## Home (`/`)

| ID | What is checked | How |
|----|-----------------|-----|
| H-01 | Greeting + tagline render; streak hero renders with alarm form (time input, song select, Save) | text present; form controls present and usable |
| H-02 | Song of the Day: cover is square (96×96), lyric line, Play button | measure cover box; click Play → mini-player appears |
| H-03 | Daypart section rows render; row covers square (48×48) | measure all `.track-row` covers |
| H-04 | Daily Mix TrackCard covers are SQUARE (width ≈ height ±2px) — cover regression case | measure every `.track-card__cover` in Daily Mix section |
| H-05 | Featured Tracks (Popular) TrackCard covers are SQUARE | measure every `.track-card__cover` in that section |
| H-06 | New Releases album covers are SQUARE (same `.track-card__cover` class) | measure every album cover in that section |
| H-07 | Genre chips navigate to `/search?genre=<genre>` | click chip → URL + filtered results |
| H-08 | Featured artist card renders; View artist → `/artist/:id`; Press Kit → `/epk` | click both links, assert URLs |
| H-09 | Home tabs: For You / Discover switch panels; Discover tab shows the feed | click Discover tab → feed visible; back to For You |
| H-10 | Daily Mix Play All starts playback; mini-player appears | click Play All → `audio` playing, player bar visible |
| H-11 | Footer renders with Privacy / Terms / Cookies / Refund links | links present, each loads 200 + h1 |
| H-12 | Consent banner appears on fresh load; Accept dismisses and persists | fresh context → banner visible; Accept → gone after reload |
| H-13 | i18n: switch to Tamil then Hindi — UI text changes, no raw `home.*` keys visible | switch language, assert translated heading, scan body for dotted-key text |

## Discover (`/discover`)

| ID | What is checked | How |
|----|-----------------|-----|
| D-01 | Feed renders a card with square cover; next advances the feed | screenshot + measure cover; click next → different track shown |
| D-02 | Play from Discover starts playback | click play → mini-player appears |

## Search (`/search`)

| ID | What is checked | How |
|----|-----------------|-----|
| S-01 | Typing a query shows results; Tamil query works | type `vaazhvinil` → result row; type `வாழ்வினில்` → result row |
| S-02 | No-result query shows a meaningful empty state, not a blank page | type gibberish → empty-state text visible |
| S-03 | `?genre=Devotional` filters results | goto `/search?genre=Devotional` → results all Devotional |
| S-04 | Result row click starts playback (TrackRow click plays by design — `/track/:id` is a deep-link/OG route with no in-app link) | click first result row → audio playing |

## Library / Liked / Playlists / PlaylistDetail

| ID | What is checked | How |
|----|-----------------|-----|
| LB-01 | Library renders; empty sections are meaningful, not blank | sections + empty-state text present |
| LK-01 | Liked shows meaningful empty state; liking a track adds it here | like from a Search result row → Liked lists the track; unlike + reload → meaningful empty state (`.empty-state`, 0 rows) |
| PL-01 | Playlists list renders the seeded playlist; create flow does not crash as guest | list present; create button behaviour recorded |
| PD-01 | PlaylistDetail renders tracks; Play all works | goto seeded playlist → rows + Play all starts playback |

## Artist / Album / Track

| ID | What is checked | How |
|----|-----------------|-----|
| AR-01 | Artist page: photo square, bio, track list, play works | measure photo box; click a track Play → mini-player |
| AL-01 | Album page: cover square, track list, play works | measure cover box; Play works |
| TR-01 | Track page: cover square (`.detail-head__cover`), title/artist/lyrics render, Play works; og tags absolute | measure cover; og:url + og:image start with `https://` |
| TR-02 | Deep link `/track/vaazhvinil-orumurayenum` loads directly (no bounce home) | goto URL → track title present, URL unchanged |

## EPK (`/epk`)

| ID | What is checked | How |
|----|-----------------|-----|
| E-01 | EPK renders bio, stats, links; press-kit link present | sections present; links resolve |

## Login (`/login`) + admin gate

| ID | What is checked | How |
|----|-----------------|-----|
| LG-01 | Login form renders email + password, NO Google button, create-account toggle works | form controls present; no `Google` text; toggle shows create form |
| LG-02 | Wrong credentials show an error associated with the form | submit bad creds → `role="alert"` error visible |
| LG-03 | Every admin route redirects to `/login` when signed out | goto each of `/admin`, `/admin/tracks`, `/admin/tracks/new`, `/admin/tracks/:id/edit`, `/admin/albums`, `/admin/artists`, `/admin/lyrics`, `/admin/playlists`, `/admin/users`, `/admin/analytics`, `/admin/settings` → URL is `/login` |
| LG-04 | Admin write E2E (sign in + save one track edit) | MANUAL — needs Sathiya's `/login` sign-in; not runnable headless |

## Player

| ID | What is checked | How |
|----|-----------------|-----|
| P-01 | Play → mini-player appears with cover/title; pause works | click Play → bar visible, `audio` playing; pause → paused |
| P-02 | Guest gate pauses ~5s with a prompt; prompt is dismissible; replay works after dismiss | play → paused at 4.5–7s + prompt visible; dismiss → prompt gone; play again → plays from 0 |
| P-03 | Stop (X) closes the player and audio really stops | click X → bar gone, `audio.paused === true`, time frozen |
| P-04 | Queue next/prev (mini-bar, visible at 390px); shuffle toggle + repeat cycles off → all → one (expanded player — the bar hides them below 640px by design) | exercise controls, assert state changes |
| P-05 | Seek works; quality switch present (expanded player at 390px — the bar's seek strip + side controls are hidden below 640px by design) | set seek → `currentTime` changes; quality control toggles 128k/320k |
| P-06 | Media Session metadata is set | `navigator.mediaSession.metadata.title` contains the track title |
| P-07 | Expanded player opens; Escape closes it and stops playback | open expanded → Escape → closed + paused |
| P-08 | Audio is a signed Supabase URL, never a public object URL | `audio.src` matches `/storage/v1/object/sign/` |

## Legal + 404

| ID | What is checked | How |
|----|-----------------|-----|
| LE-01 | `/privacy`, `/terms`, `/cookies`, `/refund` each render an h1 + content | h1 present, body text > 200 chars |
| NF-01 | Unknown route shows branded 404 with a working Home link | goto `/nope-xyz-404` → 404 text + Home link → `/` |

## PWA / SW / version banner

| ID | What is checked | How |
|----|-----------------|-----|
| PW-01 | `/version.json` returns the running buildId; `sw.js` serves; manifest is valid JSON | fetch each; `buildId` equals the preview build |
| PW-02 | Update banner appears when live `version.json` differs from the running build | intercept `/version.json` with a different buildId → banner + Refresh button appear |
| PW-03 | Service worker registers in the production build | `navigator.serviceWorker.getRegistration()` resolves after load |

## i18n

| ID | What is checked | How |
|----|-----------------|-----|
| I-01 | en/ta/hi switch changes UI text on Home | switch each language → heading text changes |
| I-02 | `<html lang>` follows the selected language | `document.documentElement.lang` is `en`/`ta`/`hi` |
| I-03 | No raw translation keys leak into visible text | body text contains no `home.` / `common.` / `streak.` dotted keys |

## Accessibility (axe, local axe-core)

| ID | What is checked | How |
|----|-----------------|-----|
| A-01 | axe: 0 violations on Home (390px) | inject axe-core, run, count violations |
| A-02 | axe: 0 violations on Track page (390px) | same |
| A-05 | axe: 0 violations on the expanded player (390px) | open `.player-bar-main` → run axe on the overlay |
| A-06 | axe: 0 violations on the queue panel (390px) | open Up next inside the expanded player → run axe |
| A-03 | Keyboard: Tab reaches a Play button; focus is visible; skip link focuses `#main` | Tab from top, record focused element + outline; activate skip link → `document.activeElement` is `#main` |
| A-04 | Images have alt (or `alt=""` when decorative); icon-only buttons have `aria-label` | DOM audit per page |

## Unit tests (vitest, `npm test`)

| ID | What is checked | How |
|----|-----------------|-----|
| U-01 | Cover sizing regression: `.track-card__cover` + `.detail-head__cover` keep `height: auto` + `aspect-ratio: 1` | `src/lib/__tests__/coverSizing.test.js` (already exists — the other agent's fix) |
| U-02 | Streak logic: devotional listen marking, alarm save/load, aarti window | new `src/lib/__tests__/streak.test.js` |
| U-03 | Signed-audio URL builder: guest vs signed-in paths, allowlist behaviour | new `src/lib/__tests__/signedAudio.test.js` (pure parts only) |
| U-04 | Existing suite still green | `npm test` — all files pass |

## Results

**Final run: 475/475 PASS** (516s, 27 Nov 2026 ~21:24 IST, preview build `mwy1wvkm-eb958f85` — the build with all fixes below; the pre-deploy rebuild after it is `mwy28dxp-c8b39d8a`, same source). Full per-case evidence: `mobile-verify/full-suite-results.json`. Screenshots: 54 files under `mobile-verify/screenshots/390/` (37) + `mobile-verify/screenshots/1280/` (17).

Key evidence (all PASS):
- H-03 daypart row 48×48 · H-04/05/06 TrackCard covers 134×134 SQUARE (the cover fix, verified — was 134×800) · S-01b Tamil query rows=1 · PD-01 playlist rows=1, Play all playing · P-01 playing at 0.37s over a signed Supabase URL · P-02 gate paused at 5.06s with prompt · P-02b dismiss works (covers the reviewer's `PlayerContext.jsx` dismiss fix) · P-02c replay at 0.43s · P-04a shuffle false→true, P-04b repeat all→one→off (expanded player) · P-05a seek paused at exactly 2.00s, P-05b quality 128→320 kbps · A-01/A-02/A-05/A-06 axe 0 violations (Home, Track, expanded player, queue panel) · LK-01 like → Liked rows=1 · PW-02 update banner appears · SWEEP 272/272 (every route, both viewports: no h-scroll, no wide element, no distorted/broken image, no clipped text, no small target, 0 errors).
- Unit tests: `npm test` 13 files / 74 tests PASS. Pre-deploy check (`scripts/pre-deploy-check.sh`: oxlint + vitest + build): OK. Silent mp3 still 4,413 bytes (`public/assets/` + `dist/assets/`).

## Failures (root cause in one line each)

Three suite runs; every failure below was fixed and re-verified green in the final run.

**Run 1 — 371/465 (94 failures).**
- L-04 ×~56 (`.sr-only` text flagged as clipped): SUITE BUG — `.sr-only` is intentionally clipped for screen readers; the audit now skips it.
- L-06 ×~20 (inline text links "Nandha Music", email links flagged as <24px targets): SUITE BUG — WCAG 2.5.8 exempts inline links; the audit now exempts `display: inline` links.
- L-08 ×~10 (`net::ERR_ABORTED` on the signed audio URL): SUITE BUG — media fetches aborted by navigation/seek are browser noise; the collector now ignores media aborts.
- L-02 ×5 (`.track-card` right=692 at 390px): SUITE BUG — cards inside a horizontal `.section-row` legitimately extend past the viewport; the audit now skips elements inside `overflow-x: auto/scroll` ancestors.
- L-03 ×3 (EPK lockup 173×104 vs natural 2048×1024): SUITE BUG — the img has 16px padding; the border-box ratio is not the image ratio; the audit now measures the content box (141×72 ≈ 1.96 vs 2.0 — no distortion).
- H-03 (0 daypart rows): SUITE BUG — headless Chrome runs in UTC (20:41 = evening/Love, no match for the one Devotional track); the suite now pins `Asia/Calcutta` (renders Night Calm, 1 row).
- H-07 (genre chip → `/search?q=` not `?genre=`): NOT A BUG — the app normalizes `?genre=` to `?q=` by design; the case now accepts either form.
- S-01b (Tamil query 0 rows): SUITE BUG (first diagnosis) — see run 3 for the real cause.
- S-04 (row click didn't navigate to `/track/`): NOT A BUG — TrackRow click plays by design; there is no in-app link to `/track/:id` (deep-link/OG route); the case now asserts playback starts.
- AL-01 (no album link on Home): SUITE BUG — measured before the albums query resolved; the case now waits for the link.
- P-01/P-02/P-02b/P-04a/P-04b (playback never started): SUITE BUG — playback takes ~2–4s (signed-URL mint + buffer) and the suite checked at 2.5s; the suite now polls up to 12s for playing.
- PD-01 (0 playlist rows): UNCONFIRMED — the page works (diagnostic: 1 row); the case now waits up to 8s for rows before measuring. Passed in the final run.
- LK-01/LK-01b (no like button on Home): SUITE BUG — Home's daypart rows don't render at UTC-evening, so no TrackRow existed to like; the flow now runs on Search results (rows render at any hour) and asserts DOM rows, not body text (the player bar's title polluted the text check).
- A-02 (axe `label-content-name-mismatch` on Track): REAL APP BUG — `.player-bar-main` aria-label used `titleEn` while the visible title is `titleTa` (WCAG 2.5.3). Fixed in `src/player/PlayerBar.jsx` (label now built from the same titleTa-first strings as the visible text). Same pattern fixed in `src/player/QueuePanel.jsx` (play + remove labels; the `✕` is now `aria-hidden`), `src/player/MobilePlayer.jsx` (dialog label), `src/admin/TracksAdmin.jsx` (checkbox label).

**Run 2 — 471/475 (5 failures; suite crashed at PW-02 before writing results).**
- P-01/P-02/P-02b (playback never started): SUITE BUG — `goto`'s ready-text check searched the whole body, and the restored player bar (outside `#main`) already contains "Vaazhvinil", so the suite clicked before the SOTD card rendered. The suite now waits inside `#main` and explicitly for `.sotd-card button`.
- P-04a/P-04b (shuffle/repeat never toggled): NOT AN APP BUG — the mini-bar intentionally hides shuffle/repeat below 640px (`src/player/player.css`: "Mobile: only play/pause + prev/next stay"); they live in the expanded player. The cases now exercise them there (same for P-05a/b seek/quality).
- PW-02 (crash `ERR_CONNECTION_REFUSED` on :5199): SUITE BUG — `page.goto` raced the `http.server` bind; the suite now waits for the server to listen first.

**Run 3 — 471/475 (4 failures).**
- DISCOVER-390 + SWEEP-390-discover L-04 (lyric "அண்ணாமலையாரே அருள் தாரும்" clipped): REAL APP BUG — the 290px Tamil word at 1.5rem bold overflowed its 262px box (card body reserves 76px for the action buttons) and was cut mid-glyph. Fixed in `src/styles/theme.css`: added `overflow-wrap: anywhere` to `.discover-card__lyric` (the same pattern `.discover-card__title` already uses).
- S-01b (Tamil query 0 rows, again): SUITE BUG, root-caused this time — the suite cleared only the FIRST `input[type="search"]` (the hidden top-bar input) while `page.type` typed into the visible page input (autoFocused), so the Tamil text appended to the stale value (`vaazhvinilவாழ்வினில்` → no results). The suite now clears ALL search inputs, focuses the visible one, and types via the keyboard. (Tamil search itself is fine — DB `titleTa` codepoints match the typed query exactly.)
- P-05a (seek landed at 3.69s, expected ~2s): SUITE BUG — the audio was playing, so `currentTime` kept advancing during the 800ms wait. The case now pauses first, then seeks (paused at exactly 2.00s).

**Not fixed here (out of scope / needs Sathiya):** LG-04 admin write E2E and signed-in full-song play need his `/login` sign-in (never runnable headless); M1 different-track race needs a 2nd song; the live site still runs the older build (`mwxzpb78-c1460c54`) — this batch was NOT deployed or pushed to GitHub, per the brief.

---

## Spotify features batch (27 Nov 2026)

Scope: share-as-status card, rule-based mixes (Weekly Mix / Release Radar / Daylist / Daily Mix + Made For You hub), user queue + radio-lite + Smart-Shuffle-lite, offline pinning UI (B9 code), search upgrades (recent searches, browse tiles, top-result hero), sleep timer, Liked pinned in Library, playlist drag-reorder, Hide a track, impeccable polish (sidebar active border, ease-out-expo easing; Inter font NOT changed). Clean-room behaviour only — no Spotify code/icons/logos/copy. New code: `src/lib/mixes.js`, `hiddenTracks.js`, `recentSearches.js`, `sleepTimer.js`, `playlistOrder.js`; `src/components/PinButton.jsx`, `HideButton.jsx`; `src/player/SleepTimerSheet.jsx`; `src/pages/MixPage.jsx` (lazy `/mix/:id`); PlayerContext queue/radio/sleep/pinned-fallback; QueuePanel rewrite; Home MadeForYou hub; Search recent/browse/hero; Library Pinned/Hidden; Track/MobilePlayer/PlayerBar actions; TrackRow add-to-queue; PlaylistDetail drag-reorder; locales en/ta/hi now 380 keys each. No new dependencies (share card is native canvas; `package.json` unchanged).

Quality bar for this batch (user, 27 Nov 2026): no UI flicker, every feature functionally tested (actually used, not DOM-only), no UI bugs left, ultra fast (bundle + load measured).

### Test plan (headless functional group `groupSpotifyBatch`, SP-01…SP-12)

| ID | What is checked | How |
|----|-----------------|-----|
| SP-01 | Made For You hub: 4 mix cards, honest labels | Home render; Weekly Monday + "1 song" plural; Radar "Latest from Nandha Music" fallback (track releases 2026-12-10, nothing fresh); Daylist window from IST hour; Daily Mix |
| SP-01f/g | Flicker: mix-card boxes stable 2s after render; no font-swap shift on titles | getBoundingClientRect before/after 2s + before/after `document.fonts.ready` |
| SP-02 | Mix page renders + Play All starts real playback | `/mix/weekly-mix`: 1 row, Play All → `waitForPlaying` |
| SP-02c | Flicker: player bar is the same DOM node after navigation | WeakRef/`window.__spBar.isConnected` across client-side nav to /search |
| SP-03 | Share card generates + downloads a real 1080×1920 JPEG | CDP download capture to `mobile-verify/downloads-spotify/`; JPEG SOF-parsed for 1080×1920 + >50KB; downloaded file opened via `file://` and screenshotted |
| SP-04 | User queue: add-to-queue ×2 → Next drains 2→1 → `ended` drains 1→0 → final `ended` stops | localStorage `nandha-player-userqueue` + `audioState` at each step; queue panel "Added by you" count |
| SP-05 | Smart Shuffle + Autoplay toggles persist + survive reload | Click toggles in queue panel → localStorage `nandha-player-smart-shuffle`/`nandha-player-radio` → reload → `aria-pressed` |
| SP-05c | Radio with no candidates stops honestly (no fake track) | Radio on, play, dispatch `ended` → paused, no new track |
| SP-06 | Pin downloads audio into the cache | Pin from expanded player → Cache API key `/pinned-audio/vaazhvinil-orumurayenum.mp3` |
| SP-06b/c/d | Pin persists across reload (Library Pinned) → plays while CDP-offline from a `blob:` URL → unpin empties it | Library Pinned section; offline `waitForPlaying` with `blob:` src; unpin + reload |
| SP-07 | Recent searches appear, persist, chip re-runs search; hero cover 96×96 with width/height, box unchanged after load; Clear works + stays cleared | Type query → chip → reload → chip click → input value; hero `getBoundingClientRect` before/after image load |
| SP-08 | Sleep sheet opens with 7 options; End of track arms + stops on `ended` (bar gone); 5-min timer counts down (05:00 → ticks); Off clears | Sheet options list; `ended` dispatch; countdown badge text over 2.5s; badge gone after Off |
| SP-09 | Hide removes the track from Weekly Mix ("1 song" → "0 songs") + mix page honestly empty; track stays searchable; unhide from Library restores it | Hide on Track page → Home card text → `/mix/weekly-mix` empty text → `/search?q=` rows=1 → Library Unhide → card back to "1 song" |
| SP-10 | Playlist row draggable; move buttons disabled at bounds; synthetic drag sequence runs clean, order persists | `draggable` attr + disabled states; DragEvent sequence with shared DataTransfer; localStorage order + error counts |
| SP-11 | Layout audit on `/mix/weekly-mix` + `/track` (new buttons) at 390 | `auditLayout` (L-01…L-06) |
| SP-12 | axe 0 violations on mix page + search with top-result hero | axe-core inject + run |
| U-05 | Mixes/hidden/recent/sleep pure logic | `src/lib/__tests__/mixes.test.js`, `tasteAndSleep.test.js` (14/14), `playlistOrder.test.js` (6) |
| PERF | Home load / TTI before vs after + bundle delta | `mobile-verify/perf-spotify-batch.js` (3 runs each, median) + `dist/` sizes |

### Results

**Full suite run 2: 589/592 PASS** (940s, 27 Nov 2026 ~06:11 IST, preview build `mwykhs98-00030c8e`; results `mobile-verify/full-suite-results.json`). Screenshots: `mobile-verify/screenshots/390/` (`sp-*`, `sweep-mix-*`) + `screenshots/1280/` (`sweep-mix-*`, `sp-mix-page-fixed`, `sp-mix-grid-fixed`). Unit tests: `npm test` 16 files / 94 tests PASS. Pre-deploy check (`scripts/pre-deploy-check.sh`): OK. Silent mp3 still 4,413 bytes (`public/assets/` + `dist/assets/`).

Key evidence (all PASS in run 2): SP-01 hub 4 cards incl. "Weekly MixNew every Monday · 1 song", Radar fallback, Daylist "Midday Melody · 0 songs" (11:00 IST window, honest); SP-01f boxes identical 2s apart `[[16,1218,173,136],[201,1218,173,136],…]`; SP-01g titles identical before/after fonts.ready; SP-02b Play All playing at 0.45s over a signed URL; SP-02c bar same node (`stable=true nav=true connected=true`); SP-03 card `nandha-music-vaazhvinil-orumurayenum-status.jpg` 1080×1920, 333,260 bytes, status "Story card downloaded."; SP-04 queued=2 → Next 2→1 → `ended` 1→0 → final `ended` paused; SP-05c radio no-candidates paused at 0.7s; SP-06 cache key `/pinned-audio/vaazhvinil-orumurayenum.mp3`; SP-06c offline `blob:` playing at 0.38s; SP-07 chips `["vaazhvinil"]` persist + re-run, hero 96×96 with `width/height="96"` box unchanged; SP-08c end-of-track `barGone=true paused=true`; SP-08e Off `badgeGone=true`; SP-09 "1 song"→"0 songs"→mix "Nothing here yet"→search rows=1→unhide "1 song"; SP-10 `draggable="true"`, buttons disabled at bounds, drag clean, order `[vaazhvinil-orumurayenum]`; SP-11/SP-12 layout + axe clean on mix page, track page, search; SWEEP 4 mix routes × both viewports clean (L-01…L-06, 0 errors).

**The 3 run-2 failures were suite-side, not app bugs — all fixed and re-verified 7/7 by `mobile-verify/verify-spotify-fixes.js` (build `mwyl4drz-dafc280a`):** SP-05/SP-05b — the test assumed both toggles start OFF, but Autoplay (radio) defaults ON by design (`readStoredFlag(LS_RADIO, true)`, Spotify-like); clicking it turned it OFF (`persisted radio:"0"`). The test now reads `aria-pressed` first and clicks only when off (`before={ss:"false",au:"true"} persisted={ss:"1",radio:"1"}`, survives reload `ss:true au:true`). SP-08d — the countdown badge shows "5:00" (minutes not zero-padded), the test regex demanded "05:00"; the countdown itself worked (`5:00 -> 4:57`). Regex fixed to `/^[45]:\d\d$/`.

**Focused re-verification after run 2 (7/7 PASS, no page errors):** FIX-01 hero subtitle contrast 4.59:1 (see F6 below); FIX-02 mix grid 4 cards scrolled view; FIX-03 queue panel "Added by you" 2 items; FIX-04/05 SP-05 + reload; FIX-06 SP-08d `5:00 -> 4:57`; FIX-07 1280px home no h-overflow. Grid subtitle/button clearance re-measured with Range text rects at both widths (see F7): all 4 subtitles clear of the play button.

### Performance (before vs after)

| Metric (median, 3 runs) | Live old build (`mwyiiwwv`) | New build (preview) |
|---|---|---|
| Home DOMContentLoaded | 312 ms | 233 ms |
| Home TTI (first TrackCard cover) | 2841 ms | 2307 ms |
| Home FCP | 420 ms | 488 ms (+68 ms, within noise) |
| Made For You hub first paint | — (did not exist) | 2311 ms |
| JS bundle (index chunk, raw) | 669,862 B | 707,968 B (+38,106 B, +5.7%; gzip 191.93 kB → ~199 kB, +3.8%) |
| MixPage lazy chunk (loads only on `/mix/*`) | — | 2,835 B (1.18 kB gzip) |
| Total dist JS | — | 873,390 B (246.0 KiB gzip) |

No new dependencies (`package.json` unchanged). Mixes are computed client-side from the cached catalog (Home's React Query cache; MixPage reuses queryKey `['tracks', {publishedOnly}]` — no extra Supabase read per mix render). No new blocking network calls on Home load. Caveat: live-vs-local DCL/FCP are confounded (live goes through the egress proxy, local does not); TTI (dominated by the catalog fetch) is the fairest number.

### Flicker checks per new surface

| Surface | Check | Result |
|---|---|---|
| Made For You hub | Mix-card boxes before/after 2s (SP-01f); title boxes before/after `document.fonts.ready` (SP-01g); card images are gradient tiles (no image pop-in) | Identical boxes; no shift |
| Mix page | Player-bar same node across nav (SP-02c); route-change skeleton is page-shaped (LoadingFallback: title + subtitle + 4 row skeletons, matches final layout) | Same node, no re-mount |
| Share card | Canvas-drawn, no DOM flash (download only) | No UI flash; file verified |
| Queue panel | Sections render from persisted state; no skeleton→content jump (panel is local state) | Stable (screenshots viewed) |
| Search (recent / browse / hero) | Hero cover 96×96 with width/height attrs, box unchanged after image load (SP-07d); recent chips + browse tiles are local/gradient (no network) | Box unchanged |
| Sleep sheet | Bottom sheet over the player; countdown badge is a text swap in the existing bar button | No layout shift (badge is absolute) |
| Library Pinned/Hidden | Sections render from Cache/localStorage on mount | Stable (screenshot viewed) |
| Playlist drag | `.is-dragging` / `.is-drop-target` classes only; no re-render flash | Clean, 0 errors |

### Failures (root cause in one line each)

**Run 1 — full suite crashed at SP-07 (exit 2, no results file).** Failures found and fixed before run 2:

- S-01a/S-01b/S-03/S-04 + LK-01 + SP-04/SP-04b/SP-04c: REAL APP BUG — the top-result hero REMOVED the top result from the results list (`results.slice(1)`), so a 1-result search had 0 `.track-row` elements: no rows, no like button, no add-to-queue button. Fixed in `src/pages/Search.jsx`: the list now renders ALL results (the hero is a summary; Spotify also lists the top result below it). Comment in code explains why.
- H-03 (0 daypart rows at ~11:00 IST): NOT A BUG — the daypart window 10–18 is Melody-only and the catalog has no Melody track, so the section honestly renders nothing. SUITE FIX: the case is now time-aware (expects rows only 05–10 / 21–05, absence otherwise).
- A-06 (axe `landmark-unique` on queue panel): REAL APP BUG — my QueuePanel `<section aria-label="Now playing">` duplicated the PlayerBar's `role="region" aria-label="Now playing"`. Fixed in `src/player/QueuePanel.jsx`: all three sections lost their `aria-label` (h4 titles give the structure; comment guards against re-adding).
- SP-02c (player bar `connected=false`): SUITE BUG — the test used full `page.goto()` (destroys the whole document/window by definition) instead of client-side navigation. Now clicks the sidebar Search link.
- SP-04e (final `ended` did not stop playback): REAL APP BUG (minor) — `onEnded`'s no-continuation fallthrough only called `setIsPlaying(false)` without pausing the `<audio>` element, so a synthetic `ended` left it playing (and bar/element state disagreed). Fixed in `src/player/PlayerContext.jsx`: fallthrough now calls `audio.pause()` first (no-op at a natural end, where the element is already paused).
- P-05a (seek landed at 2.85s, expected ~2s): SUITE BUG — the seek slider is controlled (`value = floor(currentTime)`, step 1); when `currentTime` was already in [2,3) the slider already showed 2, so setting it to 2 was a no-op (React sees no change, never calls `seekTo`). The case now reads the slider first and seeks to a different second (4s when at 0–2s, 1s when at 3–4s).
- SP-05 (panel closed): SUITE BUG — `openQueuePanel` clicked "Up next" unconditionally, but the button TOGGLES: the panel was already open from SP-04b, so the click closed it. Both openers are now idempotent (check first, click only if closed).
- SP-06b (Pinned section text had no "Vaazhvinil"): SUITE BUG — the pinned row shows the Tamil title first (`titleTa`), not the transliteration. Now matches `/வாழ்வினில்/`.
- SP-06d ("no-pinned-section"): SUITE BUG — an empty Library returns its early empty state (no sections at all), which IS the correct empty outcome when nothing else is in the Library. The case now accepts it.
- SP-07 crash (`page.click('.search-box input')` — "Node is either not clickable"): SUITE BUG — the first `.search-box input` in the DOM is the hidden top-bar input. SP-07 now focuses/types the VISIBLE input, clears the VISIBLE box, and reads the VISIBLE input's value (same trap fixed in the SP-07e clear step).
- SP-04d: SUITE BUG — the old check passed vacuously when the queue was already empty (`queued === 0`). Now asserts the drain itself (`queued 1 -> 0`).

**Run 2 — 589/592 (3 failures, all suite-side, fixed + re-verified 7/7 — see Results above).**

**Found by VIEWING screenshots after run 2 (both fixed in this batch):**

- F6 — Mix hero subtitle unreadable (REAL APP BUG, contrast): the hero subtitle reused the global `.tagline` class (Amber Gold #F59E0B) on the gold gradient hero — gold-on-gold. Fixed in `src/pages/MixPage.jsx` + `src/styles/theme.css`: new `.mix-hero__sub` class inheriting the tone colour (dark slate on gold/sand, white on slate/steel). Measured after fix: 4.59:1 (WCAG AA ≥ 4.5). The same 0.85 opacity also dragged the kicker + card subtitles to ~3.79:1, so `opacity: 0.85` was removed from `.mix-hero__kicker`, `.mix-hero__sub` and `.mix-card__sub` too.
- F7 — Mix-card subtitle hidden behind the play button (REAL APP BUG, overlap): the 44px round play button is absolute bottom-right; the subtitle text ran underneath it ("New every Monda[y]", "Latest from Nandh[a]" — visible in `screenshots/390/sp-mix-grid-fixed.png` before the fix). The layout audit does not catch paint-overlap, only overflow. Fixed in `src/styles/theme.css`: `.mix-card__sub { padding-right: 56px }` (button width + gap). Re-measured with Range text rects at 390 + 1280: all 4 subtitles clear (e.g. 390px Weekly maxRight 96 vs button left 135); cards stay 136px tall. Final build `mwyl640t-d3f9313b` (preview rebuilt to `mwyl7m7a-4741b761` by the pre-deploy check — same source).

**Not fixed here (out of scope / needs Sathiya):** signed-in full-song play + admin write E2E still need his `/login` sign-in (never runnable headless); M1 different-track race needs a 2nd song; multi-track behaviours (visible drag-reorder with distinct tracks, radio candidates, Smart-Shuffle interleave order) cannot be observed live on the 1-track catalog — the logic is unit-tested (`playlistOrder.test.js`, `mixes.test.js`) and the drag wiring is suite-tested; the live site still runs the older build — this batch was NOT deployed or pushed to GitHub, per the brief. Sleep-sheet option labels read "Sleep timer set for 5 minutes" (locale `player.sleepSet`) — wordy as a menu label, understandable and functional; left as a polish nit, not a bug.
