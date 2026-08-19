import { normalizeWalletAddress, walletsMatch } from "./readiness";
import type { Address } from "viem";

export const WALLET_IDENTITY_STATES = [
  "UNINITIALIZED",
  "DISCONNECTED",
  "WALLET_MISMATCH",
  "WRONG_NETWORK",
  "READY",
] as const;

export type WalletIdentityState = (typeof WALLET_IDENTITY_STATES)[number];

export const WALLET_IDENTITY_REASONS = [
  "AUTH_INITIALIZING",
  "FINANCIAL_WALLET_NOT_LINKED",
  "PROVIDER_ACCOUNT_UNAVAILABLE",
  "PROVIDER_ACCOUNT_MISMATCH",
  "DYNAMIC_PRIMARY_MISMATCH",
  "DYNAMIC_WALLET_UNAVAILABLE",
  "WAGMI_ACCOUNT_MISMATCH",
  "WALLETCLIENT_ACCOUNT_MISMATCH",
  "PROVIDER_NETWORK_UNAVAILABLE",
  "WALLETCLIENT_NETWORK_MISMATCH",
  "WRONG_NETWORK",
  "RPC_UNAVAILABLE",
  "READY",
] as const;

export type WalletIdentityReason = (typeof WALLET_IDENTITY_REASONS)[number];

export type WalletIdentityRecoveryAction =
  | "LINK_WALLET"
  | "RECONNECT_VERIFIED_WALLET"
  | "SWITCH_TO_VERIFIED_WALLET"
  | "SWITCH_TO_SEPOLIA"
  | "RETRY_CONNECTION"
  | "NONE";

export type WalletIdentityCommandResult =
  | { ok: true; state: WalletIdentityState }
  | { ok: false; state: WalletIdentityState; reason: string };

export type WalletRpcHealthState =
  | "NOT_CHECKED"
  | "CHECKING"
  | "HEALTHY"
  | "APP_RPC_UNAVAILABLE"
  | "WALLET_RPC_UNAVAILABLE"
  | "UNKNOWN";

export type WalletRpcHealth = {
  state: WalletRpcHealthState;
  checkedAt: number | null;
  dynamicWalletChainId: number | null;
  walletClientChainId: number | null;
  appChainId: number | null;
  technicalDetail?: string;
};

export type DynamicWalletDescriptor = {
  id: string;
  address: Address;
};

export type WalletIdentityInputs = {
  initialized: boolean;
  verifiedFinancialWallet: Address | null;
  dynamicPrimaryWallet: Address | null;
  dynamicLinkedWallets: readonly DynamicWalletDescriptor[];
  dynamicWalletObjectForVerifiedAddress: DynamicWalletDescriptor | null;
  providerActiveAccount: Address | null;
  providerAccountKnown: boolean;
  providerConnected: boolean;
  wagmiAccount: Address | null;
  walletClientAccount: Address | null;
  walletClientId: string | null;
  chainId: number | null;
  walletClientChainId: number | null;
  networkHealth: WalletRpcHealth;
  revision: number;
};

export type WalletIdentitySnapshot = {
  state: WalletIdentityState;
  reason: WalletIdentityReason;
  revision: number;
  verifiedAddress: Address | null;
  connectedAddress: Address | null;
  dynamicPrimaryAddress: Address | null;
  dynamicLinkedWallets: readonly DynamicWalletDescriptor[];
  dynamicWalletObjectForVerifiedAddress: DynamicWalletDescriptor | null;
  providerActiveAccount: Address | null;
  providerAccountKnown: boolean;
  providerConnected: boolean;
  wagmiAccount: Address | null;
  walletClientAccount: Address | null;
  chainId: number | null;
  walletClientChainId: number | null;
  networkHealth: WalletRpcHealth;
  canUseFinancialActions: boolean;
  recoveryAction: WalletIdentityRecoveryAction;
  recoveryMessage: string;
  technicalDetail?: string;
};

export class WalletIdentityController {
  private revision = 0;

  beginRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  get currentRevision(): number {
    return this.revision;
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision;
  }
}

export function createNotCheckedWalletRpcHealth(): WalletRpcHealth {
  return {
    state: "NOT_CHECKED",
    checkedAt: null,
    dynamicWalletChainId: null,
    walletClientChainId: null,
    appChainId: null,
  };
}

export function createCheckingWalletRpcHealth(): WalletRpcHealth {
  return {
    state: "CHECKING",
    checkedAt: null,
    dynamicWalletChainId: null,
    walletClientChainId: null,
    appChainId: null,
  };
}

function recoveryFor(
  state: WalletIdentityState,
  reason: WalletIdentityReason,
  verifiedAddress: Address | null,
): { action: WalletIdentityRecoveryAction; message: string } {
  if (!verifiedAddress) return { action: "LINK_WALLET", message: "Link your financial wallet to continue." };
  if (state === "DISCONNECTED") {
    return {
      action: "RECONNECT_VERIFIED_WALLET",
      message: "Connect your verified financial wallet to continue.",
    };
  }
  if (state === "WALLET_MISMATCH") {
    return {
      action: "SWITCH_TO_VERIFIED_WALLET",
      message: "Switch back to your verified financial wallet to continue.",
    };
  }
  if (state === "WRONG_NETWORK") {
    return { action: "SWITCH_TO_SEPOLIA", message: "Switch to Ethereum Sepolia to continue." };
  }
  if (reason === "RPC_UNAVAILABLE") {
    return { action: "RETRY_CONNECTION", message: "Sepolia connectivity must be restored to continue." };
  }
  if (reason === "DYNAMIC_PRIMARY_MISMATCH" || reason === "DYNAMIC_WALLET_UNAVAILABLE") {
    return { action: "SWITCH_TO_VERIFIED_WALLET", message: "Select your verified wallet to continue." };
  }
  return { action: "RETRY_CONNECTION", message: "Wallet identity is still being confirmed." };
}

function normalizedDescriptor(wallet: DynamicWalletDescriptor | null): DynamicWalletDescriptor | null {
  if (!wallet) return null;
  const address = normalizeWalletAddress(wallet.address);
  return address ? { id: wallet.id, address } : null;
}

export function deriveWalletIdentity(inputs: WalletIdentityInputs): WalletIdentitySnapshot {
  const verifiedAddress = normalizeWalletAddress(inputs.verifiedFinancialWallet);
  const connectedAddress = normalizeWalletAddress(inputs.providerActiveAccount);
  const dynamicPrimaryAddress = normalizeWalletAddress(inputs.dynamicPrimaryWallet);
  const wagmiAccount = normalizeWalletAddress(inputs.wagmiAccount);
  const walletClientAccount = normalizeWalletAddress(inputs.walletClientAccount);
  const dynamicWalletObjectForVerifiedAddress = normalizedDescriptor(inputs.dynamicWalletObjectForVerifiedAddress);
  const dynamicLinkedWallets = inputs.dynamicLinkedWallets
    .map(normalizedDescriptor)
    .filter((wallet): wallet is DynamicWalletDescriptor => wallet !== null);

  let state: WalletIdentityState = "UNINITIALIZED";
  let reason: WalletIdentityReason = "AUTH_INITIALIZING";

  if (!inputs.initialized || !inputs.providerAccountKnown) {
    state = "UNINITIALIZED";
    reason = "AUTH_INITIALIZING";
  } else if (!verifiedAddress) {
    state = "UNINITIALIZED";
    reason = "FINANCIAL_WALLET_NOT_LINKED";
  } else if (!inputs.providerConnected || !connectedAddress) {
    state = "DISCONNECTED";
    reason = "PROVIDER_ACCOUNT_UNAVAILABLE";
  } else if (!walletsMatch(connectedAddress, verifiedAddress)) {
    state = "WALLET_MISMATCH";
    reason = "PROVIDER_ACCOUNT_MISMATCH";
  } else if (inputs.chainId === null) {
    state = "UNINITIALIZED";
    reason = "PROVIDER_NETWORK_UNAVAILABLE";
  } else if (inputs.chainId !== 11_155_111) {
    state = "WRONG_NETWORK";
    reason = "WRONG_NETWORK";
  } else if (!dynamicWalletObjectForVerifiedAddress) {
    state = "UNINITIALIZED";
    reason = "DYNAMIC_WALLET_UNAVAILABLE";
  } else if (!dynamicPrimaryAddress || !walletsMatch(dynamicPrimaryAddress, verifiedAddress)) {
    state = "UNINITIALIZED";
    reason = "DYNAMIC_PRIMARY_MISMATCH";
  } else if (!wagmiAccount || !walletsMatch(wagmiAccount, connectedAddress)) {
    state = "UNINITIALIZED";
    reason = "WAGMI_ACCOUNT_MISMATCH";
  } else if (!walletClientAccount || !walletsMatch(walletClientAccount, connectedAddress)) {
    state = "UNINITIALIZED";
    reason = "WALLETCLIENT_ACCOUNT_MISMATCH";
  } else if (inputs.walletClientChainId === null || inputs.walletClientChainId !== inputs.chainId) {
    state = "UNINITIALIZED";
    reason = "WALLETCLIENT_NETWORK_MISMATCH";
  } else if (inputs.networkHealth.state !== "HEALTHY") {
    state = "UNINITIALIZED";
    reason = "RPC_UNAVAILABLE";
  } else {
    state = "READY";
    reason = "READY";
  }

  const recovery = recoveryFor(state, reason, verifiedAddress);
  const technicalDetail =
    state === "WALLET_MISMATCH" && connectedAddress && verifiedAddress
      ? `WALLET_IDENTITY:MISMATCH:verified=${verifiedAddress}:connected=${connectedAddress}`
      : state === "UNINITIALIZED" && reason !== "AUTH_INITIALIZING"
        ? `WALLET_IDENTITY:${reason}`
        : undefined;

  return {
    state,
    reason,
    revision: inputs.revision,
    verifiedAddress,
    connectedAddress: state === "DISCONNECTED" ? null : connectedAddress,
    dynamicPrimaryAddress,
    dynamicLinkedWallets,
    dynamicWalletObjectForVerifiedAddress,
    providerActiveAccount: connectedAddress,
    providerAccountKnown: inputs.providerAccountKnown,
    providerConnected: inputs.providerConnected,
    wagmiAccount,
    walletClientAccount,
    chainId: inputs.chainId,
    walletClientChainId: inputs.walletClientChainId,
    networkHealth: inputs.networkHealth,
    canUseFinancialActions: state === "READY",
    recoveryAction: state === "READY" ? "NONE" : recovery.action,
    recoveryMessage: recovery.message,
    technicalDetail,
  };
}

export function canProbeWalletIdentity(inputs: WalletIdentityInputs): boolean {
  const verifiedAddress = normalizeWalletAddress(inputs.verifiedFinancialWallet);
  const connectedAddress = normalizeWalletAddress(inputs.providerActiveAccount);
  return Boolean(
    inputs.initialized &&
    verifiedAddress &&
    inputs.providerConnected &&
    inputs.providerAccountKnown &&
    connectedAddress &&
    walletsMatch(connectedAddress, verifiedAddress) &&
    inputs.dynamicWalletObjectForVerifiedAddress &&
    inputs.dynamicPrimaryWallet &&
    walletsMatch(inputs.dynamicPrimaryWallet, verifiedAddress) &&
    inputs.wagmiAccount &&
    walletsMatch(inputs.wagmiAccount, connectedAddress) &&
    inputs.walletClientAccount &&
    walletsMatch(inputs.walletClientAccount, connectedAddress),
  );
}

export function identityInputKey(inputs: Omit<WalletIdentityInputs, "networkHealth" | "revision">): string {
  return [
    inputs.initialized,
    inputs.verifiedFinancialWallet,
    inputs.dynamicPrimaryWallet,
    inputs.dynamicLinkedWallets.map((wallet) => `${wallet.id}:${wallet.address}`).join(","),
    inputs.dynamicWalletObjectForVerifiedAddress?.id,
    inputs.providerActiveAccount,
    inputs.providerAccountKnown,
    inputs.providerConnected,
    inputs.wagmiAccount,
    inputs.walletClientAccount,
    inputs.walletClientId,
    inputs.chainId,
    inputs.walletClientChainId,
  ]
    .map((value) => value ?? "")
    .join("|");
}
