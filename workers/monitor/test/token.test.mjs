import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify } from '../src/token.ts';

const secret = 'test-secret-with-enough-length-0123456789';
const payload = { act: 'verify', dom: 'example.ae', eml: 'a@example.ae', exp: Date.now() + 60_000 };

test('a signed token verifies and returns its payload', async () => {
  const token = await sign(payload, secret);
  assert.deepEqual(await verify(token, secret), payload);
});

test('a tampered body, a wrong secret, an expired token and junk are rejected', async () => {
  const token = await sign(payload, secret);
  const [body, sig] = token.split('.');
  const other = Buffer.from(JSON.stringify({ ...payload, eml: 'b@example.ae' })).toString('base64url');
  assert.equal(await verify(`${other}.${sig}`, secret), null);
  assert.equal(await verify(token, 'another-secret'), null);
  assert.equal(await verify(await sign({ ...payload, exp: Date.now() - 1 }, secret), secret), null);
  assert.equal(await verify('not-a-token', secret), null);
  assert.equal(await verify(`${body}.`, secret), null);
});
