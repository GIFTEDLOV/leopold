import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";

import {
  addV2Money,
  disableV2PrizeSavings,
  enableV2PrizeSavings,
  getV2TestUsdc,
  revealLatestV2Result,
  revealV2Savings,
  topUpV2EntryBalance,
  withdrawV2EntryBalance,
  type V2ActionClients,
} from "../lib/leopold/v2-actions";
import { decryptPrivateValue, encryptPrivateAmount } from "../lib/leopold/zama";
import { getTestUsdc } from "../lib/leopold/actions";
import { V2_PREVIEW_ADDRESSES } from "../lib/leopold/v2-preview-config";

vi.mock("../lib/leopold/zama", () => ({
  decryptPrivateValue: vi.fn(),
  decryptPublicValue: vi.fn(),
  encryptPrivateAmount: vi.fn(),
}));

vi.mock("../lib/leopold/actions", () => ({
  getTestUsdc: vi.fn(),
}));

const ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
const OTHER_ACCOUNT = "0x2222222222222222222222222222222222222222" as Address;
const HANDLE = `0x${"1".repeat(64)}` as `0x${string}`;
const HASHES = [
  `0x${"a".repeat(64)}`,
  `0x${"b".repeat(64)}`,
  `0x${"c".repeat(64)}`,
  `0x${"d".repeat(64)}`,
] as const;

type MockState = {
  allowance: bigint;
  balance: bigint;
  credit: bigint;
  preference: [boolean, boolean, bigint];
  currentEnabled: boolean;
  activeRound: bigint;
  principalHandle: `0x${string}`;
  winningsHandle: `0x${string}`;
  resultRoundState: bigint;
  resultRegistered: boolean;
};

function makeClients(overrides: Partial<MockState> = {}) {
  const state: MockState = {
    allowance: 0n,
    balance: 5_000_000n,
    credit: 0n,
    preference: [false, false, 2n],
    currentEnabled: false,
    activeRound: 2n,
    principalHandle: HANDLE,
    winningsHandle: HANDLE,
    resultRoundState: 10n,
    resultRegistered: true,
    ...overrides,
  };
  let nextHash = 0;
  const readContract = vi.fn(async ({ functionName, address }: { functionName: string; address: Address }) => {
    if (address.toLowerCase() === V2_PREVIEW_ADDRESSES.vault.toLowerCase()) {
      if (functionName === "ASSET") return V2_PREVIEW_ADDRESSES.wrapper;
      if (functionName === "UNDERLYING") return V2_PREVIEW_ADDRESSES.usdc;
      if (functionName === "activeRoundId") return state.activeRound;
      if (functionName === "principalOf") return state.principalHandle;
      if (functionName === "winningsOf") return state.winningsHandle;
      if (functionName === "roundInfo") return [0n, 0n, state.resultRoundState, 0n, 0n, 0n, 0n, 0n] as const;
    }
    if (address.toLowerCase() === V2_PREVIEW_ADDRESSES.wrapper.toLowerCase()) {
      if (functionName === "underlying") return V2_PREVIEW_ADDRESSES.usdc;
    }
    if (address.toLowerCase() === V2_PREVIEW_ADDRESSES.adapter.toLowerCase()) {
      if (functionName === "vault") return V2_PREVIEW_ADDRESSES.vault;
      if (functionName === "asset") return V2_PREVIEW_ADDRESSES.usdc;
      if (functionName === "COMET") return V2_PREVIEW_ADDRESSES.comet;
    }
    if (address.toLowerCase() === V2_PREVIEW_ADDRESSES.usdc.toLowerCase()) {
      if (functionName === "balanceOf") return state.balance;
      if (functionName === "allowance") return state.allowance;
    }
    if (address.toLowerCase() === V2_PREVIEW_ADDRESSES.escrow.toLowerCase()) {
      if (functionName === "BOND_AMOUNT") return 5n;
      if (functionName === "automationBondCredit") return state.credit;
      if (functionName === "autoEntryPreference") return state.preference;
      if (functionName === "isAutoEntryEnabled") return state.currentEnabled;
      if (functionName === "isRegistered") return state.resultRegistered;
      if (functionName === "refundClaimed") return false;
      if (functionName === "settlementRewardCredit") return 0n;
    }
    throw new Error(`unexpected read ${functionName}`);
  });
  const writeContract = vi.fn(async (request: { functionName: string; args?: readonly unknown[]; value?: bigint }) => {
    const hash = HASHES[nextHash] ?? (`0x${String(nextHash).padStart(64, "0")}` as `0x${string}`);
    nextHash += 1;
    if (request.functionName === "approve") state.allowance = request.args?.[1] as bigint;
    if (request.functionName === "depositAutomationBondCredit") state.credit += request.value ?? 0n;
    if (request.functionName === "setAutoEntry") {
      state.preference = [state.currentEnabled, Boolean(request.args?.[0]), state.activeRound + 1n];
      state.currentEnabled = Boolean(request.args?.[0]);
    }
    if (request.functionName === "withdrawAutomationBondCredit") state.credit -= request.args?.[0] as bigint;
    return hash;
  });
  const clients = {
    publicClient: {
      getChainId: vi.fn(async () => 11_155_111),
      readContract,
      simulateContract: vi.fn(async () => ({ request: { gas: 250_000n } })),
      waitForTransactionReceipt: vi.fn(async () => ({ status: "success" as const, logs: [] })),
      getTransactionReceipt: vi.fn(async () => ({ status: "success" as const, logs: [] })),
    },
    walletClient: {
      account: { address: ACCOUNT },
      getChainId: vi.fn(async () => 11_155_111),
      writeContract,
    },
    ethereum: { request: vi.fn() },
    account: ACCOUNT,
  } as unknown as V2ActionClients;
  return { clients, state, readContract, writeContract };
}

describe("V2 wallet actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(encryptPrivateAmount).mockResolvedValue({
      encryptedValue: `0x${"3".repeat(64)}`,
      inputProof: "0x1234",
    });
    vi.mocked(decryptPrivateValue).mockResolvedValue(2_000_000n);
    vi.mocked(getTestUsdc).mockResolvedValue(HASHES[0]);
  });

  it("adds money through approval, wrap, and the V2 callback when allowance is missing", async () => {
    const probe = makeClients();
    const hashes = await addV2Money(probe.clients, 1_000_000n);
    expect(hashes).toHaveLength(3);
    expect(probe.writeContract.mock.calls.map(([request]) => request.functionName)).toEqual([
      "approve",
      "wrap",
      "confidentialTransferAndCall",
    ]);
    expect(encryptPrivateAmount).toHaveBeenCalledWith(
      probe.clients.ethereum,
      ACCOUNT,
      V2_PREVIEW_ADDRESSES.wrapper,
      1_000_000n,
      probe.clients.walletClient,
    );
  });

  it("skips approval when the wrapper already has enough allowance", async () => {
    const probe = makeClients({ allowance: 2_000_000n });
    await addV2Money(probe.clients, 1_000_000n);
    expect(probe.writeContract.mock.calls.map(([request]) => request.functionName)).toEqual([
      "wrap",
      "confidentialTransferAndCall",
    ]);
  });

  it("does not blind-rebroadcast after a submission failure", async () => {
    const probe = makeClients();
    probe.writeContract.mockRejectedValueOnce(new Error("wallet response unavailable"));
    await expect(addV2Money(probe.clients, 1_000_000n)).rejects.toThrow("add-money-approval:signature");
    expect(probe.writeContract).toHaveBeenCalledOnce();
  });

  it("rejects a changed signer before writing", async () => {
    const probe = makeClients();
    (probe.clients as { walletClient: { account: { address: Address } } }).walletClient.account.address = OTHER_ACCOUNT;
    await expect(topUpV2EntryBalance(probe.clients, 1n)).rejects.toThrow("WALLET_SIGNER_MISMATCH");
    expect(probe.writeContract).not.toHaveBeenCalled();
  });

  it("enables Prize Savings with exactly the missing entry balance", async () => {
    const probe = makeClients({ credit: 5n });
    const result = await enableV2PrizeSavings(probe.clients, 2n);
    expect(result.alreadyEnabled).toBe(false);
    expect(probe.writeContract.mock.calls.map(([request]) => request.functionName)).toEqual([
      "depositAutomationBondCredit",
      "setAutoEntry",
    ]);
    expect(probe.writeContract.mock.calls[0]?.[0].value).toBe(5n);
  });

  it("does not resubmit an already enabled preference", async () => {
    const probe = makeClients({ preference: [false, true, 2n] });
    await expect(enableV2PrizeSavings(probe.clients)).resolves.toEqual({ hashes: [], alreadyEnabled: true });
    expect(probe.writeContract).not.toHaveBeenCalled();
  });

  it("keeps reserved entry funds protected when withdrawing unused balance", async () => {
    const probe = makeClients({ credit: 4n });
    await expect(withdrawV2EntryBalance(probe.clients, 5n)).rejects.toThrow("INSUFFICIENT_ENTRY_BALANCE");
    expect(probe.writeContract).not.toHaveBeenCalled();
    await expect(withdrawV2EntryBalance(probe.clients, 2n)).resolves.toBe(HASHES[0]);
  });

  it("treats turning off an already disabled preference as idempotent", async () => {
    const probe = makeClients();
    await expect(disableV2PrizeSavings(probe.clients)).resolves.toEqual({ hash: null, alreadyDisabled: true });
    expect(probe.writeContract).not.toHaveBeenCalled();
  });

  it("reveals savings only with the matching wallet and revalidates the handle", async () => {
    const probe = makeClients();
    await expect(revealV2Savings(probe.clients)).resolves.toBe(2_000_000n);
    expect(decryptPrivateValue).toHaveBeenCalledWith(
      probe.clients.ethereum,
      ACCOUNT,
      V2_PREVIEW_ADDRESSES.vault,
      HANDLE,
      probe.clients.walletClient,
    );
  });

  it("rejects a result reveal before settlement", async () => {
    const probe = makeClients({ resultRoundState: 8n });
    await expect(revealLatestV2Result(probe.clients)).rejects.toThrow("RESULT_NOT_READY");
    expect(decryptPrivateValue).not.toHaveBeenCalled();
  });

  it("reveals the latest settled result for the registered wallet", async () => {
    const probe = makeClients();
    await expect(revealLatestV2Result(probe.clients)).resolves.toBe(2_000_000n);
    expect(decryptPrivateValue).toHaveBeenCalledWith(
      probe.clients.ethereum,
      ACCOUNT,
      V2_PREVIEW_ADDRESSES.vault,
      HANDLE,
      probe.clients.walletClient,
    );
  });

  it("uses the approved faucet only when the canonical USDC balance is zero", async () => {
    const funded = makeClients({ balance: 1n });
    await expect(getV2TestUsdc(funded.clients)).resolves.toBeNull();
    expect(getTestUsdc).not.toHaveBeenCalled();
    const empty = makeClients({ balance: 0n });
    await expect(getV2TestUsdc(empty.clients)).resolves.toBe(HASHES[0]);
    expect(getTestUsdc).toHaveBeenCalledOnce();
  });
});
