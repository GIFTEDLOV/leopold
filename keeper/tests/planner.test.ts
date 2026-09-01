import { describe, expect, it } from "vitest";

import type { ProtocolSnapshot, RoundSnapshot, VaultSnapshot } from "../src/lifecycle.js";
import { RoundState } from "../src/lifecycle.js";
import { actionChunkSize, isActionRequired, planNextAction } from "../src/planner.js";

const vaultAddress = "0x0000000000000000000000000000000000000011";
const escrowAddress = "0x0000000000000000000000000000000000000022";
const account = "0x0000000000000000000000000000000000000033";

function round(roundId: bigint, state: RoundState, overrides: Partial<RoundSnapshot> = {}): RoundSnapshot {
  return {
    roundId,
    opensAt: roundId * 100n,
    closesAt: roundId * 100n + 90n,
    state,
    publicAggregateTwab: 1n,
    publicPrize: 1n,
    participantCount: 8n,
    selectionCursor: 0n,
    allocationCursor: 0n,
    ...overrides,
  };
}

function snapshot(historical: RoundSnapshot, active = round(2n, RoundState.OPEN)): ProtocolSnapshot {
  const vault: VaultSnapshot = {
    vault: {
      id: 1,
      name: "Daily",
      cadence: "DAILY",
      address: vaultAddress,
      bondEscrow: escrowAddress,
      automaticEntry: true,
    },
    activeRoundId: active.roundId,
    bondAmount: 5n,
    autoEntryCandidates: [],
    rounds: [historical, active],
  };
  return {
    chainId: 11_155_111n,
    blockNumber: 10n,
    blockHash: `0x${"aa".repeat(32)}`,
    blockTimestamp: 150n,
    vaults: [vault],
  };
}

describe("lifecycle planner", () => {
  const expected = new Map<RoundState, string | null>([
    [RoundState.UNINITIALIZED, null],
    [RoundState.OPEN, null],
    [RoundState.AGGREGATE_PENDING, "finalize-aggregate"],
    [RoundState.AGGREGATE_FINALIZED, "generate-random-candidate"],
    [RoundState.EMPTY, "settle-empty-round"],
    [RoundState.CANDIDATE_VALIDITY_PENDING, "finalize-candidate-validity"],
    [RoundState.CANDIDATE_REJECTED, "generate-random-candidate"],
    [RoundState.TICKET_ACCEPTED, "process-selection"],
    [RoundState.WINNER_PROCESSING, "process-selection"],
    [RoundState.WINNINGS_ALLOCATED, "finalize-settlement"],
    [RoundState.SETTLED, null],
    [RoundState.RECONCILIATION_PENDING, "finalize-reconciliation"],
    [RoundState.RECONCILIATION_FAILED, "recover-failed-reconciliation"],
    [RoundState.READY_TO_ALLOCATE, "process-allocation"],
    [RoundState.ALLOCATION_PROCESSING, "process-allocation"],
  ]);

  for (const [state, kind] of expected) {
    it(`maps round state ${RoundState[state]} to ${kind ?? "idle"}`, () => {
      const action = planNextAction(snapshot(round(1n, state)));
      expect(action?.kind ?? null).toBe(kind);
      if (action) expect(isActionRequired(snapshot(round(1n, state)), action)).toBe(true);
    });
  }

  it("closes an expired active round before auto-entry or historical allocation", () => {
    const state = snapshot(round(1n, RoundState.READY_TO_ALLOCATE), round(2n, RoundState.OPEN));
    const expired = {
      ...state,
      blockTimestamp: 290n,
      vaults: state.vaults.map((vault) => ({
        ...vault,
        autoEntryCandidates: [{ account, enabled: true, availableCredit: 5n, registered: false }],
      })),
    };
    expect(planNextAction(expired)?.kind).toBe("close-round");
  });

  it("registers an eligible funded wallet before historical settlement work", () => {
    const state = snapshot(round(1n, RoundState.AGGREGATE_PENDING));
    const withCandidate = {
      ...state,
      vaults: state.vaults.map((vault) => ({
        ...vault,
        autoEntryCandidates: [{ account, enabled: true, availableCredit: 5n, registered: false }],
      })),
    };
    const action = planNextAction(withCandidate);
    expect(action).toMatchObject({ kind: "register-auto-entry", account, roundId: 2n });
    expect(isActionRequired(withCandidate, action!)).toBe(true);
  });

  it("skips disabled, underfunded, and already-registered auto-entry accounts", () => {
    const state = snapshot(round(1n, RoundState.AGGREGATE_PENDING));
    const blocked = {
      ...state,
      vaults: state.vaults.map((vault) => ({
        ...vault,
        autoEntryCandidates: [
          { account, enabled: false, availableCredit: 5n, registered: false },
          { account: vaultAddress, enabled: true, availableCredit: 4n, registered: false },
          { account: escrowAddress, enabled: true, availableCredit: 5n, registered: true },
        ],
      })),
    };
    expect(planNextAction(blocked)?.kind).toBe("prune-auto-entry");
  });

  it("does not prune an account whose enablement is scheduled for a future boundary", () => {
    const state = snapshot(round(1n, RoundState.AGGREGATE_PENDING));
    const withFutureEnablement = {
      ...state,
      vaults: state.vaults.map((vault) => ({
        ...vault,
        autoEntryCandidates: [
          { account, enabled: false, prospectivelyEnabled: true, availableCredit: 5n, registered: false },
        ],
      })),
    };
    expect(planNextAction(withFutureEnablement)?.kind).toBe("finalize-aggregate");
  });

  it("binds cursor actions to the exact cursor and bounded chunk", () => {
    const state = snapshot(round(1n, RoundState.WINNER_PROCESSING, { selectionCursor: 4n }));
    const action = planNextAction(state)!;
    expect(action.cursor).toBe(4n);
    expect(actionChunkSize(action)).toBe(4n);
    const advanced = {
      ...state,
      vaults: state.vaults.map((vault) => ({
        ...vault,
        rounds: vault.rounds.map((item) =>
          item.roundId === 1n ? { ...item, selectionCursor: 8n, state: RoundState.RECONCILIATION_PENDING } : item,
        ),
      })),
    };
    expect(isActionRequired(advanced, action)).toBe(false);
  });

  it("uses the oldest unfinished historical round", () => {
    const state = snapshot(round(1n, RoundState.AGGREGATE_PENDING));
    const vault = state.vaults[0]!;
    const withTwo = {
      ...state,
      vaults: [
        {
          ...vault,
          activeRoundId: 3n,
          rounds: [round(2n, RoundState.EMPTY), ...vault.rounds, round(3n, RoundState.OPEN)],
        },
      ],
    };
    expect(planNextAction(withTwo)?.roundId).toBe(1n);
  });

  it("keeps two vault lifecycle histories isolated and deterministically prioritizes the lower vault id", () => {
    const first = snapshot(round(1n, RoundState.AGGREGATE_PENDING));
    const firstVault = first.vaults[0]!;
    const secondVault: VaultSnapshot = {
      ...firstVault,
      vault: {
        ...firstVault.vault,
        id: 2,
        name: "Weekly",
        address: "0x0000000000000000000000000000000000000044",
        bondEscrow: "0x0000000000000000000000000000000000000055",
      },
      rounds: [round(1n, RoundState.READY_TO_ALLOCATE), round(2n, RoundState.OPEN)],
    };
    const independent = { ...first, vaults: [secondVault, firstVault] };
    const firstAction = planNextAction(independent);
    expect(firstAction).toMatchObject({ kind: "finalize-aggregate", roundId: 1n });
    expect(firstAction?.vault.id).toBe(1);

    const firstAdvanced = {
      ...independent,
      vaults: independent.vaults.map((vault) =>
        vault.vault.id === 1
          ? {
              ...vault,
              rounds: vault.rounds.map((item) => (item.roundId === 1n ? { ...item, state: RoundState.SETTLED } : item)),
            }
          : vault,
      ),
    };
    const secondAction = planNextAction(firstAdvanced);
    expect(secondAction).toMatchObject({ kind: "process-allocation", roundId: 1n, cursor: 0n });
    expect(secondAction?.vault.id).toBe(2);
  });
});
