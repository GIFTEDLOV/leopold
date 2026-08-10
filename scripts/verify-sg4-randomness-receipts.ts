/* eslint-disable @typescript-eslint/no-explicit-any */

import { ethers } from "hardhat";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const EVIDENCE_PATH = resolve(ROOT, "evidence/sg4/SG4_RANDOMNESS_BENCHMARK.json");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SG4 receipt replay failed: ${message}`);
}

async function main(): Promise<void> {
  const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8")) as any;
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  requireCheck(network.chainId === 11155111n, "wrong chain id");
  const deployment = evidence.deployment;
  const deploymentTransaction = await provider.getTransactionReceipt(deployment.transactionHash);
  requireCheck(deploymentTransaction !== null, "deployment receipt missing");
  requireCheck(deploymentTransaction.status === 1, "deployment receipt failed");
  requireCheck(deploymentTransaction.blockNumber === deployment.block.number, "deployment block drift");

  const code = await provider.getCode(deployment.contractAddress);
  requireCheck(code !== "0x", "benchmark harness code missing");
  requireCheck(sha256(code) === deployment.runtimeSha256, "benchmark harness runtime hash drift");

  for (const sample of evidence.rawSamples) {
    const receipt = await provider.getTransactionReceipt(sample.transactionHash);
    requireCheck(receipt !== null, `missing receipt ${sample.recordId}`);
    requireCheck(receipt.status === 1, `failed receipt ${sample.recordId}`);
    requireCheck(receipt.blockNumber === sample.blockNumber, `block mismatch ${sample.recordId}`);
    requireCheck(receipt.blockHash === sample.blockHash, `block hash mismatch ${sample.recordId}`);
    requireCheck(
      receipt.to?.toLowerCase() === deployment.contractAddress.toLowerCase(),
      `target mismatch ${sample.recordId}`,
    );
    requireCheck(receipt.gasUsed.toString() === sample.gasUsed, `gas mismatch ${sample.recordId}`);
    requireCheck(receipt.logs.length > 0, `missing receipt logs ${sample.recordId}`);
  }

  const currentBlock = await provider.getBlockNumber();
  console.log(`SG4_RANDOMNESS_RECEIPT_REPLAY PASS samples=${evidence.rawSamples.length}`);
  console.log(`DEPLOYMENT=${deployment.transactionHash}`);
  console.log(`HARNESS=${deployment.contractAddress}`);
  console.log(`CURRENT_BLOCK=${currentBlock}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
