import { describe, expect, it } from "vitest";

import { applyGasPolicy, DEFAULT_GAS_FLOORS, DEFAULT_GAS_POLICY, parseGasFloors } from "../src/gas-policy.js";

describe("keeper lifecycle gas policy", () => {
  it("gives closeRound the calibrated headroom above the observed 576,408 gas", () => {
    const decision = applyGasPolicy("close-round", 582_150n);
    expect(decision.gasFloor).toBe(750_000n);
    expect(decision.gasLimit).toBe(752_688n);
    expect(decision.gasLimit).toBeGreaterThan(576_408n);
  });

  it("raises low estimates to the reviewed action floor", () => {
    const decision = applyGasPolicy("close-round", 100_000n);
    expect(decision.gasLimit).toBe(DEFAULT_GAS_FLOORS["close-round"]);
  });

  it("preserves multiplier and additive margin for already-high estimates", () => {
    const decision = applyGasPolicy("finalize-settlement", 800_000n);
    expect(decision.gasLimit).toBe(1_025_000n);
    expect(decision.gasLimit).toBeGreaterThan(800_000n);
  });

  it("uses an explicitly reviewed floor when estimation fails", () => {
    const decision = applyGasPolicy("close-round", undefined);
    expect(decision.estimatedGas).toBeUndefined();
    expect(decision.gasLimit).toBe(DEFAULT_GAS_FLOORS["close-round"]);
    expect(() => applyGasPolicy("close-round", undefined, { ...DEFAULT_GAS_POLICY, floors: {} })).toThrow(
      "no reviewed static floor",
    );
  });

  it("rejects malformed estimates and floors above the maximum", () => {
    expect(() => applyGasPolicy("close-round", 0n)).toThrow("Invalid gas estimate");
    expect(() => applyGasPolicy("close-round", 1n, { ...DEFAULT_GAS_POLICY, maximumGasLimit: 700_000n })).toThrow(
      "Invalid gas floor",
    );
  });

  it("accepts only known action floor overrides", () => {
    expect(parseGasFloors("close-round=800000,process-selection=1100000")).toEqual({
      "close-round": 800_000n,
      "process-selection": 1_100_000n,
    });
    expect(() => parseGasFloors("unknown-action=1")).toThrow("Unknown keeper gas action");
    expect(() => parseGasFloors("close-round=nope")).toThrow("Invalid KEEPER_GAS_FLOORS format");
  });

  it("ships a floor for every lifecycle action", () => {
    const actions = Object.keys(DEFAULT_GAS_FLOORS);
    expect(actions).toHaveLength(12);
    for (const action of actions)
      expect(DEFAULT_GAS_FLOORS[action as keyof typeof DEFAULT_GAS_FLOORS]).toBeGreaterThan(0n);
  });
});
