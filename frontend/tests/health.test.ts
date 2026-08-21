import { decodeFunctionData, encodeFunctionResult, zeroAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import { registryAbi } from "../lib/leopold/abis";
import { leopoldConfig } from "../lib/leopold/config";
import { combineHealthStates, getPublicHealth } from "../lib/ops/health";

const NOW_MS = 1_800_000_000_000;

function json(result: unknown, status = 200) {
  return new Response(JSON.stringify(result), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function healthyFetch() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.includes("relayer.testnet.zama.org")) {
      return json({ response: { fheKeyInfo: [], crs: {} } });
    }
    if (url.includes("dynamicauth.com")) return json({ sdk: { enabled: true } });
    const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
    if (body.method === "eth_chainId") return json({ jsonrpc: "2.0", id: 1, result: "0xaa36a7" });
    if (body.method === "eth_getBlockByNumber") {
      return json({
        jsonrpc: "2.0",
        id: 1,
        result: { number: "0x1234", timestamp: `0x${Math.floor(NOW_MS / 1000).toString(16)}` },
      });
    }
    if (body.method === "eth_getCode") return json({ jsonrpc: "2.0", id: 1, result: "0x6000" });
    if (body.method === "eth_call") {
      const call = body.params[0] as { data: `0x${string}` };
      const decoded = decodeFunctionData({ abi: registryAbi, data: call.data });
      const vaultId = Number(decoded.args[0]);
      const vault = leopoldConfig.vaults.find((item) => item.id === vaultId);
      if (!vault?.vault.address) throw new Error("missing test vault");
      const result = encodeFunctionResult({
        abi: registryAbi,
        functionName: "officialVault",
        result: {
          vault: vault.vault.address,
          name: `0x${"0".repeat(64)}`,
          vaultType: vault.id - 1,
          roundDuration: BigInt(vault.roundDurationSeconds),
          asset: zeroAddress,
          strategy: zeroAddress,
          comet: zeroAddress,
          bondEscrow: zeroAddress,
          active: true,
        },
      });
      return json({ jsonrpc: "2.0", id: 1, result });
    }
    throw new Error(`unexpected health request: ${body.method}`);
  });
}

describe("Leopold public health model", () => {
  it("maps dependency states deterministically", () => {
    expect(combineHealthStates(["HEALTHY", "HEALTHY"])).toBe("HEALTHY");
    expect(combineHealthStates(["HEALTHY", "UNKNOWN"])).toBe("DEGRADED");
    expect(combineHealthStates(["UNAVAILABLE", "HEALTHY"])).toBe("UNAVAILABLE");
    expect(combineHealthStates(["UNKNOWN", "UNKNOWN"])).toBe("UNKNOWN");
  });

  it("checks RPC, public deployment code, Zama metadata, and Dynamic settings without secrets", async () => {
    const fetchFn = healthyFetch();
    const health = await getPublicHealth({
      fetchFn,
      now: () => NOW_MS,
      dynamicConfigured: true,
      dynamicEnvironment: "public-environment-id",
      retry: { jitterRatio: 0, sleep: async () => undefined },
    });

    expect(health.state).toBe("HEALTHY");
    expect(health.network).toMatchObject({ state: "HEALTHY", chainId: 11_155_111, latestBlock: "4660" });
    expect(health.zama).toMatchObject({ state: "HEALTHY", signal: "PUBLIC_KEY_METADATA" });
    expect(health.dynamic).toMatchObject({ state: "HEALTHY", signal: "PUBLIC_ENVIRONMENT_SETTINGS" });
    expect(health.deployment.vaults).toHaveLength(4);
    expect(health.deployment.vaults.every((vault) => vault.hasCode)).toBe(true);
    expect(health.fundsCondition).toBe("NOT_ASSESSED_BY_SERVICE_AVAILABILITY");
    expect(health.assurance).toBe("Service availability does not affect ownership of funds held by the protocol.");

    const publicReport = JSON.stringify(health);
    expect(publicReport).not.toContain("public-environment-id");
    for (const forbiddenKey of [
      "ciphertext",
      "proof",
      "ticket",
      "winner",
      "winnings",
      "email",
      "username",
      "authToken",
      "walletIdentity",
    ]) {
      expect(publicReport).not.toContain(forbiddenKey);
    }
    expect(fetchFn.mock.calls.every(([, init]) => init?.method === "GET" || init?.method === "POST")).toBe(true);
  });

  it("reports an RPC outage as service unavailability without claiming funds are at risk", async () => {
    const fetchFn = healthyFetch();
    fetchFn.mockImplementation(async (input, init) => {
      if (String(input).includes("publicnode.com")) throw new TypeError("fetch failed");
      if (String(input).includes("relayer")) return json({ response: { fheKeyInfo: [], crs: {} } });
      if (String(input).includes("dynamicauth")) return json({ sdk: {} });
      return healthyFetch()(input, init);
    });
    const health = await getPublicHealth({
      fetchFn,
      now: () => NOW_MS,
      dynamicConfigured: true,
      dynamicEnvironment: "public-environment-id",
      retry: { jitterRatio: 0, sleep: async () => undefined },
    });

    expect(health.network.state).toBe("UNAVAILABLE");
    expect(health.state).toBe("UNAVAILABLE");
    expect(health.fundsCondition).toBe("NOT_ASSESSED_BY_SERVICE_AVAILABILITY");
    expect(JSON.stringify(health).toLowerCase()).not.toContain("funds_at_risk");
  });
});
