import "dotenv/config";

import pino from "pino";

import { loadConfig } from "./config.js";
import { KeeperEngine } from "./engine.js";
import { EthersKeeperGateway } from "./ethers-gateway.js";
import { acquireKeeperProcessLock, FileJournalStore } from "./journal.js";
import type { KeeperLogger } from "./lifecycle.js";
import { loadOfficialVaults } from "./manifest.js";
import { ZamaPublicProofProvider } from "./public-proof.js";

const mode = process.argv.includes("--service") ? "service" : process.argv.includes("--once") ? "once" : null;
if (!mode) throw new Error("Specify exactly one keeper mode: --once or --service");
if (process.argv.includes("--service") && process.argv.includes("--once")) {
  throw new Error("Keeper modes --once and --service are mutually exclusive");
}

const config = loadConfig();
const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "leopold-lifecycle-keeper" },
  redact: {
    paths: ["privateKey", "*.privateKey", "config.KEEPER_PRIVATE_KEY", "rpcUrl", "*.rpcUrl", "rpcUrls"],
    censor: "[REDACTED]",
  },
});
const logger: KeeperLogger = {
  debug: (fields, message) => pinoLogger.debug(fields, message),
  info: (fields, message) => pinoLogger.info(fields, message),
  warn: (fields, message) => pinoLogger.warn(fields, message),
  error: (fields, message) => pinoLogger.error(fields, message),
};

const releaseProcessLock = await acquireKeeperProcessLock(config.KEEPER_JOURNAL_PATH);
try {
  const vaults = await loadOfficialVaults(config.KEEPER_MANIFEST_PATH);
  const journal = new FileJournalStore(config.KEEPER_JOURNAL_PATH);
  const proofProvider = new ZamaPublicProofProvider(config.RPC_URLS);
  const gateway = new EthersKeeperGateway({
    rpcUrls: config.RPC_URLS,
    privateKey: config.KEEPER_PRIVATE_KEY,
    vaults,
    proofProvider,
    autoEntryScanSize: config.KEEPER_AUTO_ENTRY_SCAN_SIZE,
    historicalScanSize: config.KEEPER_HISTORICAL_SCAN_SIZE,
    checkpoints: journal,
  });
  if (gateway.keeperAddress !== config.KEEPER_ADDRESS) throw new Error("Keeper signer address mismatch");

  const engine = new KeeperEngine({
    gateway,
    journal,
    logger,
    minimumBalanceWei: config.KEEPER_MIN_BALANCE_WEI,
    maximumBalanceWei: config.KEEPER_MAX_BALANCE_WEI,
    confirmations: config.KEEPER_CONFIRMATIONS,
    receiptWaitMs: config.KEEPER_RECEIPT_WAIT_MS,
  });

  await engine.preflight();
  logger.info(
    { keeperAddress: config.KEEPER_ADDRESS, mode, vaultCount: vaults.length },
    "keeper startup validation passed",
  );

  if (mode === "once") {
    const result = await engine.runOnce();
    logger.info({ outcome: result.outcome }, "keeper one-shot run complete");
    if (result.outcome === "blocked") process.exitCode = 2;
  } else {
    let stopping = false;
    const stop = (signal: string) => {
      stopping = true;
      logger.info({ signal }, "keeper graceful shutdown requested");
    };
    process.once("SIGINT", () => stop("SIGINT"));
    process.once("SIGTERM", () => stop("SIGTERM"));

    while (!stopping) {
      try {
        const result = await engine.runOnce();
        logger.info({ outcome: result.outcome }, "keeper poll complete");
      } catch (error) {
        logger.warn(
          { errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR" },
          "recoverable keeper poll failed; no write retry was attempted",
        );
      }
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL_MS));
    }
    logger.info({}, "keeper stopped");
  }
} finally {
  await releaseProcessLock();
}
