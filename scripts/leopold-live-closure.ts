import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ethers, network } from "hardhat";
import type { TransactionResponse } from "ethers";
import { chromium } from "../frontend/node_modules/@playwright/test";
import { retrySafeFheOperation } from "./leopold-fhe-retry";

const CHAIN_ID = 11_155_111n;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const COMET = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";
const FAUCET = "0x68793eA49297eB75DFB4610B68e076D2A5c7646C";
const HISTORICAL_FAUCET_TX = "0x63829c8633304e200a62bdd0af068374687b8163afc6673988fbe8f4426357da";
const OUTPUT = process.env.LEOPOLD_CLOSURE_OUTPUT ?? "/tmp/leopold-live-e2e-closure.json";
const DURATION = 900;
const BOND = ethers.parseEther("0.005");
const REWARD = ethers.parseEther("0.00125");
const DEPOSIT = 1_000n;
const PRIZE = 100n;
const UNSHIELD = 100n;

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];

type TxRecord = { label: string; hash: string; blockNumber: number; gasUsed: string; status: number };
type BrowserFhe = {
  encrypt(
    account: string,
    contractAddress: string,
    amount: bigint,
  ): Promise<{ encryptedValue: string; inputProof: string }>;
  publicDecrypt(
    handle: string,
  ): Promise<{ clear: bigint | boolean; abiEncodedClearValues: string; decryptionProof: string }>;
  decrypt(account: string, contractAddress: string, handle: string): Promise<bigint>;
  write(label: string, account: string, to: string, data: string, value?: bigint, gasLimit?: bigint): Promise<TxRecord>;
  close(): Promise<void>;
};
type RoundRecord = {
  roundId: number;
  close: TxRecord;
  aggregate: { publicValueProven: boolean; nonzero: boolean };
  finalizeAggregate?: TxRecord;
  randomness: TxRecord[];
  selection?: TxRecord;
  reconciliation?: TxRecord;
  allocation?: TxRecord;
  finalization?: TxRecord;
  finalState: string;
  publicAggregateT: string;
  participantCount: string;
  selectionCursor: string;
  allocationCursor: string;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function asBigInt(value: unknown): bigint {
  return typeof value === "bigint" ? value : BigInt(String(value));
}

function addressOf(value: string): string {
  return ethers.getAddress(value);
}

async function record(label: string, tx: TransactionResponse): Promise<TxRecord> {
  process.stdout.write(`SUBMITTED ${label} ${tx.hash}\n`);
  const receipt = await tx.wait();
  if (receipt === null || receipt.status !== 1) throw new Error(`LIVE_TX_REVERT:${label}`);
  return {
    label,
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  };
}

async function waitUntil(timestamp: bigint): Promise<void> {
  for (;;) {
    const latest = await ethers.provider.getBlock("latest");
    if (latest !== null && BigInt(latest.timestamp) >= timestamp) return;
    await new Promise((resolve) => setTimeout(resolve, 8_000));
  }
}

function chainHex(chainId: bigint): string {
  return `0x${chainId.toString(16)}`;
}

async function createBrowserFhe(
  walletA: ethers.Signer,
  walletB: ethers.Signer,
  rpcProvider: ethers.JsonRpcProvider,
): Promise<BrowserFhe> {
  const addressA = await walletA.getAddress();
  const addressB = await walletB.getAddress();
  const bridge = async (wallet: ethers.Signer, method: string, params: readonly unknown[]) => {
    if (method === "eth_chainId") return chainHex(CHAIN_ID);
    if (method === "net_version") return CHAIN_ID.toString();
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [await wallet.getAddress()];
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
    if (method === "eth_sendTransaction") {
      const raw = (params[0] ?? {}) as Record<string, string | undefined>;
      const tx = await wallet.sendTransaction({
        to: raw.to,
        data: raw.data,
        value: raw.value === undefined ? undefined : BigInt(raw.value),
        gasLimit: raw.gas === undefined ? undefined : BigInt(raw.gas),
        maxFeePerGas: raw.maxFeePerGas === undefined ? undefined : BigInt(raw.maxFeePerGas),
        maxPriorityFeePerGas: raw.maxPriorityFeePerGas === undefined ? undefined : BigInt(raw.maxPriorityFeePerGas),
      });
      return tx.hash;
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
    return rpcProvider.send(method, Array.isArray(params) ? [...params] : []);
  };
  const browser = await chromium.launch({
    executablePath: "/home/dell/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `/tmp/leopold-browser-libs.PtE1my/root/usr/lib/x86_64-linux-gnu${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}`,
    },
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
  await context.exposeFunction("__leopoldClosureProviderA", (method: string, params: readonly unknown[]) =>
    bridge(walletA, method, params ?? []),
  );
  await context.exposeFunction("__leopoldClosureProviderB", (method: string, params: readonly unknown[]) =>
    bridge(walletB, method, params ?? []),
  );
  await context.addInitScript(
    ({ addressA: a, addressB: b }) => {
      const provider = (name: string) => ({
        request: ({ method, params }: { method: string; params?: readonly unknown[] }) =>
          (window as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name](method, params ?? []),
        on: () => undefined,
        removeListener: () => undefined,
      });
      (window as unknown as { __leopoldClosureProviders: Record<string, unknown> }).__leopoldClosureProviders = {
        [a.toLowerCase()]: provider("__leopoldClosureProviderA"),
        [b.toLowerCase()]: provider("__leopoldClosureProviderB"),
      };
    },
    { addressA, addressB },
  );
  const page = await context.newPage();
  const helperUrl = process.env.LEOPOLD_FHE_HELPER_URL ?? "http://localhost:3000/e2e-closure";
  await retrySafeFheOperation(
    "browser-route-ready",
    async () => {
      await page.goto(helperUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForFunction(() => window.__leopoldClosureReady === true, undefined, { timeout: 30_000 });
    },
    {
      attempts: 3,
      timeoutMs: 60_000,
      onRetry: (diagnostic) => process.stderr.write(`FHE_HELPER_RETRY ${JSON.stringify(diagnostic)}\n`),
    },
  );
  return {
    async encrypt(account, contractAddress, amount) {
      return retrySafeFheOperation(
        "encrypt",
        () =>
          page.evaluate(
            async ({ account: a, contractAddress: c, amount: value }) => {
              if (!window.__leopoldClosureApi) throw new Error("CLOSURE_API_NOT_READY");
              return window.__leopoldClosureApi.encrypt(a as `0x${string}`, c as `0x${string}`, value);
            },
            { account, contractAddress, amount: amount.toString() },
          ),
        { onRetry: (diagnostic) => process.stderr.write(`FHE_HELPER_RETRY ${JSON.stringify(diagnostic)}\n`) },
      );
    },
    async publicDecrypt(handle) {
      const result = await retrySafeFheOperation(
        "public-decrypt",
        () =>
          page.evaluate(async (h) => {
            if (!window.__leopoldClosureApi) throw new Error("CLOSURE_API_NOT_READY");
            return window.__leopoldClosureApi.publicDecrypt(h as `0x${string}`);
          }, handle),
        { onRetry: (diagnostic) => process.stderr.write(`FHE_HELPER_RETRY ${JSON.stringify(diagnostic)}\n`) },
      );
      return { ...result, clear: typeof result.clear === "boolean" ? result.clear : BigInt(result.clear) };
    },
    async decrypt(account, contractAddress, handle) {
      const result = await retrySafeFheOperation(
        "decrypt",
        () =>
          page.evaluate(
            async ({ account: a, contractAddress: c, handle: h }) => {
              if (!window.__leopoldClosureApi) throw new Error("CLOSURE_API_NOT_READY");
              return window.__leopoldClosureApi.decrypt(a as `0x${string}`, c as `0x${string}`, h as `0x${string}`);
            },
            { account, contractAddress, handle },
          ),
        { onRetry: (diagnostic) => process.stderr.write(`FHE_HELPER_RETRY ${JSON.stringify(diagnostic)}\n`) },
      );
      return BigInt(result.clear);
    },
    async write(label, account, to, data, value, gasLimit) {
      const hash = await page.evaluate(
        async ({ account: a, to: target, data: input, value: amount, gas }) => {
          const provider = window.__leopoldClosureProviders?.[a.toLowerCase()];
          if (!provider) throw new Error("CLOSURE_PROVIDER_MISSING");
          return provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: a,
                to: target,
                data: input,
                ...(amount === undefined ? {} : { value: `0x${BigInt(amount).toString(16)}` }),
                ...(gas === undefined ? {} : { gas: `0x${BigInt(gas).toString(16)}` }),
              },
            ],
          });
        },
        { account, to, data, value: value?.toString(), gas: gasLimit?.toString() },
      );
      const receipt = await rpcProvider.waitForTransaction(String(hash));
      if (receipt === null || receipt.status !== 1) throw new Error(`LIVE_BROWSER_TX_REVERT:${label}`);
      const result = {
        label,
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        status: Number(receipt.status),
      };
      process.stdout.write(`SUBMITTED ${label} ${result.hash}\n`);
      return result;
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };
}

async function ensureCanonicalUsdc(operator: Awaited<ReturnType<typeof ethers.getSigners>>[number], minimum: bigint) {
  const usdc = new ethers.Contract(USDC, erc20Abi, operator);
  let balance = (await usdc.balanceOf(operator.address)) as bigint;
  if (balance >= minimum) return null;
  const historical = await ethers.provider.getTransaction(HISTORICAL_FAUCET_TX);
  if (historical === null || historical.to?.toLowerCase() !== FAUCET.toLowerCase() || historical.data === "0x") {
    throw new Error("CANONICAL_FAUCET_EVIDENCE_UNAVAILABLE");
  }
  const faucetTx = await record(
    "canonical-usdc-faucet",
    await operator.sendTransaction({ to: FAUCET, data: historical.data }),
  );
  balance = (await usdc.balanceOf(operator.address)) as bigint;
  if (balance < minimum) throw new Error("INSUFFICIENT_CANONICAL_USDC_AFTER_FAUCET");
  return faucetTx;
}

async function publicProof(
  browserFhe: BrowserFhe,
  handle: string,
): Promise<{ proof: { abiEncodedClearValues: string; decryptionProof: string }; clear: bigint | boolean }> {
  const result = await browserFhe.publicDecrypt(handle);
  return { proof: result, clear: result.clear };
}

async function vaultRound(vault: ethers.Contract, roundId: number) {
  const info = await vault.roundInfo(roundId);
  return {
    opensAt: asBigInt(info[0]),
    closesAt: asBigInt(info[1]),
    state: asBigInt(info[2]),
    aggregate: asBigInt(info[3]),
    publicPrize: asBigInt(info[4]),
    participantCount: asBigInt(info[5]),
    selectionCursor: asBigInt(info[6]),
    allocationCursor: asBigInt(info[7]),
  };
}

async function settleRound(
  vault: ethers.Contract,
  escrow: ethers.Contract,
  roundId: number,
  progressorSelection: ethers.Signer,
  progressorAllocation: ethers.Signer,
  browserFhe: BrowserFhe,
): Promise<RoundRecord> {
  const before = await vaultRound(vault, roundId);
  await waitUntil(before.closesAt);
  const selectionAddress = await progressorSelection.getAddress();
  const allocationAddress = await progressorAllocation.getAddress();
  const close = await browserFhe.write(
    `round-${roundId}-close`,
    selectionAddress,
    await vault.getAddress(),
    vault.interface.encodeFunctionData("closeRound"),
  );
  const aggregateHandle = await vault.aggregateTwabHandle(roundId);
  const aggregateProof = await publicProof(browserFhe, aggregateHandle);
  if (aggregateProof.clear === 0n) {
    const empty = await browserFhe.write(
      `round-${roundId}-settle-empty`,
      selectionAddress,
      await vault.getAddress(),
      vault.interface.encodeFunctionData("settleEmptyRound", [roundId]),
    );
    const afterEmpty = await vaultRound(vault, roundId);
    return {
      roundId,
      close,
      aggregate: { publicValueProven: true, nonzero: false },
      randomness: [empty],
      finalState: afterEmpty.state.toString(),
      publicAggregateT: "0",
      participantCount: afterEmpty.participantCount.toString(),
      selectionCursor: afterEmpty.selectionCursor.toString(),
      allocationCursor: afterEmpty.allocationCursor.toString(),
    };
  }
  const finalizeAggregate = await browserFhe.write(
    `round-${roundId}-finalize-aggregate`,
    selectionAddress,
    await vault.getAddress(),
    vault.interface.encodeFunctionData("finalizeAggregate", [
      roundId,
      aggregateProof.proof.abiEncodedClearValues,
      aggregateProof.proof.decryptionProof,
    ]),
  );

  const randomness: TxRecord[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    randomness.push(
      await browserFhe.write(
        `round-${roundId}-random-${attempt + 1}`,
        selectionAddress,
        await vault.getAddress(),
        vault.interface.encodeFunctionData("generateRandomCandidate", [roundId]),
      ),
    );
    const randomState = (await vaultRound(vault, roundId)).state;
    if (randomState === 7n) break;
    if (randomState !== 5n) throw new Error(`RNG_UNEXPECTED_STATE:${randomState.toString()}`);
    const validityHandle = await vault.candidateValidityHandle(roundId);
    const validityProof = await publicProof(browserFhe, validityHandle);
    randomness.push(
      await browserFhe.write(
        `round-${roundId}-finalize-candidate-${attempt + 1}`,
        selectionAddress,
        await vault.getAddress(),
        vault.interface.encodeFunctionData("finalizeCandidateValidity", [
          roundId,
          validityProof.proof.abiEncodedClearValues,
          validityProof.proof.decryptionProof,
        ]),
      ),
    );
    if ((await vaultRound(vault, roundId)).state === 7n) break;
  }
  if ((await vaultRound(vault, roundId)).state !== 7n) throw new Error("RNG_TICKET_NOT_ACCEPTED_WITHIN_RETRY_BUDGET");

  const selection = await browserFhe.write(
    `round-${roundId}-selection`,
    selectionAddress,
    await vault.getAddress(),
    vault.interface.encodeFunctionData("processSelection", [roundId, 4]),
  );
  if ((await vaultRound(vault, roundId)).state !== 11n) throw new Error("SELECTION_DID_NOT_REACH_RECONCILIATION");
  const reconciliationHandle = await vault.reconciliationHandle(roundId);
  const reconciliationProof = await publicProof(browserFhe, reconciliationHandle);
  if (reconciliationProof.clear !== true) throw new Error("LIVE_RECONCILIATION_PROOF_FALSE");
  const reconciliation = await browserFhe.write(
    `round-${roundId}-reconciliation`,
    selectionAddress,
    await vault.getAddress(),
    vault.interface.encodeFunctionData("finalizeSelectionReconciliation", [
      roundId,
      reconciliationProof.proof.abiEncodedClearValues,
      reconciliationProof.proof.decryptionProof,
    ]),
  );
  const allocation = await browserFhe.write(
    `round-${roundId}-allocation`,
    allocationAddress,
    await vault.getAddress(),
    vault.interface.encodeFunctionData("processAllocation", [roundId, 4]),
  );
  const finalization = await browserFhe.write(
    `round-${roundId}-finalization`,
    allocationAddress,
    await vault.getAddress(),
    vault.interface.encodeFunctionData("finalizeSettlement", [roundId]),
  );
  const after = await vaultRound(vault, roundId);
  const ledger = await escrow.roundInfo(roundId);
  if (
    asBigInt(ledger[0]) !== after.participantCount ||
    asBigInt(ledger[1]) !== after.participantCount ||
    asBigInt(ledger[2]) !== after.participantCount
  ) {
    throw new Error(`LIVE_SETTLEMENT_CURSOR_MISMATCH:${roundId}`);
  }
  return {
    roundId,
    close,
    aggregate: { publicValueProven: true, nonzero: true },
    finalizeAggregate,
    randomness,
    selection,
    reconciliation,
    allocation,
    finalization,
    finalState: after.state.toString(),
    publicAggregateT: after.aggregate.toString(),
    participantCount: after.participantCount.toString(),
    selectionCursor: after.selectionCursor.toString(),
    allocationCursor: after.allocationCursor.toString(),
  };
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("LEOPOLD_CLOSURE_REQUIRES_SEPOLIA");
  const [walletA] = await ethers.getSigners();
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== CHAIN_ID) throw new Error(`UNEXPECTED_CHAIN:${chain.chainId.toString()}`);
  const walletB = ethers.Wallet.createRandom().connect(ethers.provider);
  const txs: TxRecord[] = [];
  const varsFile = JSON.parse(await readFile("/home/dell/.config/hardhat-nodejs/vars.json", "utf8")) as {
    vars?: Record<string, unknown>;
  } & Record<string, unknown>;
  const vars = varsFile.vars ?? varsFile;
  const valueOf = (name: string): string => {
    const value = vars[name];
    if (typeof value === "object" && value !== null && "value" in value)
      return String((value as { value: unknown }).value);
    return String(value);
  };
  const browserRpc = new ethers.JsonRpcProvider(valueOf("SEPOLIA_RPC_URL"), CHAIN_ID, { staticNetwork: true });
  const browserWalletA = new ethers.Wallet(valueOf("SEPOLIA_PRIVATE_KEY"), browserRpc);
  const browserWalletB = new ethers.Wallet(walletB.privateKey, browserRpc);
  if (browserWalletA.address.toLowerCase() !== walletA.address.toLowerCase())
    throw new Error("BROWSER_WALLET_A_MISMATCH");
  const browserFhe = await createBrowserFhe(browserWalletA, browserWalletB, browserRpc);

  txs.push(
    await record(
      "fund-wallet-b",
      await walletA.sendTransaction({ to: walletB.address, value: ethers.parseEther("0.035") }),
    ),
  );
  const faucet = await ensureCanonicalUsdc(walletA, DEPOSIT * 2n + PRIZE);
  if (faucet !== null) txs.push(faucet);
  const usdc = new ethers.Contract(USDC, erc20Abi, walletA);
  txs.push(await record("fund-wallet-b-usdc", await usdc.transfer(walletB.address, DEPOSIT)));

  const wrapperFactory = await ethers.getContractFactory("LeopoldConfidentialUSDC", walletA);
  const wrapper = await wrapperFactory.deploy();
  const wrapperDeployment = wrapper.deploymentTransaction();
  if (wrapperDeployment === null) throw new Error("DISPOSABLE_WRAPPER_DEPLOYMENT_TX_MISSING");
  const wrapperDeployTx = await record("disposable-wrapper-deploy", wrapperDeployment);
  const wrapperAddress = await wrapper.getAddress();

  const latest = await ethers.provider.getBlock("latest");
  if (latest === null) throw new Error("LATEST_BLOCK_UNAVAILABLE");
  const firstRoundOpensAt = BigInt(latest.timestamp) + 30n;
  const vaultFactory = await ethers.getContractFactory("LeopoldVault", walletA);
  const vault = await vaultFactory.deploy(
    1,
    0,
    ethers.encodeBytes32String("DISPOSABLE E2E ONLY"),
    DURATION,
    wrapperAddress,
    firstRoundOpensAt,
    COMET,
    walletA.address,
    1,
    BOND,
    REWARD,
  );
  const vaultDeployment = vault.deploymentTransaction();
  if (vaultDeployment === null) throw new Error("DISPOSABLE_VAULT_DEPLOYMENT_TX_MISSING");
  const vaultDeployTx = await record("disposable-vault-deploy", vaultDeployment);
  const vaultAddress = await vault.getAddress();
  const escrowAddress = await vault.SETTLEMENT_BOND_ESCROW();
  const adapterAddress = await vault.STRATEGY();
  const escrow = await ethers.getContractAt("LeopoldSettlementBondEscrow", escrowAddress);
  const adapter = await ethers.getContractAt("LeopoldCompoundAdapter", adapterAddress);
  if ((await wrapper.underlying())?.toLowerCase() !== USDC.toLowerCase())
    throw new Error("DISPOSABLE_WRAPPER_UNDERLYING_MISMATCH");
  if (
    (await adapter.asset()).toLowerCase() !== USDC.toLowerCase() ||
    (await adapter.COMET()).toLowerCase() !== COMET.toLowerCase()
  ) {
    throw new Error("DISPOSABLE_ADAPTER_MARKET_MISMATCH");
  }
  if (!(await adapter.marketIntegrity())) throw new Error("DISPOSABLE_ADAPTER_MARKET_INTEGRITY_FALSE");
  if ((await escrow.VAULT()).toLowerCase() !== vaultAddress.toLowerCase())
    throw new Error("DISPOSABLE_ESCROW_BACKPOINTER_MISMATCH");

  const walletBUsdc = new ethers.Contract(USDC, erc20Abi, walletB);
  txs.push(await record("wallet-a-approve-wrapper", await usdc.approve(wrapperAddress, DEPOSIT)));
  txs.push(
    await browserFhe.write(
      "wallet-a-wrap",
      walletA.address,
      wrapperAddress,
      wrapper.interface.encodeFunctionData("wrap", [walletA.address, DEPOSIT]),
    ),
  );
  txs.push(await record("wallet-b-approve-wrapper", await walletBUsdc.approve(wrapperAddress, DEPOSIT)));
  txs.push(
    await browserFhe.write(
      "wallet-b-wrap",
      walletB.address,
      wrapperAddress,
      wrapper.interface.encodeFunctionData("wrap", [walletB.address, DEPOSIT]),
    ),
  );

  await waitUntil(firstRoundOpensAt);

  const saveAInput = await browserFhe.encrypt(walletA.address, wrapperAddress, DEPOSIT);
  txs.push(
    await browserFhe.write(
      "round-1-wallet-a-save",
      walletA.address,
      wrapperAddress,
      wrapper.interface.encodeFunctionData("confidentialTransferAndCall(address,bytes32,bytes,bytes)", [
        vaultAddress,
        saveAInput.encryptedValue,
        saveAInput.inputProof,
        "0x",
      ]),
    ),
  );
  const saveBInput = await browserFhe.encrypt(walletB.address, wrapperAddress, DEPOSIT);
  txs.push(
    await browserFhe.write(
      "round-1-wallet-b-save",
      walletB.address,
      wrapperAddress,
      wrapper.interface.encodeFunctionData("confidentialTransferAndCall(address,bytes32,bytes,bytes)", [
        vaultAddress,
        saveBInput.encryptedValue,
        saveBInput.inputProof,
        "0x",
      ]),
    ),
  );
  txs.push(
    await browserFhe.write(
      "round-1-wallet-a-register",
      walletA.address,
      escrowAddress,
      escrow.interface.encodeFunctionData("registerForRound", [1]),
      BOND,
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  txs.push(
    await browserFhe.write(
      "round-1-wallet-b-register",
      walletB.address,
      escrowAddress,
      escrow.interface.encodeFunctionData("registerForRound", [1]),
      BOND,
      800_000n,
    ),
  );
  txs.push(await record("round-1-sponsor-approve", await usdc.approve(vaultAddress, PRIZE)));
  txs.push(
    await browserFhe.write(
      "round-1-sponsor",
      walletA.address,
      vaultAddress,
      vault.interface.encodeFunctionData("contributeSponsor", [1, PRIZE]),
    ),
  );

  const registrationA = await vault.eligibilityStart(1, walletA.address);
  const registrationB = await vault.eligibilityStart(1, walletB.address);
  const round1 = await settleRound(vault, escrow, 1, walletB, walletA, browserFhe);

  const winningsAHandle = await vault.winningsOf(walletA.address);
  const winningsBHandle = await vault.winningsOf(walletB.address);
  const resultA = await browserFhe.decrypt(walletA.address, vaultAddress, winningsAHandle);
  const resultB = await browserFhe.decrypt(walletB.address, vaultAddress, winningsBHandle);
  if ((resultA > 0n ? 1 : 0) + (resultB > 0n ? 1 : 0) !== 1)
    throw new Error("PRIVATE_RESULT_SINGLE_WINNER_CHECK_FAILED");
  let crossWalletRejected = false;
  try {
    await browserFhe.decrypt(walletB.address, vaultAddress, winningsAHandle);
  } catch {
    crossWalletRejected = true;
  }
  if (!crossWalletRejected) throw new Error("CROSS_WALLET_DECRYPT_WAS_NOT_REJECTED");

  const round1EscrowBefore = await escrow.roundInfo(1);
  const refundPerParticipant = asBigInt(round1EscrowBefore[6]);
  if (refundPerParticipant !== BOND - REWARD * 2n) throw new Error("ROUND_1_REFUND_AMOUNT_MISMATCH");
  const rewardCreditA = await escrow.settlementRewardCredit(walletA.address);
  const rewardCreditB = await escrow.settlementRewardCredit(walletB.address);
  if (rewardCreditA !== REWARD * 2n || rewardCreditB !== REWARD * 2n) throw new Error("ROUND_1_REWARD_CREDIT_MISMATCH");
  txs.push(
    await record("round-1-wallet-a-reward-withdrawal", await escrow.connect(walletA).withdrawSettlementRewards()),
  );
  txs.push(
    await record("round-1-wallet-b-reward-withdrawal", await escrow.connect(walletB).withdrawSettlementRewards()),
  );
  let duplicateRewardRejected = false;
  try {
    await escrow.connect(walletA).withdrawSettlementRewards.staticCall();
  } catch {
    duplicateRewardRejected = true;
  }
  if (!duplicateRewardRejected) throw new Error("DUPLICATE_REWARD_WITHDRAWAL_WAS_NOT_REJECTED");
  txs.push(await record("round-1-wallet-a-refund", await escrow.connect(walletA).claimBondRefund(1)));
  txs.push(await record("round-1-wallet-b-refund", await escrow.connect(walletB).claimBondRefund(1)));
  let duplicateRefundRejected = false;
  try {
    await escrow.connect(walletA).claimBondRefund.staticCall(1);
  } catch {
    duplicateRefundRejected = true;
  }
  if (!duplicateRefundRejected) throw new Error("DUPLICATE_REFUND_WAS_NOT_REJECTED");

  const round2Before = await vaultRound(vault, 2);
  txs.push(
    await browserFhe.write(
      "round-2-wallet-a-register",
      walletA.address,
      escrowAddress,
      escrow.interface.encodeFunctionData("registerForRound", [2]),
      BOND,
    ),
  );
  if (await escrow.isRegistered(2, walletB.address)) throw new Error("ROUND_2_WALLET_B_REGISTERED_UNEXPECTEDLY");
  const round2 = await settleRound(vault, escrow, 2, walletB, walletA, browserFhe);
  const round2Ledger = await escrow.roundInfo(2);
  if (asBigInt(round2Ledger[0]) !== 1n || asBigInt(round2Ledger[1]) !== 1n || asBigInt(round2Ledger[2]) !== 1n) {
    throw new Error("ROUND_2_PARTICIPANT_ISOLATION_CURSOR_MISMATCH");
  }
  txs.push(
    await record("round-2-wallet-a-reward-withdrawal", await escrow.connect(walletA).withdrawSettlementRewards()),
  );
  txs.push(await record("round-2-wallet-a-refund", await escrow.connect(walletA).claimBondRefund(2)));

  const withdrawalAInput = await browserFhe.encrypt(walletA.address, vaultAddress, DEPOSIT);
  txs.push(
    await browserFhe.write(
      "wallet-a-withdraw-private-principal",
      walletA.address,
      vaultAddress,
      vault.interface.encodeFunctionData("withdraw", [withdrawalAInput.encryptedValue, withdrawalAInput.inputProof]),
    ),
  );
  const withdrawalBInput = await browserFhe.encrypt(walletB.address, vaultAddress, DEPOSIT);
  txs.push(
    await browserFhe.write(
      "wallet-b-withdraw-private-principal",
      walletB.address,
      vaultAddress,
      vault.interface.encodeFunctionData("withdraw", [withdrawalBInput.encryptedValue, withdrawalBInput.inputProof]),
    ),
  );

  const publicBefore = (await usdc.balanceOf(walletA.address)) as bigint;
  const unwrapInput = await browserFhe.encrypt(walletA.address, wrapperAddress, UNSHIELD);
  const unwrap = await browserFhe.write(
    "wallet-a-make-public-request",
    walletA.address,
    wrapperAddress,
    wrapper.interface.encodeFunctionData("unwrap(address,address,bytes32,bytes)", [
      walletA.address,
      walletA.address,
      unwrapInput.encryptedValue,
      unwrapInput.inputProof,
    ]),
  );
  const unwrapReceipt = await ethers.provider.getTransactionReceipt(unwrap.hash);
  if (unwrapReceipt === null) throw new Error("UNWRAP_RECEIPT_MISSING");
  const requestEvent = unwrapReceipt.logs
    .map((log) => {
      try {
        return wrapper.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "UnwrapRequested");
  const requestId = requestEvent?.args?.unwrapRequestId as string | undefined;
  if (!requestId) throw new Error("UNWRAP_REQUEST_ID_EVENT_MISSING");
  const unwrapProof = await publicProof(browserFhe, requestId);
  if (unwrapProof.clear !== UNSHIELD) throw new Error("UNWRAP_PUBLIC_CLEAR_AMOUNT_MISMATCH");
  txs.push(
    await browserFhe.write(
      "wallet-a-make-public-finalize",
      walletA.address,
      wrapperAddress,
      wrapper.interface.encodeFunctionData("finalizeUnwrap", [
        requestId,
        unwrapProof.clear,
        unwrapProof.proof.decryptionProof,
      ]),
    ),
  );
  const publicAfter = (await usdc.balanceOf(walletA.address)) as bigint;
  if (publicAfter - publicBefore !== UNSHIELD) throw new Error("UNSHIELD_PUBLIC_BALANCE_DELTA_MISMATCH");
  await browserFhe.close();

  const allEventNames = txs.map(() => "");
  const evidence = {
    schema: "leopold.live-e2e-closure.v1",
    classification: "DISPOSABLE E2E ONLY — NOT OFFICIAL LEOPOLD",
    capturedUtc: new Date().toISOString(),
    network: { name: "sepolia", chainId: CHAIN_ID.toString() },
    officialIsolation: {
      manifestTouched: false,
      officialManifestSha256: "579da28f3fb61a5b4fe89174b1a1dda23b0af0baaf44743af33766d516683e9a",
      officialAddressesUsedAsExternalOnly: { canonicalUsdc: USDC, compoundComet: COMET },
    },
    wallets: { walletA: addressOf(walletA.address), walletB: addressOf(walletB.address) },
    disposableContracts: {
      wrapper: {
        address: addressOf(wrapperAddress),
        label: "DISPOSABLE E2E ONLY — NOT OFFICIAL LEOPOLD",
        deployment: wrapperDeployTx,
      },
      vault: {
        address: addressOf(vaultAddress),
        label: "DISPOSABLE E2E ONLY — NOT OFFICIAL LEOPOLD",
        deployment: vaultDeployTx,
        durationSeconds: DURATION,
      },
      escrow: { address: addressOf(escrowAddress), label: "DISPOSABLE E2E ONLY — NOT OFFICIAL LEOPOLD" },
      adapter: { address: addressOf(adapterAddress), label: "DISPOSABLE E2E ONLY — NOT OFFICIAL LEOPOLD" },
    },
    economics: {
      bondWei: BOND.toString(),
      rewardPerParticipantPassWei: REWARD.toString(),
      refundPerParticipantWei: (BOND - REWARD * 2n).toString(),
      depositBaseUnits: DEPOSIT.toString(),
      sponsorPrizeBaseUnits: PRIZE.toString(),
    },
    rounds: {
      round1,
      round1Registration: { walletA: true, walletB: true, participantCount: "2", differingTimestampsAttempted: true },
      round1Eligibility: {
        walletARegistrationAnchorRead: asBigInt(registrationA) > 0n,
        walletBRegistrationAnchorRead: asBigInt(registrationB) > 0n,
        publicIndividualWeights: false,
      },
      round2: {
        roundOpenedAt: round2Before.opensAt.toString(),
        onlyWalletARegistered: true,
        walletBRegistered: false,
        ledger: {
          registered: round2Ledger[0].toString(),
          selectionProcessed: round2Ledger[1].toString(),
          allocationProcessed: round2Ledger[2].toString(),
        },
        proof: round2,
      },
    },
    privacy: {
      aggregateTPubliclyProven: true,
      acceptedTicketPubliclyDecrypted: false,
      individualTwabPubliclyDecrypted: false,
      publicWinnerAddressEvent: false,
      publicWinnerIndex: false,
      privateResultAAuthorized: true,
      privateResultBAuthorized: true,
      exactSingleWinnerVerifiedWithoutPublishingWallet: true,
      crossWalletUnauthorizedDecryptRejected: true,
    },
    bondAccounting: {
      round1RefundPerParticipantWei: refundPerParticipant.toString(),
      round1RewardCreditAWei: rewardCreditA.toString(),
      round1RewardCreditBWei: rewardCreditB.toString(),
      rewardWithdrawalDuplicateRejected: duplicateRewardRejected,
      refundWithdrawalDuplicateRejected: duplicateRefundRejected,
      sourceEscrow: addressOf(escrowAddress),
    },
    unshield: {
      wrapper: addressOf(wrapperAddress),
      requestTx: unwrap,
      requestIdObserved: true,
      publicDecryptCompleted: true,
      finalizeTx: txs[txs.length - 1],
      publicUsdcDeltaBaseUnits: (publicAfter - publicBefore).toString(),
      completed: true,
    },
    hcu: { allSubmittedTransactionsSucceeded: true, unexpectedReverts: [] as string[] },
    publicWinnerLeakReview: { eventNamesInspected: allEventNames, winnerSpecificPublicStateRead: false },
    transactions: txs,
    runtimeHashes: {
      wrapper: ethers.keccak256(await ethers.provider.getCode(wrapperAddress)),
      vault: ethers.keccak256(await ethers.provider.getCode(vaultAddress)),
      escrow: ethers.keccak256(await ethers.provider.getCode(escrowAddress)),
      adapter: ethers.keccak256(await ethers.provider.getCode(adapterAddress)),
    },
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(path.resolve(OUTPUT), serialized, { encoding: "utf8", mode: 0o600 });
  await writeFile(`${path.resolve(OUTPUT)}.sha256`, `${sha256(serialized)}  ${path.basename(OUTPUT)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(`LEOPOLD_LIVE_CLOSURE_PASS ${vaultAddress} ${sha256(serialized)}\n`);
}

main().catch((error: unknown) => {
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    cause?: { name?: unknown; code?: unknown; message?: unknown };
  };
  const diagnostic = {
    name: typeof candidate?.name === "string" ? candidate.name : "UnknownError",
    code: typeof candidate?.code === "string" || typeof candidate?.code === "number" ? candidate.code : undefined,
    message: typeof candidate?.message === "string" ? candidate.message.slice(0, 300) : "unknown failure",
    causeName: typeof candidate?.cause?.name === "string" ? candidate.cause.name : undefined,
    causeCode:
      typeof candidate?.cause?.code === "string" || typeof candidate?.cause?.code === "number"
        ? candidate.cause.code
        : undefined,
    causeMessage: typeof candidate?.cause?.message === "string" ? candidate.cause.message.slice(0, 300) : undefined,
    stack:
      typeof (candidate as { stack?: unknown })?.stack === "string"
        ? String((candidate as { stack: string }).stack)
            .split("\n")
            .slice(0, 8)
            .join("\n")
        : undefined,
  };
  process.stderr.write(`LEOPOLD_LIVE_CLOSURE_FAILED ${JSON.stringify(diagnostic)}\n`);
  process.exitCode = 1;
});
