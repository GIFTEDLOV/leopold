import { describe, expect, it, vi } from "vitest";

import { prepareWithdrawalRound, type WithdrawalRoundSnapshot } from "../lib/leopold/withdrawal";

const open: WithdrawalRoundSnapshot = { canWithdrawNow: true, canPrepareWithdrawal: true, reason: "Open" };
const expired: WithdrawalRoundSnapshot = {
  canWithdrawNow: false,
  canPrepareWithdrawal: true,
  reason: "Round ended",
};

function run(reads: WithdrawalRoundSnapshot[], advanceRound: () => Promise<unknown> = vi.fn(async () => undefined)) {
  const readRound = vi.fn(async () => {
    const next = reads.shift();
    if (!next) throw new Error("missing test snapshot");
    return next;
  });
  const stages: string[] = [];
  return {
    readRound,
    advanceRound,
    stages,
    promise: prepareWithdrawalRound({ readRound, advanceRound, onStage: (stage) => stages.push(stage) }),
  };
}

describe("expired-round withdrawal orchestration", () => {
  it("withdraws directly when the active round is open", async () => {
    const probe = run([open]);
    await expect(probe.promise).resolves.toEqual(open);
    expect(probe.advanceRound).not.toHaveBeenCalled();
    expect(probe.stages).toEqual(["withdraw-round-check"]);
  });

  it("advances an expired active round, refreshes, then permits withdrawal", async () => {
    const probe = run([expired, open]);
    await expect(probe.promise).resolves.toEqual(open);
    expect(probe.advanceRound).toHaveBeenCalledOnce();
    expect(probe.stages).toEqual(["withdraw-round-check", "withdraw-refresh"]);
  });

  it("accepts a permissionless race only after a fresh open-round read", async () => {
    const advanceRound = vi.fn(async () => {
      throw new Error("WITHDRAW:ROUND_ADVANCE_RECEIPT: InvalidRoundState");
    });
    const probe = run([expired, open], advanceRound);
    await expect(probe.promise).resolves.toEqual(open);
    expect(advanceRound).toHaveBeenCalledOnce();
    expect(probe.readRound).toHaveBeenCalledTimes(2);
  });

  it("does not swallow an unrelated close failure or proceed to withdrawal", async () => {
    const failure = new Error("WITHDRAW:ROUND_ADVANCE_SIMULATION: RPC unavailable");
    const advanceRound = vi.fn(async () => {
      throw failure;
    });
    const probe = run([expired, expired], advanceRound);
    await expect(probe.promise).rejects.toBe(failure);
    expect(advanceRound).toHaveBeenCalledOnce();
  });

  it("fails closed when the refreshed round is still not open", async () => {
    const probe = run([expired, expired]);
    await expect(probe.promise).rejects.toThrow("WITHDRAW:REFRESH: active round is not open");
    expect(probe.advanceRound).toHaveBeenCalledOnce();
  });

  it("does not attempt round advancement when withdrawal preparation is unavailable", async () => {
    const unavailable: WithdrawalRoundSnapshot = {
      canWithdrawNow: false,
      canPrepareWithdrawal: false,
      reason: "Round unavailable",
    };
    const probe = run([unavailable]);
    await expect(probe.promise).rejects.toThrow("WITHDRAW:ROUND_CHECK: Round unavailable");
    expect(probe.advanceRound).not.toHaveBeenCalled();
  });
});
