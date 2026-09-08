// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const financial = {
  connected: true,
  fixture: true,
  txStage: "ready",
  txLabel: "Ready",
  usdcBalance: 2_500_000_000n,
  error: null,
  acquireUsdc: vi.fn<() => Promise<void>>(),
  makePrivate: vi.fn<(_: string) => Promise<void>>(),
  retryNetworkHealth: vi.fn<() => Promise<void>>(),
};

const auth = {
  accountStatus: "SIGNED_IN_READY",
  financialWalletMetadata: { status: "PRESENT" },
  financialWallet: "0x1111111111111111111111111111111111111111",
  authError: null,
  canConfirmCurrentWalletAsFinancial: false,
  confirmCurrentWalletAsFinancial: vi.fn<() => Promise<void>>(),
  openWalletLink: vi.fn(),
  openProfileCompletion: vi.fn(),
};

const walletIdentity = {
  identity: { networkHealth: { state: "HEALTHY" } },
  walletSession: {
    status: "CONNECTED",
    canUseFinancialActions: true,
    reason: null,
  },
  switchToSepolia: vi.fn<() => Promise<void>>(),
  connectVerifiedWallet: vi.fn<() => Promise<void>>(),
};

vi.mock("../components/financial-provider", () => ({
  useFinancial: () => financial,
}));

vi.mock("../components/auth-provider", () => ({
  useAuth: () => auth,
}));

vi.mock("../components/wallet-identity-provider", () => ({
  useWalletIdentity: () => walletIdentity,
}));

import { AddMoneyModal } from "../components/add-money-modal";

const source = readFileSync(
  resolve(process.cwd(), process.cwd().endsWith("/frontend") ? "components/add-money-modal.tsx" : "frontend/components/add-money-modal.tsx"),
  "utf8",
);

describe("Add Money modal", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onClose: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    financial.acquireUsdc.mockReset().mockResolvedValue(undefined);
    financial.makePrivate.mockReset().mockResolvedValue(undefined);
    financial.retryNetworkHealth.mockReset().mockResolvedValue(undefined);
    onClose = vi.fn<() => void>();
    document.body.style.overflow = "";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.style.overflow = "";
  });

  function renderModal() {
    act(() => {
      root.render(<AddMoneyModal onClose={onClose} />);
    });
  }

  function buttonWithText(text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === text);
    if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing button: ${text}`);
    return button;
  }

  it("uses the current module modal system and no obsolete raw layout classes", () => {
    expect(source).toContain('import styles from "@/components/full-site/leopold-app-ui.module.css";');
    expect(source).toContain("className={styles.modalBackdrop}");
    expect(source).toContain("className={`${styles.modal} ${styles.addMoneyModal}`}");
    expect(source).not.toMatch(/className\s*=\s*["'`](?:modal-backdrop|modal|modal-head|stepper|card|badge|subtle|button|stat|form-row|card-label|input|tx-status|error)/);
  });

  it("keeps the public balance, faucet, continue, and private conversion sequence", async () => {
    renderModal();

    expect(container.textContent).toContain("Public USDC balance");
    expect(container.textContent).toContain("Get Test USDC");
    expect(container.textContent).toContain("Continue");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="get-usdc"]')?.click();
    });
    expect(financial.acquireUsdc).toHaveBeenCalledTimes(1);
    expect(financial.makePrivate).not.toHaveBeenCalled();

    await act(async () => {
      buttonWithText("Continue").click();
    });
    expect(financial.acquireUsdc).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#private-amount")).not.toBeNull();

    await act(async () => {
      buttonWithText("Review").click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="make-private"]')?.click();
    });
    expect(financial.makePrivate).toHaveBeenCalledTimes(1);
    expect(financial.makePrivate).toHaveBeenCalledWith("10");
    expect(container.textContent).toContain("Private USDC is ready");
  });

  it("closes without triggering a financial action, including backdrop and Escape", async () => {
    renderModal();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(financial.acquireUsdc).not.toHaveBeenCalled();
    expect(financial.makePrivate).not.toHaveBeenCalled();

    onClose.mockClear();
    await act(async () => {
      container.querySelector<HTMLElement>('[role="presentation"]')?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
