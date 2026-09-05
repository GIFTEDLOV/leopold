import {
  Contract,
  FallbackProvider,
  Interface,
  JsonRpcProvider,
  Wallet,
  getAddress,
  getBigInt,
  keccak256,
  type AbstractProvider,
} from "ethers";

import { LEOPOLD_BOND_ESCROW_ABI, LEOPOLD_VAULT_ABI } from "./abi.js";
import {
  type KeeperGateway,
  type KeeperCheckpointStore,
  type LifecycleAction,
  type ProtocolSnapshot,
  type PublicProofProvider,
  type ReceiptView,
  RoundState,
  SEPOLIA_CHAIN_ID,
  type SignedLifecycleTransaction,
  type SnapshotReadHint,
  type VaultConfig,
  type VaultSnapshot,
} from "./lifecycle.js";
import { actionChunkSize } from "./planner.js";
import { applyGasPolicy, DEFAULT_GAS_POLICY, type GasPolicyConfig } from "./gas-policy.js";

const vaultInterface = new Interface(LEOPOLD_VAULT_ABI);
const escrowInterface = new Interface(LEOPOLD_BOND_ESCROW_ABI);

/**
 * Sepolia normally advances in roughly twelve-second blocks. Two blocks is a
 * deliberately small safety window: it absorbs ordinary head timing while
 * still failing closed if an endpoint is materially behind the quorum.
 */
export const MAX_ALLOWED_RPC_HEAD_LAG_BLOCKS = 2;

export function circularScanPage(
  count: bigint,
  cursor: bigint,
  maximumPageSize: number,
): { readonly indexes: readonly bigint[]; readonly nextCursor: bigint } {
  if (count < 0n || cursor < 0n || !Number.isInteger(maximumPageSize) || maximumPageSize < 1) {
    throw new Error("Invalid circular scan bounds");
  }
  if (count === 0n) return { indexes: [], nextCursor: 0n };
  const start = cursor % count;
  const pageSize = count < BigInt(maximumPageSize) ? count : BigInt(maximumPageSize);
  return {
    indexes: Array.from({ length: Number(pageSize) }, (_, offset) => (start + BigInt(offset)) % count),
    nextCursor: (start + pageSize) % count,
  };
}

export function createStrictProvider(rpcUrls: readonly string[]): AbstractProvider {
  const providers = rpcUrls.map((url) => new JsonRpcProvider(url));
  if (providers.length === 1 && providers[0]) return providers[0];
  return new FallbackProvider(
    providers.map((provider) => ({ provider, priority: 1, stallTimeout: 2_000, weight: 1 })),
    Number(SEPOLIA_CHAIN_ID),
    { quorum: providers.length },
  );
}

export type RpcBlockIdentity = {
  readonly number: number;
  readonly hash: string;
  readonly timestamp: number;
};

type RpcChainIdEndpoint = {
  readonly send: (method: string, parameters: readonly unknown[]) => Promise<unknown>;
};

export function assertAgreedBlockIdentities(blocks: readonly RpcBlockIdentity[]): RpcBlockIdentity {
  const first = blocks[0];
  if (!first) throw new Error("RPC block agreement requires at least one endpoint");
  if (
    blocks.some(
      (block) =>
        block.number !== first.number ||
        block.hash.toLowerCase() !== first.hash.toLowerCase() ||
        block.timestamp !== first.timestamp,
    )
  ) {
    throw new Error("RPC endpoints disagree on the authoritative block identity");
  }
  return first;
}

type RpcBlockIdentityCandidate = {
  readonly number: number;
  readonly hash: string | null | undefined;
  readonly timestamp: number;
};

export function requireCompleteBlockIdentity(
  block: RpcBlockIdentityCandidate | null | undefined,
): RpcBlockIdentity {
  if (!block?.hash) throw new Error("RPC returned no complete block identity");
  return { number: block.number, hash: block.hash, timestamp: block.timestamp };
}

export function selectCommonBlockHeight(latestBlocks: readonly RpcBlockIdentity[]): number {
  if (latestBlocks.length === 0) throw new Error("RPC block agreement requires at least one endpoint");
  const latestHeight = latestBlocks.map((block) => block.number);
  const minimum = Math.min(...latestHeight);
  const maximum = Math.max(...latestHeight);
  if (maximum - minimum > MAX_ALLOWED_RPC_HEAD_LAG_BLOCKS) {
    throw new Error(`RPC head lag exceeds ${MAX_ALLOWED_RPC_HEAD_LAG_BLOCKS} blocks`);
  }
  return minimum;
}

export function assertPinnedBlockIdentity(
  expected: RpcBlockIdentity,
  pinnedBlocks: readonly RpcBlockIdentity[],
): RpcBlockIdentity {
  const canonical = assertAgreedBlockIdentities(pinnedBlocks);
  if (
    canonical.number !== expected.number ||
    canonical.hash.toLowerCase() !== expected.hash.toLowerCase() ||
    canonical.timestamp !== expected.timestamp
  ) {
    throw new Error("Pinned block was reorganized during snapshot construction");
  }
  return canonical;
}

export async function verifySepoliaRpcIdentity(endpoints: readonly RpcChainIdEndpoint[]): Promise<bigint> {
  if (endpoints.length === 0) throw new Error("At least one RPC endpoint is required");
  const chainIds = await Promise.all(
    endpoints.map(async (endpoint) => {
      const result = await endpoint.send("eth_chainId", []);
      if (typeof result !== "string" || !/^0x[0-9a-fA-F]+$/u.test(result)) {
        throw new Error("RPC endpoint returned an invalid eth_chainId");
      }
      return BigInt(result);
    }),
  );
  if (chainIds.some((chainId) => chainId !== SEPOLIA_CHAIN_ID)) {
    throw new Error(`Every RPC endpoint must report Sepolia chain ${SEPOLIA_CHAIN_ID}`);
  }
  return SEPOLIA_CHAIN_ID;
}

export async function persistentCircularScanPage(
  count: bigint,
  checkpointKey: string,
  maximumPageSize: number,
  checkpoints: KeeperCheckpointStore,
) {
  const encodedCursor = await checkpoints.getCheckpoint(checkpointKey);
  if (encodedCursor !== undefined && !/^\d+$/u.test(encodedCursor)) throw new Error("Persisted scan cursor is invalid");
  const page = circularScanPage(count, encodedCursor === undefined ? 0n : BigInt(encodedCursor), maximumPageSize);
  await checkpoints.putCheckpoint(checkpointKey, page.nextCursor.toString());
  return page;
}

export class EthersKeeperGateway implements KeeperGateway {
  readonly #provider: AbstractProvider;
  readonly #primaryProvider: JsonRpcProvider;
  readonly #rpcProviders: readonly JsonRpcProvider[];
  readonly #wallet: Wallet;
  readonly #vaults: readonly VaultConfig[];
  readonly #proofProvider: PublicProofProvider;
  readonly #autoEntryScanSize: number;
  readonly #historicalScanSize: number;
  readonly #checkpoints: KeeperCheckpointStore;
  readonly #gasPolicy: GasPolicyConfig;

  readonly keeperAddress: string;

  constructor(options: {
    readonly rpcUrls: readonly string[];
    readonly privateKey: string;
    readonly vaults: readonly VaultConfig[];
    readonly proofProvider: PublicProofProvider;
    readonly autoEntryScanSize: number;
    readonly historicalScanSize: number;
    readonly gasPolicy?: GasPolicyConfig;
    readonly checkpoints: KeeperCheckpointStore;
  }) {
    if (options.rpcUrls.length === 0 || options.rpcUrls.some((url) => url.trim().length === 0)) {
      throw new Error("At least one non-empty RPC URL is required");
    }
    if (
      !Number.isInteger(options.autoEntryScanSize) ||
      options.autoEntryScanSize < 1 ||
      options.autoEntryScanSize > 500
    ) {
      throw new Error("Auto-entry scan size must be an integer from 1 through 500");
    }
    this.#provider = createStrictProvider(options.rpcUrls);
    this.#rpcProviders = options.rpcUrls.map((url) => new JsonRpcProvider(url));
    const primaryProvider = this.#rpcProviders[0];
    if (!primaryProvider) throw new Error("At least one RPC URL is required");
    this.#primaryProvider = primaryProvider;
    this.#wallet = new Wallet(options.privateKey, this.#provider);
    this.#vaults = options.vaults;
    this.#proofProvider = options.proofProvider;
    this.#autoEntryScanSize = options.autoEntryScanSize;
    if (
      !Number.isInteger(options.historicalScanSize) ||
      options.historicalScanSize < 1 ||
      options.historicalScanSize > 500
    ) {
      throw new Error("Historical scan size must be an integer from 1 through 500");
    }
    this.#historicalScanSize = options.historicalScanSize;
    this.#checkpoints = options.checkpoints;
    this.#gasPolicy = options.gasPolicy ?? DEFAULT_GAS_POLICY;
    this.keeperAddress = getAddress(this.#wallet.address);
  }

  async getChainId(): Promise<bigint> {
    return verifySepoliaRpcIdentity(this.#rpcProviders as unknown as readonly RpcChainIdEndpoint[]);
  }

  async getKeeperBalance(): Promise<bigint> {
    return this.#provider.getBalance(this.keeperAddress);
  }

  async #readVault(vault: VaultConfig, blockTag: number, requiredAutoEntry?: SnapshotReadHint): Promise<VaultSnapshot> {
    const contract = new Contract(vault.address, LEOPOLD_VAULT_ABI, this.#provider);
    const [activeRoundId, configuredEscrowAddress] = (await Promise.all([
      contract.getFunction("activeRoundId")({ blockTag }),
      contract.getFunction("SETTLEMENT_BOND_ESCROW")({ blockTag }),
    ])) as readonly [bigint, string];
    if (activeRoundId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Active round id exceeds safe read bounds");
    const escrowAddress = getAddress(configuredEscrowAddress);
    if (escrowAddress !== getAddress(vault.bondEscrow)) {
      throw new Error(`Manifest escrow mismatch for vault ${vault.name}`);
    }
    const escrow = new Contract(escrowAddress, LEOPOLD_BOND_ESCROW_ABI, this.#provider);
    const [escrowVault, bondAmount] = (await Promise.all([
      escrow.getFunction("VAULT")({ blockTag }),
      escrow.getFunction("BOND_AMOUNT")({ blockTag }),
    ])) as readonly [string, bigint];
    if (getAddress(escrowVault) !== getAddress(vault.address)) {
      throw new Error(`Escrow backpointer mismatch for vault ${vault.name}`);
    }
    const historicalPage = await persistentCircularScanPage(
      activeRoundId > 0n ? activeRoundId - 1n : 0n,
      `historical:${vault.address.toLowerCase()}`,
      this.#historicalScanSize,
      this.#checkpoints,
    );
    const roundIds = historicalPage.indexes.map((index) => index + 1n);
    roundIds.push(activeRoundId);
    if (
      requiredAutoEntry?.roundId !== undefined &&
      requiredAutoEntry.vaultAddress.toLowerCase() === vault.address.toLowerCase() &&
      requiredAutoEntry.roundId > 0n &&
      requiredAutoEntry.roundId <= activeRoundId &&
      !roundIds.includes(requiredAutoEntry.roundId)
    ) {
      roundIds.push(requiredAutoEntry.roundId);
    }
    const rounds = await Promise.all(
      roundIds.map(async (roundId) => {
        const result = (await contract.getFunction("roundInfo")(roundId, { blockTag })) as unknown as readonly [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
        ];
        const state = Number(result[2]) as RoundState;
        const candidateValidityHandle =
          state === RoundState.CANDIDATE_VALIDITY_PENDING || state === RoundState.CANDIDATE_REJECTED
            ? ((await contract.getFunction("candidateValidityHandle")(roundId, { blockTag })) as string)
            : undefined;
        return {
          roundId,
          opensAt: result[0],
          closesAt: result[1],
          state,
          publicAggregateTwab: result[3],
          publicPrize: result[4],
          participantCount: result[5],
          selectionCursor: result[6],
          allocationCursor: result[7],
          ...(candidateValidityHandle === undefined ? {} : { candidateValidityHandle }),
        };
      }),
    );
    const autoEntryCandidates = vault.automaticEntry
      ? await this.#readAutoEntryCandidates(escrow, vault, activeRoundId, blockTag, requiredAutoEntry)
      : [];
    return { vault, activeRoundId, bondAmount, autoEntryCandidates, rounds };
  }

  async #readAutoEntryCandidates(
    contract: Contract,
    vault: VaultConfig,
    roundId: bigint,
    blockTag: number,
    requiredAutoEntry?: SnapshotReadHint,
  ) {
    const count = (await contract.getFunction("autoEntryAccountCount")({ blockTag })) as bigint;
    if (count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Auto-entry account count exceeds safe read bounds");
    const cursorKey = vault.address.toLowerCase();
    const page = await persistentCircularScanPage(
      count,
      `auto-entry:${cursorKey}`,
      this.#autoEntryScanSize,
      this.#checkpoints,
    );
    const accounts = await Promise.all(
      page.indexes.map(async (index) =>
        getAddress((await contract.getFunction("autoEntryAccountAt")(index, { blockTag })) as string),
      ),
    );
    const requiredAccount = requiredAutoEntry?.account;
    const requiredVaultAddress = requiredAutoEntry?.vaultAddress;
    if (
      requiredAccount !== undefined &&
      requiredVaultAddress !== undefined &&
      requiredVaultAddress.toLowerCase() === cursorKey &&
      !accounts.some((account) => account.toLowerCase() === requiredAccount.toLowerCase())
    ) {
      accounts.push(getAddress(requiredAccount));
    }
    return Promise.all(
      accounts.map(async (account) => {
        const [enabled, availableCredit, registered, preference] = (await Promise.all([
          contract.getFunction("isAutoEntryEnabled")(account, roundId, { blockTag }),
          contract.getFunction("automationBondCredit")(account, { blockTag }),
          contract.getFunction("isRegistered")(roundId, account, { blockTag }),
          contract.getFunction("autoEntryPreference")(account, { blockTag }),
        ])) as readonly [boolean, bigint, boolean, readonly [boolean, boolean, bigint]];
        return { account, enabled, prospectivelyEnabled: preference[1], availableCredit, registered };
      }),
    );
  }

  async readSnapshot(requiredAutoEntry?: SnapshotReadHint): Promise<ProtocolSnapshot> {
    await this.getChainId();
    const latestBlocks = await Promise.all(
      this.#rpcProviders.map(async (provider) => {
        const candidate = requireCompleteBlockIdentity(await provider.getBlock("latest"));
        return { number: candidate.number, hash: candidate.hash, timestamp: candidate.timestamp };
      }),
    );
    const commonBlockNumber = selectCommonBlockHeight(latestBlocks);
    const commonBlocks = await Promise.all(
      this.#rpcProviders.map(async (provider) => {
        const candidate = requireCompleteBlockIdentity(await provider.getBlock(commonBlockNumber));
        return { number: candidate.number, hash: candidate.hash, timestamp: candidate.timestamp };
      }),
    );
    const block = assertAgreedBlockIdentities(commonBlocks);
    const vaults = await Promise.all(
      this.#vaults.map((vault) => this.#readVault(vault, block.number, requiredAutoEntry)),
    );
    const canonicalBlocks = await Promise.all(
      this.#rpcProviders.map(async (provider) => {
        const candidate = requireCompleteBlockIdentity(await provider.getBlock(block.number));
        return { number: candidate.number, hash: candidate.hash, timestamp: candidate.timestamp };
      }),
    );
    assertPinnedBlockIdentity(block, canonicalBlocks);
    return {
      chainId: SEPOLIA_CHAIN_ID,
      blockNumber: BigInt(block.number),
      blockHash: block.hash,
      blockTimestamp: BigInt(block.timestamp),
      vaults,
    };
  }

  async #publicProof(roundId: bigint, address: string, handleFunction: string) {
    const contract = new Contract(address, LEOPOLD_VAULT_ABI, this.#provider);
    const handle = (await contract.getFunction(handleFunction)(roundId)) as string;
    return this.#proofProvider.publicDecrypt(handle);
  }

  async encodeAction(action: LifecycleAction): Promise<string> {
    switch (action.kind) {
      case "register-auto-entry":
        if (!action.account) throw new Error("Auto-entry action is missing its participant account");
        return escrowInterface.encodeFunctionData("registerForRoundFor", [action.account, action.roundId]);
      case "prune-auto-entry":
        if (!action.account) throw new Error("Auto-entry prune action is missing its participant account");
        return escrowInterface.encodeFunctionData("pruneAutoEntryAccount", [action.account]);
      case "close-round":
        return vaultInterface.encodeFunctionData("closeRound");
      case "finalize-aggregate": {
        const proof = await this.#publicProof(action.roundId, action.vault.address, "aggregateTwabHandle");
        return vaultInterface.encodeFunctionData("finalizeAggregate", [
          action.roundId,
          proof.abiEncodedClearValues,
          proof.decryptionProof,
        ]);
      }
      case "settle-empty-round":
        return vaultInterface.encodeFunctionData("settleEmptyRound", [action.roundId]);
      case "generate-random-candidate":
        return vaultInterface.encodeFunctionData("generateRandomCandidate", [action.roundId]);
      case "finalize-candidate-validity": {
        const proof = await this.#publicProof(action.roundId, action.vault.address, "candidateValidityHandle");
        return vaultInterface.encodeFunctionData("finalizeCandidateValidity", [
          action.roundId,
          proof.abiEncodedClearValues,
          proof.decryptionProof,
        ]);
      }
      case "process-selection":
        return vaultInterface.encodeFunctionData("processSelection", [action.roundId, actionChunkSize(action)]);
      case "finalize-reconciliation": {
        const proof = await this.#publicProof(action.roundId, action.vault.address, "reconciliationHandle");
        return vaultInterface.encodeFunctionData("finalizeSelectionReconciliation", [
          action.roundId,
          proof.abiEncodedClearValues,
          proof.decryptionProof,
        ]);
      }
      case "recover-failed-reconciliation":
        return vaultInterface.encodeFunctionData("recoverFailedReconciliation", [action.roundId]);
      case "process-allocation":
        return vaultInterface.encodeFunctionData("processAllocation", [action.roundId, actionChunkSize(action)]);
      case "finalize-settlement":
        return vaultInterface.encodeFunctionData("finalizeSettlement", [action.roundId]);
    }
  }

  async simulate(action: LifecycleAction, data: string): Promise<void> {
    await this.#provider.call({ from: this.keeperAddress, to: this.#target(action), data });
  }

  async sign(action: LifecycleAction, data: string): Promise<SignedLifecycleTransaction> {
    const target = this.#target(action);
    let estimatedGas: bigint | undefined;
    let estimationFallback = false;
    try {
      estimatedGas = await this.#provider.estimateGas({ from: this.keeperAddress, to: target, data });
    } catch (error) {
      const floor = this.#gasPolicy.floors[action.kind];
      if (floor === undefined) throw error;
      estimationFallback = true;
    }
    const gasPolicy = applyGasPolicy(action.kind, estimatedGas, this.#gasPolicy, estimationFallback);
    const request = await this.#wallet.populateTransaction({ to: target, data, gasLimit: gasPolicy.gasLimit });
    const serialized = await this.#wallet.signTransaction(request);
    const nonce = request.nonce;
    if (nonce === undefined || nonce === null || request.gasLimit === undefined || request.gasLimit === null) {
      throw new Error("RPC did not populate transaction nonce/gas limit");
    }
    const feePerGas = request.maxFeePerGas ?? request.gasPrice;
    if (feePerGas === undefined || feePerGas === null) throw new Error("RPC did not populate transaction fee");
    return {
      action,
      hash: keccak256(serialized),
      nonce,
      serialized,
      calldataHash: keccak256(data),
      maximumCostWei:
        getBigInt(request.gasLimit) * getBigInt(feePerGas) +
        (request.value === undefined || request.value === null ? 0n : getBigInt(request.value)),
      gasPolicy,
    };
  }

  async broadcast(transaction: SignedLifecycleTransaction): Promise<string> {
    return (await this.#primaryProvider.broadcastTransaction(transaction.serialized)).hash;
  }

  async getReceipt(hash: string): Promise<ReceiptView | null> {
    const receipt = await this.#provider.getTransactionReceipt(hash);
    if (!receipt) return null;
    return {
      hash: receipt.hash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      confirmations: await receipt.confirmations(),
    };
  }

  async getTransaction(hash: string) {
    const transaction = await this.#provider.getTransaction(hash);
    return transaction ? { hash: transaction.hash, nonce: transaction.nonce } : null;
  }

  async getTransactionCount(blockTag: "latest" | "pending"): Promise<number> {
    return this.#provider.getTransactionCount(this.keeperAddress, blockTag);
  }

  #target(action: LifecycleAction): string {
    return action.kind === "register-auto-entry" || action.kind === "prune-auto-entry"
      ? action.vault.bondEscrow
      : action.vault.address;
  }
}
