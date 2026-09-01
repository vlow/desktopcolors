import { test, expect } from "@playwright/test";

/**
 * Set up a route interceptor for /api/event that captures the JSON body of every
 * beacon. Returns the array that accumulates captured event bodies (as strings).
 *
 * sendBeacon requests have resourceType "ping" and postData() returns null via the
 * request event, but postData() IS readable inside a page.route() handler.
 */
async function captureEvents(
  page: import("@playwright/test").Page,
): Promise<string[]> {
  const bodies: string[] = [];
  await page.route("**/api/event", async (route) => {
    bodies.push(route.request().postData() ?? "");
    await route.fulfill({ status: 204, body: "" });
  });
  return bodies;
}

/** True if some captured beacon body parses to an object matching every key in `expected`. */
function sawEvent(bodies: string[], expected: Record<string, string>): boolean {
  return bodies.some((b) => {
    try {
      const e = JSON.parse(b) as Record<string, unknown>;
      return Object.entries(expected).every(([k, v]) => e[k] === v);
    } catch {
      return false;
    }
  });
}

/**
 * Wait until every Preact island on the page has hydrated. Astro renders
 * `<astro-island ssr>` and drops the `ssr` attribute once the component is
 * mounted, so this is a deterministic gate.
 *
 * Every test that clicks or types into an island MUST await this first.
 * `page.goto()` resolves on `load`, and Playwright's actionability checks
 * (visible / enabled / stable) cannot see whether Preact has attached its event
 * listeners — so an interaction that lands before mount is silently dropped with
 * no error, and the test fails later at a confusing, unrelated-looking assertion.
 *
 * Measured hydration latency under this suite's 4 parallel workers: ~124ms
 * (median) on the production build the config serves, ~265ms against `astro dev`
 * (61 unbundled module requests per page instead of 8). Tests reach their first
 * interaction around 280–420ms, so the dev margin is a coin flip and the
 * production margin is real but not generous — hence the explicit gate rather
 * than relying on either being fast enough.
 */
async function islandsHydrated(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}

test("home lists platforms and search filters", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Desktop background colors, by operating system" })).toBeVisible();
  // exact: true — the platform card title is its own text node equal to exactly
  // "Windows 95". Without it the match also climbs to every ancestor whose text
  // merely contains the string (the card <a>, the grid), and strict mode fails on
  // the multiple hits.
  await expect(page.getByText("Windows 95", { exact: true })).toBeVisible();

  await islandsHydrated(page);
  await page.getByPlaceholder(/Search platforms/).fill("amiga");

  // Assert the filtered set by card count first, so a silently-dropped fill fails
  // here — at the interaction that broke — rather than two assertions later.
  // "an Amiga card is visible" cannot do that job: both Amiga Workbench cards
  // (1.x and 2.0) are in the unfiltered list too, so it holds either way.
  await expect(page.getByTestId("os-name")).toHaveCount(2); // 22 platforms unfiltered
  // exact: true again — see above.
  await expect(page.getByText("Amiga Workbench 1.x", { exact: true })).toBeVisible();
  await expect(page.getByText("Windows 95", { exact: true })).toHaveCount(0);
});

test("opening an OS page fires an osview beacon", async ({ page }) => {
  const events = await captureEvents(page);
  await page.goto("/os/windows-95");
  await expect(page.getByRole("heading", { name: "Windows 95" })).toBeVisible();
  // beacon fires on mount; give the island a tick to hydrate + send.
  await expect
    .poll(() => sawEvent(events, { kind: "osview", os: "windows-95" }))
    .toBe(true);
});

test("a per-color page selects that color from the first paint, not the default", async ({ page }) => {
  // This is the path a cross-design color link produces (similar color, a
  // Colors-page swatch, a platform swatch). The page is statically built, so the correct color
  // must be baked into the HTML — no client-side flash of the default.
  await page.goto("/os/windows-95/000080"); // Navy, not the default (Teal)
  await expect(page.getByRole("heading", { name: "Windows 95" })).toBeVisible();

  // The selected-color panel reflects Navy, and the DEFAULT badge (shown only when
  // the default color is selected) is absent.
  await expect(page.getByText("0, 0, 128")).toBeVisible(); // navy RGB
  await expect(page.getByText("DEFAULT", { exact: true })).toHaveCount(0); // the badge, not "popular defaults"

  // Exactly one row in the color list is marked as the current selection, and it is Navy.
  const selected = page.locator('[aria-current="true"]');
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("Navy");

  // Selecting a different color updates the URL so it can be copied/shared.
  // Target the list row by its stable per-color test id (Teal = #008080).
  // The gate goes here rather than after goto() so the assertions above can still
  // sample the server-rendered DOM — checking the baked-in color is this test's job.
  await islandsHydrated(page);
  await page.getByTestId("color-row-008080").click();
  await expect(page).toHaveURL(/\/os\/windows-95\/008080$/);
});

test("a non-initial color lazy-loads its detail from view.json", async ({ page }) => {
  // Delay the per-OS detail so the skeleton is observable before it resolves.
  await page.route("**/os/windows-95/view.json", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.goto("/os/windows-95/008080"); // Teal (default/initial): its detail is inline
  await expect(page.getByRole("heading", { name: "Windows 95" })).toBeVisible();
  await islandsHydrated(page);

  // Select Navy — not the initial color, so its heavy detail must come from the fetch.
  await page.getByTestId("color-row-000080").click();
  await expect(page.getByText("0, 0, 128")).toBeVisible();        // light fields: instant
  await expect(page.getByTestId("heavy-skeleton").first()).toBeVisible(); // heavy: skeleton first

  // Once view.json resolves, the skeleton is replaced by the real timeline.
  await expect(page.getByText("KNOWN USES")).toBeVisible();
  await expect(page.getByTestId("heavy-skeleton")).toHaveCount(0);
});

test("the ungrouped colors view fits a phone viewport", async ({ page }) => {
  // Layout regression guard. The unit tests run in jsdom, which has no layout
  // engine — the mobile rules for .dc-rank-row were dead for a long time (their
  // 1fr resolved against a fixed 660px minimum track on the container) and no
  // jsdom test could have noticed. Only a real browser catches this.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/colors");
  await islandsHydrated(page);

  // Below 760px the Group control is the mobile <Dropdown> (D2), not the segmented buttons.
  await page.getByRole("button", { name: /^Group:/ }).click();
  await page.getByRole("menuitem", { name: "Ungrouped" }).click();
  await expect(page.getByTestId("rank-row").first()).toBeVisible();

  const overflows = () =>
    page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  expect(await overflows()).toBe(false);

  // The in-place infobox is the widest thing the view renders; check it too.
  await page.getByTestId("rank-row").first().click();
  await expect(page.getByTestId("copy-hex").first()).toBeVisible();
  expect(await overflows()).toBe(false);
});

test("copying a color value fires a copy beacon", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const events = await captureEvents(page);
  await page.goto("/os/windows-95");
  await islandsHydrated(page);
  await page.getByTestId("copy-hex").click();
  await expect(page.getByText("Copied ✓")).toBeVisible();
  await expect
    .poll(() => sawEvent(events, { kind: "copy", hex: "#008080", os: "windows-95" }))
    .toBe(true);
});

test("serves a per-OS view.json with normalized detail", async ({ request }) => {
  const res = await request.get("/os/windows-95/view.json");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  const json = await res.json();
  expect(Array.isArray(json.details)).toBe(true);
  expect(json.details.length).toBeGreaterThan(1);
  expect(typeof json.osMeta).toBe("object");
  // wire platforms carry only slug + isDefault
  const somePlatform = json.details.flatMap((d: any) => d.uses)[0];
  expect(Object.keys(somePlatform).sort()).toEqual(["isDefault", "slug"]);
  // and osMeta resolves that slug
  expect(json.osMeta[somePlatform.slug]).toHaveProperty("name");
});

test("download sheet generates a wallpaper and fires a download beacon", async ({ page }) => {
  const events = await captureEvents(page);
  await page.goto("/os/windows-95");
  await islandsHydrated(page);
  await page.getByRole("button", { name: /Download/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "1920×1080" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/windows-95-teal-008080-1920x1080\.png/);
  await expect
    .poll(() => sawEvent(events, { kind: "download", hex: "#008080", os: "windows-95" }))
    .toBe(true);
});

test("robots.txt welcomes crawlers and names a sitemap this build serves", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();

  // All crawlers welcome; the beacon endpoint is the only thing off-limits.
  expect(body).toMatch(/^User-agent: \*$/m);
  expect(body).toMatch(/^Disallow: \/api\/$/m);

  // The Sitemap line must be absolute and on the production origin...
  const line = body.match(/^Sitemap: (\S+)$/m);
  expect(line).not.toBeNull();
  const advertised = new URL(line![1]);
  expect(advertised.origin).toBe("https://desktopcolors.com");

  // ...and the path it names must actually be served. Fetch the path, not the
  // absolute URL: that one points at production, this test at the preview server.
  const index = await request.get(advertised.pathname);
  expect(index.status()).toBe(200);
  const indexXml = await index.text();
  expect(indexXml).toContain("<sitemapindex");

  // Follow the index to the actual URL set (never hardcode "sitemap-0.xml").
  const loc = indexXml.match(/<loc>(\S+?)<\/loc>/);
  expect(loc).not.toBeNull();
  const urlset = await request.get(new URL(loc![1]).pathname);
  expect(urlset.status()).toBe(200);
  const urlsetXml = await urlset.text();

  // It lists pages...
  expect(urlsetXml).toContain("https://desktopcolors.com/os/windows-95");
  // ...and not the per-OS view.json endpoints. @astrojs/sitemap excludes
  // non-page routes on its own, so this asserts THE INTEGRATION'S behaviour,
  // not our config — it is what fails if a future version starts listing
  // endpoints. See the note in astro.config.mjs.
  expect(urlsetXml).not.toContain("view.json");
});

// Drives openwindows, the first entry to carry a real `source` note. If that
// note is ever reworded, update the `.toContainText` string below with it.
//
// This is the only test that drives a real browser at the Source toggle, and it
// guards two things jsdom cannot see — that below 760px the toggle lives inside
// the References dropdown rather than the top row (D2), and that opening the
// panel doesn't wrap that row onto a second line, which would push the title
// down the page.
test("the source note collapses into the references menu on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/os/openwindows");
  await islandsHydrated(page);

  // The inline pill is CSS-hidden; the dropdown takes its place. Both are in the
  // DOM either way — that is the D2 no-hydration-flash trick — so visibility,
  // not presence, is the claim.
  await expect(page.getByTestId("refs-inline")).toBeHidden();
  await expect(page.getByTestId("refs-menu")).toBeVisible();

  const rowBefore = (await page.getByTestId("detail-top-row").boundingBox())!;
  const trigger = (await page.getByTestId("refs-menu").boundingBox())!;
  // One line: the row is no taller than its tallest control, plus slack.
  expect(rowBefore.height).toBeLessThan(trigger.height * 1.6);

  await page.getByTestId("refs-menu").getByRole("button").click();
  await page.getByTestId("source-menu-item").click();

  await expect(page.getByTestId("source-panel")).toBeVisible();
  await expect(page.getByTestId("source-panel")).toContainText("Solaris 2.4");
  // The [Virtual OS Museum] marker must have become a real anchor, not literal
  // brackets — the one end-to-end check that authored markers survive the
  // schema, the build-time parse, and hydration.
  await expect(page.getByTestId("source-panel").getByRole("link", { name: "Virtual OS Museum" }))
    .toHaveAttribute("href", "https://virtualosmuseum.org/");

  // The panel must hang BELOW the row, not sit inside it. Position alone can't
  // prove that: detail-top-row has flex-wrap, so a panel wrongly nested as a
  // third flex child still gets wrapped onto its own line and *looks* like it
  // landed below the controls. What a wrongly-nested panel can't avoid is
  // dragging detail-top-row's own box down with it, since the row would then
  // have to grow to enclose it — that IS the D2 failure this test exists for:
  // pushing the title, and everything else on the page, further down the
  // screen. So re-check the one-line claim on the row itself, the same way as
  // above, after the interaction.
  const panelBox = (await page.getByTestId("source-panel").boundingBox())!;
  expect(panelBox.y).toBeGreaterThanOrEqual(rowBefore.y + rowBefore.height);
  expect(panelBox.width).toBeGreaterThan(rowBefore.width * 0.9);

  const rowAfter = (await page.getByTestId("detail-top-row").boundingBox())!;
  expect(rowAfter.height).toBeLessThan(trigger.height * 1.6);
});
