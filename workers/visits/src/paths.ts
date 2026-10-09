// The pages the counter will name. Anything else (a typo, a scanner's guess, a page that does not
// exist) is counted as "other", so nobody can fill the table with paths of their own. The list is
// the site's own: tests/visits.test.mjs fails if a built page is missing from it.
import { services } from '../../../src/data/services.ts';

const english = ['/', '/privacy/', '/security/', '/readiness/', ...services.map((s) => `/services/${s.slug}/`)];

export const known: ReadonlySet<string> = new Set(english.flatMap((path) => [path, `/ar${path}`]));

/** The counted name of a page: its path when the site has it, otherwise "other". */
export function pageFor(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 120 || !raw.startsWith('/')) return 'other';
  const bare = (raw.split(/[?#]/)[0] ?? '').toLowerCase();
  const path = bare.endsWith('/') ? bare : `${bare}/`;
  return known.has(path) ? path : 'other';
}
