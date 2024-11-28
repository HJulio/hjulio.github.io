// @ts-check
// @ts-check
import mdx from "@astrojs/mdx";
import partytown from '@astrojs/partytown';
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

import tailwind from "@astrojs/tailwind";
import { SITE_URL } from "./src/consts";

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  integrations: [mdx(), sitemap(), tailwind(), partytown({
    config: {
      forward: ["dataLayer.push"],
    },
  }),],
  vite: {
    build: {
      rollupOptions: {
        external: ['@julian_cataldo/astro-lightbox'],
      },
    },
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: "catppuccin-latte",
        dark: "catppuccin-mocha",
      },
    },
  },
});

