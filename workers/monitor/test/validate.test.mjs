import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/validate.ts';
import { normaliseDomain } from '../../../src/scripts/dns.ts';

test('a normal signup is valid, lower-cased and normalised', () => {
  const r = validate({ domain: 'https://WWW.Example.AE/path', email: 'Me@Example.AE', website: '', elapsed: 9000 });
  // The domain follows the website's own normalisation, whatever it decides about scheme, case and path.
  assert.deepEqual(r, {
    ok: true,
    domain: normaliseDomain('https://WWW.Example.AE/path'),
    email: 'me@example.ae',
    spam: false,
  });
});

test('bad input is rejected by field', () => {
  assert.deepEqual(validate(null), { ok: false, field: 'body' });
  assert.deepEqual(validate({ domain: 'not a domain', email: 'a@b.ae' }), { ok: false, field: 'domain' });
  assert.deepEqual(validate({ domain: 'example.ae', email: 'nope' }), { ok: false, field: 'email' });
  assert.deepEqual(validate({ domain: 'example.ae', email: 'a@' + 'b'.repeat(260) + '.ae' }), {
    ok: false,
    field: 'email',
  });
});

test('a filled honeypot or an instant submit is flagged as spam but accepted', () => {
  assert.equal(validate({ domain: 'example.ae', email: 'a@b.ae', website: 'x' }).spam, true);
  assert.equal(validate({ domain: 'example.ae', email: 'a@b.ae', elapsed: 300 }).spam, true);
  assert.equal(validate({ domain: 'example.ae', email: 'a@b.ae', elapsed: 2500 }).spam, false);
});
