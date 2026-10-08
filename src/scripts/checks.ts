import { caaValue, orgDomain, query, RR, txtValue, type DnsResponse } from './dns';
import { fmt, type CheckStrings } from '../i18n/client';

export type Status = 'pass' | 'warn' | 'fail' | 'info';
export type CheckId = 'dmarc' | 'spf' | 'mx' | 'dnssec' | 'caa' | 'mtasts';
export type Level = 'strong' | 'partial' | 'weak';
type Summaries = CheckStrings['summaries'];

export interface Result {
  id: CheckId;
  status: Status;
  summary: string;
  evidence: string[];
}

export interface Verdict {
  passed: number;
  scored: number;
  spoofing: Level;
  /** True when the DMARC or SPF lookup did not complete, so the spoofing verdict cannot be trusted. */
  incomplete: boolean;
}

export class DomainNotFoundError extends Error {}
export class ResolverError extends Error {}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);

function tags(record: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of record.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function txtRecords(res: DnsResponse | null, prefix: RegExp): string[] {
  if (!res) return [];
  return res.answers.filter((a) => a.type === RR.TXT).map((a) => txtValue(a.data)).filter((v) => prefix.test(v));
}

interface DmarcInfo {
  result: Result;
  enforced: boolean;
}

function evaluateDmarc(own: DnsResponse | null, inherited: DnsResponse | null, org: string, s: Summaries): DmarcInfo {
  let records = txtRecords(own, /^v=dmarc1\b/i);
  let via = '';
  if (records.length === 0 && inherited) {
    records = txtRecords(inherited, /^v=dmarc1\b/i);
    if (records.length) via = fmt(s.inherited, { org });
  }
  const result = (status: Status, summary: string, evidence: string[]): Result => ({ id: 'dmarc', status, summary, evidence });
  if (records.length === 0) {
    return { enforced: false, result: result('fail', s.dmarcNone, []) };
  }
  if (records.length > 1) {
    return { enforced: false, result: result('fail', fmt(s.dmarcMany, { via, n: records.length }), records.map((r) => clip(r))) };
  }
  const record = records[0];
  const t = tags(record);
  const policy = (t.p ?? '').toLowerCase();
  const pct = t.pct === undefined ? 100 : Number(t.pct);
  const evidence = [clip(record)];

  if (policy === 'reject' || policy === 'quarantine') {
    if (pct < 100) {
      return { enforced: false, result: result('warn', fmt(s.dmarcPartial, { via, policy, pct }), evidence) };
    }
    return { enforced: true, result: result('pass', fmt(policy === 'reject' ? s.dmarcReject : s.dmarcQuarantine, { via }), evidence) };
  }
  if (policy === 'none') {
    return { enforced: false, result: result('warn', fmt(s.dmarcNone2, { via }), evidence) };
  }
  return { enforced: false, result: result('fail', fmt(s.dmarcInvalid, { via }), evidence) };
}

function evaluateSpf(res: DnsResponse | null, dmarcEnforced: boolean, s: Summaries): Result {
  const records = txtRecords(res, /^v=spf1(\s|$)/i);
  const result = (status: Status, summary: string, evidence: string[]): Result => ({ id: 'spf', status, summary, evidence });
  if (records.length === 0) return result('fail', s.spfNone, []);
  if (records.length > 1) return result('fail', fmt(s.spfMany, { n: records.length }), records.map((r) => clip(r)));
  const record = records[0];
  const evidence = [clip(record)];
  const terms = record.toLowerCase().split(/\s+/).slice(1);
  const lookups = terms.filter((m) => /^[+\-~?]?(include:|a\b|a:|a\/|mx\b|mx:|mx\/|ptr|exists:)|^redirect=/.test(m)).length;
  if (lookups > 10) return result('fail', fmt(s.spfLookups, { n: lookups }), evidence);
  const all = terms.find((m) => /^[+\-~?]?all$/.test(m));
  const qualifier = all ? (/^[+\-~?]/.test(all) ? all[0] : '+') : '';
  const redirect = terms.find((m) => m.startsWith('redirect='));

  if (qualifier === '-') return result('pass', s.spfStrict, evidence);
  if (qualifier === '~') return dmarcEnforced ? result('pass', s.spfSoftOk, evidence) : result('warn', s.spfSoftWeak, evidence);
  if (qualifier === '+') return result('fail', s.spfPlusAll, evidence);
  if (redirect) return result('info', fmt(s.spfRedirect, { target: redirect.slice(9) }), evidence);
  return result('warn', s.spfNoAll, evidence);
}

const mailProviders: [RegExp, string][] = [
  [/(aspmx\.l\.google\.com|smtp\.google\.com|googlemail\.com)\.?$/, 'Google Workspace'],
  [/mail\.protection\.outlook\.com\.?$/, 'Microsoft 365'],
  [/mx\.cloudflare\.net\.?$/, 'Cloudflare Email Routing'],
  [/cf-emailsecurity\.net\.?$/, 'Cloudflare Email Security'],
  [/zoho\.(com|eu|in)\.?$/, 'Zoho Mail'],
  [/(pphosted\.com|ppe-hosted\.com)\.?$/, 'Proofpoint'],
  [/mimecast\.com\.?$/, 'Mimecast'],
];

function evaluateMx(res: DnsResponse | null, s: Summaries): { result: Result; receivesMail: boolean } {
  const mx = (res?.answers ?? [])
    .filter((a) => a.type === RR.MX)
    .map((a) => {
      const [pref, host = ''] = a.data.trim().split(/\s+/);
      return { pref: Number(pref), host: host.toLowerCase() };
    })
    .sort((a, b) => a.pref - b.pref);

  if (mx.length === 0) {
    return { receivesMail: false, result: { id: 'mx', status: 'info', summary: s.mxNone, evidence: [] } };
  }
  if (mx.length === 1 && (mx[0].host === '.' || mx[0].host === '')) {
    return { receivesMail: false, result: { id: 'mx', status: 'info', summary: s.mxNull, evidence: ['0 .'] } };
  }
  const provider = mailProviders.find(([re]) => mx.some((m) => re.test(m.host)))?.[1];
  return {
    receivesMail: true,
    result: {
      id: 'mx',
      status: 'info',
      summary: provider ? fmt(s.mxProvider, { provider }) : fmt(s.mxHost, { host: mx[0].host.replace(/\.$/, '') }),
      evidence: mx.slice(0, 4).map((m) => `${m.pref} ${m.host}`),
    },
  };
}

function evaluateDnssec(res: DnsResponse | null, s: Summaries): Result {
  if (res?.ad) return { id: 'dnssec', status: 'pass', summary: s.dnssecOk, evidence: [] };
  return { id: 'dnssec', status: 'warn', summary: s.dnssecNo, evidence: [] };
}

function evaluateCaa(res: DnsResponse | null, s: Summaries): Result {
  const records = (res?.answers ?? []).filter((a) => a.type === RR.CAA).map((a) => caaValue(a.data)).filter(Boolean) as {
    tag: string;
    value: string;
  }[];
  const issuers = [...new Set(records.filter((r) => r.tag === 'issue' || r.tag === 'issuewild').map((r) => r.value.split(';')[0].trim()).filter(Boolean))];
  if (records.length === 0) return { id: 'caa', status: 'warn', summary: s.caaNone, evidence: [] };
  return {
    id: 'caa',
    status: 'pass',
    summary: issuers.length ? fmt(s.caaIssuers, { issuers: issuers.slice(0, 4).join(', ') }) : s.caaRestricted,
    evidence: records.slice(0, 6).map((r) => `${r.tag} "${r.value}"`),
  };
}

function evaluateMtaSts(res: DnsResponse | null, receivesMail: boolean, s: Summaries): Result {
  if (!receivesMail) return { id: 'mtasts', status: 'info', summary: s.mtastsNotNeeded, evidence: [] };
  const records = txtRecords(res, /^v=stsv1\b/i);
  if (records.length) return { id: 'mtasts', status: 'pass', summary: s.mtastsOk, evidence: records.map((r) => clip(r)) };
  return { id: 'mtasts', status: 'info', summary: s.mtastsNo, evidence: [] };
}

/**
 * Runs every check for a domain. `onResult` fires as each result is ready, so the
 * interface can fill in rows as answers arrive. The summaries come from the page, in
 * the visitor's language.
 */
export async function runChecks(
  domain: string,
  onResult: (r: Result) => void,
  signal: AbortSignal | undefined,
  s: Summaries,
): Promise<{ results: Result[]; verdict: Verdict }> {
  const safe = (p: Promise<DnsResponse>) => p.catch(() => null);
  const org = orgDomain(domain);

  const nsP = safe(query(domain, 'NS', signal));
  const txtP = safe(query(domain, 'TXT', signal));
  const dmarcP = safe(query(`_dmarc.${domain}`, 'TXT', signal));
  const dmarcOrgP = org !== domain ? safe(query(`_dmarc.${org}`, 'TXT', signal)) : Promise.resolve(null);
  const mxP = safe(query(domain, 'MX', signal));
  const caaP = safe(query(domain, 'CAA', signal));
  const stsP = safe(query(`_mta-sts.${domain}`, 'TXT', signal));

  const ns = await nsP;
  if (ns && ns.status === 3) throw new DomainNotFoundError(domain);

  const results: Partial<Record<CheckId, Result>> = {};
  const emit = (r: Result) => {
    results[r.id] = r;
    onResult(r);
  };

  const all = await Promise.all([txtP, dmarcP, dmarcOrgP, mxP, caaP, stsP]);
  if (!ns && all.every((r) => r === null)) throw new ResolverError('No resolver reachable');

  const [txt, dmarc, dmarcOrg, mx, caa, sts] = all;
  const dmarcInfo = evaluateDmarc(dmarc, dmarcOrg, org, s);
  const mxInfo = evaluateMx(mx, s);

  // A failed lookup is reported as such, never as a missing record.
  const unknown = (id: CheckId): Result => ({ id, status: 'info', summary: s.unknown, evidence: [] });

  emit(dmarc ? dmarcInfo.result : unknown('dmarc'));
  emit(txt ? evaluateSpf(txt, dmarcInfo.enforced, s) : unknown('spf'));
  emit(mx ? mxInfo.result : unknown('mx'));
  emit(ns ? evaluateDnssec(ns, s) : unknown('dnssec'));
  emit(caa ? evaluateCaa(caa, s) : unknown('caa'));
  emit(sts && mx ? evaluateMtaSts(sts, mxInfo.receivesMail, s) : unknown('mtasts'));

  const list = Object.values(results) as Result[];
  const scored = list.filter((r) => r.status !== 'info');
  const passed = scored.filter((r) => r.status === 'pass').length;
  const d = results.dmarc?.status;
  const sp = results.spf?.status;
  const spoofing: Level = d === 'pass' && sp === 'pass' ? 'strong' : d === 'fail' || sp === 'fail' ? 'weak' : 'partial';
  const incomplete = !dmarc || !txt;

  return { results: list, verdict: { passed, scored: scored.length, spoofing, incomplete } };
}
