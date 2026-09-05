import { createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginFinancialNetworkCheck,
  createIdleFinancialNetworkHealth,
  financialWritesAllowed,
  getFinancialNetworkHealthKey,
  getPublicReadAccount,
  getFinancialNetworkStatus,
  isFinancialNetworkHealthFresh,
  LEOPOLD_SEPOLIA_RPC_URL,
  LEOPOLD_SEPOLIA_RPC_URLS,
  normalizeNetworkChainId,
  runFinancialNetworkPreflight,
  createLeopoldSepoliaPublicTransport,
  type FinancialNetworkPreflightInput,
} from "../lib/leopold/network";
import { classifyLeopoldError } from "../lib/leopold/errors";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

function installFallbackFetch(primary: "success" | "fail" | "timeout" | "malformed" = "success") {
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    const isPrimary = String(input).includes("publicnode.com");
    const mode = isPrimary ? primary : "success";
    if (mode === "fail") throw new TypeError("primary fetch failed");
    if (mode === "timeout") {
      return new Promise<never>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      });
    }
    if (mode === "malformed") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32_000, message: "bad gateway" } }));
    }
    const request = JSON.parse(String(init?.body)) as { method: string };
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: request.method === "eth_chainId" ? "0xaa36a7" : "0x123" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}

async function readFallbackBlockNumber(timeoutMs = 100) {
  const client = createPublicClient({
    chain: sepolia,
    transport: createLeopoldSepoliaPublicTransport(timeoutMs),
  });
  return client.getBlockNumber();
}

function makePreflight(
  overrides: {
    walletRequest?: (method: string, params?: readonly unknown[]) => unknown;
    appRequest?: (method: string, params?: readonly unknown[]) => unknown;
  } = {},
) {
  const walletRequest = vi.fn(async ({ method, params }: { method: string; params?: readonly unknown[] }) => {
    if (overrides.walletRequest) return overrides.walletRequest(method, params);
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_getTransactionCount") return "0x0";
    throw new Error(`unexpected wallet method ${method}`);
  });
  const appRequest = vi.fn(async ({ method }: { method: string; params?: readonly unknown[] }) => {
    if (overrides.appRequest) return overrides.appRequest(method);
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_blockNumber") return "0x123";
    throw new Error(`unexpected app method ${method}`);
  });
  const input: FinancialNetworkPreflightInput = {
    activeAccount: ACCOUNT,
    financialWallet: ACCOUNT,
    connectedWallet: ACCOUNT,
    activeWallet: ACCOUNT,
    walletClientAccount: ACCOUNT,
    walletClient: { request: walletRequest },
    publicClient: { request: appRequest },
    dynamicWalletChainId: 11_155_111,
    now: () => 123,
  };
  return {
    input,
    walletRequest,
    appRequest,
  };
}

describe("financial wallet network authority", () => {
  it("treats a Dynamic wallet on Mainnet as wrong even when Wagmi is configured for Sepolia", () => {
    expect(
      getFinancialNetworkStatus({
        connected: true,
        dynamicWalletChainId: 1,
        walletClientChainId: 1,
        wagmiAccountChainId: 11_155_111,
      }),
    ).toBe("WRONG_NETWORK");
  });

  it("accepts only an actual Sepolia signing wallet", () => {
    expect(
      getFinancialNetworkStatus({
        connected: true,
        dynamicWalletChainId: 11_155_111,
        walletClientChainId: 11_155_111,
        wagmiAccountChainId: 1,
      }),
    ).toBe("HEALTHY");
  });

  it("fails closed when Dynamic and the signing client disagree", () => {
    expect(
      getFinancialNetworkStatus({
        connected: true,
        dynamicWalletChainId: 1,
        walletClientChainId: 11_155_111,
        wagmiAccountChainId: 11_155_111,
      }),
    ).toBe("WRONG_NETWORK");
  });

  it("models Sepolia to Mainnet to Sepolia reactivity without a page refresh", () => {
    const snapshot = { connected: true, dynamicWalletChainId: 11_155_111, walletClientChainId: 11_155_111 };
    expect(getFinancialNetworkStatus(snapshot)).toBe("HEALTHY");
    snapshot.dynamicWalletChainId = 1;
    snapshot.walletClientChainId = 1;
    expect(getFinancialNetworkStatus(snapshot)).toBe("WRONG_NETWORK");
    snapshot.dynamicWalletChainId = 11_155_111;
    snapshot.walletClientChainId = 11_155_111;
    expect(getFinancialNetworkStatus(snapshot)).toBe("HEALTHY");
  });

  it("does not treat an unknown wallet network as ready", () => {
    expect(getFinancialNetworkStatus({ connected: true, dynamicWalletChainId: null, walletClientChainId: null })).toBe(
      "CHECKING",
    );
  });

  it("normalizes Dynamic and JSON-RPC chain-id values", () => {
    expect(normalizeNetworkChainId("1")).toBe(1);
    expect(normalizeNetworkChainId("0xaa36a7")).toBe(11_155_111);
    expect(normalizeNetworkChainId(11_155_111)).toBe(11_155_111);
    expect(normalizeNetworkChainId("mainnet")).toBeNull();
  });

  it("uses the project-approved PublicNode Sepolia read transport", () => {
    expect(LEOPOLD_SEPOLIA_RPC_URL).toBe("https://ethereum-sepolia-rpc.publicnode.com");
    expect(LEOPOLD_SEPOLIA_RPC_URLS).toEqual([
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://1rpc.io/sepolia",
    ]);
  });

  it("uses the primary application read endpoint normally", async () => {
    const fetchFn = installFallbackFetch();

    await expect(readFallbackBlockNumber()).resolves.toBe(0x123n);
    expect(fetchFn.mock.calls.filter(([input]) => String(input).includes("publicnode.com"))).toHaveLength(1);
    expect(fetchFn.mock.calls.filter(([input]) => String(input).includes("1rpc.io"))).toHaveLength(0);
  });

  it("falls back to the distinct provider when the primary fails", async () => {
    const fetchFn = installFallbackFetch("fail");

    await expect(readFallbackBlockNumber()).resolves.toBe(0x123n);
    expect(fetchFn.mock.calls.some(([input]) => String(input).includes("publicnode.com"))).toBe(true);
    expect(fetchFn.mock.calls.some(([input]) => String(input).includes("1rpc.io"))).toBe(true);
  });

  it("falls back to the distinct provider when the primary times out", async () => {
    const fetchFn = installFallbackFetch("timeout");

    await expect(readFallbackBlockNumber(25)).resolves.toBe(0x123n);
    expect(fetchFn.mock.calls.some(([input]) => String(input).includes("1rpc.io"))).toBe(true);
  });

  it("falls back after a malformed primary JSON-RPC response", async () => {
    const fetchFn = installFallbackFetch("malformed");

    await expect(readFallbackBlockNumber()).resolves.toBe(0x123n);
    expect(fetchFn.mock.calls.some(([input]) => String(input).includes("1rpc.io"))).toBe(true);
  });

  it("fails real application reads when every endpoint fails", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("publicnode.com") || String(input).includes("1rpc.io")) {
        throw new TypeError("RPC unavailable");
      }
      throw new Error("unexpected endpoint");
    });
    vi.stubGlobal("fetch", fetchFn);

    await expect(readFallbackBlockNumber()).rejects.toThrow();
    expect(fetchFn.mock.calls.some(([input]) => String(input).includes("publicnode.com"))).toBe(true);
    expect(fetchFn.mock.calls.some(([input]) => String(input).includes("1rpc.io"))).toBe(true);
  });

  it("rejects a wrong-chain application response instead of accepting it", async () => {
    const probe = makePreflight({
      appRequest: (method) => (method === "eth_chainId" ? "0x1" : "0x123"),
    });
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("APP_RPC_UNAVAILABLE");
    expect(health.technicalDetail).toContain("chain-1");
  });

  it("keeps wallet RPC and signing authority separate from application fallback reads", async () => {
    const probe = makePreflight();
    await expect(runFinancialNetworkPreflight(probe.input)).resolves.toMatchObject({ state: "HEALTHY" });

    expect(probe.appRequest.mock.calls.some(([request]) => request.method === "eth_getTransactionCount")).toBe(false);
    expect(probe.walletRequest.mock.calls.some(([request]) => request.method === "eth_sendTransaction")).toBe(false);
  });

  it("returns HEALTHY only after both wallet and app RPC probes succeed", async () => {
    const probe = makePreflight();
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("HEALTHY");
    expect(probe.walletRequest).toHaveBeenCalledWith({ method: "eth_chainId", params: undefined });
    expect(probe.walletRequest).toHaveBeenCalledWith({
      method: "eth_getTransactionCount",
      params: [ACCOUNT, "latest"],
    });
    expect(probe.appRequest).toHaveBeenCalledWith({ method: "eth_chainId", params: undefined });
    expect(probe.appRequest).toHaveBeenCalledWith({ method: "eth_blockNumber", params: undefined });
  });

  it("returns WRONG_NETWORK before the nonce or app probe on Mainnet", async () => {
    const probe = makePreflight({ walletRequest: (method) => (method === "eth_chainId" ? "0x1" : "0x0") });
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("WRONG_NETWORK");
    expect(probe.walletRequest).toHaveBeenCalledTimes(1);
    expect(probe.appRequest).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable Leopold public RPC from a working wallet RPC", async () => {
    const probe = makePreflight({
      appRequest: (method) => (method === "eth_chainId" ? Promise.reject(new Error("fetch failed")) : "0x123"),
    });
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("APP_RPC_UNAVAILABLE");
    expect(probe.walletRequest).toHaveBeenCalledWith({
      method: "eth_getTransactionCount",
      params: [ACCOUNT, "latest"],
    });
  });

  it("classifies the wallet's dRPC plan failure as WALLET_RPC_UNAVAILABLE", async () => {
    const probe = makePreflight({
      walletRequest: (method) =>
        method === "eth_getTransactionCount"
          ? Promise.reject(
              new Error("RPC Request failed: chain is not available on free plan, please upgrade to paid plan"),
            )
          : "0xaa36a7",
    });
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("WALLET_RPC_UNAVAILABLE");
    expect(classifyLeopoldError(new Error(`WALLET_RPC_UNAVAILABLE:${health.technicalDetail}`)).code).toBe(
      "WALLET_RPC_UNAVAILABLE",
    );
  });

  it("turns a never-settling wallet RPC probe into a finite typed failure", async () => {
    vi.useFakeTimers();
    const probe = makePreflight({ walletRequest: () => new Promise<never>(() => undefined) });
    probe.input.timeoutMs = 25;
    const pending = runFinancialNetworkPreflight(probe.input);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toMatchObject({
      state: "WALLET_RPC_UNAVAILABLE",
      technicalDetail: expect.stringContaining("READ_TIMEOUT:25"),
    });
    expect(probe.walletRequest).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("walks nested provider causes and sanitizes credentials", async () => {
    const probe = makePreflight({
      walletRequest: (method) =>
        method === "eth_getTransactionCount"
          ? Promise.reject({
              code: -32603,
              message: "RPC Request failed",
              cause: { details: "chain is not available on free plan", url: "https://rpc.example/?apiKey=secret" },
            })
          : "0xaa36a7",
    });
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("WALLET_RPC_UNAVAILABLE");
    expect(health.technicalDetail).toContain("free plan");
    expect(health.technicalDetail).not.toContain("secret");
  });

  it("returns WALLET_MISMATCH before touching either RPC", async () => {
    const probe = makePreflight();
    probe.input.activeWallet = "0x2222222222222222222222222222222222222222";
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("WALLET_MISMATCH");
    expect(probe.walletRequest).not.toHaveBeenCalled();
    expect(probe.appRequest).not.toHaveBeenCalled();
  });

  it("prioritizes WALLET_MISMATCH over downstream RPC failures", async () => {
    const probe = makePreflight({
      walletRequest: () => Promise.reject(new Error("wallet RPC unavailable")),
      appRequest: () => Promise.reject(new Error("app RPC unavailable")),
    });
    probe.input.connectedWallet = "0x2222222222222222222222222222222222222222";
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("WALLET_MISMATCH");
    expect(probe.walletRequest).not.toHaveBeenCalled();
    expect(probe.appRequest).not.toHaveBeenCalled();
  });

  it("prioritizes WALLET_DISCONNECTED before any RPC probe", async () => {
    const probe = makePreflight({
      walletRequest: () => Promise.reject(new Error("wallet RPC unavailable")),
      appRequest: () => Promise.reject(new Error("app RPC unavailable")),
    });
    probe.input.activeAccount = null;
    const health = await runFinancialNetworkPreflight(probe.input);

    expect(health.state).toBe("WALLET_DISCONNECTED");
    expect(probe.walletRequest).not.toHaveBeenCalled();
    expect(probe.appRequest).not.toHaveBeenCalled();
  });

  it("anchors public reads to the verified financial wallet during mismatch", () => {
    const verified = ACCOUNT;
    const connected = "0x2222222222222222222222222222222222222222" as const;
    expect(getPublicReadAccount(verified, connected)).toBe(verified);
    expect(getPublicReadAccount(null, connected)).toBe(connected);
  });

  it("invalidates the health identity when account or network changes", () => {
    const base = {
      activeAccount: ACCOUNT,
      financialWallet: ACCOUNT,
      connectedWallet: ACCOUNT,
      activeWallet: ACCOUNT,
      walletClientAccount: ACCOUNT,
      walletClientId: "wallet-a",
      dynamicWalletChainId: 11_155_111,
      wagmiAccountChainId: 11_155_111,
    };
    expect(getFinancialNetworkHealthKey(base)).not.toBe(
      getFinancialNetworkHealthKey({ ...base, dynamicWalletChainId: 1 }),
    );
    expect(getFinancialNetworkHealthKey(base)).not.toBe(
      getFinancialNetworkHealthKey({ ...base, activeAccount: "0x2222222222222222222222222222222222222222" }),
    );
  });

  it("blocks writes for every non-healthy state and allows only HEALTHY", () => {
    expect(financialWritesAllowed({ ...createIdleFinancialNetworkHealth(), state: "WALLET_DISCONNECTED" })).toBe(false);
    expect(financialWritesAllowed({ ...createIdleFinancialNetworkHealth(), state: "WALLET_MISMATCH" })).toBe(false);
    expect(financialWritesAllowed({ ...createIdleFinancialNetworkHealth(), state: "WALLET_RPC_UNAVAILABLE" })).toBe(
      false,
    );
    expect(financialWritesAllowed({ ...createIdleFinancialNetworkHealth(), state: "APP_RPC_UNAVAILABLE" })).toBe(false);
    expect(financialWritesAllowed({ ...createIdleFinancialNetworkHealth(), state: "HEALTHY" })).toBe(true);
  });

  it("keeps healthy UI non-blocking during background and stale-write rechecks", () => {
    const healthy = { ...createIdleFinancialNetworkHealth(), state: "HEALTHY" as const, checkedAt: 123 };

    const background = beginFinancialNetworkCheck(healthy, "background");
    expect(background).toMatchObject({
      state: "HEALTHY",
      backgroundChecking: true,
    });
    expect(financialWritesAllowed(background)).toBe(true);
    expect(beginFinancialNetworkCheck(healthy, "write")).toMatchObject({
      state: "HEALTHY",
      backgroundChecking: true,
    });
    expect(beginFinancialNetworkCheck(healthy, "auto")).toMatchObject({
      state: "CHECKING",
      backgroundChecking: false,
    });
  });

  it("reuses only a same-identity fresh health result", () => {
    const health = { ...createIdleFinancialNetworkHealth(), state: "HEALTHY" as const, checkedAt: 1_000 };
    const cached = { key: "same-wallet-sepolia", health };

    expect(isFinancialNetworkHealthFresh(cached, "same-wallet-sepolia", 5_999)).toBe(true);
    expect(isFinancialNetworkHealthFresh(cached, "same-wallet-sepolia", 6_000)).toBe(false);
    expect(isFinancialNetworkHealthFresh(cached, "different-wallet", 1_001)).toBe(false);
  });

  it("reruns both read-only probes when retried", async () => {
    const probe = makePreflight();
    await runFinancialNetworkPreflight(probe.input);
    await runFinancialNetworkPreflight(probe.input);

    expect(probe.walletRequest).toHaveBeenCalledTimes(4);
    expect(probe.appRequest).toHaveBeenCalledTimes(4);
  });

  it("never requests signing or transaction submission during preflight", async () => {
    const probe = makePreflight();
    await runFinancialNetworkPreflight(probe.input);
    const methods = probe.walletRequest.mock.calls.map(([request]) => request.method);

    expect(methods).not.toContain("eth_sendTransaction");
    expect(methods).not.toContain("personal_sign");
    expect(methods).toEqual(["eth_chainId", "eth_getTransactionCount"]);
  });
});
