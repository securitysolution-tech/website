// Fails if the built CSS contains a rule where a scroll-driven animation lost its name.
// The component style pass has rewritten `animation: linear both` to `animation: none`
// before; such a rule still carries animation-timeline, so the two together mark the bug.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../dist/_astro/', import.meta.url));
const problems = [];
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.css')) continue;
  const css = readFileSync(join(dir, name), 'utf8');
  for (const block of css.match(/\{[^{}]*\}/g) ?? []) {
    if (/animation-timeline\s*:/.test(block) && /(^|[{;])\s*animation\s*:\s*none\b/.test(block)) {
      problems.push(`${name}: ${block.slice(0, 120)}`);
    }
  }
}
if (problems.length) {
  console.error(`CSS check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('CSS check passed: no scroll-driven animation lost its name.');
