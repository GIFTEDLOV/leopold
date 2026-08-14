import { getAddress, isAddress, type Address } from "viem";

export const AUTH_READINESS_STATES = [
  "ANONYMOUS",
  "EMAIL_AUTHENTICATED",
  "WALLET_AUTHENTICATED_INCOMPLETE",
  "PROFILE_INCOMPLETE",
  "WALLET_REQUIRED",
  "ACCOUNT_READY",
  "SESSION_EXPIRED",
  "ACCOUNT_CONFLICT",
] as const;

export type AuthReadinessState = (typeof AUTH_READINESS_STATES)[number];

export type AuthIdentitySnapshot = {
  authenticated: boolean;
  emailVerified: boolean;
  username: string | null;
  providerUserId: string | null;
  financialWallet: Address | null;
  connectedWallet: Address | null;
  walletAuthenticated: boolean;
  sessionExpired?: boolean;
  accountConflict?: boolean;
};

export function normalizeWalletAddress(value: string | null | undefined): Address | null {
  if (!value || !isAddress(value, { strict: false })) return null;
  return getAddress(value.toLowerCase() as Address);
}

export function walletsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeWalletAddress(left);
  const normalizedRight = normalizeWalletAddress(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft.toLowerCase() === normalizedRight.toLowerCase());
}

export function getAuthReadiness(identity: AuthIdentitySnapshot): AuthReadinessState {
  if (identity.sessionExpired) return "SESSION_EXPIRED";
  if (identity.accountConflict) return "ACCOUNT_CONFLICT";
  if (!identity.authenticated) return "ANONYMOUS";
  if (!identity.emailVerified && identity.walletAuthenticated) return "WALLET_AUTHENTICATED_INCOMPLETE";
  if (!identity.emailVerified) return "EMAIL_AUTHENTICATED";
  if (!identity.username) return "PROFILE_INCOMPLETE";
  if (!identity.financialWallet || !identity.connectedWallet) return "WALLET_REQUIRED";
  if (!identity.walletAuthenticated || !walletsMatch(identity.financialWallet, identity.connectedWallet)) {
    return "WALLET_REQUIRED";
  }
  return "ACCOUNT_READY";
}

export type FinancialGuardResult = { allowed: true } | { allowed: false; code: string; message: string };

export type WalletLinkGuardResult =
  | { allowed: true; wallet: Address }
  | { allowed: false; code: string; message: string };

export function checkFinancialIdentity(identity: AuthIdentitySnapshot, chainCorrect: boolean): FinancialGuardResult {
  const readiness = getAuthReadiness(identity);
  if (readiness === "SESSION_EXPIRED") {
    return { allowed: false, code: "AUTH_SESSION_EXPIRED", message: "Your Leopold session expired. Sign in again." };
  }
  if (readiness === "ACCOUNT_CONFLICT") {
    return {
      allowed: false,
      code: "AUTH_ACCOUNT_CONFLICT",
      message: "Resolve the account credential conflict before continuing.",
    };
  }
  if (readiness !== "ACCOUNT_READY") {
    return {
      allowed: false,
      code: "FINANCIAL_IDENTITY_REQUIRED",
      message: "Verify your email, choose a username, and link your financial wallet before continuing.",
    };
  }
  if (!chainCorrect) {
    return { allowed: false, code: "WRONG_NETWORK", message: "Switch your connected wallet to Ethereum Sepolia." };
  }
  return { allowed: true };
}

export function requireFinancialIdentity(identity: AuthIdentitySnapshot, chainCorrect: boolean): void {
  const result = checkFinancialIdentity(identity, chainCorrect);
  if (!result.allowed) {
    const error = new Error(result.code);
    error.name = result.code;
    throw error;
  }
}

/**
 * This is the last application-side check before the user confirms the
 * provider's wallet-link flow. It never changes an existing designation.
 * Dynamic must still perform the ownership signature and its own conflict UI.
 */
export function checkFinancialWalletLink(
  identity: AuthIdentitySnapshot,
  candidateWallet: string | null | undefined,
): WalletLinkGuardResult {
  if (identity.sessionExpired) {
    return { allowed: false, code: "AUTH_SESSION_EXPIRED", message: "Your Leopold session expired. Sign in again." };
  }
  if (identity.accountConflict) {
    return {
      allowed: false,
      code: "AUTH_ACCOUNT_CONFLICT",
      message: "Resolve the account credential conflict before linking a wallet.",
    };
  }
  if (!identity.authenticated || !identity.emailVerified || !identity.username) {
    return {
      allowed: false,
      code: "FINANCIAL_IDENTITY_REQUIRED",
      message: "Verify your email and choose a username before linking a financial wallet.",
    };
  }
  const normalizedCandidate = normalizeWalletAddress(candidateWallet);
  if (
    !normalizedCandidate ||
    !identity.connectedWallet ||
    !walletsMatch(normalizedCandidate, identity.connectedWallet)
  ) {
    return {
      allowed: false,
      code: "WALLET_SIGNATURE_REQUIRED",
      message: "Connect and sign with the wallet you intend to verify.",
    };
  }
  if (!identity.walletAuthenticated) {
    return {
      allowed: false,
      code: "WALLET_SIGNATURE_REQUIRED",
      message: "Sign with your external wallet to verify ownership before continuing.",
    };
  }
  if (identity.financialWallet && !walletsMatch(identity.financialWallet, normalizedCandidate)) {
    return {
      allowed: false,
      code: "FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH",
      message: "The verified financial wallet cannot be replaced automatically.",
    };
  }
  return { allowed: true, wallet: normalizedCandidate };
}

export function checkPrivateRevealIdentity(
  identity: AuthIdentitySnapshot,
  chainCorrect: boolean,
): FinancialGuardResult {
  return checkFinancialIdentity(identity, chainCorrect);
}
