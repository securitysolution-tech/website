// Checks a submitted request field by field. Pure, so the tests run it on Node without
// the Workers runtime. Field problems come back as short codes; the form owns the wording.
import { limits, timelines, type ContactRequest } from '../../../src/data/contact.ts';
import { services } from '../../../src/data/services.ts';

/** The needs the form offers, in the buyer's words. Anything else is refused. */
export const knownNeeds = services.map((s) => s.plainName);

export interface Submission extends ContactRequest {
  /** Path of the page the form was on, or empty. */
  page: string;
  /** Milliseconds the page was open before submitting, when the browser reported it. */
  elapsed: number | null;
}

export type FieldCode = 'required' | 'too_long' | 'invalid';

export type Validation =
  | { ok: true; value: Submission; spam: boolean }
  | { ok: false; fields: Partial<Record<keyof ContactRequest | 'body', FieldCode>> };

// Printable text only: tabs and line breaks are allowed, other control characters are not.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// The same shape the form checks before sending.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE = /^\/[\w\-./]*$/;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function validate(data: unknown): Validation {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, fields: { body: 'invalid' } };
  const input = data as Record<string, unknown>;
  const fields: Partial<Record<keyof ContactRequest | 'body', FieldCode>> = {};

  const name = text(input.name).replace(/\s+/g, ' ');
  if (!name) fields.name = 'required';
  else if (name.length > limits.name) fields.name = 'too_long';
  else if (CONTROL.test(name)) fields.name = 'invalid';

  const email = text(input.email);
  if (!email) fields.email = 'required';
  else if (email.length > limits.email) fields.email = 'too_long';
  else if (!EMAIL.test(email)) fields.email = 'invalid';

  const company = text(input.company).replace(/\s+/g, ' ');
  if (company.length > limits.company) fields.company = 'too_long';
  else if (CONTROL.test(company)) fields.company = 'invalid';

  let needs: string[] = [];
  if (input.needs !== undefined) {
    if (!Array.isArray(input.needs) || input.needs.some((n) => !knownNeeds.includes(n as string))) {
      fields.needs = 'invalid';
    } else {
      needs = [...new Set(input.needs as string[])];
      if (needs.length > limits.needs) fields.needs = 'too_long';
    }
  }

  const when = text(input.when);
  if (!(timelines as readonly string[]).includes(when)) fields.when = 'invalid';

  const message = text(input.message).replace(/\r\n?/g, '\n');
  if (message.length > limits.message) fields.message = 'too_long';
  else if (CONTROL.test(message)) fields.message = 'invalid';

  if (Object.keys(fields).length) return { ok: false, fields };

  // The honeypot is a field people never see; anything in it means a script filled the form.
  const spam = text(input.website) !== '';
  const elapsed = typeof input.elapsed === 'number' && Number.isFinite(input.elapsed) && input.elapsed >= 0 ? Math.round(input.elapsed) : null;
  const page = text(input.page);

  return {
    ok: true,
    spam,
    value: {
      name,
      email,
      company,
      needs,
      when,
      message,
      elapsed,
      page: PAGE.test(page) && page.length <= limits.page ? page : '',
    },
  };
}
