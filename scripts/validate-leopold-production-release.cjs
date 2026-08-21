const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const readJson = (path) => JSON.parse(readFileSync(resolve(path), "utf8"));
const normalize = (value) => value.toLowerCase();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const manifestPath = "config/leopold-frontend-contracts.json";
const manifestBytes = readFileSync(resolve(manifestPath));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const refreeze = readJson("evidence/closure/LEOPOLD_P01_REFREEZE.json");
const freeze = readJson("evidence/closure/LEOPOLD_CONTRACT_FREEZE.json");
const artifact = readJson("artifacts/contracts/LeopoldVault.sol/LeopoldVault.json");

if (manifest.schema !== "leopold.frontend-contract-manifest.v1" || manifest.network.chainId !== 11155111) {
  throw new Error("production manifest schema/chain drift");
}
if (sha256(manifestBytes) !== refreeze.digests.manifestSha256) throw new Error("production manifest digest drift");

const expectedVaults = [
  [1, "DAILY", "Daily", 86_400],
  [2, "WEEKLY", "Weekly", 604_800],
  [3, "MONTHLY", "Monthly", 2_592_000],
  [4, "BOOST", "Boost", 604_800],
];
if (manifest.officialVaults.length !== expectedVaults.length) throw new Error("official four-vault model drift");
for (const [index, expected] of expectedVaults.entries()) {
  const vault = manifest.officialVaults[index];
  const frozen = refreeze.currentSuite.vaults[index];
  if (
    vault.id !== expected[0] ||
    vault.type !== expected[1] ||
    vault.name !== expected[2] ||
    vault.roundDurationSeconds !== expected[3] ||
    vault.name !== frozen.name ||
    normalize(vault.vault) !== normalize(frozen.vault) ||
    normalize(vault.adapter) !== normalize(frozen.adapter) ||
    normalize(vault.bondEscrow) !== normalize(frozen.escrow)
  ) {
    throw new Error(`official vault release drift: ${expected[2]}`);
  }
}

if (
  normalize(manifest.contracts.registry) !== normalize(refreeze.currentSuite.registry) ||
  normalize(manifest.contracts.lcUsdc) !== normalize(refreeze.external.reusedLeopoldConfidentialUsdc) ||
  normalize(manifest.contracts.canonicalCircleUsdc) !== normalize(refreeze.external.canonicalCircleUsdc) ||
  normalize(manifest.contracts.compoundComet) !== normalize(refreeze.external.compoundComet)
) {
  throw new Error("production contract address manifest mismatch");
}

const supersededOfficialAddresses = new Set(
  [
    "0x08560A59A28B9e3b7F5fe7C3cce17ddD9F115530",
    "0xa84C40BBeD3010D0D4CD44465920d5156fa5E6c4",
    "0xf3c842CdF26E960b63B67e392136D6B0D3ab2244",
    "0x1136D6c399d09Fa66474582DE6E4941bA3303ad6",
    "0x98D971557843CE17dc1387d2256Ab3dbAaC204f9",
  ].map(normalize),
);
const currentOfficialAddresses = [manifest.contracts.registry, ...manifest.officialVaults.map((vault) => vault.vault)];
if (currentOfficialAddresses.some((address) => supersededOfficialAddresses.has(normalize(address)))) {
  throw new Error("superseded official address reintroduced");
}

const runtime = Buffer.from(artifact.deployedBytecode.slice(2), "hex");
const headroom = 24_576 - runtime.length;
const vaultFreeze = freeze.contracts.find((contract) => contract.name === "LeopoldVault");
if (
  !vaultFreeze ||
  runtime.length !== 23_531 ||
  headroom < 1_024 ||
  runtime.length !== refreeze.runtime.leopoldVaultBytes ||
  headroom !== refreeze.runtime.eip170Headroom ||
  sha256(runtime) !== refreeze.runtime.normalizedRuntimeSha256 ||
  sha256(runtime) !== vaultFreeze.runtimeBytecodeTemplate.sha256
) {
  throw new Error("frozen LeopoldVault runtime/headroom drift");
}

const vaultSource = readFileSync(resolve("contracts/LeopoldVault.sol"), "utf8");
const p01Tests = readFileSync(resolve("test/LeopoldVaultFoundation.ts"), "utf8");
if (
  refreeze.security.p01Status !== "CLOSED" ||
  !vaultSource.includes("euint64 remainingCapacity = FHE.sub(MAX_POOL_BASE_UNITS, _totalPrincipal);") ||
  !vaultSource.includes("FHE.le(amount, remainingCapacity)") ||
  !p01Tests.includes("rejects the high-width wrap vector") ||
  !p01Tests.includes("preserves exact cap, cap-plus-one, zero, and withdrawal-restored capacity")
) {
  throw new Error("P-01 release regression gate drift");
}

console.log(
  `LEOPOLD_PRODUCTION_RELEASE_VALID ${JSON.stringify({
    chainId: manifest.network.chainId,
    manifestSha256: sha256(manifestBytes),
    officialVaults: manifest.officialVaults.length,
    runtimeBytes: runtime.length,
    eip170Headroom: headroom,
    p01Status: refreeze.security.p01Status,
  })}`,
);
