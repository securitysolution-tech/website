// Test helpers: a D1 stand-in over Node's built-in SQLite (so the real migration and the real SQL
// run), a Worker environment around it, and a stand-in for the request context.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

/** D1's prepare/bind/run/all/first/batch surface, backed by an in-memory SQLite database. */
export function openDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
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
    async first() {
      return sqlite.prepare(sql).get(...args) ?? null;
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

export const PASSWORD = 'correct-horse-battery-staple-0123';
export const SITE = 'https://securitysolution.tech';

/** A Worker environment with generous rate limits; pass overrides to tighten or break one thing. */
export function makeEnv(overrides = {}) {
  const db = openDb();
  const limiter = (allow = true) => ({ limit: async () => ({ success: allow }) });
  const env = {
    VISITS_ENABLED: 'true',
    ALLOWED_ORIGIN: SITE,
    SALT_SECRET: 'test-salt-with-enough-length-0123456789',
    STATS_PASSWORD: PASSWORD,
    DB: db,
    PER_IP: limiter(),
    GLOBAL: limiter(),
    AUTH: limiter(),
    ...overrides,
  };
  return { env, db, limiter };
}

/** Stands in for ExecutionContext; `settle()` waits for everything handed to waitUntil. */
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

export const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** A beacon request as the site's script sends it. */
export function beacon(body = { p: '/', r: '', i: 0, c: '' }, init = {}) {
  const { cf, headers, ...rest } = init;
  const request = new Request(`${SITE}/api/hit`, {
    method: 'POST',
    headers: {
      origin: SITE,
      'content-type': 'application/json',
      'user-agent': CHROME,
      'cf-connecting-ip': '203.0.113.7',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...rest,
  });
  request.cf = { country: 'AE', asn: 5384, ...cf };
  return request;
}

export const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

export function dashboard(query = '', headers = {}) {
  const request = new Request(`${SITE}/api/visits${query}`, { headers });
  request.cf = { country: 'AE', asn: 5384 };
  return request;
}
