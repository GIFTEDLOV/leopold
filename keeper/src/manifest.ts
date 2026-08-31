import { readFile } from "node:fs/promises";
import { getAddress } from "ethers";
import { z } from "zod";

import { SEPOLIA_CHAIN_ID, type VaultConfig } from "./lifecycle.js";

const manifestSchema = z.object({
  schema: z.literal("leopold.frontend-contract-manifest.v1"),
  network: z.object({
    name: z.literal("ethereum-sepolia"),
    chainId: z.number().int(),
  }),
  deploymentStatus: z.literal("OFFICIAL_SEPOLIA_DEPLOYED"),
  officialVaults: z
    .array(
      z
        .object({
          id: z.number().int().positive(),
          type: z.string().min(1),
          name: z.string().min(1),
          vault: z.string(),
          bondEscrow: z.string(),
          implementation: z.enum(["v1", "v2"]).default("v1"),
          automaticEntry: z.boolean().default(false),
        })
        .superRefine((vault, context) => {
          if (vault.automaticEntry && vault.implementation !== "v2") {
            context.addIssue({
              code: "custom",
              path: ["implementation"],
              message: "Automatic entry requires an explicit V2 vault/escrow implementation marker",
            });
          }
        }),
    )
    .min(1),
});

export async function loadOfficialVaults(manifestPath: string): Promise<readonly VaultConfig[]> {
  const parsed = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  if (BigInt(parsed.network.chainId) !== SEPOLIA_CHAIN_ID) {
    throw new Error(`Keeper manifest chain ${parsed.network.chainId} is not Sepolia`);
  }

  const ids = new Set<number>();
  const addresses = new Set<string>();
  const escrowAddresses = new Set<string>();
  return parsed.officialVaults.map((vault) => {
    if (ids.has(vault.id)) throw new Error(`Duplicate official vault id ${vault.id}`);
    ids.add(vault.id);
    const address = getAddress(vault.vault);
    if (addresses.has(address)) throw new Error(`Duplicate official vault address ${address}`);
    addresses.add(address);
    const bondEscrow = getAddress(vault.bondEscrow);
    if (escrowAddresses.has(bondEscrow)) throw new Error(`Duplicate official bond escrow address ${bondEscrow}`);
    escrowAddresses.add(bondEscrow);
    return {
      id: vault.id,
      name: vault.name,
      cadence: vault.type,
      address,
      bondEscrow,
      automaticEntry: vault.automaticEntry,
    };
  });
}
