import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmail, describeTiming } from '../src/email.ts';
import { formatRequest } from '../../../src/data/contact.ts';

const request = {
  name: 'Zoë O’Brien',
  email: 'zoe@example.ae',
  company: 'example.ae',
  needs: ['Penetration testing'],
  when: 'Within a month',
  message: 'Two web apps.',
  elapsed: 42_000,
  page: '/services/offensive-testing/',
};
const delivery = {
  from: 'hello@securitysolution.tech',
  to: 'inbox@example.com',
  origin: 'https://securitysolution.tech',
  received: new Date('2026-10-08T15:04:09Z'),
};

test('addresses the email so a reply goes to the visitor', () => {
  const email = buildEmail(request, delivery);
  assert.deepEqual(email.from, { name: 'SecuritySolution.tech website', email: 'hello@securitysolution.tech' });
  assert.equal(email.to, 'inbox@example.com');
  assert.deepEqual(email.replyTo, { name: 'Zoë O’Brien', email: 'zoe@example.ae' });
  assert.equal(email.subject, 'Scoping call request: example.ae');
});

test('carries the same message the form composes, then the page and the time', () => {
  const email = buildEmail(request, delivery);
  const body = formatRequest(request);
  assert.ok(email.text.startsWith(body));
  assert.equal(
    email.text.slice(body.length),
    '\r\nPage: https://securitysolution.tech/services/offensive-testing/\r\nReceived: 2026-10-08 15:04 UTC\r\nForm time: 42 s',
  );
});

test('links the home page when the page is unknown', () => {
  const email = buildEmail({ ...request, page: '' }, delivery);
  assert.match(email.text, /\r\nPage: https:\/\/securitysolution\.tech\/\r\n/);
});

test('describes the timing and flags very quick submissions', () => {
  assert.equal(describeTiming(null), 'Form time: not reported');
  assert.equal(describeTiming(900), 'Form time: 1 s (quick: check that this is a person)');
  assert.equal(describeTiming(42_000), 'Form time: 42 s');
  assert.equal(describeTiming(125_000), 'Form time: 2 min 5 s');
});

test('the shared format matches the message the form has always sent', () => {
  const body = formatRequest({
    name: 'A',
    email: 'a@b.co',
    company: '',
    needs: [],
    when: 'Just exploring',
    message: '',
  });
  assert.equal(
    body,
    'Name: A\r\nEmail: a@b.co\r\nCompany: not given\r\nNeeds: not sure yet\r\nTimeline: Just exploring\r\n\r\nSent from the scoping request form on securitysolution.tech',
  );
});
