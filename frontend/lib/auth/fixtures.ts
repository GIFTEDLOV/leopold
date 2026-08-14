import type { Address } from "viem";
import { authFixtureMode, type AuthFixtureMode } from "./config";
import type { AuthIdentitySnapshot } from "./readiness";

export const fixtureWalletA = "0x7E57a10D00000000000000000000000000000001" as Address;
export const fixtureWalletB = "0x7E57a10D00000000000000000000000000000002" as Address;

export function getFixtureIdentityForMode(mode: AuthFixtureMode): AuthIdentitySnapshot {
  switch (mode) {
    case "anonymous":
      return {
        authenticated: false,
        emailVerified: false,
        username: null,
        providerUserId: null,
        financialWallet: null,
        connectedWallet: null,
        walletAuthenticated: false,
      };
    case "email":
      return {
        authenticated: true,
        emailVerified: true,
        username: "fixture_user",
        providerUserId: "fixture-email-user",
        financialWallet: null,
        connectedWallet: null,
        walletAuthenticated: false,
      };
    case "wallet":
      return {
        authenticated: true,
        emailVerified: false,
        username: null,
        providerUserId: "fixture-wallet-user",
        financialWallet: fixtureWalletA,
        connectedWallet: fixtureWalletA,
        walletAuthenticated: true,
      };
    case "profile-missing":
      return {
        authenticated: true,
        emailVerified: true,
        username: null,
        providerUserId: "fixture-profile-user",
        financialWallet: null,
        connectedWallet: null,
        walletAuthenticated: false,
      };
    case "mismatch":
      return {
        authenticated: true,
        emailVerified: true,
        username: "fixture_user",
        providerUserId: "fixture-mismatch-user",
        financialWallet: fixtureWalletA,
        connectedWallet: fixtureWalletB,
        walletAuthenticated: true,
      };
    case "expired":
      return {
        authenticated: true,
        emailVerified: true,
        username: "fixture_user",
        providerUserId: "fixture-expired-user",
        financialWallet: fixtureWalletA,
        connectedWallet: fixtureWalletA,
        walletAuthenticated: true,
        sessionExpired: true,
      };
    case "conflict":
      return {
        authenticated: true,
        emailVerified: true,
        username: null,
        providerUserId: "fixture-conflict-user",
        financialWallet: null,
        connectedWallet: null,
        walletAuthenticated: false,
        accountConflict: true,
      };
    case "x-unavailable":
    case "ready":
      return {
        authenticated: true,
        emailVerified: true,
        username: "fixture_user",
        providerUserId: "fixture-ready-user",
        financialWallet: fixtureWalletA,
        connectedWallet: fixtureWalletA,
        walletAuthenticated: true,
      };
  }
}

export function getFixtureIdentity(): AuthIdentitySnapshot | null {
  return authFixtureMode ? getFixtureIdentityForMode(authFixtureMode) : null;
}
