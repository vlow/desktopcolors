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

test("home lists platforms and search filters", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("The desktop color archive")).toBeVisible();
  await expect(page.getByText("Windows 95")).toBeVisible();
  await page.getByPlaceholder(/Search platforms/).fill("amiga");
  await expect(page.getByText("Amiga Workbench")).toBeVisible();
  await expect(page.getByText("Windows 95")).toHaveCount(0);
});

test("opening an OS page fires an osview beacon", async ({ page }) => {
  const events = await captureEvents(page);
  await page.goto("/os/windows-95");
  await expect(page.getByRole("heading", { name: "Windows 95" })).toBeVisible();
  // beacon fires on mount; give the island a tick to hydrate + send.
  await expect
    .poll(() => events.some((b) => b.includes('"kind":"osview"')))
    .toBe(true);
});

test("copying a color value fires a copy beacon", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const events = await captureEvents(page);
  await page.goto("/os/windows-95");
  await page.getByTestId("copy-hex").click();
  await expect(page.getByText("Copied ✓")).toBeVisible();
  await expect
    .poll(() => events.some((b) => b.includes('"kind":"copy"')))
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
    .poll(() => events.some((b) => b.includes('"kind":"download"')))
    .toBe(true);
});
