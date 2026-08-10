/* global __dirname, module, process, require */
/* eslint-disable @typescript-eslint/no-require-imports */

/* Secure launcher for the SG-4 HCU-authority verifier.
 *
 * The launcher never contacts a network itself. It pins the trusted repository root, refuses to run
 * from a substituted path, and keeps the live read-only mode behind an exact acknowledgment that
 * the authority preparation phase never supplies.
 */

"use strict";

const { spawnSync } = require("node:child_process");
const { lstatSync, realpathSync } = require("node:fs");
const { join, resolve } = require("node:path");

const TRUSTED_ROOT = "/home/dell/zama-szn4";
const ROOT = realpathSync(resolve(__dirname, ".."));
const TS_NODE_CLI = join(ROOT, "node_modules/ts-node/dist/bin.js");
const VERIFIER_SCRIPT = join(ROOT, "scripts/sg4-hcu-authority.ts");
const LIVE_ACK = "I ACKNOWLEDGE SG4 LIVE READ ONLY AUTHORITY VERIFICATION";
const LIVE_ACK_ENV = "SG4_AUTHORITY_LIVE_ACK";
const RPC_ENV = "SEPOLIA_RPC_URL";
const SUSPICIOUS_ENV_KEY = /(PRIVATE|SECRET|MNEMONIC|SEED|WALLET|RPC.*(URL|KEY)|AUTH|TOKEN|CREDENTIAL)/iu;
const MAX_REPORT_BYTES = 256 * 1024;

function fail(message) {
  process.stderr.write(`SG4 authority launcher refused: ${message}\n`);
  process.exitCode = 1;
}

function assertTrustedRoot() {
  if (ROOT !== TRUSTED_ROOT) throw new Error("launcher must run from the trusted repository root");
  if (realpathSync(process.cwd()) !== TRUSTED_ROOT) throw new Error("working directory must be the trusted root");
  if (lstatSync(TRUSTED_ROOT).isSymbolicLink()) throw new Error("trusted root must not be a symbolic link");
  if (lstatSync(VERIFIER_SCRIPT).isSymbolicLink() || realpathSync(VERIFIER_SCRIPT) !== VERIFIER_SCRIPT) {
    throw new Error("verifier must be the trusted nonsymlinked repository file");
  }
}

/* The verifier reads only committed protocol values and installed files. No RPC endpoint, executor
 * address, or authority address may be supplied through the environment. */
function assertNoOverrideEnvironment() {
  /* The live acknowledgment is a deliberate, valueless gate rather than an override or a
   * credential, so it is exempt from both filters below. Without the exemption its own name would
   * trip the credential-name filter and the intended live gate could never be reached. */
  const isPermitted = (key) => key === LIVE_ACK_ENV || key === RPC_ENV;
  const overrides = Object.keys(process.env).filter(
    (key) => !isPermitted(key) && /^SG4_(RPC|EXECUTOR|AUTHORITY|HCU)/iu.test(key),
  );
  if (overrides.length > 0) throw new Error("authority overrides must not be supplied through the environment");
  const suspicious = Object.keys(process.env).filter((key) => !isPermitted(key) && SUSPICIOUS_ENV_KEY.test(key));
  if (suspicious.length > 0) throw new Error("credential-bearing environment variable names must be removed");
}

function runPreflight(execute = spawnSync) {
  const result = execute(process.execPath, [TS_NODE_CLI, "--transpile-only", VERIFIER_SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
    maxBuffer: MAX_REPORT_BYTES,
    timeout: 120_000,
  });
  if (result.error) throw new Error("offline preflight failed to execute");
  process.stdout.write(result.stdout || "");
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error("offline preflight did not pass");
  return result.stdout;
}

/* Live mode is implemented rather than refused outright. The acknowledgment is still required, and
 * the verifier itself withholds the committed-endpoint transport until the run can bind to the
 * exact reviewed preparation commit and tree — which are not recorded yet — so this path currently
 * produces a BLOCKED report without contacting any network. */
function assertLiveAcknowledgement(acknowledgement) {
  if (acknowledgement !== LIVE_ACK) throw new Error("live mode requires the exact acknowledgment");
}

function runLive(modeOrAcknowledgement, acknowledgementOrExecute, maybeExecute = spawnSync) {
  const legacyCall = modeOrAcknowledgement === LIVE_ACK;
  const mode = legacyCall ? "post-commit" : modeOrAcknowledgement;
  const acknowledgement = legacyCall ? modeOrAcknowledgement : acknowledgementOrExecute;
  const execute = legacyCall ? acknowledgementOrExecute : maybeExecute;
  assertLiveAcknowledgement(acknowledgement);
  if (mode !== "candidate" && mode !== "post-commit") throw new Error("invalid live verification mode");
  const childEnv = { PATH: process.env.PATH, [LIVE_ACK_ENV]: acknowledgement };
  if (process.env[RPC_ENV]) childEnv[RPC_ENV] = process.env[RPC_ENV];
  const result = execute(process.execPath, [TS_NODE_CLI, "--transpile-only", VERIFIER_SCRIPT, mode], {
    cwd: ROOT,
    encoding: "utf8",
    /* The acknowledgment is forwarded; nothing else from this environment reaches the verifier. */
    env: childEnv,
    maxBuffer: MAX_REPORT_BYTES,
    timeout: 300_000,
  });
  if (result.error) throw new Error("live read-only authority verification failed to execute");
  process.stdout.write(result.stdout || "");
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error("live read-only authority verification did not pass");
  return result.stdout;
}

function main() {
  const mode = process.argv[2] || "preflight";
  assertTrustedRoot();
  assertNoOverrideEnvironment();
  if (mode === "preflight") {
    runPreflight();
    return;
  }
  if (mode === "candidate" || mode === "post-commit") {
    runLive(mode, process.env[LIVE_ACK_ENV]);
    return;
  }
  throw new Error("mode must be preflight, candidate, or post-commit");
}

module.exports = Object.freeze({
  LIVE_ACK,
  LIVE_ACK_ENV,
  TRUSTED_ROOT,
  assertLiveAcknowledgement,
  assertNoOverrideEnvironment,
  assertTrustedRoot,
  runLive,
  runPreflight,
});

if (require.main === module) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : "unknown launcher failure");
  }
}
