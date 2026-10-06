// Fails if published pages contain characters or phrases the copy style guide rules out.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

const rules = [
  { re: /—/, why: 'em dash (use a comma, colon or full stop)' },
  { re: /–/, why: 'en dash (use a hyphen)' },
  { re: /lorem ipsum/i, why: 'placeholder text' },
  { re: /\b(TODO|FIXME|TBD)\b/, why: 'unfinished marker' },
  { re: /\b(cutting[- ]edge|seamless(ly)?|elevate|unleash|revolutioni[sz]e|next[- ]gen|world[- ]class|best[- ]in[- ]class)\b/i, why: 'filler phrase' },
];

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) files.push(full);
  }
})(dist);

const problems = [];
for (const file of files) {
  // Scripts and styles are code, not copy; everything else (text and attributes) is checked.
  const html = readFileSync(file, 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const { re, why } of rules) {
    const match = html.match(re);
    if (match) {
      const at = html.indexOf(match[0]);
      const context = html.slice(Math.max(0, at - 50), at + 50).replace(/\s+/g, ' ');
      problems.push(`${relative(dist, file)}: ${why}: "...${context}..."`);
    }
  }
}

if (problems.length) {
  console.error(`Copy check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Copy check passed: ${files.length} pages.`);
