export const site = {
  name: 'SecuritySolution.tech',
  url: 'https://securitysolution.tech',
  email: 'hello@securitysolution.tech',
  securityEmail: 'security@securitysolution.tech',
  description:
    'Penetration testing, security monitoring and compliance readiness for companies in the United Arab Emirates. You work directly with the people who test.',
  location: 'United Arab Emirates',
  // The hero check runs on this domain when the page loads. Keep it passing.
  autorunDomain: 'securitysolution.tech' as string | null,
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
  highlights: string[];
  links: { label: string; href: string; icon: 'linkedin-logo' | 'github-logo' }[];
}

export const founders: Founder[] = [
  {
    name: 'Mohammad Thabet Hassan',
    role: 'Co-founder',
    highlights: ['B.Sc. Cyber Security, Canadian University Dubai', '3 IEEE-published papers', 'Coordinated vulnerability disclosure'],
    bio: 'Holds a B.Sc. in Cyber Security from Canadian University Dubai and is first author of 3 IEEE-published papers, on SQL-injection detection, voice-deepfake detection and over-the-air update security. Reports vulnerabilities to open-source maintainers through coordinated disclosure.',
    links: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/mohammadthabet', icon: 'linkedin-logo' },
      { label: 'GitHub', href: 'https://github.com/MohammadThabetHassan', icon: 'github-logo' },
    ],
  },
  {
    name: 'Omar Alraas',
    role: 'Co-founder',
    highlights: ['IEEE co-author, OTA update security', 'Built the OTA testbed'],
    bio: 'Co-author of the IEEE paper on over-the-air update compromise risk in smart mobility, and builder of the testbed behind it.',
    links: [{ label: 'GitHub', href: 'https://github.com/omaralraas', icon: 'github-logo' }],
  },
];
