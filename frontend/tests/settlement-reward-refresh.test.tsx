// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"a".repeat(64)}` as const;

const state = vi.hoisted(() => ({
  rewardClaim: vi.fn(),
  refundClaim: vi.fn(),
  readReward: vi.fn(),
  readHistory: vi.fn(),
  readRound: vi.fn(),
  refreshBlock: vi.fn(),
  refundReads: 0,
  publicClient: { id: "public-client" },
  walletClient: {
    account: { address: "0x1111111111111111111111111111111111111111" },
    getChainId: vi.fn(async () => 11_155_111),
  },
}));

vi.mock("wagmi", () => ({
  useBalance: () => ({ data: { value: 0n } }),
  usePublicClient: () => state.publicClient,
  useWalletClient: () => ({ data: state.walletClient }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    clientReady: true,
    accountStatus: "SIGNED_IN_READY",
    financialWalletMetadata: { status: "PRESENT" },
    authenticated: true,
    identityKey: "test-identity",
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
      epoch: 1,
    },
    networkHealth: { state: "HEALTHY" },
    identity: { verifiedAddress: ACCOUNT },
    requireConnectedFinancialSession: vi.fn(async () => undefined),
    retryNetworkHealth: vi.fn(),
  }),
}));

vi.mock("@/lib/leopold/actions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/leopold/actions")>("@/lib/leopold/actions");
  return {
    ...actual,
    claimSettlementRewards: state.rewardClaim,
    claimBondRefund: state.refundClaim,
  };
});

vi.mock("@/lib/leopold/reads", async () => {
  const actual = await vi.importActual<typeof import("@/lib/leopold/reads")>("@/lib/leopold/reads");
  return {
    ...actual,
    readLatestBlock: state.refreshBlock,
    readSettlementRewardCredit: state.readReward,
    readUsdcBalance: vi.fn(async () => 0n),
    readVaultPublicHistory: state.readHistory,
    readVaultPublicStateForRound: state.readRound,
    validateConfiguredDeployment: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/leopold/private-balance", async () => {
  const actual = await vi.importActual<typeof import("@/lib/leopold/private-balance")>("@/lib/leopold/private-balance");
  return {
    ...actual,
    readCurrentPrivateBalanceHandle: vi.fn(async () => ({
      handle: `0x${"1".repeat(64)}` as const,
      account: ACCOUNT,
      token: `0x${"2".repeat(40)}` as const,
      chainId: 11_155_111,
    })),
  };
});

import { FinancialProvider, useFinancial } from "../components/financial-provider";
import { leopoldConfig } from "../lib/leopold/config";
import type { VaultPublicState } from "../lib/leopold/reads";

function roundState(reward: bigint): VaultPublicState {
  return {
    roundId: 2n,
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
    bondAmount: 5_000_000_000_000_000n,
    refundAmount: 0n,
    refundClaimed: false,
    settlementReward: reward,
  };
}

function historyFor(vault: (typeof leopoldConfig.vaults)[number]): VaultPublicState[] {
  return [roundState(vault.slug === "weekly" ? 5_000_000_000_000_000n : 0n)];
}

function Probe() {
  const financial = useFinancial();
  const reward = financial.publicVaultState.weekly?.settlementReward;
  return (
    <>
      <output data-testid="reward">{reward?.toString() ?? "unavailable"}</output>
      <output data-testid="tx-stage">{financial.txStage}</output>
      <output data-testid="activity">{financial.activity.map((item) => item.label).join(",")}</output>
      <output data-testid="refund-claimed">
        {String(financial.historicalVaultRounds.weekly?.[0]?.refundClaimed ?? false)}
      </output>
      <button
        data-testid="claim"
        onClick={() => {
          void financial.claimRewards("weekly").catch(() => undefined);
        }}
      >
        Claim
      </button>
      <button
        data-testid="refund"
        onClick={() => {
          void financial.claimRefund("weekly", 1n).catch(() => undefined);
        }}
      >
        Refund
      </button>
    </>
  );
}

describe("settlement reward post-confirmation refresh", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    state.rewardClaim.mockReset();
    state.refundClaim.mockReset();
    state.readReward.mockReset();
    state.readHistory.mockReset();
    state.readRound.mockReset();
    state.refreshBlock.mockReset();
    state.refundReads = 0;
    state.rewardClaim.mockImplementation(async (clients: { onHash?: (hash: `0x${string}`) => void }) => {
      clients.onHash?.(HASH);
      await new Promise((resolve) => setTimeout(resolve, 1));
      return HASH;
    });
    state.readReward.mockResolvedValue(0n);
    state.refreshBlock.mockResolvedValue({ number: 123n, timestamp: 456n });
    state.readHistory.mockImplementation(async (_client: unknown, vault: (typeof leopoldConfig.vaults)[number]) =>
      historyFor(vault),
    );
    state.readRound.mockImplementation(async () => {
      state.refundReads += 1;
      return {
        ...roundState(0n),
        roundId: 1n,
        state: 10,
        stateLabel: "Settled",
        closesAt: 50n,
        entered: true,
        refundAmount: 2_500_000_000_000_000n,
        refundClaimed: state.refundReads > 1,
      } satisfies VaultPublicState;
    });
    state.refundClaim.mockImplementation(async (clients: { onHash?: (hash: `0x${string}`) => void }) => {
      clients.onHash?.(HASH);
      await new Promise((resolve) => setTimeout(resolve, 1));
      return HASH;
    });
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

  async function renderAndSettle() {
    await act(async () => {
      root?.render(
        <FinancialProvider>
          <Probe />
        </FinancialProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }

  it("rereads the connected account's authoritative credit after a confirmed claim", async () => {
    await renderAndSettle();
    expect(container.querySelector("[data-testid=reward]")?.textContent).toBe("5000000000000000");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid=claim]")?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(state.rewardClaim).toHaveBeenCalledOnce();
    expect(state.readReward).toHaveBeenCalledWith(
      expect.objectContaining({ id: "public-client" }),
      leopoldConfig.vaults.find((vault) => vault.slug === "weekly")?.bondEscrow.address,
      ACCOUNT,
      123n,
    );
    expect(container.querySelector("[data-testid=reward]")?.textContent).toBe("0");
    expect(container.querySelector("[data-testid=tx-stage]")?.textContent).toBe("complete");
    expect(container.querySelector("[data-testid=activity]")?.textContent).toContain("Claimed settlement reward");
  });

  it("preserves available credit on a failed claim and never retries it", async () => {
    state.rewardClaim.mockRejectedValueOnce(new Error("user rejected"));
    await renderAndSettle();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid=claim]")?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(state.rewardClaim).toHaveBeenCalledOnce();
    expect(state.readReward).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=reward]")?.textContent).toBe("5000000000000000");
    expect(container.querySelector("[data-testid=tx-stage]")?.textContent).toBe("failed");
  });

  it("rereads a historical round after a confirmed bond-refund claim", async () => {
    await renderAndSettle();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid=refund]")?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(state.refundClaim).toHaveBeenCalledOnce();
    expect(state.readRound).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-testid=refund-claimed]")?.textContent).toBe("true");
  });
});
