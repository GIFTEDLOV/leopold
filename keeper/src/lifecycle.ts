import type { TransactionReceipt, TransactionResponse } from "ethers";

export const SEPOLIA_CHAIN_ID = 11_155_111n;
export const SELECTION_CHUNK_SIZE = 4n;
export const ALLOCATION_CHUNK_SIZE = 4n;

export enum RoundState {
  UNINITIALIZED = 0,
  OPEN = 1,
  AGGREGATE_PENDING = 2,
  AGGREGATE_FINALIZED = 3,
  EMPTY = 4,
  CANDIDATE_VALIDITY_PENDING = 5,
  CANDIDATE_REJECTED = 6,
  TICKET_ACCEPTED = 7,
  WINNER_PROCESSING = 8,
  WINNINGS_ALLOCATED = 9,
  SETTLED = 10,
  RECONCILIATION_PENDING = 11,
  RECONCILIATION_FAILED = 12,
  READY_TO_ALLOCATE = 13,
  ALLOCATION_PROCESSING = 14,
}

export type VaultConfig = {
  readonly id: number;
  readonly name: string;
  readonly cadence: string;
  readonly address: string;
  readonly bondEscrow: string;
  readonly automaticEntry?: boolean;
};

export type RoundSnapshot = {
  readonly roundId: bigint;
  readonly opensAt: bigint;
  readonly closesAt: bigint;
  readonly state: RoundState;
  readonly publicAggregateTwab: bigint;
  readonly publicPrize: bigint;
  readonly participantCount: bigint;
  readonly selectionCursor: bigint;
  readonly allocationCursor: bigint;
  readonly candidateValidityHandle?: string;
};

export type VaultSnapshot = {
  readonly vault: VaultConfig;
  readonly activeRoundId: bigint;
  readonly bondAmount: bigint;
  readonly autoEntryCandidates: readonly AutoEntryCandidate[];
  readonly rounds: readonly RoundSnapshot[];
};

export type AutoEntryCandidate = {
  readonly account: string;
  readonly enabled: boolean;
  /** True when the wallet has already scheduled enablement at a later round. */
  readonly prospectivelyEnabled?: boolean;
  readonly availableCredit: bigint;
  readonly registered: boolean;
};

export type ProtocolSnapshot = {
  readonly chainId: bigint;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly blockTimestamp: bigint;
  readonly vaults: readonly VaultSnapshot[];
};

export type SnapshotReadHint = {
  readonly vaultAddress: string;
  readonly account?: string;
  readonly roundId?: bigint;
};

export type LifecycleActionKind =
  | "register-auto-entry"
  | "prune-auto-entry"
  | "close-round"
  | "finalize-aggregate"
  | "settle-empty-round"
  | "generate-random-candidate"
  | "finalize-candidate-validity"
  | "process-selection"
  | "finalize-reconciliation"
  | "recover-failed-reconciliation"
  | "process-allocation"
  | "finalize-settlement";

export type LifecycleAction = {
  readonly key: string;
  readonly kind: LifecycleActionKind;
  readonly vault: VaultConfig;
  readonly roundId: bigint;
  readonly cursor?: bigint;
  readonly account?: string;
};

export type PublicProof = {
  readonly abiEncodedClearValues: string;
  readonly decryptionProof: string;
};

export type SignedLifecycleTransaction = {
  readonly action: LifecycleAction;
  readonly hash: string;
  readonly nonce: number;
  readonly serialized: string;
  readonly calldataHash: string;
  readonly maximumCostWei: bigint;
  readonly gasPolicy?: {
    readonly action: LifecycleActionKind;
    readonly estimatedGas?: bigint;
    readonly gasFloor?: bigint;
    readonly multiplierBps: number;
    readonly additiveMargin: bigint;
    readonly gasLimit: bigint;
    readonly estimationFallback?: boolean;
  };
};

export type ReceiptView = Pick<TransactionReceipt, "hash" | "blockHash" | "blockNumber" | "status"> & {
  readonly confirmations: number;
};

export interface PublicProofProvider {
  publicDecrypt(handle: string): Promise<PublicProof>;
}

export interface KeeperCheckpointStore {
  getCheckpoint(key: string): Promise<string | undefined>;
  putCheckpoint(key: string, value: string): Promise<void>;
}

export interface KeeperGateway {
  readonly keeperAddress: string;
  getChainId(): Promise<bigint>;
  getKeeperBalance(): Promise<bigint>;
  readSnapshot(requiredAutoEntry?: SnapshotReadHint): Promise<ProtocolSnapshot>;
  encodeAction(action: LifecycleAction): Promise<string>;
  simulate(action: LifecycleAction, data: string): Promise<void>;
  sign(action: LifecycleAction, data: string): Promise<SignedLifecycleTransaction>;
  broadcast(transaction: SignedLifecycleTransaction): Promise<string>;
  getReceipt(hash: string): Promise<ReceiptView | null>;
  getTransaction(hash: string): Promise<Pick<TransactionResponse, "hash" | "nonce"> | null>;
  getTransactionCount(blockTag: "latest" | "pending"): Promise<number>;
}

export type KeeperLogFields = Record<string, boolean | number | string | null | undefined>;

export interface KeeperLogger {
  debug(fields: KeeperLogFields, message: string): void;
  info(fields: KeeperLogFields, message: string): void;
  warn(fields: KeeperLogFields, message: string): void;
  error(fields: KeeperLogFields, message: string): void;
}
