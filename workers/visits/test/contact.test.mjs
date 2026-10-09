// The contact log on the dashboard: what the contact Worker kept, read back, shown safely, kept
// out of the JSON, and cleaned up on time without ever blocking the visitor-hash clean-up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { contact, purgeContact, REQUEST_RETENTION_DAYS, RETENTION_DAYS } from '../src/store.ts';
import { renderDashboard, renderJson } from '../src/render.ts';
import { daysBefore, dubaiDay } from '../src/visitor.ts';
import { basic, dashboard, makeContext, makeEnv, openDb, PASSWORD } from './helpers.mjs';

const NOW = new Date('2026-10-09T17:20:00Z');

/** A row as the contact Worker writes it. */
function keep(db, over = {}) {
  const row = {
    id: crypto.randomUUID(),
    received_at: '2026-10-09T17:14:00.000Z',
    day: '2026-10-09',
    name: 'Layla Haddad',
    email: 'layla@example.ae',
    company: 'Example LLC',
    needs: JSON.stringify(['Penetration testing', 'Security monitoring']),
    timeline: 'Within a month',
    message: 'Two web apps.\nStaging first.',
    page: '/services/offensive-testing/',
    delivery: 'sent',
    detail: '<m1@securitysolution.tech>',
    ...over,
  };
  db.sqlite
    .prepare(
      'INSERT INTO requests (id, received_at, day, name, email, company, needs, timeline, message, page, delivery, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      row.id,
      row.received_at,
      row.day,
      row.name,
      row.email,
      row.company,
      row.needs,
      row.timeline,
      row.message,
      row.page,
      row.delivery,
      row.detail,
    );
}
const refuse = (db, day, reason, n) =>
  db.sqlite.prepare('INSERT INTO attempts (day, reason, n) VALUES (?, ?, ?)').run(day, reason, n);

const emptyReport = {
  since: '2026-10-03',
  until: '2026-10-09',
  totals: { views: 0, visitors: 0 },
  days: [{ day: '2026-10-09', views: 0, visitors: 0 }],
  pages: [],
  landings: [],
  sources: [],
  countries: [],
  devices: [],
  browsers: [],
  systems: [],
  filtered: [],
};
const lead = (over = {}) => ({
  receivedAt: '2026-10-09T17:14:00.000Z',
  name: 'Layla Haddad',
  email: 'layla@example.ae',
  company: 'Example LLC',
  needs: ['Penetration testing', 'Security monitoring'],
  timeline: 'Within a month',
  message: 'Two web apps.\nStaging first.',
  page: '/services/offensive-testing/',
  delivery: 'sent',
  detail: '<m1@securitysolution.tech>',
  ...over,
});

// --- reading -----------------------------------------------------------------------------

test('the log lists the requests in the range, newest first, with their needs', async () => {
  const db = openDb();
  keep(db, { name: 'Earlier', received_at: '2026-10-08T09:00:00.000Z', day: '2026-10-08' });
  keep(db, { name: 'Later' });
  keep(db, { name: 'Outside', received_at: '2026-09-01T09:00:00.000Z', day: '2026-09-01' });
  const log = await contact(db, '2026-10-03', '2026-10-09');
  assert.deepEqual(
    log.requests.map((r) => r.name),
    ['Later', 'Earlier'],
  );
  assert.deepEqual(log.requests[0].needs, ['Penetration testing', 'Security monitoring']);
  assert.equal(log.requests[0].delivery, 'sent');
});

test('refused attempts are summed by reason over the range', async () => {
  const db = openDb();
  refuse(db, '2026-10-08', 'invalid', 2);
  refuse(db, '2026-10-09', 'invalid', 1);
  refuse(db, '2026-10-09', 'spam', 4);
  refuse(db, '2026-01-01', 'spam', 50);
  const log = await contact(db, '2026-10-03', '2026-10-09');
  assert.deepEqual(log.refused, [
    { key: 'spam', n: 4 },
    { key: 'invalid', n: 3 },
  ]);
});

test('a malformed needs value reads as no needs, not as an error', async () => {
  const db = openDb();
  keep(db, { needs: 'not json' });
  const log = await contact(db, '2026-10-09', '2026-10-09');
  assert.deepEqual(log.requests[0].needs, []);
});

// --- cleaning up -------------------------------------------------------------------------

test('requests go after 180 days and refused counts after the retention; the rest stays', async () => {
  const db = openDb();
  const today = '2026-10-09';
  keep(db, { name: 'Old', day: daysBefore(today, REQUEST_RETENTION_DAYS + 1) });
  keep(db, { name: 'Edge', day: daysBefore(today, REQUEST_RETENTION_DAYS) });
  keep(db, { name: 'New', day: today });
  refuse(db, daysBefore(today, RETENTION_DAYS + 1), 'spam', 1);
  refuse(db, today, 'spam', 1);
  await purgeContact(db, today);
  assert.deepEqual(
    db.sqlite
      .prepare('SELECT name FROM requests ORDER BY name')
      .all()
      .map((r) => r.name),
    ['Edge', 'New'],
  );
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 1);
});

test('the nightly run deletes visitor hashes even when the contact log is missing', async () => {
  const { env, db } = makeEnv();
  db.sqlite.exec('DROP TABLE requests');
  db.sqlite.prepare('INSERT INTO visitors (day, vid) VALUES (?, ?)').run('2000-01-01', 'old');
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const ctx = makeContext();
    await worker.scheduled({}, env, ctx);
    await ctx.settle();
  } finally {
    console.log = original;
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 0);
  assert.ok(lines.some((l) => l.includes('purge_contact_failed')));
});

// --- showing -----------------------------------------------------------------------------

test('each request shows who, how to reply, when, what they need, and what happened to the email', () => {
  const html = renderDashboard(emptyReport, 7, NOW, undefined, {
    requests: [lead(), lead({ name: 'Omar', company: '', delivery: 'failed', detail: 'E_SENDER_NOT_VERIFIED' })],
    refused: [
      { key: 'invalid', n: 2 },
      { key: 'spam', n: 1 },
    ],
  });
  assert.match(html, /<h2>Contact requests<\/h2>/);
  assert.match(html, /<strong>Layla Haddad<\/strong><span class="lead-company">Example LLC<\/span>/);
  assert.match(html, /<a href="mailto:layla@example\.ae">layla@example\.ae<\/a>/);
  assert.match(html, /Fri,? 9 Oct,? 21:14/); // 17:14 UTC is 21:14 in Dubai, on a Friday
  assert.match(html, /<span>Penetration testing, Security monitoring<\/span><span>Within a month<\/span>/);
  assert.match(html, /<span class="status ok">Email sent<\/span>/);
  assert.match(html, /<span class="status bad">Email failed \(E_SENDER_NOT_VERIFIED\)<\/span>/);
  assert.match(html, /<p class="lead-message">Two web apps\.\nStaging first\.<\/p>/);
  assert.match(html, /Also refused: 2 with details that failed the checks, 1 flagged as automated\./);
  assert.match(html, /<dt>Contact requests<\/dt><dd>2<\/dd><small>1 emailed<\/small>/);
});

test("a visitor's words cannot break the page or add anything to it", () => {
  const hostile = '<script>alert(1)</script>"><img src=x onerror=alert(1)>';
  const html = renderDashboard(emptyReport, 7, NOW, undefined, {
    requests: [
      lead({ name: hostile, company: hostile, message: hostile, page: hostile, email: 'a"onmouseover="x@y.z' }),
    ],
    refused: [],
  });
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&#60;script&#62;alert\(1\)&#60;\/script&#62;/);
  assert.match(html, /href="mailto:a&#34;onmouseover=&#34;x@y\.z"/);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
});

test('with no requests the log says so, and when it cannot be read it says that', () => {
  const none = renderDashboard(emptyReport, 7, NOW, undefined, { requests: [], refused: [] });
  assert.match(none, /No requests in this period\./);
  assert.match(none, /<dt>Contact requests<\/dt><dd>0<\/dd><small>none in this period<\/small>/);
  const broken = renderDashboard(emptyReport, 7, NOW, undefined, null);
  assert.match(broken, /could not be read just now, or is not set up yet/);
  assert.match(broken, /<small>log unavailable<\/small>/);
});

test('the JSON gives the log as counts, never names, addresses or messages', () => {
  const body = renderJson(emptyReport, NOW, {
    requests: [lead(), lead({ delivery: 'failed' })],
    refused: [{ key: 'spam', n: 3 }],
  });
  assert.deepEqual(JSON.parse(body).contact, { requests: 2, emailed: 1, refused: [{ key: 'spam', n: 3 }] });
  for (const secret of ['Layla', 'layla@example.ae', 'Two web apps', 'Example LLC']) {
    assert.ok(!body.includes(secret), `${secret} must not be in the JSON`);
  }
});

// --- end to end --------------------------------------------------------------------------

test('the dashboard shows what the contact Worker kept, and the counts survive a broken log', async () => {
  const auth = { authorization: basic('visits', PASSWORD) };
  const { env, db } = makeEnv();
  keep(db, { day: dubaiDay(new Date()), received_at: new Date().toISOString() });
  const ctx = makeContext();
  const html = await (await worker.fetch(dashboard('?days=7', auth), env, ctx)).text();
  assert.match(html, /<strong>Layla Haddad<\/strong>/);
  const json = await (await worker.fetch(dashboard('?days=7&format=json', auth), env, ctx)).json();
  assert.equal(json.contact.requests, 1);
  assert.ok(!JSON.stringify(json).includes('Layla'));

  db.sqlite.exec('DROP TABLE requests');
  const original = console.log;
  console.log = () => {};
  try {
    const page = await worker.fetch(dashboard('?days=7', auth), env, ctx);
    assert.equal(page.status, 200);
    const text = await page.text();
    assert.match(text, /<dt>Visitors<\/dt>/);
    assert.match(text, /could not be read just now/);
  } finally {
    console.log = original;
  }
});
