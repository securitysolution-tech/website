# Working on this repository

This is the SecuritySolution.tech website. If you are an AI agent, the full working
agreement is the company handbook: `securitysolution-tech/handbook` (start at its
`AGENTS.md`). This file is the short version.

## The rules that never move

1. **Commit as the company's engineer:** `Mohammad Thabet Hassan
<141744086+MohammadThabetHassan@users.noreply.github.com>`. **Never add AI attribution**
   of any kind (no `Co-Authored-By` for an AI, no "Generated with", no AI name or logo) in a
   commit message, body, or pull request.
2. **Never commit a secret.** Push tokens come per-session from the owner and are revoked
   after. Mask them in any output.
3. **Verify before committing:** `npm run check && npm run build && npm test && npm run audit`
   and `npx prettier --check .`. Do not commit red. Run `npm run format` after any hand edit,
   or the deploy's format check fails.
4. **Respect the constraints:** strict CSP with zero inline styles, WCAG AA, English-source
   (`src/i18n/en.ts`) and Arabic-mirror (`src/i18n/ar.ts`) text, the copy rules (no em or en
   dashes, no filler, Western digits), and the privacy promise (the domain check and the
   mailto form send nothing to the company).
5. **Push only when asked.** A push to `main` deploys live. Watch the deploy and report
   honestly.

## Where things live

See the repository map in the handbook (`repos/website.md`) and this repo's `README.md`.
The owner-only switches are `CONTACT_BACKEND_LIVE`, `MONITOR_LIVE` and `VISITS_LIVE`
(`src/data/site.ts`) and `arLive` (`src/i18n/locales.mjs`). `VISITS_LIVE` turns on the cookie-free
visit counter; the privacy page describes it only while it is on.
