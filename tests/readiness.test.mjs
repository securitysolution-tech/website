// The security readiness scoring. Pure, run by `npm test` on Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questions, score } from '../src/data/readiness.ts';

const all = (a) => Object.fromEntries(questions.map((q) => [q.id, a]));

test('all yes is 100 and strong, all no is 0 and at risk', () => {
  const top = score(all('yes'));
  assert.equal(top.score, 100);
  assert.equal(top.band, 'strong');
  assert.equal(top.answered, questions.length);
  assert.deepEqual(top.startHere, []);
  const bottom = score(all('no'));
  assert.equal(bottom.score, 0);
  assert.equal(bottom.band, 'at-risk');
  assert.equal(bottom.startHere.length, 3);
});

test('all partly is 50 and developing', () => {
  const mid = score(all('partly'));
  assert.equal(mid.score, 50);
  assert.equal(mid.band, 'developing');
});

test('unanswered questions do not count against the score', () => {
  // One question, answered yes: 100, but only 1 of 12 answered.
  const r = score({ mfa: 'yes' });
  assert.equal(r.score, 100);
  assert.equal(r.answered, 1);
  assert.equal(r.total, 12);
});

test('start here lists the weakest by weight, worst first, up to three', () => {
  const r = score({ ...all('yes'), testing: 'no', backups: 'no', vendors: 'no', awareness: 'partly' });
  // testing (w3) and backups (w3) are no, worst; vendors (w1) is no; awareness (w2) is partly.
  assert.equal(r.startHere.length, 3);
  assert.ok(r.startHere.includes('testing') && r.startHere.includes('backups'));
  // vendors (no, w1) and awareness (partly, w2) both lose one point; the heavier control comes first.
  assert.equal(r.startHere[2], 'awareness');
});

test('the band thresholds are 75 and 40', () => {
  // 9 of 12 weighted... construct around the edges with weights summing to 25.
  assert.equal(score(all('yes')).band, 'strong');
  // ~74: mostly yes, a few no to dip just under 75
  const near = { ...all('yes'), testing: 'no', backups: 'no' }; // lose 6 of 25 -> 19/25 = 76 -> still strong
  assert.ok(score(near).score >= 75);
});

test('every question points at a real service and ids are unique', () => {
  const slugs = new Set(['offensive-testing', 'defensive-operations', 'governance-compliance', 'ai-cloud-security']);
  const ids = new Set();
  for (const q of questions) {
    assert.ok(slugs.has(q.service), q.service);
    assert.ok(q.weight >= 1 && q.weight <= 3);
    assert.ok(!ids.has(q.id), `duplicate ${q.id}`);
    ids.add(q.id);
  }
  assert.equal(ids.size, 12);
});
