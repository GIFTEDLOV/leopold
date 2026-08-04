import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { TransactionReceipt, TransactionRequest, Wallet } from "ethers";
import { task, vars } from "hardhat/config";
import type { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

import type { FHECounter } from "../types";

const SEPOLIA_CHAIN_ID = 11155111n;
const BASIS_POINTS = 10_000n;
const GAS_BUFFER_BASIS_POINTS = 2_000n;
const MAX_GAS_BUFFER = 500_000n;
// Three times the buffered deployment ceiling reserves capacity for the deployment and follow-up capability probe.
const PREFLIGHT_FUNDING_MULTIPLIER = 3n;
const RECEIPT_POLL_INTERVAL_MILLISECONDS = 5_000;
const RECEIPT_POLL_ATTEMPTS = 120;
const HASH_PATTERN = /^[0-9a-f]{40}$/u;
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

function runGit(argumentsList: string[]): string {
  return suppressSensitiveSyncFailure("SG1 Git metadata resolution failed; sensitive details suppressed.", () =>
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
    throw new Error("SG1 requires a clean committed index and worktree; sensitive details suppressed.");
  }

  const gitCommit = runGit(["rev-parse", "HEAD"]);
  const gitTree = runGit(["rev-parse", "HEAD^{tree}"]);
  if (!HASH_PATTERN.test(gitCommit) || !HASH_PATTERN.test(gitTree)) {
    throw new Error("SG1 Git metadata validation failed; sensitive details suppressed.");
  }

  return { gitCommit, gitTree };
}

function requireRepositoryIdentityUnchanged(expectedIdentity: RepositoryIdentity): void {
  const currentCommit = runGit(["rev-parse", "HEAD"]);
  const currentTree = runGit(["rev-parse", "HEAD^{tree}"]);
  if (!HASH_PATTERN.test(currentCommit) || !HASH_PATTERN.test(currentTree)) {
    throw new Error("SG1 Git metadata validation failed; sensitive details suppressed.");
  }
  if (currentCommit !== expectedIdentity.gitCommit || currentTree !== expectedIdentity.gitTree) {
    throw new Error("SG1 repository identity changed during execution; sensitive details suppressed.");
  }

  const porcelainStatus = runGit(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (porcelainStatus.length !== 0) {
    throw new Error("SG1 requires a clean committed index and worktree; sensitive details suppressed.");
  }
}

function installedPackageVersion(packageName: (typeof INSTALLED_PACKAGES)[number]): string {
  return suppressSensitiveSyncFailure("SG1 installed-package metadata failed; sensitive details suppressed.", () => {
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
      if (parentDirectory === candidateDirectory) {
        break;
      }
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
    "SG1 lockfile metadata failed; sensitive details suppressed.",
    () =>
      createHash("sha256")
        .update(readFileSync(join(process.cwd(), "pnpm-lock.yaml")))
        .digest("hex"),
  );

  return { ...repositoryIdentity, packageVersions, pnpmLockSha256 };
}

function requireSepoliaTaskNetwork(hre: HardhatRuntimeEnvironment): void {
  if (hre.network.name !== "sepolia") {
    throw new Error("SG1 live tasks require the Sepolia network; sensitive details suppressed.");
  }
}

function readValidatedPrivateKey(): string {
  let rpcUrl: string;
  let privateKey: string;

  try {
    rpcUrl = vars.get("SEPOLIA_RPC_URL", "").trim();
    privateKey = vars.get("SEPOLIA_PRIVATE_KEY", "").trim();
  } catch {
    throw new Error("SG1 Hardhat variable check failed; sensitive details suppressed.");
  }

  if (rpcUrl.length === 0 || privateKey.length === 0) {
    throw new Error("SG1 required Hardhat variables are not configured; sensitive details suppressed.");
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
    throw new Error("SG1 RPC URL validation failed; sensitive details suppressed.");
  }
  if (!/^0x[0-9a-fA-F]{64}$/u.test(privateKey)) {
    throw new Error("SG1 private-key validation failed; sensitive details suppressed.");
  }

  return privateKey;
}

async function readSepoliaChainId(hre: HardhatRuntimeEnvironment): Promise<bigint> {
  const network = await suppressSensitiveFailure(
    "SG1 provider request failed; sensitive details suppressed.",
    async () => hre.ethers.provider.getNetwork(),
  );
  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error("SG1 live chain validation failed; sensitive details suppressed.");
  }
  return network.chainId;
}

async function createLiveContext(hre: HardhatRuntimeEnvironment): Promise<LiveContext> {
  requireSepoliaTaskNetwork(hre);
  const repositoryIdentity = requireCleanRepository();
  const publicBuildMetadata = readPublicBuildMetadata(repositoryIdentity);
  const privateKey = readValidatedPrivateKey();
  const chainId = await readSepoliaChainId(hre);
  const signers = await suppressSensitiveFailure(
    "SG1 signer retrieval failed; sensitive details suppressed.",
    async () => hre.ethers.getSigners(),
  );
  if (signers.length !== 1) {
    throw new Error("SG1 requires exactly one configured signer; sensitive details suppressed.");
  }

  const signer = signers[0];
  const signerAddress = await suppressSensitiveFailure(
    "SG1 signer address resolution failed; sensitive details suppressed.",
    async () => signer.getAddress(),
  );
  if (!hre.ethers.isAddress(signerAddress)) {
    throw new Error("SG1 signer address validation failed; sensitive details suppressed.");
  }

  const normalizedSignerAddress = hre.ethers.getAddress(signerAddress);
  const wallet = suppressSensitiveSyncFailure(
    "SG1 wallet setup failed; sensitive details suppressed.",
    () => new hre.ethers.Wallet(privateKey, hre.ethers.provider),
  );
  if (wallet.address !== normalizedSignerAddress) {
    throw new Error("SG1 wallet identity validation failed; sensitive details suppressed.");
  }

  return {
    ...publicBuildMetadata,
    chainId,
    signer,
    signerAddress: normalizedSignerAddress,
    wallet,
  };
}

function bufferedGasLimit(estimatedGas: bigint): bigint {
  if (estimatedGas <= 0n) {
    throw new Error("SG1 gas estimation validation failed; sensitive details suppressed.");
  }

  // Add 20%, capped at 500,000 gas, so the submitted limit is buffered but bounded.
  const proportionalBuffer = (estimatedGas * GAS_BUFFER_BASIS_POINTS + BASIS_POINTS - 1n) / BASIS_POINTS;
  const boundedBuffer = proportionalBuffer < MAX_GAS_BUFFER ? proportionalBuffer : MAX_GAS_BUFFER;
  return estimatedGas + boundedBuffer;
}

async function prepareExactTransaction(
  hre: HardhatRuntimeEnvironment,
  signerAddress: string,
  baseRequest: TransactionRequest,
): Promise<PreparedTransaction> {
  const nonce = await suppressSensitiveFailure("SG1 provider request failed; sensitive details suppressed.", async () =>
    hre.ethers.provider.getTransactionCount(signerAddress, "pending"),
  );
  const feeData = await suppressSensitiveFailure(
    "SG1 fee-data request failed; sensitive details suppressed.",
    async () => hre.ethers.provider.getFeeData(),
  );

  let to: string | null = null;
  if (baseRequest.to !== null && baseRequest.to !== undefined) {
    if (typeof baseRequest.to !== "string" || !hre.ethers.isAddress(baseRequest.to)) {
      throw new Error("SG1 transaction destination validation failed; sensitive details suppressed.");
    }
    to = hre.ethers.getAddress(baseRequest.to);
  }
  if (typeof baseRequest.data !== "string" || !hre.ethers.isHexString(baseRequest.data)) {
    throw new Error("SG1 transaction calldata validation failed; sensitive details suppressed.");
  }

  const value = suppressSensitiveSyncFailure(
    "SG1 transaction value validation failed; sensitive details suppressed.",
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
      throw new Error("SG1 EIP-1559 fee-data validation failed; sensitive details suppressed.");
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
    throw new Error("SG1 fee-data validation failed; sensitive details suppressed.");
  }

  const estimatedGas = await suppressSensitiveFailure(
    "SG1 gas estimation failed; sensitive details suppressed.",
    async () => hre.ethers.provider.estimateGas(requestForEstimation),
  );
  const gasLimit = bufferedGasLimit(estimatedGas);
  const signableRequest = { ...requestForEstimation, gasLimit };
  delete signableRequest.from;

  return {
    feeCeilingPerGas,
    signableRequest,
  };
}

async function requireSufficientFunding(
  hre: HardhatRuntimeEnvironment,
  signerAddress: string,
  preparedTransaction: PreparedTransaction,
  fundingMultiplier = 1n,
): Promise<void> {
  const balance = await suppressSensitiveFailure(
    "SG1 balance request failed; sensitive details suppressed.",
    async () => hre.ethers.provider.getBalance(signerAddress),
  );
  const requiredBalance = suppressSensitiveSyncFailure(
    "SG1 funding calculation failed; sensitive details suppressed.",
    () => {
      const gasLimit = hre.ethers.toBigInt(preparedTransaction.signableRequest.gasLimit ?? 0n);
      const value = hre.ethers.toBigInt(preparedTransaction.signableRequest.value ?? 0n);
      return (gasLimit * preparedTransaction.feeCeilingPerGas + value) * fundingMultiplier;
    },
  );
  if (balance < requiredBalance) {
    throw new Error("SG1 funding check failed; sensitive details suppressed.");
  }
}

function requireValidTransactionHash(hre: HardhatRuntimeEnvironment, transactionHash: string): void {
  if (!hre.ethers.isHexString(transactionHash, 32)) {
    throw new Error("SG1 transaction hash validation failed; sensitive details suppressed.");
  }
}

async function signExactTransaction(
  hre: HardhatRuntimeEnvironment,
  wallet: Wallet,
  request: TransactionRequest,
): Promise<{ expectedHash: string; signedTransaction: string }> {
  const requiredFields = suppressSensitiveSyncFailure(
    "SG1 signable transaction validation failed; sensitive details suppressed.",
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

      return {
        data: request.data,
        nonce: hre.ethers.toNumber(request.nonce),
        type,
      };
    },
  );
  const signedTransaction = await suppressSensitiveFailure(
    "SG1 transaction signing failed; sensitive details suppressed.",
    async () => wallet.signTransaction(request),
  );
  const expectedHash = suppressSensitiveSyncFailure(
    "SG1 signed transaction validation failed; sensitive details suppressed.",
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
    throw new Error("SG1 transaction broadcast failed; sensitive details suppressed.");
  }
  if (typeof result !== "string") {
    throw new Error("SG1 transaction broadcast hash validation failed; sensitive details suppressed.");
  }
  requireValidTransactionHash(hre, result);
  if (result.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error("SG1 transaction broadcast hash mismatch; sensitive details suppressed.");
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
    throw new Error("SG1 transaction receipt block number is invalid; sensitive details suppressed.");
  }
}

async function pollForTransactionReceipt(
  hre: HardhatRuntimeEnvironment,
  transactionHash: string,
): Promise<TransactionReceipt> {
  // Poll for at most ten minutes (120 attempts, five seconds apart); never delegate polling to a signer.
  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt += 1) {
    let receipt: TransactionReceipt | null;
    try {
      receipt = await hre.ethers.provider.getTransactionReceipt(transactionHash);
    } catch {
      throw new Error("SG1 transaction receipt request failed; sensitive details suppressed.");
    }

    if (receipt !== null) {
      requireValidReceiptBlockNumber(receipt.blockNumber);
      requireValidTransactionHash(hre, receipt.hash);
      if (receipt.hash.toLowerCase() !== transactionHash.toLowerCase()) {
        throw new Error("SG1 transaction receipt hash mismatch; sensitive details suppressed.");
      }
      return receipt;
    }

    if (attempt + 1 < RECEIPT_POLL_ATTEMPTS) {
      await localDelay(RECEIPT_POLL_INTERVAL_MILLISECONDS);
    }
  }

  throw new Error("SG1 transaction receipt timed out; sensitive details suppressed.");
}

async function requireDeployedCode(hre: HardhatRuntimeEnvironment, contractAddress: string): Promise<void> {
  const deployedCode = await suppressSensitiveFailure(
    "SG1 deployed-code read failed; sensitive details suppressed.",
    async () => hre.ethers.provider.getCode(contractAddress),
  );
  if (deployedCode === "0x") {
    throw new Error("SG1 deployed-code validation failed; sensitive details suppressed.");
  }
}

function emitPublicMetadata(metadata: Record<string, unknown>): void {
  console.log(JSON.stringify(metadata));
}

task("sg1:preflight", "Performs the non-mutating SG-1 Sepolia capability preflight").setAction(async function (
  _taskArguments: TaskArguments,
  hre,
) {
  requireSepoliaTaskNetwork(hre);
  // Fail closed on missing credentials before Hardhat can initialize a provider for this negative-checkable task.
  void readValidatedPrivateKey();
  const context = await createLiveContext(hre);
  const factory = await suppressSensitiveFailure(
    "SG1 contract factory setup failed; sensitive details suppressed.",
    async () => hre.ethers.getContractFactory("FHECounter", context.signer),
  );
  const deploymentRequest = await suppressSensitiveFailure(
    "SG1 deployment transaction preparation failed; sensitive details suppressed.",
    async () => factory.getDeployTransaction(),
  );
  const preparedTransaction = await prepareExactTransaction(hre, context.signerAddress, deploymentRequest);
  await requireSufficientFunding(hre, context.signerAddress, preparedTransaction, PREFLIGHT_FUNDING_MULTIPLIER);

  emitPublicMetadata({
    event: "sg1-preflight",
    utcTimestamp: new Date().toISOString(),
    gitCommit: context.gitCommit,
    gitTree: context.gitTree,
    chainId: Number(context.chainId),
    signerAddress: context.signerAddress,
    fundingCheck: "PASS",
    packageVersions: context.packageVersions,
    pnpmLockSha256: context.pnpmLockSha256,
  });
});

task("sg1:deploy", "Deploys a fresh temporary SG-1 FHECounter directly with Ethers").setAction(async function (
  _taskArguments: TaskArguments,
  hre,
) {
  const context = await createLiveContext(hre);
  const factory = await suppressSensitiveFailure(
    "SG1 contract factory setup failed; sensitive details suppressed.",
    async () => hre.ethers.getContractFactory("FHECounter", context.signer),
  );
  const deploymentRequest = await suppressSensitiveFailure(
    "SG1 deployment transaction preparation failed; sensitive details suppressed.",
    async () => factory.getDeployTransaction(),
  );
  const preparedTransaction = await prepareExactTransaction(hre, context.signerAddress, deploymentRequest);
  await requireSufficientFunding(hre, context.signerAddress, preparedTransaction);

  const pendingNonce = preparedTransaction.signableRequest.nonce;
  if (pendingNonce === null || pendingNonce === undefined) {
    throw new Error("SG1 pending nonce validation failed; sensitive details suppressed.");
  }
  const expectedContractAddress = suppressSensitiveSyncFailure(
    "SG1 expected contract address calculation failed; sensitive details suppressed.",
    () => hre.ethers.getCreateAddress({ from: context.signerAddress, nonce: pendingNonce }),
  );

  await readSepoliaChainId(hre);
  const utcTimestamp = new Date().toISOString();
  const { expectedHash, signedTransaction } = await signExactTransaction(
    hre,
    context.wallet,
    preparedTransaction.signableRequest,
  );
  // Invariant: commit and tree are compared first and cleanliness is sampled last; no asynchronous or
  // external operation may occur between the final clean result and this raw broadcast.
  requireRepositoryIdentityUnchanged(context);
  const deploymentTransactionHash = await broadcastSignedTransaction(hre, signedTransaction, expectedHash);
  const receipt = await pollForTransactionReceipt(hre, deploymentTransactionHash);
  if (receipt.status !== 1) {
    throw new Error("SG1 deployment receipt status failed; sensitive details suppressed.");
  }
  if (receipt.to !== null) {
    throw new Error("SG1 deployment receipt target validation failed; sensitive details suppressed.");
  }
  if (receipt.contractAddress === null) {
    throw new Error("SG1 deployment receipt contract address missing; sensitive details suppressed.");
  }
  if (receipt.contractAddress.toLowerCase() !== expectedContractAddress.toLowerCase()) {
    throw new Error("SG1 deployment receipt contract address mismatch; sensitive details suppressed.");
  }

  const contractAddress = hre.ethers.getAddress(receipt.contractAddress);
  await requireDeployedCode(hre, contractAddress);
  const finalChainId = await readSepoliaChainId(hre);

  emitPublicMetadata({
    event: "sg1-deployment",
    utcTimestamp,
    gitCommit: context.gitCommit,
    gitTree: context.gitTree,
    packageVersions: context.packageVersions,
    pnpmLockSha256: context.pnpmLockSha256,
    chainId: Number(finalChainId),
    deployerAddress: context.signerAddress,
    contractAddress,
    deploymentTransactionHash,
    deploymentBlockNumber: receipt.blockNumber,
  });
});

task("sg1:probe", "Runs the encrypted-write and authorized user-decryption SG-1 probe")
  .addParam("address", "Fresh FHECounter contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    requireSepoliaTaskNetwork(hre);
    if (typeof taskArguments.address !== "string" || !hre.ethers.isAddress(taskArguments.address)) {
      throw new Error("SG1 contract address validation failed; sensitive details suppressed.");
    }
    const contractAddress = hre.ethers.getAddress(taskArguments.address);
    const context = await createLiveContext(hre);
    await requireDeployedCode(hre, contractAddress);

    const contract = await suppressSensitiveFailure(
      "SG1 contract setup failed; sensitive details suppressed.",
      async () => hre.ethers.getContractAt("FHECounter", contractAddress, context.signer) as Promise<FHECounter>,
    );
    const encryptedCountBeforeIncrement = await suppressSensitiveFailure(
      "SG1 encrypted-state read failed; sensitive details suppressed.",
      async () => contract.getCount(),
    );
    if (encryptedCountBeforeIncrement !== hre.ethers.ZeroHash) {
      throw new Error("SG1 counter is already initialized; sensitive details suppressed.");
    }

    await suppressSensitiveFailure("SG1 encryption initialization failed; sensitive details suppressed.", async () =>
      hre.fhevm.initializeCLIApi(),
    );
    const encryptedOne = await suppressSensitiveFailure(
      "SG1 encrypted input creation failed; sensitive details suppressed.",
      async () => hre.fhevm.createEncryptedInput(contractAddress, context.signerAddress).add32(1).encrypt(),
    );
    if (encryptedOne.handles.length !== 1 || encryptedOne.handles[0] === undefined) {
      throw new Error("SG1 encrypted input validation failed; sensitive details suppressed.");
    }

    const incrementRequest = await suppressSensitiveFailure(
      "SG1 increment transaction preparation failed; sensitive details suppressed.",
      async () => contract.increment.populateTransaction(encryptedOne.handles[0], encryptedOne.inputProof),
    );
    const preparedTransaction = await prepareExactTransaction(hre, context.signerAddress, incrementRequest);
    await requireSufficientFunding(hre, context.signerAddress, preparedTransaction);
    await readSepoliaChainId(hre);

    if (
      preparedTransaction.signableRequest.to === null ||
      preparedTransaction.signableRequest.to === undefined ||
      String(preparedTransaction.signableRequest.to).toLowerCase() !== contractAddress.toLowerCase()
    ) {
      throw new Error("SG1 increment transaction destination mismatch; sensitive details suppressed.");
    }
    const utcTimestamp = new Date().toISOString();
    const encryptedCountBeforeSigning = await suppressSensitiveFailure(
      "SG1 encrypted-state read failed; sensitive details suppressed.",
      async () => contract.getCount(),
    );
    if (encryptedCountBeforeSigning !== hre.ethers.ZeroHash) {
      throw new Error("SG1 probe state changed before signing; transaction not submitted.");
    }
    const { expectedHash, signedTransaction } = await signExactTransaction(
      hre,
      context.wallet,
      preparedTransaction.signableRequest,
    );
    // Invariant: commit and tree are compared first and cleanliness is sampled last; no asynchronous or
    // external operation may occur between the final clean result and this raw broadcast.
    requireRepositoryIdentityUnchanged(context);
    const incrementTransactionHash = await broadcastSignedTransaction(hre, signedTransaction, expectedHash);
    const receipt = await pollForTransactionReceipt(hre, incrementTransactionHash);
    if (receipt.status !== 1) {
      throw new Error("SG1 increment receipt status failed; sensitive details suppressed.");
    }
    if (receipt.to === null || receipt.to.toLowerCase() !== contractAddress.toLowerCase()) {
      throw new Error("SG1 increment receipt target mismatch; sensitive details suppressed.");
    }
    await requireDeployedCode(hre, contractAddress);
    const finalChainId = await readSepoliaChainId(hre);

    const encryptedCountAfterIncrement = await suppressSensitiveFailure(
      "SG1 encrypted-state read failed; sensitive details suppressed.",
      async () => contract.getCount(),
    );
    if (encryptedCountAfterIncrement === hre.ethers.ZeroHash) {
      throw new Error("SG1 encrypted-state validation failed; sensitive details suppressed.");
    }
    const decryptedResult = await suppressSensitiveFailure(
      "SG1 user decryption failed; sensitive details suppressed.",
      async () =>
        hre.fhevm.userDecryptEuint(FhevmType.euint32, encryptedCountAfterIncrement, contractAddress, context.signer),
    );
    if (decryptedResult !== 1n) {
      throw new Error("SG1 decrypted result validation failed; sensitive details suppressed.");
    }

    emitPublicMetadata({
      event: "sg1-probe",
      utcTimestamp,
      gitCommit: context.gitCommit,
      gitTree: context.gitTree,
      packageVersions: context.packageVersions,
      pnpmLockSha256: context.pnpmLockSha256,
      chainId: Number(finalChainId),
      probeAddress: context.signerAddress,
      contractAddress,
      incrementTransactionHash,
      incrementBlockNumber: receipt.blockNumber,
      decryptedResult: 1,
    });
  });
