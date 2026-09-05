import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { assertKeeperBalanceWithinLimit, assertKeeperBalanceWithinLimits } from "../src/balance-guard.js";
import { loadConfig } from "../src/config.js";

const keeperPrivateKey = "0x1111111111111111111111111111111111111111111111111111111111111111";

const validEnvironment = {
  NODE_ENV: "test",
  SEPOLIA_RPC_URL: "https://example.invalid",
  KEEPER_PRIVATE_KEY: keeperPrivateKey,
  DEPLOYER_ADDRESS: "0x000000000000000000000000000000000000dEaD",
  KEEPER_MIN_BALANCE_WEI: "0",
  KEEPER_MAX_BALANCE_WEI: "100000000000000000",
  POLL_INTERVAL_MS: "15000",
};

describe("keeper credential isolation", () => {
  it("loads a valid dedicated keeper configuration", () => {
    const config = loadConfig(validEnvironment);

    expect(config.NODE_ENV).toBe("test");
    expect(config.POLL_INTERVAL_MS).toBe(15000);
    expect(config.KEEPER_MAX_BALANCE_WEI).toBe(100000000000000000n);
    expect(config.KEEPER_AUTO_ENTRY_SCAN_SIZE).toBe(50);
    expect(config.GAS_POLICY.multiplierBps).toBe(12_500);
    expect(config.GAS_POLICY.floors["close-round"]).toBe(750_000n);
    expect(config.RPC_URLS).toEqual(["https://example.invalid/"]);

    expect(config.KEEPER_ADDRESS).toBe(privateKeyToAccount(keeperPrivateKey).address);

    expect(config.KEEPER_ADDRESS).not.toBe(config.DEPLOYER_ADDRESS);
  });

  it("fails closed when the keeper private key is missing", () => {
    const environmentWithoutKey: NodeJS.ProcessEnv = {
      ...validEnvironment,
    };

    delete environmentWithoutKey.KEEPER_PRIVATE_KEY;

    expect(() => loadConfig(environmentWithoutKey)).toThrow();
  });

  it("rejects a keeper key that resolves to the deployer", () => {
    const keeperAddress = privateKeyToAccount(keeperPrivateKey).address;

    expect(() =>
      loadConfig({
        ...validEnvironment,
        DEPLOYER_ADDRESS: keeperAddress,
      }),
    ).toThrow("Keeper address must not match the deployment address");
  });

  it("rejects an unsafe polling interval", () => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        POLL_INTERVAL_MS: "100",
      }),
    ).toThrow();
  });

  it("allows a balance at the configured ceiling", () => {
    expect(() => assertKeeperBalanceWithinLimit(100000000000000000n, 100000000000000000n)).not.toThrow();
  });

  it("rejects a balance above the configured ceiling", () => {
    expect(() => assertKeeperBalanceWithinLimit(100000000000000001n, 100000000000000000n)).toThrow(
      "exceeds the configured ceiling",
    );
  });

  it("normalizes and de-duplicates RPC fallbacks", () => {
    const config = loadConfig({
      ...validEnvironment,
      SEPOLIA_RPC_URLS: "https://example.invalid/, https://fallback.invalid/rpc",
    });
    expect(config.RPC_URLS).toEqual(["https://example.invalid/", "https://fallback.invalid/rpc"]);
  });

  it("parses reviewed gas-policy overrides", () => {
    const config = loadConfig({
      ...validEnvironment,
      KEEPER_GAS_MULTIPLIER_BPS: "13000",
      KEEPER_GAS_MARGIN_UNITS: "30000",
      KEEPER_GAS_MAX_LIMIT: "1600000",
      KEEPER_GAS_FLOORS: "close-round=800000",
    });
    expect(config.GAS_POLICY).toMatchObject({
      multiplierBps: 13000,
      additiveMargin: 30000n,
      maximumGasLimit: 1600000n,
    });
    expect(config.GAS_POLICY.floors["close-round"]).toBe(800000n);
  });

  it("rejects invalid fallback URLs and inverted balance limits", () => {
    expect(() => loadConfig({ ...validEnvironment, SEPOLIA_RPC_URLS: "not-a-url" })).toThrow();
    expect(() =>
      loadConfig({ ...validEnvironment, KEEPER_MIN_BALANCE_WEI: "11", KEEPER_MAX_BALANCE_WEI: "10" }),
    ).toThrow("must not exceed");
    expect(() => loadConfig({ ...validEnvironment, KEEPER_AUTO_ENTRY_SCAN_SIZE: "0" })).toThrow();
    expect(() => loadConfig({ ...validEnvironment, KEEPER_AUTO_ENTRY_SCAN_SIZE: "501" })).toThrow();
  });

  it("enforces both balance boundaries", () => {
    expect(() => assertKeeperBalanceWithinLimits(9n, 10n, 20n)).toThrow("below the configured minimum");
    expect(() => assertKeeperBalanceWithinLimits(10n, 10n, 20n)).not.toThrow();
    expect(() => assertKeeperBalanceWithinLimits(20n, 10n, 20n)).not.toThrow();
    expect(() => assertKeeperBalanceWithinLimits(21n, 10n, 20n)).toThrow("exceeds the configured ceiling");
  });
});
