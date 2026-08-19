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
import { useAccount } from "wagmi";
import {
  useConnectWithOtp,
  useDynamicContext,
  useDynamicEvents,
  useDynamicModals,
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
import { canonicalizeUsername } from "@/lib/auth/username";
import { normalizeNetworkChainId } from "@/lib/leopold/network";
import { getAuthHydrationPhase } from "@/lib/auth/hydration";
import { reconnectExistingWallet } from "@/lib/auth/wallet-recovery";

const FINANCIAL_WALLET_METADATA_KEY = "leopoldFinancialWallet";
// Dynamic custom fields are stored in user.metadata under the configured
// field name. The built-in Dynamic username field is intentionally disabled.
const LEOPOLD_USERNAME_METADATA_KEY = "Leopold Username";
const twitterProvider = "twitter" as Parameters<ReturnType<typeof useSocialAccounts>["isLinked"]>[0];
const fixtureFinancialEnabled =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_LEOPOLD_DEV_FIXTURE === "1";
const noClientHydrationSubscription = () => () => undefined;
const clientMountedSnapshot = () => true;
const serverMountedSnapshot = () => false;

export type AuthContextValue = {
  clientReady: boolean;
  hydrationPhase: ReturnType<typeof getAuthHydrationPhase>;
  configured: boolean;
  fixture: boolean;
  loading: boolean;
  authenticated: boolean;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  providerUserId: string | null;
  financialWallet: Address | null;
  connectedWallet: Address | null;
  activeWalletAddress: Address | null;
  dynamicPrimaryWallet: Address | null;
  dynamicLinkedWallets: readonly DynamicWalletDescriptor[];
  dynamicWalletObjectForVerifiedAddress: DynamicWalletDescriptor | null;
  providerActiveAccount: Address | null;
  providerAccountKnown: boolean;
  providerConnected: boolean;
  walletAuthenticated: boolean;
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
  openWalletLink(): void;
  refreshConnectedWallet(): Promise<Address | null>;
  reconnectFinancialWallet(): Promise<void>;
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

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown): string {
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

function readMetadata(user: ReturnType<typeof useDynamicContext>["user"]): Record<string, unknown> {
  if (!user?.metadata || typeof user.metadata !== "object") return {};
  return user.metadata as Record<string, unknown>;
}

function hasVerifiedEmail(user: ReturnType<typeof useDynamicContext>["user"]): boolean {
  return Boolean(user?.verifiedCredentials?.some((credential) => credential.format === "email"));
}

type InjectedProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

function getInjectedProvider(): InjectedProvider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as unknown as { ethereum?: InjectedProvider }).ethereum;
  return provider?.request ? provider : null;
}

function DynamicAuthState({ children }: { children: ReactNode }) {
  const { user, sdkHasLoaded, handleLogOut, setShowAuthFlow, primaryWallet } = useDynamicContext();
  const { connectWithEmail, verifyOneTimePassword, retryOneTimePassword } = useConnectWithOtp();
  const { setShowLinkNewWalletModal } = useDynamicModals();
  const switchWallet = useSwitchWallet();
  const { updateUser } = useUserUpdateRequest();
  const wallets = useUserWallets();
  const social = useSocialAccounts();
  const account = useAccount();
  const [otpSent, setOtpSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountConflict, setAccountConflict] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [activeNetworkId, setActiveNetworkId] = useState<number | null>(null);
  const [providerAccount, setProviderAccount] = useState<Address | null>(null);
  const [providerAccountKnown, setProviderAccountKnown] = useState(false);
  const providerReadRevisionRef = useRef(0);
  const networkReadRevisionRef = useRef(0);
  const clientMounted = useSyncExternalStore(
    noClientHydrationSubscription,
    clientMountedSnapshot,
    serverMountedSnapshot,
  );

  const clientReady = clientMounted && sdkHasLoaded;

  const financialWallet = normalizeWalletAddress(String(readMetadata(user)[FINANCIAL_WALLET_METADATA_KEY] ?? ""));
  const wagmiConnectedWallet = normalizeWalletAddress(account.address);
  const connectedWallet = providerAccountKnown ? providerAccount : wagmiConnectedWallet;
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
  const providerConnected = providerAccountKnown && Boolean(providerAccount);
  const dynamicWalletObjectForVerifiedAddress = findWalletByAddress(
    wallets.filter((wallet) => wallet.connector.isEmbeddedWallet !== true),
    financialWallet,
  );
  const emailVerified = hasVerifiedEmail(user);
  let username: string | null = null;
  const configuredUsername = readMetadata(user)[LEOPOLD_USERNAME_METADATA_KEY];
  if (typeof configuredUsername === "string") {
    try {
      username = canonicalizeUsername(configuredUsername);
    } catch {
      username = null;
    }
  }
  const identity = useMemo<AuthIdentitySnapshot>(
    () => ({
      authenticated: Boolean(user),
      emailVerified,
      username,
      providerUserId: user?.userId ?? null,
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
      user,
      username,
      walletAuthenticated,
    ],
  );
  const readiness = getAuthReadiness(identity);
  const xLinked = dynamicXEnabled && social.isLinked(twitterProvider);

  const providerWallet = useCallback(() => {
    if (primaryWallet && primaryWallet.connector.isEmbeddedWallet !== true) return primaryWallet;
    return findWalletByAddress(
      wallets.filter((wallet) => wallet.connector.isEmbeddedWallet !== true),
      financialWallet,
    );
  }, [financialWallet, primaryWallet, wallets]);

  const readProviderAccount = useCallback(async (wallet: typeof primaryWallet): Promise<Address | null> => {
    const revision = ++providerReadRevisionRef.current;
    if (!wallet || wallet.connector.isEmbeddedWallet === true) {
      if (revision !== providerReadRevisionRef.current) return null;
      setProviderAccount(null);
      setProviderAccountKnown(true);
      return null;
    }
    try {
      const [accountAddress] = await wallet.connector.getConnectedAccounts();
      const next = normalizeWalletAddress(accountAddress ?? null);
      if (revision !== providerReadRevisionRef.current) return null;
      setProviderAccount(next);
      setProviderAccountKnown(true);
      return next;
    } catch {
      if (revision !== providerReadRevisionRef.current) return null;
      setProviderAccount(null);
      setProviderAccountKnown(true);
      return null;
    }
  }, []);

  const refreshConnectedWallet = useCallback(async (): Promise<Address | null> => {
    return readProviderAccount(providerWallet());
  }, [providerWallet, readProviderAccount]);

  useEffect(() => {
    if (!clientReady) return;
    const timeout = window.setTimeout(() => {
      setProviderAccountKnown(false);
      void refreshConnectedWallet();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [clientReady, refreshConnectedWallet]);

  useEffect(() => {
    const observedConnectors = Array.from(
      new Set(
        [
          primaryWallet?.connector,
          ...wallets.filter((wallet) => wallet.connector.isEmbeddedWallet !== true).map((wallet) => wallet.connector),
        ].filter(Boolean),
      ),
    );
    const onAccountChange = ({ accounts }: { accounts: string[] }) => {
      ++providerReadRevisionRef.current;
      const next = normalizeWalletAddress(accounts[0] ?? null);
      setProviderAccount(next);
      setProviderAccountKnown(true);
    };
    const onDisconnect = () => {
      ++providerReadRevisionRef.current;
      setProviderAccount(null);
      setProviderAccountKnown(true);
    };
    const onChainChange = (network: unknown) => {
      const next = normalizeNetworkChainId(network);
      setActiveNetworkId(next);
    };
    for (const connector of observedConnectors) {
      if (!connector) continue;
      connector.on("accountChange", onAccountChange);
      connector.on("disconnect", onDisconnect);
      connector.on("chainChange", onChainChange);
    }
    return () => {
      for (const connector of observedConnectors) {
        if (!connector) continue;
        connector.off("accountChange", onAccountChange);
        connector.off("disconnect", onDisconnect);
        connector.off("chainChange", onChainChange);
      }
    };
  }, [primaryWallet, wallets]);

  const refreshActiveNetwork = useCallback(async (): Promise<number | null> => {
    const revision = ++networkReadRevisionRef.current;
    if (!primaryWallet) {
      if (revision !== networkReadRevisionRef.current) return null;
      setActiveNetworkId(null);
      return null;
    }
    const next = normalizeNetworkChainId(await primaryWallet.connector.getNetwork());
    if (revision !== networkReadRevisionRef.current) return next;
    setActiveNetworkId(next);
    return next;
  }, [primaryWallet]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshActiveNetwork().catch(() => setActiveNetworkId(null));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refreshActiveNetwork]);

  useDynamicEvents("primaryWalletNetworkChanged", (network) => {
    setActiveNetworkId(normalizeNetworkChainId(network));
  });
  useDynamicEvents("primaryWalletChanged", () => {
    void refreshActiveNetwork().catch(() => setActiveNetworkId(null));
    void refreshConnectedWallet();
  });

  const withBusy = useCallback(async (operation: () => Promise<void>) => {
    setAuthError(null);
    setAccountConflict(false);
    setSessionExpired(false);
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      setAuthError(errorMessage(error));
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
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      clientReady,
      hydrationPhase: getAuthHydrationPhase(clientReady),
      configured: true,
      fixture: false,
      loading: !sdkHasLoaded || busy,
      authenticated: identity.authenticated,
      email: user?.email ?? null,
      emailVerified,
      username,
      providerUserId: identity.providerUserId,
      financialWallet,
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
      providerAccountKnown,
      providerConnected,
      walletAuthenticated,
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
      openWalletLink: () => {
        setAuthError(null);
        if (!identity.authenticated) {
          setShowAuthFlow(true);
          return;
        }
        setShowLinkNewWalletModal(true);
      },
      refreshConnectedWallet,
      reconnectFinancialWallet: async () => {
        if (!financialWallet) {
          setAuthError(null);
          setShowLinkNewWalletModal(true);
          return;
        }
        const wallet = findWalletByAddress(
          wallets.filter((candidate) => candidate.connector.isEmbeddedWallet !== true),
          financialWallet,
        );
        if (!wallet) {
          const provider = getInjectedProvider();
          if (!provider) {
            setAuthError("No compatible wallet provider is available. Open Rabby or MetaMask, then retry.");
            return;
          }
          await withBusy(async () => {
            const requestedAccounts = await provider.request({ method: "eth_requestAccounts" });
            if (
              Array.isArray(requestedAccounts) &&
              requestedAccounts.some(
                (candidate) => typeof candidate === "string" && walletsMatch(candidate, financialWallet),
              )
            ) {
              setAuthError(null);
              return;
            }
            setAuthError(
              "Select your verified wallet account in Rabby or MetaMask, then click Reconnect verified wallet.",
            );
          });
          return;
        }
        await withBusy(async () => {
          const recovery = await reconnectExistingWallet({
            wallet,
            verifiedAddress: financialWallet,
            isPrimary: primaryWallet?.id === wallet.id,
            switchWallet: () => switchWallet(wallet.id),
            onProviderAccount: (address) => {
              setProviderAccount(address);
              setProviderAccountKnown(true);
            },
          });
          if (!recovery.connected) {
            setAuthError(
              "Select your verified wallet account in Rabby or MetaMask, then click Reconnect verified wallet.",
            );
            return;
          }
          const network = normalizeNetworkChainId(await wallet.getNetwork());
          setActiveNetworkId(network);
          await refreshConnectedWallet();
        });
      },
      confirmCurrentWalletAsFinancial: async () =>
        withBusy(async () => {
          const linkCheck = checkFinancialWalletLink(identity, connectedWallet);
          if (!linkCheck.allowed) throw new Error(linkCheck.code);
          const metadata = readMetadata(user);
          await updateUser({
            metadata: { ...metadata, [FINANCIAL_WALLET_METADATA_KEY]: linkCheck.wallet },
          });
        }),
      saveUsername: async (valueToSave) =>
        withBusy(async () => {
          const normalized = canonicalizeUsername(valueToSave);
          const metadata = readMetadata(user);
          await updateUser({ metadata: { ...metadata, [LEOPOLD_USERNAME_METADATA_KEY]: normalized } });
        }),
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
        if (!primaryWallet) throw new Error("FINANCIAL_IDENTITY_REQUIRED");
        if (!primaryWallet.connector.supportsNetworkSwitching()) throw new Error("NETWORK_SWITCH_UNAVAILABLE");
        await primaryWallet.connector.switchNetwork({ networkChainId: 11_155_111 });
        const network = await refreshActiveNetwork();
        if (network !== 11_155_111) throw new Error(`WRONG_NETWORK:dynamic-wallet-${network ?? "unknown"}`);
      },
    }),
    [
      authError,
      clientReady,
      activeNetworkId,
      activeWalletAddress,
      busy,
      connectWithEmail,
      connectedWallet,
      dynamicLinkedWallets,
      dynamicWalletObjectForVerifiedAddress,
      emailVerified,
      financialWallet,
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
      user,
      username,
      verifyOneTimePassword,
      wallets,
      walletAuthenticated,
      withBusy,
      xLinked,
      primaryWallet,
      providerAccount,
      providerAccountKnown,
      providerConnected,
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
  const value = useMemo<AuthContextValue>(
    () => ({
      clientReady: true,
      hydrationPhase: getAuthHydrationPhase(true),
      configured: false,
      fixture: true,
      loading: false,
      authenticated: identity.authenticated,
      email: identity.emailVerified ? "fixture@example.invalid" : null,
      emailVerified: identity.emailVerified,
      username: identity.username,
      providerUserId: identity.providerUserId,
      financialWallet: identity.financialWallet,
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
      providerAccountKnown: true,
      providerConnected: Boolean(identity.connectedWallet),
      walletAuthenticated: identity.walletAuthenticated,
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
      openWalletLink: () => undefined,
      refreshConnectedWallet: async () => identity.connectedWallet,
      reconnectFinancialWallet: async () => undefined,
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
    [authError, identity, readiness],
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
