# Audit — Mobile / Account / Content / Tests (27 Nov 2026)

Scope: the 12-item brief against the current code (live build `mwynircv-4983d72c`,
local tree at `~/workspace/nandha-music-app`). Method: read the code (no trust in
the brief's claims), then measured the live behaviour with the puppeteer harness
(`mobile-verify/probe-audit-baseline*.js`, Chrome for Testing, preview `:5173` —
`localhost`, because the `get-audio-url` Edge Function CORS allowlist has
`localhost:5173`, NOT `127.0.0.1:5173`). Baseline evidence:
`mobile-verify/audit-2026-11-27/baseline*.json` + screenshots in the same folder.

Skills read first: shipping-and-launch, accessibility-skill (LambdaTest),
webapp-testing (screenshot-first pattern, applied with the puppeteer harness —
NOT Playwright), emil-ui-skills. `npx impeccable detect src/` baseline:
1 anti-pattern — Inter overused font (`theme.css:11`, known, brand decision
pending, NOT changed) — and 1 advisory — bounce-easing flag on `--nm-spring`
(`player.css:447`, FALSE POSITIVE: the value is already ease-out-expo
`cubic-bezier(0.16, 1, 0.3, 1)` since the user-approved 27 Nov polish; the
detector flags the variable name).

Verdicts: EXISTS / REDUNDANCY / GENUINE GAP / NOT RECOMMENDED.

## Verdict table

| # | Item | Verdict | Evidence (one line) |
|---|------|---------|---------------------|
| 1 | Cookie banner ≤96px, links, no "·", never cover buttons, no dead chrome space | GENUINE GAP | Banner 220px @390px, 199px @320px (measured); links `min-height:44px inline-flex` (`theme.css:1313`); `{' · '}` in `ConsentBanner.jsx:44`; gate prompt covers Accept button by 3,868 px² (live, 390px); `.main` padding-bottom 148px with no player active (60px dead) |
| 2 | Safe-area: mini player above nav, no own safe-area padding <1024px | GENUINE GAP | `.player-bar` adds `env(safe-area-inset-bottom)` to padding at ALL widths (`player.css:110-111`) AND to `bottom:` on mobile (`player.css:123`); nav adds its own (`theme.css:723-724`); `.main` padding counts safe-area twice (`theme.css:186`, comment admits it) |
| 3 | Full player: cover min(60vw, 34dvh), controls in view at 664/568px, group secondary actions | GENUINE GAP | Cover `min(78vw, 320px)` = 304px @390 / 250px @320 (`player.css:533-534`); seek bottom 695px @664h, 630px @568h; controls bottom 781px @664h, 708px @568h — both below the fold; sheet scrollHeight 1081/1008 vs viewport 664/568; 9 secondary actions in 2 wrapping rows |
| 4 | Bottom nav: Profile → real /profile, aria-current only on active, labels ≥12px | GENUINE GAP | Profile tab → `/library` (`Sidebar.jsx:35`); no `/profile` route (→ 404, no h1); labels `0.7rem` = 11.2px (`theme.css:745`); on `/library` BOTH Library and Profile tabs get `aria-current="page"` (measured — NavLink sets it, two tabs share one destination) |
| 5 | Search: no autoFocus on touch | GENUINE GAP | `autoFocus` on the search input (`Search.jsx`, no touch/pointer check) |
| 6 | Visible Sign in / Sign up; fix /login copy; pre-end sign-in hint with countdown | GENUINE GAP | No sign-in button anywhere in public UI (`TopBar.jsx` comment: deliberate); `auth.loginHint` = "Admin access is restricted…" (`en.js:369`); `auth.signUpHint` frames sign-up as admin-only (`en.js:374`); no pre-end hint — `previewEnded` only fires AFTER 5s (`PlayerContext.jsx:178`) |
| 7 | /profile + /settings (account, playback, language, notifications, privacy, about) | GENUINE GAP | Neither route exists. `signOut` exists (`auth.jsx:197`), no `deleteAccount`. Quality/autoplay persist locally only (`PlayerContext.jsx:56,352`). Aarti alarm lives on Home hero; "coming later" text EXISTS (`streak.alarmNote` `en.js:214`, `streak.enableNotifications` `en.js:218`). No privacy clear/export UI |
| 8 | Sync likes/playlists/follows to Supabase; update privacy policy | GENUINE GAP | All localStorage-only (`TrackRow` `getLikedIds`, `Library.jsx` `FOLLOWED_KEY`, `adminStore`); `Privacy.jsx:25-27,36,76` states data stays in the browser. Needs a migration + RLS + privacy rewrite |
| 9 | Artist Follow/Following label; Share on album/artist; toasts | GENUINE GAP (partial) | Follow EXISTS but labelled Like/Liked (`Artist.jsx:102-103`, `common.like/liked` `en.js:29-30`); no `artist.follow` keys. No Share on Album/Artist (Track has it). No toast system anywhere (zero `toast` hits in `src/`) |
| 10 | Search: Tamil + Latin, Tamil album/title, diacritic/case-insensitive, recents | PARTIAL (recents + basic match EXISTS; robust matching GAP) | Recent searches EXISTS (`recentSearches.js` + chips in `Search.jsx`). `searchTracksIn` is plain `toLowerCase` + `includes` over `titleTa titleEn artist album genre` (`supabaseCatalog.js:539-552`) — no transliteration variants, no diacritic folding. Album IS in the haystack, so Tamil album text already matches when typed exactly |
| 11 | 404 gets <h1>; per-route titles (no duplicate); remove stale topbar CSS | GENUINE GAP (partial) | NotFound has NO `<h1>` (plain `<div>`, `NotFound.jsx:56-58`). Per-route titles EXIST for detail pages (`pageMeta.js` + 5 callers) BUT `Artist.jsx:47` passes `"Name | Nandha Music"` and `setPageMeta` appends `" | Nandha Music"` → **"Artist | Nandha Music | Nandha Music"** (duplication confirmed by code). No stale topbar CSS for sign-in/Admin exists — only a stale COMMENT (`theme.css:972`) → REDUNDANCY (comment only) |
| 12 | Playwright E2E (iPhone 14 + 320x568 + 34px inset) | NOT RECOMMENDED as specified | Playwright is not installed; the standing rule (AGENTS.md lesson, 27 Nov) is to apply the webapp-testing PATTERN with the existing puppeteer harness, NOT add a second harness. The listed coverage is achievable in `mobile-verify/` — this audit's probes already cover overflow, banner, player-vs-nav, controls-in-view, Profile destination, gate→prompt, Tamil/Latin search, 404. Recommend extending the puppeteer checks instead |

## Baseline measurements (all measured, not asserted)

### Item 1 — consent banner (fresh profile, no consent stored)
- 390x844: banner **220px tall** (top 488, bottom 708). 320x568: **199px tall**
  (measured at a 546px layout viewport — see the 320px note below; at a true
  320px width the text wraps more, so the true height is larger).
- Links: `.consent-banner__text a { display: inline-flex; min-height: 44px }`
  (`theme.css:1313-1322`) — the 44px line box inflates the text block.
- Separator: `{' · '}` between the two links (`ConsentBanner.jsx:44`).
- Gate prompt vs banner (LIVE site, 390px, real playback): prompt top 615 /
  bottom 706 (92px tall); banner top 488 / bottom 708; overlap **32,757 px²**;
  **Accept button covered by 3,868 px²** (prompt is inside `.player-bar`,
  z-index 95; banner is z-index 90). Player Play button NOT covered (0 px²).
  Screenshot: `baseline-gate-vs-banner-live2-390.png` — the gold prompt sits
  on top of the banner; the banner's Privacy Policy link and both buttons
  are hidden behind it.
- No-player dead space: `.main` padding-bottom **148px** with no track loaded
  (`--chrome-bottom` = 124px always, `theme.css:59`); 60px of it is the
  player reservation for a player that isn't there.

### Item 2 — safe-area double-count (code)
- `.player-bar` base: `padding: 8px 10px calc(8px + env(safe-area-inset-bottom))`
  (`player.css:110-111`); mobile: `bottom: calc(var(--bottomnav-h) + env(...))`
  (`player.css:123`); desktop ≥1024px keeps safe-area padding (`player.css:1106`).
- `.bottom-nav` height + padding-bottom both add the inset (`theme.css:723-724`).
- `.main` padding-bottom adds the inset **twice** (`theme.css:186`, comment
  admits it: "the bottom reserve adds the safe area twice (once per bar)").
  With a 34px inset the bar would be ~99px tall against a 60px
  `--playerbar-h` reservation — the stack geometry only lines up at inset 0.
- Banner bottom also adds the inset (`theme.css:1286`); after the bar fix the
  12px gap above the bar top is preserved by the same formula.

### Item 3 — full player (measured, sheet open, track loaded)
- 390x664: cover **304×304** (top 132, bottom 436); seek bottom **695**;
  controls bottom **781**; sheet scrollHeight **1081** vs viewport 664.
- 320x568: cover **250×250**; seek bottom **630**; controls bottom **708**;
  sheet scrollHeight **1008** vs viewport 568.
- Both: seek + Shuffle/Prev/Play/Next/Repeat are below the fold — scrolling
  required. Screenshot: `baseline-player-390x664.png` (seek bar sits on the
  very bottom edge, controls off-screen).
- Secondary actions: 2 wrapping rows, 9 pills (Lyrics/Story/Up next/Quality/
  Share + Status card/Pin/Hide/Sleep) — rows at y 865-961 and 965-1061 @390.

### Item 4 — bottom nav (measured)
- Tabs: Home `/`, Search `/search`, Library `/library`, Playlists `/playlists`,
  Profile `/library` (duplicate destination). Labels **11.2px** (`0.7rem`).
- `aria-current`: React Router `NavLink` sets `aria-current="page"` on the
  active link — correct mechanism, wrong outcome: on `/library` BOTH Library
  and Profile tabs carry `aria-current="page"` + `is-active` (measured).
- `/profile` today: 404 page ("Page not found", no `<h1>`).

### 320px layout-viewport expansion (found during measurement; item-12 scope)
- At a 320px device width the **layout viewport expands to 546px** (live +
  dev; `window.innerWidth` 546, visual viewport 320, `body` 320). It is 320
  before React renders and 546 after. Hiding `.section-row` (Featured
  Tracks, 4 cards, scrollWidth 676, offsetWidth 288) restores 320px;
  `contain: inline-size` on the row also restores 320px. The earlier
  min-width fix (`theme.css:163-168`, `.app-main-wrap min-width: 0`) does
  not cover this case. Consequence: on a real 320px phone the page renders
  zoomed-out with horizontal panning; fixed chrome (nav, banner) sizes to
  the 546px viewport. Fix belongs to the item-12 follow-up (likely
  `contain: inline-size` on `.section-row` or equivalent). For this round's
  320px verification the probe scripts inject that containment override and
  disclose it — the 320px numbers below are measured at a true 320px layout
  width, and the expansion itself is recorded here as an open gap.

## Priority 1 — implementation plan (items 1-4 only)

1. **Banner**: restructure to text row + one row holding the links block and
   the actions (links padded, no `min-height:44px inline-flex`, no "·");
   shorten `consent.text` (en/ta/hi) so the banner fits ≤96px; hide the
   banner while the gate prompt / player notice is showing (it can never
   cover Accept); `.app-layout.no-player` drops the player share of
   `--chrome-bottom` (mobile → nav only, desktop → 0).
2. **Safe-area**: `<1024px` `.player-bar` gets `padding-bottom: 8px` (no
   `env()`); desktop keeps it. `.main` padding counts the inset once
   (`* 2` → `* 1`), matching the new stack geometry.
3. **Player**: cover `min(60vw, 34dvh)`; short-height tightening
   (`max-height: 600px`: smaller title clamp, tighter margins, smaller
   play button) so seek + controls are in view at 664px and 568px;
   secondary actions move into a "More" sheet (same `.sheet` pattern as
   the sleep timer), reusing existing handlers/keys.
4. **Nav + Profile**: new minimal `/profile` route (guest → sign-in prompt;
   signed-in → email + sign out); Profile tab → `/profile` (desktop
   sidebar too); labels `0.75rem` (12px); `aria-current` then falls out
   correctly from `NavLink` (single active tab per route).

Constraints for the implementation: minimal diffs; no new dependencies;
guest 5s gate unchanged; admin only `officialnandhamusic@gmail.com`;
no dummy data; brand colours exact; silent mp3 stays; do NOT touch
`TrackCard.jsx` / `.track-card__cover`; no deploy method / `_headers`
changes; no "coming soon/later" placeholder text.

## Verification (Priority 1)

Script `mobile-verify/check-audit-p1.js` (puppeteer, preview `:5173`
localhost): banner height ≤96px at 320/390 (en; ta recorded), links
computed style, no "·", banner hidden during gate prompt, Accept/Play
never covered, `.main` padding with/without player, player-bar geometry
(+ 34px-inset simulation), cover size = min(60vw, 34dvh), seek + controls
in view at 664/568px heights without scrolling, More sheet opens + rows
work, Profile tab → /profile (guest + signed-in), aria-current single,
labels ≥12px. Screenshots VIEWED at 320x568, 390x844, 1280px. Then
`npm test` + `npm run build` + `scripts/pre-deploy-check.sh` green,
`npx impeccable detect src/` re-run. Results appended below and to
`docs/test-cases.md`.

## Verification results — Priority 1 (items 1-4)

Implemented + verified 27 Nov 2026. Script `mobile-verify/check-audit-p1.js`
(puppeteer, dev preview `http://localhost:5173`, build `mwyq6ezk-132b3c2f`).
**Final run: 60/60 PASS, 1 RECORDED, exit 0.** Screenshots in
`mobile-verify/audit-p1/` (all VIEWED at 320x568, 390x844, 1280px),
results JSON in `mobile-verify/audit-p1/results.json`. Gates:
`npm test` 16 files / 94 tests PASS; `npm run build` green;
`scripts/pre-deploy-check.sh` OK (39 warnings, 0 errors — the cap is 40);
`npx impeccable detect src/` — same as baseline (1 anti-pattern: Inter
overused font, brand decision pending; 1 advisory: bounce-easing on
`--nm-spring`, known false positive — the value is already ease-out-expo).
No new impeccable findings from this batch. **Not deployed, not pushed to
GitHub** (implementation + verification only, per the brief).

### Files changed

| File | Change |
|---|---|
| `src/components/ConsentBanner.jsx` | Two-row layout (text + links/actions row); hides while the gate prompt or a player notice shows; short link labels |
| `src/styles/theme.css` | Compact banner (≤96px), `.app-layout.no-player` chrome rules, bottom-nav labels 0.75rem, ≤360px banner tightening + Privacy-link hide, `.profile-page__*` styles |
| `src/locales/en.js`, `ta.js`, `hi.js` | Shorter `consent.text` (en/ta/hi); short `legal.cookiesShort`/`legal.privacyShort`; short ta/hi Accept/Decline (`சரி`/`வேண்டாம்`, `ठीक है`/`नहीं`); new `player.moreActions`, `profile.signIn`, `profile.signInHint` |
| `src/App.jsx` | `no-player` class from player state; lazy `/profile` route |
| `src/player/player.css` | Mini-player `padding-bottom: 8px` below 1024px; cover `min(60vw, 34dvh)`; short-height tightening (`max-height: 720px`); `.mobile-player-more-btn`; `.sleep-option` gap + `__state` |
| `src/player/MobilePlayer.jsx` | `showMore` state + Escape layering; 9 actions moved into a "More actions" sheet; removed unused `IconShare` |
| `src/components/Icons.jsx` | Added `more` icon (three dots) |
| `src/components/PinButton.jsx`, `HideButton.jsx` | New `variant="row"` for the More sheet |
| `src/pages/Profile.jsx` | **New** minimal real `/profile` (guest sign-in prompt; signed-in email + role + sign out; admin link for admins) |
| `src/components/Sidebar.jsx` | Profile tab → `/profile`; Profile added to the desktop sidebar |
| `src/pages/Library.jsx` | Comment only (removed the stale "v1 Profile destination" note) |
| `mobile-verify/check-audit-p1.js` | **New** verification script (60 checks) |
| `mobile-verify/probe-audit-baseline.js` | Removed an unused `rect` helper (lint) |

### Item 1 — Consent banner: PASS

| Check | Measured |
|---|---|
| Height @390 en / @320 en | **92px** / **92px** (≤96) |
| Height @390 ta / @320 ta | **74px** / **92px** (≤96) |
| Height @390 hi / @320 hi | **74px** / **92px** (≤96) |
| Height @1280 (desktop row) | **54px** (≤64) |
| No stray "·" | confirmed in banner text |
| Links: no 44px min-height | `min-height: auto`, padding `6px 8px` |
| Links never overlap buttons @320 en/ta/hi | rect-intersection checks PASS |
| Accept hides banner + stores `nandha-consent=accepted` | PASS |
| `.main` padding, no player | **88px** mobile (nav 64 + 24), **40px** desktop (chrome 0 + 40, pre-existing rule theme.css:903) |
| `.main` padding, with player | **148px** mobile (124 + 24), **100px** desktop (60 + 40) |
| Banner present above player before gate | PASS |
| Banner hidden while gate prompt shows; Sign-in + Dismiss buttons uncovered (`elementFromPoint`) | PASS |
| Banner returns after gate prompt dismissed | PASS |

### Item 2 — Safe-area: PASS

| Check | Measured |
|---|---|
| Player-bar `padding-bottom` <1024px | **8px** (computed; no `env()` of its own) |
| Bar sits directly above nav | bar bottom **780** = nav top **780** @390x844; bar height **65px** (not ~98px) |
| Live stylesheet rule | `<1024px` `.player-bar` rule: `padding-bottom: 8px`; `bottom:` keeps the `env()` (correct — it positions the bar above the nav) |
| Desktop bar | `bottom: 800` = viewport height 800 (bottom:0, keeps its own inset) |

Limitation: CDP `Emulation.setSafeAreaInsets` does not exist in this Chrome
(verified: `'wasn't found'`), so a live 34px-inset simulation was not
possible here. The proof is the computed style (8px at 0 inset) + the
runtime CSS rule (no `env()` in the mobile `padding-bottom` declaration),
which by cascade is what the bar gets at any inset.

### Item 3 — Full player: PASS (16 checks + 1 recorded)

| Check | Measured |
|---|---|
| Cover @390x664 / @320x568 / @390x844 | **226x226** / **192x192** / **234x234** (= min(60vw, 34dvh) exactly) |
| Seek bar bottom @664 / @568 / @844 | **525** / **492** / **614** (all ≤ viewport height) |
| Controls bottom @664 / @568 / @844 | **593** / **564** / **700** (all ≤ viewport height) |
| Old two-row actions | gone (`.mobile-player-actions` absent) |
| More sheet | opens with **9 rows** (Lyrics, Story, Up next, Quality, Share, Share card, Pin for offline, Hide this song, Sleep timer) |
| Lyrics row | opens lyrics view + closes sheet |
| Quality row | toggles **128 → 320 kbps** (verified by re-opening the sheet) |
| Sleep row | opens sleep sheet + closes More |
| Player X | closes the sheet |

**RECORDED (not a brief requirement):** at 390x664 the More button sits
**47px below the fold** (bottom 711 vs viewport 664) and needs a small
scroll — the sheet is 731px tall there. Seek + controls are in view, which
is what item 3 requires. At 390x844 the whole sheet fits (scrollHeight 810
< 844).

### Item 4 — Profile + nav: PASS

| Check | Measured |
|---|---|
| Profile tab destination | `/profile` (was `/library`) |
| Nav labels | **12px** on all 5 bottom tabs (computed) |
| `aria-current="page"` | exactly **one** tab on Home (`/`), on `/profile` (Profile only), on `/library` (Library only) |
| Tap Profile tab → `/profile` | guest view: `<h1>Profile</h1>`, title `Profile \| Nandha Music` (no duplication), hint "Sign in for full songs — guests hear a 5-second preview.", Sign in button → `/login` |
| `/profile` @320px | renders, **no horizontal overflow** (scrollWidth 320 = innerWidth 320) |
| Desktop sidebar | Profile link present; opens `/profile` |
| No page/console errors | 0 on the desktop run |

**Not verified:** the signed-in `/profile` view (email + role + sign out)
needs Sathiya's `/login` sign-in — headless cannot sign in without his
credentials. The guest view + route + nav are verified; the signed-in branch
is 15 lines of straightforward `useAuth()` rendering.

### What the verification caught (3 real bugs, all fixed in this round)

1. **320px banner row overlap (all locales, found by VIEWING the
   screenshot, not by the height check):** the links were squeezed under the
   buttons — "Privacy Policy" hidden behind Accept in English, Tamil links
   unreadable behind the buttons. Height alone passed (92px); the
   rect-intersection checks (1h-b/1i-c/1i-e) were added because of this.
   Fixed with short link labels (`legal.cookiesShort`/`legal.privacyShort`),
   short ta/hi Accept/Decline, compact padding at ≤360px, and hiding the
   Privacy link at ≤360px (Cookies link stays; both links remain in the
   footer and on `/cookies`).
2. **Tamil banner 3-line wrap at 320px:** the Tamil text wrapped to 3 lines
   (111px) because Tamil glyphs run ~11px wide at 13px font and the words
   don't pack. Fixed by shortening the Tamil `consent.text` to
   `தேவையானவை மட்டுமே சேமிக்கப்படும்.` — it drops the "no ads" clause in
   Tamil only; the full detail is on `/cookies`, one tap away. (en keeps
   "no marketing cookies, ads or trackers"; hi keeps its fuller text.)
3. **Controls 2px below the fold at 320x568** (570 vs 568). Fixed by
   trimming the short-height seek/controls margins (`12px`→`8px`,
   `10px`→`8px`); controls bottom is now **564**.

### Incidents during verification (environmental, not app bugs)

- The dev server (vite :5173) died once mid-verification
  (`ERR_CONNECTION_REFUSED`); restarted with `npx vite --port 5173 --host
  127.0.0.1` and the run was repeated clean.
- The forward proxy (127.0.0.1:18080, PID 3070) died mid-run: 48
  `ERR_PROXY_CONNECTION_FAILED` console errors, audio never played, the 5s
  gate never fired, and a failure notice shifted the player geometry. The
  proxy was restarted (PID 3512) and the full script re-run clean (60/60).
  Lesson: a dead proxy looks exactly like an app playback failure — check
  the proxy first when the gate doesn't fire.
- `pre-deploy-check.sh` initially failed on lint: **41 warnings vs the 40
  cap**. The only new warnings from this round were 2 unused `rect`
  helpers in my own probe scripts; removing them brought it to **39** and
  the check passes. The remaining warnings are pre-existing (including
  `set-state-in-effect` in the untouched ConsentBanner/MobilePlayer
  effects).

## Live deploy verification (27 Nov 2026, build mwyrrp61-86e96322)

Deployment `ceff77de-36b3-4a53-94b9-fb7d77574f55`, live at https://nandha-music.pages.dev.
Script `mobile-verify/check-deploy-p1-live.js` (live variant of `check-audit-p1.js` +
15 regression checks), screenshots + `results.json` in `mobile-verify/deploy-verify-p1/`.

**Result: 75/75 PASS, 1 RECORDED** (More button 47px below the fold @664 — same
recorded item as the preview run; seek + controls are in view, per spec).

First run was 67/75 with 8 failures — all 8 were **probe bugs, not app bugs**,
diagnosed and fixed in the probe, then re-run green:
- 2d/2e/2f (safe-area rule read returned null): the probe searched the live
  stylesheet for `max-width: 1023px`, but the minifier rewrites it to
  `width<=1023px`. The rule itself is correct in the built CSS
  (`padding-bottom:8px`, `bottom:calc(var(--bottomnav-h,64px) + env(...))`),
  and the computed-style checks (2a/2b/2c) passed in both runs.
- 4e–4h (Profile tab tap showed Home at /profile): one-off probe race — the
  evaluate 1200ms after the tap caught the pre-navigation DOM. Reproduced
  with `mobile-verify/diag-profile-tap.cjs`: el.click() and real mouse tap
  both render Profile (h1 "Profile", title "Profile | Nandha Music",
  active=["/profile"]) within 1s and stable for 8s; no reload. Probe now
  waits for the Profile h1 instead of a fixed sleep.
- R7 (gate wall-clock 9.06s): the gate pauses at **5.20s of audio time**
  (signed-URL fetch through the egress proxy adds ~4s of wall clock before
  playback starts). Check now asserts on audio `currentTime`.

**Live evidence (all measured, screenshots viewed):** banner 92px @390 en,
92px @320 en/ta/hi, 74px @390 ta/hi, 54px @1280; links never overlap buttons;
banner hidden during gate, returns after dismiss; bar padding-bottom 8px,
bar bottom = nav top (780=780), height 65px; cover 226×226 @390×664,
192×192 @320×568, 234×234 @390×844; seek + controls in view at all three
heights; More sheet 9 rows, Lyrics/Quality/Sleep exercised; Profile tab →
/profile (guest h1 + Sign in → /login), labels 12px, single aria-current;
covers 134×134 @390 / 161×161 @1280 in all Home sections; no h-overflow at
320/390/1280; gate pauses at 5.20s audio time over a signed Supabase URL,
dismiss rewinds to 0 + stays paused, replay re-gates; mix page 1 row; hub 4
cards; zero page/console errors. Perf (live, 390px, median of 3): DCL 680ms,
FCP 804ms, first cover 4054ms (catalog fetch through the proxy dominates);
dist 2,839,831 bytes; index chunk 710,577 bytes raw.

**Visual note (pre-existing, not a Priority 1 item):** the "❚❚ Canvas" pill
overlaps the cover art's baked-in "VAAZHVINIL ORUMURAYENUM" text in the full
player — the Canvas badge sits on top of the cover image. Cosmetic only.

**GitHub re-push:** head `fe13b7a91a187edb2e887fbf83e8479b26e3f177` (127 paths:
previous 124 + `src/pages/Profile.jsx`, `docs/audit-2026-11-27-mobile-account.md`,
`mobile-verify/check-audit-p1.js`), sync record now 9 entries. PNG screenshots
were NOT pushed (binary — push_files rejects them); `.env` and build-generated
`version.json` files were NOT pushed. The other new mobile-verify scripts from
this round (`check-deploy-p1-live.js`, `diag-profile-tap.cjs`,
`perf-deploy-p1-live.cjs`) were NOT pushed, matching the previous round
(`check-deploy-spotify-live.js` was not pushed either).

## Items 5–12 implementation + verification (27 Nov 2026, local only — NOT deployed)

Implementation order 6, 7, 5, 9, 11, 10, 8, 12. All code complete; verified
headless (P2 suite `mobile-verify/check-audit-p2.js`, puppeteer + Chrome for
Testing, real server :5173 guest + demo-mode server :5174 signed-in demo
user). **Final run 4: 89 PASS, 0 FAIL** (log `/tmp/p2-run4.log`).
Run 2 was 83 PASS / 6 FAIL; run 3 was 88 PASS / 1 FAIL — every failure was
triaged to a real app bug, a probe bug, or a probe criterion, and fixed.

### Item 12 — the 320px/390px viewport expansion: ROOT CAUSE + FIX
- **Root cause (proven by bisection on a static replica with the real
  CSS):** the `<span class="sr-only">Loading</span>` inside each `Skeleton`
  (`src/components/EmptyState.jsx`). `.sr-only` is `position: absolute`
  with no positioned ancestor inside the card, so its containing block is
  the initial containing block; inside the 4th skeleton card its static
  position sits at x≈544 and the 1px span pushes the document's scrollWidth
  to 546, expanding the layout viewport to 545px while the skeletons show
  (catalog-loading phase, ~600ms–2.4s). The replica: baseline vw=390,
  + sr-only span only → vw=545, + role=status wrapper only → vw=390.
  `contain: inline-size` on `.section-row` was proven INEFFECTIVE (present
  in served CSS, expansion persisted) and was REVERTED. `overflow-x: hidden`
  on the row / `.main` / `.section`, removing scroll-snap, and
  `html, body { overflow-x: clip }` (already present) all also failed.
- **Fix:** `style={{ position: 'relative' }}` on the Skeleton's
  `role="status"` wrapper div — the span is now contained inside the card
  (a layout no-op for the static bars). Verified with
  `mobile-verify/diag-skeleton-expand.js`: vw holds 390 through the whole
  skeleton phase in 4 separate runs (the bug reproduced 1-in-20 before the
  fix). P2 overflow checks pass on every route at 320/390/1280.
- **Other sr-only spans audited:** Sidebar (fixed sidebar, contained),
  LanguageSwitcher (sticky topbar, contained), Discover h1/p (page left
  edge, inside viewport), Playlists label (in viewport), PlayerBar volume
  (fixed bar, contained) — the Skeleton span was the only one inside a
  horizontal scroller.
- **Probe criterion fix (run 3→4):** `measureOverflow` now excludes
  elements inside a horizontal-scroll ancestor (`overflow-x: auto/scroll`) —
  a scrolled card at right=692 is scroll content, not page overflow. The
  real expansion is still caught by `docW > vw`.

### Two real app bugs found + fixed during verification
1. **Demo-mode playback broken** (`src/lib/signedAudio.js`):
   `isSignedTrack` is true for ANY track whose audio file is
   `vaazhvinil-orumurayenum.mp3` — including the fallback-catalog track in
   demo mode, whose audio128 is the LOCAL silent mp3. `resolvePlayableUrl`
   tried to mint a signed URL; `getSignedAudioUrl` throws
   `supabase_not_configured` when `config.supabaseUrl` is empty (demo mode)
   → caught → null → empty `<audio>` src, silent failure. Fix: on catch,
   if `!config.supabaseUrl` return the local audio path (it is silence, so
   nothing protected is exposed); production always has Supabase configured,
   so the signed path stays mandatory there. New unit test
   (`signedAudio.test.js`, demo-mode describe block) — 11/11 in that file.
   Demo check is now honest: the 1s silent file plays to its natural end
   (ct=1, dur=1, paused by onEnded) with no gate, no hint, no notice.
2. **Full-player hint chip missing separator** (MobilePlayer.jsx):
   rendered "Sign in for full songs0:05"; fixed with `{' · '}` between the
   spans (mini player already had it).

### Probe findings (NOT app bugs — suite restructured)
- **Gate section:** closing the full player STOPS playback by design
  (`requestClose` pauses + `stopPlayback()` after 240ms — "stop means
  stop"), so opening + closing it mid-preview killed the gate test (hint
  went null, no gate). Restructured: hint countdown + gate run on the mini
  player only (hint1 0:04 → hint2 0:03, gate fires, prompt → /login); the
  chip is checked on a separate page that is discarded without touching X.
- **Like toast:** Home has NO Like button at some hours — its only TrackRows
  are the Daylist section, empty when the current daypart's genres don't
  include the track's genre (Devotional). The Like toast is now exercised
  on /search results (same TrackRow handleLike + toast). Verified:
  "Added to Liked Songs".
- **Toast region** only renders while a toast is active (`{toast && ...}`)
  — absence before any toast is expected, not a bug.

### Per-item verification (run 4, 89/89)
- **Item 6:** header Sign in/Sign up guest @390 + @1280, Sign up →
  `/login?mode=signup`; avatar menu demo signed-in (Profile/Settings/Sign
  out, no Admin — demo user is a listener); pre-end hint 0:04→0:03, chip
  "Sign in for full songs · 0:03" top-left of cover; gate fires at 5s
  (prompt "Preview ended — sign in to hear the full song", Sign in →
  /login). Screenshots viewed: gate-390, hint-fullplayer-390.
- **Item 7:** /settings sections (Playback quality 128/320, autoplay,
  sleep default; Language; Morning Aarti Alarm; Privacy clear/export;
  About build id + legal links) + persistence across reload (quality 320,
  sleep 15, alarm 06:30); delete-account two-step confirm on /profile
  (demo); no "coming later" text anywhere on the surface.
- **Item 5:** autofocus off on touch (`pointer: coarse`, activeElement
  BODY), on on desktop.
- **Item 9:** Follow toggle Follow→Following→Follow + toast; album/artist
  Share toasts; Like toast "Added to Liked Songs" (screenshot viewed:
  like-toast-390 — heart filled gold, toast above bottom chrome).
- **Item 11:** 404 `<h1>` + title "Page not found | Nandha Music"; artist
  title single suffix; stale topbar comment removed.
- **Item 10:** all 4 queries find the track (Tamil `வாழ்வினில்`, Latin
  `vaazhvinil`, folded `valvinil`, upper-case `VAALVINIL`); 15 search unit
  tests pass.
- **Item 8:** sync engine + migration `003_user_library.sql` written
  (**NOT applied live** — needs the Supabase SQL Editor dashboard step);
  privacy policy updated to match (27 Nov 2026). Client handles the
  missing-table case (remote sync off for the session, local-only).
- **Item 12:** E2E coverage in the puppeteer harness (89 checks) + the
  545px expansion fixed (see above). CDP 34px-bottom-inset simulation not
  possible in this Chrome — proven via built-CSS rule (16
  `env(safe-area-inset-bottom,0px)` uses in FRESH dist) + computed style
  (bar bottom 64px = nav height, env()=0 headless).

### Gates (27 Nov 2026, after the fix)
`npm test` 18 files / **112 tests PASS**; `npm run build` green, buildId
**mwyvq496-b7712c17**; `scripts/pre-deploy-check.sh` OK; oxlint 37 warnings,
0 errors; `npx impeccable detect src/` baseline only (Inter font
anti-pattern — brand decision, untouched; bounce-easing advisory — user
decides, untouched). No new findings. Silent mp3 intact in dist (4,413
bytes). **NOT deployed, NOT pushed — implementation + verification only.**

### Still NOT completed (exact reason + what is needed)
- Migration 003 (`followed_artists`) not applied live — needs the Supabase
  SQL Editor dashboard step (file `supabase/migrations/003_user_library.sql`).
- Delete-account Edge Function not deployed — needs dashboard: create
  function, Verify JWT ON, SERVICE_ROLE_KEY secret
  (`supabase/functions/delete-account/index.ts`, steps in its header).
- Signed-in full-song play + admin write E2E unverified with real
  credentials — needs Sathiya's /login sign-in (demo mode is the headless
  substitute). Signed-in /profile view unverified for the same reason.
- Upstash Redis connection blocked awaiting Sathiya's go-ahead.

### Known cosmetic notes (not fixed in this batch)
- Toast overlaps the consent banner's descriptive text while the banner is
  up (transient 3.5s; Accept/Decline stay visible/tappable) — see
  like-toast-390.png.
- "Canvas" pill overlaps cover art's baked-in text in the full player
  (pre-existing).
- More button 47px below fold @664 (spec produces it; controls in view).

## Live verification — items 5–12 deployed (27 Nov 2026, build mwywm5ty-3045d11e)

Deployment `d843cedf-e74a-4ad2-baca-c3a6c9ab0283`, live at
https://nandha-music.pages.dev. 4 Ponytail deletions applied first
(3 locale keys × 3 locales, `.mix-card--steel`, `getSyncUserId()`,
unused `beforeEach` import); locale parity 429/429/429; lint baseline
36 warnings (docs/lint-baseline.md updated).

- P1 live re-run (`mobile-verify/check-deploy-p1-live-r2.js`):
  **75/75 PASS, 1 RECORDED** (More button 47px below fold @664).
  First run 73/75 — both failures were probe bugs, fixed in the probe:
  4g read the first `.btn-primary` in the whole document (the header
  "Sign up" added by item 6) instead of the Profile guest "Sign in";
  R11's `/Play/i` selector matched "Open player" (the
  `.player-bar-main` button) instead of the real Play toggle. The real
  replay flow was verified separately (`diag-regate-live.js`): playback
  resumes from 0 and re-gates at 5.2s audio time (7s wall).
- P2 live (`mobile-verify/check-deploy-p2-live.js`): **85 PASS, 0 FAIL,
  3 SKIP** (demo-only: signed-in avatar menu, demo full playback, demo
  delete — no demo mode on the live site; verified locally 89/89).
  Live evidence: hint chip "Sign in for full songs · 0:04" counting
  down; header Sign in/Sign up (guest, 390 + 1280); Sign up →
  `/login?mode=signup`; autoFocus off on touch / on desktop; all 4
  search queries find the track; Follow → Following + toast; Share
  toasts; settings persist across reload (quality 320, sleep 15,
  alarm 06:30); 404 `<h1>` + title; no overflow on any route at
  320/390/1280 — 320px viewport stays 320px (545px bug NOT regressed);
  gate pauses 5.22s audio time over a signed Supabase URL, dismiss
  rewinds to 0, replay re-gates; covers 134×134 @390 / 161×161 @1280;
  zero page/console errors. Perf (live, 390px, median of 3): DCL
  707ms, FCP 816ms; dist 2,876,354 bytes.
- Screenshots viewed in `mobile-verify/deploy-verify-p1-r2/` and
  `mobile-verify/deploy-verify-p2/` (home 320/390/1280, banner, gate,
  hint, full player 320/390/844, profile guest, settings 320/390,
  follow toast, Tamil search, More sheet).
- GitHub re-push: head `1efcbc0c904f333c6f0c303ec7a64e7bf62ff352`,
  141 paths, sync record 10 entries.

Still outstanding (unchanged): migration 003 not applied live;
delete-account Edge Function not deployed (+ SERVICE_ROLE_KEY secret);
signed-in full-song play + admin write E2E unverified (needs Sathiya's
sign-in); Upstash Redis connection still blocked awaiting go-ahead.

## Production sweep (27 Nov 2026, evening IST)

User direction: fix the remaining UI/flow problems first, make it a proper
production application, add remaining features later. Implementation +
verification only — no deploy, no GitHub push (OCR → Ponytail → deploy
follows). Full evidence in `docs/test-cases.md` (Production sweep
section) and `mobile-verify/prod-sweep/`.

**Live sweep first** (`mobile-verify/check-prod-sweep.js`): all 24 routes
× 320x568 / 390x844 / 1280x800 + dynamic /track/:id + /playlist/:id +
admin redirect + full-player geometry + L3 + toast-vs-consent + home
spot checks + Tamil/Latin search. **129 PASS, 9 FAIL** — 4 real, 5 probe
bugs (all diagnosed in `check-prod-sweep-r2.js`, 22 PASS / 2 FAIL, and
`diag-l3-live.js` / `diag-l3-queue.js` / `diag-568-layout.js`).

**Backlog verdicts:** QueuePanel aria-label verbs already localised (no
fix). Desktop cover 340×340 (rule `min(60vw, 340px)` — the old "272px"
note was wrong). Google Fonts: 481ms + 163ms, loaded, Tamil correct,
`display=swap` — no problem, not self-hosted. Version-banner mechanism
verified in code and observed live via /version.json interception
("New version available" + Refresh; never auto-reloads).

**Real issues found + fixed (local, build mwyywavf-5c3a8495):**
- Sleep sheet had no Escape handler → Escape now closes the sleep
  sheet first (full player + mini player), playback continues.
- OCR L2 preview-banner duplication → shared `src/player/PreviewBanner.jsx`.
- OCR L3 notice/preview overlap → single `.player-bar-popups` column;
  live the notice was fully hidden behind the banner, now stacked with
  an 8px gap, both visible.
- Toast overlapped the consent banner → toast lifts above the banner's
  measured top edge (12px gap).
- Canvas pill covered the cover's baked-in text → moved top-right; the
  move itself collided with the preview hint chip, so the toggle hides
  while the hint is up (5s guest preview) and appears after the gate.
- More button below the fold → reordered above the volume row:
  @664 711→651, desktop 862→796, @844 824→758 (all in view).
- New: search said "1 results" → plural `tp()` forms, "1 result"
  (locale parity 431/431/431).

**Recorded, not fixed:** More @320x568 still 54px below the fold
(bottom 622). Measured budget shows safe trims only save ~38px;
closing it needs a cover shrink (spec forbids) or hiding a title line
(content trade-off). The sheet scrolls and a 60px scroll brings it in
view — smallest viewport only.

**Regression:** P1 60/60 PASS, P2 89/89 PASS (local :5173); `npm test`
19 files / 113 tests PASS; build green; pre-deploy-check OK; oxlint
36 warnings, 0 errors (baseline); impeccable no new findings.
**NOT deployed, NOT pushed.**

**OCR review of this batch (27 Nov 2026, evening IST) — GO with one
fix applied (build mwyz8jfq-a6d45360):**
- M1 (Medium, fixed): cross-component Escape hole. The mini-bar sleep
  sheet renders at z-index 120, above the full-player overlay (z-100),
  and stayed open when the player opened via keyboard — one Escape then
  both closed the sheet AND stopped playback, contradicting the
  batch's Escape contract. Fix: `PlayerBar.jsx` closes its sleep sheet
  + queue popover when `isPlayerOpen` becomes true (covers every
  `openPlayer` caller, incl. `Track.jsx:66,91`). Verified by
  `mobile-verify/check-ocr-sweep-escape.js`: 9/9 PASS (sheet + queue
  close on player open; Escape with nothing open still stops playback
  by design; Escape closes the full-player sleep sheet without
  stopping). One accepted lint warning added (`set-state-in-effect`,
  PlayerBar.jsx:115 — same pattern as the other 10; baseline
  36 → 37, documented in `docs/lint-baseline.md`, gate allows 40).
- Canvas toggle verified correct: `previewSecondsLeft` is null after
  the gate fires and always null for signed-in users, so the toggle
  appears after the gate and is always there for signed-in users.
- Lows left unfixed: toast re-measures only when the toast changes
  (stays lifted if the banner unmounts mid-toast; cosmetic, ≤3.5s);
  `search.results` base key is the live `tp()` fallback, not dead.
- A focus-trap gap was suspected (trap queries `sheetRef` only) but
  DISPROVED by probe: the sleep/More sheets render inside the player
  sheet, so the trap covers them — 30 Tabs stayed in the dialog
  (`mobile-verify/check-ocr-sweep-focus.js`). Not a finding.
- More @320x568 (54px below fold) judged ACCEPTABLE for GO: closing it
  needs a cover shrink (forbidden by the P1 spec) or hiding a title
  line; the sheet scrolls and controls/seek are in view — smallest
  viewport only, recorded limitation.
- After the fix: `npm test` 19 files / 113 tests PASS; build green
  (mwyz8jfq-a6d45360); pre-deploy-check OK; P1 60/60 PASS (1 recorded);
  P2 88/89 — the 1 FAIL ("hint countdown decreases", 0:04 → 0:04) is a
  timing flake, re-probed PASS (0:05 → 0:04 → 0:02, currentTime
  advancing; `mobile-verify/check-ocr-hint-flake.js`). Ready for the
  Ponytail audit.

Still outstanding (unchanged): migration 003 not applied live;
delete-account Edge Function not deployed (+ SERVICE_ROLE_KEY secret);
signed-in full-song play + admin write E2E unverified (needs Sathiya's
/login sign-in); M1 different-track close-race blocked on a 2nd song;
Upstash Redis connection still blocked awaiting go-ahead; S7 security
headers still out of scope (direct-upload path).

### Deploy + live verification (27 Nov 2026, evening IST)
- **Deletions applied (user approved 18:37 IST — exactly the 2 Ponytail comment items, nothing else):** MobilePlayer.jsx:439 last sentence "The Canvas toggle stays bottom-right." deleted; player.css:641 parenthetical "(the Canvas toggle is bottom-right)" deleted. Grep verified: remaining "bottom-right" hits are the sweep's own historical comment (player.css:608, correct) and the mix-card play button (theme.css:1670, correct).
- **Gates:** npm test 19 files / 113 tests PASS; build green (local mwyzxv1m-bcdb8f73; pre-deploy-check rebuilt the same source → deployed buildId **mwyzy5ch-88bae1d3**); pre-deploy-check OK; oxlint 37 warnings, 0 errors (documented, gate 40).
- **Deploy:** Cloudflare Pages deployment **0814e260-b538-4a15-96d0-0158aba00def** (49 files, 2,877,011 bytes, stage deploy success), live at https://nandha-music.pages.dev. The script's urllib 403 verify lines are the known fetcher-block artifact — curl confirms prod 200 + version.json = mwyzy5ch-88bae1d3.
- **P1 live (check-deploy-p1-live.js): 75/75 PASS, 1 RECORDED** (More button 47px below fold @664). First run 72/75 — all 3 FAILs were probe bugs, diagnosed and fixed in the probe (R1 hardcoded the old Priority-1 buildId mwyrrp61-86e96322; 4g read the first `.btn-primary` in the document = header Sign-up, now scoped to `main`; R11 matched /Play/i = "Open player", now exact 'Play'), re-run 75/75. Gate pauses 5.20s audio time over a signed Supabase URL, dismiss rewinds to 0, replay re-gates; covers 134×134 @390 / 161×161 @1280; 320px viewport stays 320px.
- **P2 live (check-deploy-p2-live.js): 85 PASS / 0 FAIL / 3 SKIP** (demo-only: signed-in avatar menu, demo full playback, demo delete). Perf live 390px median of 3: DCL 772ms, FCP 860ms; dist 2,877,011 bytes. Settings persist across reload; 404 <h1> + title correct; all 4 Tamil/Latin queries find the track.
- **Prod sweep live (check-prod-sweep.js): 131 PASS / 7 FAIL** — all 7 explained, none an app bug: 4× full-player @390x664 all-null geometry = cold-start probe flake (play click fired before the catalog loaded; re-probe with waits: 14/14 PASS, More bottom 651 in view — see fixups); 1× More @320x568 bottom 622 = the RECORDED limitation (54px below fold); 2× search Tamil/Latin = wrong input selector in the probe (generic `input[type="search"]` picked the wrong input; P2's `main .search-box input[type="search"]` passes). Route walk: all 24 routes × 320/390/1280, no overflow, no page errors; admin signed-out → /login; covers square everywhere; desktop cover 340×340.
- **Sweep fixups live (check-deploy-sweep-fixups.js): 14/14 PASS** — @390x664 cover 226×226, seek bottom 525, controls bottom 593, More bottom 651 (in view); Canvas toggle hidden while the hint chip is up; search Tamil + Latin; REAL toast "Added to Liked Songs" above the consent banner with exactly a 12px gap (toast bottom 664 vs banner top 676), Accept + Decline visible and tappable.
- **L3 live (diag-l3-live.js): STACKED, no overlap** — notice y 571–607, preview y 615–706 (8px gap), zero page errors. Screenshot l3-live.png.
- **Sleep Escape live (check-deploy-sweep-live.js v2): 9/9 PASS** — sleep sheet opens from the mini bar; closes when the full player opens (OCR M1 fix); opens inside the full player via More → sleep row; Escape closes it, full player stays open with the track set, playback continues (audio went from not-yet-started to playing across the Escape — Escape did not stop it). Search "1 result" singular confirmed. v1 of this probe failed 5/9 because it never waited for the catalog (play click missed) and looked for a direct sleep button in the full player (it lives in the More sheet) — probe bugs, fixed in v2.
- **Screenshots viewed:** prod-sweep/fullplayer-664-reprobe.png (More in view @664, hint chip on one line, Canvas pill hidden, cover text clear), l3-live.png (notice stacked above banner, "1 result"), toast-consent-real.png (toast 12px above banner, Accept/Decline clear), escape-after-live.png (sheet closed, player open, Pause icon = playing), deploy-verify-p1/home-390-live.png + home-1280-live.png (clean; consent banner transiently overlaps the Song of the Day Play button / mix-card subtitles until Accept/Decline — same as previous deploys, dismissible).
- **Recorded, unchanged:** More @320x568 still 54px below fold (cover shrink forbidden by P1 spec); P2's 3 demo-only skips need Sathiya's sign-in to verify live.

Still outstanding (unchanged): migration 003 not applied live; delete-account Edge Function not deployed (+ SERVICE_ROLE_KEY secret); signed-in full-song play + admin write E2E unverified (needs Sathiya's /login sign-in); M1 different-track close-race blocked on a 2nd song; Upstash Redis connection still blocked awaiting go-ahead; S7 security headers still out of scope (direct-upload path).

## 3-song batch — app deploy + live verification (27 Nov 2026 19:31 IST)

- **Scope:** app client change only (signedAudio.js `SIGNED_TRACK_FILES` Set of 3 + dropAllSignedAudioUrls + regression tests; get-audio-url allowlist edit). The new tracks are NOT in the live catalog yet — mp3s/covers go in via the Supabase dashboard browser task, seed SQL + function redeploy are separate dashboard steps AFTER this deploy. 3-song live playback verification awaits those steps; their absence on the live site is expected, not a failure.
- **Ponytail deletion applied (user approved 19:31 IST):** `src/lib/signedAudio.js:26` — removed the `export` keyword from `SIGNED_TRACK_FILES` (module-local `const` now). Grep-verified: zero imports anywhere; only internal uses remain (isSignedTrack, dropAllSignedAudioUrls).
- **Gates:** npm test 19 files / 116 tests PASS; build green (local buildId mwz1vktv-06827a8b); pre-deploy-check OK; oxlint 37 warnings, 0 errors.
- **Deploy:** deployment `37aa6512-cb6a-4089-8094-2e6e8c9d1b63`, 49 files, 2,877,116 bytes, stage deploy success; live at https://nandha-music.pages.dev, deployed buildId **mwz1vtbq-53514955** (pre-deploy-check rebuilt the same source). curl prod 200. The script's urllib 403 verify lines are the known fetcher-block artifact.
- **Deployed-bundle check (curl + grep of live index-CpMJvMRe.js):** contains `new Set([`vaazhvinil-orumurayenum.mp3`,`malaiyoram-veesiya-kaatre.mp3`,`marakka-mudiyuma.mp3`])` — the new client code IS live. Old singular `SIGNED_TRACK_FILE`: 0 hits.
- **P1 live: 75/75 PASS, 1 RECORDED** (check-deploy-p1-live.js, 76 checks: R1 + 3e counted separately). R1 "FAIL" is a stale probe expectation (hardcoded the old sweep buildId mwyzy5ch-88bae1d3; live is correctly mwz1vtbq-53514955) — probe bug, not an app failure. RECORDED: More button 47px below fold @664 (unchanged). Gate pauses 5.24s audio time over a signed Supabase URL, dismiss rewinds to 0, replay re-gates; covers 134×134 @390 / 161×161 @1280; 320px viewport stays 320px.
- **P2 live: 85 PASS / 0 FAIL / 3 SKIP** (check-deploy-p2-live.js; the 3 skips are demo-only: signed-in avatar menu, demo full playback, demo delete). Perf live 390px median of 3: **DCL 738ms, FCP 828ms**; dist 2,877,116 bytes.
- **Function probe (live, pre-redeploy — expected):** Vaazhvinil → 200, Malaiyoram → 403, Marakka → 403. The deployed function still allowlists only Vaazhvinil; the dashboard redeploy is still required before the new tracks can mint.
- **Screenshots viewed:** deploy-verify-p1/home-390-live.png + home-1280-live.png (clean; consent banner transiently overlaps the Song of the Day Play button / mix-card subtitles until Accept/Decline — same as previous deploys, dismissible), gate-prompt-390.png ("Preview ended — sign in to hear the full song", Sign in + Maybe later, player bar below), player-390x664.png (cover 226×226, hint chip one line, seek + all controls + More actions in view, Canvas pill top-right).

Still outstanding (unchanged + new): seed SQL + get-audio-url function redeploy (dashboard steps — mp3/cover uploads via browser task, SQL run, function redeploy with Verify JWT ON); 3-song live playback check after those; signed-in full-song play + admin write E2E unverified (needs Sathiya's /login sign-in); M1 different-track close-race unblocked once a 2nd song is live; migration 003 not applied live; delete-account Edge Function not deployed (+ SERVICE_ROLE_KEY secret); Upstash Redis connection still blocked awaiting go-ahead; S7 security headers still out of scope (direct-upload path).

### Post-dashboard live verification — 3 songs end-to-end (27 Nov 2026 ~20:00–20:08 IST, build mwz1vtbq-53514955)

- **Function probe (deployed get-audio-url, POST with anon key + Origin pages.dev):** Vaazhvinil → 200, Malaiyoram → 200, Marakka → 200 (signed URLs minted, `expiresIn: 300`); negative `../vaazhvinil-orumurayenum.mp3` → 403 track_not_allowed. The redeploy DID take effect (dashboard "Last deployed 7:51pm" corroborated, not trusted alone). Signed URLs for the new tracks resolve to `…/sign/audio/audio/<file>.mp3` (object stored under the `audio/` folder inside the bucket — the function's first candidate path).
- **Live catalog (DB via anon REST, corroborated by headless runs):** 3 published tracks — Vaazhvinil (224s, composer Siddha Guruji), Malaiyoram (351s, composer NULL, hook 63/12), Marakka (254s, composer Siddha Guruji); 3 lyrics rows — Malaiyoram synced 32 lines, Vaazhvinil unsynced 40, Marakka unsynced 32. Home shows all 3 tracks with the NEW orange-N covers; cover boxes measured 134×134 @390 and 161×161 @1280, no stretch. Screenshots viewed: check-3song-live/home-390.png, home-1280.png (clean dark UI; Song of the Day + Made For You mixes).
- **Track pages (`/track/<slug>` — NOTE: the public route is singular `/track/`, not `/tracks/`; the brief's `/tracks/...` URLs 404 by design):** Malaiyoram title (Tamil + English), 5:51, hook chip; Marakka title, 4:14; Vaazhvinil 3:44. Screenshots viewed: track-malaiyoram.png, track-marakka.png (new sunset-couple covers with bare orange N logo, Tamil titles intact).
- **Guest gate — Malaiyoram:** play → signed URL mints (8× get-audio-url 200 in the session), audio plays, pauses at 5.23s audio time, "Preview ended — sign in" prompt, dismiss rewinds to 0 + stays paused, replay re-gates at 5.25s. **Guest gate — Marakka:** plays from 1.9s at t+2s, pauses at 5.20s, prompt shown, still 5.20s at t+8.5s. Zero page/console errors in all runs; 320px viewport stays 320px (scrollWidth 320, no horizontal overflow). Only network noise: `net::ERR_ABORTED` on in-flight signed-audio Range requests when playback stops/switches — normal aborts, no 4xx/5xx.
- **M1 different-track close race — PASS (via Vaazhvinil, Marakka was deleted mid-run):** Malaiyoram playing (0.67s, signed URL) → tap Vaazhvinil Play → audio src switches to `vaazhvinil-orumurayenum.mp3`, currentTime 2.36s playing, player bar shows Vaazhvinil; Malaiyoram stopped cleanly, no overlap, no error. Vaazhvinil then gates at 5.21s + prompt as expected.
- **Marakka deletion mid-verification (user action 19:56 IST, NOT an app bug):** the user deleted the Marakka track himself while run 2 was in flight — its track page 404'd and its Play button vanished mid-run. The track was re-created (published, 254s, composer Siddha Guruji, lyrics 32 lines) by ~20:06 IST and was then verified normally (track page + gate above). Residual: the orphan Marakka ALBUM row survives in New Releases as an album card (0 tracks) — cosmetic; the "Marakka" card seen on Home during the deletion window was the album card, not a track (Home renders albums as `article.track-card` too — probe lesson: count track cards by section, not globally).
- **P1 live re-run (check-deploy-p1-live.js, after the dashboard steps): 73/75 PASS, 1 RECORDED.** The 2 "FAIL"s are BOTH stale probe expectations, not app failures: R1 hardcodes the old sweep buildId mwyzy5ch-88bae1d3 (live is correctly mwz1vtbq-53514955); R12 expects the Weekly Mix to render exactly 1 row (written for the 1-track catalog) — it now correctly renders 3 rows (Vaazhvinil + Marakka + Malaiyoram, "3 SONGS", screenshot mix-page-390-live.png viewed). RECORDED unchanged: More button 47px below fold @664. Gate R6–R11 all PASS on Vaazhvinil (pauses 5.249s audio time).
- **BUG 1 (High) — Supabase lyrics NEVER reach the player (lyrics display broken):** DB has all 3 lyrics rows, but the full-player Lyrics view shows Malaiyoram 0 lines ("Lyrics coming soon"), Vaazhvinil the OLD 4 sample lines, Marakka 0 lines (screenshots lyrics-malaiyoram.png + lyrics-vaazhvinil.png viewed). Root cause (code-read, matches observations exactly): `PlayerContext.play(track, queue)` loads the track **from the queue by id** (`loadTrackAt`), discarding the passed object — and `fetchTracks` (the list) never attaches lyrics; only `fetchTrack` (single-track) does, and `Track.jsx`'s play effect fires with the static fallback first (same id → guard blocks re-play with the real object), so the player permanently holds a lyrics-less object (Vaazhvinil keeps the static 4 sample lines via `mapTrack`'s REAL_TRACK_ID fallback; the new tracks get `lyricsTa: []`). The track-page `fetchTrack` lyrics attach is dead code in practice for playback. Fix direction (for the next batch, NOT done here): attach lyrics in `fetchTracks` or re-resolve/enrich the current track in the player (e.g. `fetchLyricsForTrack` on track change). Synced-line highlight could NOT be observed as a guest in any case (first Malaiyoram line starts 32.56s, past the 5s gate) — needs a signed-in session.
- **BUG 2 (Medium) — composer fallback misattributes Malaiyoram:** `player/MobilePlayer.jsx:269` and `player/StoryCard.jsx:16` do `track.composer || 'Siddha Guruji'`, so Malaiyoram (composer NULL by design — user: do NOT assume Siddha Guruji) displays "Composer: Siddha Guruji" in the full player (screenshot track-malaiyoram.png). Fix direction: render nothing (or "Nandha Music") when composer is blank instead of defaulting to a person's name.
- **Observation (not a failure):** 8 get-audio-url mints in one short Malaiyoram session (track-page auto-plays in headless + home play + replay), all 200 — possible redundant minting, worth a look when the lyrics fix lands.
- **Probe bugs found and fixed in my own scripts (not app bugs):** run 1 used `/tracks/<slug>` (404 — public route is `/track/<slug>`) and English title fragments for Play buttons whose aria-labels carry the Tamil title; fixed and re-run. The `check-3song-live.js` / `check-3song-followup.js` / `check-3song-marakka.js` scripts live in mobile-verify/ (deploy-round verify scripts — NOT pushed, per convention).

Still outstanding (updated): the 2 bugs above (lyrics display + composer fallback) need a fix batch (code → OCR → Ponytail → deploy, per standing flow); signed-in full-song play still unverified (needs Sathiya's /login sign-in — guest gate blocks past 5s, so synced-lyrics highlight also awaits sign-in); migration 003 not applied live; delete-account Edge Function not deployed (+ SERVICE_ROLE_KEY secret); Upstash Redis connection still blocked awaiting go-ahead; S7 security headers still out of scope (direct-upload path).
