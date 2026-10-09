// The signup request. The domain is normalised by the website's own rule, so what can be
// watched is what can be checked.
import { normaliseDomain } from '../../../src/scripts/dns.ts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Invalid = { ok: false; field: 'domain' | 'email' | 'body' };
export type Valid = { ok: true; domain: string; email: string; spam: boolean };

export function validate(data: unknown): Valid | Invalid {
  if (typeof data !== 'object' || data === null) return { ok: false, field: 'body' };
  const input = data as Record<string, unknown>;
  const domain = typeof input.domain === 'string' ? normaliseDomain(input.domain) : null;
  if (!domain) return { ok: false, field: 'domain' };
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!email || email.length > 254 || !EMAIL.test(email)) return { ok: false, field: 'email' };
  // A field people never see, and a form filled in under two seconds: a script, not a person.
  const elapsed = typeof input.elapsed === 'number' ? input.elapsed : Number.NaN;
  const spam =
    (typeof input.website === 'string' && input.website.trim() !== '') || (Number.isFinite(elapsed) && elapsed < 2000);
  return { ok: true, domain, email: email.toLowerCase(), spam };
}
