// Shared by astro.config.mjs and src/i18n/index.ts, so the build and the templates agree.
export const defaultLocale = 'en';
export const locales = ['en', 'ar'];

/**
 * Arabic is live: the language toggle, hreflang links, the sitemap entries and indexing of
 * /ar/ all follow this switch. Set it to false to take the Arabic pages back to unlinked
 * and noindex while keeping them reachable by address.
 */
export const arLive = true;

/**
 * The security readiness self-check goes live here. Until then the page builds and is
 * reachable by address, but it is unlinked and noindex, so the owner can review the
 * question set first. Flip to true to add it to the footer and the compliance page and to
 * index it.
 */
export const readinessLive = false;
