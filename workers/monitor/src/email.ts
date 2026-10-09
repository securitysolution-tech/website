// The three messages: confirm, baseline, alert. Plain text, unit-tested. Links carry a signed
// token; nothing here signs or sends.
import type { Diff } from './diff.ts';

export interface Links {
  origin: string;
  verify?: string;
  unsubscribe: string;
}
export interface Mail {
  subject: string;
  text: string;
}

const NAMES: Record<string, string> = {
  dmarc: 'Spoofing protection (DMARC)',
  spf: 'Approved senders (SPF)',
  mx: 'Mail servers (MX)',
  dnssec: 'Signed DNS (DNSSEC)',
  caa: 'Certificate lock (CAA)',
  mtasts: 'Encrypted mail delivery (MTA-STS)',
  verdict: 'Spoofing verdict',
};
const WORD: Record<string, string> = { pass: 'OK', warn: 'warning', fail: 'failing', info: 'not applicable' };
const sign = (origin: string) => `\r\nSecuritySolution.tech\r\n${origin}/`;

export function confirmEmail(domain: string, links: Links): Mail {
  return {
    subject: `Confirm: watch ${domain}`,
    text:
      `You asked SecuritySolution.tech to watch ${domain} and email you when its email or DNS protection changes.\r\n` +
      `Confirm it was you:\r\n\r\n${links.verify ?? ''}\r\n\r\n` +
      `If you did not ask for this, ignore this message and nothing more is sent.\r\n` +
      `We store only this domain and your address, to send these emails; unsubscribing deletes both.` +
      sign(links.origin),
  };
}

export function baselineEmail(domain: string, level: string, links: Links): Mail {
  return {
    subject: `Now watching ${domain}`,
    text:
      `We check ${domain} every day and email you only when something changes.\r\n` +
      `Today its spoofing protection is ${level}.\r\n\r\n` +
      `The full check, any time: ${links.origin}/#check=${encodeURIComponent(domain)}\r\n\r\n` +
      `Stop these emails: ${links.unsubscribe}` +
      sign(links.origin),
  };
}

export function alertEmail(domain: string, diff: Diff, links: Links): Mail {
  const line = (c: Diff['changes'][number]) =>
    `- ${NAMES[c.check] ?? c.check}: ${WORD[c.from] ?? c.from} -> ${WORD[c.to] ?? c.to}`;
  const worse = diff.changes.filter((c) => c.direction === 'degraded');
  const better = diff.changes.filter((c) => c.direction === 'improved');
  const other = diff.changes.filter((c) => c.direction === 'changed');
  const parts = [`The email and DNS protection for ${domain} changed.`, ''];
  if (worse.length) parts.push('Got worse:', ...worse.map(line), '');
  if (better.length) parts.push('Got better:', ...better.map(line), '');
  if (other.length) parts.push('Changed:', ...other.map(line), '');
  parts.push(
    `Spoofing protection is now ${diff.levelTo} (was ${diff.levelFrom}).`,
    '',
    `See the full check and how to fix it: ${links.origin}/#check=${encodeURIComponent(domain)}`,
    `Want us to fix it with you? Book a scoping call: ${links.origin}/#contact`,
    '',
    `Stop these emails: ${links.unsubscribe}`,
  );
  return {
    subject: `${domain}: protection ${diff.degraded ? 'dropped' : 'changed'}`,
    text: parts.join('\r\n') + sign(links.origin),
  };
}
