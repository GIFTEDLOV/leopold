const crypto = require("node:crypto");
const fs = require("node:fs");

const EIP170_LIMIT = 24_576;
const EIP3860_INITCODE_LIMIT = 49_152;
const REQUIRED_RUNTIME_HEADROOM = 1_024;

const contracts = [
  {
    name: "LeopoldVaultV2",
    artifact: "artifacts/contracts/LeopoldVaultV2.sol/LeopoldVaultV2.json",
  },
  {
    name: "LeopoldSettlementBondEscrowV2",
    artifact: "artifacts/contracts/LeopoldSettlementBondEscrowV2.sol/LeopoldSettlementBondEscrowV2.json",
  },
];

const frozenVaultArtifact = "artifacts/contracts/LeopoldVault.sol/LeopoldVault.json";
const frozenVault = JSON.parse(fs.readFileSync(frozenVaultArtifact, "utf8"));
const frozenRuntime = Buffer.from(frozenVault.deployedBytecode.slice(2), "hex");
const frozenRuntimeSha256 = crypto.createHash("sha256").update(frozenRuntime).digest("hex");

const report = contracts.map(({ name, artifact }) => {
  const parsed = JSON.parse(fs.readFileSync(artifact, "utf8"));
  const creation = Buffer.from(parsed.bytecode.slice(2), "hex");
  const runtime = Buffer.from(parsed.deployedBytecode.slice(2), "hex");
  const runtimeHeadroom = EIP170_LIMIT - runtime.length;
  const initcodeHeadroom = EIP3860_INITCODE_LIMIT - creation.length;
  if (runtimeHeadroom < REQUIRED_RUNTIME_HEADROOM) {
    throw new Error(`${name} preserves only ${runtimeHeadroom} runtime bytes of EIP-170 headroom`);
  }
  if (initcodeHeadroom < 0) throw new Error(`${name} exceeds the EIP-3860 initcode limit`);
  if (name === "LeopoldVaultV2" && !runtime.equals(frozenRuntime)) {
    throw new Error("LeopoldVaultV2 runtime differs from the frozen LeopoldVault runtime");
  }
  return {
    name,
    creationBytes: creation.length,
    runtimeBytes: runtime.length,
    runtimeHeadroom,
    initcodeHeadroom,
    runtimeSha256: crypto.createHash("sha256").update(runtime).digest("hex"),
    ...(name === "LeopoldVaultV2" ? { matchesFrozenVaultRuntime: runtime.equals(frozenRuntime) } : {}),
  };
});

console.log(
  `LEOPOLD_AUTO_ENTRY_BYTECODE_VALID ${JSON.stringify({
    eip170Limit: EIP170_LIMIT,
    eip3860InitcodeLimit: EIP3860_INITCODE_LIMIT,
    requiredRuntimeHeadroom: REQUIRED_RUNTIME_HEADROOM,
    frozenVaultRuntimeSha256: frozenRuntimeSha256,
    contracts: report,
  })}`,
);
