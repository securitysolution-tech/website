// The visit counter. Each page of the site posts a small beacon to /api/hit; the Worker counts it
// without a cookie and without keeping anything that identifies the sender. The founders read the
// totals at /api/visits, behind a password. Nothing here can slow or break a page: the beacon is
// fire-and-forget, and the writes happen after the answer is sent.
//
// /api/hit: 204 counted or deliberately ignored (also for crawlers, privacy signals and the
// kill switch, so none of them can tell), 400 not a beacon, 403 not from the site, 405, 413, 415,
// 429 too many from one network. /api/visits: 200 the dashboard (or JSON), 401 sign in, 405, 429
// too many failed sign-ins.
import { authorised, REALM } from './auth.ts';
import { clientKey } from './ip.ts';
import { parseHit } from './payload.ts';
import { renderDashboard, renderJson, STYLESHEET } from './render.ts';
import { contact, count, countFiltered, purge, purgeContact, report, type Contact } from './store.ts';
import { isAutomated, isHosting, parseAgent } from './traffic.ts';
import { daysBefore, dubaiDay, visitorId } from './visitor.ts';

const MAX_BODY = 1024;
const RANGES = [7, 30, 90];

const secure = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow',
};

const empty = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'cache-control': 'no-store', ...extra } });

const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

// Logs carry what is needed to see the service working, never anything about a visitor.
const log = (event: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ event, ...data }));
const reason = (error: unknown) => (error instanceof Error ? error.message : 'unknown');

async function handleHit(request: Request<unknown, IncomingRequestCfProperties>, env: Env, ctx: ExecutionContext) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { allow: 'POST' });

  // Only the site's own pages may post: same origin, declared by the browser.
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (!(origin ? origin === env.ALLOWED_ORIGIN : site === 'same-origin') || (site && site !== 'same-origin')) {
    return json(403, { error: 'forbidden' });
  }

  // The kill switch, a missing secret and the privacy signals all end the same way, silently.
  if (env.VISITS_ENABLED !== 'true' || !env.SALT_SECRET) return empty(204);
  if (request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1') return empty(204);

  if (!/^(?:application\/json|text\/plain)\b/i.test(request.headers.get('content-type') ?? '')) {
    return json(415, { error: 'unsupported_media_type' });
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY) return json(413, { error: 'too_large' });

  const network = clientKey(request.headers.get('cf-connecting-ip'));
  const [perIp, overall] = await Promise.all([env.PER_IP.limit({ key: network }), env.GLOBAL.limit({ key: 'all' })]);
  if (!perIp.success || !overall.success) return json(429, { error: 'rate_limited' }, { 'retry-after': '60' });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return json(413, { error: 'too_large' });
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const userAgent = request.headers.get('user-agent') ?? '';
  const day = dubaiDay(new Date());
  const ignore = (why: string) =>
    ctx.waitUntil(countFiltered(env.DB, day, why).catch((error) => log('tally_failed', { message: reason(error) })));
  if (isAutomated(userAgent)) {
    ignore('bot');
    return empty(204);
  }
  if (isHosting(request.cf?.asn)) {
    ignore('hosting');
    return empty(204);
  }

  const hit = parseHit(data, new URL(env.ALLOWED_ORIGIN).hostname);
  if (!hit) return json(400, { error: 'invalid' });

  const code = request.cf?.country;
  const country = typeof code === 'string' && /^[A-Z0-9]{2}$/.test(code) ? code : 'XX';
  const { browser, os, device } = parseAgent(userAgent);
  ctx.waitUntil(
    visitorId(env.SALT_SECRET, day, network, userAgent)
      .then((visitor) => count(env.DB, day, visitor, hit.path, { country, browser, os, device, source: hit.source }))
      .catch((error) => log('count_failed', { message: reason(error) })),
  );
  return empty(204);
}

async function handleDashboard(request: Request<unknown, IncomingRequestCfProperties>, env: Env) {
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' }, { allow: 'GET' });

  const header = request.headers.get('authorization');
  if (!(await authorised(header, env.STATS_PASSWORD))) {
    // A browser's first request carries no credentials; only real attempts count against the limit.
    if (header) {
      const attempt = await env.AUTH.limit({ key: clientKey(request.headers.get('cf-connecting-ip')) });
      if (!attempt.success) return json(429, { error: 'rate_limited' }, { 'retry-after': '60' });
    }
    return new Response('Sign in to see the visits.', {
      status: 401,
      headers: {
        ...secure,
        'content-type': 'text/plain; charset=utf-8',
        'www-authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      },
    });
  }

  const url = new URL(request.url);
  const asked = Number(url.searchParams.get('days'));
  const days = RANGES.includes(asked) ? asked : 30;
  const now = new Date();
  const until = dubaiDay(now);
  try {
    const since = daysBefore(until, days - 1);
    // The same length of time before this period, for the change on the headline numbers.
    // The contact log is read on its own, so the counts still show when it cannot be.
    const requests: Promise<Contact | null> = contact(env.DB, since, until).catch((error) => {
      log('contact_failed', { message: reason(error) });
      return null;
    });
    const [totals, previous, contactLog] = await Promise.all([
      report(env.DB, since, until),
      report(env.DB, daysBefore(since, days), daysBefore(since, 1)),
      requests,
    ]);
    if (url.searchParams.get('format') === 'json') {
      return new Response(renderJson(totals, now, contactLog), {
        headers: { ...secure, 'content-type': 'application/json; charset=utf-8' },
      });
    }
    return new Response(renderDashboard(totals, days, now, previous, contactLog), {
      headers: {
        ...secure,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy':
          // The zone adds the site's own policy header to every response, and a browser enforces
          // both, so the stylesheet is a same-origin file rather than inline.
          "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'x-frame-options': 'DENY',
      },
    });
  } catch (error) {
    log('report_failed', { message: reason(error) });
    return new Response('The counts could not be read just now. Try again in a minute.', {
      status: 500,
      headers: { ...secure, 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    if (path === '/api/hit') return handleHit(request, env, ctx);
    if (path === '/api/visits') return handleDashboard(request, env);
    // The dashboard's stylesheet. Plain CSS, no data, cached for a day.
    if (path === '/api/visits/style.css') {
      if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' }, { allow: 'GET' });
      return new Response(STYLESHEET, {
        headers: { ...secure, 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=86400' },
      });
    }
    return json(404, { error: 'not_found' });
  },

  async scheduled(_event, env, ctx): Promise<void> {
    const today = dubaiDay(new Date());
    // Two clean-ups that cannot stop each other: the visitor hashes must go every night.
    ctx.waitUntil(purge(env.DB, today).catch((error) => log('purge_failed', { message: reason(error) })));
    ctx.waitUntil(
      purgeContact(env.DB, today).catch((error) => log('purge_contact_failed', { message: reason(error) })),
    );
  },
} satisfies ExportedHandler<Env>;
