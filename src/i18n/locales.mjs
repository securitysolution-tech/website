// Shared by astro.config.mjs and src/i18n/index.ts, so the build and the templates agree.
export const defaultLocale = 'en';
export const locales = ['en', 'ar'];

/**
 * Arabic goes live here: the language toggle, hreflang links, the sitemap entries and
 * indexing of /ar/ all switch on together. Until then the Arabic pages build and can be
 * reached by their address, but they are unlinked and noindex, so the owner can review
 * them in place.
 */
export const arLive = false;
