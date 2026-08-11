import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ethers, fhevm, network } from "hardhat";

import type { ContractTransactionResponse, TransactionReceipt } from "ethers";
import type { LeopoldSelectorHcuHarness } from "../types";

type Measurement = {
  circuit: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  status: number;
  gasUsed: string;
  globalHCU: number;
  maxHCUDepth: number;
};

const OUTPUT = path.resolve("evidence/cp1/LEOPOLD_SELECTOR_HCU_LIVE.json");
const SOURCE = path.resolve("contracts/benchmarks/LeopoldSelectorHcuHarness.sol");
const ARTIFACT = path.resolve(
  "artifacts/contracts/benchmarks/LeopoldSelectorHcuHarness.sol/LeopoldSelectorHcuHarness.json",
);

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function measured(circuit: string, submit: () => Promise<ContractTransactionResponse>): Promise<Measurement> {
  process.stdout.write(`SUBMIT ${circuit}\n`);
  const transaction = await submit();
  const receipt = await transaction.wait();
  if (receipt === null || receipt.status !== 1) throw new Error(`${circuit} transaction failed`);
  const block = await ethers.provider.getBlock(receipt.blockNumber);
  if (block === null || block.hash === null) throw new Error(`${circuit} receipt block unavailable`);
  const hcu = fhevm.computeTransactionHCU(receipt);
  return {
    circuit,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: block.hash,
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    globalHCU: hcu.globalHCU,
    maxHCUDepth: hcu.maxHCUDepth,
  };
}

async function receiptRecord(circuit: string, receipt: TransactionReceipt): Promise<Measurement> {
  const block = await ethers.provider.getBlock(receipt.blockNumber);
  if (block === null || block.hash === null) throw new Error(`${circuit} receipt block unavailable`);
  const hcu = fhevm.computeTransactionHCU(receipt);
  return {
    circuit,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: block.hash,
    status: receipt.status ?? 0,
    gasUsed: receipt.gasUsed.toString(),
    globalHCU: hcu.globalHCU,
    maxHCUDepth: hcu.maxHCUDepth,
  };
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("live selector HCU script requires --network sepolia");
  await fhevm.initializeCLIApi();
  const [operator] = await ethers.getSigners();
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== 11_155_111n) throw new Error("unexpected chain");
  const balance = await ethers.provider.getBalance(operator.address);
  if (balance === 0n) throw new Error("configured benchmark account has no Sepolia ETH");

  const factory = await ethers.getContractFactory("LeopoldSelectorHcuHarness", operator);
  const harness = (await factory.deploy()) as LeopoldSelectorHcuHarness;
  const deployment = harness.deploymentTransaction();
  if (deployment === null) throw new Error("deployment transaction missing");
  const deploymentReceipt = await deployment.wait();
  if (deploymentReceipt === null || deploymentReceipt.status !== 1) throw new Error("harness deployment failed");
  const contractAddress = await harness.getAddress();

  let sequence = 0;
  const next = (): number => ++sequence;
  const measurements: Measurement[] = [];
  measurements.push(await measured("USER_TWAB_QUERY", () => harness.userTwabQuery(next())));
  measurements.push(await measured("GLOBAL_CLOSE_ACCRUAL", () => harness.globalCloseAccrual(next())));
  measurements.push(await measured("CANDIDATE_GENERATION", () => harness.candidateGeneration(next())));
  measurements.push(await measured("CANDIDATE_VALIDITY", () => harness.candidateValidity(next())));
  measurements.push(await measured("ACCEPTED_TICKET_MODULO", () => harness.acceptedTicketModulo(next())));
  measurements.push(await measured("PARTICIPANT_SELECTION_STEP", () => harness.participantSelectionStep(next())));
  measurements.push(await measured("PARTICIPANT_SELECTION_CHUNK_4", () => harness.participantSelectionChunk4(next())));
  measurements.push(await measured("WINNINGS_ALLOCATION_STEP", () => harness.winningsAllocationStep(next())));
  measurements.push(await measured("AUTO_SAVE_ALLOCATION_STEP", () => harness.autoSaveAllocationStep(next())));
  measurements.push(await measured("AUTO_SAVE_ALLOCATION_CHUNK_4", () => harness.autoSaveAllocationChunk4(next())));
  measurements.push(
    await measured("PUBLIC_AGGREGATE_AUTHORIZE", () => harness.authorizeAggregatePublicDecryption(next())),
  );

  const aggregateHandle = await harness.aggregateHandle();
  const aggregate = await fhevm.publicDecrypt([aggregateHandle]);
  const aggregateVerification = await (
    await harness.verifyAggregate(aggregate.abiEncodedClearValues, aggregate.decryptionProof)
  ).wait();
  if (aggregateVerification === null || aggregateVerification.status !== 1)
    throw new Error("aggregate verification failed");
  measurements.push(await receiptRecord("PUBLIC_AGGREGATE_VERIFY", aggregateVerification));

  measurements.push(await measured("PUBLIC_BOOLEAN_AUTHORIZE", () => harness.authorizeBooleanPublicDecryption(next())));
  const booleanHandle = await harness.booleanHandle();
  const booleanResult = await fhevm.publicDecrypt([booleanHandle]);
  const booleanVerification = await (
    await harness.verifyBoolean(booleanResult.abiEncodedClearValues, booleanResult.decryptionProof)
  ).wait();
  if (booleanVerification === null || booleanVerification.status !== 1) throw new Error("boolean verification failed");
  measurements.push(await receiptRecord("PUBLIC_BOOLEAN_VERIFY", booleanVerification));

  const sourceBytes = await readFile(SOURCE);
  const artifactBytes = await readFile(ARTIFACT);
  const deploymentBlock = await ethers.provider.getBlock(deploymentReceipt.blockNumber);
  if (deploymentBlock === null || deploymentBlock.hash === null) throw new Error("deployment block unavailable");
  const evidence = {
    schema: "leopold.cp1-selector-live-hcu.v1",
    capturedUtc: new Date().toISOString(),
    network: { name: network.name, chainId: chain.chainId.toString() },
    sourceBaseCommit: "27e7ef20cb241dc3f2a3f3c91ce19d3d0c3e48f5",
    sourcePath: "contracts/benchmarks/LeopoldSelectorHcuHarness.sol",
    sourceSha256: sha256(sourceBytes),
    artifactPath: "artifacts/contracts/benchmarks/LeopoldSelectorHcuHarness.sol/LeopoldSelectorHcuHarness.json",
    artifactSha256: sha256(artifactBytes),
    compiler: "solc-0.8.27-optimizer-800-cancun-bytecodeHash-none",
    hcuSource: "hre.fhevm.computeTransactionHCU(receipt)",
    limits: { transactionTotalHCU: 20_000_000, transactionDepthHCU: 5_000_000, safetyFraction: "0.75" },
    operator: operator.address,
    contract: contractAddress,
    deployment: {
      transactionHash: deploymentReceipt.hash,
      blockNumber: deploymentReceipt.blockNumber,
      blockHash: deploymentBlock.hash,
      gasUsed: deploymentReceipt.gasUsed.toString(),
      status: deploymentReceipt.status,
    },
    publicDecryption: {
      aggregateVerified: await harness.aggregateVerified(),
      booleanVerified: await harness.booleanVerified(),
      acceptedTicketPubliclyDecrypted: false,
      individualTwabPubliclyDecrypted: false,
      winnerPubliclyDecrypted: false,
      winningsPubliclyDecrypted: false,
    },
    measurements,
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(OUTPUT, serialized, { encoding: "utf8", mode: 0o600 });
  await writeFile(`${OUTPUT}.sha256`, `${sha256(serialized)}  LEOPOLD_SELECTOR_HCU_LIVE.json\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(`EVIDENCE ${OUTPUT}\nSHA256 ${sha256(serialized)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown live benchmark failure";
  process.stderr.write(`LEOPOLD_SELECTOR_HCU_LIVE_FAILED ${message}\n`);
  process.exitCode = 1;
});
