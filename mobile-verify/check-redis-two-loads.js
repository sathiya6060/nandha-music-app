// Redis end-to-end re-verification after the queryKey fix (28 Nov 2026).
// Load 1 (fresh profile): home must GET Redis (miss) then SET via the
// redis-cache function. Load 2 (fresh profile): home must GET Redis (HIT).
const puppeteer = require('puppeteer-core');
const path = require('path');
const DIR = __dirname;
const CHROME = path.join(DIR, '.cache/chrome/linux-158.0.8127.88/chrome-linux64/chrome');
const SITE = 'https://nandhamusic.pages.dev';

async function load(label) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--proxy-server=http://127.0.0.1:18080', '--proxy-bypass-list=127.0.0.1,localhost',
      // TEST-ONLY: the VM egress proxy MITMs upstash.io + Google Fonts with a
      // cert this fresh Chrome profile does not trust (same artifact that
      // breaks fonts in this harness). Real users hit upstash.io directly
      // with a valid public cert, so ignore the proxy's cert here to prove
      // the app's read path end to end.
      '--ignore-certificate-errors',
      '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const redisReqs = [];
  const tracksReqs = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('upstash.io') || u.includes('functions/v1/redis-cache')) redisReqs.push(`${r.method()} ${u}`);
    if (u.includes('/rest/v1/tracks?')) tracksReqs.push(u.includes('status=eq.published') ? 'tracks(published)' : 'tracks(all)');
  });
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 8000));
  const diag = await page.evaluate(() => ({
    build: document.title,
    guard: window.nandhaRedisGuard ? window.nandhaRedisGuard.getStatus() : 'MISSING',
    errors: window.nandhaErrors || [],
    lsCacheKeys: Object.keys(localStorage).filter((k) => k.startsWith('nandha-cache-v1')),
    tamilTitle: /வாழ்வினில்/.test(document.body.innerText),
  }));
  console.log(`--- ${label} ---`);
  console.log('guard:', JSON.stringify(diag.guard));
  console.log('errors:', JSON.stringify(diag.errors));
  console.log('localStorage cache keys:', JSON.stringify(diag.lsCacheKeys));
  console.log('Tamil title visible:', diag.tamilTitle);
  console.log('Redis/function requests:', redisReqs.length ? redisReqs : '(none)');
  console.log('tracks REST calls:', JSON.stringify(tracksReqs));
  await browser.close();
}

(async () => {
  await load('LOAD 1 (cold — expect Redis GET miss + function SET)');
  await load('LOAD 2 (fresh profile — expect Redis GET hit)');
})().catch((e) => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
