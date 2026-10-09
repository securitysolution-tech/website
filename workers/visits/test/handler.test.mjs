// The Worker end to end: real requests through fetch(), the real migration and SQL on SQLite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { dubaiDay } from '../src/visitor.ts';
import { basic, beacon, CHROME, dashboard, makeContext, makeEnv, PASSWORD, SITE } from './helpers.mjs';

const rows = (db, table) => db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all();

async function send(request, env) {
  const ctx = makeContext();
  const response = await worker.fetch(request, env, ctx);
  await ctx.settle();
  return response;
}

// --- the beacon ---------------------------------------------------------------------------

test('a visit is counted: 204 at once, a view and an arrival after', async () => {
  const { env, db } = makeEnv();
  const response = await send(beacon({ p: '/services/offensive-testing/', r: 'lnkd.in', i: 0, c: '' }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(
    rows(db, 'views').map((r) => [r.path, r.n]),
    [['/services/offensive-testing/', 1]],
  );
  const [arrival] = rows(db, 'arrivals');
  assert.deepEqual(
    [arrival.landing, arrival.country, arrival.browser, arrival.os, arrival.device, arrival.source, arrival.n],
    ['/services/offensive-testing/', 'AE', 'chrome', 'windows', 'desktop', 'linkedin.com', 1],
  );
  assert.equal(rows(db, 'visitors').length, 1);
});

test('nothing that identifies the visitor reaches the database', async () => {
  const { env, db } = makeEnv();
  await send(
    beacon({ p: '/', r: 'github.com', i: 0, c: 'tagged' }, { headers: { 'cf-connecting-ip': '203.0.113.77' } }),
    env,
  );
  const everything = JSON.stringify(['visitors', 'views', 'arrivals', 'filtered'].map((t) => rows(db, t)));
  for (const secret of ['203.0.113.77', '203.0.113', 'Mozilla', 'AppleWebKit', 'Chrome/130']) {
    assert.ok(!everything.includes(secret), `${secret} must not be stored`);
  }
  assert.match(rows(db, 'visitors')[0].vid, /^[0-9a-f]{24}$/);
});

test('the same visitor again counts another view, not another visitor', async () => {
  const { env, db } = makeEnv();
  await send(beacon({ p: '/' }), env);
  await send(beacon({ p: '/privacy/' }), env);
  assert.deepEqual(
    rows(db, 'views').map((r) => [r.path, r.n]),
    [
      ['/', 1],
      ['/privacy/', 1],
    ],
  );
  assert.equal(rows(db, 'arrivals')[0].n, 1);
  assert.equal(rows(db, 'visitors').length, 1);
});

test('another network is another visitor', async () => {
  const { env, db } = makeEnv();
  await send(beacon({ p: '/' }), env);
  await send(beacon({ p: '/' }, { headers: { 'cf-connecting-ip': '198.51.100.9' } }), env);
  assert.equal(rows(db, 'visitors').length, 2);
  assert.equal(rows(db, 'arrivals')[0].n, 2);
});

test('an IPv6 visitor is keyed by the /64, so one subscriber is one visitor', async () => {
  const { env, db } = makeEnv();
  await send(beacon({ p: '/' }, { headers: { 'cf-connecting-ip': '2001:db8:1:2:aaaa::1' } }), env);
  await send(beacon({ p: '/' }, { headers: { 'cf-connecting-ip': '2001:db8:1:2:bbbb::9' } }), env);
  assert.equal(rows(db, 'visitors').length, 1);
});

test('sendBeacon posts a string as text/plain, which is accepted', async () => {
  const { env, db } = makeEnv();
  const response = await send(
    beacon(JSON.stringify({ p: '/' }), { headers: { 'content-type': 'text/plain;charset=UTF-8' } }),
    env,
  );
  assert.equal(response.status, 204);
  assert.equal(rows(db, 'views').length, 1);
});

test('the country comes from Cloudflare, with a safe fallback', async () => {
  const { env, db } = makeEnv();
  await send(beacon({ p: '/' }, { cf: { country: 'SA' } }), env);
  await send(beacon({ p: '/' }, { cf: { country: undefined }, headers: { 'cf-connecting-ip': '198.51.100.1' } }), env);
  await send(beacon({ p: '/' }, { cf: { country: '<x>' }, headers: { 'cf-connecting-ip': '198.51.100.2' } }), env);
  assert.deepEqual(
    rows(db, 'arrivals').map((r) => [r.country, r.n]),
    [
      ['SA', 1],
      ['XX', 2],
    ],
  );
});

test('only the site itself may post', async () => {
  const { env, db } = makeEnv();
  assert.equal((await send(beacon({ p: '/' }, { headers: { origin: 'https://evil.example' } }), env)).status, 403);
  assert.equal((await send(beacon({ p: '/' }, { headers: { 'sec-fetch-site': 'cross-site' } }), env)).status, 403);
  assert.equal(
    (await send(beacon({ p: '/' }, { headers: { origin: SITE, 'sec-fetch-site': 'same-site' } }), env)).status,
    403,
  );
  // No Origin at all is accepted only when the browser says same-origin.
  assert.equal((await send(beacon({ p: '/' }, { headers: { origin: '' } }), env)).status, 403);
  assert.equal(
    (await send(beacon({ p: '/' }, { headers: { origin: '', 'sec-fetch-site': 'same-origin' } }), env)).status,
    204,
  );
  assert.equal(rows(db, 'views').length, 1);
});

test('other methods are refused', async () => {
  const { env } = makeEnv();
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const request = new Request(`${SITE}/api/hit`, { method, headers: { origin: SITE } });
    const response = await send(request, env);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('allow'), 'POST');
  }
});

test('crawlers and scripts are ignored and counted by reason', async () => {
  const { env, db } = makeEnv();
  const googlebot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  assert.equal((await send(beacon({ p: '/' }, { headers: { 'user-agent': googlebot } }), env)).status, 204);
  assert.equal((await send(beacon({ p: '/' }, { headers: { 'user-agent': 'curl/8.5.0' } }), env)).status, 204);
  assert.deepEqual(rows(db, 'views'), []);
  assert.deepEqual(rows(db, 'visitors'), []);
  assert.deepEqual(
    rows(db, 'filtered').map((r) => [r.reason, r.n]),
    [['bot', 2]],
  );
});

test('hosting networks are ignored and counted by reason', async () => {
  const { env, db } = makeEnv();
  assert.equal((await send(beacon({ p: '/' }, { cf: { asn: 16509 } }), env)).status, 204);
  assert.deepEqual(rows(db, 'views'), []);
  assert.deepEqual(
    rows(db, 'filtered').map((r) => [r.reason, r.n]),
    [['hosting', 1]],
  );
});

test('Do Not Track and Global Privacy Control are honoured, and leave no trace at all', async () => {
  const { env, db } = makeEnv();
  assert.equal((await send(beacon({ p: '/' }, { headers: { dnt: '1' } }), env)).status, 204);
  assert.equal((await send(beacon({ p: '/' }, { headers: { 'sec-gpc': '1' } }), env)).status, 204);
  for (const table of ['visitors', 'views', 'arrivals', 'filtered']) assert.deepEqual(rows(db, table), [], table);
});

test('the kill switch and a missing secret make the beacon a silent no-op', async () => {
  for (const overrides of [{ VISITS_ENABLED: 'false' }, { SALT_SECRET: '' }]) {
    const { env, db } = makeEnv(overrides);
    assert.equal((await send(beacon({ p: '/' }), env)).status, 204);
    assert.deepEqual(rows(db, 'views'), []);
  }
  // ...but a stranger still gets 403, so the switch is not an oracle.
  const { env } = makeEnv({ VISITS_ENABLED: 'false' });
  assert.equal((await send(beacon({ p: '/' }, { headers: { origin: 'https://evil.example' } }), env)).status, 403);
});

test('too many requests from one network get 429 and are not counted', async () => {
  const { env, db, limiter } = makeEnv();
  env.PER_IP = limiter(false);
  const response = await send(beacon({ p: '/' }), env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.deepEqual(rows(db, 'views'), []);
  const second = makeEnv();
  second.env.GLOBAL = second.limiter(false);
  assert.equal((await send(beacon({ p: '/' }), second.env)).status, 429);
});

test('malformed requests are refused with the right status', async () => {
  const { env } = makeEnv();
  const type = { 'content-type': 'text/html' };
  assert.equal((await send(beacon({ p: '/' }, { headers: type }), env)).status, 415);
  assert.equal((await send(beacon({ p: '/' }, { headers: { 'content-length': '5000' } }), env)).status, 413);
  assert.equal((await send(beacon({ p: 'x'.repeat(2000) }), env)).status, 413);
  assert.equal((await send(beacon('not json'), env)).status, 400);
  assert.equal((await send(beacon({}), env)).status, 400);
  assert.equal((await send(beacon('[1,2]'), env)).status, 400);
});

test('an unknown page is counted as "other", not as the path sent', async () => {
  const { env, db } = makeEnv();
  await send(beacon({ p: '/wp-login.php' }), env);
  assert.deepEqual(
    rows(db, 'views').map((r) => r.path),
    ['other'],
  );
});

test('a database failure never reaches the visitor', async () => {
  const broken = {
    prepare() {
      throw new Error('D1 is down');
    },
    batch: async () => {
      throw new Error('D1 is down');
    },
  };
  const { env } = makeEnv({ DB: broken });
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    assert.equal((await send(beacon({ p: '/' }), env)).status, 204);
    assert.equal((await send(beacon({ p: '/' }, { headers: { 'user-agent': 'curl/8.5.0' } }), env)).status, 204);
  } finally {
    console.log = original;
  }
  assert.ok(lines.some((l) => l.includes('count_failed')));
  assert.ok(lines.some((l) => l.includes('tally_failed')));
});

// --- the dashboard -----------------------------------------------------------------------

test('the dashboard asks for a password and does not count a first, credential-less request', async () => {
  const { env, limiter } = makeEnv();
  let attempts = 0;
  env.AUTH = { limit: async () => (attempts++, { success: true }) };
  const response = await send(dashboard(), env);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /^Basic realm="[^"]+", charset="UTF-8"$/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(attempts, 0);
  void limiter;
});

test('a wrong password is refused and counts against the limit; too many get 429', async () => {
  const { env, limiter } = makeEnv();
  let attempts = 0;
  env.AUTH = { limit: async () => (attempts++, { success: true }) };
  const wrong = await send(dashboard('', { authorization: basic('visits', 'nope') }), env);
  assert.equal(wrong.status, 401);
  assert.equal(attempts, 1);

  env.AUTH = limiter(false);
  const locked = await send(dashboard('', { authorization: basic('visits', 'nope') }), env);
  assert.equal(locked.status, 429);
  // The right password still works for the owner while a stranger is locked out.
  const right = await send(dashboard('', { authorization: basic('visits', PASSWORD) }), env);
  assert.equal(right.status, 200);
});

test('the dashboard shows what was counted, under a policy that forbids scripts', async () => {
  const { env } = makeEnv();
  await send(beacon({ p: '/', r: 'lnkd.in' }), env);
  await send(beacon({ p: '/privacy/' }), env);
  const response = await send(dashboard('?days=7', { authorization: basic('visits', PASSWORD) }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(response.headers.get('content-security-policy'), /script-src/);
  const html = await response.text();
  assert.match(html, /<dt>Visitors<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Page views<\/dt><dd>2<\/dd>/);
  assert.match(html, /linkedin\.com/);
  assert.match(html, /aria-current="page">7 days</);
});

test('the range falls back to 30 days, and JSON is available', async () => {
  const { env } = makeEnv();
  await send(beacon({ p: '/' }), env);
  const auth = { authorization: basic('visits', PASSWORD) };
  const html = await (await send(dashboard('?days=999', auth), env)).text();
  assert.match(html, /aria-current="page">30 days</);
  const json = await send(dashboard('?days=7&format=json', auth), env);
  assert.match(json.headers.get('content-type'), /^application\/json/);
  const body = await json.json();
  assert.deepEqual(body.totals, { views: 1, visitors: 1 });
  assert.equal(body.days.length, 7);
  assert.equal(body.days.at(-1).day, dubaiDay(new Date()));
});

test('the dashboard takes GET only, and a database failure gives a plain message', async () => {
  const { env } = makeEnv();
  const post = new Request(`${SITE}/api/visits`, {
    method: 'POST',
    headers: { authorization: basic('visits', PASSWORD) },
  });
  assert.equal((await send(post, env)).status, 405);

  const broken = makeEnv({
    DB: {
      prepare() {
        throw new Error('D1 is down');
      },
      batch: async () => {
        throw new Error('D1 is down');
      },
    },
  });
  const original = console.log;
  console.log = () => {};
  try {
    const response = await send(dashboard('', { authorization: basic('visits', PASSWORD) }), broken.env);
    assert.equal(response.status, 500);
    assert.match(await response.text(), /could not be read/);
  } finally {
    console.log = original;
  }
});

test('unknown paths are 404, and a trailing slash still reaches the endpoint', async () => {
  const { env } = makeEnv();
  assert.equal((await send(new Request(`${SITE}/api/other`), env)).status, 404);
  assert.equal((await send(new Request(`${SITE}/api/hitting`), env)).status, 404);
  const request = new Request(`${SITE}/api/hit/`, {
    method: 'POST',
    headers: { origin: SITE, 'content-type': 'application/json', 'user-agent': CHROME },
    body: '{"p":"/"}',
  });
  request.cf = { country: 'AE', asn: 5384 };
  assert.equal((await send(request, env)).status, 204);
});

// --- the daily run -----------------------------------------------------------------------

test('the scheduled run deletes yesterday’s hashes and keeps today’s', async () => {
  const { env, db } = makeEnv();
  const today = dubaiDay(new Date());
  db.sqlite.prepare('INSERT INTO visitors (day, vid) VALUES (?, ?)').run('2000-01-01', 'old');
  db.sqlite.prepare('INSERT INTO visitors (day, vid) VALUES (?, ?)').run(today, 'new');
  db.sqlite.prepare('INSERT INTO views (day, path, n) VALUES (?, ?, 1)').run('2000-01-01', '/');
  const ctx = makeContext();
  await worker.scheduled({}, env, ctx);
  await ctx.settle();
  assert.deepEqual(
    rows(db, 'visitors').map((r) => r.vid),
    ['new'],
  );
  assert.deepEqual(rows(db, 'views'), []);
});

test('the stylesheet is served from the Worker, and the dashboard policy allows only same-origin styles', async () => {
  const { env } = makeEnv();
  const css = await send(new Request(`${SITE}/api/visits/style.css`), env);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /^text\/css/);
  assert.equal(css.headers.get('cache-control'), 'public, max-age=86400');
  assert.match(await css.text(), /\.kpi/);
  assert.equal((await send(new Request(`${SITE}/api/visits/style.css`, { method: 'POST' }), env)).status, 405);
  await send(beacon({ p: '/' }), env);
  const page = await send(dashboard('', { authorization: basic('visits', PASSWORD) }), env);
  assert.match(page.headers.get('content-security-policy'), /style-src 'self'/);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /unsafe-inline/);
  assert.match(await page.text(), /vs the previous 30 days|counted once a day/);
});
