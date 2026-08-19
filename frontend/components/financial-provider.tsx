"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatEther, type Address } from "viem";
import { useBalance, usePublicClient, useWalletClient } from "wagmi";

import {
  claimBondRefund,
  claimSettlementRewards,
  closeExpiredRound,
  enterPrizeRound,
  getTestUsdc,
  makePrivate,
  materializeEligibility,
  requestMakePublic,
  savePrivately,
  withdrawSavings,
  type ActionClients,
} from "@/lib/leopold/actions";
import { formatUsdcAmount, parseUsdcAmount } from "@/lib/leopold/amounts";
import {
  CANONICAL_USDC,
  LEOPOLD_CHAIN_ID,
  getVaultConfig,
  leopoldConfig,
  requireConfiguredAddress,
  type VaultId,
} from "@/lib/leopold/config";
import { getPublicReadAccount } from "@/lib/leopold/network";
import { classifyLeopoldError, sanitizeTechnicalDetail, type LeopoldError } from "@/lib/leopold/errors";
import {
  readPrivateHandle,
  readUsdcBalance,
  getEffectiveVaultRoundStatus,
  canPrepareVaultWithdrawal,
  readVaultPublicState,
  validateConfiguredDeployment,
  type VaultPublicState,
} from "@/lib/leopold/reads";
import {
  loadSafeTransactions,
  persistSafeTransaction,
  transactionStageLabel,
  type TransactionStage,
} from "@/lib/leopold/transactions";
import {
  privateBalanceDiagnostic as buildPrivateBalanceDiagnostic,
  readCurrentPrivateBalanceHandle,
  revealPrivateBalanceFromCurrentHandle,
  type PrivateBalanceIdentity,
  type PrivateBalanceRevealStage,
  type PrivateBalanceStatus,
} from "@/lib/leopold/private-balance";
import { clearPrivateSession, decryptPrivateValue } from "@/lib/leopold/zama";
import { useAuth } from "@/components/auth-provider";
import { financialControlsEnabled } from "@/lib/auth/hydration";
import { useWalletIdentity } from "@/components/wallet-identity-provider";
import type { WalletRpcHealth } from "@/lib/auth/wallet-identity";
import { prepareWithdrawalRound } from "@/lib/leopold/withdrawal";

export type ActivityItem = { id: string; label: string; status: "Confirmed" | "Processing"; vault?: string };

type FinancialContextValue = {
  fixture: boolean;
  connected: boolean;
  connecting: boolean;
  networkHealth: WalletRpcHealth;
  walletChainId: number | null;
  account: Address | null;
  accountLabel: string;
  usdcBalance: bigint | null;
  privateBalance: bigint | null;
  privateBalanceRevealed: boolean;
  privateBalanceHandle: `0x${string}` | null;
  privateBalanceStatus: PrivateBalanceStatus;
  privateBalanceDiagnostic: string | null;
  vaultPositions: Partial<Record<VaultId, bigint>>;
  revealedVaults: Set<VaultId>;
  enteredVaults: Set<VaultId>;
  privateResults: Partial<Record<VaultId, bigint>>;
  revealedResults: Set<VaultId>;
  privateEligibility: Partial<Record<VaultId, bigint>>;
  txStage: TransactionStage;
  txLabel: string;
  txErrorStage: TransactionStage | null;
  error: LeopoldError | null;
  activity: ActivityItem[];
  publicVaultState: Partial<Record<VaultId, VaultPublicState>>;
  latestBlockTimestamp: bigint | null;
  authState: ReturnType<typeof useAuth>["readiness"];
  financialAuthorized: boolean;
  financialActionsEnabled: boolean;
  connectWallet(): Promise<void>;
  disconnectWallet(): void;
  switchToSepolia(): Promise<void>;
  retryNetworkHealth(): Promise<void>;
  refresh(): Promise<void>;
  acquireUsdc(): Promise<void>;
  makePrivate(amount: string): Promise<void>;
  revealPrivateBalance(): Promise<void>;
  hidePrivateBalance(): void;
  save(vault: VaultId, amount: string): Promise<void>;
  revealVault(vault: VaultId): Promise<void>;
  hideVault(vault: VaultId): void;
  enterRound(vault: VaultId): Promise<void>;
  revealResult(vault: VaultId): Promise<void>;
  revealEligibility(vault: VaultId): Promise<void>;
  withdraw(vault: VaultId, amount: string): Promise<void>;
  makePublic(amount: string): Promise<void>;
  claimRefund(vault: VaultId): Promise<void>;
  claimRewards(vault: VaultId): Promise<void>;
};

const FinancialContext = createContext<FinancialContextValue | null>(null);
const fixtureEnabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_LEOPOLD_DEV_FIXTURE === "1";
const fixtureAccount = "0x7E57a10D00000000000000000000000000000001" as Address;
export function FinancialProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const publicClient = usePublicClient({ chainId: LEOPOLD_CHAIN_ID });
  const walletClient = useWalletClient({ chainId: LEOPOLD_CHAIN_ID });
  const [fixtureConnected, setFixtureConnected] = useState(false);
  const [fixtureChain, setFixtureChain] = useState(1);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(fixtureEnabled ? 0n : null);
  const [privateBalance, setPrivateBalance] = useState<bigint | null>(null);
  const [privateBalanceRevealed, setPrivateBalanceRevealed] = useState(false);
  const [privateBalanceHandle, setPrivateBalanceHandle] = useState<`0x${string}` | null>(null);
  const [privateBalanceStatus, setPrivateBalanceStatus] = useState<PrivateBalanceStatus>("UNREAD");
  const [privateBalanceDiagnostic, setPrivateBalanceDiagnostic] = useState<string | null>(null);
  const [vaultPositions, setVaultPositions] = useState<Partial<Record<VaultId, bigint>>>({});
  const [revealedVaults, setRevealedVaults] = useState<Set<VaultId>>(new Set());
  const [enteredVaults, setEnteredVaults] = useState<Set<VaultId>>(new Set());
  const [privateResults, setPrivateResults] = useState<Partial<Record<VaultId, bigint>>>({});
  const [revealedResults, setRevealedResults] = useState<Set<VaultId>>(new Set());
  const [privateEligibility, setPrivateEligibility] = useState<Partial<Record<VaultId, bigint>>>({});
  const [publicVaultState, setPublicVaultState] = useState<Partial<Record<VaultId, VaultPublicState>>>({});
  const [latestBlockTimestamp, setLatestBlockTimestamp] = useState<bigint | null>(null);
  const [txStage, setTxStage] = useState<TransactionStage>("ready");
  const [txErrorStage, setTxErrorStage] = useState<TransactionStage | null>(null);
  const [error, setError] = useState<LeopoldError | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [deploymentVerified, setDeploymentVerified] = useState(false);
  const walletClientRef = useRef(walletClient.data);
  const publicClientRef = useRef(publicClient);
  const accountRef = useRef<Address | null>(null);
  const walletClientId = walletClient.data?.uid ?? null;

  const connected = fixtureEnabled
    ? fixtureConnected
    : walletIdentity.walletSession.status === "CONNECTED" || walletIdentity.walletSession.status === "WRONG_NETWORK";
  const connecting = fixtureEnabled ? false : walletIdentity.walletSession.status === "CONNECTING";
  const account = fixtureEnabled ? (fixtureConnected ? fixtureAccount : null) : walletIdentity.walletSession.address;

  useEffect(() => {
    walletClientRef.current = walletClient.data;
    publicClientRef.current = publicClient;
    accountRef.current = account;
  }, [account, publicClient, walletClient.data]);
  const networkHealth = walletIdentity.networkHealth;
  const walletChainId = fixtureEnabled ? fixtureChain : walletIdentity.walletSession.chainId;
  const financialAuthorized =
    fixtureEnabled || financialControlsEnabled(auth.clientReady, walletIdentity.walletSession.status === "CONNECTED");
  const financialActionsEnabled =
    fixtureEnabled || (financialAuthorized && walletIdentity.walletSession.canUseFinancialActions);

  const ensureWalletIdentityReady = useCallback(async () => {
    try {
      await walletIdentity.requireConnectedFinancialSession();
    } catch (caught) {
      setError(classifyLeopoldError(caught));
      throw caught;
    }
  }, [walletIdentity]);

  const ensureFinancialAccess = ensureWalletIdentityReady;
  const ensurePrivateRevealAccess = useCallback(async () => {
    await ensureWalletIdentityReady();
    clearPrivateSession();
  }, [ensureWalletIdentityReady]);

  const ethBalance = useBalance({
    address: fixtureEnabled ? undefined : (account ?? undefined),
    chainId: LEOPOLD_CHAIN_ID,
    query: { enabled: !fixtureEnabled && Boolean(account) },
  });

  const clients = useCallback(
    (onHash?: ActionClients["onHash"], requireEthereum = true, onStage?: ActionClients["onStage"]): ActionClients => {
      const ethereum =
        typeof window !== "undefined"
          ? (window as unknown as { ethereum?: ActionClients["ethereum"] }).ethereum
          : undefined;
      if (!publicClient || !walletClient.data || !account) throw new Error("UNSUPPORTED_WALLET");
      if (requireEthereum && !ethereum) throw new Error("UNSUPPORTED_WALLET:ethereum-provider-required");
      // The faucet only needs the Dynamic/Wagmi wallet client. Keep the
      // provider requirement for Zama actions, but do not reject a valid
      // WalletConnect/Dynamic signer merely because window.ethereum is absent.
      const fallbackEthereum = ethereum ?? {
        request: async () => {
          throw new Error("UNSUPPORTED_WALLET:ethereum-provider-required");
        },
      };
      return { publicClient, walletClient: walletClient.data, ethereum: fallbackEthereum, account, onHash, onStage };
    },
    [account, publicClient, walletClient.data],
  );

  const readLiveVaultRound = useCallback(async (vaultSlug: VaultId, liveClients: ActionClients) => {
    const vault = getVaultConfig(vaultSlug);
    if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
    const latestBlock = await liveClients.publicClient.getBlock();
    const liveState = await readVaultPublicState(
      liveClients.publicClient,
      vault,
      liveClients.account,
      latestBlock.number,
    );
    setPublicVaultState((states) => ({ ...states, [vaultSlug]: liveState }));
    setLatestBlockTimestamp(latestBlock.timestamp);
    return { vault, state: liveState, blockTimestamp: latestBlock.timestamp };
  }, []);

  const requireLiveOpenRound = useCallback(
    async (vaultSlug: VaultId, liveClients: ActionClients) => {
      const { vault, state, blockTimestamp } = await readLiveVaultRound(vaultSlug, liveClients);
      if (!getEffectiveVaultRoundStatus(state, blockTimestamp).depositOpen) {
        throw new Error(`ROUND_CLOSED:${vault.name}:${state.roundId.toString()}`);
      }
      return state;
    },
    [readLiveVaultRound],
  );

  const currentPrivateBalanceClients = useCallback(() => {
    const currentAccount = accountRef.current;
    const currentPublicClient = publicClientRef.current;
    const currentWalletClient = walletClientRef.current;
    const ethereum =
      typeof window !== "undefined"
        ? (window as unknown as { ethereum?: ActionClients["ethereum"] }).ethereum
        : undefined;
    if (!currentAccount || !currentPublicClient || !currentWalletClient) throw new Error("UNSUPPORTED_WALLET");
    const fallbackEthereum = ethereum ?? {
      request: async () => {
        throw new Error("UNSUPPORTED_WALLET:ethereum-provider-required");
      },
    };
    return {
      publicClient: currentPublicClient,
      walletClient: currentWalletClient,
      ethereum: fallbackEthereum,
      account: currentAccount,
    };
  }, []);

  const privateRevealRunRef = useRef(0);

  const invalidatePrivateBalance = useCallback((status: PrivateBalanceStatus = "UNREAD") => {
    ++privateRevealRunRef.current;
    setPrivateBalanceHandle(null);
    setPrivateBalance(null);
    setPrivateBalanceRevealed(false);
    setPrivateBalanceStatus(status);
    setPrivateBalanceDiagnostic(null);
    clearPrivateSession();
  }, []);

  const refreshPrivateBalanceHandle = useCallback(async () => {
    const runId = ++privateRevealRunRef.current;
    if (fixtureEnabled) {
      setPrivateBalanceHandle(null);
      setPrivateBalanceRevealed(false);
      setPrivateBalanceStatus("NOT_REVEALED");
      setPrivateBalanceDiagnostic(null);
      return null;
    }
    if (!financialAuthorized || !accountRef.current || !publicClientRef.current || !walletClientRef.current) {
      invalidatePrivateBalance();
      return null;
    }
    const token = requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC");
    setPrivateBalanceStatus("READING_HANDLE");
    try {
      const identity = await readCurrentPrivateBalanceHandle(currentPrivateBalanceClients(), token);
      if (runId !== privateRevealRunRef.current) return null;
      setPrivateBalanceHandle(identity.handle);
      setPrivateBalance(null);
      setPrivateBalanceRevealed(false);
      setPrivateBalanceStatus("NOT_REVEALED");
      setPrivateBalanceDiagnostic(
        buildPrivateBalanceDiagnostic({
          chainId: identity.chainId,
          account: identity.account,
          token: identity.token,
          handle: identity.handle,
          stage: "HANDLE_READ",
        }),
      );
      return identity;
    } catch (caught) {
      if (runId !== privateRevealRunRef.current) return null;
      setPrivateBalanceHandle(null);
      setPrivateBalance(null);
      setPrivateBalanceRevealed(false);
      setPrivateBalanceStatus("REVEAL_FAILED");
      setPrivateBalanceDiagnostic(
        buildPrivateBalanceDiagnostic({
          chainId: walletChainId,
          account: accountRef.current,
          token,
          handle: null,
          stage: "READ",
          error: sanitizeTechnicalDetail(caught),
        }),
      );
      setError(classifyLeopoldError(caught));
      return null;
    }
  }, [financialAuthorized, currentPrivateBalanceClients, invalidatePrivateBalance, walletChainId]);

  const addActivity = useCallback((label: string, vault?: string) => {
    setActivity((items) =>
      [{ id: crypto.randomUUID(), label, status: "Confirmed" as const, vault }, ...items].slice(0, 12),
    );
  }, []);
  const requireVerified = useCallback(() => {
    if (!fixtureEnabled && !deploymentVerified)
      throw new Error("CONFIGURATION_MISSING:deployment integrity not verified");
  }, [deploymentVerified]);

  const execute = useCallback(
    async (
      kind: string,
      action: (
        onHash: NonNullable<ActionClients["onHash"]>,
        onStage: NonNullable<ActionClients["onStage"]>,
      ) => Promise<unknown>,
      completesAfterReceipt = true,
    ) => {
      setError(null);
      setTxErrorStage(null);
      setTxStage("wallet");
      const transactionId = crypto.randomUUID();
      let latestHash: `0x${string}` | undefined;
      let activeStage: TransactionStage = "wallet";
      const persistStage = (stage: TransactionStage, hash?: `0x${string}`, errorStage?: TransactionStage) => {
        if (!account || fixtureEnabled) return;
        if (hash) latestHash = hash;
        persistSafeTransaction({
          id: transactionId,
          kind,
          hash: hash ?? latestHash,
          chainId: LEOPOLD_CHAIN_ID,
          account,
          stage,
          errorStage,
          updatedAt: Date.now(),
        });
      };
      const onStage: NonNullable<ActionClients["onStage"]> = (stage) => {
        activeStage = stage;
        setTxStage(stage);
      };
      try {
        await ensureFinancialAccess();
        persistStage("wallet");
        await action((hash) => {
          setTxStage("submitted");
          activeStage = "submitted";
          persistStage("submitted", hash);
          window.setTimeout(() => setTxStage("confirming"), 0);
        }, onStage);
        await refreshPrivateBalanceHandle();
        setTxStage("private");
        activeStage = "private";
        if (completesAfterReceipt) {
          setTxStage("complete");
        }
        persistStage(completesAfterReceipt ? "complete" : "private");
        void walletIdentity.retryNetworkHealth();
      } catch (caught) {
        setError(classifyLeopoldError(caught));
        setTxErrorStage(activeStage);
        setTxStage("failed");
        persistStage("failed", undefined, activeStage);
        throw caught;
      }
    },
    [account, ensureFinancialAccess, refreshPrivateBalanceHandle, walletIdentity],
  );

  const publicReadAccount = getPublicReadAccount(walletIdentity.walletSession.verifiedAddress, account);
  const refresh = useCallback(async () => {
    if (!publicReadAccount) return;
    if (fixtureEnabled) return;
    if (!publicClient) return;
    try {
      const latestBlock = await publicClient.getBlock();
      setUsdcBalance(await readUsdcBalance(publicClient, CANONICAL_USDC, publicReadAccount));
      if (leopoldConfig.ready) {
        await validateConfiguredDeployment(publicClient, leopoldConfig);
        setDeploymentVerified(true);
        const states = await Promise.all(
          leopoldConfig.vaults.map(
            async (vault) =>
              [
                vault.slug,
                await readVaultPublicState(publicClient, vault, publicReadAccount, latestBlock.number),
              ] as const,
          ),
        );
        setPublicVaultState(Object.fromEntries(states));
        setEnteredVaults(new Set(states.filter(([, state]) => state.entered).map(([slug]) => slug)));
      }
      setLatestBlockTimestamp(latestBlock.timestamp);
    } catch (caught) {
      if (networkHealth.state === "HEALTHY" && financialAuthorized) setError(classifyLeopoldError(caught));
    }
  }, [financialAuthorized, networkHealth.state, publicClient, publicReadAccount]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (fixtureEnabled && !auth.authenticated) setFixtureConnected(false);
      invalidatePrivateBalance();
      setVaultPositions({});
      setRevealedVaults(new Set());
      setPrivateResults({});
      setRevealedResults(new Set());
      setPrivateEligibility({});
      if (walletIdentity.walletSession.verifiedAddress) {
        const labels: Record<string, string> = {
          "get-test-usdc": "Received test USDC",
          "make-private": "Made USDC private",
          save: "Saved privately",
          "enter-round": "Entered prize round",
          withdraw: "Withdrew savings",
          "make-public": "Requested public USDC",
          "claim-refund": "Claimed bond refund",
          "claim-reward": "Claimed settlement reward",
        };
        setActivity(
          loadSafeTransactions(walletIdentity.walletSession.verifiedAddress).map((item) => ({
            id: item.id,
            label: labels[item.kind] ?? "Leopold transaction",
            status: item.stage === "complete" ? "Confirmed" : "Processing",
          })),
        );
      } else setActivity([]);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [
    auth.authenticated,
    auth.identityKey,
    invalidatePrivateBalance,
    walletIdentity.walletSession.epoch,
    walletIdentity.walletSession.status,
    walletIdentity.walletSession.verifiedAddress,
    walletChainId,
    walletClientId,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    if (!financialAuthorized || !account || walletIdentity.walletSession.status !== "CONNECTED") return;
    const timeout = window.setTimeout(() => {
      void refreshPrivateBalanceHandle();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [account, financialAuthorized, refreshPrivateBalanceHandle, walletClientId, walletIdentity.walletSession.status]);

  const value = useMemo<FinancialContextValue>(
    () => ({
      fixture: fixtureEnabled,
      connected,
      connecting,
      networkHealth,
      walletChainId,
      account,
      accountLabel: account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Not connected",
      usdcBalance,
      privateBalance,
      privateBalanceRevealed,
      privateBalanceHandle,
      privateBalanceStatus,
      privateBalanceDiagnostic,
      vaultPositions,
      revealedVaults,
      enteredVaults,
      privateResults,
      revealedResults,
      privateEligibility,
      txStage,
      txLabel:
        txStage === "failed" && txErrorStage
          ? `Failed during ${transactionStageLabel[txErrorStage]}`
          : transactionStageLabel[txStage],
      txErrorStage,
      error,
      activity,
      publicVaultState,
      latestBlockTimestamp,
      authState: auth.readiness,
      financialAuthorized,
      financialActionsEnabled,
      connectWallet: async () => {
        setError(null);
        try {
          if (fixtureEnabled) {
            setFixtureConnected(true);
            return;
          }
          if (!auth.configured) throw new Error("AUTH_CONFIGURATION_REQUIRED");
          if (!auth.authenticated) auth.openWalletAuthentication();
          else if (!auth.financialWallet) auth.openWalletLink();
          else {
            const result = await walletIdentity.connectVerifiedWallet();
            if (!result.ok && result.state !== "CONNECTING") throw new Error(`WALLET_SESSION:${result.reason}`);
          }
          return;
        } catch (caught) {
          setError(classifyLeopoldError(caught));
          throw caught;
        }
      },
      disconnectWallet: () => {
        if (fixtureEnabled) setFixtureConnected(false);
        else walletIdentity.disconnectLeopoldWallet();
      },
      switchToSepolia: async () => {
        try {
          if (fixtureEnabled) {
            setFixtureChain(LEOPOLD_CHAIN_ID);
            return;
          }
          const result = await walletIdentity.switchToSepolia();
          if (!result.ok) throw new Error(`WALLET_IDENTITY:${result.reason}`);
        } catch (caught) {
          setError(classifyLeopoldError(caught));
          throw caught;
        }
      },
      retryNetworkHealth: async () => {
        await walletIdentity.retryNetworkHealth();
      },
      refresh,
      acquireUsdc: async () =>
        execute("get-test-usdc", async (onHash) => {
          if (fixtureEnabled) setUsdcBalance(2_500_000_000n);
          else await getTestUsdc(clients(onHash, false));
          addActivity("Received test USDC");
          await refresh();
        }),
      makePrivate: async (input) =>
        execute("make-private", async (onHash, onStage) => {
          const amount = parseUsdcAmount(input);
          if (usdcBalance !== null && amount > usdcBalance) throw new Error("INSUFFICIENT_USDC");
          if (fixtureEnabled) {
            setUsdcBalance((balance) => (balance ?? 0n) - amount);
            setPrivateBalance((balance) => (balance ?? 0n) + amount);
          } else {
            requireVerified();
            await makePrivate(
              clients(onHash, false, onStage),
              requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC"),
              amount,
            );
          }
          if (!fixtureEnabled) invalidatePrivateBalance();
          else {
            setPrivateBalanceHandle(null);
            setPrivateBalanceRevealed(false);
            setPrivateBalanceStatus("NOT_REVEALED");
            setPrivateBalanceDiagnostic(null);
          }
          addActivity("Made USDC private");
          await refresh();
        }),
      revealPrivateBalance: async () => {
        setError(null);
        const runId = ++privateRevealRunRef.current;
        setPrivateBalanceHandle(null);
        setPrivateBalanceStatus("READING_HANDLE");
        setPrivateBalanceDiagnostic(null);
        let chainId: number | null = null;
        let revealAccount: Address | null = null;
        let token: Address | null = null;
        let handle: `0x${string}` | null = null;
        let stage = "READING_HANDLE";
        try {
          await ensurePrivateRevealAccess();
          if (fixtureEnabled) {
            setPrivateBalance((value) => value ?? 0n);
            setPrivateBalanceRevealed(true);
            setPrivateBalanceStatus("REVEALED");
            setPrivateBalanceDiagnostic(
              buildPrivateBalanceDiagnostic({
                chainId: LEOPOLD_CHAIN_ID,
                account: fixtureAccount,
                token: requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC"),
                handle: "0x0000000000000000000000000000000000000000000000000000000000000000",
                stage: "FIXTURE",
              }),
            );
            return;
          }
          requireVerified();
          const liveClients = clients(undefined, false);
          revealAccount = liveClients.account;
          token = requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC");
          chainId = await liveClients.walletClient.getChainId();
          if (walletIdentity.identity.verifiedAddress?.toLowerCase() !== revealAccount.toLowerCase()) {
            throw new Error("PRIVATE_BALANCE:WRONG_ACCOUNT");
          }
          const result = await revealPrivateBalanceFromCurrentHandle({
            clients: liveClients,
            getCurrentClients: currentPrivateBalanceClients,
            token,
            onStage: (nextStage: PrivateBalanceRevealStage) => {
              stage = nextStage;
              if (runId === privateRevealRunRef.current) {
                setPrivateBalanceStatus(nextStage === "REVALIDATING_HANDLE" ? "DECRYPTING" : nextStage);
              }
            },
            onIdentity: (identity: PrivateBalanceIdentity) => {
              handle = identity.handle;
              chainId = identity.chainId;
              revealAccount = identity.account;
              token = identity.token;
              if (runId !== privateRevealRunRef.current) return;
              setPrivateBalanceHandle(identity.handle);
              setPrivateBalanceStatus("NOT_REVEALED");
              setPrivateBalanceDiagnostic(
                buildPrivateBalanceDiagnostic({
                  chainId,
                  account: revealAccount,
                  token,
                  handle,
                  stage: "HANDLE_READ",
                }),
              );
            },
          });
          if (runId !== privateRevealRunRef.current) throw new Error("PRIVATE_BALANCE:STALE_REQUEST");
          handle = result.identity.handle;
          chainId = result.identity.chainId;
          revealAccount = result.identity.account;
          token = result.identity.token;
          setPrivateBalanceHandle(handle);
          setPrivateBalance(result.value);
          setPrivateBalanceRevealed(true);
          setPrivateBalanceStatus("REVEALED");
          setPrivateBalanceDiagnostic(
            buildPrivateBalanceDiagnostic({
              chainId,
              account: revealAccount,
              token,
              handle,
              stage: "DECRYPTED",
            }),
          );
        } catch (caught) {
          if (runId !== privateRevealRunRef.current) throw caught;
          const technical = sanitizeTechnicalDetail(caught);
          const diagnostic = buildPrivateBalanceDiagnostic({
            chainId,
            account: revealAccount,
            token,
            handle,
            stage,
            error: technical,
          });
          const enriched = new Error(diagnostic, { cause: caught });
          setPrivateBalance(null);
          setPrivateBalanceRevealed(false);
          setPrivateBalanceStatus("REVEAL_FAILED");
          setPrivateBalanceDiagnostic(diagnostic);
          setError(classifyLeopoldError(enriched));
          if (/stale_handle/u.test(technical.toLowerCase())) void refreshPrivateBalanceHandle();
          throw enriched;
        }
      },
      hidePrivateBalance: () => {
        setPrivateBalanceRevealed(false);
        setPrivateBalanceStatus("NOT_REVEALED");
        setPrivateBalanceDiagnostic(null);
      },
      save: async (vaultSlug, input) =>
        execute("save", async (onHash, onStage) => {
          const amount = parseUsdcAmount(input);
          if (privateBalance !== null && amount > privateBalance) throw new Error("INSUFFICIENT_USDC");
          const vault = getVaultConfig(vaultSlug);
          if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
          if (fixtureEnabled) {
            setPrivateBalance((balance) => (balance ?? 0n) - amount);
            setVaultPositions((positions) => ({ ...positions, [vaultSlug]: (positions[vaultSlug] ?? 0n) + amount }));
          } else {
            requireVerified();
            const liveClients = clients(onHash, true, onStage);
            const vaultAddress = requireConfiguredAddress(vault.vault, `${vault.name} vault`);
            await requireLiveOpenRound(vaultSlug, liveClients);
            await savePrivately(
              liveClients,
              requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC"),
              vaultAddress,
              amount,
              onStage,
            );
          }
          addActivity(`Saved to ${vault.name} Vault`, vault.name);
          onStage("save-post-refresh");
          await refresh();
        }),
      revealVault: async (vaultSlug) => {
        await ensurePrivateRevealAccess();
        if (fixtureEnabled) {
          setVaultPositions((items) => ({ ...items, [vaultSlug]: items[vaultSlug] ?? 0n }));
          setRevealedVaults((items) => new Set(items).add(vaultSlug));
          return;
        }
        const vault = getVaultConfig(vaultSlug);
        if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
        requireVerified();
        const liveClients = clients();
        const vaultAddress = requireConfiguredAddress(vault.vault, `${vault.name} vault`);
        const handle = await readPrivateHandle(
          liveClients.publicClient,
          vaultAddress,
          liveClients.account,
          "principal",
        );
        const clear = await decryptPrivateValue(
          liveClients.ethereum,
          liveClients.account,
          vaultAddress,
          handle,
          liveClients.walletClient,
        );
        setVaultPositions((items) => ({ ...items, [vaultSlug]: clear }));
        setRevealedVaults((items) => new Set(items).add(vaultSlug));
      },
      hideVault: (vaultSlug) =>
        setRevealedVaults((items) => {
          const next = new Set(items);
          next.delete(vaultSlug);
          return next;
        }),
      enterRound: async (vaultSlug) =>
        execute("enter-round", async (onHash) => {
          const vault = getVaultConfig(vaultSlug);
          if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
          if (fixtureEnabled) setEnteredVaults((items) => new Set(items).add(vaultSlug));
          else {
            requireVerified();
            const liveClients = clients(onHash);
            const state = await requireLiveOpenRound(vaultSlug, liveClients);
            if ((ethBalance.data?.value ?? 0n) < state.bondAmount) throw new Error("INSUFFICIENT_ETH");
            await enterPrizeRound(
              liveClients,
              requireConfiguredAddress(vault.bondEscrow, `${vault.name} escrow`),
              state.roundId,
              state.bondAmount,
            );
          }
          addActivity(`Entered ${vault.name} prize round`, vault.name);
          await refresh();
        }),
      revealResult: async (vaultSlug) => {
        await ensurePrivateRevealAccess();
        if (!enteredVaults.has(vaultSlug)) throw new Error("NOT_ENTERED");
        if (fixtureEnabled) {
          setPrivateResults((items) => ({ ...items, [vaultSlug]: 0n }));
          setRevealedResults((items) => new Set(items).add(vaultSlug));
          return;
        }
        const vault = getVaultConfig(vaultSlug);
        if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
        if (publicVaultState[vaultSlug]?.state !== 14) throw new Error("PRIVATE_RESULT_NOT_READY");
        requireVerified();
        const liveClients = clients();
        const vaultAddress = requireConfiguredAddress(vault.vault, `${vault.name} vault`);
        const handle = await readPrivateHandle(liveClients.publicClient, vaultAddress, liveClients.account, "winnings");
        const clear = await decryptPrivateValue(
          liveClients.ethereum,
          liveClients.account,
          vaultAddress,
          handle,
          liveClients.walletClient,
        );
        setPrivateResults((items) => ({ ...items, [vaultSlug]: clear }));
        setRevealedResults((items) => new Set(items).add(vaultSlug));
      },
      revealEligibility: async (vaultSlug) => {
        await ensurePrivateRevealAccess();
        if (!enteredVaults.has(vaultSlug)) throw new Error("NOT_ENTERED");
        if (fixtureEnabled) {
          setPrivateEligibility((items) => ({ ...items, [vaultSlug]: 1n }));
          return;
        }
        const vault = getVaultConfig(vaultSlug);
        const state = publicVaultState[vaultSlug];
        if (!vault || !state) throw new Error("ROUND_STATE_UNAVAILABLE");
        requireVerified();
        const liveClients = clients();
        const vaultAddress = requireConfiguredAddress(vault.vault, `${vault.name} vault`);
        const hash = await materializeEligibility(liveClients, vaultAddress, state.roundId);
        const receipt = await liveClients.publicClient.getTransactionReceipt({ hash });
        const { parseEventLogs } = await import("viem");
        const { vaultAbi } = await import("@/lib/leopold/abis");
        const event = parseEventLogs({ abi: vaultAbi, eventName: "RoundWeightMaterialized", logs: receipt.logs }).find(
          (log) =>
            log.args.roundId === state.roundId && log.args.account.toLowerCase() === liveClients.account.toLowerCase(),
        );
        if (!event) throw new Error("PRIVATE_ELIGIBILITY_HANDLE_UNAVAILABLE");
        const clear = await decryptPrivateValue(
          liveClients.ethereum,
          liveClients.account,
          vaultAddress,
          event.args.handle,
          liveClients.walletClient,
        );
        setPrivateEligibility((items) => ({ ...items, [vaultSlug]: clear }));
      },
      withdraw: async (vaultSlug, input) =>
        execute("withdraw", async (onHash, onStage) => {
          const amount = parseUsdcAmount(input);
          const vault = getVaultConfig(vaultSlug);
          if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
          if (revealedVaults.has(vaultSlug) && (vaultPositions[vaultSlug] ?? 0n) === 0n) {
            throw new Error("INSUFFICIENT_USDC");
          }
          if (fixtureEnabled) {
            const position = vaultPositions[vaultSlug] ?? 0n;
            if (amount > position) throw new Error("INSUFFICIENT_USDC");
            setVaultPositions((items) => ({ ...items, [vaultSlug]: position - amount }));
            setPrivateBalance((balance) => (balance ?? 0n) + amount);
          } else {
            requireVerified();
            const liveClients = clients(onHash, true, onStage);
            const vaultAddress = requireConfiguredAddress(vault.vault, `${vault.name} vault`);
            await prepareWithdrawalRound({
              readRound: async () => {
                const liveRound = await readLiveVaultRound(vaultSlug, liveClients);
                const status = getEffectiveVaultRoundStatus(liveRound.state, liveRound.blockTimestamp);
                return {
                  canWithdrawNow: status.depositOpen,
                  canPrepareWithdrawal: canPrepareVaultWithdrawal(liveRound.state, liveRound.blockTimestamp),
                  reason: status.label,
                };
              },
              advanceRound: () => closeExpiredRound(liveClients, vaultAddress),
              onStage,
            });
            await withdrawSavings(liveClients, requireConfiguredAddress(vault.vault, `${vault.name} vault`), amount);
          }
          addActivity(`Withdrew from ${vault.name} Vault`, vault.name);
          await refresh();
        }),
      makePublic: async (input) =>
        execute("make-public", async (onHash) => {
          const amount = parseUsdcAmount(input);
          if (fixtureEnabled) {
            if (amount > (privateBalance ?? 0n)) throw new Error("INSUFFICIENT_USDC");
            setPrivateBalance((value) => (value ?? 0n) - amount);
            setUsdcBalance((value) => (value ?? 0n) + amount);
          } else {
            requireVerified();
            await requestMakePublic(
              clients(onHash),
              requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC"),
              amount,
            );
          }
          addActivity("Requested public USDC");
          await refresh();
        }),
      claimRefund: async (vaultSlug) =>
        execute("claim-refund", async (onHash) => {
          const vault = getVaultConfig(vaultSlug);
          const state = publicVaultState[vaultSlug];
          if (!vault || !state) {
            if (fixtureEnabled) {
              addActivity("Claimed bond refund", vault?.name);
              return;
            }
            throw new Error("REFUND_UNAVAILABLE");
          }
          requireVerified();
          await claimBondRefund(
            clients(onHash),
            requireConfiguredAddress(vault.bondEscrow, `${vault.name} escrow`),
            state.roundId,
          );
          addActivity("Claimed bond refund", vault.name);
          await refresh();
        }),
      claimRewards: async (vaultSlug) =>
        execute("claim-reward", async (onHash) => {
          const vault = getVaultConfig(vaultSlug);
          if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
          if (!fixtureEnabled) {
            requireVerified();
            await claimSettlementRewards(
              clients(onHash),
              requireConfiguredAddress(vault.bondEscrow, `${vault.name} escrow`),
            );
          }
          addActivity("Claimed settlement reward", vault.name);
          await refresh();
        }),
    }),
    [
      account,
      activity,
      addActivity,
      clients,
      connected,
      connecting,
      currentPrivateBalanceClients,
      enteredVaults,
      error,
      ethBalance.data?.value,
      execute,
      privateBalance,
      privateBalanceRevealed,
      privateBalanceHandle,
      privateBalanceStatus,
      privateBalanceDiagnostic,
      privateEligibility,
      privateResults,
      publicVaultState,
      latestBlockTimestamp,
      refresh,
      requireVerified,
      revealedResults,
      revealedVaults,
      readLiveVaultRound,
      txStage,
      txErrorStage,
      usdcBalance,
      vaultPositions,
      networkHealth,
      walletChainId,
      auth,
      financialAuthorized,
      financialActionsEnabled,
      ensurePrivateRevealAccess,
      invalidatePrivateBalance,
      refreshPrivateBalanceHandle,
      requireLiveOpenRound,
      walletIdentity,
    ],
  );

  return <FinancialContext.Provider value={value}>{children}</FinancialContext.Provider>;
}

export function useFinancial(): FinancialContextValue {
  const value = useContext(FinancialContext);
  if (!value) throw new Error("FinancialProvider is missing");
  return value;
}

export function privateAmountLabel(revealed: boolean, amount: bigint | null): string {
  return revealed && amount !== null ? `${formatUsdcAmount(amount)} USDC` : "•••••• USDC";
}

export function ethAmountLabel(amount: bigint | undefined): string {
  return amount === undefined ? "Unavailable" : `${formatEther(amount)} ETH`;
}
