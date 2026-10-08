// The verdict logic of the domain check, with fixtures standing in for resolver answers.
// Run by `npm test` on Node, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCaa, evaluateDmarc, evaluateDnssec, evaluateMtaSts, evaluateMx, evaluateSpf, verdictOf } from '../src/scripts/checks.ts';
import { RR } from '../src/scripts/dns.ts';
import { en } from '../src/i18n/en.ts';

const s = en.check.summaries;
const answer = (type, data, name = 'example.ae') => ({ name, type, data });
const txt = (...values) => ({ status: 0, ad: false, answers: values.map((v) => answer(RR.TXT, `"${v}"`)) });
const none = { status: 0, ad: false, answers: [] };

test('DMARC: no record fails, one enforced record passes, monitoring warns', () => {
  assert.equal(evaluateDmarc(none, null, 'example.ae', s).result.status, 'fail');
  const reject = evaluateDmarc(txt('v=DMARC1; p=reject; rua=mailto:d@example.ae'), null, 'example.ae', s);
  assert.equal(reject.result.status, 'pass');
  assert.equal(reject.enforced, true);
  assert.match(reject.result.summary, /reject/);
  const quarantine = evaluateDmarc(txt('v=DMARC1; p=quarantine'), null, 'example.ae', s);
  assert.equal(quarantine.result.status, 'pass');
  assert.equal(quarantine.enforced, true);
  const monitor = evaluateDmarc(txt('v=DMARC1; p=none'), null, 'example.ae', s);
  assert.equal(monitor.result.status, 'warn');
  assert.equal(monitor.enforced, false);
});

test('DMARC: partial coverage warns, two records fail, a missing policy fails', () => {
  const partial = evaluateDmarc(txt('v=DMARC1; p=reject; pct=50'), null, 'example.ae', s);
  assert.equal(partial.result.status, 'warn');
  assert.match(partial.result.summary, /50%/);
  const two = evaluateDmarc(txt('v=DMARC1; p=reject', 'v=DMARC1; p=none'), null, 'example.ae', s);
  assert.equal(two.result.status, 'fail');
  assert.match(two.result.summary, /2 DMARC records/);
  assert.equal(evaluateDmarc(txt('v=DMARC1; rua=mailto:x@example.ae'), null, 'example.ae', s).result.status, 'fail');
});

test('DMARC: a subdomain inherits the organisational policy, and says so', () => {
  const inherited = evaluateDmarc(none, txt('v=DMARC1; p=reject'), 'example.ae', s);
  assert.equal(inherited.result.status, 'pass');
  assert.match(inherited.result.summary, /^Inherited from example\.ae\. /);
});

test('SPF: strict passes, soft fail depends on DMARC, +all fails', () => {
  assert.equal(evaluateSpf(none, false, s).status, 'fail');
  assert.equal(evaluateSpf(txt('v=spf1 include:_spf.google.com -all'), false, s).status, 'pass');
  assert.equal(evaluateSpf(txt('v=spf1 include:_spf.google.com ~all'), true, s).status, 'pass');
  assert.equal(evaluateSpf(txt('v=spf1 include:_spf.google.com ~all'), false, s).status, 'warn');
  assert.equal(evaluateSpf(txt('v=spf1 +all'), true, s).status, 'fail');
  assert.equal(evaluateSpf(txt('v=spf1 include:a.example'), true, s).status, 'warn');
});

test('SPF: two records, too many lookups, and a redirect', () => {
  assert.equal(evaluateSpf(txt('v=spf1 -all', 'v=spf1 ~all'), true, s).status, 'fail');
  const many = 'v=spf1 ' + Array.from({ length: 11 }, (_, i) => `include:s${i}.example`).join(' ') + ' -all';
  const lookups = evaluateSpf(txt(many), true, s);
  assert.equal(lookups.status, 'fail');
  assert.match(lookups.summary, /11 DNS lookups/);
  const redirect = evaluateSpf(txt('v=spf1 redirect=_spf.example.net'), true, s);
  assert.equal(redirect.status, 'info');
  assert.match(redirect.summary, /_spf\.example\.net/);
  // Other TXT records on the name are ignored.
  assert.equal(evaluateSpf(txt('google-site-verification=abc', 'v=spf1 -all'), false, s).status, 'pass');
});

test('MX: none, null, a known provider, an unknown host', () => {
  const mx = (...hosts) => ({ status: 0, ad: false, answers: hosts.map((h) => answer(RR.MX, h)) });
  assert.equal(evaluateMx(none, s).receivesMail, false);
  const nullMx = evaluateMx(mx('0 .'), s);
  assert.equal(nullMx.receivesMail, false);
  assert.match(nullMx.result.summary, /Null MX/);
  const google = evaluateMx(mx('10 alt1.aspmx.l.google.com.', '1 aspmx.l.google.com.'), s);
  assert.equal(google.receivesMail, true);
  assert.match(google.result.summary, /Google Workspace/);
  assert.deepEqual(google.result.evidence, ['1 aspmx.l.google.com.', '10 alt1.aspmx.l.google.com.']);
  assert.match(evaluateMx(mx('10 mail.example.ae.'), s).result.summary, /delivered to mail\.example\.ae/);
});

test('DNSSEC follows the resolver flag', () => {
  assert.equal(evaluateDnssec({ status: 0, ad: true, answers: [] }, s).status, 'pass');
  assert.equal(evaluateDnssec({ status: 0, ad: false, answers: [] }, s).status, 'warn');
});

test('CAA: none warns, issuers are listed', () => {
  assert.equal(evaluateCaa(none, s).status, 'warn');
  const caa = { status: 0, ad: false, answers: [answer(RR.CAA, '0 issue "letsencrypt.org"'), answer(RR.CAA, '0 issuewild "digicert.com"'), answer(RR.CAA, '0 iodef "mailto:sec@example.ae"')] };
  const r = evaluateCaa(caa, s);
  assert.equal(r.status, 'pass');
  assert.match(r.summary, /letsencrypt\.org, digicert\.com/);
  assert.equal(r.evidence.length, 3);
});

test('MTA-STS: not needed without mail, published passes, absent is informational', () => {
  assert.equal(evaluateMtaSts(none, false, s).status, 'info');
  assert.equal(evaluateMtaSts(txt('v=STSv1; id=20261006T1200Z'), true, s).status, 'pass');
  assert.equal(evaluateMtaSts(none, true, s).status, 'info');
  assert.match(evaluateMtaSts(none, true, s).summary, /Not set/);
});

test('the verdict counts only scored checks and keys spoofing on DMARC and SPF', () => {
  const r = (id, status) => ({ id, status, summary: '', evidence: [] });
  const strong = verdictOf([r('dmarc', 'pass'), r('spf', 'pass'), r('mx', 'info'), r('dnssec', 'pass'), r('caa', 'warn'), r('mtasts', 'pass')], false);
  assert.deepEqual(strong, { passed: 4, scored: 5, spoofing: 'strong', incomplete: false });
  assert.equal(verdictOf([r('dmarc', 'warn'), r('spf', 'pass')], false).spoofing, 'partial');
  assert.equal(verdictOf([r('dmarc', 'fail'), r('spf', 'pass')], false).spoofing, 'weak');
  assert.equal(verdictOf([r('dmarc', 'pass'), r('spf', 'fail')], false).spoofing, 'weak');
  assert.equal(verdictOf([r('dmarc', 'info'), r('spf', 'info')], true).incomplete, true);
});
