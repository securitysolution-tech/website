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

// The contact Worker behind /api/contact (workers/contact). Set to true once the Worker is
// deployed and a real send has been verified (README, "Contact backend"). Until then the form
// prepares the request for the visitor's own email app, which stays the fallback afterwards.
const CONTACT_BACKEND_LIVE = false;

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
