import { describe, expect, it } from "vitest";
import { deriveLeopoldRecovery, deriveWalletGateMode, type RecoveryInputs } from "../lib/auth/recovery";

const readyDisconnected: RecoveryInputs = {
  accountStatus: "SIGNED_IN_READY",
  financialMetadataStatus: "PRESENT",
  walletSessionStatus: "DISCONNECTED",
  walletSessionReason: "USER_DISCONNECTED",
  networkHealth: "NOT_CHECKED",
};

describe("exhaustive account and wallet recovery routing", () => {
  it.each([
    ["AUTH_LOADING", "LOADING", "AUTH_LOADING"],
    ["SIGNED_OUT", "UNAVAILABLE", "SIGNED_OUT"],
    ["SIGNED_IN_PROFILE_INCOMPLETE", "PRESENT", "PROFILE_INCOMPLETE"],
    ["SIGNED_IN_READY", "LOADING", "FINANCIAL_METADATA_LOADING"],
    ["SIGNED_IN_READY", "ERROR", "FINANCIAL_METADATA_ERROR"],
    ["SIGNED_IN_READY", "NONE", "APPLICATION"],
    ["SIGNED_IN_READY", "PRESENT", "APPLICATION"],
  ] as const)("maps %s + %s to the %s wallet gate", (account, metadata, expected) => {
    expect(deriveWalletGateMode(account, metadata)).toBe(expected);
  });

  it("suppresses global wallet recovery while auth is loading or signed out", () => {
    for (const accountStatus of ["AUTH_LOADING", "SIGNED_OUT"] as const) {
      expect(deriveLeopoldRecovery({ ...readyDisconnected, accountStatus })).toEqual({
        visible: false,
        action: "NONE",
        message: "",
        detail: "",
      });
    }
  });

  it("suppresses wallet commands while profile or metadata is loading", () => {
    expect(deriveLeopoldRecovery({ ...readyDisconnected, accountStatus: "SIGNED_IN_PROFILE_INCOMPLETE" }).action).toBe(
      "NONE",
    );
    expect(deriveLeopoldRecovery({ ...readyDisconnected, financialMetadataStatus: "LOADING" }).action).toBe("NONE");
  });

  it.each([
    [{ financialMetadataStatus: "NONE" }, "LINK_FINANCIAL_WALLET"],
    [{ walletSessionStatus: "DISCONNECTED" }, "CONNECT_VERIFIED_WALLET"],
    [
      { walletSessionStatus: "CONNECTING", walletSessionReason: "ACCOUNT_SELECTION_REQUIRED" },
      "CONFIRM_ACCOUNT_SELECTION",
    ],
    [{ walletSessionStatus: "CONNECTING", walletSessionReason: "NO_ACTIVE_SESSION" }, "CANCEL_CONNECTION"],
    [{ walletSessionStatus: "WRONG_NETWORK", walletSessionReason: "WRONG_NETWORK" }, "SWITCH_TO_SEPOLIA"],
    [{ walletSessionStatus: "ERROR", walletSessionReason: "PROVIDER_UNAVAILABLE" }, "RETRY_PROVIDER"],
  ] as const)("maps the supported recovery state to %s", (overrides, expected) => {
    expect(deriveLeopoldRecovery({ ...readyDisconnected, ...overrides } as RecoveryInputs).action).toBe(expected);
  });

  it.each(["APP_RPC_UNAVAILABLE", "WALLET_RPC_UNAVAILABLE", "UNKNOWN"] as const)(
    "routes connected %s health only to Retry network",
    (networkHealth) => {
      expect(
        deriveLeopoldRecovery({
          ...readyDisconnected,
          walletSessionStatus: "CONNECTED",
          walletSessionReason: "CONNECTED",
          networkHealth,
        }).action,
      ).toBe("RETRY_NETWORK");
    },
  );

  it.each(["NOT_CHECKED", "CHECKING", "HEALTHY"] as const)(
    "shows no recovery CTA for a connected %s network state",
    (networkHealth) => {
      expect(
        deriveLeopoldRecovery({
          ...readyDisconnected,
          walletSessionStatus: "CONNECTED",
          walletSessionReason: "CONNECTED",
          networkHealth,
        }).action,
      ).toBe("NONE");
    },
  );

  it("never routes a disconnected linked wallet to Retry network, even with stale RPC failure", () => {
    expect(deriveLeopoldRecovery({ ...readyDisconnected, networkHealth: "APP_RPC_UNAVAILABLE" }).action).toBe(
      "CONNECT_VERIFIED_WALLET",
    );
  });

  it("uses a finite safe error for unavailable metadata instead of first-time linking", () => {
    expect(deriveLeopoldRecovery({ ...readyDisconnected, financialMetadataStatus: "UNAVAILABLE" })).toMatchObject({
      visible: true,
      action: "ERROR",
    });
  });

  it("confirms an already authenticated current-account wallet instead of reopening linking", () => {
    expect(
      deriveLeopoldRecovery({
        ...readyDisconnected,
        financialMetadataStatus: "NONE",
        canConfirmFinancialWallet: true,
        financialWalletIntegrity: "READY",
      }).action,
    ).toBe("CONFIRM_FINANCIAL_WALLET");
  });

  it("fails closed when unique financial-wallet ownership is not configured", () => {
    expect(
      deriveLeopoldRecovery({
        ...readyDisconnected,
        financialMetadataStatus: "NONE",
        financialWalletIntegrity: "ERROR",
      }),
    ).toMatchObject({ visible: true, action: "ERROR" });
  });
});
