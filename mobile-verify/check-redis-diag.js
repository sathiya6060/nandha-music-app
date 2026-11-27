// Redis end-to-end DIAGNOSTIC (28 Nov 2026): full request log + guard status.
const puppeteer = require('puppeteer-core');
const path = require('path');
const DIR = __dirname;
const CHROME = path.join(DIR, '.cache/chrome/linux-158.0.8127.88/chrome-linux64/chrome');
const SITE = 'https://nandhamusic.pages.dev';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--proxy-server=http://127.0.0.1:18080', '--proxy-bypass-list=127.0.0.1,localhost',
      '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const reqs = [];
  page.on('request', (r) => reqs.push(`${r.method()} ${r.url()}`));
  page.on('requestfailed', (r) => console.log('FAILED:', r.url(), '—', r.failure() && r.failure().errorText));
  page.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 8000));
  const diag = await page.evaluate(() => ({
    guard: window.nandhaRedisGuard ? window.nandhaRedisGuard.getStatus() : 'MISSING',
    errors: window.nandhaErrors || [],
    lsKeys: Object.keys(localStorage),
    playLabels: [...document.querySelectorAll('[aria-label^="Play:"]')].slice(0, 6).map((b) => b.getAttribute('aria-label')),
    bodyHasTamilTitle: /வாழ்வினில்|மலையோரம்|மறக்க/.test(document.body.innerText),
  }));
  console.log('guard status:', JSON.stringify(diag.guard));
  console.log('errors:', JSON.stringify(diag.errors));
  console.log('localStorage keys:', JSON.stringify(diag.lsKeys));
  console.log('play labels:', JSON.stringify(diag.playLabels));
  console.log('Tamil title visible:', diag.bodyHasTamilTitle);
  console.log('--- all requests (non-asset) ---');
  reqs.filter((u) => !/\.(js|css|png|jpg|webp|woff2?|svg|ico)(\?|$)/.test(u)).forEach((u) => console.log('  ', u));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
