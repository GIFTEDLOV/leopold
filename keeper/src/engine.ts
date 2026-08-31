import { assertKeeperBalanceWithinLimits } from "./balance-guard.js";
import type { JournalEntry, JournalStatus, JournalStore } from "./journal.js";
import { journalEntryForPrepared } from "./journal.js";
import {
  type KeeperGateway,
  type KeeperLogger,
  type LifecycleAction,
  type ProtocolSnapshot,
  SEPOLIA_CHAIN_ID,
} from "./lifecycle.js";
import { isActionRequired, planNextAction } from "./planner.js";

const unresolvedStatuses = new Set<JournalStatus>(["prepared", "submitted", "confirmed", "unknown", "reverted"]);

export type KeeperRunResult =
  | { readonly outcome: "idle" }
  | { readonly outcome: "blocked"; readonly actionKey: string; readonly status: JournalStatus }
  | { readonly outcome: "submitted"; readonly actionKey: string; readonly txHash: string }
  | { readonly outcome: "reconciled" | "obsolete"; readonly actionKey: string; readonly txHash: string };

type EngineOptions = {
  readonly gateway: KeeperGateway;
  readonly journal: JournalStore;
  readonly logger: KeeperLogger;
  readonly minimumBalanceWei: bigint;
  readonly maximumBalanceWei: bigint;
  readonly confirmations: number;
  readonly receiptWaitMs: number;
  readonly receiptPollMs?: number;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") return String(code).slice(0, 80);
  }
  return error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN_ERROR";
}

function updateEntry(
  entry: JournalEntry,
  status: JournalStatus,
  now: Date,
  options: {
    readonly blockNumber?: number;
    readonly blockHash?: string;
    readonly confirmations?: number;
    readonly errorCode?: string;
  } = {},
): JournalEntry {
  const transition = {
    status,
    at: now.toISOString(),
    ...(options.blockNumber === undefined ? {} : { blockNumber: options.blockNumber }),
    ...(options.blockHash === undefined ? {} : { blockHash: options.blockHash }),
    ...(options.confirmations === undefined ? {} : { confirmations: options.confirmations }),
    ...(options.errorCode === undefined ? {} : { errorCode: options.errorCode }),
  };
  return {
    ...entry,
    status,
    updatedAt: now.toISOString(),
    ...(options.blockNumber === undefined ? {} : { blockNumber: options.blockNumber }),
    ...(options.blockHash === undefined ? {} : { blockHash: options.blockHash }),
    ...(options.confirmations === undefined ? {} : { confirmations: options.confirmations }),
    ...(options.errorCode === undefined ? {} : { errorCode: options.errorCode }),
    history: [...entry.history, transition],
  };
}

function actionFromEntry(snapshot: ProtocolSnapshot, entry: JournalEntry): LifecycleAction | null {
  const vault = snapshot.vaults.find(
    (candidate) => candidate.vault.address.toLowerCase() === entry.vault.toLowerCase(),
  );
  if (!vault) return null;
  return {
    key: entry.actionKey,
    kind: entry.action,
    vault: vault.vault,
    roundId: BigInt(entry.roundId),
    ...(entry.cursor === undefined ? {} : { cursor: BigInt(entry.cursor) }),
    ...(entry.account === undefined ? {} : { account: entry.account }),
  };
}

export class KeeperEngine {
  readonly #gateway: KeeperGateway;
  readonly #journal: JournalStore;
  readonly #logger: KeeperLogger;
  readonly #minimumBalanceWei: bigint;
  readonly #maximumBalanceWei: bigint;
  readonly #confirmations: number;
  readonly #receiptWaitMs: number;
  readonly #receiptPollMs: number;
  readonly #now: () => Date;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(options: EngineOptions) {
    this.#gateway = options.gateway;
    this.#journal = options.journal;
    this.#logger = options.logger;
    this.#minimumBalanceWei = options.minimumBalanceWei;
    this.#maximumBalanceWei = options.maximumBalanceWei;
    this.#confirmations = options.confirmations;
    this.#receiptWaitMs = options.receiptWaitMs;
    this.#receiptPollMs = options.receiptPollMs ?? 2_000;
    this.#now = options.now ?? (() => new Date());
    this.#sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async preflight(): Promise<bigint> {
    const chainId = await this.#gateway.getChainId();
    if (chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error(`Keeper refuses chain ${chainId}; expected Sepolia ${SEPOLIA_CHAIN_ID}`);
    }
    const balance = await this.#gateway.getKeeperBalance();
    assertKeeperBalanceWithinLimits(balance, this.#minimumBalanceWei, this.#maximumBalanceWei);
    return balance;
  }

  async #reconcileEntry(entry: JournalEntry): Promise<JournalEntry> {
    const receipt = await this.#gateway.getReceipt(entry.txHash);
    const snapshot = await this.#gateway.readSnapshot(
      (entry.action === "register-auto-entry" || entry.action === "prune-auto-entry") && entry.account
        ? { vaultAddress: entry.vault, account: entry.account, roundId: BigInt(entry.roundId) }
        : { vaultAddress: entry.vault, roundId: BigInt(entry.roundId) },
    );
    const action = actionFromEntry(snapshot, entry);
    const required = action !== null && isActionRequired(snapshot, action);

    // Unknown/reverted attempts are never retried, but an external caller may
    // legitimately complete the same action after the keeper lost its receipt.
    // Reconcile that state transition without erasing the forensic status.
    if ((entry.status === "unknown" || entry.status === "reverted") && required) return entry;
    if ((entry.status === "unknown" || entry.status === "reverted") && !required) {
      const obsolete = updateEntry(entry, "obsolete", this.#now(), { errorCode: "STATE_ADVANCED_EXTERNALLY" });
      await this.#journal.put(obsolete);
      return obsolete;
    }

    if (receipt && receipt.confirmations < this.#confirmations) {
      const pendingConfirmation = updateEntry(entry, "confirmed", this.#now(), {
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        confirmations: receipt.confirmations,
        errorCode: "WAITING_CONFIRMATIONS",
      });
      await this.#journal.put(pendingConfirmation);
      return pendingConfirmation;
    }

    if (receipt && receipt.confirmations >= this.#confirmations) {
      if (receipt.status === 1 && !required) {
        const reconciled = updateEntry(entry, "reconciled", this.#now(), {
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          confirmations: receipt.confirmations,
        });
        await this.#journal.put(reconciled);
        this.#logger.info(
          { vault: entry.vaultName, round: entry.roundId, action: entry.action, txHash: entry.txHash },
          "keeper transaction confirmed and reconciled",
        );
        return reconciled;
      }
      if (receipt.status === 0 && !required) {
        const obsolete = updateEntry(entry, "obsolete", this.#now(), {
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          confirmations: receipt.confirmations,
        });
        await this.#journal.put(obsolete);
        this.#logger.info(
          { vault: entry.vaultName, round: entry.roundId, action: entry.action, txHash: entry.txHash },
          "keeper action became unnecessary because another caller advanced state",
        );
        return obsolete;
      }
      const status: JournalStatus = receipt.status === 0 ? "reverted" : "unknown";
      const failed = updateEntry(entry, status, this.#now(), {
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        confirmations: receipt.confirmations,
        errorCode: receipt.status === 0 ? "TRANSACTION_REVERTED" : "CONFIRMED_STATE_UNCHANGED",
      });
      await this.#journal.put(failed);
      this.#logger.error(
        { vault: entry.vaultName, round: entry.roundId, action: entry.action, txHash: entry.txHash },
        "keeper transaction requires operator review",
      );
      return failed;
    }

    const transaction = await this.#gateway.getTransaction(entry.txHash);
    if (transaction) {
      const pending = updateEntry(entry, "submitted", this.#now());
      await this.#journal.put(pending);
      return pending;
    }

    const submittedAgeMs = this.#now().getTime() - new Date(entry.submittedAt).getTime();
    if ((entry.status === "prepared" || entry.status === "submitted") && submittedAgeMs < this.#receiptWaitMs) {
      return entry;
    }

    if (!required) {
      const obsolete = updateEntry(entry, "obsolete", this.#now(), { errorCode: "STATE_ADVANCED_EXTERNALLY" });
      await this.#journal.put(obsolete);
      this.#logger.info(
        { vault: entry.vaultName, round: entry.roundId, action: entry.action, txHash: entry.txHash },
        "keeper action already completed by authoritative chain state",
      );
      return obsolete;
    }

    if (entry.status === "confirmed") {
      const reorged = updateEntry(entry, "reorged", this.#now(), {
        errorCode: "REORGED_TRANSACTION_DROPPED",
      });
      await this.#journal.put(reorged);
      this.#logger.warn(
        { vault: entry.vaultName, round: entry.roundId, action: entry.action, txHash: entry.txHash },
        "confirmed keeper transaction disappeared after a shallow reorg; replay is permitted with history preserved",
      );
      return reorged;
    }

    const [latestNonce, pendingNonce] = await Promise.all([
      this.#gateway.getTransactionCount("latest"),
      this.#gateway.getTransactionCount("pending"),
    ]);
    const unknown = updateEntry(entry, "unknown", this.#now(), {
      errorCode:
        latestNonce > entry.nonce || pendingNonce > entry.nonce
          ? "NONCE_CONSUMED_OUTCOME_UNKNOWN"
          : "TX_OUTCOME_UNKNOWN",
    });
    await this.#journal.put(unknown);
    this.#logger.warn(
      { vault: entry.vaultName, round: entry.roundId, action: entry.action, txHash: entry.txHash },
      "transaction outcome unknown; automatic retry disabled",
    );
    return unknown;
  }

  async #reconcileOutstanding(): Promise<JournalEntry | null> {
    const entries = (await this.#journal.list()).filter((entry) => unresolvedStatuses.has(entry.status));
    for (const entry of entries) {
      const reconciled = await this.#reconcileEntry(entry);
      if (unresolvedStatuses.has(reconciled.status)) return reconciled;
    }
    return null;
  }

  async #waitAndReconcile(entry: JournalEntry): Promise<JournalEntry> {
    const deadline = this.#now().getTime() + this.#receiptWaitMs;
    let current = entry;
    for (;;) {
      current = await this.#reconcileEntry(current);
      if (current.status !== "submitted" && current.status !== "confirmed") return current;
      if (this.#now().getTime() >= deadline) return current;
      await this.#sleep(this.#receiptPollMs);
    }
  }

  async runOnce(): Promise<KeeperRunResult> {
    await this.preflight();

    const outstanding = await this.#reconcileOutstanding();
    if (outstanding) {
      return { outcome: "blocked", actionKey: outstanding.actionKey, status: outstanding.status };
    }

    let snapshot = await this.#gateway.readSnapshot();
    if (snapshot.chainId !== SEPOLIA_CHAIN_ID) throw new Error("Authoritative snapshot is not Sepolia");
    const action = planNextAction(snapshot);
    if (!action) {
      this.#logger.debug({ block: snapshot.blockNumber.toString() }, "no lifecycle action due");
      return { outcome: "idle" };
    }

    this.#logger.info(
      {
        vault: action.vault.name,
        round: action.roundId.toString(),
        detectedState: action.kind,
        nextAction: action.kind,
      },
      "keeper derived next lifecycle action",
    );

    const previous = (await this.#journal.list()).filter((entry) => entry.actionKey === action.key).at(-1);
    if (previous && unresolvedStatuses.has(previous.status)) {
      return { outcome: "blocked", actionKey: previous.actionKey, status: previous.status };
    }

    let data: string;
    try {
      data = await this.#gateway.encodeAction(action);
      await this.#gateway.simulate(action, data);
    } catch (error) {
      snapshot = await this.#gateway.readSnapshot(
        (action.kind === "register-auto-entry" || action.kind === "prune-auto-entry") && action.account
          ? { vaultAddress: action.vault.address, account: action.account, roundId: action.roundId }
          : { vaultAddress: action.vault.address, roundId: action.roundId },
      );
      if (!isActionRequired(snapshot, action)) {
        this.#logger.info(
          { vault: action.vault.name, round: action.roundId.toString(), action: action.kind },
          "action became unnecessary before submission",
        );
        return { outcome: "idle" };
      }
      this.#logger.warn(
        {
          vault: action.vault.name,
          round: action.roundId.toString(),
          action: action.kind,
          errorCode: safeErrorCode(error),
        },
        "lifecycle simulation or public-proof preparation failed",
      );
      throw error;
    }

    const transaction = await this.#gateway.sign(action, data);
    if (transaction.gasPolicy) {
      this.#logger.info(
        {
          vault: action.vault.name,
          round: action.roundId.toString(),
          action: action.kind,
          estimatedGas: transaction.gasPolicy.estimatedGas?.toString(),
          gasFloor: transaction.gasPolicy.gasFloor?.toString(),
          gasMultiplierBps: transaction.gasPolicy.multiplierBps,
          gasMarginUnits: transaction.gasPolicy.additiveMargin.toString(),
          gasLimit: transaction.gasPolicy.gasLimit.toString(),
          estimationFallback: transaction.gasPolicy.estimationFallback ?? false,
        },
        "keeper gas policy applied",
      );
    }
    const balance = await this.#gateway.getKeeperBalance();
    assertKeeperBalanceWithinLimits(balance, this.#minimumBalanceWei, this.#maximumBalanceWei);
    if (transaction.maximumCostWei > balance - this.#minimumBalanceWei) {
      throw new Error(
        "Keeper balance cannot cover the populated transaction maximum cost while preserving its minimum",
      );
    }

    let entry = journalEntryForPrepared(action, transaction, this.#now(), previous?.attemptId);
    await this.#journal.put(entry);

    try {
      const broadcastHash = await this.#gateway.broadcast(transaction);
      if (broadcastHash.toLowerCase() !== transaction.hash.toLowerCase()) {
        throw new Error("RPC returned a transaction hash that does not match the signed transaction");
      }
      entry = updateEntry(entry, "submitted", this.#now());
      await this.#journal.put(entry);
      this.#logger.info(
        { vault: action.vault.name, round: action.roundId.toString(), action: action.kind, txHash: transaction.hash },
        "keeper transaction submitted",
      );
    } catch (error) {
      entry = updateEntry(entry, "unknown", this.#now(), { errorCode: safeErrorCode(error) });
      await this.#journal.put(entry);
      this.#logger.warn(
        { vault: action.vault.name, round: action.roundId.toString(), action: action.kind, txHash: transaction.hash },
        "broadcast outcome unknown; automatic retry disabled",
      );
      return { outcome: "blocked", actionKey: action.key, status: "unknown" };
    }

    const finalEntry = await this.#waitAndReconcile(entry);
    if (finalEntry.status === "reconciled" || finalEntry.status === "obsolete") {
      return { outcome: finalEntry.status, actionKey: action.key, txHash: transaction.hash };
    }
    if (finalEntry.status === "submitted") {
      return { outcome: "submitted", actionKey: action.key, txHash: transaction.hash };
    }
    return { outcome: "blocked", actionKey: action.key, status: finalEntry.status };
  }
}
