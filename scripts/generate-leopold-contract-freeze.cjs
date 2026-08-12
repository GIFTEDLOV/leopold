const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Interface, keccak256 } = require("ethers");

const definitions = [
  {
    name: "LeopoldVault",
    artifact: "artifacts/contracts/LeopoldVault.sol/LeopoldVault.json",
    immutables: [
      "VAULT_ID",
      "VAULT_TYPE",
      "VAULT_NAME",
      "ROUND_DURATION",
      "ASSET",
      "UNDERLYING",
      "WRAP_RATE",
      "STRATEGY",
      "STRATEGY_GUARDIAN",
      "MINIMUM_STRATEGY_EPOCH_AGE",
      "SETTLEMENT_BOND_ESCROW",
    ],
  },
  {
    name: "LeopoldSettlementBondEscrow",
    artifact: "artifacts/contracts/LeopoldSettlementBondEscrow.sol/LeopoldSettlementBondEscrow.json",
    immutables: ["VAULT", "BOND_AMOUNT", "REWARD_PER_PARTICIPANT_PASS", "REFUND_PER_COMPLETED_PARTICIPANT"],
  },
  {
    name: "LeopoldConfidentialUSDC",
    artifact: "artifacts/contracts/LeopoldConfidentialUSDC.sol/LeopoldConfidentialUSDC.json",
    immutables: ["underlying", "rate"],
  },
  {
    name: "LeopoldCompoundAdapter",
    artifact: "artifacts/contracts/LeopoldCompoundAdapter.sol/LeopoldCompoundAdapter.json",
    immutables: ["vault", "asset", "guardian", "COMET"],
  },
  {
    name: "LeopoldVaultRegistry",
    artifact: "artifacts/contracts/LeopoldVaultRegistry.sol/LeopoldVaultRegistry.json",
    immutables: ["EXPECTED_BOND_AMOUNT", "EXPECTED_REWARD_PER_PARTICIPANT_PASS"],
  },
];

function digest(bytes, algorithm) {
  return createHash(algorithm)
    .update(Buffer.from(bytes.slice(2), "hex"))
    .digest("hex");
}

const contracts = definitions.map((definition) => {
  const artifact = JSON.parse(readFileSync(resolve(definition.artifact), "utf8"));
  const iface = new Interface(artifact.abi);
  const functions = iface.fragments
    .filter((fragment) => fragment.type === "function")
    .map((fragment) => ({ signature: fragment.format("sighash"), selector: fragment.selector }))
    .sort((left, right) => left.signature.localeCompare(right.signature));
  const events = iface.fragments
    .filter((fragment) => fragment.type === "event")
    .map((fragment) => ({ signature: fragment.format("sighash"), topic0: fragment.topicHash }))
    .sort((left, right) => left.signature.localeCompare(right.signature));
  const errors = iface.fragments
    .filter((fragment) => fragment.type === "error")
    .map((fragment) => ({ signature: fragment.format("sighash"), selector: fragment.selector }))
    .sort((left, right) => left.signature.localeCompare(right.signature));
  const constructor = artifact.abi.find((entry) => entry.type === "constructor") ?? {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  };
  return {
    name: definition.name,
    sourceName: artifact.sourceName,
    compilerArtifact: definition.artifact,
    constructor,
    immutables: definition.immutables,
    abi: artifact.abi,
    functions,
    events,
    errors,
    creationBytecode: {
      bytes: (artifact.bytecode.length - 2) / 2,
      sha256: digest(artifact.bytecode, "sha256"),
      keccak256: keccak256(artifact.bytecode),
    },
    runtimeBytecodeTemplate: {
      bytes: (artifact.deployedBytecode.length - 2) / 2,
      sha256: digest(artifact.deployedBytecode, "sha256"),
      keccak256: keccak256(artifact.deployedBytecode),
      note: "Artifact template; deployed hash differs where compiler immutable references are substituted.",
    },
  };
});

const output = {
  schema: "leopold.contract-core-freeze.v1",
  generatedFromGitHead: "WORKTREE_PRECOMMIT",
  compiler: {
    version: "0.8.27",
    evmVersion: "cancun",
    metadata: { bytecodeHash: "none" },
    defaultOptimizer: { enabled: true, runs: 800, viaIR: false },
    sizeCriticalOverrides: {
      LeopoldVault: { enabled: true, runs: 1, viaIR: true },
      LeopoldVaultRegistry: { enabled: true, runs: 1, viaIR: true },
    },
  },
  freezePolicy: {
    interfaceChangeIsFreezeBreaking: true,
    productionSolidityChangeIsFreezeBreaking: true,
  },
  contracts,
};

mkdirSync(resolve("evidence/closure"), { recursive: true });
const serialized = `${JSON.stringify(output, null, 2)}\n`;
writeFileSync(resolve("evidence/closure/LEOPOLD_CONTRACT_FREEZE.json"), serialized, { mode: 0o644 });
writeFileSync(
  resolve("evidence/closure/LEOPOLD_CONTRACT_FREEZE.json.sha256"),
  `${createHash("sha256").update(serialized).digest("hex")}  evidence/closure/LEOPOLD_CONTRACT_FREEZE.json\n`,
  { mode: 0o644 },
);
console.log("LEOPOLD_CONTRACT_FREEZE_GENERATED");
