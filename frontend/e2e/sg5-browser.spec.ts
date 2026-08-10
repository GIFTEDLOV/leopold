import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { JsonRpcProvider, Wallet } from "ethers";
import { writeFileSync } from "node:fs";

import {
  SG5_ASSET_ORIGIN_AUTHORITY,
  SG5_LIVE_ACK,
  SG5_LOCKED,
  attachHarnessObservations,
  assertSanitizedAggregateResult,
  assertSanitizedResult,
  buildNetworkFailureObservation,
  buildResponseNetworkObservation,
  classifyNetworkUrl,
  type SafeNetworkObservation,
  type SanitizedProbeResult,
} from "../lib/sg5/protocol";

const live = process.env.SG5_LIVE_ACK === SG5_LIVE_ACK;
const liveResults: SanitizedProbeResult[] = [];
const scenarioResults: Record<string, boolean> = {};
const rpcUrl = process.env.SG5_SEPOLIA_RPC_URL;
const automationKey = process.env.SG5_AUTOMATION_PRIVATE_KEY;
const unauthorizedKey = process.env.SG5_UNAUTHORIZED_PRIVATE_KEY;

function safeHexChainId(chainId: number): string { return `0x${chainId.toString(16)}`; }
function asString(value: unknown): string { return typeof value === "string" ? value : ""; }

async function bridgeRequest(wallet: Wallet, rpc: JsonRpcProvider, method: string, params: readonly unknown[], chainId: number, canSend: boolean): Promise<unknown> {
  try {
    const address = await wallet.getAddress();
    if (method === "eth_chainId") return safeHexChainId(chainId);
    if (method === "net_version") return String(chainId);
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
    if (method === "eth_sendTransaction") {
      if (!canSend) throw new Error("UNAUTHORIZED_SEND_BLOCKED");
      const raw = (params[0] || {}) as Record<string, string | undefined>;
      const tx = {
        to: raw.to,
        data: raw.data,
        value: raw.value ? BigInt(raw.value) : undefined,
        gasLimit: raw.gas ? BigInt(raw.gas) : undefined,
        maxFeePerGas: raw.maxFeePerGas ? BigInt(raw.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: raw.maxPriorityFeePerGas ? BigInt(raw.maxPriorityFeePerGas) : undefined,
      };
      return (await wallet.sendTransaction(tx)).hash;
    }
    if (method === "eth_signTypedData_v4") {
      const payload = JSON.parse(asString(params[1])) as { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; message: Record<string, unknown> };
      const types = { ...payload.types };
      delete types.EIP712Domain;
      return wallet.signTypedData(payload.domain, types, payload.message);
    }
    if (method === "personal_sign") return wallet.signMessage(asString(params[0]));
    return await rpc.send(method, Array.isArray(params) ? [...params] : []);
  } catch {
    throw new Error("SG5_PROVIDER_BRIDGE_FAILURE");
  }
}

async function installProvider(context: BrowserContext, chainId: number = SG5_LOCKED.chainId) {
  if (!rpcUrl || !automationKey || !unauthorizedKey) throw new Error("SG5 automation wallet environment is incomplete");
  const rpc = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
  const wallet = new Wallet(automationKey, rpc);
  const unauthorized = new Wallet(unauthorizedKey);
  await context.exposeFunction("__sg5ProviderRequest", (method: string, params: readonly unknown[]) => bridgeRequest(wallet, rpc, method, params || [], chainId, true));
  await context.exposeFunction("__sg5UnauthorizedProviderRequest", (method: string, params: readonly unknown[]) => bridgeRequest(unauthorized, rpc, method, params || [], chainId, false));
  await context.addInitScript((requestedChainId) => {
    const provider = (bridgeName: string) => ({
      request: ({ method, params }: { method: string; params?: readonly unknown[] }) => (window as unknown as Record<string, unknown>)[bridgeName] instanceof Function ? ((window as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[bridgeName])(method, params || []) : Promise.reject(new Error("SG5_PROVIDER_BRIDGE_MISSING")),
      on: () => undefined,
      removeListener: () => undefined,
    });
    Object.defineProperty(window, "ethereum", { configurable: false, value: provider("__sg5ProviderRequest") });
    Object.defineProperty(window, "__sg5UnauthorizedEthereum", { configurable: false, value: provider("__sg5UnauthorizedProviderRequest") });
    document.documentElement.dataset.sg5ExpectedChainId = String(requestedChainId);
  }, chainId);
}

async function observeContext(context: BrowserContext, page: Page) {
  const errors = { console: 0, page: 0, unhandled: 0, forbiddenNetwork: 0 };
  const networkObservations: SafeNetworkObservation[] = [];
  const requestState = new WeakMap<object, { started: number }>();
  await context.route("**/*", async (route) => {
    try { classifyNetworkUrl(route.request().url(), SG5_ASSET_ORIGIN_AUTHORITY); await route.continue(); }
    catch { errors.forbiddenNetwork += 1; await route.abort("blockedbyclient"); }
  });
  page.on("console", (message) => { if (message.type() === "error") errors.console += 1; if (message.text().startsWith("SG5_STAGE:")) process.stdout.write(`${message.text()}\n`); });
  page.on("pageerror", () => { errors.page += 1; });
  page.on("request", (request) => { try { classifyNetworkUrl(request.url(), SG5_ASSET_ORIGIN_AUTHORITY); requestState.set(request, { started: performance.now() }); } catch { errors.forbiddenNetwork += 1; } });
  page.on("requestfailed", (request) => { const state = requestState.get(request); if (!state) return; try { networkObservations.push(buildNetworkFailureObservation(request.url(), Math.max(0, Math.round(performance.now() - state.started)), request.redirectedFrom()?.url(), SG5_ASSET_ORIGIN_AUTHORITY)); } catch { errors.forbiddenNetwork += 1; } });
  page.on("response", (response) => { try { const request = response.request(); const state = requestState.get(request); if (!state) throw new Error("response without request"); const observation = buildResponseNetworkObservation({ requestUrl: request.url(), status: response.status(), durationMilliseconds: Math.max(0, Math.round(performance.now() - state.started)), redirectedToUrl: request.redirectedTo()?.url(), redirectedFromUrl: request.redirectedFrom()?.url() }, SG5_ASSET_ORIGIN_AUTHORITY); networkObservations.push(observation); if (!observation.success) errors.forbiddenNetwork += 1; } catch { errors.forbiddenNetwork += 1; } });
  page.on("console", (message) => { if (message.type() === "warning" && /failed|error|wasm|worker|hydration/iu.test(message.text())) errors.console += 1; });
  await page.addInitScript(() => { window.addEventListener("unhandledrejection", () => { document.documentElement.dataset.sg5UnhandledRejection = "true"; }); });
  return { errors, networkObservations };
}

async function readResult(page: Page): Promise<SanitizedProbeResult> {
  const text = await page.getByTestId("sg5-result").textContent(); if (!text) throw new Error("missing SG5 result"); const parsed: unknown = JSON.parse(text); assertSanitizedResult(parsed); return parsed;
}

async function waitForProbeOutcome(page: Page): Promise<void> {
  await expect.poll(async () => (await page.getByTestId("sg5-result").count()) + (await page.getByTestId("sg5-failure").count()), { timeout: 600_000 }).toBe(1);
  if (await page.getByTestId("sg5-failure").count()) throw new Error(`SG5_BROWSER_PROBE_FAILURE:${await page.getByTestId("sg5-failure-class").textContent()}`);
}

test.describe.configure({ mode: "serial", timeout: 900_000 });

test.describe("SG-5 browser capability", () => {
  test.skip(!live, "live SG-5 acknowledgment is required");

  test("SG5-01..09 clean browser encrypted lifecycle", async ({ browser }) => {
    if (process.env.SG5_PRODUCTION_BUILD !== "1") throw new Error("SG5 production bundle marker missing");
    for (let index = 0; index < SG5_LOCKED.coldContextCount; index += 1) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      await installProvider(context);
      const observed = await observeContext(context, page);
      const initialState = await context.storageState();
      const clean = { cookies: initialState.cookies.length, origins: initialState.origins.length };
      expect(clean).toEqual({ cookies: 0, origins: 0 });
      await page.goto("/");
      await page.goto("/sg5-probe");
      await waitForProbeOutcome(page);
      const result = attachHarnessObservations(await readResult(page), observed.networkObservations, observed.errors);
      expect(result.status).toBe("CAPABILITY_COMPLETE"); expect(result.observedChainId).toBe("11155111"); expect(result.transactionStatus).toBe("SUCCESS"); expect(result.authorizedPlaintextMatched).toBe(true); expect(result.unauthorizedDecryptionRejected).toBe(true);
      await page.reload(); await waitForProbeOutcome(page); const repeat = attachHarnessObservations(await readResult(page), observed.networkObservations, observed.errors); expect(repeat.status).toBe("CAPABILITY_COMPLETE"); scenarioResults["SG5-10_FRESH_CONTEXT_REPEAT"] = true;
      liveResults.push(result); await context.close();
    }
    for (const key of ["SG5-01_CLEAN_LOAD", "SG5-02_SDK_INITIALIZATION", "SG5-03_SEPOLIA_PROVIDER", "SG5-05_BROWSER_ENCRYPTION", "SG5-06_LIVE_ENCRYPTED_TRANSACTION", "SG5-07_RESULT_READBACK", "SG5-08_AUTHORIZED_DECRYPTION", "SG5-09_UNAUTHORIZED_ACCESS", "SG5-11_PRODUCTION_BUILD"]) scenarioResults[key] = true;
    expect(liveResults).toHaveLength(2);
  });

  test("SG5-04 wrong network refuses before FHE work", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "block" }); const page = await context.newPage(); await installProvider(context, 1); const observed = await observeContext(context, page); await page.goto("/sg5-probe"); await expect(page.getByTestId("sg5-wrong-network-refused")).toBeVisible(); await expect(page.getByTestId("sg5-no-transaction")).toBeVisible(); expect(observed.errors.forbiddenNetwork).toBe(0); expect(observed.networkObservations.some((entry) => entry.requestCategory !== "LOCAL_FRONTEND_ASSET")).toBe(false); scenarioResults["SG5-04_WRONG_NETWORK"] = true; await context.close();
  });

  test.afterAll(() => {
    const passing = liveResults.filter((result) => result.status === "CAPABILITY_COMPLETE").length;
    const aggregate = { schema: "zama-szn4.sg5-browser-probe-aggregate.v2", protocolVersion: "sg5-browser-capability-v2", status: passing === 2 && scenarioResults["SG5-04_WRONG_NETWORK"] === true ? "PASS" : "FAIL", executionMode: "LIVE_SEPOLIA", requiredColdContexts: "2", passedColdContexts: String(passing), excludedMockContexts: "0", wrongNetworkScenarioPassed: scenarioResults["SG5-04_WRONG_NETWORK"] === true, productionBuildPassed: scenarioResults["SG5-11_PRODUCTION_BUILD"] === true, contexts: liveResults } as const;
    if (passing === 2 && scenarioResults["SG5-04_WRONG_NETWORK"] === true) assertSanitizedAggregateResult(aggregate);
    if (process.env.SG5_RESULT_PATH) writeFileSync(process.env.SG5_RESULT_PATH, `${JSON.stringify({ aggregate, scenarios: scenarioResults }, null, 2)}\n`, { mode: 0o600 });
  });
});
