import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const privateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/u, "KEEPER_PRIVATE_KEY must be a 0x-prefixed 32-byte private key");

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "DEPLOYER_ADDRESS must be a valid Ethereum address");

const rawKeeperConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    SEPOLIA_RPC_URL: z.url(),

    KEEPER_PRIVATE_KEY: privateKeySchema,

    DEPLOYER_ADDRESS: addressSchema,

    KEEPER_MAX_BALANCE_WEI: z.coerce
      .bigint()
      .refine((value) => value > 0n, "KEEPER_MAX_BALANCE_WEI must be greater than zero"),

    POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),
  })
  .superRefine((value, context) => {
    const keeperAddress = getAddress(privateKeyToAccount(value.KEEPER_PRIVATE_KEY as Hex).address);

    const deployerAddress = getAddress(value.DEPLOYER_ADDRESS);

    if (keeperAddress === deployerAddress) {
      context.addIssue({
        code: "custom",
        path: ["KEEPER_PRIVATE_KEY"],
        message: "Keeper address must not match the deployment address",
      });
    }
  });

const keeperConfigSchema = rawKeeperConfigSchema.transform((value) => ({
  ...value,

  DEPLOYER_ADDRESS: getAddress(value.DEPLOYER_ADDRESS),

  KEEPER_ADDRESS: getAddress(privateKeyToAccount(value.KEEPER_PRIVATE_KEY as Hex).address),
}));

export type KeeperConfig = z.output<typeof keeperConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): KeeperConfig {
  return keeperConfigSchema.parse(environment);
}
