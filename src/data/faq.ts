export interface FaqItem {
  q: string;
  a: string;
  /** Where the question is shown: the home page and the service pages it applies to. */
  on: string[];
}

export const faqs: FaqItem[] = [
  {
    q: 'Do you only check email and DNS?',
    a: 'No. The check on this page reads what is public about your domain in five seconds, and it is free. A penetration test goes inside, under a written scope: web apps, APIs, mobile apps, networks, cloud accounts and AI features. Security monitoring and compliance readiness are separate services, listed above.',
    on: ['home', 'offensive-testing'],
  },
  {
    q: 'How much does a penetration test cost?',
    a: 'It depends on the scope: how many applications, user roles, APIs and IP addresses are in play. After a 30-minute scoping call you get a written scope and a fixed quote, so the price does not change halfway through.',
    on: ['home', 'offensive-testing', 'ai-cloud-security'],
  },
  {
    q: 'How long does an engagement take?',
    a: 'A single web application usually takes 1 to 2 weeks, including the report. Larger scopes take longer. We agree the testing window and the report date in the written scope.',
    on: ['home', 'offensive-testing'],
  },
  {
    q: 'Will testing disrupt our systems?',
    a: 'We test inside the agreed window, avoid destructive techniques unless you approve them in writing, and stop straight away if a system becomes unstable. If production is sensitive, we can test a staging copy instead.',
    on: ['home', 'offensive-testing', 'ai-cloud-security'],
  },
  {
    q: 'Do you sign an NDA?',
    a: 'Yes. We sign your NDA, or provide ours, before you share any details about your systems.',
    on: ['home', 'offensive-testing', 'defensive-operations', 'governance-compliance', 'ai-cloud-security'],
  },
  {
    q: 'What do we receive at the end?',
    a: 'A report with an executive summary for management and, for every finding, the evidence, the business impact and the steps to fix it. Once your team has made the fixes, we retest and update the report.',
    on: ['home', 'offensive-testing', 'ai-cloud-security'],
  },
];
