import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";

export default defineConfig({
  site: "https://desktopcolors.com",
  integrations: [preact()],
});
