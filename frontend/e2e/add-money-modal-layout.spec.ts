import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { name: "desktop-short", width: 1081, height: 461 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

type FixtureConnector = {
  uid: string;
  connect(input: { isReconnecting: boolean }): Promise<{ accounts: string[]; chainId: number }>;
};

type FixtureConfig = {
  connectors: FixtureConnector[];
  _internal: { events: { connect(input: { uid: string; accounts: string[]; chainId: number }): void } };
};

type FixtureFiber = {
  type?: { displayName?: string; name?: string } | ((...args: never[]) => unknown) | string;
  child?: FixtureFiber | null;
  sibling?: FixtureFiber | null;
  memoizedProps?: { config?: FixtureConfig; onClick?: () => void | Promise<void> } | null;
};

async function installReadOnlySepoliaFixture(page: Page) {
  await page.route(/https:\/\/(?:ethereum-sepolia-rpc\.publicnode\.com|1rpc\.io)\/.*/, async (route) => {
    const request = route.request().postDataJSON() as
      | { id?: number; method?: string }
      | Array<{ id?: number; method?: string }>;
    const response = (item: { id?: number; method?: string }) => ({
      jsonrpc: "2.0",
      id: item.id ?? 1,
      result: item.method === "eth_chainId" ? "0xaa36a7" : item.method === "eth_blockNumber" ? "0x100" : "0x0",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(Array.isArray(request) ? request.map(response) : response(request)),
    });
  });

  await page.addInitScript(() => {
    const account = "0x7E57a10D00000000000000000000000000000001";
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const provider = {
      isConnected: () => true,
      request: async ({ method }: { method: string }) => {
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
        if (method === "wallet_requestPermissions") return [{ caveats: [{ value: [account] }] }];
        if (method === "eth_getTransactionCount") return "0x0";
        if (method === "eth_blockNumber") return "0x100";
        if (method === "eth_getBalance" || method === "eth_getCode" || method === "eth_call") return "0x0";
        if (method === "net_version") return "11155111";
        if (method.startsWith("wallet_")) return null;
        return "0x0";
      },
      on: (event: string, callback: (...args: unknown[]) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), callback]);
      },
      removeListener: (event: string, callback: (...args: unknown[]) => void) => {
        listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== callback));
      },
      off: (event: string, callback: (...args: unknown[]) => void) => {
        listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== callback));
      },
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
  });
}

async function connectWagmiFixture(page: Page) {
  await page.evaluate(async () => {
    const rootKey = Object.keys(document.documentElement).find((key) => key.startsWith("__reactFiber$"));
    if (!rootKey) throw new Error("Wagmi fixture root was not found");
    const findProvider = (fiber: FixtureFiber | null): FixtureFiber | null => {
      if (!fiber) return null;
      const functionType =
        typeof fiber.type === "function"
          ? (fiber.type as unknown as { displayName?: string; name?: string })
          : null;
      const name = functionType ? functionType.displayName || functionType.name : "";
      if (name === "WagmiProvider") return fiber;
      return findProvider(fiber.child ?? null) ?? findProvider(fiber.sibling ?? null);
    };
    const rootFiber = (document.documentElement as unknown as Record<string, FixtureFiber | undefined>)[rootKey] ?? null;
    const providerFiber = findProvider(rootFiber);
    const config = providerFiber?.memoizedProps?.config;
    const connector = config?.connectors?.[0];
    if (!config || !connector) throw new Error("Injected Wagmi connector was not found");
    const result = await connector.connect({ isReconnecting: false });
    config._internal.events.connect({ uid: connector.uid, accounts: result.accounts, chainId: result.chainId });
  });
}

async function invokeExistingClickHandler(page: Page, button: ReturnType<Page["getByRole"]>) {
  await button.evaluate(async (element) => {
    const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
    const fiber = fiberKey ? (element as unknown as Record<string, FixtureFiber | undefined>)[fiberKey] : null;
    const handler = fiber?.memoizedProps?.onClick;
    if (typeof handler !== "function") throw new Error("React click handler was not found");
    await handler();
  });
}

async function connectFixture(page: Page, route: "/app/classic" | "/app") {
  await page.goto(route);
  const connect = page.getByRole("button", { name: "Connect Wallet" });
  if (await connect.count()) {
    await expect(connect).toBeVisible();
    await page.waitForTimeout(1_000);
    await connect.click({ force: true });
    if (await connect.count()) await invokeExistingClickHandler(page, connect);
    await expect(connect).toHaveCount(0, { timeout: 10_000 });
  }
  await expect(page.getByRole("button", { name: "+ Add Money" })).toBeVisible();
  await connectWagmiFixture(page);
  await page.waitForTimeout(750);
  if (await connect.count()) {
    await invokeExistingClickHandler(page, connect);
    await expect(connect).toHaveCount(0, { timeout: 10_000 });
  }
  const switchNetwork = page.getByRole("button", { name: "Switch to Sepolia" });
  if (await switchNetwork.count()) await switchNetwork.click();
  const retryNetwork = page.getByRole("button", { name: "Retry network" });
  if (await retryNetwork.count()) {
    await invokeExistingClickHandler(page, retryNetwork);
    await expect(retryNetwork).toHaveCount(0, { timeout: 15_000 });
  }
}

async function openClassicAddMoney(page: Page) {
  await expect(page.getByRole("button", { name: "+ Add Money" })).toBeVisible();
  await page.getByRole("button", { name: "+ Add Money" }).click();
  const dialog = page.getByRole("dialog", { name: "Make savings private" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function inspectGeometry(page: Page, dialog: ReturnType<Page["getByRole"]>, viewport: { width: number; height: number }) {
  const geometry = await dialog.evaluate((element) => {
    const dialogRect = element.getBoundingClientRect();
    const backdropRect = element.parentElement?.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      dialog: { left: dialogRect.left, right: dialogRect.right, top: dialogRect.top, bottom: dialogRect.bottom, width: dialogRect.width },
      backdrop: backdropRect
        ? { left: backdropRect.left, right: backdropRect.right, top: backdropRect.top, bottom: backdropRect.bottom }
        : null,
      overflowY: style.overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      backgroundColor: style.backgroundColor,
    };
  });

  expect(geometry.backdrop).not.toBeNull();
  expect(geometry.backdrop?.left).toBeCloseTo(0, 1);
  expect(geometry.backdrop?.top).toBeCloseTo(0, 1);
  expect(geometry.backdrop?.right).toBeCloseTo(viewport.width, 1);
  expect(geometry.backdrop?.bottom).toBeCloseTo(viewport.height, 1);
  expect(geometry.dialog.left).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.right).toBeLessThanOrEqual(viewport.width);
  expect(geometry.dialog.width).toBeLessThanOrEqual(viewport.width);
  expect(Math.abs((geometry.dialog.left + geometry.dialog.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(geometry.overflowY).toBe("auto");
  expect(geometry.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");

  await dialog.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
}

test.describe("shared Add Money modal layout", () => {
  test.use({ serviceWorkers: "block" });

  test("stays viewport-contained across Classic viewports and themes", async ({ page }, testInfo) => {
    await installReadOnlySepoliaFixture(page);
    await page.setViewportSize({ width: 1081, height: 461 });
    await connectFixture(page, "/app/classic");

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const dialog = await openClassicAddMoney(page);
      await inspectGeometry(page, dialog, viewport);
      if (viewport.name === "desktop-short") {
        await page.screenshot({ path: testInfo.outputPath("add-money-classic-1081x461.png") });
      }
      if (viewport.name === "mobile") {
        await page.screenshot({ path: testInfo.outputPath("add-money-classic-390x844.png") });
      }
      await page.getByRole("button", { name: "Close" }).click();
    }

    await page.setViewportSize({ width: 1081, height: 461 });
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((nextTheme) => {
        document.documentElement.dataset.leopoldTheme = nextTheme;
        window.dispatchEvent(new Event("leopold-theme-change"));
      }, theme);
      const dialog = await openClassicAddMoney(page);
      await inspectGeometry(page, dialog, { width: 1081, height: 461 });
      await page.getByRole("button", { name: "Close" }).click();
    }
  });

  test("keeps the V2 default route Add Money dialog contained", async ({ page }, testInfo) => {
    await installReadOnlySepoliaFixture(page);
    await page.setViewportSize({ width: 1081, height: 461 });
    await connectFixture(page, "/app");
    await expect(page.getByRole("button", { name: "+ Add Money" })).toBeVisible();
    await page.getByRole("button", { name: "+ Add Money" }).click();
    const dialog = page.getByRole("dialog", { name: "Add money" });
    await expect(dialog).toBeVisible();
    const rect = await dialog.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect?.x).toBeGreaterThanOrEqual(0);
    expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(1081);
    await page.screenshot({ path: testInfo.outputPath("add-money-v2-1081x461.png") });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});
