import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { BytesLike, TransactionReceipt, TransactionRequest, Wallet } from "ethers";
import { vars } from "hardhat/config";
import { ArgumentsParser } from "hardhat/internal/cli/ArgumentsParser";
import { paramNameToEnvVariable } from "hardhat/internal/core/params/env-variables";
import { HARDHAT_PARAM_DEFINITIONS } from "hardhat/internal/core/params/hardhat-params";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

import type { SG2PublicDecrypt } from "../types";

const SEPOLIA_CHAIN_ID = 11155111n;
const SG2_EXPECTED_VALUE = 42n;
const BASIS_POINTS = 10_000n;
const GAS_BUFFER_BASIS_POINTS = 2_000n;
const MAX_GAS_BUFFER = 500_000n;
// Reserve capacity for deployment, encrypted preparation, and proof verification.
const PREFLIGHT_FUNDING_MULTIPLIER = 4n;
const RECEIPT_POLL_INTERVAL_MILLISECONDS = 5_000;
const RECEIPT_POLL_ATTEMPTS = 120;
const HASH_PATTERN = /^[0-9a-f]{40}$/u;
const FORBIDDEN_HARDHAT_DEBUG_NAMESPACES = [
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
] as const;
const SG2_CAPABILITY_TASK_NAMES = new Set(["sg2:preflight", "sg2:deploy", "sg2:prepare", "sg2:verify"]);
const HARDHAT_GLOBAL_OPTIONS = new Map(
  Object.values(HARDHAT_PARAM_DEFINITIONS).map((definition) => [
    ArgumentsParser.paramNameToCLA(definition.name),
    definition.isFlag,
  ]),
);
const HARDHAT_VERBOSE_OPTION = ArgumentsParser.paramNameToCLA(HARDHAT_PARAM_DEFINITIONS.verbose.name);
const HARDHAT_VERBOSE_ENVIRONMENT_VARIABLE = paramNameToEnvVariable(HARDHAT_PARAM_DEFINITIONS.verbose.name);
const INSTALLED_PACKAGES = [
  "@fhevm/hardhat-plugin",
  "@fhevm/solidity",
  "@zama-fhe/relayer-sdk",
  "hardhat",
  "ethers",
] as const;

type RepositoryIdentity = {
  gitCommit: string;
  gitTree: string;
};

type InstalledPackageVersions = Record<(typeof INSTALLED_PACKAGES)[number], string>;

type PublicBuildMetadata = RepositoryIdentity & {
  packageVersions: InstalledPackageVersions;
  pnpmLockSha256: string;
};

type LiveContext = PublicBuildMetadata & {
  chainId: bigint;
  signer: HardhatEthersSigner;
  signerAddress: string;
  wallet: Wallet;
};

type PreparedTransaction = {
  feeCeilingPerGas: bigint;
  signableRequest: TransactionRequest;
};

type SG2State = {
  ciphertext: string;
  expectedValue: bigint;
  initialized: boolean;
  publiclyDecryptable: boolean;
  verificationSucceeded: boolean;
  verifiedValue: bigint;
};

type DebugEnvironment = Readonly<{ DEBUG?: string }>;

type HardhatArgumentEnvironment = Readonly<Record<string, string | undefined>>;

type HardhatCommandClassification = {
  selectedTask: string | undefined;
  verbose: boolean;
};

type BytesUtilities = {
  isBytesLike(value: unknown): value is BytesLike;
  dataLength(value: BytesLike): number;
};

type ValidatedEncryptedInput = {
  handle: BytesLike;
  inputProof: BytesLike;
};

type CallReceiptFields = Pick<TransactionReceipt, "contractAddress" | "status" | "to">;

export type Sg2Action = "preflight" | "deploy" | "prepare" | "verify";

export type Sg2DispatchArguments = Readonly<{ address?: string }>;

export type Sg2DispatchCapability = Readonly<object>;

type Sg2BootstrapState = Readonly<{
  consumeDispatchCapability(capability: object, action: string): void;
}>;

const SG2_BOOTSTRAP_STATE_PATH = "/home/dell/zama-szn4/scripts/sg2-bootstrap-state.cjs";

function consumeAuthenticDispatchCapability(capability: object, action: string): void {
  try {
    if (realpathSync.native(SG2_BOOTSTRAP_STATE_PATH) !== SG2_BOOTSTRAP_STATE_PATH) {
      throw new Error("invalid state");
    }
    // The canonical absolute real path preserves one WeakMap-backed capability
    // registry even under Node symlink-preservation modes.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const state = require(SG2_BOOTSTRAP_STATE_PATH) as Sg2BootstrapState;
    if (typeof state.consumeDispatchCapability !== "function") {
      throw new Error("invalid state");
    }
    state.consumeDispatchCapability(capability, action);
  } catch {
    throw new Error("SG2 secure launcher is required; sensitive details suppressed.");
  }
}

async function suppressSensitiveFailure<T>(message: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error(message);
  }
}

function suppressSensitiveSyncFailure<T>(message: string, operation: () => T): T {
  try {
    return operation();
  } catch {
    throw new Error(message);
  }
}

function debugPatternMatches(namespace: string, pattern: string): boolean {
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

function debugNamespaceEnabled(debugSelector: string | undefined, namespace: string): boolean {
  const patterns = (debugSelector ?? "")
    .trim()
    .replace(/\s+/gu, ",")
    .split(",")
    .filter((pattern) => pattern.length > 0);
  const exclusions = patterns.filter((pattern) => pattern.startsWith("-")).map((pattern) => pattern.slice(1));
  if (exclusions.some((pattern) => debugPatternMatches(namespace, pattern))) {
    return false;
  }
  return patterns
    .filter((pattern) => !pattern.startsWith("-"))
    .some((pattern) => debugPatternMatches(namespace, pattern));
}

export function requireSafeFhevmDebugConfiguration(environment: DebugEnvironment = { DEBUG: process.env.DEBUG }): void {
  // debug@4.4.3 supports comma/whitespace-separated wildcard selectors with global "-" exclusions.
  if (FORBIDDEN_HARDHAT_DEBUG_NAMESPACES.some((namespace) => debugNamespaceEnabled(environment.DEBUG, namespace))) {
    throw new Error("SG2 sensitive Hardhat debug output is enabled; sensitive details suppressed.");
  }
}

export function classifyHardhatCommand(
  argumentsList: readonly string[],
  environment: HardhatArgumentEnvironment,
): HardhatCommandClassification {
  let selectedTask: string | undefined;
  let verbose = environment[HARDHAT_VERBOSE_ENVIRONMENT_VARIABLE]?.toLowerCase() === "true";

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith(ArgumentsParser.PARAM_PREFIX)) {
      selectedTask ??= argument;
      continue;
    }

    const isFlag = HARDHAT_GLOBAL_OPTIONS.get(argument);
    if (isFlag === undefined) {
      if (selectedTask === undefined) {
        // Hardhat rejects unknown global options before configuration loading.
        return { selectedTask: undefined, verbose: false };
      }
      // Once Hardhat has found the task, non-global options belong to that task.
      continue;
    }
    if (isFlag) {
      if (argument === HARDHAT_VERBOSE_OPTION) {
        verbose = true;
      }
    } else {
      if (index + 1 >= argumentsList.length) {
        // Hardhat rejects an incomplete value-bearing global option before loading configuration.
        return { selectedTask: undefined, verbose: false };
      }
      index += 1;
    }
  }
  return { selectedTask, verbose };
}

export function detectHardhatTaskArgument(argumentsList: readonly string[]): string | undefined {
  return classifyHardhatCommand(argumentsList, {}).selectedTask;
}

export function guardSg2TaskBeforeConfiguration(
  argumentsList: readonly string[],
  environment: HardhatArgumentEnvironment,
  guard: () => void,
): boolean {
  const { selectedTask, verbose } = classifyHardhatCommand(argumentsList, environment);
  const isSg2CapabilityTask = selectedTask !== undefined && SG2_CAPABILITY_TASK_NAMES.has(selectedTask);
  if (isSg2CapabilityTask) {
    if (verbose) {
      throw new Error("SG2 Hardhat verbose output is enabled; sensitive details suppressed.");
    }
    guard();
  }
  return isSg2CapabilityTask;
}

async function withSuppressedExternalOutput<T>(operation: () => Promise<T>, failureMessage: string): Promise<T> {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const discardWrite = (() => true) as typeof process.stdout.write;

  try {
    console.log = () => undefined;
    console.error = () => undefined;
    console.warn = () => undefined;
    process.stdout.write = discardWrite;
    process.stderr.write = discardWrite;
    return await operation();
  } catch {
    throw new Error(failureMessage);
  } finally {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

async function initializeFhevmCli(hre: HardhatRuntimeEnvironment, failureMessage: string): Promise<void> {
  await withSuppressedExternalOutput(async () => hre.fhevm.initializeCLIApi(), failureMessage);
}

function validateEncryptedInputResult(bytesUtilities: BytesUtilities, result: unknown): ValidatedEncryptedInput {
  return suppressSensitiveSyncFailure("SG2 encrypted input validation failed; sensitive details suppressed.", () => {
    if (typeof result !== "object" || result === null) {
      throw new Error("invalid encrypted input result");
    }
    const candidate = result as { handles?: unknown; inputProof?: unknown };
    if (!Array.isArray(candidate.handles) || candidate.handles.length !== 1) {
      throw new Error("invalid encrypted handles");
    }
    const handle = candidate.handles[0];
    const inputProof = candidate.inputProof;
    if (
      !bytesUtilities.isBytesLike(handle) ||
      bytesUtilities.dataLength(handle) !== 32 ||
      !bytesUtilities.isBytesLike(inputProof) ||
      bytesUtilities.dataLength(inputProof) === 0
    ) {
      throw new Error("invalid encrypted input bytes");
    }
    return { handle, inputProof };
  });
}

function runGit(argumentsList: string[]): string {
  return suppressSensitiveSyncFailure("SG2 Git metadata resolution failed; sensitive details suppressed.", () =>
    execFileSync("git", argumentsList, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim(),
  );
}

function requireCleanRepository(): RepositoryIdentity {
  const porcelainStatus = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (porcelainStatus.length !== 0) {
    throw new Error("SG2 requires a clean committed index and worktree; sensitive details suppressed.");
  }

  const gitCommit = runGit(["rev-parse", "HEAD"]);
  const gitTree = runGit(["rev-parse", "HEAD^{tree}"]);
  if (!HASH_PATTERN.test(gitCommit) || !HASH_PATTERN.test(gitTree)) {
    throw new Error("SG2 Git metadata validation failed; sensitive details suppressed.");
  }

  return { gitCommit, gitTree };
}

function requireRepositoryIdentityUnchanged(expectedIdentity: RepositoryIdentity): void {
  const currentCommit = runGit(["rev-parse", "HEAD"]);
  const currentTree = runGit(["rev-parse", "HEAD^{tree}"]);
  if (!HASH_PATTERN.test(currentCommit) || !HASH_PATTERN.test(currentTree)) {
    throw new Error("SG2 Git metadata validation failed; sensitive details suppressed.");
  }
  if (currentCommit !== expectedIdentity.gitCommit || currentTree !== expectedIdentity.gitTree) {
    throw new Error("SG2 repository identity changed during execution; sensitive details suppressed.");
  }

  const porcelainStatus = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (porcelainStatus.length !== 0) {
    throw new Error("SG2 requires a clean committed index and worktree; sensitive details suppressed.");
  }
}

function installedPackageVersion(packageName: (typeof INSTALLED_PACKAGES)[number]): string {
  return suppressSensitiveSyncFailure("SG2 installed-package metadata failed; sensitive details suppressed.", () => {
    let packageEntry: string;
    try {
      packageEntry = require.resolve(`${packageName}/package.json`);
    } catch {
      packageEntry = require.resolve(packageName);
    }

    const repositoryRoot = resolve(process.cwd());
    const repositoryPrefix = repositoryRoot.endsWith(sep) ? repositoryRoot : repositoryRoot + sep;
    let candidateDirectory = dirname(packageEntry);
    while (candidateDirectory === repositoryRoot || candidateDirectory.startsWith(repositoryPrefix)) {
      const packageJsonPath = join(candidateDirectory, "package.json");
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (packageJson.name === packageName && typeof packageJson.version === "string") {
          return packageJson.version;
        }
      }

      const parentDirectory = dirname(candidateDirectory);
      if (parentDirectory === candidateDirectory) break;
      candidateDirectory = parentDirectory;
    }

    throw new Error("package metadata unavailable");
  });
}

function readPublicBuildMetadata(repositoryIdentity: RepositoryIdentity): PublicBuildMetadata {
  const packageVersions = Object.fromEntries(
    INSTALLED_PACKAGES.map((packageName) => [packageName, installedPackageVersion(packageName)]),
  ) as InstalledPackageVersions;
  const pnpmLockSha256 = suppressSensitiveSyncFailure(
    "SG2 lockfile metadata failed; sensitive details suppressed.",
    () =>
      createHash("sha256")
        .update(readFileSync(join(process.cwd(), "pnpm-lock.yaml")))
        .digest("hex"),
  );
  return { ...repositoryIdentity, packageVersions, pnpmLockSha256 };
}

function requireSepoliaTaskNetwork(hre: HardhatRuntimeEnvironment): void {
  if (hre.network.name !== "sepolia") {
    throw new Error("SG2 live tasks require the Sepolia network; sensitive details suppressed.");
  }
}

function readValidatedPrivateKey(): string {
  let rpcUrl: string;
  let privateKey: string;
  try {
    rpcUrl = vars.get("SEPOLIA_RPC_URL", "").trim();
    privateKey = vars.get("SEPOLIA_PRIVATE_KEY", "").trim();
  } catch {
    throw new Error("SG2 Hardhat variable check failed; sensitive details suppressed.");
  }
  if (rpcUrl.length === 0 || privateKey.length === 0) {
    throw new Error("SG2 required Hardhat variables are not configured; sensitive details suppressed.");
  }

  let validRpcUrl = false;
  try {
    const parsedRpcUrl = new URL(rpcUrl);
    validRpcUrl =
      (parsedRpcUrl.protocol === "http:" || parsedRpcUrl.protocol === "https:") && parsedRpcUrl.hostname.length > 0;
  } catch {
    validRpcUrl = false;
  }
  if (!validRpcUrl) {
    throw new Error("SG2 RPC URL validation failed; sensitive details suppressed.");
  }
  if (!/^0x[0-9a-fA-F]{64}$/u.test(privateKey)) {
    throw new Error("SG2 private-key validation failed; sensitive details suppressed.");
  }
  return privateKey;
}

async function readSepoliaChainId(hre: HardhatRuntimeEnvironment): Promise<bigint> {
  const network = await suppressSensitiveFailure(
    "SG2 provider request failed; sensitive details suppressed.",
    async () => hre.ethers.provider.getNetwork(),
  );
  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error("SG2 live chain validation failed; sensitive details suppressed.");
  }
  return network.chainId;
}

async function createLiveContext(hre: HardhatRuntimeEnvironment): Promise<LiveContext> {
  requireSafeFhevmDebugConfiguration();
  requireSepoliaTaskNetwork(hre);
  const repositoryIdentity = requireCleanRepository();
  const publicBuildMetadata = readPublicBuildMetadata(repositoryIdentity);
  const privateKey = readValidatedPrivateKey();
  const chainId = await readSepoliaChainId(hre);
  const signers = await suppressSensitiveFailure(
    "SG2 signer retrieval failed; sensitive details suppressed.",
    async () => hre.ethers.getSigners(),
  );
  if (signers.length !== 1) {
    throw new Error("SG2 requires exactly one configured signer; sensitive details suppressed.");
  }

  const signer = signers[0];
  const signerAddress = await suppressSensitiveFailure(
    "SG2 signer address resolution failed; sensitive details suppressed.",
    async () => signer.getAddress(),
  );
  if (!hre.ethers.isAddress(signerAddress)) {
    throw new Error("SG2 signer address validation failed; sensitive details suppressed.");
  }

  const normalizedSignerAddress = hre.ethers.getAddress(signerAddress);
  const wallet = suppressSensitiveSyncFailure(
    "SG2 wallet setup failed; sensitive details suppressed.",
    () => new hre.ethers.Wallet(privateKey, hre.ethers.provider),
  );
  if (wallet.address !== normalizedSignerAddress) {
    throw new Error("SG2 wallet identity validation failed; sensitive details suppressed.");
  }
  return { ...publicBuildMetadata, chainId, signer, signerAddress: normalizedSignerAddress, wallet };
}

function bufferedGasLimit(estimatedGas: bigint): bigint {
  if (estimatedGas <= 0n) {
    throw new Error("SG2 gas estimation validation failed; sensitive details suppressed.");
  }
  const proportionalBuffer = (estimatedGas * GAS_BUFFER_BASIS_POINTS + BASIS_POINTS - 1n) / BASIS_POINTS;
  const boundedBuffer = proportionalBuffer < MAX_GAS_BUFFER ? proportionalBuffer : MAX_GAS_BUFFER;
  return estimatedGas + boundedBuffer;
}

async function prepareExactTransaction(
  hre: HardhatRuntimeEnvironment,
  signerAddress: string,
  baseRequest: TransactionRequest,
): Promise<PreparedTransaction> {
  const nonce = await suppressSensitiveFailure("SG2 provider request failed; sensitive details suppressed.", async () =>
    hre.ethers.provider.getTransactionCount(signerAddress, "pending"),
  );
  const feeData = await suppressSensitiveFailure(
    "SG2 fee-data request failed; sensitive details suppressed.",
    async () => hre.ethers.provider.getFeeData(),
  );

  let to: string | null = null;
  if (baseRequest.to !== null && baseRequest.to !== undefined) {
    if (typeof baseRequest.to !== "string" || !hre.ethers.isAddress(baseRequest.to)) {
      throw new Error("SG2 transaction destination validation failed; sensitive details suppressed.");
    }
    to = hre.ethers.getAddress(baseRequest.to);
  }
  if (typeof baseRequest.data !== "string" || !hre.ethers.isHexString(baseRequest.data)) {
    throw new Error("SG2 transaction calldata validation failed; sensitive details suppressed.");
  }

  const value = suppressSensitiveSyncFailure(
    "SG2 transaction value validation failed; sensitive details suppressed.",
    () => hre.ethers.toBigInt(baseRequest.value ?? 0n),
  );
  const exactBaseRequest: TransactionRequest = {
    to,
    data: baseRequest.data,
    value,
    nonce,
    chainId: SEPOLIA_CHAIN_ID,
  };

  let feeCeilingPerGas: bigint;
  let requestForEstimation: TransactionRequest;
  if (feeData.maxFeePerGas !== null && feeData.maxPriorityFeePerGas !== null) {
    if (feeData.maxFeePerGas < feeData.maxPriorityFeePerGas) {
      throw new Error("SG2 EIP-1559 fee-data validation failed; sensitive details suppressed.");
    }
    feeCeilingPerGas = feeData.maxFeePerGas;
    requestForEstimation = {
      ...exactBaseRequest,
      type: 2,
      from: signerAddress,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    };
  } else if (feeData.gasPrice !== null) {
    feeCeilingPerGas = feeData.gasPrice;
    requestForEstimation = {
      ...exactBaseRequest,
      type: 0,
      from: signerAddress,
      gasPrice: feeData.gasPrice,
    };
  } else {
    throw new Error("SG2 fee-data validation failed; sensitive details suppressed.");
  }

  const estimatedGas = await suppressSensitiveFailure(
    "SG2 gas estimation failed; sensitive details suppressed.",
    async () => hre.ethers.provider.estimateGas(requestForEstimation),
  );
  const signableRequest = { ...requestForEstimation, gasLimit: bufferedGasLimit(estimatedGas) };
  delete signableRequest.from;
  return { feeCeilingPerGas, signableRequest };
}

async function requireSufficientFunding(
  hre: HardhatRuntimeEnvironment,
  signerAddress: string,
  preparedTransaction: PreparedTransaction,
  fundingMultiplier = 1n,
): Promise<void> {
  const balance = await suppressSensitiveFailure(
    "SG2 balance request failed; sensitive details suppressed.",
    async () => hre.ethers.provider.getBalance(signerAddress),
  );
  const requiredBalance = suppressSensitiveSyncFailure(
    "SG2 funding calculation failed; sensitive details suppressed.",
    () => {
      const gasLimit = hre.ethers.toBigInt(preparedTransaction.signableRequest.gasLimit ?? 0n);
      const value = hre.ethers.toBigInt(preparedTransaction.signableRequest.value ?? 0n);
      return (gasLimit * preparedTransaction.feeCeilingPerGas + value) * fundingMultiplier;
    },
  );
  if (balance < requiredBalance) {
    throw new Error("SG2 funding check failed; sensitive details suppressed.");
  }
}

function requireValidTransactionHash(hre: HardhatRuntimeEnvironment, transactionHash: string): void {
  if (!hre.ethers.isHexString(transactionHash, 32)) {
    throw new Error("SG2 transaction hash validation failed; sensitive details suppressed.");
  }
}

async function signExactTransaction(
  hre: HardhatRuntimeEnvironment,
  wallet: Wallet,
  request: TransactionRequest,
): Promise<{ expectedHash: string; signedTransaction: string }> {
  const requiredFields = suppressSensitiveSyncFailure(
    "SG2 signable transaction validation failed; sensitive details suppressed.",
    () => {
      if (
        request.from !== undefined ||
        request.nonce === null ||
        request.nonce === undefined ||
        request.chainId === null ||
        request.chainId === undefined ||
        request.type === null ||
        request.type === undefined ||
        request.gasLimit === null ||
        request.gasLimit === undefined ||
        request.value === null ||
        request.value === undefined ||
        typeof request.data !== "string"
      ) {
        throw new Error("incomplete signable transaction");
      }

      const type = hre.ethers.toNumber(request.type);
      if (
        (type === 2 &&
          (request.gasPrice !== undefined ||
            request.maxFeePerGas === null ||
            request.maxFeePerGas === undefined ||
            request.maxPriorityFeePerGas === null ||
            request.maxPriorityFeePerGas === undefined)) ||
        (type === 0 &&
          (request.gasPrice === null ||
            request.gasPrice === undefined ||
            request.maxFeePerGas !== undefined ||
            request.maxPriorityFeePerGas !== undefined)) ||
        (type !== 0 && type !== 2)
      ) {
        throw new Error("incomplete signable transaction fee fields");
      }
      return { data: request.data, nonce: hre.ethers.toNumber(request.nonce), type };
    },
  );

  const signedTransaction = await suppressSensitiveFailure(
    "SG2 transaction signing failed; sensitive details suppressed.",
    async () => wallet.signTransaction(request),
  );
  const expectedHash = suppressSensitiveSyncFailure(
    "SG2 signed transaction validation failed; sensitive details suppressed.",
    () => {
      const parsedTransaction = hre.ethers.Transaction.from(signedTransaction);
      const transactionHash = hre.ethers.keccak256(signedTransaction);
      const expectedTo =
        request.to === null || request.to === undefined ? null : hre.ethers.getAddress(String(request.to));
      if (
        !parsedTransaction.isSigned() ||
        parsedTransaction.from !== wallet.address ||
        parsedTransaction.chainId !== hre.ethers.toBigInt(request.chainId ?? 0n) ||
        parsedTransaction.type !== requiredFields.type ||
        parsedTransaction.nonce !== requiredFields.nonce ||
        parsedTransaction.gasLimit !== hre.ethers.toBigInt(request.gasLimit ?? 0n) ||
        parsedTransaction.value !== hre.ethers.toBigInt(request.value ?? 0n) ||
        parsedTransaction.data.toLowerCase() !== requiredFields.data.toLowerCase() ||
        parsedTransaction.to !== expectedTo
      ) {
        throw new Error("signed transaction field mismatch");
      }

      if (requiredFields.type === 2) {
        if (
          request.gasPrice !== undefined ||
          parsedTransaction.gasPrice !== null ||
          parsedTransaction.maxFeePerGas !== hre.ethers.toBigInt(request.maxFeePerGas ?? 0n) ||
          parsedTransaction.maxPriorityFeePerGas !== hre.ethers.toBigInt(request.maxPriorityFeePerGas ?? 0n)
        ) {
          throw new Error("signed EIP-1559 fee field mismatch");
        }
      } else if (
        requiredFields.type !== 0 ||
        request.maxFeePerGas !== undefined ||
        request.maxPriorityFeePerGas !== undefined ||
        parsedTransaction.gasPrice !== hre.ethers.toBigInt(request.gasPrice ?? 0n) ||
        parsedTransaction.maxFeePerGas !== null ||
        parsedTransaction.maxPriorityFeePerGas !== null
      ) {
        throw new Error("signed legacy fee field mismatch");
      }
      return transactionHash;
    },
  );
  requireValidTransactionHash(hre, expectedHash);
  return { expectedHash, signedTransaction };
}

async function broadcastSignedTransaction(
  hre: HardhatRuntimeEnvironment,
  signedTransaction: string,
  expectedHash: string,
): Promise<string> {
  let result: unknown;
  try {
    result = await hre.network.provider.request({
      method: "eth_sendRawTransaction",
      params: [signedTransaction],
    });
  } catch {
    throw new Error("SG2 transaction broadcast failed; sensitive details suppressed.");
  }
  if (typeof result !== "string") {
    throw new Error("SG2 transaction broadcast hash validation failed; sensitive details suppressed.");
  }
  requireValidTransactionHash(hre, result);
  if (result.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("SG2 transaction broadcast hash mismatch; sensitive details suppressed.");
  }
  return result;
}

function localDelay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function requireValidReceiptBlockNumber(blockNumber: unknown): asserts blockNumber is number {
  if (
    typeof blockNumber !== "number" ||
    !Number.isFinite(blockNumber) ||
    !Number.isInteger(blockNumber) ||
    !Number.isSafeInteger(blockNumber) ||
    blockNumber <= 0
  ) {
    throw new Error("SG2 transaction receipt block number is invalid; sensitive details suppressed.");
  }
}

async function pollForTransactionReceipt(
  hre: HardhatRuntimeEnvironment,
  transactionHash: string,
): Promise<TransactionReceipt> {
  // Poll for at most ten minutes; signer-managed polling is intentionally never used.
  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt += 1) {
    let receipt: TransactionReceipt | null;
    try {
      receipt = await hre.ethers.provider.getTransactionReceipt(transactionHash);
    } catch {
      throw new Error("SG2 transaction receipt request failed; sensitive details suppressed.");
    }
    if (receipt !== null) {
      requireValidReceiptBlockNumber(receipt.blockNumber);
      requireValidTransactionHash(hre, receipt.hash);
      if (receipt.hash.toLowerCase() !== transactionHash.toLowerCase()) {
        throw new Error("SG2 transaction receipt hash mismatch; sensitive details suppressed.");
      }
      return receipt;
    }
    if (attempt + 1 < RECEIPT_POLL_ATTEMPTS) {
      await localDelay(RECEIPT_POLL_INTERVAL_MILLISECONDS);
    }
  }
  throw new Error("SG2 transaction receipt timed out; sensitive details suppressed.");
}

async function requireDeployedCode(hre: HardhatRuntimeEnvironment, contractAddress: string): Promise<void> {
  const deployedCode = await suppressSensitiveFailure(
    "SG2 deployed-code read failed; sensitive details suppressed.",
    async () => hre.ethers.provider.getCode(contractAddress),
  );
  if (deployedCode === "0x") {
    throw new Error("SG2 deployed-code validation failed; sensitive details suppressed.");
  }
}

async function readSG2State(contract: SG2PublicDecrypt): Promise<SG2State> {
  return suppressSensitiveFailure("SG2 contract state read failed; sensitive details suppressed.", async () => {
    const [ciphertext, expectedValue, initialized, publiclyDecryptable, verificationSucceeded, verifiedValue] =
      await Promise.all([
        contract.getCiphertext(),
        contract.SG2_EXPECTED_VALUE(),
        contract.initialized(),
        contract.isCiphertextPubliclyDecryptable(),
        contract.verificationSucceeded(),
        contract.verifiedValue(),
      ]);
    return { ciphertext, expectedValue, initialized, publiclyDecryptable, verificationSucceeded, verifiedValue };
  });
}

function requireTransactionDestination(
  hre: HardhatRuntimeEnvironment,
  request: TransactionRequest,
  contractAddress: string,
): void {
  if (
    request.to === null ||
    request.to === undefined ||
    typeof request.to !== "string" ||
    hre.ethers.getAddress(request.to) !== contractAddress
  ) {
    throw new Error("SG2 transaction destination mismatch; sensitive details suppressed.");
  }
}

function requireSuccessfulCallReceipt(receipt: CallReceiptFields, contractAddress: string): void {
  if (receipt.status !== 1) {
    throw new Error("SG2 transaction receipt status failed; sensitive details suppressed.");
  }
  if (receipt.to === null || receipt.to.toLowerCase() !== contractAddress.toLowerCase()) {
    throw new Error("SG2 transaction receipt target mismatch; sensitive details suppressed.");
  }
  if (receipt.contractAddress !== null) {
    throw new Error("SG2 transaction receipt contract address is invalid; sensitive details suppressed.");
  }
}

function emitPublicMetadata(metadata: Record<string, unknown>): void {
  console.log(JSON.stringify(metadata));
}

async function runSg2Preflight(hre: HardhatRuntimeEnvironment): Promise<void> {
  const context = await createLiveContext(hre);
  const factory = await suppressSensitiveFailure(
    "SG2 contract factory setup failed; sensitive details suppressed.",
    async () => hre.ethers.getContractFactory("SG2PublicDecrypt", context.signer),
  );
  const deploymentRequest = await suppressSensitiveFailure(
    "SG2 deployment transaction preparation failed; sensitive details suppressed.",
    async () => factory.getDeployTransaction(),
  );
  const preparedTransaction = await prepareExactTransaction(hre, context.signerAddress, deploymentRequest);
  await requireSufficientFunding(hre, context.signerAddress, preparedTransaction, PREFLIGHT_FUNDING_MULTIPLIER);
  emitPublicMetadata({
    event: "sg2-preflight",
    utcTimestamp: new Date().toISOString(),
    gitCommit: context.gitCommit,
    gitTree: context.gitTree,
    packageVersions: context.packageVersions,
    pnpmLockSha256: context.pnpmLockSha256,
    chainId: Number(context.chainId),
    operatorAddress: context.signerAddress,
    expectedPublicValue: Number(SG2_EXPECTED_VALUE),
    fundingCheck: "PASS",
    status: "PASS",
  });
}

async function runSg2Deploy(hre: HardhatRuntimeEnvironment): Promise<void> {
  const context = await createLiveContext(hre);
  const factory = await suppressSensitiveFailure(
    "SG2 contract factory setup failed; sensitive details suppressed.",
    async () => hre.ethers.getContractFactory("SG2PublicDecrypt", context.signer),
  );
  const deploymentRequest = await suppressSensitiveFailure(
    "SG2 deployment transaction preparation failed; sensitive details suppressed.",
    async () => factory.getDeployTransaction(),
  );
  const preparedTransaction = await prepareExactTransaction(hre, context.signerAddress, deploymentRequest);
  await requireSufficientFunding(hre, context.signerAddress, preparedTransaction);

  const pendingNonce = preparedTransaction.signableRequest.nonce;
  if (pendingNonce === null || pendingNonce === undefined) {
    throw new Error("SG2 pending nonce validation failed; sensitive details suppressed.");
  }
  const expectedContractAddress = suppressSensitiveSyncFailure(
    "SG2 expected contract address calculation failed; sensitive details suppressed.",
    () => hre.ethers.getCreateAddress({ from: context.signerAddress, nonce: pendingNonce }),
  );

  await readSepoliaChainId(hre);
  const utcTimestamp = new Date().toISOString();
  const { expectedHash, signedTransaction } = await signExactTransaction(
    hre,
    context.wallet,
    preparedTransaction.signableRequest,
  );
  // The fully signed transaction is immutable. Commit/tree are compared first and cleanliness is sampled last;
  // no asynchronous or external operation may occur between the final clean result and raw broadcast.
  requireRepositoryIdentityUnchanged(context);
  const deploymentTransactionHash = await broadcastSignedTransaction(hre, signedTransaction, expectedHash);
  const receipt = await pollForTransactionReceipt(hre, deploymentTransactionHash);
  if (receipt.status !== 1) {
    throw new Error("SG2 deployment receipt status failed; sensitive details suppressed.");
  }
  if (receipt.to !== null) {
    throw new Error("SG2 deployment receipt target validation failed; sensitive details suppressed.");
  }
  if (receipt.contractAddress === null) {
    throw new Error("SG2 deployment receipt contract address missing; sensitive details suppressed.");
  }
  if (receipt.contractAddress.toLowerCase() !== expectedContractAddress.toLowerCase()) {
    throw new Error("SG2 deployment receipt contract address mismatch; sensitive details suppressed.");
  }
  const contractAddress = hre.ethers.getAddress(receipt.contractAddress);
  await requireDeployedCode(hre, contractAddress);
  const finalChainId = await readSepoliaChainId(hre);
  emitPublicMetadata({
    event: "sg2-deployment",
    utcTimestamp,
    gitCommit: context.gitCommit,
    gitTree: context.gitTree,
    packageVersions: context.packageVersions,
    pnpmLockSha256: context.pnpmLockSha256,
    chainId: Number(finalChainId),
    operatorAddress: context.signerAddress,
    contractAddress,
    deploymentTransactionHash,
    deploymentBlockNumber: receipt.blockNumber,
    expectedPublicValue: Number(SG2_EXPECTED_VALUE),
    status: "PASS",
  });
}

async function runSg2Prepare(hre: HardhatRuntimeEnvironment, address: string): Promise<void> {
  requireSepoliaTaskNetwork(hre);
  if (!hre.ethers.isAddress(address)) {
    throw new Error("SG2 contract address validation failed; sensitive details suppressed.");
  }
  const contractAddress = hre.ethers.getAddress(address);
  const context = await createLiveContext(hre);
  await requireDeployedCode(hre, contractAddress);
  const contract = await suppressSensitiveFailure(
    "SG2 contract setup failed; sensitive details suppressed.",
    async () =>
      hre.ethers.getContractAt("SG2PublicDecrypt", contractAddress, context.signer) as Promise<SG2PublicDecrypt>,
  );
  const operator = await suppressSensitiveFailure(
    "SG2 operator state read failed; sensitive details suppressed.",
    async () => contract.OPERATOR(),
  );
  if (operator !== context.signerAddress) {
    throw new Error("SG2 operator identity mismatch; sensitive details suppressed.");
  }
  const initialState = await readSG2State(contract);
  if (
    initialState.initialized ||
    initialState.ciphertext !== hre.ethers.ZeroHash ||
    initialState.expectedValue !== SG2_EXPECTED_VALUE ||
    initialState.publiclyDecryptable ||
    initialState.verificationSucceeded ||
    initialState.verifiedValue !== 0n
  ) {
    throw new Error("SG2 contract is not fresh; transaction not submitted.");
  }

  await initializeFhevmCli(hre, "SG2 encryption initialization failed; sensitive details suppressed.");
  const encryptedValue = await suppressSensitiveFailure(
    "SG2 encrypted input creation failed; sensitive details suppressed.",
    async () =>
      hre.fhevm.createEncryptedInput(contractAddress, context.signerAddress).add64(SG2_EXPECTED_VALUE).encrypt(),
  );
  const validatedEncryptedValue = validateEncryptedInputResult(hre.ethers, encryptedValue);
  const initializeRequest = await suppressSensitiveFailure(
    "SG2 initialization transaction preparation failed; sensitive details suppressed.",
    async () =>
      contract.initialize.populateTransaction(validatedEncryptedValue.handle, validatedEncryptedValue.inputProof),
  );
  const preparedTransaction = await prepareExactTransaction(hre, context.signerAddress, initializeRequest);
  await requireSufficientFunding(hre, context.signerAddress, preparedTransaction);
  await readSepoliaChainId(hre);
  requireTransactionDestination(hre, preparedTransaction.signableRequest, contractAddress);
  const utcTimestamp = new Date().toISOString();

  const initializedBeforeSigning = await suppressSensitiveFailure(
    "SG2 contract state read failed; sensitive details suppressed.",
    async () => contract.initialized(),
  );
  if (initializedBeforeSigning) {
    throw new Error("SG2 preparation state changed before signing; transaction not submitted.");
  }
  const { expectedHash, signedTransaction } = await signExactTransaction(
    hre,
    context.wallet,
    preparedTransaction.signableRequest,
  );
  requireRepositoryIdentityUnchanged(context);
  const preparationTransactionHash = await broadcastSignedTransaction(hre, signedTransaction, expectedHash);
  const receipt = await pollForTransactionReceipt(hre, preparationTransactionHash);
  requireSuccessfulCallReceipt(receipt, contractAddress);
  await requireDeployedCode(hre, contractAddress);
  const finalChainId = await readSepoliaChainId(hre);

  const preparedState = await readSG2State(contract);
  if (
    !preparedState.initialized ||
    preparedState.ciphertext === hre.ethers.ZeroHash ||
    preparedState.expectedValue !== SG2_EXPECTED_VALUE ||
    !preparedState.publiclyDecryptable ||
    preparedState.verificationSucceeded ||
    preparedState.verifiedValue !== 0n
  ) {
    throw new Error("SG2 prepared state validation failed; sensitive details suppressed.");
  }
  emitPublicMetadata({
    event: "sg2-preparation",
    utcTimestamp,
    gitCommit: context.gitCommit,
    gitTree: context.gitTree,
    packageVersions: context.packageVersions,
    pnpmLockSha256: context.pnpmLockSha256,
    chainId: Number(finalChainId),
    operatorAddress: context.signerAddress,
    contractAddress,
    preparationTransactionHash,
    preparationBlockNumber: receipt.blockNumber,
    expectedPublicValue: Number(SG2_EXPECTED_VALUE),
    status: "PASS",
  });
}

async function runSg2Verify(hre: HardhatRuntimeEnvironment, address: string): Promise<void> {
  requireSepoliaTaskNetwork(hre);
  if (!hre.ethers.isAddress(address)) {
    throw new Error("SG2 contract address validation failed; sensitive details suppressed.");
  }
  const contractAddress = hre.ethers.getAddress(address);
  const context = await createLiveContext(hre);
  await requireDeployedCode(hre, contractAddress);
  const contract = await suppressSensitiveFailure(
    "SG2 contract setup failed; sensitive details suppressed.",
    async () =>
      hre.ethers.getContractAt("SG2PublicDecrypt", contractAddress, context.signer) as Promise<SG2PublicDecrypt>,
  );
  const operator = await suppressSensitiveFailure(
    "SG2 operator state read failed; sensitive details suppressed.",
    async () => contract.OPERATOR(),
  );
  if (operator !== context.signerAddress) {
    throw new Error("SG2 operator identity mismatch; sensitive details suppressed.");
  }
  const initialState = await readSG2State(contract);
  if (
    !initialState.initialized ||
    initialState.ciphertext === hre.ethers.ZeroHash ||
    initialState.expectedValue !== SG2_EXPECTED_VALUE ||
    !initialState.publiclyDecryptable ||
    initialState.verificationSucceeded ||
    initialState.verifiedValue !== 0n
  ) {
    throw new Error("SG2 contract is not ready for verification; transaction not submitted.");
  }

  await initializeFhevmCli(hre, "SG2 relayer initialization failed; sensitive details suppressed.");
  const publicDecryption = await suppressSensitiveFailure(
    "SG2 public decryption failed; sensitive details suppressed.",
    async () => hre.fhevm.publicDecrypt([initialState.ciphertext]),
  );
  const validatedPublicDecryption = suppressSensitiveSyncFailure(
    "SG2 public decryption result validation failed; sensitive details suppressed.",
    () => {
      const clearValue = publicDecryption.clearValues[initialState.ciphertext as `0x${string}`];
      if (typeof clearValue !== "bigint" || clearValue !== SG2_EXPECTED_VALUE) {
        throw new Error("invalid clear value");
      }
      if (
        !hre.ethers.isHexString(publicDecryption.abiEncodedClearValues) ||
        hre.ethers.dataLength(publicDecryption.abiEncodedClearValues) !== 32 ||
        !hre.ethers.isHexString(publicDecryption.decryptionProof) ||
        hre.ethers.dataLength(publicDecryption.decryptionProof) === 0
      ) {
        throw new Error("invalid public decryption result");
      }
      return {
        abiEncodedClearValues: publicDecryption.abiEncodedClearValues,
        decryptionProof: publicDecryption.decryptionProof,
      };
    },
  );
  const verificationRequest = await suppressSensitiveFailure(
    "SG2 verification transaction preparation failed; sensitive details suppressed.",
    async () =>
      contract.verifyPublicDecryption.populateTransaction(
        validatedPublicDecryption.abiEncodedClearValues,
        validatedPublicDecryption.decryptionProof,
      ),
  );
  const preparedTransaction = await prepareExactTransaction(hre, context.signerAddress, verificationRequest);
  await requireSufficientFunding(hre, context.signerAddress, preparedTransaction);
  await readSepoliaChainId(hre);
  requireTransactionDestination(hre, preparedTransaction.signableRequest, contractAddress);
  const utcTimestamp = new Date().toISOString();

  const verifiedBeforeSigning = await suppressSensitiveFailure(
    "SG2 contract state read failed; sensitive details suppressed.",
    async () => contract.verificationSucceeded(),
  );
  if (verifiedBeforeSigning) {
    throw new Error("SG2 verification state changed before signing; transaction not submitted.");
  }
  const { expectedHash, signedTransaction } = await signExactTransaction(
    hre,
    context.wallet,
    preparedTransaction.signableRequest,
  );
  requireRepositoryIdentityUnchanged(context);
  const verificationTransactionHash = await broadcastSignedTransaction(hre, signedTransaction, expectedHash);
  const receipt = await pollForTransactionReceipt(hre, verificationTransactionHash);
  requireSuccessfulCallReceipt(receipt, contractAddress);
  await requireDeployedCode(hre, contractAddress);
  const finalChainId = await readSepoliaChainId(hre);

  const finalState = await readSG2State(contract);
  if (
    finalState.expectedValue !== SG2_EXPECTED_VALUE ||
    !finalState.verificationSucceeded ||
    finalState.verifiedValue !== SG2_EXPECTED_VALUE
  ) {
    throw new Error("SG2 verified state validation failed; sensitive details suppressed.");
  }
  emitPublicMetadata({
    event: "sg2-verification",
    utcTimestamp,
    gitCommit: context.gitCommit,
    gitTree: context.gitTree,
    packageVersions: context.packageVersions,
    pnpmLockSha256: context.pnpmLockSha256,
    chainId: Number(finalChainId),
    operatorAddress: context.signerAddress,
    contractAddress,
    verificationTransactionHash,
    verificationBlockNumber: receipt.blockNumber,
    expectedPublicValue: Number(SG2_EXPECTED_VALUE),
    verifiedPublicValue: Number(finalState.verifiedValue),
    status: "PASS",
  });
}

export async function dispatchSg2(
  hre: HardhatRuntimeEnvironment,
  action: Sg2Action,
  taskArguments: Sg2DispatchArguments,
  capability: Sg2DispatchCapability,
): Promise<void> {
  const taskName =
    action === "preflight" || action === "deploy" || action === "prepare" || action === "verify" ? `sg2:${action}` : "";
  // Exact WeakMap identity is consumed before any HRE, provider, signer,
  // credential-bearing context, FHEVM, signing, or broadcast access.
  consumeAuthenticDispatchCapability(capability, taskName);

  if (action === "preflight" || action === "deploy") {
    if (Object.keys(taskArguments).length !== 0) {
      throw new Error("SG2 launcher arguments are invalid; sensitive details suppressed.");
    }
    return action === "preflight" ? runSg2Preflight(hre) : runSg2Deploy(hre);
  }

  if (Object.keys(taskArguments).length !== 1 || typeof taskArguments.address !== "string") {
    throw new Error("SG2 launcher arguments are invalid; sensitive details suppressed.");
  }
  return action === "prepare" ? runSg2Prepare(hre, taskArguments.address) : runSg2Verify(hre, taskArguments.address);
}

export const sg2TestHooks = {
  classifyHardhatCommand,
  detectHardhatTaskArgument,
  guardSg2TaskBeforeConfiguration,
  debugNamespaceEnabled,
  requireSafeFhevmDebugConfiguration,
  requireSuccessfulCallReceipt,
  validateEncryptedInputResult,
  withSuppressedExternalOutput,
};
