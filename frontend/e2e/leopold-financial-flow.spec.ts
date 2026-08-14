import { expect, test } from "@playwright/test";

test.describe("Leopold explicit development fixture", () => {
  test.setTimeout(180_000);
  test("Connect → Sepolia → USDC → private → Weekly → save → enter → result → refund → withdraw", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Connect your wallet" })).toBeVisible();
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.getByRole("heading", { name: "Switch to Ethereum Sepolia" })).toBeVisible();
    await page.getByRole("button", { name: "Switch to Sepolia" }).click({ force: true });
    await expect(page.getByTestId("fixture-banner")).toContainText("not Sepolia");

    await page.getByRole("button", { name: "+ Add Money" }).click();
    await page.getByTestId("get-usdc").click();
    await expect(page.getByText("2500 USDC")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Amount").fill("10");
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByTestId("make-private").click();
    await expect(page.getByText("Private USDC is ready")).toBeVisible();
    await page.getByRole("button", { name: "Choose a vault" }).click();

    await page.getByRole("link", { name: "Vaults", exact: true }).click();
    await page.getByTestId("vault-weekly").getByRole("link", { name: "View" }).click();
    await page.getByLabel("Amount to save").fill("10");
    await page.getByTestId("save-private").click();
    await page.getByTestId("reveal-position").click();
    await expect(page.getByTestId("private-position")).toContainText("10 USDC");
    await page.getByTestId("enter-round").click();
    await expect(page.getByText("Entered current round")).toBeVisible();

    await page.getByRole("link", { name: "Prizes" }).click();
    await page.waitForURL("**/app/prizes");
    await page.getByTestId("reveal-result-weekly").click();
    await expect(page.getByText("No prize this round")).toBeVisible();
    await page.getByRole("link", { name: "Rewards" }).click();
    await page.waitForURL("**/app/rewards");
    await expect(page.getByTestId("claim-refund")).toBeEnabled();
    await page.getByTestId("claim-refund").click();

    await page.getByRole("link", { name: "Vaults" }).click();
    await page.waitForURL("**/app/vaults");
    await page.getByTestId("vault-weekly").getByRole("link", { name: "View" }).click();
    await page.getByLabel("Amount to withdraw").fill("1");
    await page.getByTestId("withdraw").click();
    await expect(page.getByTestId("private-position")).toContainText("9 USDC");
  });

  test("desktop route matrix has content, no framework overlay, and no horizontal overflow", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const publicRoutes = ["/", "/transparency", "/ops"];
    for (const route of publicRoutes) {
      await page.goto(route);
      await expect(page.locator("body")).not.toHaveText("");
      expect(await page.locator("[data-nextjs-dialog]").count()).toBe(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${route.slice(1) || "landing"}.png`), fullPage: true });
    }
    const appRoutes = [
      "/app",
      "/app/vaults",
      "/app/vaults/weekly",
      "/app/prizes",
      "/app/rewards",
      "/app/activity",
      "/app/profile",
      "/app/help",
    ];
    for (const route of appRoutes) {
      await page.goto(route);
      const connectWallet = page.getByRole("button", { name: "Connect Wallet" });
      if (await connectWallet.count()) {
        await connectWallet.click({ force: true });
        await page.getByRole("button", { name: "Switch to Sepolia" }).click({ force: true });
      }
      if (route === "/app") await expect(page.getByTestId("fixture-banner")).toBeVisible();
      expect(await page.locator("[data-nextjs-dialog]").count()).toBe(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${route.replaceAll("/", "-").slice(1)}.png`),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
});
