import "dotenv/config";

import * as zamaSdk from "@zama-fhe/sdk";
import pRetry from "p-retry";
import pino from "pino";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

import { assertKeeperBalanceWithinLimit } from "./balance-guard.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

const logger = pino({
  level: "info",
  base: {
    service: "zama-szn4-keeper",
  },
  redact: {
    paths: ["privateKey", "*.privateKey", "config.KEEPER_PRIVATE_KEY"],
    censor: "[REDACTED]",
  },
});

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(config.SEPOLIA_RPC_URL),
});

assertKeeperBalanceWithinLimit(0n, config.KEEPER_MAX_BALANCE_WEI);

let attempts = 0;

const retryResult = await pRetry(
  async () => {
    attempts += 1;

    if (attempts === 1) {
      throw new Error("intentional recoverable probe failure");
    }

    return "retry-ok";
  },
  {
    retries: 1,
    minTimeout: 1,
    maxTimeout: 1,
  },
);

const sdkExports = Object.keys(zamaSdk);

if (sdkExports.length === 0) {
  throw new Error("@zama-fhe/sdk exposed no runtime exports");
}

logger.info(
  {
    chainId: publicClient.chain.id,
    fundingCeilingWei: config.KEEPER_MAX_BALANCE_WEI.toString(),
    keeperAddress: config.KEEPER_ADDRESS,
    node: process.version,
    retryResult,
    sdkExportCount: sdkExports.length,
  },
  "keeper credential and runtime probe passed",
);
