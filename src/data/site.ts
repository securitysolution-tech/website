export const site = {
  name: 'SecuritySolution.tech',
  url: 'https://securitysolution.tech',
  email: 'hello@securitysolution.tech',
  securityEmail: 'security@securitysolution.tech',
  description:
    'Penetration testing, security monitoring and compliance readiness for companies in the United Arab Emirates. You work directly with the people who test.',
  location: 'United Arab Emirates',
  // Set to a domain to run the hero check automatically on page load.
  // Leave null until that domain passes every check.
  autorunDomain: null as string | null,
};

export const contactCta = {
  label: 'Book a scoping call',
  href: '/#contact',
};

export const mailto = (subject?: string) =>
  `mailto:${site.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;

export interface Founder {
  name: string;
  role: string;
  bio: string;
  links: { label: string; href: string; icon: 'linkedin-logo' | 'github-logo' }[];
}

export const founders: Founder[] = [
  {
    name: 'Mohammad Thabet Hassan',
    role: 'Co-founder',
    bio: 'Holds a B.Sc. in Cyber Security from Canadian University Dubai and is first author of 3 IEEE-published papers, on SQL-injection detection, voice-deepfake detection and over-the-air update security. Reports vulnerabilities to open-source maintainers through coordinated disclosure.',
    links: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/mohammadthabet', icon: 'linkedin-logo' },
      { label: 'GitHub', href: 'https://github.com/MohammadThabetHassan', icon: 'github-logo' },
    ],
  },
  {
    name: 'Omar Alraas',
    role: 'Co-founder',
    bio: 'Co-author of the IEEE paper on over-the-air update compromise risk in smart mobility, and builder of the testbed behind it.',
    links: [{ label: 'GitHub', href: 'https://github.com/omaralraas', icon: 'github-logo' }],
  },
];
