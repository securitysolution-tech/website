// The contact Worker. The form posts a scoping request to /api/contact as JSON; the Worker
// checks it, rate-limits it, keeps a copy in the dashboard's database and sends it to the inbox
// as an email through Cloudflare Email Service. It runs at the edge on this one route, so
// nothing reaches GitHub Pages, and the form falls back to the visitor's own email app whenever
// this returns anything but 202. The copy means a request survives a failed email: the founders
// see every one, with what happened to its email, on the dashboard at /api/visits.
//
// Responses: 202 accepted (also for requests dropped as spam, so scripts learn nothing),
// 400 invalid with `fields`, 403 not from the site, 404, 405, 413, 415, 429 too many from
// one network or in total, 502 the email could not be sent, 503 switched off or over quota.
import { limits } from '../../../src/data/contact.ts';
import { buildEmail } from './email.ts';
import { clientKey } from './ip.ts';
import { countRefusal, markDelivery, saveRequest, type Delivery, type Refusal } from './store.ts';
import { validate } from './validate.ts';

const headers = (extra: Record<string, string> = {}) => ({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  ...extra,
});

const reply = (status: number, body: Record<string, unknown>, extra?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: headers(extra) });

// Logs carry what is needed to see the service working, never the visitor's details.
const log = (event: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ event, ...data }));
const describe = (error: unknown) => (error instanceof Error ? error.message : 'unknown');

export default {
  async fetch(request, env, ctx): Promise<Response> {
    // The database is a record, never a gate: when it fails, the request is still emailed.
    const refuse = (reason: Refusal) =>
      ctx.waitUntil(
        countRefusal(env.DB, new Date(), reason).catch((error) => log('count_failed', { message: describe(error) })),
      );

    if (new URL(request.url).pathname !== '/api/contact') return reply(404, { error: 'not_found' });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, { allow: 'POST' });

    // Only the form on the site may call this: same origin, declared by the browser.
    const site = request.headers.get('sec-fetch-site');
    if (request.headers.get('origin') !== env.ALLOWED_ORIGIN || (site && site !== 'same-origin')) {
      return reply(403, { error: 'forbidden' });
    }

    // The switch, and the inbox secret the deploy needs; without either the form uses mailto.
    if (env.CONTACT_ENABLED !== 'true' || !env.CONTACT_TO) {
      return reply(503, { error: 'unavailable' }, { 'retry-after': '3600' });
    }

    if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
      return reply(415, { error: 'unsupported_media_type' });
    }
    if (Number(request.headers.get('content-length')) > limits.body) return reply(413, { error: 'too_large' });

    // Per network first, then in total: both are soft caps in front of the email quota.
    const key = clientKey(request.headers.get('cf-connecting-ip'));
    const [perIp, overall] = await Promise.all([env.PER_IP.limit({ key }), env.GLOBAL.limit({ key: 'all' })]);
    if (!perIp.success || !overall.success) {
      log('rate_limited', { scope: perIp.success ? 'global' : 'ip' });
      return reply(429, { error: 'rate_limited' }, { 'retry-after': '60' });
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > limits.body) return reply(413, { error: 'too_large' });
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      refuse('invalid');
      return reply(400, { error: 'invalid_json' });
    }

    const result = validate(data);
    if (!result.ok) {
      refuse('invalid');
      return reply(400, { error: 'invalid', fields: result.fields });
    }
    if (result.spam) {
      log('dropped', { reason: 'honeypot' });
      refuse('spam');
      return reply(202, { ok: true });
    }

    // Kept before the email goes, so the request survives a failed send.
    const received = new Date();
    let id: string | null = null;
    try {
      id = await saveRequest(env.DB, result.value, received);
    } catch (error) {
      log('save_failed', { message: describe(error) });
    }
    const record = (delivery: Delivery, detail: string) => {
      if (id)
        ctx.waitUntil(
          markDelivery(env.DB, id, delivery, detail).catch((error) => log('mark_failed', { message: describe(error) })),
        );
    };

    const message = buildEmail(result.value, {
      from: env.MAIL_FROM,
      to: env.CONTACT_TO,
      origin: env.ALLOWED_ORIGIN,
      received,
    });
    try {
      const { messageId } = await env.EMAIL.send(message);
      log('sent', { messageId, page: result.value.page, elapsed: result.value.elapsed });
      record('sent', messageId);
      return reply(202, { ok: true });
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'unknown';
      log('send_failed', { code });
      const overQuota = code === 'E_RATE_LIMIT_EXCEEDED' || code === 'E_DAILY_LIMIT_EXCEEDED';
      record(overQuota ? 'quota' : 'failed', code);
      return overQuota
        ? reply(503, { error: 'unavailable' }, { 'retry-after': '600' })
        : reply(502, { error: 'send_failed' });
    }
  },
} satisfies ExportedHandler<Env>;
