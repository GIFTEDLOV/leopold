import { getAddress, isAddress, type Address } from "viem";

import rawManifest from "../../../config/leopold-frontend-contracts.json";

export const LEOPOLD_CHAIN_ID = 11_155_111;
export const CANONICAL_USDC = getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");

export type AddressStatus = "configured" | "missing" | "invalid" | "wrong-chain";
export type CheckedAddress = { status: AddressStatus; address: Address | null; reason?: string };
export type VaultId = "daily" | "weekly" | "monthly" | "boost";

export type LeopoldVaultConfig = {
  id: number;
  slug: VaultId;
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "BOOST";
  name: string;
  roundDurationSeconds: number;
  vault: CheckedAddress;
  adapter: CheckedAddress;
  bondEscrow: CheckedAddress;
};

export type LeopoldConfig = {
  chainId: number;
  networkName: string;
  deploymentStatus: string;
  canonicalUsdc: CheckedAddress;
  lcUsdc: CheckedAddress;
  registry: CheckedAddress;
  compoundComet: CheckedAddress;
  vaults: LeopoldVaultConfig[];
  ready: boolean;
  issues: string[];
};

type RawAddress = string | null;
export type RawLeopoldManifest = {
  network: { name: string; chainId: number };
  deploymentStatus: string;
  contracts: { canonicalCircleUsdc: RawAddress; lcUsdc: RawAddress; registry: RawAddress; compoundComet: RawAddress };
  officialVaults: Array<{
    id: number;
    type: "DAILY" | "WEEKLY" | "MONTHLY" | "BOOST";
    name: string;
    roundDurationSeconds: number;
    vault: RawAddress;
    adapter: RawAddress;
    bondEscrow: RawAddress;
  }>;
};

function classifyAddress(value: RawAddress, chainId: number, expectedChainId = LEOPOLD_CHAIN_ID): CheckedAddress {
  if (chainId !== expectedChainId)
    return { status: "wrong-chain", address: null, reason: `Expected chain ${expectedChainId}` };
  if (value === null || value.trim() === "") return { status: "missing", address: null };
  if (!isAddress(value, { strict: false })) return { status: "invalid", address: null };
  return { status: "configured", address: getAddress(value) };
}

export function loadLeopoldConfig(source: RawLeopoldManifest = rawManifest as RawLeopoldManifest): LeopoldConfig {
  const chainId = source.network.chainId;
  const vaults = source.officialVaults.map((vault) => ({
    id: vault.id,
    slug: vault.type.toLowerCase() as VaultId,
    type: vault.type,
    name: vault.name,
    roundDurationSeconds: vault.roundDurationSeconds,
    vault: classifyAddress(vault.vault, chainId),
    adapter: classifyAddress(vault.adapter, chainId),
    bondEscrow: classifyAddress(vault.bondEscrow, chainId),
  }));
  const canonicalUsdc = classifyAddress(source.contracts.canonicalCircleUsdc, chainId);
  const lcUsdc = classifyAddress(source.contracts.lcUsdc, chainId);
  const registry = classifyAddress(source.contracts.registry, chainId);
  const compoundComet = classifyAddress(source.contracts.compoundComet, chainId);
  const issues: string[] = [];
  if (chainId !== LEOPOLD_CHAIN_ID) issues.push("Contract manifest targets the wrong chain.");
  if (canonicalUsdc.address !== CANONICAL_USDC)
    issues.push("Canonical Circle Sepolia USDC does not match the frozen address.");
  for (const [name, item] of [
    ["Private USDC", lcUsdc],
    ["Registry", registry],
    ["Compound Comet", compoundComet],
  ] as const) {
    if (item.status !== "configured") issues.push(`${name}: ${item.status}.`);
  }
  for (const vault of vaults) {
    for (const [name, item] of [
      ["vault", vault.vault],
      ["adapter", vault.adapter],
      ["bond escrow", vault.bondEscrow],
    ] as const) {
      if (item.status !== "configured") issues.push(`${vault.name} ${name}: ${item.status}.`);
    }
  }
  return {
    chainId,
    networkName: source.network.name,
    deploymentStatus: source.deploymentStatus,
    canonicalUsdc,
    lcUsdc,
    registry,
    compoundComet,
    vaults,
    ready: issues.length === 0,
    issues,
  };
}

export const leopoldConfig = loadLeopoldConfig();

export function requireConfiguredAddress(item: CheckedAddress, label: string): Address {
  if (item.status !== "configured" || item.address === null) throw new Error(`CONFIGURATION_MISSING:${label}`);
  return item.address;
}

export function getVaultConfig(slug: string): LeopoldVaultConfig | undefined {
  return leopoldConfig.vaults.find((vault) => vault.slug === slug);
}
