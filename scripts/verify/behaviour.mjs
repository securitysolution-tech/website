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
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, '404.html');
  res.writeHead(existsSync(file) ? 200 : 404, {
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

await browser.close();
server.close();

console.log(notes.map((n) => `- ${n}`).join('\n'));
if (problems.length) {
  console.error(`\nBehaviour check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\nBehaviour check passed.');
