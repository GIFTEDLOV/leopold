import type { Address, PublicClient } from "viem";

import { adapterAbi, bondEscrowAbi, confidentialUsdcAbi, erc20Abi, registryAbi, vaultAbi } from "./abis";
import type { LeopoldConfig, LeopoldVaultConfig } from "./config";
import { CANONICAL_USDC, LEOPOLD_CHAIN_ID, requireConfiguredAddress } from "./config";
import { withReadReliability } from "@/lib/ops/reliability";

export const ROUND_STATE_LABELS = [
  "Unavailable",
  "Open",
  "Preparing draw",
  "Draw ready",
  "No eligible savings",
  "Checking ticket",
  "Checking ticket",
  "Finalizing private draw",
  "Finalizing private draw",
  "Finalizing private draw",
  "Settled",
  "Finalizing private draw",
  "Finalizing private draw",
  "Preparing allocation",
  "Finalizing private draw",
] as const;

export const SETTLED_ROUND_STATE = 10;

export type VaultPublicState = {
  roundId: bigint;
  opensAt: bigint;
  closesAt: bigint;
  state: number;
  stateLabel: string;
  publicPrize: bigint;
  publicSponsoredPrize: bigint;
  participantCount: bigint;
  selectionCursor: bigint;
  allocationCursor: bigint;
  entered: boolean;
  eligibilityStart: bigint;
  bondAmount: bigint;
  refundAmount: bigint;
  refundClaimed: boolean;
  settlementReward: bigint;
};

export type EffectiveVaultRoundStatus = {
  code: "OPEN" | "NOT_STARTED" | "ENDED" | "SETTLEMENT" | "UNAVAILABLE";
  label: string;
  depositOpen: boolean;
};

/**
 * The contract's `_isActiveRoundOpen` predicate is the authority for deposits:
 * the stored state must be OPEN and the chain timestamp must be within the
 * half-open [opensAt, closesAt) interval. Callers must provide a block-derived
 * timestamp; browser wall-clock time is deliberately not accepted here.
 */
export function getEffectiveVaultRoundStatus(
  state: Pick<VaultPublicState, "state" | "stateLabel" | "opensAt" | "closesAt"> | undefined,
  blockTimestamp: bigint | null,
): EffectiveVaultRoundStatus {
  if (!state) return { code: "UNAVAILABLE", label: "Round unavailable", depositOpen: false };
  if (state.state !== 1) return { code: "SETTLEMENT", label: state.stateLabel, depositOpen: false };
  if (blockTimestamp === null) return { code: "UNAVAILABLE", label: "Checking round", depositOpen: false };
  if (blockTimestamp < state.opensAt) return { code: "NOT_STARTED", label: "Round not started", depositOpen: false };
  if (blockTimestamp >= state.closesAt) return { code: "ENDED", label: "Round ended", depositOpen: false };
  return { code: "OPEN", label: "Open", depositOpen: true };
}

export function isVaultRoundOpen(
  state: Pick<VaultPublicState, "state" | "opensAt" | "closesAt">,
  blockTimestamp: bigint,
): boolean {
  return getEffectiveVaultRoundStatus({ ...state, stateLabel: "" }, blockTimestamp).depositOpen;
}

/**
 * The stored round prize is finalized when the round closes. While the active
 * round is open, sponsorship is held in a separate public accumulator and is
 * part of the user-facing prize preview. It must not be added after the round
 * leaves the open interval because closeRound snapshots that amount into the
 * stored prize.
 */
export function getEffectiveVaultPublicPrize(
  state: Pick<
    VaultPublicState,
    "state" | "stateLabel" | "opensAt" | "closesAt" | "publicPrize" | "publicSponsoredPrize"
  > | undefined,
  blockTimestamp: bigint | null,
): bigint | null {
  if (!state) return null;
  const status = getEffectiveVaultRoundStatus(state, blockTimestamp);
  if (status.code === "UNAVAILABLE") return null;
  return state.publicPrize + (status.code === "OPEN" ? state.publicSponsoredPrize : 0n);
}

export function canPrepareVaultWithdrawal(
  state: Pick<VaultPublicState, "state" | "opensAt" | "closesAt" | "stateLabel"> | undefined,
  blockTimestamp: bigint | null,
): boolean {
  const status = getEffectiveVaultRoundStatus(state, blockTimestamp);
  return status.code === "OPEN" || status.code === "ENDED";
}

export async function readUsdcBalance(client: PublicClient, token: Address, account: Address): Promise<bigint> {
  return withReadReliability(
    () => client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    { operation: "PUBLIC_BALANCE_READ" },
  );
}

export async function validateConfiguredDeployment(client: PublicClient, config: LeopoldConfig): Promise<void> {
  return withReadReliability(() => validateConfiguredDeploymentOnce(client, config), {
    operation: "DEPLOYMENT_READ",
  });
}

async function validateConfiguredDeploymentOnce(client: PublicClient, config: LeopoldConfig): Promise<void> {
  if (!config.ready) throw new Error("CONFIGURATION_MISSING:manifest");
  if ((await client.getChainId()) !== LEOPOLD_CHAIN_ID) throw new Error("WRONG_NETWORK:rpc");
  const registry = requireConfiguredAddress(config.registry, "Registry");
  const lcUsdc = requireConfiguredAddress(config.lcUsdc, "Private USDC");
  const addresses = [
    registry,
    lcUsdc,
    ...config.vaults.flatMap((vault) => [
      requireConfiguredAddress(vault.vault, `${vault.name} vault`),
      requireConfiguredAddress(vault.adapter, `${vault.name} adapter`),
      requireConfiguredAddress(vault.bondEscrow, `${vault.name} escrow`),
    ]),
  ];
  const code = await Promise.all(addresses.map((address) => client.getCode({ address })));
  if (code.some((item) => !item || item === "0x")) throw new Error("CONFIGURATION_MISSING:contract bytecode");
  const underlying = await client.readContract({
    address: lcUsdc,
    abi: confidentialUsdcAbi,
    functionName: "underlying",
  });
  if (underlying.toLowerCase() !== CANONICAL_USDC.toLowerCase())
    throw new Error("CONFIGURATION_MISSING:wrapper underlying mismatch");
  for (const vaultConfig of config.vaults) {
    const vault = requireConfiguredAddress(vaultConfig.vault, `${vaultConfig.name} vault`);
    const adapter = requireConfiguredAddress(vaultConfig.adapter, `${vaultConfig.name} adapter`);
    const escrow = requireConfiguredAddress(vaultConfig.bondEscrow, `${vaultConfig.name} escrow`);
    const official = await client.readContract({
      address: registry,
      abi: registryAbi,
      functionName: "officialVault",
      args: [vaultConfig.id],
    });
    const [asset, vaultUnderlying, strategy, vaultEscrow, duration, adapterVault, adapterAsset, comet] =
      await Promise.all([
        client.readContract({ address: vault, abi: vaultAbi, functionName: "ASSET" }),
        client.readContract({ address: vault, abi: vaultAbi, functionName: "UNDERLYING" }),
        client.readContract({ address: vault, abi: vaultAbi, functionName: "STRATEGY" }),
        client.readContract({ address: vault, abi: vaultAbi, functionName: "SETTLEMENT_BOND_ESCROW" }),
        client.readContract({ address: vault, abi: vaultAbi, functionName: "ROUND_DURATION" }),
        client.readContract({ address: adapter, abi: adapterAbi, functionName: "vault" }),
        client.readContract({ address: adapter, abi: adapterAbi, functionName: "asset" }),
        client.readContract({ address: adapter, abi: adapterAbi, functionName: "COMET" }),
      ]);
    const expectedComet = requireConfiguredAddress(config.compoundComet, "Compound Comet");
    const values = [
      official.vault,
      official.asset,
      official.strategy,
      official.comet,
      official.bondEscrow,
      asset,
      vaultUnderlying,
      strategy,
      vaultEscrow,
      adapterVault,
      adapterAsset,
      comet,
    ].map((value) => value.toLowerCase());
    const expected = [
      vault,
      lcUsdc,
      adapter,
      expectedComet,
      escrow,
      lcUsdc,
      CANONICAL_USDC,
      adapter,
      escrow,
      vault,
      CANONICAL_USDC,
      expectedComet,
    ].map((value) => value.toLowerCase());
    if (
      !official.active ||
      official.vaultType !== vaultConfig.id - 1 ||
      official.roundDuration !== BigInt(vaultConfig.roundDurationSeconds) ||
      duration !== BigInt(vaultConfig.roundDurationSeconds) ||
      values.some((value, index) => value !== expected[index])
    ) {
      throw new Error(`CONFIGURATION_MISSING:${vaultConfig.name} deployment integrity mismatch`);
    }
  }
}

export async function readVaultPublicState(
  client: PublicClient,
  vaultConfig: LeopoldVaultConfig,
  account: Address,
  blockNumber?: bigint,
): Promise<VaultPublicState> {
  return withReadReliability(() => readVaultPublicStateOnce(client, vaultConfig, account, blockNumber), {
    operation: "VAULT_READ",
  });
}

export async function readVaultPublicStateForRound(
  client: PublicClient,
  vaultConfig: LeopoldVaultConfig,
  account: Address,
  roundId: bigint,
  blockNumber?: bigint,
): Promise<VaultPublicState> {
  return withReadReliability(() => readVaultPublicStateForRoundOnce(client, vaultConfig, account, roundId, blockNumber), {
    operation: "VAULT_READ",
  });
}

/**
 * Reads every initialized round through the active round cursor. The round
 * records and account-specific registration/refund reads remain authoritative
 * contract state; no browser-side round history is used.
 */
export async function readVaultPublicHistory(
  client: PublicClient,
  vaultConfig: LeopoldVaultConfig,
  account: Address,
  blockNumber?: bigint,
): Promise<VaultPublicState[]> {
  return withReadReliability(
    async () => {
      const blockTag = blockNumber === undefined ? {} : { blockNumber };
      const vault = requireConfiguredAddress(vaultConfig.vault, `${vaultConfig.name} vault`);
      const activeRoundId = await client.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "activeRoundId",
        ...blockTag,
      });
      if (activeRoundId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ROUND_HISTORY_RANGE_UNSAFE");
      return Promise.all(
        Array.from({ length: Number(activeRoundId) }, (_, index) =>
          readVaultPublicStateForRoundOnce(client, vaultConfig, account, BigInt(index + 1), blockNumber),
        ),
      );
    },
    { operation: "VAULT_READ" },
  );
}

async function readVaultPublicStateOnce(
  client: PublicClient,
  vaultConfig: LeopoldVaultConfig,
  account: Address,
  blockNumber?: bigint,
): Promise<VaultPublicState> {
  const vault = requireConfiguredAddress(vaultConfig.vault, `${vaultConfig.name} vault`);
  const blockTag = blockNumber === undefined ? {} : { blockNumber };
  const roundId = await client.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "activeRoundId",
    ...blockTag,
  });
  return readVaultPublicStateForRoundOnce(client, vaultConfig, account, roundId, blockNumber);
}

async function readVaultPublicStateForRoundOnce(
  client: PublicClient,
  vaultConfig: LeopoldVaultConfig,
  account: Address,
  roundId: bigint,
  blockNumber?: bigint,
): Promise<VaultPublicState> {
  const vault = requireConfiguredAddress(vaultConfig.vault, `${vaultConfig.name} vault`);
  const escrow = requireConfiguredAddress(vaultConfig.bondEscrow, `${vaultConfig.name} bond escrow`);
  const blockTag = blockNumber === undefined ? {} : { blockNumber };
  const [round, sponsoredPrize, entered, eligibilityStart, bondAmount, refundAmount, refundClaimed, settlementReward] =
    await Promise.all([
      client.readContract({ address: vault, abi: vaultAbi, functionName: "roundInfo", args: [roundId], ...blockTag }),
      client.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "publicSponsoredPrize",
        args: [roundId],
        ...blockTag,
      }),
      client.readContract({
        address: escrow,
        abi: bondEscrowAbi,
        functionName: "isRegistered",
        args: [roundId, account],
        ...blockTag,
      }),
      client.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "eligibilityStart",
        args: [roundId, account],
        ...blockTag,
      }),
      client.readContract({ address: escrow, abi: bondEscrowAbi, functionName: "BOND_AMOUNT", ...blockTag }),
      client.readContract({
        address: escrow,
        abi: bondEscrowAbi,
        functionName: "REFUND_PER_COMPLETED_PARTICIPANT",
        ...blockTag,
      }),
      client.readContract({
        address: escrow,
        abi: bondEscrowAbi,
        functionName: "refundClaimed",
        args: [roundId, account],
        ...blockTag,
      }),
      client.readContract({
        address: escrow,
        abi: bondEscrowAbi,
        functionName: "settlementRewardCredit",
        args: [account],
        ...blockTag,
      }),
    ]);
  const state = Number(round[2]);
  return {
    roundId,
    opensAt: round[0],
    closesAt: round[1],
    state,
    stateLabel: ROUND_STATE_LABELS[state] ?? "Finalizing private draw",
    publicPrize: round[4],
    publicSponsoredPrize: sponsoredPrize,
    participantCount: round[5],
    selectionCursor: round[6],
    allocationCursor: round[7],
    entered,
    eligibilityStart,
    bondAmount,
    refundAmount,
    refundClaimed,
    settlementReward,
  };
}

export async function readPrivateHandle(
  client: PublicClient,
  vault: Address,
  account: Address,
  kind: "principal" | "winnings",
): Promise<`0x${string}`> {
  return withReadReliability(
    () =>
      client.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: kind === "principal" ? "principalOf" : "winningsOf",
        args: [account],
      }),
    { operation: "PRIVATE_HANDLE_READ" },
  );
}

export async function readLatestBlock(client: PublicClient) {
  return withReadReliability(() => client.getBlock(), { operation: "VAULT_READ" });
}
