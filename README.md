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

English is served at the root and Arabic under `/ar/`, from the same components. The words live in `src/i18n/en.ts` and `src/i18n/ar.ts`; the Arabic file also overlays the text of each service, the questions and the founders' lines, and TypeScript refuses a build with a translation missing. Arabic is live: every page links to its counterpart through the language toggle, carries `hreflang` links, and the sitemap lists both languages with alternates.

The glossary is at the top of `src/i18n/ar.ts`; the founders' names stay in Latin script until their Arabic spelling is confirmed. The site uses Western digits in both languages, and `npm test` enforces it.

The switch is `arLive` in `src/i18n/locales.mjs`. Setting it to `false` removes the language toggle from the header, the menu and the footer, the `hreflang` links, the sitemap entries and indexing, while the Arabic pages stay reachable by address. The 404 page is one bilingual page for every missing address.

The Arabic face is Noto Sans Arabic (variable, Arabic ranges only), loaded by the `/ar/` routes alone; Latin names, records and numbers keep Archivo. `src/styles/arabic.css` holds the Arabic typography and the right-to-left rules.

## Posture monitor

The self-serve tier of domain monitoring: a visitor runs the check and asks to be emailed when
the domain's protection drops. The Worker in `workers/monitor` (route `/api/watch`) takes the
signup, sends a confirmation link (double opt-in: nothing else is sent until it is clicked),
re-reads every confirmed domain once a day with the website's own check (`src/scripts/checks.ts`),
and emails only on a degradation. Every email carries a one-click unsubscribe that deletes the
record. The rules for "worse" are the same as `posture-watch`'s, the managed tier.

What is stored: the domain and the address, in a KV namespace, keyed by a hash. Nothing else.
An unconfirmed signup is deleted after two days.

The signup and the privacy page's "Change alerts" section render only when `MONITOR_LIVE` in
`src/data/site.ts` is true (`PUBLIC_MONITOR=1 npm run build` builds that state without flipping
the source). From `workers/monitor`: `npm run check`, `npm test` (the token, diff, validation
and email logic), `npm run dry-run`.

Going live (owner):

1. Workers Paid with Email Service, and a verified sending domain (the contact backend's gate).
2. `wrangler kv namespace create WATCH`, paste the id into `wrangler.jsonc`.
3. `wrangler secret put TOKEN_SECRET` with 32 or more random bytes.
4. The Cloudflare token and account id in the `cloudflare` environment (shared with the contact
   Worker), then the repository variable `MONITOR_WORKER_DEPLOY` set to true; the Monitor
   worker workflow deploys on the next push to `main` that touches `workers/monitor`.
5. Send a test signup with `wrangler dev` and confirm the link; check the baseline email arrives.
6. Set `MONITOR_LIVE` to true and push. The privacy page gains its section in the same build.
7. A WAF rate rule on `/api/watch` and a cache bypass for `/api/*`, as for the contact endpoint.

## Contact backend

`workers/contact` is a Cloudflare Worker on the route `securitysolution.tech/api/contact`. The form posts the request to it as JSON; the Worker checks every field, allows three requests a minute per network and six in total, and emails the request to the inbox through Cloudflare Email Service with the visitor's address as Reply-To. Sends to a verified destination address are free on every plan. Until the Worker is live, and whenever it answers anything but 202, the form composes the same message for the visitor's own email app.

Every request is also kept, before the email goes, in the dashboard’s database (the visit counter’s D1, bound here as `DB`; the schema is `workers/visits/migrations/0002_contact_requests.sql`), with what happened to the email: `sent` with its message id, `failed` with the error code, or `quota`. So no request is lost if an email fails, and the founders see every one, newest first, in the “Contact requests” section of the dashboard at `/api/visits`. Submissions that fail the checks or fill the honeypot are counted by reason and never kept; too many from one network is only logged, so a flood cannot spend the database’s daily writes. The visit counter’s daily run deletes requests after 180 days, and the Worker’s per-request logs and traces are off.

```sh
cd workers/contact
npm ci
npm run check     # generates the binding types, then type-checks
npm test          # the validation, the rate-limit key, the email, and the request flow on SQLite
npm run dry-run   # bundles what a deploy would upload, without credentials
```

Going live, in this order:

1. Copy `.dev.vars.example` to `.dev.vars` with the inbox address (a verified destination address in Email Routing, not an address on the domain itself). Run `npm run dev`, then in another shell `npm run e2e -- http://127.0.0.1:8787 --origin http://localhost:4321 --send`. Open the email that arrives and read its `Authentication-Results` header: it must show `dkim=pass header.d=securitysolution.tech` and `dmarc=pass`, because the domain publishes `p=reject`. If the send fails with `E_SENDER_DOMAIN_NOT_AVAILABLE`, onboard the domain under Compute, Email Service, Email Sending (Workers Paid) and repeat.
2. Store the inbox as the Worker secret: `npx wrangler secret put CONTACT_TO`.
3. In the repository settings, create the `cloudflare` environment with the secrets `CLOUDFLARE_API_TOKEN` (permissions: Workers Scripts Edit, Workers Routes Edit, Account Settings Read, Zone Read on this zone, User Details Read) and `CLOUDFLARE_ACCOUNT_ID`. Then set the repository variable `CONTACT_WORKER_DEPLOY` to `true` and run the "Contact worker" workflow once by hand. From then on every push to `main` that touches the Worker deploys it.
4. Check the live route from outside: `npm run e2e -- https://securitysolution.tech`. No email is sent without `--send`.
5. Make sure the request log exists: the Visits worker workflow applies the database migrations on every deploy, or run `npm run migrate` in `workers/visits` once.
6. Set `CONTACT_BACKEND_LIVE` to `true` in `src/data/site.ts` and merge. The form, the contact section and the privacy page (which then says requests are kept for six months) switch together.
7. In the Cloudflare dashboard, add a WAF rate-limiting rule for `/api/contact` and a cache rule that bypasses `/api/*`.

`CONTACT_ENABLED` in `wrangler.jsonc` is the kill switch: anything but `true` makes the Worker answer 503, and the form falls back to email. For local work, `npm run dev` at the root proxies `/api` to `wrangler dev`.

## Visit counter

How many people visit, from where, on what, and which pages and links brought them. It is counted by the site's own cookie-free counter, `workers/visits`, a Cloudflare Worker with a D1 database, so the site still loads no third-party script (the Lighthouse budget in `budget.json` allows none) and sets no cookie.

What a page sends: `src/scripts/visit.ts` posts the page path, the referring site's name (or "internal" when the visitor was already on the site) and the `?ref=` campaign tag to `/api/hit` in one `sendBeacon`, once the page is visible, in idle time. It sends nothing from any host but the real site, from automation (`navigator.webdriver`), when the browser sends Do Not Track or Global Privacy Control, or after `?visits=off` has been opened once in that browser (`?visits=on` undoes it). The Worker repeats the privacy checks on the headers it receives.

What the Worker keeps: per day, page views by path; for each visitor's first view of the day, the landing page, the country (Cloudflare's), browser, system, device class and source; and a count of the requests it ignored (crawlers, scripts, hosting networks). A visitor is a 12-byte HMAC of the day, the network (the IPv4 address, or the IPv6 /64) and the User-Agent under `SALT_SECRET`, kept only until the daily run (00:23 Dubai time) deletes it. No address, User-Agent, cookie or timestamp finer than a day is stored, and the Worker's per-request logs and traces are off, so Cloudflare keeps none for it either. Totals are kept for 400 days. The privacy page says all of this when `VISITS_LIVE` is true, in English and Arabic.

Reading it: `https://securitysolution.tech/api/visits`, user `visits`, password `STATS_PASSWORD`. `?days=7`, `30` or `90` sets the range and `?format=json` returns the same figures for scripts. To tag a link from a post, add `?ref=li-oct9` to the address; the tag then appears under Sources. Open any page of the site once with `?visits=off` in your own browsers to keep your visits out of the numbers.

```sh
cd workers/visits
npm ci
npm run check     # generates the binding types, then type-checks
npm test          # the SQL runs on SQLite with the real migration; the handler runs end to end
npm run dry-run   # bundles what a deploy would upload, without credentials
```

Going live (owner), in this order:

1. `npx wrangler d1 create securitysolution-visits` and paste the id into `wrangler.jsonc`, then `npx wrangler d1 migrations apply securitysolution-visits --remote`.
2. Choose `SALT_SECRET` (32 or more random bytes) and `STATS_PASSWORD` (24 or more random characters). A new Worker cannot take `wrangler secret put` before its first deploy, so the first deploy is `npx wrangler deploy --secrets-file <file>` with both in a file that is deleted afterwards. After that, `npx wrangler secret put` rotates either.
3. Check the live route from outside: `VISITS_PASSWORD=... npm run e2e -- https://securitysolution.tech`. No visit is added without `--count`.
4. Set `VISITS_LIVE` to `true` in `src/data/site.ts` and push; the beacon and the privacy page switch in the same build. Open the live site once, then the dashboard: the visit should be there within seconds.
5. Optional: the Cloudflare token and account id in the `cloudflare` environment (shared with the other Workers) and the repository variable `VISITS_WORKER_DEPLOY` set to true, and the Visits worker workflow deploys on every push to `main` that touches `workers/visits`.

`VISITS_ENABLED` in `wrangler.jsonc` is the kill switch: anything but `true` makes `/api/hit` a silent no-op (the dashboard keeps working). `PUBLIC_VISITS=1 npm run build` builds the counting site from any host, to try it against `wrangler dev`; `npm run verify:browser` checks the beacon in a real browser against a normal build.

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

Automated checks, all open source:

| Workflow        | Runs                                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `security.yml`  | Every push, pull request and weekly | [zizmor](https://docs.zizmor.sh) audits the workflows; [OSV-Scanner](https://google.github.io/osv-scanner/) checks dependencies against known vulnerabilities                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `scorecard.yml` | Pushes to `main` and weekly         | [OpenSSF Scorecard](https://scorecard.dev) rates the repository's supply-chain practices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `posture.yml`   | Daily                               | `scripts/posture.sh` checks the live site from outside: security headers, redirects, edge, origin and MTA-STS certificates, TLS 1.1 refusal, DNSSEC, CAA, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, the contact endpoint's refusals, the six DNS records printed in the hero against live DNS, every outbound link, security.txt expiry, HSTS preload status and the Mozilla Observatory grade. It then runs [web-posture-check](https://github.com/MohammadThabetHassan/web-posture-check) v0.2.0 as a second, independent check (20 checks, fails on any WARN). A failure opens an issue labelled `posture` |
| `quality.yml`   | Every push and pull request         | `scripts/audit.mjs` builds the site and audits it in Chrome: axe-core accessibility on every page, the Content-Security-Policy and script errors, and Lighthouse on three pages against the resource budgets in `budget.json`. Accessibility, best practices, SEO, layout shift and the budgets must be clean; the results appear in the job summary                                                                                                                                                                                                                                                    |
| `worker.yml`    | Changes to `workers/contact`        | Type-checks, tests and bundles the contact Worker; deploys it to Cloudflare once the owner has set the secrets (see "Contact backend")                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `visits.yml`    | Changes to `workers/visits`         | Type-checks, tests and bundles the visit counter Worker; deploys it to Cloudflare once the owner has set the secrets (see "Visit counter")                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `zap.yml`       | Weekly                              | [OWASP ZAP](https://www.zaproxy.org) baseline: a passive scan of the public pages. Findings go to the "ZAP baseline findings" issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Results from zizmor, OSV-Scanner and Scorecard appear under the repository's Security tab, next to CodeQL, Dependabot and secret scanning.

Run the posture check locally (needs bash, curl, jq, openssl and GNU date):

```sh
bash scripts/posture.sh
```

© SecuritySolution.tech. All rights reserved.
