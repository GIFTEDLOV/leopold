"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useAuth } from "./auth-provider";
import {
  canProbeWalletIdentity,
  createCheckingWalletRpcHealth,
  createNotCheckedWalletRpcHealth,
  deriveWalletIdentity,
  identityInputKey,
  WalletIdentityController,
  type WalletIdentityCommandResult,
  type WalletIdentityInputs,
  type WalletIdentitySnapshot,
  type WalletRpcHealth,
} from "@/lib/auth/wallet-identity";
import { runFinancialNetworkPreflight, type FinancialNetworkHealth, type RpcRequester } from "@/lib/leopold/network";
import { normalizeNetworkChainId } from "@/lib/leopold/network";
import { normalizeWalletAddress } from "@/lib/auth/readiness";

type WalletIdentityContextValue = {
  identity: WalletIdentitySnapshot;
  refreshWalletIdentity(): Promise<WalletIdentitySnapshot>;
  reconnectVerifiedWallet(): Promise<WalletIdentityCommandResult>;
  switchToVerifiedWallet(): Promise<WalletIdentityCommandResult>;
  switchToSepolia(): Promise<WalletIdentityCommandResult>;
};

const WalletIdentityContext = createContext<WalletIdentityContextValue | null>(null);

function requester(client: unknown): RpcRequester | null {
  if (!client || typeof client !== "object" || !("request" in client)) return null;
  const rawRequest = (client as { request: (...args: never[]) => Promise<unknown> }).request;
  return { request: (args) => rawRequest(args as never) };
}

function walletRpcHealthFromPreflight(result: FinancialNetworkHealth): WalletRpcHealth {
  const state: WalletRpcHealth["state"] =
    result.state === "HEALTHY" ||
    result.state === "APP_RPC_UNAVAILABLE" ||
    result.state === "WALLET_RPC_UNAVAILABLE" ||
    result.state === "UNKNOWN"
      ? result.state
      : "NOT_CHECKED";
  return {
    state,
    checkedAt: result.checkedAt,
    dynamicWalletChainId: result.dynamicWalletChainId,
    walletClientChainId: result.walletClientChainId,
    appChainId: result.appChainId,
    technicalDetail: result.technicalDetail,
  };
}

function commandFailure(identity: WalletIdentitySnapshot, reason: string): WalletIdentityCommandResult {
  return { ok: false, state: identity.state, reason };
}

export function WalletIdentityProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const account = useAccount();
  const publicClient = usePublicClient({ chainId: 11_155_111 });
  const walletClient = useWalletClient({ chainId: 11_155_111 });
  const controllerRef = useRef(new WalletIdentityController());
  const [revision, setRevision] = useState(0);
  const [healthRecord, setHealthRecord] = useState<{ key: string; health: WalletRpcHealth } | null>(null);

  const walletClientRecord = walletClient.data as unknown as
    | { account?: string | { address?: string }; chain?: { id?: number }; uid?: string }
    | undefined;
  const walletClientAddress =
    typeof walletClientRecord?.account === "string"
      ? walletClientRecord.account
      : (walletClientRecord?.account?.address ?? null);
  const walletClientAccount = normalizeWalletAddress(walletClientAddress);
  const walletClientChainId = normalizeNetworkChainId(walletClientRecord?.chain?.id);
  const walletClientId = walletClientRecord?.uid ?? null;

  const baseInputs = useMemo<Omit<WalletIdentityInputs, "networkHealth" | "revision">>(
    () => ({
      initialized: auth.clientReady,
      verifiedFinancialWallet: auth.financialWallet,
      dynamicPrimaryWallet: auth.dynamicPrimaryWallet,
      dynamicLinkedWallets: auth.dynamicLinkedWallets,
      dynamicWalletObjectForVerifiedAddress: auth.dynamicWalletObjectForVerifiedAddress,
      providerActiveAccount: auth.providerActiveAccount,
      providerAccountKnown: auth.fixture ? true : auth.providerAccountKnown,
      providerConnected: auth.fixture ? Boolean(auth.connectedWallet) : auth.providerConnected,
      wagmiAccount: auth.fixture ? auth.connectedWallet : (account.address ?? null),
      walletClientAccount: auth.fixture ? auth.connectedWallet : walletClientAccount,
      walletClientId: auth.fixture ? "fixture-wallet-client" : walletClientId,
      chainId: auth.fixture ? (auth.connectedWallet ? 11_155_111 : null) : auth.activeNetworkId,
      walletClientChainId: auth.fixture ? (auth.connectedWallet ? 11_155_111 : null) : walletClientChainId,
    }),
    [
      account.address,
      auth.activeNetworkId,
      auth.clientReady,
      auth.connectedWallet,
      auth.dynamicLinkedWallets,
      auth.dynamicPrimaryWallet,
      auth.dynamicWalletObjectForVerifiedAddress,
      auth.financialWallet,
      auth.fixture,
      auth.providerActiveAccount,
      auth.providerAccountKnown,
      auth.providerConnected,
      walletClientAccount,
      walletClientChainId,
      walletClientId,
    ],
  );
  const baseKey = identityInputKey(baseInputs);
  const probeEligible = canProbeWalletIdentity({
    ...baseInputs,
    networkHealth: createNotCheckedWalletRpcHealth(),
    revision,
  });
  const effectiveHealth = useMemo(() => {
    if (healthRecord?.key === baseKey) return healthRecord.health;
    return probeEligible ? createCheckingWalletRpcHealth() : createNotCheckedWalletRpcHealth();
  }, [baseKey, healthRecord, probeEligible]);

  const evaluateWalletIdentity = useCallback(async (): Promise<WalletIdentitySnapshot> => {
    const revision = controllerRef.current.beginRevision();
    setRevision(revision);
    const activeAccount = await auth.refreshConnectedWallet();
    const chainId = await auth.refreshActiveNetwork().catch(() => auth.activeNetworkId);
    const inputs: WalletIdentityInputs = {
      ...baseInputs,
      providerActiveAccount: activeAccount,
      providerConnected: Boolean(activeAccount),
      chainId,
      revision,
      networkHealth: createNotCheckedWalletRpcHealth(),
    };
    const key = identityInputKey(inputs);
    if (!canProbeWalletIdentity(inputs)) {
      const health = createNotCheckedWalletRpcHealth();
      if (controllerRef.current.isCurrent(revision)) setHealthRecord({ key, health });
      return deriveWalletIdentity({ ...inputs, networkHealth: health });
    }

    if (auth.fixture) {
      const health: WalletRpcHealth = {
        state: "HEALTHY",
        checkedAt: Date.now(),
        dynamicWalletChainId: inputs.chainId,
        walletClientChainId: inputs.walletClientChainId,
        appChainId: 11_155_111,
      };
      if (controllerRef.current.isCurrent(revision)) setHealthRecord({ key, health });
      return deriveWalletIdentity({ ...inputs, networkHealth: health });
    }

    const checking = createCheckingWalletRpcHealth();
    if (controllerRef.current.isCurrent(revision)) setHealthRecord({ key, health: checking });
    const result = await runFinancialNetworkPreflight({
      activeAccount,
      financialWallet: inputs.verifiedFinancialWallet,
      connectedWallet: activeAccount,
      activeWallet: inputs.dynamicPrimaryWallet,
      walletClientAccount: inputs.walletClientAccount,
      walletClient: requester(walletClient.data),
      publicClient: requester(publicClient),
      dynamicWalletChainId: chainId,
    });
    const health = walletRpcHealthFromPreflight(result);
    if (!controllerRef.current.isCurrent(revision)) {
      return deriveWalletIdentity({ ...inputs, networkHealth: checking });
    }
    setHealthRecord({ key, health });
    return deriveWalletIdentity({ ...inputs, networkHealth: health });
  }, [auth, baseInputs, publicClient, walletClient.data]);

  useEffect(() => {
    if (!auth.clientReady) return;
    const timeout = window.setTimeout(() => {
      void evaluateWalletIdentity();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [auth.clientReady, baseKey, evaluateWalletIdentity]);

  const identityInputs: WalletIdentityInputs = {
    ...baseInputs,
    networkHealth: effectiveHealth,
    revision,
  };
  const identity = deriveWalletIdentity(identityInputs);

  const refreshWalletIdentity = useCallback(async () => evaluateWalletIdentity(), [evaluateWalletIdentity]);

  const runCommand = useCallback(
    async (command: () => Promise<void>): Promise<WalletIdentityCommandResult> => {
      try {
        await command();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const next = await refreshWalletIdentity();
        return commandFailure(next, reason || "USER_CANCELLED");
      }
      const next = await refreshWalletIdentity();
      return next.state === "READY" ? { ok: true, state: next.state } : commandFailure(next, next.reason);
    },
    [refreshWalletIdentity],
  );

  const value = useMemo<WalletIdentityContextValue>(
    () => ({
      identity,
      refreshWalletIdentity,
      reconnectVerifiedWallet: () =>
        identity.state === "DISCONNECTED"
          ? runCommand(auth.reconnectFinancialWallet)
          : Promise.resolve(commandFailure(identity, "RECONNECT_NOT_REQUIRED")),
      switchToVerifiedWallet: () =>
        identity.state === "WALLET_MISMATCH" || identity.recoveryAction === "SWITCH_TO_VERIFIED_WALLET"
          ? runCommand(auth.reconnectFinancialWallet)
          : Promise.resolve(commandFailure(identity, "SWITCH_NOT_REQUIRED")),
      switchToSepolia: () =>
        identity.state === "WRONG_NETWORK"
          ? runCommand(auth.switchFinancialWalletToSepolia)
          : Promise.resolve(commandFailure(identity, "NETWORK_SWITCH_NOT_REQUIRED")),
    }),
    [auth.reconnectFinancialWallet, auth.switchFinancialWalletToSepolia, identity, refreshWalletIdentity, runCommand],
  );

  return <WalletIdentityContext.Provider value={value}>{children}</WalletIdentityContext.Provider>;
}

export function useWalletIdentity(): WalletIdentityContextValue {
  const value = useContext(WalletIdentityContext);
  if (!value) throw new Error("WalletIdentityProvider is missing");
  return value;
}
