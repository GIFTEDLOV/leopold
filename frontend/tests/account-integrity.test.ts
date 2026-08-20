import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  accountIntegrityErrorMessage,
  createFinancialWalletMetadataUpdate,
  createUsernameMetadataUpdate,
  evaluateAccountIntegrityPolicy,
} from "../lib/auth/account-integrity";
import { deriveAccountState, type DynamicAccountProfile } from "../lib/auth/account-state";

const walletA = "0x1111111111111111111111111111111111111111";
const walletB = "0x2222222222222222222222222222222222222222";
const readySettings = {
  customFields: [
    {
      name: "Leopold Username",
      enabled: true,
      required: true,
      unique: true,
      validationRules: { regex: "^[a-z0-9_]{3,20}$" },
    },
    { name: "leopoldFinancialWallet", enabled: true, required: false, unique: true },
  ],
};
const policy = evaluateAccountIntegrityPolicy(readySettings);
const identity: DynamicAccountProfile = {
  userId: "account-a",
  email: "account-a@example.invalid",
  verifiedCredentials: [{ format: "email" }],
  missingFields: [],
  metadata: {
    "Leopold Username": "account_a",
    leopoldFinancialWallet: walletA,
    linkedX: "x-account-a",
  },
};

describe("Leopold account-integrity invariants", () => {
  it("fails closed until provider-side uniqueness configuration is loaded", () => {
    expect(evaluateAccountIntegrityPolicy(undefined)).toMatchObject({
      status: "LOADING",
      username: "LOADING",
      financialWallet: "LOADING",
    });
  });

  it("requires username uniqueness, requiredness, and the lowercase product pattern", () => {
    expect(policy).toEqual({ status: "READY", username: "READY", financialWallet: "READY", errors: [] });
    expect(
      evaluateAccountIntegrityPolicy({
        customFields: [
          {
            name: "Leopold Username",
            enabled: true,
            required: false,
            unique: false,
            validationRules: { regex: "^.*$" },
          },
        ],
      }),
    ).toMatchObject({ status: "ERROR", username: "ERROR", financialWallet: "ERROR" });
  });

  it("canonicalizes case variants before the unique backend write", () => {
    expect(createUsernameMetadataUpdate(identity, "  ACCOUNT_A  ", policy)).toMatchObject({
      "Leopold Username": "account_a",
    });
  });

  it("preserves verified wallet and X metadata during a username change", () => {
    const next = createUsernameMetadataUpdate(identity, "new_name", policy);
    expect(next).toEqual({
      "Leopold Username": "new_name",
      leopoldFinancialWallet: walletA,
      linkedX: "x-account-a",
    });
    expect(identity.metadata).toMatchObject({ "Leopold Username": "account_a" });
  });

  it("maps Dynamic's unique custom-field rejection to useful collision feedback", () => {
    const error = Object.assign(new Error("Custom Field for user must be unique within the environment"), {
      code: "custom_field_data_not_unique",
    });
    expect(accountIntegrityErrorMessage(error, "USERNAME")).toBe("That username is unavailable. Choose another one.");
    expect(accountIntegrityErrorMessage(error, "FINANCIAL_WALLET")).toBe(
      "This wallet already belongs to another Leopold account. No account data was changed.",
    );
  });

  it("never replaces permanent wallet metadata while changing unrelated identity fields", () => {
    try {
      createFinancialWalletMetadataUpdate(identity, walletB, policy);
      throw new Error("Expected immutable wallet metadata to reject replacement");
    } catch (error) {
      expect(error).toMatchObject({ code: "FINANCIAL_WALLET_CHANGE_REQUIRES_REAUTH" });
    }
    expect(identity.metadata).toMatchObject({ leopoldFinancialWallet: walletA });
  });

  it("preserves email, username, wallet, and X-associated metadata for wallet-first and email-first returns", () => {
    for (const completedUser of [identity, undefined]) {
      const restored = deriveAccountState({ clientReady: true, completedUser, incompleteUser: identity });
      expect(restored).toMatchObject({
        authenticated: true,
        email: "account-a@example.invalid",
        username: "account_a",
        providerUserId: "account-a",
        financialWallet: { status: "PRESENT", address: walletA },
      });
      expect((restored.identity?.metadata as Record<string, unknown>).linkedX).toBe("x-account-a");
    }
  });

  it("does not let email, X, or provider observations derive permanent wallet metadata", () => {
    const withoutWallet = {
      ...identity,
      email: "changed@example.invalid",
      metadata: { "Leopold Username": "account_a", linkedX: "different-x" },
    };
    const state = deriveAccountState({
      clientReady: true,
      completedUser: withoutWallet,
      incompleteUser: withoutWallet,
    });
    expect(state.financialWallet).toMatchObject({ status: "NONE", address: null });
  });

  it("requires a stable Dynamic account id before any protected metadata write", () => {
    const accountWithoutId = { ...identity, userId: null };
    expect(() => createUsernameMetadataUpdate(accountWithoutId, "new_name", policy)).toThrow(
      "A validated account identity is required.",
    );
    expect(() => createFinancialWalletMetadataUpdate(accountWithoutId, walletA, policy)).toThrow(
      "A validated account identity is required.",
    );
  });

  it("contains no application-side merge, transfer, or wallet reassignment command", () => {
    const authProvider = readFileSync(new URL("../components/auth-provider.tsx", import.meta.url), "utf8");
    expect(authProvider).not.toMatch(/mergeUserAccounts|transferWallet|reassignWallet|verifyTransfer/u);
  });
});
