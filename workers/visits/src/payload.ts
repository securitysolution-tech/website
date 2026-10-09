// The beacon's body, checked and reduced to what is counted. Nothing from it is stored as sent:
// the page becomes a known path or "other", and the source becomes a campaign tag, a referring
// site's name, or one of "direct" and "internal".
import { pageFor } from './paths.ts';

export interface Hit {
  path: string;
  source: string;
}

// A DNS name with at least two labels whose last label starts with a letter, so an IP address
// (an intranet page, say) is never taken for a site.
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TAG = /^[a-z0-9][a-z0-9_-]{0,31}$/;

// Referrers that arrive under several names are counted once.
const GROUPS: [RegExp, string][] = [
  [/^(?:[a-z]{2,3}\.)?linkedin\.com$|^lnkd\.in$/, 'linkedin.com'],
  [/^(?:[a-z-]+\.)?facebook\.com$|^fb\.com$/, 'facebook.com'],
  [/^(?:mobile\.)?(?:twitter|x)\.com$|^t\.co$/, 'x.com'],
  [/^(?:[a-z-]+\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/, 'google'],
  [/^(?:[a-z-]+\.)?bing\.com$/, 'bing.com'],
  [/^(?:[a-z-]+\.)?github\.com$/, 'github.com'],
  [/^(?:old\.|out\.)?reddit\.com$/, 'reddit.com'],
  [/^(?:news\.)?ycombinator\.com$/, 'ycombinator.com'],
];

/**
 * Where a visit came from. A campaign tag in the link (?ref=) wins, because it says more than the
 * site that happened to send the visitor. `internal` means the visitor was already on the site.
 */
export function sourceFor(referrer: unknown, internal: unknown, tag: unknown, siteHost: string): string {
  const campaign = typeof tag === 'string' ? tag.trim().toLowerCase() : '';
  if (TAG.test(campaign)) return campaign;
  if (internal === 1) return 'internal';
  const host =
    typeof referrer === 'string'
      ? referrer
          .trim()
          .toLowerCase()
          .replace(/^www\./, '')
      : '';
  if (!host) return 'direct';
  if (host === siteHost.toLowerCase().replace(/^www\./, '')) return 'internal';
  if (host.length > 80 || !HOST.test(host)) return 'other';
  return GROUPS.find(([pattern]) => pattern.test(host))?.[1] ?? host;
}

/** The counted page and source for a beacon body, or null when it is not one. */
export function parseHit(data: unknown, siteHost: string): Hit | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const body = data as Record<string, unknown>;
  if (typeof body.p !== 'string') return null;
  return { path: pageFor(body.p), source: sourceFor(body.r, body.i, body.c, siteHost) };
}
