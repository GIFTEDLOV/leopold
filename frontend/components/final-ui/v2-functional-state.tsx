"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { useAuth } from "@/components/auth-provider";
import { useWalletIdentity } from "@/components/wallet-identity-provider";
import {
  addV2Money,
  disableV2PrizeSavings,
  enableV2PrizeSavings,
  revealLatestV2Result,
  revealV2Savings,
  topUpV2EntryBalance,
  withdrawV2EntryBalance,
  withdrawV2Savings,
  type V2ActionClients,
  type V2ActionStage,
} from "@/lib/leopold/v2-actions";
import { V2_PREVIEW_CHAIN_ID } from "@/lib/leopold/v2-preview-config";
import { persistSafeTransaction, loadSafeTransactions, type SafeTransactionRecord, type TransactionStage } from "@/lib/leopold/transactions";
import { V2_ADD_MONEY_EVENT } from "@/lib/ui/experience";
import { getV2EntryStatus } from "@/lib/ui/v2-entry-status";
import { readPreviewState, type PreviewReadState } from "@/components/v2-preview";

export type V2DialogKind = "add-money" | "withdraw" | "entry-top-up" | "entry-withdraw" | "turn-on" | "turn-off";

type ReadState = {
  status: "loading" | "ready" | "error";
  data?: PreviewReadState;
  error?: string;
};

export type V2ActionState = {
  status: "idle" | "running" | "success" | "error";
  kind: string | null;
  stage?: V2ActionStage;
  error?: string;
  hashes: readonly `0x${string}`[];
  recoveryRequired?: boolean;
};

type RevealedValue = { identityKey: string; value: bigint };

function friendlyActionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/AUTH_REQUIRED|ACCOUNT_NOT_READY|financial session/iu.test(message)) return "Sign in and connect your financial wallet to continue.";
  if (/WRONG_NETWORK|Sepolia|chain/iu.test(message)) return "Switch your wallet to Ethereum Sepolia, then try again.";
  if (/INSUFFICIENT_USDC/iu.test(message)) return "Your wallet does not have enough USDC for that amount.";
  if (/INSUFFICIENT_ENTRY_BALANCE/iu.test(message)) return "That amount is already reserved or is not available to withdraw.";
  if (/RESULT_NOT_READY/iu.test(message)) return "Your result is not ready yet.";
  if (/UNSUPPORTED_WALLET/iu.test(message)) return "This wallet connection cannot complete the requested action.";
  return "We couldn't complete that yet. Check your wallet activity before trying again.";
}

export function v2StageLabel(stage: V2ActionStage | undefined): string {
  switch (stage) {
    case "approval":
    case "preparing-funds":
      return "Preparing funds";
    case "adding-to-savings":
      return "Adding to savings";
    case "entry-balance":
      return "Updating entry balance";
    case "prize-savings":
      return "Updating Prize Savings";
    case "withdrawal":
      return "Preparing withdrawal";
    case "unwrapping":
      return "Completing withdrawal";
    case "reveal":
      return "Reading your result";
    case "claim":
      return "Confirming claim";
    case "reconcile":
      return "Confirming in your wallet";
    default:
      return "Waiting for your wallet";
  }
}

export function v2DrawStatus(state: number | undefined): { label: string; tone: "good" | "neutral" | "gold" } {
  if (state === 1) return { label: "Open", tone: "good" };
  if (state === 10) return { label: "Result ready", tone: "good" };
  if (state === undefined) return { label: "Checking", tone: "neutral" };
  return { label: "Draw in progress", tone: "gold" };
}

export function v2FormatDate(timestamp: bigint | null | undefined): string {
  if (timestamp === null || timestamp === undefined) return "Checking";
  return new Date(Number(timestamp) * 1_000).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function v2FormatCountdown(timestamp: bigint | null | undefined, now: number): string {
  if (timestamp === null || timestamp === undefined) return "Checking";
  const remaining = Number(timestamp) - Math.floor(now / 1_000);
  if (remaining <= 0) return "Closing soon";
  const hours = Math.floor(remaining / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${Math.max(1, minutes)}m left`;
}

export function v2EntryBalanceLabel(data: PreviewReadState | undefined): string {
  if (!data || data.automationCredit === null) return "Checking";
  if (data.bondAmount === 0n) return "Ready";
  const draws = data.automationCredit / data.bondAmount;
  return draws > 0n ? `Ready for ${draws.toString()} ${draws === 1n ? "draw" : "draws"}` : "Needs funding";
}

export function v2EntryBalanceTone(data: PreviewReadState | undefined): "good" | "neutral" | "gold" {
  if (!data || data.automationCredit === null) return "neutral";
  return data.bondAmount > 0n && data.automationCredit / data.bondAmount > 0n ? "good" : "gold";
}

export function useV2FunctionalState() {
  const { address, chainId: connectedChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: V2_PREVIEW_CHAIN_ID });
  const walletClient = useWalletClient({ chainId: V2_PREVIEW_CHAIN_ID });
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const readAccount = walletIdentity.walletSession.address ?? address ?? null;
  const [readState, setReadState] = useState<ReadState>({ status: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const [dialog, setDialog] = useState<V2DialogKind | null>(null);
  const [amount, setAmount] = useState("0.001");
  const [draws, setDraws] = useState("2");
  const [action, setAction] = useState<V2ActionState>({ status: "idle", kind: null, hashes: [] });
  const [revealedSavings, setRevealedSavings] = useState<RevealedValue | null>(null);
  const [revealedResult, setRevealedResult] = useState<RevealedValue | null>(null);
  const [history, setHistory] = useState<SafeTransactionRecord[]>([]);

  const load = useCallback(async () => {
    setReadState({ status: "loading" });
    try {
      setReadState({ status: "ready", data: await readPreviewState(readAccount as Address | null) });
    } catch (error) {
      setReadState({ status: "error", error: error instanceof Error ? error.message : "Prize Savings reads failed" });
    }
  }, [readAccount]);

  const refreshHistory = useCallback(() => {
    setHistory(readAccount ? loadSafeTransactions(readAccount) : []);
  }, [readAccount]);

  useEffect(() => {
    let cancelled = false;
    void readPreviewState(readAccount as Address | null).then(
      (data) => {
        if (!cancelled) setReadState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!cancelled) setReadState({ status: "error", error: error instanceof Error ? error.message : "Prize Savings reads failed" });
      },
    );
    const refreshTimer = window.setInterval(() => void load(), 30_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [load, readAccount]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(refreshHistory, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refreshHistory, action.status]);

  useEffect(() => {
    const openAddMoney = () => {
      setAmount("0.001");
      setDialog("add-money");
    };
    window.addEventListener(V2_ADD_MONEY_EVENT, openAddMoney);
    if (window.location.hash === "#add-money") openAddMoney();
    return () => window.removeEventListener(V2_ADD_MONEY_EVENT, openAddMoney);
  }, []);

  const identityKey = `${readAccount?.toLowerCase() ?? "none"}:${connectedChainId ?? "none"}:${walletIdentity.walletSession.epoch}:${auth.identityKey}`;
  const revealedSavingsValue = revealedSavings?.identityKey === identityKey ? revealedSavings.value : null;
  const revealedResultValue = revealedResult?.identityKey === identityKey ? revealedResult.value : null;

  useEffect(() => {
    const clearSensitiveState = () => {
      if (document.visibilityState === "hidden") {
        setRevealedSavings(null);
        setRevealedResult(null);
      }
    };
    document.addEventListener("visibilitychange", clearSensitiveState);
    window.addEventListener("pagehide", clearSensitiveState);
    return () => {
      document.removeEventListener("visibilitychange", clearSensitiveState);
      window.removeEventListener("pagehide", clearSensitiveState);
    };
  }, []);

  const runAction = useCallback(
    async (kind: string, operation: (clients: V2ActionClients) => Promise<unknown>) => {
      if (action.status === "running") return;
      let operationId = "";
      let writeIndex = 0;
      const hashes: `0x${string}`[] = [];
      setAction({ status: "running", kind, hashes: [] });
      try {
        if (!auth.authenticated || auth.accountStatus !== "SIGNED_IN_READY") throw new Error("AUTH_REQUIRED");
        const session = await walletIdentity.requireConnectedFinancialSession();
        const account = session.verifiedAddress ?? session.address;
        if (!account || !publicClient || !walletClient.data) throw new Error("UNSUPPORTED_WALLET");
        if (session.address?.toLowerCase() !== account.toLowerCase()) throw new Error("WALLET_IDENTITY_MISMATCH");
        if (address && address.toLowerCase() !== account.toLowerCase()) throw new Error("WALLET_IDENTITY_MISMATCH");
        const ethereum = typeof window !== "undefined" ? (window as unknown as { ethereum?: V2ActionClients["ethereum"] }).ethereum : undefined;
        const fallbackEthereum = ethereum ?? { request: async () => { throw new Error("UNSUPPORTED_WALLET:ethereum-provider-required"); } };
        operationId = crypto.randomUUID();
        const persist = (stage: TransactionStage, hash?: `0x${string}`, errorStage?: TransactionStage) => {
          persistSafeTransaction({
            id: errorStage ? `${operationId}:failure` : hash ? `${operationId}:write:${writeIndex}` : operationId,
            kind,
            hash,
            chainId: V2_PREVIEW_CHAIN_ID,
            account,
            stage,
            errorStage,
            updatedAt: Date.now(),
          });
        };
        persist("wallet");
        const clients: V2ActionClients = {
          publicClient,
          walletClient: walletClient.data,
          ethereum: fallbackEthereum,
          account,
          onStage: (stage) => setAction((current) => ({ ...current, stage })),
          onHash: (hash) => {
            writeIndex += 1;
            hashes.push(hash);
            persist("submitted", hash);
            setAction((current) => ({ ...current, hashes: [...hashes], stage: "reconcile" }));
          },
        };
        await operation(clients);
        persist("complete");
        setAction({ status: "success", kind, hashes: [...hashes] });
        setDialog(null);
        await load();
      } catch (error) {
        if (operationId) {
          const account = walletIdentity.walletSession.verifiedAddress;
          if (account) persistSafeTransaction({ id: `${operationId}:failure`, kind, hash: hashes.at(-1), chainId: V2_PREVIEW_CHAIN_ID, account, stage: "failed", errorStage: "failed", updatedAt: Date.now() });
        }
        setAction({ status: "error", kind, error: friendlyActionError(error), hashes: [...hashes], recoveryRequired: hashes.length > 0 });
      }
    },
    [action.status, address, auth, load, publicClient, walletClient.data, walletIdentity],
  );

  const openDialog = useCallback((kind: V2DialogKind) => {
    if (kind === "add-money" || kind === "withdraw") setAmount("0.001");
    if (kind === "entry-top-up") setAmount("0.005");
    if (kind === "entry-withdraw") setAmount("0.001");
    if (kind === "turn-on") setDraws("2");
    setDialog(kind);
  }, []);

  const submitDialog = useCallback(() => {
    if (!dialog) return;
    try {
      if (dialog === "add-money") void runAction("v2-add-money", (clients) => addV2Money(clients, parseUnits(amount.trim(), 6)));
      else if (dialog === "withdraw") void runAction("v2-withdraw-savings", (clients) => withdrawV2Savings(clients, parseUnits(amount.trim(), 6)));
      else if (dialog === "entry-top-up") void runAction("v2-entry-balance-top-up", (clients) => topUpV2EntryBalance(clients, parseUnits(amount.trim(), 18)));
      else if (dialog === "entry-withdraw") void runAction("v2-entry-balance-withdraw", (clients) => withdrawV2EntryBalance(clients, parseUnits(amount.trim(), 18)));
      else if (dialog === "turn-on") void runAction("v2-prize-savings-enable", (clients) => enableV2PrizeSavings(clients, BigInt(draws.trim() || "2")));
      else void runAction("v2-prize-savings-disable", (clients) => disableV2PrizeSavings(clients));
    } catch (error) {
      setAction({ status: "error", kind: `v2-${dialog}`, error: friendlyActionError(error), hashes: [] });
    }
  }, [amount, dialog, draws, runAction]);

  const runAmountAction = useCallback((kind: string, value: string, decimals: number, operation: (clients: V2ActionClients, amount: bigint) => Promise<unknown>) => {
    try {
      void runAction(kind, (clients) => operation(clients, parseUnits(value.trim(), decimals)));
    } catch (error) {
      setAction({ status: "error", kind, error: friendlyActionError(error), hashes: [] });
    }
  }, [runAction]);

  const revealSavings = useCallback(() => {
    if (revealedSavingsValue !== null) {
      setRevealedSavings(null);
      return;
    }
    void runAction("v2-reveal-savings", async (clients) => {
      const value = await revealV2Savings(clients);
      setRevealedSavings({ identityKey, value });
      return value;
    });
  }, [identityKey, revealedSavingsValue, runAction]);

  const revealResult = useCallback(() => {
    if (revealedResultValue !== null) {
      setRevealedResult(null);
      return;
    }
    void runAction("v2-reveal-result", async (clients) => {
      const value = await revealLatestV2Result(clients);
      setRevealedResult({ identityKey, value });
      return value;
    });
  }, [identityKey, revealedResultValue, runAction]);

  const data = readState.data?.topologyVerified ? readState.data : undefined;
  const resultReady = Boolean(data?.latestResultRound && data.latestResultRound[2] === 10 && data.latestResultRegistered);
  const prizeSavingsOn = data?.autoEntryEnabled === true;
  const entryStatus = getV2EntryStatus(data?.registered, data?.autoEntryEnabled);
  const fundedDraws = useMemo(() => data && data.automationCredit !== null && data.bondAmount > 0n ? data.automationCredit / data.bondAmount : null, [data]);
  const shouldShowWalletNotice = walletIdentity.walletSession.status !== "CONNECTED";

  return {
    data,
    readStatus: readState.status,
    readError: readState.error,
    topologyError: readState.status === "ready" && Boolean(readState.data && !readState.data.topologyVerified),
    load,
    now,
    dialog,
    openDialog,
    closeDialog: () => setDialog(null),
    amount,
    setAmount,
    draws,
    setDraws,
    submitDialog,
    runAmountAction,
    action,
    dismissAction: () => setAction({ status: "idle", kind: null, hashes: [] }),
    busy: action.status === "running",
    revealSavings,
    revealResult,
    revealedSavingsValue,
    revealedResultValue,
    resultReady,
    prizeSavingsOn,
    entryStatus,
    fundedDraws,
    drawStatus: v2DrawStatus(data?.round[2]),
    nextDraw: data?.round[1] ?? null,
    entryBalanceLabel: v2EntryBalanceLabel(data),
    entryBalanceTone: v2EntryBalanceTone(data),
    shouldShowWalletNotice,
    history,
    refreshHistory,
    runAction,
    formatPrivateSavings: revealedSavingsValue === null ? "•••••• USDC" : `${formatUnits(revealedSavingsValue, 6)} USDC`,
  };
}
