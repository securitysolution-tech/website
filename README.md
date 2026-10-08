# SecuritySolution.tech

[![Deploy](https://github.com/securitysolution-tech/website/actions/workflows/deploy.yml/badge.svg)](https://github.com/securitysolution-tech/website/actions/workflows/deploy.yml)
[![Security](https://github.com/securitysolution-tech/website/actions/workflows/security.yml/badge.svg)](https://github.com/securitysolution-tech/website/actions/workflows/security.yml)
[![Posture check](https://github.com/securitysolution-tech/website/actions/workflows/posture.yml/badge.svg)](https://github.com/securitysolution-tech/website/actions/workflows/posture.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/securitysolution-tech/website/badge)](https://scorecard.dev/viewer/?uri=github.com/securitysolution-tech/website)

Source for [securitysolution.tech](https://securitysolution.tech): penetration testing, security monitoring and compliance readiness for companies in the UAE.

## Stack

- [Astro](https://astro.build) static site, no client framework
- One self-hosted variable font (Archivo) and no third-party scripts, so the site runs under a strict Content-Security-Policy (`script-src 'self'`, `style-src 'self'`) with Trusted Types enforced
- The homepage domain check runs entirely in the visitor's browser using DNS-over-HTTPS (Cloudflare, with Google Public DNS as a fallback)
- The scoping request form either posts to a small Cloudflare Worker (`workers/contact`, see below) or hands the message to the visitor's own email app; the site itself stores nothing
- Hosted on GitHub Pages behind Cloudflare; deployed by GitHub Actions on every push to `main`

## Develop

Requires Node.js 22.12 or later (`.nvmrc` pins the version CI uses).

```sh
npm ci
npm run dev       # local dev server
npm run check     # type checks
npm run build     # static build into dist/
npm test          # unit tests for the domain check, then link, copy and HTML checks against dist/
npm run audit     # accessibility, CSP and Lighthouse audit of dist/ in Chrome
npm run format    # Prettier; CI refuses unformatted code
```

## Content

- Interface text: `src/i18n/en.ts` and `src/i18n/ar.ts` (the dictionaries every component reads; long-form English content stays in `src/data`, see "Languages")
- Services: `src/data/services.ts`
- Company details, contact address and founders: `src/data/site.ts`
- Set `autorunDomain` in `site.ts` to run the homepage check automatically on page load
- The request form's fields and message format: `src/data/contact.ts`, shared with the Worker

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: formatting check, type checks, build, tests, publish to GitHub Pages, then a verification that the live site serves the new build with its security headers and every page answering. Pull requests run the same checks in `.github/workflows/ci.yml`. Dependabot proposes npm and Actions updates once a release is a week old; security updates arrive immediately.

## Languages

English is served at the root and Arabic under `/ar/`, from the same components. The words live in `src/i18n/en.ts` and `src/i18n/ar.ts`; the Arabic file also overlays the text of each service, the questions and the founders' lines, and TypeScript refuses a build with a translation missing. The Arabic pages are built and reachable by address, but until they are switched on they carry `noindex`, have no canonical address, stay out of the sitemap, and no page links to them.

To review the Arabic draft, open `/ar/`, `/ar/services/offensive-testing/`, `/ar/privacy/` and `/ar/security/` on the live site (or `npm run dev`). The glossary is at the top of `src/i18n/ar.ts`; the founders' names stay in Latin script until their Arabic spelling is confirmed. The site uses Western digits in both languages, and `npm test` enforces it.

Going live: set `arLive` to `true` in `src/i18n/locales.mjs` and push. That one change adds the language toggle to the header, the menu and the footer, the `hreflang` links, the sitemap entries with language alternates, and indexing. The 404 page is shared and shows Arabic under `/ar/`.

The Arabic face is Noto Sans Arabic (variable, Arabic ranges only), loaded by the `/ar/` routes alone; Latin names, records and numbers keep Archivo. `src/styles/arabic.css` holds the Arabic typography and the right-to-left rules.

## Contact backend

`workers/contact` is a Cloudflare Worker on the route `securitysolution.tech/api/contact`. The form posts the request to it as JSON; the Worker checks every field, allows three requests a minute per network and six in total, and emails the request to the inbox through Cloudflare Email Service with the visitor's address as Reply-To. Sends to a verified destination address are free on every plan. Until the Worker is live, and whenever it answers anything but 202, the form composes the same message for the visitor's own email app.

```sh
cd workers/contact
npm ci
npm run check     # generates the binding types, then type-checks
npm test          # unit tests for the validation, the rate-limit key and the email
npm run dry-run   # bundles what a deploy would upload, without credentials
```

Going live, in this order:

1. Copy `.dev.vars.example` to `.dev.vars` with the inbox address (a verified destination address in Email Routing, not an address on the domain itself). Run `npm run dev`, then in another shell `npm run e2e -- http://127.0.0.1:8787 --origin http://localhost:4321 --send`. Open the email that arrives and read its `Authentication-Results` header: it must show `dkim=pass header.d=securitysolution.tech` and `dmarc=pass`, because the domain publishes `p=reject`. If the send fails with `E_SENDER_DOMAIN_NOT_AVAILABLE`, onboard the domain under Compute, Email Service, Email Sending (Workers Paid) and repeat.
2. Store the inbox as the Worker secret: `npx wrangler secret put CONTACT_TO`.
3. In the repository settings, create the `cloudflare` environment with the secrets `CLOUDFLARE_API_TOKEN` (permissions: Workers Scripts Edit, Workers Routes Edit, Account Settings Read, Zone Read on this zone, User Details Read) and `CLOUDFLARE_ACCOUNT_ID`. Then set the repository variable `CONTACT_WORKER_DEPLOY` to `true` and run the "Contact worker" workflow once by hand. From then on every push to `main` that touches the Worker deploys it.
4. Check the live route from outside: `npm run e2e -- https://securitysolution.tech`. No email is sent without `--send`.
5. Set `CONTACT_BACKEND_LIVE` to `true` in `src/data/site.ts` and push. The form, the contact section and the privacy page switch together.
6. In the Cloudflare dashboard, add a WAF rate-limiting rule for `/api/contact` and a cache rule that bypasses `/api/*`.

`CONTACT_ENABLED` in `wrangler.jsonc` is the kill switch: anything but `true` makes the Worker answer 503, and the form falls back to email. For local work, `npm run dev` at the root proxies `/api` to `wrangler dev`.

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

Automated checks, all open source:

| Workflow        | Runs                                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `security.yml`  | Every push, pull request and weekly | [zizmor](https://docs.zizmor.sh) audits the workflows; [OSV-Scanner](https://google.github.io/osv-scanner/) checks dependencies against known vulnerabilities                                                                                                                                                                                                                                                                         |
| `scorecard.yml` | Pushes to `main` and weekly         | [OpenSSF Scorecard](https://scorecard.dev) rates the repository's supply-chain practices                                                                                                                                                                                                                                                                                                                                              |
| `posture.yml`   | Daily                               | `scripts/posture.sh` checks the live site from outside: security headers, redirects, edge, origin and MTA-STS certificates, TLS 1.1 refusal, DNSSEC, CAA, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, the contact endpoint's refusals, the six DNS records printed in the hero against live DNS, every outbound link, security.txt expiry, HSTS preload status and the Mozilla Observatory grade. A failure opens an issue labelled `posture` |
| `quality.yml`   | Every push and pull request         | `scripts/audit.mjs` builds the site and audits it in Chrome: axe-core accessibility on every page, the Content-Security-Policy and script errors, and Lighthouse on three pages against the resource budgets in `budget.json`. Accessibility, best practices, SEO, layout shift and the budgets must be clean; the results appear in the job summary                                                                                  |
| `worker.yml`    | Changes to `workers/contact`        | Type-checks, tests and bundles the contact Worker; deploys it to Cloudflare once the owner has set the secrets (see "Contact backend")                                                                                                                                                                                                                                                                                                |
| `zap.yml`       | Weekly                              | [OWASP ZAP](https://www.zaproxy.org) baseline: a passive scan of the public pages. Findings go to the "ZAP baseline findings" issue                                                                                                                                                                                                                                                                                                   |

Results from zizmor, OSV-Scanner and Scorecard appear under the repository's Security tab, next to CodeQL, Dependabot and secret scanning.

Run the posture check locally (needs bash, curl, jq, openssl and GNU date):

```sh
bash scripts/posture.sh
```

© SecuritySolution.tech. All rights reserved.
