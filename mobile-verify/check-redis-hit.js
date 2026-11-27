// Redis GET-hit diagnostic (28 Nov 2026): one fresh-profile home load,
// logging the RESPONSE of every Upstash GET and redis-cache POST.
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
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('upstash.io') || u.includes('functions/v1/redis-cache')) {
      let body = '';
      try { body = (await r.text()).slice(0, 160); } catch { body = '<unreadable>'; }
      console.log(`RESP ${r.status()} ${r.request().method()} ${u}\n     body: ${body}`);
    }
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (u.includes('upstash.io') || u.includes('functions/v1/redis-cache')) {
      console.log('FAILED:', u, '—', r.failure() && r.failure().errorText);
    }
  });
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 8000));
  const diag = await page.evaluate(() => ({
    guard: window.nandhaRedisGuard ? window.nandhaRedisGuard.getStatus() : 'MISSING',
    errors: window.nandhaErrors || [],
  }));
  console.log('guard:', JSON.stringify(diag.guard));
  console.log('errors:', JSON.stringify(diag.errors));
  await browser.close();
})().catch((e) => { console.error('SCRIPT FAILED:', e.message); process.exit(1); });
