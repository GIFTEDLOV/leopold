import { describe, expect, it } from "vitest";

import {
  canPrepareVaultWithdrawal,
  getEffectiveVaultRoundStatus,
  isVaultRoundOpen,
  type VaultPublicState,
} from "../lib/leopold/reads";

function round(overrides: Partial<Pick<VaultPublicState, "state" | "opensAt" | "closesAt" | "stateLabel">> = {}) {
  return {
    state: 1,
    stateLabel: "Open",
    opensAt: 100n,
    closesAt: 200n,
    ...overrides,
  };
}

describe("effective vault round state", () => {
  it("keeps a stored OPEN round open only before closesAt", () => {
    const status = getEffectiveVaultRoundStatus(round(), 199n);
    expect(status).toEqual({ code: "OPEN", label: "Open", depositOpen: true });
    expect(isVaultRoundOpen(round(), 199n)).toBe(true);
  });

  it.each([200n, 201n])("ends a stored OPEN round at or after closesAt (%s)", (timestamp) => {
    const status = getEffectiveVaultRoundStatus(round(), timestamp);
    expect(status).toEqual({ code: "ENDED", label: "Round ended", depositOpen: false });
    expect(isVaultRoundOpen(round(), timestamp)).toBe(false);
  });

  it("uses the supplied latest block timestamp rather than browser time", () => {
    expect(getEffectiveVaultRoundStatus(round(), 150n).depositOpen).toBe(true);
    expect(getEffectiveVaultRoundStatus(round(), null)).toEqual({
      code: "UNAVAILABLE",
      label: "Checking round",
      depositOpen: false,
    });
  });

  it("does not call an expired round open when every overview card is expired", () => {
    const states = [round(), round(), round(), round()];
    const statuses = states.map((state) => getEffectiveVaultRoundStatus(state, 200n));
    expect(statuses.every((status) => !status.depositOpen)).toBe(true);
    expect(statuses.some((status) => status.label === "Open")).toBe(false);
  });

  it("gives overview and detail the identical effective deposit predicate", () => {
    const state = round();
    const overview = getEffectiveVaultRoundStatus(state, 200n);
    const detail = getEffectiveVaultRoundStatus(state, 200n);
    expect(overview).toEqual(detail);
    expect(overview.depositOpen).toBe(false);
  });

  it("fails closed before any expired-round transaction path can be entered", () => {
    const sendTransaction = () => {
      throw new Error("must not be called");
    };
    const status = getEffectiveVaultRoundStatus(round(), 201n);
    if (status.depositOpen) sendTransaction();
    expect(status.depositOpen).toBe(false);
  });

  it("preserves the stored lifecycle state after the time window closes", () => {
    expect(getEffectiveVaultRoundStatus(round({ state: 2, stateLabel: "Preparing draw" }), 201n)).toEqual({
      code: "SETTLEMENT",
      label: "Preparing draw",
      depositOpen: false,
    });
  });

  it("allows withdrawal preparation after expiry without making the expired round deposit-open", () => {
    expect(getEffectiveVaultRoundStatus(round(), 201n).depositOpen).toBe(false);
    expect(canPrepareVaultWithdrawal(round(), 201n)).toBe(true);
    expect(canPrepareVaultWithdrawal(round({ state: 2, stateLabel: "Preparing draw" }), 201n)).toBe(false);
  });
});
