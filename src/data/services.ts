export interface ServiceItem {
  name: string;
  text: string;
}

export interface Fact {
  label: string;
  value: string;
}

export interface Service {
  slug: string;
  name: string;
  /** The buyer's term for the service: page heading and form label. */
  plainName: string;
  icon: 'crosshair' | 'shield-check' | 'scales' | 'cloud-check';
  /** One sentence for the home page index. */
  summary: string;
  /** One line under "What we cover" on the service page. */
  coverLead: string;
  /** Standards and guides the work is measured against. */
  standards: string[];
  /** Plain facts for the service page header. */
  facts: Fact[];
  /** Opening paragraph on the service page. */
  intro: string;
  /** Page <title> and meta description. */
  seoTitle: string;
  seoDescription: string;
  items: ServiceItem[];
  deliverables: string[];
  goodFit: string[];
  note?: string;
}

export const services: Service[] = [
  {
    slug: 'offensive-testing',
    icon: 'crosshair',
    name: 'Offensive testing',
    plainName: 'Penetration testing',
    summary:
      'We test your web apps, APIs, networks and cloud the way a real attacker would, then show you how to close every gap we find.',
    coverLead: 'Six kinds of test, each scoped to what you expose and how your team works.',
    standards: ['OWASP Web Security Testing Guide', 'OWASP API Security Top 10', 'OWASP MASVS'],
    facts: [
      { label: 'Typical duration', value: '1 to 2 weeks for one web application' },
      { label: 'Price', value: 'Fixed quote after a 30-minute scoping call' },
      { label: 'Report', value: 'Executive summary plus every finding with fix steps' },
      { label: 'Retest', value: 'Included, with an updated report' },
    ],
    intro:
      'A penetration test answers one question: what could someone do to your business with the access the internet already gives them? We find out under a written scope, stop at the agreed limits, and give you evidence your team can act on.',
    seoTitle: 'Penetration testing in the UAE',
    seoDescription:
      'Web, API, mobile and network penetration testing for UAE companies, with plain-language reports and a retest of every fix.',
    items: [
      {
        name: 'Web application testing',
        text: 'Authentication, access control, injection, business logic and session handling, tested against the OWASP Web Security Testing Guide.',
      },
      {
        name: 'API testing',
        text: 'REST and GraphQL endpoints checked for broken authorization, mass assignment and data exposure, following the OWASP API Security Top 10.',
      },
      {
        name: 'Mobile app testing',
        text: 'Android and iOS apps reviewed for insecure storage, weak transport security and the API calls behind them, based on OWASP MASVS.',
      },
      {
        name: 'External network testing',
        text: 'Everything you expose to the internet: open services, VPN and remote-access gateways, mail servers and forgotten hosts.',
      },
      {
        name: 'Internal network testing',
        text: 'What an attacker could reach after phishing one employee, including Active Directory weaknesses, lateral movement and privilege escalation.',
      },
      {
        name: 'Vulnerability assessment',
        text: 'A faster, broader scan-and-verify review when you need a baseline before a full penetration test.',
      },
    ],
    deliverables: [
      'An executive summary written for management',
      'Every finding with severity, evidence, business impact and fix steps',
      'A retest of each fix, with an updated report you can share with customers and auditors',
    ],
    goodFit: [
      'You are launching or changing a customer-facing app',
      'A customer, insurer or regulator asked for a penetration test report',
      'You have never had an outside test',
    ],
  },
  {
    slug: 'defensive-operations',
    icon: 'shield-check',
    name: 'Defensive operations',
    plainName: 'Security monitoring',
    summary:
      'We set up monitoring that spots attacks early, prepare your team for incidents, and harden the systems attackers try first.',
    coverLead: 'Monitoring, playbooks and hardening that a small team can actually run.',
    standards: [],
    facts: [
      { label: 'Price', value: 'Fixed quote after a 30-minute scoping call' },
      { label: 'You keep', value: 'Monitoring configured and documented in your environment' },
      { label: 'Playbooks', value: 'For the incidents you are most likely to face' },
      { label: 'NDA', value: 'Yours or ours, signed first' },
    ],
    intro:
      'Prevention fails eventually. What matters then is how fast you notice and how well you respond. We build the monitoring, playbooks and hardening a small team can actually run.',
    seoTitle: 'Security monitoring and incident readiness',
    seoDescription:
      'Security monitoring setup, incident response readiness, website hardening and email security for UAE companies.',
    items: [
      {
        name: 'Security monitoring setup',
        text: 'Central logging and alerting for your servers, cloud accounts and Microsoft 365 or Google Workspace, tuned so an alert means something.',
      },
      {
        name: 'Incident response readiness',
        text: 'Playbooks for the incidents you are most likely to face, a clear contact tree, and a tabletop exercise to test both with your team.',
      },
      {
        name: 'Incident support',
        text: 'If something has already happened, we help you contain it, preserve evidence and work out what was affected.',
      },
      {
        name: 'Website and WordPress hardening',
        text: 'Updates, plugin review, admin access controls, backups and a web application firewall for the sites attackers scan every day.',
      },
      {
        name: 'Email security',
        text: 'SPF, DKIM and DMARC set up correctly, so nobody can send email in your company’s name.',
      },
    ],
    deliverables: [
      'Monitoring configured and documented in your environment',
      'Incident playbooks and a report from the exercise',
      'A hardening record of what we changed and why',
    ],
    goodFit: [
      'Nobody watches your logs today',
      'You run WordPress or other public websites',
      'Your email domain has been spoofed, or you are not sure whether it can be',
    ],
  },
  {
    slug: 'governance-compliance',
    icon: 'scales',
    name: 'Governance & compliance',
    plainName: 'Compliance readiness',
    summary:
      'We get you ready for the security standards your customers and regulators ask about, with policies and training your staff will follow.',
    coverLead: 'The standards your customers and regulators name, and the paperwork behind them.',
    standards: ['UAE Information Assurance Standard', 'Dubai ISR', 'UAE PDPL', 'ISO/IEC 27001'],
    facts: [
      { label: 'Price', value: 'Fixed quote after a 30-minute scoping call' },
      { label: 'Output', value: 'Gap assessment and a remediation plan ordered by risk' },
      { label: 'Certification', value: 'Issued by an accredited body; we prepare you for it' },
      { label: 'NDA', value: 'Yours or ours, signed first' },
    ],
    intro:
      'Compliance work goes faster when someone has already read the standard closely. We map where you are, write what is missing, and prepare you for the audit.',
    seoTitle: 'UAE IA, ISO 27001 and PDPL readiness',
    seoDescription:
      'Readiness for the UAE Information Assurance Standard, Dubai ISR, UAE PDPL and ISO/IEC 27001, plus policies, awareness training and phishing simulation.',
    items: [
      {
        name: 'UAE Information Assurance Standard',
        text: 'A gap assessment against the UAE IA controls, with a remediation plan ordered by risk.',
      },
      {
        name: 'Dubai Information Security Regulation',
        text: 'Readiness support for Dubai government entities and their suppliers working to the DESC ISR.',
      },
      {
        name: 'UAE Personal Data Protection Law',
        text: 'A practical review of how you collect, store and share personal data under Federal Decree-Law No. 45 of 2021.',
      },
      {
        name: 'ISO/IEC 27001',
        text: 'Scoping, risk assessment, Statement of Applicability and the core policies of an information security management system.',
      },
      {
        name: 'Security policies',
        text: 'Short, clear policies for access, passwords, devices, backups and incident reporting, written for your company rather than copied from a template.',
      },
      {
        name: 'Awareness training and phishing simulation',
        text: 'Short sessions for staff and realistic phishing exercises, with results you can show an auditor.',
      },
    ],
    deliverables: [
      'A gap assessment with a prioritised plan',
      'Policy documents ready for management approval',
      'Training records and phishing exercise results',
    ],
    goodFit: [
      'A tender or customer asked for ISO 27001 or UAE IA alignment',
      'You handle personal data of UAE residents',
      'You need policies in place before an audit',
    ],
    note: 'We prepare you for audits. Certification itself is issued by an accredited certification body.',
  },
  {
    slug: 'ai-cloud-security',
    icon: 'cloud-check',
    name: 'AI & cloud security',
    plainName: 'AI and cloud security',
    summary:
      'We test the AI features and cloud accounts your business now depends on, before someone else finds the weak point.',
    coverLead: 'The AI features and cloud accounts your business depends on, reviewed where attackers look first.',
    standards: ['OWASP Top 10 for LLM Applications', 'CIS Benchmarks'],
    facts: [
      { label: 'Price', value: 'Fixed quote after a 30-minute scoping call' },
      { label: 'Report', value: 'Findings with evidence and fix steps' },
      { label: 'Retest', value: 'Included once the changes are made' },
      { label: 'NDA', value: 'Yours or ours, signed first' },
    ],
    intro:
      'AI assistants and cloud platforms add new ways in. A chatbot can be talked into leaking data, and one misconfigured storage bucket can expose everything. We test both.',
    seoTitle: 'AI application and cloud security testing',
    seoDescription:
      'LLM application testing for prompt injection and data leakage, plus AWS, Azure and Microsoft 365 configuration reviews for UAE companies.',
    items: [
      {
        name: 'LLM application testing',
        text: 'Prompt injection, data leakage, unsafe tool use and jailbreaks, tested against the OWASP Top 10 for LLM Applications.',
      },
      {
        name: 'AI integration review',
        text: 'How your AI features handle customer data, which models and third parties see it, and what access their tools have.',
      },
      {
        name: 'AWS and Azure configuration review',
        text: 'Identity, storage, network exposure, logging and encryption settings, checked against the CIS Benchmarks.',
      },
      {
        name: 'Identity and access review',
        text: 'Who can do what in your cloud, Microsoft 365 or Google Workspace accounts, including stale accounts, risky permissions and missing MFA.',
      },
    ],
    deliverables: [
      'Findings with evidence and fix steps for each AI feature or cloud account',
      'A prioritised list of configuration changes',
      'A retest once the changes are made',
    ],
    goodFit: [
      'You added a chatbot or AI assistant to your product',
      'You moved to AWS or Azure without a security review',
      'You use Microsoft 365 or Google Workspace and have never audited access',
    ],
  },
];
