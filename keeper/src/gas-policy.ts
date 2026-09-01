import type { LifecycleActionKind } from "./lifecycle.js";

export type GasPolicyConfig = {
  readonly multiplierBps: number;
  readonly additiveMargin: bigint;
  readonly maximumGasLimit: bigint;
  readonly floors: Readonly<Partial<Record<LifecycleActionKind, bigint>>>;
};

export type GasPolicyDecision = {
  readonly action: LifecycleActionKind;
  readonly estimatedGas?: bigint;
  readonly gasFloor?: bigint;
  readonly multiplierBps: number;
  readonly additiveMargin: bigint;
  readonly gasLimit: bigint;
  readonly estimationFallback?: boolean;
};

export const DEFAULT_GAS_FLOORS: Readonly<Record<LifecycleActionKind, bigint>> = {
  "register-auto-entry": 700_000n,
  "prune-auto-entry": 300_000n,
  "close-round": 750_000n,
  "finalize-aggregate": 350_000n,
  "settle-empty-round": 350_000n,
  "generate-random-candidate": 600_000n,
  "finalize-candidate-validity": 350_000n,
  "process-selection": 1_000_000n,
  "finalize-reconciliation": 350_000n,
  "recover-failed-reconciliation": 350_000n,
  "process-allocation": 1_000_000n,
  "finalize-settlement": 500_000n,
};

export const DEFAULT_GAS_POLICY: GasPolicyConfig = {
  multiplierBps: 12_500,
  additiveMargin: 25_000n,
  // A two-participant V2 allocation currently estimates at 2,269,439 gas;
  // retain the reviewed 25% multiplier and margin without rejecting it.
  maximumGasLimit: 3_000_000n,
  floors: DEFAULT_GAS_FLOORS,
};

function ceilMultiply(value: bigint, basisPoints: number): bigint {
  return (value * BigInt(basisPoints) + 9_999n) / 10_000n;
}

export function applyGasPolicy(
  action: LifecycleActionKind,
  estimatedGas: bigint | undefined,
  config: GasPolicyConfig = DEFAULT_GAS_POLICY,
  estimationFallback = false,
): GasPolicyDecision {
  if (!Number.isInteger(config.multiplierBps) || config.multiplierBps < 10_000 || config.multiplierBps > 20_000) {
    throw new Error("Invalid keeper gas multiplier");
  }
  if (config.additiveMargin < 0n || config.maximumGasLimit <= 0n) throw new Error("Invalid keeper gas policy bounds");
  const floor = config.floors[action];
  if (floor !== undefined && (floor <= 0n || floor > config.maximumGasLimit)) {
    throw new Error(`Invalid gas floor for ${action}`);
  }
  if (estimatedGas === undefined && floor === undefined) {
    throw new Error(`Gas estimation failed for ${action} and no reviewed static floor is configured`);
  }
  if (estimatedGas !== undefined && estimatedGas <= 0n) throw new Error(`Invalid gas estimate for ${action}`);

  const estimatedWithMargin =
    estimatedGas === undefined ? floor! : ceilMultiply(estimatedGas, config.multiplierBps) + config.additiveMargin;
  const gasLimit = estimatedWithMargin > (floor ?? 0n) ? estimatedWithMargin : (floor ?? estimatedWithMargin);
  if (gasLimit > config.maximumGasLimit) {
    throw new Error(`Gas policy limit exceeded for ${action}: ${gasLimit} > ${config.maximumGasLimit}`);
  }
  return {
    action,
    ...(estimatedGas === undefined ? {} : { estimatedGas }),
    ...(floor === undefined ? {} : { gasFloor: floor }),
    multiplierBps: config.multiplierBps,
    additiveMargin: config.additiveMargin,
    gasLimit,
    ...(estimationFallback ? { estimationFallback: true } : {}),
  };
}

export function parseGasFloors(value: string | undefined): Partial<Record<LifecycleActionKind, bigint>> {
  if (value === undefined || value.trim() === "") return {};
  const result: Partial<Record<LifecycleActionKind, bigint>> = {};
  for (const token of value.split(",")) {
    const [rawAction, rawFloor] = token.split("=").map((part) => part.trim());
    if (!rawAction || !rawFloor || !/^\d+$/u.test(rawFloor)) throw new Error("Invalid KEEPER_GAS_FLOORS format");
    if (!(rawAction in DEFAULT_GAS_FLOORS)) throw new Error(`Unknown keeper gas action ${rawAction}`);
    result[rawAction as LifecycleActionKind] = BigInt(rawFloor);
  }
  return result;
}
