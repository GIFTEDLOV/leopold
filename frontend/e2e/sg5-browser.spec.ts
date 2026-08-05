import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  SG5_LIVE_ACK,
  SG5_LOCKED,
  SG5_ASSET_ORIGIN_AUTHORITY,
  SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED,
  attachHarnessObservations,
  assertSanitizedAggregateResult,
  assertSanitizedResult,
  buildNetworkFailureObservation,
  buildResponseNetworkObservation,
  classifyNetworkUrl,
  type SafeNetworkObservation,
  type SanitizedProbeResult,
} from "../lib/sg5/protocol";

const liveAcknowledged = process.env.SG5_LIVE_ACK === SG5_LIVE_ACK && SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED;
const liveContextResults: SanitizedProbeResult[] = [];

async function observeContext(context: BrowserContext, page: Page) {
  const errors = { console: 0, page: 0, unhandled: 0, forbiddenNetwork: 0, authority: 0 };
  const networkObservations: SafeNetworkObservation[] = [];
  const requestState = new WeakMap<
    object,
    { started: number; classification: Pick<SafeNetworkObservation, "originClassification" | "requestCategory"> }
  >();

  await context.route("**/*", async (route) => {
    try {
      classifyNetworkUrl(route.request().url());
      await route.continue();
    } catch {
      errors.forbiddenNetwork += 1;
      await route.abort("blockedbyclient");
    }
  });

  page.on("console", (message) => {
    if (message.type() === "error") errors.console += 1;
  });
  page.on("pageerror", () => {
    errors.page += 1;
  });
  page.on("request", (request) => {
    try {
      requestState.set(request, { started: performance.now(), classification: classifyNetworkUrl(request.url()) });
    } catch {
      errors.forbiddenNetwork += 1;
    }
  });
  page.on("requestfailed", (request) => {
    const state = requestState.get(request);
    if (state === undefined) return;
    try {
      networkObservations.push(
        buildNetworkFailureObservation(
          request.url(),
          Math.max(0, Math.round(performance.now() - state.started)),
          request.redirectedFrom()?.url(),
        ),
      );
    } catch {
      errors.forbiddenNetwork += 1;
    }
  });
  page.on("response", (response) => {
    try {
      const request = response.request();
      const state = requestState.get(request);
      if (state === undefined) throw new Error("response lacks a preregistered request classification");
      const observation = buildResponseNetworkObservation({
        requestUrl: request.url(),
        status: response.status(),
        durationMilliseconds: Math.max(0, Math.round(performance.now() - state.started)),
        redirectedToUrl: request.redirectedTo()?.url(),
        redirectedFromUrl: request.redirectedFrom()?.url(),
      });
      networkObservations.push(observation);
      if (
        observation.redirectClassification === "FORBIDDEN" ||
        (observation.statusCategory === "REDIRECT_3XX" && !observation.success)
      ) {
        errors.forbiddenNetwork += 1;
      }
    } catch {
      errors.forbiddenNetwork += 1;
    }
  });
  await page.addInitScript(() => {
    window.addEventListener("unhandledrejection", () => {
      document.documentElement.dataset.sg5UnhandledRejection = "true";
    });
    const forbidden = () => {
      document.documentElement.dataset.sg5AuthorityRequest = "true";
      throw new Error("wallet and transaction authority is forbidden in SG-5");
    };
    Object.defineProperty(window, "ethereum", {
      configurable: false,
      value: Object.freeze({ request: forbidden }),
    });
  });

  return { errors, networkObservations, context };
}

async function readSanitizedResult(page: Page): Promise<SanitizedProbeResult> {
  const text = await page.getByTestId("sg5-result").textContent();
  if (text === null) throw new Error("missing sanitized SG-5 result");
  const parsed: unknown = JSON.parse(text);
  assertSanitizedResult(parsed);
  return parsed;
}

test.describe("SG-5 offline structural mode", () => {
  test.skip(liveAcknowledged, "live acknowledgment selects the separate live suite");

  test("is browser-native, gated, sanitized, and cannot claim live PASS", async ({ context, page }) => {
    const observed = await observeContext(context, page);
    await page.goto("/__sg5__");
    await expect(page.getByTestId("sg5-result")).toBeVisible();
    const pageResult = await readSanitizedResult(page);
    const result = attachHarnessObservations(pageResult, observed.networkObservations, observed.errors);

    expect(result.executionMode).toBe("OFFLINE_STRUCTURAL");
    expect(result.status).toBe("STRUCTURAL_PASS_NOT_LIVE");
    expect(result.finalVerdict).toBe("NOT_LIVE");
    expect(result.forbiddenMaterialRetained).toBe(false);
    expect(result.walletRequested).toBe(false);
    expect(result.accountAuthorizationRequested).toBe(false);
    expect(result.signatureRequested).toBe(false);
    expect(result.transactionSubmitted).toBe(false);
    expect(observed.errors).toEqual({ console: 0, page: 0, unhandled: 0, forbiddenNetwork: 0, authority: 0 });
    expect(await page.locator("html").getAttribute("data-sg5-unhandled-rejection")).toBeNull();
    expect(await page.locator("html").getAttribute("data-sg5-authority-request")).toBeNull();
  });
});

test.describe("SG-5 live Sepolia mode", () => {
  test.skip(!liveAcknowledged, "requires the exact deliberate live acknowledgment");

  for (let contextIndex = 1; contextIndex <= SG5_LOCKED.coldContextCount; contextIndex += 1) {
    test(`cold context ${contextIndex} uses the real SDK and official origins`, async ({ browser }) => {
      const context = await browser.newContext({ serviceWorkers: "block" });
      await context.clearCookies();
      const page = await context.newPage();
      const observed = await observeContext(context, page);
      await page.goto("/__sg5__");
      await expect(page.getByTestId("sg5-result")).toBeVisible({ timeout: 360_000 });
      const pageResult = await readSanitizedResult(page);
      const authorityObserved = (await page.locator("html").getAttribute("data-sg5-authority-request")) !== null;
      observed.errors.authority = authorityObserved ? 1 : 0;
      const result = attachHarnessObservations(pageResult, observed.networkObservations, observed.errors);

      expect(result.executionMode).toBe("LIVE_SEPOLIA");
      expect(result.status).toBe("CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT");
      expect(result.chainId).toBe("11155111");
      expect(result.wasmRuntimeInitialized).toBe(true);
      expect(Number(result.wasmInstantiationCount)).toBeGreaterThan(0);
      expect(result.publicKeyRetrieved).toBe(true);
      expect(result.encryptedWidth).toBe("euint64");
      expect(result.encryptionCompleted).toBe(true);
      expect(result.encryptedPayloadCount).toBe("1");
      expect(result.inputProofPresent).toBe(true);
      expect(result.walletRequested).toBe(false);
      expect(result.accountAuthorizationRequested).toBe(false);
      expect(result.signatureRequested).toBe(false);
      expect(result.transactionSubmitted).toBe(false);
      expect(
        observed.networkObservations.some(
          (entry) =>
            entry.originClassification === "OFFICIAL_RELAYER" && entry.requestCategory === "RELAYER_KEYURL_METADATA",
        ),
      ).toBe(true);
      expect(
        observed.networkObservations.some(
          (entry) =>
            entry.originClassification === "OFFICIAL_PUBLIC_KEY_ASSET" &&
            entry.requestCategory === "PUBLIC_KEY_ASSET" &&
            entry.success,
        ),
      ).toBe(true);
      if (SG5_ASSET_ORIGIN_AUTHORITY.crsAssetRequired) {
        expect(
          observed.networkObservations.some(
            (entry) =>
              entry.originClassification === "OFFICIAL_CRS_ASSET" &&
              entry.requestCategory === "CRS_ASSET" &&
              entry.success,
          ),
        ).toBe(true);
      }
      expect(
        observed.networkObservations.some(
          (entry) => entry.originClassification === "OFFICIAL_CHAIN_RPC" && entry.requestCategory === "SEPOLIA_RPC",
        ),
      ).toBe(true);
      expect(observed.errors).toEqual({ console: 0, page: 0, unhandled: 0, forbiddenNetwork: 0, authority: 0 });
      expect(await page.locator("html").getAttribute("data-sg5-unhandled-rejection")).toBeNull();
      expect(await page.locator("html").getAttribute("data-sg5-authority-request")).toBeNull();
      liveContextResults.push(result);
      if (contextIndex === SG5_LOCKED.coldContextCount) {
        assertSanitizedAggregateResult({
          schema: "zama-szn4.sg5-browser-probe-aggregate.v1",
          protocolVersion: result.protocolVersion,
          status: "PASS",
          executionMode: "LIVE_SEPOLIA",
          requiredColdContexts: "2",
          passedColdContexts: "2",
          blockerClassification: "NONE",
          failureClassification: "NONE",
          excludedMockContexts: "0",
          dynamicAssetOriginsResolved: SG5_ASSET_ORIGIN_AUTHORITY.dynamicAssetOriginsResolved,
          publicKeyAssetOriginCommitted: SG5_ASSET_ORIGIN_AUTHORITY.publicKeyAssetOrigin !== null,
          crsAssetOriginCommitted: SG5_ASSET_ORIGIN_AUTHORITY.crsAssetOrigin !== null,
          crsAssetRequired: SG5_ASSET_ORIGIN_AUTHORITY.crsAssetRequired,
          contexts: liveContextResults,
        });
      }
      await context.close();
    });
  }
});
