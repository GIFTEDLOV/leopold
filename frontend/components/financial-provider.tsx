"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatEther, type Address } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";

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

export type ActivityItem = { id: string; label: string; status: "Confirmed" | "Processing"; vault?: string };

type FinancialContextValue = {
  fixture: boolean;
  connected: boolean;
  connecting: boolean;
  wrongNetwork: boolean;
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
  error: LeopoldError | null;
  activity: ActivityItem[];
  publicVaultState: Partial<Record<VaultId, VaultPublicState>>;
  authState: ReturnType<typeof useAuth>["readiness"];
  financialAuthorized: boolean;
  connectWallet(): Promise<void>;
  disconnectWallet(): void;
  switchToSepolia(): Promise<void>;
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
  const chainId = useChainId();
  const connectState = useConnect();
  const disconnectState = useDisconnect();
  const switchState = useSwitchChain();
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
  const [error, setError] = useState<LeopoldError | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [deploymentVerified, setDeploymentVerified] = useState(false);

  const connected = fixtureEnabled ? fixtureConnected : accountState.isConnected;
  const connecting = fixtureEnabled ? false : accountState.isConnecting || connectState.isPending;
  const account = fixtureEnabled ? (fixtureConnected ? fixtureAccount : null) : (accountState.address ?? null);
  const effectiveChain = fixtureEnabled ? fixtureChain : chainId;
  const wrongNetwork = connected && effectiveChain !== LEOPOLD_CHAIN_ID;
  const financialAuthorized = auth.readiness === "ACCOUNT_READY";

  const ensureFinancialAccess = useCallback(() => {
    try {
      if (!connected) throw new Error("FINANCIAL_IDENTITY_REQUIRED");
      requireFinancialIdentity(auth.identity, !wrongNetwork);
    } catch (caught) {
      setError(classifyLeopoldError(caught));
      throw caught;
    }
  }, [auth.identity, connected, wrongNetwork]);

  const ensurePrivateRevealAccess = useCallback(() => {
    const result = checkPrivateRevealIdentity(auth.identity, !wrongNetwork);
    if (!result.allowed) {
      const error = new Error(result.code);
      error.name = result.code;
      setError(classifyLeopoldError(error));
      throw error;
    }
    // The Zama SDK is signer-bound and kept only in memory. Recreate it for
    // every reveal so a wallet switch, logout, or stale authorization cannot
    // reuse the prior private-session object.
    clearPrivateSession();
  }, [auth.identity, wrongNetwork]);

  const ethBalance = useBalance({
    address: fixtureEnabled ? undefined : (account ?? undefined),
    chainId: LEOPOLD_CHAIN_ID,
    query: { enabled: !fixtureEnabled && Boolean(account) },
  });

  const clients = useCallback(
    (onHash?: ActionClients["onHash"]): ActionClients => {
      const ethereum =
        typeof window !== "undefined"
          ? (window as unknown as { ethereum?: ActionClients["ethereum"] }).ethereum
          : undefined;
      if (!publicClient || !walletClient.data || !ethereum || !account) throw new Error("UNSUPPORTED_WALLET");
      return { publicClient, walletClient: walletClient.data, ethereum, account, onHash };
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
      action: (onHash: NonNullable<ActionClients["onHash"]>) => Promise<unknown>,
      completesAfterReceipt = true,
    ) => {
      setError(null);
      setTxStage("wallet");
      const transactionId = crypto.randomUUID();
      let latestHash: `0x${string}` | undefined;
      const persistStage = (stage: TransactionStage, hash?: `0x${string}`) => {
        if (!account || fixtureEnabled) return;
        if (hash) latestHash = hash;
        persistSafeTransaction({
          id: transactionId,
          kind,
          hash: hash ?? latestHash,
          chainId: LEOPOLD_CHAIN_ID,
          account,
          stage,
          updatedAt: Date.now(),
        });
      };
      try {
        ensureFinancialAccess();
        persistStage("wallet");
        await action((hash) => {
          setTxStage("submitted");
          persistStage("submitted", hash);
          window.setTimeout(() => setTxStage("confirming"), 0);
        });
        setTxStage("private");
        if (completesAfterReceipt) {
          setTxStage("complete");
        }
        persistStage(completesAfterReceipt ? "complete" : "private");
      } catch (caught) {
        setError(classifyLeopoldError(caught));
        setTxStage("failed");
        persistStage("failed");
        throw caught;
      }
    },
    [account, ensureFinancialAccess],
  );

  const refresh = useCallback(async () => {
    if (!connected || wrongNetwork || !account) return;
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
  }, [account, connected, publicClient, wrongNetwork]);

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
  }, [account, auth.authenticated, auth.identityKey, effectiveChain]);

  const value = useMemo<FinancialContextValue>(
    () => ({
      fixture: fixtureEnabled,
      connected,
      connecting,
      wrongNetwork,
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
      txLabel: transactionStageLabel[txStage],
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
          await switchState.switchChainAsync({ chainId: LEOPOLD_CHAIN_ID });
        } catch (caught) {
          setError(classifyLeopoldError(caught));
          throw caught;
        }
      },
      refresh,
      acquireUsdc: async () =>
        execute("get-test-usdc", async (onHash) => {
          if (fixtureEnabled) setUsdcBalance(2_500_000_000n);
          else await getTestUsdc(clients(onHash));
          addActivity("Received test USDC");
          await refresh();
        }),
      makePrivate: async (input) =>
        execute("make-private", async (onHash) => {
          const amount = parseUsdcAmount(input);
          if (usdcBalance !== null && amount > usdcBalance) throw new Error("INSUFFICIENT_USDC");
          if (fixtureEnabled) {
            setUsdcBalance((balance) => (balance ?? 0n) - amount);
            setPrivateBalance((balance) => (balance ?? 0n) + amount);
          } else {
            requireVerified();
            await makePrivate(clients(onHash), requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC"), amount);
          }
          addActivity("Made USDC private");
          await refresh();
        }),
      revealPrivateBalance: async () => {
        setError(null);
        ensurePrivateRevealAccess();
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
        ensurePrivateRevealAccess();
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
        ensurePrivateRevealAccess();
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
        ensurePrivateRevealAccess();
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
      switchState,
      txStage,
      usdcBalance,
      vaultPositions,
      wrongNetwork,
      auth,
      financialAuthorized,
      ensurePrivateRevealAccess,
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
