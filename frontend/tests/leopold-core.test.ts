import { describe, expect, it } from "vitest";

import { formatUsdcAmount, parseUsdcAmount, parseUsdcAmountWithinBalance } from "../lib/leopold/amounts";
import rawManifest from "../../config/leopold-frontend-contracts.json";
import {
  CANONICAL_USDC,
  LEOPOLD_CHAIN_ID,
  leopoldConfig,
  loadLeopoldConfig,
  type RawLeopoldManifest,
} from "../lib/leopold/config";
import { classifyLeopoldError } from "../lib/leopold/errors";
import { ROUND_STATE_LABELS } from "../lib/leopold/reads";
import { transactionStageLabel } from "../lib/leopold/transactions";

describe("Leopold frontend core", () => {
  it("loads the frozen manifest and fails closed on missing official addresses", () => {
    expect(leopoldConfig.chainId).toBe(LEOPOLD_CHAIN_ID);
    expect(leopoldConfig.canonicalUsdc.address).toBe(CANONICAL_USDC);
    expect(leopoldConfig.lcUsdc.status).toBe("missing");
    expect(leopoldConfig.registry.status).toBe("missing");
    expect(leopoldConfig.ready).toBe(false);
    expect(leopoldConfig.vaults).toHaveLength(4);
    expect(leopoldConfig.vaults.map((vault) => vault.roundDurationSeconds)).toEqual([
      86_400, 604_800, 2_592_000, 604_800,
    ]);
  });

  it("classifies an invalid and wrong-chain manifest without accepting addresses", () => {
    const invalid = structuredClone(rawManifest) as RawLeopoldManifest;
    invalid.contracts.lcUsdc = "not-an-address";
    expect(loadLeopoldConfig(invalid).lcUsdc.status).toBe("invalid");
    invalid.network.chainId = 1;
    expect(loadLeopoldConfig(invalid).canonicalUsdc.status).toBe("wrong-chain");
  });

  it.each([
    ["0.000001", 1n],
    ["1", 1_000_000n],
    ["1234567.123456", 1_234_567_123_456n],
  ])("parses %s using exact six-decimal bigint arithmetic", (input, expected) => {
    expect(parseUsdcAmount(input)).toBe(expected);
    expect(formatUsdcAmount(expected)).toBe(input);
  });

  it.each(["0", "0.000000", "-1", "1.0000001", "1e2", "NaN"])("rejects unsafe amount %s", (input) => {
    expect(() => parseUsdcAmount(input)).toThrow();
  });

  it("enforces the available balance", () => {
    expect(parseUsdcAmountWithinBalance("1", 1_000_000n)).toBe(1_000_000n);
    expect(() => parseUsdcAmountWithinBalance("1.000001", 1_000_000n)).toThrow("INSUFFICIENT_USDC");
  });

  it("accepts the exact private uint64 limit and rejects overflow", () => {
    expect(parseUsdcAmount("18446744073709.551615")).toBe(0xffff_ffff_ffff_ffffn);
    expect(() => parseUsdcAmount("18446744073709.551616")).toThrow("AMOUNT_EXCEEDS_PRIVATE_USDC_LIMIT");
  });

  it("maps wallet, network, round, relayer, and liquidity failures to product language", () => {
    expect(classifyLeopoldError(new Error("User rejected request")).code).toBe("USER_REJECTED");
    expect(classifyLeopoldError(new Error("wrong chain")).code).toBe("WRONG_NETWORK");
    expect(classifyLeopoldError(new Error("RoundNotOpen")).code).toBe("ROUND_CLOSED");
    expect(classifyLeopoldError(new Error("relayer timeout")).code).toBe("RELAYER_UNAVAILABLE");
    expect(classifyLeopoldError(new Error("InsufficientManagedAssets")).code).toBe("PRIVATE_LIQUIDITY_UNAVAILABLE");
  });

  it("uses one consistent transaction and settlement vocabulary", () => {
    expect(Object.values(transactionStageLabel)).toEqual([
      "Ready",
      "Waiting for wallet",
      "Submitted",
      "Confirming",
      "Private processing",
      "Complete",
      "Failed",
    ]);
    expect(ROUND_STATE_LABELS[7]).toBe("Finalizing private draw");
    expect(ROUND_STATE_LABELS[14]).toBe("Settled");
  });
});
