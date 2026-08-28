import type { LeopoldVaultConfig, VaultId } from "./config";
import { getEffectiveVaultPublicPrize, SETTLED_ROUND_STATE, type VaultPublicState } from "./reads";

export type CompletedVaultRound = {
  vaultId: VaultId;
  vaultName: string;
  roundId: bigint;
  opensAt: bigint;
  closesAt: bigint;
  state: typeof SETTLED_ROUND_STATE;
  stateLabel: string;
  storedPrize: bigint;
  publicPrizeReserve: bigint;
  entered: true;
  participantCount: bigint;
  eligibilityRevealReady: boolean;
  resultRevealReady: true;
  bondRefund: bigint;
  bondRefundClaimed: boolean;
  settlementReward: bigint;
};

export type HistoricalEligibilityState = "hidden" | "revealing" | "revealed" | "reveal-failed";

export type HistoricalEligibilityProjection = {
  available: boolean;
  state: HistoricalEligibilityState;
  value: bigint | null;
};

export function projectHistoricalEligibility(
  available: boolean,
  state: HistoricalEligibilityState,
  clearValue: bigint | undefined,
): HistoricalEligibilityProjection {
  return {
    available,
    state,
    value: state === "revealed" && clearValue !== undefined ? clearValue : null,
  };
}

/**
 * Converts authoritative per-round reads into the privacy-safe Completed-tab
 * model. Only a connected account's settled registrations are included.
 */
export function projectCompletedVaultRounds(
  vaults: readonly LeopoldVaultConfig[],
  historicalRounds: Partial<Record<VaultId, readonly VaultPublicState[]>>,
  blockTimestamp: bigint | null,
): CompletedVaultRound[] {
  return vaults
    .flatMap((vault) =>
      (historicalRounds[vault.slug] ?? [])
        .filter((state): state is VaultPublicState & { state: typeof SETTLED_ROUND_STATE; entered: true } =>
          state.state === SETTLED_ROUND_STATE && state.entered,
        )
        .map((state) => ({
          vaultId: vault.slug,
          vaultName: vault.name,
          roundId: state.roundId,
          opensAt: state.opensAt,
          closesAt: state.closesAt,
          state: SETTLED_ROUND_STATE as typeof SETTLED_ROUND_STATE,
          stateLabel: state.stateLabel,
          storedPrize: state.publicPrize,
          publicPrizeReserve: getEffectiveVaultPublicPrize(state, blockTimestamp) ?? state.publicPrize,
          entered: true as const,
          participantCount: state.participantCount,
          eligibilityRevealReady: state.eligibilityStart !== 0n,
          resultRevealReady: true as const,
          bondRefund: state.refundAmount,
          bondRefundClaimed: state.refundClaimed,
          settlementReward: state.settlementReward,
        })),
    )
    .sort((left, right) => (left.closesAt === right.closesAt ? 0 : left.closesAt > right.closesAt ? -1 : 1));
}
