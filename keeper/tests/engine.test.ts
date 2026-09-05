import { describe, expect, it, vi } from "vitest";

import { KeeperEngine } from "../src/engine.js";
import { journalEntryForPrepared, MemoryJournalStore, type JournalStore } from "../src/journal.js";
import type {
  KeeperGateway,
  KeeperLogger,
  LifecycleAction,
  ProtocolSnapshot,
  ReceiptView,
  SignedLifecycleTransaction,
  SnapshotReadHint,
} from "../src/lifecycle.js";
import { RoundState } from "../src/lifecycle.js";
import { planNextAction } from "../src/planner.js";

const keeperAddress = "0x0000000000000000000000000000000000000044";
const transactionHash = `0x${"11".repeat(32)}`;
const calldataHash = `0x${"22".repeat(32)}`;

function dueSnapshot(state = RoundState.AGGREGATE_PENDING): ProtocolSnapshot {
  return {
    chainId: 11_155_111n,
    blockNumber: 10n,
    blockHash: `0x${"aa".repeat(32)}`,
    blockTimestamp: 150n,
    vaults: [
      {
        vault: {
          id: 1,
          name: "Daily",
          cadence: "DAILY",
          address: "0x0000000000000000000000000000000000000011",
          bondEscrow: "0x0000000000000000000000000000000000000022",
        },
        activeRoundId: 2n,
        bondAmount: 5n,
        autoEntryCandidates: [],
        rounds: [
          {
            roundId: 1n,
            opensAt: 0n,
            closesAt: 100n,
            state,
            publicAggregateTwab: 1n,
            publicPrize: 1n,
            participantCount: 1n,
            selectionCursor: 0n,
            allocationCursor: 0n,
          },
          {
            roundId: 2n,
            opensAt: 100n,
            closesAt: 200n,
            state: RoundState.OPEN,
            publicAggregateTwab: 0n,
            publicPrize: 0n,
            participantCount: 0n,
            selectionCursor: 0n,
            allocationCursor: 0n,
          },
        ],
      },
    ],
  };
}

class FakeGateway implements KeeperGateway {
  readonly keeperAddress = keeperAddress;
  chainId = 11_155_111n;
  balance = 100n;
  snapshot = dueSnapshot();
  receipt: ReceiptView | null = null;
  transaction: { hash: string; nonce: number } | null = null;
  maximumCostWei = 10n;
  latestNonce = 0;
  pendingNonce = 0;
  simulateError: Error | null = null;
  broadcastError: Error | null = null;
  broadcastHash = transactionHash;
  onSimulate?: () => void;
  onBroadcast?: () => Promise<void>;
  snapshotHints: Array<SnapshotReadHint | undefined> = [];

  readonly encodeAction = vi.fn(async () => "0x1234");
  readonly sign = vi.fn(
    async (action: LifecycleAction): Promise<SignedLifecycleTransaction> => ({
      action,
      hash: transactionHash,
      nonce: 0,
      serialized: "0xabcd",
      calldataHash,
      maximumCostWei: this.maximumCostWei,
    }),
  );
  readonly broadcast = vi.fn(async () => {
    await this.onBroadcast?.();
    if (this.broadcastError) throw this.broadcastError;
    return this.broadcastHash;
  });

  async getChainId() {
    return this.chainId;
  }
  async getKeeperBalance() {
    return this.balance;
  }
  async readSnapshot(hint?: SnapshotReadHint) {
    this.snapshotHints.push(hint);
    return this.snapshot;
  }
  async simulate() {
    this.onSimulate?.();
    if (this.simulateError) throw this.simulateError;
  }
  async getReceipt() {
    return this.receipt;
  }
  async getTransaction() {
    return this.transaction;
  }
  async getTransactionCount(blockTag: "latest" | "pending") {
    return blockTag === "latest" ? this.latestNonce : this.pendingNonce;
  }
}

const logger: KeeperLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function engine(
  gateway: FakeGateway,
  journal: JournalStore = new MemoryJournalStore(),
  overrides: Partial<Pick<ConstructorParameters<typeof KeeperEngine>[0], "confirmations" | "receiptWaitMs">> = {},
) {
  return new KeeperEngine({
    gateway,
    journal,
    logger,
    minimumBalanceWei: 1n,
    maximumBalanceWei: 1_000n,
    confirmations: overrides.confirmations ?? 1,
    receiptWaitMs: overrides.receiptWaitMs ?? 0,
    receiptPollMs: 0,
    now: () => new Date("2026-08-30T00:00:00.000Z"),
    sleep: async () => undefined,
  });
}

describe("keeper engine", () => {
  it("fails preflight on the wrong chain or unsafe balance", async () => {
    const wrongChain = new FakeGateway();
    wrongChain.chainId = 1n;
    await expect(engine(wrongChain).preflight()).rejects.toThrow("expected Sepolia");

    const low = new FakeGateway();
    low.balance = 0n;
    await expect(engine(low).preflight()).rejects.toThrow("below the configured minimum");

    const high = new FakeGateway();
    high.balance = 1_001n;
    await expect(engine(high).preflight()).rejects.toThrow("exceeds the configured ceiling");
  });

  it("writes the signed hash, nonce, and calldata digest before broadcast", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    gateway.onBroadcast = async () => {
      expect(await journal.list()).toMatchObject([
        { status: "prepared", txHash: transactionHash, nonce: 0, calldataHash },
      ]);
      gateway.snapshot = dueSnapshot(RoundState.AGGREGATE_FINALIZED);
      gateway.receipt = {
        hash: transactionHash,
        blockHash: `0x${"bb".repeat(32)}`,
        blockNumber: 11,
        status: 1,
        confirmations: 1,
      };
    };
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "reconciled" });
    expect((await journal.list())[0]).toMatchObject({ status: "reconciled", blockNumber: 11 });
    expect(gateway.broadcast).toHaveBeenCalledTimes(1);
  });

  it("never retries an unknown broadcast outcome", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    gateway.broadcastError = Object.assign(new Error("timeout"), { code: "TIMEOUT" });
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "blocked", status: "unknown" });
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "blocked", status: "unknown" });
    expect(gateway.sign).toHaveBeenCalledTimes(1);
    expect(gateway.broadcast).toHaveBeenCalledTimes(1);
  });

  it("accepts an external completion after a keeper outcome became unknown", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    gateway.broadcastError = Object.assign(new Error("timeout"), { code: "TIMEOUT" });
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "blocked", status: "unknown" });
    gateway.snapshot = dueSnapshot(RoundState.SETTLED);
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "idle" });
    expect((await journal.list())[0]).toMatchObject({ status: "obsolete", errorCode: "STATE_ADVANCED_EXTERNALLY" });
    expect(gateway.sign).toHaveBeenCalledTimes(1);
  });

  it("reconciles auto-entry with an exact account read hint outside any later scan page", async () => {
    const gateway = new FakeGateway();
    const account = "0x0000000000000000000000000000000000000033";
    gateway.snapshot = dueSnapshot(RoundState.SETTLED);
    gateway.snapshot = {
      ...gateway.snapshot,
      vaults: gateway.snapshot.vaults.map((vault) => ({
        ...vault,
        autoEntryCandidates: [{ account, enabled: true, availableCredit: 5n, registered: false }],
      })),
    };
    gateway.onBroadcast = async () => {
      gateway.snapshot = {
        ...gateway.snapshot,
        vaults: gateway.snapshot.vaults.map((vault) => ({
          ...vault,
          autoEntryCandidates: [{ account, enabled: true, availableCredit: 0n, registered: true }],
        })),
      };
      gateway.receipt = {
        hash: transactionHash,
        blockHash: `0x${"bb".repeat(32)}`,
        blockNumber: 11,
        status: 1,
        confirmations: 1,
      };
    };
    await expect(engine(gateway).runOnce()).resolves.toMatchObject({ outcome: "reconciled" });
    expect(gateway.snapshotHints).toContainEqual({
      vaultAddress: "0x0000000000000000000000000000000000000011",
      account,
      roundId: 2n,
    });
  });

  it("reconciles a crash-surviving prepared transaction from receipt and chain state", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    const action = planNextAction(gateway.snapshot)!;
    await journal.put(
      journalEntryForPrepared(
        action,
        { hash: transactionHash, nonce: 0, calldataHash },
        new Date("2026-08-29T00:00:00.000Z"),
      ),
    );
    gateway.snapshot = dueSnapshot(RoundState.SETTLED);
    gateway.receipt = {
      hash: transactionHash,
      blockHash: `0x${"bb".repeat(32)}`,
      blockNumber: 11,
      status: 1,
      confirmations: 2,
    };
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "idle" });
    expect((await journal.list())[0]?.status).toBe("reconciled");
    expect(gateway.sign).not.toHaveBeenCalled();
  });

  it("blocks when a surviving transaction is still pending", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    const action = planNextAction(gateway.snapshot)!;
    await journal.put(
      journalEntryForPrepared(
        action,
        { hash: transactionHash, nonce: 0, calldataHash },
        new Date("2026-08-30T00:00:00Z"),
      ),
    );
    gateway.transaction = { hash: transactionHash, nonce: 0 };
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({
      outcome: "blocked",
      status: "submitted",
    });
    expect(gateway.broadcast).not.toHaveBeenCalled();
  });

  it("does not reconcile or sequence dependent work before confirmation depth", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    const action = planNextAction(gateway.snapshot)!;
    await journal.put(
      journalEntryForPrepared(
        action,
        { hash: transactionHash, nonce: 0, calldataHash },
        new Date("2026-08-29T00:00:00Z"),
      ),
    );
    gateway.snapshot = dueSnapshot(RoundState.SETTLED);
    gateway.receipt = {
      hash: transactionHash,
      blockHash: `0x${"bb".repeat(32)}`,
      blockNumber: 11,
      status: 1,
      confirmations: 0,
    };
    await expect(engine(gateway, journal, { confirmations: 2 }).runOnce()).resolves.toMatchObject({
      outcome: "blocked",
      status: "confirmed",
    });
    expect((await journal.list())[0]).toMatchObject({ status: "confirmed", confirmations: 0 });
    expect((await journal.list())[0]?.history.at(-1)).toMatchObject({
      status: "confirmed",
      errorCode: "WAITING_CONFIRMATIONS",
    });
    expect(gateway.sign).not.toHaveBeenCalled();

    gateway.receipt = { ...gateway.receipt, confirmations: 2 };
    await expect(engine(gateway, journal, { confirmations: 2 }).runOnce()).resolves.toMatchObject({
      outcome: "idle",
    });
    expect((await journal.list())[0]?.status).toBe("reconciled");
  });

  it("marks a missing old transaction unknown and records nonce consumption", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    const action = planNextAction(gateway.snapshot)!;
    await journal.put(
      journalEntryForPrepared(
        action,
        { hash: transactionHash, nonce: 0, calldataHash },
        new Date("2026-08-29T00:00:00Z"),
      ),
    );
    gateway.latestNonce = 1;
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "blocked", status: "unknown" });
    expect((await journal.list())[0]?.errorCode).toBe("NONCE_CONSUMED_OUTCOME_UNKNOWN");
  });

  it("marks a dropped transaction unknown even when its nonce remains unused", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    const action = planNextAction(gateway.snapshot)!;
    await journal.put(
      journalEntryForPrepared(
        action,
        { hash: transactionHash, nonce: 0, calldataHash },
        new Date("2026-08-29T00:00:00Z"),
      ),
    );
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "blocked", status: "unknown" });
    expect((await journal.list())[0]?.errorCode).toBe("TX_OUTCOME_UNKNOWN");
    expect(gateway.broadcast).not.toHaveBeenCalled();
  });

  it("blocks a reverted receipt while authoritative state still requires the action", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    const action = planNextAction(gateway.snapshot)!;
    await journal.put(
      journalEntryForPrepared(
        action,
        { hash: transactionHash, nonce: 0, calldataHash },
        new Date("2026-08-29T00:00:00Z"),
      ),
    );
    gateway.receipt = {
      hash: transactionHash,
      blockHash: `0x${"bb".repeat(32)}`,
      blockNumber: 11,
      status: 0,
      confirmations: 2,
    };
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "blocked", status: "reverted" });
    expect((await journal.list())[0]).toMatchObject({
      status: "reverted",
      errorCode: "TRANSACTION_REVERTED",
      blockNumber: 11,
    });
    expect(gateway.sign).not.toHaveBeenCalled();
  });

  it("uses chain state to obsolete a missing receipt without issuing a duplicate write", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    const action = planNextAction(gateway.snapshot)!;
    await journal.put(
      journalEntryForPrepared(
        action,
        { hash: transactionHash, nonce: 0, calldataHash },
        new Date("2026-08-29T00:00:00Z"),
      ),
    );
    gateway.snapshot = dueSnapshot(RoundState.SETTLED);
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "idle" });
    expect((await journal.list())[0]?.status).toBe("obsolete");
    expect(gateway.sign).not.toHaveBeenCalled();
    expect(gateway.broadcast).not.toHaveBeenCalled();
  });

  it("preserves replay history when a previously confirmed action is reorged out", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    const action = planNextAction(gateway.snapshot)!;
    const old = journalEntryForPrepared(
      action,
      { hash: `0x${"33".repeat(32)}`, nonce: 0, calldataHash },
      new Date("2026-08-29T00:00:00Z"),
    );
    await journal.put({
      ...old,
      status: "submitted",
      updatedAt: "2026-08-29T00:00:01.000Z",
      history: [
        ...old.history,
        {
          status: "submitted",
          at: "2026-08-29T00:00:01.000Z",
        },
      ],
    });
    gateway.receipt = {
      hash: old.txHash,
      blockHash: `0x${"99".repeat(32)}`,
      blockNumber: 9,
      status: 1,
      confirmations: 0,
    };
    await expect(engine(gateway, journal, { confirmations: 2 }).runOnce()).resolves.toMatchObject({
      outcome: "blocked",
      status: "confirmed",
    });
    gateway.receipt = null;
    gateway.onBroadcast = async () => {
      gateway.snapshot = dueSnapshot(RoundState.AGGREGATE_FINALIZED);
      gateway.receipt = {
        hash: transactionHash,
        blockHash: `0x${"bb".repeat(32)}`,
        blockNumber: 11,
        status: 1,
        confirmations: 1,
      };
    };
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "reconciled" });
    expect(gateway.sign).toHaveBeenCalledTimes(1);
    expect(gateway.broadcast).toHaveBeenCalledTimes(1);
    const entries = await journal.list();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ status: "reorged", errorCode: "REORGED_TRANSACTION_DROPPED" });
    expect(entries[1]).toMatchObject({ status: "reconciled", replayOfAttemptId: entries[0]?.attemptId });
  });

  it("fails closed when an RPC reports a different hash for the signed transaction", async () => {
    const gateway = new FakeGateway();
    const journal = new MemoryJournalStore();
    gateway.broadcastHash = `0x${"44".repeat(32)}`;
    await expect(engine(gateway, journal).runOnce()).resolves.toMatchObject({ outcome: "blocked", status: "unknown" });
    expect((await journal.list())[0]).toMatchObject({ status: "unknown", txHash: transactionHash });
    expect(gateway.broadcast).toHaveBeenCalledTimes(1);
  });

  it("treats a raced stale action as idle after a failed simulation and fresh read", async () => {
    const gateway = new FakeGateway();
    gateway.simulateError = new Error("stale");
    gateway.onSimulate = () => {
      gateway.snapshot = dueSnapshot(RoundState.AGGREGATE_FINALIZED);
    };
    await expect(engine(gateway).runOnce()).resolves.toEqual({ outcome: "idle" });
    expect(gateway.sign).not.toHaveBeenCalled();
  });

  it("refuses a transaction whose populated maximum cost exceeds the balance", async () => {
    const gateway = new FakeGateway();
    gateway.balance = 100n;
    gateway.maximumCostWei = 101n;
    await expect(engine(gateway).runOnce()).rejects.toThrow("cannot cover");
    expect(gateway.broadcast).not.toHaveBeenCalled();
  });
});
