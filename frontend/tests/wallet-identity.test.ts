import { describe, expect, it, vi } from "vitest";
import {
  WALLET_SESSION_STORAGE_KEY,
  clearPersistedWalletSession,
  createNotCheckedWalletRpcHealth,
  deriveWalletSession,
  initialWalletSessionControl,
  persistActiveWalletSession,
  readPersistedWalletSession,
  walletSessionReducer,
  withWalletSessionTimeout,
  type WalletSessionControl,
  type WalletSessionInputs,
} from "../lib/auth/wallet-identity";

const VERIFIED = "0x1111111111111111111111111111111111111111" as const;
const WRONG = "0x2222222222222222222222222222222222222222" as const;

function activeControl(overrides: Partial<WalletSessionControl> = {}): WalletSessionControl {
  return {
    intent: "ACTIVE",
    status: "CONNECTED",
    reason: "CONNECTED",
    epoch: 2,
    providerRevision: 0,
    connectOrigin: null,
    connectAttemptId: null,
    connectStartedAt: null,
    connectPhase: null,
    ...overrides,
  };
}

function inputs(overrides: Partial<WalletSessionInputs> = {}): WalletSessionInputs {
  return {
    initialized: true,
    verifiedFinancialWallet: VERIFIED,
    control: activeControl(),
    provider: {
      revision: 0,
      available: true,
      connected: true,
      accountKnown: true,
      activeAccount: VERIFIED,
      chainId: 11_155_111,
    },
    runtime: {
      dynamicPrimaryWallet: VERIFIED,
      dynamicLinkedWallets: [{ id: "verified", address: VERIFIED }],
      dynamicWalletObjectForVerifiedAddress: { id: "verified", address: VERIFIED },
      wagmiAccount: VERIFIED,
      walletClientAccount: VERIFIED,
      walletClientId: "client-1",
      walletClientChainId: 11_155_111,
    },
    networkHealth: { ...createNotCheckedWalletRpcHealth(), state: "HEALTHY", checkedAt: 1 },
    ...overrides,
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    data,
  };
}

describe("explicit Leopold wallet session", () => {
  it("uses BOOTSTRAPPING only before auth and SDK initialization", () => {
    expect(deriveWalletSession(inputs({ initialized: false })).status).toBe("BOOTSTRAPPING");
    const ready = walletSessionReducer(initialWalletSessionControl(), { type: "SDK_READY" });
    expect(ready.status).toBe("DISCONNECTED");
  });

  it("settles to DISCONNECTED when there is no explicit active session", () => {
    const control = walletSessionReducer(initialWalletSessionControl(), { type: "SDK_READY" });
    const result = deriveWalletSession(inputs({ control }));
    expect(result.status).toBe("DISCONNECTED");
    expect(result.address).toBeNull();
    expect(result.recoveryAction).toBe("CONNECT_VERIFIED_WALLET");
  });

  it("makes explicit disconnect immediate and independent of Dynamic, provider, and Wagmi state", () => {
    const control = walletSessionReducer(activeControl(), {
      type: "INVALIDATE",
      reason: "USER_DISCONNECTED",
      epoch: 3,
    });
    const result = deriveWalletSession(inputs({ control }));
    expect(result.status).toBe("DISCONNECTED");
    expect(result.reason).toBe("USER_DISCONNECTED");
    expect(result.address).toBeNull();
    expect(result.providerObservation.activeAccount).toBe(VERIFIED);
    expect(result.dynamicPrimaryAddress).toBe(VERIFIED);
    expect(result.wagmiAccount).toBe(VERIFIED);
  });

  it("does not turn missing Wagmi or WalletClient state into Checking while inactive", () => {
    const control = walletSessionReducer(activeControl(), {
      type: "INVALIDATE",
      reason: "USER_DISCONNECTED",
      epoch: 4,
    });
    const result = deriveWalletSession(
      inputs({
        control,
        runtime: { ...inputs().runtime, wagmiAccount: null, walletClientAccount: null, walletClientId: null },
      }),
    );
    expect(result.status).toBe("DISCONNECTED");
    expect(result.status).not.toBe("BOOTSTRAPPING");
  });

  it("invalidates an active session when the provider account changes", () => {
    const result = deriveWalletSession(inputs({ provider: { ...inputs().provider, activeAccount: WRONG } }));
    expect(result.status).toBe("DISCONNECTED");
    expect(result.reason).toBe("ACCOUNT_CHANGED");
    expect(result.address).toBeNull();
    expect(result.providerObservation.activeAccount).toBe(WRONG);
  });

  it("never adopts provider accounts while disconnected, including switching back to verified", () => {
    const control = walletSessionReducer(activeControl(), { type: "INVALIDATE", reason: "ACCOUNT_CHANGED", epoch: 5 });
    expect(
      deriveWalletSession(inputs({ control, provider: { ...inputs().provider, activeAccount: WRONG } })).status,
    ).toBe("DISCONNECTED");
    expect(deriveWalletSession(inputs({ control })).status).toBe("DISCONNECTED");
  });

  it("keeps a session invalid after a rapid provider switch away and back", () => {
    const changedBack = deriveWalletSession(
      inputs({
        control: activeControl({ providerRevision: 0 }),
        provider: { ...inputs().provider, revision: 2, activeAccount: VERIFIED },
      }),
    );
    expect(changedBack.status).toBe("DISCONNECTED");
    expect(changedBack.reason).toBe("ACCOUNT_CHANGED");
    expect(changedBack.canUseFinancialActions).toBe(false);
  });

  it("derives WRONG_NETWORK only for an explicit active session with the verified account", () => {
    const result = deriveWalletSession(
      inputs({
        control: activeControl({ status: "WRONG_NETWORK", reason: "WRONG_NETWORK" }),
        provider: { ...inputs().provider, chainId: 1 },
        runtime: { ...inputs().runtime, walletClientChainId: 1 },
      }),
    );
    expect(result.status).toBe("WRONG_NETWORK");
    expect(result.recoveryAction).toBe("SWITCH_TO_SEPOLIA");
    expect(result.canUseFinancialActions).toBe(false);
  });

  it("keeps identity CONNECTED while RPC health is checking or unavailable", () => {
    for (const state of ["CHECKING", "APP_RPC_UNAVAILABLE", "WALLET_RPC_UNAVAILABLE"] as const) {
      const result = deriveWalletSession(inputs({ networkHealth: { ...createNotCheckedWalletRpcHealth(), state } }));
      expect(result.status).toBe("CONNECTED");
      expect(result.canUseFinancialActions).toBe(false);
      expect(result.networkHealth.state).toBe(state);
    }
  });

  it("allows financial actions only when session, runtime, chain, and RPC health align", () => {
    expect(deriveWalletSession(inputs()).canUseFinancialActions).toBe(true);
    expect(deriveWalletSession(inputs({ runtime: { ...inputs().runtime, walletClientAccount: WRONG } })).status).toBe(
      "ERROR",
    );
  });

  it("models a bounded account-selection connect attempt", () => {
    const started = walletSessionReducer(initialWalletSessionControl(), {
      type: "CONNECT_STARTED",
      attemptId: "attempt-1",
      startedAt: 100,
      epoch: 1,
    });
    const waiting = walletSessionReducer(started, {
      type: "CONNECT_PHASE",
      attemptId: "attempt-1",
      phase: "WAITING_FOR_ACCOUNT_SELECTION",
      reason: "ACCOUNT_SELECTION_REQUIRED",
    });
    expect(waiting).toMatchObject({ intent: "CONNECTING", status: "CONNECTING", connectAttemptId: "attempt-1" });
    const timedOut = walletSessionReducer(waiting, {
      type: "CONNECT_FAILED",
      attemptId: "attempt-1",
      reason: "CONNECT_TIMEOUT",
      epoch: 2,
    });
    expect(timedOut).toMatchObject({ intent: "INACTIVE", status: "ERROR", reason: "CONNECT_TIMEOUT" });
  });

  it("discards stale connect-attempt transitions", () => {
    const started = walletSessionReducer(initialWalletSessionControl(), {
      type: "CONNECT_STARTED",
      attemptId: "new",
      startedAt: 1,
      epoch: 2,
    });
    expect(walletSessionReducer(started, { type: "CONNECTED", attemptId: "old", providerRevision: 0 })).toBe(started);
    expect(
      walletSessionReducer(started, {
        type: "CONNECT_PHASE",
        attemptId: "old",
        phase: "VERIFYING_RUNTIME",
      }),
    ).toBe(started);
  });

  it("persists only a non-sensitive explicit active-session marker", () => {
    const storage = memoryStorage();
    persistActiveWalletSession(storage, VERIFIED);
    expect(readPersistedWalletSession(storage)).toBe(VERIFIED);
    const raw = storage.data.get(WALLET_SESSION_STORAGE_KEY) ?? "";
    expect(raw).toContain("ACTIVE");
    expect(raw).not.toMatch(/private|signature|token|jwt|balance|handle/iu);
    clearPersistedWalletSession(storage);
    expect(readPersistedWalletSession(storage)).toBeNull();
  });

  it("ignores malformed or wrong-version persisted sessions", () => {
    const storage = memoryStorage();
    storage.setItem(WALLET_SESSION_STORAGE_KEY, "not-json");
    expect(readPersistedWalletSession(storage)).toBeNull();
    storage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify({ version: 2, intent: "ACTIVE", address: VERIFIED }));
    expect(readPersistedWalletSession(storage)).toBeNull();
  });

  it("bounds passive provider and RPC operations", async () => {
    vi.useFakeTimers();
    const pending = withWalletSessionTimeout(new Promise<never>(() => undefined), 25, "PROVIDER_TIMEOUT");
    const rejection = expect(pending).rejects.toThrow("PROVIDER_TIMEOUT");
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    vi.useRealTimers();
  });
});
