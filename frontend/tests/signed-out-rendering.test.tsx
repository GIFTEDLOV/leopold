// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  auth: {
    accountStatus: "SIGNED_OUT" as string,
    readiness: "ANONYMOUS" as string,
    clientReady: true,
    fixture: false,
    financialWallet: null as string | null,
    financialWalletMetadata: { status: "UNAVAILABLE" as string },
    authError: null as string | null,
    openWalletLink: vi.fn(),
    openProfileCompletion: vi.fn(),
    confirmCurrentWalletAsFinancial: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
  },
  financial: {
    fixture: false,
    connected: true,
    connecting: false,
    error: null as { message: string } | null,
  },
  wallet: {
    identity: { networkHealth: { state: "HEALTHY" } },
    networkHealth: { state: "HEALTHY" },
    walletSession: {
      status: "CONNECTED" as string,
      canUseFinancialActions: true,
      reason: "CONNECTED" as string,
      address: "0x1111111111111111111111111111111111111111" as string,
      verifiedAddress: "0x1111111111111111111111111111111111111111" as string,
    },
    recovery: { visible: false, action: "NONE" as string, message: "", detail: "" },
    connectVerifiedWallet: vi.fn(async () => undefined),
    disconnectLeopoldWallet: vi.fn(),
    switchToSepolia: vi.fn(async () => undefined),
    retryNetworkHealth: vi.fn(async () => undefined),
  },
  setExperience: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/app" }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string; className?: string; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: ({ className }: { className?: string }) => <button className={className}>Theme</button>,
}));
vi.mock("../components/add-money-modal", () => ({
  AddMoneyModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" data-testid="add-money-modal">
      <button type="button" onClick={onClose}>Close modal</button>
    </div>
  ),
}));
vi.mock("../components/auth-provider", () => ({ useAuth: () => fixtures.auth }));
vi.mock("../components/financial-provider", () => ({ useFinancial: () => fixtures.financial }));
vi.mock("../components/wallet-identity-provider", () => ({ useWalletIdentity: () => fixtures.wallet }));
vi.mock("../components/experience-provider", () => ({
  useExperience: () => ({ experience: "v1", setExperience: fixtures.setExperience }),
}));

import { AppShell } from "../components/app-shell";
import { WalletGate } from "../components/wallet-gate";

function TestApplication() {
  return (
    <AppShell>
      <WalletGate>
        <div data-testid="private-app-content">Private application content</div>
      </WalletGate>
    </AppShell>
  );
}

function setSignedOut() {
  Object.assign(fixtures.auth, {
    accountStatus: "SIGNED_OUT",
    readiness: "ANONYMOUS",
    financialWallet: null,
    financialWalletMetadata: { status: "UNAVAILABLE" },
  });
}

function setReady() {
  Object.assign(fixtures.auth, {
    accountStatus: "SIGNED_IN_READY",
    readiness: "ACCOUNT_READY",
    financialWallet: "0x1111111111111111111111111111111111111111",
    financialWalletMetadata: { status: "PRESENT" },
  });
}

describe("signed-out and expired app rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setSignedOut();
    Object.assign(fixtures.wallet.walletSession, {
      status: "CONNECTED",
      canUseFinancialActions: true,
      reason: "CONNECTED",
    });
    Object.assign(fixtures.wallet.recovery, { visible: false, action: "NONE", message: "", detail: "" });
    fixtures.wallet.disconnectLeopoldWallet.mockReset();
    fixtures.wallet.connectVerifiedWallet.mockReset().mockResolvedValue(undefined);
    fixtures.auth.signOut.mockReset().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function renderApplication() {
    act(() => root.render(<TestApplication />));
  }

  it("renders only the signed-out re-authentication gate", () => {
    renderApplication();

    expect(container.querySelector('[data-testid="signed-out-gate"]')).not.toBeNull();
    expect(container.textContent).toContain("Enter your Leopold account");
    expect(container.querySelector('a[href="/login"]')?.textContent).toBe("Continue to sign in");
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector('nav[aria-label="Authenticated application"]')).toBeNull();
    expect(container.textContent).not.toContain("+ Add Money");
    expect(container.textContent).not.toContain("Session expired");
    expect(container.querySelector('[data-testid="private-app-content"]')).toBeNull();
  });

  it("gives SESSION_EXPIRED readiness visual priority over generic signed-out state", () => {
    Object.assign(fixtures.auth, {
      accountStatus: "SIGNED_IN_READY",
      readiness: "SESSION_EXPIRED",
      financialWallet: "0x1111111111111111111111111111111111111111",
      financialWalletMetadata: { status: "PRESENT" },
    });
    renderApplication();

    expect(container.querySelector('[data-testid="session-expired-gate"]')).not.toBeNull();
    expect(container.textContent).toContain("Session expired");
    expect(container.querySelector('a[href="/login"]')?.textContent).toBe("Return to sign in");
    expect(container.textContent).not.toContain("Enter your Leopold account");
    expect(container.querySelector("aside")).toBeNull();
    expect(container.textContent).not.toContain("+ Add Money");
  });

  it("keeps the authenticated shell available for a signed-in account with a disconnected wallet", () => {
    setReady();
    Object.assign(fixtures.wallet.walletSession, {
      status: "DISCONNECTED",
      canUseFinancialActions: false,
      reason: "USER_DISCONNECTED",
    });
    Object.assign(fixtures.wallet.recovery, {
      visible: true,
      action: "CONNECT_VERIFIED_WALLET",
      message: "Connect your verified financial wallet to continue.",
      detail: "Public Leopold information remains available.",
    });
    renderApplication();

    expect(container.querySelector('nav[aria-label="Authenticated application"]')).not.toBeNull();
    expect(container.textContent).toContain("+ Add Money");
    expect(container.textContent).not.toContain("Enter your Leopold account");
    expect(container.querySelector('a[href="/login"]')).toBeNull();
    expect(fixtures.auth.signOut).not.toHaveBeenCalled();
  });

  it("clears open private controls when the account becomes unavailable", () => {
    setReady();
    renderApplication();

    act(() => container.querySelector<HTMLButtonElement>(".account-pill")?.click());
    act(() => {
      const addMoneyButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("+ Add Money"));
      addMoneyButton?.click();
    });
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="add-money-modal"]')).not.toBeNull();

    setSignedOut();
    act(() => root.render(<TestApplication />));

    expect(container.querySelector('[data-testid="signed-out-gate"]')).not.toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[data-testid="add-money-modal"]')).toBeNull();
    expect(container.textContent).not.toContain("+ Add Money");
    expect(fixtures.auth.signOut).not.toHaveBeenCalled();
  });

  it("keeps wallet disconnect separate from account signout", () => {
    setReady();
    renderApplication();

    act(() => container.querySelector<HTMLButtonElement>(".account-pill")?.click());
    act(() => container.querySelector<HTMLButtonElement>("[role=menu] button")?.click());

    expect(fixtures.wallet.disconnectLeopoldWallet).toHaveBeenCalledOnce();
    expect(fixtures.auth.signOut).not.toHaveBeenCalled();
  });
});
