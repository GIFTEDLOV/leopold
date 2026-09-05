import { fallback, http, type Address } from "viem";
import { LEOPOLD_CHAIN_ID } from "./config";
import { sanitizeTechnicalDetail } from "./errors";
import { withReadReliability } from "@/lib/ops/reliability";

export const LEOPOLD_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const LEOPOLD_SEPOLIA_RPC_URLS = [LEOPOLD_SEPOLIA_RPC_URL, "https://1rpc.io/sepolia"] as const;
export const FINANCIAL_NETWORK_HEALTH_CACHE_TTL_MS = 5_000;
export const FINANCIAL_NETWORK_PROBE_TIMEOUT_MS = 10_000;

/** Application reads use both public providers; wallet signing remains wallet-provider-owned. */
export function createLeopoldSepoliaPublicTransport(timeoutMs = 8_000) {
  return fallback(LEOPOLD_SEPOLIA_RPC_URLS.map((url) => http(url, { timeout: timeoutMs, retryCount: 0 })));
}

export type FinancialNetworkHealthState =
  | "IDLE"
  | "CHECKING"
  | "HEALTHY"
  | "WRONG_NETWORK"
  | "APP_RPC_UNAVAILABLE"
  | "WALLET_RPC_UNAVAILABLE"
  | "WALLET_DISCONNECTED"
  | "WALLET_MISMATCH"
  | "UNKNOWN";

export type RpcRequester = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

export type FinancialNetworkHealth = {
  state: FinancialNetworkHealthState;
  backgroundChecking: boolean;
  checkedAt: number | null;
  dynamicWalletChainId: number | null;
  walletClientChainId: number | null;
  appChainId: number | null;
  technicalDetail?: string;
};

export type FinancialNetworkPreflightInput = {
  activeAccount: Address | null;
  financialWallet: Address | null;
  connectedWallet: Address | null;
  activeWallet: Address | null;
  walletClientAccount: Address | null;
  walletClient: RpcRequester | null;
  publicClient: RpcRequester | null;
  dynamicWalletChainId?: number | null;
  timeoutMs?: number;
  now?: () => number;
};

export function getFinancialNetworkHealthKey(input: {
  activeAccount: Address | null;
  financialWallet: Address | null;
  connectedWallet: Address | null;
  activeWallet: Address | null;
  walletClientAccount: Address | null;
  walletClientId: string | null;
  dynamicWalletChainId: number | null;
  wagmiAccountChainId: number | null;
}): string {
  return [
    input.activeAccount,
    input.financialWallet,
    input.connectedWallet,
    input.activeWallet,
    input.walletClientAccount,
    input.walletClientId,
    input.dynamicWalletChainId,
    input.wagmiAccountChainId,
  ]
    .map((value) => value ?? "")
    .join("|");
}

export type FinancialNetworkSnapshot = {
  connected: boolean;
  dynamicWalletChainId: number | null;
  walletClientChainId: number | null;
  wagmiAccountChainId?: number | null;
};

/** Public protocol reads remain anchored to Leopold's verified wallet during a temporary mismatch. */
export function getPublicReadAccount(financialWallet: Address | null, connectedWallet: Address | null): Address | null {
  return financialWallet ?? connectedWallet;
}

export function normalizeNetworkChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "bigint" && value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  if (typeof value === "string" && /^(?:\d+|0x[\da-f]+)$/iu.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function isRpcQuantity(value: unknown): value is string {
  return typeof value === "string" && /^0x[\da-f]+$/iu.test(value);
}

function addressesMatch(...addresses: Array<Address | null>): boolean {
  const normalized = addresses.map((address) => address?.toLowerCase() ?? null);
  return normalized.every((address) => address !== null && address === normalized[0]);
}

function result(
  state: FinancialNetworkHealthState,
  input: FinancialNetworkPreflightInput,
  values: Partial<Pick<FinancialNetworkHealth, "walletClientChainId" | "appChainId" | "technicalDetail">> = {},
): FinancialNetworkHealth {
  return {
    state,
    backgroundChecking: false,
    checkedAt: (input.now ?? Date.now)(),
    dynamicWalletChainId: input.dynamicWalletChainId ?? null,
    walletClientChainId: values.walletClientChainId ?? null,
    appChainId: values.appChainId ?? null,
    ...values,
  };
}

async function request(
  client: RpcRequester,
  method: string,
  params?: readonly unknown[],
  timeoutMs = FINANCIAL_NETWORK_PROBE_TIMEOUT_MS,
): Promise<unknown> {
  return withReadReliability(() => client.request({ method, params }), {
    operation: "NETWORK_PREFLIGHT",
    timeoutMs,
    baseDelayMs: 100,
  });
}

/**
 * Read-only connectivity check for the verified financial wallet and the
 * application's public Sepolia client. The wallet nonce request deliberately
 * uses the wallet client's own transport because that is the path which signs.
 */
export async function runFinancialNetworkPreflight(
  input: FinancialNetworkPreflightInput,
): Promise<FinancialNetworkHealth> {
  if (!input.activeAccount) {
    return result("WALLET_DISCONNECTED", input);
  }

  if (
    !addressesMatch(
      input.financialWallet,
      input.connectedWallet,
      input.activeWallet,
      input.activeAccount,
      input.walletClientAccount,
    )
  ) {
    return result("WALLET_MISMATCH", input);
  }

  if (input.dynamicWalletChainId !== null && input.dynamicWalletChainId !== undefined) {
    if (input.dynamicWalletChainId !== LEOPOLD_CHAIN_ID) {
      return result("WRONG_NETWORK", input, { walletClientChainId: input.dynamicWalletChainId });
    }
  }
  if (!input.walletClient || !input.walletClientAccount) {
    return result("WALLET_DISCONNECTED", input);
  }

  let walletClientChainId: number | null;
  try {
    walletClientChainId = normalizeNetworkChainId(
      await request(input.walletClient, "eth_chainId", undefined, input.timeoutMs),
    );
  } catch (error) {
    return result("WALLET_RPC_UNAVAILABLE", input, {
      technicalDetail: sanitizeTechnicalDetail(error),
    });
  }
  if (walletClientChainId === null) {
    return result("UNKNOWN", input, {
      technicalDetail: "The wallet provider returned an invalid eth_chainId response.",
    });
  }
  if (walletClientChainId !== LEOPOLD_CHAIN_ID) {
    return result("WRONG_NETWORK", input, { walletClientChainId });
  }

  const [appProbe, walletProbe] = await Promise.allSettled([
    (async () => {
      if (!input.publicClient) throw new Error("APP_RPC_UNAVAILABLE:public-client-missing");
      const appChainId = normalizeNetworkChainId(
        await request(input.publicClient, "eth_chainId", undefined, input.timeoutMs),
      );
      if (appChainId !== LEOPOLD_CHAIN_ID) {
        throw new Error(`APP_RPC_UNAVAILABLE:chain-${appChainId ?? "unknown"}`);
      }
      const blockNumber = await request(input.publicClient, "eth_blockNumber", undefined, input.timeoutMs);
      if (!isRpcQuantity(blockNumber)) throw new Error("APP_RPC_UNAVAILABLE:invalid-block-number");
      return appChainId;
    })(),
    (async () => {
      const nonce = await request(
        input.walletClient as RpcRequester,
        "eth_getTransactionCount",
        [input.financialWallet, "latest"],
        input.timeoutMs,
      );
      if (!isRpcQuantity(nonce)) throw new Error("WALLET_RPC_UNAVAILABLE:invalid-nonce");
    })(),
  ]);

  const appError = appProbe.status === "rejected" ? appProbe.reason : null;
  const walletError = walletProbe.status === "rejected" ? walletProbe.reason : null;
  if (walletError) {
    const detail = sanitizeTechnicalDetail(walletError);
    const appDetail = appError ? ` App RPC: ${sanitizeTechnicalDetail(appError)}` : "";
    return result("WALLET_RPC_UNAVAILABLE", input, {
      walletClientChainId,
      technicalDetail: `${detail}${appDetail}`.slice(0, 1200),
    });
  }
  if (appError) {
    return result("APP_RPC_UNAVAILABLE", input, {
      walletClientChainId,
      technicalDetail: sanitizeTechnicalDetail(appError),
    });
  }

  return result("HEALTHY", input, {
    walletClientChainId,
    appChainId: appProbe.status === "fulfilled" ? appProbe.value : null,
  });
}

export function createIdleFinancialNetworkHealth(): FinancialNetworkHealth {
  return {
    state: "IDLE",
    backgroundChecking: false,
    checkedAt: null,
    dynamicWalletChainId: null,
    walletClientChainId: null,
    appChainId: null,
  };
}

export function isFinancialNetworkHealthFresh(
  cached: { key: string; health: FinancialNetworkHealth } | null,
  key: string,
  now = Date.now(),
): boolean {
  return (
    cached?.key === key &&
    cached.health.checkedAt !== null &&
    now - cached.health.checkedAt < FINANCIAL_NETWORK_HEALTH_CACHE_TTL_MS
  );
}

export type FinancialNetworkCheckMode = "auto" | "background" | "write" | "retry";

export function beginFinancialNetworkCheck(
  current: FinancialNetworkHealth,
  mode: FinancialNetworkCheckMode,
): FinancialNetworkHealth {
  const preserveHealthy = current.state === "HEALTHY" && (mode === "background" || mode === "write");
  return {
    ...current,
    state: preserveHealthy ? "HEALTHY" : "CHECKING",
    backgroundChecking: preserveHealthy,
    technicalDetail: preserveHealthy ? current.technicalDetail : undefined,
  };
}

export function financialWritesAllowed(health: FinancialNetworkHealth): boolean {
  return health.state === "HEALTHY";
}

/**
 * The configured Wagmi chain is intentionally not authoritative. This helper
 * remains useful for the preflight's chain-only diagnostics and fixtures.
 */
export function getFinancialNetworkStatus(snapshot: FinancialNetworkSnapshot): FinancialNetworkHealthState {
  if (!snapshot.connected) return "WALLET_DISCONNECTED";
  const actual = [snapshot.dynamicWalletChainId, snapshot.walletClientChainId].filter(
    (value): value is number => value !== null,
  );
  if (actual.length === 0) return "CHECKING";
  if (actual.some((value) => value !== LEOPOLD_CHAIN_ID)) return "WRONG_NETWORK";
  if (new Set(actual).size > 1) return "WALLET_MISMATCH";
  return "HEALTHY";
}
