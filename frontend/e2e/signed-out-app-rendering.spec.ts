import { expect, test, type Page } from "@playwright/test";

const fixtureMode = process.env.NEXT_PUBLIC_LEOPOLD_AUTH_FIXTURE === "expired" ? "expired" : "anonymous";
const gateTestId = fixtureMode === "expired" ? "session-expired-gate" : "signed-out-gate";
const gateHeading = fixtureMode === "expired" ? "Session expired" : "Enter your Leopold account";
const signInLabel = fixtureMode === "expired" ? "Return to sign in" : "Continue to sign in";
const screenshotPrefix = fixtureMode === "expired" ? "session-expired" : "signed-out";
const viewports = [
  { name: "1819x799", width: 1819, height: 799 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1081x461", width: 1081, height: 461 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

async function assertGate(page: Page, viewport: (typeof viewports)[number]) {
  const gate = page.getByTestId(gateTestId);
  await expect(gate).toBeVisible();
  await expect(page.getByRole("heading", { name: gateHeading })).toBeVisible();
  await expect(page.getByRole("link", { name: signInLabel })).toHaveAttribute("href", "/login");
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.locator('nav[aria-label="Authenticated application"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ Add Money" })).toHaveCount(0);
  await expect(page.locator('[role="menu"], .account-popover')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Auth setup required");

  const geometry = await gate.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(viewport.width);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
  expect(geometry.width).toBeLessThanOrEqual(viewport.width);
  expect(geometry.height).toBeLessThanOrEqual(viewport.height);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

test.describe(`${fixtureMode} app rendering gate`, () => {
  test.setTimeout(120_000);
  test.use({ serviceWorkers: "block" });

  test("removes authenticated chrome across routes, viewports, and themes", async ({ page }, testInfo) => {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/app");

      for (const theme of ["light", "dark"] as const) {
        await page.evaluate((nextTheme) => {
          document.documentElement.dataset.leopoldTheme = nextTheme;
          window.dispatchEvent(new Event("leopold-theme-change"));
        }, theme);
        await assertGate(page, viewport);

        if (theme === "light" && (viewport.name === "1819x799" || viewport.name === "390x844")) {
          await page.screenshot({ path: testInfo.outputPath(`${screenshotPrefix}-${viewport.name}.png`) });
        }
      }
    }

    await page.setViewportSize({ width: 1819, height: 799 });
    await page.goto("/app/classic");
    await assertGate(page, viewports[0]);
  });
});
