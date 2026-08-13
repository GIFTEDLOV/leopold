#!/usr/bin/env node

const { readFileSync, writeFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { JsonRpcProvider, Wallet } = require("ethers");
const { chromium } = require(resolve("frontend/node_modules/@playwright/test"));

const ROOT = resolve(__dirname, "..");
const SCREENSHOTS = join(ROOT, "evidence/deployment/screenshots");
const RPC_VARS = "/home/dell/.config/hardhat-nodejs/vars.json";
const CHAIN_ID = 11155111;

function loadProtectedVars() {
  const parsed = JSON.parse(readFileSync(RPC_VARS, "utf8"));
  const vars = parsed && parsed.vars ? parsed.vars : parsed;
  const value = (name) => (typeof vars[name] === "object" ? vars[name].value : vars[name]);
  const rpc = value("SEPOLIA_RPC_URL");
  const key = value("SEPOLIA_PRIVATE_KEY");
  if (typeof rpc !== "string" || typeof key !== "string" || !/^https:\/\//u.test(rpc)) {
    throw new Error("PROTECTED_SEPOLIA_WALLET_CONFIGURATION_INVALID");
  }
  return { rpc, key };
}

function chainHex(chainId) {
  return `0x${chainId.toString(16)}`;
}

async function main() {
  const { rpc, key } = loadProtectedVars();
  const provider = new JsonRpcProvider(rpc, CHAIN_ID, { staticNetwork: true });
  const wallet = new Wallet(key, provider);
  const unauthorized = Wallet.createRandom();
  const txHashes = [];
  const errors = [];
  const bridge = async (walletInstance, canSend, method, params) => {
    if (method === "eth_chainId") return chainHex(CHAIN_ID);
    if (method === "net_version") return String(CHAIN_ID);
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [await walletInstance.getAddress()];
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
    if (method === "eth_sendTransaction") {
      if (!canSend) throw new Error("UNAUTHORIZED_SEND_BLOCKED");
      const raw = params[0] || {};
      const tx = {
        to: raw.to,
        data: raw.data,
        value: raw.value === undefined ? undefined : BigInt(raw.value),
        gasLimit: raw.gas === undefined ? undefined : BigInt(raw.gas),
        maxFeePerGas: raw.maxFeePerGas === undefined ? undefined : BigInt(raw.maxFeePerGas),
        maxPriorityFeePerGas: raw.maxPriorityFeePerGas === undefined ? undefined : BigInt(raw.maxPriorityFeePerGas),
      };
      const sent = await walletInstance.sendTransaction(tx);
      txHashes.push(sent.hash);
      return sent.hash;
    }
    if (method === "eth_signTypedData_v4") {
      const payload = JSON.parse(String(params[1]));
      const types = { ...payload.types };
      delete types.EIP712Domain;
      return walletInstance.signTypedData(payload.domain, types, payload.message);
    }
    if (method === "personal_sign") return walletInstance.signMessage(String(params[0]));
    return provider.send(method, Array.isArray(params) ? params : []);
  };

  const browser = await chromium.launch({
    executablePath: "/home/dell/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.exposeFunction("__leopoldProviderRequest", (method, params) =>
    bridge(wallet, true, method, params || []),
  );
  await context.exposeFunction("__leopoldUnauthorizedProviderRequest", (method, params) =>
    bridge(unauthorized, false, method, params || []),
  );
  await context.addInitScript(() => {
    const createProvider = (name) => ({
      request: ({ method, params }) => globalThis[name](method, params || []),
      on: () => undefined,
      removeListener: () => undefined,
    });
    Object.defineProperty(globalThis, "ethereum", {
      configurable: false,
      value: createProvider("__leopoldProviderRequest"),
    });
    Object.defineProperty(globalThis, "__leopoldUnauthorizedEthereum", {
      configurable: false,
      value: createProvider("__leopoldUnauthorizedProviderRequest"),
    });
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`pageerror:${error.name}:${error.message.slice(0, 240)}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text().slice(0, 240)}`);
  });
  const stages = [];
  async function snapshot(stage) {
    const body = (await page.locator("body").innerText()).replace(/\s+/gu, " ").trim();
    stages.push({ stage, body: body.slice(0, 1600), txCount: txHashes.length });
    await page.screenshot({ path: join(SCREENSHOTS, `live-${stage}.png`), fullPage: true });
    return body;
  }
  async function waitForText(text, timeout = 30000) {
    await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
  }
  async function waitForButton(name, timeout = 30000) {
    const button = page.getByRole("button", { name, exact: true });
    await button.waitFor({ state: "visible", timeout });
    return button;
  }

  await page.goto("http://127.0.0.1:3000/app", { waitUntil: "domcontentloaded", timeout: 30000 });
  await snapshot("connect-before");
  await (await waitForButton("Connect Wallet")).click();
  await waitForText("Good to see you.", 45000);
  await page.waitForTimeout(6000);
  await snapshot("dashboard-connected");
  const connectedBody = await page.locator("body").innerText();
  if (/Official deployment pending|Development fixture|not configured/iu.test(connectedBody)) {
    throw new Error("LIVE_CONFIG_NOT_READY_IN_BROWSER");
  }

  await (await waitForButton("+ Add Money")).click();
  await waitForText("Make savings private");
  await snapshot("add-money");
  if (process.env.LEOPOLD_SKIP_FAUCET !== "1") {
    await (await waitForButton("Get Test USDC")).click();
    await page.waitForTimeout(12000);
  }
  await snapshot("test-usdc-confirmed");
  await (await waitForButton("Continue")).click();
  await page.locator("#private-amount").fill("1");
  await (await waitForButton("Review")).click();
  await snapshot("make-private-review");
  if (process.env.LEOPOLD_SKIP_PRIVATE !== "1") {
    await (await waitForButton("Make Private")).click();
    await waitForText("Private USDC is ready", 120000);
    await snapshot("make-private-complete");
    await (await waitForButton("Choose a vault")).click();
  } else {
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page.waitForTimeout(1500);
  await snapshot("private-balance-hidden");

  const reveal = page.getByRole("button", { name: "Reveal", exact: true }).first();
  await reveal.click();
  await page.waitForTimeout(60000);
  await snapshot("private-balance-reveal-attempt");

  await page.goto("http://127.0.0.1:3000/app/vaults/weekly", { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForText("Weekly Vault", 30000);
  await page.waitForTimeout(5000);
  await snapshot("weekly-live");

  if (process.env.LEOPOLD_RUN_FINANCIAL === "1") {
    const saveAmount = page.getByLabel("Amount to save", { exact: true });
    await saveAmount.fill("0.5");
    await (await waitForButton("Save Privately")).click();
    await page.getByRole("status").filter({ hasText: "Complete" }).waitFor({ state: "visible", timeout: 180000 });
    await snapshot("weekly-save-complete");

    await (await waitForButton("Enter Prize Round")).click();
    await waitForText("Entered current round", 120000);
    await snapshot("weekly-entered");

    const withdrawAmount = page.getByLabel("Amount to withdraw", { exact: true });
    await withdrawAmount.fill("0.5");
    await (await waitForButton("Withdraw")).click();
    await page.getByRole("status").filter({ hasText: "Complete" }).waitFor({ state: "visible", timeout: 180000 });
    await snapshot("weekly-withdraw-complete");

    await page.goto("http://127.0.0.1:3000/app/profile", { waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForText("Make Public", 30000);
    await page.getByLabel("Private USDC amount to make public", { exact: true }).fill("1.5");
    await (await waitForButton("Make Public")).click();
    await page.getByRole("status").filter({ hasText: "Complete" }).waitFor({ state: "visible", timeout: 180000 });
    await snapshot("make-public-requested");
  }

  const result = {
    schema: "zama-szn4.leopold-live-browser-e2e.v1",
    execution: "OFFICIAL_SEPOLIA_DEPLOYMENT_FINANCIAL_SMOKE",
    chainId: String(CHAIN_ID),
    browser: "Google Chrome for Testing 151.0.7922.34",
    wallet: { address: await wallet.getAddress(), unauthorizedAddress: await unauthorized.getAddress() },
    protectedSignerUsedInProcess: true,
    stages,
    txHashes,
    errors,
    blocker:
      "The official Weekly round is 604800 seconds; draw close, encrypted ticket settlement, refund, and reward cannot be truthfully completed in this run without an explicit frozen progression mechanism.",
    status: "PARTIAL_RELAYER_BLOCKER",
  };
  writeFileSync(join(ROOT, "evidence/deployment/live-browser-run.json"), `${JSON.stringify(result, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      status: result.status,
      wallet: result.wallet.address,
      txHashes,
      stages: stages.map((x) => x.stage),
      errors,
    }),
  );
  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(
    JSON.stringify({ status: "FAILED", name: error?.name, message: String(error?.message ?? error).slice(0, 800) }),
  );
  process.exitCode = 1;
});
