import { describe, expect, it } from "vitest";
import {
  FINANCIAL_WALLET_METADATA_KEY,
  LEOPOLD_USERNAME_METADATA_KEY,
  deriveAccountState,
  type DynamicAccountProfile,
} from "../lib/auth/account-state";

const wallet = "0x1111111111111111111111111111111111111111";
const readyProfile: DynamicAccountProfile = {
  userId: "dynamic-user-1",
  email: "verified@example.com",
  verifiedCredentials: [{ format: "email" }],
  missingFields: [],
  metadata: {
    [LEOPOLD_USERNAME_METADATA_KEY]: "leopold_user",
    [FINANCIAL_WALLET_METADATA_KEY]: wallet,
    xAccount: "preserved-x-linkage",
  },
};

describe("account authentication and profile projections", () => {
  it("keeps SDK validation as loading rather than authentication truth", () => {
    const state = deriveAccountState({ clientReady: false, completedUser: undefined, incompleteUser: undefined });
    expect(state).toMatchObject({
      status: "AUTH_LOADING",
      authentication: "LOADING",
      authenticated: false,
      profileStatus: "LOADING",
      financialWallet: { status: "LOADING", address: null },
    });
  });

  it("uses the completed Dynamic user as a signed-in, profile-ready account", () => {
    const state = deriveAccountState({ clientReady: true, completedUser: readyProfile, incompleteUser: readyProfile });
    expect(state).toMatchObject({
      status: "SIGNED_IN_READY",
      authentication: "SIGNED_IN",
      authenticated: true,
      profileStatus: "COMPLETE",
      email: "verified@example.com",
      emailVerified: true,
      username: "leopold_user",
      providerUserId: "dynamic-user-1",
      financialWallet: { status: "PRESENT", address: wallet },
    });
  });

  it("uses userWithMissingInfo as session truth without treating it as profile complete", () => {
    const raw = { ...readyProfile, missingFields: [{ name: "firstName" }] };
    const state = deriveAccountState({ clientReady: true, completedUser: undefined, incompleteUser: raw });
    expect(state.authentication).toBe("SIGNED_IN");
    expect(state.authenticated).toBe(true);
    expect(state.status).toBe("SIGNED_IN_PROFILE_INCOMPLETE");
    expect(state.profileStatus).toBe("INCOMPLETE");
  });

  it("preserves identity, email, username, wallet metadata, and unrelated metadata from the raw profile", () => {
    const state = deriveAccountState({ clientReady: true, completedUser: undefined, incompleteUser: readyProfile });
    expect(state.identity).toBe(readyProfile);
    expect(state.email).toBe("verified@example.com");
    expect(state.username).toBe("leopold_user");
    expect(state.financialWallet).toMatchObject({ status: "PRESENT", address: wallet });
    expect((state.identity?.metadata as Record<string, unknown>).xAccount).toBe("preserved-x-linkage");
  });

  it("settles signed out only after validation when both Dynamic user projections are absent", () => {
    const state = deriveAccountState({ clientReady: true, completedUser: undefined, incompleteUser: undefined });
    expect(state).toMatchObject({
      status: "SIGNED_OUT",
      authentication: "SIGNED_OUT",
      authenticated: false,
      financialWallet: { status: "UNAVAILABLE", address: null },
    });
  });

  it("distinguishes definitively absent financial metadata from metadata loading", () => {
    const withoutWallet = {
      ...readyProfile,
      metadata: { [LEOPOLD_USERNAME_METADATA_KEY]: "leopold_user" },
    };
    const loading = deriveAccountState({ clientReady: false, completedUser: undefined, incompleteUser: undefined });
    const none = deriveAccountState({ clientReady: true, completedUser: withoutWallet, incompleteUser: withoutWallet });
    expect(loading.financialWallet.status).toBe("LOADING");
    expect(none.financialWallet).toMatchObject({ status: "NONE", address: null });
  });

  it("fails closed on malformed permanent financial-wallet metadata", () => {
    const malformed = {
      ...readyProfile,
      metadata: { ...readyProfile.metadata, [FINANCIAL_WALLET_METADATA_KEY]: "not-an-address" },
    };
    const state = deriveAccountState({ clientReady: true, completedUser: malformed, incompleteUser: malformed });
    expect(state.financialWallet).toEqual({
      status: "ERROR",
      address: null,
      error: "INVALID_FINANCIAL_WALLET_METADATA",
    });
  });
});
