import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { acquireKeeperProcessLock, FileJournalStore, journalEntryForPrepared } from "../src/journal.js";
import type { LifecycleAction } from "../src/lifecycle.js";

const temporaryDirectories: string[] = [];
const action: LifecycleAction = {
  key: "vault:1:close-round:100",
  kind: "close-round",
  vault: {
    id: 1,
    name: "Daily",
    cadence: "DAILY",
    address: "0x0000000000000000000000000000000000000011",
    bondEscrow: "0x0000000000000000000000000000000000000022",
  },
  roundId: 1n,
};
const hash = `0x${"11".repeat(32)}`;
const calldataHash = `0x${"22".repeat(32)}`;

async function temporaryPath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "leopold-keeper-test-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "journal.json");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("keeper durable journal", () => {
  it("writes a validated private journal atomically and appends status history by attempt", async () => {
    const journalPath = await temporaryPath();
    const store = new FileJournalStore(journalPath);
    const prepared = journalEntryForPrepared(
      action,
      { hash, nonce: 7, calldataHash },
      new Date("2026-08-30T00:00:00.000Z"),
    );
    await store.put(prepared);
    await store.put({
      ...prepared,
      status: "submitted",
      updatedAt: "2026-08-30T00:00:01.000Z",
      history: [...prepared.history, { status: "submitted", at: "2026-08-30T00:00:01.000Z" }],
    });

    expect(await store.list()).toEqual([
      {
        ...prepared,
        status: "submitted",
        updatedAt: "2026-08-30T00:00:01.000Z",
        history: [...prepared.history, { status: "submitted", at: "2026-08-30T00:00:01.000Z" }],
      },
    ]);
    expect((await stat(journalPath)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(journalPath, "utf8"))).toMatchObject({
      schema: "leopold.keeper-journal.v3",
      checkpoints: {},
    });
  });

  it("rejects malformed or legacy journal documents instead of guessing", async () => {
    const journalPath = await temporaryPath();
    await writeFile(journalPath, JSON.stringify({ schema: "leopold.keeper-journal.v1", entries: [] }));
    await expect(new FileJournalStore(journalPath).list()).rejects.toThrow();
    await writeFile(journalPath, JSON.stringify({ schema: "leopold.keeper-journal.v2", entries: [{}] }));
    await expect(new FileJournalStore(journalPath).list()).rejects.toThrow();
  });

  it("fails closed on partial writes, duplicate keys, and action/account/cursor mismatches", async () => {
    const journalPath = await temporaryPath();
    const prepared = journalEntryForPrepared(
      action,
      { hash, nonce: 7, calldataHash },
      new Date("2026-08-30T00:00:00.000Z"),
    );
    await writeFile(journalPath, '{"schema":"leopold.keeper-journal.v3","entries":[');
    await expect(new FileJournalStore(journalPath).list()).rejects.toThrow();

    await writeFile(
      journalPath,
      JSON.stringify({ schema: "leopold.keeper-journal.v3", entries: [prepared, prepared], checkpoints: {} }),
    );
    await expect(new FileJournalStore(journalPath).list()).rejects.toThrow("Duplicate attempt id");

    await writeFile(
      journalPath,
      JSON.stringify({
        schema: "leopold.keeper-journal.v3",
        entries: [{ ...prepared, account: "0x0000000000000000000000000000000000000033" }],
        checkpoints: {},
      }),
    );
    await expect(new FileJournalStore(journalPath).list()).rejects.toThrow("Account presence");

    await writeFile(
      journalPath,
      JSON.stringify({ schema: "leopold.keeper-journal.v3", entries: [{ ...prepared, cursor: "0" }], checkpoints: {} }),
    );
    await expect(new FileJournalStore(journalPath).list()).rejects.toThrow("Cursor presence");
  });

  it("allows only one keeper process and requires explicit stale-lock handling", async () => {
    const journalPath = await temporaryPath();
    const release = await acquireKeeperProcessLock(journalPath);
    await expect(acquireKeeperProcessLock(journalPath)).rejects.toThrow("process lock already exists");
    const lock = JSON.parse(await readFile(`${journalPath}.lock`, "utf8")) as { pid: number; acquiredAt: string };
    expect(lock.pid).toBe(process.pid);
    expect(lock.acquiredAt).toMatch(/^\d{4}-/u);
    await release();
    const releaseAgain = await acquireKeeperProcessLock(journalPath);
    await releaseAgain();
  });

  it("preserves a replay attempt and its parent forensic history", async () => {
    const journalPath = await temporaryPath();
    const store = new FileJournalStore(journalPath);
    const original = journalEntryForPrepared(
      action,
      { hash, nonce: 7, calldataHash },
      new Date("2026-08-30T00:00:00.000Z"),
    );
    const originalReorged = {
      ...original,
      status: "reorged" as const,
      updatedAt: "2026-08-30T00:00:01.000Z",
      errorCode: "REORGED_TRANSACTION_DROPPED",
      history: [
        ...original.history,
        {
          status: "reorged" as const,
          at: "2026-08-30T00:00:01.000Z",
          errorCode: "REORGED_TRANSACTION_DROPPED",
        },
      ],
    };
    await store.put(originalReorged);
    const replay = journalEntryForPrepared(
      action,
      { hash: `0x${"33".repeat(32)}`, nonce: 7, calldataHash },
      new Date("2026-08-30T00:00:02.000Z"),
      original.attemptId,
    );
    await store.put(replay);
    const entries = await store.list();
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ replayOfAttemptId: original.attemptId });
    expect(entries[0]).toMatchObject({ status: "reorged", errorCode: "REORGED_TRANSACTION_DROPPED" });
  });

  it("serializes concurrent multi-vault checkpoint writes without losing cursors", async () => {
    const journalPath = await temporaryPath();
    const store = new FileJournalStore(journalPath);
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.putCheckpoint(`vault-${index}`, String(index + 1))),
    );
    const restarted = new FileJournalStore(journalPath);
    await expect(
      Promise.all(Array.from({ length: 20 }, (_, index) => restarted.getCheckpoint(`vault-${index}`))),
    ).resolves.toEqual(Array.from({ length: 20 }, (_, index) => String(index + 1)));
  });
});
