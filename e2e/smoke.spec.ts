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
// note is ever reworded, update the assertions below with it.
//
// Two claims, each asserted at the width where it actually holds, and both
// invisible to jsdom, which has no layout engine:
//
//  1. At desktop width, switching to the note does not change the box's height.
//     That is the whole point of putting provenance inside the colour box, and
//     it is real here because .dc-detail-hero stretches both columns to a
//     372px-min row — so the note shares the list's space rather than adding to
//     it. A body that sized to content instead would break this.
//  2. At 390px the header holds "All colors | Source" AND its meta line on one
//     line. That header is a non-wrapping flex row inside a box with
//     overflow: hidden, so the failure mode is not a wrap — it is silent
//     horizontal clipping of whichever end runs out of room.
//
// Claim 1 is deliberately NOT asserted at 390px: the mobile rules drop the
// hero's min-height, so the box hugs its content in both views. For an entry
// with one colour a three-line note is legitimately taller than a one-row list,
// and forcing them equal would mean padding out short lists with dead space.
test("the colour box shows the source note in its own space", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/os/openwindows");
  await islandsHydrated(page);

  // The list shows first; the note is mounted but hidden by CSS, so visibility
  // is the claim, not presence.
  await expect(page.getByTestId("colors-list")).toBeVisible();
  await expect(page.getByTestId("source-panel")).toBeHidden();

  const boxBefore = (await page.getByTestId("colors-box").boundingBox())!;
  const listBefore = (await page.getByTestId("colors-list").boundingBox())!;
  await page.getByTestId("view-source").click();

  await expect(page.getByTestId("source-panel")).toBeVisible();
  await expect(page.getByTestId("colors-list")).toBeHidden();
  await expect(page.getByTestId("source-panel")).toContainText("Solaris 2.4");
  // The [Virtual OS Museum] marker must have become a real anchor, not literal
  // brackets — the one end-to-end check that authored markers survive the
  // schema, the build-time parse, and hydration.
  await expect(page.getByTestId("source-panel").getByRole("link", { name: "Virtual OS Museum" }))
    .toHaveAttribute("href", "https://virtualosmuseum.org/");

  // Claim 1, the sharp form: the note occupies the very rect the list vacated.
  // Box height alone is a weak check for an entry with one colour — the hero's
  // 372px floor swallows any growth — but this bites on the regression that
  // actually matters: a note rendered below the list instead of in its place,
  // or spilling outside the card.
  const panel = (await page.getByTestId("source-panel").boundingBox())!;
  expect(panel.y).toBeCloseTo(listBefore.y, 0);
  expect(panel.height).toBeCloseTo(listBefore.height, 0);
  const boxAfter = (await page.getByTestId("colors-box").boundingBox())!;
  expect(boxAfter.height).toBeCloseTo(boxBefore.height, 0);

  // Claim 2: the header survives a phone's width on one line, in both views.
  await page.setViewportSize({ width: 390, height: 844 });
  // The switcher keeps working after the reflow — the view is state, not CSS.
  await expect(page.getByTestId("source-panel")).toBeVisible();
  const headSource = (await page.getByTestId("colors-box-head").boundingBox())!;

  await page.getByTestId("view-colors").click();
  await expect(page.getByTestId("colors-list")).toBeVisible();

  const box = (await page.getByTestId("colors-box").boundingBox())!;
  const head = (await page.getByTestId("colors-box-head").boundingBox())!;
  const tab = (await page.getByTestId("view-colors").boundingBox())!;
  const meta = (await page.getByTestId("colors-box-meta").boundingBox())!;

  // Same line: the switcher's and the meta's vertical extents overlap. The
  // header is a non-wrapping flex row, so the meta cannot drop below the tabs —
  // but its own text can wrap internally, which is what this catches.
  expect(meta.y).toBeLessThan(tab.y + tab.height);
  expect(tab.y).toBeLessThan(meta.y + meta.height);
  // Nothing clipped: both ends sit inside the box's own width.
  expect(tab.x).toBeGreaterThanOrEqual(box.x);
  expect(meta.x + meta.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  // One line, and the same one line in both views: a header that grew in either
  // would make the card taller, which is the failure this placement avoids.
  expect(head.height).toBeLessThan(tab.height * 2 + 24);
  expect(headSource.height).toBeCloseTo(head.height, 0);
});
