// The counts, in D1 (SQLite). A write is an upsert into a small keyed table, so a repeat is an
// update and the tables stay small. A read is a handful of grouped sums. Nothing here holds an
// address, a User-Agent or a timestamp finer than a day.
import { daysBefore } from './visitor.ts';

export interface Arrival {
  country: string;
  browser: string;
  os: string;
  device: string;
  source: string;
}

/** How long the totals are kept. The visitor hashes go the next night. */
export const RETENTION_DAYS = 400;

/** Counts one page view. Returns true when it was this visitor's first of the day. */
export async function count(
  db: D1Database,
  day: string,
  visitor: string,
  path: string,
  arrival: Arrival,
): Promise<boolean> {
  const seen = await db.prepare('INSERT OR IGNORE INTO visitors (day, vid) VALUES (?1, ?2)').bind(day, visitor).run();
  const fresh = seen.meta.changes > 0;
  const statements = [
    db
      .prepare('INSERT INTO views (day, path, n) VALUES (?1, ?2, 1) ON CONFLICT (day, path) DO UPDATE SET n = n + 1')
      .bind(day, path),
  ];
  if (fresh) {
    statements.push(
      db
        .prepare(
          'INSERT INTO arrivals (day, landing, country, browser, os, device, source, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1) ' +
            'ON CONFLICT (day, landing, country, browser, os, device, source) DO UPDATE SET n = n + 1',
        )
        .bind(day, path, arrival.country, arrival.browser, arrival.os, arrival.device, arrival.source),
    );
  }
  await db.batch(statements);
  return fresh;
}

/** Counts a request that was not a person, by reason only. */
export async function countFiltered(db: D1Database, day: string, reason: string): Promise<void> {
  await db
    .prepare(
      'INSERT INTO filtered (day, reason, n) VALUES (?1, ?2, 1) ON CONFLICT (day, reason) DO UPDATE SET n = n + 1',
    )
    .bind(day, reason)
    .run();
}

/** The daily clean-up: yesterday's visitor hashes, and totals older than the retention. */
export async function purge(db: D1Database, today: string): Promise<void> {
  const oldest = daysBefore(today, RETENTION_DAYS);
  await db.batch([
    db.prepare('DELETE FROM visitors WHERE day < ?1').bind(today),
    db.prepare('DELETE FROM views WHERE day < ?1').bind(oldest),
    db.prepare('DELETE FROM arrivals WHERE day < ?1').bind(oldest),
    db.prepare('DELETE FROM filtered WHERE day < ?1').bind(oldest),
  ]);
}

/** How long contact requests are kept: long enough to follow up, short enough to hold little. */
export const REQUEST_RETENTION_DAYS = 180;

/** The contact log's clean-up, separate from the counts' so that neither can stop the other. */
export async function purgeContact(db: D1Database, today: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM requests WHERE day < ?1').bind(daysBefore(today, REQUEST_RETENTION_DAYS)),
    db.prepare('DELETE FROM attempts WHERE day < ?1').bind(daysBefore(today, RETENTION_DAYS)),
  ]);
}

export interface Row {
  key: string;
  n: number;
}

/** A request sent through the site's form, as the contact Worker kept it. */
export interface ContactRequest {
  receivedAt: string;
  name: string;
  email: string;
  company: string;
  needs: string[];
  timeline: string;
  message: string;
  page: string;
  /** 'sent', 'failed', 'quota', or 'pending' when no result was recorded. */
  delivery: string;
  /** The message id when sent, the error code when not. */
  detail: string;
}

export interface Contact {
  requests: ContactRequest[];
  /** Refused attempts by reason ('invalid', 'spam'): counts only. */
  refused: Row[];
}

const needsOf = (raw: unknown): string[] => {
  try {
    const value: unknown = JSON.parse(String(raw));
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
};

/** The requests in the range, newest first (at most `limit`), and the refused attempts by reason. */
export async function contact(db: D1Database, since: string, until: string, limit = 200): Promise<Contact> {
  const [requests, refused] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        'SELECT received_at, name, email, company, needs, timeline, message, page, delivery, detail FROM requests ' +
          'WHERE day BETWEEN ?1 AND ?2 ORDER BY received_at DESC LIMIT ?3',
      )
      .bind(since, until, limit),
    db
      .prepare(
        'SELECT reason AS key, SUM(n) AS n FROM attempts WHERE day BETWEEN ?1 AND ?2 GROUP BY reason ORDER BY n DESC',
      )
      .bind(since, until),
  ]);
  return {
    requests: (requests?.results ?? []).map((r) => ({
      receivedAt: String(r.received_at),
      name: String(r.name),
      email: String(r.email),
      company: String(r.company),
      needs: needsOf(r.needs),
      timeline: String(r.timeline),
      message: String(r.message),
      page: String(r.page),
      delivery: String(r.delivery),
      detail: String(r.detail),
    })),
    refused: (refused?.results ?? []).map((r) => ({ key: String(r.key), n: Number(r.n) })),
  };
}

export interface Report {
  since: string;
  until: string;
  totals: { views: number; visitors: number };
  days: { day: string; views: number; visitors: number }[];
  pages: Row[];
  landings: Row[];
  sources: Row[];
  countries: Row[];
  devices: Row[];
  browsers: Row[];
  systems: Row[];
  filtered: Row[];
}

const TOP = 12;

/** Every calendar day from `since` to `until`, inclusive. */
export function daysBetween(since: string, until: string): string[] {
  const days: string[] = [];
  for (let day = since; day <= until; day = daysBefore(day, -1)) days.push(day);
  return days;
}

/** The totals for the days from `since` to `until` (inclusive, Dubai days). */
export async function report(db: D1Database, since: string, until: string): Promise<Report> {
  const range = 'WHERE day BETWEEN ?1 AND ?2';
  // Column and table names are fixed strings below, never input.
  const grouped = (column: string, table: string) =>
    db
      .prepare(
        `SELECT ${column} AS key, SUM(n) AS n FROM ${table} ${range} GROUP BY ${column} ORDER BY n DESC, key LIMIT ${TOP}`,
      )
      .bind(since, until);
  const perDay = (table: string) =>
    db.prepare(`SELECT day, SUM(n) AS n FROM ${table} ${range} GROUP BY day`).bind(since, until);

  const [viewDays, arrivalDays, pages, landings, sources, countries, devices, browsers, systems, filtered] =
    await db.batch<{ key?: string; day?: string; n: number }>([
      perDay('views'),
      perDay('arrivals'),
      grouped('path', 'views'),
      grouped('landing', 'arrivals'),
      grouped('source', 'arrivals'),
      grouped('country', 'arrivals'),
      grouped('device', 'arrivals'),
      grouped('browser', 'arrivals'),
      grouped('os', 'arrivals'),
      grouped('reason', 'filtered'),
    ]);

  const rows = (result: { results: { key?: string; n: number }[] } | undefined): Row[] =>
    (result?.results ?? []).map((r) => ({ key: String(r.key ?? ''), n: Number(r.n) }));
  const byDay = (result: { results: { day?: string; n: number }[] } | undefined) =>
    new Map((result?.results ?? []).map((r) => [String(r.day), Number(r.n)]));

  const views = byDay(viewDays);
  const visitors = byDay(arrivalDays);
  const days = daysBetween(since, until).map((day) => ({
    day,
    views: views.get(day) ?? 0,
    visitors: visitors.get(day) ?? 0,
  }));

  return {
    since,
    until,
    totals: {
      views: days.reduce((sum, d) => sum + d.views, 0),
      visitors: days.reduce((sum, d) => sum + d.visitors, 0),
    },
    days,
    pages: rows(pages),
    landings: rows(landings),
    sources: rows(sources),
    countries: rows(countries),
    devices: rows(devices),
    browsers: rows(browsers),
    systems: rows(systems),
    filtered: rows(filtered),
  };
}
