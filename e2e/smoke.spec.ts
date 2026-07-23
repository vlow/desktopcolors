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

test("home lists platforms and search filters", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("The desktop color archive")).toBeVisible();
  // exact: true — the browse card title is its own text node equal to exactly
  // "Windows 95"; a non-exact match also hits Windows NT 4.0's tagline
  // ("...the Windows 95 shell...").
  await expect(page.getByText("Windows 95", { exact: true })).toBeVisible();
  await page.getByPlaceholder(/Search platforms/).fill("amiga");
  // The "amiga" filter legitimately shows both Amiga Workbench cards (1.x and
  // 2.0), so assert the specific card title rather than the ambiguous substring.
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
  // This is the path a cross-design color link produces (similar color, explorer
  // swatch, browse swatch). The page is statically built, so the correct color
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
  await page.getByTestId("color-row-008080").click();
  await expect(page).toHaveURL(/\/os\/windows-95\/008080$/);
});

test("copying a color value fires a copy beacon", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const events = await captureEvents(page);
  await page.goto("/os/windows-95");
  await page.getByTestId("copy-hex").click();
  await expect(page.getByText("Copied ✓")).toBeVisible();
  await expect
    .poll(() => sawEvent(events, { kind: "copy", hex: "#008080", os: "windows-95" }))
    .toBe(true);
});

test("download sheet generates a wallpaper and fires a download beacon", async ({ page }) => {
  const events = await captureEvents(page);
  await page.goto("/os/windows-95");
  await page.getByRole("button", { name: /Download/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "1920×1080" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/windows-95-teal-008080-1920x1080\.png/);
  await expect
    .poll(() => sawEvent(events, { kind: "download", hex: "#008080", os: "windows-95" }))
    .toBe(true);
});
