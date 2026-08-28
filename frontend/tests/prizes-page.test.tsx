// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  revealEligibility: vi.fn<(roundId?: bigint) => Promise<void>>().mockResolvedValue(undefined),
  revealResult: vi.fn<(roundId?: bigint) => Promise<void>>().mockResolvedValue(undefined),
  claimBondRefund: vi.fn<(roundId?: bigint) => Promise<void>>().mockResolvedValue(undefined),
}));

const historicalEligibility = vi.hoisted(() => ({
  available: true,
  state: "hidden" as "hidden" | "revealing" | "revealed" | "reveal-failed",
  value: null as bigint | null,
}));

const transactionState = vi.hoisted(() => ({ error: null as { message: string } | null }));

const controller = vi.hoisted(() => ({
  vaults: [
    {
      id: "weekly" as const,
      name: "Weekly",
      round: {
        id: 2n,
        opensAt: 200n,
        closesAt: 300n,
        label: "Open",
        publicPrizeReserve: 0n,
        entered: false,
        participantCount: 0n,
        settlementProgress: { selectionCursor: 0n, allocationCursor: 0n },
      },
      privateResult: { available: false, state: "hidden" as const, value: null },
      actions: { revealResult: vi.fn(async () => undefined) },
    },
  ],
  completedRounds: [
    {
      vaultId: "weekly" as const,
      vaultName: "Weekly",
      state: "settled" as const,
      round: {
        id: 1n,
        opensAt: 100n,
        closesAt: 200n,
        label: "Settled",
        storedPrize: 100_000n,
        publicPrizeReserve: 100_000n,
        entered: true as const,
        participantCount: 2n,
      },
      eligibility: historicalEligibility,
      privateResult: { available: true, state: "hidden" as const, value: null },
      rewards: { bondRefund: 0n, bondRefundClaimed: false, settlementReward: 0n },
      actions: {
        revealEligibility: () => actions.revealEligibility(1n),
        revealResult: () => actions.revealResult(1n),
        claimBondRefund: () => actions.claimBondRefund(1n),
      },
    },
  ],
  wallet: { canUseFinancialActions: true },
  transactions: { current: transactionState },
}));

vi.mock("@/components/leopold-ui-controller", () => ({
  useLeopoldUiController: () => controller,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: ReactNode }) => children }));

import PrizesPage from "../app/app/prizes/page";

describe("historical prize round navigation", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    actions.revealEligibility.mockClear();
    actions.revealResult.mockClear();
    actions.claimBondRefund.mockClear();
    historicalEligibility.state = "hidden";
    historicalEligibility.value = null;
    transactionState.error = null;
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

  it("shows settled Weekly round 1 and routes both reveals to its historical model", async () => {
    await act(async () => root?.render(<PrizesPage />));
    expect(container.textContent).toContain("Weekly Vault · Round 2");
    const completedTab = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Completed");
    expect(completedTab).toBeTruthy();

    await act(async () => {
      completedTab?.click();
    });

    expect(container.textContent).toContain("Weekly Vault · Round 1");
    expect(container.textContent).toContain("0.1 USDC");
    expect(container.textContent).toContain("Ready");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="reveal-eligibility-weekly-1"]')?.click();
      container.querySelector<HTMLButtonElement>('[data-testid="reveal-result-weekly-1"]')?.click();
    });

    expect(actions.revealEligibility).toHaveBeenCalledWith(1n);
    expect(actions.revealResult).toHaveBeenCalledWith(1n);

    historicalEligibility.state = "revealing";
    await act(async () => root?.render(<PrizesPage />));
    expect(container.textContent).toContain("Revealing…");

    historicalEligibility.state = "revealed";
    historicalEligibility.value = 711_888_000_000n;
    await act(async () => root?.render(<PrizesPage />));
    expect(container.textContent).toContain("Weight 711,888,000,000");

    historicalEligibility.state = "reveal-failed";
    transactionState.error = { message: "The eligibility reveal could not be completed." };
    await act(async () => root?.render(<PrizesPage />));
    expect(container.textContent).toContain("Reveal failed");
    expect(container.textContent).toContain("The eligibility reveal could not be completed.");
  });
});
