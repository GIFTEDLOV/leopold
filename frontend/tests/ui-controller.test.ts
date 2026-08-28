import { describe, expect, it } from "vitest";

import {
  assertUiControllerSafety,
  isRecommendedVault,
  mapAccountState,
  mapPrivateValueState,
  mapServiceState,
  mapTransactionState,
  mapVaultState,
  mapWalletState,
} from "@/lib/ui/controller";

describe("final UI controller contract", () => {
  it("maps account states without exposing provider semantics", () => {
    expect(mapAccountState("AUTH_LOADING")).toBe("loading");
    expect(mapAccountState("SIGNED_OUT")).toBe("signed-out");
    expect(mapAccountState("SIGNED_IN_PROFILE_INCOMPLETE")).toBe("profile-incomplete");
    expect(mapAccountState("SIGNED_IN_READY")).toBe("ready");
  });

  it("maps the explicit wallet session into the fixed UI states", () => {
    expect(mapWalletState("BOOTSTRAPPING")).toBe("connecting");
    expect(mapWalletState("DISCONNECTED")).toBe("disconnected");
    expect(mapWalletState("CONNECTING")).toBe("connecting");
    expect(mapWalletState("CONNECTED")).toBe("connected");
    expect(mapWalletState("WRONG_NETWORK")).toBe("wrong-network");
    expect(mapWalletState("ERROR")).toBe("error");
  });

  it("keeps private values hidden until an explicit reveal completes", () => {
    expect(mapPrivateValueState("NOT_REVEALED", false)).toBe("hidden");
    expect(mapPrivateValueState("READING_HANDLE", false)).toBe("revealing");
    expect(mapPrivateValueState("AWAITING_DECRYPT_AUTHORIZATION", false)).toBe("revealing");
    expect(mapPrivateValueState("DECRYPTING", false)).toBe("revealing");
    expect(mapPrivateValueState("REVEALED", true)).toBe("revealed");
    expect(mapPrivateValueState("REVEAL_FAILED", false)).toBe("reveal-failed");
  });

  it("collapses internal transaction stages into the fixed UX lifecycle", () => {
    expect(mapTransactionState("ready")).toBe("idle");
    expect(mapTransactionState("save-signature")).toBe("awaiting-signature");
    expect(mapTransactionState("save-submitted")).toBe("submitted");
    expect(mapTransactionState("save-confirming")).toBe("confirming");
    expect(mapTransactionState("save-encrypting")).toBe("private-processing");
    expect(mapTransactionState("private")).toBe("private-processing");
    expect(mapTransactionState("complete")).toBe("success");
    expect(mapTransactionState("failed")).toBe("failure");
  });

  it("maps vaults without exposing the contract settlement state machine", () => {
    expect(mapVaultState({ contractState: undefined, depositOpen: false, entered: false })).toBe("unavailable");
    expect(mapVaultState({ contractState: 1, depositOpen: true, entered: false })).toBe("open");
    expect(mapVaultState({ contractState: 1, depositOpen: true, entered: true })).toBe("entered");
    expect(mapVaultState({ contractState: 1, depositOpen: false, entered: true })).toBe("closed");
    expect(mapVaultState({ contractState: 8, depositOpen: false, entered: true })).toBe("settling");
    expect(mapVaultState({ contractState: 10, depositOpen: false, entered: true })).toBe("settled");
    expect(mapVaultState({ contractState: 14, depositOpen: false, entered: true })).toBe("settling");
  });

  it("maps public service health into the fixed UI states", () => {
    expect(mapServiceState("HEALTHY")).toBe("healthy");
    expect(mapServiceState("DEGRADED")).toBe("degraded");
    expect(mapServiceState("UNAVAILABLE")).toBe("unavailable");
    expect(mapServiceState("UNKNOWN")).toBe("unknown");
  });

  it("keeps Weekly recommended without excluding another official vault", () => {
    expect(isRecommendedVault("daily")).toBe(false);
    expect(isRecommendedVault("weekly")).toBe(true);
    expect(isRecommendedVault("monthly")).toBe(false);
    expect(isRecommendedVault("boost")).toBe(false);
  });

  it("accepts presentation-safe controller fields", () => {
    expect(() =>
      assertUiControllerSafety({
        account: { email: "user@example.invalid", username: "leopold_user" },
        balances: { privateUsdc: { state: "hidden", value: null } },
        transactions: [{ hash: "0x1234", state: "submitted" }],
      }),
    ).not.toThrow();
  });

  it.each([
    "privateBalanceHandle",
    "privateBalanceDiagnostic",
    "privateEligibility",
    "providerUserId",
    "authToken",
    "fheProof",
    "dynamicConnector",
    "wagmiConnector",
  ])("rejects INTERNAL-ONLY field %s", (field) => {
    expect(() => assertUiControllerSafety({ nested: { [field]: "must-not-render" } })).toThrow(
      `INTERNAL_ONLY_UI_FIELD:controller.nested.${field}`,
    );
  });
});
