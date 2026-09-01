const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const BUILD_INFO = path.resolve("artifacts/build-info");
const ESCROW_SOURCE = "contracts/LeopoldSettlementBondEscrowV2.sol";
const VAULT_SOURCE = "contracts/LeopoldVaultV2.sol";
const EXPECTED = {
  compilerVersion: "0.8.27",
  optimizer: { enabled: true, runs: 1 },
  viaIR: true,
  evmVersion: "cancun",
  metadata: { bytecodeHash: "none" },
};

function contract(info, source, name) {
  return info.output?.contracts?.[source]?.[name];
}

function settingsMatch(info) {
  const settings = info.input?.settings;
  return (
    info.solcVersion === EXPECTED.compilerVersion &&
    settings?.optimizer?.enabled === EXPECTED.optimizer.enabled &&
    settings?.optimizer?.runs === EXPECTED.optimizer.runs &&
    settings?.viaIR === EXPECTED.viaIR &&
    settings?.evmVersion === EXPECTED.evmVersion &&
    settings?.metadata?.bytecodeHash === EXPECTED.metadata.bytecodeHash
  );
}

const infos = fs
  .readdirSync(BUILD_INFO)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(BUILD_INFO, name), "utf8")));
const standalone = infos.find(
  (info) =>
    contract(info, ESCROW_SOURCE, "LeopoldSettlementBondEscrowV2") && !contract(info, VAULT_SOURCE, "LeopoldVaultV2"),
);
const vaultPath = infos.find(
  (info) =>
    contract(info, ESCROW_SOURCE, "LeopoldSettlementBondEscrowV2") && contract(info, VAULT_SOURCE, "LeopoldVaultV2"),
);
if (!standalone || !vaultPath)
  throw new Error("V2 compiler build-info does not contain both required compilation paths");
if (!settingsMatch(standalone) || !settingsMatch(vaultPath)) throw new Error("V2 compiler settings are not canonical");

const standaloneEscrow = contract(standalone, ESCROW_SOURCE, "LeopoldSettlementBondEscrowV2");
const embeddedEscrow = contract(vaultPath, ESCROW_SOURCE, "LeopoldSettlementBondEscrowV2");
const standaloneRuntime = standaloneEscrow.evm.deployedBytecode.object;
const embeddedRuntime = embeddedEscrow.evm.deployedBytecode.object;
const standaloneCreation = standaloneEscrow.evm.bytecode.object;
const embeddedCreation = embeddedEscrow.evm.bytecode.object;
if (standaloneRuntime !== embeddedRuntime || standaloneCreation !== embeddedCreation) {
  throw new Error("Standalone V2 escrow bytecode differs from the V2 vault creation-path escrow bytecode");
}

const sha256 = (hex) => crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
console.log(
  `LEOPOLD_V2_COMPILER_CONSISTENCY_VALID ${JSON.stringify({
    compiler: EXPECTED,
    escrow: {
      creationBytes: standaloneCreation.length / 2,
      runtimeBytes: standaloneRuntime.length / 2,
      runtimeSha256: sha256(standaloneRuntime),
      standaloneMatchesVaultCreationPath: true,
    },
  })}`,
);
