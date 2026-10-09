import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorised, credentials, USER } from '../src/auth.ts';
import { basic, PASSWORD } from './helpers.mjs';

test('the right user and password are accepted', async () => {
  assert.equal(await authorised(basic(USER, PASSWORD), PASSWORD), true);
});

test('a wrong password, a wrong user, or both are refused', async () => {
  assert.equal(await authorised(basic(USER, 'wrong'), PASSWORD), false);
  assert.equal(await authorised(basic('someone', PASSWORD), PASSWORD), false);
  assert.equal(await authorised(basic('someone', 'wrong'), PASSWORD), false);
  assert.equal(await authorised(basic(USER, PASSWORD + 'x'), PASSWORD), false);
  assert.equal(await authorised(basic(USER, PASSWORD.slice(1)), PASSWORD), false);
});

test('a missing, malformed or non-Basic header is refused', async () => {
  for (const header of [
    null,
    '',
    'Basic',
    'Basic !!!',
    'Bearer abc',
    `Basic ${Buffer.from('nocolon').toString('base64')}`,
  ]) {
    assert.equal(await authorised(header, PASSWORD), false, String(header));
  }
});

test('with no secret configured nothing is accepted, not even an empty password', async () => {
  assert.equal(await authorised(basic(USER, ''), ''), false);
  assert.equal(await authorised(basic(USER, PASSWORD), ''), false);
});

test('a password may contain colons and non-ASCII characters', async () => {
  const secret = 'pa:ss:wörd-ملف';
  const header = `Basic ${Buffer.from(`${USER}:${secret}`).toString('base64')}`;
  assert.deepEqual(credentials(header), { user: USER, password: secret });
  assert.equal(await authorised(header, secret), true);
});
