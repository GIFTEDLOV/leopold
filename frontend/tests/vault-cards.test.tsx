// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultPublicState } from "../lib/leopold/reads";

const financial = vi.hoisted(() => ({
  fixture: false,
  publicVaultState: {} as Record<string, VaultPublicState>,
  latestBlockTimestamp: 150n,
  enteredVaults: new Set<string>(),
  financialActionsEnabled: true,
}));

vi.mock("../components/financial-provider", () => ({
  useFinancial: () => financial,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: ReactNode }) => children }));

import { VaultCards } from "../components/vault-cards";

function roundState(overrides: Partial<VaultPublicState> = {}): VaultPublicState {
  return {
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
    ...overrides,
  };
}

function statesForWeekly(state: VaultPublicState): Record<string, VaultPublicState> {
  return { daily: roundState(), weekly: state, monthly: roundState(), boost: roundState() };
}

describe("vault card prize projection", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    financial.publicVaultState = statesForWeekly(
      roundState({ publicPrize: 0n, publicSponsoredPrize: 100_000n }),
    );
    financial.latestBlockTimestamp = 150n;
    financial.enteredVaults = new Set();
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

  it("renders an open round's sponsored prize on the Weekly card", async () => {
    await act(async () => root?.render(<VaultCards />));

    const weeklyCard = container.querySelector('[data-testid="vault-weekly"]');
    expect(weeklyCard?.textContent).toContain("0.1 USDC");
  });

  it("does not double-count sponsorship for a closed round", async () => {
    financial.publicVaultState = statesForWeekly(
      roundState({
        publicPrize: 100_000n,
        publicSponsoredPrize: 100_000n,
        stateLabel: "Round ended",
      }),
    );
    financial.latestBlockTimestamp = 200n;

    await act(async () => root?.render(<VaultCards />));

    const weeklyCard = container.querySelector('[data-testid="vault-weekly"]');
    expect(weeklyCard?.textContent).toContain("0.1 USDC");
    expect(weeklyCard?.textContent).not.toContain("0.2 USDC");
  });
});
