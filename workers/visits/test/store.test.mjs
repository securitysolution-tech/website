import { test } from 'node:test';
import assert from 'node:assert/strict';
import { count, countFiltered, daysBetween, purge, report, RETENTION_DAYS } from '../src/store.ts';
import { daysBefore } from '../src/visitor.ts';
import { openDb } from './helpers.mjs';

const arrival = { country: 'AE', browser: 'chrome', os: 'windows', device: 'desktop', source: 'direct' };
const all = (db, table) => db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all();

test("a visitor's first view of the day is fresh, the rest of that day are not", async () => {
  const db = openDb();
  assert.equal(await count(db, '2026-10-09', 'v1', '/', arrival), true);
  assert.equal(await count(db, '2026-10-09', 'v1', '/privacy/', arrival), false);
  assert.equal(await count(db, '2026-10-09', 'v2', '/', arrival), true);
  // The same id on another day is a new visit: ids are per day.
  assert.equal(await count(db, '2026-10-10', 'v1', '/', arrival), true);
});

test('views count every page, arrivals count each visitor once a day with what the request said', async () => {
  const db = openDb();
  await count(db, '2026-10-09', 'v1', '/', arrival);
  await count(db, '2026-10-09', 'v1', '/privacy/', arrival);
  await count(db, '2026-10-09', 'v2', '/', { ...arrival, country: 'SA', source: 'linkedin.com' });
  assert.deepEqual(
    all(db, 'views').map((r) => [r.path, r.n]),
    [
      ['/', 2],
      ['/privacy/', 1],
    ],
  );
  assert.deepEqual(
    all(db, 'arrivals').map((r) => [r.country, r.source, r.landing, r.n]),
    [
      ['AE', 'direct', '/', 1],
      ['SA', 'linkedin.com', '/', 1],
    ],
  );
});

test('two visitors with the same attributes share one arrivals row', async () => {
  const db = openDb();
  await count(db, '2026-10-09', 'v1', '/', arrival);
  await count(db, '2026-10-09', 'v2', '/', arrival);
  assert.deepEqual(
    all(db, 'arrivals').map((r) => r.n),
    [2],
  );
});

test('requests that were not people are counted by reason only', async () => {
  const db = openDb();
  await countFiltered(db, '2026-10-09', 'bot');
  await countFiltered(db, '2026-10-09', 'bot');
  await countFiltered(db, '2026-10-09', 'hosting');
  assert.deepEqual(
    all(db, 'filtered').map((r) => [r.reason, r.n]),
    [
      ['bot', 2],
      ['hosting', 1],
    ],
  );
});

test('days between two days are inclusive and in order', () => {
  assert.deepEqual(daysBetween('2026-10-08', '2026-10-10'), ['2026-10-08', '2026-10-09', '2026-10-10']);
  assert.deepEqual(daysBetween('2026-10-09', '2026-10-09'), ['2026-10-09']);
  assert.deepEqual(daysBetween('2026-12-30', '2027-01-01'), ['2026-12-30', '2026-12-31', '2027-01-01']);
});

test('a report sums the range, fills quiet days with zero and ranks by count', async () => {
  const db = openDb();
  await count(db, '2026-10-07', 'a', '/', arrival);
  await count(db, '2026-10-09', 'b', '/', { ...arrival, country: 'SA', device: 'mobile', source: 'linkedin.com' });
  await count(db, '2026-10-09', 'b', '/services/offensive-testing/', arrival);
  await count(db, '2026-10-09', 'c', '/', { ...arrival, country: 'SA', device: 'mobile', source: 'linkedin.com' });
  await countFiltered(db, '2026-10-09', 'bot');
  // Outside the range: not counted.
  await count(db, '2026-09-01', 'z', '/', arrival);

  const r = await report(db, '2026-10-07', '2026-10-09');
  assert.deepEqual(r.totals, { views: 4, visitors: 3 });
  assert.deepEqual(r.days, [
    { day: '2026-10-07', views: 1, visitors: 1 },
    { day: '2026-10-08', views: 0, visitors: 0 },
    { day: '2026-10-09', views: 3, visitors: 2 },
  ]);
  assert.deepEqual(r.pages, [
    { key: '/', n: 3 },
    { key: '/services/offensive-testing/', n: 1 },
  ]);
  assert.deepEqual(r.countries, [
    { key: 'SA', n: 2 },
    { key: 'AE', n: 1 },
  ]);
  assert.deepEqual(r.sources, [
    { key: 'linkedin.com', n: 2 },
    { key: 'direct', n: 1 },
  ]);
  assert.deepEqual(r.devices, [
    { key: 'mobile', n: 2 },
    { key: 'desktop', n: 1 },
  ]);
  assert.deepEqual(r.filtered, [{ key: 'bot', n: 1 }]);
});

test('an empty database reports zeroes, not errors', async () => {
  const r = await report(openDb(), '2026-10-01', '2026-10-03');
  assert.deepEqual(r.totals, { views: 0, visitors: 0 });
  assert.equal(r.days.length, 3);
  assert.deepEqual(r.pages, []);
});

test('the daily clean-up deletes old visitor hashes and totals past the retention, and nothing else', async () => {
  const db = openDb();
  const today = '2026-10-09';
  const old = daysBefore(today, RETENTION_DAYS + 1);
  const edge = daysBefore(today, RETENTION_DAYS);
  await count(db, old, 'old', '/', arrival);
  await count(db, edge, 'edge', '/', arrival);
  await count(db, daysBefore(today, 1), 'yesterday', '/', arrival);
  await count(db, today, 'today', '/', arrival);
  await countFiltered(db, old, 'bot');

  await purge(db, today);

  assert.deepEqual(
    all(db, 'visitors').map((r) => r.vid),
    ['today'],
    'only today’s hashes survive',
  );
  assert.deepEqual(
    all(db, 'views').map((r) => r.day),
    [edge, daysBefore(today, 1), today].sort(),
  );
  assert.deepEqual(all(db, 'filtered'), []);
});
