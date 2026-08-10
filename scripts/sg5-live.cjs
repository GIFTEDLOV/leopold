#!/usr/bin/env node

const { createHash, randomBytes } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, readlinkSync, writeFileSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { execFileSync, spawn } = require("node:child_process");

const ROOT = resolve(__dirname, "..");
const FRONTEND = join(ROOT, "frontend");
const NEXT = join(FRONTEND, "node_modules/next/dist/bin/next");
const PLAYWRIGHT = join(FRONTEND, "node_modules/@playwright/test/cli.js");
const ACK = "I_UNDERSTAND_THIS_CONTACTS_SEPOLIA";
const PAGE_ENABLE = "ENABLED_LOCAL_ONLY";
const EVIDENCE = join(ROOT, "evidence/cp0/SG5_BROWSER_CAPABILITY.json");
const SIDECAR = `${EVIDENCE}.sha256`;
const PRIVATE_BROWSER_LIBS = "/tmp/sg5-libs/root/usr/lib/x86_64-linux-gnu";

function fail(message) {
  process.stderr.write(`SG5 live launcher refused: ${message}\n`);
  process.exitCode = 1;
}
function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}
function childEnv(extra) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    ...extra,
  };
}
function protocolDigest() {
  require("ts-node/register/transpile-only");
  return require(join(ROOT, "scripts/sg5-protocol.ts")).protocolDigest();
}
function loadVars() {
  const rpc = process.env.SG5_SEPOLIA_RPC_URL;
  const key = process.env.SG5_AUTOMATION_PRIVATE_KEY;
  if (rpc && key) return { rpc, key };
  const varsPath = "/home/dell/.config/hardhat-nodejs/vars.json";
  if (!existsSync(varsPath)) throw new Error("SG5_AUTOMATION_WALLET_UNAVAILABLE");
  try {
    const parsed = JSON.parse(readFileSync(varsPath, "utf8"));
    const vars = parsed && parsed.vars ? parsed.vars : parsed;
    const loadedRpc = rpc || vars.SEPOLIA_RPC_URL?.value || vars.SEPOLIA_RPC_URL;
    const loadedKey = key || vars.SEPOLIA_PRIVATE_KEY?.value || vars.SEPOLIA_PRIVATE_KEY;
    if (
      typeof loadedRpc !== "string" ||
      typeof loadedKey !== "string" ||
      !/^https:\/\//u.test(loadedRpc) ||
      !/^0x[0-9a-fA-F]{64}$/u.test(loadedKey)
    )
      throw new Error("invalid automation wallet configuration");
    return { rpc: loadedRpc, key: loadedKey };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("SG5_AUTOMATION_CONFIGURATION_INVALID");
    throw error;
  }
}
function portPids() {
  try {
    const value = execFileSync("bash", ["-lc", "fuser -n tcp 3000 2>/dev/null || true"], { encoding: "utf8" });
    return value
      .trim()
      .split(/\s+/u)
      .filter((v) => /^[0-9]+$/u.test(v))
      .map(Number);
  } catch {
    return [];
  }
}
function processText(pid) {
  try {
    return {
      cwd: readlinkSync(`/proc/${pid}/cwd`),
      cmdline: readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " "),
    };
  } catch {
    return null;
  }
}
function clearOwnedPort() {
  const owned = [];
  for (const pid of portPids()) {
    const identity = processText(pid);
    if (!identity) continue;
    if (identity.cwd.startsWith(FRONTEND) && identity.cmdline.includes("next")) {
      owned.push(pid);
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    } else throw new Error("SG5_PORT_3000_OCCUPIED_BY_UNRELATED_PROCESS");
  }
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline && portPids().length) {
    const end = Date.now() + 100;
    while (Date.now() < end) {}
  }
  for (const pid of owned) {
    if (portPids().includes(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
  const finalDeadline = Date.now() + 1500;
  while (Date.now() < finalDeadline && portPids().length) {
    const end = Date.now() + 100;
    while (Date.now() < end) {}
  }
  if (portPids().length) throw new Error("SG5_PROJECT_FRONTEND_DID_NOT_RELEASE_PORT_3000");
}
async function waitForHealth() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3000/api/sg5-health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("SG5_PRODUCTION_FRONTEND_HEALTH_TIMEOUT");
}
function stop(child) {
  if (!child || child.killed) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}
function writeEvidence(run, identity, digest) {
  const evidence = {
    schema: "zama-szn4.sg5-browser-capability-evidence.v2",
    evidenceMarker: "SG5_EVIDENCE_VALID",
    protocol: { version: "sg5-browser-capability-v2", sha256: digest },
    identity: { branch: identity.branch, preparationCommit: identity.commit, preparationTree: identity.tree },
    environment: {
      chainId: "11155111",
      browser: "Chromium",
      productionBundle: true,
      walletModel: "TEST_AUTOMATION_WALLET_VIA_BROWSER_EIP1193_BRIDGE",
      frontendWalletModel: "PRODUCTION_WALLET_INTERFACE",
      secretsPersisted: false,
    },
    probeDeployment: {
      chainId: "11155111",
      contractAddress: "0xfc672ca5846896A7A135943E79dd11283c38FE78",
      deploymentTransactionHash: "0x44b8701193ca8b0efd32a081786056af1a722fa0efb2ef1c92550687562090d4",
      deploymentBlockNumber: "11459741",
      compiler: "0.8.27",
    },
    scenarios: run.scenarios,
    aggregate: run.aggregate,
    verdict: "SG5 CLOSED — VERIFIED",
  };
  mkdirSync(join(ROOT, "evidence/cp0"), { recursive: true });
  const bytes = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(EVIDENCE, bytes, { mode: 0o600 });
  writeFileSync(SIDECAR, `${createHash("sha256").update(bytes).digest("hex")}  SG5_BROWSER_CAPABILITY.json\n`, {
    mode: 0o600,
  });
}

async function main() {
  const [mode, expectedCommit, expectedTree, expectedDigest] = process.argv.slice(2);
  if (mode !== "live") throw new Error("usage: sg5-live.cjs live <commit> <tree> <protocolDigest>");
  if (process.env.SG5_LIVE_ACK !== ACK) throw new Error("exact SG5 live acknowledgment is required");
  if (!/^[0-9a-f]{40}$/u.test(expectedCommit || "") || !/^[0-9a-f]{40}$/u.test(expectedTree || ""))
    throw new Error("explicit preparation identity required");
  const identity = {
    branch: git("branch", "--show-current"),
    commit: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
  };
  if (identity.branch !== "main" || identity.commit !== expectedCommit || identity.tree !== expectedTree)
    throw new Error("SG5_PREPARATION_IDENTITY_MISMATCH");
  if (git("status", "--porcelain", "--untracked-files=all") !== "")
    throw new Error("SG5_PREPARATION_WORKTREE_NOT_CLEAN");
  const digest = protocolDigest();
  if (digest !== expectedDigest) throw new Error("SG5_PROTOCOL_DIGEST_MISMATCH");
  if (existsSync(EVIDENCE) || existsSync(SIDECAR)) throw new Error("SG5_EVIDENCE_ALREADY_EXISTS");
  const vars = loadVars();
  const playwrightApi = require(join(FRONTEND, "node_modules/@playwright/test"));
  const browser = playwrightApi.chromium.executablePath();
  clearOwnedPort();
  const runDirectory = join("/tmp", `zama-szn4-sg5-${process.pid}-${Date.now()}`);
  mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
  const resultPath = join(runDirectory, "result.json");
  const outputDir = join(runDirectory, "playwright-output");
  mkdirSync(outputDir, { mode: 0o700 });
  const frontend = spawn(process.execPath, [NEXT, "start", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: FRONTEND,
    env: childEnv({ SG5_PROBE_PAGE: PAGE_ENABLE, SG5_PROBE_PRODUCTION: "1", SG5_LIVE_ACK: ACK }),
    detached: true,
    stdio: "ignore",
  });
  let suitePassed = false;
  try {
    await waitForHealth();
    const unauthorized = `0x${createHash("sha256")
      .update(`sg5-unauthorized-${randomBytes(16).toString("hex")}`)
      .digest("hex")}`;
    const playwright = spawn(process.execPath, [PLAYWRIGHT, "test", "e2e/sg5-browser.spec.ts"], {
      cwd: FRONTEND,
      env: childEnv({
        SG5_LIVE_ACK: ACK,
        SG5_EXTERNAL_SERVER: "1",
        SG5_PROBE_PRODUCTION: "1",
        SG5_PLAYWRIGHT_OUTPUT_DIR: outputDir,
        SG5_RESULT_PATH: resultPath,
        SG5_PRODUCTION_BUILD: "1",
        SG5_BROWSER_EXECUTABLE: browser,
        SG5_SEPOLIA_RPC_URL: vars.rpc,
        SG5_AUTOMATION_PRIVATE_KEY: vars.key,
        SG5_UNAUTHORIZED_PRIVATE_KEY: unauthorized,
        ...(existsSync(PRIVATE_BROWSER_LIBS)
          ? {
              LD_LIBRARY_PATH: `${PRIVATE_BROWSER_LIBS}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}`,
            }
          : {}),
      }),
      detached: true,
      stdio: "inherit",
    });
    const status = await new Promise((resolvePromise, rejectPromise) => {
      playwright.once("error", rejectPromise);
      playwright.once("exit", (code, signal) => resolvePromise({ code, signal }));
    });
    if (status.code !== 0 || status.signal !== null) throw new Error("SG5_PLAYWRIGHT_SUITE_FAILED");
    if (!existsSync(resultPath)) throw new Error("SG5_PLAYWRIGHT_RESULT_MISSING");
    const run = JSON.parse(readFileSync(resultPath, "utf8"));
    writeEvidence(run, identity, digest);
    suitePassed = true;
    process.stdout.write("SG5_BROWSER_SUITE_PASS\nSG5_EVIDENCE_WRITTEN\n");
  } finally {
    stop(frontend);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
    if (suitePassed) {
      try {
        rmSync(runDirectory, { recursive: true, force: true });
      } catch {}
    } else process.stderr.write(`SG5_FAILED_RUN_DIRECTORY_RETAINED:${runDirectory}\n`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown SG5 launcher failure"));
