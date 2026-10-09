// One posture reading, taken with the website's own check (src/scripts/checks.ts), so an alert
// is about exactly what the public domain check shows. Only each record's status and the
// spoofing verdict are kept.
import { runChecks, type CheckId, type Status } from '../../../src/scripts/checks.ts';
import { en } from '../../../src/i18n/en.ts';

export type { CheckId, Status };
export const CHECK_IDS: CheckId[] = ['dmarc', 'spf', 'mx', 'dnssec', 'caa', 'mtasts'];

export interface Snapshot {
  at: string;
  level: 'strong' | 'partial' | 'weak' | 'incomplete';
  checks: Partial<Record<CheckId, Status>>;
}

/** Throws for a domain that does not exist or when no resolver answers. */
export async function read(domain: string, signal?: AbortSignal): Promise<Snapshot> {
  const { results, verdict } = await runChecks(domain, () => {}, signal, en.check.summaries);
  const checks: Partial<Record<CheckId, Status>> = {};
  for (const r of results) checks[r.id] = r.status;
  return { at: new Date().toISOString(), level: verdict.incomplete ? 'incomplete' : verdict.spoofing, checks };
}
