/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { deriveProtocol, serializeProtocol } from "./sg4-protocol";

const ROOT = resolve(__dirname, "..");
const DEFAULT_PATH = resolve(ROOT, "evidence/sg4/SG4_RANDOMNESS_BENCHMARK.json");
const EXPECTED_PROTOCOL_DIGEST = "88d6f8c1522a0668d769f34ddafaf3e71134cbc9434a1b9676f78d5bdeb0968e";
const EXPECTED_AUTHORITY_DIGEST = "53fabb080c608c1224faa8435a1fbd548ca316806d554fcc8e92b730d8cfea2b";
const EXPECTED_HCU: Record<string, number> = { "64": 24000, "128": 25000, "256": 30000 };

function fail(message: string): never {
  throw new Error(`SG4 randomness evidence invalid: ${message}`);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function main(): void {
  const path = process.argv[2] ? resolve(ROOT, process.argv[2]) : DEFAULT_PATH;
  const evidence = JSON.parse(readFileSync(path, "utf8")) as any;
  const sidecarPath = `${path}.sha256`;
  const sidecar = readFileSync(sidecarPath, "utf8").trim();
  const expectedSidecar = `${sha256(readFileSync(path))}  ${path.split("/").pop()}`;

  assert(sidecar === expectedSidecar, "artifact sidecar does not match artifact bytes");
  assert(evidence.schema === "zama-szn4.sg4-randomness-benchmark.v1", "schema mismatch");
  assert(evidence.status === "PASSED", "benchmark status is not PASSED");
  assert(evidence.protocol.protocolDigest === EXPECTED_PROTOCOL_DIGEST, "protocol digest mismatch");
  assert(evidence.protocol.authorityProtocolDigest === EXPECTED_AUTHORITY_DIGEST, "authority digest mismatch");
  assert(sha256(serializeProtocol()) === EXPECTED_PROTOCOL_DIGEST, "protocol was not recomputed");
  deriveProtocol();
  assert(evidence.protocol.exactPlanRows === 36, "RNG subset row count mismatch");
  assert(evidence.protocol.measuredRows === 30, "RNG measured row count mismatch");
  assert(evidence.protocol.warmupRows === 6, "RNG warmup row count mismatch");
  assert(evidence.protocol.individualRetryPolicy === "FORBIDDEN", "retry policy drift");
  assert(evidence.environment.chainId === "11155111", "chain ID mismatch");
  assert(evidence.environment.rpcUrlRecorded === false, "RPC URL was recorded");
  assert(!evidence.environment.rpcMethods.includes("eth_sendTransaction"), "raw signer RPC was used");
  assert(!evidence.environment.rpcMethods.includes("eth_sign"), "signing RPC was used");
  assert(!evidence.environment.rpcMethods.includes("personal_sign"), "personal signing RPC was used");
  assert(evidence.aclAudit.randomTicketHumanDecryptable === false, "ticket decryptability audit failed");
  assert(evidence.aclAudit.publicDecryptCallsInRngMethods === false, "public decryption audit failed");
  assert(evidence.aclAudit.callerAclCallsInRngMethods === false, "caller ACL audit failed");
  assert(evidence.aclAudit.adminAclCallsInRngMethods === false, "admin ACL audit failed");
  assert(evidence.aclAudit.keeperAclCallsInRngMethods === false, "keeper ACL audit failed");
  assert(evidence.aclAudit.noCallerControlledSeed === true, "caller seed audit failed");
  assert(evidence.widthAnalysis.derivedBounds.requiredTwabBits === "75", "TWAB bit-width derivation mismatch");
  assert(
    evidence.widthAnalysis.widthDecisions.find((entry: any) => entry.widthBits === "64").mathematicalVerdict ===
      "NO-GO",
    "euint64 domain verdict drift",
  );
  assert(
    evidence.widthAnalysis.widthDecisions.find((entry: any) => entry.widthBits === "128").mathematicalVerdict === "GO",
    "euint128 domain verdict drift",
  );
  assert(
    evidence.widthAnalysis.widthDecisions
      .find((entry: any) => entry.widthBits === "256")
      .installedTicketApiVerdict.startsWith("BLOCKED"),
    "euint256 API verdict drift",
  );
  assert(evidence.architectureDecision.selectedWidth === "euint128", "selected width drift");
  assert(evidence.retryAttackReview.productionWinnerSelectionImplemented === false, "winner-selection scope expanded");

  const samples = evidence.rawSamples as any[];
  assert(samples.length === 36, "raw sample count mismatch");
  assert(new Set(samples.map((sample) => sample.transactionHash)).size === 36, "duplicate transaction hash");
  assert(evidence.failures.length === 0, "failure records present in a PASSED artifact");
  const byWidth = new Map<string, any[]>();
  for (const width of ["64", "128", "256"]) byWidth.set(width, []);
  for (const sample of samples) {
    assert(byWidth.has(sample.width), `unknown width ${sample.width}`);
    byWidth.get(sample.width)!.push(sample);
    assert(sample.status === 1, `sample ${sample.recordId} did not succeed`);
    assert(sample.retryCount === 0, `sample ${sample.recordId} was retried`);
    assert(sample.hcuEvents.FheRand === 1, `sample ${sample.recordId} missing exactly one FheRand event`);
    assert(Object.keys(sample.hcuEvents).length === 1, `sample ${sample.recordId} has unexpected FHE events`);
    assert(sample.hcuConsumed === EXPECTED_HCU[sample.width], `sample ${sample.recordId} HCU mismatch`);
    assert(sample.hcuDepthConsumed === EXPECTED_HCU[sample.width], `sample ${sample.recordId} depth mismatch`);
    assert(sample.hcuPredictionMatches === true, `sample ${sample.recordId} prediction mismatch`);
    assert(sample.combinedHcuVerdict === "GO", `sample ${sample.recordId} failed HCU gate`);
    assert(sample.postStateCorrect === true, `sample ${sample.recordId} completion event missing`);
    assert(sample.transactionHash.startsWith("0x") && sample.transactionHash.length === 66, "invalid tx hash");
  }
  for (const [width, widthSamples] of byWidth) {
    assert(widthSamples.length === 12, `width ${width} row count mismatch`);
    assert(
      widthSamples.filter((sample) => sample.classification === "MEASURED").length === 10,
      `width ${width} measured count mismatch`,
    );
    assert(
      widthSamples.filter((sample) => sample.classification === "WARMUP").length === 2,
      `width ${width} warmup count mismatch`,
    );
    for (const windowId of ["WINDOW_1", "WINDOW_2", "WINDOW_3"]) {
      const windowSamples = widthSamples.filter((sample) => sample.windowId === windowId);
      assert(windowSamples.length === (windowId === "WINDOW_1" ? 6 : 3), `width ${width} ${windowId} count mismatch`);
    }
  }

  const windows = evidence.executionWindows as any[];
  assert(windows.length === 3, "window count mismatch");
  for (let index = 1; index < windows.length; index += 1) {
    assert(windows[index].firstBlock >= windows[index - 1].lastBlock + 20, `window ${index + 1} separation mismatch`);
  }
  const serialized = JSON.stringify(evidence);
  assert(
    !/private.?key|mnemonic|secret|SEPOLIA_RPC_URL|ciphertext|handleBytes32|0x[0-9a-f]{64}/iu.test(
      serialized.replace(/0x[0-9a-f]{64}/giu, "TX_HASH_ALLOWED"),
    ),
    "sensitive material or raw handles present",
  );
  assert(evidence.counts.exactRows === 36, "count reconciliation mismatch");
  assert(evidence.counts.measuredRows === 30, "measured reconciliation mismatch");
  assert(evidence.counts.warmupRows === 6, "warmup reconciliation mismatch");
  assert(evidence.counts.uniqueTransactions === 36, "unique transaction reconciliation mismatch");
  console.log(`SG4_RANDOMNESS_EVIDENCE_VALID PASS ${path}`);
  console.log(`SHA256 ${sha256(readFileSync(path))}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
