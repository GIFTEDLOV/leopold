"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  useConnectWithOtp,
  useDynamicContext,
  useDynamicEvents,
  useDynamicModals,
  useProjectSettings,
  useSocialAccounts,
  useSwitchWallet,
  useUserUpdateRequest,
  useUserWallets,
} from "@dynamic-labs/sdk-react-core";
import type { Address } from "viem";
import { dynamicXEnabled } from "@/lib/auth/config";
import { normalizeEmail } from "@/lib/auth/email";
import { fixtureWalletA, getFixtureIdentity } from "@/lib/auth/fixtures";
import {
  checkFinancialWalletLink,
  findWalletByAddress,
  getAuthReadiness,
  normalizeWalletAddress,
  walletsMatch,
  type AuthIdentitySnapshot,
  type AuthReadinessState,
} from "@/lib/auth/readiness";
import type { DynamicWalletDescriptor } from "@/lib/auth/wallet-identity";
import { withWalletSessionTimeout } from "@/lib/auth/wallet-identity";
import { normalizeNetworkChainId } from "@/lib/leopold/network";
import { getAuthHydrationPhase } from "@/lib/auth/hydration";
import { reconnectExistingWallet } from "@/lib/auth/wallet-recovery";
import {
  accountIntegrityErrorMessage,
  createFinancialWalletMetadataUpdate,
  createUsernameMetadataUpdate,
  evaluateAccountIntegrityPolicy,
  type AccountIntegrityOperation,
  type AccountIntegrityPolicy,
} from "@/lib/auth/account-integrity";
import {
  FINANCIAL_WALLET_METADATA_KEY,
  LEOPOLD_USERNAME_METADATA_KEY,
  deriveAccountState,
  type AccountProfileStatus,
  type AccountState,
  type AccountStatus,
  type DynamicAccountProfile,
  type FinancialWalletMetadata,
} from "@/lib/auth/account-state";
const twitterProvider = "twitter" as Parameters<ReturnType<typeof useSocialAccounts>["isLinked"]>[0];
const fixtureFinancialEnabled =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_LEOPOLD_DEV_FIXTURE === "1";
const noClientHydrationSubscription = () => () => undefined;
const clientMountedSnapshot = () => true;
const serverMountedSnapshot = () => false;

export type AuthContextValue = {
  clientReady: boolean;
  hydrationPhase: ReturnType<typeof getAuthHydrationPhase>;
  initializationError: string | null;
  account: AccountState;
  accountStatus: AccountStatus;
  accountAuthentication: AccountState["authentication"];
  accountIdentity: DynamicAccountProfile | null;
  profileStatus: AccountProfileStatus;
  configured: boolean;
  fixture: boolean;
  loading: boolean;
  authenticated: boolean;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  providerUserId: string | null;
  financialWallet: Address | null;
  verifiedFinancialWallet: Address | null;
  financialWalletMetadata: FinancialWalletMetadata;
  integrityPolicy: AccountIntegrityPolicy;
  connectedWallet: Address | null;
  activeWalletAddress: Address | null;
  dynamicPrimaryWallet: Address | null;
  dynamicLinkedWallets: readonly DynamicWalletDescriptor[];
  dynamicWalletObjectForVerifiedAddress: DynamicWalletDescriptor | null;
  providerActiveAccount: Address | null;
  providerAccountRevision: number;
  providerAccountKnown: boolean;
  providerConnected: boolean;
  providerAvailable: boolean;
  walletAuthenticated: boolean;
  canConfirmCurrentWalletAsFinancial: boolean;
  readiness: AuthReadinessState;
  identity: AuthIdentitySnapshot;
  identityKey: string;
  authError: string | null;
  xEnabled: boolean;
  xLinked: boolean;
  otpSent: boolean;
  requestEmailOtp(email: string): Promise<void>;
  verifyEmailOtp(otp: string): Promise<void>;
  resendEmailOtp(): Promise<void>;
  openWalletAuthentication(): void;
  openProfileCompletion(): void;
  openWalletLink(): void;
  refreshConnectedWallet(): Promise<Address | null>;
  getProviderAccountRevision(): number;
  connectVerifiedWallet(): Promise<VerifiedWalletConnectionResult>;
  confirmCurrentWalletAsFinancial(): Promise<void>;
  saveUsername(username: string): Promise<void>;
  linkX(): Promise<void>;
  unlinkX(): Promise<void>;
  signOut(): Promise<void>;
  clearAuthError(): void;
  activeNetworkId: number | null;
  refreshActiveNetwork(): Promise<number | null>;
  switchFinancialWalletToSepolia(): Promise<void>;
};

export type VerifiedWalletConnectionResult =
  | { ok: true; account: Address; chainId: number | null; synced: boolean; providerRevision: number }
  | {
      ok: false;
      reason: "ACCOUNT_SELECTION_REQUIRED" | "PROVIDER_UNAVAILABLE" | "USER_CANCELLED" | "TIMEOUT";
      activeAccount: Address | null;
    };

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown, operation: AccountIntegrityOperation = "AUTH"): string {
  const integrityMessage = accountIntegrityErrorMessage(error, operation);
  if (integrityMessage) return integrityMessage;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (/auth_session_expired|session.*expired|jwt.*expired/i.test(`${code} ${message}`)) {
    return "Your Leopold session expired. Sign in again.";
  }
  if (/auth_account_conflict/i.test(`${code} ${message}`)) {
    return "Resolve the account credential conflict before continuing.";
  }
  if (/financial_wallet_change_requires_reauth/i.test(`${code} ${message}`)) {
    return "The verified financial wallet cannot be replaced automatically.";
  }
  if (/wallet_address_mismatch|not currently active|wallet.*active/i.test(`${code} ${message}`)) {
    return "Select your verified wallet account in Rabby or MetaMask, then try again.";
  }
  if (/invalid_username|username.*(exist|taken|unique)/i.test(`${code} ${message}`)) {
    return "That username is unavailable. Choose another one.";
  }
  if (/expired|otp.*expire/i.test(`${code} ${message}`)) return "That code expired. Send a new one.";
  if (/invalid|incorrect|wrong.*code|otp/i.test(`${code} ${message}`))
    return "That code was not accepted. Check it and try again.";
  if (/already.*exist|already.*linked|used|conflict/i.test(`${code} ${message}`)) {
    return "This credential already belongs to a Leopold account. Sign in there before linking it.";
  }
  if (/rate|too many|attempt/i.test(`${code} ${message}`))
    return "Too many attempts. Please wait and request a new code.";
  if (/cannot make this wallet active|compatible connector|wallet_not_found/i.test(`${code} ${message}`)) {
    return "Select your verified wallet account in Rabby or MetaMask, then try again.";
  }
  if (/network|fetch|timeout|connection/i.test(`${code} ${message}`))
    return "Authentication is temporarily unavailable. Try again shortly.";
  return "Authentication could not be completed. Try again.";
}

function DynamicAuthState({ children }: { children: ReactNode }) {
  const { user, userWithMissingInfo, sdkHasLoaded, handleLogOut, setShowAuthFlow, primaryWallet } = useDynamicContext();
  const { connectWithEmail, verifyOneTimePassword, retryOneTimePassword } = useConnectWithOtp();
  const { setShowLinkNewWalletModal } = useDynamicModals();
  const switchWallet = useSwitchWallet();
  const { updateUser } = useUserUpdateRequest();
  const projectSettings = useProjectSettings();
  const wallets = useUserWallets();
  const social = useSocialAccounts();
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [initializationFailed, setInitializationFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountConflict, setAccountConflict] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [activeNetworkId, setActiveNetworkId] = useState<number | null>(null);
  const [providerAccount, setProviderAccount] = useState<Address | null>(null);
  const [providerAccountKnown, setProviderAccountKnown] = useState(false);
  const [providerAccountRevision, setProviderAccountRevision] = useState(0);
  const providerAccountRef = useRef<Address | null>(null);
  const providerAccountKnownRef = useRef(false);
  const providerAccountRevisionRef = useRef(0);
  const providerReadRevisionRef = useRef(0);
  const networkReadRevisionRef = useRef(0);
  const clientMounted = useSyncExternalStore(
    noClientHydrationSubscription,
    clientMountedSnapshot,
    serverMountedSnapshot,
  );

  useEffect(() => {
    if (sdkHasLoaded) return;
    const timeout = window.setTimeout(() => setInitializationFailed(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, [sdkHasLoaded]);

  const clientReady = clientMounted && sdkHasLoaded;
  const initializationError =
    !sdkHasLoaded && initializationFailed
      ? "Dynamic authentication could not initialize. Check that this Preview origin is allowed in Dynamic, then retry."
      : null;
  const account = useMemo(
    () => deriveAccountState({ clientReady, completedUser: user, incompleteUser: userWithMissingInfo }),
    [clientReady, user, userWithMissingInfo],
  );
  const accountIdentity = account.identity;
  const integrityPolicy = useMemo(() => evaluateAccountIntegrityPolicy(projectSettings), [projectSettings]);

  const commitProviderAccount = useCallback((next: Address | null) => {
    const previous = providerAccountRef.current;
    const changed =
      providerAccountKnownRef.current &&
      (previous === null ? next !== null : next === null || !walletsMatch(previous, next));
    if (changed) {
      const revision = ++providerAccountRevisionRef.current;
      setProviderAccountRevision(revision);
    }
    providerAccountRef.current = next;
    providerAccountKnownRef.current = true;
    setProviderAccount(next);
    setProviderAccountKnown(true);
  }, []);

  const financialWallet = account.financialWallet.address;
  const connectedWallet = providerAccountKnown ? providerAccount : null;
  const activeWalletAddress = normalizeWalletAddress(String(primaryWallet?.address ?? ""));
  const dynamicLinkedWallets = useMemo<readonly DynamicWalletDescriptor[]>(
    () =>
      wallets
        .filter((wallet) => wallet.connector.isEmbeddedWallet !== true)
        .map((wallet) => {
          const address = normalizeWalletAddress(wallet.address);
          return address ? { id: wallet.id, address } : null;
        })
        .filter((wallet): wallet is DynamicWalletDescriptor => wallet !== null),
    [wallets],
  );
  const currentWallet = wallets.find(
    (wallet) =>
      connectedWallet &&
      wallet.address.toLowerCase() === connectedWallet.toLowerCase() &&
      wallet.connector.isEmbeddedWallet !== true,
  );
  const walletAuthenticated = Boolean(currentWallet?.isAuthenticated);
  const canConfirmCurrentWalletAsFinancial =
    account.status === "SIGNED_IN_READY" &&
    account.financialWallet.status === "NONE" &&
    Boolean(connectedWallet && currentWallet?.isAuthenticated);
  const providerConnected = providerAccountKnown && Boolean(providerAccount);
  const dynamicWalletObjectForVerifiedAddress = findWalletByAddress(
    wallets.filter((wallet) => wallet.connector.isEmbeddedWallet !== true),
    financialWallet,
  );
  const emailVerified = account.emailVerified;
  const username = account.username;
  const identity = useMemo<AuthIdentitySnapshot>(
    () => ({
      authenticated: account.authenticated,
      emailVerified,
      username,
      providerUserId: account.providerUserId,
      financialWallet,
      connectedWallet,
      walletAuthenticated,
      accountConflict,
      sessionExpired,
    }),
    [
      accountConflict,
      connectedWallet,
      emailVerified,
      financialWallet,
      sessionExpired,
      account.authenticated,
      account.providerUserId,
      username,
      walletAuthenticated,
    ],
  );
  const readiness = getAuthReadiness(identity);
  const xLinked = dynamicXEnabled && social.isLinked(twitterProvider);

  const providerWallet = useCallback(() => {
    const verifiedWallet = findWalletByAddress(
      wallets.filter((wallet) => wallet.connector.isEmbeddedWallet !== true),
      financialWallet,
    );
    if (verifiedWallet) return verifiedWallet;
    if (primaryWallet && primaryWallet.connector.isEmbeddedWallet !== true) return primaryWallet;
    return null;
  }, [financialWallet, primaryWallet, wallets]);

  const readProviderAccount = useCallback(
    async (wallet: typeof primaryWallet): Promise<Address | null> => {
      const revision = ++providerReadRevisionRef.current;
      if (!wallet || wallet.connector.isEmbeddedWallet === true) {
        if (revision !== providerReadRevisionRef.current) return null;
        commitProviderAccount(null);
        return null;
      }
      try {
        const [accountAddress] = await withWalletSessionTimeout(
          wallet.connector.getConnectedAccounts(),
          undefined,
          "PROVIDER_ACCOUNT_TIMEOUT",
        );
        const next = normalizeWalletAddress(accountAddress ?? null);
        if (revision !== providerReadRevisionRef.current) return next;
        commitProviderAccount(next);
        return next;
      } catch {
        if (revision !== providerReadRevisionRef.current) return null;
        commitProviderAccount(null);
        return null;
      }
    },
    [commitProviderAccount],
  );

  const refreshConnectedWallet = useCallback(async (): Promise<Address | null> => {
    return readProviderAccount(providerWallet());
  }, [providerWallet, readProviderAccount]);

  useEffect(() => {
    if (!clientReady) return;
    const timeout = window.setTimeout(() => {
      void refreshConnectedWallet();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [clientReady, refreshConnectedWallet]);

  useEffect(() => {
    const connector = providerWallet()?.connector;
    const onAccountChange = ({ accounts }: { accounts: string[] }) => {
      ++providerReadRevisionRef.current;
      const next = normalizeWalletAddress(accounts[0] ?? null);
      commitProviderAccount(next);
    };
    const onDisconnect = () => {
      ++providerReadRevisionRef.current;
      commitProviderAccount(null);
    };
    const onChainChange = (network: unknown) => {
      const next = normalizeNetworkChainId(network);
      setActiveNetworkId(next);
    };
    if (connector) {
      connector.on("accountChange", onAccountChange);
      connector.on("disconnect", onDisconnect);
      connector.on("chainChange", onChainChange);
    }
    return () => {
      if (connector) {
        connector.off("accountChange", onAccountChange);
        connector.off("disconnect", onDisconnect);
        connector.off("chainChange", onChainChange);
      }
    };
  }, [commitProviderAccount, providerWallet]);

  const refreshActiveNetwork = useCallback(async (): Promise<number | null> => {
    const revision = ++networkReadRevisionRef.current;
    const wallet = providerWallet();
    if (!wallet) {
      if (revision !== networkReadRevisionRef.current) return null;
      setActiveNetworkId(null);
      return null;
    }
    const next = normalizeNetworkChainId(
      await withWalletSessionTimeout(wallet.connector.getNetwork(), undefined, "PROVIDER_NETWORK_TIMEOUT"),
    );
    if (revision !== networkReadRevisionRef.current) return next;
    setActiveNetworkId(next);
    return next;
  }, [providerWallet]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshActiveNetwork().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refreshActiveNetwork]);

  useDynamicEvents("primaryWalletNetworkChanged", (network) => {
    setActiveNetworkId(normalizeNetworkChainId(network));
  });
  useDynamicEvents("primaryWalletChanged", () => {
    void refreshActiveNetwork().catch(() => undefined);
    void refreshConnectedWallet();
  });

  const withBusy = useCallback(
    async (operation: () => Promise<void>, integrityOperation: AccountIntegrityOperation = "AUTH") => {
      setAuthError(null);
      setAccountConflict(false);
      setSessionExpired(false);
      setBusy(true);
      try {
        await operation();
      } catch (error) {
        setAuthError(errorMessage(error, integrityOperation));
        const detail = `${typeof error === "object" && error !== null && "code" in error ? String(error.code) : ""} ${
          error instanceof Error ? error.message : String(error)
        }`;
        if (
          /(credential|wallet|email|social|account).*(already.*linked|already.*exist|already.*used|conflict)|(already.*linked|already.*exist|already.*used|conflict).*(credential|wallet|email|social|account)/i.test(
            detail,
          )
        ) {
          setAccountConflict(true);
        }
        if (/session|jwt|auth.*token.*expir/i.test(detail)) setSessionExpired(true);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      clientReady,
      hydrationPhase: getAuthHydrationPhase(clientReady),
      initializationError,
      account,
      accountStatus: account.status,
      accountAuthentication: account.authentication,
      accountIdentity,
      profileStatus: account.profileStatus,
      configured: true,
      fixture: false,
      loading: !sdkHasLoaded || busy,
      authenticated: identity.authenticated,
      email: account.email,
      emailVerified,
      username,
      providerUserId: identity.providerUserId,
      financialWallet,
      verifiedFinancialWallet: financialWallet,
      financialWalletMetadata: account.financialWallet,
      integrityPolicy,
      connectedWallet,
      activeWalletAddress,
      dynamicPrimaryWallet: activeWalletAddress,
      dynamicLinkedWallets,
      dynamicWalletObjectForVerifiedAddress: dynamicWalletObjectForVerifiedAddress
        ? {
            id: dynamicWalletObjectForVerifiedAddress.id,
            address: normalizeWalletAddress(dynamicWalletObjectForVerifiedAddress.address)!,
          }
        : null,
      providerActiveAccount: providerAccount,
      providerAccountRevision,
      providerAccountKnown,
      providerConnected,
      providerAvailable: Boolean(providerWallet()),
      walletAuthenticated,
      canConfirmCurrentWalletAsFinancial,
      readiness,
      identity,
      identityKey: [identity.providerUserId, financialWallet, connectedWallet, readiness].join(":"),
      authError,
      xEnabled: dynamicXEnabled,
      xLinked,
      otpSent,
      requestEmailOtp: async (email) =>
        withBusy(async () => {
          await connectWithEmail(normalizeEmail(email));
          setOtpSent(true);
        }),
      verifyEmailOtp: async (otp) =>
        withBusy(async () => {
          await verifyOneTimePassword(otp.trim());
          setOtpSent(false);
        }),
      resendEmailOtp: async () =>
        withBusy(async () => {
          await retryOneTimePassword();
          setOtpSent(true);
        }),
      openWalletAuthentication: () => {
        setAuthError(null);
        setShowAuthFlow(true);
      },
      openProfileCompletion: () => {
        setAuthError(null);
        setShowAuthFlow(true);
      },
      openWalletLink: () => {
        setAuthError(null);
        if (!identity.authenticated) {
          setShowAuthFlow(true);
          return;
        }
        if (account.status !== "SIGNED_IN_READY") {
          setShowAuthFlow(true);
          return;
        }
        if (integrityPolicy.financialWallet !== "READY") {
          setAuthError("Financial-wallet linking is paused because unique ownership cannot be verified.");
          return;
        }
        if (account.financialWallet.status !== "NONE") return;
        setShowLinkNewWalletModal(true);
      },
      refreshConnectedWallet,
      getProviderAccountRevision: () => providerAccountRevisionRef.current,
      connectVerifiedWallet: async () => {
        if (!financialWallet) {
          setAuthError(null);
          setShowLinkNewWalletModal(true);
          return { ok: false, reason: "PROVIDER_UNAVAILABLE", activeAccount: null };
        }
        const wallet = findWalletByAddress(
          wallets.filter((candidate) => candidate.connector.isEmbeddedWallet !== true),
          financialWallet,
        );
        if (!wallet) {
          setAuthError("No compatible connector for your verified wallet is available on this device.");
          return { ok: false, reason: "PROVIDER_UNAVAILABLE", activeAccount: null };
        }
        setAuthError(null);
        setBusy(true);
        try {
          const recovery = await reconnectExistingWallet({
            wallet,
            verifiedAddress: financialWallet,
            isPrimary: primaryWallet?.id === wallet.id,
            switchWallet: () => switchWallet(wallet.id),
            onProviderAccount: commitProviderAccount,
          });
          if (!recovery.connected) {
            const reason =
              recovery.reason === "ACCOUNT_SELECTION_REQUIRED" ? "ACCOUNT_SELECTION_REQUIRED" : "PROVIDER_UNAVAILABLE";
            setAuthError(
              reason === "ACCOUNT_SELECTION_REQUIRED"
                ? "Select your verified wallet account in Rabby or MetaMask."
                : "Your verified wallet provider is not connected.",
            );
            return { ok: false, reason, activeAccount: recovery.activeAddress };
          }
          const network = normalizeNetworkChainId(
            await withWalletSessionTimeout(wallet.getNetwork(), undefined, "PROVIDER_NETWORK_TIMEOUT"),
          );
          setActiveNetworkId(network);
          await refreshConnectedWallet();
          return {
            ok: true,
            account: recovery.activeAddress!,
            chainId: network,
            synced: recovery.synced,
            providerRevision: providerAccountRevisionRef.current,
          };
        } catch (error) {
          setAuthError(errorMessage(error));
          const detail = `${typeof error === "object" && error !== null && "code" in error ? String(error.code) : ""} ${
            error instanceof Error ? error.message : String(error)
          }`;
          if (/4001|reject|cancel/iu.test(detail)) {
            return { ok: false, reason: "USER_CANCELLED", activeAccount: providerAccount };
          }
          if (/timeout/iu.test(detail)) return { ok: false, reason: "TIMEOUT", activeAccount: providerAccount };
          return { ok: false, reason: "PROVIDER_UNAVAILABLE", activeAccount: providerAccount };
        } finally {
          setBusy(false);
        }
      },
      confirmCurrentWalletAsFinancial: async () =>
        withBusy(async () => {
          const linkCheck = checkFinancialWalletLink(identity, connectedWallet);
          if (!linkCheck.allowed) throw new Error(linkCheck.code);
          if (!accountIdentity) throw new Error("FINANCIAL_IDENTITY_REQUIRED");
          const metadata = createFinancialWalletMetadataUpdate(accountIdentity, linkCheck.wallet, integrityPolicy);
          await updateUser({
            metadata,
          });
        }, "FINANCIAL_WALLET"),
      saveUsername: async (valueToSave) =>
        withBusy(async () => {
          if (!accountIdentity) throw new Error("FINANCIAL_IDENTITY_REQUIRED");
          const metadata = createUsernameMetadataUpdate(accountIdentity, valueToSave, integrityPolicy);
          await updateUser({ metadata });
        }, "USERNAME"),
      linkX: async () => {
        if (!dynamicXEnabled) throw new Error("X_UNAVAILABLE");
        await withBusy(() => social.linkSocialAccount(twitterProvider));
      },
      unlinkX: async () => {
        if (!dynamicXEnabled) throw new Error("X_UNAVAILABLE");
        await withBusy(() => social.unlinkSocialAccount(twitterProvider));
      },
      signOut: async () =>
        withBusy(async () => {
          setOtpSent(false);
          await handleLogOut();
        }),
      clearAuthError: () => setAuthError(null),
      activeNetworkId,
      refreshActiveNetwork,
      switchFinancialWalletToSepolia: async () => {
        const wallet = providerWallet();
        if (!wallet || !walletsMatch(wallet.address, financialWallet)) throw new Error("FINANCIAL_IDENTITY_REQUIRED");
        if (!wallet.connector.supportsNetworkSwitching()) throw new Error("NETWORK_SWITCH_UNAVAILABLE");
        await withWalletSessionTimeout(
          wallet.connector.switchNetwork({ networkChainId: 11_155_111 }),
          undefined,
          "NETWORK_SWITCH_TIMEOUT",
        );
        const network = await refreshActiveNetwork();
        if (network !== 11_155_111) throw new Error(`WRONG_NETWORK:dynamic-wallet-${network ?? "unknown"}`);
      },
    }),
    [
      authError,
      account,
      accountIdentity,
      clientReady,
      initializationError,
      activeNetworkId,
      activeWalletAddress,
      busy,
      commitProviderAccount,
      connectWithEmail,
      connectedWallet,
      dynamicLinkedWallets,
      dynamicWalletObjectForVerifiedAddress,
      emailVerified,
      financialWallet,
      integrityPolicy,
      handleLogOut,
      identity,
      otpSent,
      readiness,
      retryOneTimePassword,
      sdkHasLoaded,
      social,
      setShowAuthFlow,
      setShowLinkNewWalletModal,
      switchWallet,
      updateUser,
      username,
      verifyOneTimePassword,
      wallets,
      walletAuthenticated,
      canConfirmCurrentWalletAsFinancial,
      withBusy,
      xLinked,
      primaryWallet,
      providerAccount,
      providerAccountRevision,
      providerAccountKnown,
      providerConnected,
      providerWallet,
      refreshActiveNetwork,
      refreshConnectedWallet,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function FixtureAuthState({ children }: { children: ReactNode }) {
  const [authError, setAuthError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<AuthIdentitySnapshot>(
    () => getFixtureIdentity() ?? getFixtureIdentityForFinancialFixture(),
  );
  const readiness = getAuthReadiness(identity);
  const fixtureProfile = useMemo<DynamicAccountProfile | null>(
    () =>
      identity.authenticated
        ? {
            email: identity.emailVerified ? "fixture@example.invalid" : null,
            userId: identity.providerUserId,
            verifiedCredentials: identity.emailVerified ? [{ format: "email" }] : [],
            missingFields: identity.emailVerified && identity.username ? [] : ["fixture-profile-incomplete"],
            metadata: {
              ...(identity.username ? { [LEOPOLD_USERNAME_METADATA_KEY]: identity.username } : {}),
              ...(identity.financialWallet ? { [FINANCIAL_WALLET_METADATA_KEY]: identity.financialWallet } : {}),
            },
          }
        : null,
    [identity],
  );
  const account = useMemo(
    () =>
      deriveAccountState({
        clientReady: true,
        completedUser: identity.emailVerified && identity.username ? fixtureProfile : null,
        incompleteUser: fixtureProfile,
      }),
    [fixtureProfile, identity.emailVerified, identity.username],
  );
  const integrityPolicy = useMemo<AccountIntegrityPolicy>(
    () => ({
      status: "READY",
      username: "READY",
      financialWallet: "READY",
      financialWalletOwnership: "DYNAMIC_VERIFIED_WALLET",
      errors: [],
    }),
    [],
  );
  const value = useMemo<AuthContextValue>(
    () => ({
      clientReady: true,
      hydrationPhase: getAuthHydrationPhase(true),
      initializationError: null,
      account,
      accountStatus: account.status,
      accountAuthentication: account.authentication,
      accountIdentity: account.identity,
      profileStatus: account.profileStatus,
      configured: false,
      fixture: true,
      loading: false,
      authenticated: identity.authenticated,
      email: identity.emailVerified ? "fixture@example.invalid" : null,
      emailVerified: identity.emailVerified,
      username: identity.username,
      providerUserId: identity.providerUserId,
      financialWallet: identity.financialWallet,
      verifiedFinancialWallet: identity.financialWallet,
      financialWalletMetadata: account.financialWallet,
      integrityPolicy,
      connectedWallet: identity.connectedWallet,
      activeWalletAddress: identity.connectedWallet,
      dynamicPrimaryWallet: identity.connectedWallet,
      dynamicLinkedWallets: identity.financialWallet
        ? [{ id: "fixture-wallet", address: identity.financialWallet }]
        : [],
      dynamicWalletObjectForVerifiedAddress: identity.financialWallet
        ? { id: "fixture-wallet", address: identity.financialWallet }
        : null,
      providerActiveAccount: identity.connectedWallet,
      providerAccountRevision: 0,
      providerAccountKnown: true,
      providerConnected: Boolean(identity.connectedWallet),
      providerAvailable: Boolean(identity.financialWallet),
      walletAuthenticated: identity.walletAuthenticated,
      canConfirmCurrentWalletAsFinancial:
        account.status === "SIGNED_IN_READY" &&
        account.financialWallet.status === "NONE" &&
        Boolean(identity.connectedWallet && identity.walletAuthenticated),
      readiness,
      identity,
      identityKey: [identity.providerUserId, identity.financialWallet, identity.connectedWallet, readiness].join(":"),
      authError,
      xEnabled: false,
      xLinked: false,
      otpSent: false,
      requestEmailOtp: async () => {
        setAuthError("Fixture authentication does not send real email.");
      },
      verifyEmailOtp: async () => undefined,
      resendEmailOtp: async () => undefined,
      openWalletAuthentication: () => undefined,
      openProfileCompletion: () => undefined,
      openWalletLink: () => undefined,
      refreshConnectedWallet: async () => identity.connectedWallet,
      getProviderAccountRevision: () => 0,
      connectVerifiedWallet: async () =>
        identity.connectedWallet
          ? { ok: true, account: identity.connectedWallet, chainId: 11_155_111, synced: false, providerRevision: 0 }
          : { ok: false, reason: "PROVIDER_UNAVAILABLE", activeAccount: null },
      confirmCurrentWalletAsFinancial: async () => undefined,
      saveUsername: async () => undefined,
      linkX: async () => {
        setAuthError("X is not enabled in the fixture.");
      },
      unlinkX: async () => undefined,
      signOut: async () => {
        setIdentity({
          authenticated: false,
          emailVerified: false,
          username: null,
          providerUserId: null,
          financialWallet: null,
          connectedWallet: null,
          walletAuthenticated: false,
        });
      },
      clearAuthError: () => setAuthError(null),
      activeNetworkId: null,
      refreshActiveNetwork: async () => null,
      switchFinancialWalletToSepolia: async () => undefined,
    }),
    [account, authError, identity, integrityPolicy, readiness],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function getFixtureIdentityForFinancialFixture(): AuthIdentitySnapshot {
  return {
    authenticated: fixtureFinancialEnabled,
    emailVerified: fixtureFinancialEnabled,
    username: fixtureFinancialEnabled ? "fixture_user" : null,
    providerUserId: fixtureFinancialEnabled ? "fixture-financial-user" : null,
    financialWallet: fixtureFinancialEnabled ? fixtureWalletA : null,
    connectedWallet: fixtureFinancialEnabled ? fixtureWalletA : null,
    walletAuthenticated: fixtureFinancialEnabled,
  };
}

export function AuthProvider({ children, configured }: { children: ReactNode; configured: boolean }) {
  return configured ? <DynamicAuthState>{children}</DynamicAuthState> : <FixtureAuthState>{children}</FixtureAuthState>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
