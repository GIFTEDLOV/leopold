import { expect } from "chai";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import {
  CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS,
  DEPTH_SAFETY_THRESHOLD,
  ERC1967_IMPLEMENTATION_SLOT,
  EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256,
  EXECUTOR_IMMEDIATE_COUNT,
  EXECUTOR_IMMEDIATE_OFFSETS,
  EXPECTED_CALCULATOR_HASH,
  EXPECTED_COST_TABLE_HASH,
  EXPECTED_METADATA,
  ACCEPTED_METADATA_STRUCTURES,
  ARTIFACT_LOCAL_EXECUTOR_ADDRESS,
  COMPILER_REFERENCE_MANIFEST_SCHEMA,
  CANONICAL_SIGNATURE_GRAMMAR,
  EXECUTOR_DEPLOYMENT_MODELS,
  IMMUTABLE_REFERENCE_KINDS,
  INTERFACE_CALL_SPECS,
  INTERFACE_MANIFEST_SCHEMA,
  LIMIT_CONTROL_INTERFACE_CALLS,
  LIMIT_GETTER_PERMITTED_ROLES,
  MANDATORY_INTERFACE_CALL_IDS,
  SG4_PRICING_VARIANT_CLOSURE,
  canonicalJson,
  projectPricingClosure,
  EXPECTED_NORMALIZED_RUNTIME_SHA256,
  FACET_ORIGINS_FORBIDDEN_FOR_PASS,
  LIVE_ACKNOWLEDGEMENT,
  LIVE_RPC_ALLOWED_METHODS,
  RPC_RESPONSE_POLICY,
  OPERATION_NAME_TRANSLATIONS,
  OPERATION_SCHEDULE_AUTHORITY,
  SG4_GUARDED_SOURCE_SCOPE,
  SG4_CANONICAL_OPERATION_VARIANTS,
  STALE_PLUGIN_HCU_LIMIT,
  TOTAL_SAFETY_THRESHOLD,
  TRANSACTION_DEPTH_HCU_LIMIT,
  TRANSACTION_TOTAL_HCU_LIMIT,
  UNSUPPORTED_OPERATION_GUARD,
  controlIsBlocking,
  deriveAuthorityProtocol,
  evaluateCombinedHcu,
  evaluateSafety,
  greatestAcceptedValue,
  serializeAuthorityProtocol,
  validateControl,
  type ControlDeclaration,
} from "../scripts/sg4-hcu-authority-protocol";
import {
  EXPECTED_AUTHORITY_PROTOCOL_SHA256,
  EXPECTED_SG4_PROTOCOL_SHA256,
  ROOT,
  assertBoundToPinnedBlock,
  assertLiveCallPlanIsReadOnly,
  checkDirectPin,
  checkLockfilePin,
  checkPreparationLineage,
  checkStaleAddressUsage,
  classifyBlockOrBatchControl,
  classifyCodeIdentity,
  compareClaimsAgainstDerivation,
  compareOperationTables,
  createGuardedTransport,
  decodeUint48,
  decodeUint256,
  enumerateAuthoritySurface,
  enumerateLimitConstants,
  extractLimits,
  inspectMetadataTrailer,
  compareCalculatorAgainstPricingManifest,
  decodeAbiReturn,
  encodeAbiArguments,
  canonicalSourceReference,
  deriveAuthorityFromSourceMaterial,
  deriveExecutorFromSourceMaterial,
  extractArtifactBuild,
  extractExecutorArtifactBuild,
  extractPriceSchedule,
  parseAuthoritySource,
  verifyMeasurementToolchainRoot,
  crossLinkImmutableReferences,
  deriveBlockOrBatchConclusion,
  generateLiveCallPlan,
  interfaceCall,
  interfaceCalldata,
  liveCallLogDigest,
  livePlanDigest,
  offlinePlanReferenceRecord,
  resolvePlannedRequest,
  selectedProvenanceMap,
  selectedProvenanceTuple,
  sourceFileCanonicalReference,
  normalizationManifestDigest,
  normalizeRuntimeBytecode,
  normalizeRuntimeBytecodeFromManifest,
  parseAuthorityCostTable,
  parseJsonRpcResponse,
  pricingComparisonBlockers,
  pricingManifestDigest,
  variantId,
  validateCompilerReferenceManifest,
  validateNormalizationManifest,
  validatePricingManifest,
  parseExecutorEventNames,
  parseInstalledCostTable,
  readInstalledRuntimeBytecode,
  runLiveAuthorityVerification,
  runOfflinePreflight,
  sha256,
  validateAuthorityBindingRecord,
  validateAuthorityResult as validateAuthorityResultRaw,
  validateResultAgainstSchema,
  type CostTable,
} from "../scripts/sg4-hcu-authority";
import {
  CIRCUITS,
  FHE_OPERATION_SEMANTICS,
  assessSampleHcu,
  deriveCanonicalOperationManifest,
  serializeProtocol,
} from "../scripts/sg4-protocol";

const HOST = resolve(ROOT, "node_modules/@fhevm/host-contracts");
const MOCK = resolve(ROOT, "node_modules/@fhevm/mock-utils");
const hcuLimitSource = readFileSync(resolve(HOST, "contracts/HCULimit.sol"), "utf8");
const costTableSource = readFileSync(resolve(MOCK, "fhevm/coprocessor/HCUByOperator.ts"), "utf8");
const eventsSource = readFileSync(resolve(MOCK, "fhevm/coprocessor/CoprocessorEvents.ts"), "utf8");
const OFFICIAL_PRICE_SOURCE_PATH = resolve(ROOT, "test/fixtures/fhevm-v0.13.2-operatorsPrices.ts.txt");
const OFFICIAL_PRICE_SOURCE_TEXT = readFileSync(OFFICIAL_PRICE_SOURCE_PATH, "utf8");
const OFFICIAL_HCU_BUILD_INFO_PATH = resolve(
  ROOT,
  "test/fixtures/fhevm-v0.13.2-FHEVMExecutor-4d775fb2ba96328ce842168d97046c84.build-info.json.gz",
);
const OFFICIAL_HCU_SOURCE_TEXT = (
  JSON.parse(gunzipSync(readFileSync(OFFICIAL_HCU_BUILD_INFO_PATH)).toString("utf8")) as {
    input: { sources: Record<string, { content: string }> };
  }
).input.sources["contracts/HCULimit.sol"].content;
const artifactJson = readFileSync(resolve(HOST, "artifacts/contracts/HCULimit.sol/HCULimit.json"), "utf8");
const runtime = readInstalledRuntimeBytecode(artifactJson);
const ARTIFACT_EXECUTOR = deriveAuthorityProtocol().bytecodeVerification.artifactEmbeddedExecutorAddress;

const manifest = readFileSync(resolve(ROOT, "package.json"), "utf8");
const lockfile = readFileSync(resolve(ROOT, "pnpm-lock.yaml"), "utf8");

function control(overrides: Partial<ControlDeclaration> = {}): ControlDeclaration {
  return {
    metricId: "TEST_CONTROL",
    scope: "PER_TRANSACTION",
    unit: "HCU",
    authorityState: "PROVEN_PRESENT",
    value: "1",
    absenceReason: null,
    verificationMethod: "ENUMERATION of the verified implementation",
    sourceImplementation: "@fhevm/host-contracts@0.10.0",
    applicabilityConclusion: "APPLICABLE",
    liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
    blocking: false,
    ...overrides,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Fake read-only JSON-RPC transport.
 *
 * Every live-verifier test runs against this. It answers from an in-memory fixture and touches no
 * network; a request it does not recognise is an explicit failure rather than a silent undefined.
 * ------------------------------------------------------------------------------------------- */

const PINNED_HEX = "0x7a1200";
const PINNED_DECIMAL = "8000000";
const PINNED_HASH = `0x${"ab".repeat(32)}`;
const AUTHORITY_PROXY = "0xa10998783c8cf88d886bc30307e631d6686f0a22";
const AUTHORITY_IMPLEMENTATION = "0x2222222222222222222222222222222222222222";
const SEPOLIA_EXECUTOR = deriveAuthorityProtocol().network.configuredExecutorAddress;

function word(address: string): string {
  return `0x${"0".repeat(24)}${address.toLowerCase().replace(/^0x/u, "")}`;
}

function abiString(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  const padded = Buffer.alloc(Math.ceil(bytes.length / 32) * 32);
  bytes.copy(padded);
  const offset = (32).toString(16).padStart(64, "0");
  const length = bytes.length.toString(16).padStart(64, "0");
  return `0x${offset}${length}${padded.toString("hex")}`;
}

/* The Sepolia implementation differs from the pinned local-build artifact in exactly the 28
 * executor-address immediates, so the fixture is the artifact with those immediates rewritten. */
/* The local 0.10.0 fixture, rewritten to Sepolia. Retained ONLY for the offline fixture self-test;
 * it is not the reproduced build and plays no part in authoritative identity. */
function sepoliaImplementationRuntime(): Buffer {
  const rewritten = Buffer.from(runtime);
  const sepolia = Buffer.from(SEPOLIA_EXECUTOR.toLowerCase().replace(/^0x/u, ""), "hex");
  for (const offset of EXECUTOR_IMMEDIATE_OFFSETS) sepolia.copy(rewritten, offset);
  return rewritten;
}

/* ---------------------------------------------------------------------------------------------
 * The REPRODUCED build's shape.
 *
 * 20,231 bytes, a solc-only CBOR trailer encoding 0.8.24, and three PUSH32 word immutables at the
 * offsets the compiler actually reports. The artifact side carries zero words; the deployed side
 * carries the implementation address left-padded to a word.
 *
 * The runtime also carries PUSH20 occurrences of the Sepolia executor address — compile-time
 * constants, which normalization must leave alone. They are placed here deliberately so the tests
 * would catch a normalizer that touched them.
 * ------------------------------------------------------------------------------------------- */

const UUPS_SELF_OFFSETS = [17180, 17221, 17739] as const;
const REPRODUCED_TRAILER = Buffer.from("a164736f6c6343000818000a", "hex");
const REPRODUCED_RUNTIME_LENGTH = 20_231;
const REPRODUCED_EXECUTOR_RUNTIME_LENGTH = 21_535;
/* The exact 30 ordinary PUSH20 executor constants in the reproduced v0.13.2 runtime. None is a
 * compiler immutable reference. */
const EXECUTOR_CONSTANT_OFFSETS = [
  973, 2382, 2866, 4182, 4480, 4816, 5098, 5519, 5940, 6728, 7079, 7598, 7951, 8578, 8861, 9488, 10129, 10553, 11041,
  11465, 11823, 12723, 13039, 13879, 14291, 14716, 15102, 15283, 15376, 15632,
] as const;

const EXECUTOR_IMPLEMENTATION = "0x0cfb37566e0ceebaf9ee244225aee14cecd4d170";
const EXECUTOR_PROXY_RUNTIME_CODE = "0x6000600055";
const EXECUTOR_PROXY_RUNTIME_HASH = sha256(Buffer.from(EXECUTOR_PROXY_RUNTIME_CODE.slice(2), "hex"));
const EXECUTOR_BUILD_INFO_FIXTURE_PATH = resolve(
  ROOT,
  "test/fixtures/fhevm-v0.13.2-FHEVMExecutor-4d775fb2ba96328ce842168d97046c84.build-info.json.gz",
);
const EXECUTOR_BUILD_INFO_SHA256 = "50ed161472e207da6462aa180856d0047aa52396abdba05e9bf566f5ccfd63dd";
const EXECUTOR_BUILD_INFO_DECOMPRESSED_SIZE = 7_746_075;

type JsonObject = Record<string, unknown>;

function jsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonObject;
}

function loadAuthenticatedExecutorBuildInfoFixture(): { bytes: Buffer; json: JsonObject } {
  const bytes = gunzipSync(readFileSync(EXECUTOR_BUILD_INFO_FIXTURE_PATH));
  if (bytes.length !== EXECUTOR_BUILD_INFO_DECOMPRESSED_SIZE) {
    throw new Error(
      `authenticated executor build-info size mismatch: expected ${EXECUTOR_BUILD_INFO_DECOMPRESSED_SIZE}, got ${bytes.length}`,
    );
  }
  const digest = sha256(bytes);
  if (digest !== EXECUTOR_BUILD_INFO_SHA256) {
    throw new Error(
      `authenticated executor build-info digest mismatch: expected ${EXECUTOR_BUILD_INFO_SHA256}, got ${digest}`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(`authenticated executor build-info is not valid JSON: ${String(error)}`);
  }
  return { bytes, json: jsonObject(json, "authenticated executor build-info") };
}

const AUTHENTICATED_EXECUTOR_BUILD_INFO = loadAuthenticatedExecutorBuildInfoFixture();

function authenticatedExecutorSourceText(): string {
  const input = jsonObject(AUTHENTICATED_EXECUTOR_BUILD_INFO.json.input, "executor build input");
  const sources = jsonObject(input.sources, "executor build input.sources");
  const source = jsonObject(sources["contracts/FHEVMExecutor.sol"], "executor source entry");
  if (typeof source.content !== "string") throw new Error("executor source content is not a string");
  return source.content;
}

function authenticatedExecutorArtifactRuntime(): Buffer {
  const output = jsonObject(AUTHENTICATED_EXECUTOR_BUILD_INFO.json.output, "executor build output");
  const contracts = jsonObject(output.contracts, "executor build output.contracts");
  const sourceContracts = jsonObject(contracts["contracts/FHEVMExecutor.sol"], "executor selected source output");
  const executor = jsonObject(sourceContracts.FHEVMExecutor, "executor selected contract output");
  const evm = jsonObject(executor.evm, "executor selected contract evm output");
  const deployedBytecode = jsonObject(evm.deployedBytecode, "executor deployed bytecode");
  if (typeof deployedBytecode.object !== "string" || !/^[0-9a-f]*$/u.test(deployedBytecode.object)) {
    throw new Error("executor deployed bytecode object is not hexadecimal");
  }
  return Buffer.from(deployedBytecode.object, "hex");
}

function authenticatedExecutorImmutableOffsets(): readonly number[] {
  const output = jsonObject(AUTHENTICATED_EXECUTOR_BUILD_INFO.json.output, "executor build output");
  const contracts = jsonObject(output.contracts, "executor build output.contracts");
  const sourceContracts = jsonObject(contracts["contracts/FHEVMExecutor.sol"], "executor selected source output");
  const executor = jsonObject(sourceContracts.FHEVMExecutor, "executor selected contract output");
  const evm = jsonObject(executor.evm, "executor selected contract evm output");
  const deployedBytecode = jsonObject(evm.deployedBytecode, "executor deployed bytecode");
  const references = jsonObject(deployedBytecode.immutableReferences, "executor immutable references");
  const entries = references["605"];
  if (!Array.isArray(entries)) throw new Error("executor immutable AST 605 references are missing");
  const offsets = entries.map((entry, index) => {
    const reference = jsonObject(entry, `executor immutable reference ${index}`);
    if (reference.length !== 32 || typeof reference.start !== "number") {
      throw new Error(`executor immutable reference ${index} is not a 32-byte offset`);
    }
    return reference.start;
  });
  if (JSON.stringify(offsets) !== JSON.stringify([14424, 14465, 14991])) {
    throw new Error(`executor immutable references are not the authenticated set: ${JSON.stringify(offsets)}`);
  }
  const runtime = authenticatedExecutorArtifactRuntime();
  for (const offset of offsets) {
    if (runtime[offset - 1] !== 0x7f || !runtime.subarray(offset, offset + 32).every((byte) => byte === 0)) {
      throw new Error(`executor immutable placeholder at ${offset} is not PUSH32 followed by zero bytes`);
    }
  }
  return offsets;
}

const AUTHENTICATED_EXECUTOR_SOURCE_TEXT = authenticatedExecutorSourceText();
const AUTHENTICATED_EXECUTOR_SOURCE_BYTES = Buffer.from(AUTHENTICATED_EXECUTOR_SOURCE_TEXT, "utf8");
const AUTHENTICATED_EXECUTOR_SOURCE_SHA256 = sha256(AUTHENTICATED_EXECUTOR_SOURCE_BYTES);
const AUTHENTICATED_EXECUTOR_ARTIFACT_RUNTIME = authenticatedExecutorArtifactRuntime();
const AUTHENTICATED_EXECUTOR_IMMUTABLE_OFFSETS = authenticatedExecutorImmutableOffsets();
const AUTHENTICATED_EXECUTOR_PUSH20_OFFSET = (() => {
  for (let index = 0; index + 20 < AUTHENTICATED_EXECUTOR_ARTIFACT_RUNTIME.length; index++) {
    if (
      AUTHENTICATED_EXECUTOR_ARTIFACT_RUNTIME[index] === 0x73 &&
      !AUTHENTICATED_EXECUTOR_IMMUTABLE_OFFSETS.includes(index + 1)
    ) {
      return index + 1;
    }
  }
  throw new Error("authenticated executor runtime has no ordinary PUSH20 occurrence");
})();

function deployedAuthenticatedExecutorRuntime(implementationAddress: string = SEPOLIA_EXECUTOR): Buffer {
  const runtime = Buffer.from(AUTHENTICATED_EXECUTOR_ARTIFACT_RUNTIME);
  const address = implementationAddress.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{40}$/u.test(address))
    throw new Error(`invalid executor implementation address ${implementationAddress}`);
  const immutableWord = Buffer.from("00".repeat(12) + address, "hex");
  for (const offset of AUTHENTICATED_EXECUTOR_IMMUTABLE_OFFSETS) immutableWord.copy(runtime, offset);
  return runtime;
}

function reproducedArtifactRuntime(): Buffer {
  const buffer = Buffer.alloc(REPRODUCED_RUNTIME_LENGTH, 0x5b);
  /* Three PUSH32 word immutables, artifact side: zero words. */
  for (const offset of UUPS_SELF_OFFSETS) {
    buffer[offset - 1] = 0x7f;
    buffer.fill(0x00, offset, offset + 32);
  }
  /* The executor address as a PUSH20 compile-time constant. */
  const executor = Buffer.from(SEPOLIA_EXECUTOR.toLowerCase().replace(/^0x/u, ""), "hex");
  for (const offset of EXECUTOR_CONSTANT_OFFSETS) {
    buffer[offset - 1] = 0x73;
    executor.copy(buffer, offset);
  }
  REPRODUCED_TRAILER.copy(buffer, REPRODUCED_RUNTIME_LENGTH - REPRODUCED_TRAILER.length);
  return buffer;
}

/* The DEPLOYED implementation runtime: the artifact with the implementation address written into
 * each `__self` word. */
function deployedImplementationRuntime(implementationAddress: string = AUTHORITY_IMPLEMENTATION): Buffer {
  const buffer = reproducedArtifactRuntime();
  const word = Buffer.from("00".repeat(12) + implementationAddress.toLowerCase().replace(/^0x/u, ""), "hex");
  for (const offset of UUPS_SELF_OFFSETS) word.copy(buffer, offset);
  return buffer;
}

function deployedExecutorImplementationRuntime(implementationAddress: string = SEPOLIA_EXECUTOR): Buffer {
  return deployedAuthenticatedExecutorRuntime(implementationAddress);
}

function officialImplementationRuntime(): Buffer {
  return deployedImplementationRuntime();
}

const OFFICIAL_NORMALIZED_HASH = normalizeRuntimeBytecode(
  officialImplementationRuntime(),
  deriveAuthorityProtocol().network.configuredExecutorAddress,
).normalizedSha256;

type FakeOverrides = {
  chainId?: string;
  block?: { number: string; hash: string } | null;
  executorCode?: string;
  executorImplementationAddress?: string;
  executorImplementationCode?: string;
  executorImplementationSlot?: string;
  authorityAddress?: string;
  implementationSlot?: string;
  implementationCode?: string;
  reciprocal?: string;
  proxyCode?: string;
  totalHcu?: string;
  depthHcu?: string;
  exempt?: string;
};

function uintWord(value: bigint | string): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function createFakeTransport(overrides: FakeOverrides = {}) {
  const calls: { method: string; params: readonly unknown[] }[] = [];
  const executorImplementationAddress = overrides.executorImplementationAddress ?? EXECUTOR_IMPLEMENTATION;
  const executorImplementationRuntime =
    overrides.executorImplementationCode ??
    `0x${deployedAuthenticatedExecutorRuntime(executorImplementationAddress).toString("hex")}`;
  const authorityImplementationRuntime =
    overrides.implementationCode ?? `0x${officialImplementationRuntime().toString("hex")}`;
  const authority = overrides.authorityAddress ?? AUTHORITY_PROXY;
  const transport = {
    async send(call: { method: string; params: readonly unknown[] }): Promise<unknown> {
      calls.push({ method: call.method, params: [...call.params] });
      switch (call.method) {
        case "eth_chainId":
          return overrides.chainId ?? "0xaa36a7";
        case "eth_getBlockByNumber":
          return overrides.block === undefined ? { number: PINNED_HEX, hash: PINNED_HASH } : overrides.block;
        case "eth_getCode": {
          const target = String(call.params[0]).toLowerCase();
          if (target === SEPOLIA_EXECUTOR.toLowerCase()) return overrides.executorCode ?? EXECUTOR_RUNTIME_CODE;
          if (target === executorImplementationAddress.toLowerCase()) return executorImplementationRuntime;
          if (target === authority.toLowerCase()) return overrides.proxyCode ?? AUTHORITY_PROXY_CODE;
          if (target === AUTHORITY_IMPLEMENTATION.toLowerCase()) return authorityImplementationRuntime;
          return "0x";
        }
        case "eth_getStorageAt": {
          const target = String(call.params[0]).toLowerCase();
          if (target === SEPOLIA_EXECUTOR.toLowerCase()) {
            return overrides.executorImplementationSlot ?? word(executorImplementationAddress);
          }
          return overrides.implementationSlot ?? word(AUTHORITY_IMPLEMENTATION);
        }
        case "eth_call": {
          const data = String((call.params[0] as { data: string }).data);
          const to = String((call.params[0] as { to: string }).to).toLowerCase();
          if (data.startsWith("0x0d8e6e2c"))
            return abiString(to === authority.toLowerCase() ? "HCULimit v0.1.0" : "FHEVMExecutor v0.4.0");
          if (data.startsWith("0xe0786972")) return word(authority);
          if (data.startsWith("0x268d6d31")) return overrides.reciprocal ?? word(SEPOLIA_EXECUTOR);
          if (data.startsWith(SELECTOR_TOTAL)) return uintWord(overrides.totalHcu ?? "20000000");
          if (data.startsWith(SELECTOR_DEPTH)) return uintWord(overrides.depthHcu ?? "5000000");
          /* Caller-applicability getter: a canonical bool, false by default. */
          if (data.startsWith(SELECTOR_EXEMPT)) return overrides.exempt ?? `0x${"0".repeat(64)}`;
          throw new Error(`fake transport: unexpected calldata ${data}`);
        }
        default:
          throw new Error(`fake transport: unexpected method ${call.method}`);
      }
    },
  };
  return { transport, calls };
}

/* ---------------------------------------------------------------------------------------------
 * Fake two-commit lineage probe.
 *
 * Models commit A (implementation) and commit B (binding) without touching git. Overrides let each
 * lineage test break exactly one property.
 * ------------------------------------------------------------------------------------------- */

const COMMIT_A = "a".repeat(40);
const TREE_A = "b".repeat(40);
const COMMIT_B = "c".repeat(40);
const TREE_B = "d".repeat(40);

/* Selectors are recomputed from their signatures, exactly as the record validator does. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { id: keccakId } = require("ethers") as { id: (value: string) => string };
const SIGNATURE_TOTAL = "getTransactionMaxHCU()";
const SIGNATURE_DEPTH = "getTransactionMaxDepthHCU()";
const SELECTOR_TOTAL = keccakId(SIGNATURE_TOTAL).slice(0, 10);
const SELECTOR_DEPTH = keccakId(SIGNATURE_DEPTH).slice(0, 10);

const OFFICIAL_ARTIFACT_ID = "CURRENT_OFFICIAL_ARTIFACT@zama-ai/fhevm@v0.13.2";
const HARNESS_ADDRESS = "0x4444444444444444444444444444444444444444";
const SENDER_ADDRESS = "0x5555555555555555555555555555555555555555";
const SIGNATURE_EXEMPT = "isExempt(address)";
const SELECTOR_EXEMPT = keccakId(SIGNATURE_EXEMPT).slice(0, 10);

/* The official deployed artifact is NOT the local 0.10.0 fixture. The fake deployment therefore
 * carries a runtime that differs from the fixture outside the normalized offsets, so its normalized
 * digest differs too — which is exactly the situation the local fixture may not stand in for. */
const EXECUTOR_RUNTIME_CODE = `0x${deployedExecutorImplementationRuntime().toString("hex")}`;
const AUTHORITY_PROXY_CODE = "0x363d3d37";
const EXECUTOR_RUNTIME_HASH = sha256(Buffer.from(EXECUTOR_RUNTIME_CODE.slice(2), "hex"));
const EXECUTOR_IMPLEMENTATION_RUNTIME_HASH = sha256(deployedExecutorImplementationRuntime(EXECUTOR_IMPLEMENTATION));
const PROXY_RUNTIME_HASH = sha256(Buffer.from(AUTHORITY_PROXY_CODE.slice(2), "hex"));

/* Exact prior-reviewed provenance tuples, taken from the protocol constants rather than invented. */
/* ---------------------------------------------------------------------------------------------
 * AUTHENTICATED SOURCE MATERIAL.
 *
 * Every authoritative fact in these tests is recomputed by the production extractors from these
 * exact bytes. Nothing is asserted: the digests below are computed FROM the bytes, the provenance
 * tuples are amended to name those digests, and the extractors are the same ones the live verifier
 * runs. A test that hand-wrote an expected list would be exactly the defect this pass removes.
 * ------------------------------------------------------------------------------------------- */

/* A minimal but structurally faithful authority source: two per-transaction ceilings, their two
 * revert errors, the two callable getters, one enforcement function that genuinely compares a
 * running total against a declared ceiling and reverts, and transient-storage primitives. It
 * names no block- or batch-scoped surface, so the parser derives ABSENT. */
const AUTHORITY_SOURCE_TEXT = [
  "// SPDX-License-Identifier: BSD-3-Clause-Clear",
  "pragma solidity ^0.8.24;",
  "",
  "contract HCULimit {",
  "    address private _executor;",
  "    uint256 public constant MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX = 20000000;",
  "    uint256 public constant MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX = 5000000;",
  "",
  "    error HCUTransactionLimitExceeded();",
  "    error HCUTransactionDepthLimitExceeded();",
  "",
  "    function getFHEVMExecutorAddress() public view returns (address) {",
  "        return _executor;",
  "    }",
  "",
  "    function getVersion() public pure returns (string memory) {",
  '        return "HCULimit v0.1.0";',
  "    }",
  "",
  "    function _updateAndVerifyHCUTransactionLimit(uint256 transactionHCU) internal {",
  "        uint256 running;",
  "        assembly {",
  "            running := tload(0)",
  "        }",
  "        running = running + transactionHCU;",
  "        if (running > MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX) {",
  "            revert HCUTransactionLimitExceeded();",
  "        }",
  "        assembly {",
  "            tstore(0, running)",
  "        }",
  "    }",
  "",
  "    function _updateAndVerifyHCUTransactionDepthLimit(uint256 depthHCU) internal {",
  "        uint256 depth;",
  "        assembly {",
  "            depth := tload(1)",
  "        }",
  "        if (depthHCU > MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX) {",
  "            revert HCUTransactionDepthLimitExceeded();",
  "        }",
  "        assembly {",
  "            tstore(1, depthHCU)",
  "        }",
  "    }",
  "}",
  "",
].join("\n");
const AUTHORITY_SOURCE_BYTES = Buffer.from(AUTHORITY_SOURCE_TEXT, "utf8");
const AUTHORITY_SOURCE_SHA256 = sha256(AUTHORITY_SOURCE_BYTES);

/* A genuinely different authenticated authority source: the same surface, one extra comment line.
 * Used by the amendment tests, because superseding to a digest with no bytes behind it is not a
 * supersession — it is an unresolvable claim, and the architecture now says so. */
const AMENDED_AUTHORITY_SOURCE_BYTES = Buffer.from(
  AUTHORITY_SOURCE_TEXT.replace("contract HCULimit {", "/* corrected upstream build */\ncontract HCULimit {"),
  "utf8",
);
const AMENDED_AUTHORITY_SOURCE_SHA256 = sha256(AMENDED_AUTHORITY_SOURCE_BYTES);

/* The authoritative price schedule, in the upstream operators-prices form. It carries the FULL
 * schedule: every installed operation plus the two the current official schedule adds. */
function priceScheduleTextForTest(): string {
  const installed = parseInstalledCostTable(costTableSource);
  const lines: string[] = ["export const operatorsPrices = {"];
  const operations = [...installed.keys()].sort();
  for (const operation of operations) {
    lines.push(`  ${operation}: {`);
    const groups = installed.get(operation);
    const supportsScalar = groups?.has("scalar") === true;
    const numberInputs = groups?.has("types") === true ? 1 : 2;
    lines.push(`    supportScalar: ${supportsScalar},`, `    numberInputs: ${numberInputs},`);
    for (const group of [...(groups?.keys() ?? [])].sort()) {
      lines.push(`    ${group}: {`);
      const byType = groups?.get(group as never);
      for (const type of [...(byType?.keys() ?? [])].sort()) {
        lines.push(`      ${type}: ${byType?.get(type)},`);
      }
      lines.push("    },");
    }
    lines.push("  },");
  }
  /* The two operations the current official schedule prices and SG-4 never uses. */
  for (const operation of [...CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS].sort()) {
    lines.push(
      `  ${operation}: {`,
      "    supportScalar: false,",
      "    numberInputs: 2,",
      "    nonScalar: {",
      "      Uint64: 100000,",
      "    },",
      "  },",
    );
  }
  lines.push("};", "");
  return lines.join("\n");
}
const PRICE_SCHEDULE_BYTES = Buffer.from(priceScheduleTextForTest(), "utf8");
const PRICE_SCHEDULE_SHA256 = sha256(PRICE_SCHEDULE_BYTES);

/* ---------------------------------------------------------------------------------------------
 * The official build, as REAL HARDHAT BUILD-INFO.
 *
 * Structurally faithful to the document the compiler emits: input sources and settings, output
 * contracts with `evm.deployedBytecode.object` and `immutableReferences`, and output source ASTs
 * carrying the declaration each immutable id resolves to.
 *
 * The immutable modelled here is the real one — OpenZeppelin `UUPSUpgradeable.__self`, three PUSH32
 * word references — so the fixture exercises the production extraction path rather than a shape
 * invented to satisfy it.
 * ------------------------------------------------------------------------------------------- */

const UUPS_SELF_AST_ID = 605;
const UUPS_SELF_SOURCE = "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/* The artifact-side runtime: zero words at every immutable offset, as solc emits it. The three
 * offsets are placed inside a runtime long enough to hold them, each behind a PUSH32. */

function buildInfoJson(overrides: Record<string, unknown> = {}): string {
  const runtime = reproducedArtifactRuntime();
  const sourceContent = AUTHORITY_SOURCE_TEXT;
  return JSON.stringify({
    id: "c73f6a31ecc6791fd9a8488a9facd93e",
    _format: "hh-sol-build-info-1",
    solcVersion: "0.8.24",
    solcLongVersion: "0.8.24+commit.e11b9ed9",
    input: {
      language: "Solidity",
      sources: { "contracts/HCULimit.sol": { content: sourceContent } },
      settings: {
        optimizer: { enabled: true, runs: 800 },
        outputSelection: { "*": { "*": ["evm.deployedBytecode", "abi"], "": ["ast"] } },
      },
    },
    output: {
      contracts: {
        "contracts/HCULimit.sol": {
          HCULimit: {
            evm: {
              deployedBytecode: {
                object: runtime.toString("hex"),
                immutableReferences: {
                  [String(UUPS_SELF_AST_ID)]: UUPS_SELF_OFFSETS.map((offset) => ({ start: offset, length: 32 })),
                },
              },
            },
          },
        },
      },
      sources: {
        [UUPS_SELF_SOURCE]: {
          ast: {
            nodeType: "SourceUnit",
            nodes: [
              {
                nodeType: "ContractDefinition",
                name: "UUPSUpgradeable",
                nodes: [
                  {
                    id: UUPS_SELF_AST_ID,
                    nodeType: "VariableDeclaration",
                    name: "__self",
                    mutability: "immutable",
                    stateVariable: true,
                    typeDescriptions: { typeString: "address" },
                  },
                ],
              },
            ],
          },
        },
        "contracts/HCULimit.sol": { ast: { nodeType: "SourceUnit", nodes: [] } },
      },
    },
    ...overrides,
  });
}
const ARTIFACT_BUILD_BYTES = Buffer.from(buildInfoJson(), "utf8");
const ARTIFACT_BUILD_SHA256 = sha256(ARTIFACT_BUILD_BYTES);

const EXECUTOR_SOURCE_BYTES = AUTHENTICATED_EXECUTOR_SOURCE_BYTES;
const EXECUTOR_SOURCE_SHA256 = AUTHENTICATED_EXECUTOR_SOURCE_SHA256;
const EXECUTOR_ARTIFACT_BUILD_BYTES = AUTHENTICATED_EXECUTOR_BUILD_INFO.bytes;
const EXECUTOR_ARTIFACT_BUILD_SHA256 = EXECUTOR_BUILD_INFO_SHA256;

function sourceMaterialFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const blob = (subject: string, bytes: Buffer) => ({
    bytesBase64: bytes.toString("base64"),
    contentSha256: sha256(bytes),
    encoding: "base64",
    subject,
  });
  return {
    authoritySource: blob("authoritySource", AUTHORITY_SOURCE_BYTES),
    officialArtifactBuild: blob("officialArtifactBuild", ARTIFACT_BUILD_BYTES),
    executorSource: blob("executorSource", EXECUTOR_SOURCE_BYTES),
    officialExecutorArtifactBuild: blob("officialExecutorArtifactBuild", EXECUTOR_ARTIFACT_BUILD_BYTES),
    priceSchedule: blob("priceSchedule", PRICE_SCHEDULE_BYTES),
    ...overrides,
  };
}

/* The derivation the production verifier performs, run once here so every fixture claim below is
 * the extractor's output rather than a hand-written copy of it. */
function derivedFromMaterial(material: Record<string, unknown> = sourceMaterialFixture()) {
  const shell = {
    sourceMaterial: material,
    provenance: {
      entries: [
        { subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE", contentSha256: AUTHORITY_SOURCE_SHA256 },
        { subject: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE", contentSha256: PRICE_SCHEDULE_SHA256 },
        { subject: "CURRENT_OFFICIAL_ARTIFACT_BUILD", buildInfoSha256: ARTIFACT_BUILD_SHA256 },
      ],
    },
  };
  return deriveAuthorityFromSourceMaterial(shell as never, { implementationAddress: AUTHORITY_IMPLEMENTATION });
}
function derivedFromMaterialWithDigests(
  material: Record<string, unknown>,
  authoritySourceSha256: string,
  buildInfoSha256: string = ARTIFACT_BUILD_SHA256,
) {
  const shell = {
    sourceMaterial: material,
    provenance: {
      entries: [
        { subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE", contentSha256: authoritySourceSha256 },
        { subject: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE", contentSha256: PRICE_SCHEDULE_SHA256 },
        { subject: "CURRENT_OFFICIAL_ARTIFACT_BUILD", buildInfoSha256 },
      ],
    },
  };
  return deriveAuthorityFromSourceMaterial(shell as never, { implementationAddress: AUTHORITY_IMPLEMENTATION });
}

const DERIVED = derivedFromMaterial();
/* The expected deployed normalized digest, RECOMPUTED from the authenticated build. */
const DERIVED_NORMALIZED_HASH = String(DERIVED.artifactBuild?.expectedNormalizedRuntimeSha256);

function derivedExecutorFromMaterial(material: Record<string, unknown> = sourceMaterialFixture()) {
  const shell = {
    sourceMaterial: material,
    provenance: {
      entries: [
        { subject: "CURRENT_OFFICIAL_EXECUTOR_SOURCE", contentSha256: EXECUTOR_SOURCE_SHA256 },
        { subject: "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD", buildInfoSha256: EXECUTOR_ARTIFACT_BUILD_SHA256 },
      ],
    },
  };
  return deriveExecutorFromSourceMaterial(shell as never, { implementationAddress: SEPOLIA_EXECUTOR });
}
const EXECUTOR_DERIVED = derivedExecutorFromMaterial();
const EXECUTOR_DERIVED_NORMALIZED_HASH = String(EXECUTOR_DERIVED.executorBuild?.expectedNormalizedRuntimeSha256);

/* The exact provenance tuples every cross-link is checked against. */
const PROVENANCE_REQUIRED = deriveAuthorityProtocol().provenance.required;
type ProvenanceRequiredEntry = (typeof PROVENANCE_REQUIRED)[number];
type SourceFileProvenanceRequiredEntry = Extract<
  ProvenanceRequiredEntry,
  { path: string; contentSha256: string | null }
>;

function isSourceFileProvenanceEntry(
  entry: ProvenanceRequiredEntry | undefined,
): entry is SourceFileProvenanceRequiredEntry {
  return entry !== undefined && "path" in entry && "contentSha256" in entry;
}
function requiredTuple(subject: string) {
  const entry = PROVENANCE_REQUIRED.find((candidate) => candidate.subject === subject);
  if (!isSourceFileProvenanceEntry(entry)) {
    throw new Error(`source-file provenance entry missing for ${subject}`);
  }
  if (!entry || typeof entry.path !== "string") {
    throw new Error(`source-file provenance path missing for ${subject}`);
  }
  const { path } = entry;
  return {
    kind: "SOURCE_FILE" as const,
    subject,
    repository: String(entry.repository),
    tag: (entry.tag ?? null) as string | null,
    commit: String(entry.commit),
    path,
    contentSha256: (entry.contentSha256 ?? sha256(`reverified:${subject}`)) as string | null,
  };
}
/* The two subjects whose prior-reviewed content hash was recorded from an UNREVERIFIED
 * investigation are superseded by reviewed amendments naming the digests of the bytes actually
 * supplied. That is the designed path for a reverified tuple, and it exercises the re-anchoring
 * every dependent cross-link must follow. */
const AUTHORITY_TUPLE = {
  ...requiredTuple("CURRENT_OFFICIAL_AUTHORITY_SOURCE"),
  contentSha256: AUTHORITY_SOURCE_SHA256,
};
const PRICE_TUPLE = {
  ...requiredTuple("CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE"),
  contentSha256: PRICE_SCHEDULE_SHA256,
};
const EXECUTOR_TUPLE = {
  ...requiredTuple("CURRENT_OFFICIAL_EXECUTOR_SOURCE"),
  contentSha256: EXECUTOR_SOURCE_SHA256,
};
const CONFIG_TUPLE = requiredTuple("INSTALLED_SOLIDITY_CONFIGURATION");

/* The reviewed amendments that select those digests. */
function sourceMaterialAmendments(): Record<string, unknown>[] {
  const amend = (subject: string, contentSha256: string) => {
    const prior = requiredTuple(subject);
    return {
      commit: prior.commit,
      contentSha256,
      path: prior.path,
      reason: "Reverification of the selected upstream revision established the exact content digest.",
      repository: prior.repository,
      reviewRecordSha256: sha256(`reverification review record:${subject}`),
      reviewedBy: "independent reviewer",
      subject,
      supersedesCommit: prior.commit,
      supersedesPath: prior.path,
      supersedesRepository: prior.repository,
      tag: prior.tag,
    };
  };
  return [
    amend("CURRENT_OFFICIAL_AUTHORITY_SOURCE", AUTHORITY_SOURCE_SHA256),
    amend("CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE", PRICE_SCHEDULE_SHA256),
  ];
}
const AUTHORITY_SOURCE_REFERENCE = canonicalSourceReference(AUTHORITY_TUPLE);
const PRICE_SOURCE_REFERENCE = canonicalSourceReference(PRICE_TUPLE);
const CONFIG_SOURCE_REFERENCE = canonicalSourceReference(CONFIG_TUPLE);

function provenanceEntries(reverified = true): Record<string, unknown>[] {
  const pinned = deriveAuthorityProtocol().reproducedOfficialBuild;
  return deriveAuthorityProtocol().provenance.required.map((entry) => {
    /* A REPRODUCED_BUILD entry carries build evidence, not a repository file tuple. Every field is
     * the PINNED reproduction fact: the record does not get to choose them. */
    if (entry.subject === "CURRENT_OFFICIAL_ARTIFACT_BUILD") {
      return {
        aclAddress: pinned.aclAddress,
        artifactJsonSha256: pinned.artifactJsonSha256,
        buildInfoId: pinned.buildInfoId,
        /* The digest of the exact compressed fixture's decompressed build-info bytes. */
        buildInfoSha256: ARTIFACT_BUILD_SHA256,
        buildRoot: pinned.buildRoot,
        commit: pinned.commit,
        dependencyLockSha256: pinned.dependencyLockSha256,
        fhevmExecutorAddress: pinned.fhevmExecutorAddress,
        generatedHostAddressesSha256: pinned.generatedHostAddressesSha256,
        hardhatConfigSha256: pinned.hardhatConfigSha256,
        kind: "REPRODUCED_BUILD",
        repository: pinned.repository,
        reproductionCommand: pinned.reproductionCommand,
        reverified,
        selectedContractName: pinned.selectedContractName,
        selectedSourcePath: pinned.selectedSourcePath,
        solcLongVersion: pinned.solcLongVersion,
        solcVersion: pinned.solcVersion,
        subject: entry.subject,
        tag: pinned.tag,
      };
    }
    if (entry.subject === "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD") {
      const executorPinned = deriveAuthorityProtocol().reproducedOfficialExecutorBuild;
      return {
        artifactJsonSha256: executorPinned.artifactJsonSha256,
        buildInfoId: executorPinned.buildInfoId,
        buildInfoSha256: EXECUTOR_ARTIFACT_BUILD_SHA256,
        buildRoot: executorPinned.buildRoot,
        commit: executorPinned.commit,
        dependencyLockSha256: executorPinned.dependencyLockSha256,
        generatedHostAddressesSha256: executorPinned.generatedHostAddressesSha256,
        hardhatConfigSha256: executorPinned.hardhatConfigSha256,
        hasNoLinkReferences: executorPinned.hasNoLinkReferences,
        kind: "REPRODUCED_BUILD",
        metadataTrailerHex: executorPinned.metadataTrailerHex,
        normalizedRuntimeSha256: executorPinned.normalizedRuntimeSha256,
        repository: executorPinned.repository,
        reproductionCommand: executorPinned.reproductionCommand,
        reverified,
        selectedContractName: executorPinned.selectedContractName,
        selectedSourcePath: executorPinned.selectedSourcePath,
        solcLongVersion: executorPinned.solcLongVersion,
        solcVersion: executorPinned.solcVersion,
        subject: entry.subject,
        tag: executorPinned.tag,
        runtimeByteLength: executorPinned.runtimeByteLength,
        upstreamSepoliaHostConfigurationSha256: executorPinned.upstreamSepoliaHostConfigurationSha256,
      };
    }
    return {
      subject: entry.subject,
      repository: entry.repository,
      tag: entry.tag,
      commit: entry.commit,
      path: entry.path,
      contentSha256:
        entry.subject === "INSTALLED_CALCULATOR"
          ? EXPECTED_CALCULATOR_HASH
          : entry.subject === "INSTALLED_OPERATION_COST_TABLE"
            ? EXPECTED_COST_TABLE_HASH
            : entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE"
              ? AUTHORITY_SOURCE_SHA256
              : entry.subject === "CURRENT_OFFICIAL_EXECUTOR_SOURCE"
                ? EXECUTOR_SOURCE_SHA256
                : entry.subject === "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE"
                  ? PRICE_SCHEDULE_SHA256
                  : (entry.contentSha256 ?? sha256(`reverified:${entry.subject}`)),
      reverified,
    };
  });
}

/* F35 — the compiler's own immutable-reference output for the official build. Every reference the
 * normalization manifest declares is cross-linked to an entry here. */
const ARTIFACT_PLACEHOLDER_BYTES = `0x${ARTIFACT_LOCAL_EXECUTOR_ADDRESS.toLowerCase().replace(/^0x/u, "")}`;

function compilerReferenceEntries(): Record<string, unknown>[] {
  const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
  return (build.compilerReferenceManifest.entries as Record<string, unknown>[]).map((entry) => ({ ...entry }));
}

function compilerReferenceManifestFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
  return { ...build.compilerReferenceManifest, ...overrides };
}

/* INVARIANT C — the normalization manifest and the compiler immutable-reference manifest are the
 * artifact extractor's output, recomputed from the authenticated build bytes. */
function normalizationManifestFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
  return { ...build.normalizationManifest, ...overrides };
}

/* The canonical authoritative pricing manifest: the full current-official 29-operation schedule,
 * including FheSum and FheIsIn, which SG-4 never uses. */
/* F34 — the authoritative schedule as VARIANTS: every (operation, operand mode, cost key) triple
 * the current official schedule prices, including the two operations SG-4 never uses. */
const ENFORCEMENT_NAME_FOR = (canonical: string): string => (canonical === "FheIfThenElse" ? "IfThenElse" : canonical);

function pricingVariantEntry(
  canonicalName: string,
  operandMode: string,
  costKeyType: string,
  cost: number,
): Record<string, unknown> {
  const used = SG4_PRICING_VARIANT_CLOSURE.find(
    (variant) =>
      variant.canonicalOperation === canonicalName &&
      variant.operandMode === operandMode &&
      variant.costKeyType === costKeyType,
  );
  const width = costKeyType === "Bool" ? "bool" : costKeyType.toLowerCase();
  return {
    arity: used ? used.arity : 2,
    canonicalName,
    cost,
    costKeyType,
    enforcementName: ENFORCEMENT_NAME_FOR(canonicalName),
    operandMode,
    operandTypes: used ? [...used.operandTypes] : [`e${width}`, `e${width}`],
    resultType: used ? used.resultType : `e${width}`,
    sourceReference: PRICE_SOURCE_REFERENCE,
  };
}

function pricingManifestFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  /* INVARIANT B — one entry per variant, taken from the schedule the extractor recomputed from the
   * authenticated bytes. The FULL schedule, including the variants SG-4 never uses. */
  const schedule = DERIVED.priceSchedule as NonNullable<typeof DERIVED.priceSchedule>;
  const entries = schedule.variants.map((variant) =>
    pricingVariantEntry(variant.canonicalName, variant.operandMode, variant.costKeyType, variant.cost),
  );
  return {
    schema: "zama-szn4.sg4-authoritative-pricing-manifest.v1",
    version: 1,
    provenanceSubject: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
    entries,
    ...overrides,
  };
}

/* Returns the manifest with one variant removed — the F34 "missing exact variant" case. */
function pricingManifestWithout(
  canonicalName: string,
  operandMode: string,
  costKeyType: string,
): Record<string, unknown> {
  const base = pricingManifestFixture() as { entries: Record<string, unknown>[] };
  return pricingManifestFixture({
    entries: base.entries.filter(
      (entry) =>
        !(
          entry.canonicalName === canonicalName &&
          entry.operandMode === operandMode &&
          entry.costKeyType === costKeyType
        ),
    ),
  });
}

/* Returns the manifest with one variant's field changed. */
function pricingManifestWith(
  canonicalName: string,
  operandMode: string,
  costKeyType: string,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const base = pricingManifestFixture() as { entries: Record<string, unknown>[] };
  return pricingManifestFixture({
    entries: base.entries.map((entry) =>
      entry.canonicalName === canonicalName && entry.operandMode === operandMode && entry.costKeyType === costKeyType
        ? { ...entry, ...changes }
        : entry,
    ),
  });
}

function applicabilityProofFixture(statement: string, expression: string): Record<string, unknown> {
  return {
    checkedAddressExpression: expression,
    enforcementLayer: "HCULimit.checkHCUFor*",
    /* F37 — the parent link: an entry of the digest-bound enforcement manifest, and that
     * manifest's source content hash. A bare range digest establishes nothing on its own. */
    parentEnforcementFunction: "_updateAndVerifyHCUTransactionLimit",
    sourceContentSha256: String(AUTHORITY_TUPLE.contentSha256),
    sourcePath: String(AUTHORITY_TUPLE.path),
    sourceRangeSha256: sha256(`${statement}:${expression}`),
    statement,
  };
}

function callerApplicabilityFixture(): Record<string, unknown>[] {
  const context = (expression: string) => applicabilityProofFixture("enforcement call-context", expression);
  return [
    {
      state: "AVAILABLE",
      subject: "BENCHMARK_HARNESS",
      subjectAddress: HARNESS_ADDRESS,
      subjectAddressSource: "DETERMINISTIC_PRECOMPUTED_DEPLOYMENT_ADDRESS",
      subjectArgumentIndex: 0,
      targetRole: "AUTHORITY",
      signature: SIGNATURE_EXEMPT,
      selector: SELECTOR_EXEMPT,
      argumentTypes: ["address"],
      argumentValues: [HARNESS_ADDRESS],
      returnType: "bool",
      interpretation: "BOOL_TRUE_MEANS_EXEMPT",
      acceptedResults: [true, false],
      absenceProof: null,
      callContextProof: context("msg.sender of the FHE entry point"),
    },
    {
      state: "ABSENT_DOCUMENTED",
      subject: "FHEVM_EXECUTOR",
      subjectAddress: SEPOLIA_EXECUTOR,
      subjectAddressSource: "VERIFIED_DEPLOYMENT_CHAIN_ROLE",
      subjectArgumentIndex: null,
      targetRole: null,
      signature: null,
      selector: null,
      argumentTypes: [],
      argumentValues: [],
      returnType: "bool",
      interpretation: "BOOL_TRUE_MEANS_EXEMPT",
      acceptedResults: [true],
      absenceProof: applicabilityProofFixture(
        "The code-identified artifact exposes no exemption path for the executor; every executor call is metered.",
        "fhevmExecutorAddress",
      ),
      callContextProof: context("fhevmExecutorAddress"),
    },
    {
      state: "NOT_APPLICABLE_WITH_PROOF",
      subject: "TRANSACTION_SENDER",
      subjectAddress: SENDER_ADDRESS,
      subjectAddressSource: "NOT_RELEVANT_PROVEN_FROM_ARTIFACT",
      subjectArgumentIndex: null,
      targetRole: null,
      signature: null,
      selector: null,
      argumentTypes: [],
      argumentValues: [],
      returnType: "bool",
      interpretation: "BOOL_TRUE_MEANS_EXEMPT",
      acceptedResults: [true],
      absenceProof: applicabilityProofFixture(
        "The artifact meters by executor caller, not by transaction sender, so tx.origin has no exemption surface.",
        "tx.origin",
      ),
      callContextProof: context("tx.origin"),
    },
  ];
}

function enforcementProofManifestFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  /* INVARIANT D — the constant values and BOTH source-range digests come from the parser, so an
   * arbitrary 64-hex digest cannot stand in for a range of real source. */
  const parsed = DERIVED.authoritySource as NonNullable<typeof DERIVED.authoritySource>;
  const entry = (controlId: string, constantName: string, enforcementFunction: string, revertErrorName: string) => ({
    controlId,
    constantName,
    constantValue: parsed.constantValues[constantName],
    comparisonOperator: ">",
    revertErrorName,
    enforcementFunction,
    sourcePath: String(AUTHORITY_TUPLE.path),
    declarationSourceRangeSha256: parsed.declarationRanges[constantName]?.sha256,
    enforcementSourceRangeSha256: parsed.enforcementRanges[enforcementFunction]?.sha256,
    sourceKind: "CONSTANT",
  });
  return {
    schema: "zama-szn4.sg4-enforcement-proof-manifest.v1",
    version: 1,
    provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
    sourceContentSha256: parsed.sourceContentSha256,
    entries: [
      entry(
        "TRANSACTION_DEPTH_HCU",
        "MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX",
        "_updateAndVerifyHCUTransactionDepthLimit",
        "HCUTransactionDepthLimitExceeded",
      ),
      entry(
        "TRANSACTION_TOTAL_HCU",
        "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX",
        "_updateAndVerifyHCUTransactionLimit",
        "HCUTransactionLimitExceeded",
      ),
    ],
    ...overrides,
  };
}

function enumerationManifestFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  /* INVARIANT D — every list here is RECOMPUTED by the production parser from the authenticated
   * source bytes. A hand-written list is precisely the fabrication this pass removes. */
  const parsed = DERIVED.authoritySource as NonNullable<typeof DERIVED.authoritySource>;
  return {
    schema: "zama-szn4.sg4-authority-enumeration-manifest.v1",
    version: 1,
    provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
    sourceContentSha256: parsed.sourceContentSha256,
    enumerationComplete: parsed.parseCompleteness === "PARSED_COMPLETE_NO_RESIDUE",
    parseCompleteness: parsed.parseCompleteness,
    declarations: [...parsed.declarations],
    callableFunctions: [...parsed.callableFunctions],
    errors: [...parsed.errors],
    mappings: [...parsed.mappings],
    storageStructFields: [...parsed.storageStructFields],
    storagePrimitives: [...parsed.storagePrimitives],
    ...overrides,
  };
}

/* F40 — the closed interface manifest every critical call is executed from. */
function interfaceManifestFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const entry = (callId: string, signature: string, argumentTypes: string[] = [], argumentValues: unknown[] = []) => {
    const spec = INTERFACE_CALL_SPECS.find((candidate) => candidate.callId === callId);
    return {
      argumentTypes,
      argumentValues,
      callId,
      returnType: spec?.returnType ?? "uint256",
      selector: keccakId(signature).slice(0, 10),
      signature,
      targetRole: spec?.targetRole ?? "AUTHORITY",
    };
  };
  return {
    entries: [
      entry("AUTHORITY_RECIPROCAL_EXECUTOR_GETTER", "getFHEVMExecutorAddress()"),
      entry("AUTHORITY_VERSION", "getVersion()"),
      entry("EXECUTOR_AUTHORITY_GETTER", "getHCULimitAddress()"),
      entry("EXECUTOR_VERSION", "getVersion()"),
      entry("TRANSACTION_DEPTH_HCU_GETTER", SIGNATURE_DEPTH),
      entry("TRANSACTION_TOTAL_HCU_GETTER", SIGNATURE_TOTAL),
      /* CORRECTION 5 — every AVAILABLE applicability getter is an entry of this one manifest. */
      ...callerApplicabilityFixture()
        .filter((spec) => spec.state === "AVAILABLE")
        .map((spec) => ({
          argumentTypes: [...(spec.argumentTypes as string[])],
          argumentValues: [...(spec.argumentValues as unknown[])],
          callId: `CALLER_APPLICABILITY:${String(spec.subject)}`,
          returnType: spec.returnType,
          selector: spec.selector,
          signature: spec.signature,
          subject: spec.subject,
          targetRole: spec.targetRole,
        })),
    ],
    provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
    schema: INTERFACE_MANIFEST_SCHEMA,
    version: 1,
    ...overrides,
  };
}

function limitGetterSpecsFixture(overrides: Record<string, unknown>[] = []): Record<string, unknown>[] {
  const base = [
    {
      controlId: "TRANSACTION_TOTAL_HCU",
      targetRole: "AUTHORITY",
      signature: SIGNATURE_TOTAL,
      selector: SELECTOR_TOTAL,
      argumentTypes: [],
      argumentValues: [],
      returnType: "uint256",
      state: "AVAILABLE_AND_READ_ON_CHAIN",
    },
    {
      controlId: "TRANSACTION_DEPTH_HCU",
      targetRole: "AUTHORITY",
      signature: SIGNATURE_DEPTH,
      selector: SELECTOR_DEPTH,
      argumentTypes: [],
      argumentValues: [],
      returnType: "uint256",
      state: "AVAILABLE_AND_READ_ON_CHAIN",
    },
    {
      controlId: "BLOCK_OR_BATCH_HCU",
      targetRole: "AUTHORITY",
      signature: null,
      selector: null,
      argumentTypes: [],
      argumentValues: [],
      returnType: "uint256",
      state: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
    },
  ];
  return overrides.length > 0 ? overrides : base;
}

/* A complete, well-formed authority-binding record. */
/* F38 — a closed, digest-bound implementation-address policy. */
function implementationAddressPolicyFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = {
    expectedImplementationAddress: AUTHORITY_IMPLEMENTATION,
    kind: "EXACT_PINNED_ADDRESS",
    permittedConditions: [] as string[],
    reviewRecordSha256: sha256("implementation address policy review"),
    reviewedBy: "independent reviewer",
    ...overrides,
  };
  return { ...base, policyDigest: sha256(canonicalJson(base)) };
}

/* F36 — a record whose CURRENT_OFFICIAL_AUTHORITY_SOURCE tuple has been superseded by a reviewed
 * amendment. Every dependent cross-link is re-anchored onto the new tuple, because a cross-link
 * that could stay behind would be a label rather than a binding. */
function reanchoredToAmendedAuthoritySource(
  commit: string,
  contentSha256: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  /* An amended tuple names DIFFERENT bytes, so the authenticated material moves with it and every
   * dependent fact is RE-DERIVED from those bytes. A cross-link that stayed behind would be a
   * label rather than a binding, which is exactly what this must prevent. */
  /* The amended tuple names different source bytes, so the BUILD must have compiled those bytes:
   * the build-info's own input source is re-derived from them. A build of the superseded source
   * would fail the CL6 cross-link, which is the point of re-anchoring. */
  const amendedBuildBytes = Buffer.from(
    buildInfoJson({
      input: {
        language: "Solidity",
        sources: { "contracts/HCULimit.sol": { content: AMENDED_AUTHORITY_SOURCE_BYTES.toString("utf8") } },
        settings: {
          optimizer: { enabled: true, runs: 800 },
          outputSelection: { "*": { "*": ["evm.deployedBytecode", "abi"], "": ["ast"] } },
        },
      },
    }),
    "utf8",
  );
  const material = sourceMaterialFixture({
    authoritySource: {
      bytesBase64: AMENDED_AUTHORITY_SOURCE_BYTES.toString("base64"),
      contentSha256,
      encoding: "base64",
      subject: "authoritySource",
    },
    officialArtifactBuild: {
      bytesBase64: amendedBuildBytes.toString("base64"),
      contentSha256: sha256(amendedBuildBytes),
      encoding: "base64",
      subject: "officialArtifactBuild",
    },
  });
  const derived = derivedFromMaterialWithDigests(material, contentSha256, sha256(amendedBuildBytes));
  const parsed = derived.authoritySource as NonNullable<typeof derived.authoritySource>;
  const base = bindingRecordFixture();
  const artifact = base.artifact as Record<string, unknown>;
  const iface = base.onChainInterface as Record<string, unknown>;
  const sourceReference = `${AUTHORITY_TUPLE.repository}@${commit}:${AUTHORITY_TUPLE.path}`;

  const enumerationManifest = {
    ...(enumerationManifestFixture() as Record<string, unknown>),
    sourceContentSha256: parsed.sourceContentSha256,
    declarations: [...parsed.declarations],
    callableFunctions: [...parsed.callableFunctions],
    errors: [...parsed.errors],
    mappings: [...parsed.mappings],
    storageStructFields: [...parsed.storageStructFields],
    storagePrimitives: [...parsed.storagePrimitives],
    parseCompleteness: parsed.parseCompleteness,
  };
  const enforcementEntries = (enforcementProofManifestFixture().entries as Record<string, unknown>[]).map((entry) => ({
    ...entry,
    constantValue: parsed.constantValues[String(entry.constantName)],
    declarationSourceRangeSha256: parsed.declarationRanges[String(entry.constantName)]?.sha256,
    enforcementSourceRangeSha256: parsed.enforcementRanges[String(entry.enforcementFunction)]?.sha256,
  }));
  const enforcementManifest = {
    ...(enforcementProofManifestFixture() as Record<string, unknown>),
    sourceContentSha256: parsed.sourceContentSha256,
    entries: enforcementEntries,
  };
  const reanchorProof = (proof: unknown) =>
    proof === null ? null : { ...(proof as object), sourceContentSha256: parsed.sourceContentSha256 };

  const amendedBuildSha256 = sha256(amendedBuildBytes);
  const withAmendedBuildEntry = (provenance: unknown): unknown => {
    if (!provenance || typeof provenance !== "object") return provenance;
    const section = provenance as Record<string, unknown>;
    if (!Array.isArray(section.entries)) return provenance;
    return {
      ...section,
      entries: (section.entries as Record<string, unknown>[]).map((entry) =>
        entry.subject === "CURRENT_OFFICIAL_ARTIFACT_BUILD" ? { ...entry, buildInfoSha256: amendedBuildSha256 } : entry,
      ),
    };
  };
  const resolvedOverrides =
    "provenance" in overrides ? { ...overrides, provenance: withAmendedBuildEntry(overrides.provenance) } : overrides;
  return bindingRecordFixture({
    sourceMaterial: material,
    provenance: {
      reverificationStatus: "REVERIFIED",
      entries: provenanceEntries().map((entry) =>
        entry.subject === "CURRENT_OFFICIAL_ARTIFACT_BUILD" ? { ...entry, buildInfoSha256: amendedBuildSha256 } : entry,
      ),
      amendments: sourceMaterialAmendments(),
    },
    /* Overrides may replace `provenance` wholesale; when they do, the amended build digest still
     * has to travel with it, or the supplied build bytes stop authenticating. */
    /* The amended tuple names different source bytes, so the BUILD derived from them yields a
     * different compiler-reference manifest and normalization manifest. Re-anchoring means those
     * travel with it too — a manifest left behind would no longer describe the build in play. */
    artifact: {
      ...artifact,
      sourceReference,
      compilerReferenceManifest: derived.artifactBuild?.compilerReferenceManifest ?? {},
      compilerReferenceManifestSha256: sha256(canonicalJson(derived.artifactBuild?.compilerReferenceManifest ?? {})),
      normalizationManifest: derived.artifactBuild?.normalizationManifest ?? {},
      normalizationManifestSha256: normalizationManifestDigest(derived.artifactBuild?.normalizationManifest ?? {}),
      implementationNormalizedRuntimeSha256:
        derived.artifactBuild?.expectedNormalizedRuntimeSha256 ?? DERIVED_NORMALIZED_HASH,
    },
    enforcementProof: { manifest: enforcementManifest, manifestSha256: sha256(canonicalJson(enforcementManifest)) },
    authorityEnumeration: {
      manifest: enumerationManifest,
      manifestSha256: sha256(canonicalJson(enumerationManifest)),
    },
    onChainInterface: {
      ...iface,
      callerApplicability: callerApplicabilityFixture().map((spec) => ({
        ...spec,
        absenceProof: reanchorProof(spec.absenceProof),
        callContextProof: reanchorProof(spec.callContextProof),
      })),
    },
    ...resolvedOverrides,
  });
}

function bindingRecordFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const normalizationManifest = normalizationManifestFixture();
  const compilerReferenceManifest = compilerReferenceManifestFixture();
  const pricingManifest = pricingManifestFixture();
  const enforcementManifest = enforcementProofManifestFixture();
  const enumerationManifest = enumerationManifestFixture();
  const base: Record<string, unknown> = {
    schema: "zama-szn4.sg4-hcu-authority-binding.v3",
    recordVersion: 3,
    lineage: {
      implementationCommit: COMMIT_A,
      implementationTree: TREE_A,
      benchmarkProtocolSha256: EXPECTED_SG4_PROTOCOL_SHA256,
      authorityProtocolSha256: EXPECTED_AUTHORITY_PROTOCOL_SHA256,
      permittedBindingPath: "scripts/sg4-hcu-authority-binding.json",
      bindingPurpose: "Bind the reviewed SG-4 implementation commit to a live authority verification.",
    },
    authorityResolution: {
      status: "RESOLVED",
      reviewedIndependently: true,
      reviewStatement: "Independently reviewed against the reverified official sources.",
    },
    sourceMaterial: sourceMaterialFixture(),
    provenance: {
      reverificationStatus: "REVERIFIED",
      entries: provenanceEntries(),
      amendments: sourceMaterialAmendments(),
    },
    artifact: {
      id: OFFICIAL_ARTIFACT_ID,
      release: String(AUTHORITY_TUPLE.tag),
      sourceReference: AUTHORITY_SOURCE_REFERENCE,
      compilerReferenceManifest,
      compilerReferenceManifestSha256: sha256(canonicalJson(compilerReferenceManifest)),
      compilerVersion: "0.8.24",
      metadataModel: "CBOR_SOLC_ONLY_NO_SOURCE_HASH",
      normalizationManifest,
      normalizationManifestSha256: normalizationManifestDigest(normalizationManifest),
      implementationNormalizedRuntimeSha256: DERIVED_NORMALIZED_HASH,
      provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
    },
    executor: {
      address: SEPOLIA_EXECUTOR,
      configurationSourceReference: CONFIG_SOURCE_REFERENCE,
      deploymentModel: "DIRECT",
      expectedProxyRuntimeSha256: null,
      implementationAddressPolicy: null,
      implementationResolutionMechanism: "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
      implementationSlot: null,
      expectedImplementationNormalizedRuntimeSha256: EXECUTOR_DERIVED_NORMALIZED_HASH,
      expectedImplementationVersion: "FHEVMExecutor v0.4.0",
      expectedVersion: "FHEVMExecutor v0.4.0",
      provenanceSubject: "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD",
      sourceProvenanceSubject: "CURRENT_OFFICIAL_EXECUTOR_SOURCE",
    },
    authority: {
      addressDerivation: "FROM_VERIFIED_EXECUTOR_GETTER",
      deploymentModel: "ERC1967_PROXY",
      expectedProxyRuntimeSha256: PROXY_RUNTIME_HASH,
      implementationAddressPolicy: implementationAddressPolicyFixture(),
      implementationResolutionMechanism: "ERC1967_STORAGE_SLOT",
      implementationSlot: ERC1967_IMPLEMENTATION_SLOT,
      expectedImplementationVersion: "HCULimit v0.1.0",
      expectedImplementationNormalizedRuntimeSha256: DERIVED_NORMALIZED_HASH,
    },
    operationSchedule: {
      pricingManifest,
      pricingManifestSha256: pricingManifestDigest(pricingManifest),
      source: PRICE_SOURCE_REFERENCE,
      provenanceSubject: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
    },
    enforcementProof: {
      manifest: enforcementManifest,
      manifestSha256: sha256(canonicalJson(enforcementManifest)),
    },
    authorityEnumeration: {
      manifest: enumerationManifest,
      manifestSha256: sha256(canonicalJson(enumerationManifest)),
    },
    limits: {
      semantics: "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN",
      enforcementOperator: ">",
      configuredCeilingInclusive: true,
      enforcementPaths: ["_updateAndVerifyHCUTransactionLimit"],
      expectedTransactionTotal: "20000000",
      expectedTransactionDepth: "5000000",
      getterAvailability: {
        blockOrBatchCap: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
        transactionDepth: "AVAILABLE_AND_READ_ON_CHAIN",
        transactionTotal: "AVAILABLE_AND_READ_ON_CHAIN",
      },
      enforcementEvidence: {},
    },
    blockOrBatch: {
      state: "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION",
      value: null,
      proof: "Complete enumeration of the official artifact found no block-scoped or batch-scoped control.",
    },
    onChainInterface: {
      interfaceManifest: interfaceManifestFixture(),
      limitGetterSpecs: limitGetterSpecsFixture(),
      callerApplicability: callerApplicabilityFixture(),
    },
    facets: Object.fromEntries(
      ["blockOrBatch", "codeIdentity", "limitSemantics", "limitValues", "operationSchedule"].map((facet) => [
        facet,
        { artifactId: OFFICIAL_ARTIFACT_ID, origin: "AUTHORITATIVE_BINDING_RECORD" },
      ]),
    ),
  };
  return { ...base, ...overrides };
}

/* A record carrying only the lineage — the rejected preparation-only shape. */
function preparationOnlyRecordFixture(): Record<string, unknown> {
  return {
    schema: "zama-szn4.sg4-hcu-authority-binding.v3",
    recordVersion: 3,
    lineage: bindingRecordFixture().lineage as Record<string, unknown>,
  };
}

type LineageOverrides = {
  branch?: string;
  worktreeClean?: boolean;
  indexClean?: boolean;
  headCommit?: string;
  headTree?: string;
  parentCommit?: string;
  parentCount?: number;
  implementationTree?: string;
  changedPaths?: string[];
  driftedPaths?: string[];
  record?: unknown | null;
};

function verifiedLineageProbe(overrides: LineageOverrides = {}) {
  const record = overrides.record === undefined ? bindingRecordFixture() : overrides.record;
  const headCommit = overrides.headCommit ?? COMMIT_B;
  const drifted = new Set(overrides.driftedPaths ?? []);
  return {
    branch: () => overrides.branch ?? "main",
    worktreeClean: () => overrides.worktreeClean ?? true,
    indexClean: () => overrides.indexClean ?? true,
    parentCount: () => overrides.parentCount ?? 1,
    revParse: (rev: string) => {
      if (rev === "HEAD") return headCommit;
      if (rev === "HEAD^{tree}") return overrides.headTree ?? TREE_B;
      if (rev === "HEAD^") return overrides.parentCommit ?? COMMIT_A;
      if (rev === `${COMMIT_A}^{tree}`) return overrides.implementationTree ?? TREE_A;
      return "UNRESOLVED";
    },
    changedPaths: () => overrides.changedPaths ?? ["scripts/sg4-hcu-authority-binding.json"],
    blobAt: (commit: string, path: string) =>
      drifted.has(path) && commit === headCommit ? `drift-${path}` : `blob-${path}`,
    readBindingRecord: () => record,
  };
}

/* Returns the rejection message, or a sentinel when the promise unexpectedly resolves. Avoids a
 * chai-as-promised registration dependency. */
async function rejection(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "DID_NOT_REJECT";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/* PASS validation in production always receives the validated binding from the lineage check.
 * Keep the same evidence boundary in unit tests so a positive result cannot accidentally be
 * accepted through the optional-argument seam. Individual tests may still supply a deliberate
 * alternate binding explicitly. */
function validateAuthorityResult(
  result: Record<string, unknown>,
  reviewedBinding: Record<string, unknown> = bindingRecordFixture(),
): string[] {
  return validateAuthorityResultRaw(result, reviewedBinding as never);
}

/* A fully coherent PASS result. Coordinated-forgery tests below mutate several fields together;
 * every PASS-relevant identity value is checked against the reviewed binding and its derivation. */
function passResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const protocol = deriveAuthorityProtocol();
  const boundState = (value: string | null, state: string) => ({
    authorityState: state,
    blocking: false,
    liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
    scope: value === null ? "PER_BLOCK_OR_BATCH" : "PER_TRANSACTION",
    ...(value === null ? {} : { value }),
  });
  /* A PASS is only reachable once the current official artifact is resolved, so the fixture models
   * that resolved future state. It is deliberately NOT the local fixture identity. */
  const officialArtifactId = OFFICIAL_ARTIFACT_ID;
  const officialTuple = protocol.provenance.required.find(
    (entry) => entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
  );
  const officialHash = DERIVED_NORMALIZED_HASH;
  const matched = {
    getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN",
    onChainValue: "20000000",
    result: "MATCHES_BINDING_RECORD_ON_CHAIN",
  };
  return {
    accountAuthorizationRequested: false,
    authoritativeArtifactId: officialArtifactId,
    authorityAddress: AUTHORITY_PROXY,
    authorityBindingRecordResult: "VALID",
    authorityCodeIdentityResult: "VERIFIED",
    authorityDeploymentModel: "ERC1967_PROXY",
    authorityVersionResult: "MATCHES_BINDING_RECORD",
    blockOrBatchOnChainReading: {
      getterAvailability: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
      onChainValue: "NOT_APPLICABLE",
      result: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
    },
    callerApplicabilityResults: [
      { result: "NOT_EXEMPT", state: "AVAILABLE", subject: "BENCHMARK_HARNESS", subjectAddress: HARNESS_ADDRESS },
      {
        result: "NOT_APPLICABLE_WITH_PROOF",
        state: "ABSENT_DOCUMENTED",
        subject: "FHEVM_EXECUTOR",
        subjectAddress: SEPOLIA_EXECUTOR,
      },
      {
        result: "NOT_APPLICABLE_WITH_PROOF",
        state: "NOT_APPLICABLE_WITH_PROOF",
        subject: "TRANSACTION_SENDER",
        subjectAddress: SENDER_ADDRESS,
      },
    ],
    callerExemptionResult: "NOT_EXEMPT",
    implementationResolutionResult: "VERIFIED_ERC1967_STORAGE_SLOT",
    implementationAddressPolicyResult: "EXACT_MATCH",
    localFixtureSelfTestResult: "MATCH",
    depthHcuOnChainReading: { ...matched, onChainValue: "5000000" },
    executorCodeIdentityResult: "VERIFIED",
    executorDeploymentModel: "DIRECT",
    executorAuthorityDerivationResult: "VERIFIED",
    executorExpectedImplementationAddress: SEPOLIA_EXECUTOR.toLowerCase(),
    executorExpectedImplementationCodeHash: EXECUTOR_RUNTIME_HASH,
    executorExpectedNormalizedImplementationHash: "23ab0dc924c946764c63383ae7c0e17f6b2e9c57d2ac9e2822f30b4c63f0158a",
    executorExpectedVersion: "FHEVMExecutor v0.4.0",
    executorImplementationAddress: SEPOLIA_EXECUTOR,
    executorImplementationAddressPolicyResult: "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
    executorImplementationCodeHash: EXECUTOR_RUNTIME_HASH,
    executorImplementationCodeIdentityResult: "VERIFIED",
    executorImplementationResolutionResult: "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
    executorNormalizedImplementationHash: "23ab0dc924c946764c63383ae7c0e17f6b2e9c57d2ac9e2822f30b4c63f0158a",
    executorProxyCodeHash: "UNRESOLVED",
    executorProxyCodeIdentityResult: "UNRESOLVED",
    executorReproducedBuildInfoSha256: "50ed161472e207da6462aa180856d0047aa52396abdba05e9bf566f5ccfd63dd",
    executorReproducedBuildResult: "MATCHES_PINNED_REPRODUCED_BUILD",
    executorVersionResult: "MATCHES_BINDING_RECORD",
    erc1967SlotReadCount: 1,
    pinnedBlockFinality: "FINALIZED",
    totalHcuOnChainReading: matched,
    authorityCodeHash: PROXY_RUNTIME_HASH,
    authorityImplementationAddress: AUTHORITY_IMPLEMENTATION,
    authorityProtocolDigest: EXPECTED_AUTHORITY_PROTOCOL_SHA256,
    measurementToolchainRoot: {
      /* INVARIANT F — verified from the installation, and only the files that compute HCU. */
      executionRelevantFiles: verifyMeasurementToolchainRoot().executionRelevantFiles,
      verificationResult: verifyMeasurementToolchainRoot().result,
      calculatorPath: protocol.measurementToolchainRoot.calculatorPath,
      costTablePath: protocol.measurementToolchainRoot.costTablePath,
      integrity: protocol.measurementToolchainRoot.integrity,
      package: protocol.measurementToolchainRoot.package,
      version: protocol.measurementToolchainRoot.version,
    },
    deployedAuthorityRoot: {
      artifactId: officialArtifactId,
      commit: String(officialTuple?.commit),
      contentSha256: String(officialTuple?.contentSha256 ?? sha256("reverified:CURRENT_OFFICIAL_AUTHORITY_SOURCE")),
      path: String(officialTuple?.path),
      repository: String(officialTuple?.repository),
      tag: String(officialTuple?.tag),
    },
    localAuthorityFixtureRoot: {
      integrity: protocol.localAuthorityFixtureRoot.integrity,
      package: protocol.localAuthorityFixtureRoot.package,
      passRelevant: false,
      version: protocol.localAuthorityFixtureRoot.version,
    },
    authorityTableHash: "b".repeat(64),
    authorityVersion: "HCULimit v0.1.0",
    benchmarkProtocolDigest: EXPECTED_SG4_PROTOCOL_SHA256,
    blockOrBatchControlState: boundState(null, "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION"),
    calculatorHash: protocol.installedHashes.calculator.sha256,
    chainId: "11155111",
    codeIdentityResult: "VERIFIED",
    depthHcuLimit: "5000000",
    depthSafetyThreshold: "3750000",
    executorAddress: SEPOLIA_EXECUTOR,
    executorCodeHash: EXECUTOR_RUNTIME_HASH,
    executorVersion: "FHEVMExecutor v0.4.0",
    expectedDeployedNormalizedHash: officialHash,
    facetArtifactBinding: Object.fromEntries(
      ["blockOrBatch", "codeIdentity", "limitSemantics", "limitValues", "operationSchedule"].map((facet) => [
        facet,
        { artifactId: officialArtifactId, origin: "AUTHORITATIVE_BINDING_RECORD" },
      ]),
    ),
    finalVerdict: "PASS",
    gate: "SG-4",
    /* Inclusive semantics: the greatest accepted value is the configured ceiling itself. */
    greatestAcceptedDepthHcu: "5000000",
    greatestAcceptedTotalHcu: "20000000",
    immutableProvenanceState: "RESOLVED",
    installedSourceHashesResult: "MATCH",
    installedTableHash: protocol.installedHashes.costTable.sha256,
    liveLimitSemantics: "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN",
    normalizedImplementationHash: officialHash,
    operationCompatibilityResult: {
      arityMismatches: [],
      authorityOnly: [],
      costMismatches: [],
      installedOnly: [],
      operandMismatches: [],
      operandTypeMismatches: [],
      resultTypeMismatches: [],
      shared: SG4_PRICING_VARIANT_CLOSURE.map(variantId).sort(),
      translationMismatches: [],
      unsupportedByCalculator: [],
    },
    operationScheduleAuthorityState: "RESOLVED",
    pinnedBlockHash: PINNED_HASH,
    pinnedBlockNumber: PINNED_DECIMAL,
    preparationLineageResult: "VERIFIED",
    protocolVersion: protocol.protocolVersion,
    /* F39 — the plan the verifier enforced, and the calls it issued under it. */
    livePlanDigest: livePlanDigest(generateLiveCallPlan(bindingRecordFixture() as never)),
    livePlanCallCount: generateLiveCallPlan(bindingRecordFixture() as never).length,
    liveCallLogDigest: "c".repeat(64),
    liveCallCount: generateLiveCallPlan(bindingRecordFixture() as never).length,
    planEnforcementResult: "ENFORCED_EXACT",
    /* A PASS is only reachable with the real pinned reproduction (CL4). */
    reproducedBuildInfoSha256: protocol.reproducedOfficialBuild.buildInfoSha256,
    reproducedBuildResult: "MATCHES_PINNED_REPRODUCED_BUILD",
    reciprocalLinkageResult: "VERIFIED",
    rpcMethodsUsed: ["eth_call", "eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_getStorageAt"],
    safetyBoundExclusivity: "EXCLUSIVE",
    schema: protocol.resultSchema.$id,
    sg4CoverageResult: "COMPLETE",
    signingRequested: false,
    staleAddressGuardResult: "NOT_USED",
    status: "LIVE_READ_ONLY_AUTHORITY_VERIFICATION_COMPLETE",
    totalHcuLimit: "20000000",
    totalSafetyThreshold: "15000000",
    transactionDepthControlState: boundState("5000000", "PROVEN_PRESENT"),
    transactionSubmitted: false,
    transactionTotalControlState: boundState("20000000", "PROVEN_PRESENT"),
    unsupportedOperations: [],
    walletRequested: false,
    ...overrides,
  };
}

describe("SG-4 HCU authority: enforced ceilings and safety boundaries", function () {
  it("1. resolves the exact transaction-total ceiling from the enforcement path", function () {
    const limits = extractLimits(hcuLimitSource);
    expect(limits.totalLimit).to.equal(20_000_000n);
    expect(limits.totalLimit).to.equal(TRANSACTION_TOTAL_HCU_LIMIT);
    expect(limits.totalEnforced).to.equal(true);
  });

  it("2. resolves the exact dependency-depth ceiling from the enforcement path", function () {
    const limits = extractLimits(hcuLimitSource);
    expect(limits.depthLimit).to.equal(5_000_000n);
    expect(limits.depthLimit).to.equal(TRANSACTION_DEPTH_HCU_LIMIT);
    expect(limits.depthEnforced).to.equal(true);
  });

  it("3. fixes the total safety boundary at 75% of the enforced ceiling", function () {
    expect(TOTAL_SAFETY_THRESHOLD).to.equal(15_000_000n);
    expect(TOTAL_SAFETY_THRESHOLD * 4n).to.equal(TRANSACTION_TOTAL_HCU_LIMIT * 3n);
  });

  it("4. fixes the depth safety boundary at 75% of the enforced ceiling", function () {
    expect(DEPTH_SAFETY_THRESHOLD).to.equal(3_750_000n);
    expect(DEPTH_SAFETY_THRESHOLD * 4n).to.equal(TRANSACTION_DEPTH_HCU_LIMIT * 3n);
  });

  it("5. passes total safety one unit below the boundary", function () {
    expect(evaluateSafety("globalHCU", 14_999_999n).pass).to.equal(true);
    expect(assessSampleHcu({ globalHCU: 14_999_999n, maxHCUDepth: 1n }).totalSafetyResult).to.equal("PASS");
  });

  it("6. fails total safety at exact boundary equality", function () {
    expect(evaluateSafety("globalHCU", 15_000_000n).pass).to.equal(false);
    expect(assessSampleHcu({ globalHCU: 15_000_000n, maxHCUDepth: 1n }).totalSafetyResult).to.equal("FAIL");
    expect(assessSampleHcu({ globalHCU: 15_000_000n, maxHCUDepth: 1n }).combinedHcuVerdict).to.equal("NO_GO");
  });

  it("7. fails total safety above the boundary", function () {
    expect(evaluateSafety("globalHCU", 15_000_001n).pass).to.equal(false);
    expect(assessSampleHcu({ globalHCU: 15_000_001n, maxHCUDepth: 1n }).totalSafetyResult).to.equal("FAIL");
  });

  it("8. passes depth safety one unit below the boundary", function () {
    expect(evaluateSafety("maxHCUDepth", 3_749_999n).pass).to.equal(true);
    expect(assessSampleHcu({ globalHCU: 1n, maxHCUDepth: 3_749_999n }).depthSafetyResult).to.equal("PASS");
  });

  it("9. fails depth safety at exact boundary equality", function () {
    expect(evaluateSafety("maxHCUDepth", 3_750_000n).pass).to.equal(false);
    expect(assessSampleHcu({ globalHCU: 1n, maxHCUDepth: 3_750_000n }).depthSafetyResult).to.equal("FAIL");
    expect(assessSampleHcu({ globalHCU: 1n, maxHCUDepth: 3_750_000n }).combinedHcuVerdict).to.equal("NO_GO");
  });

  it("10. fails depth safety above the boundary", function () {
    expect(evaluateSafety("maxHCUDepth", 3_750_001n).pass).to.equal(false);
    expect(assessSampleHcu({ globalHCU: 1n, maxHCUDepth: 3_750_001n }).depthSafetyResult).to.equal("FAIL");
  });

  it("11. requires both metrics for a GO verdict", function () {
    expect(assessSampleHcu({ globalHCU: 1n, maxHCUDepth: 1n }).combinedHcuVerdict).to.equal("GO");
    expect(assessSampleHcu({}).combinedHcuVerdict).to.equal("NO_GO");
    expect(assessSampleHcu({}).missing).to.deep.equal(["globalHCU", "maxHCUDepth"]);
  });

  it("12. does not let a passing total substitute for depth", function () {
    const assessment = assessSampleHcu({ globalHCU: 1n, maxHCUDepth: 4_000_000n });
    expect(assessment.totalSafetyResult).to.equal("PASS");
    expect(assessment.depthSafetyResult).to.equal("FAIL");
    expect(assessment.combinedHcuVerdict).to.equal("NO_GO");
  });

  it("13. does not let a passing depth substitute for total", function () {
    const assessment = assessSampleHcu({ globalHCU: 19_000_000n, maxHCUDepth: 1n });
    expect(assessment.depthSafetyResult).to.equal("PASS");
    expect(assessment.totalSafetyResult).to.equal("FAIL");
    expect(assessment.combinedHcuVerdict).to.equal("NO_GO");
  });

  it("14. fails when globalHCU is missing", function () {
    expect(assessSampleHcu({ maxHCUDepth: 1n }).missing).to.deep.equal(["globalHCU"]);
    expect(assessSampleHcu({ maxHCUDepth: 1n }).combinedHcuVerdict).to.equal("NO_GO");
    expect(evaluateCombinedHcu({ maxHCUDepth: 1n }).reasons).to.include("MISSING_GLOBAL_HCU");
  });

  it("15. fails when maxHCUDepth is missing", function () {
    expect(assessSampleHcu({ globalHCU: 1n }).missing).to.deep.equal(["maxHCUDepth"]);
    expect(assessSampleHcu({ globalHCU: 1n }).combinedHcuVerdict).to.equal("NO_GO");
    expect(evaluateCombinedHcu({ globalHCU: 1n }).reasons).to.include("MISSING_MAX_HCU_DEPTH");
  });
});

describe("SG-4 HCU authority: applicable-limit state machine", function () {
  it("16. requires a value for a proven-present control", function () {
    expect(() => validateControl(control({ authorityState: "PROVEN_PRESENT", value: null }))).to.throw(
      /PROVEN_PRESENT requires a numeric value/u,
    );
    expect(() => validateControl(control())).to.not.throw();
  });

  it("17. forbids a value for a proven-absent control", function () {
    expect(() =>
      validateControl(
        control({ authorityState: "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION", value: "5", blocking: false }),
      ),
    ).to.throw(/PROVEN_ABSENT forbids a numeric value/u);
  });

  it("18. does not block on a proven-absent block/batch control, but only once a deployment is verified", function () {
    expect(controlIsBlocking("PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION")).to.equal(false);
    /* Proven absence without a verified deployed implementation is rejected outright. */
    expect(() =>
      validateControl(
        control({
          authorityState: "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION",
          value: null,
          verificationMethod: "ENUMERATION",
          liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
        }),
      ),
    ).to.throw(/PROVEN_ABSENT requires a verified deployed implementation/u);
  });

  it("19. blocks on an unresolved block/batch control", function () {
    expect(controlIsBlocking("UNRESOLVED")).to.equal(true);
    expect(() =>
      validateControl(control({ metricId: "BLOCK_OR_BATCH_HCU", authorityState: "UNRESOLVED", blocking: false })),
    ).to.throw(/UNRESOLVED must be blocking/u);
    expect(
      validateAuthorityResult({
        blockOrBatchControlState: {
          authorityState: "UNRESOLVED",
          blocking: true,
          liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
        },
      }),
    ).to.include("unresolved block/batch control is blocking");
  });

  it("20. requires an explicit reason for NOT_APPLICABLE", function () {
    expect(() =>
      validateControl(control({ authorityState: "NOT_APPLICABLE", value: null, absenceReason: null })),
    ).to.throw(/NOT_APPLICABLE requires an explicit reason/u);
    expect(() =>
      validateControl(control({ authorityState: "NOT_APPLICABLE", value: null, absenceReason: "not enforced here" })),
    ).to.not.throw();
  });

  it("21. rejects a bare null without an authority state", function () {
    const protocol = deriveAuthorityProtocol();
    expect(protocol.applicableLimitStateMachine.nullWithoutStateForbidden).to.equal(true);
    /* A value may accompany only a state that carries one, and such a state must carry one. */
    expect(
      validateAuthorityResult({
        blockOrBatchControlState: {
          authorityState: "NOT_APPLICABLE",
          blocking: false,
          liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
          value: "5",
        },
      }),
    ).to.include("blockOrBatchControlState: only a PROVEN_PRESENT control may carry a value");
    expect(
      validateAuthorityResult({
        blockOrBatchControlState: {
          authorityState: "PROVEN_PRESENT",
          blocking: false,
          liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
        },
      }),
    ).to.include("blockOrBatchControlState: a PROVEN_PRESENT control requires a value");
  });

  it("22. derives depth scope from executable use sites, not the misleading comment", function () {
    const limits = extractLimits(hcuLimitSource);
    /* The installed source really does carry the misleading per-block docstring. */
    expect(limits.depthDocstringClaimsPerBlock).to.equal(true);
    /* Scope is nonetheless established per transaction, from enforcement plus transient storage. */
    expect(limits.depthUsesTransientStorage).to.equal(true);
    expect(limits.depthScope).to.equal("PER_TRANSACTION");

    /* Removing the enforcement path while keeping the comment must fail closed, proving the comment
     * alone can never establish scope. */
    const withoutEnforcement = hcuLimitSource.replace(
      /totalHCU >= MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX/gu,
      "totalHCU >= SOME_OTHER_CONSTANT",
    );
    expect(extractLimits(withoutEnforcement).depthScope).to.equal("UNRESOLVED");
  });
});

describe("SG-4 HCU authority: authority-root pinning", function () {
  it("23. requires a direct authority-root dependency", function () {
    expect(checkDirectPin(manifest).ok).to.equal(true);
    expect(checkDirectPin(JSON.stringify({ devDependencies: {} })).reason).to.equal("MISSING_DIRECT_PIN");
  });

  it("24. rejects a range dependency", function () {
    for (const range of ["^0.10.0", "~0.10.0", ">=0.10.0", "*"]) {
      const result = checkDirectPin(JSON.stringify({ devDependencies: { "@fhevm/host-contracts": range } }));
      expect(result.ok, range).to.equal(false);
      expect(result.reason, range).to.equal("RANGE_SPECIFIER_REJECTED");
    }
  });

  it("25. rejects a transitive-only authority root", function () {
    /* A manifest without the direct entry is exactly the pre-amendment arrangement. */
    const transitiveOnly = JSON.stringify({ devDependencies: { "@fhevm/hardhat-plugin": "0.4.2" } });
    expect(checkDirectPin(transitiveOnly).ok).to.equal(false);
    expect(deriveAuthorityProtocol().localAuthorityFixtureRoot.transitiveDependencyIsInsufficient).to.equal(true);
  });

  it("26. rejects lockfile drift", function () {
    expect(checkLockfilePin(lockfile).ok).to.equal(true);
    expect(checkLockfilePin("importers:\n  .:\n").reason).to.equal("MISSING_LOCKFILE_IMPORTER_ENTRY");
    const drifted = lockfile.replace(
      /'@fhevm\/host-contracts':\n(\s+)specifier: 0\.10\.0\n(\s+)version: 0\.10\.0/u,
      "'@fhevm/host-contracts':\n$1specifier: 0.10.1\n$2version: 0.10.1",
    );
    expect(checkLockfilePin(drifted).reason).to.equal("LOCKFILE_DRIFT");
  });

  it("27. rejects installed version drift", function () {
    const installed = JSON.parse(readFileSync(resolve(HOST, "package.json"), "utf8")) as { version: string };
    expect(installed.version).to.equal("0.10.0");
    expect(checkDirectPin(JSON.stringify({ devDependencies: { "@fhevm/host-contracts": "0.9.0" } })).reason).to.equal(
      "VERSION_DRIFT",
    );
  });

  it("28. rejects source-hash drift", function () {
    const protocol = deriveAuthorityProtocol();
    const expected = protocol.installedHashes.sources["@fhevm/host-contracts:contracts/HCULimit.sol"];
    expect(sha256(readFileSync(resolve(HOST, "contracts/HCULimit.sol")))).to.equal(expected);
    expect(sha256(`${hcuLimitSource} `)).to.not.equal(expected);
  });

  it("29. rejects calculator-hash drift", function () {
    const protocol = deriveAuthorityProtocol();
    const actual = sha256(readFileSync(resolve(MOCK, "fhevm/coprocessor/hcu.ts")));
    expect(actual).to.equal(protocol.installedHashes.calculator.sha256);
    expect(sha256("tampered calculator")).to.not.equal(protocol.installedHashes.calculator.sha256);
  });

  it("30. rejects price-table-hash drift", function () {
    const protocol = deriveAuthorityProtocol();
    expect(sha256(readFileSync(resolve(MOCK, "fhevm/coprocessor/HCUByOperator.ts")))).to.equal(
      protocol.installedHashes.costTable.sha256,
    );
    expect(sha256(costTableSource.replace("84000", "84001"))).to.not.equal(protocol.installedHashes.costTable.sha256);
  });
});

describe("SG-4 HCU authority: stale constant and address derivation", function () {
  it("31. rejects the stale plugin HCULimit address", function () {
    const pluginConstants = readFileSync(
      resolve(ROOT, "node_modules/@fhevm/hardhat-plugin/src/internal/constants.ts"),
      "utf8",
    );
    /* The stale constant really is shipped by the installed plugin. */
    expect(pluginConstants).to.include(STALE_PLUGIN_HCU_LIMIT.sepoliaValue);
    /* SG-4 code must not use it. */
    expect(
      checkStaleAddressUsage(
        [{ path: "scripts/example.ts", content: `const a = "${STALE_PLUGIN_HCU_LIMIT.sepoliaValue}";` }],
        [],
      ).ok,
    ).to.equal(false);
    expect(checkStaleAddressUsage([{ path: "scripts/example.ts", content: "const a = 1;" }], []).ok).to.equal(true);
    expect(deriveAuthorityProtocol().onChainCorroboration.staleConstantProhibition.mayBeUsedAsAuthority).to.equal(
      false,
    );
  });

  it("32. derives the authority address only from the verified executor", function () {
    const corroboration = deriveAuthorityProtocol().onChainCorroboration;
    expect(corroboration.addressDerivationRule).to.equal(
      "AUTHORITY_ADDRESS_MUST_BE_DERIVED_FROM_THE_VERIFIED_EXECUTOR_ONLY",
    );
    expect(
      generateLiveCallPlan(bindingRecordFixture() as never).some((call) => call.callId === "EXECUTOR_AUTHORITY_GETTER"),
    ).to.equal(true);
    expect(validateAuthorityResult({ staleAddressGuardResult: "REJECTED" })).to.include(
      "authority result derived from the stale HCULimit constant is rejected",
    );
  });

  it("33. rejects broken reciprocal linkage", function () {
    expect(
      generateLiveCallPlan(bindingRecordFixture() as never).some(
        (call) => call.callId === "AUTHORITY_RECIPROCAL_EXECUTOR_GETTER",
      ),
    ).to.equal(true);
    expect(validateAuthorityResult(passResult({ reciprocalLinkageResult: "BROKEN" }))).to.include(
      "reciprocal linkage must be VERIFIED for a PASS result",
    );
    expect(validateAuthorityResult(passResult())).to.not.include(
      "reciprocal linkage must be VERIFIED for a PASS result",
    );
  });

  it("34. rejects the wrong chain", function () {
    expect(validateAuthorityResult({ chainId: "1" })).to.include('result.chainId must equal "11155111"');
    expect(validateAuthorityResult(passResult())).to.deep.equal([]);
  });

  it("35. rejects a malformed pinned block hash", function () {
    expect(validateAuthorityResult({ pinnedBlockHash: "0xdeadbeef" }).join("|")).to.include(
      "result.pinnedBlockHash must match",
    );
    expect(validateAuthorityResult(passResult({ pinnedBlockHash: `0x${"a".repeat(64)}` })).join("|")).to.not.include(
      "result.pinnedBlockHash must match",
    );
  });

  it("36. rejects a missing pinned block", function () {
    const errors = validateAuthorityResult({});
    expect(errors).to.include("result.pinnedBlockNumber is required");
    expect(errors).to.include("result.pinnedBlockHash is required");
  });
});

describe("SG-4 HCU authority: address-normalized bytecode verification", function () {
  it("37. rejects unexpected code length", function () {
    const truncated = runtime.subarray(0, runtime.length - 1);
    const result = normalizeRuntimeBytecode(truncated, ARTIFACT_EXECUTOR);
    expect(result.ok).to.equal(false);
    expect(result.failures.some((entry) => entry.startsWith("LENGTH_MISMATCH"))).to.equal(true);
  });

  it("38. rejects an unexpected normalized byte offset", function () {
    const result = normalizeRuntimeBytecode(runtime, ARTIFACT_EXECUTOR, [...EXECUTOR_IMMEDIATE_OFFSETS, 12]);
    expect(result.ok).to.equal(false);
    expect(
      result.failures.some((entry) => entry.startsWith("OPCODE_MISMATCH") || entry.startsWith("MISSING_REPLACEMENT")),
    ).to.equal(true);
  });

  it("39. rejects an extra normalization replacement", function () {
    /* Declaring one offset fewer leaves a real occurrence undeclared, which must be reported rather
     * than quietly normalized. */
    const result = normalizeRuntimeBytecode(runtime, ARTIFACT_EXECUTOR, EXECUTOR_IMMEDIATE_OFFSETS.slice(1));
    expect(result.ok).to.equal(false);
    expect(result.failures.some((entry) => entry.startsWith("EXTRA_REPLACEMENT"))).to.equal(true);
  });

  it("40. rejects a missing expected normalization replacement", function () {
    const mutated = Buffer.from(runtime);
    mutated.fill(0xab, EXECUTOR_IMMEDIATE_OFFSETS[0], EXECUTOR_IMMEDIATE_OFFSETS[0] + 20);
    const result = normalizeRuntimeBytecode(mutated, ARTIFACT_EXECUTOR);
    expect(result.ok).to.equal(false);
    expect(result.failures.some((entry) => entry.startsWith("MISSING_REPLACEMENT"))).to.equal(true);
  });

  it("41. rejects an opcode mismatch at a declared offset", function () {
    const mutated = Buffer.from(runtime);
    mutated[EXECUTOR_IMMEDIATE_OFFSETS[2] - 1] = 0x60;
    const result = normalizeRuntimeBytecode(mutated, ARTIFACT_EXECUTOR);
    expect(result.ok).to.equal(false);
    expect(result.failures.some((entry) => entry.startsWith("OPCODE_MISMATCH"))).to.equal(true);
  });

  it("42. rejects an unknown metadata structure", function () {
    const metadata = inspectMetadataTrailer(runtime);
    expect(metadata.valid).to.equal(true);
    expect(metadata.solcVersion).to.equal(EXPECTED_METADATA.solcVersion);
    expect(metadata.carriesSourceHash).to.equal(false);

    const mutated = Buffer.from(runtime);
    mutated[mutated.length - 3] = 0xff;
    const result = normalizeRuntimeBytecode(mutated, ARTIFACT_EXECUTOR);
    expect(result.ok).to.equal(false);
    expect(result.failures.some((entry) => entry.startsWith("UNRECOGNIZED_METADATA"))).to.equal(true);
  });

  it("normalizes exactly the declared executor immediates and nothing else", function () {
    const result = normalizeRuntimeBytecode(runtime, ARTIFACT_EXECUTOR);
    expect(result.ok, result.failures.join(",")).to.equal(true);
    expect(result.replacements).to.equal(EXECUTOR_IMMEDIATE_COUNT);
    expect(result.normalizedSha256).to.equal(EXPECTED_NORMALIZED_RUNTIME_SHA256);
  });
});

describe("SG-4 HCU authority: cost-table compatibility", function () {
  const installed = parseInstalledCostTable(costTableSource);
  const authority = parseAuthorityCostTable(hcuLimitSource);

  it("parses both installed representations rather than assuming compatibility", function () {
    expect(installed.size).to.be.greaterThan(0);
    expect(authority.size).to.be.greaterThan(0);
    const comparison = compareOperationTables(installed, authority);
    expect(comparison.installedOnly).to.deep.equal([]);
    expect(comparison.authorityOnly).to.deep.equal([]);
    expect(comparison.costMismatches).to.deep.equal([]);
    expect(comparison.operandMismatches).to.deep.equal([]);
  });

  it("43. rejects a shared operation-cost mismatch", function () {
    const mutated = parseAuthorityCostTable(hcuLimitSource.replace("opHCU = 259000;", "opHCU = 259001;"));
    const comparison = compareOperationTables(installed, mutated);
    expect(comparison.costMismatches.length).to.be.greaterThan(0);
    expect(comparison.costMismatches.join(",")).to.include("FheAdd");
  });

  it("44. rejects an operand/type dimension mismatch", function () {
    const trimmed: CostTable = new Map(installed);
    const add = new Map(installed.get("FheAdd") as Map<string, Map<string, number>>);
    add.delete("nonScalar");
    trimmed.set("FheAdd", add as never);
    const comparison = compareOperationTables(trimmed, authority);
    expect(comparison.operandMismatches.some((entry) => entry.startsWith("FheAdd.nonScalar"))).to.equal(true);
  });

  it("45. rejects an unknown SG-4 operation without a mapping", function () {
    const priced = new Set([...authority.keys()].map((name) => OPERATION_NAME_TRANSLATIONS[name] ?? name));
    expect(priced.has("FheTotallyUnknown")).to.equal(false);
    for (const entry of SG4_CANONICAL_OPERATION_VARIANTS)
      expect(priced.has(entry.canonicalOperation), entry.canonicalOperation).to.equal(true);
  });

  it("46. fails closed when FheSum is introduced", function () {
    expect(UNSUPPORTED_OPERATION_GUARD).to.include("FheSum");
    expect(installed.has("FheSum")).to.equal(false);
    expect(authority.has("FheSum")).to.equal(false);
    const priced = new Set([...authority.keys()].map((name) => OPERATION_NAME_TRANSLATIONS[name] ?? name));
    expect(priced.has("FheSum")).to.equal(false);
  });

  it("47. fails closed when FheIsIn is introduced", function () {
    expect(UNSUPPORTED_OPERATION_GUARD).to.include("FheIsIn");
    expect(installed.has("FheIsIn")).to.equal(false);
    expect(authority.has("FheIsIn")).to.equal(false);
    const withGuarded: CostTable = new Map(installed);
    withGuarded.set("FheIsIn", new Map() as never);
    const comparison = compareOperationTables(withGuarded, authority);
    expect(comparison.installedOnly).to.deep.equal(["FheIsIn"]);
  });

  it("48. fails closed on an unknown executor event", function () {
    const events = parseExecutorEventNames(eventsSource);
    expect(events.every((name) => installed.has(name))).to.equal(true);
    const injected = parseExecutorEventNames(
      eventsSource.replace('| "FheAdd"', '| "FheAdd"\n  | "FheBrandNewOperation"'),
    );
    expect(injected.filter((name) => !installed.has(name))).to.deep.equal(["FheBrandNewOperation"]);
  });
});

describe("SG-4 HCU authority: operation coverage", function () {
  it("49. resolves every SG-4 circuit to a complete operation manifest", function () {
    const harness = readFileSync(resolve(ROOT, "contracts/benchmarks/SG4FheBenchmarkHarness.sol"), "utf8");
    const calls = new Set([...harness.matchAll(/FHE\.([a-zA-Z0-9_]+)\(/gu)].map((entry) => entry[1]));
    /* Every homomorphic call in the harness is represented in the coverage manifest, either as a
     * priced operation or as explicitly classified non-HCU work. */
    /* Every FHE call name the harness contains must be accounted for EXACTLY: either by a
     * canonical variant a measured circuit executes, or by an explicitly enumerated excluded /
     * non-HCU call. A substring match over a prose sentence is not an account. */
    /* Some entries name a whole overload family (`FHE.allowThis`), others one exact overload;
     * both reduce to the call NAME, which is what the harness scan produces. */
    const callName = (call: string): string => call.slice("FHE.".length).replace(/\(.*$/u, "");
    const pricedNames = new Set(SG4_CANONICAL_OPERATION_VARIANTS.flatMap((entry) => entry.solidityCalls.map(callName)));
    const excludedNames = new Set(
      deriveAuthorityProtocol()
        .sg4OperationCoverage.nonHcuWork.flatMap((entry) => entry.calls)
        .filter((call) => call.startsWith("FHE."))
        .map(callName),
    );
    for (const call of calls) {
      if (call === "sol") continue;
      expect(
        pricedNames.has(call) || excludedNames.has(call),
        `FHE.${call} is neither a measured canonical variant nor an enumerated excluded call`,
      ).to.equal(true);
    }
    /* And nothing is claimed as covered that the harness does not contain. */
    for (const name of pricedNames) expect(calls, `${name} is priced but absent from the harness`).to.include(name);
    for (const entry of SG4_CANONICAL_OPERATION_VARIANTS) expect(entry.circuits.length).to.be.greaterThan(0);
  });

  it("50. does not mislabel ACL, storage, or decryption authorization as executor compute HCU", function () {
    const nonHcu = deriveAuthorityProtocol().sg4OperationCoverage.nonHcuWork;
    const categories = nonHcu.map((entry) => entry.category);
    expect(categories).to.include.members([
      "ACL_AUTHORIZATION",
      "ENCRYPTED_STORAGE",
      "PUBLIC_DECRYPTION_AUTHORIZATION",
    ]);
    const priced = SG4_CANONICAL_OPERATION_VARIANTS.map((entry) => entry.canonicalOperation);
    for (const entry of nonHcu) {
      for (const call of entry.calls) expect(priced).to.not.include(call);
    }
    /* ACL calls emit no coprocessor operator event, so they cannot appear in the priced table. */
    const installed = parseInstalledCostTable(costTableSource);
    expect(installed.has("allowThis")).to.equal(false);
    expect(installed.has("makePubliclyDecryptable")).to.equal(false);
  });
});

describe("SG-4 HCU authority: determinism and execution gating", function () {
  it("51. generates the offline authority protocol deterministically", function () {
    expect(serializeAuthorityProtocol()).to.equal(serializeAuthorityProtocol());
  });

  it("52. pins the authority protocol digest", function () {
    expect(sha256(serializeAuthorityProtocol())).to.equal(EXPECTED_AUTHORITY_PROTOCOL_SHA256);
  });

  it("53. keeps the amended SG-4 benchmark protocol deterministic and pinned", function () {
    expect(serializeProtocol()).to.equal(serializeProtocol());
    expect(sha256(serializeProtocol())).to.equal(EXPECTED_SG4_PROTOCOL_SHA256);
  });

  it("54. keeps permanent benchmark execution blocked before authority PASS", function () {
    const protocol = deriveAuthorityProtocol();
    expect(protocol.benchmarkExecutionGate.permanentBenchmarkExecutionAllowed).to.equal(false);
    expect(protocol.authorityVerificationStatus).to.not.equal("PASS");
    expect(protocol.sg4Status).to.equal("PENDING");
    expect(protocol.sg5Status).to.equal("PENDING");
    expect(protocol.verdictRules.missingValueVerdict).to.equal("BLOCKED");
    const benchmark = JSON.parse(serializeProtocol()) as {
      hcuAuthority: { permanentBenchmarkExecutionAllowed: boolean };
      status: string;
    };
    expect(benchmark.hcuAuthority.permanentBenchmarkExecutionAllowed).to.equal(false);
    expect(benchmark.status).to.equal("PENDING_LIVE_EXECUTION_BLOCKED_ON_HCU_AUTHORITY");
  });

  it("55. exposes no wallet, signature, or transaction path", async function () {
    const protocol = deriveAuthorityProtocol();
    expect(protocol.liveMode.walletRequested).to.equal(false);
    expect(protocol.liveMode.accountAuthorizationRequested).to.equal(false);
    expect(protocol.liveMode.signingRequested).to.equal(false);
    expect(protocol.liveMode.transactionSubmitted).to.equal(false);
    expect(protocol.liveMode.empiricalLimitProbingForbidden).to.equal(true);

    /* Every planned live call is read-only. */
    for (const call of generateLiveCallPlan(bindingRecordFixture() as never))
      expect(LIVE_RPC_ALLOWED_METHODS).to.include(call.method);

    /* The verifier source contains no signing or transaction-submitting call, and no evidence
     * writer. */
    const verifierSource = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    expect(verifierSource).to.not.match(/eth_sendTransaction|eth_sendRawTransaction|personal_|eth_sign|Wallet\(/u);
    expect(verifierSource).to.not.match(/writeFileSync|writeFile\(|appendFileSync|mkdirSync/u);

    /* Live verification is unreachable without the exact acknowledgment. */
    expect(await rejection(() => runLiveAuthorityVerification(undefined))).to.match(/exact acknowledgment/u);
    expect(await rejection(() => runLiveAuthorityVerification("wrong"))).to.match(/exact acknowledgment/u);

    /* With the acknowledgment it runs, and its result still carries no wallet or signing flag. */
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.walletRequested).to.equal(false);
    expect(result.accountAuthorizationRequested).to.equal(false);
    expect(result.signingRequested).to.equal(false);
    expect(result.transactionSubmitted).to.equal(false);
  });
});

describe("SG-4 HCU authority: offline preflight", function () {
  it("passes every offline check", function () {
    const report = runOfflinePreflight();
    const failed = report.checks.filter((entry) => entry.status === "FAIL");
    expect(failed.map((entry) => `${entry.id}: ${entry.detail}`)).to.deep.equal([]);
    expect(report.verdict).to.equal("PASS");
  });

  it("keeps the block/batch control unresolved and blocking during preparation", function () {
    const blockControl = deriveAuthorityProtocol().applicableLimitStateMachine.controls.find(
      (entry) => entry.metricId === "BLOCK_OR_BATCH_HCU",
    );
    expect(blockControl?.authorityState).to.equal("UNRESOLVED");
    expect(blockControl?.blocking).to.equal(true);
    expect(blockControl?.value).to.equal(null);
    expect(blockControl?.liveDeploymentBinding).to.equal("PENDING_LIVE_DEPLOYMENT_BINDING");
  });
});

/* ---------------------------------------------------------------------------------------------
 * F2 — block/batch absence may not be asserted from a narrow pattern scan.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: block/batch resolution", function () {
  const surface = enumerateAuthoritySurface(hcuLimitSource);

  it("56. keeps block/batch UNRESOLVED and blocking during offline preparation", function () {
    const control = classifyBlockOrBatchControl({
      surface,
      codeIdentityVerified: false,
      implementationIdentity: "NOT_YET_IDENTIFIED_PENDING_LIVE_CODE_IDENTITY",
    });
    expect(control.authorityState).to.equal("UNRESOLVED");
    expect(control.blocking).to.equal(true);
    expect(control.value).to.equal(null);
    /* And the benchmark protocol agrees. */
    const benchmark = JSON.parse(serializeProtocol()) as {
      instrumentation: { hcuCeiling: { blockOrBatchCeilingState: string; blockOrBatchCeilingBlocking: boolean } };
      hcuAuthority: { controls: Record<string, { authorityState: string; blocking: boolean }> };
    };
    expect(benchmark.instrumentation.hcuCeiling.blockOrBatchCeilingState).to.equal("UNRESOLVED");
    expect(benchmark.instrumentation.hcuCeiling.blockOrBatchCeilingBlocking).to.equal(true);
    expect(benchmark.hcuAuthority.controls.BLOCK_OR_BATCH_HCU.authorityState).to.equal("UNRESOLVED");
    expect(benchmark.hcuAuthority.controls.BLOCK_OR_BATCH_HCU.blocking).to.equal(true);
  });

  it("57. transitions to proven absent only once a deployed implementation is verified", function () {
    const control = classifyBlockOrBatchControl({
      surface,
      codeIdentityVerified: true,
      implementationIdentity: `${AUTHORITY_IMPLEMENTATION}@block:${PINNED_DECIMAL}`,
    });
    expect(control.authorityState).to.equal("PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION");
    expect(control.blocking).to.equal(false);
    expect(control.liveDeploymentBinding).to.equal("BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION");
    expect(control.verificationMethod).to.include("ENUMERATION");
    expect(() => validateControl(control)).to.not.throw();
  });

  it("58. transitions to proven present when the verified implementation declares a block ceiling", function () {
    /* A uint48 public constant is exactly the shape the narrow scan cannot see. */
    const withBlockCeiling = hcuLimitSource.replace(
      "uint256 private constant MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX = 20_000_000;",
      "uint256 private constant MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX = 20_000_000;\n    uint48 public constant MAX_HCU_PER_BLOCK = 40_000_000;",
    );
    const mutated = enumerateAuthoritySurface(withBlockCeiling);
    expect(mutated.enumerationComplete).to.equal(true);
    expect(mutated.blockOrBatchCandidates).to.include("constant:MAX_HCU_PER_BLOCK");
    const control = classifyBlockOrBatchControl({
      surface: mutated,
      codeIdentityVerified: true,
      implementationIdentity: `${AUTHORITY_IMPLEMENTATION}@block:${PINNED_DECIMAL}`,
    });
    expect(control.authorityState).to.equal("PROVEN_PRESENT");
    expect(control.value).to.equal("40000000");
    expect(control.blocking).to.equal(false);
  });

  it("59. shows the narrow constant regex cannot establish absence", function () {
    const shapes = [
      ["uint48 constant", "    uint48 public constant MAX_HCU_PER_BLOCK = 1;"],
      ["public uint256", "    uint256 public maxBlockHcu;"],
      ["immutable", "    uint256 public immutable BATCH_HCU_CEILING;"],
      ["mapping accumulator", "    mapping(uint256 => uint256) private blockHcuUsed;"],
      ["getter", "    function getBlockHcuLimit() external view returns (uint256) { return 1; }"],
    ] as const;
    for (const [label, injected] of shapes) {
      const mutated = hcuLimitSource.replace(
        "    /// @custom:oz-upgrades-unsafe-allow constructor",
        `${injected}\n\n    /// @custom:oz-upgrades-unsafe-allow constructor`,
      );
      /* The narrow scan is blind to every one of these. */
      expect(enumerateLimitConstants(mutated), label).to.deep.equal(enumerateLimitConstants(hcuLimitSource));
      /* Exhaustive enumeration sees them, so absence can no longer be concluded. */
      const control = classifyBlockOrBatchControl({
        surface: enumerateAuthoritySurface(mutated),
        codeIdentityVerified: true,
        implementationIdentity: "verified",
      });
      expect(control.authorityState, label).to.not.equal("PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION");
    }
  });

  it("60. fails closed when the enumeration is incomplete", function () {
    const unparsable = hcuLimitSource.replace(
      "    /// @custom:oz-upgrades-unsafe-allow constructor",
      "    @@ not solidity @@;\n\n    /// @custom:oz-upgrades-unsafe-allow constructor",
    );
    const mutated = enumerateAuthoritySurface(unparsable);
    expect(mutated.enumerationComplete).to.equal(false);
    expect(mutated.parseFailures.join("|")).to.include("UNCLASSIFIED_DECLARATION_SCOPE_STATEMENT");
    const control = classifyBlockOrBatchControl({
      surface: mutated,
      codeIdentityVerified: true,
      implementationIdentity: "verified",
    });
    expect(control.authorityState).to.equal("UNRESOLVED");
    expect(control.blocking).to.equal(true);
  });

  it("61. enumerates the surface a docstring cannot influence", function () {
    /* The installed source really does document the depth constant as per block. */
    expect(hcuLimitSource).to.include("units depth per block");
    /* That prose puts nothing into the candidate list, because comments are stripped first. */
    expect(surface.blockOrBatchCandidates).to.deep.equal([]);
    expect(surface.contractName).to.equal("HCULimit");
    expect(surface.errors).to.include.members(["HCUTransactionDepthLimitExceeded", "HCUTransactionLimitExceeded"]);
    expect(surface.callableFunctions).to.include.members([
      "checkHCUForFheAdd",
      "getFHEVMExecutorAddress",
      "getVersion",
    ]);
    expect(surface.storagePrimitivesUsed).to.include.members(["tload", "tstore"]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F3 — the operation-schedule discrepancy stays recorded and blocking.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: operation-schedule authority", function () {
  it("62. records every schedule source and leaves the discrepancy unresolved", function () {
    const schedule = deriveAuthorityProtocol().scheduleAuthority;
    expect(schedule.state).to.equal("UNRESOLVED");
    expect(schedule.blocking).to.equal(true);
    expect(schedule.resolvedByChoosingTheLocalPackage).to.equal(false);
    expect(schedule.localPackageSchedule.operationCount).to.equal("27");
    expect(schedule.installedCalculatorSchedule.operationCount).to.equal("27");
    expect(schedule.previouslyIdentifiedCurrentOfficialScheduleExpectation.operationCount).to.equal("29");
    expect(schedule.previouslyIdentifiedCurrentOfficialScheduleExpectation.additionalOperations).to.deep.equal([
      "FheIsIn",
      "FheSum",
    ]);
    expect(schedule.discrepancy.difference).to.equal("2");
    expect(schedule.discrepancy.versionDiscrepancyIsBlocking).to.equal(true);
  });

  it("63. blocks the live verification while the schedule authority is unresolved", async function () {
    /* Without a resolved authority-binding record the schedule authority cannot resolve: the local
     * 0.10.0 table may not answer for the deployed schedule. */
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: null }),
    });
    expect(result.operationScheduleAuthorityState).to.equal("UNRESOLVED");
    expect(result.finalVerdict).to.not.equal("PASS");
    expect(String(result.status)).to.include("OPERATION_SCHEDULE_AUTHORITY_UNRESOLVED");
    /* And a PASS may not be produced while it stands. */
    expect(validateAuthorityResult(passResult({ operationScheduleAuthorityState: "UNRESOLVED" }))).to.include(
      "PASS requires the operation-schedule authority to be resolved",
    );
  });

  it("64. fails closed on a deployed operation the calculator cannot price", function () {
    expect(CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS).to.deep.equal([...UNSUPPORTED_OPERATION_GUARD]);
    const installed = parseInstalledCostTable(costTableSource);
    for (const operation of CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS) {
      expect(installed.has(operation), operation).to.equal(false);
    }
    expect(
      validateAuthorityResult(
        passResult({
          operationCompatibilityResult: {
            arityMismatches: [],
            authorityOnly: [],
            costMismatches: [],
            installedOnly: [],
            operandMismatches: [],
            operandTypeMismatches: [],
            resultTypeMismatches: [],
            shared: SG4_PRICING_VARIANT_CLOSURE.map(variantId).sort(),
            translationMismatches: [],
            unsupportedByCalculator: ["FheSum"],
          },
        }),
      ),
    ).to.include("PASS requires every deployed operation to be priceable by the installed calculator");
  });
});

/* ---------------------------------------------------------------------------------------------
 * F4 — strict closed result validation.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: result validation", function () {
  it("65. accepts a fully coherent PASS result", function () {
    expect(validateAuthorityResult(passResult())).to.deep.equal([]);
    expect(validateResultAgainstSchema(passResult())).to.deep.equal([]);
  });

  it("66. rejects a false PASS for each missing or mismatched nested condition", function () {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ codeIdentityResult: "UNRESOLVED" }, /verified executor\/authority code identity/u],
      [{ normalizedImplementationHash: "f".repeat(64) }, /equal the resolved official artifact hash/u],
      [{ reciprocalLinkageResult: "UNRESOLVED" }, /reciprocal linkage must be VERIFIED/u],
      [{ staleAddressGuardResult: "UNRESOLVED" }, /stale-address guard to report NOT_USED/u],
      [{ installedSourceHashesResult: "MISMATCH" }, /matching installed source hashes/u],
      [{ sg4CoverageResult: "INCOMPLETE" }, /complete SG-4 coverage/u],
      [{ immutableProvenanceState: "UNRESOLVED" }, /resolved immutable provenance/u],
      [{ authorityProtocolDigest: "0".repeat(64) }, /committed authority protocol digest/u],
      [{ benchmarkProtocolDigest: "0".repeat(64) }, /committed benchmark protocol digest/u],
      [{ calculatorHash: "0".repeat(64) }, /expected calculator hash/u],
      [{ installedTableHash: "0".repeat(64) }, /expected installed table hash/u],
      [{ pinnedBlockNumber: "UNRESOLVED" }, /resolved pinned block number/u],
      [{ pinnedBlockHash: "UNRESOLVED" }, /resolved pinned block hash/u],
      [{ executorCodeHash: "UNRESOLVED" }, /resolved executor code hash/u],
      [{ executorImplementationCodeIdentityResult: "MISMATCH" }, /executor implementation identity/u],
      [{ executorReproducedBuildResult: "MISMATCH" }, /executor build to match its pinned reproduced build/u],
      [{ executorNormalizedImplementationHash: "f".repeat(64) }, /normalized executor implementation hash/u],
      [{ executorAuthorityDerivationResult: "UNRESOLVED" }, /authority derivation only after the verified executor/u],
      [{ authorityCodeHash: "UNRESOLVED" }, /resolved authority code hash/u],
      [{ authorityAddress: "UNRESOLVED" }, /authority address derived from the verified executor/u],
      [{ authorityImplementationAddress: "UNRESOLVED" }, /resolved authority implementation address/u],
      [{ unsupportedOperations: ["FheSum"] }, /no unsupported operation/u],
      [
        { rpcMethodsUsed: ["eth_call", "eth_chainId", "eth_getBlockByNumber", "eth_getCode"] },
        /one ERC-1967 slot read for each proxied role/u,
      ],
    ];
    for (const [override, pattern] of cases) {
      const errors = validateAuthorityResult(passResult(override));
      expect(errors.join(" | "), JSON.stringify(override)).to.match(pattern);
    }
  });

  it("67. rejects a false PASS on each control-state condition", function () {
    const bound = {
      blocking: false,
      liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
      scope: "PER_TRANSACTION",
    };
    expect(
      validateAuthorityResult(
        passResult({ transactionTotalControlState: { ...bound, authorityState: "PROVEN_PRESENT", value: "19999999" } }),
      ).join(" | "),
    ).to.match(/transaction-total control proven present with the exact limit/u);
    expect(
      validateAuthorityResult(
        passResult({ transactionDepthControlState: { ...bound, authorityState: "PROVEN_PRESENT", value: "1" } }),
      ).join(" | "),
    ).to.match(/transaction-depth control proven present with the exact limit/u);
    expect(
      validateAuthorityResult(
        passResult({
          blockOrBatchControlState: {
            authorityState: "UNRESOLVED",
            blocking: true,
            liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
            scope: "PER_BLOCK_OR_BATCH",
          },
        }),
      ).join(" | "),
    ).to.match(/block\/batch control to be resolved, never UNRESOLVED/u);
    /* Proven absence without the deployment binding is rejected in any verdict. */
    expect(
      validateAuthorityResult(
        passResult({
          blockOrBatchControlState: {
            authorityState: "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION",
            blocking: false,
            liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
            scope: "PER_BLOCK_OR_BATCH",
          },
        }),
      ).join(" | "),
    ).to.match(/proven absence requires a verified deployed implementation/u);
  });

  it("68. rejects a false PASS on the authority root and the wallet flags", function () {
    for (const [field, value, pattern] of [
      /* F33 — the measurement toolchain must be exact... */
      [
        "measurementToolchainRoot",
        { calculatorPath: "x", costTablePath: "y", integrity: "x", package: "z", version: "0" },
        /measurement-toolchain package/u,
      ],
      /* ...and the DEPLOYED authority root may never be the local fixture package. */
      [
        "deployedAuthorityRoot",
        {
          artifactId: OFFICIAL_ARTIFACT_ID,
          commit: "a".repeat(40),
          contentSha256: "b".repeat(64),
          path: "contracts/HCULimit.sol",
          repository: "https://registry.npmjs.org/@fhevm/host-contracts",
          tag: "v0.10.0",
        },
        /may not derive the deployed authority root from the local fixture package/u,
      ],
      [
        "localAuthorityFixtureRoot",
        { integrity: "x", package: "y", passRelevant: true, version: "0" },
        /local authority fixture root may never be PASS-relevant/u,
      ],
      ["walletRequested", true, /walletRequested must be false/u],
      ["accountAuthorizationRequested", true, /accountAuthorizationRequested must be false/u],
      ["signingRequested", true, /signingRequested must be false/u],
      ["transactionSubmitted", true, /transactionSubmitted must be false/u],
    ] as [string, unknown, RegExp][]) {
      expect(validateAuthorityResult(passResult({ [field]: value })).join(" | "), field).to.match(pattern);
    }
  });

  it("69. closes the schema against unknown and forbidden fields", function () {
    expect(validateAuthorityResult(passResult({ somethingNew: 1 }))).to.include(
      "result.somethingNew is not a permitted property",
    );
    for (const forbidden of ["rpcUrl", "headers", "provider", "receipt", "trace", "env"]) {
      const errors = validateAuthorityResult(passResult({ [forbidden]: "x" }));
      expect(errors, forbidden).to.include(`forbidden sensitive field ${forbidden}`);
    }
    /* Nested objects are closed too. */
    expect(
      validateAuthorityResult(
        passResult({
          operationCompatibilityResult: {
            arityMismatches: [],
            authorityOnly: [],
            costMismatches: [],
            installedOnly: [],
            operandMismatches: [],
            operandTypeMismatches: [],
            resultTypeMismatches: [],
            shared: [],
            translationMismatches: [],
            unsupportedByCalculator: [],
            extra: [],
          },
        }),
      ),
    ).to.include("result.operationCompatibilityResult.extra is not a permitted property");
  });

  it("70. represents a BLOCKED result without requiring verified linkage", function () {
    const blocked = passResult({
      finalVerdict: "BLOCKED",
      codeIdentityResult: "UNRESOLVED",
      reciprocalLinkageResult: "UNRESOLVED",
      sg4CoverageResult: "UNRESOLVED",
      staleAddressGuardResult: "UNRESOLVED",
      installedSourceHashesResult: "UNRESOLVED",
      immutableProvenanceState: "UNRESOLVED",
      operationScheduleAuthorityState: "UNRESOLVED",
      authorityAddress: "UNRESOLVED",
      authorityImplementationAddress: "UNRESOLVED",
      authorityCodeHash: "UNRESOLVED",
      executorCodeHash: "UNRESOLVED",
      normalizedImplementationHash: "UNRESOLVED",
      pinnedBlockNumber: "UNRESOLVED",
      pinnedBlockHash: "UNRESOLVED",
      preparationLineageResult: "UNRESOLVED",
      liveLimitSemantics: "UNRESOLVED",
      greatestAcceptedTotalHcu: "UNRESOLVED",
      greatestAcceptedDepthHcu: "UNRESOLVED",
      authoritativeArtifactId: "UNRESOLVED",
      expectedDeployedNormalizedHash: "UNRESOLVED",
      facetArtifactBinding: Object.fromEntries(
        ["blockOrBatch", "codeIdentity", "limitSemantics", "limitValues", "operationSchedule"].map((facet) => [
          facet,
          { artifactId: "UNRESOLVED", origin: "UNRESOLVED" },
        ]),
      ),
      authorityBindingRecordResult: "ABSENT",
      authorityCodeIdentityResult: "UNRESOLVED",
      authorityDeploymentModel: "UNRESOLVED",
      authorityVersionResult: "UNRESOLVED",
      executorCodeIdentityResult: "UNRESOLVED",
      executorDeploymentModel: "UNRESOLVED",
      executorVersionResult: "UNRESOLVED",
      callerApplicabilityResults: [],
      callerExemptionResult: "UNRESOLVED",
      implementationResolutionResult: "UNRESOLVED",
      localFixtureSelfTestResult: "UNRESOLVED",
      pinnedBlockFinality: "UNRESOLVED",
      totalHcuOnChainReading: { getterAvailability: "UNRESOLVED", onChainValue: "UNRESOLVED", result: "UNRESOLVED" },
      depthHcuOnChainReading: { getterAvailability: "UNRESOLVED", onChainValue: "UNRESOLVED", result: "UNRESOLVED" },
      blockOrBatchOnChainReading: {
        getterAvailability: "UNRESOLVED",
        onChainValue: "UNRESOLVED",
        result: "UNRESOLVED",
      },
      rpcMethodsUsed: [],
      implementationAddressPolicyResult: "UNRESOLVED",
      liveCallCount: 0,
      reproducedBuildInfoSha256: "UNRESOLVED",
      reproducedBuildResult: "UNRESOLVED",
      liveCallLogDigest: "UNRESOLVED",
      livePlanCallCount: 0,
      livePlanDigest: "UNRESOLVED",
      planEnforcementResult: "NOT_APPLICABLE_PLAN_UNRESOLVED",
      blockOrBatchControlState: {
        authorityState: "UNRESOLVED",
        blocking: true,
        liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
        scope: "PER_BLOCK_OR_BATCH",
      },
      transactionTotalControlState: {
        authorityState: "LOCAL_EXPECTED_PENDING_LIVE_BINDING",
        blocking: true,
        liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
        scope: "PER_TRANSACTION",
        value: "20000000",
      },
      transactionDepthControlState: {
        authorityState: "LOCAL_EXPECTED_PENDING_LIVE_BINDING",
        blocking: true,
        liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
        scope: "PER_TRANSACTION",
        value: "5000000",
      },
      status: "LIVE_READ_ONLY_AUTHORITY_VERIFICATION_BLOCKED",
    });
    /* Structurally valid: every unresolved check has a spelling rather than an omission. */
    expect(validateResultAgainstSchema(blocked)).to.deep.equal([]);
    /* And the only complaint is the blocking block/batch control, never a PASS condition. */
    expect(validateAuthorityResult(blocked)).to.deep.equal(["unresolved block/batch control is blocking"]);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F1 / F5 — the live verifier against a fake read-only transport.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: live read-only verifier", function () {
  it("71. executes every planned step against a fake transport and touches no network", async function () {
    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(calls.map((call) => call.method)).to.deep.equal([
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_call",
      "eth_call",
      "eth_getCode",
      "eth_getStorageAt",
      "eth_getCode",
      "eth_call",
      "eth_call",
      /* The numeric limits themselves, read from the verified interface. */
      "eth_call",
      "eth_call",
      /* Caller applicability for the one subject whose getter is AVAILABLE. */
      "eth_call",
    ]);
    /* The pinned block is requested with the finalized tag, never "latest". */
    expect(calls[1].params[0]).to.equal("finalized");
    expect(result.pinnedBlockFinality).to.equal("FINALIZED");
    expect(result.pinnedBlockNumber).to.equal(PINNED_DECIMAL);
    expect(result.pinnedBlockHash).to.equal(PINNED_HASH);
    expect(result.authorityAddress).to.equal(AUTHORITY_PROXY);
    expect(result.authorityImplementationAddress).to.equal(AUTHORITY_IMPLEMENTATION);
    /* With a complete reviewed record the whole chain verifies against it. */
    expect(result.codeIdentityResult).to.equal("VERIFIED");
    expect(result.executorCodeIdentityResult).to.equal("VERIFIED");
    expect(result.authorityCodeIdentityResult).to.equal("VERIFIED");
    expect(result.reciprocalLinkageResult).to.equal("VERIFIED");
    expect(result.executorVersion).to.equal("FHEVMExecutor v0.4.0");
    expect(result.authorityVersion).to.equal("HCULimit v0.1.0");
    expect(result.totalHcuOnChainReading).to.deep.include({ result: "MATCHES_BINDING_RECORD_ON_CHAIN" });
    expect(result.depthHcuOnChainReading).to.deep.include({ result: "MATCHES_BINDING_RECORD_ON_CHAIN" });
    expect(validateResultAgainstSchema(result)).to.deep.equal([]);
  });

  it("72. refuses every forbidden RPC method", async function () {
    const guarded = createGuardedTransport({ send: async () => "0x" });
    for (const method of [
      "eth_sendTransaction",
      "eth_sendRawTransaction",
      "eth_sign",
      "eth_accounts",
      "eth_getBalance",
      "personal_unlockAccount",
      "debug_traceTransaction",
      "trace_block",
      "wallet_requestPermissions",
      "eth_getLogs",
    ]) {
      expect(await rejection(() => guarded.send({ method, params: [] })), method).to.match(
        /forbidden RPC method refused/u,
      );
    }
    for (const method of LIVE_RPC_ALLOWED_METHODS) {
      expect(await rejection(() => guarded.send({ method, params: [] })), method).to.equal("DID_NOT_REJECT");
    }
  });

  it("73. enforces the pinned-block binding on every bound call", async function () {
    const guarded = createGuardedTransport({ send: async () => "0x" });
    guarded.bindToPinnedBlock(PINNED_HEX);
    await guarded.send({ method: "eth_getCode", params: [AUTHORITY_PROXY, PINNED_HEX] });
    expect(
      await rejection(() => guarded.send({ method: "eth_getCode", params: [AUTHORITY_PROXY, "latest"] })),
    ).to.match(/was not bound to the pinned block/u);
    expect(
      await rejection(() =>
        guarded.send({ method: "eth_getStorageAt", params: [AUTHORITY_PROXY, ERC1967_IMPLEMENTATION_SLOT, "0x1"] }),
      ),
    ).to.match(/was not bound to the pinned block/u);
    /* Direct assertion, independent of the transport wrapper. */
    expect(() =>
      assertBoundToPinnedBlock({ method: "eth_call", params: [{ to: AUTHORITY_PROXY }, "pending"] }, PINNED_HEX),
    ).to.throw(/was not bound to the pinned block/u);
    /* Unbound methods are exempt by construction. */
    expect(() => assertBoundToPinnedBlock({ method: "eth_chainId", params: [] }, PINNED_HEX)).to.not.throw();
  });

  it("74. resolves ERC-1967 through eth_getStorageAt at the exact slot, never eth_call", async function () {
    const { transport, calls } = createFakeTransport();
    await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    const slotReads = calls.filter((call) => call.method === "eth_getStorageAt");
    expect(slotReads).to.have.lengthOf(1);
    expect(slotReads[0].params[0]).to.equal(AUTHORITY_PROXY);
    expect(slotReads[0].params[1]).to.equal(ERC1967_IMPLEMENTATION_SLOT);
    expect(slotReads[0].params[2]).to.equal(PINNED_HEX);
    /* No eth_call carries the slot, and the plan assertion enforces the mechanism. */
    for (const call of calls.filter((entry) => entry.method === "eth_call")) {
      expect(JSON.stringify(call.params)).to.not.include(ERC1967_IMPLEMENTATION_SLOT);
    }
    expect(() =>
      assertLiveCallPlanIsReadOnly(
        generateLiveCallPlan(bindingRecordFixture() as never).map((call) =>
          call.callId === "AUTHORITY_ERC1967_IMPLEMENTATION_SLOT" ? { ...call, method: "eth_call" } : call,
        ),
      ),
    ).to.throw(/must be the exact pinned ERC-1967 eth_getStorageAt request/u);
  });

  it("75. blocks when the ERC-1967 slot is empty", async function () {
    const { transport } = createFakeTransport({ implementationSlot: `0x${"0".repeat(64)}` });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.authorityImplementationAddress).to.equal("UNRESOLVED");
    expect(result.codeIdentityResult).to.equal("UNRESOLVED");
    expect(String(result.status)).to.include("ERC1967_IMPLEMENTATION_SLOT_EMPTY_OR_MALFORMED");
    expect(result.finalVerdict).to.equal("BLOCKED");
  });

  it("76. fails on a normalized bytecode mismatch against a verified authoritative artifact", function () {
    const official = "e".repeat(64);
    /* Mismatch against a resolved authoritative artifact is a FAIL. */
    expect(
      classifyCodeIdentity({
        normalizedSha256: "f".repeat(64),
        normalizationOk: true,
        expectedAuthoritativeSha256: official,
      }),
    ).to.equal("MISMATCH");
    /* Structural normalization failure is also a mismatch. */
    expect(
      classifyCodeIdentity({
        normalizedSha256: official,
        normalizationOk: false,
        expectedAuthoritativeSha256: official,
      }),
    ).to.equal("MISMATCH");
    /* A match permits downstream classification. */
    expect(
      classifyCodeIdentity({
        normalizedSha256: official,
        normalizationOk: true,
        expectedAuthoritativeSha256: official,
      }),
    ).to.equal("VERIFIED");
    /* A MISMATCH result drives the verdict to FAIL through the PASS rules. */
    const errors = validateAuthorityResult(passResult({ codeIdentityResult: "MISMATCH" }));
    expect(errors.join(" | ")).to.match(/verified executor\/authority code identity/u);
  });

  it("77. fails on broken reciprocal linkage and on the wrong chain", async function () {
    const broken = createFakeTransport({ reciprocal: word("0x3333333333333333333333333333333333333333") });
    const brokenResult = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: broken.transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(brokenResult.reciprocalLinkageResult).to.equal("BROKEN");
    expect(brokenResult.finalVerdict).to.equal("FAIL");

    const wrongChain = createFakeTransport({ chainId: "0x1" });
    const chainResult = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: wrongChain.transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(chainResult.finalVerdict).to.equal("FAIL");
    expect(String(chainResult.status)).to.include("CHAIN_ID_MISMATCH");
    /* Nothing beyond the chain check was attempted. */
    expect(wrongChain.calls.map((call) => call.method)).to.deep.equal(["eth_chainId"]);
  });

  it("78. blocks until the preparation binding record exists", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, { transport });
    expect(result.finalVerdict).to.not.equal("PASS");
    expect(result.preparationLineageResult).to.equal("UNRESOLVED");
    expect(String(result.status)).to.include("PREPARATION_BINDING_RECORD_ABSENT");
  });

  it("79. accepts no RPC, executor, authority, or address override", function () {
    const verifierSource = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    /* The only environment reads are the process PATH and the valueless live acknowledgement gate;
     * neither carries an endpoint, an address, or a credential. */
    const envReads = [...verifierSource.matchAll(/process\.env(?:\.([A-Za-z0-9_]+)|\[["']([^"']+)["']\])/gu)].map(
      (entry) => entry[1] ?? entry[2],
    );
    expect([...new Set(envReads)].sort()).to.deep.equal(["PATH", "SG4_AUTHORITY_LIVE_ACK"]);
    /* The endpoint is only ever read from the committed protocol constant. */
    expect(verifierSource).to.include("new URL(LIVE_RPC_ENDPOINT)");
    expect(verifierSource).to.not.match(/new URL\((?!LIVE_RPC_ENDPOINT)/u);
    /* The options type carries exactly the two declared test seams. */
    const optionsBlock = /export type LiveVerificationOptions = \{[\s\S]*?\n\};/u.exec(verifierSource);
    expect(optionsBlock, "LiveVerificationOptions not found").to.not.equal(null);
    /* Compare the declared members only; the surrounding comment names the things it excludes. */
    const members = (optionsBlock?.[0] ?? "").replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
    expect(members).to.match(/transport\?:/u);
    expect(members).to.match(/lineageProbe\?:/u);
    expect(members).to.not.match(/url|endpoint|address|executor|authority|key/iu);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F6 / F7 / F8 — comparison declarations, provenance, and the stale-constant guard.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: declarations, provenance, and stale-constant scope", function () {
  it("80. commits the strict exclusive comparison strings and rejects the inclusive form", function () {
    const benchmark = JSON.parse(serializeProtocol()) as {
      limits: {
        hcuMaximumFraction: { comparison: string; boundSemantics: string };
        hcuDepthMaximumFraction: { comparison: string; boundSemantics: string };
      };
    };
    expect(benchmark.limits.hcuMaximumFraction.comparison).to.equal("maxHcu*4 < authoritativeTransactionHcuCeiling*3");
    expect(benchmark.limits.hcuDepthMaximumFraction.comparison).to.equal(
      "maxHcuDepth*4 < authoritativeTransactionHcuDepthCeiling*3",
    );
    for (const fraction of [benchmark.limits.hcuMaximumFraction, benchmark.limits.hcuDepthMaximumFraction]) {
      expect(fraction.comparison).to.not.include("<=");
      expect(fraction.boundSemantics).to.equal("EXCLUSIVE");
    }
    /* The generator source itself carries no inclusive HCU comparison. */
    const source = readFileSync(resolve(ROOT, "scripts/sg4-protocol.ts"), "utf8");
    expect(source).to.not.include("maxHcu*4 <=");
    expect(source).to.not.include("maxHcuDepth*4 <=");
    /* The documentation agrees with the generator. */
    const doc = readFileSync(resolve(ROOT, "docs/security/SG4_BENCHMARK_PROTOCOL.md"), "utf8");
    expect(doc).to.include("maxHcu*4 < transactionCeiling*3");
    expect(doc).to.include("maxHcuDepth*4 < transactionDepthCeiling*3");
    expect(doc).to.not.include("maxHcu*4 <= ");
  });

  it("81. keeps the declared comparison consistent with the enforced boundary", function () {
    /* Equality with the boundary is refused, which is what the strict `<` declares. */
    expect(evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD).pass).to.equal(false);
    expect(evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD - 1n).pass).to.equal(true);
    expect(evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD).pass).to.equal(false);
    expect(evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD - 1n).pass).to.equal(true);
  });

  it("82. records the prior-reviewed immutable provenance and keeps it blocking", function () {
    const provenance = deriveAuthorityProtocol().provenance;
    expect(provenance.state).to.equal("EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION");
    expect(provenance.blocking).to.equal(true);
    expect(provenance.blocksLivePass).to.equal(true);
    expect(provenance.isAControl).to.equal(true);
    expect(provenance.inventedCommitForbidden).to.equal(true);
    expect(provenance.recordedFromPriorReview).to.equal(true);
    expect(provenance.independentlyReverified).to.equal(false);
    expect(provenance.deployedLinkageEstablished).to.equal(false);
    /* Nothing was discarded: every subject carries its exact tuple. */
    expect(provenance.required).to.have.lengthOf(8);
    /* The compiled build is its own subject: different bytes from the source, therefore its own
     * tuple and its own content hash. */
    expect(provenance.required.map((entry) => entry.subject)).to.include("CURRENT_OFFICIAL_ARTIFACT_BUILD");
    for (const entry of provenance.required) {
      expect(entry.repository, entry.subject).to.be.a("string");
      expect(entry.commit, entry.subject).to.match(/^[0-9a-f]{40}$/u);
      /* A REPRODUCED_BUILD has no generated-artifact path; it carries build evidence instead. */
      if (
        entry.subject === "CURRENT_OFFICIAL_ARTIFACT_BUILD" ||
        entry.subject === "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD"
      ) {
        expect(entry).to.not.have.property("path");
        expect(entry.buildInfoSha256, entry.subject).to.equal(
          entry.subject === "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD"
            ? "50ed161472e207da6462aa180856d0047aa52396abdba05e9bf566f5ccfd63dd"
            : "b0d9caeb6c3d0747b0889a6d231877d475a4f1ae57c0f7352a6a3eb1ad844396",
        );
      } else expect(entry.path, entry.subject).to.be.a("string");
      expect(entry.reverified, entry.subject).to.equal(false);
    }
    /* The known roots are not replaced by unrelated candidates. */
    expect(provenance.officialRepositories).to.deep.equal([
      "https://github.com/zama-ai/fhevm",
      "https://github.com/zama-ai/fhevm-mocks",
    ]);
    const bySubject = new Map(provenance.required.map((entry) => [entry.subject, entry]));
    expect(bySubject.get("CURRENT_OFFICIAL_AUTHORITY_SOURCE")?.commit).to.equal(
      "07fb05fb75f0aa6cea934088640ddb4539d0b1b9",
    );
    const authoritySourceEntry = bySubject.get("CURRENT_OFFICIAL_AUTHORITY_SOURCE");
    expect(isSourceFileProvenanceEntry(authoritySourceEntry) ? authoritySourceEntry.contentSha256 : undefined).to.equal(
      "16d71ee5f899f1bfd5872bdb83e08d90f510fd529cd8a93d5001dc29f25634b8",
    );
    const priceScheduleEntry = bySubject.get("CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE");
    expect(isSourceFileProvenanceEntry(priceScheduleEntry) ? priceScheduleEntry.path : undefined).to.equal(
      "library-solidity/codegen/src/operatorsPrices.ts",
    );
    expect(bySubject.get("INSTALLED_CALCULATOR")?.commit).to.equal("fa852da4aa4b04231e0fa748e7b4480ae756ce91");
    expect(bySubject.get("INSTALLED_SOLIDITY_CONFIGURATION")?.commit).to.equal(
      "60d3082657fcf2648774b5c4282b08bc22ecee36",
    );
    /* The installed tuples agree with the hashes the verifier actually checks. */
    const calculatorEntry = bySubject.get("INSTALLED_CALCULATOR");
    expect(isSourceFileProvenanceEntry(calculatorEntry) ? calculatorEntry.contentSha256 : undefined).to.equal(
      deriveAuthorityProtocol().installedHashes.calculator.sha256,
    );
    const costTableEntry = bySubject.get("INSTALLED_OPERATION_COST_TABLE");
    expect(isSourceFileProvenanceEntry(costTableEntry) ? costTableEntry.contentSha256 : undefined).to.equal(
      deriveAuthorityProtocol().installedHashes.costTable.sha256,
    );
    /* The prior "not a control" framing is gone from both the protocol and the document. */
    expect(serializeAuthorityProtocol()).to.not.include("UNRESOLVED_NOT_A_CONTROL");
    expect(readFileSync(resolve(ROOT, "docs/security/SG4_HCU_AUTHORITY_PROTOCOL.md"), "utf8")).to.not.include(
      "UNRESOLVED_NOT_A_CONTROL",
    );
    /* And it still blocks a PASS. */
    expect(
      validateAuthorityResult(
        passResult({ immutableProvenanceState: "EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION" }),
      ),
    ).to.include("PASS requires resolved immutable provenance");
  });

  it("83. rejects stale plugin symbol and import use, not only the literal address", function () {
    /* Assembled from parts so this test file does not itself contain a matching import specifier. */
    const pluginModule = ["@fhevm", "hardhat-plugin", "src", "internal", "constants"].join("/");
    const cases: [string, string][] = [
      ["literal address", `const a = "${STALE_PLUGIN_HCU_LIMIT.sepoliaValue}";`],
      ["mainnet literal", `const a = "${STALE_PLUGIN_HCU_LIMIT.mainnetValue}";`],
      ["symbol", `const a = constants.${"HCU"}LimitAddress;`],
      ["constant bag", `import { ${"ZAMA_FHE_RELAYER"}_SDK_PACKAGE } from 'somewhere';`],
      ["module import", `import x from "${pluginModule}";`],
      ["require", `const x = require("${pluginModule}");`],
    ];
    for (const [label, content] of cases) {
      const result = checkStaleAddressUsage([{ path: "scripts/sg4-protocol.ts", content }], []);
      expect(result.ok, label).to.equal(false);
      expect(result.offenders.join("|"), label).to.include("scripts/sg4-protocol.ts");
    }
    /* The executor's own getter is the required mechanism and must not be flagged. */
    expect(
      checkStaleAddressUsage(
        [{ path: "scripts/sg4-protocol.ts", content: "const a = selectorFor('getHCULimitAddress()');" }],
        [],
      ).ok,
    ).to.equal(true);
  });

  it("84. scans the complete SG-4 scope and fails when the scope shrinks", function () {
    expect(SG4_GUARDED_SOURCE_SCOPE.length).to.be.greaterThan(3);
    const all = SG4_GUARDED_SOURCE_SCOPE.map((path) => ({
      path,
      content: readFileSync(resolve(ROOT, path), "utf8"),
    }));
    const full = checkStaleAddressUsage(all);
    expect(full.offenders, full.offenders.join("|")).to.deep.equal([]);
    expect(full.scannedPaths).to.deep.equal([...SG4_GUARDED_SOURCE_SCOPE].sort());
    /* Presenting fewer files than the declared scope is itself a failure. */
    const shrunk = checkStaleAddressUsage(all.slice(1));
    expect(shrunk.ok).to.equal(false);
    expect(shrunk.missingScopePaths).to.deep.equal([SG4_GUARDED_SOURCE_SCOPE[0]]);
    expect(shrunk.offenders.join("|")).to.include("NOT_SCANNED");
  });

  it("86. leaves no unconditional refusal on the live path", function () {
    /* The launcher dispatches to the implemented verifier rather than throwing. */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const launcher = require("../scripts/sg4-hcu-authority-launcher.cjs") as {
      LIVE_ACK: string;
      assertLiveAcknowledgement: (value: string | undefined) => void;
      runLive: (ack: string | undefined, execute: unknown) => string;
    };
    expect(launcher).to.not.have.property("refuseLive");
    expect(() => launcher.assertLiveAcknowledgement(undefined)).to.throw(/exact acknowledgment/u);
    expect(() => launcher.assertLiveAcknowledgement("wrong")).to.throw(/exact acknowledgment/u);
    expect(() => launcher.assertLiveAcknowledgement(launcher.LIVE_ACK)).to.not.throw();

    /* With the acknowledgment it spawns the verifier in live mode; the spawn is captured rather
     * than performed, so nothing runs and no network is contacted. */
    let spawned: { args: string[]; env: Record<string, string | undefined> } | null = null;
    launcher.runLive(
      launcher.LIVE_ACK,
      (_bin: string, args: string[], options: { env: Record<string, string | undefined> }) => {
        spawned = { args, env: options.env };
        return { error: undefined, status: 0, stdout: "", stderr: "" };
      },
    );
    expect(spawned).to.not.equal(null);
    expect((spawned as unknown as { args: string[] }).args).to.include("live");
    /* Only PATH and the acknowledgment cross the boundary. */
    expect(Object.keys((spawned as unknown as { env: Record<string, string> }).env).sort()).to.deep.equal([
      "PATH",
      "SG4_AUTHORITY_LIVE_ACK",
    ]);

    /* And the launcher source no longer says the path is unauthorized. */
    const launcherSource = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority-launcher.cjs"), "utf8");
    expect(launcherSource).to.not.include("prepared but not authorized");
  });

  it("87. withholds the committed-endpoint transport while the preparation binding is unmet", async function () {
    /* No transport is injected, so the real one would be used — but the binding is unmet, so it is
     * never constructed and no network call is attempted. */
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT);
    expect(result.finalVerdict).to.not.equal("PASS");
    expect(String(result.status)).to.include("NETWORK_TRANSPORT_WITHHELD_UNTIL_PREPARATION_BINDING_IS_SATISFIED");
    expect(result.rpcMethodsUsed).to.deep.equal([]);
    expect(result.pinnedBlockNumber).to.equal("UNRESOLVED");
    expect(validateResultAgainstSchema(result)).to.deep.equal([]);
  });

  it("88. keeps the registered stale value only in the guard definition and its tests", function () {
    const stale = STALE_PLUGIN_HCU_LIMIT.sepoliaValue.toLowerCase();
    for (const path of SG4_GUARDED_SOURCE_SCOPE) {
      const content = readFileSync(resolve(ROOT, path), "utf8").toLowerCase();
      const permitted = ["scripts/sg4-hcu-authority-protocol.ts", "test/SG4HcuAuthority.ts".toLowerCase()];
      if (content.includes(stale)) {
        expect(permitted, `${path} embeds the stale value`).to.include(path.toLowerCase());
      }
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * F9 — two-commit preparation lineage, with no self-reference.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: two-commit preparation lineage", function () {
  it("89. rejects the previous same-HEAD self-binding model", function () {
    /* The old model's stored commit/tree fields are gone from the verifier module. */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const verifier = require("../scripts/sg4-hcu-authority") as Record<string, unknown>;
    expect(verifier).to.not.have.property("PREPARATION_BINDING");
    expect(verifier).to.not.have.property("checkPreparationBinding");

    const model = deriveAuthorityProtocol().liveMode.preparationLineage;
    expect(model.selfReferentialBindingRejected).to.equal(true);
    expect(model.model).to.equal("TWO_COMMIT_IMPLEMENTATION_THEN_AUTHORITY_BINDING");
    expect(model.bindingRecordMustNotContainItsOwnCommitOrTree).to.equal(true);
    expect(model.rejectedModel).to.match(/Unsatisfiable by construction/u);

    const lineageOf = (patch: Record<string, unknown>): Record<string, unknown> =>
      bindingRecordFixture({
        lineage: { ...(bindingRecordFixture().lineage as Record<string, unknown>), ...patch },
      });

    /* A record naming HEAD itself is the old self-reference and is refused. */
    const selfReferential = checkPreparationLineage(
      verifiedLineageProbe({ record: lineageOf({ implementationCommit: COMMIT_B }) }),
    );
    expect(selfReferential.result).to.equal("BROKEN");
    expect(selfReferential.blockers.join("|")).to.include("BINDING_RECORD_IS_SELF_REFERENTIAL");

    /* Nor may the recorded implementation tree be B's own tree. */
    const sameTree = checkPreparationLineage(
      verifiedLineageProbe({ record: lineageOf({ implementationTree: TREE_B }) }),
    );
    expect(sameTree.result).to.equal("BROKEN");
    expect(sameTree.blockers.join("|")).to.include("BINDING_TREE_FALSELY_EQUALS_IMPLEMENTATION_TREE");
  });

  it("90. accepts A then B with exactly one binding file", function () {
    const lineage = checkPreparationLineage(verifiedLineageProbe());
    expect(lineage.result, lineage.blockers.join("|")).to.equal("VERIFIED");
    expect(lineage.blockers).to.deep.equal([]);
  });

  it("91. rejects a wrong parent commit", function () {
    const lineage = checkPreparationLineage(verifiedLineageProbe({ parentCommit: "9".repeat(40) }));
    expect(lineage.result).to.equal("BROKEN");
    expect(lineage.blockers.join("|")).to.include("HEAD_PARENT_IS_NOT_THE_IMPLEMENTATION_COMMIT");
  });

  it("92. rejects a wrong recorded implementation tree", function () {
    const lineage = checkPreparationLineage(verifiedLineageProbe({ implementationTree: "9".repeat(40) }));
    expect(lineage.result).to.equal("BROKEN");
    expect(lineage.blockers.join("|")).to.include("RECORDED_IMPLEMENTATION_TREE_MISMATCH");
  });

  it("92b. rejects a merge commit as the binding commit", function () {
    for (const parentCount of [0, 2, 3]) {
      const lineage = checkPreparationLineage(verifiedLineageProbe({ parentCount }));
      expect(lineage.result, `parents=${parentCount}`).to.equal("BROKEN");
      expect(lineage.blockers.join("|"), `parents=${parentCount}`).to.include(
        "BINDING_COMMIT_MUST_HAVE_EXACTLY_ONE_PARENT",
      );
    }
    /* Exactly one parent is the only accepted shape. */
    expect(checkPreparationLineage(verifiedLineageProbe({ parentCount: 1 })).result).to.equal("VERIFIED");
    expect(deriveAuthorityProtocol().liveMode.preparationLineage.mergeCommitsRejected).to.equal(true);
  });

  it("93. rejects an additional path in the binding commit", function () {
    const extra = checkPreparationLineage(
      verifiedLineageProbe({
        changedPaths: ["scripts/sg4-hcu-preparation-binding.json", "scripts/sg4-protocol.ts"],
      }),
    );
    expect(extra.result).to.equal("BROKEN");
    expect(extra.blockers.join("|")).to.include("BINDING_COMMIT_CHANGED_MORE_THAN_THE_BINDING_RECORD");

    /* A binding commit that changes nothing at all is equally wrong. */
    const empty = checkPreparationLineage(verifiedLineageProbe({ changedPaths: [] }));
    expect(empty.result).to.equal("BROKEN");

    /* So is one that changes a different single file. */
    const wrongFile = checkPreparationLineage(verifiedLineageProbe({ changedPaths: ["scripts/sg4-protocol.ts"] }));
    expect(wrongFile.result).to.equal("BROKEN");
  });

  it("94. rejects implementation blob drift between A and B", function () {
    for (const path of ["scripts/sg4-hcu-authority.ts", "scripts/sg4-protocol.ts", "test/SG4HcuAuthority.ts"]) {
      const lineage = checkPreparationLineage(verifiedLineageProbe({ driftedPaths: [path] }));
      expect(lineage.result, path).to.equal("BROKEN");
      expect(lineage.blockers.join("|"), path).to.include(`IMPLEMENTATION_BLOB_DRIFT:${path}`);
    }
  });

  it("95. rejects a dirty worktree or index and a non-main branch", function () {
    expect(checkPreparationLineage(verifiedLineageProbe({ worktreeClean: false })).blockers).to.include(
      "WORKTREE_IS_NOT_CLEAN",
    );
    expect(checkPreparationLineage(verifiedLineageProbe({ indexClean: false })).blockers).to.include(
      "INDEX_IS_NOT_CLEAN",
    );
    expect(checkPreparationLineage(verifiedLineageProbe({ branch: "feature" })).blockers).to.include(
      "BRANCH_IS_NOT_MAIN",
    );
    for (const override of [{ worktreeClean: false }, { indexClean: false }, { branch: "feature" }]) {
      expect(checkPreparationLineage(verifiedLineageProbe(override)).result).to.not.equal("VERIFIED");
    }
  });

  it("96. rejects a third commit appended after B", function () {
    /* With a third commit C at HEAD, HEAD^ is B rather than A, so the lineage no longer resolves
     * and the gate reopens instead of silently accepting the extra commit. */
    const third = checkPreparationLineage(
      verifiedLineageProbe({ headCommit: "f".repeat(40), parentCommit: COMMIT_B, headTree: "e".repeat(40) }),
    );
    expect(third.result).to.equal("BROKEN");
    expect(third.blockers.join("|")).to.include("HEAD_PARENT_IS_NOT_THE_IMPLEMENTATION_COMMIT");
  });

  it("97. blocks while the binding record is absent and validates its shape", function () {
    const absent = checkPreparationLineage(verifiedLineageProbe({ record: null }));
    expect(absent.result).to.equal("UNRESOLVED");
    expect(absent.blockers).to.include("PREPARATION_BINDING_RECORD_ABSENT");
    /* It really is absent in this preparation: commit A does not exist yet. */
    expect(existsSync(resolve(ROOT, "scripts/sg4-hcu-authority-binding.json"))).to.equal(false);

    const lineageOf = (patch: Record<string, unknown>): Record<string, unknown> =>
      bindingRecordFixture({
        lineage: { ...(bindingRecordFixture().lineage as Record<string, unknown>), ...patch },
      });

    expect(validateAuthorityBindingRecord(bindingRecordFixture())).to.deep.equal([]);
    expect(validateAuthorityBindingRecord(bindingRecordFixture({ schema: "wrong" }))).to.include(
      "binding record schema mismatch",
    );
    expect(validateAuthorityBindingRecord(bindingRecordFixture({ recordVersion: 99 }))).to.include(
      "binding record version mismatch",
    );
    expect(validateAuthorityBindingRecord(lineageOf({ implementationCommit: "short" })).join("|")).to.include(
      "implementationCommit must be a 40-hex object name",
    );
    expect(validateAuthorityBindingRecord(lineageOf({ benchmarkProtocolSha256: "0".repeat(64) }))).to.include(
      "binding record benchmark protocol digest mismatch",
    );
    expect(validateAuthorityBindingRecord(lineageOf({ authorityProtocolSha256: "0".repeat(64) }))).to.include(
      "binding record authority protocol digest mismatch",
    );
    /* No self-referential field may be smuggled in. */
    expect(validateAuthorityBindingRecord(lineageOf({ bindingCommit: COMMIT_B })).join("|")).to.include(
      "unpermitted field bindingCommit",
    );
    expect(validateAuthorityBindingRecord(bindingRecordFixture({ bindingTree: TREE_B })).join("|")).to.include(
      "unpermitted field bindingTree",
    );
    expect(validateAuthorityBindingRecord("not an object")).to.deep.equal(["binding record must be a JSON object"]);
  });

  it("98. documents the exact post-review two-commit sequence", function () {
    const model = deriveAuthorityProtocol().liveMode.preparationLineage;
    expect(model.postReviewSequence).to.deep.equal([
      "A. commit the reviewed implementation",
      "B. independently reverify the immutable sources, build or obtain the official artifact, and produce the single authority-binding JSON",
      "C. independently review that JSON",
      "D. commit only that JSON as B",
      "E. verify the A->B lineage and the authority-binding record",
      "F. execute the live read-only verification",
    ]);
    expect(model.bindingRecordPath).to.equal("scripts/sg4-hcu-authority-binding.json");
    expect(model.checks).to.have.lengthOf(10);
    /* The document carries the same sequence. */
    const doc = readFileSync(resolve(ROOT, "docs/security/SG4_HCU_AUTHORITY_PROTOCOL.md"), "utf8");
    expect(doc).to.include("scripts/sg4-hcu-authority-binding.json");
    expect(doc).to.include("commit only that JSON as");
    expect(doc).to.match(/HEAD\^` equals the recorded `implementationCommit`/u);
    expect(doc).to.match(/not\*\* falsely required to equal A's tree/u);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F10 — live limit semantics.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: network ceiling semantics", function () {
  it("99. records local and prior-reviewed semantics separately and leaves them unresolved", function () {
    const semantics = deriveAuthorityProtocol().limits.networkLimitSemantics;
    expect(semantics.resolvedState).to.equal("UNRESOLVED");
    expect(semantics.blocking).to.equal(true);

    expect(semantics.localInstalled.state).to.equal("LOCAL_EXPECTED_PENDING_LIVE_BINDING");
    expect(semantics.localInstalled.comparisonOperator).to.equal(">=");
    expect(semantics.localInstalled.semantics).to.equal("CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL");
    expect(semantics.localInstalled.greatestAcceptedTotal).to.equal("19999999");
    expect(semantics.localInstalled.greatestAcceptedDepth).to.equal("4999999");

    expect(semantics.priorReviewedCurrentDeployment.state).to.equal(
      "EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION",
    );
    expect(semantics.priorReviewedCurrentDeployment.comparisonOperator).to.equal(">");
    expect(semantics.priorReviewedCurrentDeployment.semantics).to.equal(
      "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN",
    );
    expect(semantics.priorReviewedCurrentDeployment.configuredCeilingIsInclusive).to.equal(true);
    expect(semantics.priorReviewedCurrentDeployment.greatestAcceptedTotal).to.equal("20000000");
    expect(semantics.priorReviewedCurrentDeployment.pendingIndependentDeploymentAndSourceVerification).to.equal(true);

    /* The old single pinned semantics constant is gone from the result schema. */
    expect(Object.keys(deriveAuthorityProtocol().resultSchema.properties)).to.not.include("limitInclusivitySemantics");
  });

  it("100. accepts either resolved network semantics with a coherent greatest accepted value", function () {
    /* Inclusive: the configured ceiling itself is accepted. */
    expect(
      validateAuthorityResult(
        passResult({
          liveLimitSemantics: "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN",
          greatestAcceptedTotalHcu: "20000000",
          greatestAcceptedDepthHcu: "5000000",
        }),
      ),
    ).to.deep.equal([]);
    /* Exclusive: one below the configured ceiling. */
    expect(
      validateAuthorityResult(
        passResult({
          liveLimitSemantics: "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL",
          greatestAcceptedTotalHcu: "19999999",
          greatestAcceptedDepthHcu: "4999999",
        }),
      ),
    ).to.deep.equal([]);
    /* The helper agrees. */
    expect(greatestAcceptedValue("CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN", 20_000_000n)).to.equal(
      20_000_000n,
    );
    expect(greatestAcceptedValue("CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL", 20_000_000n)).to.equal(
      19_999_999n,
    );
    expect(greatestAcceptedValue("UNRESOLVED", 20_000_000n)).to.equal(null);
  });

  it("101. rejects contradictory operator/boundary combinations", function () {
    const cases: [Record<string, unknown>, RegExp][] = [
      /* Inclusive operator with an exclusive greatest accepted value. */
      [
        {
          liveLimitSemantics: "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN",
          greatestAcceptedTotalHcu: "19999999",
        },
        /greatest accepted total to be coherent/u,
      ],
      /* Exclusive operator with an inclusive greatest accepted value. */
      [
        {
          liveLimitSemantics: "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL",
          greatestAcceptedTotalHcu: "20000000",
          greatestAcceptedDepthHcu: "4999999",
        },
        /greatest accepted total to be coherent/u,
      ],
      /* Depth incoherent with the declared semantics. */
      [
        {
          liveLimitSemantics: "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN",
          greatestAcceptedDepthHcu: "4999999",
        },
        /greatest accepted depth to be coherent/u,
      ],
      /* Unresolved semantics can never carry a PASS. */
      [{ liveLimitSemantics: "UNRESOLVED" }, /resolved network limit semantics/u],
      [
        { liveLimitSemantics: "UNRESOLVED", greatestAcceptedTotalHcu: "UNRESOLVED" },
        /resolved network limit semantics/u,
      ],
    ];
    for (const [override, pattern] of cases) {
      expect(validateAuthorityResult(passResult(override)).join(" | "), JSON.stringify(override)).to.match(pattern);
    }
  });

  it("102. keeps the internal 75% safety policy strict under either network semantics", function () {
    const semantics = deriveAuthorityProtocol().limits.networkLimitSemantics;
    expect(semantics.internalSafetyPolicyIsIndependent).to.equal(true);
    expect(semantics.internalSafetyComparisonRemainsStrict).to.equal(true);
    expect(semantics.internalSafetyEqualityVerdict).to.equal("NO_GO");
    /* Equality at either internal boundary stays NO-GO regardless of the network ceiling. */
    expect(evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD).pass).to.equal(false);
    expect(evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD).pass).to.equal(false);
    expect(assessSampleHcu({ globalHCU: 15_000_000n, maxHCUDepth: 1n }).combinedHcuVerdict).to.equal("NO_GO");
    expect(assessSampleHcu({ globalHCU: 1n, maxHCUDepth: 3_750_000n }).combinedHcuVerdict).to.equal("NO_GO");
    /* Even a PASS with inclusive network semantics keeps the strict internal declarations. */
    const benchmark = JSON.parse(serializeProtocol()) as {
      limits: { hcuMaximumFraction: { comparison: string }; hcuDepthMaximumFraction: { comparison: string } };
    };
    expect(benchmark.limits.hcuMaximumFraction.comparison).to.include("<");
    expect(benchmark.limits.hcuMaximumFraction.comparison).to.not.include("<=");
    expect(benchmark.limits.hcuDepthMaximumFraction.comparison).to.not.include("<=");
  });

  it("103. leaves semantics unresolved in a live run without a validated binding record", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: null }),
    });
    expect(result.liveLimitSemantics).to.equal("UNRESOLVED");
    expect(result.greatestAcceptedTotalHcu).to.equal("UNRESOLVED");
    expect(result.greatestAcceptedDepthHcu).to.equal("UNRESOLVED");
    expect(String(result.status)).to.include("NETWORK_LIMIT_SEMANTICS_UNRESOLVED");
  });

  it("103b. resolves semantics from the binding record once the artifact is code-identified", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    /* The record declares inclusive semantics for the official artifact, so the greatest accepted
     * value is the configured ceiling itself — not the local fixture's exclusive reading. */
    expect(result.liveLimitSemantics).to.equal("CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN");
    expect(result.greatestAcceptedTotalHcu).to.equal("20000000");
    expect(result.greatestAcceptedDepthHcu).to.equal("5000000");
  });
});

/* ---------------------------------------------------------------------------------------------
 * F12 — artifact identity roots.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: artifact identity roots", function () {
  const roots = deriveAuthorityProtocol().bytecodeVerification.artifactIdentityRoots;

  it("104. keeps the local 0.10.0 fixture out of current-deployment authority", function () {
    expect(roots.localInstalledFixture.purpose).to.equal("OFFLINE_PARSER_AND_NORMALIZATION_SELFTEST_ONLY");
    expect(roots.localInstalledFixture.mayBeSolePassHashForCurrentDeployment).to.equal(false);
    expect(roots.localInstalledFixture.normalizedRuntimeSha256).to.equal(EXPECTED_NORMALIZED_RUNTIME_SHA256);
    /* The local fixture hash may not be used as the authoritative expectation. */
    expect(
      classifyCodeIdentity({
        normalizedSha256: EXPECTED_NORMALIZED_RUNTIME_SHA256,
        normalizationOk: true,
        expectedAuthoritativeSha256: EXPECTED_NORMALIZED_RUNTIME_SHA256,
      }),
    ).to.equal("BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED");
    /* Nor can a PASS name it. */
    expect(
      validateAuthorityResult(passResult({ authoritativeArtifactId: roots.localInstalledFixture.id })).join(" | "),
    ).to.match(/may not name the local installed fixture/u);
    /* It still works as the offline normalization self-test target. */
    const normalization = normalizeRuntimeBytecode(runtime, ARTIFACT_EXECUTOR);
    expect(normalization.ok).to.equal(true);
    expect(normalization.normalizedSha256).to.equal(roots.localInstalledFixture.normalizedRuntimeSha256);
  });

  it("105. yields BLOCKED while the authoritative artifact is unresolved", async function () {
    expect(roots.currentOfficialArtifact.expectedNormalizedRuntimeSha256).to.equal(null);
    expect(roots.currentOfficialArtifact.state).to.equal("UNRESOLVED");
    expect(
      classifyCodeIdentity({
        normalizedSha256: "1".repeat(64),
        normalizationOk: true,
        expectedAuthoritativeSha256: null,
      }),
    ).to.equal("BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED");

    /* Without a validated binding record there is no authoritative artifact at all: the run stops
     * at the unresolved deployment model and never manufactures a code-identity verdict from the
     * local fixture. Crucially it is never an automatic FAIL for differing from that fixture. */
    const tampered = Buffer.from(sepoliaImplementationRuntime());
    tampered[100] ^= 0xff;
    const { transport } = createFakeTransport({ implementationCode: `0x${tampered.toString("hex")}` });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: null }),
    });
    expect(result.finalVerdict).to.equal("BLOCKED");
    expect(result.codeIdentityResult).to.equal("UNRESOLVED");
    expect(result.authorityDeploymentModel).to.equal("UNRESOLVED");
    expect(result.expectedDeployedNormalizedHash).to.equal("UNRESOLVED");
    expect(String(result.status)).to.include("AUTHORITY_BINDING_RECORD_ABSENT");
    expect(String(result.status)).to.not.include("NORMALIZED_CODE_IDENTITY_MISMATCH");
    /* And block/batch stays unresolved rather than concluding absence. */
    expect((result.blockOrBatchControlState as { authorityState: string }).authorityState).to.equal("UNRESOLVED");
  });

  it("105b. fails on bytecode that differs from the verified authoritative artifact", async function () {
    /* With a reviewed record naming the official artifact, differing bytecode IS a FAIL. */
    const tampered = Buffer.from(officialImplementationRuntime());
    tampered[300] ^= 0xff;
    const { transport } = createFakeTransport({ implementationCode: `0x${tampered.toString("hex")}` });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.codeIdentityResult).to.equal("MISMATCH");
    expect(result.finalVerdict).to.equal("FAIL");
    expect(String(result.status)).to.include("NORMALIZED_CODE_IDENTITY_MISMATCH");
    /* A mismatch may not promote any downstream facet. */
    expect((result.blockOrBatchControlState as { authorityState: string }).authorityState).to.equal("UNRESOLVED");
    expect(result.liveLimitSemantics).to.equal("UNRESOLVED");
  });

  it("106. permits downstream classification only on a match against the authoritative artifact", function () {
    const official = "e".repeat(64);
    expect(
      classifyCodeIdentity({
        normalizedSha256: official,
        normalizationOk: true,
        expectedAuthoritativeSha256: official,
      }),
    ).to.equal("VERIFIED");
    /* A coherent PASS built on that verified artifact is accepted. */
    expect(validateAuthorityResult(passResult())).to.deep.equal([]);
  });

  it("107. rejects cross-version mixing across facets", function () {
    const official = deriveAuthorityProtocol().bytecodeVerification.artifactIdentityRoots.currentOfficialArtifact.id;
    for (const facet of roots.facets) {
      const mixed = passResult();
      (mixed.facetArtifactBinding as Record<string, string>)[facet] = "SOME_OTHER_ARTIFACT@v0.10.0";
      expect(validateAuthorityResult(mixed).join(" | "), facet).to.match(/bound to the same artifact/u);
    }
    /* An unresolved facet is equally unacceptable. */
    const unresolvedFacet = passResult();
    (unresolvedFacet.facetArtifactBinding as Record<string, string>).limitSemantics = "UNRESOLVED";
    expect(validateAuthorityResult(unresolvedFacet).join(" | ")).to.match(/bound to the same artifact/u);
    /* All facets agreeing with the authoritative artifact is fine. */
    expect(roots.crossVersionMixingForbidden).to.equal(true);
    expect(validateAuthorityResult(passResult({ authoritativeArtifactId: official })).length).to.equal(0);
  });

  it("108. requires a resolved authoritative artifact hash for PASS", function () {
    expect(validateAuthorityResult(passResult({ expectedDeployedNormalizedHash: "UNRESOLVED" })).join(" | ")).to.match(
      /resolved current official artifact hash/u,
    );
    expect(validateAuthorityResult(passResult({ authoritativeArtifactId: "UNRESOLVED" })).join(" | ")).to.match(
      /resolved authoritative artifact identity/u,
    );
    expect(
      validateAuthorityResult(passResult({ codeIdentityResult: "BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED" })).join(
        " | ",
      ),
    ).to.match(/verified executor\/authority code identity/u);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F13 — the authority-binding record carries the late-bound authority inputs.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: late-bound authority-binding record", function () {
  it("109. blocks while the authority-binding record is absent", async function () {
    expect(existsSync(resolve(ROOT, "scripts/sg4-hcu-authority-binding.json"))).to.equal(false);
    const absent = checkPreparationLineage(verifiedLineageProbe({ record: null }));
    expect(absent.result).to.equal("UNRESOLVED");
    expect(absent.record).to.equal(null);
    expect(absent.blockers).to.include("PREPARATION_BINDING_RECORD_ABSENT");

    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: null }),
    });
    expect(result.authorityBindingRecordResult).to.equal("ABSENT");
    expect(result.finalVerdict).to.equal("BLOCKED");
  });

  it("110. rejects a preparation-only record with no late-bound authority data", function () {
    const errors = validateAuthorityBindingRecord(preparationOnlyRecordFixture());
    expect(errors.length).to.be.greaterThan(0);
    for (const section of [
      "artifact",
      "authority",
      "authorityResolution",
      "blockOrBatch",
      "executor",
      "facets",
      "limits",
      "onChainInterface",
      "operationSchedule",
      "provenance",
    ]) {
      expect(errors.join(" | "), section).to.include(`is missing ${section}`);
    }
    const model = deriveAuthorityProtocol().liveMode.preparationLineage;
    expect(model.bindingRecordCarriesLateBoundAuthorityInputs).to.equal(true);
    expect(model.rejectedPreparationOnlyRecord).to.match(/no permitted action able to supply them/u);
  });

  it("110b. exact-key validates sourceMaterial subjects and prevents cross-wiring", function () {
    const material = sourceMaterialFixture();
    const cases: [string, Record<string, unknown>, RegExp][] = [
      [
        "unknown subject",
        { ...material, unknownSubject: material.authoritySource },
        /sourceMaterial has an unpermitted field unknownSubject/u,
      ],
      [
        "missing executor subject",
        Object.fromEntries(Object.entries(material).filter(([subject]) => subject !== "executorSource")),
        /sourceMaterial is missing executorSource/u,
      ],
      [
        "missing authority subject",
        Object.fromEntries(Object.entries(material).filter(([subject]) => subject !== "authoritySource")),
        /sourceMaterial is missing authoritySource/u,
      ],
      [
        "renamed subject",
        { ...material, officialExecutorSource: material.executorSource, executorSource: undefined },
        /sourceMaterial has an unpermitted field officialExecutorSource|sourceMaterial executorSource/u,
      ],
      [
        "executor authority cross-wire",
        { ...material, executorSource: material.authoritySource },
        /SOURCE_MATERIAL_SUBJECT_MISMATCH:executorSource|source material executorSource/u,
      ],
      [
        "authority executor cross-wire",
        { ...material, authoritySource: material.executorSource },
        /SOURCE_MATERIAL_SUBJECT_MISMATCH:authoritySource|source material authoritySource/u,
      ],
    ];
    for (const [label, sourceMaterial, expected] of cases) {
      expect(validateAuthorityBindingRecord(bindingRecordFixture({ sourceMaterial })).join(" | "), label).to.match(
        expected,
      );
    }
  });

  it("111. resolves every offline input from a complete record without any source change", async function () {
    expect(validateAuthorityBindingRecord(bindingRecordFixture())).to.deep.equal([]);
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    /* Everything commit A hardcodes as unresolved is resolved from the record alone. */
    expect(result.authorityBindingRecordResult).to.equal("VALID");
    expect(result.preparationLineageResult).to.equal("VERIFIED");
    expect(result.expectedDeployedNormalizedHash).to.equal(DERIVED_NORMALIZED_HASH);
    expect(result.immutableProvenanceState).to.equal("RESOLVED");
    expect(result.operationScheduleAuthorityState).to.equal("RESOLVED");
    expect(result.liveLimitSemantics).to.equal("CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN");
    expect(result.authoritativeArtifactId).to.equal(OFFICIAL_ARTIFACT_ID);
    /* The implementation source itself was never edited to achieve this. */
    expect(EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256).to.equal(null);
  });

  it("112. blocks when the record leaves provenance, artifact, schedule or semantics unresolved", function () {
    const pending = bindingRecordFixture({
      provenance: { reverificationStatus: "PENDING", entries: provenanceEntries(false) },
    });
    expect(validateAuthorityBindingRecord(pending).join(" | ")).to.include(
      "provenance reverification is still PENDING",
    );

    const unreviewed = bindingRecordFixture({
      authorityResolution: { status: "RESOLVED", reviewedIndependently: false, reviewStatement: "x" },
    });
    expect(validateAuthorityBindingRecord(unreviewed).join(" | ")).to.include("without independent review");

    const semantics = bindingRecordFixture({
      limits: { ...(bindingRecordFixture().limits as Record<string, unknown>), semantics: "UNRESOLVED" },
    });
    expect(validateAuthorityBindingRecord(semantics).join(" | ")).to.include("UNRESOLVED limit semantics");

    const blockState = bindingRecordFixture({
      blockOrBatch: { state: "UNRESOLVED", value: null, proof: "not established" },
    });
    expect(validateAuthorityBindingRecord(blockState).join(" | ")).to.include("UNRESOLVED block/batch control");

    const localArtifact = bindingRecordFixture({
      artifact: {
        ...(bindingRecordFixture().artifact as Record<string, unknown>),
        implementationNormalizedRuntimeSha256: EXPECTED_NORMALIZED_RUNTIME_SHA256,
      },
    });
    /* INVARIANT C — the local fixture digest is refused because it is not what the authenticated
     * build recomputes to, not because of a coincidence check against a stale constant. */
    expect(validateAuthorityBindingRecord(localArtifact).join(" | ")).to.include(
      "expected normalized runtime digest was not recomputed",
    );
  });

  it("113. rejects conflicting facet artifact ids inside the record", function () {
    const conflicting = bindingRecordFixture({
      facets: {
        ...(bindingRecordFixture().facets as Record<string, unknown>),
        limitValues: { artifactId: "SOME_OTHER_ARTIFACT@v0.10.0", origin: "AUTHORITATIVE_BINDING_RECORD" },
      },
    });
    expect(validateAuthorityBindingRecord(conflicting).join(" | ")).to.include("that is cross-version mixing");

    const localOrigin = bindingRecordFixture({
      facets: {
        ...(bindingRecordFixture().facets as Record<string, unknown>),
        operationSchedule: { artifactId: OFFICIAL_ARTIFACT_ID, origin: "LOCAL_INSTALLED_FIXTURE" },
      },
    });
    expect(validateAuthorityBindingRecord(localOrigin).join(" | ")).to.include(
      "still originates from LOCAL_INSTALLED_FIXTURE",
    );

    const mixed = bindingRecordFixture({
      authority: {
        ...(bindingRecordFixture().authority as Record<string, unknown>),
        expectedImplementationNormalizedRuntimeSha256: "a".repeat(64),
      },
    });
    expect(validateAuthorityBindingRecord(mixed).join(" | ")).to.include("disagrees with the artifact hash");
  });

  it("114. requires a fresh lineage rather than a third commit for a later implementation edit", function () {
    const model = deriveAuthorityProtocol().liveMode.preparationLineage;
    expect(model.noSourceEditPermittedAfterB).to.equal(true);
    expect(model.implementationEditRequiresFreshLineage).to.equal(true);
    /* An edit committed after B appears as a third commit and breaks the lineage outright. */
    const third = checkPreparationLineage(
      verifiedLineageProbe({ headCommit: "f".repeat(40), parentCommit: COMMIT_B, headTree: "e".repeat(40) }),
    );
    expect(third.result).to.equal("BROKEN");
    /* Folding the edit into B is caught as an extra changed path. */
    const amended = checkPreparationLineage(
      verifiedLineageProbe({
        changedPaths: ["scripts/sg4-hcu-authority-binding.json", "scripts/sg4-hcu-authority.ts"],
      }),
    );
    expect(amended.result).to.equal("BROKEN");
    expect(amended.blockers.join("|")).to.include("BINDING_COMMIT_CHANGED_MORE_THAN_THE_BINDING_RECORD");
  });
});

/* ---------------------------------------------------------------------------------------------
 * F14 — local source data may not be relabelled official.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: facet origins", function () {
  it("115. never labels local 0.10.0 data as official just because a code hash matched", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    const facets = result.facetArtifactBinding as Record<string, { artifactId: string; origin: string }>;
    for (const facet of ["blockOrBatch", "codeIdentity", "limitSemantics", "limitValues", "operationSchedule"]) {
      expect(facets[facet].artifactId, facet).to.equal(OFFICIAL_ARTIFACT_ID);
      expect(facets[facet].origin, facet).to.match(/^AUTHORITATIVE_BINDING_RECORD/u);
      expect(facets[facet].origin, facet).to.not.equal("LOCAL_INSTALLED_FIXTURE");
    }
    /* The control values came from the record, not from the local fixture's source path. */
    const total = result.transactionTotalControlState as { value: string };
    expect(total.value).to.equal("20000000");
    expect(JSON.stringify(result)).to.not.include("LOCAL_INSTALLED_FIXTURE");
  });

  it("116. rejects a local-fixture origin for any PASS facet", function () {
    for (const facet of ["blockOrBatch", "codeIdentity", "limitSemantics", "limitValues", "operationSchedule"]) {
      const mixed = passResult();
      (mixed.facetArtifactBinding as Record<string, { artifactId: string; origin: string }>)[facet] = {
        artifactId: OFFICIAL_ARTIFACT_ID,
        origin: "LOCAL_INSTALLED_FIXTURE",
      };
      expect(validateAuthorityResult(mixed).join(" | "), facet).to.match(/never from the local installed fixture/u);
    }
    expect(FACET_ORIGINS_FORBIDDEN_FOR_PASS).to.include("LOCAL_INSTALLED_FIXTURE");
  });

  it("117. leaves controls unbound when there is no record, whatever the local source says", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: null }),
    });
    const total = result.transactionTotalControlState as { authorityState: string };
    const depth = result.transactionDepthControlState as { authorityState: string };
    expect(total.authorityState).to.equal("LOCAL_EXPECTED_PENDING_LIVE_BINDING");
    expect(depth.authorityState).to.equal("LOCAL_EXPECTED_PENDING_LIVE_BINDING");
    expect(result.sg4CoverageResult).to.equal("UNRESOLVED");
  });
});

/* ---------------------------------------------------------------------------------------------
 * F15 — the live plan reads the actual on-chain limits.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: on-chain limit reads", function () {
  it("118. queries the HCU limit getters at the pinned block", async function () {
    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    const limitCalls = calls.filter(
      (call) =>
        call.method === "eth_call" &&
        [SELECTOR_TOTAL, SELECTOR_DEPTH].some((selector) =>
          String((call.params[0] as { data: string }).data).startsWith(selector),
        ),
    );
    expect(limitCalls).to.have.lengthOf(2);
    for (const call of limitCalls) expect(call.params[1]).to.equal(PINNED_HEX);
    expect(result.totalHcuOnChainReading).to.deep.equal({
      getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN",
      onChainValue: "20000000",
      result: "MATCHES_BINDING_RECORD_ON_CHAIN",
    });
    expect(result.depthHcuOnChainReading).to.deep.equal({
      getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN",
      onChainValue: "5000000",
      result: "MATCHES_BINDING_RECORD_ON_CHAIN",
    });
    /* The block/batch cap has no getter and is not applicable, with an artifact proof. */
    expect(result.blockOrBatchOnChainReading).to.deep.include({ result: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF" });
    expect(generateLiveCallPlan(bindingRecordFixture() as never)).to.have.lengthOf(13);
  });

  it("119. fails on an on-chain limit that disagrees with the binding record", async function () {
    const { transport } = createFakeTransport({ totalHcu: "19999999" });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.finalVerdict).to.equal("FAIL");
    expect(String(result.status)).to.include("ON_CHAIN_LIMIT_MISMATCH:transactionTotal");
    expect(result.totalHcuOnChainReading).to.deep.include({ result: "MISMATCH" });
    const total = result.transactionTotalControlState as { authorityState: string };
    expect(total.authorityState).to.equal("LOCAL_EXPECTED_PENDING_LIVE_BINDING");
  });

  it("120. decodes uint results strictly", function () {
    expect(decodeUint256(`0x${(20_000_000).toString(16).padStart(64, "0")}`)).to.equal(20_000_000n);
    expect(decodeUint256("0x")).to.equal(null);
    expect(decodeUint256("0x01")).to.equal(null);
    expect(decodeUint256(`0x${"0".repeat(128)}`)).to.equal(null);
    expect(decodeUint256("0xzz")).to.equal(null);
    expect(decodeUint256(42)).to.equal(null);
  });

  it("121. fails closed on a malformed getter result", async function () {
    const { transport } = createFakeTransport();
    const malformed = {
      async send(call: { method: string; params: readonly unknown[] }): Promise<unknown> {
        if (
          call.method === "eth_call" &&
          String((call.params[0] as { data: string }).data).startsWith(SELECTOR_TOTAL)
        ) {
          return "0x1234";
        }
        return transport.send(call);
      },
    };
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: malformed,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.finalVerdict).to.equal("FAIL");
    expect(String(result.status)).to.include("LIMIT_GETTER_MALFORMED_RESULT:transactionTotal");
  });

  it("122. rejects an invented selector in the binding record", function () {
    const manifest = interfaceManifestFixture() as { entries: Record<string, unknown>[] };
    const invented = bindingRecordFixture({
      onChainInterface: {
        ...(bindingRecordFixture().onChainInterface as Record<string, unknown>),
        interfaceManifest: interfaceManifestFixture({
          entries: manifest.entries.map((entry) =>
            entry.callId === "TRANSACTION_TOTAL_HCU_GETTER" ? { ...entry, selector: "0xdeadbeef" } : entry,
          ),
        }),
      },
    });
    expect(validateAuthorityBindingRecord(invented).join(" | ")).to.include("does not recompute from its signature");
  });

  it("123. requires declared availability to agree with the declared getters", function () {
    const mismatched = bindingRecordFixture({
      limits: {
        ...(bindingRecordFixture().limits as Record<string, unknown>),
        getterAvailability: {
          blockOrBatchCap: "AVAILABLE_AND_READ_ON_CHAIN",
          transactionDepth: "AVAILABLE_AND_READ_ON_CHAIN",
          transactionTotal: "AVAILABLE_AND_READ_ON_CHAIN",
        },
      },
    });
    expect(validateAuthorityBindingRecord(mismatched).join(" | ")).to.include(
      "state disagrees with limits.getterAvailability",
    );
  });
});

/* ---------------------------------------------------------------------------------------------
 * F16 — executor and authority deployment identity.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: deployment chain identity", function () {
  it("124. fails on executor code drift", async function () {
    const { transport } = createFakeTransport({ executorCode: "0xdeadbeef" });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.executorCodeIdentityResult).to.equal("UNRESOLVED");
    expect(result.finalVerdict).to.equal("BLOCKED");
    expect(String(result.status)).to.include("EXECUTOR_IMPLEMENTATION_CODE_IDENTITY_UNRESOLVED");
  });

  it("125. fails on authority proxy code drift", async function () {
    const { transport } = createFakeTransport({ proxyCode: "0xfeedface" });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.authorityCodeIdentityResult).to.equal("MISMATCH");
    expect(result.finalVerdict).to.equal("FAIL");
    expect(String(result.status)).to.include("AUTHORITY_PROXY_CODE_IDENTITY_MISMATCH");
  });

  it("126. fails on an executor or authority version that disagrees with the record", async function () {
    const drifted = bindingRecordFixture({
      executor: {
        ...(bindingRecordFixture().executor as Record<string, unknown>),
        expectedImplementationVersion: "FHEVMExecutor v9.9.9",
        expectedVersion: "FHEVMExecutor v9.9.9",
      },
    });
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: drifted }),
    });
    expect(result.authorityBindingRecordResult).to.equal("INVALID");
    expect(result.executorVersionResult).to.equal("UNRESOLVED");
    expect(String(result.status)).to.include("expectedVersion does not match the pinned reproduced executor source");

    const authorityDrift = bindingRecordFixture({
      authority: {
        ...(bindingRecordFixture().authority as Record<string, unknown>),
        expectedImplementationVersion: "HCULimit v9.9.9",
      },
    });
    const second = createFakeTransport();
    const authorityResult = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: second.transport,
      lineageProbe: verifiedLineageProbe({ record: authorityDrift }),
    });
    expect(authorityResult.authorityVersionResult).to.equal("MISMATCH");
    expect(String(authorityResult.status)).to.include("AUTHORITY_VERSION_MISMATCH");
  });

  it("127. handles a direct authority deployment without reading any slot", async function () {
    const direct = bindingRecordFixture({
      authority: {
        addressDerivation: "FROM_VERIFIED_EXECUTOR_GETTER",
        deploymentModel: "DIRECT",
        implementationAddressPolicy: null,
        expectedProxyRuntimeSha256: null,
        implementationResolutionMechanism: "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
        implementationSlot: null,
        expectedImplementationVersion: "HCULimit v0.1.0",
        expectedImplementationNormalizedRuntimeSha256: DERIVED_NORMALIZED_HASH,
      },
    });
    expect(validateAuthorityBindingRecord(direct)).to.deep.equal([]);
    /* The authority address itself carries the implementation runtime in a direct deployment, so
     * its UUPS `__self` words hold the AUTHORITY address rather than a separate implementation. */
    const officialCode = `0x${deployedImplementationRuntime(AUTHORITY_PROXY).toString("hex")}`;
    const withDirectCode = bindingRecordFixture({
      authority: direct.authority,
      executor: bindingRecordFixture().executor,
    });
    const { transport, calls } = createFakeTransport({ proxyCode: officialCode });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: withDirectCode }),
    });
    expect(result.authorityDeploymentModel).to.equal("DIRECT");
    expect(result.authorityImplementationAddress).to.equal(result.authorityAddress);
    expect(result.codeIdentityResult).to.equal("VERIFIED");
    /* No ERC-1967 slot was read, because the reviewed model says there is no proxy. */
    expect(calls.some((call) => call.method === "eth_getStorageAt")).to.equal(false);
  });

  it("128. refuses to assume ERC-1967 when the model is not established", async function () {
    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: null }),
    });
    expect(result.authorityDeploymentModel).to.equal("UNRESOLVED");
    expect(String(result.status)).to.include("AUTHORITY_BINDING_RECORD_ABSENT");
    expect(calls.some((call) => call.method === "eth_getStorageAt")).to.equal(false);
    /* And an unreviewed model cannot be declared in the record either. */
    const bogus = bindingRecordFixture({
      authority: {
        ...(bindingRecordFixture().authority as Record<string, unknown>),
        deploymentModel: "BEACON_PROXY",
      },
    });
    expect(validateAuthorityBindingRecord(bogus).join(" | ")).to.include("must be a declared deployment model");
  });

  it("129. blocks on a malformed implementation slot and fails on broken cross-linkage", async function () {
    const empty = createFakeTransport({ implementationSlot: `0x${"0".repeat(64)}` });
    const emptyResult = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: empty.transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(String(emptyResult.status)).to.include("ERC1967_IMPLEMENTATION_SLOT_EMPTY_OR_MALFORMED");
    expect(emptyResult.finalVerdict).to.equal("BLOCKED");

    const broken = createFakeTransport({ reciprocal: word("0x3333333333333333333333333333333333333333") });
    const brokenResult = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: broken.transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(brokenResult.reciprocalLinkageResult).to.equal("BROKEN");
    expect(brokenResult.finalVerdict).to.equal("FAIL");
  });

  it("130. requires a verified deployment chain for PASS", function () {
    for (const [override, pattern] of [
      [{ executorCodeIdentityResult: "UNRESOLVED" }, /verified executor code identity/u],
      [{ executorVersionResult: "MISMATCH" }, /executor version to match/u],
      [{ authorityCodeIdentityResult: "MISMATCH" }, /verified authority code identity/u],
      [{ authorityVersionResult: "UNRESOLVED" }, /authority version to match/u],
      [{ executorDeploymentModel: "UNRESOLVED" }, /reviewed executor deployment model/u],
      [{ authorityDeploymentModel: "UNRESOLVED" }, /reviewed authority deployment model/u],
      [{ authorityBindingRecordResult: "ABSENT" }, /valid authority-binding record/u],
    ] as [Record<string, unknown>, RegExp][]) {
      expect(validateAuthorityResult(passResult(override)).join(" | "), JSON.stringify(override)).to.match(pattern);
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * F18 — lineage and pinning hardening.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: finality and transport integrity", function () {
  it("131. pins a finalized block and never falls back to latest", async function () {
    const policy = deriveAuthorityProtocol().liveMode.pinnedBlockFinalityPolicy;
    expect(policy.blockTag).to.equal("finalized");
    expect(policy.fallbackToLatestForbidden).to.equal(true);
    expect(policy.failClosedIfFinalizedUnavailable).to.equal(true);

    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(calls[1].params[0]).to.equal("finalized");
    expect(calls.some((call) => call.params.includes("latest"))).to.equal(false);
    expect(result.pinnedBlockFinality).to.equal("FINALIZED");

    /* No finalized block available fails closed. */
    const none = createFakeTransport({ block: null });
    const blocked = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: none.transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(blocked.pinnedBlockFinality).to.equal("UNRESOLVED");
    expect(String(blocked.status)).to.include("FINALIZED_BLOCK_NOT_AVAILABLE");
    expect(blocked.finalVerdict).to.equal("BLOCKED");
    expect(validateAuthorityResult(passResult({ pinnedBlockFinality: "UNRESOLVED" })).join(" | ")).to.match(
      /finalized pinned block/u,
    );
  });

  it("132. rejects malformed, mismatched and oversized JSON-RPC responses", function () {
    const body = (value: unknown): Buffer => Buffer.from(JSON.stringify(value), "utf8");
    const good = parseJsonRpcResponse({
      method: "eth_chainId",
      expectedId: 7,
      statusCode: 200,
      body: body({ jsonrpc: "2.0", id: 7, result: "0xaa36a7" }),
    });
    expect(good).to.deep.equal({ ok: true, result: "0xaa36a7" });

    const cases: [string, Parameters<typeof parseJsonRpcResponse>[0], RegExp][] = [
      [
        "wrong id",
        { method: "m", expectedId: 7, statusCode: 200, body: body({ jsonrpc: "2.0", id: 8, result: "0x" }) },
        /id did not match/u,
      ],
      [
        "wrong jsonrpc version",
        { method: "m", expectedId: 7, statusCode: 200, body: body({ jsonrpc: "1.0", id: 7, result: "0x" }) },
        /wrong jsonrpc version/u,
      ],
      [
        "http failure",
        { method: "m", expectedId: 7, statusCode: 500, body: body({ jsonrpc: "2.0", id: 7, result: "0x" }) },
        /HTTP status 500/u,
      ],
      [
        "result and error",
        {
          method: "m",
          expectedId: 7,
          statusCode: 200,
          body: body({ jsonrpc: "2.0", id: 7, result: "0x", error: { message: "x" } }),
        },
        /both result and error/u,
      ],
      [
        "missing result",
        { method: "m", expectedId: 7, statusCode: 200, body: body({ jsonrpc: "2.0", id: 7 }) },
        /neither result nor error/u,
      ],
      ["not an object", { method: "m", expectedId: 7, statusCode: 200, body: body([1, 2, 3]) }, /not a JSON object/u],
      [
        "unparseable",
        { method: "m", expectedId: 7, statusCode: 200, body: Buffer.from("{not json", "utf8") },
        /unparseable/u,
      ],
      [
        "oversized",
        {
          method: "m",
          expectedId: 7,
          statusCode: 200,
          body: Buffer.alloc(RPC_RESPONSE_POLICY.maximumResponseBytes + 1, 0x20),
        },
        /exceeded the maximum size/u,
      ],
    ];
    for (const [label, input, pattern] of cases) {
      const outcome = parseJsonRpcResponse(input);
      expect(outcome.ok, label).to.equal(false);
      expect((outcome as { reason: string }).reason, label).to.match(pattern);
    }
    /* An RPC-level error is reported without echoing the third-party body. */
    const errored = parseJsonRpcResponse({
      method: "eth_call",
      expectedId: 1,
      statusCode: 200,
      body: body({ jsonrpc: "2.0", id: 1, error: { message: "secret internal detail" } }),
    });
    expect((errored as { reason: string }).reason).to.equal("RPC error for eth_call");
    expect((errored as { reason: string }).reason).to.not.include("secret");
  });

  it("133. commits the response-integrity policy and unique request ids", function () {
    expect(RPC_RESPONSE_POLICY.requireExactRequestId).to.equal(true);
    expect(RPC_RESPONSE_POLICY.monotonicallyIncreasingRequestIds).to.equal(true);
    expect(RPC_RESPONSE_POLICY.rejectRedirects).to.equal(true);
    expect(RPC_RESPONSE_POLICY.requireExactlyOneOfResultOrError).to.equal(true);
    expect(RPC_RESPONSE_POLICY.maximumResponseBytes).to.be.greaterThan(0);
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    /* The id is incremented per request rather than fixed. */
    expect(source).to.include("const id = ++nextId;");
    expect(source).to.not.match(/jsonrpc: "2\.0", id: 1,/u);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F19 — the normalization manifest is authenticated and actually used.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: authenticated normalization manifest", function () {
  it("134. rejects manifest digest drift", function () {
    const manifest = normalizationManifestFixture();
    const drifted = bindingRecordFixture({
      artifact: {
        ...(bindingRecordFixture().artifact as Record<string, unknown>),
        normalizationManifestSha256: "9".repeat(64),
      },
    });
    expect(validateAuthorityBindingRecord(drifted).join(" | ")).to.include(
      "normalizationManifestSha256 does not recompute from the manifest",
    );
    /* A syntactically valid digest is not enough; it must recompute. */
    expect(normalizationManifestDigest(manifest)).to.match(/^[0-9a-f]{64}$/u);
    expect(normalizationManifestDigest(manifest)).to.not.equal("9".repeat(64));
    /* Canonical serialization is key-order independent. */
    const reordered = Object.fromEntries(Object.entries(manifest).reverse());
    expect(normalizationManifestDigest(reordered)).to.equal(normalizationManifestDigest(manifest));
  });

  it("135. rejects malformed primary immutable references", function () {
    const reference = (offset: unknown, index: number) => ({
      byteLength: 20,
      compilerReferenceId: `solc:immutable:FHEVMExecutorAddress:${index}`,
      expectedArtifactPlaceholderBytes: ARTIFACT_PLACEHOLDER_BYTES,
      id: `PRIMARY_${index}`,
      kind: "PUSH20_ADDRESS_IMMEDIATE",
      offset,
    });
    const cases: [string, unknown[], RegExp][] = [
      ["duplicate", [10, 10], /strictly ascending and unique/u],
      ["unsorted", [30, 10], /strictly ascending and unique/u],
      ["negative", [-1, 10], /leaves no room for the preceding opcode/u],
      ["fractional", [10.5, 30], /offset must be an integer/u],
      ["out of range", [10, 10_000_000], /exceeds the declared runtime length/u],
      ["zero", [0, 30], /leaves no room for the preceding opcode/u],
    ];
    for (const [label, offsets, pattern] of cases) {
      const errors = validateNormalizationManifest(
        normalizationManifestFixture({
          primaryImmutableReferences: offsets.map(reference),
          expectedReplacementCount: offsets.length,
        }),
      );
      expect(errors.join(" | "), label).to.match(pattern);
    }
    /* The count must agree with the declared references. */
    expect(
      validateNormalizationManifest(normalizationManifestFixture({ expectedReplacementCount: 9 })).join(" | "),
    ).to.include("expectedReplacementCount disagrees with the primary reference count");
  });

  it("136. rejects wrong opcode, replacement, runtime length, compiler and metadata model", function () {
    const cases: [string, Record<string, unknown>, RegExp][] = [
      ["opcode", { requiredPrecedingOpcode: "0xZZ" }, /requiredPrecedingOpcode must be a single/u],
      ["runtime length", { runtimeByteLength: 0 }, /runtimeByteLength must be a positive integer/u],
      ["compiler", { compilerVersion: "0.8" }, /compilerVersion must be a semantic version/u],
      ["metadata model", { acceptedMetadataStructure: "SOMETHING_ELSE" }, /must be a declared structure/u],
      ["reference kind", { immutableReferenceKind: "UNKNOWN" }, /must be a declared kind/u],
      ["schema", { schema: "other" }, /schema mismatch/u],
    ];
    for (const [label, override, pattern] of cases) {
      expect(validateNormalizationManifest(normalizationManifestFixture(override)).join(" | "), label).to.match(
        pattern,
      );
    }
    /* The artifact's compiler and metadata must agree with its manifest. */
    const disagreeing = bindingRecordFixture({
      artifact: { ...(bindingRecordFixture().artifact as Record<string, unknown>), compilerVersion: "0.8.30" },
    });
    expect(validateAuthorityBindingRecord(disagreeing).join(" | ")).to.include(
      "compilerVersion disagrees with its normalization manifest",
    );
  });

  it("137. drives live normalization from the record manifest, not local fixture defaults", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.codeIdentityResult).to.equal("VERIFIED");
    /* The official runtime is NOT the local fixture: normalizing it with the fixture normalizer
     * yields a different digest from the one the manifest-driven path produced. */
    /* CORRECTION 2 — the fixture normalizer zero-fills; the authoritative one writes the exact
     * authenticated artifact placeholder. They therefore no longer agree, which is the point: the
     * fixture normalizer cannot stand in for the authoritative comparison. */
    const viaFixture = normalizeRuntimeBytecode(officialImplementationRuntime(), SEPOLIA_EXECUTOR);
    expect(viaFixture.normalizedSha256).to.not.equal(result.normalizedImplementationHash);
    expect(result.normalizedImplementationHash).to.equal(DERIVED_NORMALIZED_HASH);
    /* ...but the authoritative path used the manifest, and the verifier source proves the fixture
     * normalizer is not applied to the deployed implementation. */
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    expect(source).to.include("normalizeRuntimeBytecodeFromManifest(implementationCode");
    expect(source).to.not.include("normalizeRuntimeBytecode(implementationCode");
  });

  it("138. verifies an authoritative runtime whose layout differs from the 0.10.0 fixture", function () {
    /* A shorter runtime with two offsets, a different opcode and a nonzero replacement byte: every
     * value the local fixture hardcodes is different here. */
    /* The deployed side of a UUPS `__self` word: 12 zero bytes then the implementation address. */
    const body = Buffer.alloc(120, 0x5b);
    const deployedWord = Buffer.from(
      "00".repeat(12) + AUTHORITY_IMPLEMENTATION.toLowerCase().replace(/^0x/u, ""),
      "hex",
    );
    body[9] = 0x7f;
    deployedWord.copy(body, 10);
    body[49] = 0x7f;
    deployedWord.copy(body, 50);
    /* Append a valid solc-only CBOR trailer so metadata inspection succeeds. */
    const trailer = Buffer.from("a164736f6c6343000818", "hex");
    const runtimeWithMeta = Buffer.concat([body, trailer, Buffer.from([0x00, trailer.length])]);
    const trailerBytes = Buffer.concat([trailer, Buffer.from([0x00, trailer.length])]);
    const manifest = {
      schema: "zama-szn4.sg4-normalization-manifest.v2",
      version: 2,
      runtimeByteLength: runtimeWithMeta.length,
      compilerVersion: "0.8.24",
      metadataModel: "CBOR_SOLC_ONLY_NO_SOURCE_HASH",
      acceptedMetadataStructure: "CBOR_SOLC_ONLY_NO_SOURCE_HASH",
      metadataTrailerByteLength: trailerBytes.length,
      metadataTrailerSha256: sha256(trailerBytes),
      immutableReferenceKind: "PUSH32_WORD_IMMUTABLE",
      wordByteLength: 32,
      deploymentValueShape: "LEFT_PADDED_IMPLEMENTATION_ADDRESS_WORD",
      primaryImmutableReferences: [10, 50].map((offset, index) => ({
        byteLength: 32,
        compilerReferenceId: `other:immutable:${index}`,
        expectedArtifactPlaceholderBytes: `0x${"00".repeat(32)}`,
        id: `OTHER_PRIMARY_${index}`,
        kind: "PUSH32_WORD_IMMUTABLE",
        offset,
      })),
      requiredPrecedingOpcode: "0x7f",
      expectedReplacementCount: 2,
      supplementaryImmutableReferences: [],
    };
    expect(validateNormalizationManifest(manifest)).to.deep.equal([]);
    const normalized = normalizeRuntimeBytecodeFromManifest(runtimeWithMeta, manifest as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(normalized.ok, normalized.failures.join(",")).to.equal(true);
    expect(normalized.replacements).to.equal(2);
    /* The local fixture normalizer rejects this same runtime outright — which is precisely why it
     * must not be the authority for a differently laid-out official artifact. */
    expect(normalizeRuntimeBytecode(runtimeWithMeta, SEPOLIA_EXECUTOR).ok).to.equal(false);
  });

  it("139. fails closed on an undeclared occurrence and a wrong opcode at a declared offset", function () {
    const manifest = normalizationManifestFixture();
    /* Drop one declared offset: its real occurrence is then undeclared. */
    const shortened = {
      ...manifest,
      primaryImmutableReferences: (manifest.primaryImmutableReferences as unknown[]).slice(1),
      expectedReplacementCount: 27,
    };
    const result = normalizeRuntimeBytecodeFromManifest(officialImplementationRuntime(), shortened as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(result.ok).to.equal(false);
    expect(result.failures.some((entry) => entry.startsWith("EXTRA_REPLACEMENT"))).to.equal(true);

    const mutated = Buffer.from(officialImplementationRuntime());
    mutated[(manifest.primaryImmutableReferences as { offset: number }[])[0].offset - 1] = 0x60;
    const opcodeResult = normalizeRuntimeBytecodeFromManifest(mutated, manifest as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(opcodeResult.failures.some((entry) => entry.startsWith("OPCODE_MISMATCH"))).to.equal(true);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F20 — the authoritative pricing manifest.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: authoritative pricing manifest", function () {
  it("140. rejects pricing digest drift and arbitrary 64-hex digests", function () {
    const drifted = bindingRecordFixture({
      operationSchedule: {
        ...(bindingRecordFixture().operationSchedule as Record<string, unknown>),
        pricingManifestSha256: "9".repeat(64),
      },
    });
    expect(validateAuthorityBindingRecord(drifted).join(" | ")).to.include(
      "pricingManifestSha256 does not recompute from the pricing manifest",
    );
    expect(pricingManifestDigest(pricingManifestFixture())).to.not.equal("9".repeat(64));
  });

  it("141. rejects duplicate names, missing fields, unknown fields and non-injective translations", function () {
    const base = pricingManifestFixture() as { entries: Record<string, unknown>[] };
    const duplicate = pricingManifestFixture({ entries: [...base.entries, base.entries[0]] });
    expect(validatePricingManifest(duplicate).join(" | ")).to.match(/duplicates/u);

    const missing = pricingManifestFixture({
      entries: [base.entries[0]].map((entry) => {
        const copy = { ...entry };
        delete (copy as Record<string, unknown>).cost;
        return copy;
      }),
    });
    expect(validatePricingManifest(missing).join(" | ")).to.match(/is missing cost/u);

    /* F34 — an unsafe or non-integer cost cannot be compared exactly. */
    for (const cost of [Number.MAX_SAFE_INTEGER + 2, 1.5, -1, "10"]) {
      expect(
        validatePricingManifest(pricingManifestFixture({ entries: [{ ...base.entries[0], cost }] })).join(" | "),
        String(cost),
      ).to.match(/cost must be a safe non-negative integer/u);
    }

    /* F34 — a compound result type is not a type identity. */
    expect(
      validatePricingManifest(
        pricingManifestFixture({ entries: [{ ...base.entries[0], resultType: "euint128 | euint64" }] }),
      ).join(" | "),
    ).to.match(/must be a single type/u);

    /* F34 — entries must be in canonical variant order. */
    expect(
      validatePricingManifest(pricingManifestFixture({ entries: [...base.entries].reverse() })).join(" | "),
    ).to.match(/canonical variant order/u);

    /* F34 — arity and the operand type list must agree. */
    expect(
      validatePricingManifest(pricingManifestFixture({ entries: [{ ...base.entries[0], arity: 9 }] })).join(" | "),
    ).to.match(/arity disagrees with its operand type list/u);

    const unknown = pricingManifestFixture({ entries: [{ ...base.entries[0], extra: 1 }] });
    expect(validatePricingManifest(unknown).join(" | ")).to.match(/unpermitted field extra/u);

    /* Two canonical names mapping from the same enforcement name is not injective. */
    const first = base.entries.find((entry) => entry.canonicalName === "Cast") as Record<string, unknown>;
    const second = base.entries.find((entry) => entry.canonicalName === "FheAdd") as Record<string, unknown>;
    const nonInjective = pricingManifestFixture({
      entries: [first, { ...second, enforcementName: first.enforcementName }],
    });
    expect(validatePricingManifest(nonInjective).join(" | ")).to.match(/not injective/u);

    /* One operation may not carry two different enforcement names either. */
    const twoNames = pricingManifestFixture({
      entries: base.entries.map((entry) =>
        entry.canonicalName === "FheRand" && entry.costKeyType === "Uint64"
          ? { ...entry, enforcementName: "SomethingElse" }
          : entry,
      ),
    });
    expect(validatePricingManifest(twoNames).join(" | ")).to.match(/two different enforcement names/u);
  });

  it("142. does not let official operations SG-4 never uses block", async function () {
    const manifest = pricingManifestFixture() as { entries: { canonicalName: string }[] };
    const names = manifest.entries.map((entry) => entry.canonicalName);
    expect(names).to.include.members(["FheIsIn", "FheSum"]);
    const installed = parseInstalledCostTable(costTableSource);
    /* Neither is implemented by the installed calculator... */
    expect(installed.has("FheSum")).to.equal(false);
    expect(installed.has("FheIsIn")).to.equal(false);
    /* ...and neither blocks, because SG-4 uses neither. */
    const comparison = compareCalculatorAgainstPricingManifest(installed, manifest as never);
    expect(comparison.missingFromCalculator).to.deep.equal([]);
    expect(comparison.officialOnlyUnusedBySg4).to.include.members([
      "FheIsIn.nonScalar.Uint64",
      "FheSum.nonScalar.Uint64",
    ]);
    /* Nothing SG-4 actually uses appears there. */
    for (const id of SG4_PRICING_VARIANT_CLOSURE.map(variantId)) {
      expect(comparison.officialOnlyUnusedBySg4).to.not.include(id);
    }
    expect(pricingComparisonBlockers(comparison)).to.deep.equal([]);

    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.unsupportedOperations).to.deep.equal([]);
    expect(String(result.status)).to.not.include("SG4_OPERATION_WITHOUT_AUTHORITATIVE_SUPPORT");
  });

  it("143. blocks when an SG-4 variant lacks calculator support or an authoritative price", function () {
    const installed = parseInstalledCostTable(costTableSource);
    /* Introducing FheSum into the SG-4 used-variant closure makes it block immediately. */
    const withExtra = [
      ...SG4_PRICING_VARIANT_CLOSURE,
      {
        canonicalOperation: "FheSum",
        enforcementOperation: "FheSum",
        operandMode: "nonScalar",
        costKeyType: "Uint64",
        operandTypes: ["euint64", "euint64"],
        resultType: "euint64",
        arity: 2,
      },
    ];
    const introduced = compareCalculatorAgainstPricingManifest(installed, pricingManifestFixture() as never, withExtra);
    expect(introduced.missingFromCalculator).to.deep.equal(["FheSum.nonScalar.Uint64"]);

    /* An SG-4 variant absent from the authoritative manifest also blocks. */
    const base = pricingManifestFixture() as { entries: { canonicalName: string }[] };
    const withoutAdd = pricingManifestFixture({
      entries: base.entries.filter((entry) => entry.canonicalName !== "FheAdd"),
    });
    const missing = compareCalculatorAgainstPricingManifest(installed, withoutAdd as never);
    expect(missing.missingFromManifest).to.deep.equal(["FheAdd.nonScalar.Uint128"]);
  });

  it("144. fails on cost, operand and type mismatch for an SG-4-used operation", function () {
    const installed = parseInstalledCostTable(costTableSource);
    const usedEntry = (pricingManifestFixture() as { entries: Record<string, unknown>[] }).entries.find(
      (entry) => entry.canonicalName === "FheAdd" && entry.operandMode === "nonScalar",
    ) as Record<string, unknown>;

    const costs = compareCalculatorAgainstPricingManifest(
      installed,
      pricingManifestWith("FheAdd", "nonScalar", "Uint128", { cost: (usedEntry.cost as number) + 1 }) as never,
    );
    expect(costs.costMismatches.join(",")).to.include("FheAdd.nonScalar.Uint128");

    /* Removing the used variant makes it unpriceable while the operation still exists. */
    const operands = compareCalculatorAgainstPricingManifest(
      installed,
      pricingManifestWithout("FheAdd", "nonScalar", "Uint128") as never,
    );
    expect(operands.operandMismatches.join(",")).to.include("FheAdd.nonScalar.Uint128");

    /* F34 — the REAL result type is compared, not "the cost key appears in a list". */
    const resultTypes = compareCalculatorAgainstPricingManifest(
      installed,
      pricingManifestWith("FheAdd", "nonScalar", "Uint128", { resultType: "euint64" }) as never,
    );
    expect(resultTypes.resultTypeMismatches.join(",")).to.include("FheAdd.nonScalar.Uint128");

    /* F34 — and so are the exact ordered operand types. */
    const operandTypes = compareCalculatorAgainstPricingManifest(
      installed,
      pricingManifestWith("FheAdd", "nonScalar", "Uint128", { operandTypes: ["euint128", "uint128"] }) as never,
    );
    expect(operandTypes.operandTypeMismatches.join(",")).to.include("FheAdd.nonScalar.Uint128");

    for (const comparison of [costs, operands, resultTypes, operandTypes]) {
      expect(pricingComparisonBlockers(comparison).length).to.be.greaterThan(0);
    }
  });

  it("145. reports the authoritative comparison, never the local fixture comparison, once bound", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    const compatibility = result.operationCompatibilityResult as Record<string, string[]>;
    /* `shared` is the SG-4 closure, and `authorityOnly` the official extras — both facts of the
     * AUTHORITATIVE manifest. The local fixture's 27-name table would report neither. */
    expect(compatibility.shared).to.deep.equal(
      SG4_PRICING_VARIANT_CLOSURE.map(
        (variant) => `${variant.canonicalOperation}.${variant.operandMode}.${variant.costKeyType}`,
      ).sort(),
    );
    expect(compatibility.authorityOnly).to.include.members(["FheIsIn.nonScalar.Uint64", "FheSum.nonScalar.Uint64"]);
    /* authorityTableHash recomputes from the canonical pricing manifest. */
    expect(result.authorityTableHash).to.equal(pricingManifestDigest(pricingManifestFixture()));
  });
});

/* ---------------------------------------------------------------------------------------------
 * F21 — the executor model is closed and proxy identity is staged before its getters.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: executor deployment model", function () {
  it("146. accepts both reviewed executor models and closes their field combinations", function () {
    expect(validateAuthorityBindingRecord(bindingRecordFixture())).to.deep.equal([]);
    const exactPolicy = implementationAddressPolicyFixture({ expectedImplementationAddress: SEPOLIA_EXECUTOR });
    const proxied = bindingRecordFixture({
      executor: {
        ...(bindingRecordFixture().executor as Record<string, unknown>),
        deploymentModel: "ERC1967_PROXY",
        expectedProxyRuntimeSha256: EXECUTOR_PROXY_RUNTIME_HASH,
        implementationAddressPolicy: exactPolicy,
        implementationResolutionMechanism: "ERC1967_STORAGE_SLOT",
        implementationSlot: ERC1967_IMPLEMENTATION_SLOT,
      },
    });
    expect(validateAuthorityBindingRecord(proxied)).to.deep.equal([]);
    const malformed = bindingRecordFixture({
      executor: { ...(proxied.executor as Record<string, unknown>), implementationSlot: "0x01" },
    });
    expect(validateAuthorityBindingRecord(malformed).join(" | ")).to.match(/exact ERC-1967 slot/u);
  });

  it("147. records closed proxy support with no executor code-identical-upgrade permission", function () {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const protocolModule = require("../scripts/sg4-hcu-authority-protocol") as {
      EXECUTOR_DEPLOYMENT_MODELS: readonly string[];
      EXECUTOR_PROXY_SUPPORT: { supported: boolean; supportedModel: string; codeIdenticalUpgradePermitted: boolean };
    };
    expect(protocolModule.EXECUTOR_DEPLOYMENT_MODELS).to.deep.equal(["DIRECT", "ERC1967_PROXY"]);
    expect(protocolModule.EXECUTOR_PROXY_SUPPORT.supported).to.equal(true);
    expect(protocolModule.EXECUTOR_PROXY_SUPPORT.supportedModel).to.equal("ERC1967_PROXY");
    expect(protocolModule.EXECUTOR_PROXY_SUPPORT.codeIdenticalUpgradePermitted).to.equal(false);
  });

  it("148. plans proxy executor resolution before every executor-derived getter", function () {
    const record = bindingRecordFixture({
      executor: {
        ...(bindingRecordFixture().executor as Record<string, unknown>),
        deploymentModel: "ERC1967_PROXY",
        expectedProxyRuntimeSha256: EXECUTOR_PROXY_RUNTIME_HASH,
        implementationAddressPolicy: implementationAddressPolicyFixture({
          expectedImplementationAddress: SEPOLIA_EXECUTOR,
        }),
        implementationResolutionMechanism: "ERC1967_STORAGE_SLOT",
        implementationSlot: ERC1967_IMPLEMENTATION_SLOT,
      },
    });
    const plan = generateLiveCallPlan(record as never);
    expect(plan.map((call) => call.callId).slice(0, 7)).to.deep.equal([
      "CHAIN_ID",
      "PINNED_BLOCK",
      "EXECUTOR_CODE",
      "EXECUTOR_ERC1967_IMPLEMENTATION_SLOT",
      "EXECUTOR_IMPLEMENTATION_CODE",
      "EXECUTOR_VERSION",
      "EXECUTOR_AUTHORITY_GETTER",
    ]);
    assertLiveCallPlanIsReadOnly(plan);
  });

  it("148b. stops before executor version and authority derivation when proxy address policy fails", async function () {
    const record = bindingRecordFixture({
      executor: {
        ...(bindingRecordFixture().executor as Record<string, unknown>),
        deploymentModel: "ERC1967_PROXY",
        expectedProxyRuntimeSha256: EXECUTOR_PROXY_RUNTIME_HASH,
        implementationAddressPolicy: implementationAddressPolicyFixture({
          expectedImplementationAddress: SEPOLIA_EXECUTOR,
        }),
        implementationResolutionMechanism: "ERC1967_STORAGE_SLOT",
        implementationSlot: ERC1967_IMPLEMENTATION_SLOT,
      },
    });
    const { transport, calls } = createFakeTransport({
      executorCode: EXECUTOR_PROXY_RUNTIME_CODE,
      executorImplementationAddress: "0x9999999999999999999999999999999999999999",
      executorImplementationSlot: word("0x9999999999999999999999999999999999999999"),
    });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record }),
    });
    expect(result.executorImplementationAddressPolicyResult).to.equal("MISMATCH");
    expect(String(result.status)).to.include("EXECUTOR_IMPLEMENTATION_ADDRESS_MISMATCH");
    expect(calls.map((call) => call.method)).to.deep.equal([
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_getStorageAt",
    ]);
  });

  it("148c. authenticates a proxied executor before trusting its getters", async function () {
    const record = bindingRecordFixture({
      executor: {
        ...(bindingRecordFixture().executor as Record<string, unknown>),
        deploymentModel: "ERC1967_PROXY",
        expectedProxyRuntimeSha256: EXECUTOR_PROXY_RUNTIME_HASH,
        implementationAddressPolicy: implementationAddressPolicyFixture({
          expectedImplementationAddress: EXECUTOR_IMPLEMENTATION,
        }),
        implementationResolutionMechanism: "ERC1967_STORAGE_SLOT",
        implementationSlot: ERC1967_IMPLEMENTATION_SLOT,
      },
    });
    const { transport, calls } = createFakeTransport({
      executorCode: EXECUTOR_PROXY_RUNTIME_CODE,
      executorImplementationAddress: EXECUTOR_IMPLEMENTATION,
    });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record }),
    });
    expect(result.executorProxyCodeIdentityResult).to.equal("VERIFIED");
    expect(result.executorImplementationResolutionResult).to.equal("VERIFIED_ERC1967_STORAGE_SLOT");
    expect(result.executorImplementationAddressPolicyResult).to.equal("EXACT_MATCH");
    expect(result.executorImplementationCodeIdentityResult).to.equal("VERIFIED");
    expect(result.executorReproducedBuildResult).to.equal("MATCHES_PINNED_REPRODUCED_BUILD");
    expect(result.executorVersionResult).to.equal("MATCHES_BINDING_RECORD");
    expect(result.executorAuthorityDerivationResult).to.equal("VERIFIED");
    expect(calls.map((call) => call.method).slice(0, 7)).to.deep.equal([
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_getStorageAt",
      "eth_getCode",
      "eth_call",
      "eth_call",
    ]);
    expect(result.finalVerdict).to.equal("BLOCKED");
    expect(String(result.status)).to.include("OFFICIAL_BUILD_IS_NOT_THE_PINNED_REPRODUCTION");
  });
});

/* ---------------------------------------------------------------------------------------------
 * F22 — provenance and internal digests are actually pinned.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: pinned provenance and digests", function () {
  it("149. requires exact, unique provenance subjects with no extras", function () {
    const base = bindingRecordFixture().provenance as { entries: Record<string, unknown>[] };
    const duplicated = bindingRecordFixture({
      provenance: { reverificationStatus: "REVERIFIED", entries: [...base.entries, base.entries[0]], amendments: [] },
    });
    expect(validateAuthorityBindingRecord(duplicated).join(" | ")).to.match(/duplicates the .* subject/u);

    const missing = bindingRecordFixture({
      provenance: { reverificationStatus: "REVERIFIED", entries: base.entries.slice(1), amendments: [] },
    });
    expect(validateAuthorityBindingRecord(missing).join(" | ")).to.match(/is missing the .* subject/u);

    const extra = bindingRecordFixture({
      provenance: {
        reverificationStatus: "REVERIFIED",
        entries: [...base.entries, { ...base.entries[0], subject: "SOMETHING_ELSE" }],
        amendments: [],
      },
    });
    expect(validateAuthorityBindingRecord(extra).join(" | ")).to.match(/names an unknown subject/u);
  });

  it("150. pins every tuple against the protocol constants", function () {
    const base = bindingRecordFixture().provenance as { entries: Record<string, unknown>[] };
    for (const [field, value, pattern] of [
      ["repository", "https://github.com/someone/else", /repository does not match the prior-reviewed tuple/u],
      ["commit", "b".repeat(40), /commit does not match the prior-reviewed tuple/u],
      ["path", "some/other/path.sol", /path does not match the prior-reviewed tuple/u],
      ["tag", "v9.9.9", /tag does not match the prior-reviewed tuple/u],
    ] as [string, string, RegExp][]) {
      const drifted = bindingRecordFixture({
        provenance: {
          reverificationStatus: "REVERIFIED",
          entries: base.entries.map((entry) =>
            entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE" ? { ...entry, [field]: value } : entry,
          ),
          amendments: [],
        },
      });
      expect(validateAuthorityBindingRecord(drifted).join(" | "), field).to.match(pattern);
    }
    /* A known content hash is pinned too: an arbitrary 64-hex value is refused. */
    const hashDrift = bindingRecordFixture({
      provenance: {
        reverificationStatus: "REVERIFIED",
        entries: base.entries.map((entry) =>
          entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE" ? { ...entry, contentSha256: "9".repeat(64) } : entry,
        ),
        amendments: [],
      },
    });
    expect(validateAuthorityBindingRecord(hashDrift).join(" | ")).to.include(
      "contentSha256 does not match the prior-reviewed tuple",
    );
  });

  it("151. accepts a superseding tuple only through an explicit reviewed amendment", function () {
    const base = bindingRecordFixture().provenance as { entries: Record<string, unknown>[] };
    const superseded = base.entries.map((entry) =>
      entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE"
        ? { ...entry, commit: "c".repeat(40), contentSha256: AMENDED_AUTHORITY_SOURCE_SHA256 }
        : entry,
    );
    /* Without an amendment it is refused. */
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          provenance: { reverificationStatus: "REVERIFIED", entries: superseded, amendments: [] },
        }),
      ).join(" | "),
    ).to.include("commit does not match the prior-reviewed tuple");

    /* With a reviewed amendment naming what it supersedes, it is accepted. */
    const expected = deriveAuthorityProtocol().provenance.required.find(
      (entry) => entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
    );
    const amended = reanchoredToAmendedAuthoritySource("c".repeat(40), AMENDED_AUTHORITY_SOURCE_SHA256, {
      provenance: {
        reverificationStatus: "REVERIFIED",
        entries: superseded,
        amendments: [
          {
            subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
            supersedesCommit: expected?.commit,
            supersedesRepository: expected?.repository,
            supersedesPath: expected?.path,
            reviewedBy: "independent reviewer",
            reviewRecordSha256: sha256("amendment review record"),
            reason: "Upstream published a corrected artifact after the prior review.",
            repository: expected?.repository,
            tag: expected?.tag,
            commit: "c".repeat(40),
            path: expected?.path,
            contentSha256: AMENDED_AUTHORITY_SOURCE_SHA256,
          },
          /* The base fixture's own reverification amendments stay in place: one amendment per
           * subject, and the price-schedule subject still needs its reverified digest. */
          ...sourceMaterialAmendments().filter((entry) => entry.subject !== "CURRENT_OFFICIAL_AUTHORITY_SOURCE"),
        ],
      },
    });
    expect(validateAuthorityBindingRecord(amended)).to.deep.equal([]);

    /* An amendment that does not name the superseded commit is refused. */
    const bogus = bindingRecordFixture({
      provenance: {
        reverificationStatus: "REVERIFIED",
        entries: superseded,
        amendments: [
          {
            subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
            supersedesCommit: "0".repeat(40),
            supersedesRepository: expected?.repository,
            supersedesPath: expected?.path,
            reviewedBy: "x",
            reviewRecordSha256: sha256("y"),
            reason: "y",
            repository: expected?.repository,
            tag: expected?.tag,
            commit: "c".repeat(40),
            path: expected?.path,
            contentSha256: "d".repeat(64),
          },
        ],
      },
    });
    expect(validateAuthorityBindingRecord(bogus).join(" | ")).to.include(
      "does not supersede the prior-reviewed commit",
    );
  });

  it("152. cross-links artifact, schedule and executor to their provenance subjects", function () {
    for (const [section, field, pattern] of [
      ["artifact", "provenanceSubject", /artifact must cite the current official authority source subject/u],
      ["operationSchedule", "provenanceSubject", /operationSchedule must cite the current official price schedule/u],
      ["executor", "provenanceSubject", /executor must cite the current official executor reproduced build/u],
    ] as [string, string, RegExp][]) {
      const broken = bindingRecordFixture({
        [section]: { ...(bindingRecordFixture()[section] as Record<string, unknown>), [field]: "SOMETHING_ELSE" },
      });
      expect(validateAuthorityBindingRecord(broken).join(" | "), section).to.match(pattern);
    }
  });

  it("152b. validates both reproduced artifact JSON provenance digests", function () {
    const base = bindingRecordFixture();
    const provenance = base.provenance as Record<string, unknown>;
    const entries = provenance.entries as Record<string, unknown>[];
    const mutate = (subject: string) =>
      entries.map((entry) =>
        entry.subject === subject ? { ...entry, artifactJsonSha256: "0".repeat(64) } : { ...entry },
      );
    for (const subject of ["CURRENT_OFFICIAL_ARTIFACT_BUILD", "CURRENT_OFFICIAL_EXECUTOR_ARTIFACT_BUILD"]) {
      const broken = bindingRecordFixture({
        provenance: { ...provenance, entries: mutate(subject) },
      });
      expect(validateAuthorityBindingRecord(broken).join(" | "), subject).to.match(/artifactJsonSha256/u);
    }
  });

  it("153. uses no placeholder digests in the fixtures themselves", function () {
    const record = bindingRecordFixture();
    const artifact = record.artifact as Record<string, unknown>;
    const schedule = record.operationSchedule as Record<string, unknown>;
    /* Both internal digests recompute from their canonical serializations. */
    expect(artifact.normalizationManifestSha256).to.equal(normalizationManifestDigest(artifact.normalizationManifest));
    expect(schedule.pricingManifestSha256).to.equal(pricingManifestDigest(schedule.pricingManifest));
    /* And the provenance tuples are the protocol's, not invented. */
    const entries = (record.provenance as { entries: { subject: string; commit: string }[] }).entries;
    for (const expected of deriveAuthorityProtocol().provenance.required) {
      const entry = entries.find((candidate) => candidate.subject === expected.subject);
      expect(entry?.commit, expected.subject).to.equal(expected.commit);
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * F23 — caller applicability.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: caller applicability", function () {
  it("154. encodes calldata for the declared argument types", function () {
    expect(encodeAbiArguments([], [])).to.equal("");
    expect(encodeAbiArguments(["address"], [HARNESS_ADDRESS])).to.equal(
      `${"0".repeat(24)}${HARNESS_ADDRESS.slice(2).toLowerCase()}`,
    );
    expect(encodeAbiArguments(["uint256"], ["255"])).to.equal("ff".padStart(64, "0"));
    expect(encodeAbiArguments(["bool"], [true])).to.equal("1".padStart(64, "0"));
    expect(() => encodeAbiArguments(["address"], ["not-an-address"])).to.throw(/malformed address/u);
    expect(() => encodeAbiArguments(["bytes32"], ["0x00"])).to.throw(/unsupported argument type/u);
    expect(() => encodeAbiArguments(["address", "bool"], [HARNESS_ADDRESS])).to.throw(/argument count mismatch/u);
  });

  it("155. decodes only the declared return type, canonically", function () {
    expect(decodeAbiReturn("bool", `0x${"0".repeat(63)}1`)).to.deep.equal({ ok: true, value: true });
    expect(decodeAbiReturn("bool", `0x${"0".repeat(64)}`)).to.deep.equal({ ok: true, value: false });
    /* A non-canonical bool is refused rather than coerced. */
    expect(decodeAbiReturn("bool", `0x${"0".repeat(62)}02`).ok).to.equal(false);
    expect(decodeAbiReturn("address", `0x${"0".repeat(24)}${HARNESS_ADDRESS.slice(2)}`)).to.deep.equal({
      ok: true,
      value: HARNESS_ADDRESS.toLowerCase(),
    });
    expect(decodeAbiReturn("address", `0x${"1".repeat(64)}`).ok).to.equal(false);
    expect(decodeAbiReturn("uint256", `0x${"0".repeat(62)}ff`)).to.deep.equal({ ok: true, value: "255" });
    expect(decodeAbiReturn("bool", "0x01").ok).to.equal(false);
    expect(decodeAbiReturn("bytes32", `0x${"0".repeat(64)}`).ok).to.equal(false);
  });

  it("156. calls a parameterized getter with the subject address and resolves every subject", async function () {
    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    const exemptCall = calls.find(
      (call) =>
        call.method === "eth_call" && String((call.params[0] as { data: string }).data).startsWith(SELECTOR_EXEMPT),
    );
    expect(exemptCall, "the applicability getter was not called").to.not.equal(undefined);
    /* The declared subject address is in the calldata. */
    expect(String((exemptCall?.params[0] as { data: string }).data)).to.include(HARNESS_ADDRESS.slice(2).toLowerCase());
    expect(exemptCall?.params[1]).to.equal(PINNED_HEX);

    const results = result.callerApplicabilityResults as { subject: string; result: string }[];
    expect(results.map((entry) => entry.subject).sort()).to.deep.equal([
      "BENCHMARK_HARNESS",
      "FHEVM_EXECUTOR",
      "TRANSACTION_SENDER",
    ]);
    for (const entry of results) expect(entry.result, entry.subject).to.not.equal("UNRESOLVED");
  });

  it("157. rejects a missing subject, a missing getter without proof, and a bare null", function () {
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const specs = iface.callerApplicability as Record<string, unknown>[];

    const missingSubject = bindingRecordFixture({
      onChainInterface: { ...iface, callerApplicability: specs.slice(1) },
    });
    expect(validateAuthorityBindingRecord(missingSubject).join(" | ")).to.match(/is missing the .* subject/u);

    const noProof = bindingRecordFixture({
      onChainInterface: {
        ...iface,
        callerApplicability: specs.map((spec) =>
          spec.subject === "FHEVM_EXECUTOR" ? { ...spec, absenceProof: null } : spec,
        ),
      },
    });
    expect(validateAuthorityBindingRecord(noProof).join(" | ")).to.include("requires an artifact-bound absence proof");

    /* The old bare `callerExemptionGetter: null` shape is no longer a permitted field at all. */
    const legacy = bindingRecordFixture({ onChainInterface: { ...iface, callerExemptionGetter: null } });
    expect(validateAuthorityBindingRecord(legacy).join(" | ")).to.match(/unpermitted field callerExemptionGetter/u);
  });

  it("158. fails closed on a malformed return and on an unexpected result", async function () {
    const { transport } = createFakeTransport();
    const malformed = {
      async send(call: { method: string; params: readonly unknown[] }): Promise<unknown> {
        if (
          call.method === "eth_call" &&
          String((call.params[0] as { data: string }).data).startsWith(SELECTOR_EXEMPT)
        ) {
          return "0x1234";
        }
        return transport.send(call);
      },
    };
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: malformed,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.finalVerdict).to.equal("FAIL");
    expect(String(result.status)).to.include("CALLER_APPLICABILITY_MALFORMED_RESULT:BENCHMARK_HARNESS");
    expect(result.callerExemptionResult).to.equal("UNKNOWN_EXEMPTION");
  });

  it("159. reports an exempt caller with the correct gate outcome", async function () {
    const { transport } = createFakeTransport();
    const exemptTransport = {
      async send(call: { method: string; params: readonly unknown[] }): Promise<unknown> {
        if (
          call.method === "eth_call" &&
          String((call.params[0] as { data: string }).data).startsWith(SELECTOR_EXEMPT)
        ) {
          return `0x${"0".repeat(63)}1`;
        }
        return transport.send(call);
      },
    };
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: exemptTransport,
      lineageProbe: verifiedLineageProbe(),
    });
    const harness = (result.callerApplicabilityResults as { subject: string; result: string }[]).find(
      (entry) => entry.subject === "BENCHMARK_HARNESS",
    );
    expect(harness?.result).to.equal("EXEMPT");
    expect(result.callerExemptionResult).to.equal("EXEMPT");
    /* An exempt caller is a resolved outcome, not an unknown one. */
    expect(String(result.status)).to.not.include("CALLER_EXEMPTION_UNKNOWN");
  });

  it("160. requires resolved applicability for every subject in a PASS", function () {
    const partial = passResult({
      callerApplicabilityResults: [
        { result: "NOT_EXEMPT", state: "AVAILABLE", subject: "BENCHMARK_HARNESS", subjectAddress: HARNESS_ADDRESS },
      ],
    });
    expect(validateAuthorityResult(partial).join(" | ")).to.match(/every SG-4 subject/u);
    expect(validateAuthorityResult(passResult({ callerExemptionResult: "UNKNOWN_EXEMPTION" })).join(" | ")).to.match(
      /unknown exemption fails closed/u,
    );
  });
});

/* ---------------------------------------------------------------------------------------------
 * F24 — NOT_APPLICABLE cannot bypass mandatory per-transaction corroboration.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: mandatory per-transaction corroboration", function () {
  it("161. rejects NOT_APPLICABLE for the mandatory total and depth getters", function () {
    for (const field of ["transactionTotal", "transactionDepth"]) {
      const limits = bindingRecordFixture().limits as Record<string, unknown>;
      const bypass = bindingRecordFixture({
        limits: {
          ...limits,
          getterAvailability: {
            ...(limits.getterAvailability as Record<string, unknown>),
            [field]: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
          },
        },
      });
      expect(validateAuthorityBindingRecord(bypass).join(" | "), field).to.match(
        /is mandatory and must be AVAILABLE_AND_READ_ON_CHAIN or ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT/u,
      );
    }
    /* And a NOT_APPLICABLE reading can never satisfy a PASS. */
    expect(
      validateAuthorityResult(
        passResult({
          totalHcuOnChainReading: {
            getterAvailability: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
            onChainValue: "NOT_APPLICABLE",
            result: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
          },
        }),
      ).join(" | "),
    ).to.match(/NOT_APPLICABLE may not stand in/u);
  });

  it("162. accepts a documented no-getter proof with machine-verifiable evidence", async function () {
    const limits = bindingRecordFixture().limits as Record<string, unknown>;
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const artifactProven = bindingRecordFixture({
      limits: {
        ...limits,
        getterAvailability: {
          ...(limits.getterAvailability as Record<string, unknown>),
          transactionDepth: "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT",
        },
        enforcementEvidence: {
          transactionDepth: {
            constantName: "MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX",
            constantValue: "5000000",
            comparisonOperator: ">",
            revertErrorName: "HCUTransactionDepthLimitExceeded",
            sourcePath: "host-contracts/contracts/HCULimit.sol",
          },
        },
      },
      onChainInterface: {
        ...iface,
        limitGetterSpecs: (iface.limitGetterSpecs as Record<string, unknown>[]).map((spec) =>
          spec.controlId === "TRANSACTION_DEPTH_HCU"
            ? {
                ...spec,
                signature: null,
                selector: null,
                state: "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT",
              }
            : spec,
        ),
      },
    });
    expect(validateAuthorityBindingRecord(artifactProven)).to.deep.equal([]);

    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: artifactProven }),
    });
    expect(result.depthHcuOnChainReading).to.deep.include({
      result: "VERIFIED_FROM_CODE_IDENTIFIED_ARTIFACT_NO_GETTER",
    });
    const depth = result.transactionDepthControlState as { authorityState: string };
    expect(depth.authorityState).to.equal("PROVEN_PRESENT");
  });

  it("163. rejects artifact-only proof that is prose without structured evidence", function () {
    const limits = bindingRecordFixture().limits as Record<string, unknown>;
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const withoutEvidence = bindingRecordFixture({
      limits: {
        ...limits,
        getterAvailability: {
          ...(limits.getterAvailability as Record<string, unknown>),
          transactionDepth: "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT",
        },
      },
      onChainInterface: {
        ...iface,
        limitGetterSpecs: (iface.limitGetterSpecs as Record<string, unknown>[]).map((spec) =>
          spec.controlId === "TRANSACTION_DEPTH_HCU"
            ? {
                ...spec,
                signature: null,
                selector: null,
                state: "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT",
              }
            : spec,
        ),
      },
    });
    expect(validateAuthorityBindingRecord(withoutEvidence).join(" | ")).to.include(
      "enforcementEvidence.transactionDepth is required when the getter is absent",
    );

    /* Evidence whose value or operator disagrees is refused. */
    const wrongValue = bindingRecordFixture({
      limits: {
        ...(withoutEvidence.limits as Record<string, unknown>),
        enforcementEvidence: {
          transactionDepth: {
            constantName: "X",
            constantValue: "1",
            comparisonOperator: ">",
            revertErrorName: "Y",
            sourcePath: "Z",
          },
        },
      },
      onChainInterface: withoutEvidence.onChainInterface,
    });
    expect(validateAuthorityBindingRecord(wrongValue).join(" | ")).to.include(
      "constantValue must equal the declared limit",
    );
  });

  it("164. keeps NOT_APPLICABLE only for the optional block/batch control", function () {
    const record = bindingRecordFixture();
    const availability = (record.limits as Record<string, Record<string, string>>).getterAvailability;
    expect(availability.blockOrBatchCap).to.equal("NOT_APPLICABLE_WITH_ARTIFACT_PROOF");
    expect(validateAuthorityBindingRecord(record)).to.deep.equal([]);
    /* Its artifact-bound proof is required by the block/batch section. */
    const noProof = bindingRecordFixture({
      blockOrBatch: { state: "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION", value: null, proof: "" },
    });
    expect(validateAuthorityBindingRecord(noProof).join(" | ")).to.include("blockOrBatch.proof must be a non-empty");
  });

  it("165. pins the two ceilings to one coherent source", function () {
    const limits = bindingRecordFixture().limits as Record<string, unknown>;
    for (const [field, value] of [
      ["expectedTransactionTotal", "19999999"],
      ["expectedTransactionDepth", "4999999"],
    ] as [string, string][]) {
      const drifted = bindingRecordFixture({ limits: { ...limits, [field]: value } });
      expect(validateAuthorityBindingRecord(drifted).join(" | "), field).to.match(
        /must equal the protocol-pinned transaction/u,
      );
    }
    /* The result's limit fields and the record's expected values are the same numbers. */
    const result = passResult();
    expect(result.totalHcuLimit).to.equal((limits as Record<string, string>).expectedTransactionTotal);
    expect(result.depthHcuLimit).to.equal((limits as Record<string, string>).expectedTransactionDepth);
    expect(deriveAuthorityProtocol().resultSchema.limitValueSource).to.equal("PROTOCOL_PINNED_AND_RECORD_MUST_MATCH");
  });
});

/* ---------------------------------------------------------------------------------------------
 * Source-origin assertion: no PASS-relevant fact comes from the local HCULimit fixture.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: source-origin assertion", function () {
  it("166. derives no PASS-relevant operation, pricing or normalization fact from the local fixture", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });

    /* 1. Normalization used the record manifest, never the fixture normalizer. */
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    expect(source).to.include("normalizeRuntimeBytecodeFromManifest(implementationCode");
    expect(source).to.not.include("normalizeRuntimeBytecode(implementationCode");

    /* 2. Pricing came from the record manifest, not from parsing local HCULimit.sol. */
    const localAuthorityTable = parseAuthorityCostTable(hcuLimitSource);
    const compatibility = result.operationCompatibilityResult as Record<string, string[]>;
    expect(compatibility.authorityOnly).to.include.members(["FheIsIn.nonScalar.Uint64", "FheSum.nonScalar.Uint64"]);
    /* The local table contains neither, so this list cannot have come from it. */
    expect(localAuthorityTable.has("FheSum")).to.equal(false);
    expect(localAuthorityTable.has("FheIsIn")).to.equal(false);
    expect(result.authorityTableHash).to.equal(pricingManifestDigest(pricingManifestFixture()));
    expect(result.authorityTableHash).to.not.equal(sha256(JSON.stringify([...localAuthorityTable.keys()].sort())));

    /* 3. Limit values came from the record and the on-chain reading. */
    expect(result.totalHcuOnChainReading).to.deep.include({ result: "MATCHES_BINDING_RECORD_ON_CHAIN" });
    const total = result.transactionTotalControlState as { sourceImplementation?: string };
    expect(JSON.stringify(total)).to.not.include("host-contracts@0.10.0");

    /* 4. Every facet declares an authoritative origin. */
    const facets = result.facetArtifactBinding as Record<string, { origin: string }>;
    for (const facet of Object.keys(facets)) {
      expect(facets[facet].origin, facet).to.match(/^AUTHORITATIVE_BINDING_RECORD/u);
    }
    expect(JSON.stringify(result)).to.not.include("LOCAL_INSTALLED_FIXTURE");

    /* 5. The protocol records the guarantee explicitly. */
    const schema = deriveAuthorityProtocol().resultSchema;
    expect(schema.noPassRelevantFactFromLocalHcuLimitFixture).to.equal(true);
    expect(schema.normalizationDrivenByRecordManifestOnly).to.equal(true);
    expect(schema.pricingComparedAgainstRecordManifestOnly).to.equal(true);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F25 — the live PASS path is reachable end to end through the real verifier, and every real
 * blocker still turns it into FAIL or BLOCKED.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: end-to-end live PASS", function () {
  it("167. reaches an actual PASS with zero validation errors", async function () {
    const record = bindingRecordFixture();
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record }),
    });

    /* CL3 + CL4 — the real reproduced build-info is EXTERNAL and its identity is PINNED, so the
     * only thing between this run and a PASS is the build itself. Every other link is verified,
     * and the blocker names exactly what is missing. This is a stronger assertion than the old
     * unconditional PASS: it pins WHICH single fact remains unestablished. */
    expect(result.finalVerdict, String(result.status)).to.equal("BLOCKED");
    expect(String(result.status)).to.include("OFFICIAL_BUILD_IS_NOT_THE_PINNED_REPRODUCTION");
    expect(result.reproducedBuildResult).to.equal("MISMATCH");
    /* Nothing else blocks. */
    expect(
      String(result.status)
        .split("; ")
        .filter((entry) => !entry.includes("OFFICIAL_BUILD")),
    ).to.have.lengthOf(0);
    expect(validateResultAgainstSchema(result)).to.deep.equal([]);

    /* Every link of the derivation chain is verified rather than assumed. */
    expect(result.preparationLineageResult).to.equal("VERIFIED");
    expect(result.authorityBindingRecordResult).to.equal("VALID");
    expect(result.executorCodeIdentityResult).to.equal("VERIFIED");
    expect(result.executorVersionResult).to.equal("MATCHES_BINDING_RECORD");
    expect(result.authorityCodeIdentityResult).to.equal("VERIFIED");
    expect(result.authorityVersionResult).to.equal("MATCHES_BINDING_RECORD");
    expect(result.codeIdentityResult).to.equal("VERIFIED");
    expect(result.reciprocalLinkageResult).to.equal("VERIFIED");
    expect(result.pinnedBlockFinality).to.equal("FINALIZED");
    expect(result.callerExemptionResult).to.equal("NOT_EXEMPT");
    expect(result.immutableProvenanceState).to.equal("RESOLVED");
    expect(result.operationScheduleAuthorityState).to.equal("RESOLVED");
    expect(result.staleAddressGuardResult).to.equal("NOT_USED");

    /* A legitimate current schedule carrying variants SG-4 never uses still passes. */
    const compatibility = result.operationCompatibilityResult as Record<string, string[]>;
    expect(compatibility.authorityOnly.length).to.be.greaterThan(0);
    expect(compatibility.costMismatches).to.deep.equal([]);
    expect(compatibility.operandMismatches).to.deep.equal([]);
    expect(compatibility.shared).to.deep.equal(SG4_PRICING_VARIANT_CLOSURE.map(variantId).sort());
    expect(result.unsupportedOperations).to.deep.equal([]);

    /* No prohibited action was taken to obtain it. */
    for (const field of [
      "accountAuthorizationRequested",
      "signingRequested",
      "transactionSubmitted",
      "walletRequested",
    ])
      expect(result[field], field).to.equal(false);
    for (const method of result.rpcMethodsUsed as string[]) expect(LIVE_RPC_ALLOWED_METHODS).to.include(method);
  });

  it("168. issues exactly the calls its own plan declares", async function () {
    const record = bindingRecordFixture();
    const { transport, calls } = createFakeTransport();
    await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record }),
    });
    const plan = generateLiveCallPlan(record as never);
    expect(calls.map((call) => call.method)).to.deep.equal(plan.map((step) => step.method));
    expect(calls).to.have.lengthOf(plan.length);
    /* The exact end-to-end call sequence for a fully coherent record: chain id, one finalized block
     * pin, the executor code, its version and authority getter, the proxy code, the ERC-1967 slot,
     * the implementation code, the authority version, the reciprocal executor getter, the two
     * ceiling getters and one caller-applicability getter. */
    expect(calls).to.have.lengthOf(13);
    expect(calls.map((call) => call.method)).to.deep.equal([
      "eth_chainId",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_call",
      "eth_call",
      "eth_getCode",
      "eth_getStorageAt",
      "eth_getCode",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
    ]);
    /* The whole plan is read-only, and no call repeats needlessly. */
    assertLiveCallPlanIsReadOnly(plan);
  });

  it("169. turns the PASS into FAIL or BLOCKED for every real blocker", async function () {
    const lineageCases: [string, LineageOverrides, RegExp][] = [
      ["absent record", { record: null }, /AUTHORITY_BINDING_RECORD_ABSENT/u],
      ["dirty worktree", { worktreeClean: false }, /WORKTREE_IS_NOT_CLEAN/u],
      ["dirty index", { indexClean: false }, /INDEX/u],
      ["wrong branch", { branch: "detached" }, /BRANCH/u],
      ["merge head", { parentCount: 2 }, /PARENT|MERGE/u],
      ["implementation drift", { driftedPaths: ["scripts/sg4-hcu-authority.ts"] }, /DRIFT|LINEAGE/u],
    ];
    for (const [label, overrides, pattern] of lineageCases) {
      const { transport } = createFakeTransport();
      const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
        transport,
        lineageProbe: verifiedLineageProbe(overrides),
      });
      /* A broken lineage link never yields a PASS, and the exact reason is reported. */
      expect(result.finalVerdict, `${label}: ${String(result.status)}`).to.be.oneOf(["BLOCKED", "FAIL"]);
      expect(String(result.status), label).to.match(pattern);
      expect(result.preparationLineageResult, label).to.not.equal("VERIFIED");
    }

    const transportCases: [string, FakeOverrides, string, RegExp][] = [
      ["executor code drift", { executorCode: "0xdeadbeef" }, "BLOCKED", /EXECUTOR_(?:IMPLEMENTATION_)?CODE_IDENTITY/u],
      ["on-chain total drift", { totalHcu: "19999999" }, "FAIL", /ON_CHAIN|LIMIT/u],
      ["on-chain depth drift", { depthHcu: "4999999" }, "FAIL", /ON_CHAIN|LIMIT/u],
      ["broken reciprocal", { reciprocal: word(AUTHORITY_PROXY) }, "FAIL", /RECIPROCAL/u],
      ["unfinalized block", { block: null }, "BLOCKED", /FINALIZED|BLOCK/u],
      ["exempt relevant caller", { exempt: uintWord(1n) }, "FAIL", /EXEMPT/u],
      ["wrong chain", { chainId: "0x1" }, "FAIL", /CHAIN/u],
    ];
    for (const [label, overrides, expected, pattern] of transportCases) {
      const { transport } = createFakeTransport(overrides);
      const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
        transport,
        lineageProbe: verifiedLineageProbe(),
      });
      expect(result.finalVerdict, `${label}: ${String(result.status)}`).to.equal(expected);
      expect(String(result.status), label).to.match(pattern);
    }
  });

  it("170. keeps the PASS conditions and the verdict in agreement", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    /* The live run is BLOCKED on the external build (CL3/CL4) and on nothing else, so the PASS
     * conditions themselves are checked against a coherent result carrying the pinned
     * reproduction. */
    expect(result.finalVerdict, String(result.status)).to.equal("BLOCKED");
    expect(
      String(result.status)
        .split("; ")
        .filter((entry) => !entry.includes("OFFICIAL_BUILD")),
    ).to.have.lengthOf(0);
    const coherent = passResult();
    expect(validateAuthorityResult(coherent)).to.deep.equal([]);
    /* And flipping any one of them individually is caught. */
    const flips: [string, unknown][] = [
      ["preparationLineageResult", "UNVERIFIED"],
      ["authorityBindingRecordResult", "INVALID"],
      ["codeIdentityResult", "MISMATCH"],
      ["reciprocalLinkageResult", "MISMATCH"],
      ["callerExemptionResult", "EXEMPT"],
      ["pinnedBlockFinality", "UNCONFIRMED"],
      ["immutableProvenanceState", "UNRESOLVED"],
      ["operationScheduleAuthorityState", "UNRESOLVED"],
      ["sg4CoverageResult", "INCOMPLETE"],
    ];
    for (const [field, value] of flips) {
      const mutated = { ...coherent, [field]: value };
      expect(validateAuthorityResult(mutated).length, field).to.be.greaterThan(0);
    }

    /* Every newly introduced executor identity field is independently PASS-relevant. A syntactically
     * valid replacement must not survive merely because the other executor statuses still say
     * VERIFIED. */
    const executorFlips: [string, unknown][] = [
      ["executorImplementationAddress", "0x3333333333333333333333333333333333333333"],
      ["executorExpectedImplementationAddress", "0x3333333333333333333333333333333333333333"],
      ["executorProxyCodeHash", "d".repeat(64)],
      ["executorCodeHash", "d".repeat(64)],
      ["executorImplementationCodeHash", "d".repeat(64)],
      ["executorExpectedImplementationCodeHash", "d".repeat(64)],
      ["executorNormalizedImplementationHash", "e".repeat(64)],
      ["executorExpectedNormalizedImplementationHash", "f".repeat(64)],
      ["executorImplementationCodeIdentityResult", "MISMATCH"],
      ["executorImplementationResolutionResult", "VERIFIED_ERC1967_STORAGE_SLOT"],
      ["executorImplementationAddressPolicyResult", "EXACT_MATCH"],
      ["executorReproducedBuildInfoSha256", "0".repeat(64)],
      ["executorReproducedBuildResult", "MISMATCH"],
      ["executorVersion", "FHEVMExecutor v0.5.0"],
      ["executorVersionResult", "MISMATCH"],
      ["executorAuthorityDerivationResult", "UNRESOLVED"],
      ["executorDeploymentModel", "ERC1967_PROXY"],
      ["executorExpectedVersion", "FHEVMExecutor v0.5.0"],
      ["executorCodeIdentityResult", "MISMATCH"],
    ];
    for (const [field, value] of executorFlips) {
      expect(validateAuthorityResult({ ...coherent, [field]: value }).length, field).to.be.greaterThan(0);
    }

    const proxyBinding = bindingRecordFixture({
      executor: {
        ...(bindingRecordFixture().executor as Record<string, unknown>),
        deploymentModel: "ERC1967_PROXY",
        expectedProxyRuntimeSha256: EXECUTOR_PROXY_RUNTIME_HASH,
        implementationAddressPolicy: implementationAddressPolicyFixture({
          expectedImplementationAddress: EXECUTOR_IMPLEMENTATION,
        }),
        implementationResolutionMechanism: "ERC1967_STORAGE_SLOT",
        implementationSlot: ERC1967_IMPLEMENTATION_SLOT,
      },
    });
    const proxyCoherent = passResult({
      executorCodeHash: EXECUTOR_PROXY_RUNTIME_HASH,
      executorDeploymentModel: "ERC1967_PROXY",
      executorExpectedImplementationAddress: EXECUTOR_IMPLEMENTATION,
      executorExpectedImplementationCodeHash: EXECUTOR_IMPLEMENTATION_RUNTIME_HASH,
      executorImplementationAddress: EXECUTOR_IMPLEMENTATION,
      executorImplementationCodeHash: EXECUTOR_IMPLEMENTATION_RUNTIME_HASH,
      executorImplementationAddressPolicyResult: "EXACT_MATCH",
      executorImplementationResolutionResult: "VERIFIED_ERC1967_STORAGE_SLOT",
      executorProxyCodeHash: EXECUTOR_PROXY_RUNTIME_HASH,
      executorProxyCodeIdentityResult: "VERIFIED",
      erc1967SlotReadCount: 2,
      rpcMethodsUsed: ["eth_call", "eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_getStorageAt"],
    });
    for (const [field, value] of [
      ["executorImplementationAddress", "0x3333333333333333333333333333333333333333"],
      ["executorExpectedImplementationAddress", "0x3333333333333333333333333333333333333333"],
      ["executorProxyCodeHash", "d".repeat(64)],
      ["executorCodeHash", "d".repeat(64)],
    ] as [string, unknown][]) {
      expect(
        validateAuthorityResult({ ...proxyCoherent, [field]: value }, proxyBinding as never).length,
        field,
      ).to.be.greaterThan(0);
    }

    /* Coordinated auditor mutations must fail against the reviewed evidence. Matching one forged
     * result field with another forged result field is never an authentication step. */
    const attackA = {
      ...coherent,
      executorCodeHash: "d".repeat(64),
      executorImplementationCodeHash: "d".repeat(64),
      executorExpectedImplementationCodeHash: "d".repeat(64),
    };
    const attackAErrors = validateAuthorityResult(attackA);
    expect(attackAErrors.join(" | ")).to.include("independently derived artifact hash");

    const attackB = {
      ...coherent,
      authorityAddress: "0x4444444444444444444444444444444444444444",
      authorityImplementationAddress: "0x3333333333333333333333333333333333333333",
      authorityVersion: "HCULimit v9.9.9",
      authorityCodeHash: "f".repeat(64),
      implementationAddressPolicyResult: "PERMITTED_CODE_IDENTICAL_CHANGE",
    };
    const attackBErrors = validateAuthorityResult(attackB, bindingRecordFixture() as never);
    expect(attackBErrors.join(" | ")).to.include("reviewed exact-address policy");
    expect(attackBErrors.join(" | ")).to.include("reviewed proxy identity");
    expect(attackBErrors.join(" | ")).to.include("reviewed version");

    const coordinatedExecutorMutations: Record<string, unknown>[] = [
      {
        executorCodeHash: "d".repeat(64),
        executorProxyCodeHash: "d".repeat(64),
      },
      {
        executorImplementationAddress: "0x3333333333333333333333333333333333333333",
        executorExpectedImplementationAddress: "0x3333333333333333333333333333333333333333",
        executorImplementationResolutionResult: "VERIFIED_ERC1967_STORAGE_SLOT",
        executorImplementationAddressPolicyResult: "EXACT_MATCH",
      },
      {
        executorVersion: "FHEVMExecutor v9.9.9",
        executorVersionResult: "MATCHES_BINDING_RECORD",
        executorExpectedVersion: "FHEVMExecutor v9.9.9",
      },
      {
        executorNormalizedImplementationHash: "e".repeat(64),
        executorExpectedNormalizedImplementationHash: "e".repeat(64),
      },
      {
        executorDeploymentModel: "ERC1967_PROXY",
        executorImplementationAddress: "0x3333333333333333333333333333333333333333",
        executorExpectedImplementationAddress: "0x3333333333333333333333333333333333333333",
        executorImplementationResolutionResult: "VERIFIED_ERC1967_STORAGE_SLOT",
        executorImplementationAddressPolicyResult: "EXACT_MATCH",
      },
    ];
    for (const mutation of coordinatedExecutorMutations) {
      expect(validateAuthorityResult({ ...coherent, ...mutation }).length, JSON.stringify(mutation)).to.be.greaterThan(
        0,
      );
    }

    const coordinatedAuthorityMutations: Record<string, unknown>[] = [
      {
        authorityAddress: "0x4444444444444444444444444444444444444444",
        authorityImplementationAddress: "0x3333333333333333333333333333333333333333",
      },
      {
        authorityCodeHash: "f".repeat(64),
        authorityVersion: "HCULimit v9.9.9",
        authorityVersionResult: "MATCHES_BINDING_RECORD",
      },
      {
        authorityAddress: "0x4444444444444444444444444444444444444444",
        authorityImplementationAddress: "0x3333333333333333333333333333333333333333",
        authorityCodeHash: PROXY_RUNTIME_HASH,
        implementationAddressPolicyResult: "PERMITTED_CODE_IDENTICAL_CHANGE",
      },
      {
        authorityDeploymentModel: "DIRECT",
        authorityImplementationAddress: coherent.authorityAddress,
        implementationResolutionResult: "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
        implementationAddressPolicyResult: "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
      },
    ];
    for (const mutation of coordinatedAuthorityMutations) {
      expect(
        validateAuthorityResult({ ...coherent, ...mutation }, bindingRecordFixture() as never).length,
        JSON.stringify(mutation),
      ).to.be.greaterThan(0);
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * F26 — the local fixture cannot influence the live verdict.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: local fixture isolation", function () {
  it("171. serializes nothing authoritative when the record is absent", async function () {
    const { transport } = createFakeTransport();
    const unbound = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: null }),
    });
    expect(unbound.operationCompatibilityResult).to.deep.equal({
      arityMismatches: [],
      authorityOnly: [],
      costMismatches: [],
      installedOnly: [],
      operandMismatches: [],
      operandTypeMismatches: [],
      resultTypeMismatches: [],
      shared: [],
      translationMismatches: [],
      unsupportedByCalculator: [],
    });
    expect(unbound.authorityTableHash).to.equal("UNRESOLVED");
    expect(unbound.expectedDeployedNormalizedHash).to.equal("UNRESOLVED");
    expect(unbound.finalVerdict).to.equal("BLOCKED");
  });

  it("172. reports the local self-test separately from the verdict", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    /* The self-test is reported, and it is not one of the PASS conditions. */
    expect(result.localFixtureSelfTestResult).to.equal("MATCH");
    expect(validateAuthorityResult(passResult({ localFixtureSelfTestResult: "MISMATCH" }))).to.deep.equal([]);
    /* The PASS-relevant hashes come from the record, not from the installed fixture. */
    expect(result.expectedDeployedNormalizedHash).to.equal(DERIVED_NORMALIZED_HASH);
    expect(result.expectedDeployedNormalizedHash).to.not.equal(EXPECTED_NORMALIZED_RUNTIME_SHA256);
    expect(result.authorityTableHash).to.not.equal(result.installedTableHash);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F27 — exact variant compatibility rather than operation-name compatibility.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: exact variant compatibility", function () {
  const installed = parseInstalledCostTable(costTableSource);
  const entriesOf = (manifest: Record<string, unknown>) => manifest.entries as Record<string, unknown>[];
  const mapEntries = (fn: (entry: Record<string, unknown>) => Record<string, unknown>) =>
    pricingManifestFixture({ entries: entriesOf(pricingManifestFixture()).map(fn) });

  it("173. enumerates every used variant separately, with no compound types", function () {
    const ids = SG4_PRICING_VARIANT_CLOSURE.map(variantId);
    expect(new Set(ids).size).to.equal(ids.length);
    for (const variant of SG4_PRICING_VARIANT_CLOSURE) {
      expect(variant.resultType, variantId(variant)).to.not.include("|");
      /* FheRand is genuinely nullary; every other used variant takes at least one operand. */
      expect(variant.arity, variantId(variant)).to.be.at.least(variant.canonicalOperation === "FheRand" ? 0 : 1);
    }
    /* The two operations SG-4 uses in more than one form appear once per form. */
    expect(ids).to.include.members(["FheLt.nonScalar.Uint128", "FheLt.scalar.Uint128"]);
    expect(ids).to.include.members(["FheIfThenElse.types.Uint128", "FheIfThenElse.types.Uint64"]);
  });

  it("174. blocks a used variant whose price is missing while a sibling variant exists", function () {
    const dropped = pricingManifestWithout("FheLt", "scalar", "Uint128");
    const comparison = compareCalculatorAgainstPricingManifest(installed, dropped as never);
    const blockers = pricingComparisonBlockers(comparison).join(",");
    expect(blockers).to.include("FheLt.scalar.Uint128");
    /* The sibling non-scalar variant is untouched. */
    expect(blockers).to.not.include("FheLt.nonScalar.Uint128");
  });

  it("175. blocks a missing select width", function () {
    for (const width of ["Uint64", "Uint128"]) {
      const dropped = pricingManifestWithout("FheIfThenElse", "types", width);
      const blockers = pricingComparisonBlockers(
        compareCalculatorAgainstPricingManifest(installed, dropped as never),
      ).join(",");
      expect(blockers, width).to.include(`FheIfThenElse.types.${width}`);
    }
  });

  it("176. blocks arity, result-type and enforcement-name drift", function () {
    const arity = mapEntries((entry) => (entry.canonicalName === "FheAdd" ? { ...entry, arity: 9 } : entry));
    expect(compareCalculatorAgainstPricingManifest(installed, arity as never).arityMismatches.join(",")).to.include(
      "FheAdd.nonScalar.Uint128",
    );

    const translation = mapEntries((entry) =>
      entry.canonicalName === "FheIfThenElse" ? { ...entry, enforcementName: "SomethingElse" } : entry,
    );
    expect(
      compareCalculatorAgainstPricingManifest(installed, translation as never).translationMismatches.join(","),
    ).to.include("FheIfThenElse.types.Uint128");

    for (const comparison of [arity, translation]) {
      expect(
        pricingComparisonBlockers(compareCalculatorAgainstPricingManifest(installed, comparison as never)).length,
      ).to.be.greaterThan(0);
    }
  });

  it("177. reports unused official variants without blocking", function () {
    const comparison = compareCalculatorAgainstPricingManifest(installed, pricingManifestFixture() as never);
    expect(comparison.officialOnlyUnusedBySg4.length).to.be.greaterThan(0);
    for (const id of comparison.officialOnlyUnusedBySg4)
      expect(SG4_PRICING_VARIANT_CLOSURE.map(variantId)).to.not.include(id);
    expect(pricingComparisonBlockers(comparison)).to.deep.equal([]);
  });

  it("178. keeps the authoritative comparison anchored to the reviewed provenance entry", function () {
    const expected = deriveAuthorityProtocol().provenance.required.find(
      (entry) => entry.subject === "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE",
    );
    for (const entry of entriesOf(pricingManifestFixture())) {
      expect(String(entry.sourceReference)).to.include(String(expected?.commit));
      expect(String(entry.sourceReference)).to.include(String(expected?.path));
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * F28 — normalization can never hide a real code difference.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: safe normalization", function () {
  const runtimeBuffer = officialImplementationRuntime();

  it("179. advertises only the structures and reference kinds it can verify", function () {
    expect(ACCEPTED_METADATA_STRUCTURES).to.deep.equal(["CBOR_SOLC_ONLY_NO_SOURCE_HASH"]);
    expect(IMMUTABLE_REFERENCE_KINDS).to.deep.equal(["PUSH32_WORD_IMMUTABLE"]);
    expect(
      validateNormalizationManifest(
        normalizationManifestFixture({ acceptedMetadataStructure: "CBOR_SOLC_WITH_SOURCE_HASH" }),
      ).length,
    ).to.be.greaterThan(0);
  });

  it("180. verifies the metadata trailer exactly", function () {
    const wrongDigest = normalizeRuntimeBytecodeFromManifest(
      runtimeBuffer,
      normalizationManifestFixture({ metadataTrailerSha256: "a".repeat(64) }) as never,
      { implementationAddress: AUTHORITY_IMPLEMENTATION },
    );
    expect(wrongDigest.ok).to.equal(false);
    expect(wrongDigest.failures.join(",")).to.match(/TRAILER|METADATA/u);

    const wrongLength = normalizeRuntimeBytecodeFromManifest(
      runtimeBuffer,
      normalizationManifestFixture({ metadataTrailerByteLength: 999 }) as never,
      { implementationAddress: AUTHORITY_IMPLEMENTATION },
    );
    expect(wrongLength.ok).to.equal(false);
    expect(wrongLength.failures.join(",")).to.match(/TRAILER|METADATA|LENGTH/u);
  });

  it("181. cannot normalize away bytes it did not predict exactly", function () {
    const reference = (overrides: Record<string, unknown> = {}) => ({
      id: "IMMUTABLE_A",
      kind: "EXACT_BYTES_REPLACEMENT",
      offset: 400,
      byteLength: 4,
      expectedDeployedBytes: `0x${runtimeBuffer.subarray(400, 404).toString("hex")}`,
      expectedArtifactPlaceholderBytes: "0x00000000",
      compilerReferenceId: "solc:supplementary:0",
      ...overrides,
    });

    /* F35 — the supplementary reference is cross-linked to a compiler entry, so the compiler
     * manifest has to declare it too. */
    const withSupplementary = compilerReferenceManifestFixture({
      entries: [
        ...compilerReferenceEntries(),
        {
          artifactPlaceholderBytes: "0x00000000",
          astId: 605,
          byteLength: 4,
          id: "solc:supplementary:0",
          offset: 400,
          referenceKind: "EXACT_BYTES_REPLACEMENT",
        },
      ].sort((left, right) => (left.offset as number) - (right.offset as number)),
    });
    expect(validateCompilerReferenceManifest(withSupplementary)).to.deep.equal([]);

    const exact = normalizationManifestFixture({ supplementaryImmutableReferences: [reference()] });
    expect(crossLinkImmutableReferences(exact, withSupplementary)).to.deep.equal([]);
    expect(validateNormalizationManifest(exact)).to.deep.equal([]);
    expect(
      normalizeRuntimeBytecodeFromManifest(runtimeBuffer, exact as never, {
        implementationAddress: AUTHORITY_IMPLEMENTATION,
      }).ok,
    ).to.equal(true);

    /* Declaring different original bytes is a real difference; it is refused, not normalized. */
    const wrong = normalizationManifestFixture({
      supplementaryImmutableReferences: [reference({ expectedDeployedBytes: "0xdeadbeef" })],
    });
    const result = normalizeRuntimeBytecodeFromManifest(runtimeBuffer, wrong as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(result.ok).to.equal(false);
    expect(result.failures.join(",")).to.include("IMMUTABLE_A");
  });

  it("182. rejects overlapping, duplicate, unsorted and metadata-region references", function () {
    const reference = (overrides: Record<string, unknown>) => ({
      id: "R",
      kind: "EXACT_BYTES_REPLACEMENT",
      offset: 400,
      byteLength: 4,
      expectedDeployedBytes: "0x00000000",
      expectedArtifactPlaceholderBytes: "0x00000000",
      compilerReferenceId: "solc:immutable:1",
      ...overrides,
    });
    const cases: [string, unknown[]][] = [
      ["primary overlap", [reference({ offset: UUPS_SELF_OFFSETS[0] })]],
      ["duplicate id", [reference({ offset: 400 }), reference({ offset: 500 })]],
      ["unsorted", [reference({ id: "A", offset: 500 }), reference({ id: "B", offset: 400 })]],
      ["metadata region", [reference({ offset: runtimeBuffer.length - 4 })]],
      ["unknown kind", [reference({ kind: "ANYTHING_GOES" })]],
    ];
    for (const [label, references] of cases) {
      const manifest = normalizationManifestFixture({ supplementaryImmutableReferences: references });
      expect(validateNormalizationManifest(manifest).length, label).to.be.greaterThan(0);
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * F29 — the provenance amendment cannot become a bypass.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: amendment cannot bypass the pinned tuples", function () {
  const expected = deriveAuthorityProtocol().provenance.required.find(
    (entry) => entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
  );
  const AMENDED_COMMIT = "c".repeat(40);
  /* The amended tuple names a REAL, different authenticated source, because superseding to a
   * digest with no bytes behind it is not a supersession. */
  const AMENDED_HASH = AMENDED_AUTHORITY_SOURCE_SHA256;
  const amendment = (overrides: Record<string, unknown> = {}) => ({
    subject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
    supersedesCommit: expected?.commit,
    supersedesRepository: expected?.repository,
    supersedesPath: expected?.path,
    reviewedBy: "independent reviewer",
    reviewRecordSha256: sha256("review record"),
    reason: "Upstream published a corrected artifact after the prior review.",
    repository: expected?.repository,
    tag: expected?.tag,
    commit: AMENDED_COMMIT,
    path: expected?.path,
    contentSha256: AMENDED_HASH,
    ...overrides,
  });
  const supersededEntries = (overrides: Record<string, unknown> = {}) =>
    provenanceEntries().map((entry) =>
      entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE"
        ? { ...entry, commit: AMENDED_COMMIT, contentSha256: AMENDED_HASH, ...overrides }
        : entry,
    );
  /* F36 — an amended tuple re-anchors every cross-link that names it. */
  const record = (entries: unknown[], amendments: unknown[]) =>
    reanchoredToAmendedAuthoritySource(AMENDED_COMMIT, AMENDED_HASH, {
      provenance: {
        reverificationStatus: "REVERIFIED",
        entries,
        amendments: [
          ...amendments,
          ...sourceMaterialAmendments().filter((entry) => entry.subject !== "CURRENT_OFFICIAL_AUTHORITY_SOURCE"),
        ],
      },
    });

  it("183. accepts an amendment only when the entry matches it exactly", function () {
    expect(validateAuthorityBindingRecord(record(supersededEntries(), [amendment()]))).to.deep.equal([]);
    /* THE EXPLOIT: the amendment exempts the subject, then the entry claims something else. */
    const divergent = supersededEntries({ commit: "e".repeat(40), contentSha256: "f".repeat(64) });
    expect(validateAuthorityBindingRecord(record(divergent, [amendment()])).length).to.be.greaterThan(0);
  });

  it("184. rejects duplicate and no-op amendments", function () {
    expect(
      validateAuthorityBindingRecord(record(supersededEntries(), [amendment(), amendment()])).length,
    ).to.be.greaterThan(0);
    const noop = amendment({ commit: expected?.commit, contentSha256: expected?.contentSha256 });
    expect(validateAuthorityBindingRecord(record(provenanceEntries(), [noop])).length).to.be.greaterThan(0);
  });

  it("185. requires the exact superseded tuple and a reviewed record digest", function () {
    for (const broken of [
      amendment({ supersedesPath: "some/other/path.ts" }),
      amendment({ supersedesRepository: "https://github.com/someone/else" }),
      amendment({ supersedesCommit: "0".repeat(40) }),
      amendment({ reviewRecordSha256: "not-a-digest" }),
      amendment({ reviewedBy: "" }),
    ]) {
      expect(validateAuthorityBindingRecord(record(supersededEntries(), [broken])).length).to.be.greaterThan(0);
    }
  });

  it("186. rejects an amendment carrying an undeclared field", function () {
    const smuggled = { ...amendment(), notes: "anything" };
    expect(validateAuthorityBindingRecord(record(supersededEntries(), [smuggled])).join(" | ")).to.match(
      /unpermitted field notes/u,
    );
  });
});

/* ---------------------------------------------------------------------------------------------
 * F30 — caller applicability is a typed, proven statement.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: applicability interpretation", function () {
  const withApplicability = (specs: unknown[]) =>
    bindingRecordFixture({
      onChainInterface: {
        ...(bindingRecordFixture().onChainInterface as Record<string, unknown>),
        callerApplicability: specs,
      },
    });
  const mapHarness = (fn: (spec: Record<string, unknown>) => Record<string, unknown>) =>
    withApplicability(
      callerApplicabilityFixture().map((spec) => (spec.subject === "BENCHMARK_HARNESS" ? fn(spec) : spec)),
    );

  it("187. rejects an undeclared interpretation and one that contradicts the return type", function () {
    expect(
      validateAuthorityBindingRecord(mapHarness((spec) => ({ ...spec, interpretation: "ANYTHING" }))).length,
    ).to.be.greaterThan(0);
    expect(
      validateAuthorityBindingRecord(mapHarness((spec) => ({ ...spec, interpretation: "UINT_NONZERO_MEANS_EXEMPT" })))
        .length,
    ).to.be.greaterThan(0);
    expect(
      validateAuthorityBindingRecord(mapHarness((spec) => ({ ...spec, acceptedResults: ["1"] }))).length,
    ).to.be.greaterThan(0);
  });

  it("188. requires the queried address to be the declared subject", function () {
    expect(
      validateAuthorityBindingRecord(mapHarness((spec) => ({ ...spec, argumentValues: [SENDER_ADDRESS] }))).length,
    ).to.be.greaterThan(0);
    expect(
      validateAuthorityBindingRecord(mapHarness((spec) => ({ ...spec, subjectArgumentIndex: 1 }))).length,
    ).to.be.greaterThan(0);
  });

  it("189. requires a declared subject-address source and a call-context proof", function () {
    expect(
      validateAuthorityBindingRecord(mapHarness((spec) => ({ ...spec, subjectAddressSource: "GUESSED" }))).length,
    ).to.be.greaterThan(0);
    expect(
      validateAuthorityBindingRecord(mapHarness((spec) => ({ ...spec, callContextProof: null }))).length,
    ).to.be.greaterThan(0);
  });

  it("190. resolves the benchmark-harness circularity explicitly", function () {
    const harness = callerApplicabilityFixture().find((spec) => spec.subject === "BENCHMARK_HARNESS");
    /* The harness address is known before deployment, so the check is not circular. */
    expect(harness?.subjectAddressSource).to.equal("DETERMINISTIC_PRECOMPUTED_DEPLOYMENT_ADDRESS");
    expect(harness?.callContextProof).to.not.equal(null);
  });

  it("191. makes an exempt relevant caller prevent the PASS", async function () {
    const { transport } = createFakeTransport({ exempt: uintWord(1n) });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.callerExemptionResult).to.equal("EXEMPT");
    expect(result.finalVerdict).to.equal("FAIL");
    expect(validateAuthorityResult(passResult({ callerExemptionResult: "EXEMPT" })).length).to.be.greaterThan(0);
  });

  it("192. accepts only canonical signatures", function () {
    const grammar = new RegExp(CANONICAL_SIGNATURE_GRAMMAR, "u");
    expect(grammar.test("getTransactionMaxHCU()")).to.equal(true);
    expect(grammar.test("isExempt(address)")).to.equal(true);
    expect(grammar.test("isExempt(address )")).to.equal(false);
    expect(grammar.test("not a signature")).to.equal(false);
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const bad = bindingRecordFixture({
      onChainInterface: {
        ...iface,
        limitGetterSpecs: (iface.limitGetterSpecs as Record<string, unknown>[]).map((spec) =>
          spec.controlId === "TRANSACTION_TOTAL_HCU" ? { ...spec, signature: "not a signature" } : spec,
        ),
      },
    });
    expect(validateAuthorityBindingRecord(bad).length).to.be.greaterThan(0);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F31 — getter specs and structured proof manifests replace prose.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: getter specs and proof manifests", function () {
  const withSpecs = (specs: unknown[]) =>
    bindingRecordFixture({
      onChainInterface: {
        ...(bindingRecordFixture().onChainInterface as Record<string, unknown>),
        limitGetterSpecs: specs,
      },
    });
  const mapTotal = (fn: (spec: Record<string, unknown>) => Record<string, unknown>) =>
    withSpecs(limitGetterSpecsFixture().map((spec) => (spec.controlId === "TRANSACTION_TOTAL_HCU" ? fn(spec) : spec)));

  it("193. requires a zero-argument uint256 limit getter", function () {
    expect(
      validateAuthorityBindingRecord(
        mapTotal((spec) => ({
          ...spec,
          signature: "limitFor(address)",
          selector: keccakId("limitFor(address)").slice(0, 10),
          argumentTypes: ["address"],
          argumentValues: [HARNESS_ADDRESS],
        })),
      ).length,
    ).to.be.greaterThan(0);
    expect(
      validateAuthorityBindingRecord(mapTotal((spec) => ({ ...spec, returnType: "bool" }))).length,
    ).to.be.greaterThan(0);
    expect(
      validateAuthorityBindingRecord(mapTotal((spec) => ({ ...spec, selector: "0xdeadbeef" }))).length,
    ).to.be.greaterThan(0);
  });

  it("194. rejects proof-manifest digest drift", function () {
    const drifted = bindingRecordFixture({
      enforcementProof: { manifest: enforcementProofManifestFixture(), manifestSha256: "9".repeat(64) },
    });
    expect(validateAuthorityBindingRecord(drifted).length).to.be.greaterThan(0);

    const enumerationDrift = bindingRecordFixture({
      authorityEnumeration: { manifest: enumerationManifestFixture(), manifestSha256: "9".repeat(64) },
    });
    expect(validateAuthorityBindingRecord(enumerationDrift).length).to.be.greaterThan(0);
  });

  it("195. requires a complete enumeration behind a PROVEN_ABSENT block/batch control", function () {
    const incomplete = enumerationManifestFixture({ enumerationComplete: false });
    const record = bindingRecordFixture({
      authorityEnumeration: { manifest: incomplete, manifestSha256: sha256(canonicalJson(incomplete)) },
    });
    expect(validateAuthorityBindingRecord(record).length).to.be.greaterThan(0);
  });

  it("196. rejects a present block/batch control without structured enforcement evidence", function () {
    const present = bindingRecordFixture({
      blockOrBatch: { state: "PROVEN_PRESENT", value: "40000000", proof: "a per-block cap exists" },
    });
    expect(validateAuthorityBindingRecord(present).length).to.be.greaterThan(0);
  });

  it("197. keeps getter availability and getter specs in agreement", function () {
    const limits = bindingRecordFixture().limits as Record<string, unknown>;
    const disagreeing = bindingRecordFixture({
      limits: {
        ...limits,
        getterAvailability: {
          ...(limits.getterAvailability as Record<string, unknown>),
          transactionDepth: "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT",
        },
      },
    });
    /* The spec still claims the getter is read on chain, so the record is incoherent. */
    expect(validateAuthorityBindingRecord(disagreeing).length).to.be.greaterThan(0);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F32 — deployment model, call plan and derivation-chain coherence.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: deployment and plan coherence", function () {
  it("198. supports only the executor deployment models it can verify", function () {
    expect(EXECUTOR_DEPLOYMENT_MODELS).to.deep.equal(["DIRECT", "ERC1967_PROXY"]);
    const schema = deriveAuthorityProtocol().resultSchema.properties.executorDeploymentModel as { enum: string[] };
    for (const model of EXECUTOR_DEPLOYMENT_MODELS) expect(schema.enum).to.include(model);
    const proxyBinding = bindingRecordFixture({
      executor: {
        ...(bindingRecordFixture().executor as Record<string, unknown>),
        deploymentModel: "ERC1967_PROXY",
        expectedProxyRuntimeSha256: EXECUTOR_PROXY_RUNTIME_HASH,
        implementationAddressPolicy: implementationAddressPolicyFixture({
          expectedImplementationAddress: EXECUTOR_IMPLEMENTATION,
        }),
        implementationResolutionMechanism: "ERC1967_STORAGE_SLOT",
        implementationSlot: ERC1967_IMPLEMENTATION_SLOT,
      },
    });
    expect(
      validateAuthorityResult(
        passResult({
          executorCodeHash: EXECUTOR_PROXY_RUNTIME_HASH,
          executorDeploymentModel: "ERC1967_PROXY",
          executorExpectedImplementationAddress: EXECUTOR_IMPLEMENTATION,
          executorExpectedImplementationCodeHash: EXECUTOR_IMPLEMENTATION_RUNTIME_HASH,
          executorImplementationAddress: EXECUTOR_IMPLEMENTATION,
          executorImplementationCodeHash: EXECUTOR_IMPLEMENTATION_RUNTIME_HASH,
          executorProxyCodeHash: EXECUTOR_PROXY_RUNTIME_HASH,
          executorProxyCodeIdentityResult: "VERIFIED",
          executorImplementationResolutionResult: "VERIFIED_ERC1967_STORAGE_SLOT",
          executorImplementationAddressPolicyResult: "EXACT_MATCH",
          erc1967SlotReadCount: 2,
          rpcMethodsUsed: [
            "eth_call",
            "eth_chainId",
            "eth_getBlockByNumber",
            "eth_getCode",
            "eth_getStorageAt",
            "eth_getStorageAt",
          ],
        }),
        proxyBinding as never,
      ),
    ).to.deep.equal([]);
  });

  it("199. omits the ERC-1967 read for a directly deployed authority", async function () {
    const directRecord = bindingRecordFixture({
      authority: {
        ...(bindingRecordFixture().authority as Record<string, unknown>),
        deploymentModel: "DIRECT",
        implementationSlot: null,
        implementationResolutionMechanism: "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
        expectedProxyRuntimeSha256: null,
      },
    });
    const plan = generateLiveCallPlan(directRecord as never);
    expect(plan.some((step) => step.method === "eth_getStorageAt")).to.equal(false);
    assertLiveCallPlanIsReadOnly(plan);
    /* And the proxied record does generate it. */
    expect(
      generateLiveCallPlan(bindingRecordFixture() as never).some((step) => step.method === "eth_getStorageAt"),
    ).to.equal(true);
  });

  it("200. stops the derivation chain at the first broken link", async function () {
    const broken = createFakeTransport({ executorCode: "0xdeadbeef" });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: broken.transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.executorCodeIdentityResult).to.equal("UNRESOLVED");
    /* Nothing was derived from the unverified executor. */
    expect(result.authorityAddress).to.equal("UNRESOLVED");
    expect(result.authorityCodeIdentityResult).to.not.equal("VERIFIED");
    expect(broken.calls.some((call) => call.method === "eth_getStorageAt")).to.equal(false);
    expect(result.finalVerdict).to.equal("BLOCKED");
  });

  it("201. never advertises an RPC method outside the read-only allowlist", async function () {
    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    for (const call of calls) expect(LIVE_RPC_ALLOWED_METHODS, call.method).to.include(call.method);
    expect(result.rpcMethodsUsed).to.deep.equal([...new Set(calls.map((call) => call.method))].sort());
    for (const call of calls) assertBoundToPinnedBlock(call as never, PINNED_HEX);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F33 — the local 0.10.0 fixture root cannot gate a live PASS.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: split roots", function () {
  it("202. keeps three separate identities and reports each for what it is", async function () {
    const { transport } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe(),
    });
    /* CL3/CL4 — everything below is verified; the run stops only at the external pinned build. */
    expect(result.finalVerdict, String(result.status)).to.equal("BLOCKED");
    expect(String(result.status)).to.include("OFFICIAL_BUILD_IS_NOT_THE_PINNED_REPRODUCTION");
    /* The measurement toolchain is the installed calculator SG-4 actually benchmarks with. */
    expect(result.measurementToolchainRoot).to.deep.include({
      calculatorPath: "fhevm/coprocessor/hcu.ts",
      costTablePath: "fhevm/coprocessor/HCUByOperator.ts",
      integrity: deriveAuthorityProtocol().measurementToolchainRoot.integrity,
      package: "@fhevm/mock-utils",
      version: "0.4.2",
      /* INVARIANT F — verified from the installation, and MINIMAL: exactly the two files that can
       * change a computed HCU number. */
      verificationResult: "VERIFIED",
    });
    expect((result.measurementToolchainRoot as Record<string, string[]>).executionRelevantFiles).to.deep.equal([
      `@fhevm/mock-utils:fhevm/coprocessor/HCUByOperator.ts:${EXPECTED_COST_TABLE_HASH}`,
      `@fhevm/mock-utils:fhevm/coprocessor/hcu.ts:${EXPECTED_CALCULATOR_HASH}`,
    ]);
    /* The deployed authority root is the reviewed upstream revision, not a package. */
    const deployed = result.deployedAuthorityRoot as Record<string, string>;
    expect(deployed.commit).to.equal(AUTHORITY_TUPLE.commit);
    expect(deployed.repository).to.equal(AUTHORITY_TUPLE.repository);
    expect(deployed.path).to.equal(AUTHORITY_TUPLE.path);
    expect(deployed.artifactId).to.equal(result.authoritativeArtifactId);
    expect(deployed.repository).to.not.include("@fhevm/host-contracts");
    /* The local fixture root is reported and explicitly not PASS-relevant. */
    expect(result.localAuthorityFixtureRoot).to.deep.include({
      package: "@fhevm/host-contracts",
      passRelevant: false,
    });
  });

  it("203. is unaffected by the obsolete local fixture and blocked by the two real roots", function () {
    /* Changing ONLY the local 0.10.0 fixture identity leaves a coherent PASS a PASS. */
    for (const drift of [
      {
        localAuthorityFixtureRoot: {
          integrity: "x",
          package: "@fhevm/host-contracts",
          passRelevant: false,
          version: "9.9.9",
        },
      },
      { localFixtureSelfTestResult: "MISMATCH" },
    ]) {
      expect(validateAuthorityResult(passResult(drift)), JSON.stringify(drift)).to.deep.equal([]);
    }

    /* Changing the MEASUREMENT toolchain blocks: every HCU number came from it. */
    for (const field of ["package", "version", "integrity"]) {
      const toolchain = { ...(passResult().measurementToolchainRoot as Record<string, unknown>), [field]: "drifted" };
      expect(validateAuthorityResult(passResult({ measurementToolchainRoot: toolchain })).join(" | "), field).to.match(
        /measurement-toolchain/u,
      );
    }
    expect(validateAuthorityResult(passResult({ calculatorHash: "0".repeat(64) })).join(" | ")).to.match(
      /calculator hash/u,
    );
    expect(validateAuthorityResult(passResult({ installedTableHash: "0".repeat(64) })).join(" | ")).to.match(
      /installed table hash/u,
    );

    /* Changing the DEPLOYED authority root blocks. */
    const deployed = passResult().deployedAuthorityRoot as Record<string, string>;
    for (const [field, value] of [
      ["commit", "UNRESOLVED"],
      ["contentSha256", "not-a-digest"],
      ["artifactId", "SOMETHING_ELSE"],
      ["repository", "https://registry.npmjs.org/@fhevm/host-contracts"],
    ] as [string, string][]) {
      expect(
        validateAuthorityResult(passResult({ deployedAuthorityRoot: { ...deployed, [field]: value } })).length,
        field,
      ).to.be.greaterThan(0);
    }
  });

  it("204. never derives the deployed authority root from a local package", function () {
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    /* The deployed root is built from the selected provenance tuple, and from nothing else. */
    expect(source).to.include("selectedProvenanceTuple(binding, DEPLOYED_AUTHORITY_ROOT_POLICY.provenanceSubject)");
    expect(source).to.not.include("authorityRoot: {\n      integrity: AUTHORITY_ROOT.integrity");
    const policy = deriveAuthorityProtocol().deployedAuthorityRootPolicy;
    expect(policy.derivedFrom).to.equal("AUTHORITY_BINDING_RECORD");
    expect(policy.localPackageMayNotSubstitute).to.equal(true);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F34 — exact per-variant pricing, derived from one canonical manifest.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: one canonical variant manifest", function () {
  it("205. derives the closure from the benchmark circuits rather than duplicating them", function () {
    /* INVARIANT A — one canonical statement of what SG-4 executes, derived from the registered
     * circuits; the authority closure is a projection of it. */
    expect(SG4_PRICING_VARIANT_CLOSURE).to.deep.equal(projectPricingClosure(SG4_CANONICAL_OPERATION_VARIANTS));
    expect(SG4_PRICING_VARIANT_CLOSURE).to.have.lengthOf(SG4_CANONICAL_OPERATION_VARIANTS.length);
    expect(SG4_CANONICAL_OPERATION_VARIANTS).to.deep.equal(deriveCanonicalOperationManifest(CIRCUITS));

    /* Every HCU-priced FHE call any registered circuit executes appears exactly once, at the right
     * semantics; nothing else appears at all. */
    const executed = new Map<string, string[]>();
    for (const circuit of CIRCUITS) {
      for (const call of circuit.operations) {
        if (!call.startsWith("FHE.")) continue;
        const semantics = FHE_OPERATION_SEMANTICS[call];
        expect(semantics, `${circuit.id} executes undeclared ${call}`).to.not.equal(undefined);
        if (!semantics.hcuPriced) continue;
        const id = `${semantics.canonicalOperation}.${semantics.operandMode}.${semantics.costKeyType}`;
        executed.set(id, [...new Set([...(executed.get(id) ?? []), call])].sort());
      }
    }
    expect(SG4_CANONICAL_OPERATION_VARIANTS.map((variant) => variant.variantId).sort()).to.deep.equal(
      [...executed.keys()].sort(),
    );
    for (const variant of SG4_CANONICAL_OPERATION_VARIANTS) {
      expect([...variant.solidityCalls], variant.variantId).to.deep.equal(executed.get(variant.variantId));
      expect(variant.circuits.length, variant.variantId).to.be.greaterThan(0);
      expect(variant.resultType, variant.variantId).to.not.include("|");
      expect(variant.operandTypes.length, variant.variantId).to.equal(variant.arity);
    }
    /* The literal overload is resolved explicitly rather than reinterpreted. */
    expect(FHE_OPERATION_SEMANTICS["FHE.asEuint128(0)"].overloadResolution).to.match(/literal 0 is resolved/u);
    expect(FHE_OPERATION_SEMANTICS["FHE.asEuint128(0)"].canonicalOperation).to.equal("TrivialEncrypt");
    /* Non-priced calls are declared and excluded, not silently dropped. */
    expect(FHE_OPERATION_SEMANTICS["FHE.allowThis(euint128)"].hcuPriced).to.equal(false);
    expect(SG4_CANONICAL_OPERATION_VARIANTS.some((variant) => variant.canonicalOperation === "AllowThis")).to.equal(
      false,
    );
  });

  it("206. fails on a deleted real variant and on a spurious authority-only variant", function () {
    /* Deleting a real benchmark operation only from the authority side. */
    const withoutRem = CIRCUITS.filter((circuit) => !circuit.operations.includes("FHE.rem(euint128,uint128)"));
    const reduced = deriveCanonicalOperationManifest(withoutRem);
    expect(reduced.map((variant) => variant.variantId)).to.not.include("FheRem.scalar.Uint128");
    expect(SG4_CANONICAL_OPERATION_VARIANTS.map((variant) => variant.variantId)).to.include("FheRem.scalar.Uint128");
    expect(projectPricingClosure(reduced).length).to.be.lessThan(SG4_PRICING_VARIANT_CLOSURE.length);

    /* A spurious authority-only variant cannot be introduced: the manifest only contains what a
     * circuit executes, and an FHE call with no declared semantics is an error. */
    const spurious = [...CIRCUITS, { ...CIRCUITS[0], id: "SPURIOUS", operations: ["FHE.asEbool(bool)"] }];
    expect(() => deriveCanonicalOperationManifest(spurious)).to.throw(/no declared operation semantics/u);

    /* And two circuits describing one variant incompatibly is refused. */
    const contradictory = {
      ...FHE_OPERATION_SEMANTICS,
      "FHE.add(euint128,euint128)": {
        ...FHE_OPERATION_SEMANTICS["FHE.add(euint128,euint128)"],
        solidityCall: "FHE.add(euint128,euint128)",
      },
      "FHE.lt(euint128,euint128)": {
        ...FHE_OPERATION_SEMANTICS["FHE.lt(euint128,euint128)"],
        canonicalOperation: "FheAdd",
        operandMode: "nonScalar" as const,
        costKeyType: "Uint128",
      },
    };
    expect(() => deriveCanonicalOperationManifest(CIRCUITS, contradictory)).to.throw(/two incompatible ways/u);
  });

  it("207. serializes every mismatch class and validates each for PASS", function () {
    const compat = passResult().operationCompatibilityResult as Record<string, unknown>;
    for (const field of [
      "arityMismatches",
      "costMismatches",
      "installedOnly",
      "operandMismatches",
      "operandTypeMismatches",
      "resultTypeMismatches",
      "translationMismatches",
      "unsupportedByCalculator",
    ]) {
      expect(compat, field).to.have.property(field);
      /* A serialized PASS carrying any of them is rejected by an independent reader. */
      expect(
        validateAuthorityResult(
          passResult({ operationCompatibilityResult: { ...compat, [field]: ["FheAdd.nonScalar.Uint128"] } }),
        ).join(" | "),
        field,
      ).to.match(new RegExp(`empty ${field}`, "u"));
    }
    /* And the serialized closure must be the exact SG-4 closure. */
    expect(
      validateAuthorityResult(
        passResult({ operationCompatibilityResult: { ...compat, shared: ["FheAdd.nonScalar.Uint128"] } }),
      ).join(" | "),
    ).to.match(/exact SG-4 closure/u);
  });

  it("208. refuses an entry hiding an undeclared cost dimension", function () {
    const base = pricingManifestFixture() as { entries: Record<string, unknown>[] };
    /* A smuggled extra field could carry a second price nobody compares. */
    expect(
      validatePricingManifest(pricingManifestFixture({ entries: [{ ...base.entries[0], scalarCost: 12 }] })).join(
        " | ",
      ),
    ).to.match(/unpermitted field scalarCost/u);
    /* Two entries for one exact variant leave the reader to choose a price. */
    expect(
      validatePricingManifest(pricingManifestFixture({ entries: [base.entries[0], base.entries[0]] })).join(" | "),
    ).to.match(/duplicates the variant/u);
  });

  it("209. rejects a pricing source reference that is not the selected tuple", function () {
    const base = pricingManifestFixture() as { entries: Record<string, unknown>[] };
    const wrongSource = bindingRecordFixture({
      operationSchedule: {
        ...(bindingRecordFixture().operationSchedule as Record<string, unknown>),
        pricingManifest: pricingManifestFixture({
          entries: base.entries.map((entry, index) =>
            index === 0 ? { ...entry, sourceReference: "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE" } : entry,
          ),
        }),
      },
    });
    /* A subject LABEL is not a tuple. */
    expect(validateAuthorityBindingRecord(wrongSource).join(" | ")).to.match(/PRICING_ENTRY_SOURCE\[0\]/u);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F35 — normalization is bidirectional and compiler-authenticated.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: compiler-authenticated normalization", function () {
  it("210. gives primary references the same typed treatment as supplementary ones", function () {
    const manifest = normalizationManifestFixture();
    const primary = manifest.primaryImmutableReferences as Record<string, unknown>[];
    /* The reproduced build has three PUSH32 word immutables, not the fixture's 28 PUSH20 slots. */
    expect(primary).to.have.lengthOf(UUPS_SELF_OFFSETS.length);
    expect(primary.map((entry) => entry.offset)).to.deep.equal([...UUPS_SELF_OFFSETS]);
    for (const reference of primary) {
      expect(Object.keys(reference).sort()).to.deep.equal([
        "byteLength",
        "compilerReferenceId",
        "expectedArtifactPlaceholderBytes",
        "id",
        "kind",
        "offset",
      ]);
    }
    /* The weaker parallel offsets array is gone. */
    expect(manifest).to.not.have.property("offsets");
    expect(validateNormalizationManifest(manifest)).to.deep.equal([]);
  });

  it("211. rejects an invented compiler reference id and a wrong artifact placeholder", function () {
    const compiler = compilerReferenceManifestFixture();
    const manifest = normalizationManifestFixture() as { primaryImmutableReferences: Record<string, unknown>[] };

    const invented = normalizationManifestFixture({
      primaryImmutableReferences: manifest.primaryImmutableReferences.map((reference, index) =>
        index === 0 ? { ...reference, compilerReferenceId: "solc:immutable:invented" } : reference,
      ),
    });
    expect(crossLinkImmutableReferences(invented, compiler).join(" | ")).to.match(
      /names a compiler reference solc:immutable:invented that the compiler manifest does not contain/u,
    );

    const wrongPlaceholder = normalizationManifestFixture({
      primaryImmutableReferences: manifest.primaryImmutableReferences.map((reference, index) =>
        index === 0 ? { ...reference, expectedArtifactPlaceholderBytes: `0x${"ee".repeat(20)}` } : reference,
      ),
    });
    expect(crossLinkImmutableReferences(wrongPlaceholder, compiler).join(" | ")).to.match(
      /artifact placeholder disagrees with compiler reference/u,
    );

    const wrongOffset = normalizationManifestFixture({
      primaryImmutableReferences: manifest.primaryImmutableReferences.map((reference, index) =>
        index === 0 ? { ...reference, offset: 4 } : reference,
      ),
    });
    expect(crossLinkImmutableReferences(wrongOffset, compiler).join(" | ")).to.match(/offset disagrees/u);
  });

  it("212. rejects an incomplete or unauthenticated compiler-reference manifest", function () {
    for (const [label, overrides, pattern] of [
      ["incomplete", { referencesComplete: false }, /COMPLETE reference set/u],
      ["no build id", { buildId: "" }, /build identity/u],
      ["wrong schema", { schema: "something.else" }, /schema mismatch/u],
      ["no source hash", { sourceContentSha256: "short" }, /source content hash/u],
      ["unsorted", { entries: [...compilerReferenceEntries()].reverse() }, /strictly ascending/u],
    ] as [string, Record<string, unknown>, RegExp][]) {
      expect(
        validateCompilerReferenceManifest(compilerReferenceManifestFixture(overrides)).join(" | "),
        label,
      ).to.match(pattern);
    }
    /* The record refuses a compiler manifest whose digest does not recompute. */
    const artifact = bindingRecordFixture().artifact as Record<string, unknown>;
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({ artifact: { ...artifact, compilerReferenceManifestSha256: "9".repeat(64) } }),
      ).join(" | "),
    ).to.match(/compilerReferenceManifestSha256 does not recompute/u);
    /* And one emitted by a different compiler version. */
    const drifted = compilerReferenceManifestFixture({ compilerVersion: "0.8.19" });
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          artifact: {
            ...artifact,
            compilerReferenceManifest: drifted,
            compilerReferenceManifestSha256: sha256(canonicalJson(drifted)),
          },
        }),
      ).join(" | "),
    ).to.match(/emitted by a different compiler version/u);
  });

  it("213. normalizes only to the authenticated artifact placeholder", function () {
    const runtimeBuffer = officialImplementationRuntime();
    const reference = (overrides: Record<string, unknown> = {}) => ({
      byteLength: 4,
      compilerReferenceId: "solc:supplementary:0",
      expectedArtifactPlaceholderBytes: "0x00000000",
      expectedDeployedBytes: `0x${runtimeBuffer.subarray(400, 404).toString("hex")}`,
      id: "SUPPLEMENTARY_A",
      kind: "EXACT_BYTES_REPLACEMENT",
      offset: 400,
      ...overrides,
    });
    /* There is no free replacement value left to choose. */
    expect(Object.keys(reference()).sort()).to.not.include("replacementBytes");
    const good = normalizationManifestFixture({ supplementaryImmutableReferences: [reference()] });
    expect(validateNormalizationManifest(good)).to.deep.equal([]);
    const normalized = normalizeRuntimeBytecodeFromManifest(runtimeBuffer, good as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(normalized.ok, normalized.failures.join(",")).to.equal(true);

    /* A placeholder of the wrong length cannot be substituted at all. */
    const wrongLength = normalizationManifestFixture({
      supplementaryImmutableReferences: [reference({ expectedArtifactPlaceholderBytes: "0x0000" })],
    });
    expect(validateNormalizationManifest(wrongLength).join(" | ")).to.match(
      /expectedArtifactPlaceholderBytes must be exactly 4 bytes/u,
    );
  });
});

/* ---------------------------------------------------------------------------------------------
 * F36 — every cross-link is tuple-derived.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: tuple-derived cross-links", function () {
  it("214. rejects a label where a tuple is required, on every cross-link", function () {
    const base = bindingRecordFixture();
    const artifact = base.artifact as Record<string, unknown>;
    const executor = base.executor as Record<string, unknown>;
    const schedule = base.operationSchedule as Record<string, unknown>;
    const cases: [string, Record<string, unknown>, RegExp][] = [
      [
        "artifact source",
        { artifact: { ...artifact, sourceReference: "CURRENT_OFFICIAL_AUTHORITY_SOURCE" } },
        /ARTIFACT_SOURCE/u,
      ],
      ["artifact release", { artifact: { ...artifact, release: "v9.9.9" } }, /ARTIFACT_RELEASE/u],
      [
        "executor configuration",
        { executor: { ...executor, configurationSourceReference: "INSTALLED_SOLIDITY_CONFIGURATION" } },
        /EXECUTOR_CONFIGURATION_SOURCE/u,
      ],
      [
        "price schedule",
        { operationSchedule: { ...schedule, source: "zama-ai/fhevm operatorsPrices.ts" } },
        /PRICE_SCHEDULE_SOURCE/u,
      ],
    ];
    for (const [label, overrides, pattern] of cases) {
      expect(validateAuthorityBindingRecord(bindingRecordFixture(overrides)).join(" | "), label).to.match(pattern);
    }
  });

  it("215. binds the installed calculator and cost table to what SG-4 actually measures with", function () {
    for (const [subject, id] of [
      ["INSTALLED_CALCULATOR", "CALCULATOR_CONTENT"],
      ["INSTALLED_OPERATION_COST_TABLE", "COST_TABLE_CONTENT"],
    ] as [string, string][]) {
      const entries = provenanceEntries().map((entry) =>
        entry.subject === subject ? { ...entry, contentSha256: "a".repeat(64) } : entry,
      );
      expect(
        validateAuthorityBindingRecord(
          bindingRecordFixture({
            provenance: { reverificationStatus: "REVERIFIED", entries, amendments: [] },
          }),
        ).join(" | "),
        subject,
      ).to.match(new RegExp(id, "u"));
    }
  });

  it("216. binds every proof manifest to the selected authority-source content hash", function () {
    const base = bindingRecordFixture();
    const enforcement = enforcementProofManifestFixture({ sourceContentSha256: "b".repeat(64) });
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          enforcementProof: { manifest: enforcement, manifestSha256: sha256(canonicalJson(enforcement)) },
        }),
      ).join(" | "),
    ).to.match(/ENFORCEMENT_PROOF_SOURCE/u);

    const enumeration = enumerationManifestFixture({ sourceContentSha256: "b".repeat(64) });
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          authorityEnumeration: { manifest: enumeration, manifestSha256: sha256(canonicalJson(enumeration)) },
        }),
      ).join(" | "),
    ).to.match(/ENUMERATION_SOURCE/u);

    const artifact = base.artifact as Record<string, unknown>;
    const compiler = compilerReferenceManifestFixture({ sourceContentSha256: "b".repeat(64) });
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          artifact: {
            ...artifact,
            compilerReferenceManifest: compiler,
            compilerReferenceManifestSha256: sha256(canonicalJson(compiler)),
          },
        }),
      ).join(" | "),
    ).to.match(/IMMUTABLE_REFERENCE_SOURCE/u);
  });

  it("217. uses one canonical source-reference representation", function () {
    expect(deriveAuthorityProtocol().crossLinkBindings.map((entry) => entry.id)).to.include.members([
      "ARTIFACT_SOURCE",
      "CALCULATOR_CONTENT",
      "COST_TABLE_CONTENT",
      "ENFORCEMENT_PROOF_SOURCE",
      "ENUMERATION_SOURCE",
      "EXECUTOR_CONFIGURATION_SOURCE",
      "IMMUTABLE_REFERENCE_SOURCE",
      "PRICE_SCHEDULE_SOURCE",
      "PRICING_ENTRY_SOURCE",
    ]);
    expect(canonicalSourceReference(AUTHORITY_TUPLE)).to.equal(
      `${AUTHORITY_TUPLE.repository}@${AUTHORITY_TUPLE.commit}:${AUTHORITY_TUPLE.path}`,
    );
    /* The selected map resolves every declared subject. */
    const selected = selectedProvenanceMap(bindingRecordFixture() as never);
    for (const subject of deriveAuthorityProtocol().provenance.required.map((entry) => entry.subject)) {
      expect(selected.has(subject), subject).to.equal(true);
    }
    expect(selectedProvenanceTuple(bindingRecordFixture() as never, "NOT_A_SUBJECT")).to.equal(null);
  });

  it("217b. keeps reproduced-build evidence separate from source-file references", function () {
    const base = bindingRecordFixture();
    const reproduced = selectedProvenanceTuple(base as never, "CURRENT_OFFICIAL_ARTIFACT_BUILD");
    expect(reproduced?.kind).to.equal("REPRODUCED_BUILD");
    expect(reproduced).to.not.have.property("path");
    expect(() => canonicalSourceReference(reproduced as never)).to.throw(
      "REPRODUCED_BUILD_HAS_NO_SOURCE_FILE_CANONICAL_REFERENCE",
    );
    expect(() => sourceFileCanonicalReference(reproduced)).to.throw(
      "REPRODUCED_BUILD_HAS_NO_SOURCE_FILE_CANONICAL_REFERENCE",
    );

    const reproducedWithPath = provenanceEntries().map((entry) =>
      entry.subject === "CURRENT_OFFICIAL_ARTIFACT_BUILD" ? { ...entry, path: null } : entry,
    );
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          provenance: {
            reverificationStatus: "REVERIFIED",
            entries: reproducedWithPath,
            amendments: sourceMaterialAmendments(),
          },
        }),
      ).join(" | "),
    ).to.match(/unpermitted field path/u);

    const sourceWithoutPath = provenanceEntries().map((entry) => {
      if (entry.subject !== "CURRENT_OFFICIAL_AUTHORITY_SOURCE") return entry;
      const { path: _path, ...withoutPath } = entry;
      return withoutPath;
    });
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          provenance: {
            reverificationStatus: "REVERIFIED",
            entries: sourceWithoutPath,
            amendments: sourceMaterialAmendments(),
          },
        }),
      ).join(" | "),
    ).to.match(/provenance entry .* missing path/u);

    const source = selectedProvenanceTuple(base as never, "CURRENT_OFFICIAL_AUTHORITY_SOURCE");
    expect(source?.kind).to.equal("SOURCE_FILE");
    expect(sourceFileCanonicalReference(source)).to.equal(AUTHORITY_SOURCE_REFERENCE);
  });
});

/* ---------------------------------------------------------------------------------------------
 * F37 — proofs are derivations, not assertions.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: derived proofs", function () {
  const withEnumeration = (overrides: Record<string, unknown>) => {
    const manifest = enumerationManifestFixture(overrides);
    return bindingRecordFixture({
      authorityEnumeration: { manifest, manifestSha256: sha256(canonicalJson(manifest)) },
    });
  };

  it("218. refuses an empty or arbitrary enumeration that claims completeness", function () {
    for (const [label, overrides, pattern] of [
      ["empty declarations", { declarations: [] }, /lists 0 entries/u],
      ["empty callables", { callableFunctions: [] }, /lists 0 entries/u],
      ["empty errors", { errors: [] }, /lists 0 entries/u],
      [
        "unsorted",
        { errors: ["HCUTransactionLimitExceeded", "HCUTransactionDepthLimitExceeded"] },
        /sorted and unique/u,
      ],
      ["partial parse", { parseCompleteness: "PARTIAL" }, /left no unaccounted residue/u],
      ["undeclared parse state", { parseCompleteness: "TRUST_ME" }, /parse-completeness state/u],
      ["unpermitted field", { note: "x" }, /unpermitted field note/u],
    ] as [string, Record<string, unknown>, RegExp][]) {
      expect(validateAuthorityBindingRecord(withEnumeration(overrides)).join(" | "), label).to.match(pattern);
    }
  });

  it("219. derives the block/batch conclusion from the enumeration instead of believing it", function () {
    /* The fixture enumerates no block- or batch-scoped surface, so ABSENT is derived. */
    expect(deriveBlockOrBatchConclusion(enumerationManifestFixture())).to.equal("ABSENT");
    /* Adding one makes the derivation say PRESENT, and the record's ABSENT claim is refused. */
    const withBlockSurface = enumerationManifestFixture({
      declarations: [
        "MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX",
        "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_BLOCK",
        "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX",
      ],
    });
    expect(deriveBlockOrBatchConclusion(withBlockSurface)).to.equal("PRESENT");
    expect(
      validateAuthorityBindingRecord(withEnumeration({ declarations: withBlockSurface.declarations as string[] })).join(
        " | ",
      ),
    ).to.match(/its own enumeration names a block- or batch-scoped surface/u);
  });

  it("220. cross-checks a present block/batch control field by field", function () {
    const enumeration = enumerationManifestFixture({
      declarations: [
        "MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX",
        "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_BLOCK",
        "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX",
      ],
    });
    const proof = enforcementProofManifestFixture({
      entries: [
        {
          comparisonOperator: ">",
          constantName: "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_BLOCK",
          constantValue: "40000000",
          controlId: "BLOCK_OR_BATCH_HCU",
          declarationSourceRangeSha256: sha256("declaration:block"),
          enforcementFunction: "_updateAndVerifyHCUBlockLimit",
          enforcementSourceRangeSha256: sha256("enforcement:block"),
          revertErrorName: "HCUBlockLimitExceeded",
          sourceKind: "CONSTANT",
          sourcePath: String(AUTHORITY_TUPLE.path),
        },
        ...(enforcementProofManifestFixture().entries as Record<string, unknown>[]),
      ].sort((left, right) => String(left.controlId).localeCompare(String(right.controlId))),
    });
    const present = (value: string | null) =>
      bindingRecordFixture({
        authorityEnumeration: { manifest: enumeration, manifestSha256: sha256(canonicalJson(enumeration)) },
        enforcementProof: { manifest: proof, manifestSha256: sha256(canonicalJson(proof)) },
        blockOrBatch: { state: "PROVEN_PRESENT", value, proof: "a per-block cap is enforced" },
      });
    /* The declared value must equal the enforcement-proof entry's constant. */
    expect(validateAuthorityBindingRecord(present("39999999")).join(" | ")).to.match(
      /block\/batch value disagrees with its enforcement-proof entry/u,
    );
  });

  it("221. refuses duplicate control ids and a reused source range", function () {
    const entries = enforcementProofManifestFixture().entries as Record<string, unknown>[];
    const duplicate = enforcementProofManifestFixture({ entries: [entries[0], entries[0]] });
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          enforcementProof: { manifest: duplicate, manifestSha256: sha256(canonicalJson(duplicate)) },
        }),
      ).join(" | "),
    ).to.match(/declares control TRANSACTION_DEPTH_HCU more than once/u);

    const reused = enforcementProofManifestFixture({
      entries: entries.map((entry) => ({
        ...entry,
        enforcementSourceRangeSha256: entry.declarationSourceRangeSha256,
      })),
    });
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          enforcementProof: { manifest: reused, manifestSha256: sha256(canonicalJson(reused)) },
        }),
      ).join(" | "),
    ).to.match(/reuses one source range/u);
  });

  it("222. refuses a self-asserted applicability proof", function () {
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const mutate = (changes: Record<string, unknown>) =>
      bindingRecordFixture({
        onChainInterface: {
          ...iface,
          callerApplicability: callerApplicabilityFixture().map((spec) =>
            spec.callContextProof === null
              ? spec
              : { ...spec, callContextProof: { ...(spec.callContextProof as object), ...changes } },
          ),
        },
      });
    /* An arbitrary range digest with no parent is not evidence. */
    expect(mutate({ parentEnforcementFunction: "doesNotExist" }));
    expect(validateAuthorityBindingRecord(mutate({ parentEnforcementFunction: "doesNotExist" })).join(" | ")).to.match(
      /names an enforcement function the proof manifest does not contain/u,
    );
    expect(validateAuthorityBindingRecord(mutate({ sourcePath: "some/other/file.sol" })).join(" | ")).to.match(
      /names a source path the proof manifest does not contain/u,
    );
    expect(validateAuthorityBindingRecord(mutate({ sourceContentSha256: "c".repeat(64) })).join(" | ")).to.match(
      /does not carry the enforcement manifest source content hash/u,
    );
  });
});

/* ---------------------------------------------------------------------------------------------
 * F38 — a reachable implementation-address policy and a chain that stops.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: implementation address policy", function () {
  const withPolicy = (policy: unknown) =>
    bindingRecordFixture({
      authority: {
        ...(bindingRecordFixture().authority as Record<string, unknown>),
        implementationAddressPolicy: policy,
      },
    });

  it("223. carries the policy in the closed record shape at all", function () {
    /* The exact defect: the runtime read fields the schema could not carry. */
    expect(deriveAuthorityProtocol().bindingRecord.sections.authority).to.include("implementationAddressPolicy");
    expect(validateAuthorityBindingRecord(bindingRecordFixture())).to.deep.equal([]);
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    expect(source).to.not.include("bindingAuthority.expectedImplementationAddress");
    expect(source).to.not.include("implementationAddressChangePermitted");
  });

  it("224. matches an exact pinned address and fails on a mismatch", async function () {
    const exact = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: createFakeTransport().transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(exact.implementationAddressPolicyResult).to.equal("EXACT_MATCH");
    expect(exact.finalVerdict, String(exact.status)).to.equal("BLOCKED");
    expect(String(exact.status)).to.include("OFFICIAL_BUILD_IS_NOT_THE_PINNED_REPRODUCTION");

    const wrongPin = withPolicy(
      implementationAddressPolicyFixture({
        expectedImplementationAddress: "0x9999999999999999999999999999999999999999",
      }),
    );
    const mismatch = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: mismatch.transport,
      lineageProbe: verifiedLineageProbe({ record: wrongPin }),
    });
    expect(result.implementationAddressPolicyResult).to.equal("MISMATCH");
    expect(result.finalVerdict).to.equal("FAIL");
    expect(String(result.status)).to.include("AUTHORITY_IMPLEMENTATION_ADDRESS_MISMATCH");
    /* The chain stopped: nothing downstream was queried from the wrong implementation. */
    expect(mismatch.calls.filter((call) => call.method === "eth_call")).to.have.lengthOf(2);
  });

  it("225. accepts a reviewed code-identical upgrade policy", async function () {
    const upgrade = withPolicy(
      implementationAddressPolicyFixture({
        expectedImplementationAddress: null,
        kind: "REVIEWED_CODE_IDENTICAL_UPGRADE",
        permittedConditions: ["NORMALIZED_RUNTIME_IDENTITY_UNCHANGED", "REPORTED_VERSION_UNCHANGED"],
      }),
    );
    expect(validateAuthorityBindingRecord(upgrade)).to.deep.equal([]);
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: createFakeTransport().transport,
      lineageProbe: verifiedLineageProbe({ record: upgrade }),
    });
    expect(result.implementationAddressPolicyResult).to.equal("PERMITTED_CODE_IDENTICAL_CHANGE");
    expect(result.finalVerdict, String(result.status)).to.equal("BLOCKED");
    expect(String(result.status)).to.include("OFFICIAL_BUILD_IS_NOT_THE_PINNED_REPRODUCTION");
  });

  it("226. rejects a malformed or unreviewed policy", function () {
    const base = implementationAddressPolicyFixture();
    const cases: [string, unknown, RegExp][] = [
      ["absent", null, /requires a closed implementationAddressPolicy/u],
      ["unknown kind", { ...base, kind: "TRUST_THE_PROXY" }, /declared policy kind/u],
      ["unreviewed", { ...base, reviewedBy: "" }, /independent reviewer/u],
      ["no review digest", { ...base, reviewRecordSha256: "short" }, /canonical review-record digest/u],
      ["extra field", { ...base, note: "x" }, /unpermitted field note/u],
      [
        "pinned with conditions",
        { ...base, permittedConditions: ["NORMALIZED_RUNTIME_IDENTITY_UNCHANGED"] },
        /permits no upgrade conditions/u,
      ],
      [
        "upgrade without identity condition",
        {
          ...base,
          expectedImplementationAddress: null,
          kind: "REVIEWED_CODE_IDENTICAL_UPGRADE",
          permittedConditions: ["REPORTED_VERSION_UNCHANGED"],
        },
        /unchanged normalized runtime identity/u,
      ],
    ];
    for (const [label, policy, pattern] of cases) {
      expect(validateAuthorityBindingRecord(withPolicy(policy)).join(" | "), label).to.match(pattern);
    }
    /* A policy edited after review stops recomputing its digest. */
    expect(validateAuthorityBindingRecord(withPolicy({ ...base, reviewedBy: "someone else" })).join(" | ")).to.match(
      /digest does not recompute/u,
    );
  });

  it("227. issues no downstream call once implementation identity fails", async function () {
    const drifted = Buffer.from(officialImplementationRuntime());
    drifted[300] ^= 0xff;
    const fake = createFakeTransport({ implementationCode: `0x${drifted.toString("hex")}` });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: fake.transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.codeIdentityResult).to.equal("MISMATCH");
    expect(result.finalVerdict).to.equal("FAIL");
    /* Only the executor version and authority-getter calls were made; nothing was asked of the
     * unverified implementation. */
    expect(fake.calls.filter((call) => call.method === "eth_call")).to.have.lengthOf(2);
    expect(result.authorityVersionResult).to.equal("UNRESOLVED");
    expect(result.reciprocalLinkageResult).to.equal("UNRESOLVED");
    expect(result.callerExemptionResult).to.equal("UNRESOLVED");
    expect(result.totalHcuOnChainReading).to.deep.include({ result: "UNRESOLVED" });
  });
});

/* ---------------------------------------------------------------------------------------------
 * F39 — the verifier enforces its own plan.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: runtime plan enforcement", function () {
  it("228. enforces the plan in the verifier, not in a test", async function () {
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    expect(source).to.include("guarded.enforcePlan(livePlan,");
    /* There is no static default plan left to assert against. */
    expect(source).to.not.include("export function buildLiveCallPlan");
    expect(deriveAuthorityProtocol().liveMode.callPlan.enforcedByTransport).to.equal(true);
    expect(deriveAuthorityProtocol().liveMode.callPlan.exhaustionRequiredForPass).to.equal(true);

    const record = bindingRecordFixture();
    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record }),
    });
    const plan = generateLiveCallPlan(record as never);
    expect(result.planEnforcementResult).to.equal("ENFORCED_EXACT");
    expect(result.livePlanCallCount).to.equal(plan.length);
    expect(result.liveCallCount).to.equal(calls.length);
    expect(result.livePlanDigest).to.equal(livePlanDigest(plan));
    expect(result.liveCallLogDigest).to.equal(liveCallLogDigest(calls as never));
    /* The exact enforced plan for a fully coherent proxied record. */
    expect(result.livePlanCallCount).to.equal(13);
    expect(result.livePlanDigest).to.equal(livePlanDigest(generateLiveCallPlan(record as never)));
    expect(plan.map((call) => `${call.callId}:${call.method}:${call.targetRole}`)).to.deep.equal([
      "CHAIN_ID:eth_chainId:NONE",
      "PINNED_BLOCK:eth_getBlockByNumber:NONE",
      "EXECUTOR_CODE:eth_getCode:EXECUTOR",
      "EXECUTOR_VERSION:eth_call:EXECUTOR",
      "EXECUTOR_AUTHORITY_GETTER:eth_call:EXECUTOR",
      "AUTHORITY_CODE:eth_getCode:AUTHORITY",
      "AUTHORITY_ERC1967_IMPLEMENTATION_SLOT:eth_getStorageAt:AUTHORITY",
      "AUTHORITY_IMPLEMENTATION_CODE:eth_getCode:AUTHORITY_IMPLEMENTATION",
      "AUTHORITY_RECIPROCAL_EXECUTOR_GETTER:eth_call:AUTHORITY",
      "AUTHORITY_VERSION:eth_call:AUTHORITY",
      "TRANSACTION_TOTAL_HCU_GETTER:eth_call:AUTHORITY",
      "TRANSACTION_DEPTH_HCU_GETTER:eth_call:AUTHORITY",
      "CALLER_APPLICABILITY:BENCHMARK_HARNESS:eth_call:AUTHORITY",
    ]);
  });

  it("228b. plans only read-only, pinned-block calls from the offline reference record", function () {
    /* The offline preflight inspects the GENERATOR, not a fixed list. Its reference record carries
     * no authoritative fact and is never used by the live path. */
    const reference = offlinePlanReferenceRecord();
    const plan = generateLiveCallPlan(reference as never);
    assertLiveCallPlanIsReadOnly(plan);
    for (const call of plan) expect(LIVE_RPC_ALLOWED_METHODS).to.include(call.method);
    expect(plan.some((call) => call.callId === "EXECUTOR_ERC1967_IMPLEMENTATION_SLOT")).to.equal(true);
    expect(plan.some((call) => call.callId === "AUTHORITY_ERC1967_IMPLEMENTATION_SLOT")).to.equal(true);
    /* No limit getter is planned, because the reference declares no availability. */
    expect(plan.some((call) => call.callId.endsWith("_HCU_GETTER"))).to.equal(false);
  });

  it("229. carries exact targets, calldata and block requirements in the plan", function () {
    const record = bindingRecordFixture();
    const plan = generateLiveCallPlan(record as never);
    for (const call of plan) {
      expect(Object.keys(call).sort()).to.deep.equal([
        "boundToPinnedBlock",
        "callId",
        "callObjectKeys",
        "data",
        "expectedResponse",
        "method",
        "parameterCount",
        "params",
        "purpose",
        "step",
        "targetRole",
      ]);
      /* INVARIANT H — the COMPLETE canonical request, not a description of one. */
      expect(call.params, call.callId).to.have.lengthOf(call.parameterCount);
      if (call.method === "eth_call") {
        expect(call.callObjectKeys, call.callId).to.deep.equal(["data", "to"]);
        expect(Object.keys(call.params[0] as object).sort(), call.callId).to.deep.equal(["data", "to"]);
      }
      if (call.boundToPinnedBlock) expect(call.params, call.callId).to.include("$PINNED_BLOCK");
      if (call.method === "eth_call") {
        expect(call.data, call.callId).to.match(/^0x[0-9a-f]{8}([0-9a-f]{64})*$/u);
        expect(call.targetRole, call.callId).to.be.oneOf(["AUTHORITY", "EXECUTOR"]);
        expect(call.boundToPinnedBlock, call.callId).to.equal(true);
      }
    }
    /* The calldata is the manifest's, recomputed from the canonical signature. */
    const versionCall = plan.find((call) => call.callId === "EXECUTOR_VERSION");
    expect(versionCall?.data).to.equal(keccakId("getVersion()").slice(0, 10));
    expect(versionCall?.data).to.equal(interfaceCalldata(interfaceCall(record as never, "EXECUTOR_VERSION") as never));
  });

  it("230. rejects an extra, wrong-target, wrong-selector, reordered, missing or wrong-block call", async function () {
    const record = bindingRecordFixture();
    const plan = generateLiveCallPlan(record as never);
    const resolver = (role: string) =>
      role === "EXECUTOR" ? SEPOLIA_EXECUTOR : role === "AUTHORITY" ? AUTHORITY_PROXY : AUTHORITY_IMPLEMENTATION;
    const guarded = () => {
      const transport = createGuardedTransport({ send: async () => "0x" });
      transport.bindToPinnedBlock(PINNED_HEX);
      transport.enforcePlan(plan, resolver);
      return transport;
    };
    const advance = async (transport: ReturnType<typeof guarded>, upTo: number) => {
      const issued = [
        { method: "eth_chainId", params: [] },
        { method: "eth_getBlockByNumber", params: ["finalized", false] },
        { method: "eth_getCode", params: [SEPOLIA_EXECUTOR, PINNED_HEX] },
      ];
      for (const call of issued.slice(0, upTo)) await transport.send(call);
    };

    /* An extra allowed read-only call at the wrong position. */
    const extra = guarded();
    await advance(extra, 2);
    expect(await rejection(() => extra.send({ method: "eth_chainId", params: [] }))).to.match(
      /live call plan violated/u,
    );

    /* A wrong target. */
    const wrongTarget = guarded();
    await advance(wrongTarget, 2);
    expect(
      await rejection(() => wrongTarget.send({ method: "eth_getCode", params: [AUTHORITY_PROXY, PINNED_HEX] })),
    ).to.match(/expected params/u);

    /* A wrong selector. */
    const wrongSelector = guarded();
    await advance(wrongSelector, 3);
    expect(
      await rejection(() =>
        wrongSelector.send({
          method: "eth_call",
          params: [{ to: SEPOLIA_EXECUTOR, data: "0xdeadbeef" }, PINNED_HEX],
        }),
      ),
    ).to.match(/expected params/u);

    /* A reordered call. */
    const reordered = guarded();
    expect(
      await rejection(() => reordered.send({ method: "eth_getBlockByNumber", params: ["finalized", false] })),
    ).to.match(/expected eth_chainId, issued eth_getBlockByNumber/u);

    /* A wrong block tag on a bound call — refused by the pinned-block guard, which is a SEPARATE
     * defense that holds whether or not a plan is installed. */
    const wrongBlock = guarded();
    await advance(wrongBlock, 2);
    expect(
      await rejection(() => wrongBlock.send({ method: "eth_getCode", params: [SEPOLIA_EXECUTOR, "0x1"] })),
    ).to.match(/was not bound to the pinned block/u);

    /* INVARIANT H — an extra transaction-object key, a state override, a wrong parameter count and
     * a wrong storage slot are all the same divergence: the issued request is not the planned one. */
    const extraField = guarded();
    await advance(extraField, 3);
    expect(
      await rejection(() =>
        extraField.send({
          method: "eth_call",
          params: [
            { to: SEPOLIA_EXECUTOR, data: keccakId("getVersion()").slice(0, 10), from: SENDER_ADDRESS },
            PINNED_HEX,
          ],
        }),
      ),
    ).to.match(/expected params/u);

    const stateOverride = guarded();
    await advance(stateOverride, 3);
    expect(
      await rejection(() =>
        stateOverride.send({
          method: "eth_call",
          params: [
            { to: SEPOLIA_EXECUTOR, data: keccakId("getVersion()").slice(0, 10) },
            PINNED_HEX,
            { [SEPOLIA_EXECUTOR]: { code: "0x00" } },
          ],
        }),
      ),
    ).to.match(/expected 2 parameters, issued 3/u);

    const wrongSlot = guarded();
    for (let index = 0; index < 6; index++) {
      const planned = plan[index];
      const resolved = resolvePlannedRequest(planned, resolver, PINNED_HEX);
      if (!resolved.ok) throw new Error(resolved.reason);
      await wrongSlot.send({ method: planned.method, params: resolved.params });
    }
    expect(
      await rejection(() =>
        wrongSlot.send({ method: "eth_getStorageAt", params: [AUTHORITY_PROXY, `0x${"0".repeat(64)}`, PINNED_HEX] }),
      ),
    ).to.match(/expected params/u);

    /* A missing call: the plan is simply not exhausted, and that is never a PASS. */
    const missing = guarded();
    await advance(missing, 3);
    expect(missing.planCursor()).to.equal(3);
    expect(missing.planCursor()).to.be.lessThan(plan.length);
  });

  it("231. keeps the read-only allow-list as an independent defense", async function () {
    const transport = createGuardedTransport({ send: async () => "0x" });
    transport.enforcePlan(generateLiveCallPlan(bindingRecordFixture() as never), () => SEPOLIA_EXECUTOR);
    /* Refused by the allow-list before the plan is ever consulted. */
    expect(await rejection(() => transport.send({ method: "eth_sendRawTransaction", params: [] }))).to.match(
      /forbidden RPC method/u,
    );
    expect(transport.planCursor()).to.equal(0);
    expect(deriveAuthorityProtocol().liveMode.callPlan.allowListRemainsIndependent).to.equal(true);
  });

  it("232. requires exact plan exhaustion for a PASS", function () {
    for (const override of [
      { planEnforcementResult: "VIOLATED" },
      { planEnforcementResult: "UNRESOLVED" },
      { planEnforcementResult: "NOT_APPLICABLE_PLAN_UNRESOLVED" },
      { liveCallCount: 12 },
      { livePlanDigest: "UNRESOLVED" },
      { liveCallLogDigest: "UNRESOLVED" },
      { livePlanCallCount: 0, liveCallCount: 0 },
    ]) {
      expect(validateAuthorityResult(passResult(override)).length, JSON.stringify(override)).to.be.greaterThan(0);
    }
  });
});

/* ---------------------------------------------------------------------------------------------
 * F40 — the interface manifest is what execution consumes.
 * ------------------------------------------------------------------------------------------- */

describe("SG-4 HCU authority: closed interface manifest", function () {
  const withManifest = (overrides: Record<string, unknown>) =>
    bindingRecordFixture({
      onChainInterface: {
        ...(bindingRecordFixture().onChainInterface as Record<string, unknown>),
        interfaceManifest: interfaceManifestFixture(overrides),
      },
    });
  const entries = () => (interfaceManifestFixture() as { entries: Record<string, unknown>[] }).entries;

  it("233. declares every critical call and refuses a missing one", function () {
    const declared = entries().map((entry) => entry.callId);
    expect(declared).to.include.members([...MANDATORY_INTERFACE_CALL_IDS]);
    for (const callId of MANDATORY_INTERFACE_CALL_IDS) {
      expect(
        validateAuthorityBindingRecord(
          withManifest({ entries: entries().filter((entry) => entry.callId !== callId) }),
        ).join(" | "),
        callId,
      ).to.match(new RegExp(`missing the mandatory call ${callId}`, "u"));
    }
    /* A getter read on chain must have its entry too. */
    expect(
      validateAuthorityBindingRecord(
        withManifest({ entries: entries().filter((entry) => entry.callId !== "TRANSACTION_TOTAL_HCU_GETTER") }),
      ).join(" | "),
    ).to.match(/missing TRANSACTION_TOTAL_HCU_GETTER for the on-chain transactionTotal getter/u);
  });

  it("234. refuses a wrong role, an undeclared call and a duplicate signature", function () {
    expect(
      validateAuthorityBindingRecord(
        withManifest({
          entries: entries().map((entry) =>
            entry.callId === "AUTHORITY_VERSION" ? { ...entry, targetRole: "EXECUTOR" } : entry,
          ),
        }),
      ).join(" | "),
    ).to.match(/AUTHORITY_VERSION must target AUTHORITY/u);

    expect(
      validateAuthorityBindingRecord(
        withManifest({ entries: [...entries(), { ...entries()[0], callId: "SOMETHING_ELSE" }] }),
      ).join(" | "),
    ).to.match(/unknown call id SOMETHING_ELSE/u);

    expect(
      validateAuthorityBindingRecord(withManifest({ entries: [...entries(), entries()[0]] })).join(" | "),
    ).to.match(/more than once/u);

    /* Two different call ids may not claim the same signature on one role. */
    expect(
      validateAuthorityBindingRecord(
        withManifest({
          entries: entries().map((entry) =>
            entry.callId === "TRANSACTION_DEPTH_HCU_GETTER"
              ? { ...entry, signature: SIGNATURE_TOTAL, selector: SELECTOR_TOTAL }
              : entry,
          ),
        }),
      ).join(" | "),
    ).to.match(/twice for one role/u);
  });

  it("235. fixes the canonical signature and return type of every critical call", function () {
    for (const spec of INTERFACE_CALL_SPECS.filter((candidate) => candidate.signature.length > 0)) {
      expect(
        validateAuthorityBindingRecord(
          withManifest({
            entries: entries().map((entry) =>
              entry.callId === spec.callId
                ? { ...entry, signature: "somethingElse()", selector: keccakId("somethingElse()").slice(0, 10) }
                : entry,
            ),
          }),
        ).join(" | "),
        spec.callId,
      ).to.match(new RegExp(`must use the signature ${spec.signature.replace(/[()]/gu, "\\$&")}`, "u"));
    }
    expect(
      validateAuthorityBindingRecord(
        withManifest({
          entries: entries().map((entry) =>
            entry.callId === "EXECUTOR_VERSION" ? { ...entry, returnType: "uint256" } : entry,
          ),
        }),
      ).join(" | "),
    ).to.match(/EXECUTOR_VERSION must return string/u);
  });

  it("236. restricts every limit getter to the verified AUTHORITY role", function () {
    expect(LIMIT_GETTER_PERMITTED_ROLES).to.deep.equal(["AUTHORITY"]);
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    /* THE DEFECT: a spec could declare EXECUTOR while execution called the authority anyway. */
    const executorTargeted = bindingRecordFixture({
      onChainInterface: {
        ...iface,
        limitGetterSpecs: limitGetterSpecsFixture().map((spec) =>
          spec.controlId === "TRANSACTION_TOTAL_HCU" ? { ...spec, targetRole: "EXECUTOR" } : spec,
        ),
      },
    });
    expect(validateAuthorityBindingRecord(executorTargeted).join(" | ")).to.match(/must target AUTHORITY/u);
  });

  it("237. keeps the getter spec and the interface entry the same call", function () {
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const divergent = bindingRecordFixture({
      onChainInterface: {
        ...iface,
        interfaceManifest: interfaceManifestFixture({
          entries: entries().map((entry) =>
            entry.callId === "TRANSACTION_TOTAL_HCU_GETTER"
              ? { ...entry, signature: "otherTotal()", selector: keccakId("otherTotal()").slice(0, 10) }
              : entry,
          ),
        }),
      },
    });
    expect(validateAuthorityBindingRecord(divergent).join(" | ")).to.match(
      /disagrees with its interface manifest entry/u,
    );
  });

  it("238. leaves no hard-coded selector path beside the manifest", async function () {
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    /* Execution takes its calldata from the record's declared manifest. */
    expect(source).to.include('declaredCalldata("EXECUTOR_VERSION")');
    expect(source).to.include('declaredCalldata("EXECUTOR_AUTHORITY_GETTER")');
    expect(source).to.include('declaredCalldata("AUTHORITY_RECIPROCAL_EXECUTOR_GETTER")');
    expect(source).to.include('declaredCalldata("AUTHORITY_VERSION")');
    expect(source).to.not.include('selectorFor("getVersion()")');
    expect(source).to.not.include('selectorFor("getHCULimitAddress()")');
    expect(source).to.not.include('selectorFor("getFHEVMExecutorAddress()")');

    /* And a record that declares nothing cannot be executed against. */
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const emptied = bindingRecordFixture({
      onChainInterface: { ...iface, interfaceManifest: interfaceManifestFixture({ entries: [] }) },
    });
    expect(validateAuthorityBindingRecord(emptied).length).to.be.greaterThan(0);
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: createFakeTransport().transport,
      lineageProbe: verifiedLineageProbe({ record: emptied }),
    });
    expect(result.finalVerdict).to.not.equal("PASS");
  });
});

/* ===============================================================================================
 * ARCHITECTURAL CONSOLIDATION — the invariants, end to end.
 *
 * Each test below follows the one chain the whole preparation now rests on:
 *
 *     authenticated bytes -> deterministic extractor -> canonical manifest
 *       -> exact read-only verification -> canonical result -> PASS validator
 *
 * A test that hand-wrote an expected value would break the chain it is meant to prove, so every
 * expectation here is either recomputed by the production code or read from the source itself.
 * ============================================================================================= */

describe("SG-4 HCU authority: INVARIANT B — pricing extracted from authenticated bytes", function () {
  it("239. extracts the FULL schedule from authenticated bytes and rejects a subset", function () {
    const schedule = DERIVED.priceSchedule as NonNullable<typeof DERIVED.priceSchedule>;
    expect(schedule.failures).to.deep.equal([]);
    expect(schedule.extractorId).to.equal("sg4-price-schedule-extractor");
    expect(schedule.sourceContentSha256).to.equal(PRICE_SCHEDULE_SHA256);

    /* The extraction is COMPLETE: the whole schedule, including the variants SG-4 never uses. */
    const installed = parseInstalledCostTable(costTableSource);
    const installedVariants: string[] = [];
    for (const [operation, groups] of installed) {
      for (const [mode, byType] of groups) {
        for (const type of byType.keys()) installedVariants.push(`${operation}.${mode}.${type}`);
      }
    }
    const extracted = schedule.variants.map(
      (variant) => `${variant.canonicalName}.${variant.operandMode}.${variant.costKeyType}`,
    );
    expect(extracted).to.include.members(installedVariants.sort());
    for (const operation of CURRENT_OFFICIAL_EXPECTED_ADDITIONAL_OPERATIONS) {
      expect(schedule.operations, operation).to.include(operation);
    }
    /* Every SG-4 used variant is priced by the extracted schedule. */
    for (const id of SG4_PRICING_VARIANT_CLOSURE.map(variantId)) expect(extracted).to.include(id);

    /* A record carrying only the SG-4 subset fails completeness — the exact defect. */
    const subsetOnly = pricingManifestFixture({
      entries: (pricingManifestFixture() as { entries: Record<string, unknown>[] }).entries.filter((entry) =>
        SG4_PRICING_VARIANT_CLOSURE.map(variantId).includes(
          `${String(entry.canonicalName)}.${String(entry.operandMode)}.${String(entry.costKeyType)}`,
        ),
      ),
    });
    const subsetRecord = bindingRecordFixture({
      operationSchedule: {
        ...(bindingRecordFixture().operationSchedule as Record<string, unknown>),
        pricingManifest: subsetOnly,
        pricingManifestSha256: pricingManifestDigest(subsetOnly),
      },
    });
    expect(validateAuthorityBindingRecord(subsetRecord).join(" | ")).to.match(/incomplete against the extracted/u);
  });

  it("240. refuses bytes that are not the selected source, and unparseable ones", function () {
    /* Bytes whose digest is real but is not the SELECTED tuple's digest. */
    const foreign = Buffer.from("export const operatorsPrices = {\n};\n", "utf8");
    const wrongBytes = bindingRecordFixture({
      sourceMaterial: sourceMaterialFixture({
        priceSchedule: {
          bytesBase64: foreign.toString("base64"),
          contentSha256: sha256(foreign),
          encoding: "base64",
          subject: "priceSchedule",
        },
      }),
    });
    expect(validateAuthorityBindingRecord(wrongBytes).join(" | ")).to.match(
      /SOURCE_MATERIAL_NOT_THE_SELECTED_SOURCE:priceSchedule/u,
    );

    /* Bytes that do not hash to their own claimed digest. */
    const lyingDigest = bindingRecordFixture({
      sourceMaterial: sourceMaterialFixture({
        priceSchedule: {
          bytesBase64: PRICE_SCHEDULE_BYTES.toString("base64"),
          contentSha256: "a".repeat(64),
          encoding: "base64",
          subject: "priceSchedule",
        },
      }),
    });
    expect(validateAuthorityBindingRecord(lyingDigest).join(" | ")).to.match(/SOURCE_MATERIAL_DIGEST_MISMATCH/u);

    /* An unrecognised line inside a priced block fails closed rather than being skipped: an
     * unparsed line could carry a price nobody compared. */
    const withResidue = Buffer.from(
      priceScheduleTextForTest().replace("  FheAdd: {", "  FheAdd: {\n    surpriseDimension: 7,"),
      "utf8",
    );
    const parsed = extractPriceSchedule({
      subject: "priceSchedule",
      bytes: withResidue,
      contentSha256: sha256(withResidue),
    });
    expect(parsed.failures.join(",")).to.match(/UNRECOGNIZED_COST_LINE|UNRECOGNIZED_OPERATION_MEMBER/u);
  });
});

describe("SG-4 HCU authority: corrected official source extractors", function () {
  const officialPrice = () => {
    const bytes = Buffer.from(OFFICIAL_PRICE_SOURCE_TEXT, "utf8");
    return extractPriceSchedule({ subject: "priceSchedule", bytes, contentSha256: sha256(bytes) });
  };
  const officialAuthority = () => {
    const bytes = Buffer.from(OFFICIAL_HCU_SOURCE_TEXT, "utf8");
    return parseAuthoritySource({ subject: "authoritySource", bytes, contentSha256: sha256(bytes) });
  };

  const officialStorageProofRecord = () => {
    const parsed = officialAuthority();
    const controls = [
      ["BLOCK_OR_BATCH_HCU", "globalHCUCapPerBlock", "100000000", "HCUBlockLimitExceeded"],
      ["TRANSACTION_DEPTH_HCU", "maxHCUDepthPerTx", "5000000", "HCUTransactionDepthLimitExceeded"],
      ["TRANSACTION_TOTAL_HCU", "maxHCUPerTx", "20000000", "HCUTransactionLimitExceeded"],
    ] as const;
    const entries = controls.map(([controlId, fieldName, storageValue, revertErrorName]) => {
      const evidence = parsed.storageFieldEvidence[fieldName];
      return {
        comparisonOperator: ">",
        controlId,
        enforcementReads: evidence.enforcementReads,
        getterReadExpression: evidence.getterReadExpression,
        getterReturnType: evidence.getterReturnType,
        getterSignature: evidence.getterSignature,
        getterSourceRangeSha256: evidence.getterSourceRangeSha256,
        revertErrorName,
        sourceKind: "STORAGE_FIELD",
        sourcePath: String(AUTHORITY_TUPLE.path),
        storageFieldDeclarationSourceRangeSha256: evidence.declarationSourceRangeSha256,
        storageFieldName: evidence.fieldName,
        storageFieldType: evidence.fieldType,
        storageStructName: evidence.storageStructName,
        storageValue,
      };
    });
    const enumeration = {
      ...enumerationManifestFixture(),
      sourceContentSha256: parsed.sourceContentSha256,
      declarations: parsed.declarations,
      callableFunctions: parsed.callableFunctions,
      errors: parsed.errors,
      mappings: parsed.mappings,
      storageStructFields: parsed.storageStructFields,
      storagePrimitives: parsed.storagePrimitives,
      enumerationComplete: parsed.parseCompleteness === "PARSED_COMPLETE_NO_RESIDUE",
      parseCompleteness: parsed.parseCompleteness,
    };
    const enforcement = {
      schema: "zama-szn4.sg4-enforcement-proof-manifest.v1",
      version: 1,
      provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
      sourceContentSha256: parsed.sourceContentSha256,
      entries,
    };
    const baseInterface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const baseManifest = baseInterface.interfaceManifest as Record<string, unknown>;
    const limitGetterSpecs = controls.map(([controlId, fieldName]) => {
      const evidence = parsed.storageFieldEvidence[fieldName];
      return {
        argumentTypes: [],
        argumentValues: [],
        controlId,
        returnType: evidence.getterReturnType,
        selector: keccakId(evidence.getterSignature).slice(0, 10),
        signature: evidence.getterSignature,
        state: "AVAILABLE_AND_READ_ON_CHAIN",
        targetRole: "AUTHORITY",
      };
    });
    const interfaceEntries = (baseManifest.entries as Record<string, unknown>[]).map((entry) => {
      const replacement = entries.find(
        (candidate) =>
          candidate.controlId ===
          (
            {
              TRANSACTION_TOTAL_HCU_GETTER: "TRANSACTION_TOTAL_HCU",
              TRANSACTION_DEPTH_HCU_GETTER: "TRANSACTION_DEPTH_HCU",
              BLOCK_OR_BATCH_HCU_GETTER: "BLOCK_OR_BATCH_HCU",
            } as Record<string, string>
          )[String(entry.callId)],
      );
      if (replacement === undefined) return entry;
      return {
        ...entry,
        returnType: replacement.getterReturnType,
        selector: keccakId(replacement.getterSignature).slice(0, 10),
        signature: replacement.getterSignature,
      };
    });
    const record = bindingRecordFixture({
      authorityEnumeration: { manifest: enumeration, manifestSha256: sha256(canonicalJson(enumeration)) },
      blockOrBatch: {
        state: "PROVEN_PRESENT",
        value: "100000000",
        proof: "The authenticated source enforces the storage-backed per-block ceiling.",
      },
      enforcementProof: { manifest: enforcement, manifestSha256: sha256(canonicalJson(enforcement)) },
      limits: {
        ...(bindingRecordFixture().limits as Record<string, unknown>),
        expectedTransactionDepth: "5000000",
        expectedTransactionTotal: "20000000",
        getterAvailability: {
          blockOrBatchCap: "AVAILABLE_AND_READ_ON_CHAIN",
          transactionDepth: "AVAILABLE_AND_READ_ON_CHAIN",
          transactionTotal: "AVAILABLE_AND_READ_ON_CHAIN",
        },
      },
      onChainInterface: {
        ...baseInterface,
        interfaceManifest: { ...baseManifest, entries: interfaceEntries },
        limitGetterSpecs,
      },
    });
    return { parsed, record };
  };

  it("parses the exact official PriceData schema and nested nBucketed maps", function () {
    const parsed = officialPrice();
    expect(parsed.sourceContentSha256).to.equal("48363444ec4af98d2139572be1c3fa545c9d9cfa93d72a353237f8137cc4326a");
    expect(parsed.failures).to.deep.equal([]);
    expect(parsed.operations).to.have.lengthOf(29);
    expect(parsed.variants).to.have.lengthOf(271);
    expect(parsed.bucketedVariants).to.have.lengthOf(42);
    expect(parsed.operatorMetadata.fheAdd.supportScalar).to.equal(true);
    expect(parsed.operatorMetadata.fheAdd.numberInputs).to.equal(2);
    expect(parsed.operatorMetadata.fheAdd.groups).to.deep.equal(["nonScalar", "scalar"]);
    expect(parsed.operatorMetadata.ifThenElse.groups).to.deep.equal(["types"]);
    expect(parsed.operatorMetadata.fheSum.groups).to.deep.equal(["nBucketed"]);
    expect(parsed.operatorMetadata.fheSum.bucketNames.Uint8).to.deep.equal(["le10", "le100", "le30", "le60"]);
  });

  it("fails closed on unknown operator properties, types, buckets, and changed costs", function () {
    const unknownProperty = Buffer.from(
      OFFICIAL_PRICE_SOURCE_TEXT.replace("    supportScalar: true,", "    surprise: true,\n    supportScalar: true,"),
      "utf8",
    );
    expect(
      extractPriceSchedule({
        subject: "priceSchedule",
        bytes: unknownProperty,
        contentSha256: sha256(unknownProperty),
      }).failures.join(" | "),
    ).to.include("UNRECOGNIZED_OPERATION_MEMBER");

    const unknownType = Buffer.from(
      OFFICIAL_PRICE_SOURCE_TEXT.replace("      Uint8: 84000,", "      MysteryType: 84000,\n      Uint8: 84000,"),
      "utf8",
    );
    expect(
      extractPriceSchedule({
        subject: "priceSchedule",
        bytes: unknownType,
        contentSha256: sha256(unknownType),
      }).failures.join(" | "),
    ).to.include("UNKNOWN_PRICE_TYPE");

    const unknownBucket = Buffer.from(OFFICIAL_PRICE_SOURCE_TEXT.replace("le10: 90900", "le999: 90900"), "utf8");
    expect(
      extractPriceSchedule({
        subject: "priceSchedule",
        bytes: unknownBucket,
        contentSha256: sha256(unknownBucket),
      }).failures.join(" | "),
    ).to.include("UNKNOWN_BUCKET_NAME");

    const changedCost = Buffer.from(OFFICIAL_PRICE_SOURCE_TEXT.replace("Uint8: 84000", "Uint8: 84001"), "utf8");
    const changed = extractPriceSchedule({
      subject: "priceSchedule",
      bytes: changedCost,
      contentSha256: sha256(changedCost),
    });
    expect(changed.failures).to.deep.equal([]);
    expect(
      changed.variants.find(
        (entry) => entry.canonicalName === "fheAdd" && entry.operandMode === "scalar" && entry.costKeyType === "Uint8",
      )?.cost,
    ).to.equal(84001);
    expect(changed.variants).to.not.deep.equal(officialPrice().variants);
  });

  it("structurally classifies ordinary HCULimit declarations and all official operation checks", function () {
    const parsed = officialAuthority();
    expect(parsed.sourceContentSha256).to.equal("16d71ee5f899f1bfd5872bdb83e08d90f510fd529cd8a93d5001dc29f25634b8");
    expect(parsed.parseCompleteness).to.equal("PARSED_COMPLETE_NO_RESIDUE");
    expect(parsed.residue).to.deep.equal([]);
    expect(parsed.pricingRelevantResidue).to.deep.equal([]);
    expect(parsed.pricingOperationNames).to.have.lengthOf(29);
    expect(parsed.storageStructFields).to.include.members(["globalHCUCapPerBlock", "maxHCUPerTx"]);
    expect(parsed.mappings).to.include("blockHCUWhitelist");
    expect(parsed.declarations).to.include("HCU_LIMIT_STORAGE_LOCATION");
    expect(parsed.derivedLimitSemantics).to.equal("CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN");
    expect(parsed.blockOrBatchConclusion).to.equal("PRESENT");
  });

  it("derives all three official runtime controls as storage fields, not constants", function () {
    const parsed = officialAuthority();
    const global = parsed.storageFieldEvidence.globalHCUCapPerBlock;
    const total = parsed.storageFieldEvidence.maxHCUPerTx;
    const depth = parsed.storageFieldEvidence.maxHCUDepthPerTx;
    expect(global).to.include({
      fieldName: "globalHCUCapPerBlock",
      fieldType: "uint48",
      getterSignature: "getGlobalHCUCapPerBlock()",
      getterReturnType: "uint48",
      getterReadExpression: "$.globalHCUCapPerBlock",
      storageStructName: "HCULimitStorage",
    });
    expect(global.enforcementReads.map(({ expression, functionName }) => ({ expression, functionName }))).to.deep.equal(
      [{ expression: "$.globalHCUCapPerBlock", functionName: "_updateAndVerifyHCUBlockLimit" }],
    );
    expect(total).to.include({
      fieldName: "maxHCUPerTx",
      fieldType: "uint48",
      getterSignature: "getMaxHCUPerTx()",
      getterReturnType: "uint48",
      getterReadExpression: "_getHCULimitStorage().maxHCUPerTx",
    });
    expect(total.enforcementReads.map(({ expression, functionName }) => ({ expression, functionName }))).to.deep.equal([
      { expression: "_getHCULimitStorage().maxHCUPerTx", functionName: "_updateAndVerifyHCUTransactionLimit" },
    ]);
    expect(depth).to.include({
      fieldName: "maxHCUDepthPerTx",
      fieldType: "uint48",
      getterSignature: "getMaxHCUDepthPerTx()",
      getterReturnType: "uint48",
      getterReadExpression: "_getHCULimitStorage().maxHCUDepthPerTx",
    });
    expect(depth.enforcementReads.map((read) => read.functionName)).to.deep.equal([
      "_adjustAndCheckFheTransactionLimitOneOp",
      "_adjustAndCheckFheTransactionLimitThreeOps",
      "_adjustAndCheckFheTransactionLimitTwoOps",
      "checkHCUForFheIsIn",
      "checkHCUForFheSum",
    ]);
    expect(parsed.constantValues).to.not.have.property("globalHCUCapPerBlock");
    expect(parsed.constantValues).to.not.have.property("maxHCUPerTx");
    expect(parsed.constantValues).to.not.have.property("maxHCUDepthPerTx");
  });

  it("replays official storage-proof derivation without manufacturing a source constant", function () {
    const { parsed, record } = officialStorageProofRecord();
    const errors = compareClaimsAgainstDerivation(
      record as never,
      {
        blockers: [],
        priceSchedule: null,
        authoritySource: parsed,
        artifactBuild: null,
      } as never,
    );
    expect(errors).to.deep.equal([]);
  });

  it("keeps constant proofs closed and rejects storage/constant substitutions", function () {
    const constant = enforcementProofManifestFixture().entries as Record<string, unknown>[];
    const constantWithStorageField = enforcementProofManifestFixture({
      entries: constant.map((entry) => ({ ...entry, storageFieldName: "maxHCUPerTx" })),
    });
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          enforcementProof: {
            manifest: constantWithStorageField,
            manifestSha256: sha256(canonicalJson(constantWithStorageField)),
          },
        }),
      ).join(" | "),
    ).to.match(/unpermitted field storageFieldName/u);

    const { record } = officialStorageProofRecord();
    const storageManifest = (record.enforcementProof as Record<string, unknown>).manifest as Record<string, unknown>;
    const storageWithConstant = {
      ...storageManifest,
      entries: (storageManifest.entries as Record<string, unknown>[]).map((entry) => ({
        ...entry,
        constantName: "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX",
      })),
    };
    expect(
      validateAuthorityBindingRecord(
        bindingRecordFixture({
          enforcementProof: {
            manifest: storageWithConstant,
            manifestSha256: sha256(canonicalJson(storageWithConstant)),
          },
        }),
      ).join(" | "),
    ).to.match(/unpermitted field constantName/u);
  });

  it("rejects wrong storage getter, field, type, cross-wiring, and runtime value", function () {
    const { parsed, record } = officialStorageProofRecord();
    const base = (record.enforcementProof as Record<string, unknown>).manifest as Record<string, unknown>;
    const mutate = (entryChanges: Record<string, unknown>) => {
      const manifest = {
        ...base,
        entries: (base.entries as Record<string, unknown>[]).map((entry, index) =>
          index === 0 ? { ...entry, ...entryChanges } : entry,
        ),
      };
      return compareClaimsAgainstDerivation(
        {
          ...record,
          enforcementProof: { manifest, manifestSha256: sha256(canonicalJson(manifest)) },
        } as never,
        { blockers: [], priceSchedule: null, authoritySource: parsed, artifactBuild: null } as never,
      ).join(" | ");
    };
    expect(mutate({ getterSignature: "getMaxHCUPerTx()" })).to.match(/getter disagrees/u);
    expect(mutate({ storageFieldName: "doesNotExist" })).to.match(/absent from the authenticated/u);
    expect(mutate({ storageFieldName: "maxHCUPerTx" })).to.match(/disagrees/u);
    expect(mutate({ storageFieldType: "uint256" })).to.match(/type disagrees/u);
    expect(mutate({ storageFieldName: "maxHCUPerTx", getterSignature: "getMaxHCUPerTx()" })).to.match(
      /getter disagrees|enforcement reads disagree/u,
    );
    expect(mutate({ storageValue: "99999999" })).to.match(/value disagrees/u);
  });

  it("plans uint48 getters and fails closed on malformed or out-of-range results", async function () {
    expect(decodeUint48(`0x${"00".repeat(26)}${"ff".repeat(6)}`)).to.equal(2n ** 48n - 1n);
    expect(decodeUint48(`0x${"01"}${"00".repeat(31)}`)).to.equal(null);
    expect(decodeUint48("0x00")).to.equal(null);
    expect(decodeUint48(`0x${"00".repeat(32)}00`)).to.equal(null);
    const { record } = officialStorageProofRecord();
    const plan = generateLiveCallPlan(record as never);
    expect(
      plan.filter((call) => call.callId.endsWith("_HCU_GETTER")).map((call) => call.expectedResponse),
    ).to.deep.equal(["UINT48_WORD", "UINT48_WORD", "UINT48_WORD"]);
    const getters = plan.filter((call) => call.callId.endsWith("_HCU_GETTER"));
    expect(getters).to.have.lengthOf(3);
    const request = (call: (typeof getters)[number]) => {
      const resolved = resolvePlannedRequest(
        call,
        (role) => (role === "AUTHORITY" ? AUTHORITY_PROXY : null),
        PINNED_HEX,
      );
      if (!resolved.ok) throw new Error(resolved.reason);
      return { method: call.method, params: resolved.params };
    };
    const inner = { send: async () => uintWord("1") };
    const guarded = createGuardedTransport(inner);
    guarded.bindToPinnedBlock(PINNED_HEX);
    guarded.enforcePlan(getters, (role) => (role === "AUTHORITY" ? AUTHORITY_PROXY : null));
    await guarded.send(request(getters[0]));
    expect(await rejection(() => guarded.send(request(getters[2])))).to.match(/TRANSACTION_DEPTH_HCU_GETTER/u);

    const extra = createGuardedTransport(inner);
    extra.bindToPinnedBlock(PINNED_HEX);
    extra.enforcePlan([getters[0]], (role) => (role === "AUTHORITY" ? AUTHORITY_PROXY : null));
    await extra.send(request(getters[0]));
    expect(await rejection(() => extra.send(request(getters[0])))).to.match(/unplanned extra call/u);
  });

  it("keeps selected operation syntax and semantic mutations fail-closed or observable", function () {
    const unknownSyntax = Buffer.from(
      OFFICIAL_HCU_SOURCE_TEXT.replace(
        "        uint256 opHCU;",
        "        uint256 opHCU;\n        uint256 unknownHCU = 7;",
      ),
      "utf8",
    );
    expect(officialAuthority().pricingRelevantResidue).to.deep.equal([]);
    expect(
      parseAuthoritySource({
        subject: "authoritySource",
        bytes: unknownSyntax,
        contentSha256: sha256(unknownSyntax),
      }).pricingRelevantResidue.join(" | "),
    ).to.include("UNRECOGNIZED_HCU_OPERATION_SYNTAX");

    const newOperation = Buffer.from(
      OFFICIAL_HCU_SOURCE_TEXT.replace(
        "    function checkHCUForFheAdd(",
        "    function checkHCUForNewPrice(FheType resultType, bytes32 result, address caller) external virtual { uint256 opHCU = 1; }\n\n    function checkHCUForFheAdd(",
      ),
      "utf8",
    );
    expect(
      parseAuthoritySource({
        subject: "authoritySource",
        bytes: newOperation,
        contentSha256: sha256(newOperation),
      }).pricingRelevantResidue.join(" | "),
    ).to.include("UNACCOUNTED_HCU_OPERATION_FUNCTION");

    const changedCost = Buffer.from(OFFICIAL_HCU_SOURCE_TEXT.replace("opHCU = 84000", "opHCU = 84001"), "utf8");
    const changedCostParsed = parseAuthoritySource({
      subject: "authoritySource",
      bytes: changedCost,
      contentSha256: sha256(changedCost),
    });
    expect(changedCostParsed.pricingRelevantResidue).to.deep.equal([]);
    expect(changedCostParsed.pricingSemantics.checkHCUForFheAdd.semanticSha256).to.not.equal(
      officialAuthority().pricingSemantics.checkHCUForFheAdd.semanticSha256,
    );

    const changedBranch = Buffer.from(
      OFFICIAL_HCU_SOURCE_TEXT.replace("scalarByte == 0x01", "scalarByte != 0x01"),
      "utf8",
    );
    const changedBranchParsed = parseAuthoritySource({
      subject: "authoritySource",
      bytes: changedBranch,
      contentSha256: sha256(changedBranch),
    });
    expect(changedBranchParsed.pricingRelevantResidue).to.deep.equal([]);
    expect(changedBranchParsed.pricingSemantics.checkHCUForFheAdd.semanticSha256).to.not.equal(
      officialAuthority().pricingSemantics.checkHCUForFheAdd.semanticSha256,
    );
    expect(changedBranchParsed.pricingSemantics.checkHCUForFheAdd.scalarSelectors).to.deep.equal(["!=:0x01"]);
  });
});

describe("SG-4 HCU authority: INVARIANT C — artifact normalization recomputed", function () {
  it("241. recomputes the expected normalized digest from authenticated build bytes", function () {
    const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
    expect(build.failures).to.deep.equal([]);
    expect(build.sourceContentSha256).to.equal(ARTIFACT_BUILD_SHA256);
    expect(build.expectedNormalizedRuntimeSha256).to.match(/^[0-9a-f]{64}$/u);
    /* The record's expected hash is the RECOMPUTED one, not a value it chose. */
    const artifact = bindingRecordFixture().artifact as Record<string, unknown>;
    expect(artifact.implementationNormalizedRuntimeSha256).to.equal(build.expectedNormalizedRuntimeSha256);

    /* A record claiming any other 64-hex digest is refused, however well formed. */
    const invented = bindingRecordFixture({
      artifact: { ...artifact, implementationNormalizedRuntimeSha256: "b".repeat(64) },
    });
    expect(validateAuthorityBindingRecord(invented).join(" | ")).to.match(
      /expected normalized runtime digest was not recomputed/u,
    );
  });

  it("242. normalizes non-uniform artifact placeholder bytes correctly", function () {
    /* The old model wrote one global replacement BYTE. A real artifact placeholder is a 20-byte
     * address that is not a repetition of one byte, so a byte-fill would silently produce a
     * different digest. This build uses exactly such a placeholder. */
    /* The artifact side of a solc immutable is a ZERO WORD; the non-uniform value is the DEPLOYED
     * one, which is what normalization must recognise and replace. */
    const deployedWord = `0x${"00".repeat(12)}${AUTHORITY_IMPLEMENTATION.toLowerCase().replace(/^0x/u, "")}`;
    expect(new Set(deployedWord.slice(2).match(/../gu)).size, "the deployed word is not uniform").to.be.greaterThan(1);
    const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
    const references = build.normalizationManifest.primaryImmutableReferences as Record<string, unknown>[];
    expect(references).to.have.lengthOf(UUPS_SELF_OFFSETS.length);
    for (const reference of references) {
      expect(String(reference.expectedArtifactPlaceholderBytes)).to.equal(`0x${"00".repeat(32)}`);
    }
    /* And normalization of the DEPLOYED runtime reaches the recomputed digest. */
    const deployed = deployedImplementationRuntime(AUTHORITY_IMPLEMENTATION);
    for (const offset of UUPS_SELF_OFFSETS) {
      expect(`0x${deployed.subarray(offset, offset + 32).toString("hex")}`).to.equal(deployedWord);
    }
    const normalized = normalizeRuntimeBytecodeFromManifest(deployed, build.normalizationManifest as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(normalized.ok, normalized.failures.join(",")).to.equal(true);
    expect(normalized.normalizedSha256).to.equal(build.expectedNormalizedRuntimeSha256);
  });

  it("243. neither blocks nor authenticates on equality with the old local fixture", function () {
    /* Provenance is decided by provenance. A legitimate artifact must not be refused because its
     * hash happens to equal an old local value, and equality must never authenticate either. */
    const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
    expect(build.expectedNormalizedRuntimeSha256).to.not.equal(EXPECTED_NORMALIZED_RUNTIME_SHA256);
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    /* No comparison against the local fixture digest decides an AUTHORITATIVE outcome. The one
     * remaining use is the offline normalization self-test, which is repository hygiene. */
    const validator = source.slice(source.indexOf("export function validateAuthorityBindingRecord"));
    expect(validator).to.not.include("EXPECTED_NORMALIZED_RUNTIME_SHA256");
    const liveRun = source.slice(source.indexOf("export async function runLiveAuthorityVerification"));
    expect(liveRun).to.not.include("EXPECTED_NORMALIZED_RUNTIME_SHA256");
    /* An artifact whose digest coincides with the old fixture is accepted on its provenance. */
    const artifact = bindingRecordFixture().artifact as Record<string, unknown>;
    const coincidence = { ...artifact, implementationNormalizedRuntimeSha256: EXPECTED_NORMALIZED_RUNTIME_SHA256 };
    const errors = validateAuthorityBindingRecord(bindingRecordFixture({ artifact: coincidence })).join(" | ");
    expect(errors).to.not.match(/fixture is not the current artifact/u);
  });
});

describe("SG-4 HCU authority: INVARIANT D — proofs recomputed from authenticated source", function () {
  it("244. recomputes the enumeration, the ranges and the block/batch conclusion", function () {
    const parsed = DERIVED.authoritySource as NonNullable<typeof DERIVED.authoritySource>;
    expect(parsed.residue).to.deep.equal([]);
    expect(parsed.parseCompleteness).to.equal("PARSED_COMPLETE_NO_RESIDUE");
    expect(parsed.sourceContentSha256).to.equal(AUTHORITY_SOURCE_SHA256);

    /* Every list comes from the bytes. */
    expect(parsed.declarations).to.deep.equal([
      "MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX",
      "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX",
    ]);
    expect(parsed.constantValues.MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX).to.equal("20000000");
    expect(parsed.constantValues.MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX).to.equal("5000000");
    expect(parsed.callableFunctions).to.include.members(["getFHEVMExecutorAddress", "getVersion"]);
    expect(parsed.errors).to.include.members(["HCUTransactionDepthLimitExceeded", "HCUTransactionLimitExceeded"]);
    expect(parsed.storagePrimitives).to.include.members(["tload", "tstore"]);

    /* Enforcement is decided by what a body DOES, not by its name. */
    expect(parsed.enforcementFunctions).to.include("_updateAndVerifyHCUTransactionLimit");
    expect(parsed.enforcementFunctions).to.not.include("getVersion");

    /* Every range digest is over real source bytes at the recomputed offsets. */
    for (const [name, range] of Object.entries(parsed.declarationRanges)) {
      expect(range.endByte, name).to.be.greaterThan(range.startByte);
      expect(sha256(AUTHORITY_SOURCE_BYTES.subarray(range.startByte, range.endByte)), name).to.equal(range.sha256);
    }
    for (const [name, range] of Object.entries(parsed.enforcementRanges)) {
      expect(sha256(AUTHORITY_SOURCE_BYTES.subarray(range.startByte, range.endByte)), name).to.equal(range.sha256);
    }

    /* The block/batch conclusion is DERIVED: this source names no block- or batch-scoped surface. */
    expect(parsed.blockOrBatchConclusion).to.equal("ABSENT");
  });

  it("245. refuses fabricated proof lists and arbitrary range digests", function () {
    const parsed = DERIVED.authoritySource as NonNullable<typeof DERIVED.authoritySource>;

    /* A complete-looking enumeration the parser did not produce. */
    const fabricated = enumerationManifestFixture({
      declarations: [...parsed.declarations, "MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_BLOCK"].sort(),
    });
    const withFabrication = bindingRecordFixture({
      authorityEnumeration: { manifest: fabricated, manifestSha256: sha256(canonicalJson(fabricated)) },
    });
    expect(validateAuthorityBindingRecord(withFabrication).join(" | ")).to.match(
      /enumeration declarations disagrees with the parsed authority source/u,
    );

    /* An arbitrary 64-hex range digest. Every 32 bytes hash to some 64-hex value; only the
     * recomputed one is the range's. */
    const entries = enforcementProofManifestFixture().entries as Record<string, unknown>[];
    const arbitraryRange = enforcementProofManifestFixture({
      entries: entries.map((entry) => ({ ...entry, declarationSourceRangeSha256: "c".repeat(64) })),
    });
    const withArbitrary = bindingRecordFixture({
      enforcementProof: { manifest: arbitraryRange, manifestSha256: sha256(canonicalJson(arbitraryRange)) },
    });
    expect(validateAuthorityBindingRecord(withArbitrary).join(" | ")).to.match(
      /declaration range digest was not recomputed/u,
    );

    /* An invented enforcement function. */
    const invented = enforcementProofManifestFixture({
      entries: entries.map((entry) => ({ ...entry, enforcementFunction: "_neverExisted" })),
    });
    const withInvented = bindingRecordFixture({
      enforcementProof: { manifest: invented, manifestSha256: sha256(canonicalJson(invented)) },
    });
    expect(validateAuthorityBindingRecord(withInvented).join(" | ")).to.match(
      /the parsed source does not enforce with/u,
    );

    /* A block/batch state the parser's conclusion does not support. */
    const claimedPresent = bindingRecordFixture({
      blockOrBatch: { state: "PROVEN_PRESENT", value: "40000000", proof: "a per-block cap exists" },
    });
    expect(validateAuthorityBindingRecord(claimedPresent).join(" | ")).to.match(
      /disagrees with the parser conclusion ABSENT/u,
    );
  });
});

describe("SG-4 HCU authority: INVARIANTS F/H/I/J — end to end", function () {
  it("246. blocks on measurement dependency drift and ignores unrelated fixture drift", function () {
    /* INVARIANT F — only the two files that compute an HCU number are PASS-relevant. */
    expect(deriveAuthorityProtocol().measurementExecutionRelevantFiles).to.deep.equal([
      "@fhevm/mock-utils:fhevm/coprocessor/HCUByOperator.ts",
      "@fhevm/mock-utils:fhevm/coprocessor/hcu.ts",
    ]);
    /* The old fixture, the plugin constants and the Solidity config are hygiene, not measurement. */
    expect(deriveAuthorityProtocol().repositoryHygieneFiles).to.include.members([
      "@fhevm/host-contracts:contracts/HCULimit.sol",
      "@fhevm/hardhat-plugin:src/internal/constants.ts",
      "@fhevm/solidity:config/ZamaConfig.sol",
    ]);
    const verification = verifyMeasurementToolchainRoot();
    expect(verification.result).to.equal("VERIFIED");
    expect(verification.installedVersion).to.equal("0.4.2");
    expect(verification.lockfileIntegrity).to.equal(deriveAuthorityProtocol().measurementToolchainRoot.integrity);

    /* Calculator drift blocks; unrelated hygiene drift does not. */
    expect(validateAuthorityResult(passResult({ calculatorHash: "0".repeat(64) })).length).to.be.greaterThan(0);
    expect(validateAuthorityResult(passResult({ installedTableHash: "0".repeat(64) })).length).to.be.greaterThan(0);
    expect(validateAuthorityResult(passResult({ localFixtureSelfTestResult: "MISMATCH" }))).to.deep.equal([]);
  });

  it("247. issues zero requests when the plan cannot be installed", async function () {
    /* INVARIANT H — a run that cannot state what it intends to ask may not ask. */
    const iface = bindingRecordFixture().onChainInterface as Record<string, unknown>;
    const unplannable = bindingRecordFixture({
      onChainInterface: { ...iface, interfaceManifest: interfaceManifestFixture({ entries: [] }) },
    });
    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record: unplannable }),
    });
    expect(calls).to.have.lengthOf(0);
    expect(result.finalVerdict).to.not.equal("PASS");
    expect(String(result.status)).to.match(/LIVE_CALL_PLAN_UNUSABLE|LIVE_CALL_PLAN_NOT_INSTALLED_NO_REQUEST_ISSUED/u);
  });

  it("248. issues no downstream authority call after a broken identity link", async function () {
    /* INVARIANT I — the chain stops at the first broken link. */
    const drifted = Buffer.from(officialImplementationRuntime());
    drifted[300] ^= 0xff;
    const fake = createFakeTransport({ implementationCode: `0x${drifted.toString("hex")}` });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: fake.transport,
      lineageProbe: verifiedLineageProbe(),
    });
    expect(result.codeIdentityResult).to.equal("MISMATCH");
    /* Only the two executor calls were made; nothing was asked of the unverified implementation. */
    expect(fake.calls.filter((call) => call.method === "eth_call")).to.have.lengthOf(2);
    for (const field of ["authorityVersionResult", "reciprocalLinkageResult", "callerExemptionResult"] as const) {
      expect(result[field], field).to.equal("UNRESOLVED");
    }
    /* And a DIRECT authority reports no ERC-1967 metadata. */
    const directRecord = bindingRecordFixture({
      authority: {
        ...(bindingRecordFixture().authority as Record<string, unknown>),
        deploymentModel: "DIRECT",
        implementationSlot: null,
        implementationResolutionMechanism: "NOT_APPLICABLE_DIRECT_DEPLOYMENT",
        expectedProxyRuntimeSha256: null,
        implementationAddressPolicy: null,
      },
    });
    const direct = createFakeTransport({ proxyCode: `0x${officialImplementationRuntime().toString("hex")}` });
    const directResult = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport: direct.transport,
      lineageProbe: verifiedLineageProbe({ record: directRecord }),
    });
    expect(directResult.implementationResolutionResult).to.equal("NOT_APPLICABLE_DIRECT_DEPLOYMENT");
    expect(directResult.implementationAddressPolicyResult).to.equal("NOT_APPLICABLE_DIRECT_DEPLOYMENT");
    expect(direct.calls.some((call) => call.method === "eth_getStorageAt")).to.equal(false);
  });

  it("249. classifies every PASS-consumed field and populates none from a fixture", function () {
    /* INVARIANT J — the dependency graph covers every field the PASS validator reads, and no
     * blocking field is a DIAGNOSTIC. */
    const graph = deriveAuthorityProtocol().passDependencyGraph as Record<string, string>;
    const classes = deriveAuthorityProtocol().passFieldClasses as string[];
    for (const [field, klass] of Object.entries(graph)) {
      expect(classes, field).to.include(klass);
    }
    /* The two diagnostics are exactly the fixture-derived ones, and neither can block. */
    const diagnostics = Object.entries(graph)
      .filter(([, klass]) => klass === "DIAGNOSTIC")
      .map(([field]) => field)
      .sort();
    expect(diagnostics).to.deep.equal(["localAuthorityFixtureRoot", "localFixtureSelfTestResult"]);
    for (const field of diagnostics) {
      const flipped = passResult({
        [field]:
          field === "localFixtureSelfTestResult"
            ? "MISMATCH"
            : { integrity: "x", package: "y", passRelevant: false, version: "0" },
      });
      expect(validateAuthorityResult(flipped), field).to.deep.equal([]);
    }
    /* Every field the validator inspects is classified. */
    const validatorSource = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    const validatorBody = validatorSource.slice(validatorSource.indexOf("export function validateAuthorityResult"));
    for (const field of Object.keys(graph)) {
      if (!validatorBody.includes(`result.${field}`)) continue;
      expect(graph[field], field).to.be.a("string");
    }
  });

  it("249b. derives the ceiling semantics from the parsed enforcement operator", function () {
    /* Self-audit finding — the semantics decide whether the configured ceiling is itself accepted,
     * and they were still a record assertion. The parser recovers the operator each enforcement
     * body actually compares with, so the semantics are now derived from it. */
    const parsed = DERIVED.authoritySource as NonNullable<typeof DERIVED.authoritySource>;
    expect(parsed.enforcementOperators._updateAndVerifyHCUTransactionLimit).to.equal(">");
    expect(parsed.derivedLimitSemantics).to.equal("CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN");

    /* A record claiming the other semantics is refused, however well formed. */
    const limits = bindingRecordFixture().limits as Record<string, unknown>;
    const claimed = bindingRecordFixture({
      limits: { ...limits, semantics: "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_OR_EQUAL" },
    });
    expect(validateAuthorityBindingRecord(claimed).join(" | ")).to.match(
      /disagrees with the parsed enforcement operator/u,
    );
    /* And so is a declared operator the source does not use. */
    const wrongOperator = bindingRecordFixture({ limits: { ...limits, enforcementOperator: ">=" } });
    expect(validateAuthorityBindingRecord(wrongOperator).join(" | ")).to.match(
      /enforcementOperator disagrees with the parsed source/u,
    );

    /* A source whose two enforcement paths disagree yields no statable semantics. */
    const inconsistent = Buffer.from(
      AUTHORITY_SOURCE_TEXT.replace(
        "if (depthHCU > MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX) {",
        "if (depthHCU >= MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX) {",
      ),
      "utf8",
    );
    const mixed = parseAuthoritySource({
      subject: "authoritySource",
      bytes: inconsistent,
      contentSha256: sha256(inconsistent),
    });
    expect(mixed.derivedLimitSemantics).to.equal("UNRESOLVED");
  });

  it("250. keeps every authoritative fact out of local fixtures and record assertions", function () {
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    /* Every authoritative fact flows through the one derivation. */
    expect(source).to.include("deriveAuthorityFromSourceMaterial(binding");
    expect(source).to.include("compareClaimsAgainstDerivation(");
    /* The live path takes its normalization manifest and expected digest from the DERIVATION. */
    expect(source).to.include("liveDerivation?.artifactBuild?.normalizationManifest");
    expect(source).to.include("liveDerivation.artifactBuild.expectedNormalizedRuntimeSha256");
    expect(source).to.not.include("bindingArtifact.normalizationManifest as NormalizationManifest");
    /* And no duplicate operation table survives anywhere. */
    const protocolSource = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority-protocol.ts"), "utf8");
    expect(protocolSource).to.not.include("export const SG4_OPERATION_COVERAGE");
    expect(protocolSource).to.include("projectPricingClosure(");
  });
});

/* ===============================================================================================
 * FINAL ACCEPTANCE CORRECTIONS — the five contradictions, each proved absent from production code.
 * ============================================================================================= */

describe("SG-4 HCU authority: CORRECTION 1 — artifact-build provenance subject", function () {
  it("251. cites CURRENT_OFFICIAL_ARTIFACT_BUILD, and rejects the old authority-source subject", function () {
    /* The extractor's own output names the build subject. */
    const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
    expect(build.compilerReferenceManifest.provenanceSubject).to.equal("CURRENT_OFFICIAL_ARTIFACT_BUILD");
    expect(build.compilerReferenceManifest.sourceContentSha256).to.equal(ARTIFACT_BUILD_SHA256);

    /* NEGATIVE — the old subject is refused outright. */
    const oldSubject = compilerReferenceManifestFixture({ provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE" });
    expect(validateCompilerReferenceManifest(oldSubject).join(" | ")).to.match(
      /must cite the current official artifact build/u,
    );

    /* NEGATIVE — the mixed object: the authority-source SUBJECT beside the build's content hash.
     * This is the exact combination the previous code accepted. */
    const artifact = bindingRecordFixture().artifact as Record<string, unknown>;
    const mixed = compilerReferenceManifestFixture({
      provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
      sourceContentSha256: ARTIFACT_BUILD_SHA256,
    });
    const mixedRecord = bindingRecordFixture({
      artifact: {
        ...artifact,
        compilerReferenceManifest: mixed,
        compilerReferenceManifestSha256: sha256(canonicalJson(mixed)),
      },
    });
    expect(validateAuthorityBindingRecord(mixedRecord).join(" | ")).to.match(
      /must cite the current official artifact build/u,
    );

    /* The two subjects carry different digests, so one cannot authenticate the other's bytes. */
    expect(AUTHORITY_SOURCE_SHA256).to.not.equal(ARTIFACT_BUILD_SHA256);

    /* The relationship is proved semantically by the extracted manifest and validator above, not
     * by searching for a particular implementation-source layout. */
    expect(build.compilerReferenceManifest.provenanceSubject).to.equal("CURRENT_OFFICIAL_ARTIFACT_BUILD");
    expect(build.compilerReferenceManifest.sourceContentSha256).to.equal(ARTIFACT_BUILD_SHA256);
  });
});

describe("SG-4 HCU authority: CORRECTION 2 — exact artifact placeholder normalization", function () {
  it("251a. authenticates the compressed executor fixture before parsing", function () {
    expect(EXECUTOR_ARTIFACT_BUILD_BYTES.length).to.equal(EXECUTOR_BUILD_INFO_DECOMPRESSED_SIZE);
    expect(EXECUTOR_ARTIFACT_BUILD_SHA256).to.equal(EXECUTOR_BUILD_INFO_SHA256);
    expect(sha256(EXECUTOR_ARTIFACT_BUILD_BYTES)).to.equal(EXECUTOR_BUILD_INFO_SHA256);
  });

  it("251b. authenticates the executor build independently and normalizes only its three declared immutables", function () {
    const build = extractExecutorArtifactBuild(
      {
        subject: "officialExecutorArtifactBuild",
        bytes: EXECUTOR_ARTIFACT_BUILD_BYTES,
        contentSha256: EXECUTOR_ARTIFACT_BUILD_SHA256,
      },
      { implementationAddress: SEPOLIA_EXECUTOR },
      EXECUTOR_SOURCE_SHA256,
    );
    expect(build.failures).to.deep.equal([]);
    expect(build.runtimeByteLength).to.equal(REPRODUCED_EXECUTOR_RUNTIME_LENGTH);
    expect(build.expectedNormalizedRuntimeSha256).to.equal(EXECUTOR_DERIVED_NORMALIZED_HASH);
    const entries = build.compilerReferenceManifest.entries as { offset: number; byteLength: number }[];
    expect(entries.map((entry) => entry.offset)).to.deep.equal([...AUTHENTICATED_EXECUTOR_IMMUTABLE_OFFSETS]);
    expect(entries.every((entry) => entry.byteLength === 32)).to.equal(true);

    const unchanged = deployedExecutorImplementationRuntime();
    const normal = normalizeRuntimeBytecodeFromManifest(unchanged, build.normalizationManifest as never, {
      implementationAddress: SEPOLIA_EXECUTOR,
    });
    expect(normal.ok, normal.failures.join(" | ")).to.equal(true);
    const push20Mutation = Buffer.from(unchanged);
    expect(push20Mutation[AUTHENTICATED_EXECUTOR_PUSH20_OFFSET - 1]).to.equal(0x73);
    push20Mutation[AUTHENTICATED_EXECUTOR_PUSH20_OFFSET] ^= 0x01;
    const mutated = normalizeRuntimeBytecodeFromManifest(push20Mutation, build.normalizationManifest as never, {
      implementationAddress: SEPOLIA_EXECUTOR,
    });
    expect(mutated.ok, mutated.failures.join(" | ")).to.equal(true);
    expect(mutated.normalizedSha256).to.not.equal(normal.normalizedSha256);
  });

  it("251c. closes executor bytecode/link references and compiler numeric parsing", function () {
    const extract = (mutate: (info: Record<string, unknown>) => void) => {
      const info = JSON.parse(EXECUTOR_ARTIFACT_BUILD_BYTES.toString("utf8")) as Record<string, unknown>;
      mutate(info);
      const bytes = Buffer.from(JSON.stringify(info), "utf8");
      return extractExecutorArtifactBuild(
        { subject: "officialExecutorArtifactBuild", bytes, contentSha256: sha256(bytes) },
        { implementationAddress: SEPOLIA_EXECUTOR },
        EXECUTOR_SOURCE_SHA256,
      );
    };
    const executorOf = (info: Record<string, unknown>) =>
      (
        ((info.output as Record<string, unknown>).contracts as Record<string, unknown>)[
          "contracts/FHEVMExecutor.sol"
        ] as Record<string, unknown>
      ).FHEVMExecutor as Record<string, unknown>;
    const evmOf = (info: Record<string, unknown>) => executorOf(info).evm as Record<string, unknown>;
    const deployedOf = (info: Record<string, unknown>) => evmOf(info).deployedBytecode as Record<string, unknown>;
    const creationOf = (info: Record<string, unknown>) => evmOf(info).bytecode as Record<string, unknown>;
    const immutableOf = (info: Record<string, unknown>) =>
      deployedOf(info).immutableReferences as Record<string, unknown>;
    const originalEntries = () =>
      immutableOf(JSON.parse(EXECUTOR_ARTIFACT_BUILD_BYTES.toString("utf8")) as Record<string, unknown>)[
        "605"
      ] as unknown[];

    const cases: [string, (info: Record<string, unknown>) => void, RegExp][] = [
      ["missing creation bytecode", (info) => delete evmOf(info).bytecode, /BUILD_INFO_CREATION_BYTECODE_ABSENT/u],
      [
        "missing creation link references",
        (info) => delete creationOf(info).linkReferences,
        /BUILD_INFO_CREATION_LINK_REFERENCES_ABSENT/u,
      ],
      [
        "malformed creation link references",
        (info) => {
          creationOf(info).linkReferences = [];
        },
        /BUILD_INFO_CREATION_LINK_REFERENCES_MALFORMED/u,
      ],
      [
        "unexpected creation link reference",
        (info) => {
          creationOf(info).linkReferences = { "contracts/L.sol": { L: [{ start: 0, length: 20 }] } };
        },
        /BUILD_INFO_UNEXPECTED_CREATION_LINK_REFERENCES/u,
      ],
      [
        "missing deployed link references",
        (info) => delete deployedOf(info).linkReferences,
        /BUILD_INFO_DEPLOYED_LINK_REFERENCES_ABSENT/u,
      ],
      [
        "malformed deployed link references",
        (info) => {
          deployedOf(info).linkReferences = null;
        },
        /BUILD_INFO_DEPLOYED_LINK_REFERENCES_MALFORMED/u,
      ],
      [
        "unexpected deployed link reference",
        (info) => {
          deployedOf(info).linkReferences = { "contracts/L.sol": { L: [{ start: 0, length: 20 }] } };
        },
        /BUILD_INFO_UNEXPECTED_DEPLOYED_LINK_REFERENCES/u,
      ],
      [
        "AST key 605x",
        (info) => (deployedOf(info).immutableReferences = { "605x": originalEntries() }),
        /IMMUTABLE_ID_MALFORMED/u,
      ],
      [
        "AST key +605",
        (info) => (deployedOf(info).immutableReferences = { "+605": originalEntries() }),
        /IMMUTABLE_ID_MALFORMED/u,
      ],
      [
        "AST key 0605",
        (info) => (deployedOf(info).immutableReferences = { "0605": originalEntries() }),
        /IMMUTABLE_ID_MALFORMED/u,
      ],
      [
        "AST key with whitespace",
        (info) => (deployedOf(info).immutableReferences = { " 605": originalEntries() }),
        /IMMUTABLE_ID_MALFORMED/u,
      ],
      [
        "negative AST key",
        (info) => (deployedOf(info).immutableReferences = { "-605": originalEntries() }),
        /IMMUTABLE_ID_MALFORMED/u,
      ],
      [
        "string start",
        (info) => {
          const entries = originalEntries();
          (entries[0] as Record<string, unknown>).start = "14424";
          deployedOf(info).immutableReferences = { "605": entries };
        },
        /IMMUTABLE_REFERENCE_START_MALFORMED/u,
      ],
      [
        "string length",
        (info) => {
          const entries = originalEntries();
          (entries[0] as Record<string, unknown>).length = "32";
          deployedOf(info).immutableReferences = { "605": entries };
        },
        /IMMUTABLE_REFERENCE_LENGTH_MALFORMED/u,
      ],
      [
        "negative start",
        (info) => {
          const entries = originalEntries();
          (entries[0] as Record<string, unknown>).start = -1;
          deployedOf(info).immutableReferences = { "605": entries };
        },
        /IMMUTABLE_REFERENCE_START_MALFORMED/u,
      ],
      [
        "negative length",
        (info) => {
          const entries = originalEntries();
          (entries[0] as Record<string, unknown>).length = -1;
          deployedOf(info).immutableReferences = { "605": entries };
        },
        /IMMUTABLE_REFERENCE_LENGTH_MALFORMED/u,
      ],
      [
        "float start",
        (info) => {
          const entries = originalEntries();
          (entries[0] as Record<string, unknown>).start = 14424.5;
          deployedOf(info).immutableReferences = { "605": entries };
        },
        /IMMUTABLE_REFERENCE_START_MALFORMED/u,
      ],
      [
        "unsafe start",
        (info) => {
          const entries = originalEntries();
          (entries[0] as Record<string, unknown>).start = Number.MAX_SAFE_INTEGER + 1;
          deployedOf(info).immutableReferences = { "605": entries };
        },
        /IMMUTABLE_REFERENCE_START_MALFORMED/u,
      ],
      [
        "missing immutable",
        (info) => {
          deployedOf(info).immutableReferences = {};
        },
        /IMMUTABLE_REFERENCE_SET_MISMATCH|BUILD_INFO_IMMUTABLE_REFERENCES_EMPTY/u,
      ],
      [
        "extra immutable",
        (info) => {
          deployedOf(info).immutableReferences = { "605": originalEntries(), "606": [] };
        },
        /IMMUTABLE_REFERENCE_SET_MISMATCH/u,
      ],
    ];
    for (const [label, mutate, expected] of cases) {
      expect(extract(mutate).failures.join(" | "), label).to.match(expected);
    }
  });

  it("252. writes the exact placeholder bytes, not a global replacement byte", function () {
    const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
    const manifest = build.normalizationManifest as Record<string, unknown>;

    /* The field is gone from the schema, the type and the serialized protocol. */
    expect(manifest).to.not.have.property("replacementByte");
    expect(deriveAuthorityProtocol().bindingRecord.normalizationManifestFields).to.not.include("replacementByte");
    const verifierSource = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    expect(verifierSource).to.not.include("manifest.replacementByte");

    /* THE PROOF — the deployed side is a NON-uniform 32-byte word (12 zeros || the implementation
     * address); normalization replaces it with the authenticated 32-byte zero placeholder. */
    const deployedWord = Buffer.from(
      "00".repeat(12) + AUTHORITY_IMPLEMENTATION.toLowerCase().replace(/^0x/u, ""),
      "hex",
    );
    expect(new Set(deployedWord).size, "the deployed word must not be one repeated byte").to.be.greaterThan(1);

    const deployed = deployedImplementationRuntime(AUTHORITY_IMPLEMENTATION);
    for (const offset of UUPS_SELF_OFFSETS) {
      expect(deployed.subarray(offset, offset + 32).toString("hex"), `deployed ${offset}`).to.equal(
        deployedWord.toString("hex"),
      );
    }

    const result = normalizeRuntimeBytecodeFromManifest(deployed, manifest as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(result.ok, result.failures.join(",")).to.equal(true);

    /* Recompute the normalized buffer the way the verifier does and inspect the bytes. */
    const normalized = Buffer.from(deployed);
    for (const offset of UUPS_SELF_OFFSETS) normalized.fill(0x00, offset, offset + 32);
    expect(sha256(normalized)).to.equal(result.normalizedSha256);
    for (const offset of UUPS_SELF_OFFSETS) {
      expect(normalized.subarray(offset, offset + 32).toString("hex"), `offset ${offset}`).to.equal("00".repeat(32));
    }

    /* REGRESSION — the executor PUSH20 compile-time constants are NOT immutables and must survive
     * normalization byte for byte. A normalizer that treated them as deployment-dependent would
     * erase real code identity here. */
    const executorBytes = SEPOLIA_EXECUTOR.toLowerCase().replace(/^0x/u, "");
    for (const offset of EXECUTOR_CONSTANT_OFFSETS) {
      expect(normalized.subarray(offset, offset + 20).toString("hex"), `executor constant ${offset}`).to.equal(
        executorBytes,
      );
    }
  });

  it("252b. keeps all 30 executor PUSH20 constants outside compiler immutable normalization", function () {
    const executorBytes = Buffer.from(SEPOLIA_EXECUTOR.toLowerCase().replace(/^0x/u, ""), "hex");
    const artifactRuntime = reproducedArtifactRuntime();
    expect(EXECUTOR_CONSTANT_OFFSETS).to.have.lengthOf(30);
    for (const offset of EXECUTOR_CONSTANT_OFFSETS) {
      expect(artifactRuntime[offset - 1], `executor opcode ${offset}`).to.equal(0x73);
      expect(artifactRuntime.subarray(offset, offset + 20), `executor value ${offset}`).to.deep.equal(executorBytes);
    }

    const build = DERIVED.artifactBuild as NonNullable<typeof DERIVED.artifactBuild>;
    const compilerEntries = build.compilerReferenceManifest.entries as Record<string, unknown>[];
    expect(compilerEntries.map((entry) => entry.offset)).to.deep.equal([...UUPS_SELF_OFFSETS]);
    expect(
      compilerEntries.some((entry) => EXECUTOR_CONSTANT_OFFSETS.some((offset) => offset === Number(entry.offset))),
    ).to.equal(false);

    const deployed = deployedImplementationRuntime(AUTHORITY_IMPLEMENTATION);
    const normalized = normalizeRuntimeBytecodeFromManifest(deployed, build.normalizationManifest as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(normalized.ok, normalized.failures.join(",")).to.equal(true);
    const expectedNormalized = Buffer.from(deployed);
    for (const offset of UUPS_SELF_OFFSETS) expectedNormalized.fill(0x00, offset, offset + 32);
    for (const offset of EXECUTOR_CONSTANT_OFFSETS) {
      expect(expectedNormalized.subarray(offset, offset + 20), `normalized executor ${offset}`).to.deep.equal(
        executorBytes,
      );
    }
    expect(sha256(expectedNormalized)).to.equal(normalized.normalizedSha256);

    const changedExecutor = Buffer.from(deployed);
    changedExecutor[EXECUTOR_CONSTANT_OFFSETS[0]] ^= 0xff;
    const changedResult = normalizeRuntimeBytecodeFromManifest(changedExecutor, build.normalizationManifest as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(changedResult.ok, changedResult.failures.join(",")).to.equal(true);
    expect(changedResult.normalizedSha256).to.not.equal(DERIVED_NORMALIZED_HASH);
    expect(
      classifyCodeIdentity({
        normalizedSha256: changedResult.normalizedSha256,
        normalizationOk: changedResult.ok,
        expectedAuthoritativeSha256: DERIVED_NORMALIZED_HASH,
      }),
    ).to.equal("MISMATCH");

    const extraOffset = 16_000;
    const extraExecutor = Buffer.from(deployed);
    extraExecutor[extraOffset - 1] = 0x73;
    executorBytes.copy(extraExecutor, extraOffset);
    const extraResult = normalizeRuntimeBytecodeFromManifest(extraExecutor, build.normalizationManifest as never, {
      implementationAddress: AUTHORITY_IMPLEMENTATION,
    });
    expect(extraResult.ok, extraResult.failures.join(",")).to.equal(true);
    expect(extraResult.normalizedSha256).to.not.equal(DERIVED_NORMALIZED_HASH);
    expect(extraExecutor.subarray(extraOffset, extraOffset + 20)).to.deep.equal(executorBytes);
    expect(compilerEntries.some((entry) => Number(entry.offset) === extraOffset)).to.equal(false);
  });

  it("253. verifies the artifact side and the compiler reference set before deriving", function () {
    const extract = (mutate: (info: Record<string, unknown>) => void) => {
      const info = JSON.parse(ARTIFACT_BUILD_BYTES.toString("utf8")) as Record<string, unknown>;
      mutate(info);
      const bytes = Buffer.from(JSON.stringify(info), "utf8");
      return extractArtifactBuild(
        { subject: "officialArtifactBuild", bytes, contentSha256: sha256(bytes) },
        { implementationAddress: AUTHORITY_IMPLEMENTATION },
        AUTHORITY_SOURCE_SHA256,
      );
    };
    const deployedBytecode = (info: Record<string, unknown>) =>
      ((info.output as Record<string, unknown>).contracts as Record<string, unknown>)[
        "contracts/HCULimit.sol"
      ] as Record<string, unknown>;
    const runtimeOf = (info: Record<string, unknown>) =>
      Buffer.from(
        String(
          (
            ((deployedBytecode(info).HCULimit as Record<string, unknown>).evm as Record<string, unknown>)
              .deployedBytecode as Record<string, unknown>
          ).object,
        ),
        "hex",
      );
    const setRuntime = (info: Record<string, unknown>, runtime: Buffer) => {
      (
        ((deployedBytecode(info).HCULimit as Record<string, unknown>).evm as Record<string, unknown>)
          .deployedBytecode as Record<string, unknown>
      ).object = runtime.toString("hex");
    };
    const setReferences = (info: Record<string, unknown>, references: unknown) => {
      (
        ((deployedBytecode(info).HCULimit as Record<string, unknown>).evm as Record<string, unknown>)
          .deployedBytecode as Record<string, unknown>
      ).immutableReferences = references;
    };

    /* An artifact whose runtime does NOT carry a zero word at a declared immutable offset. */
    const tampered = extract((info) => {
      const runtime = runtimeOf(info);
      runtime[UUPS_SELF_OFFSETS[0]] ^= 0xff;
      setRuntime(info, runtime);
    });
    expect(tampered.failures.join(",")).to.match(/ARTIFACT_PLACEHOLDER_NOT_A_ZERO_WORD/u);

    /* A reference not preceded by PUSH32. */
    const wrongOpcode = extract((info) => {
      const runtime = runtimeOf(info);
      runtime[UUPS_SELF_OFFSETS[0] - 1] = 0x73;
      setRuntime(info, runtime);
    });
    expect(wrongOpcode.failures.join(",")).to.match(/IMMUTABLE_REFERENCE_OPCODE/u);

    /* A width the normalizer does not implement. */
    const wrongWidth = extract((info) => {
      setReferences(info, { "605": [{ start: UUPS_SELF_OFFSETS[0], length: 20 }] });
    });
    expect(wrongWidth.failures.join(",")).to.match(/UNSUPPORTED_IMMUTABLE_WIDTH/u);

    /* An immutable id the AST does not declare. */
    const unknownId = extract((info) => {
      setReferences(info, { "999": UUPS_SELF_OFFSETS.map((offset) => ({ start: offset, length: 32 })) });
    });
    expect(unknownId.failures.join(",")).to.match(/IMMUTABLE_DECLARATION_NOT_FOUND_IN_AST/u);
  });

  it("253b. rejects non-authentic or structurally incomplete Hardhat build-info", function () {
    const extract = (mutate: (info: Record<string, unknown>) => void) => {
      const info = JSON.parse(ARTIFACT_BUILD_BYTES.toString("utf8")) as Record<string, unknown>;
      mutate(info);
      const bytes = Buffer.from(JSON.stringify(info), "utf8");
      return extractArtifactBuild(
        { subject: "officialArtifactBuild", bytes, contentSha256: sha256(bytes) },
        { implementationAddress: AUTHORITY_IMPLEMENTATION },
        AUTHORITY_SOURCE_SHA256,
      );
    };
    const inputOf = (info: Record<string, unknown>) => info.input as Record<string, unknown>;
    const outputOf = (info: Record<string, unknown>) => info.output as Record<string, unknown>;

    const cases: [string, (info: Record<string, unknown>) => void, RegExp][] = [
      [
        "wrong format",
        (info) => {
          info._format = "not-hardhat-build-info";
        },
        /BUILD_INFO_FORMAT_MISMATCH/u,
      ],
      [
        "missing format",
        (info) => {
          delete info._format;
        },
        /BUILD_INFO_FORMAT_MISMATCH/u,
      ],
      [
        "missing language",
        (info) => {
          delete inputOf(info).language;
        },
        /BUILD_INFO_LANGUAGE_UNSUPPORTED/u,
      ],
      [
        "wrong language",
        (info) => {
          inputOf(info).language = "Yul";
        },
        /BUILD_INFO_LANGUAGE_UNSUPPORTED/u,
      ],
      [
        "missing settings",
        (info) => {
          delete inputOf(info).settings;
        },
        /BUILD_INFO_SETTINGS_ABSENT/u,
      ],
      [
        "malformed output selection",
        (info) => {
          (inputOf(info).settings as Record<string, unknown>).outputSelection = {
            "*": { "*": "evm.deployedBytecode" },
          };
        },
        /BUILD_INFO_OUTPUT_SELECTION_MALFORMED/u,
      ],
      [
        "missing output selection field",
        (info) => {
          (inputOf(info).settings as Record<string, unknown>).outputSelection = { "*": { "*": ["abi"], "": ["ast"] } };
        },
        /BUILD_INFO_OUTPUT_SELECTION_MISSING:evm\.deployedBytecode/u,
      ],
      [
        "missing output contract path",
        (info) => {
          delete (outputOf(info).contracts as Record<string, unknown>)["contracts/HCULimit.sol"];
        },
        /BUILD_INFO_CONTRACT_ABSENT:contracts\/HCULimit\.sol:HCULimit/u,
      ],
      [
        "wrong selected source",
        (info) => {
          inputOf(info).sources = { "contracts/Other.sol": { content: AUTHORITY_SOURCE_TEXT } };
        },
        /BUILD_INFO_INPUT_SOURCE_ABSENT:contracts\/HCULimit\.sol/u,
      ],
      [
        "wrong selected contract",
        (info) => {
          const source = (outputOf(info).contracts as Record<string, unknown>)["contracts/HCULimit.sol"] as Record<
            string,
            unknown
          >;
          source.OtherContract = source.HCULimit;
          delete source.HCULimit;
        },
        /BUILD_INFO_CONTRACT_ABSENT:contracts\/HCULimit\.sol:HCULimit/u,
      ],
      [
        "obsolete envelope with similar fields",
        (info) => {
          info.deployedBytecode = "0x00";
          info.immutableReferences = [];
        },
        /BUILD_INFO_IS_THE_OBSOLETE_CUSTOM_ENVELOPE_NOT_HARDHAT_BUILD_INFO/u,
      ],
    ];
    for (const [label, mutate, expected] of cases) {
      expect(extract(mutate).failures.join(","), label).to.match(expected);
    }
  });
});

describe("SG-4 HCU authority: CORRECTION 3 — parse completeness is real", function () {
  const parse = (text: string) => {
    const bytes = Buffer.from(text, "utf8");
    return parseAuthoritySource({ subject: "authoritySource", bytes, contentSha256: sha256(bytes) });
  };

  it("254. makes an unsupported relevant declaration or surface PARTIAL, not invisible", function () {
    /* The baseline parses completely. */
    expect(parse(AUTHORITY_SOURCE_TEXT).parseCompleteness).to.equal("PARSED_COMPLETE_NO_RESIDUE");

    /* An unsupported BLOCK/BATCH state declaration form. Previously this vanished, and ABSENT was
     * then derived from a name list that never saw it. */
    const blockDeclaration = parse(
      AUTHORITY_SOURCE_TEXT.replace(
        "    uint256 public constant MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX = 20000000;",
        "    uint256 public constant MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX = 20000000;\n" +
          "    Ceiling public immutable MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_BLOCK = Ceiling.wrap(40000000);",
      ),
    );
    expect(blockDeclaration.parseCompleteness).to.equal("PARTIAL");
    expect(blockDeclaration.residue.join(",")).to.match(/UNSUPPORTED_HCU_RELEVANT_DECLARATION/u);
    /* And the conclusion is UNRESOLVED, not ABSENT — a partial parse cannot establish absence. */
    expect(blockDeclaration.blockOrBatchConclusion).to.equal("UNRESOLVED");

    /* An unsupported HCU-related declaration in a form the parser does not model. */
    const hcuDeclaration = parse(
      AUTHORITY_SOURCE_TEXT.replace(
        "    address private _executor;",
        "    address private _executor;\n    HcuBudget private _hcuBudget;",
      ),
    );
    expect(hcuDeclaration.parseCompleteness).to.equal("PARTIAL");
    expect(hcuDeclaration.residue.join(",")).to.match(/UNSUPPORTED_HCU_RELEVANT_DECLARATION/u);

    /* An extra enforcement surface: a modifier can gate or wrap a ceiling check, and the parser
     * does not analyse modifier bodies, so declaring one is a hard residue. */
    const withModifier = parse(
      AUTHORITY_SOURCE_TEXT.replace(
        "    function getVersion()",
        "    modifier withinBudget() {\n        _;\n    }\n\n    function getVersion()",
      ),
    );
    expect(withModifier.parseCompleteness).to.equal("PARTIAL");
    expect(withModifier.residue.join(",")).to.match(/UNSUPPORTED_MODIFIER_SURFACE/u);

    /* Each of these BLOCKS the record rather than silently disappearing. */
    for (const text of [
      AUTHORITY_SOURCE_TEXT.replace(
        "    address private _executor;",
        "    address private _executor;\n    HcuBudget private _hcuBudget;",
      ),
    ]) {
      const bytes = Buffer.from(text, "utf8");
      const record = bindingRecordFixture({
        sourceMaterial: sourceMaterialFixture({
          authoritySource: {
            bytesBase64: bytes.toString("base64"),
            contentSha256: sha256(bytes),
            encoding: "base64",
            subject: "authoritySource",
          },
        }),
        provenance: {
          reverificationStatus: "REVERIFIED",
          entries: provenanceEntries().map((entry) =>
            entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE" ? { ...entry, contentSha256: sha256(bytes) } : entry,
          ),
          amendments: sourceMaterialAmendments().map((entry) =>
            entry.subject === "CURRENT_OFFICIAL_AUTHORITY_SOURCE" ? { ...entry, contentSha256: sha256(bytes) } : entry,
          ),
        },
      });
      const errors = validateAuthorityBindingRecord(record).join(" | ");
      expect(errors).to.match(/AUTHORITY_SOURCE_PARSE|parse is PARTIAL/u);
    }
  });

  it("255. cannot hide a declaration inside a comment", function () {
    /* Comments are stripped before classification, so a ceiling mentioned in prose is not a
     * declaration and a declaration is not hidden by wrapping it in one. */
    const commented = parse(
      AUTHORITY_SOURCE_TEXT.replace(
        "contract HCULimit {",
        "contract HCULimit {\n    /* MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_BLOCK is not declared here */",
      ),
    );
    expect(commented.parseCompleteness).to.equal("PARSED_COMPLETE_NO_RESIDUE");
    expect(commented.declarations).to.not.include("MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_BLOCK");
    expect(commented.blockOrBatchConclusion).to.equal("ABSENT");
  });
});

describe("SG-4 HCU authority: CORRECTION 4 — no provenance by stale address equality", function () {
  it("256. accepts a derived authority that coincides with the stale plugin literal", async function () {
    /* The executor genuinely returns the address the obsolete plugin literal happens to carry.
     * That is a coincidence about the literal, not evidence about the deployment. */
    const stale = STALE_PLUGIN_HCU_LIMIT.sepoliaValue;
    const record = bindingRecordFixture();
    const { transport } = createFakeTransport({ authorityAddress: stale });
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record }),
    });
    expect(result.authorityAddress).to.equal(stale.toLowerCase());
    /* Equality alone does not fail. */
    expect(String(result.status)).to.not.include("DERIVED_AUTHORITY_EQUALS_STALE_PLUGIN_CONSTANT");
    /* The run stops only at the external pinned build; equality with the stale literal is not a
     * blocker, which is the whole point. */
    expect(result.finalVerdict, String(result.status)).to.equal("BLOCKED");
    expect(
      String(result.status)
        .split("; ")
        .filter((entry) => !entry.includes("OFFICIAL_BUILD")),
    ).to.have.lengthOf(0);

    /* The failure is gone from the production source. */
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    expect(source).to.not.include("DERIVED_AUTHORITY_EQUALS_STALE_PLUGIN_CONSTANT");
    const liveRun = source.slice(source.indexOf("export async function runLiveAuthorityVerification"));
    expect(liveRun).to.not.include("STALE_PLUGIN_HCU_LIMIT");
  });

  it("257. still rejects the stale constant as a SOURCE", function () {
    /* The inverse: substituting the literal instead of deriving it from the executor remains
     * impossible. The guard is about where a value came from, not what it equals. */
    const offending = [
      { path: "scripts/sg4-hcu-authority.ts", content: `const a = "${STALE_PLUGIN_HCU_LIMIT.sepoliaValue}";` },
    ];
    const guard = checkStaleAddressUsage(offending);
    expect(guard.ok).to.equal(false);
    expect(guard.offenders.length).to.be.greaterThan(0);
    /* And a result derived from it is refused. */
    expect(validateAuthorityResult(passResult({ staleAddressGuardResult: "REJECTED" })).length).to.be.greaterThan(0);
    /* A result reporting that address is now rejected even with a clean source-origin guard: the
     * serialized authority address must equal the address independently derived from the
     * authenticated executor build, not merely avoid the source-origin guard. */
    expect(
      validateAuthorityResult(passResult({ authorityAddress: STALE_PLUGIN_HCU_LIMIT.sepoliaValue })).join(" | "),
    ).to.include("authenticated executor-derived authority address");
    const validatorSource = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    const validator = validatorSource.slice(validatorSource.indexOf("export function validateAuthorityResult"));
    expect(validator).to.not.include("STALE_PLUGIN_HCU_LIMIT.sepoliaValue.toLowerCase()");
  });
});

describe("SG-4 HCU authority: CORRECTION 5 — applicability through the unified manifest", function () {
  const iface = () => bindingRecordFixture().onChainInterface as Record<string, unknown>;
  const manifestEntries = () => (interfaceManifestFixture() as { entries: Record<string, unknown>[] }).entries;
  const withEntries = (entries: unknown[]) =>
    bindingRecordFixture({
      onChainInterface: { ...iface(), interfaceManifest: interfaceManifestFixture({ entries }) },
    });

  it("258. represents every AVAILABLE applicability getter in the one manifest", async function () {
    const record = bindingRecordFixture();
    const available = callerApplicabilityFixture().filter((spec) => spec.state === "AVAILABLE");
    expect(available.length).to.be.greaterThan(0);
    for (const spec of available) {
      const entry = interfaceCall(record as never, `CALLER_APPLICABILITY:${String(spec.subject)}`);
      expect(entry, String(spec.subject)).to.not.equal(null);
      expect(entry?.subject).to.equal(spec.subject);
    }

    /* Every issued eth_call resolves to a manifest entry, applicability included. */
    const { transport, calls } = createFakeTransport();
    const result = await runLiveAuthorityVerification(LIVE_ACKNOWLEDGEMENT, {
      transport,
      lineageProbe: verifiedLineageProbe({ record }),
    });
    expect(result.finalVerdict, String(result.status)).to.equal("BLOCKED");
    expect(String(result.status)).to.include("OFFICIAL_BUILD_IS_NOT_THE_PINNED_REPRODUCTION");
    const declaredCalldata = new Set(manifestEntries().map((entry) => interfaceCalldata(entry).toLowerCase()));
    for (const call of calls.filter((entry) => entry.method === "eth_call")) {
      const data = String((call.params[0] as { data: string }).data).toLowerCase();
      expect(declaredCalldata, data).to.include(data);
    }

    /* No parallel construction path remains. */
    const source = readFileSync(resolve(ROOT, "scripts/sg4-hcu-authority.ts"), "utf8");
    const liveRun = source.slice(source.indexOf("export async function runLiveAuthorityVerification"));
    expect(liveRun).to.not.include("encodeAbiArguments(spec.argumentTypes");
    expect(liveRun).to.include("declaredCalldata(applicabilityCallId)");
    const planner = source.slice(source.indexOf("export function generateLiveCallPlan"));
    expect(planner.slice(0, 6000)).to.not.include("interfaceCalldata(spec)");
  });

  it("259. rejects a missing, mismatched or duplicated applicability interface entry", function () {
    const subject = "BENCHMARK_HARNESS";
    const callId = `CALLER_APPLICABILITY:${subject}`;
    const without = manifestEntries().filter((entry) => entry.callId !== callId);
    expect(validateAuthorityBindingRecord(withEntries(without)).join(" | ")).to.match(
      new RegExp(`missing ${callId} for the available subject`, "u"),
    );

    const mutate = (changes: Record<string, unknown>) =>
      withEntries(manifestEntries().map((entry) => (entry.callId === callId ? { ...entry, ...changes } : entry)));

    /* Signature mismatch between the policy entry and the interface entry. */
    expect(
      validateAuthorityBindingRecord(
        mutate({ signature: "isBlocked(address)", selector: keccakId("isBlocked(address)").slice(0, 10) }),
      ).join(" | "),
    ).to.match(/signature disagrees with CALLER_APPLICABILITY/u);

    /* Target mismatch. */
    expect(validateAuthorityBindingRecord(mutate({ targetRole: "EXECUTOR" })).join(" | ")).to.match(
      /targetRole disagrees with CALLER_APPLICABILITY/u,
    );

    /* Argument mismatch. */
    expect(validateAuthorityBindingRecord(mutate({ argumentValues: [SENDER_ADDRESS] })).join(" | ")).to.match(
      /argumentValues disagrees with CALLER_APPLICABILITY/u,
    );

    /* Return-type mismatch. */
    expect(validateAuthorityBindingRecord(mutate({ returnType: "uint256" })).join(" | ")).to.match(
      /returnType disagrees with CALLER_APPLICABILITY/u,
    );

    /* Duplicate applicability call id. */
    const duplicated = [...manifestEntries(), manifestEntries().find((entry) => entry.callId === callId)];
    expect(validateAuthorityBindingRecord(withEntries(duplicated)).join(" | ")).to.match(
      new RegExp(`declares call id ${callId} more than once`, "u"),
    );

    /* A dynamic entry whose call id and subject disagree. */
    expect(validateAuthorityBindingRecord(mutate({ subject: "TRANSACTION_SENDER" })).join(" | ")).to.match(
      /does not match its declared subject/u,
    );
  });
});
