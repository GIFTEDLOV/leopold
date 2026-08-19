import { normalizeWalletAddress, walletsMatch } from "./readiness";
import type { Address } from "viem";

export const LEOPOLD_CHAIN_ID = 11_155_111;
export const WALLET_SESSION_STORAGE_KEY = "leopold.wallet-session.v1";
export const WALLET_SESSION_TIMEOUT_MS = 10_000;

export const WALLET_SESSION_STATES = [
  "BOOTSTRAPPING",
  "DISCONNECTED",
  "CONNECTING",
  "WRONG_NETWORK",
  "CONNECTED",
  "ERROR",
] as const;

export type WalletSessionState = (typeof WALLET_SESSION_STATES)[number];
export type WalletIdentityState = WalletSessionState;
export type WalletSessionIntent = "INACTIVE" | "CONNECTING" | "ACTIVE";
export type WalletConnectPhase =
  | "STARTING"
  | "SYNCING_PROVIDER"
  | "WAITING_FOR_ACCOUNT_SELECTION"
  | "VERIFYING_ACCOUNT"
  | "VERIFYING_NETWORK"
  | "VERIFYING_RUNTIME";

export const WALLET_SESSION_REASONS = [
  "SDK_INITIALIZING",
  "FINANCIAL_WALLET_NOT_LINKED",
  "NO_ACTIVE_SESSION",
  "USER_DISCONNECTED",
  "ACCOUNT_CHANGED",
  "PROVIDER_DISCONNECTED",
  "ACCOUNT_SELECTION_REQUIRED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "CONNECT_CANCELLED",
  "CONNECT_TIMEOUT",
  "WRONG_NETWORK",
  "DYNAMIC_WALLET_UNAVAILABLE",
  "DYNAMIC_PRIMARY_MISMATCH",
  "WAGMI_ACCOUNT_MISMATCH",
  "WALLETCLIENT_ACCOUNT_MISMATCH",
  "WALLETCLIENT_NETWORK_MISMATCH",
  "SESSION_RESTORE_INVALID",
  "CONNECTED",
] as const;

export type WalletSessionReason = (typeof WALLET_SESSION_REASONS)[number];
export type WalletIdentityReason = WalletSessionReason;

export type WalletSessionRecoveryAction =
  | "LINK_WALLET"
  | "CONNECT_VERIFIED_WALLET"
  | "SWITCH_TO_SEPOLIA"
  | "RETRY_PROVIDER"
  | "NONE";
export type WalletIdentityRecoveryAction = WalletSessionRecoveryAction;

export type WalletIdentityCommandResult =
  | { ok: true; state: WalletSessionState }
  | { ok: false; state: WalletSessionState; reason: string };

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

export type ProviderObservation = {
  revision: number;
  available: boolean;
  connected: boolean;
  accountKnown: boolean;
  activeAccount: Address | null;
  chainId: number | null;
};

export type WalletRuntimeObservation = {
  dynamicPrimaryWallet: Address | null;
  dynamicLinkedWallets: readonly DynamicWalletDescriptor[];
  dynamicWalletObjectForVerifiedAddress: DynamicWalletDescriptor | null;
  wagmiAccount: Address | null;
  walletClientAccount: Address | null;
  walletClientId: string | null;
  walletClientChainId: number | null;
};

export type WalletSessionControl = {
  intent: WalletSessionIntent;
  status: WalletSessionState;
  reason: WalletSessionReason;
  epoch: number;
  providerRevision: number | null;
  connectOrigin: "USER" | "RESTORE" | null;
  connectAttemptId: string | null;
  connectStartedAt: number | null;
  connectPhase: WalletConnectPhase | null;
};

export type WalletSessionEvent =
  | { type: "SDK_READY"; reason?: WalletSessionReason }
  | { type: "RESTORE_STARTED"; attemptId: string; startedAt: number; epoch: number }
  | { type: "CONNECT_STARTED"; attemptId: string; startedAt: number; epoch: number }
  | { type: "CONNECT_PHASE"; attemptId: string; phase: WalletConnectPhase; reason?: WalletSessionReason }
  | { type: "CONNECTED"; attemptId: string | null; providerRevision: number; epoch?: number }
  | { type: "WRONG_NETWORK"; attemptId: string | null; providerRevision: number; epoch?: number }
  | { type: "INVALIDATE"; reason: WalletSessionReason; epoch: number }
  | { type: "CONNECT_FAILED"; reason: WalletSessionReason; attemptId: string; epoch: number };

export type WalletSessionInputs = {
  initialized: boolean;
  verifiedFinancialWallet: Address | null;
  control: WalletSessionControl;
  provider: ProviderObservation;
  runtime: WalletRuntimeObservation;
  networkHealth: WalletRpcHealth;
};

export type WalletSessionSnapshot = {
  state: WalletSessionState;
  status: WalletSessionState;
  intent: WalletSessionIntent;
  reason: WalletSessionReason;
  revision: number;
  epoch: number;
  connectAttemptId: string | null;
  connectStartedAt: number | null;
  connectPhase: WalletConnectPhase | null;
  verifiedAddress: Address | null;
  address: Address | null;
  connectedAddress: Address | null;
  chainId: number | null;
  providerObservation: ProviderObservation;
  dynamicPrimaryAddress: Address | null;
  dynamicLinkedWallets: readonly DynamicWalletDescriptor[];
  dynamicWalletObjectForVerifiedAddress: DynamicWalletDescriptor | null;
  providerActiveAccount: Address | null;
  providerAccountKnown: boolean;
  providerConnected: boolean;
  wagmiAccount: Address | null;
  walletClientAccount: Address | null;
  walletClientChainId: number | null;
  networkHealth: WalletRpcHealth;
  runtimeAligned: boolean;
  canUseFinancialActions: boolean;
  recoveryAction: WalletSessionRecoveryAction;
  recoveryMessage: string;
  technicalDetail?: string;
};

export type WalletIdentitySnapshot = WalletSessionSnapshot;

export function initialWalletSessionControl(): WalletSessionControl {
  return {
    intent: "INACTIVE",
    status: "BOOTSTRAPPING",
    reason: "SDK_INITIALIZING",
    epoch: 0,
    providerRevision: null,
    connectOrigin: null,
    connectAttemptId: null,
    connectStartedAt: null,
    connectPhase: null,
  };
}

function isCurrentAttempt(state: WalletSessionControl, attemptId: string | null): boolean {
  return attemptId === null || state.connectAttemptId === attemptId;
}

export function walletSessionReducer(state: WalletSessionControl, event: WalletSessionEvent): WalletSessionControl {
  switch (event.type) {
    case "SDK_READY":
      return state.status === "BOOTSTRAPPING"
        ? { ...state, status: "DISCONNECTED", reason: event.reason ?? "NO_ACTIVE_SESSION" }
        : state;
    case "RESTORE_STARTED":
    case "CONNECT_STARTED":
      return {
        intent: "CONNECTING",
        status: "CONNECTING",
        reason: "NO_ACTIVE_SESSION",
        epoch: event.epoch,
        providerRevision: null,
        connectOrigin: event.type === "RESTORE_STARTED" ? "RESTORE" : "USER",
        connectAttemptId: event.attemptId,
        connectStartedAt: event.startedAt,
        connectPhase: "STARTING",
      };
    case "CONNECT_PHASE":
      if (state.connectAttemptId !== event.attemptId || state.intent !== "CONNECTING") return state;
      return {
        ...state,
        status: "CONNECTING",
        reason: event.reason ?? state.reason,
        connectPhase: event.phase,
      };
    case "CONNECTED":
      if (!isCurrentAttempt(state, event.attemptId)) return state;
      return {
        ...state,
        intent: "ACTIVE",
        status: "CONNECTED",
        reason: "CONNECTED",
        epoch: event.epoch ?? state.epoch,
        providerRevision: event.providerRevision,
        connectAttemptId: null,
        connectOrigin: null,
        connectStartedAt: null,
        connectPhase: null,
      };
    case "WRONG_NETWORK":
      if (!isCurrentAttempt(state, event.attemptId)) return state;
      return {
        ...state,
        intent: "ACTIVE",
        status: "WRONG_NETWORK",
        reason: "WRONG_NETWORK",
        epoch: event.epoch ?? state.epoch,
        providerRevision: event.providerRevision,
        connectAttemptId: null,
        connectOrigin: null,
        connectStartedAt: null,
        connectPhase: null,
      };
    case "INVALIDATE":
      return {
        intent: "INACTIVE",
        status: "DISCONNECTED",
        reason: event.reason,
        epoch: event.epoch,
        providerRevision: null,
        connectAttemptId: null,
        connectOrigin: null,
        connectStartedAt: null,
        connectPhase: null,
      };
    case "CONNECT_FAILED":
      if (state.connectAttemptId !== event.attemptId) return state;
      return {
        intent: "INACTIVE",
        status:
          event.reason === "ACCOUNT_SELECTION_REQUIRED" || event.reason === "CONNECT_CANCELLED"
            ? "DISCONNECTED"
            : "ERROR",
        reason: event.reason,
        epoch: event.epoch,
        providerRevision: null,
        connectAttemptId: null,
        connectOrigin: null,
        connectStartedAt: null,
        connectPhase: null,
      };
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

function normalizeDescriptor(wallet: DynamicWalletDescriptor | null): DynamicWalletDescriptor | null {
  if (!wallet) return null;
  const address = normalizeWalletAddress(wallet.address);
  return address ? { id: wallet.id, address } : null;
}

function runtimeAlignment(
  verifiedAddress: Address | null,
  providerAccount: Address | null,
  providerChainId: number | null,
  runtime: WalletRuntimeObservation,
): { aligned: boolean; reason: WalletSessionReason | null } {
  if (!verifiedAddress || !providerAccount || !walletsMatch(verifiedAddress, providerAccount)) {
    return { aligned: false, reason: "ACCOUNT_CHANGED" };
  }
  if (!runtime.dynamicWalletObjectForVerifiedAddress) return { aligned: false, reason: "DYNAMIC_WALLET_UNAVAILABLE" };
  if (!walletsMatch(runtime.dynamicPrimaryWallet, verifiedAddress)) {
    return { aligned: false, reason: "DYNAMIC_PRIMARY_MISMATCH" };
  }
  if (!walletsMatch(runtime.wagmiAccount, verifiedAddress)) return { aligned: false, reason: "WAGMI_ACCOUNT_MISMATCH" };
  if (!walletsMatch(runtime.walletClientAccount, verifiedAddress)) {
    return { aligned: false, reason: "WALLETCLIENT_ACCOUNT_MISMATCH" };
  }
  if (runtime.walletClientChainId !== providerChainId) {
    return { aligned: false, reason: "WALLETCLIENT_NETWORK_MISMATCH" };
  }
  return { aligned: true, reason: null };
}

function recoveryFor(
  status: WalletSessionState,
  reason: WalletSessionReason,
  verifiedAddress: Address | null,
): { action: WalletSessionRecoveryAction; message: string } {
  if (!verifiedAddress) return { action: "LINK_WALLET", message: "Link your financial wallet to continue." };
  if (status === "WRONG_NETWORK") {
    return { action: "SWITCH_TO_SEPOLIA", message: "Switch to Ethereum Sepolia to continue." };
  }
  if (status === "CONNECTING") {
    return {
      action: "NONE",
      message:
        reason === "ACCOUNT_SELECTION_REQUIRED"
          ? "Select your verified account in Rabby or MetaMask."
          : "Connecting your verified financial wallet…",
    };
  }
  if (status === "ERROR") {
    return { action: "RETRY_PROVIDER", message: "Your wallet connection could not be completed." };
  }
  if (status === "DISCONNECTED") {
    return {
      action: "CONNECT_VERIFIED_WALLET",
      message:
        reason === "ACCOUNT_CHANGED"
          ? "Your wallet account changed. Reconnect your verified wallet to continue."
          : "Connect your verified financial wallet to continue.",
    };
  }
  return { action: "NONE", message: "" };
}

export function deriveWalletSession(inputs: WalletSessionInputs): WalletSessionSnapshot {
  const verifiedAddress = normalizeWalletAddress(inputs.verifiedFinancialWallet);
  const providerAccount = normalizeWalletAddress(inputs.provider.activeAccount);
  const dynamicPrimaryAddress = normalizeWalletAddress(inputs.runtime.dynamicPrimaryWallet);
  const wagmiAccount = normalizeWalletAddress(inputs.runtime.wagmiAccount);
  const walletClientAccount = normalizeWalletAddress(inputs.runtime.walletClientAccount);
  const dynamicWalletObjectForVerifiedAddress = normalizeDescriptor(
    inputs.runtime.dynamicWalletObjectForVerifiedAddress,
  );
  const dynamicLinkedWallets = inputs.runtime.dynamicLinkedWallets
    .map(normalizeDescriptor)
    .filter((wallet): wallet is DynamicWalletDescriptor => wallet !== null);

  let status = inputs.control.status;
  let reason = inputs.control.reason;

  if (!inputs.initialized) {
    status = "BOOTSTRAPPING";
    reason = "SDK_INITIALIZING";
  } else if (!verifiedAddress) {
    status = "DISCONNECTED";
    reason = "FINANCIAL_WALLET_NOT_LINKED";
  } else if (inputs.control.intent === "INACTIVE") {
    status = inputs.control.status === "ERROR" ? "ERROR" : "DISCONNECTED";
  } else if (inputs.control.intent === "ACTIVE") {
    if (inputs.control.providerRevision !== inputs.provider.revision) {
      status = "DISCONNECTED";
      reason = "ACCOUNT_CHANGED";
    } else if (!inputs.provider.accountKnown || !inputs.provider.connected || !providerAccount) {
      status = "DISCONNECTED";
      reason = "PROVIDER_DISCONNECTED";
    } else if (!walletsMatch(providerAccount, verifiedAddress)) {
      status = "DISCONNECTED";
      reason = "ACCOUNT_CHANGED";
    } else if (inputs.provider.chainId !== LEOPOLD_CHAIN_ID) {
      status = "WRONG_NETWORK";
      reason = "WRONG_NETWORK";
    } else {
      const alignment = runtimeAlignment(verifiedAddress, providerAccount, inputs.provider.chainId, inputs.runtime);
      if (!alignment.aligned) {
        status = "ERROR";
        reason = alignment.reason ?? "WALLETCLIENT_ACCOUNT_MISMATCH";
      } else {
        status = "CONNECTED";
        reason = "CONNECTED";
      }
    }
  }

  const alignment = runtimeAlignment(verifiedAddress, providerAccount, inputs.provider.chainId, {
    ...inputs.runtime,
    dynamicPrimaryWallet: dynamicPrimaryAddress,
    dynamicLinkedWallets,
    dynamicWalletObjectForVerifiedAddress,
    wagmiAccount,
    walletClientAccount,
  });
  const runtimeAligned = alignment.aligned && inputs.provider.chainId === LEOPOLD_CHAIN_ID;
  const recovery = recoveryFor(status, reason, verifiedAddress);
  const sessionAddress = status === "CONNECTED" || status === "WRONG_NETWORK" ? verifiedAddress : null;
  const technicalDetail =
    status === "ERROR" || reason === "ACCOUNT_CHANGED" || reason === "PROVIDER_DISCONNECTED"
      ? `WALLET_SESSION:${reason}`
      : undefined;

  return {
    state: status,
    status,
    intent: inputs.control.intent,
    reason,
    revision: inputs.control.epoch,
    epoch: inputs.control.epoch,
    connectAttemptId: inputs.control.connectAttemptId,
    connectStartedAt: inputs.control.connectStartedAt,
    connectPhase: inputs.control.connectPhase,
    verifiedAddress,
    address: sessionAddress,
    connectedAddress: sessionAddress,
    chainId: inputs.provider.chainId,
    providerObservation: {
      ...inputs.provider,
      activeAccount: providerAccount,
    },
    dynamicPrimaryAddress,
    dynamicLinkedWallets,
    dynamicWalletObjectForVerifiedAddress,
    providerActiveAccount: providerAccount,
    providerAccountKnown: inputs.provider.accountKnown,
    providerConnected: inputs.provider.connected,
    wagmiAccount,
    walletClientAccount,
    walletClientChainId: inputs.runtime.walletClientChainId,
    networkHealth: inputs.networkHealth,
    runtimeAligned,
    canUseFinancialActions: status === "CONNECTED" && runtimeAligned && inputs.networkHealth.state === "HEALTHY",
    recoveryAction: recovery.action,
    recoveryMessage: recovery.message,
    technicalDetail,
  };
}

export function walletSessionIdentityKey(inputs: Omit<WalletSessionInputs, "networkHealth">): string {
  return [
    inputs.initialized,
    inputs.verifiedFinancialWallet,
    inputs.control.intent,
    inputs.control.status,
    inputs.control.epoch,
    inputs.control.providerRevision,
    inputs.provider.revision,
    inputs.provider.accountKnown,
    inputs.provider.connected,
    inputs.provider.activeAccount,
    inputs.provider.chainId,
    inputs.runtime.dynamicPrimaryWallet,
    inputs.runtime.dynamicWalletObjectForVerifiedAddress?.id,
    inputs.runtime.wagmiAccount,
    inputs.runtime.walletClientAccount,
    inputs.runtime.walletClientId,
    inputs.runtime.walletClientChainId,
  ]
    .map((value) => value ?? "")
    .join("|");
}

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function persistActiveWalletSession(storage: SessionStorageLike, address: Address): void {
  storage.setItem(
    WALLET_SESSION_STORAGE_KEY,
    JSON.stringify({ version: 1, intent: "ACTIVE", address: normalizeWalletAddress(address) }),
  );
}

export function clearPersistedWalletSession(storage: SessionStorageLike): void {
  storage.removeItem(WALLET_SESSION_STORAGE_KEY);
}

export function readPersistedWalletSession(storage: SessionStorageLike): Address | null {
  try {
    const raw = storage.getItem(WALLET_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; intent?: unknown; address?: unknown };
    if (parsed.version !== 1 || parsed.intent !== "ACTIVE" || typeof parsed.address !== "string") return null;
    return normalizeWalletAddress(parsed.address);
  } catch {
    return null;
  }
}

export async function withWalletSessionTimeout<T>(
  operation: Promise<T>,
  timeoutMs = WALLET_SESSION_TIMEOUT_MS,
  reason = "WALLET_SESSION_TIMEOUT",
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(reason)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export function walletSessionRuntimeAligned(snapshot: WalletSessionSnapshot): boolean {
  return (
    snapshot.status === "CONNECTED" &&
    snapshot.runtimeAligned &&
    walletsMatch(snapshot.address, snapshot.verifiedAddress) &&
    snapshot.chainId === LEOPOLD_CHAIN_ID
  );
}
