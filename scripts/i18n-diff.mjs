// Lists the English dictionary keys whose text changed between two git revisions, so a change
// to en.ts that left ar.ts untouched can be pointed out on a pull request. The dictionaries
// have no imports, so each revision's file is loaded on its own.
//
//   node scripts/i18n-diff.mjs <base-ref> <head-ref>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error('usage: node scripts/i18n-diff.mjs <base-ref> <head-ref>');
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), 'i18n-'));
async function load(ref) {
  const source = execFileSync('git', ['show', `${ref}:src/i18n/en.ts`], { encoding: 'utf8' });
  const file = join(dir, `en-${ref.replace(/[^\w]/g, '_')}.ts`);
  writeFileSync(file, source);
  return (await import(pathToFileURL(file).href)).en;
}

const flatten = (obj, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.set(key, String(v));
  }
  return out;
};

const [a, b] = await Promise.all([load(base), load(head)]);
const before = flatten(a);
const after = flatten(b);
const changed = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
const removed = [...before.keys()].filter((k) => !after.has(k));
console.log(JSON.stringify({ changed, removed }));
