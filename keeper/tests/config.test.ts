import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { assertKeeperBalanceWithinLimit } from "../src/balance-guard.js";
import { loadConfig } from "../src/config.js";

const keeperPrivateKey = "0x1111111111111111111111111111111111111111111111111111111111111111";

const validEnvironment = {
  NODE_ENV: "test",
  SEPOLIA_RPC_URL: "https://example.invalid",
  KEEPER_PRIVATE_KEY: keeperPrivateKey,
  DEPLOYER_ADDRESS: "0x000000000000000000000000000000000000dEaD",
  KEEPER_MAX_BALANCE_WEI: "100000000000000000",
  POLL_INTERVAL_MS: "15000",
};

describe("keeper credential isolation", () => {
  it("loads a valid dedicated keeper configuration", () => {
    const config = loadConfig(validEnvironment);

    expect(config.NODE_ENV).toBe("test");
    expect(config.POLL_INTERVAL_MS).toBe(15000);
    expect(config.KEEPER_MAX_BALANCE_WEI).toBe(100000000000000000n);

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
});
