import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  assertAgreedBlockIdentities,
  assertPinnedBlockIdentity,
  circularScanPage,
  MAX_ALLOWED_RPC_HEAD_LAG_BLOCKS,
  persistentCircularScanPage,
  requireCompleteBlockIdentity,
  selectCommonBlockHeight,
  verifySepoliaRpcIdentity,
} from "../src/ethers-gateway.js";
import { FileJournalStore, MemoryJournalStore } from "../src/journal.js";

describe("ethers gateway bounded scanning", () => {
  it("returns an empty stable page for an empty registry", () => {
    expect(circularScanPage(0n, 100n, 50)).toEqual({ indexes: [], nextCursor: 0n });
  });

  it("covers a large registry fairly in bounded circular pages", () => {
    const first = circularScanPage(120n, 0n, 50);
    const second = circularScanPage(120n, first.nextCursor, 50);
    const third = circularScanPage(120n, second.nextCursor, 50);
    expect(first.indexes).toEqual(Array.from({ length: 50 }, (_, index) => BigInt(index)));
    expect(second.indexes[0]).toBe(50n);
    expect(second.indexes.at(-1)).toBe(99n);
    expect(third.indexes.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, index) => BigInt(index + 100)));
    expect(third.indexes.slice(20)).toEqual(Array.from({ length: 30 }, (_, index) => BigInt(index)));
    expect(third.nextCursor).toBe(30n);
  });

  it("normalizes a stale cursor and rejects invalid bounds", () => {
    expect(circularScanPage(3n, 10n, 2)).toEqual({ indexes: [1n, 2n], nextCursor: 0n });
    expect(() => circularScanPage(-1n, 0n, 1)).toThrow("Invalid circular scan bounds");
    expect(() => circularScanPage(1n, 0n, 0)).toThrow("Invalid circular scan bounds");
  });

  it("requires every configured endpoint to identify Sepolia", async () => {
    const sepolia = { send: async () => "0xaa36a7" };
    await expect(verifySepoliaRpcIdentity([sepolia, sepolia])).resolves.toBe(11_155_111n);
    await expect(verifySepoliaRpcIdentity([sepolia, { send: async () => "0x1" }])).rejects.toThrow(
      "Every RPC endpoint must report Sepolia",
    );
    await expect(verifySepoliaRpcIdentity([{ send: async () => "not-chain-id" }])).rejects.toThrow(
      "invalid eth_chainId",
    );
  });

  it("fails closed on same-height block-hash or timestamp disagreement", () => {
    const first = { number: 123, hash: `0x${"11".repeat(32)}`, timestamp: 456 };
    expect(assertAgreedBlockIdentities([first, { ...first }])).toEqual(first);
    expect(() => assertAgreedBlockIdentities([first, { ...first, hash: `0x${"22".repeat(32)}` }])).toThrow("disagree");
    expect(() => assertAgreedBlockIdentities([first, { ...first, timestamp: 457 }])).toThrow("disagree");
  });

  it("pins the minimum common height when healthy heads are one block apart", () => {
    const common = { number: 123, hash: `0x${"11".repeat(32)}`, timestamp: 456 };
    const latest = [common, { number: 124, hash: `0x${"22".repeat(32)}`, timestamp: 468 }];
    expect(selectCommonBlockHeight([common, { ...common }])).toBe(123);
    expect(selectCommonBlockHeight(latest)).toBe(123);
    expect(assertPinnedBlockIdentity(common, [common, { ...common }])).toEqual(common);
  });

  it("allows a two-block head difference but rejects larger lag", () => {
    const first = { number: 123, hash: `0x${"11".repeat(32)}`, timestamp: 456 };
    expect(selectCommonBlockHeight([first, { ...first, number: 123 + MAX_ALLOWED_RPC_HEAD_LAG_BLOCKS }])).toBe(123);
    expect(() => selectCommonBlockHeight([first, { ...first, number: 126 }])).toThrow("head lag");
  });

  it("fails closed when the pinned common block cannot agree canonically", () => {
    const first = { number: 123, hash: `0x${"11".repeat(32)}`, timestamp: 456 };
    expect(() => assertPinnedBlockIdentity(first, [first, { ...first, hash: `0x${"22".repeat(32)}` }])).toThrow(
      "disagree",
    );
    expect(() => assertPinnedBlockIdentity(first, [first, { ...first, timestamp: 457 }])).toThrow("disagree");
  });

  it("fails closed when the pinned block changes during snapshot construction", () => {
    const expected = { number: 123, hash: `0x${"11".repeat(32)}`, timestamp: 456 };
    const reorganized = { number: 123, hash: `0x${"22".repeat(32)}`, timestamp: 456 };
    expect(() => assertPinnedBlockIdentity(expected, [reorganized, { ...reorganized }])).toThrow("reorganized");
  });

  it("fails closed when a provider cannot return the pinned block", () => {
    expect(() => requireCompleteBlockIdentity(null)).toThrow("complete block identity");
  });

  it("persists bounded scan cursors across keeper restart for thousands of accounts", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "leopold-scan-test-"));
    try {
      const journalPath = path.join(directory, "journal.json");
      const firstStore = new FileJournalStore(journalPath);
      const first = await persistentCircularScanPage(5_000n, "auto-entry:vault", 500, firstStore);
      expect(first.indexes).toHaveLength(500);
      expect(first.nextCursor).toBe(500n);

      const restartedStore = new FileJournalStore(journalPath);
      const second = await persistentCircularScanPage(5_000n, "auto-entry:vault", 500, restartedStore);
      expect(second.indexes[0]).toBe(500n);
      expect(second.indexes.at(-1)).toBe(999n);
      expect(await restartedStore.getCheckpoint("auto-entry:vault")).toBe("1000");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps an in-memory cursor bounded and deterministic for a large registry", async () => {
    const store = new MemoryJournalStore();
    const page = await persistentCircularScanPage(10_000n, "historical:vault", 50, store);
    expect(page.indexes).toHaveLength(50);
    expect(await store.getCheckpoint("historical:vault")).toBe("50");
  });
});
