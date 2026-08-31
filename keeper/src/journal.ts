import { mkdir, open, readFile, rename, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { LifecycleAction } from "./lifecycle.js";

export type JournalStatus =
  | "prepared"
  | "submitted"
  | "confirmed"
  | "reconciled"
  | "obsolete"
  | "reorged"
  | "reverted"
  | "unknown";

export type JournalTransition = {
  readonly status: JournalStatus;
  readonly at: string;
  readonly blockNumber?: number;
  readonly blockHash?: string;
  readonly confirmations?: number;
  readonly errorCode?: string;
};

export type JournalEntry = {
  readonly attemptId: string;
  readonly replayOfAttemptId?: string;
  readonly actionKey: string;
  readonly vault: string;
  readonly vaultName: string;
  readonly roundId: string;
  readonly action: LifecycleAction["kind"];
  readonly cursor?: string;
  readonly account?: string;
  readonly txHash: string;
  readonly calldataHash: string;
  readonly nonce: number;
  readonly submittedAt: string;
  readonly updatedAt: string;
  readonly status: JournalStatus;
  readonly blockNumber?: number;
  readonly blockHash?: string;
  readonly confirmations?: number;
  readonly errorCode?: string;
  readonly history: readonly JournalTransition[];
};

type JournalDocument = {
  readonly schema: "leopold.keeper-journal.v3";
  readonly entries: readonly JournalEntry[];
  readonly checkpoints: Readonly<Record<string, string>>;
};

export interface JournalStore {
  list(): Promise<readonly JournalEntry[]>;
  put(entry: JournalEntry): Promise<void>;
  getCheckpoint(key: string): Promise<string | undefined>;
  putCheckpoint(key: string, value: string): Promise<void>;
}

function emptyJournal(): JournalDocument {
  return { schema: "leopold.keeper-journal.v3", entries: [], checkpoints: {} };
}

const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);
const journalStatusSchema = z.enum([
  "prepared",
  "submitted",
  "confirmed",
  "reconciled",
  "obsolete",
  "reorged",
  "reverted",
  "unknown",
]);
const journalTransitionSchema = z.object({
  status: journalStatusSchema,
  at: z.iso.datetime(),
  blockNumber: z.number().int().nonnegative().optional(),
  blockHash: hashSchema.optional(),
  confirmations: z.number().int().nonnegative().optional(),
  errorCode: z.string().max(120).optional(),
});

const journalEntrySchema = z
  .object({
    attemptId: z.string().min(1),
    replayOfAttemptId: z.string().min(1).optional(),
    actionKey: z.string().min(1),
    vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/u),
    vaultName: z.string().min(1),
    roundId: z.string().regex(/^\d+$/u),
    action: z.enum([
      "register-auto-entry",
      "prune-auto-entry",
      "close-round",
      "finalize-aggregate",
      "settle-empty-round",
      "generate-random-candidate",
      "finalize-candidate-validity",
      "process-selection",
      "finalize-reconciliation",
      "recover-failed-reconciliation",
      "process-allocation",
      "finalize-settlement",
    ]),
    cursor: z.string().regex(/^\d+$/u).optional(),
    account: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/u)
      .optional(),
    txHash: hashSchema,
    calldataHash: hashSchema,
    nonce: z.number().int().nonnegative(),
    submittedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    status: journalStatusSchema,
    blockNumber: z.number().int().nonnegative().optional(),
    blockHash: hashSchema.optional(),
    confirmations: z.number().int().nonnegative().optional(),
    errorCode: z.string().max(120).optional(),
    history: z.array(journalTransitionSchema).min(1),
  })
  .superRefine((entry, context) => {
    const cursorAction = entry.action === "process-selection" || entry.action === "process-allocation";
    if (cursorAction !== (entry.cursor !== undefined)) {
      context.addIssue({ code: "custom", path: ["cursor"], message: "Cursor presence does not match journal action" });
    }
    const accountAction = entry.action === "register-auto-entry" || entry.action === "prune-auto-entry";
    if (accountAction !== (entry.account !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["account"],
        message: "Account presence does not match journal action",
      });
    }
    const latest = entry.history.at(-1);
    if (!latest || latest.status !== entry.status || latest.at !== entry.updatedAt) {
      context.addIssue({ code: "custom", path: ["history"], message: "Latest transition does not match entry state" });
    }
    if (entry.attemptId !== `${entry.actionKey}:${entry.txHash.toLowerCase()}`) {
      context.addIssue({ code: "custom", path: ["attemptId"], message: "Attempt id is not canonical" });
    }
  });

const journalDocumentSchema = z
  .object({
    schema: z.literal("leopold.keeper-journal.v3"),
    entries: z.array(journalEntrySchema),
    checkpoints: z.record(z.string().min(1), z.string()),
  })
  .superRefine((document, context) => {
    const attempts = new Set<string>();
    const transactionHashes = new Set<string>();
    for (const [index, entry] of document.entries.entries()) {
      if (attempts.has(entry.attemptId)) {
        context.addIssue({ code: "custom", path: ["entries", index, "attemptId"], message: "Duplicate attempt id" });
      }
      attempts.add(entry.attemptId);
      const transactionHash = entry.txHash.toLowerCase();
      if (transactionHashes.has(transactionHash)) {
        context.addIssue({ code: "custom", path: ["entries", index, "txHash"], message: "Duplicate transaction hash" });
      }
      transactionHashes.add(transactionHash);
      if (
        entry.replayOfAttemptId &&
        !document.entries.some((candidate) => candidate.attemptId === entry.replayOfAttemptId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "replayOfAttemptId"],
          message: "Replay parent is missing",
        });
      }
    }
  });

function parseJournal(value: unknown): JournalDocument {
  return journalDocumentSchema.parse(value) as JournalDocument;
}

export class FileJournalStore implements JournalStore {
  readonly #journalPath: string;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(journalPath: string) {
    this.#journalPath = path.resolve(journalPath);
  }

  async #read(): Promise<JournalDocument> {
    try {
      return parseJournal(JSON.parse(await readFile(this.#journalPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyJournal();
      throw error;
    }
  }

  async list(): Promise<readonly JournalEntry[]> {
    return (await this.#read()).entries;
  }

  async put(entry: JournalEntry): Promise<void> {
    await this.#exclusive(async () => {
      const current = await this.#read();
      const parsedEntry = journalEntrySchema.parse(entry) as JournalEntry;
      const previous = current.entries.find((candidate) => candidate.attemptId === parsedEntry.attemptId);
      if (previous) assertAppendOnlyUpdate(previous, parsedEntry);
      const entries = current.entries.filter((candidate) => candidate.attemptId !== parsedEntry.attemptId);
      const next: JournalDocument = { ...current, entries: [...entries, parsedEntry] };
      await this.#write(parseJournal(next));
    });
  }

  async getCheckpoint(key: string): Promise<string | undefined> {
    return (await this.#read()).checkpoints[key];
  }

  async putCheckpoint(key: string, value: string): Promise<void> {
    if (key.length === 0) throw new Error("Checkpoint key must not be empty");
    await this.#exclusive(async () => {
      const current = await this.#read();
      await this.#write(parseJournal({ ...current, checkpoints: { ...current.checkpoints, [key]: value } }));
    });
  }

  async #exclusive(operation: () => Promise<void>): Promise<void> {
    const previous = this.#writeQueue;
    let release!: () => void;
    this.#writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await operation();
    } finally {
      release();
    }
  }

  async #write(next: JournalDocument): Promise<void> {
    await mkdir(path.dirname(this.#journalPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.#journalPath}.tmp-${process.pid}`;
    const temporary = await open(temporaryPath, "wx", 0o600);
    try {
      await temporary.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await rename(temporaryPath, this.#journalPath);
    const directory = await open(path.dirname(this.#journalPath), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}

export class MemoryJournalStore implements JournalStore {
  readonly #entries = new Map<string, JournalEntry>();
  readonly #checkpoints = new Map<string, string>();

  async list(): Promise<readonly JournalEntry[]> {
    return [...this.#entries.values()];
  }

  async put(entry: JournalEntry): Promise<void> {
    const parsedEntry = journalEntrySchema.parse(entry) as JournalEntry;
    const previous = this.#entries.get(parsedEntry.attemptId);
    if (previous) assertAppendOnlyUpdate(previous, parsedEntry);
    this.#entries.set(parsedEntry.attemptId, parsedEntry);
  }

  async getCheckpoint(key: string): Promise<string | undefined> {
    return this.#checkpoints.get(key);
  }

  async putCheckpoint(key: string, value: string): Promise<void> {
    if (key.length === 0) throw new Error("Checkpoint key must not be empty");
    this.#checkpoints.set(key, value);
  }
}

function assertAppendOnlyUpdate(previous: JournalEntry, next: JournalEntry): void {
  const immutableKeys = [
    "attemptId",
    "replayOfAttemptId",
    "actionKey",
    "vault",
    "vaultName",
    "roundId",
    "action",
    "cursor",
    "account",
    "txHash",
    "calldataHash",
    "nonce",
    "submittedAt",
  ] as const;
  for (const key of immutableKeys) {
    if (previous[key] !== next[key]) throw new Error(`Journal immutable field changed: ${key}`);
  }
  if (next.history.length < previous.history.length) throw new Error("Journal transition history was truncated");
  for (const [index, transition] of previous.history.entries()) {
    if (JSON.stringify(transition) !== JSON.stringify(next.history[index])) {
      throw new Error("Journal transition history is not append-only");
    }
  }
}

/** A crash leaves the lock in place intentionally; an operator must reconcile the journal before removing it. */
export async function acquireKeeperProcessLock(journalPath: string): Promise<() => Promise<void>> {
  const lockPath = `${path.resolve(journalPath)}.lock`;
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  let handle: FileHandle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Keeper process lock already exists: ${lockPath}`);
    }
    throw error;
  }
  await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, "utf8");
  await handle.sync();
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await handle.close();
    await unlink(lockPath);
  };
}

export function journalEntryForPrepared(
  action: LifecycleAction,
  transaction: { readonly hash: string; readonly nonce: number; readonly calldataHash: string },
  now: Date,
  replayOfAttemptId?: string,
): JournalEntry {
  const timestamp = now.toISOString();
  const attemptId = `${action.key}:${transaction.hash.toLowerCase()}`;
  return {
    attemptId,
    ...(replayOfAttemptId === undefined ? {} : { replayOfAttemptId }),
    actionKey: action.key,
    vault: action.vault.address,
    vaultName: action.vault.name,
    roundId: action.roundId.toString(),
    action: action.kind,
    ...(action.cursor === undefined ? {} : { cursor: action.cursor.toString() }),
    ...(action.account === undefined ? {} : { account: action.account }),
    txHash: transaction.hash,
    calldataHash: transaction.calldataHash,
    nonce: transaction.nonce,
    submittedAt: timestamp,
    updatedAt: timestamp,
    status: "prepared",
    history: [{ status: "prepared", at: timestamp }],
  };
}
