const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const policy = require("./leopold-v2-official-deployment-policy.cjs");
const runtimeVerifier = require("./leopold-v2-runtime-verifier.cjs");

const validKey = "0x" + "11".repeat(32);
const validEnvironment = {
  KEEPER_PRIVATE_KEY: validKey,
  SEPOLIA_RPC_URL: "https://primary.example/",
  SEPOLIA_RPC_URLS: "https://secondary.example/",
};

test("rejects a wrong chain", () => {
  assert.throws(() => policy.assertChainId(1), /OFFICIAL_V2_WRONG_CHAIN/u);
});

test("rejects a stale candidate SHA or tree", () => {
  assert.throws(
    () => policy.assertCandidateIdentity("0".repeat(40), policy.OFFICIAL_V2_CANDIDATE_TREE),
    /OFFICIAL_V2_STALE_CANDIDATE/u,
  );
  assert.throws(
    () => policy.assertCandidateIdentity(policy.OFFICIAL_V2_CANDIDATE_SHA, "0".repeat(40)),
    /OFFICIAL_V2_CANDIDATE_TREE_MISMATCH/u,
  );
});

test("rejects a dirty worktree", () => {
  assert.throws(() => policy.assertCleanProvenance({ clean: false }), /OFFICIAL_V2_DIRTY_WORKTREE/u);
});

test("rejects disposable address reuse and topology collisions", () => {
  assert.throws(
    () =>
      policy.assertFreshAddresses({ vault: "0x0000000000000000000000000000000000000001" }, [
        "0x0000000000000000000000000000000000000001",
      ]),
    /OFFICIAL_V2_DISPOSABLE_ADDRESS_REUSE/u,
  );
  assert.throws(
    () =>
      policy.assertFreshAddresses({
        vault: "0x0000000000000000000000000000000000000001",
        escrow: "0x0000000000000000000000000000000000000001",
      }),
    /OFFICIAL_V2_TOPOLOGY_ADDRESS_COLLISION/u,
  );
});

test("rejects runtime, USDC, and Compound identity drift", () => {
  assert.throws(
    () => policy.assertRuntimeHash("0".repeat(64), policy.V2_VAULT_RUNTIME_SHA256, "vault"),
    /OFFICIAL_V2_RUNTIME_HASH_MISMATCH/u,
  );
  assert.throws(
    () =>
      policy.assertExternalConfiguration({
        usdc: "0x0000000000000000000000000000000000000001",
        comet: policy.COMPOUND_COMET,
      }),
    /OFFICIAL_V2_CANONICAL_USDC_MISMATCH/u,
  );
  assert.throws(
    () =>
      policy.assertExternalConfiguration({
        usdc: policy.CANONICAL_USDC,
        comet: "0x0000000000000000000000000000000000000001",
      }),
    /OFFICIAL_V2_COMPOUND_COMET_MISMATCH/u,
  );
});

test("reproduces the historical Comet/base-token argument mix-up and accepts only the corrected mapping", () => {
  assert.throws(
    () =>
      policy.assertExternalConfiguration({
        usdc: policy.CANONICAL_USDC,
        comet: policy.CANONICAL_USDC,
      }),
    /OFFICIAL_V2_COMPOUND_COMET_MISMATCH/u,
  );
  assert.doesNotThrow(() =>
    policy.assertExternalConfiguration({ usdc: policy.CANONICAL_USDC, comet: policy.COMPOUND_COMET }),
  );
});

test("the official runner keeps the configured Comet address separate from Comet baseToken", () => {
  const runner = fs.readFileSync(`${process.cwd()}/scripts/deploy-leopold-v2-official.ts`, "utf8");
  assert.match(runner, /assertExternalConfiguration\(\{ usdc: underlying, comet: adapterComet \}\)/u);
  assert.match(runner, /assertExternalConfiguration\(\{ usdc: baseToken, comet: policy\.COMPOUND_COMET \}\)/u);
  assert.doesNotMatch(runner, /assertExternalConfiguration\(\{ usdc: underlying, comet: baseToken \}\)/u);
  assert.match(runner, /verifyRuntimeTemplate/u);
});

test("normalizes constructor immutables while requiring exact immutable values", () => {
  const variants = runtimeVerifier
    .buildInfoVariants(process.cwd(), "contracts/LeopoldVaultV2.sol", "LeopoldVaultV2")
    .filter((variant) => variant.deployedBytecode.length === 23_531);
  assert.ok(variants.length > 0);
  const template = variants[0];
  const live = Buffer.from(template.deployedBytecode);
  for (const reference of template.immutableReferences)
    live.fill(0xab, reference.start, reference.start + reference.length);
  const result = runtimeVerifier.verifyRuntimeTemplate({
    root: process.cwd(),
    liveCode: `0x${live.toString("hex")}`,
    sourceName: "contracts/LeopoldVaultV2.sol",
    contractName: "LeopoldVaultV2",
    label: "vault",
    expectedNormalizedSha256: policy.V2_VAULT_RUNTIME_SHA256,
  });
  assert.equal(result.normalizedRuntimeSha256, policy.V2_VAULT_RUNTIME_SHA256);
  assert.doesNotThrow(() => policy.assertImmutableValue(policy.COMPOUND_COMET, policy.COMPOUND_COMET, "vault.comet"));
  assert.throws(
    () =>
      policy.assertImmutableValue("0x0000000000000000000000000000000000000001", policy.COMPOUND_COMET, "vault.comet"),
    /OFFICIAL_V2_IMMUTABLE_MISMATCH:vault\.comet/u,
  );
  assert.throws(
    () =>
      policy.assertImmutableValue("0x0000000000000000000000000000000000000001", policy.CANONICAL_USDC, "vault.usdc"),
    /OFFICIAL_V2_IMMUTABLE_MISMATCH:vault\.usdc/u,
  );
  assert.doesNotThrow(() =>
    policy.assertImmutableValue(policy.CANONICAL_USDC.toLowerCase(), policy.CANONICAL_USDC, "vault.usdc"),
  );
});

test("fails closed for wrong normalized runtime, malformed bytecode, and short bytecode", () => {
  const variants = runtimeVerifier
    .buildInfoVariants(process.cwd(), "contracts/LeopoldVaultV2.sol", "LeopoldVaultV2")
    .filter((variant) => variant.deployedBytecode.length === 23_531);
  const template = variants[0];
  const wrong = Buffer.from(template.deployedBytecode);
  const nonImmutableOffset = [...Array(wrong.length).keys()].find(
    (offset) =>
      !template.immutableReferences.some(
        (reference) => offset >= reference.start && offset < reference.start + reference.length,
      ),
  );
  wrong[nonImmutableOffset] ^= 0xff;
  assert.throws(
    () =>
      runtimeVerifier.verifyRuntimeTemplate({
        root: process.cwd(),
        liveCode: `0x${wrong.toString("hex")}`,
        sourceName: "contracts/LeopoldVaultV2.sol",
        contractName: "LeopoldVaultV2",
        label: "vault",
        expectedNormalizedSha256: policy.V2_VAULT_RUNTIME_SHA256,
      }),
    /OFFICIAL_V2_RUNTIME_TEMPLATE_MISMATCH:vault/u,
  );
  assert.throws(
    () =>
      runtimeVerifier.verifyRuntimeTemplate({
        root: process.cwd(),
        liveCode: "0x",
        sourceName: "contracts/LeopoldVaultV2.sol",
        contractName: "LeopoldVaultV2",
        label: "vault",
        expectedNormalizedSha256: policy.V2_VAULT_RUNTIME_SHA256,
      }),
    /OFFICIAL_V2_RUNTIME_BYTECODE_EMPTY:vault/u,
  );
  assert.throws(
    () =>
      runtimeVerifier.verifyRuntimeTemplate({
        root: process.cwd(),
        liveCode: "0x00",
        sourceName: "contracts/LeopoldVaultV2.sol",
        contractName: "LeopoldVaultV2",
        label: "vault",
        expectedNormalizedSha256: policy.V2_VAULT_RUNTIME_SHA256,
      }),
    /OFFICIAL_V2_RUNTIME_SIZE_MISMATCH:vault/u,
  );
  assert.throws(
    () =>
      runtimeVerifier.verifyRuntimeTemplate({
        root: process.cwd(),
        liveCode: "0x0",
        sourceName: "contracts/LeopoldVaultV2.sol",
        contractName: "LeopoldVaultV2",
        label: "vault",
        expectedNormalizedSha256: policy.V2_VAULT_RUNTIME_SHA256,
      }),
    /OFFICIAL_V2_RUNTIME_BYTECODE_MALFORMED:vault/u,
  );
});

test("validates unresolved deployment attempt records without declaring adoption", () => {
  const record = require("/tmp/leopold-v2-official-attempt-unresolved.json");
  assert.equal(policy.validateUnresolvedAttemptRecord(record), true);
  assert.throws(
    () => policy.validateUnresolvedAttemptRecord({ ...record, status: "OFFICIAL_V2_DEPLOYED" }),
    /OFFICIAL_V2_UNRESOLVED_ATTEMPT_STATUS_INVALID/u,
  );
});

test("requires a truthful project-owner adoption transition for adopted evidence", () => {
  assert.throws(() => policy.validateAdoptedOfficialManifest({}), /OFFICIAL_V2_MANIFEST_FIELD_MISSING/u);
});

test("accepts the reviewed schema's SG-4 fileSha256 field without weakening the digest", () => {
  assert.doesNotThrow(() =>
    policy.assertBindingHashes({
      fileSha256: policy.V2_BINDING_FILE_SHA256,
      canonicalSha256: policy.V2_BINDING_CANONICAL_SHA256,
    }),
  );
  assert.throws(
    () =>
      policy.assertBindingHashes({
        fileSha256: "0".repeat(64),
        canonicalSha256: policy.V2_BINDING_CANONICAL_SHA256,
      }),
    /OFFICIAL_V2_BINDING_FILE_MISMATCH/u,
  );
});

test("requires a dedicated keeper and a strict two-endpoint quorum", () => {
  assert.throws(
    () => policy.assertKeeperConfiguration({}, policy.EXPECTED_DEPLOYER),
    /OFFICIAL_V2_KEEPER_CREDENTIAL_MISSING_OR_MALFORMED/u,
  );
  assert.throws(
    () => policy.assertKeeperConfiguration({ ...validEnvironment, SEPOLIA_RPC_URLS: "" }, policy.EXPECTED_DEPLOYER),
    /OFFICIAL_V2_RPC_QUORUM_REQUIRES_TWO_UNIQUE_ENDPOINTS/u,
  );
  assert.throws(
    () =>
      policy.assertKeeperConfiguration(
        { ...validEnvironment, SEPOLIA_RPC_URLS: validEnvironment.SEPOLIA_RPC_URL },
        policy.EXPECTED_DEPLOYER,
      ),
    /OFFICIAL_V2_RPC_QUORUM_REQUIRES_TWO_UNIQUE_ENDPOINTS/u,
  );
  assert.throws(
    () =>
      policy.assertKeeperConfiguration(
        { ...validEnvironment, KEEPER_PRIVATE_KEY: "0x" + "22".repeat(32) },
        new (require("ethers").Wallet)("0x" + "22".repeat(32)).address,
      ),
    /OFFICIAL_V2_KEEPER_MUST_BE_DEDICATED/u,
  );
});

test("rejects an incomplete official manifest", () => {
  assert.throws(() => policy.validateOfficialManifest({}), /OFFICIAL_V2_MANIFEST_FIELD_MISSING/u);
});

test("rejects any V1 manifest mutation", () => {
  assert.throws(
    () => policy.assertV1ManifestUntouched({ schema: "v1" }, { schema: "v1", migrationPerformed: true }),
    /OFFICIAL_V2_V1_MANIFEST_WAS_MODIFIED/u,
  );
});

test("derives the reviewed production Daily plan without disposable cadence", () => {
  assert.equal(policy.OFFICIAL_V2_CONFIGURATION.roundDurationSeconds, 86_400);
  assert.equal(
    policy.OFFICIAL_V2_CONFIGURATION.sourceCadence,
    "config/leopold-frontend-contracts.json#officialVaults[0]",
  );
  assert.equal(policy.OFFICIAL_V2_CONFIGURATION.vaultName, "Daily");
});

test("rejects invalid RPC URLs and accepts two unique configured endpoints", () => {
  assert.throws(() => policy.parseRpcUrls("not-a-url", "https://secondary.example/"));
  assert.deepEqual(policy.parseRpcUrls(validEnvironment.SEPOLIA_RPC_URL, validEnvironment.SEPOLIA_RPC_URLS), [
    "https://primary.example/",
    "https://secondary.example/",
  ]);
});

test("calculates the controlled two-round funding envelope without broadcasting", () => {
  const plan = policy.calculateFundingPlan({ feePerGasWei: "2101516580" });
  assert.equal(plan.assumptions.keeperTransactionsAtMaximumGas, 20);
  assert.equal(plan.keeperGasWei, "126090994800000000");
  assert.equal(plan.participantGasWei, "20000000000000000");
  assert.equal(plan.participantAutomationCreditWei, "20000000000000000");
  assert.equal(plan.totalControlledEth, "0.1660909948");
  assert.equal(plan.usdcPrincipalBaseUnits, "2000");
});
