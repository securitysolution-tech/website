// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://securitysolution.tech',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Everything ships as external files so the Content-Security-Policy
    // can stay at script-src 'self' / style-src 'self' with no inline allowances.
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
  integrations: [sitemap()],
  devToolbar: { enabled: false },
});
