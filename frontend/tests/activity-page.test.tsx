// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityCategoryForTransaction } from "../lib/leopold/activity";

const financial = vi.hoisted(() => ({
  activity: [
    { id: "deposit", label: "Saved to Weekly Vault", status: "Confirmed", category: "deposit" },
    { id: "withdrawal", label: "Withdrew from Weekly Vault", status: "Confirmed", category: "withdrawal" },
    { id: "prize", label: "Claimed bond refund", status: "Confirmed", category: "prize" },
  ],
}));

vi.mock("../components/financial-provider", () => ({
  useFinancial: () => financial,
}));
vi.mock("../components/configuration-status", () => ({ FixtureStatus: () => null }));

import ActivityPage from "../app/app/activity/page";

describe("activity filters", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
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

  it("shows only the selected activity category", async () => {
    await act(async () => root?.render(<ActivityPage />));
    expect(container.textContent).toContain("Saved to Weekly Vault");
    expect(container.textContent).toContain("Withdrew from Weekly Vault");
    expect(container.textContent).toContain("Claimed bond refund");

    const deposits = [...container.querySelectorAll("button")].find((button) => button.textContent === "Deposits");
    await act(async () => deposits?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Saved to Weekly Vault");
    expect(container.textContent).not.toContain("Withdrew from Weekly Vault");
    expect(container.textContent).not.toContain("Claimed bond refund");

    const prizes = [...container.querySelectorAll("button")].find((button) => button.textContent === "Prizes");
    await act(async () => prizes?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Claimed bond refund");
    expect(container.textContent).not.toContain("Saved to Weekly Vault");
  });

  it("keeps persisted transaction categories aligned with the filters", () => {
    expect(activityCategoryForTransaction("save")).toBe("deposit");
    expect(activityCategoryForTransaction("withdraw")).toBe("withdrawal");
    expect(activityCategoryForTransaction("claim-reward")).toBe("prize");
    expect(activityCategoryForTransaction("unknown-action")).toBe("other");
  });
});
