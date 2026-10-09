import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertEmail, baselineEmail, confirmEmail } from '../src/email.ts';

const links = {
  origin: 'https://securitysolution.tech',
  verify: 'https://securitysolution.tech/api/watch/confirm?token=T',
  unsubscribe: 'https://securitysolution.tech/api/watch/unsubscribe?token=U',
};

test('the confirm email carries the link, the opt-out line and the data statement', () => {
  const m = confirmEmail('example.ae', links);
  assert.match(m.subject, /example\.ae/);
  assert.match(m.text, /confirm\?token=T/);
  assert.match(m.text, /ignore this message/);
  assert.match(m.text, /unsubscribing deletes both/);
});

test('baseline and alert emails always carry an unsubscribe link and the full check', () => {
  const b = baselineEmail('example.ae', 'strong', links);
  assert.match(b.text, /unsubscribe\?token=U/);
  assert.match(b.text, /#check=example\.ae/);
  const diff = {
    degraded: true,
    levelFrom: 'strong',
    levelTo: 'weak',
    changes: [
      { check: 'dmarc', from: 'pass', to: 'fail', direction: 'degraded' },
      { check: 'mtasts', from: 'pass', to: 'info', direction: 'changed' },
    ],
  };
  const a = alertEmail('example.ae', diff, links);
  assert.equal(a.subject, 'example.ae: protection dropped');
  assert.match(a.text, /Got worse:\r\n- Spoofing protection \(DMARC\): OK -> failing/);
  assert.match(a.text, /Changed:\r\n- Encrypted mail delivery \(MTA-STS\): OK -> not applicable/);
  assert.match(a.text, /unsubscribe\?token=U/);
  assert.doesNotMatch(a.text, /[–—]/);
});
