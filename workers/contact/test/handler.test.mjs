// The Worker end to end: real requests through fetch(), the real schema on SQLite, a stand-in
// email service. What matters most: a request is kept even when its email fails, and an attempt
// that is refused leaves a count, never a copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { dubaiDay } from '../src/store.ts';
import { brokenDb, good, makeContext, makeEmail, makeEnv, post } from './helpers.mjs';

const rows = (db, table) => db.sqlite.prepare(`SELECT * FROM ${table}`).all();

async function send(request, env) {
  const ctx = makeContext();
  const response = await worker.fetch(request, env, ctx);
  await ctx.settle();
  return response;
}

test('a request is kept, emailed, and marked sent with the message id', async () => {
  const { env, db, email } = makeEnv();
  const response = await send(post(), env);
  assert.equal(response.status, 202);
  assert.equal(email.sent.length, 1);
  const [kept] = rows(db, 'requests');
  assert.equal(kept.name, 'Zoë O’Brien');
  assert.equal(kept.email, 'zoe@example.ae');
  assert.equal(kept.company, 'example.ae');
  assert.deepEqual(JSON.parse(kept.needs), good().needs);
  assert.equal(kept.timeline, good().when);
  assert.equal(kept.message, 'Two web apps and an API.\nStaging first.');
  assert.equal(kept.page, '/services/offensive-testing/');
  assert.equal(kept.day, dubaiDay(new Date(kept.received_at)));
  assert.equal(kept.delivery, 'sent');
  assert.equal(kept.detail, '<msg-1@securitysolution.tech>');
  assert.deepEqual(rows(db, 'attempts'), []);
});

test('when the email fails, the request is still kept, marked failed with the code', async () => {
  const { env, db } = makeEnv({ EMAIL: makeEmail('E_SENDER_NOT_VERIFIED') });
  const response = await send(post(), env);
  assert.equal(response.status, 502);
  const [kept] = rows(db, 'requests');
  assert.equal(kept.name, 'Zoë O’Brien');
  assert.equal(kept.delivery, 'failed');
  assert.equal(kept.detail, 'E_SENDER_NOT_VERIFIED');
});

test('over the email quota, the request is kept and marked as such', async () => {
  const { env, db } = makeEnv({ EMAIL: makeEmail('E_DAILY_LIMIT_EXCEEDED') });
  assert.equal((await send(post(), env)).status, 503);
  assert.equal(rows(db, 'requests')[0].delivery, 'quota');
});

test('details that fail the checks are counted, not kept, and nothing is emailed', async () => {
  const { env, db, email } = makeEnv();
  assert.equal((await send(post({ ...good(), email: 'not-an-address' }), env)).status, 400);
  assert.equal((await send(post('not json'), env)).status, 400);
  assert.deepEqual(rows(db, 'requests'), []);
  assert.deepEqual(
    rows(db, 'attempts').map((r) => [r.reason, r.n]),
    [['invalid', 2]],
  );
  assert.equal(email.sent.length, 0);
});

test("a script's submission is counted as spam, answered 202, and neither kept nor emailed", async () => {
  const { env, db, email } = makeEnv();
  const response = await send(post({ ...good(), website: 'https://spam.example' }), env);
  assert.equal(response.status, 202);
  assert.deepEqual(rows(db, 'requests'), []);
  assert.deepEqual(
    rows(db, 'attempts').map((r) => [r.reason, r.n]),
    [['spam', 1]],
  );
  assert.equal(email.sent.length, 0);
});

test('too many from one network is refused without writing anything', async () => {
  const { env, db, limiter } = makeEnv();
  env.PER_IP = limiter(false);
  assert.equal((await send(post(), env)).status, 429);
  assert.deepEqual(rows(db, 'requests'), []);
  assert.deepEqual(rows(db, 'attempts'), []);
});

test('a request from another site is refused and nothing is kept or counted', async () => {
  const { env, db } = makeEnv();
  assert.equal((await send(post(good(), { origin: 'https://evil.example' }), env)).status, 403);
  assert.deepEqual(rows(db, 'requests'), []);
  assert.deepEqual(rows(db, 'attempts'), []);
});

test('when the database is down, the request is still emailed and accepted', async () => {
  const { env, email } = makeEnv({ DB: brokenDb() });
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    assert.equal((await send(post(), env)).status, 202);
    assert.equal((await send(post({ ...good(), email: 'bad' }), env)).status, 400);
  } finally {
    console.log = original;
  }
  assert.equal(email.sent.length, 1);
  assert.ok(lines.some((l) => l.includes('save_failed')));
  assert.ok(lines.some((l) => l.includes('count_failed')));
});

test('the switch off answers 503 and keeps nothing', async () => {
  const { env, db } = makeEnv({ CONTACT_ENABLED: 'false' });
  assert.equal((await send(post(), env)).status, 503);
  assert.deepEqual(rows(db, 'requests'), []);
});
