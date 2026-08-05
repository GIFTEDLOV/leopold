/* global __filename, module, process, require */

"use strict";

// Only side-effect-free Node built-ins are loaded before validation. Temporary
// CP0/SG-2 authorization is deliberately bound to the exact trusted checkout.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { realpathSync } = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require("node:path");

const SG2_SECURE_LAUNCH_MARKER = "SG2_SECURE_LAUNCH";
const HARDHAT_NETWORK_ENVIRONMENT_VARIABLE = "HARDHAT_NETWORK";
const HARDHAT_VERBOSE_ENVIRONMENT_VARIABLE = "HARDHAT_VERBOSE";
const SEPOLIA_NETWORK_NAME = "sepolia";
const VERBOSE_ERROR = "SG2 launcher rejected Hardhat verbose mode; sensitive details suppressed.";
const DEBUG_ERROR = "SG2 launcher rejected unsafe debug configuration; sensitive details suppressed.";
const ARGUMENT_ERROR = "SG2 launcher arguments are invalid; sensitive details suppressed.";
const BOOTSTRAP_ERROR = "SG2 launcher bootstrap failed; sensitive details suppressed.";
const AUTHORIZATION_ERROR = "SG2 process-local authorization failed; sensitive details suppressed.";
const TRUSTED_ROOT = "/home/dell/zama-szn4";
// Locked Hardhat 2.28.6 and @fhevm/hardhat-plugin 0.4.2 debug namespaces.
// Testing the installed concrete namespaces preserves debug@4.4.3 wildcard and exclusion semantics.
const FORBIDDEN_DEBUG_NAMESPACES = [
  "hardhat:sentry:subprocess",
  "hardhat:core:hre",
  "hardhat:core:config",
  "hardhat:core:vars:varsManager",
  "hardhat:core:scripts-runner",
  "hardhat:util:multi-process-mutex",
  "hardhat:core:vars:varsManagerSetup",
  "hardhat:core:tasks:compile",
  "hardhat:core:tasks:console",
  "hardhat:core:tasks:run",
  "hardhat:core:tasks:compile:cache",
  "hardhat:core:compilation-watcher",
  "hardhat:util:request",
  "hardhat:core:global-dir",
  "hardhat:core:tasks:node",
  "hardhat:core:artifacts",
  "hardhat:core:hardhat-network:provider",
  "hardhat:core:hardhat-network:jsonrpc",
  "hardhat:core:analytics",
  "hardhat:core:solidity:downloader",
  "hardhat:util:banner-manager",
  "hardhat:core:cli",
  "hardhat:cli:vars",
  "hardhat:core:compilation-job",
  "@fhevm/hardhat:provider",
  "@fhevm/hardhat:instance",
  "@fhevm/hardhat:addresses",
  "@fhevm/hardhat:env",
  "@fhevm/hardhat:builtin-tasks",
  "@fhevm/hardhat:setup",
];
const ACTION_TO_TASK = Object.freeze({
  preflight: "sg2:preflight",
  deploy: "sg2:deploy",
  prepare: "sg2:prepare",
  verify: "sg2:verify",
});

class LauncherValidationError extends Error {}

function failBootstrapIdentity() {
  throw new LauncherValidationError(AUTHORIZATION_ERROR);
}

function realPath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return failBootstrapIdentity();
  }
}

function resolveCanonicalProjectPaths() {
  try {
    const root = realPath(TRUSTED_ROOT);
    if (root !== TRUSTED_ROOT || realPath(process.cwd()) !== TRUSTED_ROOT) {
      return failBootstrapIdentity();
    }
    const paths = Object.freeze({
      launcher: realPath(join(root, "scripts", "sg2-launcher.cjs")),
      state: realPath(join(root, "scripts", "sg2-bootstrap-state.cjs")),
      tasks: realPath(join(root, "tasks", "sg2.ts")),
    });
    if (
      paths.launcher !== join(TRUSTED_ROOT, "scripts", "sg2-launcher.cjs") ||
      paths.state !== join(TRUSTED_ROOT, "scripts", "sg2-bootstrap-state.cjs") ||
      paths.tasks !== join(TRUSTED_ROOT, "tasks", "sg2.ts")
    ) {
      return failBootstrapIdentity();
    }
    return paths;
  } catch {
    return failBootstrapIdentity();
  }
}

let canonicalProjectPaths;
let bootstrapState;
try {
  const resolvedPaths = resolveCanonicalProjectPaths();
  if (realPath(__filename) !== resolvedPaths.launcher) {
    failBootstrapIdentity();
  }
  canonicalProjectPaths = resolvedPaths;
  // Requiring the canonical real path prevents --preserve-symlinks from
  // creating a second authorization-state module instance.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  bootstrapState = require(resolvedPaths.state);
} catch {
  // Main-entry failures are emitted only through runCli's fixed-message path.
  canonicalProjectPaths = undefined;
  bootstrapState = undefined;
}

function requireCanonicalBootstrap(requireLauncherMain = false) {
  if (canonicalProjectPaths === undefined || bootstrapState === undefined) {
    failBootstrapIdentity();
  }
  if (
    requireLauncherMain &&
    (typeof require.main?.filename !== "string" || realPath(require.main.filename) !== canonicalProjectPaths.launcher)
  ) {
    failBootstrapIdentity();
  }
  return { bootstrapState, canonicalProjectPaths };
}

function debugPatternMatches(namespace, pattern) {
  let namespaceIndex = 0;
  let patternIndex = 0;
  let wildcardIndex = -1;
  let wildcardMatchIndex = 0;

  while (namespaceIndex < namespace.length) {
    if (
      patternIndex < pattern.length &&
      (pattern[patternIndex] === namespace[namespaceIndex] || pattern[patternIndex] === "*")
    ) {
      if (pattern[patternIndex] === "*") {
        wildcardIndex = patternIndex;
        wildcardMatchIndex = namespaceIndex;
        patternIndex += 1;
      } else {
        namespaceIndex += 1;
        patternIndex += 1;
      }
    } else if (wildcardIndex !== -1) {
      patternIndex = wildcardIndex + 1;
      wildcardMatchIndex += 1;
      namespaceIndex = wildcardMatchIndex;
    } else {
      return false;
    }
  }

  while (patternIndex < pattern.length && pattern[patternIndex] === "*") {
    patternIndex += 1;
  }
  return patternIndex === pattern.length;
}

function forbiddenDebugEnabled(debugSelector) {
  const patterns = (debugSelector ?? "")
    .trim()
    .replace(/\s+/gu, ",")
    .split(",")
    .filter((pattern) => pattern.length > 0);
  const exclusions = patterns.filter((pattern) => pattern.startsWith("-")).map((pattern) => pattern.slice(1));

  return FORBIDDEN_DEBUG_NAMESPACES.some((namespace) => {
    if (exclusions.some((pattern) => debugPatternMatches(namespace, pattern))) {
      return false;
    }
    return patterns
      .filter((pattern) => !pattern.startsWith("-"))
      .some((pattern) => debugPatternMatches(namespace, pattern));
  });
}

function requireSafePreBootstrapEnvironment(argumentsList, environment) {
  const hardhatVerbose = environment[HARDHAT_VERBOSE_ENVIRONMENT_VARIABLE];
  if (hardhatVerbose !== undefined) {
    const normalizedVerbose = hardhatVerbose.toLowerCase();
    if (normalizedVerbose !== "false") {
      throw new LauncherValidationError(VERBOSE_ERROR);
    }
  }
  if (argumentsList.includes("--verbose")) {
    throw new LauncherValidationError(VERBOSE_ERROR);
  }
  if (forbiddenDebugEnabled(environment.DEBUG)) {
    throw new LauncherValidationError(DEBUG_ERROR);
  }
}

function validateLaunchRequest(action, rawArguments, environment, isAddress) {
  requireSafePreBootstrapEnvironment(rawArguments, environment);

  const taskName = ACTION_TO_TASK[action];
  if (taskName === undefined) {
    throw new LauncherValidationError(ARGUMENT_ERROR);
  }
  if (action === "preflight" || action === "deploy") {
    if (rawArguments.length !== 0) {
      throw new LauncherValidationError(ARGUMENT_ERROR);
    }
    return { action, taskArguments: {}, taskName };
  }

  if (rawArguments.length !== 3 || rawArguments[0] !== "--" || rawArguments[1] !== "--address") {
    throw new LauncherValidationError(ARGUMENT_ERROR);
  }
  const address = rawArguments[2];
  let validAddress = false;
  try {
    validAddress = typeof address === "string" && isAddress(address);
  } catch {
    validAddress = false;
  }
  if (!validAddress) {
    throw new LauncherValidationError(ARGUMENT_ERROR);
  }
  return { action, taskArguments: { address: address.toLowerCase() }, taskName };
}

function installedAddressValidator(address) {
  // Ethereum address identity is case-insensitive. Canonical lowercase output
  // keeps pre-bootstrap validation dependency-free.
  return /^0x[0-9a-fA-F]{40}$/u.test(address);
}

async function loadInstalledHardhat() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("hardhat");
}

async function loadInstalledDispatcher() {
  const paths = requireCanonicalBootstrap().canonicalProjectPaths;
  // Hardhat installs the TypeScript loader while bootstrapping the project.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const taskModule = require(paths.tasks);
  if (typeof taskModule?.dispatchSg2 !== "function") {
    throw new Error(BOOTSTRAP_ERROR);
  }
  return taskModule.dispatchSg2;
}

async function executeLaunch({
  action,
  argumentsList,
  environment,
  processArguments,
  isAddress = installedAddressValidator,
  loadHardhat = loadInstalledHardhat,
  loadDispatcher = loadInstalledDispatcher,
}) {
  const request = validateLaunchRequest(action, argumentsList, environment, isAddress);

  const state = requireCanonicalBootstrap(true).bootstrapState;
  const session = state.createLauncherSession(request.taskName);

  try {
    // This marker is informational only; authorization lives in module-private process state.
    environment[SG2_SECURE_LAUNCH_MARKER] = "1";
    environment[HARDHAT_NETWORK_ENVIRONMENT_VARIABLE] = SEPOLIA_NETWORK_NAME;
    processArguments.splice(2);

    const hre = await loadHardhat();
    if (typeof hre !== "object" || hre === null) {
      throw new Error("invalid Hardhat runtime");
    }
    const dispatchSg2 = await loadDispatcher();
    if (session.readAction() !== request.taskName) {
      throw new Error(BOOTSTRAP_ERROR);
    }
    await dispatchSg2(hre, request.action, request.taskArguments, session.capability);
  } catch {
    throw new Error(BOOTSTRAP_ERROR);
  } finally {
    session.revoke();
  }
}

async function runCli({
  action,
  argumentsList,
  environment,
  processArguments,
  isAddress = installedAddressValidator,
  loadHardhat = loadInstalledHardhat,
  loadDispatcher = loadInstalledDispatcher,
  writeError,
}) {
  try {
    await executeLaunch({
      action,
      argumentsList,
      environment,
      processArguments,
      isAddress,
      loadHardhat,
      loadDispatcher,
    });
    return 0;
  } catch (error) {
    const message = error instanceof LauncherValidationError ? error.message : BOOTSTRAP_ERROR;
    writeError(message);
    return 1;
  }
}

if (require.main === module) {
  const action = process.argv[2];
  const argumentsList = process.argv.slice(3);
  void runCli({
    action,
    argumentsList,
    environment: process.env,
    processArguments: process.argv,
    writeError: (message) => process.stderr.write(`${message}\n`),
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  ARGUMENT_ERROR,
  BOOTSTRAP_ERROR,
  DEBUG_ERROR,
  VERBOSE_ERROR,
  executeLaunch,
  requireSafePreBootstrapEnvironment,
  runCli,
  forbiddenDebugEnabled,
  validateLaunchRequest,
};
