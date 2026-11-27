// Redis end-to-end live check (28 Nov 2026): load the live home page in a
// real browser, log every request to Upstash / redis-cache, then exit. The
// caller checks the Upstash key afterwards via REST.
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
  const redisReqs = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('upstash.io') || u.includes('functions/v1/redis-cache')) redisReqs.push(`${r.method()} ${u}`);
  });
  page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE CONSOLE ERROR:', m.text()); });
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 90000 });
  const build = await page.evaluate(async () => (await fetch('/version.json', { cache: 'no-store' })).json());
  console.log('live buildId:', build.buildId);
  // Wait for the home track list to render, then give the fire-and-forget
  // cache write (via redis-cache Edge Function) time to complete.
  await page.waitForFunction(
    () => document.body.innerText.includes('Vaazhvinil') && document.body.innerText.includes('Malaiyoram'),
    { timeout: 30000 }).catch(() => console.log('WARN: track titles not found in DOM'));
  await new Promise((r) => setTimeout(r, 6000));
  const state = await page.evaluate(() => ({
    errors: window.nandhaErrors || [],
    trackCards: document.querySelectorAll('[aria-label^="Play:"]').length,
  }));
  console.log('window.nandhaErrors:', JSON.stringify(state.errors));
  console.log('track play buttons:', state.trackCards);
  console.log('Redis/function requests seen in this load:');
  redisReqs.forEach((r) => console.log('  ', r));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
