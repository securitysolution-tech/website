// Weekly Lighthouse of the live site in both languages. Prints the scores and exits 1 when
// the performance score is under the threshold on either page, so the workflow can open an
// issue. The build-time audit cannot see Cloudflare, caching or font regressions; this can.
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const SITE = process.env.SITE ?? 'https://securitysolution.tech';
const THRESHOLD = Number(process.env.THRESHOLD ?? 85);
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
    if (perf < THRESHOLD) low = true;
  }
} finally {
  await chrome.kill();
}
if (low) {
  console.log(`FAIL  performance under ${THRESHOLD} on the live site`);
  process.exit(1);
}
