import {
  ALLOCATION_CHUNK_SIZE,
  type LifecycleAction,
  type LifecycleActionKind,
  type ProtocolSnapshot,
  RoundState,
  SELECTION_CHUNK_SIZE,
  type VaultSnapshot,
  type RoundSnapshot,
} from "./lifecycle.js";

function findRound(vault: VaultSnapshot, roundId: bigint): RoundSnapshot | undefined {
  return vault.rounds.find((round) => round.roundId === roundId);
}

function actionKey(vault: VaultSnapshot, round: RoundSnapshot, kind: LifecycleActionKind, version = "phase"): string {
  return `${vault.vault.address.toLowerCase()}:${round.roundId}:${kind}:${version}`;
}

function createAction(
  vault: VaultSnapshot,
  round: RoundSnapshot,
  kind: LifecycleActionKind,
  version?: string,
  cursor?: bigint,
  account?: string,
): LifecycleAction {
  return {
    key: actionKey(vault, round, kind, version),
    kind,
    vault: vault.vault,
    roundId: round.roundId,
    ...(cursor === undefined ? {} : { cursor }),
    ...(account === undefined ? {} : { account }),
  };
}

function actionForRound(vault: VaultSnapshot, round: RoundSnapshot): LifecycleAction | null {
  switch (round.state) {
    case RoundState.AGGREGATE_PENDING:
      return createAction(vault, round, "finalize-aggregate");
    case RoundState.AGGREGATE_FINALIZED:
      return createAction(vault, round, "generate-random-candidate", "initial");
    case RoundState.EMPTY:
      return createAction(vault, round, "settle-empty-round");
    case RoundState.CANDIDATE_VALIDITY_PENDING:
      return createAction(
        vault,
        round,
        "finalize-candidate-validity",
        round.candidateValidityHandle ?? "pending-handle",
      );
    case RoundState.CANDIDATE_REJECTED:
      return createAction(
        vault,
        round,
        "generate-random-candidate",
        round.candidateValidityHandle ?? "rejected-handle",
      );
    case RoundState.TICKET_ACCEPTED:
    case RoundState.WINNER_PROCESSING:
      return createAction(vault, round, "process-selection", round.selectionCursor.toString(), round.selectionCursor);
    case RoundState.RECONCILIATION_PENDING:
      return createAction(vault, round, "finalize-reconciliation");
    case RoundState.RECONCILIATION_FAILED:
      return createAction(vault, round, "recover-failed-reconciliation");
    case RoundState.READY_TO_ALLOCATE:
    case RoundState.ALLOCATION_PROCESSING:
      return createAction(
        vault,
        round,
        "process-allocation",
        round.allocationCursor.toString(),
        round.allocationCursor,
      );
    case RoundState.WINNINGS_ALLOCATED:
      return createAction(vault, round, "finalize-settlement");
    case RoundState.UNINITIALIZED:
    case RoundState.OPEN:
    case RoundState.SETTLED:
      return null;
  }
}

/**
 * Returns one globally legal operation. Expired active rounds are closed first so
 * allocation's existing `_isActiveRoundOpen` guard cannot strand prior rounds.
 */
export function planNextAction(snapshot: ProtocolSnapshot): LifecycleAction | null {
  const dueClosures = snapshot.vaults
    .map((vault) => {
      const active = findRound(vault, vault.activeRoundId);
      if (active?.state !== RoundState.OPEN || snapshot.blockTimestamp < active.closesAt) return null;
      return createAction(vault, active, "close-round", active.closesAt.toString());
    })
    .filter((action): action is LifecycleAction => action !== null)
    .sort((left, right) =>
      left.roundId < right.roundId ? -1 : left.roundId > right.roundId ? 1 : left.vault.id - right.vault.id,
    );

  if (dueClosures[0]) return dueClosures[0];

  for (const vault of [...snapshot.vaults].sort((left, right) => left.vault.id - right.vault.id)) {
    const active = findRound(vault, vault.activeRoundId);
    if (active?.state !== RoundState.OPEN || snapshot.blockTimestamp >= active.closesAt) continue;
    const candidate = vault.autoEntryCandidates.find(
      (entry) => entry.enabled && !entry.registered && entry.availableCredit >= vault.bondAmount,
    );
    if (candidate) {
      return createAction(
        vault,
        active,
        "register-auto-entry",
        candidate.account.toLowerCase(),
        undefined,
        candidate.account,
      );
    }
    const stale = vault.autoEntryCandidates.find((entry) => !entry.enabled && entry.prospectivelyEnabled !== true);
    if (stale) {
      return createAction(vault, active, "prune-auto-entry", stale.account.toLowerCase(), undefined, stale.account);
    }
  }

  for (const vault of [...snapshot.vaults].sort((left, right) => left.vault.id - right.vault.id)) {
    const unfinished = vault.rounds
      .filter((round) => round.roundId < vault.activeRoundId && round.state !== RoundState.SETTLED)
      .sort((left, right) => (left.roundId < right.roundId ? -1 : left.roundId > right.roundId ? 1 : 0));
    for (const round of unfinished) {
      const action = actionForRound(vault, round);
      if (action) return action;
    }
  }
  return null;
}

export function isActionRequired(snapshot: ProtocolSnapshot, action: LifecycleAction): boolean {
  const vault = snapshot.vaults.find(
    (candidate) => candidate.vault.address.toLowerCase() === action.vault.address.toLowerCase(),
  );
  const round = vault ? findRound(vault, action.roundId) : undefined;
  if (!vault || !round) return false;

  switch (action.kind) {
    case "register-auto-entry": {
      const active = findRound(vault, vault.activeRoundId);
      const candidate = vault.autoEntryCandidates.find(
        (entry) => entry.account.toLowerCase() === action.account?.toLowerCase(),
      );
      return (
        action.roundId === vault.activeRoundId &&
        active?.state === RoundState.OPEN &&
        snapshot.blockTimestamp < active.closesAt &&
        candidate?.enabled === true &&
        candidate.registered === false &&
        candidate.availableCredit >= vault.bondAmount
      );
    }
    case "prune-auto-entry": {
      const active = findRound(vault, vault.activeRoundId);
      const candidate = vault.autoEntryCandidates.find(
        (entry) => entry.account.toLowerCase() === action.account?.toLowerCase(),
      );
      return (
        action.roundId === vault.activeRoundId &&
        active?.state === RoundState.OPEN &&
        candidate !== undefined &&
        !candidate.enabled &&
        candidate.prospectivelyEnabled !== true
      );
    }
    case "close-round":
      return (
        vault.activeRoundId === action.roundId &&
        round.state === RoundState.OPEN &&
        snapshot.blockTimestamp >= round.closesAt
      );
    case "finalize-aggregate":
      return round.state === RoundState.AGGREGATE_PENDING;
    case "settle-empty-round":
      return round.state === RoundState.EMPTY;
    case "generate-random-candidate":
      return round.state === RoundState.AGGREGATE_FINALIZED || round.state === RoundState.CANDIDATE_REJECTED;
    case "finalize-candidate-validity":
      return round.state === RoundState.CANDIDATE_VALIDITY_PENDING;
    case "process-selection":
      return (
        (round.state === RoundState.TICKET_ACCEPTED || round.state === RoundState.WINNER_PROCESSING) &&
        round.selectionCursor === action.cursor &&
        round.selectionCursor < round.participantCount
      );
    case "finalize-reconciliation":
      return round.state === RoundState.RECONCILIATION_PENDING;
    case "recover-failed-reconciliation":
      return round.state === RoundState.RECONCILIATION_FAILED;
    case "process-allocation": {
      const active = findRound(vault, vault.activeRoundId);
      return (
        (round.state === RoundState.READY_TO_ALLOCATE || round.state === RoundState.ALLOCATION_PROCESSING) &&
        round.allocationCursor === action.cursor &&
        round.allocationCursor < round.participantCount &&
        active?.state === RoundState.OPEN &&
        snapshot.blockTimestamp < active.closesAt
      );
    }
    case "finalize-settlement":
      return round.state === RoundState.WINNINGS_ALLOCATED;
  }
}

export function actionChunkSize(action: LifecycleAction): bigint | null {
  if (action.kind === "process-selection") return SELECTION_CHUNK_SIZE;
  if (action.kind === "process-allocation") return ALLOCATION_CHUNK_SIZE;
  return null;
}
