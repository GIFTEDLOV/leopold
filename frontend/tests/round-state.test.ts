import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";

import {
  canPrepareVaultWithdrawal,
  getEffectiveVaultPublicPrize,
  getEffectiveVaultRoundStatus,
  isVaultRoundOpen,
  readVaultPublicHistory,
  readVaultPublicState,
  SETTLED_ROUND_STATE,
  type VaultPublicState,
} from "../lib/leopold/reads";
import { leopoldConfig } from "../lib/leopold/config";

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

  it("projects an open round's sponsored prize into the UI reserve", () => {
    const state = {
      ...round(),
      publicPrize: 0n,
      publicSponsoredPrize: 100_000n,
    };

    expect(getEffectiveVaultPublicPrize(state, 150n)).toBe(100_000n);
    expect(getEffectiveVaultPublicPrize(state, 200n)).toBe(0n);
  });

  it("reads the sponsored accumulator that the controller uses for the card reserve", async () => {
    const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case "activeRoundId":
          return 1n;
        case "roundInfo":
          return [100n, 200n, 1, 0n, 0n, 0n, 0n, 0n] as const;
        case "publicSponsoredPrize":
          return 100_000n;
        case "isRegistered":
        case "refundClaimed":
          return false;
        case "eligibilityStart":
          return 0n;
        case "BOND_AMOUNT":
          return 5_000_000_000_000_000n;
        case "REFUND_PER_COMPLETED_PARTICIPANT":
          return 0n;
        case "settlementRewardCredit":
          return 0n;
        default:
          throw new Error(`Unexpected read: ${functionName}`);
      }
    });
    const state = await readVaultPublicState(
      { readContract } as unknown as PublicClient,
      leopoldConfig.vaults[0],
      "0x1111111111111111111111111111111111111111",
      123n,
    );

    expect(state.publicPrize).toBe(0n);
    expect(state.publicSponsoredPrize).toBe(100_000n);
    expect(getEffectiveVaultPublicPrize(state, 150n)).toBe(100_000n);
  });

  it("reads the active round and settled historical round from authoritative state", async () => {
    const account = "0x1111111111111111111111111111111111111111" as const;
    const readContract = vi.fn(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      const roundId = args?.[0] as bigint | undefined;
      switch (functionName) {
        case "activeRoundId":
          return 2n;
        case "roundInfo":
          return roundId === 1n
            ? ([100n, 200n, SETTLED_ROUND_STATE, 711_888_000_000n, 100_000n, 2n, 2n, 2n] as const)
            : ([200n, 300n, 1, 0n, 0n, 0n, 0n, 0n] as const);
        case "publicSponsoredPrize":
          return roundId === 1n ? 100_000n : 0n;
        case "isRegistered":
          return roundId === 1n;
        case "eligibilityStart":
          return roundId === 1n ? 150n : 0n;
        case "BOND_AMOUNT":
          return 5_000_000_000_000_000n;
        case "REFUND_PER_COMPLETED_PARTICIPANT":
          return 2_500_000_000_000_000n;
        case "refundClaimed":
          return false;
        case "settlementRewardCredit":
          return 5_000_000_000_000_000n;
        default:
          throw new Error(`Unexpected read: ${functionName}`);
      }
    });

    const rounds = await readVaultPublicHistory(
      { readContract } as unknown as PublicClient,
      leopoldConfig.vaults.find((vault) => vault.slug === "weekly")!,
      account,
      999n,
    );

    expect(rounds.map((state) => state.roundId)).toEqual([1n, 2n]);
    expect(rounds[0]).toMatchObject({
      roundId: 1n,
      state: SETTLED_ROUND_STATE,
      entered: true,
      publicPrize: 100_000n,
      publicSponsoredPrize: 100_000n,
    });
    expect(rounds[1]).toMatchObject({ roundId: 2n, state: 1, entered: false });
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "activeRoundId", blockNumber: 999n }),
    );
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
