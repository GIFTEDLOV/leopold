import type { Address } from "viem";
import { normalizeWalletAddress } from "./readiness";
import { canonicalizeUsername } from "./username";

export const FINANCIAL_WALLET_METADATA_KEY = "leopoldFinancialWallet";
export const LEOPOLD_USERNAME_METADATA_KEY = "Leopold Username";

export type AccountAuthenticationStatus = "LOADING" | "SIGNED_OUT" | "SIGNED_IN";
export type AccountProfileStatus = "LOADING" | "INCOMPLETE" | "COMPLETE" | "ERROR";
export type AccountStatus = "AUTH_LOADING" | "SIGNED_OUT" | "SIGNED_IN_PROFILE_INCOMPLETE" | "SIGNED_IN_READY";
export type FinancialWalletMetadataStatus = "LOADING" | "UNAVAILABLE" | "NONE" | "PRESENT" | "ERROR";

export type DynamicAccountProfile = {
  email?: string | null;
  metadata?: object | null;
  missingFields?: readonly unknown[];
  userId?: string | null;
  verifiedCredentials?: readonly { format?: string }[];
};

export type FinancialWalletMetadata = {
  status: FinancialWalletMetadataStatus;
  address: Address | null;
  error: "INVALID_FINANCIAL_WALLET_METADATA" | null;
};

export type AccountState = {
  status: AccountStatus;
  authentication: AccountAuthenticationStatus;
  authenticated: boolean;
  profileStatus: AccountProfileStatus;
  identity: DynamicAccountProfile | null;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  providerUserId: string | null;
  financialWallet: FinancialWalletMetadata;
};

export type AccountStateInputs = {
  clientReady: boolean;
  completedUser: DynamicAccountProfile | null | undefined;
  incompleteUser: DynamicAccountProfile | null | undefined;
};

function metadataOf(identity: DynamicAccountProfile): Record<string, unknown> {
  return identity.metadata && typeof identity.metadata === "object"
    ? (identity.metadata as Record<string, unknown>)
    : {};
}

function usernameOf(identity: DynamicAccountProfile): string | null {
  const configured = metadataOf(identity)[LEOPOLD_USERNAME_METADATA_KEY];
  if (typeof configured !== "string") return null;
  try {
    return canonicalizeUsername(configured);
  } catch {
    return null;
  }
}

function walletMetadataOf(identity: DynamicAccountProfile): FinancialWalletMetadata {
  const metadata = metadataOf(identity);
  if (!(FINANCIAL_WALLET_METADATA_KEY in metadata) || metadata[FINANCIAL_WALLET_METADATA_KEY] == null) {
    return { status: "NONE", address: null, error: null };
  }
  const address = normalizeWalletAddress(String(metadata[FINANCIAL_WALLET_METADATA_KEY]));
  return address
    ? { status: "PRESENT", address, error: null }
    : { status: "ERROR", address: null, error: "INVALID_FINANCIAL_WALLET_METADATA" };
}

export function deriveAccountState(inputs: AccountStateInputs): AccountState {
  if (!inputs.clientReady) {
    return {
      status: "AUTH_LOADING",
      authentication: "LOADING",
      authenticated: false,
      profileStatus: "LOADING",
      identity: null,
      email: null,
      emailVerified: false,
      username: null,
      providerUserId: null,
      financialWallet: { status: "LOADING", address: null, error: null },
    };
  }

  const identity = inputs.completedUser ?? inputs.incompleteUser ?? null;
  if (!identity) {
    return {
      status: "SIGNED_OUT",
      authentication: "SIGNED_OUT",
      authenticated: false,
      profileStatus: "INCOMPLETE",
      identity: null,
      email: null,
      emailVerified: false,
      username: null,
      providerUserId: null,
      financialWallet: { status: "UNAVAILABLE", address: null, error: null },
    };
  }

  const emailVerified = Boolean(identity.verifiedCredentials?.some((credential) => credential.format === "email"));
  const username = usernameOf(identity);
  const financialWallet = walletMetadataOf(identity);
  // Dynamic's completed-user projection is the supported signal that its own
  // onboarding requirements (including MFA/device requirements) are complete.
  // The raw profile remains account-session truth, but never bypasses those requirements.
  const dynamicRequirementsComplete = Boolean(inputs.completedUser);
  const profileStatus: AccountProfileStatus =
    emailVerified && username && dynamicRequirementsComplete ? "COMPLETE" : "INCOMPLETE";

  return {
    status: profileStatus === "COMPLETE" ? "SIGNED_IN_READY" : "SIGNED_IN_PROFILE_INCOMPLETE",
    authentication: "SIGNED_IN",
    authenticated: true,
    profileStatus,
    identity,
    email: typeof identity.email === "string" ? identity.email : null,
    emailVerified,
    username,
    providerUserId: typeof identity.userId === "string" ? identity.userId : null,
    financialWallet,
  };
}
