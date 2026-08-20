"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useAuth } from "./auth-provider";
import {
  LEOPOLD_CHAIN_ID,
  WALLET_SESSION_TIMEOUT_MS,
  clearPersistedWalletSession,
  createCheckingWalletRpcHealth,
  createNotCheckedWalletRpcHealth,
  deriveWalletSession,
  initialWalletSessionControl,
  persistActiveWalletSession,
  readPersistedWalletSession,
  walletSessionIdentityKey,
  walletSessionReducer,
  walletSessionRuntimeAligned,
  type ProviderObservation,
  type WalletIdentityCommandResult,
  type WalletRpcHealth,
  type WalletRuntimeObservation,
  type WalletSessionSnapshot,
} from "@/lib/auth/wallet-identity";
import { runFinancialNetworkPreflight, type FinancialNetworkHealth, type RpcRequester } from "@/lib/leopold/network";
import { normalizeNetworkChainId } from "@/lib/leopold/network";
import { normalizeWalletAddress, walletsMatch } from "@/lib/auth/readiness";
import { deriveLeopoldRecovery, type LeopoldRecovery } from "@/lib/auth/recovery";

export type WalletSessionControllerValue = {
  /** Compatibility name for existing business code; this is the explicit Leopold session snapshot. */
  identity: WalletSessionSnapshot;
  walletSession: WalletSessionSnapshot;
  providerObservation: ProviderObservation;
  networkHealth: WalletRpcHealth;
  recovery: LeopoldRecovery;
  connectVerifiedWallet(): Promise<WalletIdentityCommandResult>;
  disconnectLeopoldWallet(): void;
  switchToSepolia(): Promise<WalletIdentityCommandResult>;
  retryNetworkHealth(): Promise<WalletRpcHealth>;
  requireConnectedFinancialSession(): Promise<WalletSessionSnapshot>;
};

const WalletIdentityContext = createContext<WalletSessionControllerValue | null>(null);

function requester(client: unknown): RpcRequester | null {
  if (!client || typeof client !== "object" || !("request" in client)) return null;
  const rawRequest = (client as { request: (...args: never[]) => Promise<unknown> }).request;
  return { request: (args) => rawRequest(args as never) };
}

function healthFromPreflight(result: FinancialNetworkHealth): WalletRpcHealth {
  const state: WalletRpcHealth["state"] =
    result.state === "HEALTHY" ||
    result.state === "APP_RPC_UNAVAILABLE" ||
    result.state === "WALLET_RPC_UNAVAILABLE" ||
    result.state === "UNKNOWN"
      ? result.state
      : "UNKNOWN";
  return {
    state,
    checkedAt: result.checkedAt,
    dynamicWalletChainId: result.dynamicWalletChainId,
    walletClientChainId: result.walletClientChainId,
    appChainId: result.appChainId,
    technicalDetail: result.technicalDetail,
  };
}

function sessionStorageOrNull(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function commandFailure(snapshot: WalletSessionSnapshot, reason: string): WalletIdentityCommandResult {
  return { ok: false, state: snapshot.status, reason };
}

export function WalletIdentityProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const wagmiAccount = useAccount();
  const publicClient = usePublicClient({ chainId: LEOPOLD_CHAIN_ID });
  const walletClient = useWalletClient({ chainId: LEOPOLD_CHAIN_ID });
  const [control, dispatch] = useReducer(walletSessionReducer, undefined, initialWalletSessionControl);
  const controlRef = useRef(control);
  const sessionEpochRef = useRef(0);
  const sessionAuthorizedRef = useRef(false);
  const activeAttemptRef = useRef<{ attemptId: string; epoch: number } | null>(null);
  const bootstrapKeyRef = useRef<string | null>(null);
  const continuationRef = useRef<string | null>(null);
  const [healthRecord, setHealthRecord] = useState<{ key: string; health: WalletRpcHealth } | null>(null);
  const [healthInFlightKey, setHealthInFlightKey] = useState<string | null>(null);

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  const walletClientRecord = walletClient.data as unknown as
    | { account?: string | { address?: string }; chain?: { id?: number }; uid?: string }
    | undefined;
  const walletClientAddress =
    typeof walletClientRecord?.account === "string"
      ? walletClientRecord.account
      : (walletClientRecord?.account?.address ?? null);

  const providerObservation = useMemo<ProviderObservation>(
    () => ({
      revision: auth.providerAccountRevision,
      available: auth.providerAvailable,
      connected: auth.providerConnected,
      accountKnown: auth.fixture ? true : auth.providerAccountKnown,
      activeAccount: auth.providerActiveAccount,
      chainId: auth.fixture && auth.connectedWallet ? LEOPOLD_CHAIN_ID : auth.activeNetworkId,
    }),
    [
      auth.activeNetworkId,
      auth.connectedWallet,
      auth.fixture,
      auth.providerAccountKnown,
      auth.providerAccountRevision,
      auth.providerActiveAccount,
      auth.providerAvailable,
      auth.providerConnected,
    ],
  );

  const runtimeObservation = useMemo<WalletRuntimeObservation>(
    () => ({
      dynamicPrimaryWallet: auth.dynamicPrimaryWallet,
      dynamicLinkedWallets: auth.dynamicLinkedWallets,
      dynamicWalletObjectForVerifiedAddress: auth.dynamicWalletObjectForVerifiedAddress,
      wagmiAccount: auth.fixture ? auth.connectedWallet : (wagmiAccount.address ?? null),
      walletClientAccount: auth.fixture ? auth.connectedWallet : normalizeWalletAddress(walletClientAddress),
      walletClientId: auth.fixture ? "fixture-wallet-client" : (walletClientRecord?.uid ?? null),
      walletClientChainId:
        auth.fixture && auth.connectedWallet
          ? LEOPOLD_CHAIN_ID
          : normalizeNetworkChainId(walletClientRecord?.chain?.id),
    }),
    [
      auth.connectedWallet,
      auth.dynamicLinkedWallets,
      auth.dynamicPrimaryWallet,
      auth.dynamicWalletObjectForVerifiedAddress,
      auth.fixture,
      wagmiAccount.address,
      walletClientAddress,
      walletClientRecord?.chain?.id,
      walletClientRecord?.uid,
    ],
  );
  const runtimeRef = useRef(runtimeObservation);
  const providerRef = useRef(providerObservation);
  useEffect(() => {
    runtimeRef.current = runtimeObservation;
    providerRef.current = providerObservation;
  }, [providerObservation, runtimeObservation]);

  const identityWithoutHealth = useMemo(
    () => ({
      initialized:
        auth.clientReady &&
        auth.accountStatus === "SIGNED_IN_READY" &&
        auth.financialWalletMetadata.status !== "LOADING",
      verifiedFinancialWallet: auth.financialWallet,
      control,
      provider: providerObservation,
      runtime: runtimeObservation,
    }),
    [
      auth.accountStatus,
      auth.clientReady,
      auth.financialWallet,
      auth.financialWalletMetadata.status,
      control,
      providerObservation,
      runtimeObservation,
    ],
  );
  const identityKey = walletSessionIdentityKey(identityWithoutHealth);
  const effectiveHealth = useMemo<WalletRpcHealth>(() => {
    if (healthRecord?.key === identityKey) return healthRecord.health;
    if (healthInFlightKey === identityKey) return createCheckingWalletRpcHealth();
    return createNotCheckedWalletRpcHealth();
  }, [healthInFlightKey, healthRecord, identityKey]);
  const walletSession = deriveWalletSession({ ...identityWithoutHealth, networkHealth: effectiveHealth });
  const recovery = useMemo(
    () =>
      deriveLeopoldRecovery({
        accountStatus: auth.accountStatus,
        financialMetadataStatus: auth.financialWalletMetadata.status,
        walletSessionStatus: walletSession.status,
        walletSessionReason: walletSession.reason,
        networkHealth: effectiveHealth.state,
        canConfirmFinancialWallet: auth.canConfirmCurrentWalletAsFinancial,
        financialWalletIntegrity: auth.integrityPolicy.financialWallet,
      }),
    [
      auth.accountStatus,
      auth.canConfirmCurrentWalletAsFinancial,
      auth.financialWalletMetadata.status,
      auth.integrityPolicy.financialWallet,
      effectiveHealth.state,
      walletSession.reason,
      walletSession.status,
    ],
  );
  const walletSessionRef = useRef(walletSession);
  useEffect(() => {
    walletSessionRef.current = walletSession;
  }, [walletSession]);

  const clearSessionMarker = useCallback(() => {
    const storage = sessionStorageOrNull();
    if (storage) clearPersistedWalletSession(storage);
  }, []);

  const persistSessionMarker = useCallback((address: `0x${string}`) => {
    const storage = sessionStorageOrNull();
    if (storage) persistActiveWalletSession(storage, address);
  }, []);

  const invalidateSession = useCallback(
    (reason: WalletSessionSnapshot["reason"]) => {
      const epoch = ++sessionEpochRef.current;
      sessionAuthorizedRef.current = false;
      activeAttemptRef.current = null;
      continuationRef.current = null;
      clearSessionMarker();
      setHealthRecord(null);
      setHealthInFlightKey(null);
      dispatch({ type: "INVALIDATE", reason, epoch });
    },
    [clearSessionMarker],
  );

  const completeAttemptFromObservations = useCallback(
    (attemptId: string, epoch: number, account: `0x${string}`, chainId: number | null, providerRevision: number) => {
      if (
        sessionEpochRef.current !== epoch ||
        activeAttemptRef.current?.attemptId !== attemptId ||
        activeAttemptRef.current.epoch !== epoch
      ) {
        return false;
      }
      if (!walletsMatch(account, auth.financialWallet)) {
        dispatch({
          type: "CONNECT_PHASE",
          attemptId,
          phase: "WAITING_FOR_ACCOUNT_SELECTION",
          reason: "ACCOUNT_SELECTION_REQUIRED",
        });
        return false;
      }
      if (chainId !== LEOPOLD_CHAIN_ID) {
        persistSessionMarker(account);
        sessionAuthorizedRef.current = false;
        activeAttemptRef.current = null;
        dispatch({ type: "WRONG_NETWORK", attemptId, providerRevision, epoch });
        return true;
      }
      dispatch({ type: "CONNECT_PHASE", attemptId, phase: "VERIFYING_RUNTIME" });
      const probe = deriveWalletSession({
        initialized: auth.clientReady,
        verifiedFinancialWallet: auth.financialWallet,
        control: {
          ...controlRef.current,
          intent: "ACTIVE",
          status: "CONNECTED",
          reason: "CONNECTED",
        },
        provider: { ...providerRef.current, connected: true, accountKnown: true, activeAccount: account, chainId },
        runtime: runtimeRef.current,
        networkHealth: createNotCheckedWalletRpcHealth(),
      });
      if (!probe.runtimeAligned) return false;
      persistSessionMarker(account);
      sessionAuthorizedRef.current = true;
      activeAttemptRef.current = null;
      dispatch({ type: "CONNECTED", attemptId, providerRevision, epoch });
      return true;
    },
    [auth.clientReady, auth.financialWallet, persistSessionMarker],
  );

  const runConnectAttempt = useCallback(
    async (attemptId: string, epoch: number): Promise<WalletIdentityCommandResult> => {
      dispatch({ type: "CONNECT_PHASE", attemptId, phase: "SYNCING_PROVIDER" });
      const result = await auth.connectVerifiedWallet();
      if (
        sessionEpochRef.current !== epoch ||
        activeAttemptRef.current?.attemptId !== attemptId ||
        activeAttemptRef.current.epoch !== epoch
      ) {
        return commandFailure(walletSessionRef.current, "STALE_CONNECT_ATTEMPT");
      }
      if (!result.ok) {
        if (result.reason === "ACCOUNT_SELECTION_REQUIRED") {
          dispatch({
            type: "CONNECT_PHASE",
            attemptId,
            phase: "WAITING_FOR_ACCOUNT_SELECTION",
            reason: "ACCOUNT_SELECTION_REQUIRED",
          });
          return { ok: false, state: "CONNECTING", reason: result.reason };
        }
        const reason =
          result.reason === "USER_CANCELLED"
            ? "CONNECT_CANCELLED"
            : result.reason === "TIMEOUT"
              ? "CONNECT_TIMEOUT"
              : "PROVIDER_UNAVAILABLE";
        clearSessionMarker();
        activeAttemptRef.current = null;
        dispatch({ type: "CONNECT_FAILED", reason, attemptId, epoch });
        return { ok: false, state: reason === "CONNECT_CANCELLED" ? "DISCONNECTED" : "ERROR", reason };
      }
      dispatch({ type: "CONNECT_PHASE", attemptId, phase: "VERIFYING_NETWORK" });
      const completed = completeAttemptFromObservations(
        attemptId,
        epoch,
        result.account,
        result.chainId,
        result.providerRevision,
      );
      return completed
        ? { ok: true, state: result.chainId === LEOPOLD_CHAIN_ID ? "CONNECTED" : "WRONG_NETWORK" }
        : { ok: false, state: "CONNECTING", reason: "VERIFYING_RUNTIME" };
    },
    [auth, clearSessionMarker, completeAttemptFromObservations],
  );

  const connectVerifiedWallet = useCallback(async (): Promise<WalletIdentityCommandResult> => {
    if (auth.accountStatus !== "SIGNED_IN_READY") {
      return commandFailure(walletSessionRef.current, "ACCOUNT_NOT_READY");
    }
    if (!auth.financialWallet) {
      if (auth.accountStatus === "SIGNED_IN_READY" && auth.financialWalletMetadata.status === "NONE") {
        auth.openWalletLink();
      }
      return commandFailure(walletSessionRef.current, "FINANCIAL_WALLET_NOT_LINKED");
    }
    if (controlRef.current.intent === "CONNECTING" && controlRef.current.connectAttemptId) {
      return runConnectAttempt(controlRef.current.connectAttemptId, controlRef.current.epoch);
    }
    const epoch = ++sessionEpochRef.current;
    sessionAuthorizedRef.current = false;
    const attemptId = `connect-${epoch}-${Date.now()}`;
    activeAttemptRef.current = { attemptId, epoch };
    dispatch({ type: "CONNECT_STARTED", attemptId, startedAt: Date.now(), epoch });
    return runConnectAttempt(attemptId, epoch);
  }, [auth, runConnectAttempt]);

  const disconnectLeopoldWallet = useCallback(() => {
    invalidateSession("USER_DISCONNECTED");
  }, [invalidateSession]);

  const runNetworkHealthProbe = useCallback(async (): Promise<WalletRpcHealth> => {
    const snapshot = walletSessionRef.current;
    const key = walletSessionIdentityKey({
      initialized: auth.clientReady,
      verifiedFinancialWallet: auth.financialWallet,
      control: controlRef.current,
      provider: providerRef.current,
      runtime: runtimeRef.current,
    });
    if (!walletSessionRuntimeAligned(snapshot)) {
      const unavailable = createNotCheckedWalletRpcHealth();
      setHealthRecord({ key, health: unavailable });
      return unavailable;
    }
    setHealthInFlightKey(key);
    const result = await runFinancialNetworkPreflight({
      activeAccount: snapshot.address,
      financialWallet: snapshot.verifiedAddress,
      connectedWallet: snapshot.address,
      activeWallet: snapshot.dynamicPrimaryAddress,
      walletClientAccount: snapshot.walletClientAccount,
      walletClient: requester(walletClient.data),
      publicClient: requester(publicClient),
      dynamicWalletChainId: snapshot.chainId,
      timeoutMs: WALLET_SESSION_TIMEOUT_MS,
    });
    const health = healthFromPreflight(result);
    if (
      walletSessionIdentityKey({
        initialized: auth.clientReady,
        verifiedFinancialWallet: auth.financialWallet,
        control: controlRef.current,
        provider: providerRef.current,
        runtime: runtimeRef.current,
      }) === key
    ) {
      setHealthRecord({ key, health });
    }
    setHealthInFlightKey((current) => (current === key ? null : current));
    return health;
  }, [auth.clientReady, auth.financialWallet, publicClient, walletClient.data]);

  const requireConnectedFinancialSession = useCallback(async (): Promise<WalletSessionSnapshot> => {
    const epoch = sessionEpochRef.current;
    const before = walletSessionRef.current;
    if (
      auth.accountStatus !== "SIGNED_IN_READY" ||
      auth.financialWalletMetadata.status !== "PRESENT" ||
      !sessionAuthorizedRef.current ||
      controlRef.current.providerRevision !== auth.getProviderAccountRevision() ||
      before.status !== "CONNECTED" ||
      before.intent !== "ACTIVE"
    ) {
      throw new Error(`WALLET_SESSION:${before.reason}`);
    }
    let activeAccount: `0x${string}` | null;
    let chainId: number | null;
    try {
      [activeAccount, chainId] = await Promise.all([auth.refreshConnectedWallet(), auth.refreshActiveNetwork()]);
    } catch (error) {
      throw new Error("WALLET_SESSION:WALLET_RPC_UNAVAILABLE", { cause: error });
    }
    if (sessionEpochRef.current !== epoch) throw new Error("WALLET_SESSION:STALE_SESSION");
    if (!activeAccount) {
      invalidateSession("PROVIDER_DISCONNECTED");
      throw new Error("WALLET_SESSION:PROVIDER_DISCONNECTED");
    }
    if (!walletsMatch(activeAccount, auth.financialWallet)) {
      invalidateSession("ACCOUNT_CHANGED");
      throw new Error("WALLET_SESSION:ACCOUNT_CHANGED");
    }
    if (chainId !== LEOPOLD_CHAIN_ID) {
      const nextEpoch = ++sessionEpochRef.current;
      sessionAuthorizedRef.current = false;
      dispatch({
        type: "WRONG_NETWORK",
        attemptId: null,
        providerRevision: auth.getProviderAccountRevision(),
        epoch: nextEpoch,
      });
      throw new Error("WALLET_SESSION:WRONG_NETWORK");
    }
    const current = walletSessionRef.current;
    if (!walletsMatch(runtimeRef.current.wagmiAccount, activeAccount)) {
      throw new Error("WALLET_SESSION:WAGMI_ACCOUNT_MISMATCH");
    }
    if (!walletsMatch(runtimeRef.current.walletClientAccount, activeAccount)) {
      throw new Error("WALLET_SESSION:WALLETCLIENT_ACCOUNT_MISMATCH");
    }
    const health = await runNetworkHealthProbe();
    if (health.state !== "HEALTHY") throw new Error(`WALLET_SESSION:${health.state}`);
    return { ...current, networkHealth: health, canUseFinancialActions: true };
  }, [auth, invalidateSession, runNetworkHealthProbe]);

  const switchToSepolia = useCallback(async (): Promise<WalletIdentityCommandResult> => {
    const before = walletSessionRef.current;
    if (before.status !== "WRONG_NETWORK" || before.intent !== "ACTIVE") {
      return commandFailure(before, "NETWORK_SWITCH_NOT_REQUIRED");
    }
    const epoch = ++sessionEpochRef.current;
    try {
      await auth.switchFinancialWalletToSepolia();
      if (sessionEpochRef.current !== epoch) return commandFailure(walletSessionRef.current, "STALE_NETWORK_SWITCH");
      const account = await auth.refreshConnectedWallet();
      const chainId = await auth.refreshActiveNetwork();
      if (!account || !walletsMatch(account, auth.financialWallet)) {
        invalidateSession(account ? "ACCOUNT_CHANGED" : "PROVIDER_DISCONNECTED");
        return commandFailure(walletSessionRef.current, account ? "ACCOUNT_CHANGED" : "PROVIDER_DISCONNECTED");
      }
      if (chainId !== LEOPOLD_CHAIN_ID) return commandFailure(walletSessionRef.current, "WRONG_NETWORK");
      persistSessionMarker(account);
      sessionAuthorizedRef.current = true;
      dispatch({
        type: "CONNECTED",
        attemptId: null,
        providerRevision: auth.getProviderAccountRevision(),
        epoch,
      });
      return { ok: true, state: "CONNECTED" };
    } catch (error) {
      return commandFailure(walletSessionRef.current, error instanceof Error ? error.message : String(error));
    }
  }, [auth, invalidateSession, persistSessionMarker]);

  useEffect(() => {
    if (
      !auth.clientReady ||
      auth.accountStatus === "AUTH_LOADING" ||
      auth.financialWalletMetadata.status === "LOADING"
    ) {
      return;
    }
    const bootstrapKey = `${auth.accountStatus}:${auth.providerUserId ?? "anonymous"}:${auth.financialWalletMetadata.status}:${auth.financialWallet ?? "unlinked"}`;
    if (bootstrapKeyRef.current === bootstrapKey) return;
    bootstrapKeyRef.current = bootstrapKey;
    const epoch = ++sessionEpochRef.current;
    sessionAuthorizedRef.current = false;
    if (auth.accountStatus === "SIGNED_IN_PROFILE_INCOMPLETE") {
      dispatch({ type: "INVALIDATE", reason: "NO_ACTIVE_SESSION", epoch });
      return;
    }
    if (auth.accountStatus === "SIGNED_OUT") {
      clearSessionMarker();
      dispatch({ type: "INVALIDATE", reason: "NO_ACTIVE_SESSION", epoch });
      return;
    }
    if (auth.financialWalletMetadata.status !== "PRESENT" || !auth.financialWallet) {
      clearSessionMarker();
      dispatch({
        type: "INVALIDATE",
        reason: auth.financialWalletMetadata.status === "NONE" ? "FINANCIAL_WALLET_NOT_LINKED" : "NO_ACTIVE_SESSION",
        epoch,
      });
      return;
    }
    if (auth.fixture && auth.connectedWallet) {
      const attemptId = `fixture-${epoch}`;
      sessionAuthorizedRef.current = true;
      dispatch({ type: "RESTORE_STARTED", attemptId, startedAt: Date.now(), epoch });
      dispatch({ type: "CONNECTED", attemptId, providerRevision: auth.getProviderAccountRevision(), epoch });
      return;
    }
    const storage = sessionStorageOrNull();
    const persisted = storage ? readPersistedWalletSession(storage) : null;
    if (!walletsMatch(persisted, auth.financialWallet)) {
      clearSessionMarker();
      dispatch({ type: "INVALIDATE", reason: "NO_ACTIVE_SESSION", epoch });
      return;
    }
    const attemptId = `restore-${epoch}-${Date.now()}`;
    activeAttemptRef.current = { attemptId, epoch };
    dispatch({ type: "RESTORE_STARTED", attemptId, startedAt: Date.now(), epoch });
    void Promise.all([auth.refreshConnectedWallet(), auth.refreshActiveNetwork()]).then(
      ([account, chainId]) => {
        if (sessionEpochRef.current !== epoch) return;
        if (!account || !walletsMatch(account, auth.financialWallet)) {
          invalidateSession(account ? "SESSION_RESTORE_INVALID" : "PROVIDER_DISCONNECTED");
          return;
        }
        completeAttemptFromObservations(attemptId, epoch, account, chainId, auth.getProviderAccountRevision());
      },
      () => {
        if (sessionEpochRef.current === epoch) invalidateSession("PROVIDER_TIMEOUT");
      },
    );
  }, [
    auth,
    auth.accountStatus,
    auth.clientReady,
    auth.connectedWallet,
    auth.financialWallet,
    auth.financialWalletMetadata.status,
    auth.fixture,
    auth.providerUserId,
    auth.refreshActiveNetwork,
    auth.refreshConnectedWallet,
    clearSessionMarker,
    completeAttemptFromObservations,
    invalidateSession,
  ]);

  useEffect(() => {
    if (control.intent !== "CONNECTING" || !control.connectAttemptId || control.connectStartedAt === null) return;
    const remaining = Math.max(0, WALLET_SESSION_TIMEOUT_MS - (Date.now() - control.connectStartedAt));
    const timeout = window.setTimeout(() => {
      if (activeAttemptRef.current?.attemptId !== control.connectAttemptId) return;
      const epoch = ++sessionEpochRef.current;
      activeAttemptRef.current = null;
      clearSessionMarker();
      if (control.connectOrigin === "RESTORE") {
        dispatch({ type: "INVALIDATE", reason: "SESSION_RESTORE_INVALID", epoch });
      } else {
        dispatch({ type: "CONNECT_FAILED", reason: "CONNECT_TIMEOUT", attemptId: control.connectAttemptId!, epoch });
      }
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [clearSessionMarker, control.connectAttemptId, control.connectOrigin, control.connectStartedAt, control.intent]);

  useEffect(() => {
    const verified = auth.financialWallet;
    if (!verified || !providerObservation.accountKnown) return;
    const timer = window.setTimeout(() => {
      if (control.intent === "ACTIVE") {
        if (control.providerRevision !== providerObservation.revision) {
          invalidateSession("ACCOUNT_CHANGED");
        } else if (!providerObservation.activeAccount) {
          invalidateSession("PROVIDER_DISCONNECTED");
        } else if (!walletsMatch(providerObservation.activeAccount, verified)) {
          invalidateSession("ACCOUNT_CHANGED");
        } else if (providerObservation.chainId !== LEOPOLD_CHAIN_ID && control.status !== "WRONG_NETWORK") {
          const epoch = ++sessionEpochRef.current;
          sessionAuthorizedRef.current = false;
          dispatch({
            type: "WRONG_NETWORK",
            attemptId: null,
            providerRevision: providerObservation.revision,
            epoch,
          });
        } else if (
          providerObservation.chainId === LEOPOLD_CHAIN_ID &&
          control.status === "WRONG_NETWORK" &&
          walletSessionRef.current.runtimeAligned
        ) {
          const epoch = ++sessionEpochRef.current;
          sessionAuthorizedRef.current = true;
          dispatch({ type: "CONNECTED", attemptId: null, providerRevision: providerObservation.revision, epoch });
        }
        return;
      }
      if (
        control.intent === "CONNECTING" &&
        control.connectAttemptId &&
        control.connectPhase === "WAITING_FOR_ACCOUNT_SELECTION" &&
        walletsMatch(providerObservation.activeAccount, verified) &&
        continuationRef.current !== control.connectAttemptId
      ) {
        continuationRef.current = control.connectAttemptId;
        void runConnectAttempt(control.connectAttemptId, control.epoch).finally(() => {
          continuationRef.current = null;
        });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    auth.financialWallet,
    control.connectAttemptId,
    control.connectPhase,
    control.epoch,
    control.intent,
    control.providerRevision,
    control.status,
    invalidateSession,
    providerObservation.accountKnown,
    providerObservation.activeAccount,
    providerObservation.chainId,
    providerObservation.revision,
    runConnectAttempt,
  ]);

  useEffect(() => {
    if (
      control.intent !== "CONNECTING" ||
      control.connectPhase !== "VERIFYING_RUNTIME" ||
      !control.connectAttemptId ||
      !auth.financialWallet ||
      !providerObservation.activeAccount
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      completeAttemptFromObservations(
        control.connectAttemptId!,
        control.epoch,
        providerObservation.activeAccount!,
        providerObservation.chainId,
        providerObservation.revision,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    auth.financialWallet,
    completeAttemptFromObservations,
    control.connectAttemptId,
    control.connectPhase,
    control.epoch,
    control.intent,
    providerObservation.activeAccount,
    providerObservation.chainId,
    providerObservation.revision,
    runtimeObservation,
  ]);

  useEffect(() => {
    if (
      auth.accountStatus !== "SIGNED_IN_READY" ||
      walletSession.status !== "CONNECTED" ||
      !walletSession.runtimeAligned
    ) {
      return;
    }
    if (healthRecord?.key === identityKey || healthInFlightKey === identityKey) return;
    void runNetworkHealthProbe();
  }, [
    healthInFlightKey,
    healthRecord?.key,
    identityKey,
    auth.accountStatus,
    runNetworkHealthProbe,
    walletSession.runtimeAligned,
    walletSession.status,
  ]);

  const value = useMemo<WalletSessionControllerValue>(
    () => ({
      identity: walletSession,
      walletSession,
      providerObservation,
      networkHealth: effectiveHealth,
      recovery,
      connectVerifiedWallet,
      disconnectLeopoldWallet,
      switchToSepolia,
      retryNetworkHealth: runNetworkHealthProbe,
      requireConnectedFinancialSession,
    }),
    [
      connectVerifiedWallet,
      disconnectLeopoldWallet,
      effectiveHealth,
      providerObservation,
      recovery,
      requireConnectedFinancialSession,
      runNetworkHealthProbe,
      switchToSepolia,
      walletSession,
    ],
  );

  return <WalletIdentityContext.Provider value={value}>{children}</WalletIdentityContext.Provider>;
}

export function useWalletIdentity(): WalletSessionControllerValue {
  const value = useContext(WalletIdentityContext);
  if (!value) throw new Error("WalletIdentityProvider is missing");
  return value;
}

/** Presentation-independent API intended for the final Leopold UI. */
export const useWalletSessionController = useWalletIdentity;

/** Headless state boundary: presentation code does not need Dynamic-specific user semantics. */
export function useLeopoldSessionState() {
  const auth = useAuth();
  const controller = useWalletIdentity();
  return useMemo(
    () => ({
      account: {
        status: auth.accountStatus,
        authenticated: auth.authenticated,
        profileStatus: auth.profileStatus,
        email: auth.email,
        username: auth.username,
      },
      financialWallet: {
        status: auth.financialWalletMetadata.status,
        address: auth.verifiedFinancialWallet,
      },
      accountIntegrity: auth.integrityPolicy,
      walletSession: controller.walletSession,
      networkHealth: controller.networkHealth,
      recovery: controller.recovery,
    }),
    [
      auth.accountStatus,
      auth.authenticated,
      auth.email,
      auth.financialWalletMetadata.status,
      auth.integrityPolicy,
      auth.profileStatus,
      auth.username,
      auth.verifiedFinancialWallet,
      controller.networkHealth,
      controller.recovery,
      controller.walletSession,
    ],
  );
}
