// Checks the live counter from outside. Every request here is refused or read-only, so none adds a
// visit, with one exception: --count sends one real-looking visit, which then shows on the dashboard.
//
//   npm run e2e -- https://securitysolution.tech
//   VISITS_PASSWORD=... npm run e2e -- https://securitysolution.tech --count
//
// The Cloudflare rate-limiting rule on /api/contact does not cover these paths, but the Worker limits
// a network to 20 beacons and 5 failed sign-ins a minute, so a run stays well inside both.
const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? 'https://securitysolution.tech').replace(/\/$/, '');
const origin = args.includes('--origin') ? args[args.indexOf('--origin') + 1] : new URL(base).origin;
const count = args.includes('--count');
const password = process.env.VISITS_PASSWORD;
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

let failures = 0;
const check = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `: ${detail}`}`);
  if (!pass) failures++;
};
const post = (body, headers = {}) =>
  fetch(`${base}/api/hit`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'user-agent': CHROME, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

let r = await fetch(`${base}/api/hit`);
check('beacon: GET refused', r.status === 405 && r.headers.get('allow') === 'POST', `status ${r.status}`);
check('beacon: not cached', /no-store/.test(r.headers.get('cache-control') ?? ''));

r = await post({ p: '/' }, { origin: 'https://evil.example' });
check('beacon: another origin refused', r.status === 403, `status ${r.status}`);

r = await post({ p: '/' }, { 'content-type': 'text/html' });
check('beacon: wrong content type refused', r.status === 415, `status ${r.status}`);

r = await post('not json');
check('beacon: malformed body rejected', r.status === 400, `status ${r.status}`);

r = await post({});
check('beacon: a body that is not a beacon rejected', r.status === 400, `status ${r.status}`);

r = await post({ p: '/' }, { 'user-agent': 'curl/8.5.0' });
check('beacon: a script is told nothing and not counted', r.status === 204, `status ${r.status}`);

r = await post({ p: '/' }, { dnt: '1' });
check('beacon: Do Not Track is honoured', r.status === 204, `status ${r.status}`);

r = await fetch(`${base}/api/visits`);
check(
  'dashboard: asks for a password',
  r.status === 401 && /^Basic /i.test(r.headers.get('www-authenticate') ?? ''),
  `status ${r.status}`,
);
check(
  'dashboard: not cached or indexed',
  /no-store/.test(r.headers.get('cache-control') ?? '') && /noindex/.test(r.headers.get('x-robots-tag') ?? ''),
);

r = await fetch(`${base}/api/visits`, { headers: { authorization: basic('visits', 'not-the-password') } });
check('dashboard: a wrong password is refused', r.status === 401, `status ${r.status}`);

if (password) {
  r = await fetch(`${base}/api/visits?days=7&format=json`, { headers: { authorization: basic('visits', password) } });
  const before = r.status === 200 ? await r.json() : null;
  check('dashboard: the password opens it (JSON)', Boolean(before?.totals), `status ${r.status}`);

  if (count) {
    r = await post({ p: '/', r: '', i: 0, c: 'e2e-test' });
    check('beacon: a visit is accepted', r.status === 204, `status ${r.status}`);
    await new Promise((done) => setTimeout(done, 3000));
    r = await fetch(`${base}/api/visits?days=7&format=json`, { headers: { authorization: basic('visits', password) } });
    const after = await r.json();
    check(
      'dashboard: the visit shows up',
      after.totals.views >= (before?.totals.views ?? 0) + 1 && after.sources.some((s) => s.key === 'e2e-test'),
      `views ${before?.totals.views} to ${after.totals.views}`,
    );
  }

  r = await fetch(`${base}/api/visits?days=30`, { headers: { authorization: basic('visits', password) } });
  const html = await r.text();
  check(
    'dashboard: the page renders with no script',
    r.status === 200 && /<title>Visits/.test(html) && !/<script/i.test(html),
  );
  check(
    'dashboard: sent under a policy that forbids scripts',
    /default-src 'none'/.test(r.headers.get('content-security-policy') ?? ''),
  );
} else {
  console.log('SKIP  dashboard sign-in checks: set VISITS_PASSWORD to run them');
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
