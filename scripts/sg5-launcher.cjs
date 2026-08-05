/* global Buffer, __dirname, clearTimeout, fetch, module, process, require, setTimeout */
/* eslint-disable @typescript-eslint/no-require-imports */

"use strict";

const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
} = require("node:fs");
const { createServer } = require("node:net");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const { basename, dirname, isAbsolute, join, resolve } = require("node:path");

const TRUSTED_ROOT = "/home/dell/zama-szn4";
const ROOT = realpathSync(resolve(__dirname, ".."));
const FRONTEND_ROOT = join(ROOT, "frontend");
const FRONTEND_REQUIRE = createRequire(join(FRONTEND_ROOT, "package.json"));
const NEXT_CLI = join(ROOT, "frontend/node_modules/next/dist/bin/next");
const PLAYWRIGHT_CLI = join(ROOT, "frontend/node_modules/@playwright/test/cli.js");
const TS_NODE_CLI = join(ROOT, "node_modules/ts-node/dist/bin.js");
const PROTOCOL_SCRIPT = join(ROOT, "scripts/sg5-protocol.ts");
const LIVE_ACK = "I_UNDERSTAND_THIS_CONTACTS_SEPOLIA";
const EVIDENCE_PATH = join(ROOT, "evidence/cp0/SG5_BROWSER_CAPABILITY.json");
const EVIDENCE_SIDECAR_PATH = `${EVIDENCE_PATH}.sha256`;
const MAX_PROTOCOL_BYTES = 64 * 1024;
const SUSPICIOUS_ENV_KEY = /(PRIVATE|SECRET|MNEMONIC|SEED|WALLET|RPC.*(URL|KEY)|AUTH|TOKEN|CREDENTIAL)/iu;

function fail(message) {
  process.stderr.write(`SG5 launcher refused: ${message}\n`);
  process.exitCode = 1;
}

function git(...args) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.stderr !== "") throw new Error("local git identity check failed");
  return result.stdout.trim();
}

function validateTrustedRootSnapshot(snapshot) {
  if (
    snapshot.derivedRoot !== TRUSTED_ROOT ||
    snapshot.cwd !== TRUSTED_ROOT ||
    snapshot.gitRoot !== TRUSTED_ROOT ||
    snapshot.rootIsSymlink
  ) {
    throw new Error("launcher must run from the nonsymlinked trusted repository root");
  }
}

function assertTrustedRoot() {
  validateTrustedRootSnapshot({
    derivedRoot: ROOT,
    cwd: realpathSync(process.cwd()),
    gitRoot: realpathSync(git("rev-parse", "--show-toplevel")),
    rootIsSymlink: lstatSync(TRUSTED_ROOT).isSymbolicLink(),
  });
  if (lstatSync(PROTOCOL_SCRIPT).isSymbolicLink() || realpathSync(PROTOCOL_SCRIPT) !== PROTOCOL_SCRIPT) {
    throw new Error("protocol generator must be the trusted nonsymlinked repository file");
  }
}

const DEFAULT_BROWSER_FS = Object.freeze({ accessSync, lstatSync, realpathSync, statSync });

function validateBrowserCandidate(path, classification, adapter = DEFAULT_BROWSER_FS) {
  if (typeof path !== "string" || !isAbsolute(path)) throw new Error("browser path must be absolute");
  const linkStatus = adapter.lstatSync(path);
  if (linkStatus.isSymbolicLink() || !linkStatus.isFile())
    throw new Error("browser must be a nonsymlinked regular file");
  const canonicalPath = adapter.realpathSync(path);
  if (canonicalPath !== path) throw new Error("browser path must already be canonical");
  const fileStatus = adapter.statSync(canonicalPath);
  if (!fileStatus.isFile()) throw new Error("browser target must remain a regular file");
  adapter.accessSync(canonicalPath, constants.X_OK);
  return Object.freeze({
    path: canonicalPath,
    classification,
    device: String(fileStatus.dev),
    inode: String(fileStatus.ino),
    size: String(fileStatus.size),
    modifiedMilliseconds: String(Math.trunc(fileStatus.mtimeMs)),
  });
}

function revalidateBrowserSelection(selection, adapter = DEFAULT_BROWSER_FS) {
  const current = validateBrowserCandidate(selection.path, selection.classification, adapter);
  for (const key of ["path", "classification", "device", "inode", "size", "modifiedMilliseconds"]) {
    if (current[key] !== selection[key]) throw new Error("selected browser changed after discovery");
  }
  return current;
}

function browserLaunchEnvironment(selection) {
  if (!selection || typeof selection.path !== "string") throw new Error("validated browser selection required");
  return Object.freeze({ SG5_BROWSER_EXECUTABLE: selection.path });
}

function discoverBrowser(candidates, adapter = DEFAULT_BROWSER_FS) {
  for (const candidate of candidates) {
    if (!candidate.path) continue;
    try {
      return validateBrowserCandidate(candidate.path, candidate.classification, adapter);
    } catch {
      // A stale or unsafe candidate is skipped; the launcher never repairs or downloads it.
    }
  }
  return undefined;
}

function resolvePlaywrightApi(load = FRONTEND_REQUIRE) {
  try {
    const api = load("@playwright/test");
    if (!api || typeof api.chromium?.executablePath !== "function") {
      return Object.freeze({ classification: "PLAYWRIGHT_API_UNAVAILABLE" });
    }
    return Object.freeze({ classification: "PLAYWRIGHT_API_AVAILABLE", chromium: api.chromium });
  } catch {
    return Object.freeze({ classification: "PLAYWRIGHT_API_UNAVAILABLE" });
  }
}

const SYSTEM_BROWSER_CANDIDATES = Object.freeze([
  { path: "/usr/bin/chromium", classification: "SYSTEM_CHROMIUM" },
  { path: "/usr/bin/chromium-browser", classification: "SYSTEM_CHROMIUM" },
  { path: "/usr/bin/google-chrome", classification: "SYSTEM_CHROME" },
  { path: "/usr/bin/google-chrome-stable", classification: "SYSTEM_CHROME" },
  { path: "/opt/google/chrome/chrome", classification: "SYSTEM_CHROME" },
]);

function inspectBrowserAvailability(options = {}) {
  const adapter = options.adapter || DEFAULT_BROWSER_FS;
  const playwright = resolvePlaywrightApi(options.loadPlaywright || FRONTEND_REQUIRE);
  let managedPath;
  if (playwright.classification === "PLAYWRIGHT_API_AVAILABLE") {
    try {
      managedPath = playwright.chromium.executablePath();
    } catch {
      managedPath = undefined;
    }
    if (managedPath) {
      try {
        const selection = validateBrowserCandidate(managedPath, "PLAYWRIGHT_MANAGED", adapter);
        return Object.freeze({
          playwrightApiClassification: "PLAYWRIGHT_API_AVAILABLE",
          managedBrowserClassification: "MANAGED_BROWSER_AVAILABLE",
          availabilityClassification: "MANAGED_BROWSER_AVAILABLE",
          selection,
        });
      } catch {
        // The API-resolved path is authoritative metadata but no executable is installed there.
      }
    }
  }
  const system = discoverBrowser(options.systemCandidates || SYSTEM_BROWSER_CANDIDATES, adapter);
  if (system) {
    return Object.freeze({
      playwrightApiClassification: playwright.classification,
      managedBrowserClassification: "MANAGED_BROWSER_NOT_INSTALLED",
      availabilityClassification: "SYSTEM_BROWSER_AVAILABLE",
      selection: system,
    });
  }
  return Object.freeze({
    playwrightApiClassification: playwright.classification,
    managedBrowserClassification: "MANAGED_BROWSER_NOT_INSTALLED",
    availabilityClassification:
      playwright.classification === "PLAYWRIGHT_API_AVAILABLE"
        ? "MANAGED_BROWSER_NOT_INSTALLED"
        : "PLAYWRIGHT_API_UNAVAILABLE",
  });
}

function browserExecutable() {
  return inspectBrowserAvailability().selection;
}

function assertNoCredentialEnvironment() {
  const suspicious = Object.keys(process.env).filter((key) => SUSPICIOUS_ENV_KEY.test(key));
  if (suspicious.length > 0) throw new Error("credential-bearing environment variable names must be removed");
}

function assertNoLocalEnvironmentFiles() {
  for (const directory of [ROOT, join(ROOT, "frontend")]) {
    if (readdirSync(directory).some((name) => name === ".env" || name.startsWith(".env."))) {
      throw new Error("local environment files must be removed from the SG-5 launcher scope");
    }
  }
}

function validateGeneratedProtocol(protocol) {
  if (protocol === null || typeof protocol !== "object" || Array.isArray(protocol))
    throw new Error("protocol JSON object required");
  const locked = protocol.lockedProbe;
  const installed = protocol.installedSepoliaConfiguration;
  const live = protocol.liveExecution;
  const forbidden = protocol.forbiddenActions;
  if (protocol.schema !== "zama-szn4.sg5-browser-capability-protocol.v1") throw new Error("protocol schema mismatch");
  if (protocol.protocolVersion !== "sg5-browser-capability-v1") throw new Error("protocol version mismatch");
  if (protocol.preparationStatus !== "PREPARED_LIVE_BROWSER_EXECUTION_REQUIRED" || protocol.gateStatus !== "PENDING") {
    throw new Error("protocol must remain non-PASS and PENDING");
  }
  if (
    locked?.chainId !== "11155111" ||
    installed?.gatewayChainId !== "10901" ||
    locked?.contractAddress !== "0x332C58e28Bb31c902ddd370265eBBF1030299bC7" ||
    locked?.userAddress !== "0x57357D26D1f56eca4556d271078A0239a7696Bbf" ||
    locked?.plaintextClassification !== "FIXED_TEST_VALUE_ONE" ||
    locked?.fixedPlaintext !== "1" ||
    locked?.encryptedWidth !== "euint64" ||
    locked?.sdkEncryptionMethod !== "ZamaSDK.encrypt" ||
    locked?.sdkTypedValue?.type !== "euint64" ||
    locked?.sdkTypedValue?.value !== "1" ||
    locked?.requiredColdContexts !== "2"
  ) {
    throw new Error("locked SG-5 probe values mismatch");
  }
  if (live?.acknowledgment?.exactValue !== LIVE_ACK) throw new Error("protocol acknowledgment mismatch");
  if (protocol.publicKeyProof?.assetOriginsStatus !== "UNRESOLVED_FROM_INSTALLED_LOCAL_SOURCE") {
    throw new Error("protocol public-key origin authority mismatch");
  }
  if (
    protocol.publicKeyProof?.dynamicAssetOriginsResolved !== false ||
    protocol.publicKeyProof?.publicKeyAssetOrigin !== null ||
    protocol.publicKeyProof?.crsAssetOrigin !== null ||
    protocol.resultSchema?.aggregate?.passRequiresResolvedCommittedAssetOrigins !== true ||
    protocol.resultSchema?.aggregate?.passRequiresCompleteKeyurlPublicKeyCrsAndRpcProofPerContext !== true
  ) {
    throw new Error("protocol dynamic asset proof authority mismatch");
  }
  if (
    protocol.networkPolicy?.requestCategories?.join(",") !==
      "LOCAL_FRONTEND_ASSET,SEPOLIA_RPC,RELAYER_KEYURL_METADATA,PUBLIC_KEY_ASSET,CRS_ASSET" ||
    protocol.networkPolicy?.passRequiresCommittedExactAssetOrigins !== true ||
    protocol.networkPolicy?.runtimeKeyurlResponseCannotExpandAllowlist !== true ||
    protocol.networkPolicy?.redirectObservationSemantics?.originalResponseTargetRelationship !==
      "REQUEST_REDIRECTED_TO" ||
    protocol.networkPolicy?.redirectObservationSemantics?.requiredTerminalStatus !== "SUCCESS_2XX" ||
    protocol.networkPolicy?.redirectObservationSemantics?.permittedTransitionIsTerminalProof !== false ||
    protocol.networkPolicy?.redirectObservationSemantics?.missingRedirectTargetFails !== true ||
    protocol.networkPolicy?.redirectObservationSemantics?.forbiddenRedirectFails !== true
  ) {
    throw new Error("protocol network proof model mismatch");
  }
  if (
    protocol.liveExecution?.frontendOwnership?.spawnedListenerPidOrVerifiedDescendantRequired !== true ||
    protocol.liveExecution?.frontendOwnership?.leaderAbsenceAloneProvesExit !== false ||
    protocol.liveExecution?.frontendOwnership?.survivingProcessGroupMembersEnumerated !== true ||
    protocol.liveExecution?.frontendOwnership?.verifiedDescendantsAndPortOwnerCheckedAfterLeaderExit !== true ||
    protocol.liveExecution?.frontendOwnership?.cleanupResultClassifications?.join(",") !==
      "ALREADY_EXITED,TERMINATED_GRACEFULLY,TERMINATED_FORCIBLY,OWNERSHIP_LOST,PID_REUSE_DETECTED,AMBIGUOUS_PROCESS_GROUP" ||
    protocol.liveExecution?.frontendOwnership?.pidAndStartTimeRevalidatedBeforeEverySignal !== true ||
    protocol.liveExecution?.frontendOwnership?.gracefulSignal !== "SIGTERM" ||
    protocol.liveExecution?.frontendOwnership?.boundedEscalationSignal !== "SIGKILL" ||
    protocol.liveExecution?.cleanup?.containmentRevalidatedBeforeDeletion !== true ||
    protocol.liveExecution?.cleanup?.unresolvedOwnershipRetainsPrivateRunDirectory !== true ||
    protocol.liveExecution?.cleanup?.privateRunDirectoryDeletionRequiresVerifiedExitOrTermination !== true ||
    protocol.wasmProof?.concurrentInstallationForbidden !== true ||
    protocol.browserRequirements?.executableDiscovery?.regularFileRequired !== true ||
    protocol.browserRequirements?.executableDiscovery?.playwrightResolutionContext !==
      "FRONTEND_INSTALLED_@PLAYWRIGHT_TEST" ||
    protocol.browserRequirements?.executableDiscovery?.playwrightResolutionMechanism !==
      "CREATE_REQUIRE_FROM_FRONTEND_PACKAGE_JSON" ||
    protocol.browserRequirements?.executableDiscovery?.managedExecutableMethod !== "chromium.executablePath" ||
    protocol.browserRequirements?.executableDiscovery?.apiAvailabilityDistinctFromManagedExecutableInstallation !== true
  ) {
    throw new Error("protocol launcher/runtime safety model mismatch");
  }
  if (
    !Array.isArray(live?.blockedUntil) ||
    !live.blockedUntil.includes("EXACT_PUBLIC_KEY_ASSET_ORIGIN") ||
    !live.blockedUntil.includes("EXACT_CRS_ASSET_ORIGIN")
  ) {
    throw new Error("dynamic key and CRS origin blockers must remain registered");
  }
  for (const action of [
    "wallet connection",
    "eth_requestAccounts",
    "signMessage",
    "signTypedData",
    "signature request",
    "eth_sendTransaction",
    "sendTransaction",
    "writeContract",
    "transaction submission",
  ]) {
    if (!Array.isArray(forbidden) || !forbidden.includes(action)) throw new Error("authority prohibitions mismatch");
  }
}

function generateAndVerifyProtocol(expectedDigest, execute = spawnSync) {
  if (!/^[0-9a-f]{64}$/u.test(expectedDigest || "")) throw new Error("expected protocol SHA-256 is invalid");
  const result = execute(process.execPath, [TS_NODE_CLI, "--transpile-only", PROTOCOL_SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
    maxBuffer: MAX_PROTOCOL_BYTES,
    timeout: 30_000,
  });
  if (result.error || result.status !== 0) throw new Error("deterministic protocol generation failed");
  if (result.stderr !== "") throw new Error("deterministic protocol generator wrote unexpected stderr");
  if (Buffer.byteLength(result.stdout, "utf8") > MAX_PROTOCOL_BYTES)
    throw new Error("deterministic protocol exceeds size limit");
  let protocol;
  try {
    protocol = JSON.parse(result.stdout);
  } catch {
    throw new Error("deterministic protocol output is malformed JSON");
  }
  validateGeneratedProtocol(protocol);
  const actualDigest = createHash("sha256").update(result.stdout).digest("hex");
  if (actualDigest !== expectedDigest) throw new Error("deterministic protocol digest mismatch");
  return { digest: actualDigest, protocol };
}

function validateGitIdentity(snapshot, expected) {
  if (snapshot.branch !== "main") throw new Error("live execution requires branch main");
  if (snapshot.commit !== expected.commit) throw new Error("preparation commit mismatch");
  if (snapshot.tree !== expected.tree) throw new Error("preparation tree mismatch");
  if (snapshot.status !== "") throw new Error("live execution requires no staged, tracked, or untracked changes");
}

function validateLiveAcknowledgment(value) {
  if (value !== LIVE_ACK) throw new Error("exact live acknowledgment is required");
}

function assertLiveBlockersResolved(protocol) {
  if (protocol.liveExecution.blockedUntil.includes("EXACT_PUBLIC_KEY_ASSET_ORIGIN")) {
    throw new Error("exact public-key and CRS asset origins remain unresolved; reopen SG-5 before live execution");
  }
}

function portAvailable() {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.listen(3000, "127.0.0.1", () => server.close(() => resolvePromise(true)));
  });
}

async function assertPortAvailable() {
  if (!(await portAvailable()))
    throw new Error("port 3000 is occupied; the launcher never terminates pre-existing processes");
}

const RUN_DIRECTORY_PREFIX = "zama-szn4-sg5-";

function createPrivateRunDirectory(
  adapter = { chmodSync, lstatSync, mkdtempSync, realpathSync },
  temporaryRoot = tmpdir(),
) {
  const parentRealpath = adapter.realpathSync(temporaryRoot);
  const directory = adapter.mkdtempSync(join(parentRealpath, RUN_DIRECTORY_PREFIX));
  adapter.chmodSync(directory, 0o700);
  const linkStatus = adapter.lstatSync(directory);
  if (linkStatus.isSymbolicLink() || !linkStatus.isDirectory()) throw new Error("private run path is not a directory");
  if ((linkStatus.mode & 0o777) !== 0o700) throw new Error("private run directory mode is not 0700");
  const directoryRealpath = adapter.realpathSync(directory);
  if (dirname(directoryRealpath) !== parentRealpath || !basename(directoryRealpath).startsWith(RUN_DIRECTORY_PREFIX)) {
    throw new Error("private run directory escaped its trusted parent");
  }
  return Object.freeze({ directory, directoryRealpath, parentRealpath, prefix: RUN_DIRECTORY_PREFIX });
}

function validatePrivateRunDirectory(record, adapter = { lstatSync, realpathSync }) {
  const dangerous = new Set(["/", record.parentRealpath, tmpdir(), ROOT, TRUSTED_ROOT]);
  if (dangerous.has(record.directory) || dangerous.has(record.directoryRealpath)) {
    throw new Error("refusing dangerous temporary-directory target");
  }
  if (adapter.realpathSync(record.parentRealpath) !== record.parentRealpath) {
    throw new Error("temporary parent realpath changed");
  }
  const linkStatus = adapter.lstatSync(record.directory);
  if (linkStatus.isSymbolicLink() || !linkStatus.isDirectory()) {
    throw new Error("temporary run directory was substituted");
  }
  if (typeof linkStatus.mode === "number" && (linkStatus.mode & 0o777) !== 0o700) {
    throw new Error("temporary run directory permissions changed");
  }
  const currentRealpath = adapter.realpathSync(record.directory);
  if (
    currentRealpath !== record.directoryRealpath ||
    dirname(currentRealpath) !== record.parentRealpath ||
    !basename(currentRealpath).startsWith(record.prefix) ||
    basename(currentRealpath) === record.prefix
  ) {
    throw new Error("temporary run directory containment failed");
  }
  return currentRealpath;
}

function removePrivateRunDirectory(record, adapter = { lstatSync, realpathSync, rmSync }) {
  const verified = validatePrivateRunDirectory(record, adapter);
  adapter.rmSync(verified, { recursive: true, force: false });
}

function parseProcStat(text) {
  const close = text.lastIndexOf(")");
  if (close < 0) throw new Error("invalid proc stat record");
  const pid = Number.parseInt(text.slice(0, text.indexOf(" ")), 10);
  const fields = text
    .slice(close + 2)
    .trim()
    .split(/\s+/u);
  if (!Number.isSafeInteger(pid) || fields.length < 20) throw new Error("invalid proc stat fields");
  return {
    pid,
    ppid: Number.parseInt(fields[1], 10),
    processGroup: Number.parseInt(fields[2], 10),
    session: Number.parseInt(fields[3], 10),
    startTime: fields[19],
  };
}

function inspectProcess(pid, adapter = { readFileSync, readlinkSync, realpathSync }) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("invalid process identifier");
  try {
    const stat = parseProcStat(adapter.readFileSync(`/proc/${pid}/stat`, "utf8"));
    const cwd = adapter.realpathSync(adapter.readlinkSync(`/proc/${pid}/cwd`));
    const exe = adapter.realpathSync(adapter.readlinkSync(`/proc/${pid}/exe`));
    const cmdline = adapter.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean).join(" ");
    return Object.freeze({ ...stat, cwd, exe, cmdline });
  } catch {
    return undefined;
  }
}

function socketInodesForPort(port = 3000, adapter = { readFileSync }) {
  const inodes = new Set();
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let contents;
    try {
      contents = adapter.readFileSync(table, "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/u);
      if (fields.length < 10 || fields[3] !== "0A") continue;
      const portHex = fields[1]?.split(":").at(-1);
      if (Number.parseInt(portHex || "", 16) === port) inodes.add(fields[9]);
    }
  }
  return inodes;
}

function resolvePortOwnerPids(port = 3000, adapter = { readFileSync, readlinkSync, readdirSync }) {
  const inodes = socketInodesForPort(port, adapter);
  if (inodes.size === 0) return [];
  const owners = new Set();
  for (const name of adapter.readdirSync("/proc")) {
    if (!/^[1-9][0-9]*$/u.test(name)) continue;
    const pid = Number(name);
    let descriptors;
    try {
      descriptors = adapter.readdirSync(`/proc/${name}/fd`);
    } catch {
      continue;
    }
    for (const descriptor of descriptors) {
      try {
        const target = adapter.readlinkSync(`/proc/${name}/fd/${descriptor}`);
        const match = /^socket:\[([0-9]+)\]$/u.exec(target);
        if (match && inodes.has(match[1])) owners.add(pid);
      } catch {
        // Processes may exit while /proc is inspected.
      }
    }
  }
  return [...owners].sort((left, right) => left - right);
}

function ancestryForProcess(identity, inspector = inspectProcess) {
  const ancestry = [];
  const visited = new Set();
  let current = identity;
  while (current && current.pid > 1 && !visited.has(current.pid)) {
    ancestry.push({ pid: current.pid, startTime: current.startTime });
    visited.add(current.pid);
    current = inspector(current.ppid);
  }
  return ancestry;
}

function resolvePortOwnerIdentities(port = 3000, adapters = {}) {
  const pids = (adapters.resolvePortOwnerPids || resolvePortOwnerPids)(port);
  const inspector = adapters.inspectProcess || inspectProcess;
  return pids
    .map((pid) => inspector(pid))
    .filter(Boolean)
    .map((identity) => ({ ...identity, ancestry: ancestryForProcess(identity, inspector) }));
}

function enumerateProcessGroupMembers(processGroup, adapters = {}) {
  if (!Number.isSafeInteger(processGroup) || processGroup <= 0) throw new Error("invalid process-group identifier");
  const list = adapters.readdirSync || readdirSync;
  const inspector = adapters.inspectProcess || inspectProcess;
  const members = [];
  for (const name of list("/proc")) {
    if (!/^[1-9][0-9]*$/u.test(name)) continue;
    const identity = inspector(Number(name));
    if (identity?.processGroup === processGroup) members.push(identity);
  }
  return members.sort((left, right) => left.pid - right.pid);
}

function validateOwnedGroupLeader(identity, expected) {
  if (
    !identity ||
    identity.pid !== expected.pid ||
    identity.startTime !== expected.startTime ||
    identity.processGroup !== expected.processGroup ||
    identity.session !== expected.session ||
    identity.processGroup !== expected.pid ||
    identity.session !== expected.pid ||
    identity.cwd !== expected.cwd ||
    identity.exe !== expected.exe
  ) {
    throw new Error("launcher-owned process identity changed");
  }
}

function expectedEntrypoint(group) {
  return group.kind === "FRONTEND" ? NEXT_CLI : PLAYWRIGHT_CLI;
}

function matchesLaunchIdentity(group, identity) {
  return (
    identity !== null &&
    typeof identity === "object" &&
    typeof identity.cmdline === "string" &&
    identity.processGroup === group.leader.processGroup &&
    identity.session === group.leader.session &&
    identity.cwd === group.leader.cwd &&
    identity.exe === group.leader.exe &&
    identity.cmdline.includes(expectedEntrypoint(group))
  );
}

function rememberVerifiedMember(group, identity) {
  if (!Array.isArray(group.verifiedMembers)) return;
  if (!group.verifiedMembers.some((member) => member.pid === identity.pid && member.startTime === identity.startTime)) {
    group.verifiedMembers.push(
      Object.freeze({
        pid: identity.pid,
        startTime: identity.startTime,
        processGroup: identity.processGroup,
        session: identity.session,
        cwd: identity.cwd,
        exe: identity.exe,
        cmdline: identity.cmdline,
      }),
    );
  }
}

function verifySpawnedListenerOwnership(group, owners) {
  if (!Array.isArray(owners) || owners.length !== 1) throw new Error("port 3000 must have exactly one socket owner");
  const owner = owners[0];
  const previouslyVerified = (group.verifiedMembers || []).some(
    (member) => member.pid === owner.pid && member.startTime === owner.startTime,
  );
  const ownedByGroup =
    owner.processGroup === group.leader.processGroup &&
    owner.session === group.leader.session &&
    (previouslyVerified ||
      owner.ancestry.some(
        (ancestor) => ancestor.pid === group.leader.pid && ancestor.startTime === group.leader.startTime,
      ));
  if (!ownedByGroup || !matchesLaunchIdentity(group, owner)) {
    throw new Error("port 3000 listener is not the verified spawned Next frontend");
  }
  rememberVerifiedMember(group, owner);
  return owner;
}

function captureOwnedProcessGroup(child, kind, inspector = inspectProcess) {
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) throw new Error("spawned process has no valid PID");
  const leader = inspector(child.pid);
  if (!leader || leader.processGroup !== leader.pid || leader.session !== leader.pid) {
    throw new Error("spawned process did not create a dedicated process group and session");
  }
  const expectedEntrypoint = kind === "FRONTEND" ? NEXT_CLI : PLAYWRIGHT_CLI;
  if (
    leader.cwd !== FRONTEND_ROOT ||
    leader.exe !== realpathSync(process.execPath) ||
    !leader.cmdline.includes(expectedEntrypoint)
  ) {
    throw new Error("spawned process identity does not match the trusted local entrypoint");
  }
  return Object.freeze({ kind, leader, verifiedMembers: [Object.freeze({ ...leader })] });
}

async function waitForOwnedFrontend(group, adapters = {}) {
  const resolveOwners = adapters.resolvePortOwnerIdentities || resolvePortOwnerIdentities;
  const fetchHealth = adapters.fetchHealth || (() => fetch("http://127.0.0.1:3000/api/sg5-health"));
  const delay =
    adapters.delay || ((milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)));
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const owners = resolveOwners(3000);
    if (owners.length > 0) {
      verifySpawnedListenerOwnership(group, owners);
      const result = await fetchHealth().catch(() => undefined);
      if (result?.ok) {
        verifySpawnedListenerOwnership(group, resolveOwners(3000));
        return;
      }
    }
    await delay(500);
  }
  throw new Error("verified local SG-5 frontend did not become ready");
}

function processGroupStillMatches(group, inspector = inspectProcess) {
  const current = inspector(group.leader.pid);
  if (!current) return false;
  validateOwnedGroupLeader(current, group.leader);
  return true;
}

const SUCCESSFUL_CLEANUP_RESULTS = Object.freeze(
  new Set(["ALREADY_EXITED", "TERMINATED_GRACEFULLY", "TERMINATED_FORCIBLY"]),
);

function inspectOwnedProcessGroup(group, adapters = {}) {
  const inspector = adapters.inspectProcess || inspectProcess;
  const enumerate = adapters.enumerateProcessGroupMembers || enumerateProcessGroupMembers;
  const resolveOwners = adapters.resolvePortOwnerIdentities || resolvePortOwnerIdentities;
  const knownMembers = Array.isArray(group.verifiedMembers) ? group.verifiedMembers : [group.leader];
  const liveKnownMembers = [];

  for (const known of knownMembers) {
    const current = inspector(known.pid);
    if (current && current.startTime !== known.startTime) {
      return Object.freeze({ classification: "PID_REUSE_DETECTED", members: [], listenerOwners: [] });
    }
    if (current && known.pid === group.leader.pid) {
      try {
        validateOwnedGroupLeader(current, group.leader);
      } catch {
        return Object.freeze({ classification: "AMBIGUOUS_PROCESS_GROUP", members: [], listenerOwners: [] });
      }
    }
    if (current) {
      if (
        current.processGroup !== group.leader.processGroup ||
        current.session !== group.leader.session ||
        !matchesLaunchIdentity(group, current)
      ) {
        return Object.freeze({ classification: "OWNERSHIP_LOST", members: [], listenerOwners: [] });
      }
      liveKnownMembers.push(current);
    }
  }

  let members;
  try {
    members = enumerate(group.leader.processGroup, { inspectProcess: inspector });
  } catch {
    return Object.freeze({ classification: "AMBIGUOUS_PROCESS_GROUP", members: [], listenerOwners: [] });
  }
  const uniquePids = new Set();
  for (const member of members) {
    if (uniquePids.has(member.pid)) {
      return Object.freeze({ classification: "AMBIGUOUS_PROCESS_GROUP", members, listenerOwners: [] });
    }
    uniquePids.add(member.pid);
    const known = knownMembers.find((candidate) => candidate.pid === member.pid);
    if (known && known.startTime !== member.startTime) {
      return Object.freeze({ classification: "PID_REUSE_DETECTED", members, listenerOwners: [] });
    }
    if (!matchesLaunchIdentity(group, member)) {
      return Object.freeze({ classification: "AMBIGUOUS_PROCESS_GROUP", members, listenerOwners: [] });
    }
  }
  for (const known of liveKnownMembers) {
    if (!members.some((member) => member.pid === known.pid && member.startTime === known.startTime)) {
      return Object.freeze({ classification: "AMBIGUOUS_PROCESS_GROUP", members, listenerOwners: [] });
    }
  }

  let listenerOwners = [];
  if (group.kind === "FRONTEND") {
    try {
      listenerOwners = resolveOwners(3000);
    } catch {
      return Object.freeze({ classification: "OWNERSHIP_LOST", members, listenerOwners: [] });
    }
    if (listenerOwners.length > 1) {
      return Object.freeze({ classification: "AMBIGUOUS_PROCESS_GROUP", members, listenerOwners });
    }
    if (listenerOwners.length === 1) {
      const listener = listenerOwners[0];
      const matchingMember = members.find(
        (member) => member.pid === listener.pid && member.startTime === listener.startTime,
      );
      if (!matchingMember) {
        return Object.freeze({ classification: "OWNERSHIP_LOST", members, listenerOwners });
      }
      if (!matchesLaunchIdentity(group, listener)) {
        return Object.freeze({ classification: "AMBIGUOUS_PROCESS_GROUP", members, listenerOwners });
      }
      rememberVerifiedMember(group, listener);
    }
  }

  if (members.length === 0) {
    return Object.freeze({ classification: "ALREADY_EXITED", members, listenerOwners });
  }
  for (const member of members) rememberVerifiedMember(group, member);
  return Object.freeze({ classification: "VERIFIED_ACTIVE", members, listenerOwners });
}

function revalidateOwnedListenerBeforeSignal(group, resolveOwners = resolvePortOwnerIdentities) {
  if (group.kind !== "FRONTEND") return;
  const owners = resolveOwners(3000);
  const owned = owners.filter(
    (owner) =>
      owner.processGroup === group.leader.processGroup &&
      owner.session === group.leader.session &&
      owner.ancestry.some(
        (ancestor) => ancestor.pid === group.leader.pid && ancestor.startTime === group.leader.startTime,
      ),
  );
  if (owned.length > 1) throw new Error("launcher-owned frontend has ambiguous port owners");
  if (owned.length === 1) verifySpawnedListenerOwnership(group, owned);
}

function assertOwnedListenerReleased(group, resolveOwners = resolvePortOwnerIdentities) {
  if (group.kind !== "FRONTEND") return;
  const owned = resolveOwners(3000).filter(
    (owner) => owner.processGroup === group.leader.processGroup && owner.session === group.leader.session,
  );
  if (owned.length !== 0) throw new Error("launcher-owned frontend still owns port 3000 after cleanup");
}

async function terminateOwnedProcessGroup(group, adapters = {}) {
  const signal = adapters.signal || ((pid, name) => process.kill(pid, name));
  const inspectGroup = () => inspectOwnedProcessGroup(group, adapters);
  const waitForResolution =
    adapters.waitForResolution ||
    (async (milliseconds) => {
      const deadline = Date.now() + milliseconds;
      while (Date.now() < deadline) {
        const state = inspectGroup();
        if (state.classification !== "VERIFIED_ACTIVE") return state;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      return inspectGroup();
    });

  let state = inspectGroup();
  if (state.classification !== "VERIFIED_ACTIVE") return state.classification;
  state = inspectGroup();
  if (state.classification !== "VERIFIED_ACTIVE") return state.classification;
  signal(-group.leader.processGroup, "SIGTERM");
  state = await waitForResolution(3_000);
  if (state.classification === "ALREADY_EXITED") return "TERMINATED_GRACEFULLY";
  if (state.classification !== "VERIFIED_ACTIVE") return state.classification;
  state = inspectGroup();
  if (state.classification === "ALREADY_EXITED") return "TERMINATED_GRACEFULLY";
  if (state.classification !== "VERIFIED_ACTIVE") return state.classification;
  signal(-group.leader.processGroup, "SIGKILL");
  state = await waitForResolution(2_000);
  if (state.classification === "ALREADY_EXITED") return "TERMINATED_FORCIBLY";
  if (state.classification !== "VERIFIED_ACTIVE") return state.classification;
  return "AMBIGUOUS_PROCESS_GROUP";
}

function createCleanupController(resources, adapters = {}) {
  let cleanupPromise;
  return Object.freeze({
    cleanup: () => {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = (async () => {
        const failures = [];
        for (const group of [...resources.groups].reverse()) {
          try {
            const result = await (adapters.terminateOwnedProcessGroup || terminateOwnedProcessGroup)(
              group,
              adapters.processAdapters,
            );
            if (!SUCCESSFUL_CLEANUP_RESULTS.has(result)) failures.push(new Error(`unresolved cleanup: ${result}`));
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length === 0 && resources.runDirectory) {
          try {
            (adapters.removePrivateRunDirectory || removePrivateRunDirectory)(
              resources.runDirectory,
              adapters.tempAdapter,
            );
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length > 0)
          throw new Error("one or more SG-5 cleanup operations remain unresolved; private diagnostics retained");
      })();
      return cleanupPromise;
    },
  });
}

function createLifecycleHandlers(controller, runtime = process) {
  let handling = false;
  const handlers = new Map();
  const remove = () => {
    for (const [event, handler] of handlers) runtime.removeListener(event, handler);
  };
  const dispatch = async (event) => {
    if (handling) return;
    handling = true;
    try {
      await controller.cleanup();
    } catch {
      // Exit semantics are preserved even when a verified cleanup step fails closed.
    } finally {
      remove();
      if (["SIGINT", "SIGTERM", "SIGHUP"].includes(event)) runtime.kill(runtime.pid, event);
      else runtime.exit(1);
    }
  };
  for (const event of ["SIGINT", "SIGTERM", "SIGHUP", "uncaughtException", "unhandledRejection"]) {
    const handler = () => void dispatch(event);
    handlers.set(event, handler);
    runtime.once(event, handler);
  }
  return Object.freeze({ dispatch, remove });
}

async function runBrowserMode(live) {
  assertTrustedRoot();
  assertNoCredentialEnvironment();
  assertNoLocalEnvironmentFiles();
  const browserAvailability = inspectBrowserAvailability();
  const browserSelection = browserAvailability.selection;
  if (!browserSelection) throw new Error("no existing Playwright Chromium or system Chromium browser is available");

  if (live) {
    validateLiveAcknowledgment(process.env.SG5_LIVE_ACK);
    const [expectedCommit, expectedTree, expectedProtocolDigest] = process.argv.slice(3);
    if (!/^[0-9a-f]{40}$/u.test(expectedCommit || "") || !/^[0-9a-f]{40}$/u.test(expectedTree || "")) {
      throw new Error("live mode requires explicit expected preparation commit and tree arguments");
    }
    const verified = generateAndVerifyProtocol(expectedProtocolDigest);
    validateGitIdentity(
      {
        branch: git("branch", "--show-current"),
        commit: git("rev-parse", "HEAD"),
        tree: git("rev-parse", "HEAD^{tree}"),
        status: git("status", "--porcelain", "--untracked-files=all"),
      },
      { commit: expectedCommit, tree: expectedTree },
    );
    if (existsSync(EVIDENCE_PATH) || existsSync(EVIDENCE_SIDECAR_PATH)) {
      throw new Error("SG-5 evidence or sidecar already exists; reviewed rerun authorization is required");
    }
    assertLiveBlockersResolved(verified.protocol);
  }

  await assertPortAvailable();
  const runDirectory = createPrivateRunDirectory();
  const isolatedHome = join(runDirectory.directoryRealpath, "home");
  mkdirSync(isolatedHome, { mode: 0o700 });
  const resources = { groups: [], runDirectory };
  const cleanupController = createCleanupController(resources);
  let lifecycle;
  const childEnv = {
    PATH: process.env.PATH,
    HOME: isolatedHome,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    SG5_EXTERNAL_SERVER: "1",
    SG5_PROBE_PAGE: "ENABLED_LOCAL_ONLY",
    ...browserLaunchEnvironment(browserSelection),
    SG5_PLAYWRIGHT_OUTPUT_DIR: join(runDirectory.directoryRealpath, "playwright-output"),
    ...(live ? { SG5_LIVE_ACK: LIVE_ACK } : {}),
  };
  const frontend = spawn(process.execPath, [NEXT_CLI, "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: FRONTEND_ROOT,
    env: childEnv,
    stdio: "ignore",
    detached: true,
  });
  let frontendGroup;
  try {
    frontendGroup = captureOwnedProcessGroup(frontend, "FRONTEND");
  } catch (error) {
    removePrivateRunDirectory(runDirectory);
    throw error;
  }
  resources.groups.push(frontendGroup);
  lifecycle = createLifecycleHandlers(cleanupController);
  const frontendFailure = new Promise((_, rejectPromise) => {
    frontend.once("error", () => rejectPromise(new Error("local frontend process failed to start")));
    frontend.once("exit", (code, signal) => {
      rejectPromise(
        new Error(`local frontend process exited before cleanup (${code ?? "signal"}:${signal ?? "none"})`),
      );
    });
  });
  let playwright;

  try {
    await Promise.race([waitForOwnedFrontend(frontendGroup), frontendFailure]);
    revalidateBrowserSelection(browserSelection);
    playwright = spawn(process.execPath, [PLAYWRIGHT_CLI, "test", "e2e/sg5-browser.spec.ts"], {
      cwd: FRONTEND_ROOT,
      env: childEnv,
      stdio: "ignore",
      detached: true,
    });
    resources.groups.push(captureOwnedProcessGroup(playwright, "PLAYWRIGHT"));
    const status = await new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        rejectPromise(new Error("sanitized Playwright suite timed out"));
      }, 900_000);
      playwright.once("error", (error) => {
        clearTimeout(timeout);
        rejectPromise(error);
      });
      playwright.once("exit", (code, signal) => {
        clearTimeout(timeout);
        resolvePromise({ code, signal });
      });
    });
    const passed = status.code === 0 && status.signal === null;
    process.stdout.write(passed ? "SG5_BROWSER_SUITE_PASS\n" : "SG5_BROWSER_SUITE_FAIL\n");
    if (!passed) throw new Error("sanitized Playwright suite failed");
  } finally {
    try {
      await cleanupController.cleanup();
    } finally {
      lifecycle?.remove();
    }
  }
}

async function main() {
  const mode = process.argv[2] || "preflight";
  assertTrustedRoot();
  if (mode === "preflight") {
    const availability = inspectBrowserAvailability();
    process.stdout.write(
      `${JSON.stringify({
        schema: "zama-szn4.sg5-preflight.v1",
        playwrightApiClassification: availability.playwrightApiClassification,
        managedBrowserClassification: availability.managedBrowserClassification,
        browserAvailabilityClassification: availability.availabilityClassification,
        browserAvailable: Boolean(availability.selection),
        status: availability.selection ? "READY" : "BLOCKED_NO_BROWSER",
      })}\n`,
    );
    return;
  }
  if (mode === "structural") return runBrowserMode(false);
  if (mode === "live") return runBrowserMode(true);
  throw new Error("mode must be preflight, structural, or live");
}

module.exports = Object.freeze({
  LIVE_ACK,
  MAX_PROTOCOL_BYTES,
  TRUSTED_ROOT,
  assertLiveBlockersResolved,
  assertOwnedListenerReleased,
  browserExecutable,
  browserLaunchEnvironment,
  captureOwnedProcessGroup,
  createCleanupController,
  createLifecycleHandlers,
  createPrivateRunDirectory,
  discoverBrowser,
  enumerateProcessGroupMembers,
  generateAndVerifyProtocol,
  inspectProcess,
  inspectBrowserAvailability,
  inspectOwnedProcessGroup,
  parseProcStat,
  processGroupStillMatches,
  removePrivateRunDirectory,
  revalidateBrowserSelection,
  revalidateOwnedListenerBeforeSignal,
  resolvePortOwnerIdentities,
  resolvePortOwnerPids,
  resolvePlaywrightApi,
  socketInodesForPort,
  terminateOwnedProcessGroup,
  validateBrowserCandidate,
  validateGeneratedProtocol,
  validateGitIdentity,
  validateLiveAcknowledgment,
  validateOwnedGroupLeader,
  validatePrivateRunDirectory,
  validateTrustedRootSnapshot,
  verifySpawnedListenerOwnership,
  waitForOwnedFrontend,
});

if (require.main === module)
  main().catch((error) => fail(error instanceof Error ? error.message : "unknown launcher failure"));
