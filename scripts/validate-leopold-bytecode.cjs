const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const EIP170_LIMIT = 24_576;
const contracts = [
  ["LeopoldVault", "artifacts/contracts/LeopoldVault.sol/LeopoldVault.json", 23_552],
  [
    "LeopoldSettlementBondEscrow",
    "artifacts/contracts/LeopoldSettlementBondEscrow.sol/LeopoldSettlementBondEscrow.json",
    5_000,
  ],
  ["LeopoldConfidentialUSDC", "artifacts/contracts/LeopoldConfidentialUSDC.sol/LeopoldConfidentialUSDC.json", 11_000],
  ["LeopoldCompoundAdapter", "artifacts/contracts/LeopoldCompoundAdapter.sol/LeopoldCompoundAdapter.json", 6_000],
  ["LeopoldVaultRegistry", "artifacts/contracts/LeopoldVaultRegistry.sol/LeopoldVaultRegistry.json", 1_500],
];

const rows = contracts.map(([name, artifactPath, acceptedMaximum]) => {
  const artifact = JSON.parse(readFileSync(resolve(artifactPath), "utf8"));
  const runtime = Buffer.from(artifact.deployedBytecode.slice(2), "hex");
  const creation = Buffer.from(artifact.bytecode.slice(2), "hex");
  const cborLength = runtime.readUInt16BE(runtime.length - 2);
  const metadataBytes = cborLength + 2;
  if (runtime.length > acceptedMaximum) {
    throw new Error(`${name} runtime ${runtime.length} exceeds accepted maximum ${acceptedMaximum}`);
  }
  if (runtime.length > EIP170_LIMIT) throw new Error(`${name} exceeds EIP-170`);
  return {
    name,
    creationBytes: creation.length,
    runtimeBytes: runtime.length,
    eip170Headroom: EIP170_LIMIT - runtime.length,
    acceptedMaximum,
    metadataBytes,
    runtimeSha256: createHash("sha256").update(runtime).digest("hex"),
  };
});

const largest = rows.reduce((left, right) => (left.runtimeBytes > right.runtimeBytes ? left : right));
if (largest.eip170Headroom < 1_024) throw new Error("mandatory 1,024-byte EIP-170 headroom is not preserved");
console.log(`LEOPOLD_BYTECODE_VALID ${JSON.stringify({ eip170Limit: EIP170_LIMIT, largest, contracts: rows })}`);
