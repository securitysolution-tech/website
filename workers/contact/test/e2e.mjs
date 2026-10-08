#!/usr/bin/env node
// Checks the contact Worker's contract from outside, the way the posture check does daily.
//
//   node test/e2e.mjs https://securitysolution.tech
//   node test/e2e.mjs http://127.0.0.1:8787 --origin http://localhost:4321 --send
//
// No email is sent unless --send is given. The Worker allows three requests a minute per
// network, so the last request is expected to be rate-limited; that check is advisory
// because the counters are approximate.
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('usage: node test/e2e.mjs <worker origin> [--origin <site origin>] [--send]');
  process.exit(2);
}
const site = args.includes('--origin') ? args[args.indexOf('--origin') + 1] : new URL(target).origin;
const send = args.includes('--send');
const url = new URL('/api/contact', target);

const good = {
  name: 'Zoë O’Brien',
  email: 'zoe@example.ae',
  company: 'example.ae',
  needs: ['Penetration testing'],
  when: 'Within a month',
  message: 'Sent by workers/contact/test/e2e.mjs. Please ignore.',
  website: '',
  elapsed: 42_000,
  page: '/',
};
const json = (value) => JSON.stringify(value);
const post = (body, headers = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: site, ...headers }, body });

const probe = await fetch(url);
if (probe.status === 404 && !(probe.headers.get('content-type') ?? '').includes('json')) {
  console.error(`${url} answers 404 without JSON: the Worker is not deployed on this route.`);
  process.exit(1);
}

// [name, request, expected status, optional check on the JSON body, advisory?]
const cases = [
  ['GET is refused', () => fetch(url), 405],
  ['another Origin is refused', () => post(json(good), { origin: 'https://evil.example' }), 403],
  [
    'a missing Origin is refused',
    () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json(good) }),
    403,
  ],
  ['text/plain is refused', () => post(json(good), { 'content-type': 'text/plain' }), 415],
  ['an oversized body is refused', () => post(json({ ...good, message: 'x'.repeat(9000) })), 413],
];
// The remaining requests count against the per-network limit of three a minute.
if (send) cases.push(['a real request is accepted (check the inbox)', () => post(json(good)), 202]);
cases.push(
  ['broken JSON is refused', () => post('{'), 400],
  [
    'an empty request names the missing fields',
    () => post(json({})),
    400,
    (d) => d.fields?.name === 'required' && d.fields?.email === 'required',
  ],
);
if (!send)
  cases.push([
    'a filled honeypot is accepted and dropped',
    () => post(json({ ...good, website: 'https://spam.example' })),
    202,
  ]);
cases.push(['the fourth request in a minute is rate-limited', () => post(json({})), 429, undefined, true]);

let failed = 0;
for (const [name, run, expected, check, advisory] of cases) {
  let line;
  try {
    const response = await run();
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    const noStore = (response.headers.get('cache-control') ?? '').includes('no-store');
    const isJson = (response.headers.get('content-type') ?? '').startsWith('application/json');
    const ok = response.status === expected && noStore && isJson && (!check || check(data ?? {}));
    const detail = [
      `got ${response.status}`,
      noStore ? '' : 'no cache-control: no-store',
      isJson ? '' : 'not JSON',
      check && !check(data ?? {}) ? 'body check failed' : '',
    ]
      .filter(Boolean)
      .join(', ');
    line = `${ok ? 'PASS' : advisory ? 'WARN' : 'FAIL'}  ${name} (expected ${expected}, ${detail})`;
    if (!ok && !advisory) failed++;
  } catch (error) {
    line = `FAIL  ${name}: ${error.message}`;
    failed++;
  }
  console.log(line);
}
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
