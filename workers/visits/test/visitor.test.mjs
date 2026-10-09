import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBefore, dubaiDay, visitorId } from '../src/visitor.ts';

test('the day is the calendar day in Dubai (UTC+4)', () => {
  assert.equal(dubaiDay(new Date('2026-10-09T19:59:59Z')), '2026-10-09');
  assert.equal(dubaiDay(new Date('2026-10-09T20:00:00Z')), '2026-10-10');
  assert.equal(dubaiDay(new Date('2026-12-31T21:00:00Z')), '2027-01-01');
});

test('days before a day, across month and year ends', () => {
  assert.equal(daysBefore('2026-10-09', 0), '2026-10-09');
  assert.equal(daysBefore('2026-10-09', 29), '2026-09-10');
  assert.equal(daysBefore('2027-01-01', 1), '2026-12-31');
  assert.equal(daysBefore('2026-10-09', -1), '2026-10-10');
});

test('the same visitor on the same day gets the same id', async () => {
  const a = await visitorId('secret', '2026-10-09', '203.0.113.7', 'Browser/1');
  const b = await visitorId('secret', '2026-10-09', '203.0.113.7', 'Browser/1');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{24}$/);
});

test('the id changes with the day, the network, the browser and the secret', async () => {
  const base = await visitorId('secret', '2026-10-09', '203.0.113.7', 'Browser/1');
  assert.notEqual(base, await visitorId('secret', '2026-10-10', '203.0.113.7', 'Browser/1'));
  assert.notEqual(base, await visitorId('secret', '2026-10-09', '203.0.113.8', 'Browser/1'));
  assert.notEqual(base, await visitorId('secret', '2026-10-09', '203.0.113.7', 'Browser/2'));
  assert.notEqual(base, await visitorId('other', '2026-10-09', '203.0.113.7', 'Browser/1'));
});

test('the id does not contain the address or the browser', async () => {
  const id = await visitorId('secret', '2026-10-09', '203.0.113.7', 'Browser/1');
  assert.ok(!id.includes('203') && !id.toLowerCase().includes('browser'));
});
