// Priority-1 verification (mobile audit, 27 Nov 2026): items 1-4.
// Viewports: 320x568, 390x844 (+390x664 short player), 1280x800.
// Preview http://localhost:5173 (dev, current source). Puppeteer +
// Chrome for Testing, proxy 127.0.0.1:18080 (same as check-cover-fix.js).
// Screenshots + results JSON in mobile-verify/audit-p1/.
//
// NOTE (audit item 12): at a 320px device width the layout viewport
// expands to 546px (the .section-row overflow, unfixed this round).
// The 320px probes inject the containment override the audit used
// (contain:inline-size on .section-row) and record innerWidth, so the
// 320px measurements are real 320px CSS pixels, not 546px ones.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const DIR = __dirname;
const OUT = path.join(DIR, 'audit-p1');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = path.join(DIR, '.cache/chrome/linux-158.0.8127.88/chrome-linux64/chrome');
const SITE = 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
function check(name, ok, extra) {
  results[name] = ok ? 'PASS' : `FAIL${extra ? ` (${extra})` : ''}`;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
}

async function newPage(browser, width, height, lang) {
  // Fresh incognito context per page: localStorage (consent choice,
  // language) must not leak between probes — the first page's Accept
  // would otherwise hide the banner on every later page.
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, isMobile: width < 1024, hasTouch: width < 1024, deviceScaleFactor: 2 });
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

async function loadHome(page) {
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForSelector('.bottom-nav', { timeout: 60000 });
  await page.waitForFunction(() => /Vaazhvinil|வாழ்வினில்/.test(document.body.innerText || ''), { timeout: 60000 });
  await sleep(1200);
  // 320px containment override (see header note) + record the viewport.
  const vw = await page.evaluate(() => {
    document.querySelectorAll('.section-row').forEach((el) => { el.style.contain = 'inline-size'; });
    return { innerWidth: window.innerWidth, visualWidth: window.visualViewport ? window.visualViewport.width : null };
  });
  return vw;
}

async function playFirstTrack(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Play/i.test(b.getAttribute('aria-label') || '') && b.offsetParent !== null);
    if (btn) btn.click();
  });
  await page.waitForSelector('.player-bar', { timeout: 30000 });
  await sleep(1500);
}

async function waitForGate(page, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const found = await page.evaluate(() => !!document.querySelector('.player-preview'));
    if (found) return true;
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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu',
      '--proxy-server=http://127.0.0.1:18080', '--proxy-bypass-list=127.0.0.1,localhost',
      '--ignore-certificate-errors'],
  });

  // ============ ITEM 1 — consent banner, 390px (en) ============
  let page = await newPage(browser, 390, 844);
  let vw = await loadHome(page);
  console.log('390px viewport:', JSON.stringify(vw));
  let banner = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const links = [...b.querySelectorAll('.consent-banner__links a')].map((a) => {
      const cs = getComputedStyle(a);
      return { text: a.textContent, minHeight: cs.minHeight, padding: cs.padding, display: cs.display };
    });
    const btns = [...b.querySelectorAll('.consent-banner__actions button')].map((x) => {
      const cs = getComputedStyle(x);
      return { text: x.textContent.trim(), minHeight: cs.minHeight, h: Math.round(x.getBoundingClientRect().height) };
    });
    return {
      h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom),
      hasDot: b.textContent.includes('·'), text: b.textContent.trim().slice(0, 120),
      links, btns,
      mainPadBottom: getComputedStyle(document.querySelector('.main')).paddingBottom,
    };
  });
  console.log('BANNER 390 en:', JSON.stringify(banner));
  check('1a banner height <=96px @390 en', banner && banner.h <= 96, `h=${banner?.h}`);
  check('1b banner has no stray "·"', banner && !banner.hasDot);
  check('1c banner links have no 44px min-height', banner && banner.links.every((l) => l.minHeight === '0px' || l.minHeight === 'auto' || parseFloat(l.minHeight) < 44), JSON.stringify(banner?.links));
  check('1d banner buttons are real buttons with labels', banner && banner.btns.length === 2 && banner.btns.every((b) => b.text.length > 0), JSON.stringify(banner?.btns));
  check('1e .main padding-bottom with NO player = nav only (88px)', banner && banner.mainPadBottom === '88px', `pad=${banner?.mainPadBottom}`);
  await page.screenshot({ path: path.join(OUT, 'banner-390-en.png') });

  // Accept the banner, then re-check it stays gone on reload.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.consent-banner__actions button')].find((x) => /Accept/i.test(x.textContent));
    if (b) b.click();
  });
  await sleep(600);
  const bannerGone = await page.evaluate(() => !document.querySelector('.consent-banner'));
  const consentStored = await page.evaluate(() => { try { return localStorage.getItem('nandha-consent'); } catch { return null; } });
  check('1f Accept hides banner + stores choice', bannerGone && consentStored === 'accepted', `stored=${consentStored}`);
  await page.close();

  // ============ ITEM 1 — banner 320px (en) ============
  page = await newPage(browser, 320, 568);
  vw = await loadHome(page);
  console.log('320px viewport:', JSON.stringify(vw));
  check('1g layout viewport is 320px after containment override', vw.innerWidth === 320, `innerWidth=${vw.innerWidth}`);
  banner = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), text: b.textContent.trim().slice(0, 100) };
  });
  console.log('BANNER 320 en:', JSON.stringify(banner));
  check('1h banner height <=96px @320 en', banner && banner.h <= 96, `h=${banner?.h}`);
  // The height check alone missed the real 320px bug (links squeezed
  // under the buttons) — also assert the row does not overlap.
  const row320en = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const br = b.getBoundingClientRect();
    const rects = (sel) => [...b.querySelectorAll(sel)].map((el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; });
    const links = rects('.consent-banner__links a').filter((l) => l.r > l.l && l.b > l.t);
    const btns = rects('.consent-banner__actions button');
    const hit = (a, c) => !(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t);
    return { overlap: links.some((l) => btns.some((x) => hit(l, x))), linkOverflow: links.some((l) => l.r > Math.round(br.right) - 12 || l.l < Math.round(br.left) + 12), links, btns };
  });
  check('1h-b banner links never overlap buttons @320 en', row320en && !row320en.overlap && !row320en.linkOverflow, JSON.stringify(row320en));
  await page.screenshot({ path: path.join(OUT, 'banner-320-en.png') });
  await page.close();

  // ============ ITEM 1 — banner 390px (ta + hi, recorded) ============
  for (const lang of ['ta', 'hi']) {
    page = await newPage(browser, 390, 844, lang);
    await loadHome(page);
    banner = await page.evaluate(() => {
      const b = document.querySelector('.consent-banner');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { h: Math.round(r.height), text: b.textContent.trim().slice(0, 100) };
    });
    console.log(`BANNER 390 ${lang}:`, JSON.stringify(banner));
    check(`1i banner height <=96px @390 ${lang} (recorded)`, banner && banner.h <= 96, `h=${banner?.h}`);
    await page.screenshot({ path: path.join(OUT, `banner-390-${lang}.png`) });
    await page.close();
  }

  // Tamil banner at 320px too (Tamil glyphs are wider — the 390px
  // check alone would miss a 3-line wrap at 320px).
  page = await newPage(browser, 320, 568, 'ta');
  await loadHome(page);
  banner = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { h: Math.round(r.height), text: b.textContent.trim().slice(0, 100) };
  });
  console.log('BANNER 320 ta:', JSON.stringify(banner));
  check('1i-b banner height <=96px @320 ta', banner && banner.h <= 96, `h=${banner?.h}`);
  const row320ta = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const br = b.getBoundingClientRect();
    const rects = (sel) => [...b.querySelectorAll(sel)].map((el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; });
    const links = rects('.consent-banner__links a').filter((l) => l.r > l.l && l.b > l.t);
    const btns = rects('.consent-banner__actions button');
    const hit = (a, c) => !(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t);
    return { overlap: links.some((l) => btns.some((x) => hit(l, x))), linkOverflow: links.some((l) => l.r > Math.round(br.right) - 12 || l.l < Math.round(br.left) + 12), links, btns };
  });
  check('1i-c banner links never overlap buttons @320 ta', row320ta && !row320ta.overlap && !row320ta.linkOverflow, JSON.stringify(row320ta));
  await page.screenshot({ path: path.join(OUT, 'banner-320-ta.png') });
  await page.close();

  // Hindi banner at 320px too.
  page = await newPage(browser, 320, 568, 'hi');
  await loadHome(page);
  banner = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { h: Math.round(r.height), text: b.textContent.trim().slice(0, 100) };
  });
  console.log('BANNER 320 hi:', JSON.stringify(banner));
  check('1i-d banner height <=96px @320 hi', banner && banner.h <= 96, `h=${banner?.h}`);
  const row320hi = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    if (!b) return null;
    const br = b.getBoundingClientRect();
    const rects = (sel) => [...b.querySelectorAll(sel)].map((el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; });
    const links = rects('.consent-banner__links a').filter((l) => l.r > l.l && l.b > l.t);
    const btns = rects('.consent-banner__actions button');
    const hit = (a, c) => !(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t);
    return { overlap: links.some((l) => btns.some((x) => hit(l, x))), linkOverflow: links.some((l) => l.r > Math.round(br.right) - 12 || l.l < Math.round(br.left) + 12), links, btns };
  });
  check('1i-e banner links never overlap buttons @320 hi', row320hi && !row320hi.overlap && !row320hi.linkOverflow, JSON.stringify(row320hi));
  await page.screenshot({ path: path.join(OUT, 'banner-320-hi.png') });
  await page.close();

  // ============ ITEMS 1+2 — gate prompt vs banner, player geometry ============
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  await playFirstTrack(page);
  const withPlayer = await page.evaluate(() => { const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const bar = document.querySelector('.player-bar');
    const nav = document.querySelector('.bottom-nav');
    const b = document.querySelector('.consent-banner');
    const cs = bar ? getComputedStyle(bar) : null;
    return {
      bar: R(bar), nav: R(nav),
      barPaddingBottom: cs ? cs.paddingBottom : null,
      barPaddingTop: cs ? cs.paddingTop : null,
      bannerPresent: !!b,
      mainPadBottom: getComputedStyle(document.querySelector('.main')).paddingBottom,
      vh: window.innerHeight,
    };
  });
  console.log('PLAYER 390:', JSON.stringify(withPlayer));
  check('2a player-bar padding-bottom is 8px (no safe-area of its own)', withPlayer.barPaddingBottom === '8px', `pad=${withPlayer.barPaddingBottom}`);
  check('2b player-bar sits directly above nav (gap 0, no overlap)', withPlayer.bar && withPlayer.nav && withPlayer.bar.bottom === withPlayer.nav.top, `barBottom=${withPlayer.bar?.bottom} navTop=${withPlayer.nav?.top}`);
  check('2c player-bar height ~64px (not ~98px with double inset)', withPlayer.bar && withPlayer.bar.h >= 56 && withPlayer.bar.h <= 72, `h=${withPlayer.bar?.h}`);
  check('1j .main padding-bottom WITH player = player+nav (148px)', withPlayer.mainPadBottom === '148px', `pad=${withPlayer.mainPadBottom}`);
  check('1k banner still present above player before gate', withPlayer.bannerPresent);
  await page.screenshot({ path: path.join(OUT, 'player-bar-390.png') });

  // Wait for the 5s guest gate: banner must hide while the prompt shows,
  // and the prompt's buttons must not be covered by anything.
  const gated = await waitForGate(page);
  check('gate prompt appears after ~5s', gated);
  if (gated) {
    const gateState = await page.evaluate(() => { const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
      const prompt = document.querySelector('.player-preview');
      const banner = document.querySelector('.consent-banner');
      const pr = R(prompt);
      const signInBtn = prompt ? prompt.querySelector('.player-preview__btn') : null;
      const dismissBtn = prompt ? prompt.querySelector('.player-preview__dismiss') : null;
      const elAt = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { el: el.className, topEl: at ? `${at.tagName}.${String(at.className).slice(0, 40)}` : null, covered: at !== el && !el.contains(at) };
      };
      return { prompt: pr, bannerPresent: !!banner, signIn: elAt(signInBtn), dismiss: elAt(dismissBtn) };
    });
    console.log('GATE:', JSON.stringify(gateState));
    check('1l banner hidden while gate prompt shows', !gateState.bannerPresent);
    check('1m gate Sign-in button not covered', gateState.signIn && !gateState.signIn.covered, JSON.stringify(gateState.signIn));
    check('1n gate Dismiss button not covered', gateState.dismiss && !gateState.dismiss.covered, JSON.stringify(gateState.dismiss));
    await page.screenshot({ path: path.join(OUT, 'gate-prompt-390.png') });

    // Dismiss the prompt: the banner returns (choice still unmade).
    await page.evaluate(() => {
      const d = document.querySelector('.player-preview__dismiss');
      if (d) d.click();
    });
    await sleep(800);
    const bannerBack = await page.evaluate(() => !!document.querySelector('.consent-banner'));
    check('1o banner returns after gate prompt dismissed', bannerBack);
  }

  // ============ ITEM 2 — safe-area rule, verified at runtime ============
  // CDP Emulation.setSafeAreaInsets does not exist in this Chrome
  // (verified: 'wasn't found'), so a 34px inset cannot be simulated
  // here. Instead the applied CSS rule itself is read back from the
  // live stylesheet: the <1024px .player-bar rule must set
  // padding-bottom: 8px with NO env() — which, by cascade, is what
  // the bar gets at any inset, since the media query overrides the
  // base rule's calc(8px + env(...)) padding.
  const safeAreaRule = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const rule of rules) {
        if (rule.conditionText && rule.conditionText.includes('max-width: 1023px')) {
          for (const inner of rule.cssRules || []) {
            if (inner.selectorText === '.player-bar') {
              return { paddingBottom: inner.style.paddingBottom, bottom: inner.style.bottom, cssText: inner.cssText.slice(0, 160) };
            }
          }
        }
      }
    }
    return null;
  });
  console.log('SAFE-AREA RULE:', JSON.stringify(safeAreaRule));
  check('2d <1024px .player-bar rule sets padding-bottom: 8px', safeAreaRule && safeAreaRule.paddingBottom === '8px', JSON.stringify(safeAreaRule));
  check('2e <1024px .player-bar rule keeps bottom above the nav (env() only in bottom:)', safeAreaRule && safeAreaRule.bottom.includes('env(') && safeAreaRule.bottom.includes('bottomnav-h'), JSON.stringify(safeAreaRule?.bottom));
  check('2f computed bar padding is 8px at 0 inset (2a) + rule padding is 8px (2d)', withPlayer.barPaddingBottom === '8px' && safeAreaRule && safeAreaRule.paddingBottom === '8px');

  // ============ ITEM 3 — full player at 390x664 ============
  await page.setViewport({ width: 390, height: 664, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await sleep(800);
  await openFullPlayer(page);
  const player664 = await page.evaluate(() => { const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const sheet = document.querySelector('.mobile-player');
    const cover = document.querySelector('.mobile-player-canvas-wrap');
    const seek = document.querySelector('.mobile-player-seek');
    const controls = document.querySelector('.mobile-player-controls');
    const moreBtn = document.querySelector('.mobile-player-more-btn');
    return {
      vh: window.innerHeight, vw: window.innerWidth,
      sheetScrollH: sheet ? sheet.scrollHeight : null,
      sheetClientH: sheet ? sheet.clientHeight : null,
      cover: R(cover), seek: R(seek), controls: R(controls), moreBtn: R(moreBtn),
      oldActionsPresent: !!document.querySelector('.mobile-player-actions'),
    };
  });
  console.log('PLAYER 390x664:', JSON.stringify(player664));
  check('3a cover = min(60vw, 34dvh) @390x664 (226x226)', player664.cover && Math.abs(player664.cover.w - 226) <= 2 && Math.abs(player664.cover.h - 226) <= 2, JSON.stringify(player664.cover));
  check('3b seek bar in view without scroll @664', player664.seek && player664.seek.bottom <= player664.vh, `seekBottom=${player664.seek?.bottom} vh=${player664.vh}`);
  check('3c transport controls in view without scroll @664', player664.controls && player664.controls.bottom <= player664.vh, `controlsBottom=${player664.controls?.bottom} vh=${player664.vh}`);
  check('3d old two-row actions gone', !player664.oldActionsPresent);
  // RECORDED (not a brief requirement — the brief only requires seek +
  // controls in view): the More button sits 53px below the fold at 664px
  // and needs a small scroll. The sheet itself is 737px tall here.
  console.log(`RECORDED 3e More button below fold @664 by ${player664.moreBtn.bottom - player664.vh}px (needs a small scroll; seek + controls are in view)`);
  results['3e More button position @664 (recorded)'] = `RECORDED (bottom=${player664.moreBtn?.bottom}, vh=${player664.vh})`;
  await page.screenshot({ path: path.join(OUT, 'player-390x664.png') });

  // More sheet: open, count rows, exercise Lyrics + Quality + Sleep.
  await page.evaluate(() => {
    const b = document.querySelector('.mobile-player-more-btn');
    if (b) b.click();
  });
  await sleep(700);
  const moreSheet = await page.evaluate(() => {
    const s = document.querySelector('.more-sheet');
    if (!s) return null;
    return {
      rows: [...s.querySelectorAll('.sleep-option')].map((r) => r.textContent.trim().replace(/\s+/g, ' ')),
      h: Math.round(s.getBoundingClientRect().height),
    };
  });
  console.log('MORE SHEET:', JSON.stringify(moreSheet));
  check('3f More sheet opens with 9 rows', moreSheet && moreSheet.rows.length === 9, `n=${moreSheet?.rows.length}`);
  check('3g More rows are the 9 secondary actions', moreSheet && ['Lyrics', 'Story', 'Up next', 'Quality', 'Share', 'Share card', 'Pin for offline', 'Hide this song', 'Sleep timer'].every((label, i) => (moreSheet.rows[i] || '').startsWith(label)), JSON.stringify(moreSheet?.rows));
  await page.screenshot({ path: path.join(OUT, 'more-sheet-390.png') });

  // Lyrics row -> lyrics view opens, sheet closes.
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.more-sheet .sleep-option')].find((x) => x.textContent.trim().startsWith('Lyrics'));
    if (r) r.click();
  });
  await sleep(700);
  const lyricsOpen = await page.evaluate(() => ({
    sheetGone: !document.querySelector('.more-sheet'),
    lyricsAside: !!document.querySelector('.mobile-player-lyrics-side'),
  }));
  check('3h Lyrics row opens lyrics view + closes sheet', lyricsOpen.lyricsAside && lyricsOpen.sheetGone, JSON.stringify(lyricsOpen));
  await page.screenshot({ path: path.join(OUT, 'player-lyrics-390.png') });
  // Close lyrics view (toggle back) so the next checks see the cover.
  await page.evaluate(() => {
    const b = document.querySelector('.mobile-player-more-btn');
    if (b) b.click();
  });
  await sleep(600);
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.more-sheet .sleep-option')].find((x) => x.textContent.trim().startsWith('Lyrics'));
    if (r) r.click();
  });
  await sleep(600);

  // Quality row -> toggles 128 -> 320.
  await page.evaluate(() => {
    const b = document.querySelector('.mobile-player-more-btn');
    if (b) b.click();
  });
  await sleep(600);
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.more-sheet .sleep-option')].find((x) => x.textContent.trim().startsWith('Quality'));
    if (r) r.click();
  });
  await sleep(600);
  await page.evaluate(() => {
    const b = document.querySelector('.mobile-player-more-btn');
    if (b) b.click();
  });
  await sleep(600);
  const quality = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.more-sheet .sleep-option')].find((x) => x.textContent.trim().startsWith('Quality'));
    return r ? r.textContent.trim().replace(/\s+/g, ' ') : null;
  });
  check('3i Quality row toggles to 320 kbps', quality && quality.includes('320 kbps'), `row=${quality}`);
  // Sleep row -> sleep sheet opens on top.
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.more-sheet .sleep-option')].find((x) => x.textContent.trim().startsWith('Sleep timer'));
    if (r) r.click();
  });
  await sleep(700);
  const sleepOpen = await page.evaluate(() => ({
    sleepSheet: !!document.querySelector('.sleep-sheet'),
    moreGone: !document.querySelector('.more-sheet'),
  }));
  check('3j Sleep row opens sleep sheet + closes More', sleepOpen.sleepSheet && sleepOpen.moreGone, JSON.stringify(sleepOpen));
  await page.screenshot({ path: path.join(OUT, 'sleep-sheet-390.png') });
  // Close sleep sheet, then close the player (X stops playback).
  await page.evaluate(() => {
    const c = document.querySelector('.sleep-sheet .player-icon-btn');
    if (c) c.click();
  });
  await sleep(500);
  await page.evaluate(() => {
    const c = document.querySelector('.mobile-player-close');
    if (c) c.click();
  });
  await sleep(900);
  const playerClosed = await page.evaluate(() => !document.querySelector('.mobile-player'));
  check('3k player X closes the sheet', playerClosed);
  await page.close();

  // ============ ITEM 3 — full player at 320x568 ============
  page = await newPage(browser, 320, 568);
  await loadHome(page);
  await playFirstTrack(page);
  await openFullPlayer(page);
  const player568 = await page.evaluate(() => { const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const cover = document.querySelector('.mobile-player-canvas-wrap');
    const seek = document.querySelector('.mobile-player-seek');
    const controls = document.querySelector('.mobile-player-controls');
    return { vh: window.innerHeight, vw: window.innerWidth, cover: R(cover), seek: R(seek), controls: R(controls) };
  });
  console.log('PLAYER 320x568:', JSON.stringify(player568));
  check('3l cover = min(60vw, 34dvh) @320x568 (192x192)', player568.cover && Math.abs(player568.cover.w - 192) <= 2 && Math.abs(player568.cover.h - 192) <= 2, JSON.stringify(player568.cover));
  check('3m seek bar in view without scroll @568', player568.seek && player568.seek.bottom <= player568.vh, `seekBottom=${player568.seek?.bottom} vh=${player568.vh}`);
  check('3n transport controls in view without scroll @568', player568.controls && player568.controls.bottom <= player568.vh, `controlsBottom=${player568.controls?.bottom} vh=${player568.vh}`);
  await page.screenshot({ path: path.join(OUT, 'player-320x568.png') });
  await page.close();

  // ============ ITEM 3 — full player at 390x844 ============
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  await playFirstTrack(page);
  await openFullPlayer(page);
  const player844 = await page.evaluate(() => { const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const sheet = document.querySelector('.mobile-player');
    const cover = document.querySelector('.mobile-player-canvas-wrap');
    const seek = document.querySelector('.mobile-player-seek');
    const controls = document.querySelector('.mobile-player-controls');
    return { vh: window.innerHeight, sheetScrollH: sheet ? sheet.scrollHeight : null, cover: R(cover), seek: R(seek), controls: R(controls) };
  });
  console.log('PLAYER 390x844:', JSON.stringify(player844));
  check('3o cover = min(60vw, 34dvh) @390x844 (234x234)', player844.cover && Math.abs(player844.cover.w - 234) <= 2 && Math.abs(player844.cover.h - 234) <= 2, JSON.stringify(player844.cover));
  check('3p seek + controls in view @844', player844.controls && player844.controls.bottom <= player844.vh, `controlsBottom=${player844.controls?.bottom} vh=${player844.vh}`);
  await page.screenshot({ path: path.join(OUT, 'player-390x844.png') });
  await page.close();

  // ============ ITEM 4 — Profile tab + /profile, 390px ============
  page = await newPage(browser, 390, 844);
  await loadHome(page);
  const nav390 = await page.evaluate(() => {
    const links = [...document.querySelectorAll('.bottom-nav__link')].map((a) => ({
      href: a.getAttribute('href'), label: a.textContent.trim().replace('(current)', '').trim(),
      fontSize: getComputedStyle(a).fontSize, current: a.getAttribute('aria-current'),
    }));
    return { links, profileHref: (links.find((l) => l.label === 'Profile') || {}).href };
  });
  console.log('NAV 390:', JSON.stringify(nav390));
  check('4a Profile tab points to /profile (not /library)', nav390.profileHref === '/profile', `href=${nav390.profileHref}`);
  check('4b all nav labels are 12px', nav390.links.every((l) => l.fontSize === '12px'), JSON.stringify(nav390.links.map((l) => l.fontSize)));
  check('4c exactly one tab has aria-current on Home', nav390.links.filter((l) => l.current === 'page').length === 1 && nav390.links.find((l) => l.current === 'page')?.href === '/', JSON.stringify(nav390.links.map((l) => [l.href, l.current])));

  // Tap the Profile tab for real (not a direct goto).
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('.bottom-nav__link')].find((x) => x.getAttribute('href') === '/profile');
    if (a) a.click();
  });
  await sleep(1200);
  const profile390 = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const links = [...document.querySelectorAll('.bottom-nav__link')].map((a) => ({ href: a.getAttribute('href'), current: a.getAttribute('aria-current') }));
    return {
      url: location.pathname, h1: h1 ? h1.textContent.trim() : null,
      title: document.title,
      body: document.body.innerText.slice(0, 300),
      signInHref: (document.querySelector('main a.btn-primary') || {}).getAttribute?.('href') || null,
      activeTabs: links.filter((l) => l.current === 'page').map((l) => l.href),
    };
  });
  console.log('PROFILE 390 guest:', JSON.stringify(profile390));
  check('4d Profile tab navigates to /profile', profile390.url === '/profile', `url=${profile390.url}`);
  check('4e /profile has a real <h1> "Profile"', profile390.h1 === 'Profile', `h1=${profile390.h1}`);
  check('4f /profile title is "Profile | Nandha Music" (no duplication)', profile390.title === 'Profile | Nandha Music', `title=${profile390.title}`);
  check('4g guest view shows the sign-in hint + Sign in button to /login', /5-second preview/.test(profile390.body) && profile390.signInHref === '/login', `signInHref=${profile390.signInHref}`);
  check('4h exactly one tab active on /profile (Profile only)', profile390.activeTabs.length === 1 && profile390.activeTabs[0] === '/profile', JSON.stringify(profile390.activeTabs));
  await page.screenshot({ path: path.join(OUT, 'profile-390-guest.png') });

  // On /library, only Library is active (the old bug lit up Profile too).
  await page.goto(`${SITE}/library`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1000);
  const libraryNav = await page.evaluate(() => [...document.querySelectorAll('.bottom-nav__link')].filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.getAttribute('href')));
  check('4i on /library only Library is active (Profile no longer lights up)', libraryNav.length === 1 && libraryNav[0] === '/library', JSON.stringify(libraryNav));
  await page.close();

  // ============ ITEM 4 — Profile, 320px ============
  page = await newPage(browser, 320, 568);
  await loadHome(page);
  await page.goto(`${SITE}/profile`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1000);
  const profile320 = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    return { h1: h1 ? h1.textContent.trim() : null, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, hOverflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  console.log('PROFILE 320:', JSON.stringify(profile320));
  check('4j /profile renders at 320px with no horizontal overflow', profile320.h1 === 'Profile' && !profile320.hOverflow, JSON.stringify(profile320));
  await page.screenshot({ path: path.join(OUT, 'profile-320-guest.png') });
  await page.close();

  // ============ DESKTOP 1280px — banner, profile, nav ============
  page = await newPage(browser, 1280, 800);
  await loadHome(page);
  const desk = await page.evaluate(() => {
    const b = document.querySelector('.consent-banner');
    const br = b ? b.getBoundingClientRect() : null;
    const sidebarProfile = [...document.querySelectorAll('.sidebar__link')].find((a) => a.getAttribute('href') === '/profile');
    return {
      banner: br ? { h: Math.round(br.height), w: Math.round(br.width) } : null,
      mainPadBottom: getComputedStyle(document.querySelector('.main')).paddingBottom,
      sidebarHasProfile: !!sidebarProfile,
      bottomNavVisible: getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none',
    };
  });
  console.log('DESKTOP 1280:', JSON.stringify(desk));
  check('4k desktop sidebar has a Profile link', desk.sidebarHasProfile);
  // Desktop .main padding-bottom is chrome + 40px (theme.css:903, a
  // pre-existing desktop rule): no-player = 40px, with player = 100px.
  // The no-player fix saves the 60px player share on desktop too.
  check('1p desktop .main padding-bottom with NO player is 40px (chrome 0 + 40)', desk.mainPadBottom === '40px', `pad=${desk.mainPadBottom}`);
  check('1q desktop banner is a compact row (<=64px tall)', desk.banner && desk.banner.h <= 64, `h=${desk.banner?.h}`);
  await page.screenshot({ path: path.join(OUT, 'home-1280.png') });
  // Desktop with a player: .main padding-bottom = 60 (playerbar) + 40.
  await playFirstTrack(page);
  const deskPlayer = await page.evaluate(() => {
    const b = document.querySelector('.player-bar');
    const r = b ? b.getBoundingClientRect() : null;
    return {
      mainPadBottom: getComputedStyle(document.querySelector('.main')).paddingBottom,
      bar: r ? { bottom: Math.round(r.bottom), h: Math.round(r.height) } : null,
      vh: window.innerHeight,
    };
  });
  console.log('DESKTOP with player:', JSON.stringify(deskPlayer));
  check('1r desktop .main padding-bottom WITH player is 100px (60 + 40)', deskPlayer.mainPadBottom === '100px', `pad=${deskPlayer.mainPadBottom}`);
  check('2h desktop player-bar sits at bottom:0', deskPlayer.bar && deskPlayer.bar.bottom === deskPlayer.vh, `barBottom=${deskPlayer.bar?.bottom} vh=${deskPlayer.vh}`);
  // Desktop: open /profile via the sidebar link.
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('.sidebar__link')].find((x) => x.getAttribute('href') === '/profile');
    if (a) a.click();
  });
  await sleep(1200);
  const profileDesk = await page.evaluate(() => ({ url: location.pathname, h1: document.querySelector('h1')?.textContent.trim() }));
  check('4l desktop sidebar Profile link opens /profile', profileDesk.url === '/profile' && profileDesk.h1 === 'Profile', JSON.stringify(profileDesk));
  await page.screenshot({ path: path.join(OUT, 'profile-1280-guest.png') });
  const deskErrors = page._auditErrors;
  console.log('desktop page errors:', JSON.stringify(deskErrors));
  check('no page/console errors on desktop run', deskErrors.length === 0, deskErrors.slice(0, 2).join(' | '));
  await page.close();

  // ============ SUMMARY ============
  const entries = Object.entries(results);
  const fails = entries.filter(([, v]) => v.startsWith('FAIL'));
  const passes = entries.filter(([, v]) => v === 'PASS').length;
  const recorded = entries.filter(([, v]) => v.startsWith('RECORDED')).length;
  console.log(`\n==== AUDIT P1: ${passes}/${entries.length - recorded} PASS${recorded ? `, ${recorded} RECORDED` : ''} ====`);
  if (fails.length) console.log('FAILS:\n' + fails.map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, at: new Date().toISOString() }, null, 2));
  console.log('results: mobile-verify/audit-p1/results.json');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(2); });
