// Builds the email for one request. Pure, like validate.ts, so the tests cover it on Node.
import { formatRequest, subjectFor } from '../../../src/data/contact.ts';
import type { Submission } from './validate.ts';

export interface Delivery {
  /** The address the email is sent from; must be on the routing domain. */
  from: string;
  /** The inbox the request goes to: a verified destination address. */
  to: string;
  /** The site's origin, for the page link. */
  origin: string;
  received: Date;
}

/** Requests sent faster than this after the page opened are marked, not dropped. */
export const QUICK_MS = 3000;

export function describeTiming(elapsed: number | null): string {
  if (elapsed === null) return 'Form time: not reported';
  const seconds = Math.round(elapsed / 1000);
  const human = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return `Form time: ${human}${elapsed < QUICK_MS ? ' (quick: check that this is a person)' : ''}`;
}

export function buildEmail(request: Submission, delivery: Delivery) {
  const received = delivery.received.toISOString().slice(0, 16).replace('T', ' ');
  return {
    from: { name: 'SecuritySolution.tech website', email: delivery.from },
    to: delivery.to,
    // A reply in the inbox goes straight back to the visitor.
    replyTo: { name: request.name, email: request.email },
    subject: subjectFor(request),
    text: formatRequest(request, [
      `Page: ${delivery.origin}${request.page || '/'}`,
      `Received: ${received} UTC`,
      describeTiming(request.elapsed),
    ]),
  };
}
