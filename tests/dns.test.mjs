// The DNS parsers behind the domain check. Run by `npm test` on Node, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caaValue, normaliseDomain, orgDomain, txtValue } from '../src/scripts/dns.ts';

test('txtValue joins quoted chunks and unescapes', () => {
  assert.equal(txtValue('"v=spf1 include:_spf.google.com ~all"'), 'v=spf1 include:_spf.google.com ~all');
  assert.equal(txtValue('"v=DKIM1; k=rsa; p=MIIB" "IjANBg"'), 'v=DKIM1; k=rsa; p=MIIBIjANBg');
  assert.equal(txtValue('"say \\"hi\\""'), 'say "hi"');
  assert.equal(txtValue('unquoted '), 'unquoted');
});

test('caaValue reads text and RFC 3597 forms', () => {
  assert.deepEqual(caaValue('0 issue "letsencrypt.org"'), { tag: 'issue', value: 'letsencrypt.org' });
  assert.deepEqual(caaValue('128 IODEF "mailto:security@example.com"'), { tag: 'iodef', value: 'mailto:security@example.com' });
  // \# 22 00 05 69 73 73 75 65 6c 65 74 73 65 6e 63 72 79 70 74 2e 6f 72 67 => 0 issue letsencrypt.org
  const hex = '\\# 22 ' + '00 05 ' + [...'issueletsencrypt.org'].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
  assert.deepEqual(caaValue(hex), { tag: 'issue', value: 'letsencrypt.org' });
  assert.equal(caaValue('garbage'), null);
});

test('normaliseDomain accepts what people paste and rejects what is not a domain', () => {
  assert.equal(normaliseDomain('Example.AE'), 'example.ae');
  assert.equal(normaliseDomain('https://www.example.ae/path?x=1'), 'example.ae');
  assert.equal(normaliseDomain('  name@mail.example.co.uk '), 'mail.example.co.uk');
  assert.equal(normaliseDomain('example.ae.'), 'example.ae');
  assert.equal(normaliseDomain('شركة.امارات'), 'xn--ogbpi5d.xn--mgbaam7a8h');
  for (const bad of ['', 'localhost', 'example', 'exa mple.ae', '-bad.ae', 'a'.repeat(64) + '.ae', '192.168.1.1']) {
    assert.equal(normaliseDomain(bad), null, bad);
  }
});

test('orgDomain knows the two-label suffixes of the region', () => {
  assert.equal(orgDomain('mail.example.ae'), 'example.ae');
  assert.equal(orgDomain('a.b.example.co.ae'), 'example.co.ae');
  assert.equal(orgDomain('example.co.uk'), 'example.co.uk');
  assert.equal(orgDomain('deep.sub.example.com'), 'example.com');
  assert.equal(orgDomain('example.com'), 'example.com');
});
