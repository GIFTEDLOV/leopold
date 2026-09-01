const crypto = require("node:crypto");
const { Wallet, formatEther, getCreateAddress, getAddress, parseEther } = require("ethers");

const OFFICIAL_V2_CANDIDATE_SHA = "d6ebae63cec660fc5f11bd84e4b581980d3e12f7";
const OFFICIAL_V2_CANDIDATE_TREE = "359fc8c74413ec1c8705fa84149fc396be9f388e";
const SEPOLIA_CHAIN_ID = 11_155_111n;
const EXPECTED_DEPLOYER = "0x57357D26D1f56eca4556d271078A0239a7696Bbf";
const CANONICAL_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const COMPOUND_COMET = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";
const V2_VAULT_RUNTIME_SHA256 = "96020d75ea78c1adb8c80f56544e7ab381934f3563242946825fe343e3ddf301";
const V2_ESCROW_RUNTIME_SHA256 = "a6a01e2d15d6e125d12865b831a62b1b1448a0fd1e009315fdb8829dbfd33f52";
const V2_BINDING_FILE_SHA256 = "7225aff365e8965d4ac0f51769cf0fbbe6a738ab409abbc041c8425909175c6f";
const V2_BINDING_CANONICAL_SHA256 = "c219d034aa295a7abe5584dc0b9f5f4c8738e53733d64afc9fb0cde0e6f5be3c";
const HISTORICAL_BINDING_FILE_SHA256 = "4fa8642b9f1be977d9e8ca41c6ea9abfbfdda0c8d5e7160150dd76bb6036265c";
const V1_FREEZE_SHA256 = "38f11661d7871f3aeb253564f6ca7ec24d1eaded54bf2ac64be3cd7f839995c7";

// These values are inherited from the reviewed Sepolia product configuration. The only V2
// cadence selected for this single-vault official deployment is the existing Daily cadence.
const OFFICIAL_V2_CONFIGURATION = Object.freeze({
  vaultId: 1,
  vaultType: 0,
  vaultName: "Daily",
  roundDurationSeconds: 86_400,
  strategyMinimumEpochAgeSeconds: 60,
  bondWei: parseEther("0.005").toString(),
  rewardPerParticipantPassWei: parseEther("0.00125").toString(),
  refundPerCompletedParticipantWei: parseEther("0.0025").toString(),
  firstRoundOpensAt: "LATEST_VERIFIED_BLOCK_TIMESTAMP",
  sourceCadence: "config/leopold-frontend-contracts.json#officialVaults[0]",
  sourceEconomics: "config/leopold-frontend-contracts.json#settlementBondProfiles.demoSepolia",
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function lowerAddress(value, label) {
  try {
    return getAddress(value).toLowerCase();
  } catch {
    throw new Error(`${label}_MALFORMED`);
  }
}

function assertChainId(actual) {
  if (BigInt(actual) !== SEPOLIA_CHAIN_ID) throw new Error(`OFFICIAL_V2_WRONG_CHAIN:${actual}`);
}

function assertCandidateIdentity(candidateSha, candidateTree) {
  if (candidateSha !== OFFICIAL_V2_CANDIDATE_SHA) throw new Error("OFFICIAL_V2_STALE_CANDIDATE");
  if (candidateTree !== OFFICIAL_V2_CANDIDATE_TREE) throw new Error("OFFICIAL_V2_CANDIDATE_TREE_MISMATCH");
}

function assertCleanProvenance(provenance) {
  if (!provenance || provenance.clean !== true) throw new Error("OFFICIAL_V2_DIRTY_WORKTREE");
}

function assertSourceHashes(sourceHashes) {
  const expected = {
    "contracts/LeopoldVaultV2.sol": "ff12019fccf541bf2a48d4b18269d275f77f2bfb2bcbf315610d0cceb88af1e7",
    "contracts/LeopoldSettlementBondEscrowV2.sol": "5c67e94da167dab81c439294d493375b449151999cb2110c76a870a8891df181",
  };
  for (const [path, digest] of Object.entries(expected)) {
    if (sourceHashes?.[path] !== digest) throw new Error(`OFFICIAL_V2_SOURCE_HASH_MISMATCH:${path}`);
  }
}

function assertArtifactHashes(hashes) {
  if (hashes?.vault !== V2_VAULT_RUNTIME_SHA256) throw new Error("OFFICIAL_V2_VAULT_ARTIFACT_MISMATCH");
  if (hashes?.escrow !== V2_ESCROW_RUNTIME_SHA256) throw new Error("OFFICIAL_V2_ESCROW_ARTIFACT_MISMATCH");
}

function assertBindingHashes(hashes) {
  if (hashes?.file !== V2_BINDING_FILE_SHA256) throw new Error("OFFICIAL_V2_BINDING_FILE_MISMATCH");
  if (hashes?.canonical !== V2_BINDING_CANONICAL_SHA256) throw new Error("OFFICIAL_V2_BINDING_CANONICAL_MISMATCH");
}

function assertExternalConfiguration({ usdc, comet }) {
  if (lowerAddress(usdc, "OFFICIAL_V2_USDC") !== CANONICAL_USDC.toLowerCase()) {
    throw new Error("OFFICIAL_V2_CANONICAL_USDC_MISMATCH");
  }
  if (lowerAddress(comet, "OFFICIAL_V2_COMET") !== COMPOUND_COMET.toLowerCase()) {
    throw new Error("OFFICIAL_V2_COMPOUND_COMET_MISMATCH");
  }
}

function parseRpcUrls(primary, fallbackList) {
  const values = [primary, ...String(fallbackList ?? "").split(",")]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0)
    .map((value) => new URL(value).toString());
  const unique = [...new Set(values)];
  if (unique.length < 2) throw new Error("OFFICIAL_V2_RPC_QUORUM_REQUIRES_TWO_UNIQUE_ENDPOINTS");
  return unique;
}

function assertKeeperConfiguration(environment, deployer = EXPECTED_DEPLOYER) {
  const privateKey = String(environment?.KEEPER_PRIVATE_KEY ?? "");
  if (!/^0x[0-9a-fA-F]{64}$/u.test(privateKey)) throw new Error("OFFICIAL_V2_KEEPER_CREDENTIAL_MISSING_OR_MALFORMED");
  const keeperAddress = new Wallet(privateKey).address;
  if (lowerAddress(keeperAddress, "OFFICIAL_V2_KEEPER") === lowerAddress(deployer, "OFFICIAL_V2_DEPLOYER")) {
    throw new Error("OFFICIAL_V2_KEEPER_MUST_BE_DEDICATED");
  }
  const primary = String(environment?.SEPOLIA_RPC_URL ?? "").trim();
  if (primary.length === 0) throw new Error("OFFICIAL_V2_KEEPER_PRIMARY_RPC_MISSING");
  const rpcUrls = parseRpcUrls(primary, environment?.SEPOLIA_RPC_URLS);
  return { keeperAddress, rpcUrls };
}

function assertFreshAddresses(addresses, knownDisposableAddresses = []) {
  const seen = new Set();
  for (const [label, address] of Object.entries(addresses ?? {})) {
    const normalized = lowerAddress(address, `OFFICIAL_V2_${label.toUpperCase()}`);
    if (seen.has(normalized)) throw new Error("OFFICIAL_V2_TOPOLOGY_ADDRESS_COLLISION");
    seen.add(normalized);
    if (knownDisposableAddresses.map((item) => String(item).toLowerCase()).includes(normalized)) {
      throw new Error(`OFFICIAL_V2_DISPOSABLE_ADDRESS_REUSE:${label}`);
    }
  }
}

function assertRuntimeHash(actual, expected, label) {
  if (actual !== expected) throw new Error(`OFFICIAL_V2_RUNTIME_HASH_MISMATCH:${label}`);
}

function assertV1ManifestUntouched(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("OFFICIAL_V2_V1_MANIFEST_WAS_MODIFIED");
}

function validateOfficialManifest(manifest) {
  const required = [
    "implementation",
    "releaseEnvironment",
    "candidate",
    "chainId",
    "deployer",
    "keeperAddress",
    "wrapper",
    "vault",
    "escrow",
    "adapter",
    "canonicalUsdc",
    "compoundComet",
    "deployments",
    "constructorArguments",
    "runtimeHashes",
    "compiler",
    "deployment",
    "topology",
    "v1Preservation",
    "migrationPerformed",
  ];
  for (const key of required)
    if (!(key in (manifest ?? {}))) throw new Error(`OFFICIAL_V2_MANIFEST_FIELD_MISSING:${key}`);
  if (manifest.implementation !== "v2") throw new Error("OFFICIAL_V2_MANIFEST_IMPLEMENTATION_MISMATCH");
  if (manifest.releaseEnvironment !== "SEPOLIA_TESTNET") throw new Error("OFFICIAL_V2_MANIFEST_ENVIRONMENT_MISMATCH");
  assertCandidateIdentity(manifest.candidate.commit, manifest.candidate.tree);
  assertChainId(manifest.chainId);
  assertExternalConfiguration({ usdc: manifest.canonicalUsdc, comet: manifest.compoundComet });
  if (manifest.migrationPerformed !== false) throw new Error("OFFICIAL_V2_MIGRATION_MUST_BE_FALSE");
  if (manifest.v1Preservation?.unchanged !== true || manifest.v1Preservation?.migrationPerformed !== false) {
    throw new Error("OFFICIAL_V2_V1_PRESERVATION_INVALID");
  }
  assertArtifactHashes(manifest.runtimeHashes);
  assertBindingHashes(manifest.candidate.sg4Binding);
  assertFreshAddresses({
    wrapper: manifest.wrapper,
    vault: manifest.vault,
    escrow: manifest.escrow,
    adapter: manifest.adapter,
  });
  return true;
}

function deploymentAddressPlan(deployer, nonce) {
  const wrapper = getCreateAddress({ from: deployer, nonce });
  const vault = getCreateAddress({ from: deployer, nonce: nonce + 1 });
  // The V2 constructor creates adapter first and escrow second with CREATE nonce 1 and 2.
  const adapter = getCreateAddress({ from: vault, nonce: 1 });
  const escrow = getCreateAddress({ from: vault, nonce: 2 });
  return { wrapper, vault, adapter, escrow };
}

function calculateFundingPlan({ feePerGasWei, keeperGasTransactions = 20, participantGasWei = "0.01" } = {}) {
  const fee = BigInt(feePerGasWei ?? 0);
  if (fee <= 0n) throw new Error("OFFICIAL_V2_FEE_DATA_REQUIRED_FOR_FUNDING_PLAN");
  const keeperGas = 3_000_000n * BigInt(keeperGasTransactions) * fee;
  const participantGas = parseEther(participantGasWei) * 2n;
  const automationCredits = BigInt(OFFICIAL_V2_CONFIGURATION.bondWei) * 2n * 2n;
  const usdcPrincipalBaseUnits = 2_000n;
  return {
    feePerGasWei: fee.toString(),
    keeperGasWei: keeperGas.toString(),
    participantGasWei: participantGas.toString(),
    participantAutomationCreditWei: automationCredits.toString(),
    totalControlledEthWei: (keeperGas + participantGas + automationCredits).toString(),
    totalControlledEth: formatEther(keeperGas + participantGas + automationCredits),
    usdcPrincipalBaseUnits: usdcPrincipalBaseUnits.toString(),
    assumptions: {
      keeperTransactionsAtMaximumGas: keeperGasTransactions,
      keeperTransactionModel:
        "two participants, two nonempty rounds: close + two registrations + seven settlement writes per round",
      participantGasEthEach: participantGasWei,
      automationRoundsPerParticipant: 2,
      bondPerRoundWei: OFFICIAL_V2_CONFIGURATION.bondWei,
      usdcDecimals: 6,
    },
  };
}

module.exports = {
  OFFICIAL_V2_CANDIDATE_SHA,
  OFFICIAL_V2_CANDIDATE_TREE,
  SEPOLIA_CHAIN_ID,
  EXPECTED_DEPLOYER,
  CANONICAL_USDC,
  COMPOUND_COMET,
  V2_VAULT_RUNTIME_SHA256,
  V2_ESCROW_RUNTIME_SHA256,
  V2_BINDING_FILE_SHA256,
  V2_BINDING_CANONICAL_SHA256,
  HISTORICAL_BINDING_FILE_SHA256,
  V1_FREEZE_SHA256,
  OFFICIAL_V2_CONFIGURATION,
  sha256,
  assertChainId,
  assertCandidateIdentity,
  assertCleanProvenance,
  assertSourceHashes,
  assertArtifactHashes,
  assertBindingHashes,
  assertExternalConfiguration,
  parseRpcUrls,
  assertKeeperConfiguration,
  assertFreshAddresses,
  assertRuntimeHash,
  assertV1ManifestUntouched,
  validateOfficialManifest,
  deploymentAddressPlan,
  calculateFundingPlan,
};
