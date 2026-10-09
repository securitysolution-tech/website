// Facts about the company that do not change with the language. The words (tagline,
// description, the call to action) live in src/i18n.
export const site = {
  name: 'SecuritySolution.tech',
  url: 'https://securitysolution.tech',
  email: 'hello@securitysolution.tech',
  securityEmail: 'security@securitysolution.tech',
  // The hero check runs on this domain when the page loads. Keep it passing.
  autorunDomain: 'securitysolution.tech' as string | null,
};

// The contact Worker behind /api/contact (workers/contact). On: the form sends the request
// itself. The Worker keeps a copy of every request in the dashboard's database before emailing
// it, so none is lost if an email fails (README, "Contact backend"). When sending fails the form
// still prepares the request for the visitor's own email app.
const CONTACT_BACKEND_LIVE = true;

export const contactBackend = {
  // PUBLIC_CONTACT_BACKEND=1 or =0 at build time overrides the switch, to test either state locally.
  live:
    import.meta.env.PUBLIC_CONTACT_BACKEND === undefined
      ? CONTACT_BACKEND_LIVE
      : import.meta.env.PUBLIC_CONTACT_BACKEND === '1',
  endpoint: '/api/contact',
};

// The self-serve posture monitor behind /api/watch (workers/monitor). Set to true once the Worker
// is deployed with its KV namespace, email binding and secret (README, "Posture monitor"). While
// false, the signup is not rendered and the privacy page does not mention it.
const MONITOR_LIVE = false;

export const monitor = {
  // PUBLIC_MONITOR=1 or =0 at build time overrides the switch, to test either state locally.
  live: import.meta.env.PUBLIC_MONITOR === undefined ? MONITOR_LIVE : import.meta.env.PUBLIC_MONITOR === '1',
  endpoint: '/api/watch',
};

// The visit counter behind /api/hit (workers/visits): a cookie-free count of page views, kept on our
// own Cloudflare account and readable by the founders only. Set to true once the Worker is deployed
// and a real visit has shown up on its dashboard (README, "Visit counter"). While false, no page sends
// anything and the privacy page keeps its "no analytics" wording.
const VISITS_LIVE = true;

export const visits = {
  // PUBLIC_VISITS=1 or =0 at build time overrides the switch, to test either state locally.
  live: import.meta.env.PUBLIC_VISITS === undefined ? VISITS_LIVE : import.meta.env.PUBLIC_VISITS === '1',
  endpoint: '/api/hit',
};

export const mailto = (subject?: string) =>
  `mailto:${site.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;

export interface Founder {
  id: string;
  name: string;
  role: string;
  bio: string;
  highlights: string[];
  links: { label: string; href: string; icon: 'linkedin-logo' | 'github-logo' }[];
}

export const founders: Founder[] = [
  {
    id: 'mohammad',
    name: 'Mohammad Thabet Hassan',
    role: 'Co-founder',
    highlights: [
      'B.Sc. Cyber Security, Canadian University Dubai',
      '3 IEEE-published papers',
      'Coordinated vulnerability disclosure',
    ],
    bio: 'First author of the three papers, on SQL-injection detection, voice-deepfake detection and over-the-air update security. Reports the vulnerabilities he finds in open-source software to its maintainers before anything is published.',
    links: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/mohammadthabet', icon: 'linkedin-logo' },
      { label: 'GitHub', href: 'https://github.com/MohammadThabetHassan', icon: 'github-logo' },
    ],
  },
  {
    id: 'omar',
    name: 'Omar Alraas',
    role: 'Co-founder',
    highlights: ['IEEE co-author, OTA update security', 'Built the OTA testbed'],
    bio: 'Co-author of the IEEE paper on over-the-air update compromise risk in smart mobility, and builder of the testbed behind it.',
    links: [{ label: 'GitHub', href: 'https://github.com/omaralraas', icon: 'github-logo' }],
  },
];
