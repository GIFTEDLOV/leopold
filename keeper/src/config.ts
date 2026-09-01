import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const privateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/u, "KEEPER_PRIVATE_KEY must be a 0x-prefixed 32-byte private key");

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "DEPLOYER_ADDRESS must be a valid Ethereum address");

const urlsSchema = z.string().optional();

const rawKeeperConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    SEPOLIA_RPC_URL: z.url(),

    SEPOLIA_RPC_URLS: urlsSchema,

    KEEPER_PRIVATE_KEY: privateKeySchema,

    DEPLOYER_ADDRESS: addressSchema,

    KEEPER_MIN_BALANCE_WEI: z.coerce
      .bigint()
      .refine((value) => value >= 0n, "KEEPER_MIN_BALANCE_WEI must not be negative")
      .default(10_000_000_000_000_000n),

    KEEPER_MAX_BALANCE_WEI: z.coerce
      .bigint()
      .refine((value) => value > 0n, "KEEPER_MAX_BALANCE_WEI must be greater than zero"),

    POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),

    KEEPER_RECEIPT_WAIT_MS: z.coerce.number().int().min(0).default(180000),

    KEEPER_CONFIRMATIONS: z.coerce.number().int().min(1).max(12).default(1),

    KEEPER_AUTO_ENTRY_SCAN_SIZE: z.coerce.number().int().min(1).max(500).default(50),

    KEEPER_HISTORICAL_SCAN_SIZE: z.coerce.number().int().min(1).max(500).default(50),

    KEEPER_JOURNAL_PATH: z.string().min(1).default("./keeper-data/lifecycle-journal.json"),

    KEEPER_MANIFEST_PATH: z.string().min(1).default("../config/leopold-frontend-contracts.json"),
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

    if (value.KEEPER_MIN_BALANCE_WEI > value.KEEPER_MAX_BALANCE_WEI) {
      context.addIssue({
        code: "custom",
        path: ["KEEPER_MIN_BALANCE_WEI"],
        message: "KEEPER_MIN_BALANCE_WEI must not exceed KEEPER_MAX_BALANCE_WEI",
      });
    }
  });

const keeperConfigSchema = rawKeeperConfigSchema.transform((value) => ({
  ...value,

  RPC_URLS: [value.SEPOLIA_RPC_URL, ...(value.SEPOLIA_RPC_URLS?.split(",") ?? [])]
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .map((url) => new URL(z.url().parse(url)).toString())
    .filter((url, index, urls) => urls.indexOf(url) === index),

  DEPLOYER_ADDRESS: getAddress(value.DEPLOYER_ADDRESS),

  KEEPER_ADDRESS: getAddress(privateKeyToAccount(value.KEEPER_PRIVATE_KEY as Hex).address),
}));

export type KeeperConfig = z.output<typeof keeperConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): KeeperConfig {
  return keeperConfigSchema.parse(environment);
}
