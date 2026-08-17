"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatEther, type Address } from "viem";
import { useAccount, useBalance, useConnect, useDisconnect, usePublicClient, useWalletClient } from "wagmi";

import {
  claimBondRefund,
  claimSettlementRewards,
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
import {
  beginFinancialNetworkCheck,
  createIdleFinancialNetworkHealth,
  financialWritesAllowed,
  getFinancialNetworkHealthKey,
  isFinancialNetworkHealthFresh,
  runFinancialNetworkPreflight,
  type FinancialNetworkCheckMode,
  type FinancialNetworkHealth,
  type FinancialNetworkSnapshot,
  type RpcRequester,
} from "@/lib/leopold/network";
import { classifyLeopoldError, type LeopoldError } from "@/lib/leopold/errors";
import {
  readPrivateHandle,
  readUsdcBalance,
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
import { clearPrivateSession, decryptPrivateValue } from "@/lib/leopold/zama";
import { useAuth } from "@/components/auth-provider";
import { checkPrivateRevealIdentity, requireFinancialIdentity } from "@/lib/auth/readiness";
import { financialControlsEnabled } from "@/lib/auth/hydration";

export type ActivityItem = { id: string; label: string; status: "Confirmed" | "Processing"; vault?: string };

type FinancialContextValue = {
  fixture: boolean;
  connected: boolean;
  connecting: boolean;
  networkHealth: FinancialNetworkHealth;
  walletChainId: number | null;
  account: Address | null;
  accountLabel: string;
  usdcBalance: bigint | null;
  privateBalance: bigint | null;
  privateBalanceRevealed: boolean;
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
  authState: ReturnType<typeof useAuth>["readiness"];
  financialAuthorized: boolean;
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
  const accountState = useAccount();
  const connectState = useConnect();
  const disconnectState = useDisconnect();
  const publicClient = usePublicClient({ chainId: LEOPOLD_CHAIN_ID });
  const walletClient = useWalletClient({ chainId: LEOPOLD_CHAIN_ID });
  const [fixtureConnected, setFixtureConnected] = useState(false);
  const [fixtureChain, setFixtureChain] = useState(1);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(fixtureEnabled ? 0n : null);
  const [privateBalance, setPrivateBalance] = useState<bigint | null>(null);
  const [privateBalanceRevealed, setPrivateBalanceRevealed] = useState(false);
  const [vaultPositions, setVaultPositions] = useState<Partial<Record<VaultId, bigint>>>({});
  const [revealedVaults, setRevealedVaults] = useState<Set<VaultId>>(new Set());
  const [enteredVaults, setEnteredVaults] = useState<Set<VaultId>>(new Set());
  const [privateResults, setPrivateResults] = useState<Partial<Record<VaultId, bigint>>>({});
  const [revealedResults, setRevealedResults] = useState<Set<VaultId>>(new Set());
  const [privateEligibility, setPrivateEligibility] = useState<Partial<Record<VaultId, bigint>>>({});
  const [publicVaultState, setPublicVaultState] = useState<Partial<Record<VaultId, VaultPublicState>>>({});
  const [txStage, setTxStage] = useState<TransactionStage>("ready");
  const [txErrorStage, setTxErrorStage] = useState<TransactionStage | null>(null);
  const [error, setError] = useState<LeopoldError | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [deploymentVerified, setDeploymentVerified] = useState(false);
  const [networkHealth, setNetworkHealth] = useState<FinancialNetworkHealth>(createIdleFinancialNetworkHealth);
  const healthCacheRef = useRef<{ key: string; health: FinancialNetworkHealth } | null>(null);
  const healthRunRef = useRef(0);
  const walletClientRef = useRef(walletClient.data);
  const publicClientRef = useRef(publicClient);
  const refreshActiveNetworkRef = useRef(auth.refreshActiveNetwork);

  useEffect(() => {
    walletClientRef.current = walletClient.data;
    publicClientRef.current = publicClient;
    refreshActiveNetworkRef.current = auth.refreshActiveNetwork;
  }, [auth.refreshActiveNetwork, publicClient, walletClient.data]);

  const connected = fixtureEnabled ? fixtureConnected : accountState.isConnected;
  const connecting = fixtureEnabled ? false : accountState.isConnecting || connectState.isPending;
  const account = fixtureEnabled ? (fixtureConnected ? fixtureAccount : null) : (accountState.address ?? null);
  const wagmiAccountChainId = fixtureEnabled ? fixtureChain : (accountState.chainId ?? null);
  const walletChainId = networkHealth.walletClientChainId ?? auth.activeNetworkId ?? wagmiAccountChainId;
  const financialAuthorized = financialControlsEnabled(auth.clientReady, auth.readiness === "ACCOUNT_READY");
  const walletClientAccount = walletClient.data
    ? ((typeof walletClient.data.account === "string"
        ? walletClient.data.account
        : walletClient.data.account?.address) ?? null)
    : null;
  const walletClientId = walletClient.data?.uid ?? null;

  const syncWalletNetwork = useCallback(async (): Promise<FinancialNetworkSnapshot> => {
    if (!connected) {
      return { connected: false, dynamicWalletChainId: null, walletClientChainId: null };
    }
    if (fixtureEnabled) {
      return { connected: true, dynamicWalletChainId: fixtureChain, walletClientChainId: fixtureChain };
    }
    let dynamicWalletChainId: number | null = null;
    try {
      dynamicWalletChainId = await refreshActiveNetworkRef.current();
    } catch {
      dynamicWalletChainId = null;
    }
    let currentWalletClientChainId: number | null = null;
    try {
      currentWalletClientChainId = walletClientRef.current ? await walletClientRef.current.getChainId() : null;
    } catch {
      currentWalletClientChainId = null;
    }
    return {
      connected: true,
      dynamicWalletChainId,
      walletClientChainId: currentWalletClientChainId,
      wagmiAccountChainId: accountState.chainId ?? null,
    };
  }, [accountState.chainId, connected, fixtureChain]);

  const healthKey = [
    connected,
    financialAuthorized,
    getFinancialNetworkHealthKey({
      activeAccount: account,
      financialWallet: auth.financialWallet,
      connectedWallet: auth.connectedWallet,
      activeWallet: auth.activeWalletAddress,
      walletClientAccount,
      walletClientId,
      dynamicWalletChainId: auth.activeNetworkId,
      wagmiAccountChainId: accountState.chainId ?? null,
    }),
  ].join("|");

  const runNetworkHealth = useCallback(
    async (force = false, mode: FinancialNetworkCheckMode = "auto"): Promise<FinancialNetworkHealth> => {
      if (!financialAuthorized) {
        ++healthRunRef.current;
        healthCacheRef.current = null;
        const idle = createIdleFinancialNetworkHealth();
        setNetworkHealth(idle);
        return idle;
      }
      const cachedHealth = healthCacheRef.current;
      if (!force && cachedHealth && isFinancialNetworkHealthFresh(cachedHealth, healthKey)) {
        setNetworkHealth(cachedHealth.health);
        return cachedHealth.health;
      }
      const runId = ++healthRunRef.current;
      setNetworkHealth((current) => beginFinancialNetworkCheck(current, mode));
      const snapshot = await syncWalletNetwork();
      const requester = (client: unknown): RpcRequester | null => {
        if (!client || typeof client !== "object" || !("request" in client)) return null;
        const rawRequest = (client as { request: (...args: never[]) => Promise<unknown> }).request;
        return { request: (args) => rawRequest(args as never) };
      };
      const health = fixtureEnabled
        ? {
            state: fixtureConnected
              ? fixtureChain === LEOPOLD_CHAIN_ID
                ? ("HEALTHY" as const)
                : ("WRONG_NETWORK" as const)
              : ("WALLET_DISCONNECTED" as const),
            checkedAt: Date.now(),
            dynamicWalletChainId: fixtureConnected ? fixtureChain : null,
            walletClientChainId: fixtureConnected ? fixtureChain : null,
            appChainId: fixtureConnected ? LEOPOLD_CHAIN_ID : null,
            backgroundChecking: false,
          }
        : await runFinancialNetworkPreflight({
            activeAccount: account,
            financialWallet: auth.financialWallet,
            connectedWallet: auth.connectedWallet,
            activeWallet: auth.activeWalletAddress,
            walletClientAccount,
            walletClient: requester(walletClientRef.current),
            publicClient: requester(publicClientRef.current),
            dynamicWalletChainId: snapshot.dynamicWalletChainId,
          });
      if (runId === healthRunRef.current) {
        const resolvedKey = [
          connected,
          financialAuthorized,
          getFinancialNetworkHealthKey({
            activeAccount: account,
            financialWallet: auth.financialWallet,
            connectedWallet: auth.connectedWallet,
            activeWallet: auth.activeWalletAddress,
            walletClientAccount,
            walletClientId,
            dynamicWalletChainId: snapshot.dynamicWalletChainId,
            wagmiAccountChainId: snapshot.wagmiAccountChainId ?? null,
          }),
        ].join("|");
        healthCacheRef.current = { key: resolvedKey, health };
        setNetworkHealth(health);
      }
      return health;
    },
    [
      account,
      auth.activeWalletAddress,
      auth.connectedWallet,
      auth.financialWallet,
      financialAuthorized,
      connected,
      fixtureChain,
      fixtureConnected,
      healthKey,
      syncWalletNetwork,
      walletClientAccount,
      walletClientId,
    ],
  );

  const ensureSepoliaWalletHealth = useCallback(async () => {
    const health = await runNetworkHealth(false, "write");
    if (!financialWritesAllowed(health)) {
      throw new Error(`${health.state}:${health.technicalDetail ?? "financial network preflight failed"}`);
    }
  }, [runNetworkHealth]);

  const ensureFinancialAccess = useCallback(async () => {
    try {
      if (!connected) throw new Error("FINANCIAL_IDENTITY_REQUIRED");
      await ensureSepoliaWalletHealth();
      requireFinancialIdentity(auth.identity, true);
    } catch (caught) {
      setError(classifyLeopoldError(caught));
      throw caught;
    }
  }, [auth.identity, connected, ensureSepoliaWalletHealth]);

  const ensurePrivateRevealAccess = useCallback(async () => {
    try {
      await ensureSepoliaWalletHealth();
      const result = checkPrivateRevealIdentity(auth.identity, true);
      if (!result.allowed) {
        const error = new Error(result.code);
        error.name = result.code;
        throw error;
      }
      // The Zama SDK is signer-bound and kept only in memory. Recreate it for
      // every reveal so a wallet switch, logout, or stale authorization cannot
      // reuse the prior private-session object.
      clearPrivateSession();
    } catch (caught) {
      setError(classifyLeopoldError(caught));
      throw caught;
    }
  }, [auth.identity, ensureSepoliaWalletHealth]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void runNetworkHealth(false, "auto");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [healthKey, runNetworkHealth]);

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
        setTxStage("private");
        activeStage = "private";
        if (completesAfterReceipt) {
          setTxStage("complete");
        }
        persistStage(completesAfterReceipt ? "complete" : "private");
        void runNetworkHealth(true, "background");
      } catch (caught) {
        setError(classifyLeopoldError(caught));
        setTxErrorStage(activeStage);
        setTxStage("failed");
        persistStage("failed", undefined, activeStage);
        throw caught;
      }
    },
    [account, ensureFinancialAccess, runNetworkHealth],
  );

  const refresh = useCallback(async () => {
    if (!connected || networkHealth.state !== "HEALTHY" || !account) return;
    if (fixtureEnabled) return;
    if (!publicClient) return;
    setDeploymentVerified(false);
    try {
      setUsdcBalance(await readUsdcBalance(publicClient, CANONICAL_USDC, account));
      if (leopoldConfig.ready) {
        await validateConfiguredDeployment(publicClient, leopoldConfig);
        setDeploymentVerified(true);
        const states = await Promise.all(
          leopoldConfig.vaults.map(
            async (vault) => [vault.slug, await readVaultPublicState(publicClient, vault, account)] as const,
          ),
        );
        setPublicVaultState(Object.fromEntries(states));
        setEnteredVaults(new Set(states.filter(([, state]) => state.entered).map(([slug]) => slug)));
      }
    } catch (caught) {
      setDeploymentVerified(false);
      setError(classifyLeopoldError(caught));
    }
  }, [account, connected, networkHealth.state, publicClient]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (fixtureEnabled && !auth.authenticated) setFixtureConnected(false);
      setPrivateBalance(null);
      setPrivateBalanceRevealed(false);
      setVaultPositions({});
      setRevealedVaults(new Set());
      setPrivateResults({});
      setRevealedResults(new Set());
      setPrivateEligibility({});
      if (account) {
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
          loadSafeTransactions(account).map((item) => ({
            id: item.id,
            label: labels[item.kind] ?? "Leopold transaction",
            status: item.stage === "complete" ? "Confirmed" : "Processing",
          })),
        );
      } else setActivity([]);
      clearPrivateSession();
      setDeploymentVerified(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [account, auth.authenticated, auth.identityKey, walletChainId]);

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
      authState: auth.readiness,
      financialAuthorized,
      connectWallet: async () => {
        setError(null);
        try {
          if (fixtureEnabled) {
            setFixtureConnected(true);
            return;
          }
          if (!auth.configured) throw new Error("AUTH_CONFIGURATION_REQUIRED");
          auth.openWalletAuthentication();
          return;
        } catch (caught) {
          setError(classifyLeopoldError(caught));
          throw caught;
        }
      },
      disconnectWallet: () => {
        if (fixtureEnabled) setFixtureConnected(false);
        else disconnectState.disconnect();
      },
      switchToSepolia: async () => {
        try {
          if (fixtureEnabled) {
            setFixtureChain(LEOPOLD_CHAIN_ID);
            return;
          }
          await auth.switchFinancialWalletToSepolia();
          await ensureSepoliaWalletHealth();
        } catch (caught) {
          setError(classifyLeopoldError(caught));
          throw caught;
        }
      },
      retryNetworkHealth: async () => {
        await runNetworkHealth(true, "retry");
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
          addActivity("Made USDC private");
          await refresh();
        }),
      revealPrivateBalance: async () => {
        setError(null);
        await ensurePrivateRevealAccess();
        if (fixtureEnabled) {
          setPrivateBalance((value) => value ?? 0n);
          setPrivateBalanceRevealed(true);
          return;
        }
        requireVerified();
        const liveClients = clients();
        const lcUsdc = requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC");
        const handle = await liveClients.publicClient.readContract({
          address: lcUsdc,
          abi: (await import("@/lib/leopold/abis")).confidentialUsdcAbi,
          functionName: "confidentialBalanceOf",
          args: [liveClients.account],
        });
        setPrivateBalance(await decryptPrivateValue(liveClients.ethereum, liveClients.account, lcUsdc, handle));
        setPrivateBalanceRevealed(true);
      },
      hidePrivateBalance: () => setPrivateBalanceRevealed(false),
      save: async (vaultSlug, input) =>
        execute("save", async (onHash) => {
          const amount = parseUsdcAmount(input);
          if (privateBalance !== null && amount > privateBalance) throw new Error("INSUFFICIENT_USDC");
          const vault = getVaultConfig(vaultSlug);
          if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
          if (fixtureEnabled) {
            setPrivateBalance((balance) => (balance ?? 0n) - amount);
            setVaultPositions((positions) => ({ ...positions, [vaultSlug]: (positions[vaultSlug] ?? 0n) + amount }));
          } else {
            requireVerified();
            await savePrivately(
              clients(onHash),
              requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC"),
              requireConfiguredAddress(vault.vault, `${vault.name} vault`),
              amount,
            );
          }
          addActivity(`Saved to ${vault.name} Vault`, vault.name);
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
        const clear = await decryptPrivateValue(liveClients.ethereum, liveClients.account, vaultAddress, handle);
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
            const state = publicVaultState[vaultSlug];
            if (!state) throw new Error("ROUND_STATE_UNAVAILABLE");
            if ((ethBalance.data?.value ?? 0n) < state.bondAmount) throw new Error("INSUFFICIENT_ETH");
            await enterPrizeRound(
              clients(onHash),
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
        const clear = await decryptPrivateValue(liveClients.ethereum, liveClients.account, vaultAddress, handle);
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
        );
        setPrivateEligibility((items) => ({ ...items, [vaultSlug]: clear }));
      },
      withdraw: async (vaultSlug, input) =>
        execute("withdraw", async (onHash) => {
          const amount = parseUsdcAmount(input);
          const vault = getVaultConfig(vaultSlug);
          if (!vault) throw new Error("CONFIGURATION_MISSING:vault");
          if (fixtureEnabled) {
            const position = vaultPositions[vaultSlug] ?? 0n;
            if (amount > position) throw new Error("INSUFFICIENT_USDC");
            setVaultPositions((items) => ({ ...items, [vaultSlug]: position - amount }));
            setPrivateBalance((balance) => (balance ?? 0n) + amount);
          } else {
            requireVerified();
            await withdrawSavings(
              clients(onHash),
              requireConfiguredAddress(vault.vault, `${vault.name} vault`),
              amount,
            );
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
      disconnectState,
      enteredVaults,
      error,
      ethBalance.data?.value,
      execute,
      privateBalance,
      privateBalanceRevealed,
      privateEligibility,
      privateResults,
      publicVaultState,
      refresh,
      requireVerified,
      revealedResults,
      revealedVaults,
      txStage,
      txErrorStage,
      usdcBalance,
      vaultPositions,
      networkHealth,
      walletChainId,
      auth,
      financialAuthorized,
      ensurePrivateRevealAccess,
      ensureSepoliaWalletHealth,
      runNetworkHealth,
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
