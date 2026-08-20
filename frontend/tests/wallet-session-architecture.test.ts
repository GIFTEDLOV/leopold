import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const financialProvider = readFileSync(new URL("../components/financial-provider.tsx", import.meta.url), "utf8");
const sessionProvider = readFileSync(new URL("../components/wallet-identity-provider.tsx", import.meta.url), "utf8");
const authProvider = readFileSync(new URL("../components/auth-provider.tsx", import.meta.url), "utf8");
const walletRecovery = readFileSync(new URL("../lib/auth/wallet-recovery.ts", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");

describe("wallet-session architecture boundaries", () => {
  it("does not use bare Wagmi disconnect for Leopold session semantics", () => {
    expect(financialProvider).not.toContain("useDisconnect");
    expect(financialProvider).not.toContain("disconnectState.disconnect");
    expect(financialProvider).toContain("walletIdentity.disconnectLeopoldWallet()");
  });

  it("keeps wallet.sync inside the explicit existing-wallet connection helper", () => {
    expect(walletRecovery).toContain("wallet.sync()");
    expect(sessionProvider).not.toContain(".sync()");
    expect(authProvider).not.toContain(".sync()");
  });

  it("keeps provider account and chain event handlers observation-only", () => {
    const accountHandler = authProvider.slice(
      authProvider.indexOf("const onAccountChange"),
      authProvider.indexOf("return () =>", authProvider.indexOf("const onAccountChange")),
    );
    expect(accountHandler).toContain("commitProviderAccount");
    expect(accountHandler).toContain("setActiveNetworkId");
    expect(accountHandler).not.toContain("connectVerifiedWallet");
    expect(accountHandler).not.toContain("switchWallet");
    expect(accountHandler).not.toContain("sync(");
  });

  it("blocks signer acquisition behind the authoritative session guard", () => {
    expect(financialProvider).toContain("await walletIdentity.requireConnectedFinancialSession()");
    expect(financialProvider.indexOf("await ensureFinancialAccess()")).toBeLessThan(
      financialProvider.indexOf("await action((hash)"),
    );
  });

  it("does not clear public vault state on wallet-session revisions", () => {
    expect(financialProvider).not.toContain("setPublicVaultState({})");
    expect(financialProvider).not.toContain("setLatestBlockTimestamp(null)");
    expect(financialProvider).toContain("invalidatePrivateBalance()");
    expect(financialProvider).toContain("setRevealedVaults(new Set())");
  });

  it("requires an explicit wallet-menu Disconnect action", () => {
    expect(appShell).toContain("setWalletMenu((open) => !open)");
    expect(appShell).toContain("walletIdentity.disconnectLeopoldWallet()");
    expect(appShell).not.toContain('if (identityState === "READY") financial.disconnectWallet()');
  });

  it("contains no normal WALLET_MISMATCH presentation state", () => {
    expect(appShell).not.toContain("WALLET_MISMATCH");
    expect(sessionProvider).not.toContain("WALLET_MISMATCH");
  });

  it("keeps wallet disconnect and account signout as separate commands", () => {
    const disconnect = sessionProvider.slice(
      sessionProvider.indexOf("const disconnectLeopoldWallet"),
      sessionProvider.indexOf("const runNetworkHealthProbe"),
    );
    const signoutStart = authProvider.indexOf("signOut: async () =>");
    const signout = authProvider.slice(signoutStart, authProvider.indexOf("clearAuthError: ()", signoutStart));
    expect(disconnect).toContain('invalidateSession("USER_DISCONNECTED")');
    expect(disconnect).not.toContain("handleLogOut");
    expect(disconnect).not.toContain("updateUser");
    expect(signout).toContain("handleLogOut");
  });

  it("keeps email, X, and provider events away from financial-wallet metadata writes", () => {
    const providerEvents = authProvider.slice(
      authProvider.indexOf('useDynamicEvents("primaryWalletNetworkChanged"'),
      authProvider.indexOf("const withBusy"),
    );
    const socialActions = authProvider.slice(
      authProvider.indexOf("linkX: async"),
      authProvider.indexOf("signOut: async"),
    );
    expect(providerEvents).not.toContain("updateUser");
    expect(socialActions).not.toContain("updateUser");
    expect(socialActions).not.toContain("leopoldFinancialWallet");
  });
});
