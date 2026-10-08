// Fails if any internal link, asset reference or in-page anchor in dist/ does not resolve.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const SITE_EMAIL_DOMAIN = 'securitysolution.tech';

const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) htmlFiles.push(full);
  }
})(dist);

const toUrlPath = (file) => {
  const rel = '/' + relative(dist, file).split(sep).join('/');
  return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
};

const pages = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  pages.set(toUrlPath(file), { file, html, ids });
}

const problems = [];
for (const [pagePath, { html }] of pages) {
  for (const [, attr, raw] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    const value = raw.replace(/&amp;/g, '&');
    if (/^(https?:|data:|tel:)/.test(value)) continue;
    if (value.startsWith('mailto:')) {
      const address = value.slice(7).split('?')[0];
      // No address opens a blank message for the visitor to address (the results email).
      if (address && !address.endsWith(`@${SITE_EMAIL_DOMAIN}`)) problems.push(`${pagePath}: unexpected mail address ${address}`);
      continue;
    }
    const url = new URL(value, `https://example.invalid${pagePath}`);
    const target = url.pathname;
    let targetPage = pages.get(target);
    if (!targetPage) {
      const asset = join(dist, decodeURIComponent(target));
      if (target.endsWith('/') || !existsSync(asset)) {
        const hint = pages.has(`${target}/`) ? ' (missing trailing slash)' : '';
        problems.push(`${pagePath}: broken ${attr} ${value}${hint}`);
        continue;
      }
    }
    // "#check=domain" is state for the domain check, not an element id.
    if (url.hash && url.hash !== '#' && !url.hash.startsWith('#check=')) {
      targetPage ??= pages.get(target);
      const id = decodeURIComponent(url.hash.slice(1));
      if (!targetPage || !targetPage.ids.has(id)) problems.push(`${pagePath}: missing anchor ${value}`);
    }
  }
}

if (problems.length) {
  console.error(`Link check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Link check passed: ${pages.size} pages, all internal links, assets and anchors resolve.`);
