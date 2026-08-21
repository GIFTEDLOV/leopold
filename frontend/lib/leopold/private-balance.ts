"use client";

import type { Address, Hex, PublicClient, WalletClient } from "viem";

import { formatUsdcAmount } from "./amounts";
import { confidentialUsdcAbi } from "./abis";
import { LEOPOLD_CHAIN_ID, leopoldConfig, requireConfiguredAddress } from "./config";
import { decryptPrivateValue } from "./zama";
import { withReadReliability } from "@/lib/ops/reliability";

export type PrivateBalanceClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  ethereum: { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
  account: Address;
};

export type PrivateBalanceRevealStage =
  | "READING_HANDLE"
  | "AWAITING_DECRYPT_AUTHORIZATION"
  | "DECRYPTING"
  | "REVALIDATING_HANDLE"
  | "REVEALED";

export type PrivateBalanceStatus =
  | "UNREAD"
  | "READING_HANDLE"
  | "NOT_REVEALED"
  | "AWAITING_DECRYPT_AUTHORIZATION"
  | "DECRYPTING"
  | "REVEALED"
  | "REVEAL_FAILED";

export type PrivateBalanceIdentity = {
  chainId: number;
  account: Address;
  token: Address;
  handle: Hex;
};

export const ZERO_BALANCE_HANDLE = `0x${"0".repeat(64)}` as Hex;

export function isZeroBalanceHandle(handle: Hex): boolean {
  return handle.toLowerCase() === ZERO_BALANCE_HANDLE;
}

export function privateBalanceLabel(status: PrivateBalanceStatus, value: bigint | null): string {
  if (status === "READING_HANDLE") return "Reading private balance…";
  if (status === "AWAITING_DECRYPT_AUTHORIZATION" || status === "DECRYPTING") return "Revealing…";
  return status === "REVEALED" && value !== null ? `${formatUsdcAmount(value)} USDC` : "•••••• USDC";
}

function walletClientAddress(walletClient: WalletClient): Address | null {
  if (!walletClient.account) return null;
  return typeof walletClient.account === "string" ? walletClient.account : walletClient.account.address;
}

export function shortWalletAddress(account: Address): string {
  return `${account.slice(0, 6)}…${account.slice(-4)}`;
}

export function privateBalanceDiagnostic({
  chainId,
  account,
  token,
  handle,
  stage,
  error,
}: {
  chainId: number | null;
  account: Address | null;
  token: Address | null;
  handle: Hex | null;
  stage: string;
  error?: string;
}): string {
  return [
    `PRIVATE_BALANCE:${stage}`,
    `chain=${chainId ?? "unknown"}`,
    `wallet=${account ? shortWalletAddress(account) : "unknown"}`,
    `token=${token ?? "unknown"}`,
    `handle=${handle ?? "unknown"}`,
    error,
  ]
    .filter(Boolean)
    .join(":");
}

function assertConfiguredIdentity(clients: PrivateBalanceClients, token: Address): Address {
  const officialToken = requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC");
  if (token.toLowerCase() !== officialToken.toLowerCase()) {
    throw new Error("PRIVATE_BALANCE:WRONG_TOKEN");
  }
  const signerAccount = walletClientAddress(clients.walletClient);
  if (!signerAccount || signerAccount.toLowerCase() !== clients.account.toLowerCase()) {
    throw new Error("PRIVATE_BALANCE:WRONG_ACCOUNT");
  }
  return officialToken;
}

async function assertSepoliaClients(clients: PrivateBalanceClients): Promise<number> {
  const signerChainId = await clients.walletClient.getChainId();
  if (signerChainId !== LEOPOLD_CHAIN_ID) {
    throw new Error(`PRIVATE_BALANCE:WRONG_NETWORK:wallet-client-${signerChainId}`);
  }
  const publicChainId = await clients.publicClient.getChainId();
  if (publicChainId !== LEOPOLD_CHAIN_ID) {
    throw new Error(`PRIVATE_BALANCE:WRONG_NETWORK:public-client-${publicChainId}`);
  }
  return signerChainId;
}

/** The only authoritative source for the user's current private USDC handle. */
export async function readCurrentPrivateBalanceHandle(
  clients: PrivateBalanceClients,
  token: Address,
): Promise<PrivateBalanceIdentity> {
  const officialToken = assertConfiguredIdentity(clients, token);
  const chainId = await assertSepoliaClients(clients);
  const handle = await withReadReliability(
    () =>
      clients.publicClient.readContract({
        address: officialToken,
        abi: confidentialUsdcAbi,
        functionName: "confidentialBalanceOf",
        args: [clients.account],
      }),
    { operation: "PRIVATE_HANDLE_READ" },
  );
  return { chainId, account: clients.account, token: officialToken, handle };
}

export async function decryptCurrentPrivateBalance(
  clients: PrivateBalanceClients,
  identity: PrivateBalanceIdentity,
): Promise<bigint> {
  const officialToken = assertConfiguredIdentity(clients, identity.token);
  const chainId = await assertSepoliaClients(clients);
  if (
    chainId !== identity.chainId ||
    clients.account.toLowerCase() !== identity.account.toLowerCase() ||
    officialToken.toLowerCase() !== identity.token.toLowerCase()
  ) {
    throw new Error("PRIVATE_BALANCE:IDENTITY_CHANGED");
  }
  return decryptPrivateValue(clients.ethereum, clients.account, officialToken, identity.handle, clients.walletClient);
}

export function samePrivateBalanceIdentity(left: PrivateBalanceIdentity, right: PrivateBalanceIdentity): boolean {
  return (
    left.chainId === right.chainId &&
    left.account.toLowerCase() === right.account.toLowerCase() &&
    left.token.toLowerCase() === right.token.toLowerCase() &&
    left.handle.toLowerCase() === right.handle.toLowerCase()
  );
}

/**
 * Mirrors the pinned SDK's high-level user-decrypt flow while binding the
 * accepted cleartext to a fresh chain handle and the current signer tuple.
 */
export async function revealPrivateBalanceFromCurrentHandle({
  clients,
  getCurrentClients,
  token,
  onStage,
  onIdentity,
}: {
  clients: PrivateBalanceClients;
  getCurrentClients: () => PrivateBalanceClients;
  token: Address;
  onStage?: (stage: PrivateBalanceRevealStage) => void;
  onIdentity?: (identity: PrivateBalanceIdentity) => void;
}): Promise<{ identity: PrivateBalanceIdentity; value: bigint }> {
  onStage?.("READING_HANDLE");
  const requestedIdentity = await readCurrentPrivateBalanceHandle(clients, token);
  onIdentity?.(requestedIdentity);

  if (isZeroBalanceHandle(requestedIdentity.handle)) {
    const currentIdentity = await readCurrentPrivateBalanceHandle(getCurrentClients(), token);
    if (!samePrivateBalanceIdentity(requestedIdentity, currentIdentity)) {
      throw new Error("PRIVATE_BALANCE:STALE_HANDLE");
    }
    onStage?.("REVEALED");
    return { identity: currentIdentity, value: 0n };
  }

  onStage?.("AWAITING_DECRYPT_AUTHORIZATION");
  onStage?.("DECRYPTING");
  const value = await decryptCurrentPrivateBalance(clients, requestedIdentity);
  onStage?.("REVALIDATING_HANDLE");
  const currentIdentity = await readCurrentPrivateBalanceHandle(getCurrentClients(), token);
  if (!samePrivateBalanceIdentity(requestedIdentity, currentIdentity)) {
    throw new Error("PRIVATE_BALANCE:STALE_HANDLE");
  }
  onStage?.("REVEALED");
  return { identity: currentIdentity, value };
}
