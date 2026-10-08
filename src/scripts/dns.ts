/*
  DNS-over-HTTPS lookups from the visitor's browser.
  Cloudflare's resolver first, Google Public DNS as a fallback. Both serve the
  same JSON format and allow cross-origin requests.
*/

export interface DnsAnswer {
  name: string;
  type: number;
  data: string;
}

export interface DnsResponse {
  status: number;
  ad: boolean;
  answers: DnsAnswer[];
}

export const RR = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28, DS: 43, CAA: 257 } as const;
export type RRName = keyof typeof RR;

const resolvers = [
  (name: string, type: RRName) =>
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}&do=1`,
  (name: string, type: RRName) =>
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}&do=1`,
];

const TIMEOUT_MS = 6000;

async function fetchJson(url: string, signal?: AbortSignal): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // A superseded check cancels its requests through the caller's signal.
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/dns-json' },
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function query(name: string, type: RRName, signal?: AbortSignal): Promise<DnsResponse> {
  let lastError: unknown;
  for (const build of resolvers) {
    if (signal?.aborted) throw new Error('Cancelled');
    try {
      const json = await fetchJson(build(name, type), signal);
      // Status 2 (SERVFAIL) from one resolver is worth retrying on the other.
      if (json.Status === 2) {
        lastError = new Error('SERVFAIL');
        continue;
      }
      const answers: DnsAnswer[] = Array.isArray(json.Answer)
        ? json.Answer.filter((a: any) => a && typeof a.data === 'string').map((a: any) => ({
            name: String(a.name ?? ''),
            type: Number(a.type),
            data: String(a.data),
          }))
        : [];
      return { status: Number(json.Status), ad: Boolean(json.AD), answers };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('DNS lookup failed');
}

/** TXT data arrives quoted and possibly split into 255-byte chunks. */
export function txtValue(data: string): string {
  const chunks = data.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!chunks) return data.trim();
  return chunks.map((c) => c.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
}

/** CAA records may come back as text or in RFC 3597 hex form. */
export function caaValue(data: string): { tag: string; value: string } | null {
  const hex = data.match(/^\\#\s+\d+\s+([0-9a-fA-F\s]+)$/);
  if (hex) {
    const bytes = hex[1].replace(/\s+/g, '').match(/../g)?.map((b) => parseInt(b, 16)) ?? [];
    if (bytes.length < 2) return null;
    const tagLen = bytes[1];
    const tag = String.fromCharCode(...bytes.slice(2, 2 + tagLen));
    const value = String.fromCharCode(...bytes.slice(2 + tagLen));
    return { tag: tag.toLowerCase(), value };
  }
  const text = data.match(/^\d+\s+(\S+)\s+"?(.*?)"?$/);
  if (!text) return null;
  return { tag: text[1].toLowerCase(), value: text[2] };
}

/**
 * Turn whatever was typed into a bare hostname, or null if it is not one.
 * URL parsing also converts internationalised names to punycode.
 */
export function normaliseDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/^[^@/]*@/, '');
  s = s.split(/[/?#]/)[0];
  try {
    s = new URL(`http://${s}`).hostname;
  } catch {
    return null;
  }
  s = s.replace(/\.$/, '').replace(/^www\./, '');
  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const valid = new RegExp(`^(?=.{1,253}$)(?:${label}\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$`);
  return valid.test(s) ? s : null;
}

// Second-level suffixes where the registrable domain has three labels.
const multiLabelSuffixes = new Set([
  'co.ae', 'net.ae', 'org.ae', 'gov.ae', 'ac.ae', 'sch.ae', 'mil.ae',
  'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa',
  'com.qa', 'net.qa', 'org.qa', 'gov.qa', 'edu.qa',
  'com.kw', 'com.bh', 'com.om', 'com.eg', 'com.jo', 'com.lb',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.in', 'co.za',
]);

/** Best-effort organisational domain, used for the DMARC fallback lookup. */
export function orgDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  return multiLabelSuffixes.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}
