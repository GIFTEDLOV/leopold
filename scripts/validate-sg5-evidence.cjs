#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const EVIDENCE = join(ROOT, "evidence/cp0/SG5_BROWSER_CAPABILITY.json");
const SIDECAR = `${EVIDENCE}.sha256`;
const HEX32 = /^0x[0-9a-fA-F]{64}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const DECIMAL = /^(0|[1-9][0-9]*)$/u;
const SECRET_KEY =
  /(private|secret|seed|mnemonic|password|token|authorization|auth|ciphertext|inputproof|handle|signedpayload|rawpayload|browserstorage|completeurl)/iu;

function fail(message) {
  throw new Error(`SG5_EVIDENCE_INVALID:${message}`);
}
function requireValue(condition, message) {
  if (!condition) fail(message);
}
function assertNoSecrets(value, path = "$") {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    requireValue(key === "secretsPersisted" || !SECRET_KEY.test(key), `${path}.${key} is forbidden`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}
function readJson() {
  requireValue(existsSync(EVIDENCE), "evidence file missing");
  requireValue(existsSync(SIDECAR), "sidecar missing");
  const bytes = readFileSync(EVIDENCE);
  const expected = readFileSync(SIDECAR, "utf8").trim().split(/\s+/u)[0];
  requireValue(HEX64.test(expected), "sidecar digest format");
  requireValue(createHash("sha256").update(bytes).digest("hex") === expected, "sidecar digest mismatch");
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("invalid JSON");
  }
  return value;
}
function validate() {
  const value = readJson();
  requireValue(value && typeof value === "object" && !Array.isArray(value), "root object");
  requireValue(value.schema === "zama-szn4.sg5-browser-capability-evidence.v2", "schema");
  requireValue(value.evidenceMarker === "SG5_EVIDENCE_VALID", "required marker");
  requireValue(value.verdict === "SG5 CLOSED — VERIFIED", "verdict");
  requireValue(
    value.protocol && value.protocol.version === "sg5-browser-capability-v2" && HEX64.test(value.protocol.sha256),
    "protocol identity",
  );
  requireValue(
    value.identity &&
      value.identity.branch === "main" &&
      /^[0-9a-f]{40}$/u.test(value.identity.preparationCommit) &&
      /^[0-9a-f]{40}$/u.test(value.identity.preparationTree),
    "repository identity",
  );
  requireValue(
    value.environment &&
      value.environment.chainId === "11155111" &&
      value.environment.browser === "Chromium" &&
      value.environment.productionBundle === true &&
      value.environment.secretsPersisted === false,
    "environment",
  );
  requireValue(
    value.probeDeployment &&
      value.probeDeployment.chainId === "11155111" &&
      /^0x[0-9a-fA-F]{40}$/u.test(value.probeDeployment.contractAddress) &&
      HEX32.test(value.probeDeployment.deploymentTransactionHash) &&
      DECIMAL.test(value.probeDeployment.deploymentBlockNumber),
    "probe deployment",
  );
  requireValue(
    value.aggregate &&
      value.aggregate.schema === "zama-szn4.sg5-browser-probe-aggregate.v2" &&
      value.aggregate.status === "PASS" &&
      value.aggregate.executionMode === "LIVE_SEPOLIA",
    "aggregate status",
  );
  requireValue(
    value.aggregate.requiredColdContexts === "2" &&
      value.aggregate.passedColdContexts === "2" &&
      value.aggregate.excludedMockContexts === "0" &&
      value.aggregate.wrongNetworkScenarioPassed === true &&
      value.aggregate.productionBuildPassed === true,
    "aggregate requirements",
  );
  requireValue(Array.isArray(value.aggregate.contexts) && value.aggregate.contexts.length === 2, "cold contexts");
  const requiredScenarios = [
    "SG5-01_CLEAN_LOAD",
    "SG5-02_SDK_INITIALIZATION",
    "SG5-03_SEPOLIA_PROVIDER",
    "SG5-04_WRONG_NETWORK",
    "SG5-05_BROWSER_ENCRYPTION",
    "SG5-06_LIVE_ENCRYPTED_TRANSACTION",
    "SG5-07_RESULT_READBACK",
    "SG5-08_AUTHORIZED_DECRYPTION",
    "SG5-09_UNAUTHORIZED_ACCESS",
    "SG5-10_FRESH_CONTEXT_REPEAT",
    "SG5-11_PRODUCTION_BUILD",
  ];
  requireValue(value.scenarios && requiredScenarios.every((key) => value.scenarios[key] === true), "scenario matrix");
  for (const context of value.aggregate.contexts) {
    requireValue(
      context.status === "CAPABILITY_COMPLETE" &&
        context.executionMode === "LIVE_SEPOLIA" &&
        context.adapterClassification === "REAL_INSTALLED_SDK",
      "context capability",
    );
    requireValue(
      context.observedChainId === "11155111" &&
        context.transactionStatus === "SUCCESS" &&
        HEX32.test(context.transactionHash) &&
        DECIMAL.test(context.transactionBlockNumber),
      "context transaction",
    );
    requireValue(
      context.consoleErrorCount === "0" &&
        context.pageErrorCount === "0" &&
        context.unhandledRejectionCount === "0" &&
        context.forbiddenNetworkRequestCount === "0" &&
        context.forbiddenMaterialRetained === false,
      "context errors",
    );
    requireValue(
      Array.isArray(context.networkObservations) &&
        context.networkObservations.length > 0 &&
        context.networkObservations.every((item) => item.success === true),
      "network observations",
    );
  }
  assertNoSecrets(value);
  process.stdout.write("SG5_EVIDENCE_VALID\n");
}
try {
  validate();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "SG5_EVIDENCE_INVALID:unknown"}\n`);
  process.exitCode = 1;
}
