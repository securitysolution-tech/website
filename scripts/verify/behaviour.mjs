// Behaviour checks the build's gates do not cover: the Content-Security-Policy and script
// errors on every page, reduced motion rendering identically, no horizontal overflow on a
// phone, the domain check reaching a verdict, and the contact form composing its fallback
// message. Serves dist/ and drives the system Chrome, like scripts/audit.mjs.
//
//   npm run build && npm run verify:browser
//
// Needs Google Chrome. Exits non-zero on any failure. Not in the deploy gate, because a
// browser behaviour test can be timing-sensitive; run it locally before a change that
// touches the check, the form, motion, or layout. The probes this replaces lived only in a
// scratch directory and vanished each session.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};
const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const note = (m) => notes.push(m);

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let file = join(dist, path);
  let status = 200;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(dist, '404.html');
    status = 404;
  }
  res.writeHead(existsSync(file) ? status : 404, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(existsSync(file) ? readFileSync(file) : 'not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name === 'index.html') pages.push('/' + relative(dist, dir).split('\\').join('/') + '/');
  }
})(dist);
const urls = [...new Set(pages.map((p) => (p === '//' ? '/' : p)))].sort();

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open(ctx, path, settle = 2000) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
  });
  await page.addInitScript(() => {
    window.__cspv = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__cspv.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(settle);
  return { page, errors, cspv: () => page.evaluate(() => window.__cspv) };
}

// 1. Every page: no CSP violation, no script error.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  for (const url of urls) {
    const { page, errors, cspv } = await open(ctx, url, 1500);
    const v = await cspv();
    if (v.length) fail(`${url}: CSP violation ${v.join(', ')}`);
    if (errors.length) fail(`${url}: ${errors.join(' | ')}`);
    await page.close();
  }
  note(`${urls.length} pages checked for CSP violations and script errors`);
  await ctx.close();
}

// 2. Reduced motion: the home renders identically across frames (nothing animates).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const { page } = await open(ctx, '/', 2500);
  const a = await page.screenshot();
  await page.waitForTimeout(1200);
  const b = await page.screenshot();
  if (Buffer.compare(a, b) !== 0) fail('reduced motion: the home page is still moving');
  else note('reduced motion: the home page is still');
  await ctx.close();
}

// 3. Phone: no horizontal overflow on the home page.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page } = await open(ctx, '/', 1500);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 390) fail(`phone: home overflows (${w}px wide)`);
  else note('phone: no horizontal overflow');
  await ctx.close();
}

// 4. The domain check reaches a verdict for a weak domain, with the fix-first list.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const { page } = await open(ctx, '/', 2500);
  await page.fill('#domain-input', 'neverssl.com');
  await page.click('.check-form .run');
  try {
    await page.waitForFunction(() => !document.querySelector('[data-verdict]').hidden, null, { timeout: 20000 });
    const r = await page.evaluate(() => ({
      spoofing: document.querySelector('[data-spoofing]').textContent,
      fix: document.querySelectorAll('[data-fix-list] li').length,
    }));
    if (!r.spoofing) fail('domain check: no verdict text');
    else if (r.fix === 0) fail('domain check: weak domain showed no fix-first items');
    else note(`domain check: verdict "${r.spoofing}" with ${r.fix} fix-first items`);
  } catch {
    fail('domain check: no verdict within 20s (network to the DNS resolver?)');
  }
  await ctx.close();
}

// 5. The contact form composes its fallback message (no backend needed).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const { page } = await open(ctx, '/', 2000);
  await page.fill('#cf-name', 'Test Person');
  await page.fill('#cf-email', 'test@example.ae');
  await page.click('[data-contact-form] [type="submit"]');
  await page.waitForTimeout(500);
  const composed = await page.evaluate(() => !document.querySelector('[data-composed]').hidden);
  if (!composed) fail('contact form: did not compose the message on submit');
  else note('contact form: composes the message');
  await ctx.close();
}

// 6. The visit counter, when this build has it on: one cookie-free beacon from the real site, and none
// from anywhere else, from automation, from a browser that asked not to be tracked, or after ?visits=off.
// The built site is served at its real origin through request interception, so the page runs exactly as
// it does in production; the counter's endpoint is a stub that records what it is sent.
{
  const privacy = join(dist, 'privacy', 'index.html');
  const counting = existsSync(privacy) && readFileSync(privacy, 'utf8').includes('Counting visits');
  if (!counting) {
    note('visit counter: off in this build (build with PUBLIC_VISITS=1 to check it)');
  } else {
    const ORIGIN = 'https://securitysolution.tech';
    const human = () => Object.defineProperty(navigator, 'webdriver', { get: () => false });
    const robot = () => Object.defineProperty(navigator, 'webdriver', { get: () => true });
    const doNotTrack = () => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' });
    };
    const privacyControl = () => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
    };

    const serve = (hits, status) => async (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (pathname === '/api/hit') {
        hits.push({ method: request.method(), headers: request.headers(), body: request.postData() });
        return route.fulfill({ status, body: '' });
      }
      let path = decodeURIComponent(pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = join(dist, path);
      const found = existsSync(file) && !statSync(file).isDirectory();
      return route.fulfill({
        status: found ? 200 : 404,
        contentType: types[extname(file)] ?? 'application/octet-stream',
        body: found ? readFileSync(file) : 'not found',
      });
    };

    async function visit({ path = '/', referer, setup = human, status = 204, wait = 0 } = {}) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const hits = [];
      await ctx.route(`${ORIGIN}/**`, serve(hits, status));
      await ctx.route(/cloudflare-dns\.com|dns\.google/, (route) => route.abort());
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        window.__cspv = [];
        document.addEventListener('securitypolicyviolation', (e) =>
          window.__cspv.push(`${e.violatedDirective} ${e.blockedURI}`),
        );
      });
      await page.addInitScript(setup);
      await page.goto(ORIGIN + path, { waitUntil: 'load', referer });
      await waitFor(hits, wait);
      return { ctx, page, hits, errors };
    }

    // Waits for `want` beacons; with none wanted, waits long enough that a late one would have arrived.
    async function waitFor(hits, want) {
      for (let i = 0; i < (want ? 60 : 50); i++) {
        if (want && hits.length >= want) return;
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const sent = (hit) => JSON.parse(hit.body);
    const check = async (v, label) => {
      const csp = await v.page.evaluate(() => window.__cspv);
      if (csp.length) fail(`visit counter, ${label}: CSP violation ${csp.join(', ')}`);
      if (v.errors.length) fail(`visit counter, ${label}: script error ${v.errors.join(' | ')}`);
    };

    // A real visit from LinkedIn, with a campaign tag: exactly one cookie-free beacon.
    const tagged = await visit({ path: '/?ref=li-oct9', referer: 'https://www.linkedin.com/feed/', wait: 1 });
    if (tagged.hits.length !== 1) fail(`visit counter: expected 1 beacon, got ${tagged.hits.length}`);
    else {
      const [hit] = tagged.hits;
      const body = sent(hit);
      if (hit.method !== 'POST' || !/^text\/plain/.test(hit.headers['content-type'] ?? ''))
        fail(`visit counter: beacon was ${hit.method} ${hit.headers['content-type']}`);
      if (JSON.stringify(body) !== JSON.stringify({ p: '/', r: 'linkedin.com', i: 0, c: 'li-oct9' }))
        fail(`visit counter: beacon body was ${hit.body}`);
      if (hit.headers.cookie) fail('visit counter: the beacon carried a cookie');
      if ((await tagged.ctx.cookies()).length) fail('visit counter: the page set a cookie');
      note('visit counter: one beacon with the page, referrer and campaign tag, no cookie');
    }
    await check(tagged, 'a counted visit');
    await tagged.ctx.close();

    // Moving within the site counts the next page as internal.
    const inside = await visit({ wait: 1 });
    await inside.page.locator('main a[href="/services/offensive-testing/"]').first().click();
    await waitFor(inside.hits, 2);
    if (inside.hits.length !== 2) fail(`visit counter: expected 2 beacons across two pages, got ${inside.hits.length}`);
    else {
      const second = sent(inside.hits[1]);
      if (second.p !== '/services/offensive-testing/' || second.i !== 1)
        fail(`visit counter: the second page was sent as ${inside.hits[1].body}`);
      else note('visit counter: the second page is counted as internal');
    }
    await inside.ctx.close();

    // Silence: automation, Do Not Track and Global Privacy Control.
    for (const [label, setup] of [
      ['automation', robot],
      ['Do Not Track', doNotTrack],
      ['Global Privacy Control', privacyControl],
    ]) {
      const quiet = await visit({ setup });
      if (quiet.hits.length) fail(`visit counter: counted a visit under ${label}`);
      else note(`visit counter: silent under ${label}`);
      await quiet.ctx.close();
    }

    // ?visits=off switches it off in this browser, and the address is tidied; ?visits=on restores it.
    const off = await visit({ path: '/?visits=off' });
    const state = await off.page.evaluate(() => ({
      stored: localStorage.getItem('ss-ignore-visits'),
      search: location.search,
    }));
    if (off.hits.length || state.stored !== '1' || state.search !== '')
      fail(
        `visit counter: ?visits=off left ${off.hits.length} beacons, stored ${state.stored}, address "${state.search}"`,
      );
    await off.page.reload({ waitUntil: 'load' });
    await waitFor(off.hits, 0);
    if (off.hits.length) fail('visit counter: counted after ?visits=off and a reload');
    await off.page.goto(`${ORIGIN}/?visits=on`, { waitUntil: 'load' });
    await waitFor(off.hits, 1);
    if (off.hits.length !== 1) fail(`visit counter: ?visits=on did not restore counting (${off.hits.length} beacons)`);
    else note('visit counter: ?visits=off silences a browser and ?visits=on restores it');
    await off.ctx.close();

    // Anywhere but the real site sends nothing: a local build, a preview, the CI audit.
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const hits = [];
      const page = await ctx.newPage();
      await page.route('**/api/hit', (route) => {
        hits.push(route.request().postData());
        return route.fulfill({ status: 204, body: '' });
      });
      await page.addInitScript(human);
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await waitFor(hits, 0);
      if (hits.length) fail('visit counter: a local build sent a beacon');
      else note('visit counter: nothing is sent from a host that is not the real site');
      await ctx.close();
    }

    // A failing counter is invisible to the visitor.
    const broken = await visit({ status: 500, wait: 1 });
    if (broken.hits.length !== 1) fail('visit counter: no beacon was attempted for the failure case');
    await check(broken, 'a failing counter');
    note('visit counter: a 500 from the counter breaks nothing on the page');
    await broken.ctx.close();
  }
}

await browser.close();
server.close();

console.log(notes.map((n) => `- ${n}`).join('\n'));
if (problems.length) {
  console.error(`\nBehaviour check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\nBehaviour check passed.');
