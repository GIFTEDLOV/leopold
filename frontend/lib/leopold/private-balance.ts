"use client";

import type { Address, Hex, PublicClient, WalletClient } from "viem";

import { formatUsdcAmount } from "./amounts";
import { confidentialUsdcAbi } from "./abis";
import { LEOPOLD_CHAIN_ID, leopoldConfig, requireConfiguredAddress } from "./config";
import { decryptPrivateValue } from "./zama";

export type PrivateBalanceClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  ethereum: { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
  account: Address;
};

export type PrivateBalanceStatus = "NOT_REVEALED" | "REVEALING" | "REVEALED" | "REVEAL_FAILED";

export function privateBalanceLabel(status: PrivateBalanceStatus, value: bigint | null): string {
  if (status === "REVEALING") return "Revealing…";
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

export async function readPrivateBalance(
  clients: PrivateBalanceClients,
  token: Address,
  onHandle?: (handle: Hex) => void,
): Promise<{ handle: Hex; value: bigint }> {
  const officialToken = requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC");
  if (token.toLowerCase() !== officialToken.toLowerCase()) {
    throw new Error("PRIVATE_BALANCE:WRONG_TOKEN");
  }
  const signerAccount = walletClientAddress(clients.walletClient);
  if (!signerAccount || signerAccount.toLowerCase() !== clients.account.toLowerCase()) {
    throw new Error("PRIVATE_BALANCE:WRONG_ACCOUNT");
  }
  const signerChainId = await clients.walletClient.getChainId();
  if (signerChainId !== LEOPOLD_CHAIN_ID) {
    throw new Error(`PRIVATE_BALANCE:WRONG_NETWORK:wallet-client-${signerChainId}`);
  }
  const publicChainId = await clients.publicClient.getChainId();
  if (publicChainId !== LEOPOLD_CHAIN_ID) {
    throw new Error(`PRIVATE_BALANCE:WRONG_NETWORK:public-client-${publicChainId}`);
  }
  const handle = await clients.publicClient.readContract({
    address: officialToken,
    abi: confidentialUsdcAbi,
    functionName: "confidentialBalanceOf",
    args: [clients.account],
  });
  onHandle?.(handle);
  const value = await decryptPrivateValue(clients.ethereum, clients.account, officialToken, handle);
  return { handle, value };
}
