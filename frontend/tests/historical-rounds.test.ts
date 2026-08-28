import { describe, expect, it } from "vitest";

import { leopoldConfig } from "../lib/leopold/config";
import { projectCompletedVaultRounds } from "../lib/leopold/history";
import { SETTLED_ROUND_STATE, type VaultPublicState } from "../lib/leopold/reads";

function roundState(overrides: Partial<VaultPublicState>): VaultPublicState {
  return {
    roundId: 1n,
    opensAt: 100n,
    closesAt: 200n,
    state: SETTLED_ROUND_STATE,
    stateLabel: "Settled",
    publicPrize: 100_000n,
    publicSponsoredPrize: 100_000n,
    participantCount: 2n,
    selectionCursor: 2n,
    allocationCursor: 2n,
    entered: true,
    eligibilityStart: 150n,
    bondAmount: 5_000_000_000_000_000n,
    refundAmount: 2_500_000_000_000_000n,
    refundClaimed: false,
    settlementReward: 5_000_000_000_000_000n,
    ...overrides,
  };
}

describe("completed historical round projection", () => {
  it("includes entered Weekly round 1 while leaving active round 2 out", () => {
    const completed = projectCompletedVaultRounds(
      leopoldConfig.vaults,
      {
        weekly: [
          roundState({ roundId: 1n }),
          roundState({
            roundId: 2n,
            state: 1,
            stateLabel: "Open",
            opensAt: 200n,
            closesAt: 300n,
            publicPrize: 0n,
            publicSponsoredPrize: 0n,
            participantCount: 0n,
            selectionCursor: 0n,
            allocationCursor: 0n,
            entered: false,
            eligibilityStart: 0n,
            refundAmount: 0n,
            refundClaimed: false,
            settlementReward: 0n,
          }),
        ],
      },
      250n,
    );

    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      vaultId: "weekly",
      roundId: 1n,
      state: SETTLED_ROUND_STATE,
      entered: true,
      eligibilityRevealReady: true,
      resultRevealReady: true,
      storedPrize: 100_000n,
      publicPrizeReserve: 100_000n,
    });
  });
});
