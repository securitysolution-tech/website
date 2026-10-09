// The founders' dashboard: one self-contained HTML page, rendered on the server with no script, so
// the policy it is served under can forbid scripts outright. Everything that came from the database
// is escaped, and the numbers are numbers. The same figures are available as JSON.
import type { Report, Row } from './store.ts';

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Paths may wrap after a slash or a hyphen, never in the middle of a word.
const breakable = (text: string): string => esc(text).replace(/([/-])/g, '$1<wbr>');

const number = (n: number): string => n.toLocaleString('en');
const percent = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const dayLabel = (day: string, long = false): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    ...(long ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    ...(long ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });

const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const country = (code: string): string => {
  if (code === 'XX') return 'Unknown';
  if (code === 'T1') return 'Tor network';
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
};

const NAMES: Record<string, Record<string, string>> = {
  devices: { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' },
  browsers: {
    chrome: 'Chrome',
    safari: 'Safari',
    firefox: 'Firefox',
    edge: 'Edge',
    samsung: 'Samsung Internet',
    opera: 'Opera',
    other: 'Other',
  },
  systems: {
    windows: 'Windows',
    macos: 'macOS',
    ios: 'iOS',
    android: 'Android',
    linux: 'Linux',
    chromeos: 'ChromeOS',
    other: 'Other',
  },
  filtered: { bot: 'Crawlers and scripts', hosting: 'Hosting networks' },
};

type Group = 'pages' | 'landings' | 'sources' | 'countries' | 'devices' | 'browsers' | 'systems' | 'filtered';

function label(group: Group, key: string): string {
  if (key === '\u0000other') return 'Everything else';
  if (group === 'pages' || group === 'landings') {
    if (key === 'other') return 'Other pages, including not found';
    if (key === '/') return 'Home';
    if (key === '/ar/') return 'Home (Arabic)';
    return key;
  }
  if (group === 'sources') {
    if (key === 'direct') return 'Direct or unknown';
    if (key === 'internal') return 'Another page on the site';
    if (key === 'other') return 'Other sites';
    return key;
  }
  if (group === 'countries') return country(key);
  return NAMES[group]?.[key] ?? key;
}

/** The top rows plus a remainder, each with its share of the whole. */
function withRemainder(rows: Row[], whole: number): Row[] {
  const shown = rows.reduce((sum, r) => sum + r.n, 0);
  return whole > shown ? [...rows, { key: '\u0000other', n: whole - shown }] : rows;
}

function ranking(
  title: string,
  note: string,
  group: Group,
  column: string,
  rows: Row[],
  whole: number,
  unit: string,
): string {
  const body = withRemainder(rows, whole)
    .map((row) => {
      const share = percent(row.n, whole);
      return `<tr><th scope="row">${breakable(label(group, row.key))}</th><td class="n">${number(row.n)}</td><td class="share"><div class="meter"><span class="bar w${share}"></span><span class="pct">${share}%</span></div></td></tr>`;
    })
    .join('');
  return `<section class="card"><h2>${esc(title)}</h2><p class="note">${esc(note)}</p>${
    rows.length === 0
      ? '<p class="empty">Nothing yet.</p>'
      : `<table><thead><tr><th scope="col">${esc(column)}</th><th scope="col" class="n">${esc(unit)}</th><th scope="col" class="share">Share</th></tr></thead><tbody>${body}</tbody></table>`
  }</section>`;
}

/** A size as a whole percent of the peak, which picks one of the stylesheet's .v/.u classes. */
const scale = (n: number, peak: number): number => Math.min(100, Math.max(0, Math.round((n / peak) * 100)));

function chart(report: Report): string {
  const peak = Math.max(1, ...report.days.map((d) => d.views));
  const bars = report.days
    .map((d) => {
      const tip = `${dayLabel(d.day, true)}: ${number(d.visitors)} visitors, ${number(d.views)} page views`;
      return `<li title="${esc(tip)}" class="v${scale(d.views, peak)} u${scale(d.visitors, peak)}"><i></i><b></b></li>`;
    })
    .join('');
  const rows = report.days
    .slice()
    .reverse()
    .map(
      (d) =>
        `<tr><th scope="row">${esc(dayLabel(d.day, true))}</th><td class="n">${number(d.visitors)}</td><td class="n">${number(d.views)}</td></tr>`,
    )
    .join('');
  const first = report.days[0];
  const last = report.days[report.days.length - 1];
  return `<section class="card wide"><h2>Visitors and page views per day</h2>
<p class="legend"><span><i class="swatch visitors"></i>Visitors</span><span><i class="swatch views"></i>Page views</span></p>
<figure class="chart" role="img" aria-label="${esc(`${number(report.totals.visitors)} visitors and ${number(report.totals.views)} page views from ${dayLabel(report.since)} to ${dayLabel(report.until)}. The daily numbers follow.`)}">
<span class="peak" aria-hidden="true">${number(peak)}</span>
<ol aria-hidden="true">${bars}</ol>
<figcaption aria-hidden="true"><span>${first ? esc(dayLabel(first.day)) : ''}</span><span>${last ? esc(dayLabel(last.day)) : ''}</span></figcaption>
</figure>
<details><summary>Daily numbers</summary><table class="daily"><thead><tr><th scope="col">Day</th><th scope="col" class="n">Visitors</th><th scope="col" class="n">Page views</th></tr></thead><tbody>${rows}</tbody></table></details>
</section>`;
}

// Bar widths and heights are classes (.w42, .v73, .u41), never style attributes: the zone adds the
// site's policy (style-src 'self') to every response, and a browser enforces it on this page too.
const steps = (prefix: string, property: string): string =>
  Array.from({ length: 101 }, (_, n) => `.${prefix}${n}{${property}:${n}%}`).join('');
const STEPS = steps('w', '--w') + steps('v', '--views') + steps('u', '--visitors');

const STYLE = `
:root{color-scheme:dark light;--bg:#0c1813;--panel:#12211b;--line:#223a2f;--text:#eaf1ed;--muted:#9db3a8;--accent:#62d3a6;--soft:#2b5a47;--focus:#ffd479}
@media (prefers-color-scheme:light){:root{--bg:#f3f1ea;--panel:#fbfaf6;--line:#dcd8cb;--text:#12201a;--muted:#55645b;--accent:#0b7a54;--soft:#b6d3c4;--focus:#7a4b00}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:1rem/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
a{color:var(--accent)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.page{max-width:72rem;margin:0 auto;padding:1.5rem 1.25rem 3rem}
header.top{display:flex;flex-wrap:wrap;gap:1rem;align-items:end;justify-content:space-between;margin-bottom:.5rem}
.eyebrow{margin:0;color:var(--muted);font-size:.875rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
h1{margin:0;font-size:clamp(1.75rem,4vw,2.5rem);line-height:1.1}
h2{margin:0 0 .25rem;font-size:1.0625rem}
nav.range{display:flex;gap:.25rem;padding:.25rem;border:1px solid var(--line);border-radius:.75rem;background:var(--panel)}
nav.range a{padding:.375rem .875rem;border-radius:.5rem;color:var(--muted);text-decoration:none;font-weight:600}
nav.range a[aria-current=page]{background:var(--accent);color:var(--bg)}
.span{margin:0 0 1.25rem;color:var(--muted)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.75rem;margin:0 0 .75rem;padding:0}
.kpi{padding:1rem 1.125rem;border:1px solid var(--line);border-radius:.875rem;background:var(--panel)}
.kpi dt{color:var(--muted);font-size:.875rem;font-weight:600}
.kpi dd{margin:.125rem 0 0;font-size:clamp(1.75rem,4vw,2.25rem);font-weight:700;line-height:1.15}
.kpi small{display:block;margin-top:.125rem;color:var(--muted);font-size:.8125rem;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));gap:.75rem}
.card{padding:1.125rem 1.25rem;border:1px solid var(--line);border-radius:.875rem;background:var(--panel);min-width:0}
.card.wide{grid-column:1/-1;margin-bottom:.75rem}
.note,.empty,.legend{margin:0 0 .75rem;color:var(--muted);font-size:.875rem}
.legend{display:flex;gap:1rem}
.swatch{display:inline-block;width:.75rem;height:.75rem;margin-inline-end:.375rem;border-radius:.1875rem;vertical-align:-.0625rem}
.swatch.visitors{background:var(--accent)}.swatch.views{background:var(--soft)}
.chart{position:relative;margin:0 0 .5rem;padding-top:1.25rem}
.chart .peak{position:absolute;top:0;left:0;color:var(--muted);font-size:.75rem}
.chart ol{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;align-items:end;height:11rem;margin:0;padding:0;border-bottom:1px solid var(--line);list-style:none}
.chart li{position:relative;height:100%}
.chart li i,.chart li b{position:absolute;bottom:0;border-radius:2px 2px 0 0;min-height:1px}
.chart li i{left:0;right:0;height:var(--views);background:var(--soft)}
.chart li b{left:18%;right:18%;height:var(--visitors);background:var(--accent)}
.chart figcaption{display:flex;justify-content:space-between;margin-top:.375rem;color:var(--muted);font-size:.75rem}
details{margin-top:.5rem}
summary{cursor:pointer;color:var(--accent);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:.9375rem}
th,td{padding:.4375rem .5rem;border-top:1px solid var(--line);text-align:start;vertical-align:middle}
thead th{border-top:0;color:var(--muted);font-size:.8125rem;font-weight:600}
tbody th{font-weight:500;overflow-wrap:anywhere}
.n{text-align:end;white-space:nowrap}
.share{width:38%}
.meter{display:flex;align-items:center;gap:.5rem}
.bar{display:block;flex:1;height:.5rem;border-radius:.25rem;background:linear-gradient(to right,var(--accent) var(--w),var(--line) var(--w))}
.pct{min-width:2.5rem;text-align:end;color:var(--muted);font-size:.8125rem}
.daily{margin-top:.5rem}
footer.notes{margin-top:1.5rem;color:var(--muted);font-size:.875rem}
footer.notes p{margin:.375rem 0;max-width:60rem}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

.delta{display:inline-block;padding:0 .4rem;border-radius:.5rem;font-weight:600;font-size:.7rem;line-height:1.4;vertical-align:middle}
.delta.up{background:rgba(98,211,166,.18);color:var(--accent)}
.delta.down{background:rgba(255,143,128,.18);color:#ff8f80}
.delta.flat{background:var(--line);color:var(--muted)}
${STEPS}
`;

/** The stylesheet, served by the Worker at /api/visits/style.css: the zone's policy allows only
 * same-origin styles, so it cannot be inline. */
export const STYLESHEET = STYLE;

// A fingerprint in the address, so a changed stylesheet is fetched instead of served from a cache.
const fingerprint = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(36);
};
export const STYLESHEET_HREF = `/api/visits/style.css?v=${fingerprint(STYLE)}`;

/** The change against the previous period of the same length, for a headline number. */
export function delta(current: number, previous: number | undefined, days: number): string {
  if (previous === undefined) return '';
  if (previous === 0) return current === 0 ? '' : `<span class="delta up">new</span> vs the previous ${days} days`;
  const pct = Math.round(((current - previous) / previous) * 100);
  const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const sign = pct > 0 ? '+' : '';
  return `<span class="delta ${dir}">${sign}${pct}%</span> vs the previous ${days} days`;
}

/** The dashboard page for a report covering the last `days` days, with the previous period for comparison. */
export function renderDashboard(report: Report, days: number, now: Date, previous?: Report): string {
  const { totals } = report;
  const visitorsDelta = delta(totals.visitors, previous?.totals.visitors, days);
  const viewsDelta = delta(totals.views, previous?.totals.views, days);
  const mobile = report.devices.find((r) => r.key === 'mobile')?.n ?? 0;
  const automated = report.filtered.reduce((sum, r) => sum + r.n, 0);
  const perVisitor = totals.visitors > 0 ? (totals.views / totals.visitors).toFixed(1) : '0';
  const ranges = [7, 30, 90]
    .map((n) => `<a href="?days=${n}"${n === days ? ' aria-current="page"' : ''}>${n} days</a>`)
    .join('');
  const empty =
    totals.views === 0
      ? `<p class="card wide">Nothing has been counted in this period yet. The counter starts with the first real visit. Your own visits count too, unless you open any page of the site once with <code>?visits=off</code> to switch counting off in that browser.</p>`
      : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="dark light"><title>Visits | SecuritySolution.tech</title><link rel="stylesheet" href="${STYLESHEET_HREF}"></head>
<body><div class="page">
<header class="top"><div><p class="eyebrow">SecuritySolution.tech</p><h1>Visits</h1></div><nav class="range" aria-label="Time range">${ranges}</nav></header>
<p class="span">${esc(dayLabel(report.since, true))} to ${esc(dayLabel(report.until, true))}, Dubai time. Generated ${esc(now.toISOString().slice(0, 16).replace('T', ' '))} UTC.</p>
<main>
<h2 class="sr">Totals</h2>
<dl class="kpis">
<div class="kpi"><dt>Visitors</dt><dd>${number(totals.visitors)}</dd><small>${visitorsDelta || 'counted once a day'}</small></div>
<div class="kpi"><dt>Page views</dt><dd>${number(totals.views)}</dd><small>${viewsDelta || 'every page loaded'}</small></div>
<div class="kpi"><dt>Pages per visitor</dt><dd>${perVisitor}</dd><small>views divided by visitors</small></div>
<div class="kpi"><dt>On a phone</dt><dd>${percent(mobile, totals.visitors)}%</dd><small>of visitors</small></div>
</dl>
${empty}
${chart(report)}
<div class="grid">
${ranking('Pages', 'Where people looked, every page view.', 'pages', 'Page', report.pages, totals.views, 'Views')}
${ranking('Landing pages', "The first page of each visitor's day.", 'landings', 'Landing page', report.landings, totals.visitors, 'Visitors')}
${ranking('Sources', "Where each visitor's day began. Add ?ref=name to a link to tag it.", 'sources', 'Source', report.sources, totals.visitors, 'Visitors')}
${ranking('Countries', 'From the network the request came through.', 'countries', 'Country', report.countries, totals.visitors, 'Visitors')}
${ranking('Devices', 'Phone, tablet or computer.', 'devices', 'Device', report.devices, totals.visitors, 'Visitors')}
${ranking('Browsers', 'The browser family.', 'browsers', 'Browser', report.browsers, totals.visitors, 'Visitors')}
${ranking('Operating systems', 'The system family.', 'systems', 'System', report.systems, totals.visitors, 'Visitors')}
${ranking('Ignored as automated', `${number(automated)} requests were not counted as people.`, 'filtered', 'Reason', report.filtered, automated, 'Requests')}
</div>
</main>
<footer class="notes">
<p>A visitor is counted once a day: a one-way hash of the network and the browser, keyed by a secret and the date, that is deleted the next night. The same person on three days is three visitors. No address, no User-Agent and no cookie is stored.</p>
<p>Visits are not counted when the browser sends Do Not Track or Global Privacy Control, when the visitor opened a page with <code>?visits=off</code>, or when the request looks automated. Totals are kept for 13 months.</p>
<p><a href="?days=${days}&amp;format=json">The same figures as JSON</a></p>
</footer>
</div></body></html>`;
}

/** The report as JSON, for scripts and for asking questions of the numbers. */
export const renderJson = (report: Report, now: Date): string =>
  JSON.stringify({ generatedAt: now.toISOString(), timeZone: 'Asia/Dubai', ...report }, null, 2);
