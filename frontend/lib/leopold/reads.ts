import type { Address, PublicClient } from "viem";

import { adapterAbi, bondEscrowAbi, confidentialUsdcAbi, erc20Abi, registryAbi, vaultAbi } from "./abis";
import type { LeopoldConfig, LeopoldVaultConfig } from "./config";
import { CANONICAL_USDC, LEOPOLD_CHAIN_ID, requireConfiguredAddress } from "./config";

export const ROUND_STATE_LABELS = [
  "Unavailable",
  "Open",
  "Preparing draw",
  "No eligible savings",
  "Draw ready",
  "Checking ticket",
  "Checking ticket",
  "Finalizing private draw",
  "Finalizing private draw",
  "Finalizing private draw",
  "Finalizing private draw",
  "Finalizing private draw",
  "Finalizing private draw",
  "Finalizing private draw",
  "Settled",
] as const;

export type VaultPublicState = {
  roundId: bigint;
  opensAt: bigint;
  closesAt: bigint;
  state: number;
  stateLabel: string;
  publicPrize: bigint;
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

export async function readUsdcBalance(client: PublicClient, token: Address, account: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] });
}

export async function validateConfiguredDeployment(client: PublicClient, config: LeopoldConfig): Promise<void> {
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
): Promise<VaultPublicState> {
  const vault = requireConfiguredAddress(vaultConfig.vault, `${vaultConfig.name} vault`);
  const escrow = requireConfiguredAddress(vaultConfig.bondEscrow, `${vaultConfig.name} bond escrow`);
  const roundId = await client.readContract({ address: vault, abi: vaultAbi, functionName: "activeRoundId" });
  const [round, entered, eligibilityStart, bondAmount, refundAmount, refundClaimed, settlementReward] =
    await Promise.all([
      client.readContract({ address: vault, abi: vaultAbi, functionName: "roundInfo", args: [roundId] }),
      client.readContract({
        address: escrow,
        abi: bondEscrowAbi,
        functionName: "isRegistered",
        args: [roundId, account],
      }),
      client.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "eligibilityStart",
        args: [roundId, account],
      }),
      client.readContract({ address: escrow, abi: bondEscrowAbi, functionName: "BOND_AMOUNT" }),
      client.readContract({ address: escrow, abi: bondEscrowAbi, functionName: "REFUND_PER_COMPLETED_PARTICIPANT" }),
      client.readContract({
        address: escrow,
        abi: bondEscrowAbi,
        functionName: "refundClaimed",
        args: [roundId, account],
      }),
      client.readContract({
        address: escrow,
        abi: bondEscrowAbi,
        functionName: "settlementRewardCredit",
        args: [account],
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
  return client.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: kind === "principal" ? "principalOf" : "winningsOf",
    args: [account],
  });
}
