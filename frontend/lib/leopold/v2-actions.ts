"use client";

import { parseEventLogs, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { submitFinancialWriteOnce } from "@/lib/ops/reliability";
import { getTestUsdc, type ActionClients } from "./actions";
import { erc20Abi } from "./abis";
import { V2_PREVIEW_ADDRESSES, V2_PREVIEW_CHAIN_ID } from "./v2-preview-config";
import { v2EscrowActionAbi, v2VaultActionAbi, v2WrapperActionAbi } from "./v2-actions-abis";
import { v2AdapterPreviewAbi, v2VaultPreviewAbi } from "./v2-preview-abis";
import { decryptPrivateValue, decryptPublicValue, encryptPrivateAmount } from "./zama";

type BrowserEthereum = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

export type V2ActionClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  ethereum: BrowserEthereum;
  account: Address;
  onHash?: (hash: `0x${string}`) => void;
  onStage?: (stage: V2ActionStage) => void;
};

export type V2ActionStage =
  | "precondition-read"
  | "approval"
  | "preparing-funds"
  | "adding-to-savings"
  | "entry-balance"
  | "prize-savings"
  | "withdrawal"
  | "unwrapping"
  | "reveal"
  | "claim"
  | "reconcile";

const ZERO_HANDLE = `0x${"0".repeat(64)}` as Hex;

function isZeroHandle(handle: unknown): boolean {
  return typeof handle === "string" && /^0x0{64}$/iu.test(handle);
}

function accountOf(walletClient: WalletClient): string | null {
  const account = walletClient.account;
  if (!account) return null;
  return typeof account === "string" ? account : account.address;
}

function equalAddress(left: unknown, right: Address): boolean {
  return typeof left === "string" && left.toLowerCase() === right.toLowerCase();
}

function actionError(stage: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`V2_ACTION:${stage}: ${message}`, { cause: error });
}

async function assertV2Wallet(clients: V2ActionClients, stage: string): Promise<void> {
  const signer = accountOf(clients.walletClient);
  if (!signer || signer.toLowerCase() !== clients.account.toLowerCase()) {
    throw new Error(`WALLET_SIGNER_MISMATCH:${stage}`);
  }
  const [walletChainId, publicChainId] = await Promise.all([
    clients.walletClient.getChainId(),
    clients.publicClient.getChainId(),
  ]);
  if (walletChainId !== V2_PREVIEW_CHAIN_ID || publicChainId !== V2_PREVIEW_CHAIN_ID) {
    throw new Error(`WRONG_NETWORK:${stage}`);
  }
}

async function readV2Topology(clients: V2ActionClients): Promise<void> {
  const [asset, underlying, wrapperUnderlying, adapterVault, adapterAsset, adapterComet] = await Promise.all([
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultPreviewAbi,
      functionName: "ASSET",
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultPreviewAbi,
      functionName: "UNDERLYING",
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.wrapper,
      abi: v2WrapperActionAbi,
      functionName: "underlying",
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.adapter,
      abi: v2AdapterPreviewAbi,
      functionName: "vault",
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.adapter,
      abi: v2AdapterPreviewAbi,
      functionName: "asset",
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.adapter,
      abi: v2AdapterPreviewAbi,
      functionName: "COMET",
    }),
  ]);
  if (!equalAddress(asset, V2_PREVIEW_ADDRESSES.wrapper)) throw new Error("V2_TOPOLOGY:ASSET");
  if (!equalAddress(underlying, V2_PREVIEW_ADDRESSES.usdc)) throw new Error("V2_TOPOLOGY:UNDERLYING");
  if (!equalAddress(wrapperUnderlying, V2_PREVIEW_ADDRESSES.usdc)) throw new Error("V2_TOPOLOGY:WRAPPER_UNDERLYING");
  if (!equalAddress(adapterVault, V2_PREVIEW_ADDRESSES.vault)) throw new Error("V2_TOPOLOGY:ADAPTER_VAULT");
  if (!equalAddress(adapterAsset, V2_PREVIEW_ADDRESSES.usdc)) throw new Error("V2_TOPOLOGY:ADAPTER_ASSET");
  if (!equalAddress(adapterComet, V2_PREVIEW_ADDRESSES.comet)) throw new Error("V2_TOPOLOGY:ADAPTER_COMET");
}

async function writeV2(
  clients: V2ActionClients,
  request: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  },
  stage: string,
): Promise<`0x${string}`> {
  await assertV2Wallet(clients, stage);
  let gas: bigint | undefined;
  try {
    clients.onStage?.("precondition-read");
    const simulation = await clients.publicClient.simulateContract({
      account: clients.account,
      ...request,
    } as never);
    gas = simulation.request.gas;
  } catch (error) {
    throw actionError(`${stage}:simulation`, error);
  }
  await assertV2Wallet(clients, stage);
  let hash: `0x${string}`;
  try {
    hash = await submitFinancialWriteOnce(() =>
      clients.walletClient.writeContract({
        account: clients.account,
        chain: undefined,
        ...request,
        ...(gas === undefined ? {} : { gas }),
      } as never),
    );
  } catch (error) {
    throw actionError(`${stage}:signature`, error);
  }
  clients.onHash?.(hash);
  clients.onStage?.("reconcile");
  let receipt;
  try {
    receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  } catch (error) {
    throw actionError(`${stage}:reconcile:${hash}`, error);
  }
  if (receipt.status !== "success") throw new Error(`V2_ACTION:${stage}:reverted:${hash}`);
  return hash;
}

export async function readV2PrincipalHandle(clients: V2ActionClients): Promise<Hex> {
  await assertV2Wallet(clients, "read-principal");
  return clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.vault,
    abi: v2VaultActionAbi,
    functionName: "principalOf",
    args: [clients.account],
  });
}

export async function revealV2Savings(clients: V2ActionClients): Promise<bigint> {
  const handle = await readV2PrincipalHandle(clients);
  if (isZeroHandle(handle)) return 0n;
  clients.onStage?.("reveal");
  const value = await decryptPrivateValue(
    clients.ethereum,
    clients.account,
    V2_PREVIEW_ADDRESSES.vault,
    handle,
    clients.walletClient,
  );
  await assertV2Wallet(clients, "savings-reveal-revalidate");
  const handleAfter = await readV2PrincipalHandle(clients);
  if (handleAfter !== handle) throw new Error("V2_ACTION:SAVINGS_REVEAL:STALE_HANDLE");
  return value;
}

export async function getV2TestUsdc(clients: V2ActionClients): Promise<`0x${string}` | null> {
  await assertV2Wallet(clients, "get-test-usdc");
  const balance = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [clients.account],
  });
  if (balance > 0n) return null;
  return getTestUsdc(clients as unknown as ActionClients);
}

export async function addV2Money(clients: V2ActionClients, amount: bigint): Promise<readonly `0x${string}`[]> {
  if (amount <= 0n) throw new Error("V2_ACTION:ADD_MONEY:amount-must-be-positive");
  await assertV2Wallet(clients, "add-money");
  await readV2Topology(clients);
  clients.onStage?.("preparing-funds");
  const [balance, allowance] = await Promise.all([
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [clients.account],
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [clients.account, V2_PREVIEW_ADDRESSES.wrapper],
    }),
  ]);
  if (balance < amount) throw new Error("INSUFFICIENT_USDC");
  const hashes: `0x${string}`[] = [];
  if (allowance < amount) {
    clients.onStage?.("approval");
    hashes.push(
      await writeV2(
        clients,
        {
          address: V2_PREVIEW_ADDRESSES.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [V2_PREVIEW_ADDRESSES.wrapper, amount],
        },
        "add-money-approval",
      ),
    );
    const allowanceAfter = await clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [clients.account, V2_PREVIEW_ADDRESSES.wrapper],
    });
    if (allowanceAfter < amount) throw new Error("V2_ACTION:ADD_MONEY:allowance-not-confirmed");
  }
  hashes.push(
    await writeV2(
      clients,
      {
        address: V2_PREVIEW_ADDRESSES.wrapper,
        abi: v2WrapperActionAbi,
        functionName: "wrap",
        args: [clients.account, amount],
      },
      "add-money-wrap",
    ),
  );
  clients.onStage?.("adding-to-savings");
  let encrypted;
  try {
    encrypted = await encryptPrivateAmount(
      clients.ethereum,
      clients.account,
      V2_PREVIEW_ADDRESSES.wrapper,
      amount,
      clients.walletClient,
    );
  } catch (error) {
    throw actionError("add-money:input", error);
  }
  hashes.push(
    await writeV2(
      clients,
      {
        address: V2_PREVIEW_ADDRESSES.wrapper,
        abi: v2WrapperActionAbi,
        functionName: "confidentialTransferAndCall",
        args: [V2_PREVIEW_ADDRESSES.vault, encrypted.encryptedValue, encrypted.inputProof, "0x"],
      },
      "add-money-save",
    ),
  );
  return hashes;
}

function tupleValue<T>(value: unknown, index: number): T {
  if (!Array.isArray(value)) throw new Error("V2_ACTION:MALFORMED_TUPLE");
  return value[index] as T;
}

export async function enableV2PrizeSavings(
  clients: V2ActionClients,
  draws = 2n,
): Promise<{ hashes: readonly `0x${string}`[]; alreadyEnabled: boolean }> {
  if (draws < 1n || draws > 30n) throw new Error("V2_ACTION:PRIZE_SAVINGS:invalid-draw-count");
  await assertV2Wallet(clients, "prize-savings-enable");
  const [bondAmount, credit, preference] = await Promise.all([
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "BOND_AMOUNT",
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "automationBondCredit",
      args: [clients.account],
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "autoEntryPreference",
      args: [clients.account],
    }),
  ]);
  if (tupleValue<boolean>(preference, 1)) return { hashes: [], alreadyEnabled: true };
  const targetCredit = bondAmount * draws;
  const hashes: `0x${string}`[] = [];
  if (credit < targetCredit) {
    clients.onStage?.("entry-balance");
    hashes.push(
      await writeV2(
        clients,
        {
          address: V2_PREVIEW_ADDRESSES.escrow,
          abi: v2EscrowActionAbi,
          functionName: "depositAutomationBondCredit",
          value: targetCredit - credit,
        },
        "prize-savings-entry-balance",
      ),
    );
  }
  clients.onStage?.("prize-savings");
  hashes.push(
    await writeV2(
      clients,
      {
        address: V2_PREVIEW_ADDRESSES.escrow,
        abi: v2EscrowActionAbi,
        functionName: "setAutoEntry",
        args: [true],
      },
      "prize-savings-enable",
    ),
  );
  const after = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.escrow,
    abi: v2EscrowActionAbi,
    functionName: "autoEntryPreference",
    args: [clients.account],
  });
  if (!tupleValue<boolean>(after, 1)) throw new Error("V2_ACTION:PRIZE_SAVINGS:state-not-confirmed");
  return { hashes, alreadyEnabled: false };
}

export async function topUpV2EntryBalance(clients: V2ActionClients, amount: bigint): Promise<`0x${string}`> {
  if (amount <= 0n) throw new Error("V2_ACTION:ENTRY_BALANCE:amount-must-be-positive");
  await assertV2Wallet(clients, "entry-balance-top-up");
  const hash = await writeV2(
    clients,
    {
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "depositAutomationBondCredit",
      value: amount,
    },
    "entry-balance-top-up",
  );
  const credit = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.escrow,
    abi: v2EscrowActionAbi,
    functionName: "automationBondCredit",
    args: [clients.account],
  });
  if (credit < amount) throw new Error("V2_ACTION:ENTRY_BALANCE:state-not-confirmed");
  return hash;
}

export async function withdrawV2EntryBalance(clients: V2ActionClients, amount: bigint): Promise<`0x${string}`> {
  if (amount <= 0n) throw new Error("V2_ACTION:ENTRY_BALANCE:amount-must-be-positive");
  await assertV2Wallet(clients, "entry-balance-withdraw");
  const credit = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.escrow,
    abi: v2EscrowActionAbi,
    functionName: "automationBondCredit",
    args: [clients.account],
  });
  if (amount > credit) throw new Error("INSUFFICIENT_ENTRY_BALANCE");
  return writeV2(
    clients,
    {
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "withdrawAutomationBondCredit",
      args: [amount],
    },
    "entry-balance-withdraw",
  );
}

export async function disableV2PrizeSavings(
  clients: V2ActionClients,
): Promise<{ hash: `0x${string}` | null; alreadyDisabled: boolean }> {
  await assertV2Wallet(clients, "prize-savings-disable");
  const activeRound = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.vault,
    abi: v2VaultActionAbi,
    functionName: "activeRoundId",
  });
  const [preference, currentEnabled] = await Promise.all([
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "autoEntryPreference",
      args: [clients.account],
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "isAutoEntryEnabled",
      args: [clients.account, activeRound],
    }),
  ]);
  const scheduled = tupleValue<boolean>(preference, 1);
  const enabledNow = currentEnabled || tupleValue<boolean>(preference, 0);
  if (!scheduled && !enabledNow) return { hash: null, alreadyDisabled: true };
  const hash = await writeV2(
    clients,
    {
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "setAutoEntry",
      args: [false],
    },
    "prize-savings-disable",
  );
  const after = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.escrow,
    abi: v2EscrowActionAbi,
    functionName: "autoEntryPreference",
    args: [clients.account],
  });
  if (tupleValue<boolean>(after, 1)) throw new Error(`V2_ACTION:PRIZE_SAVINGS:disable-not-confirmed:${activeRound}`);
  return { hash, alreadyDisabled: false };
}

async function unwrapToUsdc(
  clients: V2ActionClients,
  amount: bigint,
  stage: string,
): Promise<readonly `0x${string}`[]> {
  clients.onStage?.("unwrapping");
  const encrypted = await encryptPrivateAmount(
    clients.ethereum,
    clients.account,
    V2_PREVIEW_ADDRESSES.wrapper,
    amount,
    clients.walletClient,
  );
  const requestHash = await writeV2(
    clients,
    {
      address: V2_PREVIEW_ADDRESSES.wrapper,
      abi: v2WrapperActionAbi,
      functionName: "unwrap",
      args: [clients.account, clients.account, encrypted.encryptedValue, encrypted.inputProof],
    },
    `${stage}-request`,
  );
  const receipt = await clients.publicClient.getTransactionReceipt({ hash: requestHash });
  const events = parseEventLogs({ abi: v2WrapperActionAbi, eventName: "UnwrapRequested", logs: receipt.logs });
  const requestId = events[0]?.args.unwrapRequestId;
  if (!requestId) throw new Error("V2_ACTION:UNWRAP_REQUEST_ID_MISSING");
  const publicResult = await decryptPublicValue(
    clients.ethereum,
    clients.account,
    requestId,
    clients.walletClient,
  );
  if (publicResult.clear !== amount) throw new Error("V2_ACTION:UNWRAP_AMOUNT_MISMATCH");
  const finalizeHash = await writeV2(
    clients,
    {
      address: V2_PREVIEW_ADDRESSES.wrapper,
      abi: v2WrapperActionAbi,
      functionName: "finalizeUnwrap",
      args: [requestId, publicResult.clear, publicResult.decryptionProof],
    },
    `${stage}-finalize`,
  );
  return [requestHash, finalizeHash];
}

async function withdrawV2Asset(
  clients: V2ActionClients,
  amount: bigint,
  assetFunctionName: "withdraw" | "withdrawWinnings",
  handleFunctionName: "principalOf" | "winningsOf",
  stage: string,
): Promise<readonly `0x${string}`[]> {
  if (amount <= 0n) throw new Error("V2_ACTION:WITHDRAW:amount-must-be-positive");
  await assertV2Wallet(clients, stage);
  await readV2Topology(clients);
  const handle = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.vault,
    abi: v2VaultActionAbi,
    functionName: handleFunctionName,
    args: [clients.account],
  });
  if (isZeroHandle(handle)) throw new Error("INSUFFICIENT_USDC");
  const available = await decryptPrivateValue(
    clients.ethereum,
    clients.account,
    V2_PREVIEW_ADDRESSES.vault,
    handle,
    clients.walletClient,
  );
  if (amount > available) throw new Error("INSUFFICIENT_USDC");
  const encrypted = await encryptPrivateAmount(
    clients.ethereum,
    clients.account,
    V2_PREVIEW_ADDRESSES.vault,
    amount,
    clients.walletClient,
  );
  const withdrawalHash = await writeV2(
    clients,
    {
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultActionAbi,
      functionName: assetFunctionName,
      args: [encrypted.encryptedValue, encrypted.inputProof],
    },
    stage,
  );
  const currentHandle = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.vault,
    abi: v2VaultActionAbi,
    functionName: handleFunctionName,
    args: [clients.account],
  });
  if (currentHandle === handle) throw new Error(`V2_ACTION:${stage}:state-not-changed`);
  return [withdrawalHash, ...(await unwrapToUsdc(clients, amount, stage))];
}

export async function withdrawV2Savings(clients: V2ActionClients, amount: bigint) {
  return withdrawV2Asset(clients, amount, "withdraw", "principalOf", "withdraw-savings");
}

export async function withdrawV2Winnings(clients: V2ActionClients, amount: bigint) {
  return withdrawV2Asset(clients, amount, "withdrawWinnings", "winningsOf", "withdraw-winnings");
}

export async function revealLatestV2Result(clients: V2ActionClients): Promise<bigint> {
  await assertV2Wallet(clients, "result-reveal");
  const activeRound = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.vault,
    abi: v2VaultActionAbi,
    functionName: "activeRoundId",
  });
  if (activeRound <= 1n) throw new Error("RESULT_NOT_READY");
  const resultRound = activeRound - 1n;
  const [round, registered, handle] = await Promise.all([
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultActionAbi,
      functionName: "roundInfo",
      args: [resultRound],
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "isRegistered",
      args: [resultRound, clients.account],
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.vault,
      abi: v2VaultActionAbi,
      functionName: "winningsOf",
      args: [clients.account],
    }),
  ]);
  if (Number(tupleValue<bigint | number>(round, 2)) !== 10 || !registered) throw new Error("RESULT_NOT_READY");
  if (isZeroHandle(handle)) return 0n;
  clients.onStage?.("reveal");
  const result = await decryptPrivateValue(
    clients.ethereum,
    clients.account,
    V2_PREVIEW_ADDRESSES.vault,
    handle,
    clients.walletClient,
  );
  await assertV2Wallet(clients, "result-reveal-revalidate");
  const handleAfter = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.vault,
    abi: v2VaultActionAbi,
    functionName: "winningsOf",
    args: [clients.account],
  });
  if (handleAfter !== handle) throw new Error("V2_ACTION:RESULT_REVEAL:STALE_HANDLE");
  return result;
}

export async function claimV2Refund(clients: V2ActionClients, roundId: bigint): Promise<`0x${string}`> {
  await assertV2Wallet(clients, "claim-refund");
  const [registered, claimed] = await Promise.all([
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "isRegistered",
      args: [roundId, clients.account],
    }),
    clients.publicClient.readContract({
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "refundClaimed",
      args: [roundId, clients.account],
    }),
  ]);
  if (!registered || claimed) throw new Error("REFUND_UNAVAILABLE");
  return writeV2(
    clients,
    {
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "claimBondRefund",
      args: [roundId],
    },
    "claim-refund",
  );
}

export async function claimV2Reward(clients: V2ActionClients): Promise<`0x${string}`> {
  await assertV2Wallet(clients, "claim-reward");
  const credit = await clients.publicClient.readContract({
    address: V2_PREVIEW_ADDRESSES.escrow,
    abi: v2EscrowActionAbi,
    functionName: "settlementRewardCredit",
    args: [clients.account],
  });
  if (credit === 0n) throw new Error("REWARD_UNAVAILABLE");
  return writeV2(
    clients,
    {
      address: V2_PREVIEW_ADDRESSES.escrow,
      abi: v2EscrowActionAbi,
      functionName: "withdrawSettlementRewards",
    },
    "claim-reward",
  );
}

export { ZERO_HANDLE };
