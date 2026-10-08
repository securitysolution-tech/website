import { caaValue, orgDomain, query, RR, txtValue, type DnsResponse } from './dns';

export type Status = 'pass' | 'warn' | 'fail' | 'info';
export type CheckId = 'dmarc' | 'spf' | 'mx' | 'dnssec' | 'caa' | 'mtasts';

export interface Result {
  id: CheckId;
  status: Status;
  summary: string;
  evidence: string[];
}

export interface Verdict {
  passed: number;
  scored: number;
  spoofing: 'Strong' | 'Partial' | 'Weak';
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

function evaluateDmarc(own: DnsResponse | null, inherited: DnsResponse | null, org: string): DmarcInfo {
  let records = txtRecords(own, /^v=dmarc1\b/i);
  let via = '';
  if (records.length === 0 && inherited) {
    records = txtRecords(inherited, /^v=dmarc1\b/i);
    if (records.length) via = `Inherited from ${org}. `;
  }
  if (records.length === 0) {
    return {
      enforced: false,
      result: {
        id: 'dmarc',
        status: 'fail',
        summary:
          'No DMARC policy. Anyone can send email that claims to come from this domain, and receiving servers are not told to stop it.',
        evidence: [],
      },
    };
  }
  if (records.length > 1) {
    return {
      enforced: false,
      result: {
        id: 'dmarc',
        status: 'fail',
        summary: `${via}${records.length} DMARC records found. Receivers ignore DMARC when there is more than one.`,
        evidence: records.map((r) => clip(r)),
      },
    };
  }
  const record = records[0];
  const t = tags(record);
  const policy = (t.p ?? '').toLowerCase();
  const pct = t.pct === undefined ? 100 : Number(t.pct);
  const evidence = [clip(record)];

  if (policy === 'reject' || policy === 'quarantine') {
    if (pct < 100) {
      return {
        enforced: false,
        result: {
          id: 'dmarc',
          status: 'warn',
          summary: `${via}Policy is ${policy}, but only for ${pct}% of messages. The rest of the spoofed mail is still delivered.`,
          evidence,
        },
      };
    }
    return {
      enforced: true,
      result: {
        id: 'dmarc',
        status: 'pass',
        summary:
          policy === 'reject'
            ? `${via}Policy is reject. Receivers that check DMARC block email that fakes this domain.`
            : `${via}Policy is quarantine. Receivers that check DMARC send email that fakes this domain to spam.`,
        evidence,
      },
    };
  }
  if (policy === 'none') {
    return {
      enforced: false,
      result: {
        id: 'dmarc',
        status: 'warn',
        summary: `${via}Policy is none, which only monitors. Email that fakes this domain is still delivered.`,
        evidence,
      },
    };
  }
  return {
    enforced: false,
    result: {
      id: 'dmarc',
      status: 'fail',
      summary: `${via}The DMARC record has no valid policy (p=), so receivers ignore it.`,
      evidence,
    },
  };
}

function evaluateSpf(res: DnsResponse | null, dmarcEnforced: boolean): Result {
  const records = txtRecords(res, /^v=spf1(\s|$)/i);
  if (records.length === 0) {
    return {
      id: 'spf',
      status: 'fail',
      summary: 'No SPF record. Receiving servers cannot tell which servers are allowed to send email for this domain.',
      evidence: [],
    };
  }
  if (records.length > 1) {
    return {
      id: 'spf',
      status: 'fail',
      summary: `${records.length} SPF records found. That is treated as an error, so SPF fails for every message.`,
      evidence: records.map((r) => clip(r)),
    };
  }
  const record = records[0];
  const evidence = [clip(record)];
  const terms = record.toLowerCase().split(/\s+/).slice(1);
  const lookups = terms.filter((m) => /^[+\-~?]?(include:|a\b|a:|a\/|mx\b|mx:|mx\/|ptr|exists:)|^redirect=/.test(m)).length;
  if (lookups > 10) {
    return {
      id: 'spf',
      status: 'fail',
      summary: `This record needs at least ${lookups} DNS lookups. The limit is 10, so receivers treat SPF as an error.`,
      evidence,
    };
  }
  const all = terms.find((m) => /^[+\-~?]?all$/.test(m));
  const qualifier = all ? (/^[+\-~?]/.test(all) ? all[0] : '+') : '';
  const redirect = terms.find((m) => m.startsWith('redirect='));

  if (qualifier === '-') {
    return { id: 'spf', status: 'pass', summary: 'Strict policy (-all). Mail from servers not on the list fails SPF.', evidence };
  }
  if (qualifier === '~') {
    return dmarcEnforced
      ? {
          id: 'spf',
          status: 'pass',
          summary: 'Soft fail (~all), backed by an enforced DMARC policy. That combination is fine.',
          evidence,
        }
      : {
          id: 'spf',
          status: 'warn',
          summary: 'Soft fail (~all) without an enforced DMARC policy. Mail from unlisted servers is usually still delivered.',
          evidence,
        };
  }
  if (qualifier === '+') {
    return { id: 'spf', status: 'fail', summary: 'The record ends in +all, which allows any server on the internet to send as this domain.', evidence };
  }
  if (redirect) {
    return { id: 'spf', status: 'info', summary: `The policy is delegated to ${redirect.slice(9)}.`, evidence };
  }
  return {
    id: 'spf',
    status: 'warn',
    summary: 'The record has no enforcing “all” rule, so mail from unlisted servers is not rejected.',
    evidence,
  };
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

function evaluateMx(res: DnsResponse | null): { result: Result; receivesMail: boolean } {
  const mx = (res?.answers ?? [])
    .filter((a) => a.type === RR.MX)
    .map((a) => {
      const [pref, host = ''] = a.data.trim().split(/\s+/);
      return { pref: Number(pref), host: host.toLowerCase() };
    })
    .sort((a, b) => a.pref - b.pref);

  if (mx.length === 0) {
    return {
      receivesMail: false,
      result: { id: 'mx', status: 'info', summary: 'No mail servers are listed, so this domain does not receive email.', evidence: [] },
    };
  }
  if (mx.length === 1 && (mx[0].host === '.' || mx[0].host === '')) {
    return {
      receivesMail: false,
      result: { id: 'mx', status: 'info', summary: 'Null MX: the domain states that it never receives email.', evidence: ['0 .'] },
    };
  }
  const provider = mailProviders.find(([re]) => mx.some((m) => re.test(m.host)))?.[1];
  return {
    receivesMail: true,
    result: {
      id: 'mx',
      status: 'info',
      summary: provider ? `Email is handled by ${provider}.` : `Email is delivered to ${mx[0].host.replace(/\.$/, '')}.`,
      evidence: mx.slice(0, 4).map((m) => `${m.pref} ${m.host}`),
    },
  };
}

function evaluateDnssec(res: DnsResponse | null): Result {
  if (res?.ad) {
    return { id: 'dnssec', status: 'pass', summary: 'Signed and validated. Answers for this domain cannot be forged in transit.', evidence: [] };
  }
  return {
    id: 'dnssec',
    status: 'warn',
    summary: 'Not signed. An attacker on the network path could forge DNS answers for this domain.',
    evidence: [],
  };
}

function evaluateCaa(res: DnsResponse | null): Result {
  const records = (res?.answers ?? []).filter((a) => a.type === RR.CAA).map((a) => caaValue(a.data)).filter(Boolean) as {
    tag: string;
    value: string;
  }[];
  const issuers = [...new Set(records.filter((r) => r.tag === 'issue' || r.tag === 'issuewild').map((r) => r.value.split(';')[0].trim()).filter(Boolean))];
  if (records.length === 0) {
    return {
      id: 'caa',
      status: 'warn',
      summary: 'No CAA record, so any certificate authority may issue certificates for this domain. One DNS record fixes it.',
      evidence: [],
    };
  }
  return {
    id: 'caa',
    status: 'pass',
    summary: issuers.length ? `Only ${issuers.slice(0, 4).join(', ')} may issue certificates.` : 'Certificate issuance is restricted.',
    evidence: records.slice(0, 6).map((r) => `${r.tag} "${r.value}"`),
  };
}

function evaluateMtaSts(res: DnsResponse | null, receivesMail: boolean): Result {
  if (!receivesMail) {
    return { id: 'mtasts', status: 'info', summary: 'Not needed, because this domain does not receive email.', evidence: [] };
  }
  const records = txtRecords(res, /^v=stsv1\b/i);
  if (records.length) {
    return {
      id: 'mtasts',
      status: 'pass',
      summary: 'Published. Senders that support MTA-STS read your policy; in enforce mode they deliver only over an encrypted, verified connection.',
      evidence: records.map((r) => clip(r)),
    };
  }
  return {
    id: 'mtasts',
    status: 'info',
    summary: 'Not set. Optional hardening that lets you require encrypted delivery from sending servers that support it.',
    evidence: [],
  };
}

/**
 * Runs every check for a domain. `onResult` fires as each result is ready,
 * so the interface can fill in rows as answers arrive.
 */
export async function runChecks(
  domain: string,
  onResult: (r: Result) => void,
  signal?: AbortSignal,
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
  const dmarcInfo = evaluateDmarc(dmarc, dmarcOrg, org);
  const mxInfo = evaluateMx(mx);

  // A failed lookup is reported as such, never as a missing record.
  const unknown = (id: CheckId): Result => ({
    id,
    status: 'info',
    summary: 'The lookup did not complete. Run the check again in a moment.',
    evidence: [],
  });

  emit(dmarc ? dmarcInfo.result : unknown('dmarc'));
  emit(txt ? evaluateSpf(txt, dmarcInfo.enforced) : unknown('spf'));
  emit(mx ? mxInfo.result : unknown('mx'));
  emit(ns ? evaluateDnssec(ns) : unknown('dnssec'));
  emit(caa ? evaluateCaa(caa) : unknown('caa'));
  emit(sts && mx ? evaluateMtaSts(sts, mxInfo.receivesMail) : unknown('mtasts'));

  const list = Object.values(results) as Result[];
  const scored = list.filter((r) => r.status !== 'info');
  const passed = scored.filter((r) => r.status === 'pass').length;
  const d = results.dmarc?.status;
  const s = results.spf?.status;
  const spoofing: Verdict['spoofing'] = d === 'pass' && s === 'pass' ? 'Strong' : d === 'fail' || s === 'fail' ? 'Weak' : 'Partial';
  const incomplete = !dmarc || !txt;

  return { results: list, verdict: { passed, scored: scored.length, spoofing, incomplete } };
}
