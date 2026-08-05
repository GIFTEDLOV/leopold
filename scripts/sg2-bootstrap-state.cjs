/* global __filename, module, require */

"use strict";

// Temporary CP0/SG-2 tooling is intentionally bound to this exact trusted
// checkout. A clone or structurally identical copy is not authoritative.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { realpathSync } = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require("node:path");

const AUTHORIZATION_ERROR = "SG2 process-local authorization failed; sensitive details suppressed.";
const TRUSTED_ROOT = "/home/dell/zama-szn4";
const SG2_TASK_NAMES = new Set(["sg2:preflight", "sg2:deploy", "sg2:prepare", "sg2:verify"]);

function failAuthorization() {
  throw new Error(AUTHORIZATION_ERROR);
}

function realPath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return failAuthorization();
  }
}

const trustedRoot = realPath(TRUSTED_ROOT);
if (trustedRoot !== TRUSTED_ROOT) {
  failAuthorization();
}
const trustedLauncher = realPath(join(TRUSTED_ROOT, "scripts", "sg2-launcher.cjs"));
const trustedState = realPath(join(TRUSTED_ROOT, "scripts", "sg2-bootstrap-state.cjs"));
if (
  trustedLauncher !== join(TRUSTED_ROOT, "scripts", "sg2-launcher.cjs") ||
  trustedState !== join(TRUSTED_ROOT, "scripts", "sg2-bootstrap-state.cjs") ||
  realPath(__filename) !== trustedState
) {
  failAuthorization();
}

// The factory is permanently disabled if a preload, wrapper, copied launcher,
// or non-canonical cache alias loads this singleton before the trusted main.
const initialParentFilename = module.parent?.filename;
const launcherFactoryEnabled =
  typeof initialParentFilename === "string" &&
  realPath(initialParentFilename) === trustedLauncher &&
  typeof require.main?.filename === "string" &&
  realPath(require.main.filename) === trustedLauncher;

const capabilityRecords = new WeakMap();
let activeAction;
let establishmentOccurred = false;

function requireCanonicalLauncherMain() {
  const mainFilename = require.main?.filename;
  if (typeof mainFilename !== "string" || realPath(mainFilename) !== trustedLauncher) {
    failAuthorization();
  }
}

function createLauncherSession(action) {
  requireCanonicalLauncherMain();
  if (!launcherFactoryEnabled || !SG2_TASK_NAMES.has(action) || establishmentOccurred || activeAction !== undefined) {
    failAuthorization();
  }

  const capability = Object.freeze(Object.create(null));
  const record = { action, consumed: false, revoked: false };
  capabilityRecords.set(capability, record);
  establishmentOccurred = true;
  activeAction = action;

  const readAction = () => {
    if (record.revoked || activeAction !== action) {
      failAuthorization();
    }
    return action;
  };
  const revoke = () => {
    if (record.revoked) return;
    record.revoked = true;
    record.consumed = true;
    if (activeAction === action) activeAction = undefined;
  };

  return Object.freeze({ capability, readAction, revoke });
}

function consumeDispatchCapability(capability, action) {
  if (typeof capability !== "object" || capability === null || !SG2_TASK_NAMES.has(action)) {
    failAuthorization();
  }
  const record = capabilityRecords.get(capability);
  if (
    record === undefined ||
    record.revoked ||
    record.consumed ||
    record.action !== action ||
    activeAction !== action
  ) {
    failAuthorization();
  }
  record.consumed = true;
}

function peekAuthorizedAction() {
  return activeAction;
}

module.exports = Object.freeze({
  AUTHORIZATION_ERROR,
  consumeDispatchCapability,
  createLauncherSession,
  peekAuthorizedAction,
});
