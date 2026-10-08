import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, knownNeeds } from '../src/validate.ts';
import { limits, timelines } from '../../../src/data/contact.ts';

const good = () => ({
  name: 'Zoë O’Brien',
  email: 'zoe@example.ae',
  company: 'example.ae',
  needs: [knownNeeds[0], knownNeeds[2]],
  when: timelines[1],
  message: 'Two web apps and an API.\r\nStaging first.',
  website: '',
  elapsed: 42_000,
  page: '/services/offensive-testing/',
});

test('accepts a complete request and normalises it', () => {
  const result = validate(good());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spam, false);
  assert.deepEqual(result.value, {
    name: 'Zoë O’Brien',
    email: 'zoe@example.ae',
    company: 'example.ae',
    needs: [knownNeeds[0], knownNeeds[2]],
    when: timelines[1],
    message: 'Two web apps and an API.\nStaging first.',
    elapsed: 42_000,
    page: '/services/offensive-testing/',
  });
});

test('needs only the name, the email and a timeline', () => {
  const result = validate({ name: 'A', email: 'a@b.co', when: timelines[0] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.needs, []);
  assert.equal(result.value.company, '');
  assert.equal(result.value.message, '');
  assert.equal(result.value.elapsed, null);
  assert.equal(result.value.page, '');
});

test('reports every missing or invalid field at once, as codes', () => {
  const result = validate({ name: '  ', email: 'not-an-address', when: 'yesterday', needs: ['Everything'] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.fields, { name: 'required', email: 'invalid', needs: 'invalid', when: 'invalid' });
});

test('refuses anything that is not an object', () => {
  for (const data of [null, 'text', 7, [1]]) {
    const result = validate(data);
    assert.equal(result.ok, false);
    if (!result.ok) assert.deepEqual(result.fields, { body: 'invalid' });
  }
});

test('applies the shared limits', () => {
  const long = (n) => 'x'.repeat(n);
  const result = validate({
    ...good(),
    name: long(limits.name + 1),
    company: long(limits.company + 1),
    message: long(limits.message + 1),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.fields, { name: 'too_long', company: 'too_long', message: 'too_long' });
  const exact = validate({
    ...good(),
    name: long(limits.name),
    company: long(limits.company),
    message: long(limits.message),
  });
  assert.equal(exact.ok, true);
});

test('rejects control characters but keeps line breaks in the message', () => {
  assert.equal(validate({ ...good(), name: 'A\u0000B' }).ok, false);
  assert.equal(validate({ ...good(), company: 'A\u001bB' }).ok, false);
  const result = validate({ ...good(), message: 'line one\nline two\ttabbed' });
  assert.equal(result.ok, true);
});

test('collapses runs of whitespace in single-line fields', () => {
  const result = validate({ ...good(), name: '  Amal   Haddad ', company: 'Example\n Ltd' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, 'Amal Haddad');
  assert.equal(result.value.company, 'Example Ltd');
});

test('removes duplicate needs and caps their number', () => {
  const result = validate({ ...good(), needs: [knownNeeds[0], knownNeeds[0], knownNeeds[1]] });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.needs, [knownNeeds[0], knownNeeds[1]]);
  assert.equal(validate({ ...good(), needs: 'Penetration testing' }).ok, false);
});

test('marks a filled honeypot as spam without reporting a problem', () => {
  const result = validate({ ...good(), website: 'https://spam.example' });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.spam, true);
});

test('drops a page path it does not recognise', () => {
  for (const page of ['https://evil.example/', '/a b', '/' + 'p'.repeat(limits.page), 7]) {
    const result = validate({ ...good(), page });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.page, '');
  }
  const ok = validate({ ...good(), page: '/privacy/' });
  if (ok.ok) assert.equal(ok.value.page, '/privacy/');
});

test('ignores a timing it cannot use', () => {
  for (const elapsed of ['fast', -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validate({ ...good(), elapsed });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.elapsed, null);
  }
  const rounded = validate({ ...good(), elapsed: 1234.6 });
  if (rounded.ok) assert.equal(rounded.value.elapsed, 1235);
});
