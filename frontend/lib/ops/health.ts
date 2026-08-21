import { decodeFunctionResult, encodeFunctionData, type Address, type Hex } from "viem";

import { dynamicApiBaseUrl, dynamicAuthConfigured, dynamicEnvironmentId } from "@/lib/auth/config";
import { registryAbi } from "@/lib/leopold/abis";
import { LEOPOLD_CHAIN_ID, leopoldConfig, requireConfiguredAddress } from "@/lib/leopold/config";
import { LEOPOLD_SEPOLIA_RPC_URL } from "@/lib/leopold/network";
import { recordMetric, type MetricFailureCategory, type MetricOperation } from "./metrics";
import { productionRelease } from "./release";
import { HttpReadError, classifyReadFailure, withReadReliability } from "./reliability";

export const ZAMA_RELAYER_KEY_METADATA_URL = "https://relayer.testnet.zama.org/v2/keyurl";
export const DYNAMIC_DEFAULT_API_BASE_URL = "https://app.dynamicauth.com/api/v0";
export const HEALTH_BLOCK_FRESHNESS_SECONDS = 180;

export type HealthState = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
export type HealthCheck = {
  state: HealthState;
  durationMs: number;
  message: string;
  failureCategory?: Exclude<MetricFailureCategory, "NONE">;
};

export type PublicHealth = {
  schema: "leopold.public-health.v1";
  state: HealthState;
  checkedAt: string;
  serviceCondition: "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
  fundsCondition: "NOT_ASSESSED_BY_SERVICE_AVAILABILITY";
  assurance: "Service availability does not affect ownership of funds held by the protocol.";
  network: HealthCheck & {
    name: "Ethereum Sepolia";
    chainId: 11155111;
    latestBlock: string | null;
    latestBlockTimestamp: string | null;
    blockAgeSeconds: number | null;
  };
  zama: HealthCheck & { signal: "PUBLIC_KEY_METADATA" };
  dynamic: HealthCheck & { signal: "PUBLIC_ENVIRONMENT_SETTINGS" | "CONFIGURATION_ONLY" };
  deployment: HealthCheck & {
    registry: Address | null;
    lcUsdc: Address | null;
    vaults: Array<{ name: string; address: Address | null; hasCode: boolean }>;
  };
  release: {
    manifestSha256: string;
    freezeStatus: "ACTIVE";
    p01Status: string;
    unresolvedCritical: number;
    unresolvedHigh: number;
    unresolvedMedium: number;
    runtimeBytes: number;
    eip170Headroom: number;
  };
};

type JsonRpcResponse = { result?: unknown; error?: unknown };
type HealthOptions = {
  fetchFn?: typeof fetch;
  now?: () => number;
  dynamicConfigured?: boolean;
  dynamicEnvironment?: string;
  dynamicApiBase?: string;
  retry?: {
    timeoutMs?: number;
    maxAttempts?: number;
    baseDelayMs?: number;
    jitterRatio?: number;
    random?: () => number;
    sleep?: (durationMs: number) => Promise<void>;
  };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function rpcCall<T>(fetchFn: typeof fetch, method: string, params: readonly unknown[], signal: AbortSignal) {
  const response = await fetchFn(LEOPOLD_SEPOLIA_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new HttpReadError(response.status);
  const payload = (await response.json()) as JsonRpcResponse;
  if (!record(payload) || payload.error !== undefined || payload.result === undefined) {
    throw new Error(`INVALID_RPC_RESPONSE:${method}`);
  }
  return payload.result as T;
}

function checkFailure(error: unknown, durationMs: number, fallback: string): HealthCheck {
  const failureCategory = classifyReadFailure(error);
  return {
    state: failureCategory === "CONFIGURATION" || failureCategory === "INVALID_RESPONSE" ? "DEGRADED" : "UNAVAILABLE",
    durationMs,
    message: fallback,
    failureCategory: failureCategory === "NONE" ? "UNKNOWN" : failureCategory,
  };
}

async function reliable<T>(
  operation: MetricOperation,
  read: (signal: AbortSignal) => Promise<T>,
  retry: HealthOptions["retry"],
): Promise<T> {
  return withReadReliability(({ signal }) => read(signal), { operation, ...retry });
}

function configuredAddressesMatchFrozenRelease(): boolean {
  const registry = requireConfiguredAddress(leopoldConfig.registry, "Registry");
  const lcUsdc = requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC");
  if (
    registry.toLowerCase() !== productionRelease.registry.toLowerCase() ||
    lcUsdc.toLowerCase() !== productionRelease.lcUsdc.toLowerCase()
  ) {
    return false;
  }
  return leopoldConfig.vaults.every((vault, index) => {
    const frozen = productionRelease.vaults[index];
    return (
      frozen?.name === vault.name &&
      requireConfiguredAddress(vault.vault, `${vault.name} vault`).toLowerCase() === frozen.vault.toLowerCase()
    );
  });
}

async function checkRpc(
  fetchFn: typeof fetch,
  now: () => number,
  retry: HealthOptions["retry"],
): Promise<PublicHealth["network"]> {
  const startedAt = now();
  try {
    const result = await reliable(
      "RPC_HEALTH",
      async (signal) => {
        const [chainHex, block] = await Promise.all([
          rpcCall<string>(fetchFn, "eth_chainId", [], signal),
          rpcCall<Record<string, unknown>>(fetchFn, "eth_getBlockByNumber", ["latest", false], signal),
        ]);
        if (!/^0x[\da-f]+$/iu.test(chainHex) || Number(BigInt(chainHex)) !== LEOPOLD_CHAIN_ID) {
          throw new Error("WRONG_CHAIN_ID:rpc");
        }
        if (!record(block) || typeof block.number !== "string" || typeof block.timestamp !== "string") {
          throw new Error("INVALID_RPC_RESPONSE:latest-block");
        }
        return { number: BigInt(block.number), timestamp: BigInt(block.timestamp) };
      },
      retry,
    );
    const age = Math.max(0, Math.floor(now() / 1000) - Number(result.timestamp));
    return {
      state: age > HEALTH_BLOCK_FRESHNESS_SECONDS ? "DEGRADED" : "HEALTHY",
      durationMs: now() - startedAt,
      message:
        age > HEALTH_BLOCK_FRESHNESS_SECONDS ? "The latest Sepolia block is stale." : "Sepolia RPC is responding.",
      name: "Ethereum Sepolia",
      chainId: LEOPOLD_CHAIN_ID,
      latestBlock: result.number.toString(),
      latestBlockTimestamp: result.timestamp.toString(),
      blockAgeSeconds: age,
    };
  } catch (error) {
    return {
      ...checkFailure(error, now() - startedAt, "Sepolia RPC is temporarily unavailable."),
      name: "Ethereum Sepolia",
      chainId: LEOPOLD_CHAIN_ID,
      latestBlock: null,
      latestBlockTimestamp: null,
      blockAgeSeconds: null,
    };
  }
}

async function checkDeployment(
  fetchFn: typeof fetch,
  now: () => number,
  retry: HealthOptions["retry"],
): Promise<PublicHealth["deployment"]> {
  const startedAt = now();
  const registry = leopoldConfig.registry.address;
  const lcUsdc = leopoldConfig.lcUsdc.address;
  const vaults = leopoldConfig.vaults.map((vault) => ({
    name: vault.name,
    address: vault.vault.address,
    hasCode: false,
  }));
  try {
    if (!leopoldConfig.ready || !configuredAddressesMatchFrozenRelease() || !registry || !lcUsdc) {
      throw new Error("CONFIGURATION_MISMATCH:frozen-production-release");
    }
    await reliable(
      "DEPLOYMENT_HEALTH",
      async (signal) => {
        const addresses = [registry, lcUsdc, ...vaults.map((vault) => vault.address as Address)];
        const [codes, officialVaults] = await Promise.all([
          Promise.all(addresses.map((address) => rpcCall<Hex>(fetchFn, "eth_getCode", [address, "latest"], signal))),
          Promise.all(
            leopoldConfig.vaults.map(async (vault) => {
              const data = encodeFunctionData({ abi: registryAbi, functionName: "officialVault", args: [vault.id] });
              const result = await rpcCall<Hex>(fetchFn, "eth_call", [{ to: registry, data }, "latest"], signal);
              return decodeFunctionResult({ abi: registryAbi, functionName: "officialVault", data: result });
            }),
          ),
        ]);
        if (codes.some((code) => code === "0x")) throw new Error("CONFIGURATION_MISMATCH:missing-contract-code");
        for (const [index, official] of officialVaults.entries()) {
          const expected = vaults[index].address;
          if (!official.active || !expected || official.vault.toLowerCase() !== expected.toLowerCase()) {
            throw new Error("CONFIGURATION_MISMATCH:registry-membership");
          }
        }
      },
      retry,
    );
    return {
      state: "HEALTHY",
      durationMs: now() - startedAt,
      message: "The frozen registry, private asset, and four official vaults are available.",
      registry,
      lcUsdc,
      vaults: vaults.map((vault) => ({ ...vault, hasCode: true })),
    };
  } catch (error) {
    return {
      ...checkFailure(error, now() - startedAt, "Production deployment checks are temporarily unavailable."),
      registry,
      lcUsdc,
      vaults,
    };
  }
}

async function checkZama(
  fetchFn: typeof fetch,
  now: () => number,
  retry: HealthOptions["retry"],
): Promise<PublicHealth["zama"]> {
  const startedAt = now();
  try {
    await reliable(
      "ZAMA_HEALTH",
      async (signal) => {
        const response = await fetchFn(ZAMA_RELAYER_KEY_METADATA_URL, {
          method: "GET",
          headers: { "zama-sdk-name": "leopold-health", "zama-sdk-version": "3.4.0" },
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new HttpReadError(response.status);
        const payload = (await response.json()) as unknown;
        const metadata = record(payload) && record(payload.response) ? payload.response : null;
        if (!metadata || !Array.isArray(metadata.fheKeyInfo) || !record(metadata.crs)) {
          throw new Error("INVALID_ZAMA_READINESS_RESPONSE");
        }
      },
      retry,
    );
    return {
      state: "HEALTHY",
      durationMs: now() - startedAt,
      message: "Zama public encryption-key metadata is available.",
      signal: "PUBLIC_KEY_METADATA",
    };
  } catch (error) {
    return {
      ...checkFailure(error, now() - startedAt, "Private operations are temporarily unavailable."),
      signal: "PUBLIC_KEY_METADATA",
    };
  }
}

async function checkDynamic(
  fetchFn: typeof fetch,
  now: () => number,
  retry: HealthOptions["retry"],
  configured: boolean,
  environmentId: string,
  apiBaseUrl: string,
): Promise<PublicHealth["dynamic"]> {
  const startedAt = now();
  if (!configured || !environmentId) {
    return {
      state: "UNKNOWN",
      durationMs: now() - startedAt,
      message: "Dynamic is not configured in this runtime.",
      signal: "CONFIGURATION_ONLY",
    };
  }
  try {
    const base = new URL(apiBaseUrl || DYNAMIC_DEFAULT_API_BASE_URL);
    if (base.protocol !== "https:") throw new Error("CONFIGURATION_MISMATCH:dynamic-api-origin");
    const url = new URL(`${base.pathname.replace(/\/$/u, "")}/sdk/${encodeURIComponent(environmentId)}/settings`, base);
    await reliable(
      "DYNAMIC_HEALTH",
      async (signal) => {
        const response = await fetchFn(url, { method: "GET", cache: "no-store", signal });
        if (!response.ok) throw new HttpReadError(response.status);
      },
      retry,
    );
    return {
      state: "HEALTHY",
      durationMs: now() - startedAt,
      message: "Dynamic public environment settings are available.",
      signal: "PUBLIC_ENVIRONMENT_SETTINGS",
    };
  } catch (error) {
    return {
      ...checkFailure(error, now() - startedAt, "Authentication configuration is temporarily unavailable."),
      signal: "PUBLIC_ENVIRONMENT_SETTINGS",
    };
  }
}

export function combineHealthStates(states: readonly HealthState[]): HealthState {
  if (states.every((state) => state === "UNKNOWN")) return "UNKNOWN";
  if (states[0] === "UNAVAILABLE") return "UNAVAILABLE";
  if (states.some((state) => state !== "HEALTHY")) return "DEGRADED";
  return "HEALTHY";
}

function serviceCondition(state: HealthState): PublicHealth["serviceCondition"] {
  if (state === "HEALTHY") return "OPERATIONAL";
  if (state === "DEGRADED") return "DEGRADED";
  if (state === "UNAVAILABLE") return "UNAVAILABLE";
  return "UNKNOWN";
}

export async function getPublicHealth(options: HealthOptions = {}): Promise<PublicHealth> {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const [network, zama, dynamic, deployment] = await Promise.all([
    checkRpc(fetchFn, now, options.retry),
    checkZama(fetchFn, now, options.retry),
    checkDynamic(
      fetchFn,
      now,
      options.retry,
      options.dynamicConfigured ?? dynamicAuthConfigured,
      options.dynamicEnvironment ?? dynamicEnvironmentId,
      options.dynamicApiBase ?? dynamicApiBaseUrl,
    ),
    checkDeployment(fetchFn, now, options.retry),
  ]);
  const state = combineHealthStates([network.state, zama.state, dynamic.state, deployment.state]);
  recordMetric("HEALTH_CHECK", "SUCCESS", now() - startedAt);
  return {
    schema: "leopold.public-health.v1",
    state,
    checkedAt: new Date(now()).toISOString(),
    serviceCondition: serviceCondition(state),
    fundsCondition: "NOT_ASSESSED_BY_SERVICE_AVAILABILITY",
    assurance: "Service availability does not affect ownership of funds held by the protocol.",
    network,
    zama,
    dynamic,
    deployment,
    release: {
      manifestSha256: productionRelease.manifestSha256,
      freezeStatus: productionRelease.freezeStatus,
      p01Status: productionRelease.p01Status,
      unresolvedCritical: productionRelease.unresolvedCritical,
      unresolvedHigh: productionRelease.unresolvedHigh,
      unresolvedMedium: productionRelease.unresolvedMedium,
      runtimeBytes: productionRelease.runtimeBytes,
      eip170Headroom: productionRelease.eip170Headroom,
    },
  };
}
