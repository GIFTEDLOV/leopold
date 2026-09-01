/* Deterministic, offline CP0/SG-4 HCU-authority protocol preregistration.
 *
 * This module is pure: no timestamp, no randomness, no network, no provider, no wallet, no Hardhat
 * runtime, and no filesystem mutation. Every value below is a committed literal. The verifier in
 * `scripts/sg4-hcu-authority.ts` recomputes the corresponding installed values and compares them
 * against these literals, so drift in the installed tree fails rather than silently redefining the
 * authority.
 */

import {
  HCU_DEPTH_SAFETY_THRESHOLD,
  HCU_TOTAL_SAFETY_THRESHOLD,
  HCU_TRANSACTION_DEPTH_CEILING,
  HCU_TRANSACTION_TOTAL_CEILING,
  SG4_CANONICAL_OPERATION_VARIANTS,
  type CanonicalOperationVariant,
} from "./sg4-protocol";

/* INVARIANT A — re-exported so the verifier consumes the SAME canonical manifest the benchmark
 * layer derived from its registered circuits, rather than a copy. */
export { SG4_CANONICAL_OPERATION_VARIANTS };
export type { CanonicalOperationVariant };

/* v3 adds a separately authenticated executor artifact chain. An executor proxy is accepted only
 * after its shell, exact ERC-1967 implementation, pinned implementation address, and independently
 * reproduced implementation runtime all verify in order. */
export const AUTHORITY_PROTOCOL_VERSION = "sg4-hcu-authority-protocol/v3";
export const AUTHORITY_PROTOCOL_SCHEMA = "zama-szn4.sg4-hcu-authority-protocol.v3";
export const AUTHORITY_RESULT_SCHEMA = "urn:zama-szn4:sg4-hcu-authority-result:v3";

/* ---------------------------------------------------------------------------------------------
 * Network identity and configured host contracts.
 * ------------------------------------------------------------------------------------------- */

export const SEPOLIA_CHAIN_ID = 11_155_111n;

/* Configured FHEVMExecutor ("CoprocessorAddress") for Sepolia. Two independently installed sources
 * agree on this value: `@fhevm/solidity` config/ZamaConfig.sol `_getSepoliaConfig()` and
 * `@fhevm/hardhat-plugin` src/internal/constants.ts. Agreement is asserted below. */
export const SEPOLIA_EXECUTOR_ADDRESS = "0x92C920834Ec8941d2C77D188936E1f7A6f49c127";

/* The plugin also ships a hardcoded HCULimit address. It is NOT authority for SG-4: the authority
 * contract must be derived from the verified executor at a pinned block. Registered here only so
 * the verifier can reject any result traceable to it. */
export const STALE_PLUGIN_HCU_LIMIT = {
  package: "@fhevm/hardhat-plugin",
  version: "0.4.2",
  path: "src/internal/constants.ts",
  symbol: "constants.ZAMA_FHE_RELAYER_SDK_PACKAGE.sepolia.HCULimitAddress",
  sepoliaValue: "0x594BB474275918AF9609814E68C61B1587c5F838",
  mainnetValue: "0x00000074275918AF9609814E68C61B1587c5F838",
} as const;

/* ---------------------------------------------------------------------------------------------
 * F33 — two roots, not one.
 *
 * The single `AUTHORITY_ROOT` conflated two unrelated things and made a current-official deployed
 * authority unable to pass without the obsolete local 0.10.0 package. They are now separate:
 *
 *   LOCAL_AUTHORITY_FIXTURE_ROOT   the installed @fhevm/host-contracts package. It is a FIXTURE.
 *                                  Its exact pin is a repository-hygiene control checked offline,
 *                                  and it is NEVER a live-PASS condition.
 *   MEASUREMENT_TOOLCHAIN_ROOT     the installed calculator and cost table SG-4 actually benchmarks
 *                                  with. This one IS PASS-relevant: every measured HCU number comes
 *                                  from it, so a change invalidates the measurements.
 *   DEPLOYED_AUTHORITY_ROOT_POLICY the deployed authority artifact, which is not a local package at
 *                                  all. It is derived from the reviewed binding record and its
 *                                  selected current-official provenance tuple.
 * ------------------------------------------------------------------------------------------- */

export const LOCAL_AUTHORITY_FIXTURE_ROOT = {
  package: "@fhevm/host-contracts",
  version: "0.10.0",
  integrity: "sha512-lpJi5ktriK55tn5UGmIbOLtQwni2mkVITHqsy4opP+nexinLU/9NCzQi/TQllANpd7Q3f4y5Ukg3JbC942FcRA==",
  manifestSection: "devDependencies",
  exactPinRequired: true,
  rangeSpecifierAllowed: false,
  /* F33 — stated in the protocol itself so no reader can mistake it for the deployed authority. */
  role: "LOCAL_SELF_TEST_FIXTURE_ONLY",
  passRelevant: false,
  rationale:
    "0.10.0 is not the deployed authority. Requiring its package, version or integrity for a live PASS would make the gate verify node_modules instead of Sepolia, and would make any current-official deployment unpassable.",
} as const;

/* Retained name for the offline direct/lockfile pin checks, which are about the repository rather
 * than about the deployed authority. */
export const AUTHORITY_ROOT = LOCAL_AUTHORITY_FIXTURE_ROOT;

/* The toolchain every measured HCU number is produced by. PASS-relevant, and local by nature: the
 * calculator SG-4 measures with genuinely is the installed one. */
export const MEASUREMENT_TOOLCHAIN_ROOT = {
  package: "@fhevm/mock-utils",
  version: "0.4.2",
  integrity: "sha512-Rojeqr5tC7Vie2JrSjhs4kl7y6K+wElme9z9W0h9yH0IcBX37ZzQxBuMwa5ogKEd4auBLBDXxDFIxsVj0HkGIg==",
  manifestSection: "dependencies",
  calculatorPath: "fhevm/coprocessor/hcu.ts",
  costTablePath: "fhevm/coprocessor/HCUByOperator.ts",
  exactPinRequired: true,
  rangeSpecifierAllowed: false,
  passRelevant: true,
} as const;

/* ---------------------------------------------------------------------------------------------
 * INVARIANT F — the EXACT transitive local files that influence an HCU number.
 *
 * "Calculator integrity" used to pool unrelated files: the hardhat plugin's constants, the Solidity
 * config, and the obsolete local HCULimit fixture were all hashed into one blocking result. A drift
 * in any of them blocked a live PASS even though none of them can change a computed HCU value.
 *
 * These two files can. `hcu.ts` computes it; `HCUByOperator.ts` is the table it reads. Everything
 * else is either provenance material (checked as provenance) or repository hygiene (reported, not
 * blocking).
 * ------------------------------------------------------------------------------------------- */

export const MEASUREMENT_EXECUTION_RELEVANT_FILES: readonly string[] = [
  "@fhevm/mock-utils:fhevm/coprocessor/HCUByOperator.ts",
  "@fhevm/mock-utils:fhevm/coprocessor/hcu.ts",
];

/* Files that are checked, reported, and NEVER blocking for a live authority PASS. */
export const REPOSITORY_HYGIENE_FILES: readonly string[] = [
  "@fhevm/hardhat-plugin:src/internal/constants.ts",
  "@fhevm/host-contracts:artifacts/contracts/HCULimit.sol/HCULimit.json",
  "@fhevm/host-contracts:contracts/FHEVMExecutor.sol",
  "@fhevm/host-contracts:contracts/HCULimit.sol",
  "@fhevm/mock-utils:fhevm/coprocessor/CoprocessorEvents.ts",
  "@fhevm/solidity:config/ZamaConfig.sol",
];

export const MEASUREMENT_ROOT_VERIFICATION = {
  /* Independent of the record: the installed package's own metadata plus the lockfile's resolution
   * and integrity. A record claiming a measurement root cannot also be the evidence for it. */
  sources: ["INSTALLED_PACKAGE_MANIFEST", "PNPM_LOCKFILE_RESOLUTION", "EXECUTION_RELEVANT_FILE_HASHES"],
  results: ["MISMATCH", "UNRESOLVED", "VERIFIED"],
  rationale:
    "Every measured HCU number is produced by these exact installed files. Their identity is therefore PASS-relevant, and it is established from the installation itself rather than from the record that depends on it.",
} as const;

/* The deployed authority is not a package. Its identity is whatever the reviewed record selected,
 * cross-linked to the current-official provenance tuple; nothing about it is knowable locally. */
export const DEPLOYED_AUTHORITY_ROOT_POLICY = {
  derivedFrom: "AUTHORITY_BINDING_RECORD",
  provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
  fields: ["artifactId", "commit", "contentSha256", "path", "repository", "tag"],
  localPackageMayNotSubstitute: true,
  rationale:
    "The enforced ceilings are defined by the code deployed on Sepolia, whose upstream revision is named by the selected provenance tuple. A local package pin is evidence about the repository, never about that deployment.",
} as const;

/* SHA-256 of the installed files the authority depends on. Recomputed and compared by the verifier. */
export const EXPECTED_SOURCE_HASHES = {
  "@fhevm/host-contracts:contracts/HCULimit.sol": "3742194e2fa4c89cdf7352dff260f7f5c0a6b1a4c45bb3dc9079da70fb47ab20",
  "@fhevm/host-contracts:contracts/FHEVMExecutor.sol":
    "d6bf4ed4497ded47bd39d61eb86920751f61250b9008358152a83efc4cb9003c",
  "@fhevm/host-contracts:artifacts/contracts/HCULimit.sol/HCULimit.json":
    "66af82206e9265697483e243e48bdcf08e1a0a595bcf6b260a35cfba56137af2",
  "@fhevm/mock-utils:fhevm/coprocessor/CoprocessorEvents.ts":
    "f0595400616274b89f06f9274974522eba2bee0483ba42cda3b5c2b0b4e09d3d",
  "@fhevm/hardhat-plugin:src/internal/constants.ts": "47b3dab01d072926215050bc3c1fffcedb32f3890c5d2649d8d4f7367712e962",
  "@fhevm/solidity:config/ZamaConfig.sol": "4722eb07a90a6098d510f8e880865a7bbb7389ed26137857aaa36d49a0a42f8a",
} as const;

/* The HCU calculator and the operation cost table are hashed separately: a change in either one
 * invalidates every measured HCU number, independently of the enforced ceilings. */
export const EXPECTED_CALCULATOR_HASH = "9baddc2fdd7c4d6423928b5b9ac568aed9d80b03913df9a1ca166cc51d1896ba";
export const EXPECTED_COST_TABLE_HASH = "dbe4e9cc500544a8750a37f5526e0e9907427b78ac17d3c49f079d9d21314aa1";

/* ---------------------------------------------------------------------------------------------
 * The two enforced per-transaction controls.
 *
 * Both are `private constant` in HCULimit.sol and have no getter, so their values are established
 * from the executable enforcement path and confirmed by address-normalized bytecode identity —
 * never from a comment and never from an observed revert.
 * ------------------------------------------------------------------------------------------- */

/* The single definition lives in the benchmark layer; these are the authority-side names for it.
 * One definition, two names, no drift and no import cycle. */
export const TRANSACTION_TOTAL_HCU_LIMIT = HCU_TRANSACTION_TOTAL_CEILING;
export const TRANSACTION_DEPTH_HCU_LIMIT = HCU_TRANSACTION_DEPTH_CEILING;
export const TOTAL_SAFETY_THRESHOLD = HCU_TOTAL_SAFETY_THRESHOLD;
export const DEPTH_SAFETY_THRESHOLD = HCU_DEPTH_SAFETY_THRESHOLD;

/* ---------------------------------------------------------------------------------------------
 * Network ceiling semantics.
 *
 * The locally installed @fhevm/host-contracts@0.10.0 reverts on `>=`, which makes its configured
 * ceilings EXCLUSIVE upper bounds. The prior reviewed current-Sepolia investigation established a
 * different deployed-stack expectation: the current v0.3 HCULimit uses `>` checks, which makes the
 * configured 20,000,000 and 5,000,000 ceilings INCLUSIVE.
 *
 * These are different claims about different implementations and are recorded separately. Neither
 * may be pinned as the PASS requirement: a live PASS must resolve the semantics from the verified
 * authoritative deployed implementation itself.
 *
 * None of this touches the internal SG-4 75% safety policy, which is strict `<` in every case.
 * ------------------------------------------------------------------------------------------- */

export type LiveLimitSemantics =
  | "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN"
  | "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL"
  | "UNRESOLVED";

export const LIVE_LIMIT_SEMANTICS_VALUES: readonly string[] = [
  "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL",
  "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN",
  "UNRESOLVED",
];

/* Greatest value a configured ceiling accepts under each semantics. This is the coherence rule the
 * verifier enforces between the operator, the boundary, and the greatest accepted value. */
export function greatestAcceptedValue(semantics: LiveLimitSemantics, ceiling: bigint): bigint | null {
  if (semantics === "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN") return ceiling;
  if (semantics === "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL") return ceiling - 1n;
  return null;
}

export const LOCAL_INSTALLED_LIMIT_SEMANTICS = {
  state: "LOCAL_EXPECTED_PENDING_LIVE_BINDING" as const,
  blocking: true,
  semantics: "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL" as LiveLimitSemantics,
  source: "@fhevm/host-contracts@0.10.0 contracts/HCULimit.sol",
  comparisonOperator: ">=",
  configuredTotalCeiling: "20000000",
  configuredDepthCeiling: "5000000",
  greatestAcceptedTotal: "19999999",
  greatestAcceptedDepth: "4999999",
  note: "Read from the installed artifact only. It describes the locally packaged implementation, which the prior reviewed investigation reports is NOT the current deployed stack.",
};

export const PRIOR_REVIEWED_CURRENT_DEPLOYMENT_LIMIT_SEMANTICS = {
  state: "EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION" as const,
  blocking: true,
  semantics: "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN" as LiveLimitSemantics,
  source: "PRIOR_REVIEWED_SG4_HCU_AUTHORITY_INVESTIGATION (current v0.3 HCULimit)",
  comparisonOperator: ">",
  configuredTotalCeiling: "20000000",
  configuredDepthCeiling: "5000000",
  greatestAcceptedTotal: "20000000",
  greatestAcceptedDepth: "5000000",
  configuredCeilingIsInclusive: true,
  pendingIndependentDeploymentAndSourceVerification: true,
};

export const LIMIT_SEMANTICS_AUTHORITY = {
  resolvedState: "UNRESOLVED" as LiveLimitSemantics,
  blocking: true,
  localInstalled: LOCAL_INSTALLED_LIMIT_SEMANTICS,
  priorReviewedCurrentDeployment: PRIOR_REVIEWED_CURRENT_DEPLOYMENT_LIMIT_SEMANTICS,
  disagreement: {
    kind: "ENFORCEMENT_OPERATOR_AND_CEILING_INCLUSIVITY_DISAGREEMENT",
    localOperator: ">=",
    priorReviewedCurrentOperator: ">",
    localGreatestAcceptedTotal: "19999999",
    priorReviewedGreatestAcceptedTotal: "20000000",
    statement:
      "The installed 0.10.0 implementation reverts on >= and therefore treats the configured ceiling as exclusive. The prior reviewed investigation reports the current deployed v0.3 HCULimit reverts on > and therefore treats the configured ceiling as inclusive. Offline material cannot decide which the deployed implementation uses, so the resolved semantics are UNRESOLVED and blocking.",
  },
  passRequires: [
    "coherence between the enforcement operator, the configured boundary, and the greatest accepted value",
    "limit values and enforcement paths bound to that same implementation",
    "semantics resolved from the verified authoritative deployed implementation",
  ],
  /* The internal safety policy is unaffected by whichever network semantics turn out to hold. */
  internalSafetyPolicyIsIndependent: true,
  internalSafetyComparisonRemainsStrict: true,
  internalSafetyEqualityVerdict: "NO_GO",
};

/* Receipt-derived measurements produced by `hre.fhevm.computeTransactionHCU(receipt)`. */
export const MEASUREMENT_MAPPING = {
  globalHCU: "TRANSACTION_TOTAL_HCU",
  maxHCUDepth: "TRANSACTION_DEPTH_HCU",
} as const;

/* `LOCAL_EXPECTED_PENDING_LIVE_BINDING` is the honest offline state for a control whose value was
 * read from the installed, integrity-pinned implementation but has not yet been bound to the exact
 * deployed implementation at a pinned block. It carries a value, and it blocks: an expectation is
 * not a verified deployment fact. Only the live verifier may promote it to PROVEN_PRESENT. */
export type AuthorityState =
  | "PROVEN_PRESENT"
  | "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION"
  | "LOCAL_EXPECTED_PENDING_LIVE_BINDING"
  | "UNRESOLVED"
  | "NOT_APPLICABLE";

/* ---------------------------------------------------------------------------------------------
 * Address-normalized bytecode verification plan.
 *
 * The published `@fhevm/host-contracts` artifact is a chainId-31337 build: it embeds the LOCAL
 * executor address, not Sepolia's. A byte-for-byte comparison against the live Sepolia
 * implementation therefore fails in exactly the address immediates while the contract is
 * semantically identical. Only those exact, predeclared offsets may be normalized.
 * ------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------
 * THE INDEPENDENTLY REPRODUCED OFFICIAL BUILD.
 *
 * The v0.13.2 HCULimit build was reproduced twice from clean checkouts and was byte-for-byte
 * identical both times, so its identity is PINNED here as an expectation. A binding record must
 * match these facts exactly; it cannot nominate an arbitrary 64-hex digest and mark it reverified.
 *
 * The build output is NOT committed to this repository. It is an external reviewed input: commit B
 * carries and authenticates the actual bytes through `sourceMaterial.officialArtifactBuild`. What
 * lives here is the recipe and the expected result of following it.
 * ------------------------------------------------------------------------------------------- */

export const REPRODUCED_BUILD_PROVENANCE_KIND = "REPRODUCED_BUILD";

export const REPRODUCED_OFFICIAL_BUILD = {
  kind: REPRODUCED_BUILD_PROVENANCE_KIND,
  /* The source tree the build was produced FROM. Generated output is not committed at any path in
   * it, so this identifies the tree and deliberately declares no repository file path. */
  repository: "https://github.com/zama-ai/fhevm",
  tag: "v0.13.2",
  commit: "07fb05fb75f0aa6cea934088640ddb4539d0b1b9",
  buildRoot: "host-contracts",
  selectedSourcePath: "contracts/HCULimit.sol",
  selectedContractName: "HCULimit",

  /* The authenticated source the build compiled. Cross-checked against the build-info's own input
   * source content, so a reproducible build of a DIFFERENT HCULimit cannot satisfy the gate. */
  authoritySourceSha256: "16d71ee5f899f1bfd5872bdb83e08d90f510fd529cd8a93d5001dc29f25634b8",

  /* The reproduction recipe. */
  reproductionCommand: "HARDHAT_NETWORK=hardhat npx hardhat compile:specific --contract contracts/HCULimit.sol",
  dependencyLockSha256: "a776b0091003101212a877924358a50192c1d76d58cb3cad7849eb9f5fdac64c",
  hardhatConfigSha256: "99c41c5aff0f395ebffb82dc031238b9a94b7d1703307d94f85dbda67dd07e93",
  generatedHostAddressesSha256: "fdb91c77b4e0b138dd704d8b001c4d435ea3b91ddd5bbe42db4b58a284d3d9c8",
  aclAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
  fhevmExecutorAddress: "0x92C920834Ec8941d2C77D188936E1f7A6f49c127",

  /* The exact result of following it. */
  buildInfoId: "c73f6a31ecc6791fd9a8488a9facd93e",
  buildInfoSha256: "b0d9caeb6c3d0747b0889a6d231877d475a4f1ae57c0f7352a6a3eb1ad844396",
  /* Supporting output evidence: the Hardhat artifact the same build emitted. Not the production
   * input — production consumes build-info — but recorded so a reviewer can check both. */
  artifactJsonSha256: "71cf5d19250a045b96bf4c84b146300e6af1fad15880c8ff4783013b0f700dbe",
  solcVersion: "0.8.24",
  solcLongVersion: "0.8.24+commit.e11b9ed9",

  reproducedIndependently: true,
  reproductionRuns: 2,
  runsAgreedByteForByte: true,
} as const;

/* The executor is a distinct compiled artifact. It shares the upstream source tree and compiler
 * family with HCULimit, but has its own selected source, generated-address input, build-info and
 * runtime layout. It must never be accepted through the HCULimit build provenance. */
export const REPRODUCED_OFFICIAL_EXECUTOR_BUILD = {
  kind: REPRODUCED_BUILD_PROVENANCE_KIND,
  repository: "https://github.com/zama-ai/fhevm",
  tag: "v0.13.2",
  commit: "07fb05fb75f0aa6cea934088640ddb4539d0b1b9",
  buildRoot: "host-contracts",
  selectedSourcePath: "contracts/FHEVMExecutor.sol",
  selectedContractName: "FHEVMExecutor",
  executorSourceSha256: "457f29242f4028442a5332e0b009aeef69cb30f7e9361683680d46ef33a2add9",
  reproductionCommand: "HARDHAT_NETWORK=hardhat npx hardhat compile:specific --contract contracts/FHEVMExecutor.sol",
  dependencyLockSha256: "a776b0091003101212a877924358a50192c1d76d58cb3cad7849eb9f5fdac64c",
  hardhatConfigSha256: "99c41c5aff0f395ebffb82dc031238b9a94b7d1703307d94f85dbda67dd07e93",
  upstreamSepoliaHostConfigurationSha256: "2cc1578666ec51d0ebe3b386516e74fe1f3f1963bf7629c6a8a173f35a729a26",
  generatedHostAddressesSha256: "9194c8b8e085aa4372d5dc70c8bf76fd3b645257437364f8ed8c4b9742bed8cc",
  buildInfoId: "4d775fb2ba96328ce842168d97046c84",
  buildInfoSha256: "50ed161472e207da6462aa180856d0047aa52396abdba05e9bf566f5ccfd63dd",
  artifactJsonSha256: "ccb20916c2989f8814ae2844c873bf43b92e5fb86d8042e83533e3bb2696ea8b",
  runtimeByteLength: 21_535,
  normalizedRuntimeSha256: "23ab0dc924c946764c63383ae7c0e17f6b2e9c57d2ac9e2822f30b4c63f0158a",
  metadataTrailerHex: "0xa164736f6c6343000818000a",
  hasNoLinkReferences: true,
  solcVersion: "0.8.24",
  solcLongVersion: "0.8.24+commit.e11b9ed9",
  reproducedIndependently: true,
  reproductionRuns: 2,
  runsAgreedByteForByte: true,
} as const;

/* The independently reproduced executor source reports this exact version string. It is a
 * PASS-relevant binding fact, not a value inferred from the authority artifact. */
export const REPRODUCED_EXECUTOR_VERSION = "FHEVMExecutor v0.4.0";

/* The closed field set of a REPRODUCED_BUILD provenance entry. A build is not a committed file, so
 * it carries build evidence instead of a repository `path`. */
export const REPRODUCED_BUILD_ENTRY_FIELDS: readonly string[] = [
  "aclAddress",
  "artifactJsonSha256",
  "buildInfoId",
  "buildInfoSha256",
  "buildRoot",
  "commit",
  "dependencyLockSha256",
  "fhevmExecutorAddress",
  "generatedHostAddressesSha256",
  "hardhatConfigSha256",
  "kind",
  "repository",
  "reproductionCommand",
  "reverified",
  "selectedContractName",
  "selectedSourcePath",
  "solcLongVersion",
  "solcVersion",
  "subject",
  "tag",
];

export const REPRODUCED_EXECUTOR_BUILD_ENTRY_FIELDS: readonly string[] = [
  "artifactJsonSha256",
  "buildInfoId",
  "buildInfoSha256",
  "buildRoot",
  "commit",
  "dependencyLockSha256",
  "generatedHostAddressesSha256",
  "hardhatConfigSha256",
  "hasNoLinkReferences",
  "kind",
  "metadataTrailerHex",
  "normalizedRuntimeSha256",
  "repository",
  "reproductionCommand",
  "reverified",
  "runtimeByteLength",
  "selectedContractName",
  "selectedSourcePath",
  "solcLongVersion",
  "solcVersion",
  "subject",
  "tag",
  "upstreamSepoliaHostConfigurationSha256",
];

export function reproducedBuildEntryFieldsForSubject(subject: string): readonly string[] | null {
  if (subject === "CURRENT_OFFICIAL_ARTIFACT_BUILD") return REPRODUCED_BUILD_ENTRY_FIELDS;
  if (subject === "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD") return REPRODUCED_EXECUTOR_BUILD_ENTRY_FIELDS;
  return null;
}

/* Which provenance subjects are reproduced builds rather than committed files. */
export const REPRODUCED_BUILD_SUBJECTS: readonly string[] = [
  "CURRENT_OFFICIAL_ARTIFACT_BUILD",
  "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD",
];

/* ---------------------------------------------------------------------------------------------
 * THE COMPILER IMMUTABLE, AS THE REPRODUCED BUILD ACTUALLY CONTAINS IT.
 *
 * Established by compiling the pinned source and by deploying the resulting artifact: the only
 * compiler immutable in HCULimit is OpenZeppelin `UUPSUpgradeable.__self`, which holds the
 * implementation contract's OWN deployed address.
 *
 * Authoritative normalization is therefore IMPLEMENTATION-ADDRESS-RELATIVE. The previous model —
 * 28 PUSH20 executor-address immediates of 20 bytes — was read off the obsolete local 0.10.0
 * fixture and is false for the real build in every particular.
 * ------------------------------------------------------------------------------------------- */

export const UUPS_SELF_IMMUTABLE = {
  compilerAstId: 605,
  declarationSource: "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol",
  declarationName: "__self",
  declarationNodeType: "VariableDeclaration",
  declarationTypeString: "address",
  stateVariable: true,
  mutability: "immutable",
  /* Three PUSH32 references; solc stores an `address immutable` as a full 32-byte word. */
  wordByteLength: 32,
  addressByteLength: 20,
  leadingZeroByteLength: 12,
  requiredPrecedingOpcode: "0x7f",
  offsets: [17180, 17221, 17739] as readonly number[],
  referenceCount: 3,
  /* The artifact side is 32 zero bytes; the deployed side is the address left-padded to a word. */
  artifactPlaceholderWordHex: `0x${"00".repeat(32)}`,
  deployedValueShape: "12 zero bytes || the 20-byte implementation address",
  rationale:
    "UUPSUpgradeable stores address(this) at construction so a delegatecall can detect that it is executing through a proxy. The value is therefore the IMPLEMENTATION address, and normalizing it against the executor address would compare the wrong thing entirely.",
} as const;

/* The executor compiler output declares the same UUPS immutable declaration, but the references
 * belong to the executor artifact and are intentionally recorded in a separate manifest. */
export const EXECUTOR_UUPS_SELF_IMMUTABLE = {
  ...UUPS_SELF_IMMUTABLE,
  offsets: [14424, 14465, 14991] as readonly number[],
  referenceCount: 3,
} as const;

/* The reproduced runtime, as measured. */
export const REPRODUCED_RUNTIME_BYTE_LENGTH = 20_231;
export const REPRODUCED_EXECUTOR_RUNTIME_BYTE_LENGTH = 21_535;

/* ---------------------------------------------------------------------------------------------
 * WHAT MUST *NOT* BE NORMALIZED.
 *
 * The deployed runtime also contains PUSH20 occurrences of the configured Sepolia executor address.
 * Those are ordinary compile-time constants, not compiler immutables: they carry no entry in
 * `immutableReferences`, and they are part of what makes this build this build. Normalizing them
 * would erase real code identity in exactly the place an attacker would want it erased.
 * ------------------------------------------------------------------------------------------- */

export const NON_NORMALIZABLE_COMPILE_TIME_CONSTANTS = {
  executorAddressOccurrences: 30,
  areCompilerImmutables: false,
  mustRemainByteForByte: true,
  rationale:
    "A compile-time constant is part of the code. Only values the compiler itself reports in immutableReferences are deployment-dependent, and only those may be normalized.",
} as const;

export const ARTIFACT_LOCAL_EXECUTOR_ADDRESS = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";

export const EXPECTED_RUNTIME_BYTE_LENGTH = 14_832n;
export const EXPECTED_RUNTIME_SHA256 = "2759bde269ab76b92f35a66b1c57562ec7787dac6f0810a753311181de774b12";
export const EXPECTED_CODE_SECTION_BYTE_LENGTH = 14_820n;
export const EXPECTED_CODE_SECTION_SHA256 = "d442ca44e12938c795e24f28bc10b565cc27743d088ee5a9e1e5a5e71396acc9";

/* Normalizing the 28 address immediates to 20 zero bytes yields these digests. The full-runtime
 * digest is usable as an equality target because the metadata trailer carries no source hash. */
export const EXPECTED_NORMALIZED_RUNTIME_SHA256 = "83350c6350999e2edad550d0541911100d63ffd4eb8f45d9a6e97ab165c1662b";
export const EXPECTED_NORMALIZED_CODE_SECTION_SHA256 =
  "509e7604498cb2ba05f20cbce3a89d4665767134f3db1f5b5786549e0d34c122";

/* Byte offsets of every PUSH20 executor-address immediate in the deployed runtime. Exhaustive:
 * normalization touches these and nothing else. */
export const EXECUTOR_IMMEDIATE_OFFSETS: readonly number[] = [
  783, 1580, 1905, 2339, 2788, 3336, 3825, 4176, 4528, 5147, 5571, 5852, 6264, 6688, 7176, 7562, 7879, 8300, 8725, 9352,
  9615, 10039, 10099, 10450, 10692, 10966, 11593, 11876,
];

export const EXECUTOR_IMMEDIATE_COUNT = 28;
export const PUSH20_OPCODE = 0x73;
export const ADDRESS_BYTE_LENGTH = 20;

/* ---------------------------------------------------------------------------------------------
 * Three separate artifact identities.
 *
 * Conflating them is what made the local 0.10.0 runtime hash the sole acceptable PASS target for
 * current Sepolia. That either predetermines a live mismatch or, worse, promotes an old local
 * artifact to current authority. They are now distinct roots:
 *
 *   LOCAL_INSTALLED_FIXTURE      the pinned @fhevm/host-contracts@0.10.0 artifact. Offline
 *                                parser and normalization self-tests ONLY. Never a PASS target
 *                                for the current deployment.
 *   CURRENT_OFFICIAL_ARTIFACT    the prior-reviewed upstream artifact expectation. Its normalized
 *                                runtime hash is UNRESOLVED until the artifact is independently
 *                                retrieved, built, or otherwise machine-linked.
 *   VERIFIED_DEPLOYED            the implementation actually found behind the authority proxy at a
 *                                pinned block, once compared against the resolved official
 *                                artifact.
 * ------------------------------------------------------------------------------------------- */

export const ARTIFACT_IDENTITY_ROOTS = {
  localInstalledFixture: {
    id: "LOCAL_INSTALLED_FIXTURE@fhevm/host-contracts@0.10.0",
    purpose: "OFFLINE_PARSER_AND_NORMALIZATION_SELFTEST_ONLY",
    mayBeSolePassHashForCurrentDeployment: false,
    normalizedRuntimeSha256: "83350c6350999e2edad550d0541911100d63ffd4eb8f45d9a6e97ab165c1662b",
  },
  currentOfficialArtifact: {
    id: "CURRENT_OFFICIAL_ARTIFACT@zama-ai/fhevm@v0.13.2",
    /* Provenance for the source is recorded under IMMUTABLE_PROVENANCE. The compiled artifact's
     * normalized runtime hash is a different thing and has not been established. */
    expectedNormalizedRuntimeSha256: null,
    state: "UNRESOLVED" as const,
    blocking: true,
    resolutionRequires: [
      "independently retrieve or build the exact official artifact at the recorded commit",
      "confirm its compiler metadata and immutable references",
      "derive its normalized runtime hash under the declared offset policy",
    ],
  },
  verifiedDeployed: {
    id: "VERIFIED_DEPLOYED_IMPLEMENTATION",
    establishedBy: "ADDRESS_NORMALIZED_COMPARISON_AGAINST_THE_RESOLVED_CURRENT_OFFICIAL_ARTIFACT",
    state: "UNRESOLVED" as const,
  },
  /* Every downstream facet must cite the same artifact. A PASS may never combine deployed code from
   * one version with limits, schedule, or semantics from another. */
  crossVersionMixingForbidden: true,
  facets: ["blockOrBatch", "codeIdentity", "limitSemantics", "limitValues", "operationSchedule"],
} as const;

/* The expected normalized hash for the CURRENT DEPLOYMENT. Null means unresolved: code identity is
 * BLOCKED rather than PASS, and rather than an automatic FAIL for merely differing from the local
 * fixture. */
export const EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256: string | null = null;

/* The CBOR metadata trailer is `{"solc": 0.8.24}` and nothing else — no IPFS or bzzr source hash.
 * That is why full-runtime normalized equality is a legitimate target rather than a heuristic. */
export const EXPECTED_METADATA = {
  cborByteLength: 10,
  hex: "a164736f6c6343000818",
  solcVersion: "0.8.24",
  carriesSourceHash: false,
  structureMustBeValidated: true,
} as const;

/* ---------------------------------------------------------------------------------------------
 * Operation tables.
 *
 * Both the installed calculator table (`@fhevm/mock-utils` HCUByOperator) and the authoritative
 * enforcement surface (`HCULimit.checkHCUFor*`) are enumerated here as committed literals. The
 * verifier parses both installed representations and compares them to these lists; it never
 * hardcodes a "compatible" conclusion.
 * ------------------------------------------------------------------------------------------- */

export const EXPECTED_INSTALLED_OPERATIONS: readonly string[] = [
  "Cast",
  "FheAdd",
  "FheBitAnd",
  "FheBitOr",
  "FheBitXor",
  "FheDiv",
  "FheEq",
  "FheGe",
  "FheGt",
  "FheIfThenElse",
  "FheLe",
  "FheLt",
  "FheMax",
  "FheMin",
  "FheMul",
  "FheNe",
  "FheNeg",
  "FheNot",
  "FheRand",
  "FheRandBounded",
  "FheRem",
  "FheRotl",
  "FheRotr",
  "FheShl",
  "FheShr",
  "FheSub",
  "TrivialEncrypt",
];

/* HCULimit exposes one `checkHCUFor<Operation>` entry point per operation. `IfThenElse` and
 * `TrivialEncrypt`/`Cast` are named without the `Fhe` prefix on the enforcement side; the
 * translation is explicit and must stay unambiguous. */
export const EXPECTED_AUTHORITY_OPERATIONS: readonly string[] = [
  "Cast",
  "FheAdd",
  "FheBitAnd",
  "FheBitOr",
  "FheBitXor",
  "FheDiv",
  "FheEq",
  "FheGe",
  "FheGt",
  "FheLe",
  "FheLt",
  "FheMax",
  "FheMin",
  "FheMul",
  "FheNe",
  "FheNeg",
  "FheNot",
  "FheRand",
  "FheRandBounded",
  "FheRem",
  "FheRotl",
  "FheRotr",
  "FheShl",
  "FheShr",
  "FheSub",
  "IfThenElse",
  "TrivialEncrypt",
];

/* Enforcement-name -> calculator-name. Every translation must be injective. */
export const OPERATION_NAME_TRANSLATIONS: Readonly<Record<string, string>> = {
  IfThenElse: "FheIfThenElse",
};

/* Operations that must fail closed if they ever reach SG-4: they exist in neither installed
 * representation, so no authoritative cost is available for them. */
export const UNSUPPORTED_OPERATION_GUARD: readonly string[] = ["FheIsIn", "FheSum"];

/* ---------------------------------------------------------------------------------------------
 * Operation-schedule authority (unresolved).
 *
 * The local package narrative and the previously reviewed authority investigation disagree about
 * the current official cost schedule. That disagreement is recorded, not silently resolved in
 * favour of whichever source happens to be installed locally.
 * ------------------------------------------------------------------------------------------- */

export const LOCAL_PACKAGE_OPERATION_COUNT = 27n;
export const CURRENT_OFFICIAL_EXPECTED_OPERATION_COUNT = 29n;

/* The two operations the previously reviewed investigation reported as present in the current
 * official schedule and which the installed 0.10.0 material does not contain anywhere. */
export const CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS: readonly string[] = ["FheIsIn", "FheSum"];

export const OPERATION_SCHEDULE_AUTHORITY = {
  state: "UNRESOLVED" as const,
  blocking: true,
  resolvedByChoosingTheLocalPackage: false,
  localPackageSchedule: {
    source: "@fhevm/host-contracts@0.10.0 contracts/HCULimit.sol checkHCUFor* entry points",
    operationCount: "27",
    parsedFrom: "INSTALLED_INTEGRITY_PINNED_SOURCE",
    containsFheSum: false,
    containsFheIsIn: false,
  },
  installedCalculatorSchedule: {
    source: "@fhevm/mock-utils@0.4.2 fhevm/coprocessor/HCUByOperator.ts",
    operationCount: "27",
    parsedFrom: "INSTALLED_INTEGRITY_PINNED_SOURCE",
    containsFheSum: false,
    containsFheIsIn: false,
  },
  previouslyIdentifiedCurrentOfficialScheduleExpectation: {
    source: "PRIOR_REVIEWED_SG4_HCU_AUTHORITY_INVESTIGATION",
    operationCount: "29",
    additionalOperations: CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS,
    deployedStackReportedAsDifferentFromLocalPackageNarrative: true,
    immutableProvenanceAvailableOffline: false,
  },
  discrepancy: {
    kind: "OPERATION_COUNT_AND_DEPLOYED_STACK_DISAGREEMENT",
    localOperationCount: "27",
    expectedCurrentOfficialOperationCount: "29",
    difference: "2",
    operationsPresentOnlyInTheExpectedCurrentOfficialSchedule: CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS,
    versionDiscrepancyIsBlocking: true,
    silentSelectionOfTheLocalPackageForbidden: true,
    statement:
      "The installed @fhevm/host-contracts@0.10.0 enforcement surface and the installed @fhevm/mock-utils@0.4.2 calculator both parse to 27 operations and contain neither FheSum nor FheIsIn. The previously reviewed authority investigation reported a current official schedule of 29 operations including both, on a deployed stack it described as different from the local package narrative. Offline material cannot decide which describes the implementation actually deployed behind the authority proxy on Sepolia. The discrepancy is therefore unresolved and blocking.",
  },
  resolutionRequires: [
    "address-normalized code identity against the exact deployed implementation at a pinned block",
    "enumeration of the deployed implementation's own operation surface",
    "comparison of that surface against the installed calculator with fail-closed handling of any operation the calculator cannot price",
    "immutable upstream provenance for the authoritative cost schedule",
  ],
} as const;

/* ---------------------------------------------------------------------------------------------
 * Immutable upstream provenance (unresolved offline).
 *
 * Offline preparation fetched no upstream source, so source-file tuples remain UNRESOLVED and
 * blocking for a live PASS. A reproduced build is deliberately a different discriminated shape:
 * it identifies the source tree and carries build evidence, but never carries a generated-artifact
 * repository path.
 * ------------------------------------------------------------------------------------------- */

/* The prior reviewed authority investigation did carry exact immutable tuples. Recording them as
 * "unavailable" was factually wrong and discarded reviewed work. They are recorded here in full and
 * remain BLOCKING: a reviewed expectation is not the same as content fetched and reverified by the
 * future authorized verifier, and it establishes nothing about the deployed linkage on its own. */
export const IMMUTABLE_PROVENANCE_STATE = "EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION" as const;

export const IMMUTABLE_PROVENANCE = {
  state: IMMUTABLE_PROVENANCE_STATE,
  blocking: true,
  blocksLivePass: true,
  isAControl: true,
  inventedCommitForbidden: true,
  establishedOffline: false,
  recordedFromPriorReview: true,
  independentlyReverified: false,
  deployedLinkageEstablished: false,
  reason:
    "Exact source-file repository/tag/commit/path/hash tuples and reproduced-build evidence are available from the prior reviewed authority investigation and are recorded below in their distinct shapes. They are NOT final live evidence: nothing here was fetched or reverified during offline preparation, and none of it establishes which revision is deployed behind the authority proxy on Sepolia. The state therefore blocks until the immutable content is fetched and reverified by the future authorized verifier and the deployed linkage is established.",
  required: [
    {
      subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
      artifact: "HCULimit.sol",
      repository: "https://github.com/zama-ai/fhevm",
      tag: "v0.13.2",
      commit: "07fb05fb75f0aa6cea934088640ddb4539d0b1b9",
      path: "host-contracts/contracts/HCULimit.sol",
      contentSha256: "16d71ee5f899f1bfd5872bdb83e08d90f510fd529cd8a93d5001dc29f25634b8",
      origin: "PRIOR_REVIEWED_SG4_HCU_AUTHORITY_INVESTIGATION",
      reverified: false,
    },
    {
      subject: "CURRENT_OFFICIAL_EXECUTOR_SOURCE",
      artifact: "FHEVMExecutor.sol",
      repository: "https://github.com/zama-ai/fhevm",
      tag: "v0.13.2",
      commit: "07fb05fb75f0aa6cea934088640ddb4539d0b1b9",
      path: "host-contracts/contracts/FHEVMExecutor.sol",
      contentSha256: REPRODUCED_OFFICIAL_EXECUTOR_BUILD.executorSourceSha256,
      origin: "INDEPENDENTLY_REPRODUCED_FROM_THE_PINNED_SOURCE_TREE",
      reverified: false,
    },
    {
      /* The compiled build is a different artifact from the source it was compiled from: different
       * bytes, therefore its own buildInfoSha256, therefore its own reproduced-build evidence.
       * Sharing one digest would have meant one digest authenticating two different blobs. */
      subject: "CURRENT_OFFICIAL_ARTIFACT_BUILD",
      artifact: "hardhat build-info",
      /* A REPRODUCED_BUILD, not a committed file. It identifies the source tree it was built FROM
       * and carries no repository `path`, because generated output is committed nowhere. */
      kind: REPRODUCED_BUILD_PROVENANCE_KIND,
      repository: REPRODUCED_OFFICIAL_BUILD.repository,
      tag: REPRODUCED_OFFICIAL_BUILD.tag,
      commit: REPRODUCED_OFFICIAL_BUILD.commit,
      /* Independently reproduced twice, byte-for-byte identical, so this is pinned rather than left
       * for a record to nominate. */
      buildInfoSha256: REPRODUCED_OFFICIAL_BUILD.buildInfoSha256,
      buildInfoId: REPRODUCED_OFFICIAL_BUILD.buildInfoId,
      artifactJsonSha256: REPRODUCED_OFFICIAL_BUILD.artifactJsonSha256,
      origin: "INDEPENDENTLY_REPRODUCED_FROM_THE_PINNED_SOURCE_TREE",
      reverified: false,
    },
    {
      subject: "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD",
      artifact: "hardhat build-info",
      kind: REPRODUCED_BUILD_PROVENANCE_KIND,
      repository: REPRODUCED_OFFICIAL_EXECUTOR_BUILD.repository,
      tag: REPRODUCED_OFFICIAL_EXECUTOR_BUILD.tag,
      commit: REPRODUCED_OFFICIAL_EXECUTOR_BUILD.commit,
      buildInfoSha256: REPRODUCED_OFFICIAL_EXECUTOR_BUILD.buildInfoSha256,
      buildInfoId: REPRODUCED_OFFICIAL_EXECUTOR_BUILD.buildInfoId,
      artifactJsonSha256: REPRODUCED_OFFICIAL_EXECUTOR_BUILD.artifactJsonSha256,
      origin: "INDEPENDENTLY_REPRODUCED_FROM_THE_PINNED_SOURCE_TREE",
      reverified: false,
    },
    {
      subject: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
      artifact: "operatorsPrices.ts",
      repository: "https://github.com/zama-ai/fhevm",
      tag: "v0.13.2",
      commit: "07fb05fb75f0aa6cea934088640ddb4539d0b1b9",
      path: "library-solidity/codegen/src/operatorsPrices.ts",
      contentSha256: "48363444ec4af98d2139572be1c3fa545c9d9cfa93d72a353237f8137cc4326a",
      origin: "PRIOR_REVIEWED_SG4_HCU_AUTHORITY_INVESTIGATION",
      reverified: false,
    },
    {
      subject: "INSTALLED_CALCULATOR",
      artifact: "hcu.ts",
      repository: "https://github.com/zama-ai/fhevm-mocks",
      tag: "v0.4.2",
      commit: "fa852da4aa4b04231e0fa748e7b4480ae756ce91",
      path: "packages/mock-utils/src/fhevm/coprocessor/hcu.ts",
      contentSha256: EXPECTED_CALCULATOR_HASH,
      origin: "PRIOR_REVIEWED_SG4_HCU_AUTHORITY_INVESTIGATION",
      reverified: false,
    },
    {
      subject: "INSTALLED_OPERATION_COST_TABLE",
      artifact: "HCUByOperator.ts",
      repository: "https://github.com/zama-ai/fhevm-mocks",
      tag: "v0.4.2",
      commit: "fa852da4aa4b04231e0fa748e7b4480ae756ce91",
      path: "packages/mock-utils/src/fhevm/coprocessor/HCUByOperator.ts",
      contentSha256: EXPECTED_COST_TABLE_HASH,
      origin: "PRIOR_REVIEWED_SG4_HCU_AUTHORITY_INVESTIGATION",
      reverified: false,
    },
    {
      subject: "INSTALLED_SOLIDITY_CONFIGURATION",
      artifact: "ZamaConfig.sol",
      repository: "https://github.com/zama-ai/fhevm",
      tag: null,
      commit: "60d3082657fcf2648774b5c4282b08bc22ecee36",
      path: "library-solidity/config/ZamaConfig.sol",
      contentSha256: null,
      expectedSepoliaExecutor: SEPOLIA_EXECUTOR_ADDRESS,
      origin: "PRIOR_REVIEWED_SG4_HCU_AUTHORITY_INVESTIGATION",
      reverified: false,
    },
  ],
  /* The known upstream roots. Unrelated repositories are not substituted for them. */
  officialRepositories: ["https://github.com/zama-ai/fhevm", "https://github.com/zama-ai/fhevm-mocks"],
  reverificationRequires: [
    "fetch each recorded repository/tag/commit/path and confirm its content hash",
    "confirm the installed calculator and cost table match their recorded upstream content hashes",
    "link the reverified official authority source to the implementation deployed behind the authority proxy at a pinned block",
  ],
} as const;

/* ---------------------------------------------------------------------------------------------
 * Two-commit preparation lineage.
 *
 * The previous model stored the preparation commit and tree inside a tracked source file and then
 * required a clean HEAD to equal them. That is self-referential and unsatisfiable: writing the
 * values into a tracked file changes the tree, and committing that change produces a different
 * commit and tree, so the recorded values can never equal the clean HEAD that contains them.
 *
 * The replacement is a two-commit lineage with no self-reference anywhere.
 *
 *   Commit A (implementation)
 *     All SG-4 implementation, protocol, documentation and tests, plus the verifier support for a
 *     future binding record. A never claims its own commit or tree.
 *
 *   Commit B (binding)
 *     Adds exactly one dedicated record at BINDING_RECORD_PATH naming A's commit and tree, and
 *     changes nothing else. B never records its own commit or tree either — it does not need to,
 *     because the verifier reads B from HEAD and A from HEAD^.
 * ------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------
 * The authority-binding record.
 *
 * The earlier seven-field preparation-only record made the gate permanently unresolvable. Commit A
 * hardcodes the artifact hash, the limit semantics, the provenance state and the schedule state as
 * unresolved; commit B may add only the binding record and may not touch implementation source; and
 * any later code commit becomes a third commit that breaks the lineage. So after B, no permitted
 * action could ever supply the missing values.
 *
 * The replacement carries BOTH the implementation lineage AND every late-bound authority input the
 * live verifier needs. Commit B supplies the resolved facts as reviewed data rather than as code,
 * so no implementation edit is required after A — and any implementation edit still reopens review
 * and requires a fresh A->B lineage rather than a third-commit workaround.
 * ------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------
 * F36 — cross-links are tuple-derived, not label-derived.
 *
 * Naming a provenance SUBJECT proves nothing: two records citing the same label can describe
 * entirely different upstream revisions. Every cross-link is therefore checked against the exact
 * SELECTED tuple resolved once, after amendments. SOURCE_FILE canonical references use repository,
 * commit, path and contentSha256; REPRODUCED_BUILD has separate build identity/evidence and
 * buildInfoSha256, with no synthetic path.
 * ------------------------------------------------------------------------------------------- */

export const CANONICAL_SOURCE_REFERENCE_FORM = "<repository>@<commit>:<path>";

export const CROSS_LINK_BINDINGS: readonly { id: string; field: string; subject: string }[] = [
  { id: "ARTIFACT_SOURCE", field: "artifact.sourceReference", subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE" },
  { id: "ARTIFACT_RELEASE", field: "artifact.release", subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE" },
  {
    id: "PRICE_SCHEDULE_SOURCE",
    field: "operationSchedule.source",
    subject: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
  },
  {
    id: "PRICING_ENTRY_SOURCE",
    field: "operationSchedule.pricingManifest.entries[].sourceReference",
    subject: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
  },
  {
    id: "EXECUTOR_CONFIGURATION_SOURCE",
    field: "executor.configurationSourceReference",
    subject: "INSTALLED_SOLIDITY_CONFIGURATION",
  },
  {
    id: "CALCULATOR_CONTENT",
    field: "provenance.entries[INSTALLED_CALCULATOR].contentSha256",
    subject: "INSTALLED_CALCULATOR",
  },
  {
    id: "COST_TABLE_CONTENT",
    field: "provenance.entries[INSTALLED_OPERATION_COST_TABLE].contentSha256",
    subject: "INSTALLED_OPERATION_COST_TABLE",
  },
  {
    id: "ENFORCEMENT_PROOF_SOURCE",
    field: "enforcementProof.manifest.sourceContentSha256",
    subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
  },
  {
    id: "ENUMERATION_SOURCE",
    field: "authorityEnumeration.manifest.sourceContentSha256",
    subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
  },
  {
    id: "APPLICABILITY_PROOF_SOURCE",
    field: "onChainInterface.callerApplicability[].*Proof.sourceContentSha256",
    subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
  },
  {
    id: "IMMUTABLE_REFERENCE_SOURCE",
    field: "artifact.compilerReferenceManifest.sourceContentSha256",
    subject: "CURRENT_OFFICIAL_ARTIFACT_BUILD",
  },
];

/* ---------------------------------------------------------------------------------------------
 * F37 — a proof is a derivation, not an assertion.
 *
 * `enumerationComplete: true` beside empty arrays asserted a conclusion nobody could check. The
 * enumeration now has to be non-empty and exhaustive, and the block/batch conclusion is DERIVED
 * from it by the verifier rather than declared by the record.
 * ------------------------------------------------------------------------------------------- */

export const ENUMERATION_MINIMUM_SURFACE = {
  declarations: 2,
  callableFunctions: 2,
  errors: 2,
  storagePrimitives: 1,
} as const;

/* Any surface name matching this is a block- or batch-scoped control. Deriving the conclusion from
 * the enumerated surface is what makes it a proof rather than a claim. */
export const BLOCK_OR_BATCH_SURFACE_PATTERN = "(?:^|[^A-Za-z])(?:BLOCK|BATCH)|Block|Batch";

export const ENUMERATION_PARSE_COMPLETENESS_STATES: readonly string[] = [
  "PARSED_COMPLETE_NO_RESIDUE",
  "PARTIAL",
  "UNRESOLVED",
];

export const SOURCE_RANGE_FIELDS: readonly string[] = ["endByte", "sha256", "startByte"];

/* ---------------------------------------------------------------------------------------------
 * INVARIANTS B, C, D — AUTHENTICATED SOURCE MATERIAL.
 *
 * The single architectural change of this consolidation. Every PASS-relevant authoritative fact
 * used to be a table, list, boolean or digest the record ASSERTED. It is now RECOMPUTED by a
 * deterministic extractor from bytes the record supplies and the selected provenance tuple
 * authenticates:
 *
 *     bytes -> sha256(bytes) === selected tuple contentSha256   (authentication)
 *           -> deterministic extractor, versioned and digest-pinned
 *           -> canonical typed manifest
 *           -> comparison against the record's reviewed CLAIM
 *
 * The record may still carry its claim — a reviewer needs something to review — but the claim is
 * compared to the extractor's output and never substituted for it.
 * ------------------------------------------------------------------------------------------- */

export const SOURCE_MATERIAL_SUBJECTS: readonly string[] = [
  "authoritySource",
  "officialArtifactBuild",
  "executorSource",
  "officialExecutorArtifactBuild",
  "priceSchedule",
];

/* Which selected provenance subject authenticates which supplied bytes. */
export const SOURCE_MATERIAL_PROVENANCE: Readonly<Record<string, string>> = {
  authoritySource: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
  officialArtifactBuild: "CURRENT_OFFICIAL_ARTIFACT_BUILD",
  executorSource: "CURRENT_OFFICIAL_EXECUTOR_SOURCE",
  officialExecutorArtifactBuild: "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD",
  priceSchedule: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
};

export const SOURCE_MATERIAL_FIELDS: readonly string[] = ["bytesBase64", "contentSha256", "encoding", "subject"];

export const SOURCE_MATERIAL_ENCODINGS: readonly string[] = ["base64"];

/* Extractors are versioned so a result records WHICH deterministic derivation produced its facts.
 * A change here changes the authority protocol digest, so it cannot pass unnoticed. */
export const PRICE_SCHEDULE_EXTRACTOR = {
  id: "sg4-price-schedule-extractor",
  version: 1,
  input: "the authenticated operatorsPrices source bytes selected by CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
  output: "the COMPLETE canonical variant schedule, including variants SG-4 never uses",
  rationale:
    "A record-supplied price table is the record's opinion. The full schedule is recomputed from the authenticated bytes so completeness can be proven rather than asserted, and so a subset cannot masquerade as the schedule.",
} as const;

export const AUTHORITY_SOURCE_PARSER = {
  id: "sg4-authority-source-parser",
  version: 1,
  input: "the authenticated HCULimit source bytes selected by CURRENT_OFFICIAL_AUTHORITY_SOURCE",
  output:
    "declarations, callable functions, errors, storage surfaces, enforcement functions, exact byte ranges, range digests, parse completeness and the derived block/batch conclusion",
  rationale:
    "A complete-looking list and a syntactically valid 64-hex digest are free to fabricate. Recomputing them from the authenticated bytes makes the enumeration a derivation.",
} as const;

export const ARTIFACT_BUILD_EXTRACTOR = {
  id: "sg4-artifact-build-extractor",
  /* v2: consumes real Hardhat build-info; the v1 custom envelope is rejected outright. */
  version: 2,
  input: "the authenticated Hardhat build-info bytes selected by CURRENT_OFFICIAL_ARTIFACT_BUILD",
  inputSchema: "HARDHAT_BUILD_INFO",
  navigates: [
    "input.sources[<selectedSourcePath>].content",
    "output.contracts[<selectedSourcePath>][<selectedContractName>].evm.deployedBytecode.object",
    "output.contracts[<selectedSourcePath>][<selectedContractName>].evm.deployedBytecode.immutableReferences",
    "output.sources[<declarationSource>].ast",
  ],
  validates: [
    "_format equals hh-sol-build-info-1",
    "id equals the pinned build-info id",
    "solcVersion and solcLongVersion equal the pinned compiler",
    "input.language is exactly Solidity and input.sources carries the selected source content",
    "input.settings and outputSelection structurally request evm.deployedBytecode and the source-unit ast",
    "the selected source path and contract name are the pinned ones",
    "output.contracts and output.sources carry the selected contract and the AST declaration for immutable id 605",
    "sha256(input.sources[selectedSourcePath].content) equals the authenticated authority source hash",
    "every immutable reference id resolves through the AST to its declaration",
  ],
  output:
    "the deployed runtime bytes, the compiler immutable-reference manifest with AST declarations, and the independently recomputed expected normalized runtime digest",
  rationale:
    "A 64-hex expected hash in a record proves only that someone typed 64 hex characters, and a bespoke envelope proves only that someone shaped one. Reading the compiler's own build-info means the immutable set, the runtime and the source it compiled all come from one authenticated document.",
  customEnvelopeRejected: true,
} as const;

/* ---------------------------------------------------------------------------------------------
 * INVARIANT J — the PASS dependency graph.
 *
 * Every field validateAuthorityResult() consumes, classified by HOW it was established. A reviewer
 * reads this table and knows, for each blocking fact, which link of the chain produced it:
 *
 *     RECOMPUTED   a deterministic extractor over authenticated bytes
 *     LIVE_READ    a verified read at the pinned block, under the enforced plan
 *     MEASUREMENT  the installed toolchain that computes an HCU number
 *     DERIVED      a pure function of the above
 *     DIAGNOSTIC   reported, never blocking
 *
 * There is no PASS-relevant class for "the record said so", and no field is populated from a local
 * fixture fallback.
 * ------------------------------------------------------------------------------------------- */

export const PASS_FIELD_CLASSES: readonly string[] = [
  "DERIVED",
  "DIAGNOSTIC",
  "LIVE_READ",
  "MEASUREMENT",
  "RECOMPUTED",
];

export const PASS_DEPENDENCY_GRAPH: Readonly<Record<string, string>> = {
  authoritativeArtifactId: "RECOMPUTED",
  authorityAddress: "LIVE_READ",
  authorityBindingRecordResult: "DERIVED",
  authorityCodeHash: "LIVE_READ",
  authorityCodeIdentityResult: "DERIVED",
  authorityDeploymentModel: "DERIVED",
  authorityImplementationAddress: "LIVE_READ",
  authorityProtocolDigest: "DERIVED",
  authorityTableHash: "RECOMPUTED",
  authorityVersion: "LIVE_READ",
  authorityVersionResult: "DERIVED",
  benchmarkProtocolDigest: "DERIVED",
  blockOrBatchControlState: "RECOMPUTED",
  blockOrBatchOnChainReading: "LIVE_READ",
  calculatorHash: "MEASUREMENT",
  callerApplicabilityResults: "LIVE_READ",
  callerExemptionResult: "DERIVED",
  chainId: "LIVE_READ",
  codeIdentityResult: "DERIVED",
  deployedAuthorityRoot: "RECOMPUTED",
  depthHcuOnChainReading: "LIVE_READ",
  erc1967SlotReadCount: "DERIVED",
  executorCodeHash: "LIVE_READ",
  executorCodeIdentityResult: "DERIVED",
  executorDeploymentModel: "DERIVED",
  executorAuthorityDerivationResult: "DERIVED",
  executorExpectedImplementationAddress: "DERIVED",
  executorExpectedImplementationCodeHash: "RECOMPUTED",
  executorExpectedNormalizedImplementationHash: "RECOMPUTED",
  executorExpectedVersion: "RECOMPUTED",
  executorImplementationAddress: "LIVE_READ",
  executorImplementationAddressPolicyResult: "DERIVED",
  executorImplementationCodeHash: "LIVE_READ",
  executorImplementationCodeIdentityResult: "DERIVED",
  executorImplementationResolutionResult: "DERIVED",
  executorNormalizedImplementationHash: "LIVE_READ",
  executorProxyCodeHash: "LIVE_READ",
  executorProxyCodeIdentityResult: "DERIVED",
  executorReproducedBuildInfoSha256: "RECOMPUTED",
  executorReproducedBuildResult: "DERIVED",
  executorVersion: "LIVE_READ",
  executorVersionResult: "DERIVED",
  expectedDeployedNormalizedHash: "RECOMPUTED",
  facetArtifactBinding: "DERIVED",
  finalVerdict: "DERIVED",
  greatestAcceptedDepthHcu: "DERIVED",
  greatestAcceptedTotalHcu: "DERIVED",
  immutableProvenanceState: "DERIVED",
  implementationAddressPolicyResult: "DERIVED",
  implementationResolutionResult: "DERIVED",
  installedSourceHashesResult: "MEASUREMENT",
  installedTableHash: "MEASUREMENT",
  liveCallCount: "DERIVED",
  liveCallLogDigest: "DERIVED",
  livePlanCallCount: "DERIVED",
  livePlanDigest: "DERIVED",
  liveLimitSemantics: "RECOMPUTED",
  localAuthorityFixtureRoot: "DIAGNOSTIC",
  localFixtureSelfTestResult: "DIAGNOSTIC",
  measurementToolchainRoot: "MEASUREMENT",
  normalizedImplementationHash: "LIVE_READ",
  operationCompatibilityResult: "RECOMPUTED",
  operationScheduleAuthorityState: "RECOMPUTED",
  pinnedBlockFinality: "LIVE_READ",
  pinnedBlockHash: "LIVE_READ",
  pinnedBlockNumber: "LIVE_READ",
  planEnforcementResult: "DERIVED",
  preparationLineageResult: "DERIVED",
  reproducedBuildInfoSha256: "RECOMPUTED",
  reproducedBuildResult: "RECOMPUTED",
  reciprocalLinkageResult: "DERIVED",
  rpcMethodsUsed: "DERIVED",
  sg4CoverageResult: "RECOMPUTED",
  staleAddressGuardResult: "DERIVED",
  totalHcuOnChainReading: "LIVE_READ",
  transactionDepthControlState: "RECOMPUTED",
  transactionTotalControlState: "RECOMPUTED",
  unsupportedOperations: "RECOMPUTED",
};

/* The classes a PASS-blocking field may carry. DIAGNOSTIC is deliberately absent. */
export const BLOCKING_PASS_FIELD_CLASSES: readonly string[] = ["DERIVED", "LIVE_READ", "MEASUREMENT", "RECOMPUTED"];

/* The v4 record is historical authority evidence. It remains at its original path and is checked
 * byte-for-byte, but it is never selected as the active binding for a later release target. */
export const HISTORICAL_BINDING_RECORD_PATH = "scripts/sg4-hcu-authority-binding.json";
export const HISTORICAL_BINDING_RECORD_SCHEMA = "zama-szn4.sg4-hcu-authority-binding.v4";
export const HISTORICAL_BINDING_RECORD_VERSION = 4;
export const HISTORICAL_BINDING_RECORD_FILE_SHA256 = "4fa8642b9f1be977d9e8ca41c6ea9abfbfdda0c8d5e7160150dd76bb6036265c";
export const HISTORICAL_BINDING_RECORD_CANONICAL_SHA256 =
  "dc198ed1f208a1cb6a23dcb4a20ed51411f85efa199cdd46c1828b1a69b8af57";
export const HISTORICAL_BINDING_IMPLEMENTATION_COMMIT = "d0e2bbd6f50aef4f957bf494b3b03d14662d84a3";

/* V2 is an explicit release target with its own binding path and closed record version. The
 * historical v4 record is intentionally not upgraded in place. */
export const V2_BINDING_TARGET_ID = "LEOPOLD_V2_SEPOLIA";
export const V2_BINDING_TARGET_SCOPE = "LEOPOLD_V2_RELEASE";
export const V2_BINDING_RECORD_PATH = "scripts/sg4-hcu-authority-bindings/v2.json";
export const BINDING_RECORD_PATH = V2_BINDING_RECORD_PATH;
export const BINDING_RECORD_SCHEMA = "zama-szn4.sg4-hcu-authority-binding.v5";
export const BINDING_RECORD_VERSION = 5;

/* Where a facet's authoritative fact came from. The local fixture is never a PASS origin. */
export const FACET_ORIGINS: readonly string[] = [
  "AUTHORITATIVE_BINDING_RECORD",
  "AUTHORITATIVE_BINDING_RECORD_ON_CHAIN_CORROBORATED",
  "LOCAL_INSTALLED_FIXTURE",
  "UNRESOLVED",
];

export const FACET_ORIGINS_FORBIDDEN_FOR_PASS: readonly string[] = ["LOCAL_INSTALLED_FIXTURE", "UNRESOLVED"];

/* Deployment models the verifier knows how to check. ERC-1967 is never assumed; it is used only
 * when the reviewed binding record proves that model for the deployment in question. */
export const DEPLOYMENT_MODELS: readonly string[] = ["DIRECT", "ERC1967_PROXY"];

/* F21 — executor proxy verification is a complete chain, never a shell-only code hash. */
export const EXECUTOR_DEPLOYMENT_MODELS: readonly string[] = ["DIRECT", "ERC1967_PROXY"];

export const EXECUTOR_PROXY_SUPPORT = {
  supported: true,
  supportedModel: "ERC1967_PROXY",
  reason:
    "An ERC-1967 executor is accepted only after proxy identity, exact implementation-slot resolution, an exact-pinned implementation-address policy, independently reproduced implementation identity, version, and authority derivation all verify in order.",
  codeIdenticalUpgradePermitted: false,
} as const;

export const IMPLEMENTATION_RESOLUTION_MECHANISMS: readonly string[] = [
  "ERC1967_STORAGE_SLOT",
  "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
  "VERIFIED_GETTER",
];

/* Every top-level section the record must carry, and the closed field set of each. The verifier's
 * validator is driven from this so the schema and the check cannot drift apart. */
/* Canonical JSON serialization: object keys sorted, no insignificant whitespace. Every internal
 * digest in the record is recomputed over this, so a digest can never validate merely because it
 * has 64 hexadecimal characters. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("canonicalJson: unsupported value");
}

/* ---------------------------------------------------------------------------------------------
 * F19 — the canonical normalization manifest.
 *
 * The manifest must carry everything needed to reproduce the address-normalized comparison for the
 * AUTHORITATIVE artifact, whose layout may differ from the local 0.10.0 fixture in every respect:
 * runtime length, compiler, metadata structure, offsets, opcode and authenticated artifact placeholder bytes.
 * ------------------------------------------------------------------------------------------- */

/* v2: PUSH32 word immutables normalized against the IMPLEMENTATION address, replacing the v1
 * PUSH20 executor-address model. */
export const NORMALIZATION_MANIFEST_SCHEMA = "zama-szn4.sg4-normalization-manifest.v2";

export const NORMALIZATION_MANIFEST_FIELDS: readonly string[] = [
  "acceptedMetadataStructure",
  "compilerVersion",
  /* What the deployed side of every primary reference is reconstructed from. */
  "deploymentValueShape",
  "expectedReplacementCount",
  "immutableReferenceKind",
  "metadataModel",
  "metadataTrailerByteLength",
  "metadataTrailerSha256",
  /* F35 — typed, authenticated primary references replace the bare offsets array. A list of
   * integers cannot say what the artifact side holds at those offsets, nor which compiler
   * immutable reference produced them, so it could never make normalization bidirectional. */
  "primaryImmutableReferences",
  "requiredPrecedingOpcode",
  "runtimeByteLength",
  "schema",
  "supplementaryImmutableReferences",
  "version",
  /* The immutable word width. 32 for a solc `address immutable`, which is stored as a full word. */
  "wordByteLength",
];

export const PRIMARY_IMMUTABLE_REFERENCE_FIELDS: readonly string[] = [
  "byteLength",
  "compilerReferenceId",
  "expectedArtifactPlaceholderBytes",
  "id",
  "kind",
  "offset",
];

/* How a deployment-dependent value is reconstructed for comparison against the deployed runtime.
 * The reproduced build has exactly one such shape. */
export const DEPLOYMENT_VALUE_SHAPES: readonly string[] = ["LEFT_PADDED_IMPLEMENTATION_ADDRESS_WORD"];

/* ---------------------------------------------------------------------------------------------
 * F35 — the compiler immutable-reference manifest.
 *
 * Every reference id, offset and length the normalization manifest claims must appear identically
 * in the compiler's own immutable-reference output for the same build, and that manifest is
 * digest-bound and selected by the artifact provenance tuple. Without it a record could invent a
 * compiler reference id and normalize deployed bytes to anything it liked.
 * ------------------------------------------------------------------------------------------- */

/* v2: entries are derived from real Hardhat build-info immutableReferences and carry the AST
 * declaration that proves what the immutable IS. */
export const COMPILER_REFERENCE_MANIFEST_SCHEMA = "zama-szn4.sg4-compiler-immutable-reference-manifest.v2";

export const COMPILER_REFERENCE_MANIFEST_FIELDS: readonly string[] = [
  "buildId",
  "compilerVersion",
  "entries",
  /* The AST declaration each immutable id resolves to. Without it the manifest says WHERE the
   * immutables are but never what they ARE, and "what it is" decides what value belongs there. */
  "immutableDeclarations",
  "provenanceSubject",
  "referencesComplete",
  "schema",
  "solcLongVersion",
  "sourceContentSha256",
  "version",
];

export const COMPILER_IMMUTABLE_DECLARATION_FIELDS: readonly string[] = [
  "astId",
  "declarationSource",
  "mutability",
  "name",
  "nodeType",
  "stateVariable",
  "typeString",
];

export const COMPILER_REFERENCE_ENTRY_FIELDS: readonly string[] = [
  "artifactPlaceholderBytes",
  "astId",
  "byteLength",
  "id",
  "offset",
  "referenceKind",
];

/* F28 — only the kind the normalizer actually implements is advertised. A manifest may not claim
 * an algorithm the verifier does not execute. */
/* The only kind the normalizer implements, and the only kind the reproduced build contains: a
 * 32-byte word immutable emitted behind PUSH32. The v1 `PUSH20_ADDRESS_IMMEDIATE` kind described
 * the local 0.10.0 fixture and does not occur in the real build. */
export const IMMUTABLE_REFERENCE_KINDS: readonly string[] = ["PUSH32_WORD_IMMUTABLE"];

/* Only the structure `inspectMetadataTrailer` genuinely parses and can check a compiler version
 * against is accepted. A source-hash trailer would yield solcVersion null and could never satisfy
 * compiler coherence, so advertising it would advertise an unexecutable structure. */
export const ACCEPTED_METADATA_STRUCTURES: readonly string[] = ["CBOR_SOLC_ONLY_NO_SOURCE_HASH"];

/* The reproduced build's metadata trailer, measured. A solc-only CBOR payload encoding 0.8.24 with
 * no IPFS, no BZZ and no source hash — which is what makes the full-runtime digest usable as an
 * equality target at all. */
export const REPRODUCED_METADATA_TRAILER = {
  structure: "CBOR_SOLC_ONLY_NO_SOURCE_HASH",
  cborPayloadHex: "0xa164736f6c6343000818",
  trailerHex: "0xa164736f6c6343000818000a",
  trailerByteLength: 12,
  solcVersionEncoded: "0.8.24",
  carriesSourceHash: false,
} as const;

export const REPRODUCED_EXECUTOR_METADATA_TRAILER = {
  structure: "CBOR_SOLC_ONLY_NO_SOURCE_HASH",
  cborPayloadHex: "0xa164736f6c6343000818",
  trailerHex: "0xa164736f6c6343000818000a",
  trailerByteLength: 12,
  solcVersionEncoded: "0.8.24",
  carriesSourceHash: false,
} as const;

/* Closed, typed immutable-reference entries. Each declares exactly what must already be present in
 * the deployed runtime, so no arbitrary byte range can be silently overwritten. */
/* F35 — `replacementBytes` is gone. There is now ONE authenticated field: the artifact-side
 * placeholder the compiler manifest declares, and normalization replaces the deployed bytes with
 * exactly that. A separate free replacement value was the whole exploit. */
export const IMMUTABLE_REFERENCE_ENTRY_FIELDS: readonly string[] = [
  "byteLength",
  "compilerReferenceId",
  "expectedArtifactPlaceholderBytes",
  "expectedDeployedBytes",
  "id",
  "kind",
  "offset",
];

export const SUPPLEMENTARY_REFERENCE_KINDS: readonly string[] = ["EXACT_BYTES_REPLACEMENT"];

/* ---------------------------------------------------------------------------------------------
 * F20 — the canonical authoritative pricing manifest.
 *
 * Names alone cannot establish compatibility. Every operation carries its authoritative costs,
 * operand mode, arity and result types, so the installed calculator is compared against the
 * AUTHORITATIVE schedule rather than against the local 0.10.0 enforcement surface.
 * ------------------------------------------------------------------------------------------- */

export const PRICING_MANIFEST_SCHEMA = "zama-szn4.sg4-authoritative-pricing-manifest.v1";

export const PRICING_MANIFEST_FIELDS: readonly string[] = ["entries", "provenanceSubject", "schema", "version"];

/* F34 — ONE ENTRY PER VARIANT.
 *
 * The operation-level shape (`operandModes`, `resultTypes`, a nested `costs` map) could not name a
 * variant unambiguously: it said which modes and which result types existed somewhere in the
 * operation, not which cost belonged to which exact (mode, operand types, result type) triple. An
 * entry now IS a variant, and carries exactly one cost. */
export const PRICING_ENTRY_FIELDS: readonly string[] = [
  "arity",
  "canonicalName",
  "cost",
  "costKeyType",
  "enforcementName",
  "operandMode",
  "operandTypes",
  "resultType",
  "sourceReference",
];

/* Costs are compared as exact integers; a non-safe integer would compare unreliably. */
export const MAXIMUM_SAFE_HCU_COST = Number.MAX_SAFE_INTEGER;

export const OPERAND_MODES: readonly string[] = ["nonScalar", "scalar", "types"];

/* ---------------------------------------------------------------------------------------------
 * F24 — per-transaction limit availability and reading states.
 *
 * A generic NOT_APPLICABLE may never stand in for a mandatory per-transaction control. Either the
 * getter was read on chain, or its absence is proven from the code-identified artifact with
 * machine-verifiable enforcement evidence.
 * ------------------------------------------------------------------------------------------- */

export const MANDATORY_LIMIT_AVAILABILITY: readonly string[] = [
  "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT",
  "AVAILABLE_AND_READ_ON_CHAIN",
];

export const OPTIONAL_LIMIT_AVAILABILITY: readonly string[] = [
  ...MANDATORY_LIMIT_AVAILABILITY,
  "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
];

export const LIMIT_READING_RESULTS: readonly string[] = [
  "MATCHES_BINDING_RECORD_ON_CHAIN",
  "MISMATCH",
  "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
  "UNRESOLVED",
  "VERIFIED_FROM_CODE_IDENTIFIED_ARTIFACT_NO_GETTER",
];

/* Proof states that may promote a mandatory per-transaction control. */
export const PROMOTING_LIMIT_RESULTS: readonly string[] = [
  "MATCHES_BINDING_RECORD_ON_CHAIN",
  "VERIFIED_FROM_CODE_IDENTIFIED_ARTIFACT_NO_GETTER",
];

/* Machine-verifiable enforcement evidence required for artifact-only proof. Prose alone is not
 * evidence, so each entry is a structured record of where the constant is enforced. */
export const ENFORCEMENT_EVIDENCE_FIELDS: readonly string[] = [
  "comparisonOperator",
  "constantName",
  "constantValue",
  "revertErrorName",
  "sourcePath",
];

/* ---------------------------------------------------------------------------------------------
 * F23 — caller applicability.
 * ------------------------------------------------------------------------------------------- */

export const CALLER_APPLICABILITY_STATES: readonly string[] = [
  "ABSENT_DOCUMENTED",
  "AVAILABLE",
  "NOT_APPLICABLE_WITH_PROOF",
];

/* ---------------------------------------------------------------------------------------------
 * F27 — the exact SG-4 pricing variant closure.
 *
 * Operation names are not variants. SG-4 uses scalar AND non-scalar FheLt, two FheIfThenElse result
 * widths, three TrivialEncrypt result types and three FheRand widths. Compatibility is defined over
 * exactly those used variants, each selected unambiguously by (operation, operand mode, cost key
 * type). Compound descriptions such as "euint128 | euint64" are never a type identity.
 * ------------------------------------------------------------------------------------------- */

export const PRICING_VARIANT_FIELDS: readonly string[] = [
  "arity",
  "canonicalOperation",
  "circuits",
  "costKeyType",
  "enforcementOperation",
  /* F34 — the exact ordered operand types. Arity alone says how many operands there are; it does
   * not say what they are, and two variants of one operation can differ only in that. */
  "operandMode",
  "operandTypes",
  "resultType",
];

export type PricingVariant = {
  canonicalOperation: string;
  enforcementOperation: string;
  operandMode: "scalar" | "nonScalar" | "types";
  costKeyType: string;
  operandTypes: readonly string[];
  resultType: string;
  arity: number;
  circuits: readonly string[];
};

/* ---------------------------------------------------------------------------------------------
 * INVARIANT A — the SG-4 used-variant closure is a PROJECTION of the benchmark layer's canonical
 * operation manifest, which is itself derived from the registered circuits.
 *
 * There is no operation table in this file. A variant no circuit executes cannot appear here, and
 * a variant some circuit executes cannot be missing, because neither statement exists twice.
 * ------------------------------------------------------------------------------------------- */

export function pricingVariantId(variant: {
  canonicalOperation: string;
  operandMode: string;
  costKeyType: string;
}): string {
  return `${variant.canonicalOperation}.${variant.operandMode}.${variant.costKeyType}`;
}

export function projectPricingClosure(
  manifest: readonly CanonicalOperationVariant[] = SG4_CANONICAL_OPERATION_VARIANTS,
): PricingVariant[] {
  return manifest
    .map((variant) => ({
      canonicalOperation: variant.canonicalOperation,
      enforcementOperation: variant.enforcementOperation,
      operandMode: variant.operandMode,
      costKeyType: variant.costKeyType,
      operandTypes: variant.operandTypes,
      resultType: variant.resultType,
      arity: variant.arity,
      circuits: variant.circuits,
    }))
    .sort((left, right) => pricingVariantId(left).localeCompare(pricingVariantId(right)));
}

export const SG4_PRICING_VARIANT_CLOSURE: readonly PricingVariant[] = projectPricingClosure();

/* ---------------------------------------------------------------------------------------------
 * F30 — caller applicability interpretation, target roles and subject binding.
 * ------------------------------------------------------------------------------------------- */

export const APPLICABILITY_INTERPRETATIONS: readonly string[] = [
  "ADDRESS_NONZERO_MEANS_EXEMPT",
  "BOOL_FALSE_MEANS_EXEMPT",
  "BOOL_TRUE_MEANS_EXEMPT",
  "UINT_NONZERO_MEANS_EXEMPT",
];

/* Which ABI return type each interpretation is defined over. No default branch exists. */
export const APPLICABILITY_INTERPRETATION_RETURN_TYPE: Readonly<Record<string, string>> = {
  ADDRESS_NONZERO_MEANS_EXEMPT: "address",
  BOOL_FALSE_MEANS_EXEMPT: "bool",
  BOOL_TRUE_MEANS_EXEMPT: "bool",
  UINT_NONZERO_MEANS_EXEMPT: "uint256",
};

/* A target is a verified role in the deployment chain, never an arbitrary address. */
export const CONTRACT_ROLES: readonly string[] = ["AUTHORITY", "EXECUTOR"];
/* Implementation roles are execution-plan roles only: interface manifests may call the verified
 * proxy-facing surfaces, while raw code reads use these resolved implementation addresses. */
export const LIVE_TARGET_ROLES: readonly string[] = [
  "AUTHORITY",
  "AUTHORITY_IMPLEMENTATION",
  "EXECUTOR",
  "EXECUTOR_IMPLEMENTATION",
  "NONE",
];

/* How a subject's EVM address is established. The benchmark harness is not deployed before the
 * gate, so its relevance must be resolved without requiring a deployed address. */
export const SUBJECT_ADDRESS_SOURCES: readonly string[] = [
  "DETERMINISTIC_PRECOMPUTED_DEPLOYMENT_ADDRESS",
  "NOT_RELEVANT_PROVEN_FROM_ARTIFACT",
  "VERIFIED_DEPLOYMENT_CHAIN_ROLE",
];

export const CALLER_APPLICABILITY_FIELDS: readonly string[] = [
  "absenceProof",
  "acceptedResults",
  "argumentTypes",
  "argumentValues",
  "callContextProof",
  "interpretation",
  "returnType",
  "selector",
  "signature",
  "state",
  "subject",
  "subjectAddress",
  "subjectAddressSource",
  "subjectArgumentIndex",
  "targetRole",
];

/* Structured, artifact-bound absence/non-relevance evidence. Prose may explain it; it is not it. */
export const APPLICABILITY_PROOF_FIELDS: readonly string[] = [
  "checkedAddressExpression",
  "enforcementLayer",
  /* F37 — the parent link. A bare 64-hex range digest proves nothing: any 32 bytes are one. The
   * proof must name an entry of the digest-bound enforcement manifest and carry that manifest's
   * source content hash, so the range belongs to a source the record has already pinned. */
  "parentEnforcementFunction",
  "sourceContentSha256",
  "sourcePath",
  "sourceRangeSha256",
  "statement",
];

export const SG4_APPLICABILITY_SUBJECTS: readonly string[] = [
  "BENCHMARK_HARNESS",
  "FHEVM_EXECUTOR",
  "TRANSACTION_SENDER",
];

export const SUPPORTED_ABI_ARGUMENT_TYPES: readonly string[] = ["address", "bool", "uint256"];
export const SUPPORTED_ABI_RETURN_TYPES: readonly string[] = ["address", "bool", "uint256"];
export const LIMIT_GETTER_RETURN_TYPES: readonly string[] = ["uint256", "uint48"];

/* A canonical zero-argument Solidity function signature. */
export const CANONICAL_SIGNATURE_GRAMMAR = "^[a-zA-Z_$][a-zA-Z0-9_$]*\\(([a-z0-9]+(,[a-z0-9]+)*)?\\)$";

export const UINT256_EXCLUSIVE_UPPER_BOUND = 2n ** 256n;

/* ---------------------------------------------------------------------------------------------
 * F31 — closed limit-getter specifications and the authoritative enforcement/enumeration manifests.
 * ------------------------------------------------------------------------------------------- */

export const LIMIT_GETTER_SPEC_FIELDS: readonly string[] = [
  "argumentTypes",
  "argumentValues",
  "controlId",
  "returnType",
  "selector",
  "signature",
  "state",
  "targetRole",
];

export const LIMIT_CONTROL_IDS: readonly string[] = [
  "BLOCK_OR_BATCH_HCU",
  "TRANSACTION_DEPTH_HCU",
  "TRANSACTION_TOTAL_HCU",
];

export const ENFORCEMENT_PROOF_MANIFEST_SCHEMA = "zama-szn4.sg4-enforcement-proof-manifest.v1";

export const ENFORCEMENT_VALUE_SOURCE_KINDS: readonly string[] = ["CONSTANT", "STORAGE_FIELD"];

export const ENFORCEMENT_PROOF_STORAGE_READ_FIELDS: readonly string[] = [
  "expression",
  "functionName",
  "sourceRangeSha256",
];

export const ENFORCEMENT_PROOF_MANIFEST_FIELDS: readonly string[] = [
  "entries",
  "provenanceSubject",
  "schema",
  "sourceContentSha256",
  "version",
];

export const ENFORCEMENT_PROOF_ENTRY_FIELDS: readonly string[] = [
  "comparisonOperator",
  "constantName",
  "constantValue",
  "controlId",
  "declarationSourceRangeSha256",
  "enforcementFunction",
  "enforcementReads",
  "enforcementSourceRangeSha256",
  "getterReadExpression",
  "getterReturnType",
  "getterSignature",
  "getterSourceRangeSha256",
  "revertErrorName",
  "sourceKind",
  "sourcePath",
  "storageFieldDeclarationSourceRangeSha256",
  "storageFieldName",
  "storageFieldType",
  "storageStructName",
  "storageValue",
];

export const ENFORCEMENT_PROOF_CONSTANT_ENTRY_FIELDS: readonly string[] = [
  "comparisonOperator",
  "constantName",
  "constantValue",
  "controlId",
  "declarationSourceRangeSha256",
  "enforcementFunction",
  "enforcementSourceRangeSha256",
  "revertErrorName",
  "sourceKind",
  "sourcePath",
];

export const ENFORCEMENT_PROOF_STORAGE_ENTRY_FIELDS: readonly string[] = [
  "comparisonOperator",
  "controlId",
  "enforcementReads",
  "getterReadExpression",
  "getterReturnType",
  "getterSignature",
  "getterSourceRangeSha256",
  "revertErrorName",
  "sourceKind",
  "sourcePath",
  "storageFieldDeclarationSourceRangeSha256",
  "storageFieldName",
  "storageFieldType",
  "storageStructName",
  "storageValue",
];

export const ENUMERATION_MANIFEST_SCHEMA = "zama-szn4.sg4-authority-enumeration-manifest.v1";

export const ENUMERATION_MANIFEST_FIELDS: readonly string[] = [
  "callableFunctions",
  "declarations",
  "enumerationComplete",
  "errors",
  "mappings",
  "parseCompleteness",
  "provenanceSubject",
  "schema",
  "sourceContentSha256",
  "storagePrimitives",
  "storageStructFields",
  "version",
];

export const ENUMERATION_MANIFEST_LIST_FIELDS: readonly string[] = [
  "callableFunctions",
  "declarations",
  "errors",
  "mappings",
  "storagePrimitives",
  "storageStructFields",
];

/* ---------------------------------------------------------------------------------------------
 * F32 — implementation-resolution results and the generated live call plan.
 * ------------------------------------------------------------------------------------------- */

export const IMPLEMENTATION_RESOLUTION_RESULTS: readonly string[] = [
  "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
  "UNRESOLVED",
  "VERIFIED_ERC1967_STORAGE_SLOT",
];

/* ---------------------------------------------------------------------------------------------
 * F38 — the proxy implementation-address policy.
 *
 * The runtime used to read `expectedImplementationAddress` and `implementationAddressChangePermitted`
 * from the authority section — but the section is closed and never carried either field, so a valid
 * record could not pin the implementation address and the check was dead code. The policy is now a
 * declared, closed, digest-bound object the schema can actually carry.
 * ------------------------------------------------------------------------------------------- */

export const IMPLEMENTATION_ADDRESS_POLICY_KINDS: readonly string[] = [
  "EXACT_PINNED_ADDRESS",
  "REVIEWED_CODE_IDENTICAL_UPGRADE",
];

export const IMPLEMENTATION_ADDRESS_POLICY_FIELDS: readonly string[] = [
  "expectedImplementationAddress",
  "kind",
  "permittedConditions",
  "policyDigest",
  "reviewRecordSha256",
  "reviewedBy",
];

/* A code-identical upgrade is only reviewable against stated conditions; free prose is not one. */
export const IMPLEMENTATION_ADDRESS_PERMITTED_CONDITIONS: readonly string[] = [
  "NORMALIZED_RUNTIME_IDENTITY_UNCHANGED",
  "RECIPROCAL_EXECUTOR_LINKAGE_UNCHANGED",
  "REPORTED_VERSION_UNCHANGED",
];

export const IMPLEMENTATION_ADDRESS_POLICY_RESULTS: readonly string[] = [
  "EXACT_MATCH",
  "MISMATCH",
  "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
  "PERMITTED_CODE_IDENTICAL_CHANGE",
  "UNRESOLVED",
];

export const DERIVATION_CHAIN_POLICY = {
  stopOnExecutorCodeIdentityMismatch: true,
  stopOnExecutorVersionMismatch: true,
  stopOnAuthorityProxyIdentityMismatch: true,
  /* F38 — everything after this point is read FROM the implementation. Querying a version,
   * reciprocal link, ceiling or exemption from an implementation whose code is not the reviewed
   * artifact would attribute all of it to an unverified contract. */
  stopOnImplementationIdentityMismatch: true,
  stopOnImplementationAddressPolicyViolation: true,
  stopOnUnverifiedDeploymentModel: true,
  rationale:
    "Read-only calls are still a derivation chain. Deriving the authority address from an executor whose code or version does not match the reviewed record would attribute authority to an unverified contract, so the chain stops at the first broken link.",
} as const;

export const LIVE_CALL_PLAN_POLICY = {
  generatedFromBindingRecord: true,
  fixedPlanRejected: true,
  rationale:
    "The real call sequence depends on the deployment model and on how many applicability subjects expose a getter, so a fixed plan cannot describe it. The plan is generated from the validated record and the guarded call log must equal it exactly.",
  /* F39 — the plan is a runtime invariant, not a post-hoc comparison a test happens to make. The
   * transport consumes the plan sequentially, so an extra, missing, reordered or parameter-divergent
   * call is refused at the moment it is issued rather than noticed afterwards. */
  enforcedByTransport: true,
  enforcementRejects: [
    "a call the plan does not contain at this position",
    "a call to an address other than the planned target role's verified address",
    "calldata differing from the planned selector and encoded arguments",
    "a block parameter other than the pinned block where the plan requires one",
    "a method outside the read-only allow-list, independently of the plan",
  ],
  exhaustionRequiredForPass: true,
  allowListRemainsIndependent: true,
} as const;

/* ---------------------------------------------------------------------------------------------
 * F40 — the closed on-chain interface manifest.
 *
 * A free-form `signature -> selector` map was dead record data: execution used hard-coded
 * selectors and could not disagree with it. Every critical call is now a declared, typed entry,
 * and execution consumes those entries. There is no parallel hard-coded path.
 * ------------------------------------------------------------------------------------------- */

export const INTERFACE_MANIFEST_SCHEMA = "zama-szn4.sg4-onchain-interface-manifest.v1";

export const INTERFACE_MANIFEST_FIELDS: readonly string[] = ["entries", "provenanceSubject", "schema", "version"];

export const INTERFACE_CALL_FIELDS: readonly string[] = [
  "argumentTypes",
  "argumentValues",
  "callId",
  "returnType",
  "selector",
  "signature",
  "targetRole",
];

/* The canonical semantics of every critical call. A manifest entry must match its row exactly:
 * the role it is called on, its canonical signature and its return type are not the record's to
 * choose, because execution depends on all three. */
export const INTERFACE_CALL_SPECS: readonly {
  callId: string;
  targetRole: string;
  signature: string;
  returnType: string;
  mandatory: boolean;
}[] = [
  {
    callId: "AUTHORITY_RECIPROCAL_EXECUTOR_GETTER",
    targetRole: "AUTHORITY",
    signature: "getFHEVMExecutorAddress()",
    returnType: "address",
    mandatory: true,
  },
  {
    callId: "AUTHORITY_VERSION",
    targetRole: "AUTHORITY",
    signature: "getVersion()",
    returnType: "string",
    mandatory: true,
  },
  {
    callId: "BLOCK_OR_BATCH_HCU_GETTER",
    targetRole: "AUTHORITY",
    signature: "",
    returnType: "uint256",
    mandatory: false,
  },
  {
    callId: "EXECUTOR_AUTHORITY_GETTER",
    targetRole: "EXECUTOR",
    signature: "getHCULimitAddress()",
    returnType: "address",
    mandatory: true,
  },
  {
    callId: "EXECUTOR_VERSION",
    targetRole: "EXECUTOR",
    signature: "getVersion()",
    returnType: "string",
    mandatory: true,
  },
  {
    callId: "TRANSACTION_DEPTH_HCU_GETTER",
    targetRole: "AUTHORITY",
    signature: "",
    returnType: "uint256",
    mandatory: false,
  },
  {
    callId: "TRANSACTION_TOTAL_HCU_GETTER",
    targetRole: "AUTHORITY",
    signature: "",
    returnType: "uint256",
    mandatory: false,
  },
];

export const MANDATORY_INTERFACE_CALL_IDS: readonly string[] = INTERFACE_CALL_SPECS.filter(
  (spec) => spec.mandatory,
).map((spec) => spec.callId);

/* ---------------------------------------------------------------------------------------------
 * CORRECTION 5 — dynamic interface calls.
 *
 * A caller-applicability getter is as much an eth_call as a limit getter, so it belongs in the one
 * interface manifest. Its call id is derived from its subject rather than fixed in advance, because
 * the set of applicable subjects is a property of the record; everything else about it — role,
 * signature grammar, selector recomputation, argument binding, return type — is closed exactly as
 * for a static call.
 * ------------------------------------------------------------------------------------------- */

export const CALLER_APPLICABILITY_CALL_PREFIX = "CALLER_APPLICABILITY:";

export function callerApplicabilityCallId(subject: string): string {
  return `${CALLER_APPLICABILITY_CALL_PREFIX}${subject}`;
}

/* A dynamic entry carries the subject it resolves, so the interface call and the policy entry
 * cannot describe two different subjects. */
export const DYNAMIC_INTERFACE_CALL_FIELDS: readonly string[] = [
  "argumentTypes",
  "argumentValues",
  "callId",
  "returnType",
  "selector",
  "signature",
  "subject",
  "targetRole",
];

/* An applicability getter answers about a subject, so its return type is one of the decodable
 * answer shapes and its target is a verified contract role. */
export const DYNAMIC_INTERFACE_RETURN_TYPES: readonly string[] = ["address", "bool", "uint256"];

/* Which interface call implements which limit control. The signature itself is the record's, since
 * only the deployed artifact knows it; the ROLE and the return type are not. */
export const LIMIT_CONTROL_INTERFACE_CALLS: Readonly<Record<string, string>> = {
  BLOCK_OR_BATCH_HCU: "BLOCK_OR_BATCH_HCU_GETTER",
  TRANSACTION_DEPTH_HCU: "TRANSACTION_DEPTH_HCU_GETTER",
  TRANSACTION_TOTAL_HCU: "TRANSACTION_TOTAL_HCU_GETTER",
};

/* F40 — an HCU ceiling is enforced by the authority contract, so a limit getter declaring the
 * executor as its target would be read from a contract that does not hold the value. Only the
 * verified AUTHORITY role is permitted. */
export const LIMIT_GETTER_PERMITTED_ROLES: readonly string[] = ["AUTHORITY"];

export const PLANNED_CALL_FIELDS: readonly string[] = [
  "boundToPinnedBlock",
  "callId",
  "data",
  "method",
  "purpose",
  "step",
  "targetRole",
];

export const AUTHORITY_BINDING_RECORD_SHAPE = {
  schema: { const: BINDING_RECORD_SCHEMA },
  recordVersion: { const: BINDING_RECORD_VERSION },
  sections: {
    integrity: ["canonicalization", "canonicalSha256"],
    snapshot: [
      "network",
      "chainId",
      "finalityMode",
      "blockNumberDecimal",
      "blockNumberHex",
      "blockHash",
      "stateRoot",
      "blockTimestamp",
      "capturedAt",
      "rpcMethods",
      "contractAddresses",
      "durabilityModel",
    ],
    stateEvidence: ["executor", "authority", "hcuStorage"],
    sourceMaterial: [...SOURCE_MATERIAL_SUBJECTS],
    lineage: [
      "implementationCommit",
      "implementationTree",
      "benchmarkProtocolSha256",
      "authorityProtocolSha256",
      "permittedBindingPath",
      "bindingPurpose",
    ],
    bindingTarget: ["id", "scope", "supersedes"],
    authorityResolution: ["status", "reviewedIndependently", "reviewStatement"],
    provenance: ["reverificationStatus", "entries", "amendments"],
    artifact: [
      "id",
      "release",
      "sourceReference",
      "compilerReferenceManifest",
      "compilerReferenceManifestSha256",
      "compilerVersion",
      "metadataModel",
      "normalizationManifest",
      "normalizationManifestSha256",
      "implementationNormalizedRuntimeSha256",
      "provenanceSubject",
    ],
    executor: [
      "address",
      "configurationSourceReference",
      "deploymentModel",
      "expectedProxyRuntimeSha256",
      "implementationAddressPolicy",
      "implementationResolutionMechanism",
      "implementationSlot",
      "expectedImplementationNormalizedRuntimeSha256",
      "expectedImplementationVersion",
      "expectedVersion",
      "provenanceSubject",
      "sourceProvenanceSubject",
    ],
    authority: [
      "addressDerivation",
      "deploymentModel",
      "implementationAddressPolicy",
      "expectedProxyRuntimeSha256",
      "implementationResolutionMechanism",
      "implementationSlot",
      "expectedImplementationVersion",
      "expectedImplementationNormalizedRuntimeSha256",
    ],
    operationSchedule: ["pricingManifest", "pricingManifestSha256", "source", "provenanceSubject"],
    enforcementProof: ["manifest", "manifestSha256"],
    authorityEnumeration: ["manifest", "manifestSha256"],
    limits: [
      "semantics",
      "enforcementOperator",
      "configuredCeilingInclusive",
      "enforcementPaths",
      "expectedTransactionTotal",
      "expectedTransactionDepth",
      "getterAvailability",
      "enforcementEvidence",
    ],
    blockOrBatch: ["state", "value", "proof"],
    onChainInterface: ["interfaceManifest", "limitGetterSpecs", "callerApplicability"],
    facets: ["blockOrBatch", "codeIdentity", "limitSemantics", "limitValues", "operationSchedule"],
  },
  provenanceEntryFields: ["subject", "repository", "tag", "commit", "path", "contentSha256", "reverified"],
  provenanceSubjects: [
    "CURRENT_OFFICIAL_ARTIFACT_BUILD",
    "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
    "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD",
    "CURRENT_OFFICIAL_EXECUTOR_SOURCE",
    "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
    "INSTALLED_CALCULATOR",
    "INSTALLED_OPERATION_COST_TABLE",
    "INSTALLED_SOLIDITY_CONFIGURATION",
  ],
  /* F22 — an intentional supersession of a prior-reviewed expectation is an explicit, reviewed
   * amendment. It is never an arbitrary tuple silently accepted in the normal record. */
  /* An amendment names the EXACT superseded tuple, carries a canonical review-record digest, and
   * declares the replacement tuple in full. */
  amendmentFields: [
    "commit",
    "contentSha256",
    "path",
    "reason",
    "repository",
    "reviewRecordSha256",
    "reviewedBy",
    "subject",
    "supersedesCommit",
    "supersedesPath",
    "supersedesRepository",
    "tag",
  ],
  facetFields: ["artifactId", "origin"],
  normalizationManifestFields: NORMALIZATION_MANIFEST_FIELDS,
  pricingManifestFields: PRICING_MANIFEST_FIELDS,
  pricingEntryFields: PRICING_ENTRY_FIELDS,
  callerApplicabilityFields: CALLER_APPLICABILITY_FIELDS,
  applicabilityProofFields: APPLICABILITY_PROOF_FIELDS,
  limitGetterSpecFields: LIMIT_GETTER_SPEC_FIELDS,
  sourceMaterialFields: SOURCE_MATERIAL_FIELDS,
  implementationAddressPolicyFields: IMPLEMENTATION_ADDRESS_POLICY_FIELDS,
  interfaceManifestFields: INTERFACE_MANIFEST_FIELDS,
  interfaceCallFields: INTERFACE_CALL_FIELDS,
  dynamicInterfaceCallFields: DYNAMIC_INTERFACE_CALL_FIELDS,
  immutableReferenceEntryFields: IMMUTABLE_REFERENCE_ENTRY_FIELDS,
  primaryImmutableReferenceFields: PRIMARY_IMMUTABLE_REFERENCE_FIELDS,
  compilerReferenceManifestFields: COMPILER_REFERENCE_MANIFEST_FIELDS,
  compilerReferenceEntryFields: COMPILER_REFERENCE_ENTRY_FIELDS,
  pricingVariantFields: PRICING_VARIANT_FIELDS,
  enforcementEvidenceFields: ENFORCEMENT_EVIDENCE_FIELDS,
  enforcementProofConstantEntryFields: ENFORCEMENT_PROOF_CONSTANT_ENTRY_FIELDS,
  enforcementProofStorageEntryFields: ENFORCEMENT_PROOF_STORAGE_ENTRY_FIELDS,
  enforcementProofStorageReadFields: ENFORCEMENT_PROOF_STORAGE_READ_FIELDS,
  enforcementValueSourceKinds: ENFORCEMENT_VALUE_SOURCE_KINDS,
  limitGetterFields: ["blockOrBatchCap", "transactionDepth", "transactionTotal"],
  getterAvailabilityFields: ["blockOrBatchCap", "transactionDepth", "transactionTotal"],
  mandatoryLimitFields: ["transactionDepth", "transactionTotal"],
  optionalLimitFields: ["blockOrBatchCap"],
  /* Every one of these must hold before the record may claim RESOLVED. */
  resolvedRequires: [
    "artifact, pricing manifest, executor and installed material are cross-linked to their exact provenance subjects",
    "authorityResolution.reviewedIndependently is true",
    "block/batch classification belongs to the same artifact and carries a value or an artifact-bound absence proof",
    "caller applicability resolves for every SG-4 subject",
    "every facet names the record's artifact id with a non-local origin",
    "every internal digest recomputes from the canonical serialization it claims to cover",
    "every provenance entry is reverified and matches the prior-reviewed tuple or a reviewed amendment",
    "limit semantics are a resolved enum with a coherent operator and inclusivity",
    "the artifact carries a compiler version, metadata model, normalization manifest and digest",
    "the authoritative implementation normalized runtime hash is present",
    "the mandatory per-transaction limits are read on chain or proven from the code-identified artifact",
    "the pricing manifest is non-empty, injective and carries costs for every operation",
    "the provenance reverification status is REVERIFIED",
  ],
} as const;

/* Finality policy for the pinned block. */
export const PINNED_BLOCK_FINALITY_POLICY = {
  blockTag: "finalized",
  rationale:
    "A reorg-eligible head makes an authority result unreproducible. The pinned block must be finalized where the committed endpoint supports the tag.",
  fallbackToLatestForbidden: true,
  failClosedIfFinalizedUnavailable: true,
} as const;

/* JSON-RPC response integrity and resource bounds. */
export const RPC_RESPONSE_POLICY = {
  requireHttp2xx: true,
  requireJsonObject: true,
  requireJsonRpcVersion: "2.0",
  requireExactRequestId: true,
  monotonicallyIncreasingRequestIds: true,
  requireExactlyOneOfResultOrError: true,
  rejectRedirects: true,
  maximumResponseBytes: 8 * 1024 * 1024,
  retainSanitizedErrorsOnly: true,
} as const;

/* Implementation and runtime paths whose blob must be byte-identical at A and at B. If any of them
 * differs, B changed implementation source and the lineage is broken. */
export const SG4_IMPLEMENTATION_PATHS: readonly string[] = [
  "contracts/benchmarks/SG4FheBenchmarkHarness.sol",
  "docs/security/SG4_BENCHMARK_PROTOCOL.md",
  "docs/security/SG4_HCU_AUTHORITY_PROTOCOL.md",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/sg4-hcu-authority-binding-generator.ts",
  "scripts/sg4-hcu-authority-launcher.cjs",
  "scripts/sg4-hcu-authority-protocol.ts",
  "scripts/sg4-hcu-authority.ts",
  "scripts/sg4-protocol.ts",
  "test/SG4BenchmarkProtocol.ts",
  "test/SG4HcuAuthority.ts",
];

export const PREPARATION_LINEAGE_MODEL = {
  model: "HISTORICAL_V4_PRESERVED_PLUS_V2_A2_TO_BINDING_B",
  historicalBindingPath: HISTORICAL_BINDING_RECORD_PATH,
  historicalBindingSchema: HISTORICAL_BINDING_RECORD_SCHEMA,
  historicalBindingVersion: HISTORICAL_BINDING_RECORD_VERSION,
  historicalBindingMustRemainByteIdentical: true,
  historicalBindingIsNeverV2Fallback: true,
  activeBindingTargetId: V2_BINDING_TARGET_ID,
  activeBindingTargetScope: V2_BINDING_TARGET_SCOPE,
  activeBindingPath: V2_BINDING_RECORD_PATH,
  activeBindingSchema: BINDING_RECORD_SCHEMA,
  activeBindingVersion: BINDING_RECORD_VERSION,
  selfReferentialBindingRejected: true,
  rejectedModel:
    "A single commit whose tracked source records that same commit's hash and tree. Unsatisfiable by construction: recording the value changes the tree, and committing the change changes the commit.",
  rejectedPreparationOnlyRecord:
    "A binding record carrying only the lineage. It leaves the artifact hash, provenance result, operation schedule and limit semantics hardcoded as unresolved in commit A, with no permitted action able to supply them afterwards.",
  bindingRecordPath: BINDING_RECORD_PATH,
  bindingRecordSchema: BINDING_RECORD_SCHEMA,
  bindingRecordCarriesLateBoundAuthorityInputs: true,
  bindingRecordCreatedDuringThisPreparation: true,
  bindingRecordAbsenceIsBlockingOnlyForCandidateAndPostCommit: true,
  bindingRecordMustNotContainItsOwnCommitOrTree: true,
  bindingCommitMustChangeOnlyTheBindingRecord: true,
  bindingCommitMustHaveExactlyOneParent: true,
  mergeCommitsRejected: true,
  implementationPathsMustBeBlobIdenticalAcrossAAndB: true,
  implementationPaths: SG4_IMPLEMENTATION_PATHS,
  noSourceEditPermittedAfterB: true,
  implementationEditRequiresFreshLineage: true,
  branchRequired: "main",
  cleanWorktreeRequired: true,
  cleanIndexRequired: true,
  verifiedAt: ["CLEAN_HEAD_A2_WITHOUT_BINDING", "CLEAN_HEAD_A2_WITH_UNTRACKED_CANDIDATE", "CLEAN_HEAD_B"],
  checks: [
    "current branch is main",
    "the historical binding remains byte-identical and is never used as the V2 fallback",
    "preparation has no V2 binding; candidate mode has a clean tracked worktree/index and exactly one untracked V2 binding",
    "the V2 binding target identifier and auditable historical supersession link are exact",
    "the binding commit B has exactly one parent; merge and octopus commits are rejected",
    "HEAD^ equals the recorded implementationCommit A2",
    "HEAD^{tree} is the binding tree and is NOT required to equal A2's tree",
    "the recorded implementationTree equals A2^{tree}",
    "git diff --name-only A2..B is exactly the dedicated binding-record path",
    "every SG-4 implementation and runtime path has the same blob at B as at A2",
    "the authority-binding record's schema, closed shape, lineage and late-bound authority inputs are valid",
    "no third commit or unrelated change has been introduced without reopening review",
  ],
  postReviewSequence: [
    "A. preserve the original preparation commit and historical binding unchanged",
    "B. commit the remediated closure implementation as A2, with no V2 binding record",
    "C. generate one untracked V2 binding candidate naming A2 and verify it live without requiring B",
    "D. commit only the candidate bytes as B",
    "E. verify B has parent A2 and changes only the binding record",
    "F. replay the exact bound snapshot and complete post-commit live verification",
  ],
} as const;

/* ---------------------------------------------------------------------------------------------
 * Stale-constant guard scope.
 *
 * The guard scans the complete SG-4 changed and runtime source scope, and detects symbol and import
 * use rather than only the literal address string. The stale values themselves may appear only in
 * the protocol/guard definition and in tests.
 * ------------------------------------------------------------------------------------------- */

export const SG4_GUARDED_SOURCE_SCOPE: readonly string[] = [
  "contracts/benchmarks/SG4FheBenchmarkHarness.sol",
  "scripts/sg4-hcu-authority-binding-generator.ts",
  "scripts/sg4-hcu-authority-launcher.cjs",
  "scripts/sg4-hcu-authority-protocol.ts",
  "scripts/sg4-hcu-authority.ts",
  "scripts/sg4-protocol.ts",
  "test/SG4BenchmarkProtocol.ts",
  "test/SG4HcuAuthority.ts",
];

/* Files permitted to contain the registered stale value or the guarded symbol names, because they
 * are the definition of the guard and its tests. Everything else in scope must be clean. */
export const SG4_STALE_GUARD_DEFINITION_FILES: readonly string[] = [
  "scripts/sg4-hcu-authority-protocol.ts",
  "test/SG4HcuAuthority.ts",
];

/* Symbols and import paths that would reintroduce the plugin's hardcoded HCULimit constant as
 * authority even without the literal address ever appearing.
 *
 * `HCULimitAddress` is matched only when it is NOT the executor's own `getHCULimitAddress()`
 * getter: deriving the authority address from the verified executor is the required mechanism,
 * while referencing the plugin's constant of nearly the same name is the prohibited one. */
export const SG4_STALE_AUTHORITY_SYMBOL_PATTERNS: readonly { id: string; pattern: string }[] = [
  { id: "PLUGIN_HCU_LIMIT_ADDRESS_CONSTANT", pattern: "(?<!get)HCULimitAddress" },
  { id: "PLUGIN_RELAYER_SDK_CONSTANT_BAG", pattern: "ZAMA_FHE_RELAYER_SDK_PACKAGE" },
  { id: "PLUGIN_INTERNAL_CONSTANTS_MODULE", pattern: "hardhat-plugin/(?:src/)?internal/constants" },
  { id: "PLUGIN_DERIVED_AUTHORITY_HELPER", pattern: "[A-Za-z]*HcuLimitAddressFromPlugin" },
];

/* ---------------------------------------------------------------------------------------------
 * SG-4 operation coverage.
 * ------------------------------------------------------------------------------------------- */

/* Work that consumes gas but is not executor compute HCU. Classifying these explicitly prevents
 * them from being silently counted as, or excluded from, HCU accounting. */
export const NON_HCU_WORK: readonly { category: string; calls: readonly string[]; rationale: string }[] = [
  {
    category: "ACL_AUTHORIZATION",
    calls: ["FHE.allowThis"],
    rationale:
      "ACL bookkeeping on the ACL contract; emits no coprocessor operator event and has no HCUByOperator cost.",
  },
  {
    category: "PUBLIC_DECRYPTION_AUTHORIZATION",
    calls: ["FHE.makePubliclyDecryptable"],
    rationale: "Marks a handle publicly decryptable; authorization only, not a homomorphic operation.",
  },
  {
    category: "ENCRYPTED_STORAGE",
    calls: ["SSTORE of euint64/euint128/ebool handles"],
    rationale: "Ordinary EVM storage of 32-byte handles; gas-only.",
  },
  {
    category: "EVENT_EMISSION",
    calls: ["_begin", "_complete"],
    rationale: "Benchmark bookkeeping events carrying no handles or ciphertext; gas-only.",
  },
  {
    category: "EXCLUDED_SETUP_TRIVIAL_ENCRYPT",
    /* The exact calls, not a description of them. Each IS homomorphic work — TrivialEncrypt — but
     * it happens in the constructor or in an operator-only setup entry point, so it belongs to no
     * measured circuit and appears in no canonical variant. Enumerating them is what makes the
     * exclusion auditable rather than a sentence a substring check happens to satisfy. */
    calls: ["FHE.asEbool(bool)", "FHE.asEuint128(uint128)", "FHE.asEuint64(uint64)"],
    rationale:
      "Excluded preparation transactions: the constructor and the operator-only setup entry points. Their gas and HCU never enter measured statistics, so they are deliberately absent from every measured circuit and therefore from the canonical variant manifest.",
  },
];

/* ---------------------------------------------------------------------------------------------
 * Live read-only mode policy (prepared, never executed during preparation).
 * ------------------------------------------------------------------------------------------- */

/* `eth_getStorageAt` is on the allow-list because the ERC-1967 implementation slot is a raw storage
 * slot, not a function. The deployed proxy is not known to expose a verified implementation getter,
 * and claiming slot resolution through `eth_call` without a verified getter and selector would be
 * technically false: `eth_call` against a proxy is delegated to the implementation and cannot read
 * the proxy's own slot. Reading the exact slot at the pinned block is the correct mechanism. */
export const LIVE_RPC_ALLOWED_METHODS: readonly string[] = [
  "eth_call",
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getStorageAt",
];

/* eip-1967: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1). */
export const ERC1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/* ERC-7201 namespace used by HCULimit v0.3.0. The authenticated source declares this exact
 * constant and five uint48 fields packed least-significant field first into this word. */
export const HCU_LIMIT_STORAGE_SLOT = "0xc13af6c514bff8997f30c90003baa82bd02aad978179d1ce58d85c4319ad6500";

export const ERC1967_IMPLEMENTATION_RESOLUTION = {
  mechanism: "ETH_GET_STORAGE_AT_EXACT_ERC1967_SLOT_AT_THE_PINNED_BLOCK",
  slot: ERC1967_IMPLEMENTATION_SLOT,
  slotPreimage: 'bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)',
  ethCallResolutionForbiddenWithoutVerifiedGetter: true,
  rationale:
    "A proxy delegates eth_call to its implementation, so eth_call cannot read the proxy's own ERC-1967 slot. A getter may be used only if the deployed proxy is verified to expose one and its selector is verified; no such getter is known for HCULimit, so the slot is read directly.",
  wordMustBeLeftPaddedAddress: true,
  zeroImplementationIsFailure: true,
} as const;

/* Read-only selectors, committed as literals and recomputed from their signatures by the verifier
 * so a mistyped literal fails rather than silently calling something else. */
export const READ_ONLY_SELECTORS = {
  "getVersion()": "0x0d8e6e2c",
  "getHCULimitAddress()": "0xe0786972",
  "getFHEVMExecutorAddress()": "0x268d6d31",
} as const;

export const LIVE_RPC_FORBIDDEN_METHOD_PREFIXES: readonly string[] = [
  "debug_",
  "eth_accounts",
  "eth_getBalance",
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "personal_",
  "trace_",
  "wallet_",
];

export const LIVE_RPC_ENDPOINT = "https://ethereum-sepolia-rpc.publicnode.com";
export const LIVE_RPC_ENDPOINT_ENV = "SEPOLIA_RPC_URL";
export const LIVE_ACKNOWLEDGEMENT = "I ACKNOWLEDGE SG4 LIVE READ ONLY AUTHORITY VERIFICATION";

/* ---------------------------------------------------------------------------------------------
 * Helpers.
 * ------------------------------------------------------------------------------------------- */

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`SG4 HCU-authority protocol invariant failed: ${message}`);
}

function decimal(value: bigint): string {
  return value.toString(10);
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function isSortedUnique(values: readonly string[]): boolean {
  for (let i = 1; i < values.length; i++) if (values[i - 1] >= values[i]) return false;
  return true;
}

/* Exclusive safety-gate evaluation. Equality with a boundary is NO-GO. */
export function evaluateSafety(
  metric: "globalHCU" | "maxHCUDepth",
  value: bigint,
): { metric: string; control: string; threshold: string; value: string; pass: boolean } {
  const threshold = metric === "globalHCU" ? TOTAL_SAFETY_THRESHOLD : DEPTH_SAFETY_THRESHOLD;
  return {
    metric,
    control: MEASUREMENT_MAPPING[metric],
    threshold: decimal(threshold),
    value: decimal(value),
    pass: value < threshold,
  };
}

export type CombinedHcuInput = { globalHCU?: bigint; maxHCUDepth?: bigint };

/* Both metrics are mandatory and independent: neither may substitute for the other, and a missing
 * metric is a failure rather than a skipped check. */
export function evaluateCombinedHcu(input: CombinedHcuInput): {
  totalPresent: boolean;
  depthPresent: boolean;
  totalSafetyPass: boolean;
  depthSafetyPass: boolean;
  verdict: "GO" | "NO_GO";
  reasons: string[];
} {
  const reasons: string[] = [];
  const totalPresent = typeof input.globalHCU === "bigint";
  const depthPresent = typeof input.maxHCUDepth === "bigint";
  if (!totalPresent) reasons.push("MISSING_GLOBAL_HCU");
  if (!depthPresent) reasons.push("MISSING_MAX_HCU_DEPTH");
  const totalSafetyPass = totalPresent && (input.globalHCU as bigint) < TOTAL_SAFETY_THRESHOLD;
  const depthSafetyPass = depthPresent && (input.maxHCUDepth as bigint) < DEPTH_SAFETY_THRESHOLD;
  if (totalPresent && !totalSafetyPass) reasons.push("TOTAL_SAFETY_BOUNDARY_EXCEEDED_OR_EQUALLED");
  if (depthPresent && !depthSafetyPass) reasons.push("DEPTH_SAFETY_BOUNDARY_EXCEEDED_OR_EQUALLED");
  return {
    totalPresent,
    depthPresent,
    totalSafetyPass,
    depthSafetyPass,
    verdict: totalSafetyPass && depthSafetyPass ? "GO" : "NO_GO",
    reasons,
  };
}

export type LiveDeploymentBinding = "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION" | "PENDING_LIVE_DEPLOYMENT_BINDING";

export type ControlDeclaration = {
  metricId: string;
  scope: string;
  unit: string;
  authorityState: AuthorityState;
  value: string | null;
  absenceReason: string | null;
  verificationMethod: string;
  sourceImplementation: string;
  applicabilityConclusion: string;
  /* Records whether the state above describes the exact deployed implementation at a pinned block
   * or only the installed local artifact. Offline preparation can never produce the former. */
  liveDeploymentBinding: LiveDeploymentBinding;
  blocking: boolean;
};

/* A control blocks whenever it has not been bound to the verified deployed implementation. That is
 * true both when nothing is known (UNRESOLVED) and when only a local expectation exists
 * (LOCAL_EXPECTED_PENDING_LIVE_BINDING). PROVEN_ABSENT is a resolved conclusion about a verified
 * implementation and must not be conflated with either. */
export function controlIsBlocking(state: AuthorityState): boolean {
  return state === "UNRESOLVED" || state === "LOCAL_EXPECTED_PENDING_LIVE_BINDING";
}

export function validateControl(control: ControlDeclaration): void {
  switch (control.authorityState) {
    case "PROVEN_PRESENT":
      invariant(control.value !== null, `${control.metricId}: PROVEN_PRESENT requires a numeric value`);
      invariant(control.unit.length > 0 && control.scope.length > 0, `${control.metricId}: unit and scope required`);
      invariant(
        control.verificationMethod.length > 0,
        `${control.metricId}: verified enforcement path required for PROVEN_PRESENT`,
      );
      invariant(
        control.liveDeploymentBinding === "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
        `${control.metricId}: PROVEN_PRESENT requires a live deployment binding`,
      );
      break;
    case "LOCAL_EXPECTED_PENDING_LIVE_BINDING":
      invariant(control.value !== null, `${control.metricId}: local expected value required`);
      invariant(control.blocking, `${control.metricId}: an unbound local expectation must be blocking`);
      invariant(
        control.liveDeploymentBinding === "PENDING_LIVE_DEPLOYMENT_BINDING",
        `${control.metricId}: local expectation must declare a pending live binding`,
      );
      break;
    case "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION":
      invariant(control.value === null, `${control.metricId}: PROVEN_ABSENT forbids a numeric value`);
      invariant(
        control.verificationMethod.includes("ENUMERAT"),
        `${control.metricId}: PROVEN_ABSENT requires exhaustive enumeration`,
      );
      invariant(
        control.sourceImplementation.length > 0,
        `${control.metricId}: PROVEN_ABSENT requires implementation identity`,
      );
      /* Absence is a claim about a specific deployed implementation. Without the code-identity
       * binding the enumeration describes some local file, not the authority. */
      invariant(
        control.liveDeploymentBinding === "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
        `${control.metricId}: PROVEN_ABSENT requires a verified deployed implementation`,
      );
      break;
    case "UNRESOLVED":
      invariant(control.blocking, `${control.metricId}: UNRESOLVED must be blocking`);
      break;
    case "NOT_APPLICABLE":
      invariant(
        control.absenceReason !== null && control.absenceReason.length > 0,
        `${control.metricId}: NOT_APPLICABLE requires an explicit reason`,
      );
      break;
  }
  invariant(
    control.blocking === controlIsBlocking(control.authorityState),
    `${control.metricId}: blocking flag inconsistent with authority state`,
  );
}

/* The prepared (offline) control set.
 *
 * Nothing here is bound to a deployed implementation, because offline preparation makes no RPC
 * call. The two per-transaction controls therefore carry the local expected value and remain
 * blocking, and the block/batch control is UNRESOLVED rather than proven absent: establishing
 * absence requires enumerating the complete interface, storage, and enforcement surface of the
 * exact deployed implementation, which only the live verifier can identify. */
export function buildPreparedControls(): ControlDeclaration[] {
  return [
    {
      metricId: "TRANSACTION_TOTAL_HCU",
      scope: "PER_TRANSACTION",
      unit: "HCU",
      authorityState: "LOCAL_EXPECTED_PENDING_LIVE_BINDING",
      value: decimal(TRANSACTION_TOTAL_HCU_LIMIT),
      absenceReason: null,
      verificationMethod:
        "Constant MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX read from the installed, integrity-pinned implementation and confirmed by its enforcement path _updateAndVerifyHCUTransactionLimit, which reverts HCUTransactionLimitExceeded when the accumulated transaction total is greater than or equal to the constant. This is a local expectation: it is not yet bound to the implementation deployed behind the authority proxy at a pinned block.",
      sourceImplementation: "@fhevm/host-contracts@0.10.0 contracts/HCULimit.sol",
      applicabilityConclusion: "EXPECTED_APPLICABLE_TO_EVERY_SG4_MEASURED_TRANSACTION_PENDING_LIVE_BINDING",
      liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
      blocking: true,
    },
    {
      metricId: "TRANSACTION_DEPTH_HCU",
      scope: "PER_TRANSACTION",
      unit: "HCU",
      authorityState: "LOCAL_EXPECTED_PENDING_LIVE_BINDING",
      value: decimal(TRANSACTION_DEPTH_HCU_LIMIT),
      absenceReason: null,
      verificationMethod:
        "Constant MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX read from the installed, integrity-pinned implementation and confirmed by its three enforcement paths _adjustAndCheckFheTransactionLimitOneOp/TwoOps/ThreeOps, which revert HCUTransactionDepthLimitExceeded when opHCU plus the maximum operand depth is greater than or equal to the constant. Operand depth is held in transient storage (tload/tstore), which establishes per-transaction rather than per-block scope. This is a local expectation: it is not yet bound to the implementation deployed behind the authority proxy at a pinned block.",
      sourceImplementation: "@fhevm/host-contracts@0.10.0 contracts/HCULimit.sol",
      applicabilityConclusion: "EXPECTED_APPLICABLE_TO_EVERY_SG4_MEASURED_TRANSACTION_PENDING_LIVE_BINDING",
      liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
      blocking: true,
    },
    {
      metricId: "BLOCK_OR_BATCH_HCU",
      scope: "PER_BLOCK_OR_BATCH",
      unit: "HCU",
      authorityState: "UNRESOLVED",
      value: null,
      absenceReason: null,
      verificationMethod:
        "Not established. Absence of a block-scoped or batch-scoped control may only be concluded after the exact deployed implementation is identified by address-normalized code identity at a pinned block and its complete relevant surface is enumerated: every state and constant variable of every width including uint48, every public, external, and internal function, every getter, mapping, accumulator, storage slot, error, event, and enforcement path. A pattern scan for `uint256 private constant MAX_*` is not exhaustive and cannot establish absence.",
      sourceImplementation: "NOT_YET_IDENTIFIED_PENDING_LIVE_CODE_IDENTITY",
      applicabilityConclusion: "UNRESOLVED_THEREFORE_BLOCKING",
      liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
      blocking: true,
    },
  ];
}

/* ---------------------------------------------------------------------------------------------
 * Sanitized result schema.
 *
 * The schema is closed in both directions: unknown properties are rejected, and every required
 * property is present in every result regardless of verdict. A BLOCKED result stays representable
 * because each check that can fail to complete has an explicit `UNRESOLVED` spelling rather than
 * being omitted — omission and "could not complete" must not look alike.
 * ------------------------------------------------------------------------------------------- */

export const AUTHORITY_STATES: readonly string[] = [
  "LOCAL_EXPECTED_PENDING_LIVE_BINDING",
  "NOT_APPLICABLE",
  "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION",
  "PROVEN_PRESENT",
  "UNRESOLVED",
];

export const LIVE_DEPLOYMENT_BINDINGS: readonly string[] = [
  "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
  "PENDING_LIVE_DEPLOYMENT_BINDING",
];

/* Fields that must be able to say "this check did not complete" without pretending to a value. */
const HASH_OR_UNRESOLVED = { type: "string", pattern: "^([0-9a-f]{64}|UNRESOLVED)$" } as const;
const ADDRESS_OR_UNRESOLVED = { type: "string", pattern: "^(0x[0-9a-fA-F]{40}|UNRESOLVED)$" } as const;
const STRING_ARRAY = { type: "array", items: { type: "string" } } as const;

function facetBindingSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["artifactId", "origin"],
    properties: {
      artifactId: { type: "string" },
      origin: { enum: FACET_ORIGINS },
    },
  };
}

function onChainLimitReadingSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["getterAvailability", "onChainValue", "result"],
    properties: {
      /* Availability is never a bare NOT_APPLICABLE for a mandatory control. */
      getterAvailability: { enum: [...OPTIONAL_LIMIT_AVAILABILITY, "UNRESOLVED"] },
      onChainValue: { type: "string", pattern: "^([0-9]+|UNRESOLVED|NOT_READ_NO_GETTER|NOT_APPLICABLE)$" },
      result: { enum: LIMIT_READING_RESULTS },
    },
  };
}

function callerApplicabilityResultSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["result", "state", "subject", "subjectAddress"],
    properties: {
      result: {
        enum: ["EXEMPT", "MALFORMED", "NOT_APPLICABLE_WITH_PROOF", "NOT_EXEMPT", "UNKNOWN_EXEMPTION", "UNRESOLVED"],
      },
      state: { enum: [...CALLER_APPLICABILITY_STATES, "UNRESOLVED"] },
      subject: { enum: [...SG4_APPLICABILITY_SUBJECTS] },
      subjectAddress: { type: "string" },
    },
  };
}

function controlStateSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["authorityState", "blocking", "liveDeploymentBinding"],
    properties: {
      authorityState: { enum: AUTHORITY_STATES },
      blocking: { type: "boolean" },
      liveDeploymentBinding: { enum: LIVE_DEPLOYMENT_BINDINGS },
      /* Present only when the state carries a value. */
      value: { type: "string", pattern: "^[0-9]+$" },
      scope: { type: "string" },
      reason: { type: "string" },
    },
  };
}

export function buildResultSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: AUTHORITY_RESULT_SCHEMA,
    type: "object",
    additionalProperties: false,
    required: [
      "accountAuthorizationRequested",
      "authoritativeArtifactId",
      "authorityAddress",
      "authorityBindingRecordResult",
      "authorityCodeHash",
      "authorityCodeIdentityResult",
      "authorityDeploymentModel",
      "authorityImplementationAddress",
      "authorityProtocolDigest",
      "authorityTableHash",
      "authorityVersion",
      "authorityVersionResult",
      "benchmarkProtocolDigest",
      "blockOrBatchControlState",
      "blockOrBatchOnChainReading",
      "calculatorHash",
      "callerApplicabilityResults",
      "callerExemptionResult",
      "chainId",
      "codeIdentityResult",
      "deployedAuthorityRoot",
      "depthHcuLimit",
      "depthHcuOnChainReading",
      "depthSafetyThreshold",
      "erc1967SlotReadCount",
      "executorAddress",
      "executorAuthorityDerivationResult",
      "executorCodeHash",
      "executorCodeIdentityResult",
      "executorDeploymentModel",
      "executorExpectedImplementationAddress",
      "executorExpectedImplementationCodeHash",
      "executorExpectedNormalizedImplementationHash",
      "executorExpectedVersion",
      "executorImplementationAddress",
      "executorImplementationAddressPolicyResult",
      "executorImplementationCodeHash",
      "executorImplementationCodeIdentityResult",
      "executorImplementationResolutionResult",
      "executorNormalizedImplementationHash",
      "executorProxyCodeHash",
      "executorProxyCodeIdentityResult",
      "executorReproducedBuildInfoSha256",
      "executorReproducedBuildResult",
      "executorVersion",
      "executorVersionResult",
      "expectedDeployedNormalizedHash",
      "facetArtifactBinding",
      "finalVerdict",
      "gate",
      "greatestAcceptedDepthHcu",
      "greatestAcceptedTotalHcu",
      "immutableProvenanceState",
      "implementationAddressPolicyResult",
      "implementationResolutionResult",
      "installedSourceHashesResult",
      "installedTableHash",
      "liveCallCount",
      "liveCallLogDigest",
      "liveLimitSemantics",
      "livePlanCallCount",
      "livePlanDigest",
      "localAuthorityFixtureRoot",
      "localFixtureSelfTestResult",
      "measurementToolchainRoot",
      "normalizedImplementationHash",
      "operationCompatibilityResult",
      "operationScheduleAuthorityState",
      "pinnedBlockFinality",
      "pinnedBlockHash",
      "pinnedBlockNumber",
      "planEnforcementResult",
      "preparationLineageResult",
      "protocolVersion",
      "reciprocalLinkageResult",
      "reproducedBuildInfoSha256",
      "reproducedBuildResult",
      "rpcMethodsUsed",
      "safetyBoundExclusivity",
      "schema",
      "sg4CoverageResult",
      "signingRequested",
      "staleAddressGuardResult",
      "status",
      "totalHcuLimit",
      "totalHcuOnChainReading",
      "totalSafetyThreshold",
      "transactionDepthControlState",
      "transactionSubmitted",
      "transactionTotalControlState",
      "unsupportedOperations",
      "walletRequested",
    ],
    properties: {
      accountAuthorizationRequested: { const: false },
      /* Which artifact every downstream facet was resolved against. */
      authoritativeArtifactId: { type: "string" },
      authorityAddress: ADDRESS_OR_UNRESOLVED,
      /* Whether the reviewed authority-binding record was present, complete and internally
       * consistent. Everything late-bound depends on it. */
      authorityBindingRecordResult: { enum: ["ABSENT", "INVALID", "UNRESOLVED", "VALID"] },
      authorityCodeHash: HASH_OR_UNRESOLVED,
      authorityCodeIdentityResult: { enum: ["MISMATCH", "UNRESOLVED", "VERIFIED"] },
      authorityDeploymentModel: { enum: [...DEPLOYMENT_MODELS, "UNRESOLVED"] },
      authorityImplementationAddress: ADDRESS_OR_UNRESOLVED,
      authorityProtocolDigest: HASH_OR_UNRESOLVED,
      /* F33 — the toolchain SG-4 measures with. Constant, local, PASS-relevant. */
      measurementToolchainRoot: {
        type: "object",
        additionalProperties: false,
        required: [
          "calculatorPath",
          "costTablePath",
          "executionRelevantFiles",
          "integrity",
          "package",
          "verificationResult",
          "version",
        ],
        properties: {
          calculatorPath: { const: MEASUREMENT_TOOLCHAIN_ROOT.calculatorPath },
          executionRelevantFiles: {
            type: "array",
            items: { type: "string" },
          },
          verificationResult: { enum: [...MEASUREMENT_ROOT_VERIFICATION.results] },
          costTablePath: { const: MEASUREMENT_TOOLCHAIN_ROOT.costTablePath },
          integrity: { const: MEASUREMENT_TOOLCHAIN_ROOT.integrity },
          package: { const: MEASUREMENT_TOOLCHAIN_ROOT.package },
          version: { const: MEASUREMENT_TOOLCHAIN_ROOT.version },
        },
      },
      /* F33 — the deployed authority artifact, derived from the record's selected provenance
       * tuple. No local package value may appear here, and none is required for a PASS. */
      deployedAuthorityRoot: {
        type: "object",
        additionalProperties: false,
        required: [...DEPLOYED_AUTHORITY_ROOT_POLICY.fields],
        properties: Object.fromEntries(
          DEPLOYED_AUTHORITY_ROOT_POLICY.fields.map((field) => [field, { type: "string" }]),
        ),
      },
      /* F33 — reported, never required: the installed 0.10.0 fixture pin. */
      localAuthorityFixtureRoot: {
        type: "object",
        additionalProperties: false,
        required: ["integrity", "package", "passRelevant", "version"],
        properties: {
          integrity: { type: "string" },
          package: { type: "string" },
          passRelevant: { const: false },
          version: { type: "string" },
        },
      },
      authorityTableHash: HASH_OR_UNRESOLVED,
      /* F39 - the plan the verifier generated, and the calls it actually made under it. */
      /* CL4 — whether the supplied official build IS the build Commit A pinned. */
      reproducedBuildResult: { enum: ["MATCHES_PINNED_REPRODUCED_BUILD", "MISMATCH", "UNRESOLVED"] },
      reproducedBuildInfoSha256: HASH_OR_UNRESOLVED,
      livePlanDigest: HASH_OR_UNRESOLVED,
      livePlanCallCount: { type: "integer", minimum: 0 },
      liveCallLogDigest: HASH_OR_UNRESOLVED,
      liveCallCount: { type: "integer", minimum: 0 },
      planEnforcementResult: {
        enum: ["ENFORCED_EXACT", "NOT_APPLICABLE_PLAN_UNRESOLVED", "UNRESOLVED", "VIOLATED"],
      },
      authorityVersion: { type: "string" },
      authorityVersionResult: { enum: ["MATCHES_BINDING_RECORD", "MISMATCH", "UNRESOLVED"] },
      benchmarkProtocolDigest: HASH_OR_UNRESOLVED,
      blockOrBatchControlState: controlStateSchema(),
      blockOrBatchOnChainReading: onChainLimitReadingSchema(),
      /* One resolved entry per SG-4 subject; a null field alone never establishes applicability. */
      callerApplicabilityResults: { type: "array", items: callerApplicabilityResultSchema() },
      callerExemptionResult: {
        enum: ["EXEMPT", "NOT_APPLICABLE_WITH_PROOF", "NOT_EXEMPT", "UNKNOWN_EXEMPTION", "UNRESOLVED"],
      },
      depthHcuOnChainReading: onChainLimitReadingSchema(),
      calculatorHash: HASH_OR_UNRESOLVED,
      chainId: { const: decimal(SEPOLIA_CHAIN_ID) },
      /* BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED is distinct from MISMATCH: differing from the
       * local 0.10.0 fixture is not evidence of anything about the current deployment. */
      codeIdentityResult: {
        enum: ["BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED", "MISMATCH", "UNRESOLVED", "VERIFIED"],
      },
      depthHcuLimit: { const: decimal(TRANSACTION_DEPTH_HCU_LIMIT) },
      depthSafetyThreshold: { const: decimal(DEPTH_SAFETY_THRESHOLD) },
      implementationResolutionResult: { enum: IMPLEMENTATION_RESOLUTION_RESULTS },
      implementationAddressPolicyResult: { enum: IMPLEMENTATION_ADDRESS_POLICY_RESULTS },
      executorAddress: { const: SEPOLIA_EXECUTOR_ADDRESS },
      executorCodeHash: HASH_OR_UNRESOLVED,
      erc1967SlotReadCount: { type: "integer", minimum: 0 },
      executorProxyCodeHash: HASH_OR_UNRESOLVED,
      executorProxyCodeIdentityResult: { enum: ["MISMATCH", "UNRESOLVED", "VERIFIED"] },
      executorImplementationAddress: ADDRESS_OR_UNRESOLVED,
      executorExpectedImplementationAddress: ADDRESS_OR_UNRESOLVED,
      executorExpectedImplementationCodeHash: HASH_OR_UNRESOLVED,
      executorImplementationResolutionResult: { enum: IMPLEMENTATION_RESOLUTION_RESULTS },
      executorImplementationAddressPolicyResult: { enum: IMPLEMENTATION_ADDRESS_POLICY_RESULTS },
      executorImplementationCodeHash: HASH_OR_UNRESOLVED,
      executorNormalizedImplementationHash: HASH_OR_UNRESOLVED,
      executorExpectedNormalizedImplementationHash: HASH_OR_UNRESOLVED,
      executorExpectedVersion: { type: "string" },
      executorImplementationCodeIdentityResult: { enum: ["MISMATCH", "UNRESOLVED", "VERIFIED"] },
      executorReproducedBuildInfoSha256: HASH_OR_UNRESOLVED,
      executorReproducedBuildResult: { enum: ["MATCHES_PINNED_REPRODUCED_BUILD", "MISMATCH", "UNRESOLVED"] },
      executorAuthorityDerivationResult: { enum: ["MISMATCH", "UNRESOLVED", "VERIFIED"] },
      /* Compatibility summary: this is implementation identity, never a proxy-shell shortcut. */
      executorCodeIdentityResult: { enum: ["MISMATCH", "UNRESOLVED", "VERIFIED"] },
      executorDeploymentModel: { enum: [...EXECUTOR_DEPLOYMENT_MODELS, "UNRESOLVED"] },
      executorVersion: { type: "string" },
      executorVersionResult: { enum: ["MATCHES_BINDING_RECORD", "MISMATCH", "UNRESOLVED"] },
      /* The normalized hash of the resolved CURRENT OFFICIAL artifact, never the local fixture. */
      expectedDeployedNormalizedHash: HASH_OR_UNRESOLVED,
      /* Every facet must cite the same artifact AND declare where its fact came from. A matching
       * code hash does not make locally parsed data official, so the origin is carried explicitly
       * and LOCAL_INSTALLED_FIXTURE can never be a PASS origin. */
      facetArtifactBinding: {
        type: "object",
        additionalProperties: false,
        required: ["blockOrBatch", "codeIdentity", "limitSemantics", "limitValues", "operationSchedule"],
        properties: {
          blockOrBatch: facetBindingSchema(),
          codeIdentity: facetBindingSchema(),
          limitSemantics: facetBindingSchema(),
          limitValues: facetBindingSchema(),
          operationSchedule: facetBindingSchema(),
        },
      },
      finalVerdict: { enum: ["BLOCKED", "FAIL", "PASS"] },
      gate: { const: "SG-4" },
      greatestAcceptedDepthHcu: { type: "string", pattern: "^([0-9]+|UNRESOLVED)$" },
      greatestAcceptedTotalHcu: { type: "string", pattern: "^([0-9]+|UNRESOLVED)$" },
      immutableProvenanceState: {
        enum: ["EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION", "RESOLVED", "UNRESOLVED"],
      },
      /* PASS-relevant: the installed CALCULATOR and toolchain the measurement depends on. */
      installedSourceHashesResult: { enum: ["MATCH", "MISMATCH", "UNRESOLVED"] },
      /* Not PASS-relevant: drift in the unused local 0.10.0 authority fixture is reported but can
       * never invalidate a current-official live authority result. */
      localFixtureSelfTestResult: { enum: ["MATCH", "MISMATCH", "UNRESOLVED"] },
      installedTableHash: HASH_OR_UNRESOLVED,
      /* Resolved from the verified deployed implementation, never pinned to the local fixture. */
      liveLimitSemantics: { enum: LIVE_LIMIT_SEMANTICS_VALUES },
      normalizedImplementationHash: HASH_OR_UNRESOLVED,
      /* F34 — every mismatch class the comparison can produce is serialized, so an independent
       * reader of the result can reject a PASS carrying any of them. A class that existed only
       * inside the comparison could not be checked by anyone but the verifier itself. */
      operationCompatibilityResult: {
        type: "object",
        additionalProperties: false,
        required: [
          "arityMismatches",
          "authorityOnly",
          "costMismatches",
          "installedOnly",
          "operandMismatches",
          "operandTypeMismatches",
          "resultTypeMismatches",
          "shared",
          "translationMismatches",
          "unsupportedByCalculator",
        ],
        properties: {
          arityMismatches: { type: "array", items: { type: "string" } },
          authorityOnly: { type: "array", items: { type: "string" } },
          costMismatches: { type: "array", items: { type: "string" } },
          installedOnly: { type: "array", items: { type: "string" } },
          operandMismatches: { type: "array", items: { type: "string" } },
          operandTypeMismatches: { type: "array", items: { type: "string" } },
          resultTypeMismatches: { type: "array", items: { type: "string" } },
          shared: { type: "array", items: { type: "string" } },
          translationMismatches: { type: "array", items: { type: "string" } },
          unsupportedByCalculator: { type: "array", items: { type: "string" } },
        },
      },
      operationScheduleAuthorityState: { enum: ["RESOLVED", "UNRESOLVED"] },
      pinnedBlockFinality: { enum: ["FINALIZED", "UNRESOLVED"] },
      pinnedBlockHash: { type: "string", pattern: "^(0x[0-9a-f]{64}|UNRESOLVED)$" },
      pinnedBlockNumber: { type: "string", pattern: "^([0-9]+|UNRESOLVED)$" },
      preparationLineageResult: { enum: ["BROKEN", "UNRESOLVED", "VERIFIED"] },
      protocolVersion: { const: AUTHORITY_PROTOCOL_VERSION },
      reciprocalLinkageResult: { enum: ["BROKEN", "UNRESOLVED", "VERIFIED"] },
      rpcMethodsUsed: { type: "array", items: { enum: LIVE_RPC_ALLOWED_METHODS } },
      safetyBoundExclusivity: { const: "EXCLUSIVE" },
      schema: { const: AUTHORITY_RESULT_SCHEMA },
      sg4CoverageResult: { enum: ["COMPLETE", "INCOMPLETE", "UNRESOLVED"] },
      signingRequested: { const: false },
      staleAddressGuardResult: { enum: ["NOT_USED", "REJECTED", "UNRESOLVED"] },
      status: { type: "string" },
      totalHcuLimit: { const: decimal(TRANSACTION_TOTAL_HCU_LIMIT) },
      totalHcuOnChainReading: onChainLimitReadingSchema(),
      totalSafetyThreshold: { const: decimal(TOTAL_SAFETY_THRESHOLD) },
      transactionDepthControlState: controlStateSchema(),
      transactionSubmitted: { const: false },
      transactionTotalControlState: controlStateSchema(),
      unsupportedOperations: STRING_ARRAY,
      walletRequested: { const: false },
    },

    /* Every condition a PASS must satisfy. Each entry is enforced executably by
     * `validateAuthorityResult`; this list exists so the requirement set is reviewable. */
    passRequires: [
      "authoritative normalization applied from the record manifest, never from local fixture defaults",
      "authoritative pricing manifest digest recomputed from its canonical serialization",
      "authoritativeArtifactId resolved and not the local installed fixture",
      "authorityBindingRecordResult VALID",
      "authorityCodeIdentityResult VERIFIED against the binding record",
      "authorityDeploymentModel matches the reviewed binding record",
      "authorityImplementationAddress resolved",
      "authorityProtocolDigest equals the committed authority protocol digest",
      "authorityRoot package, version, and integrity exact",
      "authorityVersionResult MATCHES_BINDING_RECORD",
      "benchmarkProtocolDigest equals the committed benchmark protocol digest",
      "block/batch on-chain reading matches the binding record or is not applicable with artifact proof",
      "blockOrBatchControlState resolved and never UNRESOLVED",
      "calculator, installed-table, and authority-table hashes exact",
      "caller applicability resolved for every SG-4 subject",
      "callerExemptionResult resolved and never UNKNOWN_EXEMPTION",
      "chainId, gate, schema, and protocolVersion exact",
      "codeIdentityResult VERIFIED against the resolved current official artifact",
      "depth HCU reading read on chain or proven from the code-identified artifact, never NOT_APPLICABLE",
      "every facet origin is an authoritative binding-record origin, never the local fixture",
      "every facetArtifactBinding entry equal to authoritativeArtifactId",
      "executor deployment model is reviewed; a proxy requires proxy identity, exact ERC-1967 resolution, exact implementation-address policy and authenticated implementation identity",
      "executorAddress exact and executor code identity derived from the independently authenticated FHEVMExecutor reproduced build",
      "executorCodeIdentityResult and executorImplementationCodeIdentityResult VERIFIED against the authenticated executor artifact",
      "executorReproducedBuildResult MATCHES_PINNED_REPRODUCED_BUILD",
      "executorVersionResult MATCHES_BINDING_RECORD",
      "expectedDeployedNormalizedHash resolved",
      "greatestAcceptedTotalHcu and greatestAcceptedDepthHcu coherent with liveLimitSemantics",
      "immutableProvenanceState RESOLVED",
      "implementationResolutionResult matches the reviewed authority deployment model",
      "installed calculator and toolchain hashes match; local fixture drift is not PASS-relevant",
      "installedSourceHashesResult MATCH",
      "liveLimitSemantics resolved from the verified deployed implementation, never UNRESOLVED",
      "no caller relevant to SG-4 is exempt from the enforced ceiling",
      "no local HCULimit fixture comparison, guard or table hash contributes to the verdict",
      "normalizedImplementationHash equals expectedDeployedNormalizedHash",
      "operationCompatibilityResult free of cost, operand, and set mismatches",
      "operationScheduleAuthorityState RESOLVED",
      "pinnedBlockFinality FINALIZED",
      "pinnedBlockNumber and pinnedBlockHash resolved",
      "preparationLineageResult VERIFIED",
      "reciprocalLinkageResult VERIFIED",
      "rpcMethodsUsed within the read-only allow-list",
      "sg4CoverageResult COMPLETE",
      "staleAddressGuardResult NOT_USED",
      "the exact SG-4 pricing variant closure is priced by both the authoritative schedule and the installed calculator",
      "total HCU reading read on chain or proven from the code-identified artifact, never NOT_APPLICABLE",
      "totalHcuLimit, depthHcuLimit, and both safety thresholds exact and equal to the record's expected values",
      "transactionDepthControlState PROVEN_PRESENT with the exact depth value and per-transaction scope",
      "transactionTotalControlState PROVEN_PRESENT with the exact total value and per-transaction scope",
      "unsupportedOperations empty",
      "wallet, account-authorization, signing, and transaction flags false",
    ],
    crossVersionMixingRejected: true,
    localFixtureCannotSatisfyCurrentDeploymentPass: true,
    localSourceDerivedFactsCannotBeRelabelledOfficial: true,
    lateBoundAuthorityInputsComeFromTheBindingRecord: true,
    /* F19/F20 — no PASS-relevant normalization, operation or pricing fact may originate from the
     * local HCULimit fixture. */
    noPassRelevantFactFromLocalHcuLimitFixture: true,
    normalizationDrivenByRecordManifestOnly: true,
    pricingComparedAgainstRecordManifestOnly: true,
    /* F24 — a mandatory per-transaction control may never be promoted by NOT_APPLICABLE. */
    mandatoryLimitsCannotBeNotApplicable: true,
    /* The single coherent source for the two per-transaction ceilings. */
    limitValueSource: "PROTOCOL_PINNED_AND_RECORD_MUST_MATCH",
    blockedIsRepresentableWithoutVerifiedLinkage: true,
    unresolvedSpellingRequiredRatherThanOmission: true,

    forbiddenProperties: [
      "credentials",
      "env",
      "environment",
      "headers",
      "privateKey",
      "provider",
      "receipt",
      "rpcResponses",
      "rpcUrl",
      "trace",
    ],
    forbiddenContent: [
      "complete RPC responses",
      "credentials",
      "environment dumps",
      "headers",
      "private URLs",
      "provider objects",
      "traces",
      "transaction receipts",
    ],
  };
}

/* ---------------------------------------------------------------------------------------------
 * Protocol assembly.
 * ------------------------------------------------------------------------------------------- */

export function buildAuthorityProtocol() {
  const controls = buildPreparedControls();
  return {
    schema: AUTHORITY_PROTOCOL_SCHEMA,
    protocolVersion: AUTHORITY_PROTOCOL_VERSION,
    gate: "SG-4",
    preparationStatus: "PREPARATION_ONLY_NO_LIVE_AUTHORITY_RUN",
    authorityVerificationStatus: "NOT_RUN_PENDING_LIVE_READ_ONLY_VERIFICATION",
    sg4Status: "PENDING",
    sg5Status: "PENDING",

    network: {
      name: "ethereum-sepolia",
      chainId: decimal(SEPOLIA_CHAIN_ID),
      configuredExecutorAddress: SEPOLIA_EXECUTOR_ADDRESS,
      executorAddressCorroboratingSources: [
        "@fhevm/solidity@0.11.1 config/ZamaConfig.sol _getSepoliaConfig().CoprocessorAddress",
        "@fhevm/hardhat-plugin@0.4.2 src/internal/constants.ts ZAMA_FHE_RELAYER_SDK_PACKAGE.sepolia.CoprocessorAddress",
      ],
    },

    measurementToolchainRoot: MEASUREMENT_TOOLCHAIN_ROOT,
    /* The independently reproduced official build, and what its compiler immutable actually is. */
    reproducedOfficialBuild: REPRODUCED_OFFICIAL_BUILD,
    reproducedOfficialExecutorBuild: REPRODUCED_OFFICIAL_EXECUTOR_BUILD,
    uupsSelfImmutable: UUPS_SELF_IMMUTABLE,
    executorUupsSelfImmutable: EXECUTOR_UUPS_SELF_IMMUTABLE,
    reproducedMetadataTrailer: REPRODUCED_METADATA_TRAILER,
    reproducedExecutorMetadataTrailer: REPRODUCED_EXECUTOR_METADATA_TRAILER,
    reproducedRuntimeByteLength: REPRODUCED_RUNTIME_BYTE_LENGTH,
    reproducedExecutorRuntimeByteLength: REPRODUCED_EXECUTOR_RUNTIME_BYTE_LENGTH,
    nonNormalizableCompileTimeConstants: NON_NORMALIZABLE_COMPILE_TIME_CONSTANTS,
    reproducedBuildEntryFields: REPRODUCED_BUILD_ENTRY_FIELDS,
    reproducedBuildSubjects: REPRODUCED_BUILD_SUBJECTS,
    measurementExecutionRelevantFiles: MEASUREMENT_EXECUTION_RELEVANT_FILES,
    measurementRootVerification: MEASUREMENT_ROOT_VERIFICATION,
    repositoryHygieneFiles: REPOSITORY_HYGIENE_FILES,
    /* INVARIANT J — how each PASS-relevant fact was established. */
    passDependencyGraph: PASS_DEPENDENCY_GRAPH,
    passFieldClasses: PASS_FIELD_CLASSES,
    blockingPassFieldClasses: BLOCKING_PASS_FIELD_CLASSES,
    /* INVARIANTS B/C/D — the extractors that recompute everything authoritative. */
    sourceMaterialExtractors: {
      artifactBuild: ARTIFACT_BUILD_EXTRACTOR,
      authoritySource: AUTHORITY_SOURCE_PARSER,
      priceSchedule: PRICE_SCHEDULE_EXTRACTOR,
    },
    /* F36 — the exact cross-links, and the shape of the record they bind. */
    crossLinkBindings: CROSS_LINK_BINDINGS,
    canonicalSourceReferenceForm: CANONICAL_SOURCE_REFERENCE_FORM,
    bindingRecord: AUTHORITY_BINDING_RECORD_SHAPE,
    deployedAuthorityRootPolicy: DEPLOYED_AUTHORITY_ROOT_POLICY,

    localAuthorityFixtureRoot: {
      ...LOCAL_AUTHORITY_FIXTURE_ROOT,
      transitiveDependencyIsInsufficient: true,
      transitiveRationale:
        "Before this pin @fhevm/host-contracts was reachable only through @fhevm/hardhat-plugin's private dependency tree and was not resolvable from the repository root at all. A plugin upgrade could therefore have replaced the authority implementation silently and without any manifest change.",
    },

    /* Immutable provenance is a control, not decoration. Package integrity pins the installed bytes
     * but does not identify the upstream revision they were built from, so calling an unresolved
     * upstream commit "not a control" and then claiming end-to-end authority does not follow. */
    provenance: IMMUTABLE_PROVENANCE,

    installedHashes: {
      sources: EXPECTED_SOURCE_HASHES,
      calculator: {
        path: "@fhevm/mock-utils:fhevm/coprocessor/hcu.ts",
        sha256: EXPECTED_CALCULATOR_HASH,
        producesMeasurements: ["globalHCU", "maxHCUDepth", "HCUDepthByHandle"],
      },
      costTable: {
        path: "@fhevm/mock-utils:fhevm/coprocessor/HCUByOperator.ts",
        sha256: EXPECTED_COST_TABLE_HASH,
      },
    },

    limits: {
      transactionTotalHcu: {
        value: decimal(TRANSACTION_TOTAL_HCU_LIMIT),
        symbol: "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX",
        scope: "PER_TRANSACTION",
        enforcementError: "HCUTransactionLimitExceeded",
        comparison: "REVERTS_WHEN_ACCUMULATED_TOTAL_GREATER_THAN_OR_EQUAL_TO_LIMIT",
        greatestPermittedValue: decimal(TRANSACTION_TOTAL_HCU_LIMIT - 1n),
      },
      transactionDepthHcu: {
        value: decimal(TRANSACTION_DEPTH_HCU_LIMIT),
        symbol: "MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX",
        scope: "PER_TRANSACTION",
        enforcementError: "HCUTransactionDepthLimitExceeded",
        comparison: "REVERTS_WHEN_OPERATION_PLUS_MAX_OPERAND_DEPTH_GREATER_THAN_OR_EQUAL_TO_LIMIT",
        greatestPermittedValue: decimal(TRANSACTION_DEPTH_HCU_LIMIT - 1n),
      },
      /* Unresolved. The local installed implementation and the prior-reviewed current deployment
       * disagree about the enforcement operator and therefore about ceiling inclusivity. */
      networkLimitSemantics: LIMIT_SEMANTICS_AUTHORITY,
    },

    safety: {
      rule: "SG4_INTERNAL_75_PERCENT_BENCHMARK_SAFETY_RULE",
      distinctFromNetworkCeilingSemantics: true,
      totalSafetyThreshold: decimal(TOTAL_SAFETY_THRESHOLD),
      depthSafetyThreshold: decimal(DEPTH_SAFETY_THRESHOLD),
      fractionNumerator: "3",
      fractionDenominator: "4",
      boundSemantics: "EXCLUSIVE",
      goRequires: ["globalHCU < 15000000", "maxHCUDepth < 3750000"],
      equalityVerdict: "NO_GO",
      measurementMapping: MEASUREMENT_MAPPING,
      singleCombinedNumberForbidden: true,
      bothMetricsMandatory: true,
    },

    applicableLimitStateMachine: {
      states: AUTHORITY_STATES,
      blockingStates: ["LOCAL_EXPECTED_PENDING_LIVE_BINDING", "UNRESOLVED"],
      nullWithoutStateForbidden: true,
      provenAbsentIsNotUnresolved: true,
      /* A proven-absent conclusion is only available about an implementation that has actually been
       * identified. Offline material identifies a local file, not a deployment. */
      provenAbsentRequiresVerifiedDeployedImplementation: true,
      localExpectationIsNotProof: true,
      controls,
    },

    commentVersusCode: {
      symbol: "MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX",
      docstring: "Maximum homomorphic complexity units depth per block.",
      docstringScopeClaim: "PER_BLOCK",
      establishedScope: "PER_TRANSACTION",
      evidence: [
        "Symbol name ends in _PER_TX.",
        "Enforcement occurs inside _adjustAndCheckFheTransactionLimitOneOp/TwoOps/ThreeOps, which run per operation within a single transaction.",
        "Operand depth is stored and read with tstore/tload transient storage, which is cleared at the end of every transaction and therefore cannot accumulate across a block.",
      ],
      resolution: "CODE_PATH_AND_STATE_TRANSITIONS_OVERRIDE_THE_DOCSTRING",
      failClosedIfCodeSemanticsCannotBeEstablished: true,
    },

    bytecodeVerification: {
      method: "ADDRESS_NORMALIZED_EXACT_RUNTIME_COMPARISON",
      /* Three distinct identities. The local fixture below is a self-test target only; it is not
       * the acceptable PASS hash for the current Sepolia deployment. */
      artifactIdentityRoots: ARTIFACT_IDENTITY_ROOTS,
      localFixtureIsSelfTestOnly: true,
      localFixtureMayNotBeSolePassHashForCurrentDeployment: true,
      expectedDeployedNormalizedRuntimeSha256: EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256,
      expectedDeployedNormalizedRuntimeState: "UNRESOLVED",
      unresolvedDeployedHashYields: "BLOCKED_NOT_PASS_AND_NOT_AUTOMATIC_FAIL",
      onceOfficialArtifactIsResolved: [
        "compare the deployed implementation against that exact official artifact",
        "verify compiler metadata and immutable references",
        "normalize only declared deployment-specific offsets",
        "bind code identity, limit semantics, operation schedule, and block/batch enumeration to the same artifact",
      ],
      artifactBuildNetwork: "LOCAL_CHAIN_ID_31337_FIXTURE_ONLY",
      artifactEmbeddedExecutorAddress: ARTIFACT_LOCAL_EXECUTOR_ADDRESS,
      reasonNormalizationIsRequired:
        "The legacy local 0.10.0 self-test fixture embeds the local (chainId 31337) executor address. This fixture normalization is non-authoritative and never supplies the current official v0.13.2 identity target.",
      expectedRuntimeByteLength: decimal(EXPECTED_RUNTIME_BYTE_LENGTH),
      expectedRuntimeSha256: EXPECTED_RUNTIME_SHA256,
      expectedCodeSectionByteLength: decimal(EXPECTED_CODE_SECTION_BYTE_LENGTH),
      expectedCodeSectionSha256: EXPECTED_CODE_SECTION_SHA256,
      expectedNormalizedRuntimeSha256: EXPECTED_NORMALIZED_RUNTIME_SHA256,
      expectedNormalizedCodeSectionSha256: EXPECTED_NORMALIZED_CODE_SECTION_SHA256,
      /* Retained under the historical key because the offline preflight self-test consumes it.
       * This is explicitly legacy fixture data, never the authoritative v0.13.2 plan. */
      normalization: {
        wordByteLength: UUPS_SELF_IMMUTABLE.wordByteLength,
        deploymentValueShape: DEPLOYMENT_VALUE_SHAPES[0],
        requiredPrecedingOpcode: "0x73",
        expectedReplacementCount: EXECUTOR_IMMEDIATE_COUNT,
        offsets: EXECUTOR_IMMEDIATE_OFFSETS.map((offset) => decimal(BigInt(offset))),
        broadStringReplacementForbidden: true,
        onlyPredeclaredOffsetsMayBeNormalized: true,
      },
      authoritativeNormalization: {
        buildProvenanceKind: REPRODUCED_BUILD_PROVENANCE_KIND,
        compilerImmutable: UUPS_SELF_IMMUTABLE,
        runtimeByteLength: decimal(BigInt(REPRODUCED_RUNTIME_BYTE_LENGTH)),
        executorConstantOccurrences: NON_NORMALIZABLE_COMPILE_TIME_CONSTANTS.executorAddressOccurrences,
        executorConstantsAreNormalized: false,
      },
      metadata: EXPECTED_METADATA,
      failureConditions: [
        "EXTRA_REPLACEMENT",
        "LENGTH_MISMATCH",
        "MISSING_REPLACEMENT",
        "NORMALIZED_HASH_MISMATCH",
        "OPCODE_MISMATCH",
        "PROXY_IMPLEMENTATION_AMBIGUITY",
        "UNEXPECTED_IMMUTABLE",
        "UNKNOWN_OFFSET",
        "UNRECOGNIZED_METADATA",
      ],
      securityLimits: [
        "The authoritative comparison normalizes only the three declared PUSH32 UUPSUpgradeable.__self words relative to the resolved implementation address. The 30 ordinary executor PUSH20 constants are code and any difference in one is a code-identity mismatch.",
        'Equality is asserted over the full runtime including the metadata trailer. This is sound only because the trailer is {"solc": 0.8.24} and carries no source hash; if a future artifact embeds an IPFS or bzzr source hash, full-runtime equality must be re-derived rather than relaxed.',
        "The comparison authenticates the implementation behind the proxy, not the proxy's future upgradeability. HCULimit is UUPS-upgradeable, so an authority result is valid only at its pinned block.",
      ],
    },

    onChainCorroboration: {
      required: true,
      steps: [
        "Verify eth_chainId equals the committed chain ID.",
        "Pin one block number and its block hash and bind every subsequent call to that exact block.",
        "Fetch code at the configured executor address and authenticate the executor proxy shell when the reviewed deployment model is ERC1967_PROXY.",
        "For an executor proxy, read the exact ERC-1967 implementation slot, enforce the reviewed exact implementation-address policy, and only then fetch implementation code.",
        "For a direct executor, authenticate the configured address itself against the independently reproduced FHEVMExecutor artifact; no proxy slot read is applicable.",
        "Authenticate the resolved executor implementation with address-normalized comparison before issuing executor getters.",
        "Verify the executor getVersion() string only after executor implementation identity is verified.",
        "Derive the authority address from the verified executor via FHEVMExecutor.getHCULimitAddress(), then authenticate the authority proxy/direct deployment chain.",
        "Verify the executor getHCULimitAddress() result only after executor implementation identity and version are verified.",
        "Verify reciprocal linkage: HCULimit.getFHEVMExecutorAddress() must return the configured executor address.",
        "Verify the authority getVersion() string after authority implementation identity.",
        "Confirm the embedded executor immediates in the deployed implementation equal the configured executor address.",
        "Enumerate the verified implementation's complete relevant surface and only then classify the block/batch control.",
        "Compare the verified implementation's operation surface against the installed calculator and fail closed on any operation the calculator cannot price.",
      ],
      erc1967ImplementationSlot: ERC1967_IMPLEMENTATION_SLOT,
      erc1967Resolution: ERC1967_IMPLEMENTATION_RESOLUTION,
      readOnlySelectors: READ_ONLY_SELECTORS,
      addressDerivationRule: "AUTHORITY_ADDRESS_MUST_BE_DERIVED_FROM_THE_VERIFIED_EXECUTOR_ONLY",
      staleConstantProhibition: {
        ...STALE_PLUGIN_HCU_LIMIT,
        mayBeUsedAsAuthority: false,
        rejectResultsDerivedFromIt: true,
        applicationImportForbidden: true,
      },
      pinnedBlockRequired: true,
      pinnedBlockHashRequired: true,
    },

    operationTables: {
      derivationRule: "PARSE_AND_COMPARE_ACTUAL_INSTALLED_REPRESENTATIONS_NEVER_HARDCODE_COMPATIBLE",
      installedTable: {
        source: "@fhevm/mock-utils@0.4.2 fhevm/coprocessor/HCUByOperator.ts",
        operationCount: decimal(BigInt(EXPECTED_INSTALLED_OPERATIONS.length)),
        operations: EXPECTED_INSTALLED_OPERATIONS,
      },
      authorityTable: {
        source: "@fhevm/host-contracts@0.10.0 contracts/HCULimit.sol checkHCUFor* entry points",
        operationCount: decimal(BigInt(EXPECTED_AUTHORITY_OPERATIONS.length)),
        operations: EXPECTED_AUTHORITY_OPERATIONS,
      },
      executorEventTable: {
        source: "@fhevm/mock-utils@0.4.2 fhevm/coprocessor/CoprocessorEvents.ts CoprocessorOperatorEventName",
        operationCount: decimal(BigInt(EXPECTED_INSTALLED_OPERATIONS.length)),
      },
      nameTranslations: OPERATION_NAME_TRANSLATIONS,
      translationsMustBeInjective: true,
      /* The two installed representations agree with each other. That agreement does not resolve
       * which schedule the deployed implementation enforces; see scheduleAuthority. */
      installedRepresentationsAgree: true,
      installedAgreementDoesNotEstablishDeployedSchedule: true,
      unsupportedOperationGuard: UNSUPPORTED_OPERATION_GUARD,
      unsupportedOperationGuardRationale:
        "FheIsIn and FheSum appear in neither the installed calculator table, nor the installed executor event union, nor the verified authority enforcement surface. No authoritative cost exists for them, so their appearance anywhere in SG-4 must fail closed rather than be priced by inference.",
      failureConditions: [
        "AMBIGUOUS_ENUM_TRANSLATION",
        "DEPLOYED_OPERATION_WITHOUT_CALCULATOR_SUPPORT",
        "OPERAND_OR_TYPE_DIMENSION_MISMATCH",
        "SCHEDULE_AUTHORITY_UNRESOLVED",
        "SG4_OPERATION_WITHOUT_MAPPING",
        "SHARED_OPERATION_COST_MISMATCH",
        "UNKNOWN_EXECUTOR_EVENT",
        "UNSUPPORTED_OPERATION_REACHED_SG4",
      ],
    },

    /* The version/schedule discrepancy is recorded in full and left unresolved. It is not closed by
     * silently preferring whichever package happens to be installed locally. */
    scheduleAuthority: OPERATION_SCHEDULE_AUTHORITY,

    sg4OperationCoverage: {
      harness: "contracts/benchmarks/SG4FheBenchmarkHarness.sol",
      entries: SG4_CANONICAL_OPERATION_VARIANTS,
      distinctExecutorOperations: [
        ...new Set(SG4_CANONICAL_OPERATION_VARIANTS.map((entry) => entry.canonicalOperation)),
      ].sort(),
      derivedFrom: "SG4_BENCHMARK_CIRCUIT_REGISTRY",
      duplicateOperationTableRemoved: true,
      nonHcuWork: NON_HCU_WORK,
      everyOperationMustResolve: true,
      silentCoverageLossForbidden: true,
    },

    liveMode: {
      status: "PREPARED_NOT_EXECUTED",
      acknowledgementRequired: true,
      acknowledgement: LIVE_ACKNOWLEDGEMENT,
      branchRequired: "main",
      cleanWorktreeRequired: true,
      /* Replaces the unsatisfiable self-referential same-HEAD binding. */
      preparationLineage: PREPARATION_LINEAGE_MODEL,
      authorityBindingRecordShape: AUTHORITY_BINDING_RECORD_SHAPE,
      /* F39 — the plan is a runtime invariant of the verifier, and the protocol says so. */
      callPlan: LIVE_CALL_PLAN_POLICY,
      pinnedBlockFinalityPolicy: PINNED_BLOCK_FINALITY_POLICY,
      rpcResponsePolicy: RPC_RESPONSE_POLICY,
      liveBindingPresent: false,
      liveBindingAbsenceIsBlocking: true,
      rpcEndpoint: LIVE_RPC_ENDPOINT,
      rpcEndpointIsCommittedProtocolValue: true,
      environmentOverridesForbidden: ["authority address", "executor address", "RPC endpoint"],
      allowedMethods: LIVE_RPC_ALLOWED_METHODS,
      forbiddenMethodPrefixes: LIVE_RPC_FORBIDDEN_METHOD_PREFIXES,
      walletRequested: false,
      accountAuthorizationRequested: false,
      signingRequested: false,
      transactionSubmitted: false,
      empiricalLimitProbingForbidden: true,
      sanitizedOutputOnly: true,
    },

    resultSchema: buildResultSchema(),

    futureEvidence: {
      artifactPath: "evidence/cp0/SG4_HCU_AUTHORITY.json",
      digestSidecarPath: "evidence/cp0/SG4_HCU_AUTHORITY.json.sha256",
      createdDuringPreparation: false,
      mustBind: [
        "authority-preparation commit and tree",
        "amended SG-4 benchmark protocol digest",
        "HCU-authority protocol digest",
        "direct authority-root dependency pin",
        "pinned chain block number and hash",
        "installed source hashes",
        "deployed code hashes",
        "address-normalized comparison result",
        "reciprocal linkage result",
        "both per-transaction limits",
        "both safety thresholds",
        "applicable-limit state machine",
        "operation-table compatibility",
        "SG-4 operation coverage",
        "stale-address rejection",
        "sanitized RPC call classifications",
        "PASS/BLOCKED/FAIL verdict",
      ],
    },

    verdictRules: {
      PASS: "Every applicable control is PROVEN_PRESENT or PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION and bound to the verified deployed implementation, both per-transaction limits and scopes are verified, normalized bytecode identity holds, reciprocal linkage is verified, table compatibility holds, the operation-schedule authority and immutable provenance are resolved, and SG-4 operation coverage is complete.",
      BLOCKED:
        "Any applicable control is UNRESOLVED or only a local expectation, or any required verification step could not be completed. BLOCKED is never GO, and a BLOCKED result may record UNRESOLVED for every check that did not complete.",
      FAIL: "A verification step completed and contradicted the committed authority: hash mismatch, broken linkage, unexpected bytecode difference, cost mismatch, or use of the stale HCULimit constant.",
      missingValueVerdict: "BLOCKED",
      localExpectationVerdict: "BLOCKED",
      gasMayNotSubstituteForHcu: true,
      currentVerdict: "BLOCKED",
    },

    benchmarkExecutionGate: {
      permanentBenchmarkExecutionAllowed: false,
      requiresAll: [
        "HCU-authority verifier PASS",
        "address-normalized code identity verified against the resolved current official artifact",
        "authority result pinned to an exact block number and block hash",
        "block/batch control resolved to proven present or proven absent, never unresolved",
        "both limit values and scopes bound to the verified deployed implementation",
        "code identity, limit semantics, operation schedule, and block/batch all bound to the same artifact",
        "executor and authority implementation verified",
        "immutable upstream provenance reverified",
        "network limit semantics resolved from the verified deployed implementation",
        "no unresolved applicable ceiling remaining",
        "operation-schedule authority resolved",
        "operation-table compatibility verified",
        "preparation A->B lineage verified",
        "SG-4 operation coverage complete",
      ],
      /* The blocking reasons that currently hold, each traceable to a recorded unresolved state. */
      currentlyBlockedBy: [
        "BLOCK_OR_BATCH_HCU is UNRESOLVED",
        "IMMUTABLE_PROVENANCE is EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION",
        "NETWORK_LIMIT_SEMANTICS are UNRESOLVED",
        "OPERATION_SCHEDULE_AUTHORITY is UNRESOLVED",
        "TRANSACTION_DEPTH_HCU is a local expectation pending live deployment binding",
        "TRANSACTION_TOTAL_HCU is a local expectation pending live deployment binding",
        "the authority-binding record does not exist",
        "the current official artifact identity is UNRESOLVED",
        "the live read-only authority verification has not been executed",
      ],
    },

    reopenConditions: [
      "SG-4 introduces an operation without an authoritative cost",
      "authority-root package, version, or integrity changes",
      "block/batch authority state changes",
      "configured executor address changes",
      "deployed authority implementation changes at a later block",
      "immutable upstream provenance is established or changes",
      "installed calculator or cost-table hash changes",
      "installed source hashes change",
      "limit values, scopes, or inclusivity semantics change",
      "normalization offsets or metadata structure change",
      "safety thresholds or bound semantics change",
      "the ERC-1967 resolution mechanism or implementation slot changes",
      "the current official artifact identity or its normalized runtime hash is established or changes",
      "the network limit semantics are resolved or the recorded expectations change",
      "the operation-schedule authority discrepancy is resolved or changes",
      "the preparation A-to-B lineage or its binding record path changes",
    ],
  };
}

export type AuthorityProtocol = ReturnType<typeof buildAuthorityProtocol>;

export function validateAuthorityProtocol(protocol: AuthorityProtocol): void {
  /* Purity. */
  invariant(!stable(protocol).includes("Date("), "timestamp dependency introduced");

  /* Safety thresholds are exactly 75% of the enforced limits. */
  invariant(TOTAL_SAFETY_THRESHOLD * 4n === TRANSACTION_TOTAL_HCU_LIMIT * 3n, "total safety threshold is not 75%");
  invariant(DEPTH_SAFETY_THRESHOLD * 4n === TRANSACTION_DEPTH_HCU_LIMIT * 3n, "depth safety threshold is not 75%");
  invariant(protocol.safety.boundSemantics === "EXCLUSIVE", "safety bound semantics drift");
  invariant(protocol.safety.equalityVerdict === "NO_GO", "equality at a safety boundary is not NO_GO");
  invariant(protocol.safety.bothMetricsMandatory, "dual-metric requirement weakened");
  invariant(protocol.safety.singleCombinedNumberForbidden, "combined single HCU number permitted");

  /* Exclusive boundary behaviour, asserted behaviourally rather than by inspection. */
  invariant(evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD - 1n).pass, "total threshold minus one must pass");
  invariant(!evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD).pass, "total threshold equality must fail");
  invariant(!evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD + 1n).pass, "total threshold plus one must fail");
  invariant(evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD - 1n).pass, "depth threshold minus one must pass");
  invariant(!evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD).pass, "depth threshold equality must fail");
  invariant(!evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD + 1n).pass, "depth threshold plus one must fail");

  /* Neither metric may substitute for the other. */
  invariant(
    evaluateCombinedHcu({ globalHCU: 1n }).verdict === "NO_GO",
    "total alone must not yield GO when depth is missing",
  );
  invariant(
    evaluateCombinedHcu({ maxHCUDepth: 1n }).verdict === "NO_GO",
    "depth alone must not yield GO when total is missing",
  );
  invariant(evaluateCombinedHcu({ globalHCU: 1n, maxHCUDepth: 1n }).verdict === "GO", "both-present GO path broken");

  /* Applicable-limit state machine. */
  const controls = protocol.applicableLimitStateMachine.controls;
  invariant(controls.length === 3, "control count drift");
  for (const control of controls) validateControl(control);
  const byId = new Map(controls.map((control) => [control.metricId, control]));

  /* Offline preparation makes no RPC call, so no control may claim a deployed-implementation
   * binding. Both per-transaction controls are local expectations and the block/batch control is
   * unresolved; all three block. */
  invariant(
    byId.get("TRANSACTION_TOTAL_HCU")?.authorityState === "LOCAL_EXPECTED_PENDING_LIVE_BINDING",
    "total control must remain a local expectation during preparation",
  );
  invariant(
    byId.get("TRANSACTION_DEPTH_HCU")?.authorityState === "LOCAL_EXPECTED_PENDING_LIVE_BINDING",
    "depth control must remain a local expectation during preparation",
  );
  invariant(
    byId.get("TRANSACTION_TOTAL_HCU")?.value === decimal(TRANSACTION_TOTAL_HCU_LIMIT),
    "total control local expected value drift",
  );
  invariant(
    byId.get("TRANSACTION_DEPTH_HCU")?.value === decimal(TRANSACTION_DEPTH_HCU_LIMIT),
    "depth control local expected value drift",
  );
  invariant(
    byId.get("BLOCK_OR_BATCH_HCU")?.authorityState === "UNRESOLVED",
    "block/batch must remain UNRESOLVED during offline preparation",
  );
  invariant(byId.get("BLOCK_OR_BATCH_HCU")?.blocking === true, "unresolved block/batch must block");
  invariant(byId.get("BLOCK_OR_BATCH_HCU")?.value === null, "unresolved block/batch must carry no value");
  invariant(
    controls.every((control) => control.liveDeploymentBinding === "PENDING_LIVE_DEPLOYMENT_BINDING"),
    "offline preparation may not claim a live deployment binding",
  );
  invariant(protocol.applicableLimitStateMachine.nullWithoutStateForbidden, "bare null authority permitted");
  invariant(
    controls.every((control) => control.value === null || /^[0-9]+$/.test(control.value)),
    "non-decimal value",
  );

  /* Every prepared control blocks. The gate is not passable from offline material alone, and that
   * is the intended state rather than a defect to be smoothed away. */
  invariant(
    controls.every((control) => control.blocking),
    "every prepared control must block until it is bound to the verified deployed implementation",
  );

  /* Operation-schedule authority (unresolved) and immutable provenance (unresolved) both block. */
  invariant(protocol.scheduleAuthority.state === "UNRESOLVED", "schedule authority must remain unresolved");
  invariant(protocol.scheduleAuthority.blocking, "unresolved schedule authority must block");
  invariant(
    protocol.scheduleAuthority.resolvedByChoosingTheLocalPackage === false,
    "schedule discrepancy must not be resolved by silently choosing the local package",
  );
  invariant(
    protocol.scheduleAuthority.localPackageSchedule.operationCount === decimal(LOCAL_PACKAGE_OPERATION_COUNT) &&
      protocol.scheduleAuthority.installedCalculatorSchedule.operationCount === decimal(LOCAL_PACKAGE_OPERATION_COUNT),
    "recorded local schedule operation count drift",
  );
  invariant(
    protocol.scheduleAuthority.previouslyIdentifiedCurrentOfficialScheduleExpectation.operationCount ===
      decimal(CURRENT_OFFICIAL_EXPECTED_OPERATION_COUNT),
    "recorded current-official schedule expectation drift",
  );
  invariant(
    CURRENT_OFFICIAL_EXPECTED_OPERATION_COUNT - LOCAL_PACKAGE_OPERATION_COUNT ===
      BigInt(CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS.length),
    "recorded schedule discrepancy is internally inconsistent",
  );
  invariant(
    stable([...CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS].sort()) === stable([...UNSUPPORTED_OPERATION_GUARD]),
    "the operations only in the expected current-official schedule must be exactly the guarded unsupported set",
  );
  /* F11 — the prior-reviewed immutable tuples are recorded in full and still block. */
  invariant(
    protocol.provenance.state === "EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION",
    "immutable provenance state drift",
  );
  invariant(protocol.provenance.blocking && protocol.provenance.blocksLivePass, "unreverified provenance must block");
  invariant(protocol.provenance.isAControl, "provenance must not be demoted below a control");
  invariant(protocol.provenance.inventedCommitForbidden, "inventing an upstream commit permitted");
  invariant(protocol.provenance.recordedFromPriorReview, "prior-reviewed provenance was discarded");
  invariant(
    !protocol.provenance.independentlyReverified && !protocol.provenance.deployedLinkageEstablished,
    "provenance may not claim reverification or deployed linkage during offline preparation",
  );
  invariant(protocol.provenance.required.length === 8, "provenance subject count drift");
  invariant(
    protocol.provenance.required.every((entry) => entry.repository !== null && entry.commit !== null),
    "a known immutable provenance tuple was discarded and left null",
  );
  invariant(
    protocol.provenance.required.every((entry) => /^[0-9a-f]{40}$/u.test(entry.commit as string)),
    "a recorded provenance commit is not a 40-hex object name",
  );
  invariant(
    protocol.provenance.required.every((entry) => entry.reverified === false),
    "a provenance subject claims reverification that did not occur",
  );
  invariant(
    stable([...protocol.provenance.officialRepositories]) ===
      stable(["https://github.com/zama-ai/fhevm", "https://github.com/zama-ai/fhevm-mocks"]),
    "the known upstream roots were substituted with unrelated candidate repositories",
  );
  invariant(
    protocol.provenance.required.some(
      (entry) => entry.subject === "INSTALLED_CALCULATOR" && entry.contentSha256 === EXPECTED_CALCULATOR_HASH,
    ),
    "installed calculator provenance hash disagrees with the pinned calculator hash",
  );
  invariant(
    protocol.provenance.required.some(
      (entry) => entry.subject === "INSTALLED_OPERATION_COST_TABLE" && entry.contentSha256 === EXPECTED_COST_TABLE_HASH,
    ),
    "installed cost-table provenance hash disagrees with the pinned cost-table hash",
  );

  /* F10 — network ceiling semantics are unresolved and are not the internal safety policy. */
  invariant(protocol.limits.networkLimitSemantics.resolvedState === "UNRESOLVED", "live limit semantics drift");
  invariant(protocol.limits.networkLimitSemantics.blocking, "unresolved limit semantics must block");
  invariant(
    protocol.limits.networkLimitSemantics.localInstalled.semantics ===
      "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL",
    "local installed semantics drift",
  );
  invariant(
    protocol.limits.networkLimitSemantics.priorReviewedCurrentDeployment.semantics ===
      "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN",
    "prior-reviewed current deployment semantics drift",
  );
  invariant(
    String(protocol.limits.networkLimitSemantics.localInstalled.semantics) !==
      String(protocol.limits.networkLimitSemantics.priorReviewedCurrentDeployment.semantics),
    "the two recorded semantics collapsed into one; the disagreement would be hidden",
  );
  invariant(
    protocol.limits.networkLimitSemantics.internalSafetyPolicyIsIndependent &&
      protocol.limits.networkLimitSemantics.internalSafetyComparisonRemainsStrict &&
      protocol.limits.networkLimitSemantics.internalSafetyEqualityVerdict === "NO_GO",
    "network ceiling semantics were conflated with the internal 75% safety policy",
  );
  /* Coherence of the greatest accepted value under each semantics. */
  invariant(
    greatestAcceptedValue("CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN", TRANSACTION_TOTAL_HCU_LIMIT) ===
      TRANSACTION_TOTAL_HCU_LIMIT,
    "inclusive semantics must accept the configured ceiling itself",
  );
  invariant(
    greatestAcceptedValue(
      "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL",
      TRANSACTION_TOTAL_HCU_LIMIT,
    ) ===
      TRANSACTION_TOTAL_HCU_LIMIT - 1n,
    "exclusive semantics must accept one below the configured ceiling",
  );
  invariant(greatestAcceptedValue("UNRESOLVED", TRANSACTION_TOTAL_HCU_LIMIT) === null, "unresolved semantics valued");
  /* The internal safety boundary is strict regardless of the network semantics. */
  invariant(!evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD).pass, "internal safety equality must remain NO-GO");
  invariant(!evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD).pass, "internal safety equality must remain NO-GO");

  /* F12 — three separate artifact identities; the local fixture is a self-test target only. */
  invariant(
    protocol.bytecodeVerification.artifactIdentityRoots.localInstalledFixture.mayBeSolePassHashForCurrentDeployment ===
      false,
    "the local installed fixture was promoted to current-deployment authority",
  );
  invariant(
    protocol.bytecodeVerification.artifactIdentityRoots.currentOfficialArtifact.expectedNormalizedRuntimeSha256 ===
      null,
    "an unresolved official artifact hash was asserted",
  );
  invariant(
    protocol.bytecodeVerification.artifactIdentityRoots.currentOfficialArtifact.state === "UNRESOLVED" &&
      protocol.bytecodeVerification.artifactIdentityRoots.currentOfficialArtifact.blocking,
    "current official artifact identity must remain unresolved and blocking",
  );
  invariant(
    EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256 === null,
    "a deployed normalized hash was pinned before the official artifact was resolved",
  );
  invariant(
    EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256 !== EXPECTED_NORMALIZED_RUNTIME_SHA256,
    "the deployed expectation was set to the local fixture hash",
  );
  invariant(
    protocol.bytecodeVerification.artifactIdentityRoots.crossVersionMixingForbidden,
    "cross-version mixing permitted",
  );
  invariant(
    isSortedUnique(protocol.bytecodeVerification.artifactIdentityRoots.facets),
    "artifact facets must be sorted and unique",
  );

  /* F9 — historical authority evidence remains separate from the V2 A2 -> binding B lineage. */
  invariant(protocol.liveMode.preparationLineage.selfReferentialBindingRejected, "self-binding model still permitted");
  invariant(
    protocol.liveMode.preparationLineage.model === "HISTORICAL_V4_PRESERVED_PLUS_V2_A2_TO_BINDING_B",
    "preparation lineage model drift",
  );
  invariant(
    protocol.liveMode.preparationLineage.historicalBindingMustRemainByteIdentical &&
      protocol.liveMode.preparationLineage.historicalBindingIsNeverV2Fallback &&
      protocol.liveMode.preparationLineage.historicalBindingPath === HISTORICAL_BINDING_RECORD_PATH &&
      protocol.liveMode.preparationLineage.activeBindingTargetId === V2_BINDING_TARGET_ID &&
      protocol.liveMode.preparationLineage.activeBindingTargetScope === V2_BINDING_TARGET_SCOPE &&
      protocol.liveMode.preparationLineage.activeBindingPath === V2_BINDING_RECORD_PATH &&
      String(HISTORICAL_BINDING_RECORD_PATH) !== V2_BINDING_RECORD_PATH,
    "historical and V2 authority bindings are not separated",
  );
  invariant(
    protocol.liveMode.preparationLineage.bindingRecordMustNotContainItsOwnCommitOrTree,
    "the binding record may not contain its own commit or tree",
  );
  invariant(
    protocol.liveMode.preparationLineage.bindingRecordCreatedDuringThisPreparation === true &&
      protocol.liveMode.preparationLineage.bindingRecordAbsenceIsBlockingOnlyForCandidateAndPostCommit &&
      protocol.liveMode.liveBindingPresent === false &&
      protocol.liveMode.liveBindingAbsenceIsBlocking,
    "the binding record must be absent in preparation and required only by later closure modes",
  );
  invariant(isSortedUnique(SG4_IMPLEMENTATION_PATHS), "implementation paths must be sorted and unique");
  invariant(
    !SG4_IMPLEMENTATION_PATHS.includes(BINDING_RECORD_PATH),
    "the binding record may not be one of the implementation paths it binds",
  );
  invariant(
    !SG4_IMPLEMENTATION_PATHS.includes(HISTORICAL_BINDING_RECORD_PATH) &&
      !SG4_IMPLEMENTATION_PATHS.includes(V2_BINDING_RECORD_PATH),
    "authority binding paths may not be implementation paths",
  );
  invariant(
    protocol.liveMode.preparationLineage.postReviewSequence.length === 6,
    "the post-review two-commit sequence must remain complete",
  );

  /* F13 — the binding record must carry the late-bound authority inputs, not only the lineage. */
  invariant(
    protocol.liveMode.preparationLineage.bindingRecordCarriesLateBoundAuthorityInputs,
    "the binding record was reduced to a preparation-only lineage record; the gate becomes unresolvable",
  );
  invariant(
    BINDING_RECORD_PATH === V2_BINDING_RECORD_PATH &&
      V2_BINDING_TARGET_ID === "LEOPOLD_V2_SEPOLIA" &&
      V2_BINDING_TARGET_SCOPE === "LEOPOLD_V2_RELEASE",
    "the V2 authority-binding target or path drifted",
  );
  invariant(
    protocol.liveMode.preparationLineage.noSourceEditPermittedAfterB &&
      protocol.liveMode.preparationLineage.implementationEditRequiresFreshLineage,
    "a post-B source edit path was permitted; that is the third-commit workaround",
  );
  const shape = protocol.liveMode.authorityBindingRecordShape;
  invariant(shape.schema.const === BINDING_RECORD_SCHEMA, "binding record schema drift");
  invariant(shape.recordVersion.const === BINDING_RECORD_VERSION, "binding record version drift");
  for (const [section, fields] of Object.entries(shape.sections)) {
    invariant(isSortedUnique([...fields].sort()), `binding record section ${section} has duplicate fields`);
    invariant((fields as readonly string[]).length > 0, `binding record section ${section} is empty`);
  }
  /* Every section the instruction requires must be present. */
  for (const section of [
    "artifact",
    "authority",
    "authorityResolution",
    "blockOrBatch",
    "executor",
    "facets",
    "limits",
    "lineage",
    "onChainInterface",
    "operationSchedule",
    "provenance",
  ]) {
    invariant(section in shape.sections, `binding record is missing the ${section} section`);
  }
  invariant(shape.provenanceSubjects.length === 8, "binding record provenance subject count drift");
  invariant(
    stable([...shape.provenanceSubjects].sort()) ===
      stable([...IMMUTABLE_PROVENANCE.required.map((entry) => entry.subject)].sort()),
    "the binding record's provenance subjects disagree with the recorded provenance subjects",
  );
  invariant(shape.resolvedRequires.length >= 9, "the binding record's RESOLVED preconditions were weakened");
  invariant(isSortedUnique(shape.resolvedRequires), "binding record RESOLVED preconditions must be sorted and unique");

  /* F14 — facet origins exist and the local fixture is never a PASS origin. */
  invariant(isSortedUnique(FACET_ORIGINS), "facet origins must be sorted and unique");
  invariant(
    FACET_ORIGINS_FORBIDDEN_FOR_PASS.includes("LOCAL_INSTALLED_FIXTURE"),
    "the local installed fixture became an acceptable PASS origin",
  );
  invariant(
    protocol.resultSchema.localSourceDerivedFactsCannotBeRelabelledOfficial &&
      protocol.resultSchema.lateBoundAuthorityInputsComeFromTheBindingRecord,
    "local source-derived facts may be relabelled official",
  );
  invariant(
    stable(Object.keys(protocol.resultSchema.properties.facetArtifactBinding.properties).sort()) ===
      stable([...ARTIFACT_IDENTITY_ROOTS.facets]),
    "the facet binding fields disagree with the declared artifact facets",
  );

  /* F19 — the canonical normalization manifest is fully specified. */
  invariant(isSortedUnique(NORMALIZATION_MANIFEST_FIELDS), "normalization manifest fields must be sorted and unique");
  for (const field of [
    "acceptedMetadataStructure",
    "wordByteLength",
    "deploymentValueShape",
    "compilerVersion",
    "expectedReplacementCount",
    "immutableReferenceKind",
    "metadataModel",
    "primaryImmutableReferences",
    "requiredPrecedingOpcode",
    "runtimeByteLength",
    "schema",
    "version",
  ]) {
    invariant(NORMALIZATION_MANIFEST_FIELDS.includes(field), `normalization manifest is missing ${field}`);
  }
  invariant(isSortedUnique(IMMUTABLE_REFERENCE_KINDS), "immutable reference kinds must be sorted and unique");
  invariant(isSortedUnique(REPRODUCED_BUILD_ENTRY_FIELDS), "reproduced build entry fields must be sorted and unique");
  invariant(isSortedUnique(DEPLOYMENT_VALUE_SHAPES), "deployment value shapes must be sorted and unique");
  /* The reproduced-build facts must stay internally coherent. */
  invariant(
    UUPS_SELF_IMMUTABLE.offsets.length === UUPS_SELF_IMMUTABLE.referenceCount,
    "UUPS __self reference count disagrees with its offsets",
  );
  invariant(
    UUPS_SELF_IMMUTABLE.leadingZeroByteLength + UUPS_SELF_IMMUTABLE.addressByteLength ===
      UUPS_SELF_IMMUTABLE.wordByteLength,
    "the UUPS __self word layout does not add up to a 32-byte word",
  );
  invariant(
    UUPS_SELF_IMMUTABLE.artifactPlaceholderWordHex === `0x${"00".repeat(UUPS_SELF_IMMUTABLE.wordByteLength)}`,
    "the artifact-side placeholder must be a zero word",
  );
  invariant(
    REPRODUCED_METADATA_TRAILER.trailerByteLength === REPRODUCED_METADATA_TRAILER.trailerHex.length / 2 - 1,
    "the metadata trailer length disagrees with its bytes",
  );
  /* The Sepolia executor constants are NOT immutables and must never be normalized. */
  invariant(
    NON_NORMALIZABLE_COMPILE_TIME_CONSTANTS.areCompilerImmutables === false &&
      NON_NORMALIZABLE_COMPILE_TIME_CONSTANTS.mustRemainByteForByte === true,
    "the executor compile-time constants must remain part of exact code identity",
  );
  /* The two subjects stay distinct: source is a committed file, build is a reproduction. */
  invariant(
    !REPRODUCED_BUILD_SUBJECTS.includes("CURRENT_OFFICIAL_AUTHORITY_SOURCE"),
    "the authority source is a committed file, not a reproduced build",
  );
  invariant(isSortedUnique(ACCEPTED_METADATA_STRUCTURES), "accepted metadata structures must be sorted and unique");
  /* Canonical serialization must be stable and key-order independent. */
  invariant(
    canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] }) === canonicalJson({ a: [2, { c: 3, d: 4 }], b: 1 }),
    "canonical serialization is not key-order independent",
  );
  invariant(canonicalJson({ a: 1 }) === '{"a":1}', "canonical serialization emits insignificant whitespace");

  /* F20 — the canonical pricing manifest is fully specified. */
  invariant(isSortedUnique(PRICING_MANIFEST_FIELDS), "pricing manifest fields must be sorted and unique");
  invariant(isSortedUnique(PRICING_ENTRY_FIELDS), "pricing entry fields must be sorted and unique");
  invariant(isSortedUnique(OPERAND_MODES), "operand modes must be sorted and unique");
  /* F34 — a pricing entry IS a variant: one cost, one mode, one operand list, one result type. */
  for (const field of [
    "arity",
    "canonicalName",
    "cost",
    "costKeyType",
    "enforcementName",
    "operandMode",
    "operandTypes",
    "resultType",
  ]) {
    invariant(PRICING_ENTRY_FIELDS.includes(field), `pricing entry is missing ${field}`);
  }

  /* F21 — executor proxy support is closed over the two explicit reviewed models. */
  invariant(isSortedUnique(EXECUTOR_DEPLOYMENT_MODELS), "executor deployment models must be sorted and unique");
  invariant(
    EXECUTOR_DEPLOYMENT_MODELS.length === 2 &&
      EXECUTOR_DEPLOYMENT_MODELS.includes("DIRECT") &&
      EXECUTOR_DEPLOYMENT_MODELS.includes("ERC1967_PROXY"),
    "the executor proxy deployment model set drifted",
  );
  invariant(EXECUTOR_PROXY_SUPPORT.supported, "executor proxy support was removed");
  invariant(
    !EXECUTOR_PROXY_SUPPORT.codeIdenticalUpgradePermitted,
    "executor code-identical upgrades must remain disabled",
  );

  /* F22 — provenance subjects are exact and unique. */
  invariant(
    isSortedUnique(AUTHORITY_BINDING_RECORD_SHAPE.amendmentFields.slice().sort()),
    "amendment fields must be unique",
  );
  invariant(
    AUTHORITY_BINDING_RECORD_SHAPE.sections.provenance.includes("amendments"),
    "the reviewed amendment mechanism is missing from the provenance section",
  );

  /* F23 — caller applicability is a closed specification over named subjects. */
  invariant(isSortedUnique(CALLER_APPLICABILITY_FIELDS), "caller applicability fields must be sorted and unique");
  invariant(isSortedUnique(CALLER_APPLICABILITY_STATES), "caller applicability states must be sorted and unique");
  invariant(isSortedUnique(SG4_APPLICABILITY_SUBJECTS), "SG-4 applicability subjects must be sorted and unique");
  invariant(SG4_APPLICABILITY_SUBJECTS.length >= 3, "the SG-4 applicability subject set was narrowed");
  invariant(isSortedUnique(SUPPORTED_ABI_ARGUMENT_TYPES), "ABI argument types must be sorted and unique");
  invariant(isSortedUnique(SUPPORTED_ABI_RETURN_TYPES), "ABI return types must be sorted and unique");

  /* F24 — mandatory limits can never be generic NOT_APPLICABLE. */
  invariant(isSortedUnique(MANDATORY_LIMIT_AVAILABILITY), "mandatory limit availability must be sorted and unique");
  invariant(isSortedUnique(LIMIT_READING_RESULTS), "limit reading results must be sorted and unique");
  invariant(
    !MANDATORY_LIMIT_AVAILABILITY.some((value) => value.startsWith("NOT_APPLICABLE")),
    "a mandatory per-transaction limit may not declare NOT_APPLICABLE availability",
  );
  invariant(
    PROMOTING_LIMIT_RESULTS.every((value) => LIMIT_READING_RESULTS.includes(value)) &&
      !PROMOTING_LIMIT_RESULTS.some((value) => value.startsWith("NOT_APPLICABLE")),
    "a NOT_APPLICABLE reading may not promote a control",
  );
  invariant(
    stable([...AUTHORITY_BINDING_RECORD_SHAPE.mandatoryLimitFields]) ===
      stable(["transactionDepth", "transactionTotal"]),
    "the mandatory per-transaction limit set drifted",
  );
  invariant(isSortedUnique(ENFORCEMENT_EVIDENCE_FIELDS), "enforcement evidence fields must be sorted and unique");
  invariant(
    protocol.resultSchema.mandatoryLimitsCannotBeNotApplicable &&
      protocol.resultSchema.noPassRelevantFactFromLocalHcuLimitFixture &&
      protocol.resultSchema.normalizationDrivenByRecordManifestOnly &&
      protocol.resultSchema.pricingComparedAgainstRecordManifestOnly,
    "a fourth-pass result-schema guarantee was weakened",
  );
  invariant(
    protocol.resultSchema.limitValueSource === "PROTOCOL_PINNED_AND_RECORD_MUST_MATCH",
    "the per-transaction limit value source is no longer single and coherent",
  );

  /* F27 — the SG-4 pricing variant closure is exact, sorted and typed. */
  invariant(isSortedUnique(PRICING_VARIANT_FIELDS), "pricing variant fields must be sorted and unique");
  invariant(SG4_PRICING_VARIANT_CLOSURE.length > 0, "the SG-4 pricing variant closure is empty");
  const variantIds = SG4_PRICING_VARIANT_CLOSURE.map(
    (variant) => `${variant.canonicalOperation}.${variant.operandMode}.${variant.costKeyType}`,
  );
  invariant(new Set(variantIds).size === variantIds.length, "the SG-4 variant closure contains duplicates");
  invariant(isSortedUnique([...variantIds].sort()), "variant identities must be unique");
  for (const variant of SG4_PRICING_VARIANT_CLOSURE) {
    invariant(OPERAND_MODES.includes(variant.operandMode), `unknown operand mode for ${variant.canonicalOperation}`);
    invariant(
      Number.isInteger(variant.arity) && variant.arity >= 0 && variant.arity <= 3,
      `implausible arity for ${variant.canonicalOperation}`,
    );
    invariant(variant.circuits.length > 0, `${variant.canonicalOperation} variant maps to no circuit`);
    invariant(!variant.resultType.includes("|"), "a compound type string is not a variant identity");
    invariant(variant.costKeyType.length > 0, "a variant must declare its cost key type");
  }
  /* The enforcement->canonical translation over the closure must be injective. */
  const enforcementPairs = new Map<string, string>();
  for (const variant of SG4_PRICING_VARIANT_CLOSURE) {
    const existing = enforcementPairs.get(variant.enforcementOperation);
    invariant(
      existing === undefined || existing === variant.canonicalOperation,
      `enforcement name ${variant.enforcementOperation} maps to more than one canonical operation`,
    );
    enforcementPairs.set(variant.enforcementOperation, variant.canonicalOperation);
  }
  /* Both used FheLt modes and both used select widths are present: names alone are not variants. */
  invariant(
    variantIds.includes("FheLt.scalar.Uint128") && variantIds.includes("FheLt.nonScalar.Uint128"),
    "both used FheLt operand modes must be in the closure",
  );
  invariant(
    variantIds.includes("FheIfThenElse.types.Uint128") && variantIds.includes("FheIfThenElse.types.Uint64"),
    "both used select result widths must be in the closure",
  );

  /* F30 — interpretation enums are closed and typed. */
  invariant(isSortedUnique(APPLICABILITY_INTERPRETATIONS), "interpretations must be sorted and unique");
  invariant(
    APPLICABILITY_INTERPRETATIONS.every((entry) => entry in APPLICABILITY_INTERPRETATION_RETURN_TYPE),
    "every interpretation must declare its return type",
  );
  invariant(
    Object.values(APPLICABILITY_INTERPRETATION_RETURN_TYPE).every((type) => SUPPORTED_ABI_RETURN_TYPES.includes(type)),
    "an interpretation declares an unsupported return type",
  );
  invariant(isSortedUnique(CONTRACT_ROLES), "contract roles must be sorted and unique");
  invariant(isSortedUnique(SUBJECT_ADDRESS_SOURCES), "subject address sources must be sorted and unique");
  invariant(isSortedUnique(APPLICABILITY_PROOF_FIELDS), "applicability proof fields must be sorted and unique");
  invariant(
    SUBJECT_ADDRESS_SOURCES.includes("NOT_RELEVANT_PROVEN_FROM_ARTIFACT") &&
      SUBJECT_ADDRESS_SOURCES.includes("DETERMINISTIC_PRECOMPUTED_DEPLOYMENT_ADDRESS"),
    "the benchmark-harness deployment circularity has no recorded resolution",
  );

  /* F31 — closed getter specs and digest-bound proof manifests. */
  invariant(isSortedUnique(LIMIT_GETTER_SPEC_FIELDS), "limit getter spec fields must be sorted and unique");
  invariant(isSortedUnique(LIMIT_CONTROL_IDS), "limit control ids must be sorted and unique");
  invariant(
    isSortedUnique(ENFORCEMENT_PROOF_MANIFEST_FIELDS) &&
      isSortedUnique(ENFORCEMENT_PROOF_ENTRY_FIELDS) &&
      isSortedUnique(ENFORCEMENT_PROOF_CONSTANT_ENTRY_FIELDS) &&
      isSortedUnique(ENFORCEMENT_PROOF_STORAGE_ENTRY_FIELDS) &&
      isSortedUnique(ENFORCEMENT_PROOF_STORAGE_READ_FIELDS) &&
      isSortedUnique(ENFORCEMENT_VALUE_SOURCE_KINDS),
    "enforcement proof fields and source kinds must be sorted and unique",
  );
  invariant(isSortedUnique(ENUMERATION_MANIFEST_FIELDS), "enumeration manifest fields must be sorted and unique");
  invariant(
    ENFORCEMENT_PROOF_ENTRY_FIELDS.includes("declarationSourceRangeSha256") &&
      ENFORCEMENT_PROOF_ENTRY_FIELDS.includes("enforcementSourceRangeSha256"),
    "enforcement proof entries must carry source-range digests, not prose",
  );
  invariant(
    ENUMERATION_MANIFEST_FIELDS.includes("enumerationComplete") &&
      ENUMERATION_MANIFEST_FIELDS.includes("sourceContentSha256"),
    "the enumeration manifest must record completeness and its source hash",
  );

  /* F28 — only executable metadata structures and reference kinds are advertised. */
  invariant(
    ACCEPTED_METADATA_STRUCTURES.length === 1 && ACCEPTED_METADATA_STRUCTURES[0] === "CBOR_SOLC_ONLY_NO_SOURCE_HASH",
    "an unexecutable metadata structure is advertised",
  );
  invariant(
    IMMUTABLE_REFERENCE_KINDS.length === 1 && IMMUTABLE_REFERENCE_KINDS[0] === "PUSH32_WORD_IMMUTABLE",
    "an immutable-reference kind is advertised that the normalizer does not implement",
  );
  invariant(
    isSortedUnique(IMMUTABLE_REFERENCE_ENTRY_FIELDS) &&
      IMMUTABLE_REFERENCE_ENTRY_FIELDS.includes("expectedDeployedBytes"),
    "a supplementary reference could overwrite bytes without declaring what must be there",
  );

  /* F32 — deployment-model coherence. */
  invariant(isSortedUnique(IMPLEMENTATION_RESOLUTION_RESULTS), "resolution results must be sorted and unique");
  invariant(
    protocol.resultSchema.properties.executorDeploymentModel.enum.every(
      (entry: string) => entry === "UNRESOLVED" || EXECUTOR_DEPLOYMENT_MODELS.includes(entry),
    ),
    "the result schema permits an executor deployment model the binding validator refuses",
  );
  invariant(
    DERIVATION_CHAIN_POLICY.stopOnExecutorCodeIdentityMismatch &&
      DERIVATION_CHAIN_POLICY.stopOnExecutorVersionMismatch &&
      DERIVATION_CHAIN_POLICY.stopOnAuthorityProxyIdentityMismatch &&
      DERIVATION_CHAIN_POLICY.stopOnUnverifiedDeploymentModel,
    "the derivation chain may continue past a broken link",
  );
  invariant(
    LIVE_CALL_PLAN_POLICY.generatedFromBindingRecord && LIVE_CALL_PLAN_POLICY.fixedPlanRejected,
    "the live call plan is still a fixed list",
  );

  /* F16 — deployment models are declared, and ERC-1967 is never assumed. */
  invariant(isSortedUnique(DEPLOYMENT_MODELS), "deployment models must be sorted and unique");
  invariant(DEPLOYMENT_MODELS.includes("DIRECT"), "a direct (non-proxied) deployment model must be representable");
  invariant(isSortedUnique(IMPLEMENTATION_RESOLUTION_MECHANISMS), "resolution mechanisms must be sorted and unique");
  invariant(
    IMPLEMENTATION_RESOLUTION_MECHANISMS.includes("NOT_APPLICABLE_DIRECT_DEPLOYMENT"),
    "a direct deployment must be able to declare that no implementation resolution applies",
  );

  /* F18 — merge rejection, finality, and RPC response integrity. */
  invariant(
    protocol.liveMode.preparationLineage.bindingCommitMustHaveExactlyOneParent &&
      protocol.liveMode.preparationLineage.mergeCommitsRejected,
    "a merge commit could satisfy the binding lineage",
  );
  invariant(
    protocol.liveMode.pinnedBlockFinalityPolicy.blockTag === "finalized" &&
      protocol.liveMode.pinnedBlockFinalityPolicy.fallbackToLatestForbidden &&
      protocol.liveMode.pinnedBlockFinalityPolicy.failClosedIfFinalizedUnavailable,
    "the pinned-block finality policy was weakened",
  );
  const rpc = protocol.liveMode.rpcResponsePolicy;
  invariant(
    rpc.requireHttp2xx &&
      rpc.requireJsonObject &&
      rpc.requireJsonRpcVersion === "2.0" &&
      rpc.requireExactRequestId &&
      rpc.monotonicallyIncreasingRequestIds &&
      rpc.requireExactlyOneOfResultOrError &&
      rpc.rejectRedirects &&
      rpc.retainSanitizedErrorsOnly,
    "the JSON-RPC response integrity policy was weakened",
  );
  invariant(rpc.maximumResponseBytes > 0, "the RPC response size bound must be positive");

  /* Normalization plan. */
  invariant(EXECUTOR_IMMEDIATE_OFFSETS.length === EXECUTOR_IMMEDIATE_COUNT, "normalization offset count drift");
  invariant(
    EXECUTOR_IMMEDIATE_OFFSETS.every((offset, index) => index === 0 || offset > EXECUTOR_IMMEDIATE_OFFSETS[index - 1]),
    "normalization offsets must be strictly ascending",
  );
  invariant(
    EXECUTOR_IMMEDIATE_OFFSETS.every(
      (offset) => offset >= 0 && BigInt(offset + ADDRESS_BYTE_LENGTH) <= EXPECTED_CODE_SECTION_BYTE_LENGTH,
    ),
    "normalization offset outside the code section",
  );
  invariant(
    EXPECTED_CODE_SECTION_BYTE_LENGTH + BigInt(EXPECTED_METADATA.cborByteLength) + 2n === EXPECTED_RUNTIME_BYTE_LENGTH,
    "metadata trailer length inconsistent with runtime length",
  );
  invariant(!EXPECTED_METADATA.carriesSourceHash, "metadata unexpectedly carries a source hash");
  invariant(protocol.bytecodeVerification.normalization.broadStringReplacementForbidden, "broad replacement permitted");

  /* Stale-constant guard. */
  invariant(
    protocol.onChainCorroboration.staleConstantProhibition.mayBeUsedAsAuthority === false,
    "stale HCULimit constant permitted as authority",
  );
  invariant(
    STALE_PLUGIN_HCU_LIMIT.sepoliaValue.toLowerCase() !== SEPOLIA_EXECUTOR_ADDRESS.toLowerCase(),
    "stale HCULimit address collides with the executor address",
  );
  invariant(
    protocol.onChainCorroboration.addressDerivationRule ===
      "AUTHORITY_ADDRESS_MUST_BE_DERIVED_FROM_THE_VERIFIED_EXECUTOR_ONLY",
    "authority address derivation rule weakened",
  );

  /* Operation tables. */
  invariant(isSortedUnique(EXPECTED_INSTALLED_OPERATIONS), "installed operation list must be sorted and unique");
  invariant(isSortedUnique(EXPECTED_AUTHORITY_OPERATIONS), "authority operation list must be sorted and unique");
  invariant(isSortedUnique(UNSUPPORTED_OPERATION_GUARD), "unsupported-operation guard must be sorted and unique");
  const translationTargets = Object.values(OPERATION_NAME_TRANSLATIONS);
  invariant(new Set(translationTargets).size === translationTargets.length, "operation name translation is ambiguous");
  const translated = EXPECTED_AUTHORITY_OPERATIONS.map((name) => OPERATION_NAME_TRANSLATIONS[name] ?? name).sort();
  invariant(
    stable(translated) === stable([...EXPECTED_INSTALLED_OPERATIONS].sort()),
    "authority and installed operation sets differ after translation",
  );
  for (const guarded of UNSUPPORTED_OPERATION_GUARD) {
    invariant(!EXPECTED_INSTALLED_OPERATIONS.includes(guarded), `${guarded} unexpectedly present in installed table`);
    invariant(!EXPECTED_AUTHORITY_OPERATIONS.includes(guarded), `${guarded} unexpectedly present in authority table`);
  }

  /* INVARIANT A — every canonical variant is exactly what the registered circuits execute, and
   * every one of them resolves to an operation the authority surface prices. */
  const priced = new Set(translated);
  for (const entry of SG4_CANONICAL_OPERATION_VARIANTS) {
    invariant(
      priced.has(entry.canonicalOperation),
      `canonical variant ${entry.variantId} resolves to no priced authority operation`,
    );
    invariant(entry.circuits.length > 0, `canonical variant ${entry.variantId} names no circuit`);
    invariant(entry.solidityCalls.length > 0, `canonical variant ${entry.variantId} names no Solidity call`);
    invariant(!entry.resultType.includes("|"), `canonical variant ${entry.variantId} carries a compound result type`);
    invariant(
      entry.operandTypes.length === entry.arity,
      `canonical variant ${entry.variantId} arity disagrees with its operand types`,
    );
  }
  invariant(protocol.sg4OperationCoverage.silentCoverageLossForbidden, "silent coverage loss permitted");

  /* Live mode must remain prepared-only and read-only. */
  invariant(protocol.liveMode.status === "PREPARED_NOT_EXECUTED", "live mode is not prepared-only");
  invariant(protocol.liveMode.walletRequested === false, "wallet requested");
  invariant(protocol.liveMode.signingRequested === false, "signing requested");
  invariant(protocol.liveMode.transactionSubmitted === false, "transaction submitted");
  invariant(isSortedUnique(LIVE_RPC_ALLOWED_METHODS), "allowed RPC method list must be sorted and unique");
  invariant(
    LIVE_RPC_ALLOWED_METHODS.every((method) =>
      ["eth_call", "eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_getStorageAt"].includes(method),
    ),
    "unexpected RPC method allowed",
  );
  invariant(
    LIVE_RPC_ALLOWED_METHODS.every(
      (method) => !LIVE_RPC_FORBIDDEN_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix)),
    ),
    "an allowed RPC method matches a forbidden prefix",
  );
  invariant(protocol.liveMode.empiricalLimitProbingForbidden, "empirical limit probing permitted");

  /* ERC-1967 resolution must name a mechanism that can actually read a proxy's own slot. */
  invariant(
    protocol.onChainCorroboration.erc1967Resolution.mechanism ===
      "ETH_GET_STORAGE_AT_EXACT_ERC1967_SLOT_AT_THE_PINNED_BLOCK",
    "ERC-1967 resolution mechanism drift",
  );
  invariant(
    LIVE_RPC_ALLOWED_METHODS.includes("eth_getStorageAt"),
    "ERC-1967 slot resolution requires eth_getStorageAt on the allow-list",
  );
  invariant(
    protocol.resultSchema.crossVersionMixingRejected &&
      protocol.resultSchema.localFixtureCannotSatisfyCurrentDeploymentPass,
    "the result schema no longer rejects cross-version mixing",
  );
  invariant(
    protocol.onChainCorroboration.erc1967Resolution.ethCallResolutionForbiddenWithoutVerifiedGetter,
    "eth_call slot resolution permitted without a verified getter",
  );
  invariant(
    /^0x[0-9a-f]{64}$/u.test(ERC1967_IMPLEMENTATION_SLOT),
    "ERC-1967 implementation slot is not a 32-byte value",
  );
  invariant(
    Object.values(READ_ONLY_SELECTORS).every((selector) => /^0x[0-9a-f]{8}$/u.test(selector)),
    "read-only selector is not a 4-byte value",
  );
  invariant(
    new Set(Object.values(READ_ONLY_SELECTORS)).size === Object.values(READ_ONLY_SELECTORS).length,
    "read-only selectors collide",
  );

  /* Stale-guard scope. */
  invariant(isSortedUnique(SG4_GUARDED_SOURCE_SCOPE), "guarded source scope must be sorted and unique");
  invariant(isSortedUnique(SG4_STALE_GUARD_DEFINITION_FILES), "guard definition files must be sorted and unique");
  invariant(
    SG4_STALE_GUARD_DEFINITION_FILES.every((file) => SG4_GUARDED_SOURCE_SCOPE.includes(file)),
    "a guard definition file is outside the guarded scope",
  );
  invariant(SG4_STALE_AUTHORITY_SYMBOL_PATTERNS.length > 0, "stale-authority symbol pattern list is empty");
  for (const entry of SG4_STALE_AUTHORITY_SYMBOL_PATTERNS) {
    /* A malformed pattern would silently stop detecting anything. */
    invariant(
      (() => {
        try {
          new RegExp(entry.pattern, "u");
          return true;
        } catch {
          return false;
        }
      })(),
      `stale-authority pattern ${entry.id} does not compile`,
    );
  }
  invariant(
    SG4_STALE_AUTHORITY_SYMBOL_PATTERNS.some((entry) => new RegExp(entry.pattern, "u").test("HCULimitAddress")),
    "the plugin HCULimit address constant is no longer detected",
  );
  invariant(
    SG4_STALE_AUTHORITY_SYMBOL_PATTERNS.every((entry) => !new RegExp(entry.pattern, "u").test("getHCULimitAddress()")),
    "the executor's own getHCULimitAddress getter must not be treated as the stale plugin constant",
  );

  /* Preparation status must remain non-PASS. */
  invariant(protocol.authorityVerificationStatus !== "PASS", "preparation must not report PASS");
  invariant(protocol.sg4Status === "PENDING", "SG-4 must remain PENDING");
  invariant(protocol.sg5Status === "PENDING", "SG-5 must remain PENDING");
  invariant(!protocol.benchmarkExecutionGate.permanentBenchmarkExecutionAllowed, "benchmark execution unblocked");
  invariant(protocol.verdictRules.missingValueVerdict === "BLOCKED", "missing value no longer BLOCKED");
  invariant(protocol.verdictRules.localExpectationVerdict === "BLOCKED", "local expectation no longer BLOCKED");
  invariant(protocol.verdictRules.currentVerdict === "BLOCKED", "preparation verdict must be BLOCKED");
  invariant(protocol.verdictRules.gasMayNotSubstituteForHcu, "gas substitution permitted");
  invariant(isSortedUnique(protocol.reopenConditions), "reopen conditions must be sorted and unique");
  invariant(isSortedUnique(protocol.benchmarkExecutionGate.currentlyBlockedBy), "blockers must be sorted and unique");
  /* The gate must stay blocked for as long as any blocking state remains recorded. */
  invariant(
    protocol.benchmarkExecutionGate.currentlyBlockedBy.length > 0,
    "the benchmark gate records no blocker while blocking states remain",
  );

  /* Result schema closure. */
  const resultSchema = protocol.resultSchema;
  invariant(resultSchema.additionalProperties === false, "result schema is not closed");
  invariant(isSortedUnique(resultSchema.required), "result schema required list must be sorted and unique");
  invariant(
    resultSchema.required.every((field) => field in resultSchema.properties),
    "result schema requires a field it does not define",
  );
  invariant(
    Object.keys(resultSchema.properties).every((field) => resultSchema.required.includes(field)),
    "result schema defines an optional top-level field; every field must be required so omission cannot masquerade as an incomplete check",
  );
  invariant(resultSchema.blockedIsRepresentableWithoutVerifiedLinkage, "BLOCKED representability weakened");
  invariant(isSortedUnique(resultSchema.passRequires), "PASS requirements must be sorted and unique");
  invariant(isSortedUnique(resultSchema.forbiddenProperties), "forbidden properties must be sorted and unique");
}

export function deriveAuthorityProtocol(): AuthorityProtocol {
  const protocol = buildAuthorityProtocol();
  validateAuthorityProtocol(protocol);
  return protocol;
}

export function serializeAuthorityProtocol(): string {
  return `${JSON.stringify(deriveAuthorityProtocol(), null, 2)}\n`;
}

if (require.main === module) process.stdout.write(serializeAuthorityProtocol());
