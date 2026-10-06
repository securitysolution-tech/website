# SecuritySolution.tech

Source for [securitysolution.tech](https://securitysolution.tech): penetration testing, security monitoring and compliance readiness for companies in the UAE.

## Stack

- [Astro](https://astro.build) static site, no client framework
- One self-hosted variable font (Archivo) and no third-party scripts, so the site runs under a strict Content-Security-Policy (`script-src 'self'`, `style-src 'self'`)
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

Pushing to `main` runs `.github/workflows/deploy.yml`: type checks, build, tests, then publish to GitHub Pages. Pull requests run the same checks in `.github/workflows/ci.yml`. Dependabot keeps npm packages and pinned Actions up to date.

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability.

© SecuritySolution.tech. All rights reserved.
