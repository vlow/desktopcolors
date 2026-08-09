import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://desktopcolors.com",
  integrations: [
    preact(),
    // No `filter` needed: the integration lists only page routes, so the 22
    // src/pages/os/[slug]/view.json.ts endpoints stay out on their own (687
    // HTML pages in, 687 <loc> out). The e2e guard in e2e/smoke.spec.ts pins
    // that, because it is the integration's behaviour and not ours.
    //
    // The version is pinned EXACTLY, not caret-ranged: @astrojs/sitemap >= 3.3
    // reads the `routes` argument of astro:build:done, which only exists in
    // Astro 5, and crashes this Astro 4 build with "Cannot read properties of
    // undefined (reading 'reduce')". The package declares no peerDependencies,
    // so npm will not catch that for you. Unpin only together with Astro 5.
    sitemap(),
  ],
});
