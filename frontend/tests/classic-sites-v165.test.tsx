// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const financial = {
  fixture: false,
  financialActionsEnabled: false,
  publicVaultState: {},
  latestBlockTimestamp: null,
  enteredVaults: new Set(),
  revealedVaults: new Set(),
  vaultPositions: {},
  txStage: "ready",
  txLabel: "Ready",
  error: null,
  connectWallet: vi.fn(),
  save: vi.fn(),
  withdraw: vi.fn(),
  enterRound: vi.fn(),
  revealVault: vi.fn(),
  hideVault: vi.fn(),
  revealEligibility: vi.fn(),
};

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/configuration-status", () => ({
  ConfigurationStatus: () => null,
  FixtureStatus: () => null,
}));

vi.mock("@/components/financial-provider", () => ({
  useFinancial: () => financial,
}));

import { ClassicVaultDetailSitesPage } from "@/components/final-ui/classic-sites-v165";

describe("Classic vault detail flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState(null, "", "/app/classic/vaults/daily");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState(null, "", "/app/classic/vaults/daily");
  });

  function buttonWithText(text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
    if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${text}`);
    return button;
  }

  it("opens Save Privately for an initial #save hash and still closes with Escape", async () => {
    window.history.replaceState(null, "", "/app/classic/vaults/daily#save");

    await act(async () => {
      root.render(<ClassicVaultDetailSitesPage slug="daily" />);
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Enter private savings.");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      buttonWithText("Save Privately").click();
    });
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Enter private savings.");
  });

  it("keeps the explicit Withdraw button opening the withdraw flow", async () => {
    await act(async () => {
      root.render(<ClassicVaultDetailSitesPage slug="daily" />);
    });

    await act(async () => {
      buttonWithText("Withdraw").click();
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Return your principal.");
  });
});
