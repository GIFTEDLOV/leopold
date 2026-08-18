import { sanitizeTechnicalDetail } from "./errors";
import type { TransactionStage } from "./transactions";

export type WithdrawalRoundSnapshot = {
  canWithdrawNow: boolean;
  canPrepareWithdrawal: boolean;
  reason?: string;
};

type PrepareWithdrawalRoundOptions = {
  readRound(): Promise<WithdrawalRoundSnapshot>;
  advanceRound(): Promise<unknown>;
  onStage(stage: TransactionStage): void;
};

function stageError(prefix: string, error: unknown): Error {
  const wrapped = new Error(`${prefix}: ${sanitizeTechnicalDetail(error)}`);
  Object.defineProperty(wrapped, "cause", { value: error, enumerable: false, configurable: true });
  return wrapped;
}

/**
 * Prepares a principal withdrawal without hiding the two-transaction lifecycle.
 * A failed close is only treated as a race when a fresh read proves that another
 * caller has already made the active round withdrawable.
 */
export async function prepareWithdrawalRound({
  readRound,
  advanceRound,
  onStage,
}: PrepareWithdrawalRoundOptions): Promise<WithdrawalRoundSnapshot> {
  onStage("withdraw-round-check");
  let current: WithdrawalRoundSnapshot;
  try {
    current = await readRound();
  } catch (error) {
    throw stageError("WITHDRAW:ROUND_CHECK", error);
  }
  if (!current.canPrepareWithdrawal) {
    throw new Error(`WITHDRAW:ROUND_CHECK: ${current.reason ?? "withdrawal unavailable"}`);
  }
  if (current.canWithdrawNow) return current;

  try {
    await advanceRound();
  } catch (error) {
    let raced: WithdrawalRoundSnapshot;
    try {
      raced = await readRound();
    } catch {
      throw error;
    }
    if (raced.canWithdrawNow) return raced;
    throw error;
  }

  onStage("withdraw-refresh");
  let refreshed: WithdrawalRoundSnapshot;
  try {
    refreshed = await readRound();
  } catch (error) {
    throw stageError("WITHDRAW:REFRESH", error);
  }
  if (!refreshed.canWithdrawNow) {
    throw new Error("WITHDRAW:REFRESH: active round is not open");
  }
  return refreshed;
}
