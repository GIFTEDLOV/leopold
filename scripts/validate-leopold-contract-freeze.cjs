const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const freezePath = resolve("evidence/closure/LEOPOLD_CONTRACT_FREEZE.json");
const serialized = readFileSync(freezePath, "utf8");
const freeze = JSON.parse(serialized);
const sidecar = readFileSync(`${freezePath}.sha256`, "utf8").trim().split(/\s+/u)[0];
const actualSidecar = createHash("sha256").update(serialized).digest("hex");
if (sidecar !== actualSidecar) throw new Error("contract freeze sidecar mismatch");
if (freeze.schema !== "leopold.contract-core-freeze.v1" || freeze.contracts.length !== 5) {
  throw new Error("invalid contract freeze schema");
}

for (const contract of freeze.contracts) {
  const artifact = JSON.parse(readFileSync(resolve(contract.compilerArtifact), "utf8"));
  if (JSON.stringify(contract.abi) !== JSON.stringify(artifact.abi)) throw new Error(`${contract.name} ABI drift`);
  const runtime = Buffer.from(artifact.deployedBytecode.slice(2), "hex");
  const creation = Buffer.from(artifact.bytecode.slice(2), "hex");
  if (runtime.length !== contract.runtimeBytecodeTemplate.bytes)
    throw new Error(`${contract.name} runtime length drift`);
  if (creation.length !== contract.creationBytecode.bytes) throw new Error(`${contract.name} creation length drift`);
  if (createHash("sha256").update(runtime).digest("hex") !== contract.runtimeBytecodeTemplate.sha256) {
    throw new Error(`${contract.name} runtime hash drift`);
  }
  if (createHash("sha256").update(creation).digest("hex") !== contract.creationBytecode.sha256) {
    throw new Error(`${contract.name} creation hash drift`);
  }
}

const manifest = JSON.parse(readFileSync(resolve("config/leopold-frontend-contracts.json"), "utf8"));
if (manifest.schema !== "leopold.frontend-contract-manifest.v1" || manifest.network.chainId !== 11155111) {
  throw new Error("invalid frontend contract manifest");
}
if (manifest.officialVaults.length !== 4 || new Set(manifest.officialVaults.map((vault) => vault.id)).size !== 4) {
  throw new Error("official vault manifest drift");
}
const closure = readFileSync(resolve("docs/security/LEOPOLD_PRE_FRONTEND_CONTRACT_FREEZE.md"), "utf8");
for (const required of [
  "round-scoped public settlement-bond eligibility",
  "2 * ceil(n/4) + 2",
  "free/permanent settlement-work externalization is removed",
  "1,037",
  "2026-08-26",
  "HOLD_PIN",
  "Freeze-breaking triggers",
]) {
  if (!closure.includes(required)) throw new Error(`closure record missing ${required}`);
}
console.log(`LEOPOLD_CONTRACT_FREEZE_VALID ${actualSidecar}`);
