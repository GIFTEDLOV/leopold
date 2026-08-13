import { readFile, writeFile } from "node:fs/promises";
import { ethers } from "hardhat";
import { chromium } from "../frontend/node_modules/@playwright/test";

const CHAIN_ID = 11_155_111n;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const WRAPPER = "0x9c89c8e56b5b10b06D5C685635C22D5b768d5603";
const AMOUNT = 100n;
const LIBS = "/tmp/leopold-browser-libs.PtE1my/root/usr/lib/x86_64-linux-gnu";

const wrapperAbi = [
  "event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)",
  "function unwrap(address from,address to,bytes32 encryptedAmount,bytes inputProof)",
  "function finalizeUnwrap(bytes32 unwrapRequestId,uint64 unwrapAmountCleartext,bytes decryptionProof)",
];
const usdcAbi = ["function balanceOf(address) view returns (uint256)"];

function chainHex(chainId: bigint): string {
  return `0x${chainId.toString(16)}`;
}

async function main(): Promise<void> {
  const raw = JSON.parse(await readFile("/home/dell/.config/hardhat-nodejs/vars.json", "utf8")) as Record<
    string,
    unknown
  >;
  const vars = (raw.vars ?? raw) as Record<string, unknown>;
  const valueOf = (name: string): string => {
    const value = vars[name];
    if (typeof value === "object" && value !== null && "value" in value)
      return String((value as { value: unknown }).value);
    return String(value);
  };
  const rpc = new ethers.JsonRpcProvider(valueOf("SEPOLIA_RPC_URL"), CHAIN_ID, { staticNetwork: true });
  const wallet = new ethers.Wallet(valueOf("SEPOLIA_PRIVATE_KEY"), rpc);
  const wrapper = new ethers.Interface(wrapperAbi);
  const usdc = new ethers.Contract(USDC, usdcAbi, rpc);
  const before = (await usdc.balanceOf(wallet.address)) as bigint;
  const bridge = async (method: string, params: readonly unknown[]) => {
    if (method === "eth_chainId") return chainHex(CHAIN_ID);
    if (method === "net_version") return CHAIN_ID.toString();
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [wallet.address];
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
    if (method === "eth_sendTransaction") {
      const tx = (params[0] ?? {}) as Record<string, string | undefined>;
      const sent = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value === undefined ? undefined : BigInt(tx.value),
        gasLimit: tx.gas === undefined ? undefined : BigInt(tx.gas),
        maxFeePerGas: tx.maxFeePerGas === undefined ? undefined : BigInt(tx.maxFeePerGas),
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas === undefined ? undefined : BigInt(tx.maxPriorityFeePerGas),
      });
      return sent.hash;
    }
    if (method === "eth_signTypedData_v4") {
      const payload = JSON.parse(String(params[1])) as {
        domain: Record<string, unknown>;
        types: Record<string, unknown>;
        message: Record<string, unknown>;
      };
      const types = { ...payload.types };
      delete types.EIP712Domain;
      return wallet.signTypedData(payload.domain, types, payload.message);
    }
    if (method === "personal_sign") return wallet.signMessage(String(params[0]));
    return rpc.send(method, Array.isArray(params) ? [...params] : []);
  };
  const browser = await chromium.launch({
    executablePath: "/home/dell/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${LIBS}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}`,
    },
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.exposeFunction("__leopoldClosureProviderA", (method: string, params: readonly unknown[]) =>
    bridge(method, params ?? []),
  );
  await context.addInitScript((address: string) => {
    const provider = {
      request: ({ method, params }: { method: string; params?: readonly unknown[] }) =>
        (
          window as unknown as Record<string, (method: string, params: readonly unknown[]) => Promise<unknown>>
        ).__leopoldClosureProviderA(method, params ?? []),
      on: () => undefined,
      removeListener: () => undefined,
    };
    (window as unknown as { __leopoldClosureProviders: Record<string, unknown> }).__leopoldClosureProviders = {
      [address.toLowerCase()]: provider,
    };
  }, wallet.address);
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/e2e-closure", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.__leopoldClosureReady === true, undefined, { timeout: 30_000 });
  const encrypted = await page.evaluate(
    async ({ account, amount }) => {
      if (!window.__leopoldClosureApi) throw new Error("CLOSURE_API_NOT_READY");
      return window.__leopoldClosureApi.encrypt(
        account as `0x${string}`,
        "0x9c89c8e56b5b10b06D5C685635C22D5b768d5603",
        amount,
      );
    },
    { account: wallet.address, amount: AMOUNT.toString() },
  );
  const requestData = wrapper.encodeFunctionData("unwrap(address,address,bytes32,bytes)", [
    wallet.address,
    wallet.address,
    encrypted.encryptedValue,
    encrypted.inputProof,
  ]);
  const requestHash = await page.evaluate(
    async ({ account, data }) => {
      const provider = window.__leopoldClosureProviders?.[account.toLowerCase()];
      if (!provider) throw new Error("CLOSURE_PROVIDER_MISSING");
      return provider.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: "0x9c89c8e56b5b10b06D5C685635C22D5b768d5603", data }],
      });
    },
    { account: wallet.address, data: requestData },
  );
  const requestReceipt = await rpc.waitForTransaction(String(requestHash));
  if (requestReceipt === null || requestReceipt.status !== 1) throw new Error("UNSHIELD_REQUEST_REVERTED");
  const event = requestReceipt.logs
    .map((log) => {
      try {
        return wrapper.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((item) => item?.name === "UnwrapRequested");
  const requestId = event?.args?.unwrapRequestId as string | undefined;
  if (!requestId) throw new Error("UNWRAP_REQUEST_ID_MISSING");
  const publicResult = await page.evaluate(async (handle) => {
    if (!window.__leopoldClosureApi) throw new Error("CLOSURE_API_NOT_READY");
    return window.__leopoldClosureApi.publicDecrypt(handle as `0x${string}`);
  }, requestId);
  if (BigInt(String(publicResult.clear)) !== AMOUNT) throw new Error("UNSHIELD_CLEAR_AMOUNT_MISMATCH");
  const finalizeData = wrapper.encodeFunctionData("finalizeUnwrap", [requestId, AMOUNT, publicResult.decryptionProof]);
  const finalizeHash = await page.evaluate(
    async ({ account, data }) => {
      const provider = window.__leopoldClosureProviders?.[account.toLowerCase()];
      if (!provider) throw new Error("CLOSURE_PROVIDER_MISSING");
      return provider.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: "0x9c89c8e56b5b10b06D5C685635C22D5b768d5603", data }],
      });
    },
    { account: wallet.address, data: finalizeData },
  );
  const finalizeReceipt = await rpc.waitForTransaction(String(finalizeHash));
  if (finalizeReceipt === null || finalizeReceipt.status !== 1) throw new Error("UNSHIELD_FINALIZE_REVERTED");
  const after = (await usdc.balanceOf(wallet.address)) as bigint;
  await context.close();
  await browser.close();
  const evidence = {
    classification: "DISPOSABLE E2E ONLY — NOT OFFICIAL LEOPOLD",
    chainId: CHAIN_ID.toString(),
    walletA: wallet.address,
    wrapper: WRAPPER,
    amountBaseUnits: AMOUNT.toString(),
    requestTx: { hash: requestReceipt.hash, blockNumber: requestReceipt.blockNumber },
    requestIdObserved: true,
    publicDecryptCompleted: true,
    finalizeTx: { hash: finalizeReceipt.hash, blockNumber: finalizeReceipt.blockNumber },
    publicUsdcDeltaBaseUnits: (after - before).toString(),
    completed: after - before === AMOUNT,
  };
  await writeFile("/tmp/leopold-live-unshield.json", `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`LEOPOLD_UNSHIELD_PASS ${requestReceipt.hash} ${finalizeReceipt.hash}\n`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
          .split("transaction=")[0]
          .replace(/0x[0-9a-fA-F]{40,}/g, "[redacted]")
          .slice(0, 500)
      : "unknown failure";
  process.stderr.write(`LEOPOLD_UNSHIELD_FAILED ${message}\n`);
  process.exitCode = 1;
});
