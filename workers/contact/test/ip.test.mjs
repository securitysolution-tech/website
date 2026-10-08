import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientKey, ipv6Prefix } from '../src/ip.ts';

test('keeps a whole IPv4 address', () => {
  assert.equal(clientKey('203.0.113.9'), '203.0.113.9');
  assert.equal(clientKey(' 203.0.113.9 '), '203.0.113.9');
});

test('reduces IPv6 to its /64', () => {
  assert.equal(clientKey('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3:8d3::/64');
  assert.equal(clientKey('2001:0db8:0000:0000:0000:ff00:0042:8329'), '2001:db8:0:0::/64');
  assert.equal(clientKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(clientKey('::1'), '0:0:0:0::/64');
  assert.equal(clientKey('fe80::'), 'fe80:0:0:0::/64');
  assert.equal(clientKey('2001:DB8:A::B'), '2001:db8:a:0::/64');
});

test('treats an IPv4-mapped address as IPv4', () => {
  assert.equal(clientKey('::ffff:203.0.113.9'), '203.0.113.9');
});

test('falls back to one shared key when the address is missing or malformed', () => {
  for (const bad of [
    null,
    '',
    'garbage',
    '1:2:3',
    '1::2::3',
    '2001:db8:85a3:8d3:1319:8a2e:370:7348:extra',
    'gggg::1',
  ]) {
    assert.equal(clientKey(bad), 'unknown', `for ${bad}`);
  }
  assert.equal(ipv6Prefix('1::2::3'), null);
});
