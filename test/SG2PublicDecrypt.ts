import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { FunctionFragment } from "ethers";

import type { SG2PublicDecrypt, SG2PublicDecrypt__factory } from "../types";
import { dispatchSg2, sg2TestHooks } from "../tasks/sg2";

type LauncherRequest = {
  action: string;
  taskArguments: Record<string, string>;
  taskName: string;
};

type LauncherRuntimeOptions = {
  action: string | undefined;
  argumentsList: readonly string[];
  environment: Record<string, string | undefined>;
  processArguments: string[];
  isAddress?: (address: string) => boolean;
  loadHardhat?: () => Promise<Record<string, unknown>>;
  loadDispatcher?: () => Promise<
    (
      hre: Record<string, unknown>,
      action: string,
      taskArguments: Record<string, string>,
      capability: Readonly<object>,
    ) => Promise<void>
  >;
};

type LauncherModule = {
  ARGUMENT_ERROR: string;
  BOOTSTRAP_ERROR: string;
  DEBUG_ERROR: string;
  DISPATCHER_LOADING_ERROR: string;
  DISPATCH_ERROR: string;
  HARDHAT_BOOTSTRAP_ERROR: string;
  VERBOSE_ERROR: string;
  executeLaunch(options: LauncherRuntimeOptions): Promise<void>;
  runCli(
    options: LauncherRuntimeOptions & {
      writeError: (message: string) => void;
    },
  ): Promise<number>;
  forbiddenDebugEnabled(debugSelector: string | undefined): boolean;
  validateLaunchRequest(
    action: string | undefined,
    argumentsList: readonly string[],
    environment: Readonly<Record<string, string | undefined>>,
    isAddress: (address: string) => boolean,
  ): LauncherRequest;
};

type FreshLauncherReport = {
  authorizationAfterExit?: string;
  authorizationAtRun?: string;
  bootstrapStages: string[];
  hardhatLoads: number;
  hardhatRegisterLoads: number;
  handlerEntries: string[];
  loadedRequests: string[];
  networkAtLoad?: string;
  processArgumentsAtLoad?: string[];
  probe?: Record<string, unknown>;
  dispatchCalls: Array<{ action: string; taskArguments: Record<string, string> }>;
  errorWrites: string[];
  secureMarkerAfterExit?: string;
  secureMarkerAtLoad?: string;
  revokedCapabilityRejected?: boolean;
};

type FreshLauncherResult = {
  report: FreshLauncherReport;
  status: number | null;
  stderr: string;
  stdout: string;
};

// The CommonJS launcher deliberately has no top-level Hardhat import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sg2Launcher = require("../scripts/sg2-launcher.cjs") as LauncherModule;
const repositoryRoot = resolve(__dirname, "..");

function runFreshLauncher(
  action: string,
  argumentsList: string[],
  mode:
    | "hardhat-throw"
    | "dispatcher-throw"
    | "normal"
    | "mismatch"
    | "esm-observe"
    | "preload-authorize"
    | "preload-require-launcher"
    | "reauthorize"
    | "repeat"
    | "state-alias"
    | "throw" = "normal",
  environment: Record<string, string> = {},
  options: Readonly<{
    cwd?: string;
    launcherPath?: string;
    nodeArguments?: readonly string[];
    stateAliasPath?: string;
  }> = {},
): FreshLauncherResult {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "sg2-launcher-review-"));
  const reportPath = join(temporaryDirectory, "report.json");
  const preloadPath = join(temporaryDirectory, "observe.cjs");
  const launcherPath = options.launcherPath ?? resolve(__dirname, "../scripts/sg2-launcher.cjs");
  const bootstrapStatePath = resolve(__dirname, "../scripts/sg2-bootstrap-state.cjs");
  const taskModulePath = resolve(__dirname, "../tasks/sg2.ts");
  const preloadSource = `
"use strict";
const fs = require("node:fs");
const Module = require("node:module");
const reportPath = ${JSON.stringify(reportPath)};
const bootstrapStatePath = ${JSON.stringify(bootstrapStatePath)};
const taskModulePath = ${JSON.stringify(taskModulePath)};
const launcherPath = ${JSON.stringify(launcherPath)};
const stateAliasPath = ${JSON.stringify(options.stateAliasPath)};
const mode = ${JSON.stringify(mode)};
const originalLoad = Module._load;
const report = {
  bootstrapStages: [],
  dispatchCalls: [],
  errorWrites: [],
  hardhatLoads: 0,
  hardhatRegisterLoads: 0,
  handlerEntries: [],
  loadedRequests: [],
};
let dispatchedCapability;
let dispatchedTaskName;
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function observedStderrWrite(chunk, ...rest) {
  report.errorWrites.push(String(chunk));
  return originalStderrWrite(chunk, ...rest);
};
if (typeof Module.registerHooks !== "function") throw new Error("module hooks unavailable");
Module.registerHooks({
  resolve(specifier, context, nextResolve) {
    report.loadedRequests.push(String(specifier));
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    report.loadedRequests.push(String(url));
    return nextLoad(url, context);
  },
});
if (mode === "esm-observe") {
  void import("data:text/javascript,export default 1");
}
Module._load = function observedLoad(request, parent, isMain) {
  report.loadedRequests.push(String(request));
  if (request === "hardhat/register") {
    report.hardhatRegisterLoads += 1;
    report.bootstrapStages.push("typescript-bootstrap");
    return {};
  }
  if (request === "hardhat") {
    if (report.hardhatRegisterLoads !== 1) throw new Error("mocked TypeScript bootstrap unavailable");
    report.hardhatLoads += 1;
    report.bootstrapStages.push("hre-bootstrap");
    report.networkAtLoad = process.env.HARDHAT_NETWORK;
    report.processArgumentsAtLoad = [...process.argv];
    report.secureMarkerAtLoad = process.env.SG2_SECURE_LAUNCH;
    const state = originalLoad(bootstrapStatePath, module, false);
    report.authorizationAtRun = state.peekAuthorizedAction();
    if (mode === "hardhat-throw") throw new Error("uncontrolled mocked Hardhat detail");
    return { mockedHardhat: true };
  }
  if (request === taskModulePath) {
    if (mode === "dispatcher-throw") throw new Error("uncontrolled mocked dispatcher detail");
    report.bootstrapStages.push("dispatcher-load");
    const state = originalLoad(bootstrapStatePath, module, false);
    return {
      dispatchSg2: async (_hre, action, taskArguments, capability) => {
        const taskName = "sg2:" + action;
        dispatchedCapability = capability;
        dispatchedTaskName = taskName;
        report.dispatchCalls.push({ action, taskArguments });
        if (mode === "throw") throw new Error("uncontrolled mocked bootstrap detail");
        if (mode === "reauthorize") state.createLauncherSession(taskName);
        if (mode === "mismatch") state.consumeDispatchCapability(capability, "sg2:verify");
        else state.consumeDispatchCapability(capability, taskName);
        if (mode === "repeat") state.consumeDispatchCapability(capability, taskName);
        report.handlerEntries.push(action);
      },
    };
  }
  return originalLoad(request, parent, isMain);
};
if (mode === "preload-authorize") {
  const state = originalLoad(bootstrapStatePath, module, false);
  try {
    state.createLauncherSession("sg2:deploy");
    report.probe = { authorized: true };
  } catch (error) {
    report.probe = { authorized: state.peekAuthorizedAction(), message: error.message };
  }
}
if (mode === "preload-require-launcher") {
  originalLoad(launcherPath, module, false);
  const state = originalLoad(bootstrapStatePath, module, false);
  report.probe = { authorized: state.peekAuthorizedAction() };
}
if (mode === "state-alias") {
  const { createRequire } = require("node:module");
  const canonical = originalLoad(bootstrapStatePath, module, false);
  const viaRealpath = originalLoad(require("node:fs").realpathSync(bootstrapStatePath), module, false);
  const fromLauncher = createRequire(launcherPath)("./sg2-bootstrap-state.cjs");
  let aliasAccepted = false;
  try {
    aliasAccepted = originalLoad(stateAliasPath, module, false) === canonical;
  } catch {}
  report.probe = { aliasAccepted, shared: canonical === viaRealpath && canonical === fromLauncher };
}
process.on("exit", () => {
  const state = originalLoad(bootstrapStatePath, module, false);
  report.authorizationAfterExit = state.peekAuthorizedAction();
  if (dispatchedCapability !== undefined) {
    try {
      state.consumeDispatchCapability(dispatchedCapability, dispatchedTaskName);
      report.revokedCapabilityRejected = false;
    } catch {
      report.revokedCapabilityRejected = true;
    }
  }
  report.secureMarkerAfterExit = process.env.SG2_SECURE_LAUNCH;
  fs.writeFileSync(reportPath, JSON.stringify(report));
});
`;

  try {
    writeFileSync(preloadPath, preloadSource);
    const result = spawnSync(
      process.execPath,
      [...(options.nodeArguments ?? []), "--require", preloadPath, launcherPath, action, ...argumentsList],
      {
        encoding: "utf8",
        env: environment,
        cwd: options.cwd ?? resolve(__dirname, ".."),
        shell: false,
      },
    );
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as FreshLauncherReport;
    return { report, status: result.status, stderr: result.stderr, stdout: result.stdout };
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function freshErrorOutput(result: FreshLauncherResult): string {
  return result.stderr.length > 0 ? result.stderr.trim() : result.report.errorWrites.join("").trim();
}

const EXPECTED_VALUE = 42n;

async function expectFixedRejection(promise: Promise<unknown>, expectedMessage: string): Promise<void> {
  let caughtFailure: unknown;
  try {
    await promise;
  } catch (error: unknown) {
    caughtFailure = error;
  }
  expect(caughtFailure).to.be.instanceOf(Error);
  expect((caughtFailure as Error).message).to.equal(expectedMessage);
}

type Fixture = {
  contract: SG2PublicDecrypt;
  contractAddress: string;
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
};

async function deployFixture(): Promise<Fixture> {
  const [deployer, alice] = await ethers.getSigners();
  const factory = (await ethers.getContractFactory("SG2PublicDecrypt", deployer)) as SG2PublicDecrypt__factory;
  const contract = (await factory.deploy()) as SG2PublicDecrypt;
  await contract.waitForDeployment();
  return { contract, contractAddress: await contract.getAddress(), deployer, alice };
}

async function encryptedInput(contractAddress: string, signer: HardhatEthersSigner, value = EXPECTED_VALUE) {
  return fhevm.createEncryptedInput(contractAddress, signer.address).add64(value).encrypt();
}

async function initialize(fixture: Fixture): Promise<void> {
  const input = await encryptedInput(fixture.contractAddress, fixture.deployer);
  await expect(fixture.contract.initialize(input.handles[0], input.inputProof))
    .to.emit(fixture.contract, "CiphertextInitialized")
    .withArgs(fixture.deployer.address)
    .and.to.emit(fixture.contract, "PublicDecryptionAuthorized");
}

async function publicDecryption(fixture: Fixture) {
  const handle = await fixture.contract.getCiphertext();
  const result = await fhevm.publicDecrypt([handle]);
  expect(result.clearValues[handle as `0x${string}`]).to.equal(EXPECTED_VALUE);
  return { handle, result };
}

describe("SG2PublicDecrypt", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("binds the immutable operator to the deployer", async function () {
    const fixture = await deployFixture();
    expect(await fixture.contract.OPERATOR()).to.equal(fixture.deployer.address);
  });

  it("rejects initialization by a non-operator", async function () {
    const fixture = await deployFixture();
    const input = await encryptedInput(fixture.contractAddress, fixture.alice);
    await expect(
      fixture.contract.connect(fixture.alice).initialize(input.handles[0], input.inputProof),
    ).to.be.revertedWithCustomError(fixture.contract, "OnlyOperator");
  });

  it("initializes exactly one encrypted euint64 value of 42", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    expect(await fixture.contract.initialized()).to.equal(true);
    expect(await fixture.contract.getCiphertext()).not.to.equal(ethers.ZeroHash);
    expect(await fixture.contract.SG2_EXPECTED_VALUE()).to.equal(EXPECTED_VALUE);
  });

  it("rejects a second initialization", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    const secondInput = await encryptedInput(fixture.contractAddress, fixture.deployer);
    await expect(
      fixture.contract.initialize(secondInput.handles[0], secondInput.inputProof),
    ).to.be.revertedWithCustomError(fixture.contract, "AlreadyInitialized");
  });

  it("marks the ciphertext publicly decryptable", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    expect(await fixture.contract.isCiphertextPubliclyDecryptable()).to.equal(true);
    await publicDecryption(fixture);
  });

  it("verifies the canonical public-decryption proof on-chain", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    const { result } = await publicDecryption(fixture);
    await expect(fixture.contract.verifyPublicDecryption(result.abiEncodedClearValues, result.decryptionProof))
      .to.emit(fixture.contract, "SG2VerificationSucceeded")
      .withArgs(EXPECTED_VALUE);
    expect(await fixture.contract.verificationSucceeded()).to.equal(true);
  });

  it("rejects an encoded clear value other than 42", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    const { result } = await publicDecryption(fixture);
    const wrongClearValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [41n]);
    await expect(
      fixture.contract.verifyPublicDecryption(wrongClearValue, result.decryptionProof),
    ).to.be.revertedWithCustomError(fixture.contract, "UnexpectedClearValue");
  });

  it("rejects a malformed public-decryption proof", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    const { result } = await publicDecryption(fixture);
    await expect(fixture.contract.verifyPublicDecryption(result.abiEncodedClearValues, "0x01")).to.be.reverted;
  });

  it("rejects a tampered public-decryption proof", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    const { result } = await publicDecryption(fixture);
    const tamperedProof = ethers.getBytes(result.decryptionProof);
    tamperedProof[tamperedProof.length - 1] ^= 1;
    await expect(fixture.contract.verifyPublicDecryption(result.abiEncodedClearValues, ethers.hexlify(tamperedProof)))
      .to.be.reverted;
  });

  it("binds the sole handle and rejects a valid proof for a different ciphertext", async function () {
    // Multi-handle ordering is not applicable: the capability contract deliberately stores exactly one handle.
    const target = await deployFixture();
    const different = await deployFixture();
    await initialize(target);
    await initialize(different);
    const { result } = await publicDecryption(different);
    await expect(target.contract.verifyPublicDecryption(result.abiEncodedClearValues, result.decryptionProof)).to.be
      .reverted;
  });

  it("rejects verification by a non-operator", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    const { result } = await publicDecryption(fixture);
    await expect(
      fixture.contract
        .connect(fixture.alice)
        .verifyPublicDecryption(result.abiEncodedClearValues, result.decryptionProof),
    ).to.be.revertedWithCustomError(fixture.contract, "OnlyOperator");
  });

  it("rejects a second successful verification", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    const { result } = await publicDecryption(fixture);
    await expect(fixture.contract.verifyPublicDecryption(result.abiEncodedClearValues, result.decryptionProof)).not.to
      .be.reverted;
    await expect(
      fixture.contract.verifyPublicDecryption(result.abiEncodedClearValues, result.decryptionProof),
    ).to.be.revertedWithCustomError(fixture.contract, "AlreadyVerified");
  });

  it("stores the verified clear value as exactly 42", async function () {
    const fixture = await deployFixture();
    await initialize(fixture);
    const { result } = await publicDecryption(fixture);
    await expect(fixture.contract.verifyPublicDecryption(result.abiEncodedClearValues, result.decryptionProof)).not.to
      .be.reverted;
    expect(await fixture.contract.verifiedValue()).to.equal(EXPECTED_VALUE);
  });

  it("exposes no state-changing plaintext override or bypass", async function () {
    const fixture = await deployFixture();
    const stateChangingFunctions = fixture.contract.interface.fragments
      .filter((fragment): fragment is FunctionFragment => fragment.type === "function")
      .filter((fragment) => !["view", "pure"].includes(fragment.stateMutability))
      .map((fragment) => fragment.name)
      .sort();
    expect(stateChangingFunctions).to.deep.equal(["initialize", "verifyPublicDecryption"]);
  });
});

describe("SG-2 task safety helpers", function () {
  const contractAddress = "0x0000000000000000000000000000000000000001";
  const fixedInitializationError = "SG2 test initialization failed; sensitive details suppressed.";
  const isAddress = (address: string) => /^0x[0-9a-fA-F]{40}$/u.test(address);

  it("rejects CLI verbose before invoking the Hardhat bootstrap dependency", async function () {
    let hardhatLoaded = false;
    await expectFixedRejection(
      sg2Launcher.executeLaunch({
        action: "preflight",
        argumentsList: ["--verbose"],
        environment: {},
        processArguments: ["node", "launcher", "preflight", "--verbose"],
        isAddress,
        loadHardhat: async () => {
          hardhatLoaded = true;
          return { run: async () => undefined };
        },
      }),
      sg2Launcher.VERBOSE_ERROR,
    );
    expect(hardhatLoaded).to.equal(false);
  });

  it("rejects invalid input in a fresh process before loading Hardhat, FHEVM, ethers, or configuration", function () {
    const result = runFreshLauncher("preflight", ["--verbose"]);
    expect(result.status).to.equal(1);
    expect(freshErrorOutput(result)).to.equal(sg2Launcher.VERBOSE_ERROR);
    expect(result.report.hardhatLoads).to.equal(0);
    expect(result.report.authorizationAfterExit).to.equal(undefined);
    expect(result.report.secureMarkerAfterExit).to.equal(undefined);
    const forbiddenLoads = result.report.loadedRequests.filter(
      (request) =>
        request === "hardhat" ||
        request === "ethers" ||
        request.startsWith("@fhevm/") ||
        request.includes("hardhat.config") ||
        request.toLowerCase().includes("provider"),
    );
    expect(forbiddenLoads).to.deep.equal([]);
  });

  it("rejects HARDHAT_VERBOSE using installed boolean semantics before bootstrap", async function () {
    for (const verboseValue of ["true", "TrUe", "invalid"]) {
      let hardhatLoaded = false;
      await expectFixedRejection(
        sg2Launcher.executeLaunch({
          action: "deploy",
          argumentsList: [],
          environment: { HARDHAT_VERBOSE: verboseValue },
          processArguments: ["node", "launcher", "deploy"],
          isAddress,
          loadHardhat: async () => {
            hardhatLoaded = true;
            return { run: async () => undefined };
          },
        }),
        sg2Launcher.VERBOSE_ERROR,
      );
      expect(hardhatLoaded).to.equal(false);
    }
    expect(() =>
      sg2Launcher.validateLaunchRequest("preflight", [], { HARDHAT_VERBOSE: "FaLsE" }, isAddress),
    ).not.to.throw();
  });

  it("rejects sensitive and wildcard DEBUG selectors before bootstrap", async function () {
    for (const debugSelector of ["@fhevm/hardhat:provider", "@fhevm/hardhat:addresses", "@fhevm/hardhat:env", "*"]) {
      let hardhatLoaded = false;
      await expectFixedRejection(
        sg2Launcher.executeLaunch({
          action: "preflight",
          argumentsList: [],
          environment: { DEBUG: debugSelector },
          processArguments: ["node", "launcher", "preflight"],
          isAddress,
          loadHardhat: async () => {
            hardhatLoaded = true;
            return { run: async () => undefined };
          },
        }),
        sg2Launcher.DEBUG_ERROR,
      );
      expect(hardhatLoaded).to.equal(false);
    }
  });

  it("allows unrelated DEBUG selectors and complete installed exclusions", function () {
    expect(sg2Launcher.forbiddenDebugEnabled("unrelated:*")).to.equal(false);
    expect(sg2Launcher.forbiddenDebugEnabled("*,-hardhat*,-@fhevm/hardhat*")).to.equal(false);
    expect(() =>
      sg2Launcher.validateLaunchRequest("preflight", [], { DEBUG: "unrelated:*" }, isAddress),
    ).not.to.throw();
  });

  it("rejects Hardhat core DEBUG and partial global exclusions before bootstrap", async function () {
    for (const debugSelector of ["hardhat*", "hardhat:core:*", "hardhat:core:config", "*,-@fhevm/hardhat*"]) {
      let hardhatLoaded = false;
      await expectFixedRejection(
        sg2Launcher.executeLaunch({
          action: "preflight",
          argumentsList: [],
          environment: { DEBUG: debugSelector },
          processArguments: ["node", "launcher", "preflight"],
          isAddress,
          loadHardhat: async () => {
            hardhatLoaded = true;
            return { run: async () => undefined };
          },
        }),
        sg2Launcher.DEBUG_ERROR,
      );
      expect(hardhatLoaded).to.equal(false);
    }
  });

  it("rejects every Hardhat global or unknown option without loading Hardhat", async function () {
    for (const argumentsList of [
      ["--config", "hardhat.config.ts"],
      ["--network", "sepolia"],
      ["--max-memory", "4096"],
      ["--tsconfig", "tsconfig.json"],
      ["--show-stack-traces"],
      ["--unknown", "value"],
    ]) {
      let hardhatLoaded = false;
      await expectFixedRejection(
        sg2Launcher.executeLaunch({
          action: "preflight",
          argumentsList,
          environment: {},
          processArguments: ["node", "launcher", "preflight", ...argumentsList],
          isAddress,
          loadHardhat: async () => {
            hardhatLoaded = true;
            return { run: async () => undefined };
          },
        }),
        sg2Launcher.ARGUMENT_ERROR,
      );
      expect(hardhatLoaded).to.equal(false);
    }
  });

  it("never includes argument or option values in launcher errors", async function () {
    const errors: string[] = [];
    const exitCode = await sg2Launcher.runCli({
      action: "preflight",
      argumentsList: ["--config", "sensitive-option-value"],
      environment: {},
      processArguments: ["node", "launcher", "preflight", "--config", "sensitive-option-value"],
      isAddress,
      loadHardhat: async () => ({ run: async () => undefined }),
      writeError: (message) => errors.push(message),
    });
    expect(exitCode).to.equal(1);
    expect(errors).to.deep.equal([sg2Launcher.ARGUMENT_ERROR]);
    expect(errors[0]).not.to.include("--config");
    expect(errors[0]).not.to.include("sensitive-option-value");
  });

  it("rejects extra preflight and deploy arguments", function () {
    expect(() => sg2Launcher.validateLaunchRequest("preflight", ["extra"], {}, isAddress)).to.throw(
      sg2Launcher.ARGUMENT_ERROR,
    );
    expect(() => sg2Launcher.validateLaunchRequest("deploy", ["extra"], {}, isAddress)).to.throw(
      sg2Launcher.ARGUMENT_ERROR,
    );
  });

  it("requires exactly one valid address for prepare and verify", function () {
    for (const action of ["prepare", "verify"]) {
      expect(() => sg2Launcher.validateLaunchRequest(action, [], {}, isAddress)).to.throw(sg2Launcher.ARGUMENT_ERROR);
      expect(() => sg2Launcher.validateLaunchRequest(action, ["--", "--address"], {}, isAddress)).to.throw(
        sg2Launcher.ARGUMENT_ERROR,
      );
      expect(() => sg2Launcher.validateLaunchRequest(action, ["--", "--address", "invalid"], {}, isAddress)).to.throw(
        sg2Launcher.ARGUMENT_ERROR,
      );
      expect(() =>
        sg2Launcher.validateLaunchRequest(
          action,
          ["--", "--address", contractAddress, "--address", contractAddress],
          {},
          isAddress,
        ),
      ).to.throw(sg2Launcher.ARGUMENT_ERROR);
      expect(
        sg2Launcher.validateLaunchRequest(action, ["--", "--address", contractAddress], {}, isAddress),
      ).to.deep.equal({ action, taskArguments: { address: contractAddress }, taskName: `sg2:${action}` });
    }
  });

  it("normalizes a validated mixed-case address without changing its identity", function () {
    const mixedCaseAddress = "0x00000000000000000000000000000000000000Aa";
    const request = sg2Launcher.validateLaunchRequest("prepare", ["--", "--address", mixedCaseAddress], {}, isAddress);
    expect(request.taskArguments.address).to.equal(mixedCaseAddress.toLowerCase());
  });

  it("rejects package-manager separators for argument-free actions and malformed separator placement", function () {
    for (const action of ["preflight", "deploy"]) {
      expect(() => sg2Launcher.validateLaunchRequest(action, ["--"], {}, isAddress)).to.throw(
        sg2Launcher.ARGUMENT_ERROR,
      );
    }
    for (const action of ["prepare", "verify"]) {
      for (const argumentsList of [
        ["--address", contractAddress],
        ["--", "--", "--address", contractAddress],
        ["--address", contractAddress, "--"],
        ["--", "--address", contractAddress, "--"],
        [contractAddress],
      ]) {
        expect(() => sg2Launcher.validateLaunchRequest(action, argumentsList, {}, isAddress)).to.throw(
          sg2Launcher.ARGUMENT_ERROR,
        );
      }
    }
  });

  it("sets process state and Sepolia and sanitizes argv before fresh-process Hardhat bootstrap", function () {
    const result = runFreshLauncher("prepare", ["--", "--address", contractAddress]);
    expect(result.status).to.equal(0);
    expect(result.stderr).to.equal("");
    expect(result.report.hardhatLoads).to.equal(1);
    expect(result.report.hardhatRegisterLoads).to.equal(1);
    expect(result.report.networkAtLoad).to.equal("sepolia");
    expect(result.report.secureMarkerAtLoad).to.equal("1");
    expect(result.report.processArgumentsAtLoad).to.have.lengthOf(2);
    expect(result.report.authorizationAtRun).to.equal("sg2:prepare");
    expect(result.report.authorizationAfterExit).to.equal(undefined);
    expect(result.report.revokedCapabilityRejected).to.equal(true);
  });

  it("installs Hardhat's TypeScript bootstrap before HRE and reaches the mocked preflight handler", function () {
    const result = runFreshLauncher("preflight", []);
    expect(result.status).to.equal(0);
    expect(result.stderr).to.equal("");
    expect(result.report.bootstrapStages).to.deep.equal(["typescript-bootstrap", "hre-bootstrap", "dispatcher-load"]);
    expect(result.report.handlerEntries).to.deep.equal(["preflight"]);
    expect(result.report.dispatchCalls).to.deep.equal([{ action: "preflight", taskArguments: {} }]);

    const launcherSource = readFileSync(resolve(__dirname, "../scripts/sg2-launcher.cjs"), "utf8");
    const registerOffset = launcherSource.indexOf('require("hardhat/register")');
    const hardhatOffset = launcherSource.indexOf('require("hardhat")');
    expect(registerOffset).to.be.greaterThan(0);
    expect(hardhatOffset).to.be.greaterThan(registerOffset);

    const installedRegisterSource = readFileSync(resolve(__dirname, "../node_modules/hardhat/register.js"), "utf8");
    expect(installedRegisterSource).to.include("willRunWithTypescript");
    expect(installedRegisterSource).to.include("loadTsNode");
  });

  it("sets the secure-launch marker only after complete validation", async function () {
    const environment: Record<string, string | undefined> = {};
    await expectFixedRejection(
      sg2Launcher.executeLaunch({
        action: "verify",
        argumentsList: ["--address", "invalid"],
        environment,
        processArguments: ["node", "launcher", "verify", "--address", "invalid"],
        isAddress,
        loadHardhat: async () => ({ run: async () => undefined }),
      }),
      sg2Launcher.ARGUMENT_ERROR,
    );
    expect(environment).not.to.have.property("SG2_SECURE_LAUNCH");
    expect(environment).not.to.have.property("HARDHAT_NETWORK");
  });

  it("executes exactly the intended internal task in a fresh process", function () {
    for (const action of ["preflight", "deploy", "prepare", "verify"]) {
      const argumentsList = action === "prepare" || action === "verify" ? ["--", "--address", contractAddress] : [];
      const result = runFreshLauncher(action, argumentsList);
      expect(result.status).to.equal(0);
      expect(result.report.dispatchCalls).to.deep.equal([
        {
          action,
          taskArguments: argumentsList.length === 0 ? {} : { address: contractAddress },
        },
      ]);
    }
  });

  it("binds authorization to one matching task consumption and revokes it", function () {
    const mismatch = runFreshLauncher("prepare", ["--", "--address", contractAddress], "mismatch");
    expect(mismatch.status).to.equal(1);
    expect(freshErrorOutput(mismatch)).to.equal(sg2Launcher.DISPATCH_ERROR);
    expect(mismatch.report.authorizationAtRun).to.equal("sg2:prepare");
    expect(mismatch.report.authorizationAfterExit).to.equal(undefined);
    expect(mismatch.report.revokedCapabilityRejected).to.equal(true);

    const repeated = runFreshLauncher("deploy", [], "repeat");
    expect(repeated.status).to.equal(1);
    expect(freshErrorOutput(repeated)).to.equal(sg2Launcher.DISPATCH_ERROR);
    expect(repeated.report.authorizationAfterExit).to.equal(undefined);
    expect(repeated.report.revokedCapabilityRejected).to.equal(true);

    const reauthorized = runFreshLauncher("verify", ["--", "--address", contractAddress], "reauthorize");
    expect(reauthorized.status).to.equal(1);
    expect(freshErrorOutput(reauthorized)).to.equal(sg2Launcher.DISPATCH_ERROR);
    expect(reauthorized.report.authorizationAfterExit).to.equal(undefined);
    expect(reauthorized.report.revokedCapabilityRejected).to.equal(true);
  });

  it("reports fixed sanitized Hardhat, dispatcher-loading, and dispatch stage failures", function () {
    const cases = [
      ["hardhat-throw", sg2Launcher.HARDHAT_BOOTSTRAP_ERROR],
      ["dispatcher-throw", sg2Launcher.DISPATCHER_LOADING_ERROR],
      ["throw", sg2Launcher.DISPATCH_ERROR],
    ] as const;
    for (const [mode, expectedError] of cases) {
      const result = runFreshLauncher("deploy", [], mode);
      expect(result.status).to.equal(1);
      expect(freshErrorOutput(result)).to.equal(expectedError);
      expect(result.stderr).not.to.include("uncontrolled");
      expect(result.report.authorizationAfterExit).to.equal(undefined);
    }
  });

  it("rejects structural, copied, serialized, prototype, and proxy capability forgeries before runtime access", async function () {
    let credentialResolutionCalled = false;
    const runtime = new Proxy(
      {},
      {
        get() {
          credentialResolutionCalled = true;
          throw new Error("runtime accessed");
        },
      },
    );
    const lookalike = Object.freeze({
      consumeFor: () => undefined,
      readAction: () => "sg2:deploy",
      revoke: () => undefined,
    });
    const candidates = [
      Object.freeze({}),
      lookalike,
      Object.freeze({ ...lookalike }),
      JSON.parse(JSON.stringify(lookalike)) as object,
      Object.freeze(Object.create(lookalike)) as object,
      new Proxy(lookalike, {}),
    ];
    for (const candidate of candidates) {
      await expectFixedRejection(
        dispatchSg2(runtime as never, "deploy", {}, candidate),
        "SG2 secure launcher is required; sensitive details suppressed.",
      );
    }
    expect(credentialResolutionCalled).to.equal(false);
  });

  it("does not authorize from environment assignment alone", function () {
    const result = runFreshLauncher("preflight", [], "preload-authorize", {
      HARDHAT_NETWORK: "sepolia",
      SG2_SECURE_LAUNCH: "1",
    });
    expect(result.status).to.equal(1);
    expect(result.report.probe).to.deep.equal({
      message: "SG2 process-local authorization failed; sensitive details suppressed.",
    });
    expect(result.report.hardhatLoads).to.equal(0);
  });

  it("prevents a custom main wrapper from establishing authorization", function () {
    const result = runFreshLauncher("preflight", [], "preload-authorize");
    expect(result.status).to.equal(1);
    expect(result.report.probe).to.deep.equal({
      message: "SG2 process-local authorization failed; sensitive details suppressed.",
    });
  });

  it("does not authorize when the launcher is merely required as a module", function () {
    const result = runFreshLauncher("preflight", [], "preload-require-launcher");
    expect(result.status).to.equal(0);
    expect(result.report.probe).to.deep.equal({});
    expect(result.report.dispatchCalls).to.deep.equal([]);
  });

  it("exports only the narrow identity-authenticating consumer and no general revoker or setter", function () {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const state = require(realpathSync(resolve(__dirname, "../scripts/sg2-bootstrap-state.cjs"))) as Record<
      string,
      unknown
    >;
    expect(Object.keys(state).sort()).to.deep.equal([
      "AUTHORIZATION_ERROR",
      "consumeDispatchCapability",
      "createLauncherSession",
      "peekAuthorizedAction",
    ]);
    for (const forbiddenExport of [
      "consumeAuthorization",
      "establishAuthorization",
      "revokeAuthorization",
      "setAuthorization",
    ]) {
      expect(state).not.to.have.property(forbiddenExport);
    }
  });

  it("uses a module-private WeakMap and gives the dispatcher no structural session methods", function () {
    const stateSource = readFileSync(resolve(__dirname, "../scripts/sg2-bootstrap-state.cjs"), "utf8");
    const taskSource = readFileSync(resolve(__dirname, "../tasks/sg2.ts"), "utf8");
    expect(stateSource).to.include("const capabilityRecords = new WeakMap()");
    expect(stateSource).to.include("capabilityRecords.get(capability)");
    expect(taskSource).to.include("consumeAuthenticDispatchCapability(capability, taskName)");
    expect(taskSource).not.to.include("session.readAction");
    expect(taskSource).not.to.include("session.consumeFor");
  });

  it("loads SG-2 state conditionally and leaves ordinary Hardhat configuration independent", function () {
    const configSource = readFileSync(resolve(__dirname, "../hardhat.config.ts"), "utf8");
    const conditionalStateOffset = configSource.indexOf("isDirectSg2CapabilityTask || isSg2LauncherBootstrap");
    const stateLoadOffset = configSource.indexOf(
      "loadCanonicalSg2BootstrapState().peekAuthorizedAction()",
      conditionalStateOffset,
    );
    const credentialOffset = configSource.indexOf('sepoliaVariable("SEPOLIA_RPC_URL")');
    expect(conditionalStateOffset).to.be.greaterThan(0);
    expect(stateLoadOffset).to.be.greaterThan(conditionalStateOffset);
    expect(credentialOffset).to.be.greaterThan(stateLoadOffset);
  });

  it("uses only the internal dispatcher and exposes no public SG-2 Hardhat task", function () {
    const taskSource = readFileSync(resolve(__dirname, "../tasks/sg2.ts"), "utf8");
    const launcherSource = readFileSync(resolve(__dirname, "../scripts/sg2-launcher.cjs"), "utf8");
    expect(taskSource).not.to.match(/task\(["']sg2:/u);
    expect(launcherSource).not.to.include("hre.run(");
    expect(launcherSource).to.include("dispatchSg2");
  });

  it("uses package scripts that inject exactly one launcher-visible address separator", function () {
    const packageManifest = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageManifest.scripts["sg2:preflight"]).to.equal("node scripts/sg2-launcher.cjs preflight");
    expect(packageManifest.scripts["sg2:deploy"]).to.equal("node scripts/sg2-launcher.cjs deploy");
    expect(packageManifest.scripts["sg2:prepare"]).to.equal("node scripts/sg2-launcher.cjs prepare --");
    expect(packageManifest.scripts["sg2:verify"]).to.equal("node scripts/sg2-launcher.cjs verify --");
  });

  it("uses the canonical launcher under Node symlink-preservation modes", function () {
    const temporaryDirectory = mkdtempSync(join(repositoryRoot, ".sg2-canonical-launcher-"));
    const canonicalLauncher = resolve(__dirname, "../scripts/sg2-launcher.cjs");
    const launcherSymlink = join(temporaryDirectory, "sg2-launcher-link.cjs");
    try {
      symlinkSync(canonicalLauncher, launcherSymlink);
      for (const nodeArguments of [
        [],
        ["--preserve-symlinks"],
        ["--preserve-symlinks-main"],
        ["--preserve-symlinks", "--preserve-symlinks-main"],
      ]) {
        const canonical = runFreshLauncher("preflight", [], "normal", {}, { nodeArguments });
        expect(canonical.status).to.equal(0);
        const linked = runFreshLauncher(
          "preflight",
          [],
          "normal",
          {},
          { launcherPath: launcherSymlink, nodeArguments },
        );
        expect(linked.status).to.equal(0);
        expect(linked.report.dispatchCalls).to.deep.equal([{ action: "preflight", taskArguments: {} }]);
        expect(linked.report.authorizationAfterExit).to.equal(undefined);
      }
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("rejects copied or renamed launcher/state pairs as non-authoritative", function () {
    const temporaryDirectory = mkdtempSync(join(repositoryRoot, ".sg2-copied-launcher-"));
    const canonicalLauncher = resolve(__dirname, "../scripts/sg2-launcher.cjs");
    const canonicalState = resolve(__dirname, "../scripts/sg2-bootstrap-state.cjs");
    const copiedLauncher = join(temporaryDirectory, "sg2-launcher.cjs");
    const renamedLauncher = join(temporaryDirectory, "renamed-launcher.cjs");
    try {
      copyFileSync(canonicalLauncher, copiedLauncher);
      copyFileSync(canonicalLauncher, renamedLauncher);
      copyFileSync(canonicalState, join(temporaryDirectory, "sg2-bootstrap-state.cjs"));
      for (const launcherPath of [copiedLauncher, renamedLauncher]) {
        const result = runFreshLauncher("preflight", [], "normal", {}, { launcherPath });
        expect(result.status).to.equal(1);
        expect(freshErrorOutput(result)).to.equal(
          "SG2 process-local authorization failed; sensitive details suppressed.",
        );
        expect(result.report.hardhatLoads).to.equal(0);
      }
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("rejects a complete source-repository copy before Hardhat loads", function () {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "sg2-repository-copy-"));
    const copiedRoot = join(temporaryDirectory, "zama-szn4-copy");
    const excludedTopLevelPaths = new Set([
      ".git",
      ".next",
      "artifacts",
      "cache",
      "coverage",
      "dist",
      "node_modules",
      "types",
    ]);
    try {
      cpSync(repositoryRoot, copiedRoot, {
        recursive: true,
        filter: (source) => {
          const sourceRelativePath = relative(repositoryRoot, source);
          const topLevelPath = sourceRelativePath.split(/[/\\]/u)[0];
          return sourceRelativePath.length === 0 || !excludedTopLevelPaths.has(topLevelPath);
        },
      });
      const copiedLauncher = join(copiedRoot, "scripts", "sg2-launcher.cjs");
      const result = runFreshLauncher("preflight", [], "normal", {}, { cwd: copiedRoot, launcherPath: copiedLauncher });
      expect(result.status).to.equal(1);
      expect(freshErrorOutput(result)).to.equal(
        "SG2 process-local authorization failed; sensitive details suppressed.",
      );
      expect(result.report.hardhatLoads).to.equal(0);
      expect(result.report.authorizationAfterExit).to.equal(undefined);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("rejects a symlink resolving to a copied launcher", function () {
    const temporaryDirectory = mkdtempSync(join(repositoryRoot, ".sg2-copied-launcher-link-"));
    const copiedLauncher = join(temporaryDirectory, "copied-launcher.cjs");
    const copiedState = join(temporaryDirectory, "sg2-bootstrap-state.cjs");
    const launcherLink = join(temporaryDirectory, "copied-launcher-link.cjs");
    try {
      copyFileSync(resolve(__dirname, "../scripts/sg2-launcher.cjs"), copiedLauncher);
      copyFileSync(resolve(__dirname, "../scripts/sg2-bootstrap-state.cjs"), copiedState);
      symlinkSync(copiedLauncher, launcherLink);
      const result = runFreshLauncher("preflight", [], "normal", {}, { launcherPath: launcherLink });
      expect(result.status).to.equal(1);
      expect(result.report.hardhatLoads).to.equal(0);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("shares only the canonical state cache identity and rejects preserved symlink aliases", function () {
    const temporaryDirectory = mkdtempSync(join(repositoryRoot, ".sg2-state-alias-"));
    const canonicalState = realpathSync(resolve(__dirname, "../scripts/sg2-bootstrap-state.cjs"));
    const stateSymlink = join(temporaryDirectory, "state-link.cjs");
    try {
      symlinkSync(canonicalState, stateSymlink);
      const ordinary = runFreshLauncher("preflight", [], "state-alias", {}, { stateAliasPath: stateSymlink });
      expect(ordinary.status).to.equal(1);
      expect(ordinary.report.probe).to.deep.equal({ aliasAccepted: true, shared: true });

      for (const flags of [["--preserve-symlinks"], ["--preserve-symlinks", "--preserve-symlinks-main"]]) {
        const preserved = runFreshLauncher(
          "preflight",
          [],
          "state-alias",
          {},
          {
            nodeArguments: flags,
            stateAliasPath: stateSymlink,
          },
        );
        expect(preserved.status).to.equal(1);
        expect(preserved.report.probe).to.deep.equal({ aliasAccepted: false, shared: true });
      }
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("observes both CommonJS and ESM requests before invalid-launch rejection", function () {
    const result = runFreshLauncher("preflight", ["--verbose"]);
    expect(result.status).to.equal(1);
    expect(result.report.hardhatLoads).to.equal(0);
    expect(
      result.report.loadedRequests.some(
        (request) => request === "hardhat" || request === "ethers" || request.startsWith("@fhevm/"),
      ),
    ).to.equal(false);
    const launcherSource = readFileSync(resolve(__dirname, "../scripts/sg2-launcher.cjs"), "utf8");
    const validationOffset = launcherSource.indexOf("validateLaunchRequest(action, argumentsList");
    const dynamicImportOffset = launcherSource.indexOf("import(");
    expect(validationOffset).to.be.greaterThan(0);
    expect(dynamicImportOffset === -1 || dynamicImportOffset > validationOffset).to.equal(true);
    for (const forbiddenProductionMechanism of [
      "child_process",
      "node:vm",
      "node:worker_threads",
      "registerHooks(",
      "eval(",
      "exec(",
      "spawn(",
    ]) {
      expect(launcherSource).not.to.include(forbiddenProductionMechanism);
    }

    const hookSelfTest = runFreshLauncher("preflight", ["--verbose"], "esm-observe");
    expect(hookSelfTest.report.loadedRequests).to.include("data:text/javascript,export default 1");
  });

  it("detects an SG-2 task as the first task token", function () {
    expect(sg2TestHooks.detectHardhatTaskArgument(["sg2:preflight"])).to.equal("sg2:preflight");
  });

  it("detects SG-2 preflight after a network option", function () {
    expect(sg2TestHooks.detectHardhatTaskArgument(["--network", "sepolia", "sg2:preflight"])).to.equal("sg2:preflight");
  });

  it("detects SG-2 deploy after a config option", function () {
    expect(sg2TestHooks.detectHardhatTaskArgument(["--config", "hardhat.config.ts", "sg2:deploy"])).to.equal(
      "sg2:deploy",
    );
  });

  it("detects SG-2 prepare after a max-memory option", function () {
    expect(sg2TestHooks.detectHardhatTaskArgument(["--max-memory", "4096", "sg2:prepare"])).to.equal("sg2:prepare");
  });

  it("detects SG-2 verify after a tsconfig option", function () {
    expect(sg2TestHooks.detectHardhatTaskArgument(["--tsconfig", "tsconfig.json", "sg2:verify"])).to.equal(
      "sg2:verify",
    );
  });

  it("detects SG-2 after multiple installed Hardhat global options", function () {
    expect(
      sg2TestHooks.detectHardhatTaskArgument([
        "--show-stack-traces",
        "--config",
        "hardhat.config.ts",
        "--network",
        "sepolia",
        "--max-memory",
        "4096",
        "sg2:verify",
      ]),
    ).to.equal("sg2:verify");
  });

  it("does not treat a global option value resembling an SG-2 task as the selected task", function () {
    expect(sg2TestHooks.detectHardhatTaskArgument(["--network", "sg2:preflight", "compile"])).to.equal("compile");
  });

  it("leaves unrelated and non-exact task names unrelated", function () {
    expect(sg2TestHooks.detectHardhatTaskArgument(["test"])).to.equal("test");
    expect(sg2TestHooks.guardSg2TaskBeforeConfiguration(["test"], {}, () => undefined)).to.equal(false);
    expect(sg2TestHooks.guardSg2TaskBeforeConfiguration(["sg2:deploy-extra"], {}, () => undefined)).to.equal(false);
  });

  it("treats malformed or incomplete global options as non-SG-2", function () {
    expect(sg2TestHooks.detectHardhatTaskArgument(["--config"])).to.equal(undefined);
    expect(sg2TestHooks.detectHardhatTaskArgument(["--unknown", "sg2:deploy"])).to.equal(undefined);
    expect(sg2TestHooks.guardSg2TaskBeforeConfiguration(["--max-memory"], {}, () => undefined)).to.equal(false);
  });

  it("runs the early guard before mocked credential resolution", function () {
    const observations: string[] = [];
    const isSg2CapabilityTask = sg2TestHooks.guardSg2TaskBeforeConfiguration(
      ["--config", "hardhat.config.ts", "--network", "sepolia", "sg2:deploy"],
      {},
      () => observations.push("debug-guard"),
    );
    const resolveCredentials = () => observations.push("credential-resolution");
    resolveCredentials();

    expect(isSg2CapabilityTask).to.equal(true);
    expect(observations).to.deep.equal(["debug-guard", "credential-resolution"]);
  });

  it("rejects every exact SG-2 task when Hardhat verbose mode is enabled", function () {
    for (const taskName of ["sg2:preflight", "sg2:deploy", "sg2:prepare", "sg2:verify"]) {
      expect(() => sg2TestHooks.guardSg2TaskBeforeConfiguration([taskName, "--verbose"], {}, () => undefined)).to.throw(
        "SG2 Hardhat verbose output is enabled; sensitive details suppressed.",
      );
    }
  });

  it("detects verbose before, after, and among value-bearing global options", function () {
    for (const argumentsList of [
      ["--verbose", "sg2:preflight"],
      ["--network", "sepolia", "--verbose", "sg2:deploy"],
      ["--config", "hardhat.config.ts", "--verbose", "sg2:prepare"],
      ["--network", "sepolia", "sg2:verify", "--verbose", "--show-stack-traces"],
    ]) {
      expect(sg2TestHooks.classifyHardhatCommand(argumentsList, {}).verbose).to.equal(true);
    }
  });

  it("rejects repeated verbose flags if configuration classification is reached", function () {
    expect(() =>
      sg2TestHooks.guardSg2TaskBeforeConfiguration(["sg2:preflight", "--verbose", "--verbose"], {}, () => undefined),
    ).to.throw("SG2 Hardhat verbose output is enabled; sensitive details suppressed.");
  });

  it("preserves verbose behavior for non-SG-2 tasks", function () {
    let guardCalled = false;
    expect(
      sg2TestHooks.guardSg2TaskBeforeConfiguration(["compile", "--verbose"], {}, () => (guardCalled = true)),
    ).to.equal(false);
    expect(guardCalled).to.equal(false);
    expect(sg2TestHooks.classifyHardhatCommand(["compile", "--verbose"], {}).verbose).to.equal(true);
  });

  it("does not treat a value-bearing option value as a verbose flag", function () {
    expect(sg2TestHooks.classifyHardhatCommand(["--config", "--verbose", "compile"], {}).verbose).to.equal(false);
  });

  it("rejects the installed HARDHAT_VERBOSE environment equivalent for SG-2 only", function () {
    expect(() =>
      sg2TestHooks.guardSg2TaskBeforeConfiguration(["sg2:verify"], { HARDHAT_VERBOSE: "TrUe" }, () => undefined),
    ).to.throw("SG2 Hardhat verbose output is enabled; sensitive details suppressed.");
    expect(
      sg2TestHooks.guardSg2TaskBeforeConfiguration(["compile"], { HARDHAT_VERBOSE: "true" }, () => undefined),
    ).to.equal(false);
    expect(() =>
      sg2TestHooks.guardSg2TaskBeforeConfiguration(["sg2:verify"], { HARDHAT_VERBOSE: "false" }, () => undefined),
    ).not.to.throw();
  });

  it("rejects verbose before mocked credential resolution with a fixed sanitized error", function () {
    let credentialResolutionCalled = false;
    const resolveCredentials = () => {
      credentialResolutionCalled = true;
    };

    let caughtFailure: unknown;
    try {
      sg2TestHooks.guardSg2TaskBeforeConfiguration(
        ["--network", "sepolia", "--verbose", "sg2:deploy"],
        {},
        () => undefined,
      );
      resolveCredentials();
    } catch (error: unknown) {
      caughtFailure = error;
    }

    expect(caughtFailure).to.be.instanceOf(Error);
    const failureMessage = (caughtFailure as Error).message;
    expect(failureMessage).to.equal("SG2 Hardhat verbose output is enabled; sensitive details suppressed.");
    for (const forbiddenFragment of [
      "--verbose",
      "--network",
      "sepolia",
      "sg2:deploy",
      "DEBUG",
      "provider",
      "RPC",
      "private",
      "environment",
    ]) {
      expect(failureMessage).not.to.include(forbiddenFragment);
    }
    expect(credentialResolutionCalled).to.equal(false);
  });

  it("rejects installed Hardhat and FHEVM debug namespaces", function () {
    for (const debugNamespace of [
      "hardhat*",
      "hardhat:core:*",
      "hardhat:core:config",
      "@fhevm/hardhat*",
      "@fhevm/hardhat:provider",
      "@fhevm/hardhat:addresses",
      "@fhevm/hardhat:env",
    ]) {
      expect(() => sg2TestHooks.requireSafeFhevmDebugConfiguration({ DEBUG: debugNamespace })).to.throw(
        "SG2 sensitive Hardhat debug output is enabled; sensitive details suppressed.",
      );
    }
  });

  it("rejects a wildcard DEBUG selector", function () {
    expect(() => sg2TestHooks.requireSafeFhevmDebugConfiguration({ DEBUG: "*" })).to.throw(
      "SG2 sensitive Hardhat debug output is enabled; sensitive details suppressed.",
    );
  });

  it("allows an unrelated DEBUG namespace", function () {
    expect(() => sg2TestHooks.requireSafeFhevmDebugConfiguration({ DEBUG: "unrelated:*" })).not.to.throw();
  });

  it("honors debug namespace exclusions", function () {
    expect(() =>
      sg2TestHooks.requireSafeFhevmDebugConfiguration({
        DEBUG: "*,unrelated:*,-hardhat*,-@fhevm/hardhat*",
      }),
    ).not.to.throw();
  });

  it("allows an absent DEBUG selector", function () {
    expect(() => sg2TestHooks.requireSafeFhevmDebugConfiguration({})).not.to.throw();
  });

  it("restores intercepted output functions after successful initialization", async function () {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    await sg2TestHooks.withSuppressedExternalOutput(async () => {
      expect(console.log).not.to.equal(originalConsoleLog);
      expect(console.error).not.to.equal(originalConsoleError);
      expect(console.warn).not.to.equal(originalConsoleWarn);
      expect(process.stdout.write).not.to.equal(originalStdoutWrite);
      expect(process.stderr.write).not.to.equal(originalStderrWrite);
    }, fixedInitializationError);

    expect(console.log).to.equal(originalConsoleLog);
    expect(console.error).to.equal(originalConsoleError);
    expect(console.warn).to.equal(originalConsoleWarn);
    expect(process.stdout.write).to.equal(originalStdoutWrite);
    expect(process.stderr.write).to.equal(originalStderrWrite);
  });

  it("restores intercepted output functions and sanitizes initialization failures", async function () {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    let caughtFailure: unknown;
    try {
      await sg2TestHooks.withSuppressedExternalOutput(async () => {
        throw new Error("unsanitized external failure");
      }, fixedInitializationError);
    } catch (error: unknown) {
      caughtFailure = error;
    }
    expect(caughtFailure).to.be.instanceOf(Error);
    expect((caughtFailure as Error).message).to.equal(fixedInitializationError);

    expect(console.log).to.equal(originalConsoleLog);
    expect(console.error).to.equal(originalConsoleError);
    expect(console.warn).to.equal(originalConsoleWarn);
    expect(process.stdout.write).to.equal(originalStdoutWrite);
    expect(process.stderr.write).to.equal(originalStderrWrite);
  });

  it("rejects a non-null contract address on a contract-call receipt", function () {
    expect(() =>
      sg2TestHooks.requireSuccessfulCallReceipt({ contractAddress, status: 1, to: contractAddress }, contractAddress),
    ).to.throw("SG2 transaction receipt contract address is invalid; sensitive details suppressed.");
  });

  it("rejects a missing encrypted input result with a fixed error", function () {
    expect(() => sg2TestHooks.validateEncryptedInputResult(ethers, undefined)).to.throw(
      "SG2 encrypted input validation failed; sensitive details suppressed.",
    );
  });

  it("rejects missing encrypted handles with a fixed error", function () {
    expect(() => sg2TestHooks.validateEncryptedInputResult(ethers, { inputProof: new Uint8Array([1]) })).to.throw(
      "SG2 encrypted input validation failed; sensitive details suppressed.",
    );
  });

  it("rejects an empty encrypted handle array with a fixed error", function () {
    expect(() =>
      sg2TestHooks.validateEncryptedInputResult(ethers, { handles: [], inputProof: new Uint8Array([1]) }),
    ).to.throw("SG2 encrypted input validation failed; sensitive details suppressed.");
  });

  it("rejects a missing encrypted input proof with a fixed error", function () {
    expect(() => sg2TestHooks.validateEncryptedInputResult(ethers, { handles: [new Uint8Array(32)] })).to.throw(
      "SG2 encrypted input validation failed; sensitive details suppressed.",
    );
  });

  it("rejects malformed encrypted handles and proofs with a fixed error", function () {
    expect(() =>
      sg2TestHooks.validateEncryptedInputResult(ethers, {
        handles: [new Uint8Array(31)],
        inputProof: new Uint8Array([1]),
      }),
    ).to.throw("SG2 encrypted input validation failed; sensitive details suppressed.");
    expect(() =>
      sg2TestHooks.validateEncryptedInputResult(ethers, {
        handles: [new Uint8Array(32)],
        inputProof: "not-bytes",
      }),
    ).to.throw("SG2 encrypted input validation failed; sensitive details suppressed.");
  });

  it("accepts one 32-byte handle and a non-empty byte-like input proof", function () {
    const handle = new Uint8Array(32);
    const inputProof = new Uint8Array([1]);
    expect(sg2TestHooks.validateEncryptedInputResult(ethers, { handles: [handle], inputProof })).to.deep.equal({
      handle,
      inputProof,
    });
  });
});
