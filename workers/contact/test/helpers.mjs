// Test helpers: the dashboard's database as Node's built-in SQLite with the real migrations from
// workers/visits (the database this Worker writes to), a stand-in for the email service, and a
// Worker environment around them.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { knownNeeds } from '../src/validate.ts';
import { timelines } from '../../../src/data/contact.ts';

const migrations = new URL('../../visits/migrations/', import.meta.url);

/** D1's prepare/bind/run/all/batch surface over an in-memory SQLite with every migration applied. */
export function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const statement = (sql, args = []) => ({
    sql,
    bind: (...bound) => statement(sql, bound),
    async run() {
      const result = sqlite.prepare(sql).run(...args);
      return { success: true, results: [], meta: { changes: Number(result.changes) } };
    },
    async all() {
      return { success: true, results: sqlite.prepare(sql).all(...args), meta: { changes: 0 } };
    },
  });
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    async batch(statements) {
      const results = [];
      for (const s of statements) results.push(/^\s*select/i.test(s.sql) ? await s.all() : await s.run());
      return results;
    },
  };
}

/** A database whose every call fails, as D1 does when it is down or over its daily limit. */
export const brokenDb = () => ({
  prepare() {
    throw new Error('D1 is down');
  },
  batch: async () => {
    throw new Error('D1 is down');
  },
});

/** The email binding: records what it was asked to send, or fails with `failWith` as its code. */
export function makeEmail(failWith) {
  const sent = [];
  return {
    sent,
    async send(message) {
      if (failWith) throw Object.assign(new Error('send failed'), { code: failWith });
      sent.push(message);
      return { messageId: `<msg-${sent.length}@securitysolution.tech>` };
    },
  };
}

export const SITE = 'https://securitysolution.tech';

export function makeEnv(overrides = {}) {
  const db = openDb();
  const email = makeEmail();
  const limiter = (allow = true) => ({ limit: async () => ({ success: allow }) });
  const env = {
    CONTACT_ENABLED: 'true',
    ALLOWED_ORIGIN: SITE,
    MAIL_FROM: 'hello@securitysolution.tech',
    CONTACT_TO: 'inbox@example.com',
    DB: db,
    EMAIL: email,
    PER_IP: limiter(),
    GLOBAL: limiter(),
    ...overrides,
  };
  return { env, db, email, limiter };
}

export function makeContext() {
  const pending = [];
  return {
    waitUntil: (promise) => pending.push(promise),
    passThroughOnException() {},
    async settle() {
      await Promise.all(pending);
    },
  };
}

export const good = () => ({
  name: 'Zoë O’Brien',
  email: 'zoe@example.ae',
  company: 'example.ae',
  needs: [knownNeeds[0], knownNeeds[2]],
  when: timelines[1],
  message: 'Two web apps and an API.\nStaging first.',
  website: '',
  elapsed: 42_000,
  page: '/services/offensive-testing/',
});

/** A request as the site's form sends it. */
export function post(body = good(), headers = {}) {
  return new Request(`${SITE}/api/contact`, {
    method: 'POST',
    headers: { origin: SITE, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
