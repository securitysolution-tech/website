// The scoping request, defined once for the form in the browser, the message it composes
// for the visitor's email app, and the contact Worker in workers/contact, which sends the
// same message from the inbox side. This file imports nothing: the Worker's tests load it
// on Node directly, and the browser bundle should carry only what it uses.

/** When the visitor wants to start. The first entry is the form's default. These are the
 * values the form sends in every language; the labels live in the dictionaries. */
export const timelines = ['As soon as possible', 'Within a month', 'Within three months', 'Just exploring'] as const;
export type Timeline = (typeof timelines)[number];

/** Field limits, applied by the form and enforced again by the Worker. */
export const limits = {
  name: 120,
  email: 254,
  company: 200,
  message: 600,
  needs: 8,
  /** The path of the page the request came from. */
  page: 200,
  /** The JSON body the Worker accepts, in bytes. */
  body: 8 * 1024,
};

export interface ContactRequest {
  name: string;
  email: string;
  /** Empty when not given. */
  company: string;
  /** Service names as the form labels them, in the form's order. */
  needs: string[];
  when: string;
  /** Empty when not given. */
  message: string;
}

export const subjectFor = (request: ContactRequest) =>
  `Scoping call request${request.company ? `: ${request.company}` : ''}`;

/**
 * The plain-text message, identical whether the visitor's email app or the Worker sends it.
 * Lines end in CRLF, as email expects. `extra` lines go after the sign-off (the Worker adds
 * the page and the time there).
 */
export function formatRequest(request: ContactRequest, extra: string[] = []): string {
  const lines = [
    `Name: ${request.name}`,
    `Email: ${request.email}`,
    `Company: ${request.company || 'not given'}`,
    `Needs: ${request.needs.length ? request.needs.join(', ') : 'not sure yet'}`,
    `Timeline: ${request.when}`,
  ];
  if (request.message) lines.push('', request.message);
  lines.push('', 'Sent from the scoping request form on securitysolution.tech', ...extra);
  return lines.join('\r\n');
}
