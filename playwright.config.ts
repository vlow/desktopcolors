import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:4321" },
  webServer: {
    // Build the static site, then serve dist/ with astro preview.
    command: "npm run build && npm run preview -- --port 4321 --host 127.0.0.1",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    // A cold `npm run build` takes ~130s for 704 pages; give it real headroom.
    timeout: 300_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
