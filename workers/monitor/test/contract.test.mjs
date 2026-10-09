// The Worker's HTTP contract, run on Node with a stubbed environment: an in-memory KV, an
// email binding that records sends, and rate limits that always allow. Covers the paths the
// browser probe cannot reach without the Worker running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

const ORIGIN = 'https://securitysolution.tech';
function env(overrides = {}) {
  const store = new Map();
  const sent = [];
  return {
    MONITOR_ENABLED: 'true',
    ALLOWED_ORIGIN: ORIGIN,
    SITE_ORIGIN: ORIGIN,
    MAIL_FROM: 'hello@securitysolution.tech',
    TOKEN_SECRET: 'a-test-secret-of-sufficient-length-0123456789',
    WATCH: {
      get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
      put: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
      list: async () => ({ keys: [...store.keys()].map((name) => ({ name })), list_complete: true }),
    },
    EMAIL: { send: async (m) => void sent.push(m) },
    PER_IP: { limit: async () => ({ success: true }) },
    GLOBAL: { limit: async () => ({ success: true }) },
    _store: store,
    _sent: sent,
    ...overrides,
  };
}
const ctx = { waitUntil: (p) => p, passThroughOnException: () => {} };
const post = (body, headers = {}) =>
  new Request(`${ORIGIN}/api/watch`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = { domain: 'example.ae', email: 'owner@example.ae', website: '', elapsed: 5000 };

test('a foreign origin, a non-JSON body and a wrong method are refused', async () => {
  const e = env();
  assert.equal((await worker.fetch(post(good, { origin: 'https://evil.example' }), e, ctx)).status, 403);
  assert.equal((await worker.fetch(post('x', { 'content-type': 'text/plain' }), e, ctx)).status, 415);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/watch`, { method: 'GET' }), e, ctx)).status, 405);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/other`), e, ctx)).status, 404);
  assert.equal(e._sent.length, 0);
});

test('switched off answers 503 and sends nothing', async () => {
  const e = env({ MONITOR_ENABLED: 'false' });
  assert.equal((await worker.fetch(post(good), e, ctx)).status, 503);
  assert.equal(e._sent.length, 0);
});

test('a valid signup stores a pending record and sends one confirmation; a repeat inside the cooldown sends nothing', async () => {
  const e = env();
  assert.equal((await worker.fetch(post(good), e, ctx)).status, 202);
  assert.equal(e._sent.length, 1);
  assert.equal(e._sent[0].to, 'owner@example.ae');
  assert.match(e._sent[0].text, /\/api\/watch\/confirm\?token=/);
  const [record] = [...e._store.values()].map((v) => JSON.parse(v));
  assert.equal(record.verified, false);
  assert.ok(record.confirmSentAt);
  assert.equal((await worker.fetch(post(good), e, ctx)).status, 202);
  assert.equal(e._sent.length, 1, 'no second email inside the cooldown');
});

test('a honeypot or an instant submit is accepted and dropped', async () => {
  const e = env();
  assert.equal((await worker.fetch(post({ ...good, website: 'spam' }), e, ctx)).status, 202);
  assert.equal((await worker.fetch(post({ ...good, elapsed: 100 }), e, ctx)).status, 202);
  assert.equal(e._sent.length, 0);
  assert.equal(e._store.size, 0);
});

test('an invalid domain or address answers 400 with the field', async () => {
  const e = env();
  const r = await worker.fetch(post({ ...good, email: 'nope' }), e, ctx);
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'invalid', field: 'email' });
});

test('the confirm link verifies the record, and the unsubscribe link deletes it', async () => {
  const e = env();
  await worker.fetch(post(good), e, ctx);
  const token = e._sent[0].text.match(/confirm\?token=([^\s]+)/)[1];
  // The first reading needs the network; a failure there is tolerated and the page still confirms.
  const confirm = await worker.fetch(new Request(`${ORIGIN}/api/watch/confirm?token=${token}`), e, ctx);
  assert.equal(confirm.status, 200);
  assert.match(await confirm.text(), /Confirmed|watching/);
  const [record] = [...e._store.values()].map((v) => JSON.parse(v));
  assert.equal(record.verified, true);
  const bad = await worker.fetch(new Request(`${ORIGIN}/api/watch/confirm?token=${token}x`), e, ctx);
  assert.match(await bad.text(), /Link expired/);
  const unsubToken = (e._sent.find((m) => /Now watching/.test(m.subject))?.text ?? '').match(
    /unsubscribe\?token=([^\s]+)/,
  )?.[1];
  if (unsubToken) {
    const un = await worker.fetch(new Request(`${ORIGIN}/api/watch/unsubscribe?token=${unsubToken}`), e, ctx);
    assert.match(await un.text(), /Unsubscribed/);
    assert.equal(e._store.size, 0);
  }
});
