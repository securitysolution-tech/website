// The visit counter names pages from a list (workers/visits/src/paths.ts). A page the build makes
// but the list lacks would have every view counted as "other", so this fails until it is added.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageFor } from '../workers/visits/src/paths.ts';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name === 'index.html') pages.push(`/${relative(dist, dir).split('\\').join('/')}/`.replace('//', '/'));
  }
})(dist);

test('the build makes pages to count', () => {
  assert.ok(pages.length >= 10, `found only ${pages.length} pages in dist/ (run npm run build first)`);
  assert.ok(pages.includes('/') && pages.includes('/ar/'));
});

test('every page the build makes is one the counter can name', () => {
  const unnamed = pages.filter((page) => pageFor(page) === 'other');
  assert.deepEqual(unnamed, [], 'add these pages to workers/visits/src/paths.ts');
});
