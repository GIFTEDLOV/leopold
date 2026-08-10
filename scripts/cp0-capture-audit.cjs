"use strict";
/* global __dirname, console, require */

const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const result = spawnSync("pnpm", ["audit", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

if (result.error || !result.stdout.trim()) {
  throw result.error ?? new Error(`pnpm audit produced no JSON: ${result.stderr}`);
}

const rawAudit = JSON.parse(result.stdout);
const artifact = {
  schema: "zama-szn4.cp0-full-dependency-audit.v1",
  capturedUtc: new Date().toISOString(),
  auditedBaseCommit: "ec8d22b4273ef3a84ba27b3b6fecbc2caadea12c",
  command: "pnpm audit --json",
  scope: "ALL_DEPENDENCIES_INCLUDING_DEV",
  auditExitCode: result.status,
  interpretation: result.status === 0 ? "AUDIT_COMPLETED_NO_ADVISORIES" : "AUDIT_COMPLETED_WITH_ADVISORIES",
  stderr: result.stderr.trim(),
  rawAudit,
};
const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
const output = resolve(root, "evidence/cp0/CP0_FULL_DEPENDENCY_AUDIT.json");
writeFileSync(output, bytes, { mode: 0o644 });
const digest = createHash("sha256").update(bytes).digest("hex");
writeFileSync(`${output}.sha256`, `${digest}  evidence/cp0/CP0_FULL_DEPENDENCY_AUDIT.json\n`, { mode: 0o644 });
console.log(`CP0_FULL_DEPENDENCY_AUDIT_CAPTURED sha256=${digest} exit=${result.status}`);
