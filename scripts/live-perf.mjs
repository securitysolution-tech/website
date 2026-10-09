// Weekly Lighthouse of the live site in both languages. Prints the scores and exits 1 when a
// page's performance score has dropped by more than the tolerance below its committed,
// runner-measured baseline (perf-baseline.json), so the workflow can open an issue. Absolute
// numbers mean little across machines (the runner has no GPU and scores about thirty points
// under real hardware); a drop against the same machine's baseline is a regression. The
// build-time audit cannot see Cloudflare, caching or font regressions; this can.
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

import { readFileSync } from 'node:fs';

const SITE = process.env.SITE ?? 'https://securitysolution.tech';
const TOLERANCE = Number(process.env.TOLERANCE ?? 12);
const baseline = JSON.parse(readFileSync(new URL('../perf-baseline.json', import.meta.url), 'utf8'));
const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
let low = false;
try {
  for (const path of ['/', '/ar/']) {
    const result = await lighthouse(SITE + path, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    const c = result.lhr.categories;
    const score = (k) => Math.round(c[k].score * 100);
    const perf = score('performance');
    console.log(
      `${path}: performance ${perf}, accessibility ${score('accessibility')}, best practices ${score('best-practices')}, SEO ${score('seo')}; LCP ${result.lhr.audits['largest-contentful-paint'].displayValue}`,
    );
    const floor = typeof baseline[path] === 'number' ? baseline[path] - TOLERANCE : 0;
    if (perf < floor) {
      low = true;
      console.log(`      under the baseline of ${baseline[path]} by more than ${TOLERANCE}`);
    }
  }
} finally {
  chrome.kill();
}
if (low) {
  console.log(`FAIL  live performance dropped by more than ${TOLERANCE} points below its baseline`);
  process.exit(1);
}
