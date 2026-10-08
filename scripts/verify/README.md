# Browser behaviour checks

`behaviour.mjs` tests what the build gates cannot: the Content-Security-Policy and script
errors on every page, reduced motion rendering identically, no overflow on a phone, the
domain check reaching a verdict, and the contact form composing its fallback message.

```sh
npm run build
npm run verify:browser
```

It serves `dist/` and drives the system Chrome (the same engine `scripts/audit.mjs` uses).
It is intentionally not in the deploy gate, because a browser behaviour test can be timing-
sensitive and should not fail a deploy on a slow run. Run it locally before a change that
touches the check, the form, motion, or the layout.

For accessibility, CSP and performance budgets on every page in CI, see `scripts/audit.mjs`
(run by `npm run audit` and the Quality workflow).
