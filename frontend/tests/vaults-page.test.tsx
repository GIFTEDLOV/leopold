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
vi.mock("../components/configuration-status", () => ({
  ConfigurationStatus: () => null,
  FixtureStatus: () => null,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: ReactNode }) => children }));

import VaultsPage from "../app/app/vaults/page";

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

describe("vault directory filters", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    financial.publicVaultState = {
      daily: roundState(),
      weekly: roundState(),
      monthly: roundState({ state: 10, stateLabel: "Settled", closesAt: 120n }),
      boost: roundState(),
    };
    financial.latestBlockTimestamp = 150n;
    financial.enteredVaults = new Set(["weekly"]);
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

  function cards() {
    return [...container.querySelectorAll<HTMLElement>("[data-testid^='vault-']")];
  }

  it("filters the directory by open and entered state", async () => {
    await act(async () => root?.render(<VaultsPage />));
    expect(cards()).toHaveLength(4);

    const open = [...container.querySelectorAll("button")].find((button) => button.textContent === "Open");
    await act(async () => open?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(cards()).toHaveLength(3);
    expect(container.textContent).toContain("Daily");
    expect(container.textContent).not.toContain("Monthly");

    const entered = [...container.querySelectorAll("button")].find((button) => button.textContent === "Entered");
    await act(async () => entered?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(cards()).toHaveLength(1);
    expect(cards()[0]?.getAttribute("data-testid")).toBe("vault-weekly");
  });
});
