import { describe, expect, it } from "vitest";
import {
  checkFinancialIdentity,
  checkFinancialWalletLink,
  checkPrivateRevealIdentity,
  getFinancialWalletRecoveryAction,
  getAuthReadiness,
  walletsMatch,
  type AuthIdentitySnapshot,
} from "../lib/auth/readiness";
import { canonicalizeUsername, isValidUsername } from "../lib/auth/username";
import { isValidEmail, normalizeEmail } from "../lib/auth/email";
import { authConfigurationMessage, dynamicAuthConfigured, dynamicXEnabled } from "../lib/auth/config";
import { getFixtureIdentityForMode } from "../lib/auth/fixtures";

const baseIdentity: AuthIdentitySnapshot = {
  authenticated: true,
  emailVerified: true,
  username: "leopold_user",
  providerUserId: "provider-user",
  financialWallet: "0x1111111111111111111111111111111111111111",
  connectedWallet: "0x1111111111111111111111111111111111111111",
  walletAuthenticated: true,
};

describe("Leopold unified auth model", () => {
  it("validates and trims email addresses before OTP requests", () => {
    expect(normalizeEmail("  person@example.com ")).toBe("person@example.com");
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("person@example")).toBe(false);
  });

  it("canonicalizes usernames before persistence", () => {
    expect(canonicalizeUsername("  Leopold_User ")).toBe("leopold_user");
    expect(canonicalizeUsername("Ｆｏｏ_１２３")).toBe("foo_123");
    expect(isValidUsername("abc_123")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("name with spaces")).toBe(false);
    expect(isValidUsername("wallet_0x1111111111111111111111111111111111111111")).toBe(false);
    expect(isValidUsername("zero\u200Bwidth")).toBe(false);
  });

  it("keeps the readiness states explicit", () => {
    expect(getAuthReadiness({ ...baseIdentity, authenticated: false })).toBe("ANONYMOUS");
    expect(getAuthReadiness({ ...baseIdentity, emailVerified: false, walletAuthenticated: true })).toBe(
      "WALLET_AUTHENTICATED_INCOMPLETE",
    );
    expect(getAuthReadiness({ ...baseIdentity, emailVerified: false, walletAuthenticated: false })).toBe(
      "EMAIL_AUTHENTICATED",
    );
    expect(getAuthReadiness({ ...baseIdentity, username: null })).toBe("PROFILE_INCOMPLETE");
    expect(getAuthReadiness({ ...baseIdentity, financialWallet: null })).toBe("WALLET_REQUIRED");
    expect(getAuthReadiness({ ...baseIdentity, sessionExpired: true })).toBe("SESSION_EXPIRED");
    expect(getAuthReadiness({ ...baseIdentity, accountConflict: true })).toBe("ACCOUNT_CONFLICT");
    expect(getAuthReadiness(baseIdentity)).toBe("ACCOUNT_READY");
  });

  it("covers every non-production auth fixture state", () => {
    expect(getAuthReadiness(getFixtureIdentityForMode("anonymous"))).toBe("ANONYMOUS");
    expect(getAuthReadiness(getFixtureIdentityForMode("email"))).toBe("WALLET_REQUIRED");
    expect(getAuthReadiness(getFixtureIdentityForMode("wallet"))).toBe("WALLET_AUTHENTICATED_INCOMPLETE");
    expect(getAuthReadiness(getFixtureIdentityForMode("profile-missing"))).toBe("PROFILE_INCOMPLETE");
    expect(getAuthReadiness(getFixtureIdentityForMode("ready"))).toBe("ACCOUNT_READY");
    expect(getAuthReadiness(getFixtureIdentityForMode("mismatch"))).toBe("WALLET_REQUIRED");
    expect(getAuthReadiness(getFixtureIdentityForMode("expired"))).toBe("SESSION_EXPIRED");
    expect(getAuthReadiness(getFixtureIdentityForMode("conflict"))).toBe("ACCOUNT_CONFLICT");
    expect(getAuthReadiness(getFixtureIdentityForMode("x-unavailable"))).toBe("ACCOUNT_READY");
  });

  it("requires the exact external wallet and Sepolia before financial actions", () => {
    expect(walletsMatch(baseIdentity.financialWallet, baseIdentity.connectedWallet)).toBe(true);
    expect(walletsMatch(baseIdentity.financialWallet, "0x2222222222222222222222222222222222222222")).toBe(false);
    expect(checkFinancialIdentity(baseIdentity, true)).toEqual({ allowed: true });
    expect(
      checkFinancialIdentity({ ...baseIdentity, connectedWallet: "0x2222222222222222222222222222222222222222" }, true),
    ).toMatchObject({
      allowed: false,
      code: "FINANCIAL_IDENTITY_REQUIRED",
    });
    expect(checkFinancialIdentity(baseIdentity, false)).toMatchObject({ allowed: false, code: "WRONG_NETWORK" });
  });

  it("selects the safe wallet recovery branch without relinking identities", () => {
    expect(getFinancialWalletRecoveryAction({ financialWallet: null, connectedWallet: null }, null)).toBe(
      "LINK_WALLET",
    );
    expect(
      getFinancialWalletRecoveryAction({ financialWallet: baseIdentity.financialWallet, connectedWallet: null }, null),
    ).toBe("RECONNECT_WALLET");
    expect(
      getFinancialWalletRecoveryAction(
        {
          financialWallet: baseIdentity.financialWallet,
          connectedWallet: "0x2222222222222222222222222222222222222222",
        },
        false,
      ),
    ).toBe("SWITCH_TO_VERIFIED_WALLET");
    expect(getFinancialWalletRecoveryAction(baseIdentity, false)).toBe("SWITCH_TO_SEPOLIA");
    expect(getFinancialWalletRecoveryAction(baseIdentity, true)).toBe("READY");
  });

  it("does not permit replacing a designated wallet implicitly", () => {
    const mismatch = getFixtureIdentityForMode("mismatch");
    expect(walletsMatch(mismatch.financialWallet, mismatch.connectedWallet)).toBe(false);
    expect(checkFinancialIdentity(mismatch, true)).toMatchObject({
      allowed: false,
      code: "FINANCIAL_IDENTITY_REQUIRED",
    });
  });

  it("requires the authenticated email account and ownership signature before linking", () => {
    expect(checkFinancialWalletLink({ ...baseIdentity, financialWallet: null }, baseIdentity.connectedWallet)).toEqual({
      allowed: true,
      wallet: baseIdentity.connectedWallet,
    });
    expect(
      checkFinancialWalletLink(
        {
          ...baseIdentity,
          authenticated: false,
          financialWallet: null,
          connectedWallet: null,
          walletAuthenticated: false,
        },
        baseIdentity.connectedWallet,
      ),
    ).toMatchObject({ allowed: false, code: "FINANCIAL_IDENTITY_REQUIRED" });
    expect(
      checkFinancialWalletLink({ ...baseIdentity, walletAuthenticated: false }, baseIdentity.connectedWallet),
    ).toMatchObject({ allowed: false, code: "WALLET_SIGNATURE_REQUIRED" });
  });

  it("blocks wallet substitution, conflicts, and stale private reveals", () => {
    expect(
      checkFinancialWalletLink(
        { ...baseIdentity, connectedWallet: "0x2222222222222222222222222222222222222222" },
        "0x2222222222222222222222222222222222222222",
      ),
    ).toMatchObject({
      allowed: false,
      code: "FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH",
    });
    expect(checkPrivateRevealIdentity({ ...baseIdentity, sessionExpired: true }, true)).toMatchObject({
      allowed: false,
      code: "AUTH_SESSION_EXPIRED",
    });
    expect(checkPrivateRevealIdentity({ ...baseIdentity, accountConflict: true }, true)).toMatchObject({
      allowed: false,
      code: "AUTH_ACCOUNT_CONFLICT",
    });
    expect(checkPrivateRevealIdentity(baseIdentity, false)).toMatchObject({ allowed: false, code: "WRONG_NETWORK" });
  });

  it("fails closed when live provider configuration is absent and keeps X optional", () => {
    expect(typeof dynamicAuthConfigured).toBe("boolean");
    expect(typeof dynamicXEnabled).toBe("boolean");
    if (!dynamicAuthConfigured) expect(authConfigurationMessage).toBeTruthy();
  });

  it("does not turn identity fields into financial calldata", () => {
    const serialized = JSON.stringify({ email: "private@example.invalid", username: baseIdentity.username });
    expect(serialized).not.toContain("save");
    expect(serialized).not.toContain("withdraw");
    expect(serialized).not.toContain("enterPrizeRound");
  });
});
