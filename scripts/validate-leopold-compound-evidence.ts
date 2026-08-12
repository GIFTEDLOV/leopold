import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const evidencePath = path.resolve("evidence/cp1/LEOPOLD_COMPOUND_LIVE.json");
const sidecarPath = `${evidencePath}.sha256`;
const bytes = readFileSync(evidencePath);
const digest = createHash("sha256").update(bytes).digest("hex");
interface CompoundEvidence {
  schema: string;
  network: { chainId: string };
  contracts: { canonicalCircleUsdc: string; compoundComet: string };
  venueProbe: { observationA: { balance: string }; observationB: { balance: string } };
  endToEnd: { genuineYieldHarvest: { managedBefore: string; basis: string; creditedPrizeBaseUnits: string } };
  finalState: {
    userPrincipal: string;
    adapterBasis: string;
    cometBalance: string;
    cometBorrow: string;
    cometAllowance: string;
  };
  finality: { verified: boolean; finalizedBlock: number; requiredThroughBlock: number };
  finalSource: { vaultSha256: string; adapterSha256: string; wrapperSha256: string };
}

const evidence = JSON.parse(bytes.toString("utf8")) as CompoundEvidence;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Compound evidence invalid: ${message}`);
}
assert(readFileSync(sidecarPath, "utf8").trim() === `${digest}  LEOPOLD_COMPOUND_LIVE.json`, "sidecar");
assert(evidence.schema === "leopold.cp1-compound-live.v1", "schema");
assert(evidence.network.chainId === "11155111", "chain");
assert(evidence.contracts.canonicalCircleUsdc.toLowerCase() === "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", "USDC");
assert(evidence.contracts.compoundComet.toLowerCase() === "0xaec1f48e02cfb822be958b68c7957156eb3f0b6e", "Comet");
assert(
  BigInt(evidence.venueProbe.observationB.balance) > BigInt(evidence.venueProbe.observationA.balance),
  "venue interest",
);
assert(evidence.endToEnd.genuineYieldHarvest.managedBefore === "625001", "managed interest");
assert(evidence.endToEnd.genuineYieldHarvest.basis === "625000", "basis");
assert(evidence.endToEnd.genuineYieldHarvest.creditedPrizeBaseUnits === "1", "harvest");
assert(evidence.finalState.userPrincipal === "0", "principal cleanup");
assert(evidence.finalState.adapterBasis === "0" && evidence.finalState.cometBalance === "0", "position cleanup");
assert(evidence.finalState.cometBorrow === "0" && evidence.finalState.cometAllowance === "0", "authority cleanup");
assert(
  evidence.finality.verified === true && evidence.finality.finalizedBlock >= evidence.finality.requiredThroughBlock,
  "finality",
);
const sources = [
  ["vault", "contracts/LeopoldVault.sol", evidence.finalSource.vaultSha256],
  ["adapter", "contracts/LeopoldCompoundAdapter.sol", evidence.finalSource.adapterSha256],
  ["wrapper", "contracts/LeopoldConfidentialUSDC.sol", evidence.finalSource.wrapperSha256],
] as const;
for (const [name, sourcePath, expected] of sources) {
  const current = createHash("sha256")
    .update(readFileSync(path.resolve(sourcePath)))
    .digest("hex");
  assert(current === expected, `${name} source hash`);
}
console.log(`LEOPOLD_COMPOUND_LIVE_EVIDENCE_VALID ${digest}`);
