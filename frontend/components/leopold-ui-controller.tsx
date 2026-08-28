"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Address } from "viem";

import { useAuth } from "@/components/auth-provider";
import { useFinancial } from "@/components/financial-provider";
import { useWalletSessionController } from "@/components/wallet-identity-provider";
import type { LeopoldRecoveryAction } from "@/lib/auth/recovery";
import { type LeopoldErrorCode } from "@/lib/leopold/errors";
import { projectCompletedVaultRounds, type CompletedVaultRound } from "@/lib/leopold/history";
import { getEffectiveVaultPublicPrize, getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { SETTLED_ROUND_STATE } from "@/lib/leopold/reads";
import { leopoldConfig, type VaultId } from "@/lib/leopold/config";
import { loadSafeTransactions, transactionStageLabel, type SafeTransactionRecord } from "@/lib/leopold/transactions";
import {
  assertUiControllerSafety,
  isRecommendedVault,
  mapAccountState,
  mapPrivateValueState,
  mapTransactionState,
  mapVaultState,
  mapWalletState,
  readUiHealth,
  type UiAccountState,
  type UiHealthSnapshot,
  type UiPrivateValueState,
  type UiTransactionState,
  type UiVaultState,
  type UiWalletState,
} from "@/lib/ui/controller";

export type UiFinancialWalletStatus = "loading" | "not-linked" | "linked" | "unavailable" | "error";
export type UiPublicValue<T> = { state: "loading" | "available" | "unavailable"; value: T | null };
export type UiPrivateValue<T> = { state: UiPrivateValueState; value: T | null };

export type UiTransactionItem = {
  id: string;
  kind: string;
  state: UiTransactionState;
  label: string;
  hash: `0x${string}` | null;
  updatedAt: number;
};

export type UiVaultSummary = {
  id: VaultId;
  name: string;
  recommended: boolean;
  durationSeconds: number;
  address: Address | null;
  state: UiVaultState;
  round: {
    id: bigint | null;
    opensAt: bigint | null;
    closesAt: bigint | null;
    label: string;
    publicPrizeReserve: bigint | null;
    entered: boolean;
    participantCount: bigint | null;
    settlementProgress: { selectionCursor: bigint; allocationCursor: bigint } | null;
  };
  privateSavings: UiPrivateValue<bigint>;
  privateResult: UiPrivateValue<bigint> & { available: boolean };
  rewards: {
    bondRefund: bigint | null;
    bondRefundClaimed: boolean;
    settlementReward: bigint | null;
  };
  actions: {
    revealSavings(): Promise<void>;
    hideSavings(): void;
    save(amount: string): Promise<void>;
    withdraw(amount: string): Promise<void>;
    enterPrizeRound(): Promise<void>;
    revealEligibility(): Promise<void>;
    revealResult(): Promise<void>;
    claimBondRefund(): Promise<void>;
    claimSettlementRewards(): Promise<void>;
  };
};

export type UiHistoricalRoundSummary = {
  vaultId: VaultId;
  vaultName: string;
  state: "settled";
  round: {
    id: bigint;
    opensAt: bigint;
    closesAt: bigint;
    label: string;
    storedPrize: bigint;
    publicPrizeReserve: bigint;
    entered: true;
    participantCount: bigint;
  };
  eligibility: { available: boolean; state: UiPrivateValueState };
  privateResult: UiPrivateValue<bigint> & { available: boolean };
  rewards: {
    bondRefund: bigint;
    bondRefundClaimed: boolean;
    settlementReward: bigint;
  };
  actions: {
    revealEligibility(): Promise<void>;
    revealResult(): Promise<void>;
    claimBondRefund(): Promise<void>;
  };
};

export type LeopoldUiController = {
  account: {
    state: UiAccountState;
    email: string | null;
    emailVerified: boolean;
    username: string | null;
    xAvailable: boolean;
    xLinked: boolean;
    error: string | null;
    actions: {
      requestEmailOtp(email: string): Promise<void>;
      verifyEmailOtp(otp: string): Promise<void>;
      resendEmailOtp(): Promise<void>;
      completeProfile(): void;
      saveUsername(username: string): Promise<void>;
      linkX(): Promise<void>;
      unlinkX(): Promise<void>;
      signOut(): Promise<void>;
    };
  };
  wallet: {
    state: UiWalletState;
    financialWalletStatus: UiFinancialWalletStatus;
    address: Address | null;
    connectedAddress: Address | null;
    chainId: number | null;
    canUseFinancialActions: boolean;
    recovery: { visible: boolean; action: LeopoldRecoveryAction; message: string; detail: string };
    actions: {
      linkFinancialWallet(): void;
      confirmFinancialWallet(): Promise<void>;
      connect(): Promise<void>;
      disconnect(): void;
      switchToSepolia(): Promise<void>;
      retryNetworkHealth(): Promise<void>;
    };
  };
  balances: {
    publicUsdc: UiPublicValue<bigint>;
    privateUsdc: UiPrivateValue<bigint>;
    actions: { revealPrivateUsdc(): Promise<void>; hidePrivateUsdc(): void };
  };
  vaults: readonly UiVaultSummary[];
  completedRounds: readonly UiHistoricalRoundSummary[];
  transactions: {
    current: {
      state: UiTransactionState;
      label: string;
      hash: `0x${string}` | null;
      recoverable: boolean;
      error: { code: LeopoldErrorCode; message: string } | null;
    };
    history: readonly UiTransactionItem[];
  };
  moneyMovement: {
    getTestUsdc(): Promise<void>;
    makePrivate(amount: string): Promise<void>;
    save(vault: VaultId, amount: string): Promise<void>;
    withdraw(vault: VaultId, amount: string): Promise<void>;
    makePublic(amount: string): Promise<void>;
  };
  ops: { readHealth(): Promise<UiHealthSnapshot> };
  refresh(): Promise<void>;
};

type RevealStateRecord = {
  identityKey: string;
  values: Partial<Record<string, UiPrivateValueState>>;
};

function financialWalletStatus(
  status: ReturnType<typeof useAuth>["financialWalletMetadata"]["status"],
): UiFinancialWalletStatus {
  if (status === "LOADING") return "loading";
  if (status === "NONE") return "not-linked";
  if (status === "PRESENT") return "linked";
  if (status === "ERROR") return "error";
  return "unavailable";
}

function transactionItems(records: readonly SafeTransactionRecord[]): UiTransactionItem[] {
  return records.map((record) => ({
    id: record.id,
    kind: record.kind,
    state: mapTransactionState(record.stage),
    label: transactionStageLabel[record.stage],
    hash: record.hash ?? null,
    updatedAt: record.updatedAt,
  }));
}

/**
 * Stable presentation boundary for the final Leopold UI.
 *
 * Do not import Dynamic, Wagmi, Zama, raw read/action helpers, or the legacy
 * provider values in final visual components. This facade intentionally omits
 * handles, proofs, decrypt material, private eligibility/TWAB, provider IDs,
 * connector objects, and technical diagnostics.
 */
export function useLeopoldUiController(): LeopoldUiController {
  const auth = useAuth();
  const financial = useFinancial();
  const walletController = useWalletSessionController();
  const [history, setHistory] = useState<SafeTransactionRecord[]>([]);
  const [savingsRevealRecord, setSavingsRevealRecord] = useState<RevealStateRecord>(() => ({
    identityKey: auth.identityKey,
    values: {},
  }));
  const [resultRevealRecord, setResultRevealRecord] = useState<RevealStateRecord>(() => ({
    identityKey: auth.identityKey,
    values: {},
  }));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setHistory(financial.account ? loadSafeTransactions(financial.account) : []);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [financial.account, financial.txStage]);

  const updateRevealState = useCallback(
    (setter: Dispatch<SetStateAction<RevealStateRecord>>, key: string, state: UiPrivateValueState) => {
      setter((current) => ({
        identityKey: auth.identityKey,
        values: {
          ...(current.identityKey === auth.identityKey ? current.values : {}),
          [key]: state,
        },
      }));
    },
    [auth.identityKey],
  );

  const revealSavings = useCallback(
    async (vault: VaultId) => {
      updateRevealState(setSavingsRevealRecord, vault, "revealing");
      try {
        await financial.revealVault(vault);
        updateRevealState(setSavingsRevealRecord, vault, "revealed");
      } catch (error) {
        updateRevealState(setSavingsRevealRecord, vault, "reveal-failed");
        throw error;
      }
    },
    [financial, updateRevealState],
  );

  const revealResult = useCallback(
    async (vault: VaultId, roundId?: bigint) => {
      const key = roundId === undefined ? vault : `${vault}:${roundId.toString()}`;
      updateRevealState(setResultRevealRecord, key, "revealing");
      try {
        await financial.revealResult(vault, roundId);
        updateRevealState(setResultRevealRecord, key, "revealed");
      } catch (error) {
        updateRevealState(setResultRevealRecord, key, "reveal-failed");
        throw error;
      }
    },
    [financial, updateRevealState],
  );

  const model = useMemo<LeopoldUiController>(() => {
    const walletSession = walletController.walletSession;
    const safeHistory = transactionItems(history);
    const latestTransaction = safeHistory[0] ?? null;
    const currentTransactionState = mapTransactionState(financial.txStage);
    const savingsRevealState = savingsRevealRecord.identityKey === auth.identityKey ? savingsRevealRecord.values : {};
    const resultRevealState = resultRevealRecord.identityKey === auth.identityKey ? resultRevealRecord.values : {};
    const vaults = leopoldConfig.vaults.map<UiVaultSummary>((vault) => {
      const publicState = financial.publicVaultState[vault.slug];
      const effectiveRound = getEffectiveVaultRoundStatus(publicState, financial.latestBlockTimestamp);
      const entered = financial.enteredVaults.has(vault.slug);
      const savingsRevealed = financial.revealedVaults.has(vault.slug);
      const resultRevealed = financial.revealedResults.has(vault.slug);
      const savingsState = savingsRevealed ? "revealed" : (savingsRevealState[vault.slug] ?? "hidden");
      const resultState = resultRevealed ? "revealed" : (resultRevealState[vault.slug] ?? "hidden");
      return {
        id: vault.slug,
        name: vault.name,
        recommended: isRecommendedVault(vault.slug),
        durationSeconds: vault.roundDurationSeconds,
        address: vault.vault.address,
        state: mapVaultState({
          contractState: publicState?.state,
          depositOpen: effectiveRound.depositOpen,
          entered,
        }),
        round: {
          id: publicState?.roundId ?? null,
          opensAt: publicState?.opensAt ?? null,
          closesAt: publicState?.closesAt ?? null,
          label: effectiveRound.label,
          publicPrizeReserve: getEffectiveVaultPublicPrize(publicState, financial.latestBlockTimestamp),
          entered,
          participantCount: publicState?.participantCount ?? null,
          settlementProgress: publicState
            ? { selectionCursor: publicState.selectionCursor, allocationCursor: publicState.allocationCursor }
            : null,
        },
        privateSavings: {
          state: savingsState,
          value: savingsRevealed ? (financial.vaultPositions[vault.slug] ?? 0n) : null,
        },
        privateResult: {
          state: resultState,
          value: resultRevealed ? (financial.privateResults[vault.slug] ?? 0n) : null,
          available: financial.fixture ? entered : entered && publicState?.state === SETTLED_ROUND_STATE,
        },
        rewards: {
          bondRefund: publicState?.refundAmount ?? null,
          bondRefundClaimed: publicState?.refundClaimed ?? false,
          settlementReward: publicState?.settlementReward ?? null,
        },
        actions: {
          revealSavings: () => revealSavings(vault.slug),
          hideSavings: () => {
            financial.hideVault(vault.slug);
            updateRevealState(setSavingsRevealRecord, vault.slug, "hidden");
          },
          save: (amount) => financial.save(vault.slug, amount),
          withdraw: (amount) => financial.withdraw(vault.slug, amount),
          enterPrizeRound: () => financial.enterRound(vault.slug),
          revealEligibility: () =>
            publicState
              ? financial.revealEligibility(vault.slug, publicState.roundId)
              : Promise.reject(new Error("ROUND_STATE_UNAVAILABLE")),
          revealResult: () =>
            publicState
              ? revealResult(vault.slug, publicState.roundId)
              : Promise.reject(new Error("ROUND_STATE_UNAVAILABLE")),
          claimBondRefund: () =>
            publicState
              ? financial.claimRefund(vault.slug, publicState.roundId)
              : Promise.reject(new Error("ROUND_STATE_UNAVAILABLE")),
          claimSettlementRewards: () => financial.claimRewards(vault.slug),
        },
      };
    });
    const completedRounds = projectCompletedVaultRounds(
      leopoldConfig.vaults,
      financial.historicalVaultRounds,
      financial.latestBlockTimestamp,
    ).map<UiHistoricalRoundSummary>((round: CompletedVaultRound) => {
      const key = `${round.vaultId}:${round.roundId.toString()}`;
      const resultRevealed = financial.revealedResultRounds.has(key);
      const eligibilityRevealed = financial.privateEligibilityByRound[key] !== undefined;
      return {
        vaultId: round.vaultId,
        vaultName: round.vaultName,
        state: "settled",
        round: {
          id: round.roundId,
          opensAt: round.opensAt,
          closesAt: round.closesAt,
          label: round.stateLabel,
          storedPrize: round.storedPrize,
          publicPrizeReserve: round.publicPrizeReserve,
          entered: true,
          participantCount: round.participantCount,
        },
        eligibility: {
          available: round.eligibilityRevealReady,
          state: eligibilityRevealed ? "revealed" : "hidden",
        },
        privateResult: {
          state: resultRevealed ? "revealed" : (resultRevealState[key] ?? "hidden"),
          value: resultRevealed ? (financial.privateResultsByRound[key] ?? 0n) : null,
          available: round.resultRevealReady,
        },
        rewards: {
          bondRefund: round.bondRefund,
          bondRefundClaimed: round.bondRefundClaimed,
          settlementReward: round.settlementReward,
        },
        actions: {
          revealEligibility: () => financial.revealEligibility(round.vaultId, round.roundId),
          revealResult: () => revealResult(round.vaultId, round.roundId),
          claimBondRefund: () => financial.claimRefund(round.vaultId, round.roundId),
        },
      };
    });

    return {
      account: {
        state: mapAccountState(auth.accountStatus),
        email: auth.email,
        emailVerified: auth.emailVerified,
        username: auth.username,
        xAvailable: auth.xEnabled,
        xLinked: auth.xLinked,
        error: auth.authError,
        actions: {
          requestEmailOtp: auth.requestEmailOtp,
          verifyEmailOtp: auth.verifyEmailOtp,
          resendEmailOtp: auth.resendEmailOtp,
          completeProfile: auth.openProfileCompletion,
          saveUsername: auth.saveUsername,
          linkX: auth.linkX,
          unlinkX: auth.unlinkX,
          signOut: auth.signOut,
        },
      },
      wallet: {
        state: mapWalletState(walletSession.status),
        financialWalletStatus: financialWalletStatus(auth.financialWalletMetadata.status),
        address: auth.verifiedFinancialWallet,
        connectedAddress: walletSession.address,
        chainId: walletSession.chainId,
        canUseFinancialActions: walletSession.canUseFinancialActions && financial.financialActionsEnabled,
        recovery: walletController.recovery,
        actions: {
          linkFinancialWallet: auth.openWalletLink,
          confirmFinancialWallet: auth.confirmCurrentWalletAsFinancial,
          connect: async () => {
            const result = await walletController.connectVerifiedWallet();
            if (!result.ok) throw new Error("WALLET_CONNECTION_FAILED");
          },
          disconnect: walletController.disconnectLeopoldWallet,
          switchToSepolia: async () => {
            const result = await walletController.switchToSepolia();
            if (!result.ok) throw new Error("NETWORK_SWITCH_FAILED");
          },
          retryNetworkHealth: async () => {
            await walletController.retryNetworkHealth();
          },
        },
      },
      balances: {
        publicUsdc: {
          state: financial.usdcBalance === null ? (financial.connected ? "loading" : "unavailable") : "available",
          value: financial.usdcBalance,
        },
        privateUsdc: {
          state: mapPrivateValueState(financial.privateBalanceStatus, financial.privateBalanceRevealed),
          value: financial.privateBalanceRevealed ? financial.privateBalance : null,
        },
        actions: {
          revealPrivateUsdc: financial.revealPrivateBalance,
          hidePrivateUsdc: financial.hidePrivateBalance,
        },
      },
      vaults,
      completedRounds,
      transactions: {
        current: {
          state: currentTransactionState,
          label: financial.txLabel,
          hash: latestTransaction?.hash ?? null,
          recoverable: currentTransactionState === "failure" && Boolean(latestTransaction?.hash),
          error: financial.error ? { code: financial.error.code, message: financial.error.message } : null,
        },
        history: safeHistory,
      },
      moneyMovement: {
        getTestUsdc: financial.acquireUsdc,
        makePrivate: financial.makePrivate,
        save: financial.save,
        withdraw: financial.withdraw,
        makePublic: financial.makePublic,
      },
      ops: { readHealth: readUiHealth },
      refresh: financial.refresh,
    };
  }, [
    auth,
    financial,
    history,
    resultRevealRecord,
    revealResult,
    revealSavings,
    savingsRevealRecord,
    updateRevealState,
    walletController,
  ]);

  if (process.env.NODE_ENV !== "production") assertUiControllerSafety(model);
  return model;
}
