// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const HANDLE = `0x${"1".repeat(64)}` as const;
const VAULT_HANDLE = `0x${"2".repeat(64)}` as const;

const state = vi.hoisted(() => ({
  authIdentity: "test-identity",
  walletEpoch: 1,
  publicClient: { id: "public-client", getChainId: vi.fn(async () => 11_155_111) },
  walletClient: {
    account: { address: "0x1111111111111111111111111111111111111111" },
    getChainId: vi.fn(async () => 11_155_111),
  },
  readPrivateHandle: vi.fn(async () => VAULT_HANDLE),
  decryptPrivateValue: vi.fn(async (_ethereum: unknown, _account: unknown, _contract: unknown, handle: string) =>
    handle === VAULT_HANDLE ? 2_000_000n : 1_000_000n),
  clearPrivateSession: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useBalance: () => ({ data: { value: 1n } }),
  usePublicClient: () => state.publicClient,
  useWalletClient: () => ({ data: state.walletClient }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    clientReady: true,
    accountStatus: "SIGNED_IN_READY",
    financialWallet: ACCOUNT,
    financialWalletMetadata: { status: "PRESENT" },
    authenticated: true,
    identityKey: state.authIdentity,
    readiness: {},
  }),
}));

vi.mock("@/components/wallet-identity-provider", () => ({
  useWalletIdentity: () => ({
    walletSession: {
      status: "CONNECTED",
      address: ACCOUNT,
      verifiedAddress: ACCOUNT,
      chainId: 11_155_111,
      canUseFinancialActions: true,
      epoch: state.walletEpoch,
    },
    networkHealth: { state: "HEALTHY" },
    identity: { verifiedAddress: ACCOUNT },
    requireConnectedFinancialSession: vi.fn(async () => undefined),
    retryNetworkHealth: vi.fn(),
    disconnectLeopoldWallet: vi.fn(),
  }),
}));

vi.mock("@/lib/leopold/reads", async () => {
  const actual = await vi.importActual<typeof import("@/lib/leopold/reads")>("@/lib/leopold/reads");
  return {
    ...actual,
    readLatestBlock: vi.fn(async () => ({ number: 123n, timestamp: 456n })),
    readUsdcBalance: vi.fn(async () => 0n),
    readPrivateHandle: state.readPrivateHandle,
    readVaultPublicHistory: vi.fn(async (_client: unknown, vault: { slug: string }) => [
      {
        roundId: 1n,
        opensAt: 100n,
        closesAt: 200n,
        state: 1,
        stateLabel: "Open",
        publicPrize: 0n,
        publicSponsoredPrize: 0n,
        participantCount: 0n,
        selectionCursor: 0n,
        allocationCursor: 0n,
        entered: false,
        eligibilityStart: 0n,
        bondAmount: 0n,
        refundAmount: 0n,
        refundClaimed: false,
        settlementReward: 0n,
        vaultSlug: vault.slug,
      },
    ]),
    validateConfiguredDeployment: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/leopold/private-balance", async () => {
  const actual = await vi.importActual<typeof import("@/lib/leopold/private-balance")>("@/lib/leopold/private-balance");
  return {
    ...actual,
    readCurrentPrivateBalanceHandle: vi.fn(async () => ({
      handle: HANDLE,
      account: ACCOUNT,
      token: "0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8",
      chainId: 11_155_111,
    })),
  };
});

vi.mock("@/lib/leopold/zama", async () => {
  const actual = await vi.importActual<typeof import("@/lib/leopold/zama")>("@/lib/leopold/zama");
  return { ...actual, decryptPrivateValue: state.decryptPrivateValue, clearPrivateSession: state.clearPrivateSession };
});

import { FinancialProvider, useFinancial } from "../components/financial-provider";

function Probe() {
  const financial = useFinancial();
  return (
    <>
      <output data-testid="vault-position">
        {financial.revealedVaults.has("weekly") ? financial.vaultPositions.weekly?.toString() : "hidden"}
      </output>
      <button data-testid="reveal-vault" onClick={() => void financial.revealVault("weekly").catch(() => undefined)} />
      <button data-testid="hide-vault" onClick={() => financial.hideVault("weekly")} />
    </>
  );
}

describe("provider-owned private reveal lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    state.readPrivateHandle.mockClear();
    state.decryptPrivateValue.mockClear();
    state.clearPrivateSession.mockClear();
    state.authIdentity = "test-identity";
    state.walletEpoch = 1;
    (window as unknown as { ethereum?: { request: () => Promise<unknown> } }).ethereum = {
      request: vi.fn(async () => undefined),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    container.remove();
  });

  async function renderAndFlush() {
    await act(async () => {
      root?.render(
        <FinancialProvider>
          <Probe />
        </FinancialProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  async function click(testId: string) {
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  it("reveals provider values, clears an explicit hide, and permits a subsequent reveal", async () => {
    await renderAndFlush();
    await click("reveal-vault");
    expect(container.querySelector("[data-testid=vault-position]")?.textContent).toBe("2000000");

    await click("hide-vault");
    expect(container.querySelector("[data-testid=vault-position]")?.textContent).toBe("hidden");

    await click("reveal-vault");
    expect(container.querySelector("[data-testid=vault-position]")?.textContent).toBe("2000000");
  });

  it("clears every plaintext value on browser focus loss", async () => {
    await renderAndFlush();
    await click("reveal-vault");

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(container.querySelector("[data-testid=vault-position]")?.textContent).toBe("hidden");
  });

  it("clears plaintext before an account/session disconnect can be reused", async () => {
    await renderAndFlush();
    await click("reveal-vault");

    state.authIdentity = "switched-identity";
    state.walletEpoch = 2;
    await act(async () => {
      root?.render(
        <FinancialProvider>
          <Probe />
        </FinancialProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.querySelector("[data-testid=vault-position]")?.textContent).toBe("hidden");
  });
});
