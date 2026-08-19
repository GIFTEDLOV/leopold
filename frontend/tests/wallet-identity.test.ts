import { describe, expect, it } from "vitest";
import {
  canProbeWalletIdentity,
  createNotCheckedWalletRpcHealth,
  deriveWalletIdentity,
  WalletIdentityController,
  type WalletIdentityInputs,
} from "../lib/auth/wallet-identity";

const VERIFIED = "0x1111111111111111111111111111111111111111" as const;
const WRONG = "0x2222222222222222222222222222222222222222" as const;

function inputs(overrides: Partial<WalletIdentityInputs> = {}): WalletIdentityInputs {
  return {
    initialized: true,
    verifiedFinancialWallet: VERIFIED,
    dynamicPrimaryWallet: VERIFIED,
    dynamicLinkedWallets: [{ id: "verified", address: VERIFIED }],
    dynamicWalletObjectForVerifiedAddress: { id: "verified", address: VERIFIED },
    providerActiveAccount: VERIFIED,
    providerAccountKnown: true,
    providerConnected: true,
    wagmiAccount: VERIFIED,
    walletClientAccount: VERIFIED,
    walletClientId: "client-1",
    chainId: 11_155_111,
    walletClientChainId: 11_155_111,
    networkHealth: { ...createNotCheckedWalletRpcHealth(), state: "HEALTHY", checkedAt: 1 },
    revision: 1,
    ...overrides,
  };
}

describe("WalletIdentityController derivation", () => {
  it("derives DISCONNECTED without an actual provider account", () => {
    const result = deriveWalletIdentity(inputs({ providerActiveAccount: null, providerConnected: false }));
    expect(result.state).toBe("DISCONNECTED");
    expect(result.connectedAddress).toBeNull();
    expect(result.recoveryAction).toBe("RECONNECT_VERIFIED_WALLET");
  });

  it("remains UNINITIALIZED while the provider account is still resolving", () => {
    const result = deriveWalletIdentity(
      inputs({ providerAccountKnown: false, providerActiveAccount: null, providerConnected: false }),
    );
    expect(result.state).toBe("UNINITIALIZED");
    expect(result.reason).toBe("AUTH_INITIALIZING");
  });

  it("keeps first-time linking separate from reconnecting a linked wallet", () => {
    const result = deriveWalletIdentity(
      inputs({
        verifiedFinancialWallet: null,
        dynamicPrimaryWallet: null,
        dynamicLinkedWallets: [],
        dynamicWalletObjectForVerifiedAddress: null,
        providerActiveAccount: null,
        providerConnected: false,
        wagmiAccount: null,
        walletClientAccount: null,
        walletClientId: null,
        chainId: null,
        walletClientChainId: null,
      }),
    );
    expect(result.state).toBe("UNINITIALIZED");
    expect(result.reason).toBe("FINANCIAL_WALLET_NOT_LINKED");
    expect(result.recoveryAction).toBe("LINK_WALLET");
  });

  it("derives READY only when all runtime identities and Sepolia health agree", () => {
    const result = deriveWalletIdentity(inputs());
    expect(result.state).toBe("READY");
    expect(result.canUseFinancialActions).toBe(true);
    expect(result.verifiedAddress).toBe(result.connectedAddress);
  });

  it("derives WALLET_MISMATCH from the actual provider account", () => {
    const result = deriveWalletIdentity(inputs({ providerActiveAccount: WRONG }));
    expect(result.state).toBe("WALLET_MISMATCH");
    expect(result.verifiedAddress).not.toBe(result.connectedAddress);
    expect(result.recoveryAction).toBe("SWITCH_TO_VERIFIED_WALLET");
    expect(result.canUseFinancialActions).toBe(false);
  });

  it("keeps mismatch authoritative even when Dynamic primary still points at verified wallet", () => {
    const result = deriveWalletIdentity(
      inputs({
        dynamicPrimaryWallet: VERIFIED,
        providerActiveAccount: WRONG,
        providerConnected: true,
      }),
    );
    expect(result.state).toBe("WALLET_MISMATCH");
    expect(result.dynamicPrimaryAddress).toBe(VERIFIED);
    expect(result.connectedAddress).toBe(WRONG);
  });

  it("remains stable in mismatch while the same provider account is active", () => {
    const first = deriveWalletIdentity(inputs({ providerActiveAccount: WRONG, revision: 10 }));
    const second = deriveWalletIdentity(inputs({ providerActiveAccount: WRONG, revision: 11 }));
    expect(first.state).toBe("WALLET_MISMATCH");
    expect(second.state).toBe("WALLET_MISMATCH");
    expect(second.connectedAddress).toBe(WRONG);
  });

  it("cannot derive mismatch when provider and verified addresses are equal", () => {
    const result = deriveWalletIdentity(inputs({ dynamicPrimaryWallet: WRONG }));
    expect(result.state).not.toBe("WALLET_MISMATCH");
    expect(result.providerActiveAccount).toBe(result.verifiedAddress);
  });

  it("derives WRONG_NETWORK only after provider identity matches", () => {
    const result = deriveWalletIdentity(inputs({ chainId: 1, walletClientChainId: 1 }));
    expect(result.state).toBe("WRONG_NETWORK");
    expect(result.recoveryAction).toBe("SWITCH_TO_SEPOLIA");
  });

  it("derives WRONG_NETWORK even when Wagmi has no Sepolia wallet client yet", () => {
    const result = deriveWalletIdentity(inputs({ chainId: 1, walletClientAccount: null, walletClientChainId: null }));
    expect(result.state).toBe("WRONG_NETWORK");
    expect(result.recoveryAction).toBe("SWITCH_TO_SEPOLIA");
  });

  it("keeps RPC health separate from identity mismatch", () => {
    const result = deriveWalletIdentity(
      inputs({
        providerActiveAccount: WRONG,
        networkHealth: {
          ...createNotCheckedWalletRpcHealth(),
          state: "WALLET_RPC_UNAVAILABLE",
          technicalDetail: "wallet transport failed",
        },
      }),
    );
    expect(result.state).toBe("WALLET_MISMATCH");
    expect(result.networkHealth.state).toBe("WALLET_RPC_UNAVAILABLE");
  });

  it("blocks READY when Wagmi or WalletClient identity diverges", () => {
    expect(deriveWalletIdentity(inputs({ wagmiAccount: WRONG })).state).toBe("UNINITIALIZED");
    expect(deriveWalletIdentity(inputs({ walletClientAccount: WRONG })).state).toBe("UNINITIALIZED");
  });

  it("provides a controller revision guard for stale async results", () => {
    const controller = new WalletIdentityController();
    const first = controller.beginRevision();
    const second = controller.beginRevision();
    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
  });

  it("does not probe RPC until the identity inputs are aligned", () => {
    expect(canProbeWalletIdentity(inputs())).toBe(true);
    expect(canProbeWalletIdentity(inputs({ providerActiveAccount: WRONG }))).toBe(false);
    expect(canProbeWalletIdentity(inputs({ providerActiveAccount: null, providerConnected: false }))).toBe(false);
  });

  it("marks unavailable RPC health as non-ready without changing identity addresses", () => {
    const result = deriveWalletIdentity(
      inputs({ networkHealth: { ...createNotCheckedWalletRpcHealth(), state: "APP_RPC_UNAVAILABLE" } }),
    );
    expect(result.state).toBe("UNINITIALIZED");
    expect(result.reason).toBe("RPC_UNAVAILABLE");
    expect(result.canUseFinancialActions).toBe(false);
    expect(result.verifiedAddress).toBe(VERIFIED);
    expect(result.connectedAddress).toBe(VERIFIED);
  });
});
