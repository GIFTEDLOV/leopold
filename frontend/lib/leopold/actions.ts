"use client";

import { parseEventLogs, type Address, type PublicClient, type WalletClient } from "viem";

import { bondEscrowAbi, confidentialUsdcAbi, erc20Abi, vaultAbi } from "./abis";
import { CANONICAL_USDC } from "./config";
import { decryptPublicValue, encryptPrivateAmount } from "./zama";
import type { TransactionStage } from "./transactions";

const COMPOUND_FAUCET = "0x68793eA49297eB75DFB4610B68e076D2A5c7646C" as Address;
const PROVEN_FAUCET_TRANSACTION = "0x63829c8633304e200a62bdd0af068374687b8163afc6673988fbe8f4426357da" as const;

export type ActionClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  ethereum: { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
  account: Address;
  onHash?: (hash: `0x${string}`) => void;
  onStage?: (stage: TransactionStage) => void;
};

function notifyPrivateStage(
  clients: ActionClients,
  stage: string,
  phase: "simulating" | "signature" | "submitted" | "confirming",
): void {
  if (stage === "make-private-approval") clients.onStage?.(`approval-${phase}` as TransactionStage);
  if (stage === "make-private-wrap") clients.onStage?.(`wrap-${phase}` as TransactionStage);
}

async function assertWalletClient(clients: ActionClients, stage: string): Promise<void> {
  const walletAccount =
    typeof clients.walletClient.account === "string"
      ? clients.walletClient.account
      : clients.walletClient.account?.address;
  if (walletAccount && walletAccount.toLowerCase() !== clients.account.toLowerCase()) {
    throw new Error(`WALLET_SIGNER_MISMATCH:${stage}:${walletAccount}:${clients.account}`);
  }
  const walletChainId = await clients.walletClient.getChainId();
  if (walletChainId !== 11_155_111) throw new Error(`WRONG_NETWORK:${stage}:wallet-client-${walletChainId}`);
}

async function writeAndConfirm(
  clients: ActionClients,
  request: {
    account: Address;
    chain: undefined;
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  },
  stage = request.functionName,
  simulate = false,
): Promise<`0x${string}`> {
  await assertWalletClient(clients, stage);
  let gas: bigint | undefined;
  if (simulate) {
    notifyPrivateStage(clients, stage, "simulating");
    try {
      const simulation = await clients.publicClient.simulateContract({
        account: request.account,
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: request.args,
        value: request.value,
      } as never);
      gas = simulation.request.gas;
    } catch (error) {
      throw actionError(`ACTION_SIMULATION_FAILED:${stage}`, error);
    }
  }
  let hash: `0x${string}`;
  await assertWalletClient(clients, stage);
  notifyPrivateStage(clients, stage, "signature");
  try {
    hash = await clients.walletClient.writeContract({
      ...request,
      ...(gas === undefined ? {} : { gas }),
    } as never);
  } catch (error) {
    throw actionError(`ACTION_SIGNING_FAILED:${stage}`, error);
  }
  clients.onHash?.(hash);
  notifyPrivateStage(clients, stage, "submitted");
  notifyPrivateStage(clients, stage, "confirming");
  let receipt;
  try {
    receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  } catch (error) {
    throw actionError(`ACTION_CONFIRMATION_FAILED:${stage}`, error);
  }
  if (receipt.status !== "success") throw new Error(`ACTION_REVERTED:${stage}`);
  return hash;
}

function actionError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(`${prefix}: ${message}`);
  Object.defineProperty(wrapped, "cause", { value: error, enumerable: false, configurable: true });
  return wrapped;
}

export async function getTestUsdc(clients: ActionClients): Promise<`0x${string}`> {
  const proven = await clients.publicClient.getTransaction({ hash: PROVEN_FAUCET_TRANSACTION });
  if (proven.to?.toLowerCase() !== COMPOUND_FAUCET.toLowerCase() || !proven.input || proven.input === "0x") {
    throw new Error("CANONICAL_FAUCET_EVIDENCE_UNAVAILABLE");
  }

  // DynamicWagmiConnector supplies the signing client. Validate its live
  // account and chain before asking it to sign, then simulate the exact
  // historical call through the read-only Sepolia client. This prevents a
  // reverted faucet call from becoming a blind wallet broadcast.
  const walletAccount =
    typeof clients.walletClient.account === "string"
      ? clients.walletClient.account
      : clients.walletClient.account?.address;
  if (walletAccount && walletAccount.toLowerCase() !== clients.account.toLowerCase()) {
    throw new Error(`WALLET_SIGNER_MISMATCH:${walletAccount}:${clients.account}`);
  }
  const walletChainId = await clients.walletClient.getChainId();
  if (walletChainId !== 11_155_111) throw new Error(`WRONG_NETWORK:wallet-client-${walletChainId}`);
  await clients.publicClient.call({
    account: clients.account,
    to: COMPOUND_FAUCET,
    data: proven.input,
  });

  const hash = await clients.walletClient.sendTransaction({
    account: clients.account,
    chain: undefined,
    to: COMPOUND_FAUCET,
    data: proven.input,
  });
  clients.onHash?.(hash);
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("CANONICAL_FAUCET_TRANSACTION_FAILED");
  return hash;
}

export async function makePrivate(clients: ActionClients, lcUsdc: Address, amount: bigint): Promise<`0x${string}`[]> {
  await assertWalletClient(clients, "make-private-start");
  const readAllowance = async (fresh = false): Promise<bigint> => {
    const blockNumber = fresh ? await clients.publicClient.getBlockNumber() : undefined;
    return clients.publicClient.readContract({
      address: CANONICAL_USDC,
      abi: erc20Abi,
      functionName: "allowance",
      args: [clients.account, lcUsdc],
      ...(blockNumber === undefined ? {} : { blockNumber }),
    });
  };
  const allowance = await readAllowance();
  const hashes: `0x${string}`[] = [];
  if (allowance < amount) {
    hashes.push(
      await writeAndConfirm(
        clients,
        {
          account: clients.account,
          chain: undefined,
          address: CANONICAL_USDC,
          abi: erc20Abi,
          functionName: "approve",
          args: [lcUsdc, amount],
        },
        "make-private-approval",
        true,
      ),
    );
    await assertWalletClient(clients, "make-private-allowance-refresh");
    const allowanceAfterApproval = await readAllowance(true);
    if (allowanceAfterApproval < amount) {
      throw new Error(
        `ACTION_CONFIRMATION_FAILED:make-private-approval-allowance:${allowanceAfterApproval.toString()}`,
      );
    }
    clients.onStage?.("allowance-refresh");
  }
  hashes.push(
    await writeAndConfirm(
      clients,
      {
        account: clients.account,
        chain: undefined,
        address: lcUsdc,
        abi: confidentialUsdcAbi,
        functionName: "wrap",
        args: [clients.account, amount],
      },
      "make-private-wrap",
      true,
    ),
  );
  return hashes;
}

export async function savePrivately(
  clients: ActionClients,
  lcUsdc: Address,
  vault: Address,
  amount: bigint,
): Promise<`0x${string}`> {
  const encrypted = await encryptPrivateAmount(clients.ethereum, clients.account, lcUsdc, amount);
  return writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: lcUsdc,
    abi: confidentialUsdcAbi,
    functionName: "confidentialTransferAndCall",
    args: [vault, encrypted.encryptedValue, encrypted.inputProof, "0x"],
  });
}

export async function enterPrizeRound(
  clients: ActionClients,
  escrow: Address,
  roundId: bigint,
  exactBond: bigint,
): Promise<`0x${string}`> {
  return writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: escrow,
    abi: bondEscrowAbi,
    functionName: "registerForRound",
    args: [roundId],
    value: exactBond,
  });
}

export async function withdrawSavings(clients: ActionClients, vault: Address, amount: bigint): Promise<`0x${string}`> {
  const encrypted = await encryptPrivateAmount(clients.ethereum, clients.account, vault, amount);
  return writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: vault,
    abi: vaultAbi,
    functionName: "withdraw",
    args: [encrypted.encryptedValue, encrypted.inputProof],
  });
}

export async function requestMakePublic(
  clients: ActionClients,
  lcUsdc: Address,
  amount: bigint,
): Promise<`0x${string}`> {
  const encrypted = await encryptPrivateAmount(clients.ethereum, clients.account, lcUsdc, amount);
  const requestHash = await writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: lcUsdc,
    abi: confidentialUsdcAbi,
    functionName: "unwrap",
    args: [clients.account, clients.account, encrypted.encryptedValue, encrypted.inputProof],
  });
  const receipt = await clients.publicClient.getTransactionReceipt({ hash: requestHash });
  const [requestEvent] = parseEventLogs({
    abi: confidentialUsdcAbi,
    eventName: "UnwrapRequested",
    logs: receipt.logs,
  });
  if (!requestEvent) throw new Error("UNWRAP_REQUEST_ID_UNAVAILABLE");
  const requestId = requestEvent.args.unwrapRequestId;
  const publicDecryption = await decryptPublicValue(clients.ethereum, clients.account, requestId);
  if (publicDecryption.clear > 0xffffffffffffffffn) throw new Error("RELAYER_PUBLIC_CLEAR_OUT_OF_RANGE");
  return writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: lcUsdc,
    abi: confidentialUsdcAbi,
    functionName: "finalizeUnwrap",
    args: [requestId, publicDecryption.clear, publicDecryption.decryptionProof],
  });
}

export async function claimBondRefund(clients: ActionClients, escrow: Address, roundId: bigint) {
  return writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: escrow,
    abi: bondEscrowAbi,
    functionName: "claimBondRefund",
    args: [roundId],
  });
}

export async function claimSettlementRewards(clients: ActionClients, escrow: Address) {
  return writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: escrow,
    abi: bondEscrowAbi,
    functionName: "withdrawSettlementRewards",
  });
}

export async function materializeEligibility(clients: ActionClients, vault: Address, roundId: bigint) {
  return writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: vault,
    abi: vaultAbi,
    functionName: "materializeMyRoundWeight",
    args: [roundId],
  });
}
