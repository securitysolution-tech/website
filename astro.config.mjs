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
      // lightningcss 1.33 folds animation-timeline into the animation shorthand,
      // which browsers reject, so every scroll-driven animation dies in minified
      // builds. esbuild keeps the longhands apart. Component <style> blocks still
      // pass through lightningcss in the Astro compiler, so scroll-driven rules in
      // components use animation longhands, and scripts/check-css.mjs guards the output.
      cssMinify: 'esbuild',
    },
  },
  integrations: [sitemap()],
  devToolbar: { enabled: false },
});
