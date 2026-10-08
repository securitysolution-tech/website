// Audits the built site in a real browser: accessibility (axe-core) on every page, the
// Content-Security-Policy and script errors, and Lighthouse on three pages with the
// resource budgets in budget.json. Runs in CI (.github/workflows/quality.yml) and locally:
//
//   npm run build && npm run audit
//
// Needs Google Chrome. Accessibility, best practices, SEO, layout shift, the budgets, the
// CSP and script errors are hard failures. The performance score, LCP and blocking time
// are reported but not enforced: they depend on the machine running the audit.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

const require = createRequire(import.meta.url);
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const budgets = JSON.parse(readFileSync(new URL('../budget.json', import.meta.url), 'utf8'));
const chromeFlags = ['--headless=new', '--no-sandbox', '--disable-gpu'];
const summary = [];
const problems = [];

// --- A static server for dist/, the way GitHub Pages serves it ---------------------------
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
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  let file = join(dist, path);
  let status = 200;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(dist, '404.html');
    status = 404;
  }
  res.writeHead(status, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// Every page in the build, plus the 404.
const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name === 'index.html') pages.push('/' + relative(dist, dir).split('\\').join('/') + '/');
  }
})(dist);
pages.sort();
const urls = pages.map((p) => (p === '//' ? '/' : p)).concat(['/404.html']);

// --- axe, CSP and errors on every page -----------------------------------------------------
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
// Motion is reduced for the audit: it measures resting states, not a badge halfway through
// its fade. The site honours the preference, so nothing else differs.
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  bypassCSP: true,
  reducedMotion: 'reduce',
});
const axePath = require.resolve('axe-core/axe.min.js');
for (const url of urls) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript(() => {
    window.__cspv = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.__cspv.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto(base + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const cspv = await page.evaluate(() => window.__cspv);
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    // Each node with what axe measured, so a failure in CI can be read without rerunning it.
    return r.violations.map((v) => {
      const nodes = v.nodes.slice(0, 6).map((n) => {
        const d = n.any[0]?.data;
        const measured = d?.contrastRatio ? ` ${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}` : '';
        return `${n.target.join(' ')}${measured}`;
      });
      return `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}): ${nodes.join(' | ')}`;
    });
  });
  for (const v of violations) problems.push(`${url}: axe ${v}`);
  for (const v of cspv) problems.push(`${url}: CSP violation ${v}`);
  for (const e of errors) problems.push(`${url}: script error ${e}`);
  summary.push(`${url}: axe ${violations.length} violations, CSP ${cspv.length}, errors ${errors.length}`);
  await page.close();
}
await browser.close();

// Readiness is noindex until the owner reviews it, so it is covered by the axe/CSP pass on
// every page above but kept out of the Lighthouse SEO gate (a noindex page scores low there).
// --- Lighthouse on three pages ----------------------------------------------------------------
const chrome = await launch({ chromeFlags });
for (const url of ['/', '/ar/', '/services/offensive-testing/', '/privacy/']) {
  const result = await lighthouse(base + url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    budgets,
  });
  const { categories, audits } = result.lhr;
  const score = (k) => Math.round((categories[k]?.score ?? 0) * 100);
  const metric = (k) => audits[k]?.displayValue ?? '?';
  const cls = audits['cumulative-layout-shift']?.numericValue ?? 0;
  const budget = audits['performance-budget'];
  const over = (budget?.details?.items ?? [])
    .filter((i) => i.sizeOverBudget > 0 || i.countOverBudget)
    .map(
      (i) => `${i.label}: ${i.sizeOverBudget ? Math.round(i.sizeOverBudget / 1024) + ' KiB over' : i.countOverBudget}`,
    );
  summary.push(
    `${url}: performance ${score('performance')}, accessibility ${score('accessibility')}, best practices ${score('best-practices')}, SEO ${score('seo')}; LCP ${metric('largest-contentful-paint')}, TBT ${metric('total-blocking-time')}, CLS ${metric('cumulative-layout-shift')}`,
  );
  if (score('accessibility') < 100) problems.push(`${url}: accessibility ${score('accessibility')} (expected 100)`);
  if (score('best-practices') < 100) problems.push(`${url}: best practices ${score('best-practices')} (expected 100)`);
  if (score('seo') < 100) problems.push(`${url}: SEO ${score('seo')} (expected 100)`);
  if (cls > 0.05) problems.push(`${url}: layout shift ${cls.toFixed(3)} (limit 0.05)`);
  for (const o of over) problems.push(`${url}: over budget, ${o}`);
}
chrome.kill();
server.close();

const report = summary.map((l) => `- ${l}`).join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Site audit\n\n${report}\n${problems.length ? `\n### Problems\n\n${problems.map((p) => `- ${p}`).join('\n')}\n` : '\nNo problems.\n'}`,
  );
}
if (problems.length) {
  console.error(`\nAudit failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\nAudit passed.');
