"use strict";
/* global __dirname, console, process, require */

const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const closurePath = resolve(root, "evidence/cp0/CP0_FINAL_CLOSURE.json");
const expectedGates = [
  "CG-1",
  "CG-2",
  "CG-3",
  "CG-4",
  "SG-1",
  "SG-2",
  "SG-3",
  "SG-4",
  "SG-5",
  "M-1",
  "M-2",
  "M-3",
  "M-4",
  "M-5",
  "M-6",
  "M-7",
  "M-8",
  "L-1",
  "L-2",
  "L-3",
  "L-4",
  "L-5",
];
const expectedRisks = ["R-003", "R-005", "R-008", "R-010", "R-011", "R-012", "R-014"];
const lockDigests = {
  "scripts/sg4-hcu-authority-binding.json": "4fa8642b9f1be977d9e8ca41c6ea9abfbfdda0c8d5e7160150dd76bb6036265c",
  "evidence/sg4/SG4_RANDOMNESS_BENCHMARK.json": "b7d55b6a7947ef961ef87942bfefe23d331df21e94835f3a0a6cd7917a4bf8f4",
  "evidence/cp0/SG5_BROWSER_CAPABILITY.json": "2ec2dec9c8eb974821b63848ce944c7fd7da3b389cdaf37f586d216e5194f6a3",
};

function fail(message) {
  throw new Error(`CP0_FINAL_CLOSURE_INVALID:${message}`);
}
function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function uniqueExact(actual, expected, label) {
  if (new Set(actual).size !== actual.length) fail(`DUPLICATE_${label}`);
  if (actual.length !== expected.length || expected.some((id) => !actual.includes(id))) {
    fail(`MISSING_OR_UNEXPECTED_${label}`);
  }
}
function verifyEvidence(reference) {
  if (!reference.path || !/^[a-f0-9]{64}$/u.test(reference.sha256 ?? "")) {
    fail(`INCOMPLETE_EVIDENCE_REFERENCE:${reference.path ?? "missing"}`);
  }
  const path = resolve(root, reference.path);
  if (!existsSync(path)) fail(`MISSING_EVIDENCE:${reference.path}`);
  if (sha256(path) !== reference.sha256) fail(`EVIDENCE_DIGEST_MISMATCH:${reference.path}`);
}

try {
  const closure = JSON.parse(readFileSync(closurePath, "utf8"));
  uniqueExact(
    closure.gates.map(({ id }) => id),
    expectedGates,
    "GATE_ID",
  );
  uniqueExact(
    closure.risks.map(({ id }) => id),
    expectedRisks,
    "RISK_ID",
  );
  uniqueExact(
    closure.additionalFindings.map(({ id }) => id),
    ["H-7", "H-8"],
    "HIGH_FINDING_ID",
  );

  for (const gate of closure.gates) {
    if (gate.status !== "PASS") fail(`BLOCKING_GATE:${gate.id}:${gate.status}`);
    if (!gate.definition || !gate.residualRisk || !gate.evidence.length) fail(`INCOMPLETE_GATE:${gate.id}`);
    gate.evidence.forEach(verifyEvidence);
  }
  for (const finding of closure.additionalFindings) {
    if (finding.status !== "PASS") fail(`BLOCKING_FINDING:${finding.id}:${finding.status}`);
    finding.evidence.forEach(verifyEvidence);
  }
  for (const risk of closure.risks) {
    if (!["PASS", "OPEN_NONBLOCKING_PRODUCTION_RISK"].includes(risk.status)) {
      fail(`INVALID_RISK_STATUS:${risk.id}`);
    }
  }

  for (const [path, digest] of Object.entries(lockDigests)) {
    if (sha256(resolve(root, path)) !== digest) fail(`LOCKED_EVIDENCE_MUTATION:${path}`);
  }
  const randomness = JSON.parse(readFileSync(resolve(root, closure.locks.randomness.path), "utf8"));
  if (closure.locks.randomness.width !== "euint128" || randomness.architectureDecision.selectedWidth !== "euint128") {
    fail("RANDOMNESS_WIDTH_NOT_EUINT128");
  }
  const sg5 = JSON.parse(readFileSync(resolve(root, closure.locks.sg5.path), "utf8"));
  if (sg5.evidenceMarker !== "SG5_EVIDENCE_VALID") fail("SG5_NOT_VALID");
  if (closure.fullRegression.status !== "PASS") fail("CHECK_ALL_NOT_RECORDED_PASS");
  verifyEvidence({ path: closure.fullRegression.artifact, sha256: closure.fullRegression.sha256 });
  const regression = JSON.parse(readFileSync(resolve(root, closure.fullRegression.artifact), "utf8"));
  if (
    regression.status !== "PASS" ||
    !regression.results.some((x) => x.command === "pnpm check:all" && x.status === "PASS")
  ) {
    fail("FULL_REGRESSION_INVALID");
  }
  if (closure.decision !== "STAGE 0 / CP0 CLOSED — GO TO PRODUCTION IMPLEMENTATION") fail("GO_NOT_ASSERTED");
  console.log("CP0_FINAL_CLOSURE_VALID");
} catch (error) {
  console.error(error instanceof Error ? error.message : "CP0_FINAL_CLOSURE_INVALID:UNKNOWN");
  process.exitCode = 1;
}
