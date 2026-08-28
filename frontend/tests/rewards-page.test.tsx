// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VaultPublicState } from "../lib/leopold/reads";

const financial = vi.hoisted(() => ({
  fixture: false,
  publicVaultState: {} as Record<string, VaultPublicState>,
  txStage: "ready" as const,
  financialActionsEnabled: true,
  activity: [] as Array<{ label: string }>,
  claimRewards: vi.fn(async () => undefined),
  claimRefund: vi.fn(async () => undefined),
  enteredVaults: new Set<string>(),
}));

vi.mock("../components/financial-provider", () => ({
  useFinancial: () => financial,
}));
vi.mock("../components/configuration-status", () => ({
  ConfigurationStatus: () => null,
  FixtureStatus: () => null,
}));

import RewardsPage from "../app/app/rewards/page";

function state(reward: bigint): VaultPublicState {
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
    bondAmount: 0n,
    refundAmount: 0n,
    refundClaimed: false,
    settlementReward: reward,
  };
}

describe("Rewards page settlement claim projection", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    financial.publicVaultState = {
      daily: state(0n),
      weekly: state(5_000_000_000_000_000n),
      monthly: state(0n),
      boost: state(0n),
    };
    financial.activity = [];
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

  it("removes the Weekly Claim button when the provider projects zero after claim", async () => {
    await act(async () => root?.render(<RewardsPage />));
    expect(
      Array.from(container.querySelectorAll("button")).filter((button) => button.textContent === "Claim"),
    ).toHaveLength(1);

    financial.publicVaultState.weekly = state(0n);
    await act(async () => root?.render(<RewardsPage />));

    expect(
      Array.from(container.querySelectorAll("button")).filter((button) => button.textContent === "Claim"),
    ).toHaveLength(0);
  });
});
