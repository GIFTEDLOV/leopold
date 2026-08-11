import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const evidencePath = path.resolve("evidence/cp1/LEOPOLD_SELECTOR_HCU_LIVE.json");
const sidecarPath = `${evidencePath}.sha256`;
const required = [
  "USER_TWAB_QUERY",
  "GLOBAL_CLOSE_ACCRUAL",
  "CANDIDATE_GENERATION",
  "CANDIDATE_VALIDITY",
  "ACCEPTED_TICKET_MODULO",
  "PARTICIPANT_SELECTION_STEP",
  "PARTICIPANT_SELECTION_CHUNK_4",
  "WINNINGS_ALLOCATION_STEP",
  "AUTO_SAVE_ALLOCATION_STEP",
  "AUTO_SAVE_ALLOCATION_CHUNK_4",
  "PUBLIC_AGGREGATE_AUTHORIZE",
  "PUBLIC_AGGREGATE_VERIFY",
  "PUBLIC_BOOLEAN_AUTHORIZE",
  "PUBLIC_BOOLEAN_VERIFY",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`selector HCU evidence invalid: ${message}`);
}

const bytes = readFileSync(evidencePath);
const digest = createHash("sha256").update(bytes).digest("hex");
assert(readFileSync(sidecarPath, "utf8").trim() === `${digest}  LEOPOLD_SELECTOR_HCU_LIVE.json`, "sidecar");
const evidence = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
assert(evidence.schema === "leopold.cp1-selector-live-hcu.v1", "schema");
assert((evidence.network as { chainId?: string }).chainId === "11155111", "chain");
assert(evidence.hcuSource === "hre.fhevm.computeTransactionHCU(receipt)", "HCU source");
assert(typeof evidence.sourcePath === "string", "sourcePath");
const currentSourceDigest = createHash("sha256")
  .update(readFileSync(path.resolve(evidence.sourcePath)))
  .digest("hex");
assert(currentSourceDigest === evidence.sourceSha256, "sourceSha256");
assert(
  typeof evidence.artifactPath === "string" && readFileSync(path.resolve(evidence.artifactPath)).length > 0,
  "artifactPath",
);
assert(
  typeof evidence.artifactSha256 === "string" && /^[0-9a-f]{64}$/u.test(evidence.artifactSha256),
  "captured artifactSha256",
);
const publicDecryption = evidence.publicDecryption as Record<string, unknown>;
assert(publicDecryption.aggregateVerified === true && publicDecryption.booleanVerified === true, "proof verification");
for (const forbidden of [
  "acceptedTicketPubliclyDecrypted",
  "individualTwabPubliclyDecrypted",
  "winnerPubliclyDecrypted",
  "winningsPubliclyDecrypted",
]) {
  assert(publicDecryption[forbidden] === false, forbidden);
}
const measurements = evidence.measurements as Array<Record<string, unknown>>;
assert(Array.isArray(measurements) && measurements.length === required.length, "measurement count");
for (const circuit of required) {
  const measurement = measurements.find((entry) => entry.circuit === circuit);
  assert(measurement !== undefined, `missing ${circuit}`);
  assert(measurement.status === 1, `${circuit} status`);
  assert(
    typeof measurement.transactionHash === "string" && /^0x[0-9a-f]{64}$/iu.test(measurement.transactionHash),
    `${circuit} tx`,
  );
  assert(
    typeof measurement.blockHash === "string" && /^0x[0-9a-f]{64}$/iu.test(measurement.blockHash),
    `${circuit} block`,
  );
  assert(Number.isSafeInteger(measurement.globalHCU) && Number(measurement.globalHCU) >= 0, `${circuit} total HCU`);
  assert(Number.isSafeInteger(measurement.maxHCUDepth) && Number(measurement.maxHCUDepth) >= 0, `${circuit} depth`);
}
for (const circuit of ["PARTICIPANT_SELECTION_CHUNK_4", "AUTO_SAVE_ALLOCATION_CHUNK_4"]) {
  const measurement = measurements.find((entry) => entry.circuit === circuit)!;
  assert(Number(measurement.globalHCU) < 15_000_000, `${circuit} 25% total headroom`);
  assert(Number(measurement.maxHCUDepth) < 3_750_000, `${circuit} 25% depth headroom`);
}
process.stdout.write(`LEOPOLD_SELECTOR_HCU_EVIDENCE_VALID ${digest}\n`);
