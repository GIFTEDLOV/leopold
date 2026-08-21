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

const manifestSerialized = readFileSync(resolve("config/leopold-frontend-contracts.json"), "utf8");
const manifest = JSON.parse(manifestSerialized);
if (manifest.schema !== "leopold.frontend-contract-manifest.v1" || manifest.network.chainId !== 11155111) {
  throw new Error("invalid frontend contract manifest");
}
if (manifest.officialVaults.length !== 4 || new Set(manifest.officialVaults.map((vault) => vault.id)).size !== 4) {
  throw new Error("official vault manifest drift");
}
const redeployment = JSON.parse(readFileSync(resolve("evidence/deployment/LEOPOLD_P01_REDEPLOYMENT.json"), "utf8"));
const manifestSha256 = createHash("sha256").update(manifestSerialized).digest("hex");
if (
  redeployment.schema !== "leopold.p01-corrected-sepolia-redeployment.v1" ||
  redeployment.chain.chainId !== "11155111" ||
  redeployment.manifestSha256 !== manifestSha256 ||
  redeployment.deployments.registry.address !== manifest.contracts.registry ||
  redeployment.deployments.lcUsdc.address !== manifest.contracts.lcUsdc ||
  redeployment.p01Closure.status !== "CLOSED" ||
  redeployment.p01Closure.correctedRuntimeBytes !== 23531 ||
  redeployment.p01Closure.eip170Headroom !== 1045 ||
  redeployment.p01Closure.wrapperReused !== true ||
  redeployment.p01Closure.oldVaultsRegisteredInCorrectedRegistry !== false
) {
  throw new Error("P-01 corrected deployment evidence drift");
}
for (const [index, vault] of manifest.officialVaults.entries()) {
  const deployed = redeployment.deployments.vaults[index];
  const runtime = redeployment.runtimeBytecode[`${vault.name}Vault`];
  if (
    deployed.name !== vault.name ||
    deployed.address !== vault.vault ||
    deployed.adapter.address !== vault.adapter ||
    deployed.bondEscrow.address !== vault.bondEscrow ||
    runtime.address !== vault.vault ||
    runtime.liveRuntimeBytes !== 23531 ||
    runtime.expectedRuntimeBytes !== 23531 ||
    runtime.eip170Headroom !== 1045 ||
    runtime.matchesFrozenArtifact !== true ||
    runtime.normalizedRuntimeSha256 !== runtime.expectedFrozenRuntimeSha256
  ) {
    throw new Error(`P-01 corrected deployment drift: ${vault.name}`);
  }
}
const smoke = JSON.parse(readFileSync(resolve("evidence/deployment/LEOPOLD_P01_BOUNDED_SMOKE.json"), "utf8"));
if (
  smoke.schema !== "leopold.p01-bounded-deposit-withdraw-smoke.v1" ||
  smoke.manifestSha256 !== manifestSha256 ||
  smoke.contracts.registry !== manifest.contracts.registry ||
  smoke.checks.depositRecorded !== true ||
  smoke.checks.samePrincipalWithdrawn !== true ||
  smoke.checks.principalAfterDeposit !== smoke.amountBaseUnits ||
  smoke.checks.principalAfterWithdrawal !== "0" ||
  smoke.checks.roundClosePerformed !== false ||
  smoke.round.forcedClosePerformed !== false
) {
  throw new Error("P-01 bounded deployment smoke drift");
}
const refreeze = JSON.parse(readFileSync(resolve("evidence/closure/LEOPOLD_P01_REFREEZE.json"), "utf8"));
const digestFile = (file) =>
  createHash("sha256")
    .update(readFileSync(resolve(file)))
    .digest("hex");
if (
  refreeze.schema !== "leopold.p01-corrected-sepolia-refreeze.v1" ||
  refreeze.chain.chainId !== 11155111 ||
  refreeze.currentSuite.registry !== manifest.contracts.registry ||
  refreeze.digests.manifestSha256 !== manifestSha256 ||
  refreeze.digests.deploymentEvidenceSha256 !== digestFile("evidence/deployment/LEOPOLD_P01_REDEPLOYMENT.json") ||
  refreeze.digests.boundedSmokeEvidenceSha256 !== digestFile("evidence/deployment/LEOPOLD_P01_BOUNDED_SMOKE.json") ||
  refreeze.digests.contractFreezeSha256 !== actualSidecar ||
  refreeze.runtime.leopoldVaultBytes !== 23531 ||
  refreeze.runtime.eip170Headroom !== 1045 ||
  refreeze.security.p01Status !== "CLOSED" ||
  refreeze.security.unresolvedCritical !== 0 ||
  refreeze.security.unresolvedHigh !== 0 ||
  refreeze.security.unresolvedMedium !== 0 ||
  refreeze.security.abiChanged !== false ||
  refreeze.security.stateMachineChanged !== false ||
  refreeze.security.privacyChanged !== false ||
  refreeze.historicalEvidence.preserved !== true ||
  refreeze.historicalEvidence.liveBrowserE2eSha256 !==
    digestFile("evidence/deployment/LEOPOLD_LIVE_BROWSER_E2E.json") ||
  refreeze.historicalEvidence.liveE2eClosureSha256 !== digestFile("evidence/deployment/LEOPOLD_LIVE_E2E_CLOSURE.json")
) {
  throw new Error("P-01 refreeze evidence drift");
}
const closure = readFileSync(resolve("docs/security/LEOPOLD_PRE_FRONTEND_CONTRACT_FREEZE.md"), "utf8");
for (const required of [
  "round-scoped public settlement-bond eligibility",
  "2 * ceil(n/4) + 2",
  "free/permanent settlement-work externalization is removed",
  "1,045",
  "2026-08-26",
  "HOLD_PIN",
  "Freeze-breaking triggers",
]) {
  if (!closure.includes(required)) throw new Error(`closure record missing ${required}`);
}
console.log(`LEOPOLD_CONTRACT_FREEZE_VALID ${actualSidecar}`);
