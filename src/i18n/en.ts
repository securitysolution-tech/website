// Every piece of interface text, in English. Long-form content (services, questions, the
// founders' bios) stays in src/data and is overlaid per locale in index.ts. The Arabic
// dictionary in ar.ts is typed against this one, so a missing translation fails the build.
//
// Values with braces ({domain}, {n}) are templates for the client scripts; see client.ts.

export const en = {
  lang: 'en',
  dir: 'ltr',
  ogLocale: 'en_AE',

  site: {
    tagline: 'Penetration testing, security monitoring and compliance readiness for UAE companies',
    /** A shorter line for the browser tab, kept under 70 characters with the name. */
    titleTagline: 'Penetration testing for UAE companies',
    description:
      'Penetration testing, security monitoring and compliance readiness for companies in the United Arab Emirates. You work directly with the people who test.',
    location: 'United Arab Emirates',
    /** The one call to action, everywhere it appears. */
    cta: 'Book a scoping call',
    /** The same call, where there is no room for the whole phrase. */
    ctaShort: 'Book a call',
    skip: 'Skip to content',
  },

  nav: {
    primary: 'Primary',
    menu: 'Menu',
    services: 'Services',
    approach: 'Approach',
    team: 'Team',
    faq: 'FAQ',
  },

  footer: {
    blurb:
      'Penetration testing, security monitoring and compliance readiness for companies in the United Arab Emirates.',
    services: 'Services',
    company: 'Company',
    trust: 'Trust',
    report: 'Report a vulnerability',
    privacy: 'Privacy',
    securityTxt: 'security.txt',
    source: 'Source code',
    legal: 'This site sets no cookies and loads no third-party scripts.',
  },

  hero: {
    headline: 'Can anyone send email as your company?',
    lead: 'Type your domain for a five-second read of what an attacker sees. A penetration test goes much further: web apps, APIs, mobile apps, networks, cloud and people, by the same team you talk to.',
    example: 'See a passing domain: ours',
    /** The headline once a check has run, by how well spoofing is held off. */
    result: {
      weak: '{domain}: anyone can send email as you.',
      partial: '{domain}: spoofing is only partly blocked.',
      strong: '{domain}: spoofing is blocked.',
    },
  },

  check: {
    title: 'Check your domain',
    label: 'Company domain',
    placeholder: 'yourcompany.ae',
    run: 'Check now',
    retry: 'Try again',
    privacy:
      'Runs in your browser through Cloudflare’s public DNS resolver, with Google Public DNS as a fallback. We never receive the domain you type.',
    privacyLink: 'Privacy',
    noscript: 'The check needs JavaScript, which is turned off in this browser.',
    resultsFor: 'Results for',
    ownDomain: ', our own domain. Try yours.',
    resultsLabel: 'Check results',
    show: 'Show record',
    hide: 'Hide record',
    notRun: 'Not run',
    checking: 'Checking…',
    looking: 'Looking this up…',
    verdict: 'Spoofing protection:',
    fixFirst: 'Fix first',
    /** What an attacker could send, previewed with the results. Nothing is sent. */
    spoof: {
      title: 'What an attacker could send',
      from: 'From',
      to: 'To',
      subject: 'Subject',
      fromName: 'Finance',
      toLine: 'your team',
      subjectLine: 'Invoice due today',
      body: 'Please settle the attached invoice by the end of the day.',
      delivered: 'Would be delivered',
      blocked: 'Blocked',
      quarantined: 'Sent to spam',
      deliveredNote:
        'Anyone can send a message like this with your name on it. Your domain does not tell receiving servers to refuse it.',
      blockedNote: 'Your domain tells receiving servers to refuse mail like this.',
      quarantinedNote:
        'Your domain tells receiving servers to put mail like this in spam. Refusing it outright is one line away.',
      note: 'A preview, in your browser. Nothing is sent.',
    },
    /** Passing the results on: a link to them, or an email to the people who can fix them. */
    share: {
      copy: 'Copy a link to these results',
      copied: 'Link copied',
      email: 'Email this to your IT team',
      subject: 'Domain check: {domain}',
      intro: 'Domain check for {domain}, run on securitysolution.tech.',
      fixFirst: 'Fix first:',
      results: 'All results:',
      again: 'Run it again: {url}',
      /** Orders the managed watch: the request lands in the inbox and the domain joins posture-watch. */
      watch: 'Ask us to watch this domain',
      watchMessage: 'Please watch {domain} and tell me when its email or DNS protection changes.',
    },
    /** The free tier: an email when the protection changes. Rendered only when the monitor is live. */
    alerts: {
      title: 'Email me when this changes',
      lead: 'Free. We re-check every day and email you only when the protection drops. You confirm by email first, and one click stops it.',
      email: 'Work email',
      submit: 'Watch this domain',
      sending: 'Sending…',
      sent: 'Check your inbox for a confirmation link. Nothing more is sent until you confirm.',
      invalidEmail: 'Enter a valid email address.',
      failed: 'That did not go through. Try again in a minute, or ask us to watch it for you.',
      disclosure: 'We store this domain and your address only to send these emails. Unsubscribing deletes both.',
    },
    /** The record lines behind the headline, when a domain has none. */
    noRecord: 'no {tech} record',
    signed: 'signed and validated',
    unsigned: 'not signed',
    checks: {
      dmarc: {
        title: 'Spoofing protection',
        tech: 'DMARC',
        about: 'Tells receiving mail servers what to do with email that fakes your domain.',
      },
      spf: {
        title: 'Approved senders',
        tech: 'SPF',
        about: 'Lists the servers allowed to send email for your domain.',
      },
      mx: { title: 'Mail servers', tech: 'MX', about: 'Shows who handles the email sent to your domain.' },
      dnssec: {
        title: 'Signed DNS',
        tech: 'DNSSEC',
        about: 'Protects the answers your DNS gives out from being forged.',
      },
      caa: {
        title: 'Certificate lock',
        tech: 'CAA',
        about: 'Limits which companies may issue HTTPS certificates for your domain.',
      },
      mtasts: {
        title: 'Encrypted mail delivery',
        tech: 'MTA-STS',
        about: 'Lets you require encryption for email on its way to you.',
      },
    },
    labels: { pass: 'Pass', warn: 'Warning', fail: 'Fail', info: 'Info' },
    levels: { strong: 'Strong', partial: 'Partial', weak: 'Weak', incomplete: 'Incomplete' },
    score: '{passed} of {scored} checks passed',
    incompleteScore: 'Some lookups did not complete. Run the check again in a moment.',
    announceDone: 'Check complete for {domain}. Spoofing protection is {level}. {passed} of {scored} checks passed.',
    announceIncomplete:
      'Check incomplete for {domain}. Some lookups did not complete. Run the check again in a moment.',
    fixOne: '1 item to fix first.',
    fixMany: '{count} items to fix first.',
    errors: {
      empty: 'Enter a domain name, for example yourcompany.ae.',
      notFound: '{domain} does not exist in DNS. Check the spelling and try again.',
      resolver:
        'The DNS lookups could not be completed. Your network may block DNS-over-HTTPS, so try again on another connection.',
    },
    summaries: {
      inherited: 'Inherited from {org}. ',
      dmarcNone:
        'No DMARC policy. Anyone can send email that claims to come from this domain, and receiving servers are not told to stop it.',
      dmarcMany: '{via}{n} DMARC records found. Receivers ignore DMARC when there is more than one.',
      dmarcPartial:
        '{via}Policy is {policy}, but only for {pct}% of messages. The rest of the spoofed mail is still delivered.',
      dmarcReject: '{via}Policy is reject. Receivers that check DMARC block email that fakes this domain.',
      dmarcQuarantine:
        '{via}Policy is quarantine. Receivers that check DMARC send email that fakes this domain to spam.',
      dmarcNone2: '{via}Policy is none, which only monitors. Email that fakes this domain is still delivered.',
      dmarcInvalid: '{via}The DMARC record has no valid policy (p=), so receivers ignore it.',
      spfNone: 'No SPF record. Receiving servers cannot tell which servers are allowed to send email for this domain.',
      spfMany: '{n} SPF records found. That is treated as an error, so SPF fails for every message.',
      spfLookups: 'This record needs at least {n} DNS lookups. The limit is 10, so receivers treat SPF as an error.',
      spfStrict: 'Strict policy (-all). Mail from servers not on the list fails SPF.',
      spfSoftOk: 'Soft fail (~all), backed by an enforced DMARC policy. That combination is fine.',
      spfSoftWeak:
        'Soft fail (~all) without an enforced DMARC policy. Mail from unlisted servers is usually still delivered.',
      spfPlusAll: 'The record ends in +all, which allows any server on the internet to send as this domain.',
      spfRedirect: 'The policy is delegated to {target}.',
      spfNoAll: 'The record has no enforcing “all” rule, so mail from unlisted servers is not rejected.',
      mxNone: 'No mail servers are listed, so this domain does not receive email.',
      mxNull: 'Null MX: the domain states that it never receives email.',
      mxProvider: 'Email is handled by {provider}.',
      mxHost: 'Email is delivered to {host}.',
      dnssecOk: 'Signed and validated. Answers for this domain cannot be forged in transit.',
      dnssecNo: 'Not signed. An attacker on the network path could forge DNS answers for this domain.',
      caaNone:
        'No CAA record, so any certificate authority may issue certificates for this domain. One DNS record fixes it.',
      caaIssuers: 'Only {issuers} may issue certificates.',
      caaRestricted: 'Certificate issuance is restricted.',
      mtastsNotNeeded: 'Not needed, because this domain does not receive email.',
      mtastsOk:
        'Published. Senders that support MTA-STS read your policy; in enforce mode they deliver only over an encrypted, verified connection.',
      mtastsNo:
        'Not set. Optional hardening that lets you require encrypted delivery from sending servers that support it.',
      unknown: 'The lookup did not complete. Run the check again in a moment.',
    },
  },

  /** The handoff from the five-second check to the practice, right under the instrument. */
  bridge: {
    title: 'That was the five-second version',
    lead: 'The check reads what is public about a domain. A penetration test goes inside, under a written scope, and covers the parts attackers actually use:',
    surfaces: ['Web apps', 'APIs', 'Mobile apps', 'Networks', 'Cloud accounts', 'AI features', 'People'],
  },

  scores: {
    title: 'We test our own site first',
    lead1: 'Independent scanners grade this website. We re-check it every day (',
    runs: 'see the runs',
    lead2: ') and fix anything that slips.',
    from: ' from {scanner}',
    items: [
      {
        scanner: 'Mozilla HTTP Observatory',
        grade: 'A+',
        what: 'Security headers, including a strict Content Security Policy.',
        link: 'View the report',
      },
      {
        scanner: 'Qualys SSL Labs',
        grade: 'A+',
        what: 'TLS 1.2 and 1.3 only, with HSTS on every response.',
        link: 'View the report',
      },
      {
        scanner: 'Email spoofing',
        grade: 'Enforced',
        what: 'Our DMARC policy is p=reject: receiving servers refuse email that fakes our domain.',
        link: 'Run the check on us',
      },
      {
        scanner: 'DNSSEC',
        grade: 'Signed',
        what: 'Our DNS answers are signed, so they cannot be forged on the way to you.',
        link: 'See the chain of trust',
      },
    ],
  },

  who: {
    title: 'When companies call us',
    lead: 'Four situations we see most often. Each one has a clear first step.',
    reasons: {
      'offensive-testing': 'You are launching or changing a customer-facing app.',
      'governance-compliance': 'A customer, regulator or auditor is asking about your security.',
      'defensive-operations': 'Nobody watches your logs today.',
      'ai-cloud-security': 'Your AI features and cloud accounts have never been tested.',
    },
  },

  services: {
    title: 'What we do',
    lead: 'Start with the service you need now, and let the report tell you what to look at next.',
    more: 'See how we do it',
    includes: '{name} includes',
  },

  process: {
    title: 'How an engagement works',
    lead: 'The same five steps for every test, whether it covers one web app or your whole network.',
    steps: [
      {
        title: 'Scope',
        text: 'A 30-minute call to agree what we test, when, and what is off-limits. You get a written scope and a fixed quote.',
      },
      {
        title: 'Test',
        text: 'We work inside the agreed window and contact you straight away if we find something critical.',
      },
      { title: 'Report', text: 'Findings ranked by business risk, each with evidence, impact and step-by-step fixes.' },
      { title: 'Fix', text: 'Your team makes the changes. We answer questions along the way.' },
      {
        title: 'Retest',
        text: 'We verify every fix and update the report, so you can share it with customers and auditors.',
      },
    ],
    start: 'Start with step 1: book the scoping call',
  },

  finding: {
    title: 'Reports your team can act on',
    lead: 'Every finding says what we found, why it matters to the business, and exactly how to fix it. This is what one looks like.',
    severity: 'High',
    heading: 'Any customer could read every other customer’s invoices',
    affected: 'Affected',
    affectedValue: 'Customer portal API',
    category: 'Category',
    categoryValue: 'Access control',
    status: 'Status',
    statusValue: 'Fixed, verified on retest',
    evidence: 'Evidence',
    evidence1: 'GET /api/invoices/10422   logged in as customer A',
    evidence2: '200 OK                    the invoice belongs to customer B',
    impact: 'Business impact',
    impactText:
      'Every invoice, with customer names and amounts, was readable by anyone with a login, including a trial account created in two minutes. That is personal data under the UAE data protection law, and a breach you would have to report.',
    fix: 'How to fix',
    fix1: 'Check on the server that the invoice belongs to the logged-in customer before returning it.',
    fix2: 'Add a test that requests another customer’s invoice and expects a refusal.',
    fix3: 'Review every endpoint that takes an id in the address, not only this one.',
    retest: 'Retest',
    retestText: 'Fixed and verified. Other customers’ invoices now return 403 Forbidden.',
    caption:
      'Example finding. The company and the API are illustrative; the flaw is the one we find most often in web applications and APIs, broken object-level authorization, first on the OWASP API Security Top 10.',
    captionLink: 'See how we test for it',
  },

  team: {
    title: 'Who you’ll work with',
    lead: 'You deal directly with the founders, from the first call to the retest.',
    glance: '{name} at a glance',
  },

  faq: {
    title: 'Questions buyers ask first',
    lead: 'Anything else, ask us directly. We answer in plain language.',
    cta: 'Book a scoping call',
    serviceTitle: 'Questions about this service',
  },

  contact: {
    lead: 'Tell us what you want tested and when. We set up a 30-minute call to agree the scope, and you get it in writing with a fixed quote before any testing starts.',
    replyLive:
      'We reply within 1 business day. Your request goes to our inbox over an encrypted connection, and we keep it only to reply.',
    replyMailto:
      'We reply within 1 business day. This site has no server: your request leaves from your own email app, and nothing you type here is stored.',
    security1: 'Found a security issue in one of our own systems? Please follow our ',
    securityLink: 'disclosure policy',
    security2: '.',
    formTitle: 'Your request',
    name: 'Your name',
    email: 'Work email',
    company: 'Company website',
    optional: '(optional)',
    companyPlaceholder: 'yourcompany.ae',
    needs: 'What do you need?',
    when: 'When',
    /** Labels for the protocol values in src/data/contact.ts, which the Worker checks. */
    timelines: {
      'As soon as possible': 'As soon as possible',
      'Within a month': 'Within a month',
      'Within three months': 'Within three months',
      'Just exploring': 'Just exploring',
    },
    message: 'Anything else',
    website: 'Website',
    noscript: 'The form needs JavaScript. Email us instead:',
    send: 'Send request',
    prepare: 'Prepare my request',
    sent1: 'Your request is sent. We reply within 1 business day to ',
    sent2: '.',
    again: 'Send another request',
    ready: 'Your request is ready. Send it from your email app, or copy it into any message.',
    open: 'Open in your email app',
    copy: 'Copy the message',
    /** Read by contact-form.ts. */
    script: {
      nameRequired: 'Enter your name, so we know who to reply to.',
      nameLong: 'Use a shorter name.',
      nameInvalid: 'Use letters, spaces and punctuation only.',
      emailRequired: 'Enter a work email address, for example you@company.ae.',
      emailLong: 'That address is too long.',
      emailInvalid: 'Enter a work email address, for example you@company.ae.',
      checkFields: 'Check the highlighted fields.',
      sending: 'Sending',
      sendingStatus: 'Sending your request.',
      sentStatus: 'Your request is sent. We reply within 1 business day to {email}.',
      failed: 'This could not be sent from the site just now.',
      busy: 'Too many requests came from your network in the last minute, so this one could not be sent from the site.',
      fallback: 'Send it from your email app instead, or copy it into any message.',
      readyShort: 'Your request is ready. Send it from your email app, or copy it.',
      readyLong: 'Your request is ready. The message is long, so copy it rather than opening your email app.',
      copied: 'Copied',
      copiedStatus: 'Message copied.',
      select: 'Copy the selected text below',
      selectStatus: 'The message below is selected. Copy it with your keyboard.',
    },
  },

  readiness: {
    title: 'How ready are you?',
    lead: 'Twelve questions, about two minutes, across the controls that stop the most common incidents. It runs in your browser; nothing you answer is sent or stored.',
    navLabel: 'Readiness check',
    answers: { yes: 'Yes', partly: 'Partly', no: 'No' },
    legend: 'For each one, pick the closest answer.',
    questions: {
      mfa: 'Multi-factor authentication is on for email and admin accounts.',
      accounts: 'Everyone has their own account, and people who leave are removed quickly.',
      patching: 'Operating systems and software are updated on a schedule.',
      backups: 'Backups run regularly, and you have restored one to check it works.',
      email: 'SPF, DKIM and DMARC are set up so nobody can send email as your company.',
      endpoint: 'Every laptop and server runs managed antivirus or endpoint protection.',
      monitoring: 'Key systems send their logs somewhere, and someone is alerted to problems.',
      incident: 'You have a written plan for a security incident and who to call.',
      awareness: 'Staff get security training and realistic phishing exercises.',
      data: 'You know what personal data you hold, where it is, and who can see it.',
      vendors: 'You check the security of the suppliers who handle your data.',
      testing: 'An independent security test was done in the last 12 months.',
    },
    result: 'Your readiness',
    of: 'of 100',
    progress: '{answered} of {total} answered',
    bands: {
      strong: 'Strong',
      developing: 'Developing',
      'at-risk': 'At risk',
    },
    bandNote: {
      strong: 'You cover the basics well. A test finds the gaps that remain.',
      developing: 'Good foundations, with clear gaps to close before they are used against you.',
      'at-risk': 'Several of the controls that stop the most common incidents are missing.',
    },
    startHere: 'Start here',
    startHereLead: 'The three areas worth your attention first, and who helps with each.',
    emailCheckLink: 'Not sure about email? Run the five-second domain check.',
    privacyNote: 'This is a starting self-assessment, not a certification. Your answers stay in your browser.',
  },

  page: {
    breadcrumb: 'Breadcrumb',
    home: 'Home',
    keyFacts: 'Key facts',
  },

  service: {
    cover: 'What we cover',
    measured: 'Measured against',
    goodToKnow: 'Good to know',
    receive: 'What you receive',
    fit: 'A good fit if',
    fitLabel: 'Deliverables and fit',
    others: 'Other services',
    othersLead: 'Each one stands on its own. Together they cover testing, monitoring and compliance.',
    glance: '{name} at a glance',
  },

  privacy: {
    title: 'Privacy',
    description:
      'What this website does and does not collect, including how the domain check and the request form handle what you type.',
    lead: 'This website does not use cookies, analytics or advertising trackers, and it loads no third-party scripts. Here is what happens with the little it does handle.',
    leadVisits:
      'This website does not use cookies or advertising trackers, and it loads no third-party scripts. It counts visits with a small counter of its own, described below. Here is what happens with the little it does handle.',
    glance: 'Privacy at a glance',
    summary: [
      { label: 'Cookies', value: 'None' },
      { label: 'Analytics and trackers', value: 'None' },
      { label: 'Third-party scripts', value: 'None' },
      { label: 'Domain check', value: 'Runs in your browser' },
    ],
    summaryVisits: [
      { label: 'Cookies', value: 'None' },
      { label: 'Analytics', value: 'Cookie-free visit counts' },
      { label: 'Third-party scripts', value: 'None' },
      { label: 'Domain check', value: 'Runs in your browser' },
    ],
    checkTitle: 'The domain check',
    check:
      'The check runs in your browser. It sends DNS lookups for the domain you enter straight to Cloudflare’s public DNS resolver and, if that does not answer, to Google Public DNS. When the page loads, it also checks our own domain the same way. We never receive the domain you type or the results. Cloudflare and Google handle those lookups under their own privacy policies.',
    formTitle: 'The request form',
    formLive:
      'The form on the home page and the service pages sends your request to our inbox as an email, over an encrypted connection, through a small service we run on Cloudflare. The email carries what you typed, the page you sent it from and the time. The service keeps a short delivery log without your details, and Cloudflare handles the delivery under its own privacy policy. If sending fails, the form prepares the same message for your own email app instead.',
    formMailto:
      'The form on the home page and the service pages composes your request in your browser and hands it to your own email app, or to your clipboard. Nothing you type in it is sent to this site or stored by it.',
    hostingTitle: 'Hosting',
    hosting:
      'The site is served by GitHub Pages through Cloudflare. Like any web server, they process your IP address and request details to deliver pages and protect the site from abuse.',
    visitsTitle: 'Counting visits',
    visits:
      'When a page loads, a small script sends three things to a counter we run on Cloudflare: the page address, the website you came from, and the tag in the link you followed, if it has one. Like any request, it also carries your network address and browser details. The counter reads your country, browser, operating system and device type from them, makes a one-way code from your network address and browser mixed with a secret and the date, so that it can count you once a day, and keeps none of the originals. The code cannot be turned back into your address, and it is deleted shortly after the day ends. We never store your IP address or your browser’s full identification. The totals are kept for 13 months and shown only to the founders. Nothing is counted if your browser sends Do Not Track or Global Privacy Control, and you can switch counting off in any browser by opening a page of this site once with ?visits=off added to the address.',
    contactTitle: 'When you contact us',
    contact:
      'We use your message and contact details only to reply and to provide the services you ask about. We do not sell them or share them for marketing, and we keep correspondence only as long as that purpose requires.',
    alertsTitle: 'Change alerts',
    alerts:
      "If you ask to be emailed when a domain's protection changes, we store that domain and your email address, and nothing else, in order to send those emails. We send them only after you confirm by clicking the link in the first message. Every email has an unsubscribe link, and unsubscribing deletes the record. The address is used for nothing else.",
    rightsTitle: 'Your rights',
    rights1: 'You can ask what personal data we hold about you, and ask us to correct or delete it. Email',
    rights2: 'and we will respond within 30 days.',
    updated: 'Last updated 9 October 2026.',
  },

  security: {
    title: 'Report a vulnerability',
    description:
      'How to report a security issue in SecuritySolution.tech websites and systems, and what you can expect from us.',
    lead: 'If you find a security issue in one of our websites or systems, we want to hear about it. Here is how to reach us, what happens next, and what stays out of scope.',
    howTitle: 'How to report',
    how: 'Email us with a description of the issue, the steps to reproduce it, and the impact you expect. Screenshots or a short proof of concept help us move faster.',
    subject: 'Security report',
    machine1: 'Machine-readable contact details are published in our ',
    machineLink: 'security.txt',
    machine2: ' file.',
    expectTitle: 'What you can expect',
    steps: [
      { title: 'Acknowledge', text: 'We confirm your report within 3 business days.' },
      { title: 'Investigate', text: 'We reproduce the issue and keep you updated while we work on it.' },
      { title: 'Fix', text: 'We resolve it and let you know when the fix is live.' },
      { title: 'Credit', text: 'We thank you publicly on this page if you would like that.' },
    ],
    scopeTitle: 'Scope',
    scope: ' and its subdomains, including the domain check and the request form on this site.',
    outOfScope:
      'Out of scope: the services our hosting and DNS providers run (GitHub Pages, Cloudflare), reports produced by an automated scanner without a working proof of concept, and issues in third-party sites we link to.',
    dontTitle: 'Please do not',
    dont: [
      'Access, change or delete data that is not yours.',
      'Run denial-of-service tests or high-volume automated scans.',
      'Use social engineering, phishing or physical attacks.',
      'Share the issue publicly before we have fixed it.',
    ],
    harbourTitle: 'Safe harbour',
    harbour:
      'We will not take legal action against security research that follows this policy in good faith. We do not run a paid bug bounty at the moment.',
    thanksTitle: 'Acknowledgements',
    thanks:
      'Researchers who report a resolved issue are credited here if they want to be. No reports have been received yet.',
    updated: 'Last updated 8 October 2026.',
  },

  notFound: {
    title: 'Page not found',
    lead: 'The page you were looking for does not exist or has moved. Start again from one of these.',
    home: 'Go to the home page',
    check: 'Check your domain',
    services: 'Our services',
  },
};

export type Dictionary = typeof en;
