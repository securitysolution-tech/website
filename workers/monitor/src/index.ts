// The self-serve posture monitor. A visitor asks to watch a domain; after confirming by email
// (double opt-in), a daily run re-reads it with the website's own check and emails them only
// when its protection degrades. Every email carries a one-click unsubscribe that deletes the
// record. Off until the owner sets MONITOR_ENABLED, the KV namespace, the email binding and
// TOKEN_SECRET; see README.md, "Posture monitor".
import { alertEmail, baselineEmail, confirmEmail, type Links, type Mail } from './email.ts';
import { compare } from './diff.ts';
import { read } from './snapshot.ts';
import { get, keyFor, listKeys, put, remove, type Subscription } from './store.ts';
import { sign, verify } from './token.ts';
import { validate } from './validate.ts';

const DAY = 86_400_000;
const CONFIRM_TTL = 2 * DAY;
const UNSUBSCRIBE_TTL = 400 * DAY;
const MAX_BODY = 4096;
// A repeat signup for the same pair within this window answers 202 and sends nothing, so the
// endpoint cannot be used to flood an address with confirmation emails; after it, the link is
// resent, so a typo never strands anyone.
const CONFIRM_COOLDOWN = 10 * 60_000;

const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// The confirm and unsubscribe links land on a small self-contained page with its own policy.
const page = (title: string, message: string, origin: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:1rem/1.5 system-ui,sans-serif;background:#0c1813;color:#eaf1ed;padding:1.5rem}main{max-width:32rem;text-align:center}h1{font-size:1.5rem;margin:0 0 .5rem}a{color:#62d3a6}</style></head><body><main><h1>${escape(title)}</h1><p>${escape(message)}</p><p><a href="${escape(origin)}/">Back to SecuritySolution.tech</a></p></main></body></html>`,
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      },
    },
  );

const links = (env: Env, verifyToken?: string, unsubscribeToken?: string): Links => ({
  origin: env.SITE_ORIGIN,
  verify: verifyToken ? `${env.ALLOWED_ORIGIN}/api/watch/confirm?token=${verifyToken}` : undefined,
  unsubscribe: `${env.ALLOWED_ORIGIN}/api/watch/unsubscribe?token=${unsubscribeToken ?? ''}`,
});

const send = (env: Env, to: string, mail: Mail) =>
  env.EMAIL.send({
    from: { name: 'SecuritySolution.tech', email: env.MAIL_FROM },
    to,
    subject: mail.subject,
    text: mail.text,
  });

const unsubscribeToken = (env: Env, domain: string, email: string) =>
  sign({ act: 'unsubscribe', dom: domain, eml: email, exp: Date.now() + UNSUBSCRIBE_TTL }, env.TOKEN_SECRET);

async function handleLink(url: URL, env: Env): Promise<Response> {
  const payload = await verify(url.searchParams.get('token') ?? '', env.TOKEN_SECRET);
  if (!payload)
    return page('Link expired', 'This link is invalid or has expired. Please sign up again.', env.SITE_ORIGIN);
  const key = await keyFor(payload.dom, payload.eml);
  const sub = await get(env.WATCH, key);

  if (url.pathname === '/api/watch/unsubscribe' || payload.act === 'unsubscribe') {
    if (sub) await remove(env.WATCH, key);
    return page(
      'Unsubscribed',
      `You will get no more emails about ${payload.dom}. Your address and the domain are deleted.`,
      env.SITE_ORIGIN,
    );
  }

  if (!sub) return page('Link expired', 'This signup was not found. Please sign up again.', env.SITE_ORIGIN);
  if (!sub.verified) {
    sub.verified = true;
    await put(env.WATCH, key, sub);
    // The first reading goes out from the confirm click, so the baseline is immediate.
    try {
      const snap = await read(payload.dom);
      sub.last = snap;
      await put(env.WATCH, key, sub);
      const unsub = await unsubscribeToken(env, payload.dom, payload.eml);
      await send(env, payload.eml, baselineEmail(payload.dom, snap.level, links(env, undefined, unsub)));
    } catch {
      // Not fatal: the scheduled run takes the first reading instead.
    }
  }
  return page(
    'Confirmed',
    `You are watching ${payload.dom}. We email you only when its protection changes.`,
    env.SITE_ORIGIN,
  );
}

async function handleSignup(request: Request, env: Env): Promise<Response> {
  const site = request.headers.get('sec-fetch-site');
  if (request.headers.get('origin') !== env.ALLOWED_ORIGIN || (site && site !== 'same-origin')) {
    return json(403, { error: 'forbidden' });
  }
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? ''))
    return json(415, { error: 'unsupported_media_type' });
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY) return json(413, { error: 'too_large' });

  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const [perIp, overall] = await Promise.all([env.PER_IP.limit({ key: ip }), env.GLOBAL.limit({ key: 'all' })]);
  if (!perIp.success || !overall.success) return json(429, { error: 'rate_limited' }, { 'retry-after': '60' });

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const result = validate(data);
  if (!result.ok) return json(400, { error: 'invalid', field: result.field });
  // A script's submission is accepted and dropped, so it learns nothing.
  if (result.spam) return json(202, { ok: true });

  const key = await keyFor(result.domain, result.email);
  const existing = await get(env.WATCH, key);
  const now = Date.now();
  // Within the cooldown the answer is the same 202 and nothing is sent: no information leaks and
  // no inbox can be flooded. After it, the link is resent, so a typo never strands anyone.
  if (existing?.confirmSentAt && now - Date.parse(existing.confirmSentAt) < CONFIRM_COOLDOWN) {
    return json(202, { ok: true });
  }
  const sub: Subscription = existing ?? {
    domain: result.domain,
    email: result.email,
    verified: false,
    createdAt: new Date(now).toISOString(),
  };
  const token = await sign(
    { act: 'verify', dom: result.domain, eml: result.email, exp: now + CONFIRM_TTL },
    env.TOKEN_SECRET,
  );
  try {
    await send(env, result.email, confirmEmail(result.domain, links(env, token)));
  } catch (error) {
    console.log(
      JSON.stringify({ event: 'confirm_send_failed', message: error instanceof Error ? error.message : 'unknown' }),
    );
    return json(502, { error: 'send_failed' });
  }
  sub.confirmSentAt = new Date(now).toISOString();
  await put(env.WATCH, key, sub);
  return json(202, { ok: true });
}

// The daily run: re-read every confirmed domain and email on a degradation.
async function run(env: Env): Promise<void> {
  for (const key of await listKeys(env.WATCH)) {
    try {
      const sub = await get(env.WATCH, key);
      if (!sub) continue;
      // An unconfirmed signup older than its confirm link is dropped, so nothing lingers unconsented.
      if (!sub.verified) {
        if (Date.now() - Date.parse(sub.createdAt) > CONFIRM_TTL) await remove(env.WATCH, key);
        continue;
      }
      const snap = await read(sub.domain);
      if (snap.level === 'incomplete') continue; // a lookup did not answer; try again tomorrow
      if (sub.last) {
        const diff = compare(sub.last, snap);
        if (diff.degraded) {
          const unsub = await unsubscribeToken(env, sub.domain, sub.email);
          await send(env, sub.email, alertEmail(sub.domain, diff, links(env, undefined, unsub)));
          sub.lastNotifiedAt = new Date().toISOString();
        }
      }
      sub.last = snap;
      await put(env.WATCH, key, sub);
    } catch (error) {
      console.log(
        JSON.stringify({ event: 'monitor_error', key, message: error instanceof Error ? error.message : 'unknown' }),
      );
    }
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const off = env.MONITOR_ENABLED !== 'true' || !env.TOKEN_SECRET;

    if (url.pathname === '/api/watch/confirm' || url.pathname === '/api/watch/unsubscribe') {
      if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' }, { allow: 'GET' });
      if (off) return page('Not available', 'Monitoring is not switched on yet.', env.SITE_ORIGIN);
      return handleLink(url, env);
    }
    if (url.pathname !== '/api/watch') return json(404, { error: 'not_found' });
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { allow: 'POST' });
    if (off) return json(503, { error: 'unavailable' }, { 'retry-after': '3600' });
    return handleSignup(request, env);
  },

  async scheduled(_event, env, ctx): Promise<void> {
    if (env.MONITOR_ENABLED !== 'true' || !env.TOKEN_SECRET) return;
    ctx.waitUntil(run(env));
  },
} satisfies ExportedHandler<Env>;
