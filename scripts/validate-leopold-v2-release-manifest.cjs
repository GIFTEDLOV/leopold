const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const manifestPath = resolve("config/leopold-v2-release.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hex40 = /^[0-9a-f]{40}$/u;
const hex64 = /^[0-9a-f]{64}$/u;

if (manifest.schema !== "leopold.v2-release-manifest.v1") throw new Error("V2 release manifest schema drift");
if (manifest.releaseStatus !== "PRE_OFFICIAL_REVIEW") throw new Error("V2 release manifest is not pre-official");
if (manifest.network?.chainId !== 11155111) throw new Error("V2 release manifest chain drift");
const binding = manifest.authorityBinding;
if (
  binding?.targetId !== "LEOPOLD_V2_SEPOLIA" ||
  binding?.targetScope !== "LEOPOLD_V2_RELEASE" ||
  binding?.path !== "scripts/sg4-hcu-authority-bindings/v2.json" ||
  binding?.schema !== "zama-szn4.sg4-hcu-authority-binding.v5" ||
  binding?.recordVersion !== 5
) {
  throw new Error("V2 release manifest does not select the exact V2 authority binding");
}
if (
  binding.historicalBindingPath !== "scripts/sg4-hcu-authority-binding.json" ||
  !hex64.test(binding.historicalBindingFileSha256) ||
  !hex64.test(binding.historicalBindingCanonicalSha256)
) {
  throw new Error("V2 release manifest historical supersession identity is incomplete");
}
if (
  !hex40.test(manifest.reviewedCandidate?.commit) ||
  !hex64.test(manifest.reviewedCandidate?.disposableProofEvidenceSha256)
) {
  throw new Error("V2 release manifest reviewed candidate evidence is incomplete");
}
if (
  manifest.contracts?.deploymentAddresses !== null ||
  manifest.deploymentBoundary?.officialV1ManifestUnchanged !== true ||
  manifest.deploymentBoundary?.officialDeploymentAuthorized !== false ||
  manifest.deploymentBoundary?.officialDeploymentPerformed !== false ||
  manifest.deploymentBoundary?.disposableTopologyOnly !== true
) {
  throw new Error("V2 release manifest crosses the official deployment boundary");
}
const compiler = manifest.compiler;
if (
  compiler?.version !== "0.8.27" ||
  compiler?.optimizerRuns !== 1 ||
  compiler?.viaIR !== true ||
  compiler?.evmVersion !== "cancun" ||
  compiler?.metadataBytecodeHash !== "none"
) {
  throw new Error("V2 release manifest compiler settings drift");
}
const hcu = manifest.hcu;
if (
  hcu?.selection?.total !== 13089448 ||
  hcu?.selection?.depth !== 2786064 ||
  hcu?.allocation?.total !== 12491672 ||
  hcu?.allocation?.depth !== 2374032 ||
  hcu?.ceilings?.totalExclusive !== 15000000 ||
  hcu?.ceilings?.depthExclusive !== 3750000
) {
  throw new Error("V2 release manifest HCU evidence drift");
}
if (manifest.independentReview?.required !== true || manifest.independentReview?.status !== "PENDING") {
  throw new Error("V2 release manifest review status must remain pending");
}

console.log(
  `LEOPOLD_V2_RELEASE_MANIFEST_VALID ${JSON.stringify({
    manifestSha256: sha256(readFileSync(manifestPath)),
    authorityBinding: binding.path,
    releaseStatus: manifest.releaseStatus,
    officialDeploymentPerformed: manifest.deploymentBoundary.officialDeploymentPerformed,
  })}`,
);
