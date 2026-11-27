// Items 5-12 verification (mobile audit, 27 Nov 2026): the P2 suite.
// Viewports: 320x568, 390x844 (+390x664 short player), 1280x800.
// Real server http://localhost:5173 (current source, guest) + demo-mode
// server http://localhost:5174 (VITE_DEMO_MODE=true, signed-in demo
// user — the only way to exercise signed-in flows headlessly; no real
// credentials exist in this environment).
// Puppeteer + Chrome for Testing, proxy 127.0.0.1:18080.
// Screenshots + results JSON in mobile-verify/audit-p2/.
//
// What this covers (brief item 12 + the item 5-11 fixes):
//  - no horizontal overflow on every route, 320/390/1280 (the audit's
//    546px layout-viewport expansion is checked WITHOUT any injected
//    containment override — the fix must be in the CSS itself)
//  - consent banner <=96px, never over Accept/Decline or Play
//  - mini player vs nav gap, full-player controls inside the viewport
//  - Profile tab destination, header Sign in/Sign up, avatar menu
//  - guest 5s gate: pre-end hint countdown -> gate -> /login
//  - Search autoFocus: off on touch, on on desktop
//  - Tamil/Latin search, Follow toggle + toast, Share + toast,
//    Like toast, playlist-create toast
//  - /settings: sections, persistence across reload, no "coming later"
//  - 404 <h1>, artist title (no duplication), delete-account confirm
//    (demo mode), signed-in full playback (demo mode), 34px inset
//    (built-CSS rule + computed style — CDP cannot simulate the inset)
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const DIR = __dirname;
const OUT = path.join(DIR, 'audit-p2');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = path.join(DIR, '.cache/chrome/linux-158.0.8127.88/chrome-linux64/chrome');
const SITE = 'http://localhost:5173';
const DEMO = 'http://localhost:5174';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
let passCount = 0;
let failCount = 0;
function check(name, ok, extra) {
  results[name] = ok ? 'PASS' : `FAIL${extra ? ` (${extra})` : ''}`;
  if (ok) passCount += 1; else failCount += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
}

async function newPage(browser, width, height, lang, { touch = width < 1024 } = {}) {
  const ctx = await browser.createBrowserContext();
  // Clipboard write (Share fallback) needs the permission in headless.
  try { await ctx.overridePermissions('http://localhost:5173', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']); } catch { /* ignore */ }
  try { await ctx.overridePermissions('http://localhost:5174', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']); } catch { /* ignore */ }
  const page = await ctx.newPage();
  await page.setViewport({ width, height, isMobile: width < 1024, hasTouch: touch, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  if (lang) {
    await page.evaluateOnNewDocument((l) => {
      try { localStorage.setItem('nandha-lang-v2', l); } catch { /* ignore */ }
    }, lang);
  }
  page._auditErrors = errors;
  return page;
}

async function loadHome(page, site = SITE) {
  await page.goto(site, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForSelector('.bottom-nav', { timeout: 60000 });
  await page.waitForFunction(() => /Vaazhvinil|வாழ்வினில்/.test(document.body.innerText || ''), { timeout: 60000 });
  await sleep(1200);
  return { innerWidth: await page.evaluate(() => window.innerWidth) };
}

async function gotoRoute(page, route, site = SITE) {
  await page.goto(site + route, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(1000);
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const docW = document.documentElement.scrollWidth;
    let maxRight = 0;
    let maxEl = '';
    // NOTE (run 3): a card inside a horizontal scroller (.section-row,
    // overflow-x: auto) legitimately has right > vw — it is scroll
    // content, not page overflow. Only elements WITHOUT a horizontal
    // scroll ancestor count toward maxRight; the real bug (the audit's
    // 545px expansion) is caught by docW > vw regardless.
    const inHScroller = (el) => {
      let a = el.parentElement;
      while (a && a !== document.body) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
        a = a.parentElement;
      }
      return false;
    };
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > maxRight && !inHScroller(el)) {
        maxRight = Math.round(r.right);
        maxEl = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`;
      }
    });
    return { vw, docW, maxRight, maxEl };
  });
}

async function playFirstTrack(page) {
  // A TRACK button, not a mix card: the first /Play/i button in DOM
  // order is the Weekly Mix card, whose play path differs from a
  // track's (and whose audio buffers through the same signed URL, so
  // the gate section below waits on currentTime, not wall time).
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('.track-row__cover-btn:not([disabled])')
      || document.querySelector('.track-card__play-btn:not([disabled])')
      || [...document.querySelectorAll('button')].find((b) => /Play/i.test(b.getAttribute('aria-label') || '') && b.offsetParent !== null);
    if (!btn) return null;
    const label = btn.getAttribute('aria-label');
    btn.click();
    return label;
  });
  await page.waitForSelector('.player-bar', { timeout: 30000 });
  await sleep(1500);
  return clicked;
}

// Wait until the <audio> currentTime passes `min` seconds (the signed
// URL buffers ~2s through the egress proxy — wall time alone is not a
// reliable proxy for playback position).
async function waitForCurrentTime(page, min, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ct = await page.evaluate(() => {
      const a = document.querySelector('audio');
      return a ? a.currentTime : null;
    });
    if (ct !== null && ct > min) return ct;
    await sleep(500);
  }
  return null;
}

async function waitForGate(page, timeoutMs = 30000) {
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < timeoutMs) {
    const st = await page.evaluate(() => {
      const a = document.querySelector('audio');
      return { found: !!document.querySelector('.player-preview'), ct: a ? Math.round(a.currentTime * 10) / 10 : null, paused: a ? a.paused : null };
    });
    if (st.found) return true;
    // Log position every ~5s so a slow-buffer case is diagnosable.
    if (++n % 10 === 0) console.log('  gate wait:', JSON.stringify(st));
    await sleep(500);
  }
  return false;
}

async function openFullPlayer(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').startsWith('Open player') && b.offsetParent !== null);
    if (btn) btn.click();
  });
  await page.waitForSelector('.mobile-player', { timeout: 15000 });
  await sleep(800);
}

const ROUTES = [
  '/', '/search', '/library', '/discover',
  '/track/vaazhvinil-orumurayenum', '/artist/1', '/album/1',
  '/profile', '/settings', '/login', '/privacy', '/nope-404',
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu',
      '--proxy-server=http://127.0.0.1:18080', '--proxy-bypass-list=127.0.0.1,localhost',
      '--ignore-certificate-errors'],
  });

  // ============ OVERFLOW — every route, 320 / 390 / 1280 ============
  // No injected containment override: the CSS itself must hold 320px.
  for (const [w, h] of [[320, 568], [390, 844], [1280, 800]]) {
    for (const route of ROUTES) {
      const page = await newPage(browser, w, h);
      await gotoRoute(page, route);
      const m = await measureOverflow(page);
      check(`overflow ${route} @${w}`, m.docW <= w && m.maxRight <= w + 1, `vw=${m.vw} docW=${m.docW} maxRight=${m.maxRight} (${m.maxEl})`);
      await page.close();
    }
  }
  // 320px settings screenshot (the seg overflow found by the diagnostic).
  {
    const page = await newPage(browser, 320, 568);
    await gotoRoute(page, '/settings');
    await page.screenshot({ path: path.join(OUT, 'settings-320.png') });
    await page.close();
  }

  // ============ CONSENT BANNER — 390 + 320 ============
  let page = await newPage(browser, 390, 844);
  await loadHome(page);
  let banner = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  });
  check('banner height <=96px @390', banner && banner.h <= 96, `h=${banner?.h}`);
  // Banner must never cover the mini-player Play button: play a track
  // with the banner still up and compare rects.
  await playFirstTrack(page);
  const bannerVsPlayer = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    const bar = document.querySelector('.player-bar');
    if (!b || !bar) return null;
    const br = b.getBoundingClientRect();
    const pr = bar.getBoundingClientRect();
    const hit = !(br.right <= pr.left || pr.right <= br.left || br.bottom <= pr.top || pr.bottom <= br.top);
    return { overlap: hit, bannerH: Math.round(br.height), barTop: Math.round(pr.top), bannerTop: Math.round(br.top) };
  });
  check('banner never overlaps mini player @390', bannerVsPlayer && !bannerVsPlayer.overlap, JSON.stringify(bannerVsPlayer));
  await page.screenshot({ path: path.join(OUT, 'banner-player-390.png') });
  await page.close();

  page = await newPage(browser, 320, 568);
  await loadHome(page);
  banner = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { h: Math.round(r.height) };
  });
  check('banner height <=96px @320', banner && banner.h <= 96, `h=${banner?.h}`);
  await page.close();

  // ============ MINI PLAYER vs NAV GAP ============
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.consent-banner__actions button')].find((x) => /Accept/i.test(x.textContent));
    if (b) b.click();
  });
  await sleep(500);
  await playFirstTrack(page);
  const gap = await page.evaluate(() => {
    const bar = document.querySelector('.player-bar');
    const nav = document.querySelector('.bottom-nav');
    if (!bar || !nav) return null;
    const br = bar.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    return { barBottom: Math.round(br.bottom), navTop: Math.round(nr.top), diff: Math.round(nr.top - br.bottom) };
  });
  check('mini player bottom = nav top @390', gap && Math.abs(gap.diff) <= 1, JSON.stringify(gap));
  await page.close();

  // ============ FULL PLAYER CONTROLS IN VIEWPORT (390x664 + 320x568) ============
  for (const [w, h] of [[390, 664], [320, 568]]) {
    page = await newPage(browser, w, h);
    await loadHome(page);
    await playFirstTrack(page);
    await openFullPlayer(page);
    const fp = await page.evaluate(() => {
      const vh = window.innerHeight;
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.bottom <= vh + 1 && r.top >= 0 };
      };
      return {
        vh,
        seek: rect('.mobile-player-seek'),
        controls: rect('.mobile-player-controls'),
        more: rect('.mobile-player-more-btn'),
        hint: (() => {
          const el = document.querySelector('.mobile-player-preview-hint');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { text: el.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom) };
        })(),
      };
    });
    console.log(`FULL PLAYER @${w}x${h}:`, JSON.stringify(fp));
    check(`full-player seek in view @${w}x${h}`, fp.seek && fp.seek.inView, JSON.stringify(fp.seek));
    check(`full-player controls in view @${w}x${h}`, fp.controls && fp.controls.inView, JSON.stringify(fp.controls));
    await page.screenshot({ path: path.join(OUT, `fullplayer-${w}x${h}.png`) });
    await page.close();
  }

  // ============ GUEST GATE + PRE-END HINT COUNTDOWN (390) ============
  // NOTE (run 2): the full-player close STOPS playback by design
  // (requestClose pauses + stopPlayback after 240ms — "stop means
  // stop"), so opening + closing the full player mid-preview killed
  // the gate test (hint went null, no gate). The hint countdown +
  // gate therefore run here on the MINI player only; the full-player
  // chip is checked on a SEPARATE page below (that page is closed
  // without touching the player's X).
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  const gateClicked = await playFirstTrack(page);
  console.log('GATE played via:', gateClicked);
  // Wait for the audio to actually be playing before reading the
  // countdown — the signed URL buffers ~2s, so a wall-time read at
  // 1.5s still shows 0:05 even though the countdown works.
  const ctAtHint = await waitForCurrentTime(page, 1);
  check('guest audio is actually playing (currentTime advances)', ctAtHint !== null, `ct=${ctAtHint}`);
  // hint1 right away (ct ~1.2 -> "0:04"); hint2 1.5s later
  // (ct ~2.7 -> "0:02"/"0:03") — both safely inside the 5s preview.
  const hint1 = await page.evaluate(() => {
    const el = document.querySelector('.player-bar-artist--hint');
    return el ? el.textContent.trim() : null;
  });
  await sleep(1500);
  const hint2 = await page.evaluate(() => {
    const el = document.querySelector('.player-bar-artist--hint');
    return el ? el.textContent.trim() : null;
  });
  console.log('HINT:', hint1, '->', hint2);
  const secs = (s) => { const m = /0:0(\d)/.exec(s || ''); return m ? parseInt(m[1], 10) : null; };
  check('mini-player pre-end hint shows sign-in + countdown', hint1 && /Sign in for full songs/i.test(hint1) && secs(hint1) !== null, hint1);
  check('hint countdown decreases as preview plays', secs(hint1) !== null && secs(hint2) !== null && secs(hint2) < secs(hint1), `${hint1} -> ${hint2}`);
  await page.screenshot({ path: path.join(OUT, 'hint-390.png') });
  const gated = await waitForGate(page);
  check('guest 5s gate fires (preview prompt)', gated);
  const gateText = await page.evaluate(() => {
    const el = document.querySelector('.player-preview');
    return el ? el.textContent.trim().slice(0, 120) : null;
  });
  check('gate prompt names sign-in for full songs', gateText && /Sign in/i.test(gateText), gateText);
  await page.screenshot({ path: path.join(OUT, 'gate-390.png') });
  // Gate -> /login.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.player-preview button, .player-preview a')].find((x) => /Sign in/i.test(x.textContent));
    if (b) b.click();
  });
  await sleep(1200);
  check('gate sign-in button goes to /login', page.url().includes('/login'), page.url());
  await page.close();

  // ============ FULL-PLAYER HINT CHIP (separate page, 390) ============
  // The chip only exists DURING the preview; this page is discarded
  // afterwards (closing the player would stop playback by design).
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  await playFirstTrack(page);
  await waitForCurrentTime(page, 1);
  await openFullPlayer(page);
  const chipText = await page.evaluate(() => {
    const el = document.querySelector('.mobile-player-preview-hint');
    return el ? el.textContent.trim() : null;
  });
  check('full-player hint chip shows during preview', chipText && /Sign in for full songs/i.test(chipText), chipText);
  check('full-player hint chip matches the mini-player separator', chipText && /Sign in for full songs · 0:0\d/.test(chipText), chipText);
  await page.screenshot({ path: path.join(OUT, 'hint-fullplayer-390.png') });
  await page.close();

  // ============ HEADER AUTH (guest, 390 + 1280) ============
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  const headerGuest = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.topbar__auth-btn')].map((b) => b.textContent.trim());
    const hasAvatar = !!document.querySelector('.topbar__avatar');
    const hasAdminLink = [...document.querySelectorAll('.topbar a, .topbar button')].some((x) => x.textContent.trim() === 'Admin');
    return { btns, hasAvatar, hasAdminLink };
  });
  check('guest header shows Sign in + Sign up, no avatar, no Admin link', headerGuest.btns.includes('Sign in') && headerGuest.btns.includes('Sign up') && !headerGuest.hasAvatar && !headerGuest.hasAdminLink, JSON.stringify(headerGuest));
  await page.screenshot({ path: path.join(OUT, 'header-390-guest.png') });
  // Sign up -> /login?mode=signup.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.topbar__auth-btn')].find((x) => x.textContent.trim() === 'Sign up');
    if (b) b.click();
  });
  await sleep(1200);
  check('header Sign up goes to /login?mode=signup', page.url().includes('/login') && page.url().includes('mode=signup'), page.url());
  await page.close();

  page = await newPage(browser, 1280, 800);
  await loadHome(page);
  const headerDesktop = await page.evaluate(() => [...document.querySelectorAll('.topbar__auth-btn')].map((b) => b.textContent.trim()));
  check('guest header shows Sign in + Sign up @1280', headerDesktop.includes('Sign in') && headerDesktop.includes('Sign up'), JSON.stringify(headerDesktop));
  await page.close();

  // ============ PROFILE TAB DESTINATION ============
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('.bottom-nav a')].find((x) => x.getAttribute('href') === '/profile');
    if (a) a.click();
  });
  await sleep(1200);
  const profDest = await page.evaluate(() => ({
    url: window.location.pathname,
    h1: document.querySelector('main h1') ? document.querySelector('main h1').textContent.trim() : null,
  }));
  check('Profile tab goes to /profile with a heading', profDest.url === '/profile' && profDest.h1 === 'Profile', JSON.stringify(profDest));
  await page.close();

  // ============ SEARCH AUTOFOCUS: off on touch, on on desktop ============
  page = await newPage(browser, 390, 844);
  await gotoRoute(page, '/search');
  const touchFocus = await page.evaluate(() => ({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    activeIsSearch: document.activeElement === document.querySelector('main .search-box input[type="search"]'),
    activeTag: document.activeElement ? document.activeElement.tagName : null,
  }));
  check('touch: no autofocus on /search', touchFocus.coarse && !touchFocus.activeIsSearch, JSON.stringify(touchFocus));
  await page.close();

  page = await newPage(browser, 1280, 800, undefined, { touch: false });
  await gotoRoute(page, '/search');
  const deskFocus = await page.evaluate(() => ({
    coarse: window.matchMedia('(pointer: coarse)').matches,
    activeIsSearch: document.activeElement === document.querySelector('main .search-box input[type="search"]'),
  }));
  check('desktop: autofocus on /search', !deskFocus.coarse && deskFocus.activeIsSearch, JSON.stringify(deskFocus));
  await page.close();

  // ============ SEARCH: Tamil / Latin transliteration ============
  const searchCases = [
    { q: 'வாழ்வினில்', label: 'Tamil script' },
    { q: 'vaazhvinil', label: 'Latin long vowels' },
    { q: 'valvinil', label: 'Latin folded (aa->a, zh->l)' },
    { q: 'VAALVINIL', label: 'upper-case folded' },
  ];
  for (const { q, label } of searchCases) {
    page = await newPage(browser, 390, 844);
    await gotoRoute(page, '/search');
    await page.evaluate((query) => {
      const input = document.querySelector('main .search-box input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, q);
    await sleep(1200);
    const found = await page.evaluate(() => /வாழ்வினில்|Vaazhvinil/.test(document.body.innerText || ''));
    check(`search "${q}" finds the track (${label})`, found);
    if (q === 'வாழ்வினில்') await page.screenshot({ path: path.join(OUT, 'search-tamil-390.png') });
    await page.close();
  }

  // ============ FOLLOW TOGGLE + TOAST (artist page) ============
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  const artistHref = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) => (x.getAttribute('href') || '').startsWith('/artist/'));
    return a ? a.getAttribute('href') : null;
  });
  check('home links to an artist page', !!artistHref, artistHref);
  await gotoRoute(page, artistHref);
  const artistTitle = await page.evaluate(() => document.title);
  check('artist title has no duplicated suffix', artistTitle.endsWith('| Nandha Music') && !artistTitle.includes('| Nandha Music | Nandha Music'), artistTitle);
  const follow1 = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^(Follow|Following)$/i.test(x.textContent.trim()));
    if (!b) return null;
    const before = b.textContent.trim();
    b.click();
    return before;
  });
  await sleep(800);
  const followAfter = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^(Follow|Following)$/i.test(x.textContent.trim()));
    const toast = document.querySelector('.toast-region .toast');
    return { label: b ? b.textContent.trim() : null, toast: toast ? toast.textContent.trim() : null };
  });
  check('follow toggle flips Follow -> Following', follow1 === 'Follow' && followAfter.label === 'Following', `${follow1} -> ${followAfter.label}`);
  check('follow shows a toast', followAfter.toast && /following/i.test(followAfter.toast), followAfter.toast);
  await page.screenshot({ path: path.join(OUT, 'follow-toast-390.png') });
  // Toggle back.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^(Follow|Following)$/i.test(x.textContent.trim()));
    if (b) b.click();
  });
  await sleep(800);
  const followBack = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^(Follow|Following)$/i.test(x.textContent.trim()));
    const toast = document.querySelector('.toast-region .toast');
    return { label: b ? b.textContent.trim() : null, toast: toast ? toast.textContent.trim() : null };
  });
  check('follow toggle flips back Following -> Follow', followBack.label === 'Follow', JSON.stringify(followBack));
  // Share on the artist page.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Share/i.test(x.textContent.trim()));
    if (b) b.click();
  });
  await sleep(1200);
  const shareToast = await page.evaluate(() => {
    const toast = document.querySelector('.toast-region .toast');
    return toast ? toast.textContent.trim() : null;
  });
  check('artist Share produces a toast (copy-link fallback in headless)', shareToast && /(copied|share)/i.test(shareToast), shareToast);
  await page.close();

  // ============ SHARE ON ALBUM PAGE ============
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  const albumHref = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) => (x.getAttribute('href') || '').startsWith('/album/'));
    return a ? a.getAttribute('href') : null;
  });
  check('home links to an album page', !!albumHref, albumHref);
  await gotoRoute(page, albumHref);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Share/i.test(x.textContent.trim()));
    if (b) b.click();
  });
  await sleep(1200);
  const albumShare = await page.evaluate(() => {
    const toast = document.querySelector('.toast-region .toast');
    return toast ? toast.textContent.trim() : null;
  });
  check('album Share produces a toast', albumShare && /(copied|share)/i.test(albumShare), albumShare);
  await page.close();

  // ============ LIKE TOAST + PLAYLIST-CREATE TOAST ============
  // NOTE (run 2): Home has NO Like button at some hours — its only
  // TrackRows are the Daylist section, which is empty when the
  // current daypart's genres don't include the track's genre. /search
  // results always render TrackRow, so the Like toast is exercised
  // there (same TrackRow handleLike + toast as everywhere else).
  page = await newPage(browser, 390, 844);
  await gotoRoute(page, '/search');
  await page.evaluate(() => {
    const input = document.querySelector('main .search-box input[type="search"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'vaazhvinil');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => !!document.querySelector('button[aria-label^="Like:"]'), { timeout: 15000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Like:/i.test(x.getAttribute('aria-label') || ''));
    if (b) b.click();
  });
  await sleep(800);
  const likeToast = await page.evaluate(() => {
    const toast = document.querySelector('.toast-region .toast');
    return toast ? toast.textContent.trim() : null;
  });
  check('like shows "Added to Liked Songs" toast', likeToast && /Added to Liked Songs/i.test(likeToast), likeToast);
  await page.screenshot({ path: path.join(OUT, 'like-toast-390.png') });
  // Unlike to leave state clean.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Unlike:/i.test(x.getAttribute('aria-label') || ''));
    if (b) b.click();
  });
  await sleep(600);
  await page.close();

  // ============ SETTINGS: sections, persistence, no "coming later" ============
  page = await newPage(browser, 390, 844);
  await gotoRoute(page, '/settings');
  const settingsSurface = await page.evaluate(() => {
    const h2s = [...document.querySelectorAll('main h2')].map((h) => h.textContent.trim());
    const text = document.body.innerText || '';
    return {
      sections: h2s,
      hasQuality: !!document.querySelector('.settings-seg'),
      hasSleepDefault: !!document.querySelector('#sleep-default'),
      hasAlarm: !!document.querySelector('#aarti-time'),
      hasClear: [...document.querySelectorAll('button')].some((b) => /Clear local data/i.test(b.textContent)),
      hasExport: [...document.querySelectorAll('button')].some((b) => /Export my data/i.test(b.textContent)),
      // Delete account lives on /profile, not /settings — checked in
      // the demo-mode section below.
      comingLater: /coming (soon|later)/i.test(text),
    };
  });
  check('settings has all sections (Playback/Language/Alarm/Privacy/About)', ['Playback', 'Language', 'Morning Aarti Alarm', 'Privacy', 'About'].every((s) => settingsSurface.sections.includes(s)), JSON.stringify(settingsSurface.sections));
  check('settings has quality seg + sleep default + alarm + clear/export', settingsSurface.hasQuality && settingsSurface.hasSleepDefault && settingsSurface.hasAlarm && settingsSurface.hasClear && settingsSurface.hasExport, JSON.stringify(settingsSurface));
  check('settings has NO "coming soon/later" text', !settingsSurface.comingLater);
  // Change quality to 320, sleep default to 15, set the alarm, save.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.settings-seg button')].find((x) => /320 kbps/i.test(x.textContent));
    if (b) b.click();
  });
  await page.evaluate(() => {
    const sel = document.querySelector('#sleep-default');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, '15');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => {
    const input = document.querySelector('#aarti-time');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '06:30');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^Save$/i.test(x.textContent.trim()) && x.closest('.settings-section'));
    if (b) b.click();
  });
  await sleep(1000);
  const alarmToast = await page.evaluate(() => {
    const toast = document.querySelector('.toast-region .toast');
    return toast ? toast.textContent.trim() : null;
  });
  check('alarm save shows a toast', alarmToast && /alarm/i.test(alarmToast), alarmToast);
  // Reload: values must persist.
  await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(1000);
  const persisted = await page.evaluate(() => {
    const seg320 = [...document.querySelectorAll('.settings-seg button')].find((x) => /320 kbps/i.test(x.textContent));
    return {
      quality320Pressed: seg320 ? seg320.getAttribute('aria-pressed') : null,
      qualityStored: (() => { try { return localStorage.getItem('nandha-player-quality'); } catch { return null; } })(),
      sleepDefault: document.querySelector('#sleep-default') ? document.querySelector('#sleep-default').value : null,
      alarmTime: document.querySelector('#aarti-time') ? document.querySelector('#aarti-time').value : null,
    };
  });
  check('settings persist across reload (quality 320)', persisted.quality320Pressed === 'true' && persisted.qualityStored === '320', JSON.stringify(persisted));
  check('settings persist across reload (sleep default 15)', persisted.sleepDefault === '15', JSON.stringify(persisted));
  check('settings persist across reload (alarm 06:30)', persisted.alarmTime === '06:30', JSON.stringify(persisted));
  await page.screenshot({ path: path.join(OUT, 'settings-390.png') });
  // Reset the quality back to 128 so the probe leaves no changed prefs.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.settings-seg button')].find((x) => /128 kbps/i.test(x.textContent));
    if (b) b.click();
  });
  await sleep(400);
  await page.close();

  page = await newPage(browser, 1280, 800);
  await gotoRoute(page, '/settings');
  await page.screenshot({ path: path.join(OUT, 'settings-1280.png') });
  await page.close();

  // ============ 404 ============
  page = await newPage(browser, 390, 844);
  await gotoRoute(page, '/nope-404');
  const notFound = await page.evaluate(() => ({
    h1: document.querySelector('main h1') ? document.querySelector('main h1').textContent.trim() : null,
    title: document.title,
    hasHomeLink: !!document.querySelector('main a[href="/"]'),
  }));
  check('404 page has a real <h1>', notFound.h1 === 'Page not found', JSON.stringify(notFound));
  check('404 title is "Page not found | Nandha Music"', notFound.title === 'Page not found | Nandha Music', notFound.title);
  await page.screenshot({ path: path.join(OUT, '404-390.png') });
  await page.close();

  // ============ DEMO MODE (signed-in): avatar menu, full playback, delete ============
  page = await newPage(browser, 390, 844);
  await loadHome(page, DEMO);
  const demoHeader = await page.evaluate(() => {
    const avatar = document.querySelector('.topbar__avatar');
    const btns = [...document.querySelectorAll('.topbar__auth-btn')].map((b) => b.textContent.trim());
    return { hasAvatar: !!avatar, btns };
  });
  check('demo signed-in: avatar present, no Sign in/Sign up buttons', demoHeader.hasAvatar && demoHeader.btns.length === 0, JSON.stringify(demoHeader));
  // Avatar menu opens with Profile / Settings / Sign out (no Admin —
  // the demo user is a listener, never admin).
  await page.evaluate(() => {
    const a = document.querySelector('.topbar__avatar');
    if (a) a.click();
  });
  await sleep(600);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('.topbar__menu');
    if (!m) return null;
    return { items: [...m.querySelectorAll('button, a')].map((x) => x.textContent.trim()), hasAdmin: /Admin/.test(m.textContent) };
  });
  check('avatar menu lists Profile/Settings/Sign out, no Admin (demo listener)', menu && menu.items.includes('Profile') && menu.items.includes('Settings') && menu.items.includes('Sign out') && !menu.hasAdmin, JSON.stringify(menu));
  await page.screenshot({ path: path.join(OUT, 'avatar-menu-390.png') });
  // Close the menu, then play the track. The demo audio is the 1s
  // silent mp3, so currentTime can never pass 5s — the honest check
  // is: the track PLAYS (src = the local silent file, currentTime
  // advances) to its natural end with no gate, no hint and no
  // "Could not play" notice. The 5s gate itself is proven on the
  // real server (guest section above).
  await page.keyboard.press('Escape');
  await sleep(400);
  await playFirstTrack(page);
  const demoPlay = await page.evaluate(() => {
    const a = document.querySelector('audio');
    const notice = document.querySelector('.player-notice');
    return {
      src: a ? (a.currentSrc || '').slice(-45) : null,
      ct: a ? Math.round(a.currentTime * 100) / 100 : null,
      paused: a ? a.paused : null,
      gate: !!document.querySelector('.player-preview'),
      hint: !!document.querySelector('.player-bar-artist--hint'),
      notice: notice ? notice.textContent.trim() : null,
    };
  });
  console.log('DEMO PLAYBACK start:', JSON.stringify(demoPlay));
  check('demo signed-in: track plays from the local silent file', demoPlay.src && demoPlay.src.endsWith('vaazhvinil-orumurayenum.mp3'), JSON.stringify(demoPlay));
  check('demo signed-in: no gate, no hint, no error notice while playing', !demoPlay.gate && !demoPlay.hint && !(demoPlay.notice && /Could not play/i.test(demoPlay.notice)), JSON.stringify(demoPlay));
  // Wait for the natural end of the 1s file, then confirm no gate
  // ever appeared.
  await sleep(3000);
  const demoEnd = await page.evaluate(() => {
    const a = document.querySelector('audio');
    return {
      ct: a ? Math.round(a.currentTime * 100) / 100 : null,
      dur: a && Number.isFinite(a.duration) ? Math.round(a.duration * 100) / 100 : null,
      paused: a ? a.paused : null,
      gate: !!document.querySelector('.player-preview'),
      hint: !!document.querySelector('.player-bar-artist--hint'),
    };
  });
  console.log('DEMO PLAYBACK end:', JSON.stringify(demoEnd));
  check('demo signed-in: track reaches its natural end, still no gate or hint', demoEnd.paused && demoEnd.ct !== null && demoEnd.dur !== null && demoEnd.ct >= demoEnd.dur - 0.2 && !demoEnd.gate && !demoEnd.hint, JSON.stringify(demoEnd));
  await page.close();

  // Delete-account confirmation (demo mode: the account is entirely
  // local, so the real demo path — clear local data + sign out — is
  // safe to exercise end to end; it touches only this browser profile).
  page = await newPage(browser, 390, 844);
  await gotoRoute(page, '/profile', DEMO);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Delete account/i.test(x.textContent));
    if (b) b.click();
  });
  await sleep(600);
  const confirmShown = await page.evaluate(() => {
    const section = document.querySelector('.settings-section--danger');
    if (!section) return null;
    return { text: section.textContent.slice(0, 200), hasConfirm: [...section.querySelectorAll('button')].some((b) => /Delete my account/i.test(b.textContent)) };
  });
  check('delete account asks for confirmation (two-step)', confirmShown && confirmShown.hasConfirm, JSON.stringify(confirmShown));
  await page.screenshot({ path: path.join(OUT, 'delete-confirm-390.png') });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.settings-section--danger button')].find((x) => /Delete my account/i.test(x.textContent));
    if (b) b.click();
  });
  await sleep(1500);
  const afterDelete = await page.evaluate(() => ({
    url: window.location.pathname,
    signedOut: !document.querySelector('.topbar__avatar') && [...document.querySelectorAll('.topbar__auth-btn')].length > 0,
    toast: document.querySelector('.toast-region .toast') ? document.querySelector('.toast-region .toast').textContent.trim() : null,
  }));
  check('demo delete: signs out + returns home + toast', afterDelete.url === '/' && afterDelete.signedOut && afterDelete.toast && /deleted/i.test(afterDelete.toast), JSON.stringify(afterDelete));
  await page.close();

  // ============ 34px BOTTOM INSET — built CSS rule + computed style ============
  // CDP cannot simulate a 34px bottom inset in this Chrome (proven in
  // the Priority 1 round), so this proves the handling statically:
  // the built CSS must use env(safe-area-inset-bottom), and the
  // computed chrome offset must be present.
  const distCss = fs.readdirSync(path.join(DIR, '..', 'dist', 'assets'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(DIR, '..', 'dist', 'assets', f), 'utf8'))
    .join('\n');
  const envUses = [...distCss.matchAll(/env\(safe-area-inset-bottom[^)]*\)/g)].map((m) => m[0]);
  console.log('BUILT CSS env(safe-area-inset-bottom) uses:', JSON.stringify(envUses));
  check('built CSS uses env(safe-area-inset-bottom)', envUses.length > 0, `${envUses.length} use(s)`);
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  await playFirstTrack(page);
  const insetComputed = await page.evaluate(() => {
    const bar = document.querySelector('.player-bar');
    const nav = document.querySelector('.bottom-nav');
    return {
      barBottom: bar ? getComputedStyle(bar).bottom : null,
      navHeight: nav ? getComputedStyle(nav).height : null,
      navPadBottom: nav ? getComputedStyle(nav).paddingBottom : null,
    };
  });
  console.log('INSET computed:', JSON.stringify(insetComputed));
  // In headless Chrome env(safe-area-inset-bottom) is 0px, so the bar
  // sits exactly one nav-height above the viewport bottom.
  check('player bar bottom = nav height (inset rule in effect)', insetComputed.barBottom === '64px' && insetComputed.navHeight === '64px', JSON.stringify(insetComputed));
  await page.close();

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ pass: passCount, fail: failCount, results }, null, 2));
  console.log(`\n=== P2 SUITE: ${passCount} PASS, ${failCount} FAIL ===`);
  console.log(`Screenshots + results in ${OUT}`);
  await browser.close();
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });
