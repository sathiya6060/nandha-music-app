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
