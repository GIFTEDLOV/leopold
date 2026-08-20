import type { Address } from "viem";
import {
  FINANCIAL_WALLET_METADATA_KEY,
  LEOPOLD_USERNAME_METADATA_KEY,
  type DynamicAccountProfile,
} from "./account-state";
import { normalizeWalletAddress, walletsMatch } from "./readiness";
import { canonicalizeUsername } from "./username";

export const LEOPOLD_USERNAME_PATTERN_SOURCE = "^[a-z0-9_]{3,20}$";

type DynamicProjectField = {
  enabled?: boolean;
  name?: string;
  required?: boolean;
  unique?: boolean;
  validationRules?: { regex?: string; unique?: boolean };
};

export type DynamicProjectSettingsLike = {
  customFields?: readonly DynamicProjectField[];
  kyc?: readonly DynamicProjectField[];
};

export type IntegrityFieldStatus = "LOADING" | "READY" | "ERROR";

export type AccountIntegrityPolicy = {
  status: IntegrityFieldStatus;
  username: IntegrityFieldStatus;
  financialWallet: IntegrityFieldStatus;
  errors: readonly string[];
};

export type AccountIntegrityOperation = "AUTH" | "USERNAME" | "FINANCIAL_WALLET";

export class AccountIntegrityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccountIntegrityError";
  }
}

function fieldByName(settings: DynamicProjectSettingsLike, name: string): DynamicProjectField | null {
  return [...(settings.customFields ?? []), ...(settings.kyc ?? [])].find((field) => field.name === name) ?? null;
}

function fieldIsUnique(field: DynamicProjectField): boolean {
  return field.unique === true || field.validationRules?.unique === true;
}

export function evaluateAccountIntegrityPolicy(
  settings: DynamicProjectSettingsLike | null | undefined,
): AccountIntegrityPolicy {
  if (!settings) {
    return { status: "LOADING", username: "LOADING", financialWallet: "LOADING", errors: [] };
  }

  const errors: string[] = [];
  const username = fieldByName(settings, LEOPOLD_USERNAME_METADATA_KEY);
  if (!username) errors.push("USERNAME_FIELD_MISSING");
  else {
    if (username.enabled !== true) errors.push("USERNAME_FIELD_DISABLED");
    if (username.required !== true) errors.push("USERNAME_FIELD_NOT_REQUIRED");
    if (!fieldIsUnique(username)) errors.push("USERNAME_FIELD_NOT_UNIQUE");
    if (username.validationRules?.regex !== LEOPOLD_USERNAME_PATTERN_SOURCE) {
      errors.push("USERNAME_FIELD_PATTERN_MISMATCH");
    }
  }

  const financialWallet = fieldByName(settings, FINANCIAL_WALLET_METADATA_KEY);
  if (!financialWallet) errors.push("FINANCIAL_WALLET_FIELD_MISSING");
  else {
    if (financialWallet.enabled !== true) errors.push("FINANCIAL_WALLET_FIELD_DISABLED");
    if (!fieldIsUnique(financialWallet)) errors.push("FINANCIAL_WALLET_FIELD_NOT_UNIQUE");
  }

  const usernameErrors = errors.some((error) => error.startsWith("USERNAME_"));
  const walletErrors = errors.some((error) => error.startsWith("FINANCIAL_WALLET_"));
  return {
    status: errors.length === 0 ? "READY" : "ERROR",
    username: usernameErrors ? "ERROR" : "READY",
    financialWallet: walletErrors ? "ERROR" : "READY",
    errors,
  };
}

function metadataOf(identity: DynamicAccountProfile): Record<string, unknown> {
  return identity.metadata && typeof identity.metadata === "object"
    ? { ...(identity.metadata as Record<string, unknown>) }
    : {};
}

function requirePolicyReady(status: IntegrityFieldStatus, code: string): void {
  if (status !== "READY") {
    throw new AccountIntegrityError(code, "Account integrity configuration is not ready.");
  }
}

function requireAccountIdentity(identity: DynamicAccountProfile): void {
  if (!identity.userId) {
    throw new AccountIntegrityError("ACCOUNT_IDENTITY_REQUIRED", "A validated account identity is required.");
  }
}

export function createUsernameMetadataUpdate(
  identity: DynamicAccountProfile,
  username: string,
  policy: AccountIntegrityPolicy,
): Record<string, unknown> {
  requireAccountIdentity(identity);
  requirePolicyReady(policy.username, "USERNAME_UNIQUENESS_NOT_ENFORCED");
  return { ...metadataOf(identity), [LEOPOLD_USERNAME_METADATA_KEY]: canonicalizeUsername(username) };
}

export function createFinancialWalletMetadataUpdate(
  identity: DynamicAccountProfile,
  candidate: Address,
  policy: AccountIntegrityPolicy,
): Record<string, unknown> {
  requireAccountIdentity(identity);
  requirePolicyReady(policy.financialWallet, "FINANCIAL_WALLET_UNIQUENESS_NOT_ENFORCED");
  const metadata = metadataOf(identity);
  const existingValue = metadata[FINANCIAL_WALLET_METADATA_KEY];
  const existing = existingValue == null ? null : normalizeWalletAddress(String(existingValue));
  if (existingValue != null && !existing) {
    throw new AccountIntegrityError("INVALID_FINANCIAL_WALLET_METADATA", "Existing wallet metadata is invalid.");
  }
  if (existing && !walletsMatch(existing, candidate)) {
    throw new AccountIntegrityError(
      "FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH",
      "The verified financial wallet cannot be replaced automatically.",
    );
  }
  return { ...metadata, [FINANCIAL_WALLET_METADATA_KEY]: candidate };
}

function errorDetail(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return `${code} ${message}`.trim();
}

export function accountIntegrityErrorMessage(error: unknown, operation: AccountIntegrityOperation): string | null {
  const detail = errorDetail(error);
  if (/username_uniqueness_not_enforced/iu.test(detail)) {
    return "Username creation is paused because uniqueness cannot be verified.";
  }
  if (/financial_wallet_uniqueness_not_enforced/iu.test(detail)) {
    return "Financial-wallet linking is paused because unique ownership cannot be verified.";
  }
  if (/custom_field_data_not_unique|custom_field_not_unique/iu.test(detail)) {
    return operation === "FINANCIAL_WALLET"
      ? "This wallet already belongs to another Leopold account. No account data was changed."
      : "That username is unavailable. Choose another one.";
  }
  return null;
}
