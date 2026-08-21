import { describe, expect, it, vi } from "vitest";

import { getMetricSnapshot, resetMetricSnapshotForTests } from "../lib/ops/metrics";
import {
  ReadTimeoutError,
  exponentialBackoffMs,
  submitFinancialWriteOnce,
  withReadReliability,
} from "../lib/ops/reliability";

describe("bounded read reliability", () => {
  it("uses at most three attempts with deterministic exponential backoff", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new Error("network connection reset"))
      .mockResolvedValue("ready");
    const sleeps: number[] = [];

    await expect(
      withReadReliability(() => read(), {
        operation: "RPC_HEALTH",
        timeoutMs: 100,
        baseDelayMs: 100,
        jitterRatio: 0,
        sleep: async (duration) => {
          sleeps.push(duration);
        },
      }),
    ).resolves.toBe("ready");

    expect(read).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([100, 200]);
    expect(exponentialBackoffMs(3, 100, 0)).toBe(400);
  });

  it("times out a stalled read and terminates at the configured bound", async () => {
    const read = vi.fn(() => new Promise<never>(() => undefined));

    await expect(
      withReadReliability(() => read(), {
        operation: "RPC_HEALTH",
        timeoutMs: 5,
        maxAttempts: 1,
      }),
    ).rejects.toBeInstanceOf(ReadTimeoutError);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not retry deterministic failures", async () => {
    const read = vi.fn().mockRejectedValue(new Error("CONFIGURATION_MISMATCH:manifest"));
    const sleep = vi.fn();

    await expect(
      withReadReliability(() => read(), {
        operation: "DEPLOYMENT_READ",
        sleep,
      }),
    ).rejects.toThrow("CONFIGURATION_MISMATCH");
    expect(read).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("never retries a financial write", async () => {
    const write = vi.fn().mockRejectedValue(new Error("wallet submission failed"));

    await expect(submitFinancialWriteOnce(write)).rejects.toThrow("wallet submission failed");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("records only fixed aggregate fields and no confidential values or PII", async () => {
    resetMetricSnapshotForTests();
    await withReadReliability(async () => "ok", { operation: "VAULT_READ" });
    const snapshot = getMetricSnapshot();

    expect(snapshot).toHaveLength(1);
    expect(Object.keys(snapshot[0]).sort()).toEqual(
      ["count", "failureCategory", "maximumDurationMs", "operation", "outcome", "totalDurationMs"].sort(),
    );
    const serialized = JSON.stringify(snapshot).toLowerCase();
    for (const forbidden of [
      "ciphertext",
      "proof",
      "balance",
      "twab",
      "ticket",
      "winner",
      "winnings",
      "email",
      "username",
      "walletaddress",
      "token",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
