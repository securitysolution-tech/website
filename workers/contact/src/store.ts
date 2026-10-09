// A copy of every request in the dashboard's database (the visit counter's D1, bound here as DB),
// kept before the email goes so that none is lost if the email fails, with what happened to the
// email. Refused attempts are counted by reason, never kept. The founders read both at /api/visits.
// The schema is workers/visits/migrations/0002_contact_requests.sql.
import type { Submission } from './validate.ts';

export type Delivery = 'pending' | 'sent' | 'failed' | 'quota';
/** Too many from one network is not counted: a flood of those would spend the database's daily writes. */
export type Refusal = 'invalid' | 'spam';

/** The calendar day in Dubai (UTC+4, no daylight saving), the dashboard's day. */
export const dubaiDay = (now: Date): string => new Date(now.getTime() + 4 * 3_600_000).toISOString().slice(0, 10);

/** Keeps the request and returns its id. */
export async function saveRequest(db: D1Database, request: Submission, received: Date): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO requests (id, received_at, day, name, email, company, needs, timeline, message, page, delivery) ' +
        'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)',
    )
    .bind(
      id,
      received.toISOString(),
      dubaiDay(received),
      request.name,
      request.email,
      request.company,
      JSON.stringify(request.needs),
      request.when,
      request.message,
      request.page,
      'pending' satisfies Delivery,
    )
    .run();
  return id;
}

/** Records what happened to the request's email: the message id when sent, the error code when not. */
export async function markDelivery(db: D1Database, id: string, delivery: Delivery, detail: string): Promise<void> {
  await db.prepare('UPDATE requests SET delivery = ?2, detail = ?3 WHERE id = ?1').bind(id, delivery, detail).run();
}

export async function countRefusal(db: D1Database, now: Date, reason: Refusal): Promise<void> {
  await db
    .prepare(
      'INSERT INTO attempts (day, reason, n) VALUES (?1, ?2, 1) ON CONFLICT (day, reason) DO UPDATE SET n = n + 1',
    )
    .bind(dubaiDay(now), reason)
    .run();
}
