import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../src/diff.ts';

const snap = (level, checks) => ({ at: 'now', level, checks });
const strong = snap('strong', { dmarc: 'pass', spf: 'pass', mx: 'info', dnssec: 'pass', caa: 'pass', mtasts: 'pass' });

test('identical readings are not a change', () => {
  const d = compare(strong, strong);
  assert.equal(d.degraded, false);
  assert.deepEqual(d.changes, []);
});

test('a record dropping or the verdict falling is a degradation', () => {
  const worse = snap('weak', { ...strong.checks, dmarc: 'fail', dnssec: 'warn' });
  const d = compare(strong, worse);
  assert.equal(d.degraded, true);
  assert.deepEqual(
    d.changes.map((c) => `${c.check}:${c.direction}`),
    ['dmarc:degraded', 'dnssec:degraded', 'verdict:degraded'],
  );
});

test('a move to or from info is a change, not a degradation; an improvement is not one either', () => {
  const d = compare(
    snap('strong', { ...strong.checks, mtasts: 'pass' }),
    snap('strong', { ...strong.checks, mtasts: 'info' }),
  );
  assert.equal(d.degraded, false);
  assert.deepEqual(
    d.changes.map((c) => c.direction),
    ['changed'],
  );
  const up = compare(snap('partial', { ...strong.checks, spf: 'warn' }), strong);
  assert.equal(up.degraded, false);
  assert.deepEqual(
    up.changes.map((c) => c.direction),
    ['improved'],
  );
});

test('an absent status on either side is ignored, and incomplete never degrades', () => {
  const partial = snap('incomplete', { dmarc: 'pass' });
  assert.equal(compare(strong, partial).degraded, false);
  assert.equal(compare(partial, strong).degraded, false);
});
