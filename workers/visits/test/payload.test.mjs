import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFor, known } from '../src/paths.ts';
import { parseHit, sourceFor } from '../src/payload.ts';

const HOST = 'securitysolution.tech';

test('a page the site has is named by its path, in either language', () => {
  assert.equal(pageFor('/'), '/');
  assert.equal(pageFor('/ar/'), '/ar/');
  assert.equal(pageFor('/privacy/'), '/privacy/');
  assert.equal(pageFor('/services/offensive-testing/'), '/services/offensive-testing/');
  assert.equal(pageFor('/ar/services/ai-cloud-security/'), '/ar/services/ai-cloud-security/');
  assert.ok(known.has('/readiness/') && known.has('/ar/readiness/'));
});

test('a path without its trailing slash, or in capitals, or with a query, still lands on the page', () => {
  assert.equal(pageFor('/privacy'), '/privacy/');
  assert.equal(pageFor('/PRIVACY/'), '/privacy/');
  assert.equal(pageFor('/privacy/?x=1#top'), '/privacy/');
});

test('anything else is "other", so nobody can invent a path', () => {
  for (const bad of [
    '/wp-admin/',
    '/services/made-up/',
    '/privacy/../../etc/passwd',
    '',
    42,
    null,
    undefined,
    'x'.repeat(500),
  ]) {
    assert.equal(pageFor(bad), 'other', String(bad));
  }
});

test('a campaign tag in the link names the source', () => {
  assert.equal(sourceFor('linkedin.com', 0, 'li-oct9', HOST), 'li-oct9');
  assert.equal(sourceFor('', 0, ' LI-Oct9 ', HOST), 'li-oct9');
});

test('a malformed tag is ignored and the referrer is used', () => {
  assert.equal(sourceFor('github.com', 0, '<script>', HOST), 'github.com');
  assert.equal(sourceFor('github.com', 0, 'x'.repeat(40), HOST), 'github.com');
  assert.equal(sourceFor('', 0, 'has space', HOST), 'direct');
});

test('with no referrer a visit is direct, and from the site itself it is internal', () => {
  assert.equal(sourceFor('', 0, '', HOST), 'direct');
  assert.equal(sourceFor(undefined, undefined, undefined, HOST), 'direct');
  assert.equal(sourceFor('', 1, '', HOST), 'internal');
  assert.equal(sourceFor('www.securitysolution.tech', 0, '', HOST), 'internal');
});

test('referrers that arrive under several names are counted once', () => {
  assert.equal(sourceFor('lnkd.in', 0, '', HOST), 'linkedin.com');
  assert.equal(sourceFor('www.linkedin.com', 0, '', HOST), 'linkedin.com');
  assert.equal(sourceFor('ae.linkedin.com', 0, '', HOST), 'linkedin.com');
  assert.equal(sourceFor('t.co', 0, '', HOST), 'x.com');
  assert.equal(sourceFor('www.google.com', 0, '', HOST), 'google');
  assert.equal(sourceFor('www.google.co.uk', 0, '', HOST), 'google');
  assert.equal(sourceFor('l.facebook.com', 0, '', HOST), 'facebook.com');
  assert.equal(sourceFor('some-blog.example', 0, '', HOST), 'some-blog.example');
});

test('a referrer that is not a host name is "other", never stored as sent', () => {
  for (const bad of [
    'http://evil.example/path',
    'a b.example',
    '<img src=x>',
    'localhost',
    '1.2.3',
    `${'a'.repeat(90)}.example`,
  ]) {
    assert.equal(sourceFor(bad, 0, '', HOST), 'other', bad);
  }
  assert.equal(sourceFor(42, 0, '', HOST), 'direct');
});

test('a beacon body is reduced to a page and a source', () => {
  assert.deepEqual(parseHit({ p: '/services/offensive-testing/', r: 'lnkd.in', i: 0, c: '' }, HOST), {
    path: '/services/offensive-testing/',
    source: 'linkedin.com',
  });
  assert.deepEqual(parseHit({ p: '/nope/' }, HOST), { path: 'other', source: 'direct' });
});

test('anything that is not a beacon body is refused', () => {
  for (const bad of [null, undefined, 'text', 7, [], [{ p: '/' }], {}, { p: 7 }]) {
    assert.equal(parseHit(bad, HOST), null, JSON.stringify(bad));
  }
});
