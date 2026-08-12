"use client";

import type { Address, PublicClient, WalletClient } from "viem";

import { bondEscrowAbi, confidentialUsdcAbi, erc20Abi, vaultAbi } from "./abis";
import { CANONICAL_USDC } from "./config";
import { encryptPrivateAmount } from "./zama";

const COMPOUND_FAUCET = "0x68793eA49297eB75DFB4610B68e076D2A5c7646C" as Address;
const PROVEN_FAUCET_TRANSACTION = "0x63829c8633304e200a62bdd0af068374687b8163afc6673988fbe8f4426357da" as const;

export type ActionClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  ethereum: { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
  account: Address;
  onHash?: (hash: `0x${string}`) => void;
};

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
): Promise<`0x${string}`> {
  const hash = await clients.walletClient.writeContract(request as never);
  clients.onHash?.(hash);
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("TRANSACTION_REVERTED");
  return hash;
}

export async function getTestUsdc(clients: ActionClients): Promise<`0x${string}`> {
  const proven = await clients.publicClient.getTransaction({ hash: PROVEN_FAUCET_TRANSACTION });
  if (proven.to?.toLowerCase() !== COMPOUND_FAUCET.toLowerCase() || !proven.input || proven.input === "0x") {
    throw new Error("CANONICAL_FAUCET_EVIDENCE_UNAVAILABLE");
  }
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
  const allowance = await clients.publicClient.readContract({
    address: CANONICAL_USDC,
    abi: erc20Abi,
    functionName: "allowance",
    args: [clients.account, lcUsdc],
  });
  const hashes: `0x${string}`[] = [];
  if (allowance < amount) {
    hashes.push(
      await writeAndConfirm(clients, {
        account: clients.account,
        chain: undefined,
        address: CANONICAL_USDC,
        abi: erc20Abi,
        functionName: "approve",
        args: [lcUsdc, amount],
      }),
    );
  }
  hashes.push(
    await writeAndConfirm(clients, {
      account: clients.account,
      chain: undefined,
      address: lcUsdc,
      abi: confidentialUsdcAbi,
      functionName: "wrap",
      args: [clients.account, amount],
    }),
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
  return writeAndConfirm(clients, {
    account: clients.account,
    chain: undefined,
    address: lcUsdc,
    abi: confidentialUsdcAbi,
    functionName: "unwrap",
    args: [clients.account, clients.account, encrypted.encryptedValue, encrypted.inputProof],
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
