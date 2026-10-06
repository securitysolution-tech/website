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
- Hosted on GitHub Pages behind Cloudflare; deployed by GitHub Actions on every push to `main`

## Develop

Requires Node.js 22.12 or later (`.nvmrc` pins the version CI uses).

```sh
npm ci
npm run dev       # local dev server
npm run check     # type checks
npm run build     # static build into dist/
npm test          # link, copy and HTML checks against dist/
```

## Content

- Services: `src/data/services.ts`
- Company details, contact address and founders: `src/data/site.ts`
- Set `autorunDomain` in `site.ts` to run the homepage check automatically on page load

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: type checks, build, tests, then publish to GitHub Pages. Pull requests run the same checks in `.github/workflows/ci.yml`. Dependabot proposes npm and Actions updates once a release is a week old; security updates arrive immediately.

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

Automated checks, all open source:

| Workflow | Runs | What it does |
| --- | --- | --- |
| `security.yml` | Every push, pull request and weekly | [zizmor](https://docs.zizmor.sh) audits the workflows; [OSV-Scanner](https://google.github.io/osv-scanner/) checks dependencies against known vulnerabilities |
| `scorecard.yml` | Pushes to `main` and weekly | [OpenSSF Scorecard](https://scorecard.dev) rates the repository's supply-chain practices |
| `posture.yml` | Daily | `scripts/posture.sh` checks the live site from outside: security headers, redirects, edge, origin and MTA-STS certificates, TLS 1.1 refusal, DNSSEC, CAA, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, security.txt expiry, HSTS preload status and the Mozilla Observatory grade. A failure opens an issue labelled `posture` |
| `zap.yml` | Weekly | [OWASP ZAP](https://www.zaproxy.org) baseline: a passive scan of the public pages. Findings go to the "ZAP baseline findings" issue |

Results from zizmor, OSV-Scanner and Scorecard appear under the repository's Security tab, next to CodeQL, Dependabot and secret scanning.

Run the posture check locally (needs bash, curl, jq, openssl and GNU date):

```sh
bash scripts/posture.sh
```

© SecuritySolution.tech. All rights reserved.
