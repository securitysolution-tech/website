import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard, renderJson, STYLESHEET, STYLESHEET_HREF } from '../src/render.ts';

const NOW = new Date('2026-10-09T12:00:00Z');

const report = (overrides = {}) => ({
  since: '2026-10-07',
  until: '2026-10-09',
  totals: { views: 6, visitors: 3 },
  days: [
    { day: '2026-10-07', views: 1, visitors: 1 },
    { day: '2026-10-08', views: 0, visitors: 0 },
    { day: '2026-10-09', views: 5, visitors: 2 },
  ],
  pages: [
    { key: '/', n: 4 },
    { key: '/services/offensive-testing/', n: 1 },
  ],
  landings: [{ key: '/', n: 3 }],
  sources: [
    { key: 'linkedin.com', n: 2 },
    { key: 'direct', n: 1 },
  ],
  countries: [
    { key: 'AE', n: 2 },
    { key: 'T1', n: 1 },
  ],
  devices: [
    { key: 'mobile', n: 2 },
    { key: 'desktop', n: 1 },
  ],
  browsers: [{ key: 'chrome', n: 3 }],
  systems: [
    { key: 'ios', n: 2 },
    { key: 'windows', n: 1 },
  ],
  filtered: [{ key: 'bot', n: 7 }],
  ...overrides,
});

test('the dashboard names the totals, the days and each ranking', () => {
  const html = renderDashboard(report(), 7, NOW);
  assert.match(html, /<title>Visits \| SecuritySolution\.tech<\/title>/);
  assert.match(html, /<dt>Visitors<\/dt><dd>3<\/dd>/);
  assert.match(html, /<dt>Page views<\/dt><dd>6<\/dd>/);
  assert.match(html, /<dt>Pages per visitor<\/dt><dd>2\.0<\/dd>/);
  assert.match(html, /<dt>On a phone<\/dt><dd>67%<\/dd>/);
  assert.match(html, /United Arab Emirates/);
  assert.match(html, /Tor network/);
  assert.match(html, /Crawlers and scripts/);
  assert.match(html, /Direct or unknown/);
  assert.equal((html.match(/<li title=/g) ?? []).length, 3, 'one bar per day');
  assert.match(html, /aria-current="page">7 days</);
});

test('what is left over after the top rows is shown as "everything else"', () => {
  const html = renderDashboard(report({ pages: [{ key: '/', n: 2 }] }), 30, NOW);
  assert.match(html, /Everything else<\/th><td class="n">4</);
});

test('nothing in the page can run: no script, no handler, no external resource', () => {
  const html = renderDashboard(report(), 30, NOW);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(html, /(?:src|href)="https?:/i);
});

test('anything that came from the database is escaped', () => {
  const hostile = '<img src=x onerror=alert(1)>"\'&';
  const html = renderDashboard(
    report({
      sources: [{ key: hostile, n: 1 }],
      pages: [{ key: hostile, n: 1 }],
      countries: [{ key: hostile, n: 1 }],
      browsers: [{ key: hostile, n: 1 }],
    }),
    30,
    NOW,
  );
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&#60;img src=x onerror=alert\(1\)&#62;/);
});

test('an empty period explains itself instead of showing a broken chart', () => {
  const empty = report({
    totals: { views: 0, visitors: 0 },
    days: [{ day: '2026-10-09', views: 0, visitors: 0 }],
    pages: [],
    landings: [],
    sources: [],
    countries: [],
    devices: [],
    browsers: [],
    systems: [],
    filtered: [],
  });
  const html = renderDashboard(empty, 30, NOW);
  assert.match(html, /Nothing has been counted in this period yet/);
  assert.match(html, /<dd>0%<\/dd>/);
  assert.match(html, /Nothing yet\./);
});

test('the JSON carries the same figures and the time zone', () => {
  const body = JSON.parse(renderJson(report(), NOW));
  assert.equal(body.timeZone, 'Asia/Dubai');
  assert.equal(body.generatedAt, '2026-10-09T12:00:00.000Z');
  assert.deepEqual(body.totals, { views: 6, visitors: 3 });
  assert.equal(body.days.length, 3);
  assert.deepEqual(body.countries[1], { key: 'T1', n: 1 });
});

test('the stylesheet is linked, with a fingerprint, not inline, so the zone policy cannot block it', () => {
  const html = renderDashboard(report(), 30, NOW);
  assert.match(html, /<link rel="stylesheet" href="\/api\/visits\/style\.css\?v=[a-z0-9]+">/);
  assert.ok(html.includes(`href="${STYLESHEET_HREF}"`));
  assert.doesNotMatch(html, /<style>/);
});

// The zone adds the site's policy (style-src 'self', script-src 'self') to every response, so on the
// live site a browser blocks anything inline. A style attribute once left the chart and the share
// bars empty there while looking fine locally. Nothing on the page may need one.
test('the page has no inline style, style attribute or script', () => {
  const html = renderDashboard(report(), 30, NOW, report());
  assert.doesNotMatch(html, /<style/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test('every bar size the page uses is a class the stylesheet defines', () => {
  const days = Array.from({ length: 30 }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, '0')}`,
    views: i * 7,
    visitors: Math.round(i * 2.9),
  }));
  const html = renderDashboard(
    report({
      days,
      totals: { views: 100, visitors: 50 },
      pages: [
        { key: '/', n: 1 },
        { key: 'other', n: 99 },
      ],
    }),
    30,
    NOW,
  );
  const used = new Set();
  for (const [, value] of html.matchAll(/class="([^"]*)"/g)) {
    for (const name of value.split(/\s+/)) if (/^[wvu]\d+$/.test(name)) used.add(name);
  }
  assert.ok(used.size > 20, `the page uses ${used.size} size classes`);
  const property = { w: '--w', v: '--views', u: '--visitors' };
  for (const name of used) {
    const rule = `.${name}{${property[name[0]]}:${name.slice(1)}%}`;
    assert.ok(STYLESHEET.includes(rule), `${rule} is not in the stylesheet`);
  }
  // The scale runs from nothing to the whole.
  for (const edge of [
    '.w0{--w:0%}',
    '.w100{--w:100%}',
    '.v0{--views:0%}',
    '.v100{--views:100%}',
    '.u100{--visitors:100%}',
  ]) {
    assert.ok(STYLESHEET.includes(edge), edge);
  }
});

test('a changed stylesheet gets a new address, so a browser never keeps an old one', () => {
  assert.match(STYLESHEET_HREF, /^\/api\/visits\/style\.css\?v=[a-z0-9]{3,8}$/);
});

test('the headline numbers show the change against the previous period', () => {
  const previous = report({ totals: { views: 3, visitors: 2 } });
  const html = renderDashboard(report(), 30, NOW, previous);
  assert.match(
    html,
    /<dt>Page views<\/dt><dd>6<\/dd><small><span class="delta up">\+100%<\/span> vs the previous 30 days<\/small>/,
  );
  assert.match(html, /<dt>Visitors<\/dt><dd>3<\/dd><small><span class="delta up">\+50%<\/span>/);
  const fromNothing = renderDashboard(report(), 7, NOW, report({ totals: { views: 0, visitors: 0 } }));
  assert.match(fromNothing, /<span class="delta up">new<\/span> vs the previous 7 days/);
  const down = renderDashboard(
    report({ totals: { views: 3, visitors: 1 } }),
    7,
    NOW,
    report({ totals: { views: 6, visitors: 2 } }),
  );
  assert.match(down, /<span class="delta down">-50%<\/span>/);
  const alone = renderDashboard(report(), 30, NOW);
  assert.match(alone, /<small>counted once a day<\/small>/);
});
