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
  isV2TransactionReconciliationPendingError,
  recoverConfirmedV2Approval,
  recoverConfirmedV2Wrap,
  reconcileV2Transaction,
  revealLatestV2Result,
  revealV2Savings,
  resumeV2AddMoneyAfterApproval,
  resumeV2AddMoneySave,
  topUpV2EntryBalance,
  withdrawV2EntryBalance,
  withdrawV2Savings,
  type V2ActionClients,
  type V2AddMoneyStage,
  type V2ActionStep,
  type V2ActionStage,
} from "@/lib/leopold/v2-actions";
import { V2_PREVIEW_CHAIN_ID } from "@/lib/leopold/v2-preview-config";
import {
  isUnresolvedV2Transaction,
  findLatestV2AddMoneyCheckpoint,
  persistSafeTransaction,
  loadSafeTransactions,
  type SafeTransactionRecord,
  type TransactionStage,
} from "@/lib/leopold/transactions";
import { isTransientReadFailure } from "@/lib/ops/reliability";
import { V2_ADD_MONEY_EVENT } from "@/lib/ui/experience";
import { getV2EntryStatus } from "@/lib/ui/v2-entry-status";
import { readPreviewState, type PreviewReadState } from "@/components/v2-preview";

export type V2DialogKind = "add-money" | "withdraw" | "entry-top-up" | "entry-withdraw" | "turn-on" | "turn-off";

type ReadState = {
  status: "loading" | "ready" | "error";
  data?: PreviewReadState;
  error?: string;
  transient?: boolean;
};

export type V2ActionState = {
  status: "idle" | "running" | "pending" | "success" | "error";
  kind: string | null;
  stage?: V2ActionStage;
  error?: string;
  hashes: readonly `0x${string}`[];
  step?: V2ActionStep;
  recoveryRequired?: boolean;
};

type RevealedValue = { identityKey: string; value: bigint };

type AddMoneyRecovery = {
  operationId: string;
  resumeStage: "wrap" | "save";
  amount: bigint;
  hashes: readonly `0x${string}`[];
  confirmedStages: readonly V2AddMoneyStage[];
  message: string;
};

type RunActionOptions = {
  operationId?: string;
  initialHashes?: readonly `0x${string}`[];
  initialConfirmedStages?: readonly V2AddMoneyStage[];
};

function addMoneyTransactionStage(stage: V2AddMoneyStage, phase: "confirming" | "simulating"): TransactionStage {
  return `${stage}-${phase}` as TransactionStage;
}

function addMoneyStageFromError(error: unknown): V2AddMoneyStage | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (/add-money-approval/iu.test(message)) return "approval";
  if (/add-money-wrap/iu.test(message)) return "wrap";
  if (/add-money-save/iu.test(message)) return "save";
  return undefined;
}

function addMoneyRecoveryMessage(resumeStage: "wrap" | "save"): string {
  return resumeStage === "save"
    ? "Your USDC was made private, but it has not been added to Leopold savings yet. Resume to finish."
    : "USDC approval was confirmed, but your funds have not moved yet. Resume to continue.";
}

function friendlyActionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/reconciliation-pending/iu.test(message)) return "Transaction submitted. Confirming...";
  if (/V2_ACTION:.*:reverted:/iu.test(message)) return "The transaction reverted. No funds were moved.";
  if (/simulation:transient:(?:TIMEOUT|NETWORK|RATE_LIMIT|SERVER)/iu.test(message)) {
    return "Network confirmation is temporarily unavailable. No transaction was submitted.";
  }
  if (/V2_ACTION:add-money-approval:simulation/iu.test(message)) {
    return "USDC approval could not be simulated. No transaction was submitted.";
  }
  if (/V2_ACTION:add-money-wrap:simulation/iu.test(message)) {
    return "Private conversion could not be simulated. No transaction was submitted.";
  }
  if (/V2_ACTION:add-money-save:simulation/iu.test(message)) {
    return "Savings deposit could not be simulated. No transaction was submitted.";
  }
  if (/simulation/iu.test(message)) return "This transaction could not be simulated. No funds were moved.";
  if (/signature|user rejected|rejected request/iu.test(message)) return "The wallet did not submit that transaction. You can try again.";
  if (/AUTH_REQUIRED|ACCOUNT_NOT_READY|financial session/iu.test(message)) return "Sign in and connect your financial wallet to continue.";
  if (/WRONG_NETWORK|Sepolia|chain/iu.test(message)) return "Switch your wallet to Ethereum Sepolia, then try again.";
  if (/INSUFFICIENT_USDC/iu.test(message)) return "Your wallet does not have enough USDC for that amount.";
  if (/INSUFFICIENT_ENTRY_BALANCE/iu.test(message)) return "That amount is already reserved or is not available to withdraw.";
  if (/RESULT_NOT_READY/iu.test(message)) return "Your result is not ready yet.";
  if (/UNSUPPORTED_WALLET/iu.test(message)) return "This wallet connection cannot complete the requested action.";
  if (/RPC|network|timeout|rate.?limit|server|fetch|socket/iu.test(message)) {
    return "Sepolia is temporarily unavailable. No transaction was confirmed.";
  }
  return "We couldn't submit that transaction. No funds were moved. You can try again after resolving the issue.";
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
  const [addMoneyRecovery, setAddMoneyRecovery] = useState<AddMoneyRecovery | null>(null);
  const [addMoneyRecoveryBlocked, setAddMoneyRecoveryBlocked] = useState(false);
  const [revealedSavings, setRevealedSavings] = useState<RevealedValue | null>(null);
  const [revealedResult, setRevealedResult] = useState<RevealedValue | null>(null);
  const [history, setHistory] = useState<SafeTransactionRecord[]>([]);

  const load = useCallback(async () => {
    setReadState((current) => ({ status: "loading", data: current.data, error: current.error, transient: current.transient }));
    try {
      setReadState({ status: "ready", data: await readPreviewState(readAccount as Address | null), transient: false });
    } catch (error) {
      const transient = isTransientReadFailure(error);
      const message = error instanceof Error ? error.message : "Prize Savings reads failed";
      setReadState((current) => ({
        status: transient && current.data ? "ready" : "error",
        data: current.data,
        error: message,
        transient,
      }));
    }
  }, [readAccount]);

  const refreshHistory = useCallback(() => {
    setHistory(readAccount ? loadSafeTransactions(readAccount) : []);
  }, [readAccount]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void load(), 0);
    const refreshTimer = window.setInterval(() => void load(), 30_000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialLoadTimer);
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [load, readAccount]);

  const reconcilePendingTransactions = useCallback(async () => {
    if (!readAccount || !publicClient) return;
    const pending = loadSafeTransactions(readAccount).filter(
      (record) => record.chainId === V2_PREVIEW_CHAIN_ID && isUnresolvedV2Transaction(record),
    );
    if (!pending.length) return;

    setAction((current) =>
      current.status === "idle"
        ? {
            status: "pending",
            kind: pending[0].kind,
            stage: "reconcile",
            error: "Transaction submitted. Confirming...",
            hashes: pending.flatMap((record) => (record.hash ? [record.hash] : [])),
            recoveryRequired: true,
          }
        : current,
    );

    for (const record of pending) {
      if (!record.hash) continue;
      const result = await reconcileV2Transaction(publicClient, record.hash);
      if (result.status === "pending") continue;
      persistSafeTransaction({
        ...record,
        stage: result.status === "confirmed" ? "complete" : "failed",
        errorStage: result.status === "reverted" ? "failed" : undefined,
        updatedAt: Date.now(),
      });
      if (result.status === "confirmed") {
        setAction((current) =>
          current.status === "pending" && current.hashes.includes(record.hash as `0x${string}`)
            ? { status: "success", kind: current.kind, stage: "reconcile", hashes: current.hashes }
            : current,
        );
      } else {
        setAction((current) =>
          current.status === "pending" && current.hashes.includes(record.hash as `0x${string}`)
            ? {
                status: "error",
                kind: current.kind,
                error: "The transaction reverted. No funds were moved.",
                hashes: current.hashes,
                recoveryRequired: false,
              }
            : current,
        );
      }
    }
    refreshHistory();
  }, [publicClient, readAccount, refreshHistory]);

  useEffect(() => {
    const initialRecoveryTimer = window.setTimeout(() => void reconcilePendingTransactions(), 0);
    const recoveryTimer = window.setInterval(() => void reconcilePendingTransactions(), 15_000);
    return () => {
      window.clearTimeout(initialRecoveryTimer);
      window.clearInterval(recoveryTimer);
    };
  }, [reconcilePendingTransactions]);

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
    async (
      kind: string,
      operation: (clients: V2ActionClients) => Promise<unknown>,
      options: RunActionOptions = {},
    ) => {
      if (action.status === "running" || action.status === "pending") return;
      const unresolved = readAccount
        ? loadSafeTransactions(readAccount).find(
            (record) => record.chainId === V2_PREVIEW_CHAIN_ID && isUnresolvedV2Transaction(record),
          )
        : undefined;
      if (unresolved?.hash) {
        setAction({
          status: "pending",
          kind: unresolved.kind,
          stage: "reconcile",
          error: "Transaction submitted. Confirming...",
          hashes: [unresolved.hash],
          recoveryRequired: true,
        });
        return;
      }
      let operationId = options.operationId ?? "";
      let writeIndex = options.initialHashes?.length ?? 0;
      const hashes: `0x${string}`[] = [...(options.initialHashes ?? [])];
      let operationAccount: Address | undefined;
      let lastWriteStage: V2AddMoneyStage | undefined;
      const confirmedStages = new Set<V2AddMoneyStage>(options.initialConfirmedStages ?? []);
      let persistRecord: (
        stage: TransactionStage,
        hash?: `0x${string}`,
        errorStage?: TransactionStage,
        operationStage?: V2AddMoneyStage,
      ) => void = () => undefined;
      setAction({ status: "running", kind, hashes: [...hashes] });
      try {
        if (!auth.authenticated || auth.accountStatus !== "SIGNED_IN_READY") throw new Error("AUTH_REQUIRED");
        const session = await walletIdentity.requireConnectedFinancialSession();
        const account = session.verifiedAddress ?? session.address;
        if (!account || !publicClient || !walletClient.data) throw new Error("UNSUPPORTED_WALLET");
        operationAccount = account;
        if (session.address?.toLowerCase() !== account.toLowerCase()) throw new Error("WALLET_IDENTITY_MISMATCH");
        if (address && address.toLowerCase() !== account.toLowerCase()) throw new Error("WALLET_IDENTITY_MISMATCH");
        const ethereum = typeof window !== "undefined" ? (window as unknown as { ethereum?: V2ActionClients["ethereum"] }).ethereum : undefined;
        const fallbackEthereum = ethereum ?? { request: async () => { throw new Error("UNSUPPORTED_WALLET:ethereum-provider-required"); } };
        operationId ||= crypto.randomUUID();
        persistRecord = (
          stage: TransactionStage,
          hash?: `0x${string}`,
          errorStage?: TransactionStage,
          operationStage?: V2AddMoneyStage,
        ) => {
          persistSafeTransaction({
            id: errorStage ? `${operationId}:failure` : hash ? `${operationId}:write:${writeIndex}` : operationId,
            kind,
            operationId,
            operationStage,
            hash,
            chainId: V2_PREVIEW_CHAIN_ID,
            account,
            stage,
            errorStage,
            updatedAt: Date.now(),
          });
        };
        if (!options.operationId) persistRecord("wallet");
        const clients: V2ActionClients = {
          publicClient,
          walletClient: walletClient.data,
          ethereum: fallbackEthereum,
          account,
          onStep: (step) => setAction((current) => ({ ...current, step })),
          onStage: (stage) => setAction((current) => ({ ...current, stage })),
          onHash: (hash, stage) => {
            writeIndex += 1;
            hashes.push(hash);
            lastWriteStage = stage;
            persistRecord(stage ? addMoneyTransactionStage(stage, "confirming") : "confirming", hash, undefined, stage);
            setAction((current) => ({ ...current, hashes: [...hashes], stage: "reconcile" }));
          },
          onReceipt: (hash, stage) => {
            if (stage) {
              lastWriteStage = stage;
              confirmedStages.add(stage);
            }
            persistRecord("complete", hash, undefined, stage);
          },
        };
        await operation(clients);
        persistRecord("complete", hashes.at(-1), undefined, lastWriteStage);
        if (kind === "v2-add-money") {
          setAddMoneyRecovery(null);
          setAddMoneyRecoveryBlocked(false);
        }
        setAction({ status: "success", kind, hashes: [...hashes] });
        setDialog(null);
        await load();
      } catch (error) {
        if (isV2TransactionReconciliationPendingError(error) && operationAccount) {
          const pendingStage = error.transactionStage ?? lastWriteStage;
          persistRecord(
            pendingStage ? addMoneyTransactionStage(pendingStage, "confirming") : "confirming",
            error.hash,
            undefined,
            pendingStage,
          );
          setAction({
            status: "pending",
            kind,
            stage: "reconcile",
            error: "Transaction submitted. Confirming...",
            hashes: [...hashes],
            recoveryRequired: true,
          });
          return;
        }
        if (operationId) {
          const failedStage = addMoneyStageFromError(error) ?? lastWriteStage;
          if (operationAccount) {
            const reverted = /V2_ACTION:.*:reverted:/iu.test(error instanceof Error ? error.message : String(error));
            persistRecord(
              "failed",
              reverted ? hashes.at(-1) : undefined,
              "failed",
              failedStage,
            );
          }
        }
        const hasCompletedAddMoneyStage =
          kind === "v2-add-money" && confirmedStages.size > 0 && !confirmedStages.has("save");
        if (hasCompletedAddMoneyStage) setAddMoneyRecoveryBlocked(true);
        const recoveryMessage =
          kind === "v2-add-money" && confirmedStages.has("wrap") && !confirmedStages.has("save")
            ? addMoneyRecoveryMessage("save")
            : kind === "v2-add-money" && confirmedStages.has("approval") && !confirmedStages.has("wrap")
              ? addMoneyRecoveryMessage("wrap")
              : friendlyActionError(error);
        setAction({
          status: "error",
          kind,
          error: recoveryMessage,
          hashes: [...hashes],
          recoveryRequired: hashes.length > 0,
        });
      }
    },
    [action.status, address, auth, load, publicClient, readAccount, walletClient.data, walletIdentity],
  );

  const discoverAddMoneyRecovery = useCallback(async () => {
    if (!readAccount || !publicClient || action.status === "running" || action.status === "pending") return;
    const records = loadSafeTransactions(readAccount).filter(
      (record) => record.chainId === V2_PREVIEW_CHAIN_ID,
    );
    const checkpoint = findLatestV2AddMoneyCheckpoint(records);
    if (!checkpoint) {
      setAddMoneyRecoveryBlocked(false);
      return;
    }
    if (checkpoint.save?.stage === "complete") return;
    if (checkpoint.approval && isUnresolvedV2Transaction(checkpoint.approval)) return;
    if (checkpoint.wrap && isUnresolvedV2Transaction(checkpoint.wrap)) return;
    if (checkpoint.save && isUnresolvedV2Transaction(checkpoint.save)) return;

    const completedApproval = checkpoint.approval?.stage === "complete" && checkpoint.approval.hash;
    const completedWrap = checkpoint.wrap?.stage === "complete" && checkpoint.wrap.hash;
    const hashes = [completedApproval ? checkpoint.approval?.hash : undefined, completedWrap ? checkpoint.wrap?.hash : undefined].filter(
      (hash): hash is `0x${string}` => Boolean(hash),
    );
    try {
      if (completedWrap) {
        const recovered = await recoverConfirmedV2Wrap(publicClient, readAccount as Address, completedWrap);
        const recovery: AddMoneyRecovery = {
          operationId: checkpoint.operationId,
          resumeStage: "save",
          amount: recovered.amount,
          hashes,
          confirmedStages: completedApproval ? ["approval", "wrap"] : ["wrap"],
          message: addMoneyRecoveryMessage("save"),
        };
        setAddMoneyRecoveryBlocked(false);
        setAddMoneyRecovery(recovery);
        setAmount(formatUnits(recovered.amount, 6));
        setDialog("add-money");
        setAction({ status: "error", kind: "v2-add-money", error: recovery.message, hashes, recoveryRequired: true });
        return;
      }
      if (completedApproval) {
        const recovered = await recoverConfirmedV2Approval(publicClient, readAccount as Address, completedApproval);
        const recovery: AddMoneyRecovery = {
          operationId: checkpoint.operationId,
          resumeStage: "wrap",
          amount: recovered.amount,
          hashes,
          confirmedStages: ["approval"],
          message: addMoneyRecoveryMessage("wrap"),
        };
        setAddMoneyRecoveryBlocked(false);
        setAddMoneyRecovery(recovery);
        setAmount(formatUnits(recovered.amount, 6));
        setDialog("add-money");
        setAction({ status: "error", kind: "v2-add-money", error: recovery.message, hashes, recoveryRequired: true });
      }
    } catch {
      setAddMoneyRecovery(null);
      setAddMoneyRecoveryBlocked(true);
      setDialog("add-money");
      setAction({
        status: "error",
        kind: "v2-add-money",
        error: "A previous Add Money step could not be verified. Do not submit another amount yet.",
        hashes,
        recoveryRequired: true,
      });
    }
  }, [action.status, publicClient, readAccount]);

  useEffect(() => {
    const recoveryTimer = window.setTimeout(() => void discoverAddMoneyRecovery(), 0);
    return () => window.clearTimeout(recoveryTimer);
  }, [discoverAddMoneyRecovery, history.length]);

  const openDialog = useCallback((kind: V2DialogKind) => {
    if (kind === "add-money" && !addMoneyRecovery) setAmount("0.001");
    if (kind === "withdraw") setAmount("0.001");
    if (kind === "entry-top-up") setAmount("0.005");
    if (kind === "entry-withdraw") setAmount("0.001");
    if (kind === "turn-on") setDraws("2");
    setDialog(kind);
  }, [addMoneyRecovery]);

  const submitDialog = useCallback(() => {
    if (!dialog) return;
    if (dialog === "add-money" && addMoneyRecoveryBlocked) return;
    try {
      if (dialog === "add-money") {
        if (addMoneyRecovery) {
          const resume = addMoneyRecovery.resumeStage === "save"
            ? (clients: V2ActionClients) => resumeV2AddMoneySave(clients, addMoneyRecovery.amount)
            : (clients: V2ActionClients) => resumeV2AddMoneyAfterApproval(clients, addMoneyRecovery.amount);
          void runAction("v2-add-money", resume, {
            operationId: addMoneyRecovery.operationId,
            initialHashes: addMoneyRecovery.hashes,
            initialConfirmedStages: addMoneyRecovery.confirmedStages,
          });
        } else {
          void runAction("v2-add-money", (clients) => addV2Money(clients, parseUnits(amount.trim(), 6)));
        }
      }
      else if (dialog === "withdraw") void runAction("v2-withdraw-savings", (clients) => withdrawV2Savings(clients, parseUnits(amount.trim(), 6)));
      else if (dialog === "entry-top-up") void runAction("v2-entry-balance-top-up", (clients) => topUpV2EntryBalance(clients, parseUnits(amount.trim(), 18)));
      else if (dialog === "entry-withdraw") void runAction("v2-entry-balance-withdraw", (clients) => withdrawV2EntryBalance(clients, parseUnits(amount.trim(), 18)));
      else if (dialog === "turn-on") void runAction("v2-prize-savings-enable", (clients) => enableV2PrizeSavings(clients, BigInt(draws.trim() || "2")));
      else void runAction("v2-prize-savings-disable", (clients) => disableV2PrizeSavings(clients));
    } catch (error) {
      setAction({ status: "error", kind: `v2-${dialog}`, error: friendlyActionError(error), hashes: [] });
    }
  }, [addMoneyRecovery, addMoneyRecoveryBlocked, amount, dialog, draws, runAction]);

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
    addMoneyRecovery,
    addMoneyRecoveryBlocked,
    dismissAction: () => setAction({ status: "idle", kind: null, hashes: [] }),
    busy: action.status === "running" || action.status === "pending",
    readTransient: Boolean(readState.transient),
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
