import { describe, expect, it, vi } from "vitest";

import {
  createIdleFinancialNetworkHealth,
  financialWritesAllowed,
  getFinancialNetworkHealthKey,
  getFinancialNetworkStatus,
  LEOPOLD_SEPOLIA_RPC_URL,
  normalizeNetworkChainId,
  runFinancialNetworkPreflight,
  type FinancialNetworkPreflightInput,
} from "../lib/leopold/network";
import { classifyLeopoldError } from "../lib/leopold/errors";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;

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
    expect(financialWritesAllowed({ ...createIdleFinancialNetworkHealth(), state: "WALLET_RPC_UNAVAILABLE" })).toBe(
      false,
    );
    expect(financialWritesAllowed({ ...createIdleFinancialNetworkHealth(), state: "APP_RPC_UNAVAILABLE" })).toBe(false);
    expect(financialWritesAllowed({ ...createIdleFinancialNetworkHealth(), state: "HEALTHY" })).toBe(true);
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
