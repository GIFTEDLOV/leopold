// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistActiveWalletSession, WALLET_SESSION_STORAGE_KEY } from "../lib/auth/wallet-identity";

const dynamic = vi.hoisted(() => {
  const address = "0x1111111111111111111111111111111111111111" as const;
  const connector = {
    isEmbeddedWallet: false,
    getConnectedAccounts: vi.fn(async () => [address]),
    getNetwork: vi.fn(async () => 11_155_111),
    on: vi.fn(),
    off: vi.fn(),
    supportsNetworkSwitching: vi.fn(() => true),
    switchNetwork: vi.fn(async () => undefined),
  };
  const wallet = {
    id: "verified-wallet",
    address,
    isAuthenticated: true,
    connector,
    getNetwork: vi.fn(async () => 11_155_111),
    sync: vi.fn(async () => undefined),
  };
  return {
    address,
    completedUser: null as Record<string, unknown> | null,
    rawUser: null as Record<string, unknown> | null,
    wallet,
    handleLogOut: vi.fn(async () => undefined),
    setShowAuthFlow: vi.fn(),
    setShowLinkNewWalletModal: vi.fn(),
    switchWallet: vi.fn(async () => undefined),
    updateUser: vi.fn(async () => undefined),
    social: {
      isLinked: vi.fn(() => true),
      linkSocialAccount: vi.fn(async () => undefined),
      unlinkSocialAccount: vi.fn(async () => undefined),
    },
  };
});

vi.mock("@dynamic-labs/sdk-react-core", () => ({
  useDynamicContext: () => ({
    user: dynamic.completedUser,
    userWithMissingInfo: dynamic.rawUser,
    sdkHasLoaded: true,
    handleLogOut: dynamic.handleLogOut,
    setShowAuthFlow: dynamic.setShowAuthFlow,
    primaryWallet: dynamic.wallet,
  }),
  useConnectWithOtp: () => ({
    connectWithEmail: vi.fn(async () => undefined),
    verifyOneTimePassword: vi.fn(async () => undefined),
    retryOneTimePassword: vi.fn(async () => undefined),
  }),
  useDynamicModals: () => ({ setShowLinkNewWalletModal: dynamic.setShowLinkNewWalletModal }),
  useSwitchWallet: () => dynamic.switchWallet,
  useUserUpdateRequest: () => ({ updateUser: dynamic.updateUser }),
  useUserWallets: () => [dynamic.wallet],
  useSocialAccounts: () => dynamic.social,
  useDynamicEvents: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: dynamic.address }),
  usePublicClient: () => ({
    request: vi.fn(async ({ method }: { method: string }) =>
      method === "eth_chainId" ? "0xaa36a7" : method === "eth_blockNumber" ? "0x1" : "0x0",
    ),
  }),
  useWalletClient: () => ({
    data: {
      account: dynamic.address,
      chain: { id: 11_155_111 },
      uid: "wallet-client-1",
      request: vi.fn(async ({ method }: { method: string }) => (method === "eth_chainId" ? "0xaa36a7" : "0x0")),
    },
  }),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/app" }));

vi.mock("../components/financial-provider", () => ({
  useFinancial: () => ({
    fixture: false,
    connected: true,
    connecting: false,
    error: null,
    connectWallet: vi.fn(async () => undefined),
  }),
  FinancialProvider: ({ children }: { children: ReactNode }) => children,
}));

import { AppShell } from "../components/app-shell";
import { AuthProvider, useAuth } from "../components/auth-provider";
import { WalletGate } from "../components/wallet-gate";
import { WalletIdentityProvider, useWalletIdentity } from "../components/wallet-identity-provider";

const profile = {
  userId: "dynamic-user-1",
  email: "verified@example.com",
  verifiedCredentials: [{ format: "email" }],
  missingFields: [],
  metadata: {
    "Leopold Username": "leopold_user",
    leopoldFinancialWallet: dynamic.address,
    xLinkage: "preserved",
  },
};

function Probe() {
  const auth = useAuth();
  const wallet = useWalletIdentity();
  return (
    <div data-testid="session-probe">
      {[
        auth.accountStatus,
        auth.email,
        auth.username,
        auth.financialWalletMetadata.status,
        auth.verifiedFinancialWallet,
        wallet.walletSession.status,
        wallet.recovery.action,
      ].join("|")}
    </div>
  );
}

function TestApplication() {
  return (
    <AuthProvider configured>
      <WalletIdentityProvider>
        <AppShell>
          <WalletGate>
            <Probe />
          </WalletGate>
        </AppShell>
      </WalletIdentityProvider>
    </AuthProvider>
  );
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 10));
  });
}

async function waitFor(container: HTMLElement, text: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await flush();
  }
  throw new Error(`Timed out waiting for: ${text}\n${container.textContent ?? ""}`);
}

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

describe("explicit wallet disconnect followed by account rehydration", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    vi.clearAllMocks();
    dynamic.completedUser = profile;
    dynamic.rawUser = profile;
    window.sessionStorage.clear();
    persistActiveWalletSession(window.sessionStorage, dynamic.address);
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
    window.sessionStorage.clear();
  });

  it("keeps the account and linked-wallet metadata while the explicit wallet session stays disconnected", async () => {
    await act(async () => root?.render(<TestApplication />));
    await waitFor(container, "Ethereum Sepolia");

    await act(async () => buttonWithText(container, dynamic.address.slice(0, 6)).click());
    await act(async () => buttonWithText(container, "Disconnect").click());
    await waitFor(container, "Connect verified wallet");

    expect(window.sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY)).toBeNull();
    expect(dynamic.handleLogOut).not.toHaveBeenCalled();
    expect(dynamic.updateUser).not.toHaveBeenCalled();

    await act(async () => root?.unmount());
    root = null;

    dynamic.completedUser = null;
    dynamic.rawUser = profile;
    root = createRoot(container);
    await act(async () => root?.render(<TestApplication />));
    await waitFor(container, "Complete required account information");

    expect(container.textContent).not.toContain("Enter your Leopold account");
    expect(container.textContent).not.toContain("Continue to sign in");
    expect(container.textContent).not.toContain("Link your financial wallet");
    expect(window.sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY)).toBeNull();

    dynamic.completedUser = profile;
    await act(async () => root?.render(<TestApplication />));
    await waitFor(container, "Connect verified wallet");

    const rendered = container.textContent ?? "";
    expect(rendered).toContain(
      `SIGNED_IN_READY|verified@example.com|leopold_user|PRESENT|${dynamic.address}|DISCONNECTED|CONNECT_VERIFIED_WALLET`,
    );
    expect(rendered).not.toContain("Enter your Leopold account");
    expect(rendered).not.toContain("Continue to sign in");
    expect(rendered).not.toContain("Link your financial wallet");
    expect(rendered).not.toContain("Retry network");
    expect(window.sessionStorage.getItem(WALLET_SESSION_STORAGE_KEY)).toBeNull();
    expect(dynamic.handleLogOut).not.toHaveBeenCalled();
    expect(dynamic.updateUser).not.toHaveBeenCalled();
    expect(dynamic.setShowAuthFlow).not.toHaveBeenCalled();
    expect(dynamic.setShowLinkNewWalletModal).not.toHaveBeenCalled();
    expect(dynamic.switchWallet).not.toHaveBeenCalled();
    expect(dynamic.wallet.sync).not.toHaveBeenCalled();
  });
});
