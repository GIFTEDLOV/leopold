import { ethers, fhevm } from "hardhat";
import type { ContractTransactionResponse, Interface } from "ethers";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  HCU_DEPTH_SAFETY_THRESHOLD,
  HCU_TRANSACTION_DEPTH_CEILING,
  HCU_TOTAL_SAFETY_THRESHOLD,
  HCU_TRANSACTION_TOTAL_CEILING,
  deriveProtocol,
  serializeProtocol,
  type Protocol,
} from "./sg4-protocol";
import { deriveDomainAnalysis } from "./sg3-domain";

const ROOT = resolve(__dirname, "..");
const EVIDENCE_PATH = resolve(ROOT, "evidence/sg4/SG4_RANDOMNESS_BENCHMARK.json");
const PARTIAL_EVIDENCE_PATH = resolve(ROOT, "evidence/sg4/SG4_RANDOMNESS_BENCHMARK.partial.json");
const SIDECAR_PATH = `${EVIDENCE_PATH}.sha256`;
const SOURCE_PATH = resolve(ROOT, "contracts/benchmarks/SG4FheBenchmarkHarness.sol");
const ARTIFACT_PATH = resolve(
  ROOT,
  "artifacts/contracts/benchmarks/SG4FheBenchmarkHarness.sol/SG4FheBenchmarkHarness.json",
);
const BINDING_PATH = resolve(ROOT, "scripts/sg4-hcu-authority-binding.json");

const EXPECTED_PROTOCOL_DIGEST = "88d6f8c1522a0668d769f34ddafaf3e71134cbc9434a1b9676f78d5bdeb0968e";
const EXPECTED_AUTHORITY_DIGEST = "53fabb080c608c1224faa8435a1fbd548ca316806d554fcc8e92b730d8cfea2b";
const EXPECTED_CHAIN_ID = 11155111n;
const WINDOW_IDS = ["WINDOW_1", "WINDOW_2", "WINDOW_3"] as const;
const WIDTHS = ["64", "128", "256"] as const;
const METHODS: Record<string, "rng64" | "rng128" | "rng256"> = {
  RNG_64: "rng64",
  RNG_128: "rng128",
  RNG_256: "rng256",
};

type Width = (typeof WIDTHS)[number];
type SampleRecord = Record<string, unknown> & {
  circuitId: string;
  width: Width;
  classification: "WARMUP" | "MEASURED";
  windowId: string;
  runId: string;
  transactionHash: string;
  status: number;
  hcuConsumed: number;
  hcuDepthConsumed: number;
  gasUsed: string;
  submissionToReceiptMilliseconds: number;
};

type BenchmarkEvidence = {
  schema: "zama-szn4.sg4-randomness-benchmark.v1";
  status: string;
  protocol: Record<string, unknown>;
  git: Record<string, unknown>;
  environment: Record<string, unknown>;
  source: Record<string, unknown>;
  staticHcu: {
    source: string;
    ceilings: Record<string, bigint>;
    additionalFheOperations: string;
    predicted: Record<Width, { operation: string; resultType: string; hcu: number; depth: number; totalHcu: number }>;
  };
  deployment: Record<string, unknown> | null;
  executionWindows: Array<Record<string, unknown>>;
  rawSamples: SampleRecord[];
  failures: Array<Record<string, unknown>>;
  aclAudit: Record<string, unknown>;
  [key: string]: unknown;
};

function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, (_, child) => (typeof child === "bigint" ? child.toString(10) : child), 2)}\n`;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, jsonText(value), "utf8");
}

function utcFromUnixSeconds(seconds: number | bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

function blockRecord(block: Awaited<ReturnType<typeof ethers.provider.getBlock>>) {
  if (block === null) throw new Error("required block was unavailable");
  return {
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
    timestampUtc: utcFromUnixSeconds(block.timestamp),
    gasLimit: block.gasLimit.toString(),
  };
}

function digestProtocol(): string {
  return sha256Bytes(serializeProtocol());
}

function packageVersion(name: string): string {
  const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name] ?? "UNKNOWN";
}

function safeErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/revert|execution|custom error|status 0/iu.test(message)) return "CONTRACT_REVERT";
  if (/FHE|coprocessor|HCU/iu.test(message)) return "FHE_FAILURE";
  if (/timeout|network|RPC|provider/iu.test(message)) return "API_FAILURE";
  return "API_FAILURE";
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/[^\s)]+/giu, "RPC_ENDPOINT_REDACTED")
    .replace(/0x[0-9a-f]{64}/giu, "HASH_REDACTED")
    .replace(/private.?key|mnemonic|secret/giu, "CREDENTIAL_REDACTED");
}

function percentile(values: readonly number[], fraction: number): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}

function summarize(samples: readonly SampleRecord[]) {
  const measured = samples.filter((sample) => sample.classification === "MEASURED");
  const hcu = measured.map((sample) => BigInt(sample.hcuConsumed));
  const depth = measured.map((sample) => BigInt(sample.hcuDepthConsumed));
  const gas = measured.map((sample) => BigInt(sample.gasUsed));
  const latency = measured.map((sample) => sample.submissionToReceiptMilliseconds);
  const exact = (values: readonly bigint[]) => ({
    minimum: values.length === 0 ? null : values.reduce((a, b) => (a < b ? a : b)).toString(),
    maximum: values.length === 0 ? null : values.reduce((a, b) => (a > b ? a : b)).toString(),
    sum: values.reduce((a, b) => a + b, 0n).toString(),
    count: values.length.toString(),
  });
  const descriptive = (values: readonly number[]) => ({
    minimum: values.length === 0 ? null : Math.min(...values),
    median: values.length === 0 ? null : percentile(values, 0.5),
    p90: values.length === 0 ? null : percentile(values, 0.9),
    maximum: values.length === 0 ? null : Math.max(...values),
    mean: values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length,
  });
  return {
    sampleCount: measured.length,
    successfulCount: measured.filter((sample) => sample.status === 1).length,
    failedCount: measured.filter((sample) => sample.status !== 1).length,
    hcu: exact(hcu),
    hcuDepth: exact(depth),
    gasUsed: exact(gas),
    latencyMilliseconds: descriptive(latency),
  };
}

function initialEvidence(protocol: Protocol, chainId: bigint, startingBlock: number): BenchmarkEvidence {
  const binding = JSON.parse(readFileSync(BINDING_PATH, "utf8")) as {
    lineage: { authorityProtocolSha256: string; benchmarkProtocolSha256: string };
  };
  const protocolDigest = digestProtocol();
  if (protocolDigest !== EXPECTED_PROTOCOL_DIGEST) throw new Error("preregistered benchmark protocol digest mismatch");
  if (binding.lineage.benchmarkProtocolSha256 !== EXPECTED_PROTOCOL_DIGEST) {
    throw new Error("SG-4 binding benchmark protocol digest mismatch");
  }
  if (binding.lineage.authorityProtocolSha256 !== EXPECTED_AUTHORITY_DIGEST) {
    throw new Error("SG-4 binding authority protocol digest mismatch");
  }
  if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`unexpected chain id ${chainId.toString()}`);
  return {
    schema: "zama-szn4.sg4-randomness-benchmark.v1",
    status: "RUNNING",
    capturedAtUtc: new Date().toISOString(),
    protocol: {
      protocolVersion: protocol.protocolVersion,
      protocolDigest,
      authorityProtocolDigest: binding.lineage.authorityProtocolSha256,
      subset: "RNG_64/RNG_128/RNG_256 primitive rows only",
      exactPlanRows: 36,
      measuredRows: 30,
      warmupRows: 6,
      windows: WINDOW_IDS,
      windowMinimumConfirmedBlockSeparation: "20",
      warmupsRecordedButExcluded: true,
      noOutlierRemoval: true,
      individualRetryPolicy: "FORBIDDEN",
    },
    git: {
      commit: git(["rev-parse", "HEAD"]),
      tree: git(["rev-parse", "HEAD^{tree}"]),
      parent: git(["rev-parse", "HEAD^"]),
      startingBlock,
    },
    environment: {
      chainId: chainId.toString(),
      fhevmSolidity: packageVersion("@fhevm/solidity"),
      fhevmHardhatPlugin: packageVersion("@fhevm/hardhat-plugin"),
      relayerSdk: packageVersion("@zama-fhe/relayer-sdk"),
      hardhat: packageVersion("hardhat"),
      ethers: packageVersion("ethers"),
      compiler: "0.8.27",
      rpcUrlRecorded: false,
      rpcMethods: [
        "eth_chainId",
        "eth_blockNumber",
        "eth_getBlockByNumber",
        "eth_getCode",
        "eth_estimateGas",
        "eth_getTransactionCount",
        "eth_sendRawTransaction",
        "eth_getTransactionReceipt",
        "eth_gasPrice",
      ],
      stateChangingMethodAuthorized: "eth_sendRawTransaction",
    },
    source: {
      harnessPath: "contracts/benchmarks/SG4FheBenchmarkHarness.sol",
      harnessSha256: sha256File(SOURCE_PATH),
      artifactPath: "artifacts/contracts/benchmarks/SG4FheBenchmarkHarness.sol/SG4FheBenchmarkHarness.json",
      artifactSha256: sha256File(ARTIFACT_PATH),
      apiAuthority: "installed pinned @fhevm/solidity 0.11.1; no dependency upgrade",
    },
    staticHcu: {
      source: "SG-4 authenticated operation schedule / receipt calculator",
      ceilings: {
        transactionTotal: HCU_TRANSACTION_TOTAL_CEILING,
        transactionDepth: HCU_TRANSACTION_DEPTH_CEILING,
        totalSafetyThreshold: HCU_TOTAL_SAFETY_THRESHOLD,
        depthSafetyThreshold: HCU_DEPTH_SAFETY_THRESHOLD,
      },
      additionalFheOperations: "none; FHE.allowThis is ACL bookkeeping and not HCU-priced",
      predicted: {
        "64": { operation: "FheRand", resultType: "euint64", hcu: 24000, depth: 24000, totalHcu: 24000 },
        "128": { operation: "FheRand", resultType: "euint128", hcu: 25000, depth: 25000, totalHcu: 25000 },
        "256": { operation: "FheRand", resultType: "euint256", hcu: 30000, depth: 30000, totalHcu: 30000 },
      },
    },
    widthAnalysis: deriveDomainAnalysis(),
    retryAttackReview: {
      oneActiveCandidate: true,
      confirmedValidCandidateImmutable: true,
      externalRerollers: false,
      callerControlledSeed: false,
      failedTransactionFavorableResultOracle: false,
      encryptedTicketHumanDecryptable: false,
      productionWinnerSelectionImplemented: false,
    },
    architectureDecision: {
      selectedWidth: "euint128",
      rule: "smallest width that is mathematically TWAB-safe and has the complete unbiased encrypted ticket API",
      euint64: "UNSAFE",
      euint128: "SAFE",
      euint256: "UNSAFE_FOR_PRODUCTION_FLOW_WITH_PINNED_API",
    },
    deployment: null,
    executionWindows: [],
    rawSamples: [],
    failures: [],
    aclAudit: {
      randomTicketHumanDecryptable: false,
      publicDecryptCallsInRngMethods: false,
      callerAclCallsInRngMethods: false,
      adminAclCallsInRngMethods: false,
      keeperAclCallsInRngMethods: false,
      persistedOnlyWithFHEAllowThis: true,
      noCallerControlledSeed: true,
    },
  };
}

function persist(evidence: BenchmarkEvidence): void {
  writeJson(PARTIAL_EVIDENCE_PATH, evidence);
}

async function waitUntilBlock(provider: typeof ethers.provider, target: number): Promise<number> {
  for (;;) {
    const current = await provider.getBlockNumber();
    if (current >= target) return current;
    console.log(`WAITING_FOR_WINDOW_SEPARATION current=${current} target=${target}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000));
  }
}

async function main(): Promise<void> {
  const protocol = deriveProtocol();
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  const chainId = network.chainId;
  const startingBlock = await provider.getBlockNumber();
  const evidence = initialEvidence(protocol, chainId, startingBlock);
  persist(evidence);

  await fhevm.initializeCLIApi();
  const [operator] = await ethers.getSigners();
  const operatorAddress = await operator.getAddress();
  console.log(`CHAIN_ID=${chainId.toString()}`);
  console.log(`OPERATOR=${operatorAddress}`);
  console.log(`STARTING_BLOCK=${startingBlock}`);
  console.log("DEPLOYING_BENCHMARK_HARNESS");

  const factory = await ethers.getContractFactory("SG4FheBenchmarkHarness", operator);
  const contract = await factory.deploy();
  const deploymentTransaction = contract.deploymentTransaction();
  if (deploymentTransaction === null) throw new Error("deployment transaction unavailable");
  const deploymentReceipt = await deploymentTransaction.wait();
  if (deploymentReceipt === null || deploymentReceipt.status !== 1) throw new Error("benchmark deployment failed");
  const deployedAddress = await contract.getAddress();
  const deployedCode = await provider.getCode(deployedAddress);
  const deploymentBlock = await provider.getBlock(deploymentReceipt.blockNumber);
  if (deploymentCodeIsEmpty(deployedCode) || deploymentBlock === null)
    throw new Error("deployed harness code unavailable");
  evidence.deployment = {
    chainId: chainId.toString(),
    deployer: operatorAddress,
    transactionHash: deploymentReceipt.hash,
    block: blockRecord(deploymentBlock),
    contractAddress: deployedAddress,
    runtimeByteLength: (deployedCode.length - 2) / 2,
    runtimeSha256: sha256Bytes(deployedCode),
    gasUsed: deploymentReceipt.gasUsed.toString(),
    effectiveGasPrice: deploymentReceipt.gasPrice.toString(),
    feeWei: (deploymentReceipt.gasUsed * deploymentReceipt.gasPrice).toString(),
    sourceSha256: sha256File(SOURCE_PATH),
    artifactSha256: sha256File(ARTIFACT_PATH),
    excludedFromMeasuredSamples: true,
  };
  persist(evidence);
  console.log(`HARNESS_ADDRESS=${deployedAddress}`);
  console.log(`DEPLOYMENT_TX=${deploymentReceipt.hash}`);
  console.log(`DEPLOYMENT_BLOCK=${deploymentReceipt.blockNumber}`);

  let globalRunSequence = 0;
  let previousWindowLastBlock: number | null = null;
  let currentWindow: string | null = null;
  let currentWindowSamples: SampleRecord[] = [];

  type RngRun = {
    circuitId: string;
    vectorId: string;
    windowId: string;
    classification: "WARMUP" | "MEASURED";
    repetitionIndex: string;
    runId: string;
  };
  const rngRuns = (protocol.runPlan as unknown as RngRun[]).filter((candidate) => candidate.circuitId in METHODS);
  for (const run of rngRuns) {
    if (currentWindow !== run.windowId) {
      if (currentWindow !== null) {
        const lastBlock = currentWindowSamples.reduce((max, sample) => Math.max(max, Number(sample.blockNumber)), 0);
        evidence.executionWindows.push({
          windowId: currentWindow,
          firstBlock: Math.min(...currentWindowSamples.map((sample) => Number(sample.blockNumber))),
          lastBlock,
          sampleIds: currentWindowSamples.map((sample) => sample.recordId),
          status: "COMPLETE",
        });
        previousWindowLastBlock = lastBlock;
        currentWindowSamples = [];
        persist(evidence);
      }
      currentWindow = run.windowId;
      if (previousWindowLastBlock !== null) {
        await waitUntilBlock(provider, previousWindowLastBlock + 20);
      }
    }

    const method = METHODS[run.circuitId];
    const width = run.circuitId.slice("RNG_".length) as Width;
    const submissionTimestamp = new Date().toISOString();
    const submissionTime = Date.now();
    const submittedBlockNumber = await provider.getBlockNumber();
    const functionFragment = contract.interface.getFunction(method);
    if (functionFragment === null) throw new Error(`benchmark method ${method} missing from ABI`);
    const calldata = (contract.interface as unknown as Interface).encodeFunctionData(functionFragment, [
      globalRunSequence,
    ]);
    const predicted = (
      evidence.staticHcu as {
        predicted: Record<
          Width,
          { operation: string; resultType: string; hcu: number; depth: number; totalHcu: number }
        >;
      }
    ).predicted[width];
    console.log(`SUBMIT ${run.runId} sequence=${globalRunSequence}`);

    try {
      const callable = (
        contract as unknown as Record<string, (sequence: number) => Promise<ContractTransactionResponse>>
      )[method];
      const transaction = await callable(globalRunSequence);
      const receipt = await transaction.wait();
      if (receipt === null) throw new Error("transaction receipt unavailable");
      if (receipt.status !== 1) throw new Error("benchmark transaction reverted");
      const receiptBlock = await provider.getBlock(receipt.blockNumber);
      if (receiptBlock === null) throw new Error("receipt block unavailable");
      const hcu = fhevm.computeTransactionHCU(receipt);
      const coprocessorEvents = fhevm.parseCoprocessorEvents(receipt.logs);
      const eventNames = coprocessorEvents.map((event) => event.eventName);
      const randEvents = eventNames.filter((name) => name === "FheRand").length;
      const unexpectedEvents = eventNames.filter((name) => name !== "FheRand");
      const circuitEvent = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "CircuitCompleted");
      const completed = circuitEvent?.args?.completed === true;
      if (randEvents !== 1 || unexpectedEvents.length !== 0 || !completed) {
        throw new Error("benchmark receipt did not contain exactly one FheRand and one completed circuit event");
      }
      const assessment = {
        total: hcu.globalHCU < Number(HCU_TOTAL_SAFETY_THRESHOLD) ? "PASS" : "FAIL",
        depth: hcu.maxHCUDepth < Number(HCU_DEPTH_SAFETY_THRESHOLD) ? "PASS" : "FAIL",
        combined:
          hcu.globalHCU < Number(HCU_TOTAL_SAFETY_THRESHOLD) && hcu.maxHCUDepth < Number(HCU_DEPTH_SAFETY_THRESHOLD)
            ? "GO"
            : "NO_GO",
      };
      const sample: SampleRecord = {
        recordId: `sample-${run.windowId}-${run.circuitId}-${run.classification}-${run.repetitionIndex}`,
        protocolVersion: protocol.protocolVersion,
        protocolDigest: digestProtocol(),
        circuitId: run.circuitId,
        vectorId: run.vectorId,
        width,
        method,
        windowId: run.windowId,
        runId: run.runId,
        classification: run.classification,
        repetitionIndex: run.repetitionIndex,
        globalRunSequence,
        transactionHash: receipt.hash,
        submittedBlockNumber,
        blockNumber: receipt.blockNumber,
        blockHash: receiptBlock.hash,
        blockTimestamp: receiptBlock.timestamp,
        blockTimestampUtc: utcFromUnixSeconds(receiptBlock.timestamp),
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.gasPrice.toString(),
        feeWei: (receipt.gasUsed * receipt.gasPrice).toString(),
        calldataByteLength: (calldata.length - 2) / 2,
        currentBlockGasLimit: receiptBlock.gasLimit.toString(),
        submissionTimestamp,
        receiptTimestamp: new Date().toISOString(),
        submissionToReceiptMilliseconds: Date.now() - submissionTime,
        hcuConsumed: hcu.globalHCU,
        hcuDepthConsumed: hcu.maxHCUDepth,
        hcuSource: "hre.fhevm.computeTransactionHCU(receipt)",
        hcuEvents: { FheRand: randEvents },
        predictedHcu: predicted.hcu,
        predictedDepth: predicted.depth,
        hcuPredictionMatches: hcu.globalHCU === predicted.totalHcu && hcu.maxHCUDepth === predicted.depth,
        authoritativeHcuCeiling: HCU_TRANSACTION_TOTAL_CEILING,
        authoritativeHcuDepthCeiling: HCU_TRANSACTION_DEPTH_CEILING,
        totalSafetyThreshold: HCU_TOTAL_SAFETY_THRESHOLD,
        depthSafetyThreshold: HCU_DEPTH_SAFETY_THRESHOLD,
        totalSafetyResult: assessment.total,
        depthSafetyResult: assessment.depth,
        combinedHcuVerdict: assessment.combined,
        postStateVerification: "CircuitCompleted.completed=true; encrypted result not decrypted",
        postStateCorrect: true,
        retryCount: 0,
      };
      evidence.rawSamples.push(sample);
      currentWindowSamples.push(sample);
      globalRunSequence += 1;
      persist(evidence);
      console.log(`PASS ${run.runId} tx=${receipt.hash} hcu=${hcu.globalHCU} depth=${hcu.maxHCUDepth}`);
    } catch (error) {
      const failure = {
        recordId: `failure-${run.windowId}-${run.circuitId}-${run.classification}-${run.repetitionIndex}`,
        runId: run.runId,
        circuitId: run.circuitId,
        width,
        windowId: run.windowId,
        category: safeErrorCategory(error),
        sanitizedMessage: safeErrorMessage(error),
        retryCount: 0,
        individualRetryForbidden: true,
      };
      evidence.failures.push(failure);
      evidence.status = "FAILED";
      persist(evidence);
      throw error;
    }
  }

  if (currentWindow !== null && currentWindowSamples.length > 0) {
    evidence.executionWindows.push({
      windowId: currentWindow,
      firstBlock: Math.min(...currentWindowSamples.map((sample) => Number(sample.blockNumber))),
      lastBlock: Math.max(...currentWindowSamples.map((sample) => Number(sample.blockNumber))),
      sampleIds: currentWindowSamples.map((sample) => sample.recordId),
      status: "COMPLETE",
    });
  }

  const perWidth = Object.fromEntries(
    WIDTHS.map((width) => [width, summarize(evidence.rawSamples.filter((sample) => sample.width === width))]),
  );
  evidence.summaries = perWidth;
  evidence.counts = {
    exactRows: evidence.rawSamples.length,
    measuredRows: evidence.rawSamples.filter((sample) => sample.classification === "MEASURED").length,
    warmupRows: evidence.rawSamples.filter((sample) => sample.classification === "WARMUP").length,
    uniqueTransactions: new Set(evidence.rawSamples.map((sample) => sample.transactionHash)).size,
    failures: evidence.failures.length,
  };
  evidence.status = evidence.failures.length === 0 ? "PASSED" : "FAILED";
  evidence.protocolDigestRecomputedAtCompletion = digestProtocol();
  evidence.completedAtUtc = new Date().toISOString();
  writeJson(EVIDENCE_PATH, evidence);
  writeFileSync(SIDECAR_PATH, `${sha256File(EVIDENCE_PATH)}  ${EVIDENCE_PATH.split("/").pop()}\n`, "utf8");
  unlinkSync(PARTIAL_EVIDENCE_PATH);
  console.log(`EVIDENCE=${EVIDENCE_PATH}`);
  console.log(`EVIDENCE_SHA256=${sha256File(EVIDENCE_PATH)}`);
  console.log(`STATUS=${evidence.status}`);
}

function deploymentCodeIsEmpty(code: string): boolean {
  return code === "0x" || code === "0x0";
}

main().catch((error) => {
  console.error(`BENCHMARK_FAILED ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
