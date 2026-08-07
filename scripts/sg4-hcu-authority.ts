/* SG-4 HCU-authority verifier.
 *
 * Two separate modes:
 *
 *   OFFLINE PREFLIGHT            — may be run now. Pure local verification, no network.
 *   LIVE READ-ONLY VERIFICATION  — prepared here, deliberately not executed during preparation.
 *
 * Every check fails closed. A check that cannot be completed is BLOCKED, never PASS. Authority is
 * derived from executable code paths and installed artifacts, never from a comment, a revert
 * message, a mock error, or an observed failure.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { serializeProtocol } from "./sg4-protocol";

import {
  ADDRESS_BYTE_LENGTH,
  ACCEPTED_METADATA_STRUCTURES,
  APPLICABILITY_INTERPRETATIONS,
  APPLICABILITY_INTERPRETATION_RETURN_TYPE,
  APPLICABILITY_PROOF_FIELDS,
  ARTIFACT_BUILD_EXTRACTOR,
  REPRODUCED_BUILD_ENTRY_FIELDS,
  REPRODUCED_BUILD_PROVENANCE_KIND,
  REPRODUCED_BUILD_SUBJECTS,
  REPRODUCED_METADATA_TRAILER,
  REPRODUCED_OFFICIAL_BUILD,
  REPRODUCED_RUNTIME_BYTE_LENGTH,
  UUPS_SELF_IMMUTABLE,
  AUTHORITY_SOURCE_PARSER,
  PRICE_SCHEDULE_EXTRACTOR,
  SOURCE_MATERIAL_ENCODINGS,
  SOURCE_MATERIAL_FIELDS,
  SOURCE_MATERIAL_PROVENANCE,
  SOURCE_MATERIAL_SUBJECTS,
  CANONICAL_SIGNATURE_GRAMMAR,
  CONTRACT_ROLES,
  DERIVATION_CHAIN_POLICY,
  ENFORCEMENT_PROOF_ENTRY_FIELDS,
  ENFORCEMENT_PROOF_MANIFEST_FIELDS,
  ENFORCEMENT_PROOF_MANIFEST_SCHEMA,
  ENUMERATION_MANIFEST_FIELDS,
  ENUMERATION_MANIFEST_SCHEMA,
  IMMUTABLE_REFERENCE_ENTRY_FIELDS,
  BLOCK_OR_BATCH_SURFACE_PATTERN,
  COMPILER_IMMUTABLE_DECLARATION_FIELDS,
  COMPILER_REFERENCE_ENTRY_FIELDS,
  DEPLOYMENT_VALUE_SHAPES,
  COMPILER_REFERENCE_MANIFEST_FIELDS,
  COMPILER_REFERENCE_MANIFEST_SCHEMA,
  PRIMARY_IMMUTABLE_REFERENCE_FIELDS,
  ENUMERATION_MANIFEST_LIST_FIELDS,
  ENUMERATION_MINIMUM_SURFACE,
  ENUMERATION_PARSE_COMPLETENESS_STATES,
  IMPLEMENTATION_ADDRESS_PERMITTED_CONDITIONS,
  IMPLEMENTATION_ADDRESS_POLICY_FIELDS,
  IMPLEMENTATION_ADDRESS_POLICY_KINDS,
  IMPLEMENTATION_RESOLUTION_RESULTS,
  LIMIT_CONTROL_IDS,
  LIMIT_GETTER_SPEC_FIELDS,
  SG4_PRICING_VARIANT_CLOSURE,
  SUBJECT_ADDRESS_SOURCES,
  SUPPLEMENTARY_REFERENCE_KINDS,
  UINT256_EXCLUSIVE_UPPER_BOUND,
  ARTIFACT_IDENTITY_ROOTS,
  AUTHORITY_BINDING_RECORD_SHAPE,
  CALLER_APPLICABILITY_FIELDS,
  CALLER_APPLICABILITY_STATES,
  ENFORCEMENT_EVIDENCE_FIELDS,
  EXECUTOR_DEPLOYMENT_MODELS,
  IMMUTABLE_PROVENANCE,
  IMMUTABLE_REFERENCE_KINDS,
  LIMIT_READING_RESULTS,
  MANDATORY_LIMIT_AVAILABILITY,
  NORMALIZATION_MANIFEST_FIELDS,
  NORMALIZATION_MANIFEST_SCHEMA,
  OPERAND_MODES,
  OPTIONAL_LIMIT_AVAILABILITY,
  PRICING_ENTRY_FIELDS,
  PRICING_MANIFEST_FIELDS,
  PRICING_MANIFEST_SCHEMA,
  PROMOTING_LIMIT_RESULTS,
  SG4_APPLICABILITY_SUBJECTS,
  SUPPORTED_ABI_ARGUMENT_TYPES,
  SUPPORTED_ABI_RETURN_TYPES,
  canonicalJson,
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_RESULT_SCHEMA,
  AUTHORITY_ROOT,
  DEPLOYED_AUTHORITY_ROOT_POLICY,
  CALLER_APPLICABILITY_CALL_PREFIX,
  DYNAMIC_INTERFACE_CALL_FIELDS,
  DYNAMIC_INTERFACE_RETURN_TYPES,
  INTERFACE_CALL_FIELDS,
  callerApplicabilityCallId,
  INTERFACE_CALL_SPECS,
  INTERFACE_MANIFEST_FIELDS,
  INTERFACE_MANIFEST_SCHEMA,
  LIMIT_CONTROL_INTERFACE_CALLS,
  LIMIT_GETTER_PERMITTED_ROLES,
  MANDATORY_INTERFACE_CALL_IDS,
  LOCAL_AUTHORITY_FIXTURE_ROOT,
  MEASUREMENT_EXECUTION_RELEVANT_FILES,
  MEASUREMENT_ROOT_VERIFICATION,
  MEASUREMENT_TOOLCHAIN_ROOT,
  REPOSITORY_HYGIENE_FILES,
  BINDING_RECORD_PATH,
  BINDING_RECORD_SCHEMA,
  BINDING_RECORD_VERSION,
  DEPLOYMENT_MODELS,
  DEPTH_SAFETY_THRESHOLD,
  ERC1967_IMPLEMENTATION_RESOLUTION,
  ERC1967_IMPLEMENTATION_SLOT,
  EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256,
  EXECUTOR_IMMEDIATE_COUNT,
  EXECUTOR_IMMEDIATE_OFFSETS,
  EXPECTED_AUTHORITY_OPERATIONS,
  EXPECTED_CALCULATOR_HASH,
  EXPECTED_CODE_SECTION_BYTE_LENGTH,
  EXPECTED_COST_TABLE_HASH,
  EXPECTED_INSTALLED_OPERATIONS,
  EXPECTED_METADATA,
  EXPECTED_NORMALIZED_RUNTIME_SHA256,
  EXPECTED_RUNTIME_BYTE_LENGTH,
  EXPECTED_RUNTIME_SHA256,
  EXPECTED_SOURCE_HASHES,
  FACET_ORIGINS,
  FACET_ORIGINS_FORBIDDEN_FOR_PASS,
  IMPLEMENTATION_RESOLUTION_MECHANISMS,
  LIMIT_SEMANTICS_AUTHORITY,
  LIVE_ACKNOWLEDGEMENT,
  LIVE_CALL_PLAN_POLICY,
  LIVE_LIMIT_SEMANTICS_VALUES,
  LIVE_RPC_ALLOWED_METHODS,
  LIVE_RPC_ENDPOINT,
  LIVE_RPC_FORBIDDEN_METHOD_PREFIXES,
  OPERATION_NAME_TRANSLATIONS,
  OPERATION_SCHEDULE_AUTHORITY,
  PINNED_BLOCK_FINALITY_POLICY,
  PREPARATION_LINEAGE_MODEL,
  PUSH20_OPCODE,
  RPC_RESPONSE_POLICY,
  READ_ONLY_SELECTORS,
  SG4_IMPLEMENTATION_PATHS,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_EXECUTOR_ADDRESS,
  SG4_GUARDED_SOURCE_SCOPE,
  SG4_CANONICAL_OPERATION_VARIANTS,
  SG4_STALE_AUTHORITY_SYMBOL_PATTERNS,
  SG4_STALE_GUARD_DEFINITION_FILES,
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
  type ControlDeclaration,
  type LiveLimitSemantics,
} from "./sg4-hcu-authority-protocol";

export const ROOT = join(__dirname, "..");

/* Committed digests of the two deterministic protocols. Any edit to either generator changes its
 * digest and fails preflight until the change is reviewed and the constant is updated. */
export const EXPECTED_SG4_PROTOCOL_SHA256 = "88d6f8c1522a0668d769f34ddafaf3e71134cbc9434a1b9676f78d5bdeb0968e";
export const EXPECTED_AUTHORITY_PROTOCOL_SHA256 = "2925e130d3b9a691ca95254be1d9b582add6b79147ed3319008c8c6bb89bce7b";

/* Resolved through the repository root node_modules. This path exists only because
 * @fhevm/host-contracts is a direct dependency: with the transitive-only arrangement the authority
 * root was not resolvable from the root at all, so a missing pin fails here rather than silently
 * falling back to the plugin's private copy. */
const HOST_CONTRACTS = join(ROOT, "node_modules/@fhevm/host-contracts");
const MOCK_UTILS = join(ROOT, "node_modules/@fhevm/mock-utils");
const HARDHAT_PLUGIN = join(ROOT, "node_modules/@fhevm/hardhat-plugin");
const FHEVM_SOLIDITY = join(ROOT, "node_modules/@fhevm/solidity");

const SOURCE_FILES: Readonly<Record<string, string>> = {
  "@fhevm/host-contracts:contracts/HCULimit.sol": join(HOST_CONTRACTS, "contracts/HCULimit.sol"),
  "@fhevm/host-contracts:contracts/FHEVMExecutor.sol": join(HOST_CONTRACTS, "contracts/FHEVMExecutor.sol"),
  "@fhevm/host-contracts:artifacts/contracts/HCULimit.sol/HCULimit.json": join(
    HOST_CONTRACTS,
    "artifacts/contracts/HCULimit.sol/HCULimit.json",
  ),
  "@fhevm/mock-utils:fhevm/coprocessor/CoprocessorEvents.ts": join(
    MOCK_UTILS,
    "fhevm/coprocessor/CoprocessorEvents.ts",
  ),
  "@fhevm/hardhat-plugin:src/internal/constants.ts": join(HARDHAT_PLUGIN, "src/internal/constants.ts"),
  "@fhevm/solidity:config/ZamaConfig.sol": join(FHEVM_SOLIDITY, "config/ZamaConfig.sol"),
};

const CALCULATOR_FILE = join(MOCK_UTILS, "fhevm/coprocessor/hcu.ts");
const COST_TABLE_FILE = join(MOCK_UTILS, "fhevm/coprocessor/HCUByOperator.ts");

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/* ---------------------------------------------------------------------------------------------
 * Cost-table parsing.
 *
 * Both representations are parsed from the exact files whose SHA-256 digests are pinned in the
 * protocol, so the artifact that is hashed is the artifact that is parsed.
 * ------------------------------------------------------------------------------------------- */

export type CostGroup = "scalar" | "nonScalar" | "types";
export type CostTable = Map<string, Map<CostGroup, Map<string, number>>>;

function setCost(table: CostTable, operation: string, group: CostGroup, type: string, cost: number): void {
  if (!table.has(operation)) table.set(operation, new Map());
  const groups = table.get(operation) as Map<CostGroup, Map<string, number>>;
  if (!groups.has(group)) groups.set(group, new Map());
  (groups.get(group) as Map<string, number>).set(type, cost);
}

/* `@fhevm/mock-utils` HCUByOperator.ts is a plain nested object literal with stable two/four/six
 * space indentation. The parser is line-oriented and rejects anything it does not recognise. */
export function parseInstalledCostTable(source: string): CostTable {
  const start = source.indexOf("export const HCUByOperator = {");
  if (start < 0) throw new Error("installed cost table: HCUByOperator declaration not found");
  const table: CostTable = new Map();
  const lines = source.slice(start).split("\n");
  let operation: string | undefined;
  let group: CostGroup | undefined;
  for (const line of lines) {
    const operationMatch = /^ {2}([A-Za-z][A-Za-z0-9]*): \{$/u.exec(line);
    if (operationMatch) {
      operation = operationMatch[1];
      group = undefined;
      if (!table.has(operation)) table.set(operation, new Map());
      continue;
    }
    /* Some groups are wrapped in Object.freeze({ ... }); both spellings are accepted, and nothing
     * else is. */
    const groupMatch = /^ {4}(scalar|nonScalar|types): (?:Object\.freeze\()?\{$/u.exec(line);
    if (groupMatch && operation) {
      group = groupMatch[1] as CostGroup;
      continue;
    }
    const costMatch = /^ {6}([A-Za-z][A-Za-z0-9]*): ([0-9]+),$/u.exec(line);
    if (costMatch && operation && group) {
      setCost(table, operation, group, costMatch[1], Number.parseInt(costMatch[2], 10));
      continue;
    }
    if (/^ {4}\}\)?,$/u.test(line)) group = undefined;
    if (/^\}/u.test(line)) break;
  }
  if (table.size === 0) throw new Error("installed cost table: no operations parsed");
  return table;
}

function matchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    if (source[index] === "{") depth++;
    else if (source[index] === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  throw new Error("unbalanced braces while parsing the authority implementation");
}

/* `HCULimit.checkHCUFor*` entry points carry the enforced per-operation costs inline. Three shapes
 * occur and each is handled explicitly:
 *
 *   `scalarByte == 0x01`  -> costs inside the if-block are scalar, costs inside its else are not.
 *   `scalarByte != 0x01`  -> a guard revert; the operation is scalar-only.
 *   neither               -> the operation has a single unconditional cost group.
 */
export function parseAuthorityCostTable(source: string): CostTable {
  const table: CostTable = new Map();
  const signature = /function checkHCUFor([A-Za-z0-9]+)\s*\(/gu;
  let match: RegExpExecArray | null;
  while ((match = signature.exec(source)) !== null) {
    const operation = match[1];
    const bodyOpen = source.indexOf("{", source.indexOf(")", match.index));
    if (bodyOpen < 0) throw new Error(`authority table: no body for ${operation}`);
    const body = source.slice(bodyOpen, matchingBrace(source, bodyOpen) + 1);

    const costPattern = /resultType == FheType\.([A-Za-z0-9]+)\)\s*\{\s*opHCU = ([0-9]+);/gu;
    const scalarEqualIndex = body.indexOf("scalarByte == 0x01");
    const scalarNotEqual = body.includes("scalarByte != 0x01");

    let scalarRange: { start: number; end: number } | undefined;
    let nonScalarRange: { start: number; end: number } | undefined;
    if (scalarEqualIndex >= 0) {
      const scalarOpen = body.indexOf("{", scalarEqualIndex);
      const scalarClose = matchingBrace(body, scalarOpen);
      scalarRange = { start: scalarOpen, end: scalarClose };
      const elseMatch = /^\s*else\s*\{/u.exec(body.slice(scalarClose + 1));
      if (elseMatch) {
        const elseOpen = scalarClose + 1 + elseMatch[0].lastIndexOf("{");
        nonScalarRange = { start: elseOpen, end: matchingBrace(body, elseOpen) };
      }
    }

    let costMatch: RegExpExecArray | null;
    while ((costMatch = costPattern.exec(body)) !== null) {
      const at = costMatch.index;
      let group: CostGroup;
      if (scalarRange && at > scalarRange.start && at < scalarRange.end) group = "scalar";
      else if (nonScalarRange && at > nonScalarRange.start && at < nonScalarRange.end) group = "nonScalar";
      else if (scalarNotEqual) group = "scalar";
      else if (scalarEqualIndex >= 0) group = "nonScalar";
      else group = "types";
      setCost(table, operation, group, costMatch[1], Number.parseInt(costMatch[2], 10));
    }
    if (!table.has(operation)) table.set(operation, new Map());
  }
  if (table.size === 0) throw new Error("authority table: no checkHCUFor entry points parsed");
  return table;
}

export function parseExecutorEventNames(source: string): string[] {
  const start = source.indexOf("export type CoprocessorOperatorEventName =");
  if (start < 0) throw new Error("executor events: CoprocessorOperatorEventName not found");
  const end = source.indexOf(";", start);
  return [...source.slice(start, end).matchAll(/"([A-Za-z][A-Za-z0-9]*)"/gu)].map((entry) => entry[1]).sort();
}

export type TableComparison = {
  shared: string[];
  installedOnly: string[];
  authorityOnly: string[];
  costMismatches: string[];
  operandMismatches: string[];
  translationsApplied: string[];
  ambiguousTranslation: boolean;
};

/* Deterministic comparison. Nothing here concludes "compatible" without having compared the actual
 * parsed representations, and every asymmetry is reported rather than smoothed over. */
export function compareOperationTables(
  installed: CostTable,
  authority: CostTable,
  translations: Readonly<Record<string, string>> = OPERATION_NAME_TRANSLATIONS,
): TableComparison {
  const translationTargets = Object.values(translations);
  const ambiguousTranslation = new Set(translationTargets).size !== translationTargets.length;

  const translated: CostTable = new Map();
  const translationsApplied: string[] = [];
  for (const [name, groups] of authority) {
    const target = translations[name] ?? name;
    if (target !== name) translationsApplied.push(`${name}->${target}`);
    if (translated.has(target)) throw new Error(`ambiguous operation translation collides on ${target}`);
    translated.set(target, groups);
  }

  const installedNames = [...installed.keys()].sort();
  const authorityNames = [...translated.keys()].sort();
  const shared = installedNames.filter((name) => translated.has(name));
  const installedOnly = installedNames.filter((name) => !translated.has(name));
  const authorityOnly = authorityNames.filter((name) => !installed.has(name));

  const costMismatches: string[] = [];
  const operandMismatches: string[] = [];
  for (const name of shared) {
    const left = installed.get(name) as Map<CostGroup, Map<string, number>>;
    const right = translated.get(name) as Map<CostGroup, Map<string, number>>;
    const groups = [...new Set([...left.keys(), ...right.keys()])].sort();
    for (const group of groups) {
      const leftGroup = left.get(group);
      const rightGroup = right.get(group);
      if (!leftGroup || !rightGroup) {
        operandMismatches.push(`${name}.${group}:present_on_one_side_only`);
        continue;
      }
      const types = [...new Set([...leftGroup.keys(), ...rightGroup.keys()])].sort();
      for (const type of types) {
        const leftCost = leftGroup.get(type);
        const rightCost = rightGroup.get(type);
        if (leftCost === undefined || rightCost === undefined) {
          operandMismatches.push(`${name}.${group}.${type}:present_on_one_side_only`);
        } else if (leftCost !== rightCost) {
          costMismatches.push(`${name}.${group}.${type}:${leftCost}!=${rightCost}`);
        }
      }
    }
  }

  return {
    shared,
    installedOnly,
    authorityOnly,
    costMismatches: costMismatches.sort(),
    operandMismatches: operandMismatches.sort(),
    translationsApplied: translationsApplied.sort(),
    ambiguousTranslation,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Limit extraction from executable code paths.
 * ------------------------------------------------------------------------------------------- */

export type LimitExtraction = {
  totalLimit: bigint;
  depthLimit: bigint;
  totalEnforced: boolean;
  depthEnforced: boolean;
  totalComparisonIsGreaterOrEqual: boolean;
  depthComparisonIsGreaterOrEqual: boolean;
  depthUsesTransientStorage: boolean;
  depthDocstringClaimsPerBlock: boolean;
  depthScope: "PER_TRANSACTION" | "UNRESOLVED";
};

/* The two constants are `private constant` with no getter, so the value is read from the source and
 * is only accepted when its enforcement path is also present. The depth constant's docstring says
 * "per block"; scope is therefore established from the enforcement path and the transient-storage
 * state transitions, never from the docstring. */
export function extractLimits(source: string): LimitExtraction {
  const totalMatch = /uint256 private constant MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX = ([0-9_]+);/u.exec(source);
  const depthMatch = /uint256 private constant MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX = ([0-9_]+);/u.exec(source);
  if (!totalMatch || !depthMatch) throw new Error("authority limits: constant declarations not found");

  const totalEnforced =
    /transactionHCU >= MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX\)\s*\{\s*revert HCUTransactionLimitExceeded\(\);/u.test(
      source,
    );
  const depthEnforced =
    /totalHCU >= MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX\)\s*\{\s*revert HCUTransactionDepthLimitExceeded\(\);/u.test(
      source,
    );
  const depthUsesTransientStorage = /tload\(handle\)/u.test(source) && /tstore\(handle/u.test(source);
  const depthDocstringClaimsPerBlock = /units depth per block/u.test(source);

  return {
    totalLimit: BigInt(totalMatch[1].replace(/_/gu, "")),
    depthLimit: BigInt(depthMatch[1].replace(/_/gu, "")),
    totalEnforced,
    depthEnforced,
    totalComparisonIsGreaterOrEqual: totalEnforced,
    depthComparisonIsGreaterOrEqual: depthEnforced,
    depthUsesTransientStorage,
    depthDocstringClaimsPerBlock,
    /* Fail closed: per-transaction scope is asserted only when the enforcement path and the
     * transient-storage evidence are both present. */
    depthScope: depthEnforced && depthUsesTransientStorage ? "PER_TRANSACTION" : "UNRESOLVED",
  };
}

/* Narrow scan retained only as a labelled counter-example. It matches one exact declaration shape
 * and therefore cannot establish that anything is absent: a uint48 constant, a public or immutable
 * variable, a storage-struct field, a mapping, an accumulator, a getter, or an enforcement path
 * would all be invisible to it. `enumerateAuthoritySurface` is the enumeration that absence claims
 * must be based on. */
export function enumerateLimitConstants(source: string): string[] {
  return [...source.matchAll(/uint256 private constant (MAX_[A-Z_]+) =/gu)].map((entry) => entry[1]).sort();
}

export const NARROW_CONSTANT_SCAN_IS_NOT_EXHAUSTIVE = true;

/* ---------------------------------------------------------------------------------------------
 * Exhaustive contract-surface enumeration.
 *
 * Absence of a block-scoped or batch-scoped control is a claim about the complete relevant surface
 * of a specific implementation. This enumerator walks the contract body at declaration scope and
 * classifies every statement it finds. Anything it cannot classify is recorded as a parse failure
 * and makes the enumeration incomplete, which fails closed: an incomplete enumeration can never
 * support an absence conclusion.
 * ------------------------------------------------------------------------------------------- */

export type DeclarationKind =
  | "constant"
  | "immutable"
  | "stateVariable"
  | "mapping"
  | "structField"
  | "function"
  | "modifier"
  | "constructor"
  | "error"
  | "event"
  | "struct"
  | "enum"
  | "using"
  | "type";

export type SurfaceDeclaration = {
  kind: DeclarationKind;
  name: string;
  declaredType: string | null;
  visibility: string | null;
  statement: string;
};

export type AuthoritySurface = {
  contractName: string | null;
  declarations: SurfaceDeclaration[];
  /* False whenever any declaration-scope statement could not be classified. */
  enumerationComplete: boolean;
  parseFailures: string[];
  numericDeclarations: SurfaceDeclaration[];
  callableFunctions: string[];
  getters: string[];
  errors: string[];
  events: string[];
  mappings: string[];
  structFields: string[];
  /* Every declaration whose CODE (never its docstring) names a block, batch, epoch, or window
   * scope. A comment can never put an entry here, and never remove one. */
  blockOrBatchCandidates: string[];
  /* Storage/transient primitives that could implement an accumulator. */
  storagePrimitivesUsed: string[];
};

const DECLARATION_SCOPE_KEYWORDS = [
  "constructor",
  "enum",
  "error",
  "event",
  "function",
  "mapping",
  "modifier",
  "struct",
  "type",
  "using",
];

/* Strips comments while preserving byte positions poorly but statement structure exactly. Comments
 * are removed deliberately: scope conclusions must never be derivable from prose. */
export function stripSolidityComments(source: string): string {
  let out = "";
  let index = 0;
  let inLine = false;
  let inBlock = false;
  let inString: string | null = null;
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    const char = source[index];
    if (inLine) {
      if (char === "\n") {
        inLine = false;
        out += char;
      }
      index++;
      continue;
    }
    if (inBlock) {
      if (two === "*/") {
        inBlock = false;
        index += 2;
        continue;
      }
      if (char === "\n") out += char;
      index++;
      continue;
    }
    if (inString) {
      out += char;
      if (char === "\\") {
        out += source[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (char === inString) inString = null;
      index++;
      continue;
    }
    if (two === "//") {
      inLine = true;
      index += 2;
      continue;
    }
    if (two === "/*") {
      inBlock = true;
      index += 2;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      out += char;
      index++;
      continue;
    }
    out += char;
    index++;
  }
  return out;
}

/* Splits the body of the top-level contract into declaration-scope statements: each is either a
 * `;`-terminated declaration or a header followed by one balanced `{ ... }` block. */
function splitDeclarationScope(body: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  let inString: string | null = null;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    current += char;
    if (inString) {
      if (char === "\\") {
        current += body[index + 1] ?? "";
        index++;
        continue;
      }
      if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if (char === "{") {
      depth++;
      continue;
    }
    if (char === "}") {
      depth--;
      if (depth === 0) {
        statements.push(current.trim());
        current = "";
      }
      continue;
    }
    if (char === ";" && depth === 0) {
      statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim().length > 0) statements.push(current.trim());
  return statements.filter((statement) => statement.length > 0);
}

function classifyStatement(statement: string): SurfaceDeclaration | null {
  const flat = statement.replace(/\s+/gu, " ").trim();

  const functionMatch = /^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/u.exec(flat);
  if (functionMatch) {
    const visibility = /\b(external|public|internal|private)\b/u.exec(flat)?.[1] ?? null;
    return { kind: "function", name: functionMatch[1], declaredType: null, visibility, statement: flat };
  }
  if (/^constructor\s*\(/u.test(flat)) {
    return { kind: "constructor", name: "constructor", declaredType: null, visibility: null, statement: flat };
  }
  const modifierMatch = /^modifier\s+([A-Za-z_$][A-Za-z0-9_$]*)/u.exec(flat);
  if (modifierMatch) {
    return { kind: "modifier", name: modifierMatch[1], declaredType: null, visibility: null, statement: flat };
  }
  const errorMatch = /^error\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/u.exec(flat);
  if (errorMatch) {
    return { kind: "error", name: errorMatch[1], declaredType: null, visibility: null, statement: flat };
  }
  const eventMatch = /^event\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/u.exec(flat);
  if (eventMatch) {
    return { kind: "event", name: eventMatch[1], declaredType: null, visibility: null, statement: flat };
  }
  const structMatch = /^struct\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\{/u.exec(flat);
  if (structMatch) {
    return { kind: "struct", name: structMatch[1], declaredType: null, visibility: null, statement: flat };
  }
  const enumMatch = /^enum\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\{/u.exec(flat);
  if (enumMatch) {
    return { kind: "enum", name: enumMatch[1], declaredType: null, visibility: null, statement: flat };
  }
  if (/^using\s+/u.test(flat)) {
    return { kind: "using", name: flat.slice(0, 60), declaredType: null, visibility: null, statement: flat };
  }
  if (/^type\s+[A-Za-z_$]/u.test(flat)) {
    const name = /^type\s+([A-Za-z_$][A-Za-z0-9_$]*)/u.exec(flat)?.[1] ?? "unknown";
    return { kind: "type", name, declaredType: null, visibility: null, statement: flat };
  }
  const mappingMatch =
    /^mapping\s*\((.+)\)\s*((?:public|private|internal|transient|\s)*)([A-Za-z_$][A-Za-z0-9_$]*)\s*;$/u.exec(flat);
  if (mappingMatch) {
    const visibility = /\b(public|private|internal)\b/u.exec(mappingMatch[2])?.[1] ?? null;
    return {
      kind: "mapping",
      name: mappingMatch[3],
      declaredType: `mapping(${mappingMatch[1]})`,
      visibility,
      statement: flat,
    };
  }
  /* Any elementary or user-defined typed variable declaration, of ANY width. This deliberately
   * accepts uint48, int128, bytes8, user-defined types, arrays, and so on. */
  const variableMatch =
    /^([A-Za-z_$][A-Za-z0-9_$.]*(?:\[\s*[0-9]*\s*\])?)\s+((?:public|private|internal|constant|immutable|transient|override|\s)*)([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=[\s\S]*)?;$/u.exec(
      flat,
    );
  if (variableMatch && !DECLARATION_SCOPE_KEYWORDS.includes(variableMatch[1])) {
    const modifiers = variableMatch[2];
    const visibility = /\b(public|private|internal)\b/u.exec(modifiers)?.[1] ?? null;
    const kind: DeclarationKind = /\bconstant\b/u.test(modifiers)
      ? "constant"
      : /\bimmutable\b/u.test(modifiers)
        ? "immutable"
        : "stateVariable";
    return { kind, name: variableMatch[3], declaredType: variableMatch[1], visibility, statement: flat };
  }
  return null;
}

const NUMERIC_TYPE = /^(u?int(?:[0-9]+)?|bytes(?:[0-9]+)?)$/u;
const BLOCK_OR_BATCH_NAME = /(BLOCK|BATCH|EPOCH|WINDOW|PER_BLOCK|PERBLOCK)/iu;

export function enumerateAuthoritySurface(source: string): AuthoritySurface {
  const code = stripSolidityComments(source);
  const contractMatch = /\b(?:contract|library|abstract\s+contract)\s+([A-Za-z_$][A-Za-z0-9_$]*)[^{]*\{/u.exec(code);
  if (!contractMatch) {
    return {
      contractName: null,
      declarations: [],
      enumerationComplete: false,
      parseFailures: ["NO_CONTRACT_DECLARATION_FOUND"],
      numericDeclarations: [],
      callableFunctions: [],
      getters: [],
      errors: [],
      events: [],
      mappings: [],
      structFields: [],
      blockOrBatchCandidates: [],
      storagePrimitivesUsed: [],
    };
  }
  const openIndex = code.indexOf("{", contractMatch.index);
  const closeIndex = matchingBrace(code, openIndex);
  const body = code.slice(openIndex + 1, closeIndex);

  const declarations: SurfaceDeclaration[] = [];
  const parseFailures: string[] = [];
  const structFields: string[] = [];

  for (const statement of splitDeclarationScope(body)) {
    const classified = classifyStatement(statement);
    if (!classified) {
      parseFailures.push(`UNCLASSIFIED_DECLARATION_SCOPE_STATEMENT:${statement.replace(/\s+/gu, " ").slice(0, 80)}`);
      continue;
    }
    declarations.push(classified);
    if (classified.kind === "struct") {
      const structBody = classified.statement.slice(classified.statement.indexOf("{") + 1, -1);
      for (const field of structBody.split(";")) {
        const trimmed = field.trim();
        if (trimmed.length === 0) continue;
        const parts = trimmed.split(/\s+/u);
        const name = parts[parts.length - 1];
        structFields.push(`${classified.name}.${name}`);
        declarations.push({
          kind: "structField",
          name: `${classified.name}.${name}`,
          declaredType: parts[0],
          visibility: null,
          statement: trimmed,
        });
      }
    }
  }

  const numericDeclarations = declarations.filter(
    (entry) =>
      entry.declaredType !== null &&
      NUMERIC_TYPE.test(entry.declaredType) &&
      ["constant", "immutable", "stateVariable", "structField"].includes(entry.kind),
  );

  const blockOrBatchCandidates = declarations
    .filter((entry) => BLOCK_OR_BATCH_NAME.test(entry.name) || BLOCK_OR_BATCH_NAME.test(entry.statement))
    .map((entry) => `${entry.kind}:${entry.name}`)
    .sort();

  const storagePrimitivesUsed = ["sload", "sstore", "tload", "tstore"]
    .filter((primitive) => new RegExp(`\\b${primitive}\\s*\\(`, "u").test(body))
    .sort();

  return {
    contractName: contractMatch[1],
    declarations,
    enumerationComplete: parseFailures.length === 0,
    parseFailures: parseFailures.sort(),
    numericDeclarations,
    callableFunctions: declarations
      .filter((entry) => entry.kind === "function" && ["external", "public"].includes(entry.visibility ?? ""))
      .map((entry) => entry.name)
      .sort(),
    getters: declarations
      .filter((entry) => entry.kind === "function" && /^get[A-Z]/u.test(entry.name))
      .map((entry) => entry.name)
      .sort(),
    errors: declarations
      .filter((entry) => entry.kind === "error")
      .map((entry) => entry.name)
      .sort(),
    events: declarations
      .filter((entry) => entry.kind === "event")
      .map((entry) => entry.name)
      .sort(),
    mappings: declarations
      .filter((entry) => entry.kind === "mapping")
      .map((entry) => entry.name)
      .sort(),
    structFields: structFields.sort(),
    blockOrBatchCandidates,
    storagePrimitivesUsed,
  };
}

/* Classify the block/batch control from a surface enumeration.
 *
 * Absence is available only when the deployed implementation has been identified by code identity
 * AND the enumeration of that implementation completed. Everything else is UNRESOLVED. */
export function classifyBlockOrBatchControl(input: {
  surface: AuthoritySurface;
  codeIdentityVerified: boolean;
  implementationIdentity: string;
}): ControlDeclaration {
  const base = {
    metricId: "BLOCK_OR_BATCH_HCU",
    scope: "PER_BLOCK_OR_BATCH",
    unit: "HCU",
  } as const;

  if (!input.codeIdentityVerified) {
    return {
      ...base,
      authorityState: "UNRESOLVED",
      value: null,
      absenceReason: null,
      verificationMethod:
        "Not established: the deployed implementation was not identified by address-normalized code identity, so no enumeration describes the authority.",
      sourceImplementation: "NOT_YET_IDENTIFIED_PENDING_LIVE_CODE_IDENTITY",
      applicabilityConclusion: "UNRESOLVED_THEREFORE_BLOCKING",
      liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
      blocking: true,
    };
  }

  if (!input.surface.enumerationComplete) {
    return {
      ...base,
      authorityState: "UNRESOLVED",
      value: null,
      absenceReason: null,
      verificationMethod: `Not established: ENUMERATION of the verified implementation was incomplete (${input.surface.parseFailures.join(", ")}).`,
      sourceImplementation: input.implementationIdentity,
      applicabilityConclusion: "UNRESOLVED_THEREFORE_BLOCKING",
      liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
      blocking: true,
    };
  }

  if (input.surface.blockOrBatchCandidates.length > 0) {
    /* A block/batch surface exists. A numeric value is required before it can be called present;
     * without one the control is present-but-unquantified, which is still unresolved. */
    const valued = input.surface.numericDeclarations.find(
      (entry) => BLOCK_OR_BATCH_NAME.test(entry.name) && /=\s*([0-9_]+)\s*;$/u.test(entry.statement),
    );
    if (!valued) {
      return {
        ...base,
        authorityState: "UNRESOLVED",
        value: null,
        absenceReason: null,
        verificationMethod: `ENUMERATION of the verified implementation found block/batch-scoped surface (${input.surface.blockOrBatchCandidates.join(", ")}) but no extractable numeric ceiling.`,
        sourceImplementation: input.implementationIdentity,
        applicabilityConclusion: "UNRESOLVED_THEREFORE_BLOCKING",
        liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
        blocking: true,
      };
    }
    const value = (/=\s*([0-9_]+)\s*;$/u.exec(valued.statement) as RegExpExecArray)[1].replace(/_/gu, "");
    return {
      ...base,
      authorityState: "PROVEN_PRESENT",
      value,
      absenceReason: null,
      verificationMethod: `ENUMERATION of the verified deployed implementation resolved a block/batch-scoped ceiling from declaration ${valued.name}.`,
      sourceImplementation: input.implementationIdentity,
      applicabilityConclusion: "APPLICABLE_TO_EVERY_SG4_MEASURED_BLOCK_OR_BATCH",
      liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
      blocking: false,
    };
  }

  return {
    ...base,
    authorityState: "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION",
    value: null,
    absenceReason: `Exhaustive ENUMERATION of the verified deployed implementation classified all ${input.surface.declarations.length} declaration-scope declarations and found no block-scoped or batch-scoped constant, state variable, immutable, mapping, storage-struct field, getter, accumulator, or enforcement path of any width.`,
    verificationMethod: `Complete ENUMERATION of every declaration-scope statement in the implementation identified by address-normalized code identity: ${input.surface.declarations.length} declarations, ${input.surface.callableFunctions.length} externally callable functions, ${input.surface.errors.length} errors, ${input.surface.mappings.length} mappings, ${input.surface.structFields.length} storage-struct fields, storage primitives [${input.surface.storagePrimitivesUsed.join(",")}].`,
    sourceImplementation: input.implementationIdentity,
    applicabilityConclusion: "NOT_ENFORCED_BY_THE_VERIFIED_IMPLEMENTATION_THEREFORE_NOT_BLOCKING",
    liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
    blocking: false,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Address-normalized bytecode verification.
 * ------------------------------------------------------------------------------------------- */

export type MetadataInspection = {
  valid: boolean;
  cborByteLength: number;
  hex: string;
  solcVersion: string | null;
  carriesSourceHash: boolean;
  codeSectionLength: number;
};

/* The trailer is validated structurally before any part of it is treated as comparable. It must be
 * a one-entry CBOR map holding only the solc version; a trailer that also carries a source hash is
 * a different structure and is rejected rather than stripped. */
export function inspectMetadataTrailer(runtime: Buffer): MetadataInspection {
  if (runtime.length < 4) throw new Error("metadata: runtime too short");
  const cborByteLength = runtime.readUInt16BE(runtime.length - 2);
  const start = runtime.length - 2 - cborByteLength;
  if (start < 0) throw new Error("metadata: declared trailer length exceeds runtime length");
  const trailer = runtime.subarray(start, runtime.length - 2);
  const hex = trailer.toString("hex");
  const solcMatch = /^a164736f6c6343([0-9a-f]{6})$/u.exec(hex);
  const carriesSourceHash = /69706673|627a7a72/u.test(hex);
  return {
    valid: solcMatch !== null && !carriesSourceHash,
    cborByteLength,
    hex,
    solcVersion: solcMatch
      ? `${parseInt(solcMatch[1].slice(0, 2), 16)}.${parseInt(solcMatch[1].slice(2, 4), 16)}.${parseInt(solcMatch[1].slice(4, 6), 16)}`
      : null,
    carriesSourceHash,
    codeSectionLength: start,
  };
}

export type NormalizationResult = {
  ok: boolean;
  failures: string[];
  replacements: number;
  replacedOffsets: number[];
  normalizedSha256: string;
  embeddedAddress: string | null;
};

/* Only the exact predeclared offsets are normalized, each is required to be a PUSH20 immediate
 * holding the same address, and any occurrence of that address at an undeclared offset is a
 * failure. There is no broad string replacement anywhere in this function. */
export function normalizeRuntimeBytecode(
  runtime: Buffer,
  expectedAddress: string,
  offsets: readonly number[] = EXECUTOR_IMMEDIATE_OFFSETS,
): NormalizationResult {
  const failures: string[] = [];
  const address = expectedAddress.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{40}$/u.test(address)) throw new Error("normalization: expected address is malformed");

  if (BigInt(runtime.length) !== EXPECTED_RUNTIME_BYTE_LENGTH) {
    failures.push(`LENGTH_MISMATCH:${runtime.length}!=${EXPECTED_RUNTIME_BYTE_LENGTH}`);
  }

  const metadata = inspectMetadataTrailer(runtime);
  if (!metadata.valid) failures.push("UNRECOGNIZED_METADATA");
  if (metadata.solcVersion !== EXPECTED_METADATA.solcVersion) {
    failures.push(`UNRECOGNIZED_METADATA:solc=${metadata.solcVersion}`);
  }

  const normalized = Buffer.from(runtime);
  const replacedOffsets: number[] = [];
  for (const offset of offsets) {
    if (offset < 0 || offset + ADDRESS_BYTE_LENGTH > runtime.length) {
      failures.push(`UNKNOWN_OFFSET:${offset}`);
      continue;
    }
    if (runtime[offset - 1] !== PUSH20_OPCODE) {
      failures.push(`OPCODE_MISMATCH:${offset}`);
      continue;
    }
    const found = runtime.subarray(offset, offset + ADDRESS_BYTE_LENGTH).toString("hex");
    if (found !== address) {
      failures.push(`MISSING_REPLACEMENT:${offset}:${found}`);
      continue;
    }
    normalized.fill(0, offset, offset + ADDRESS_BYTE_LENGTH);
    replacedOffsets.push(offset);
  }

  /* Any further occurrence of the address outside the declared offsets means the offset table is
   * incomplete; normalizing it silently would hide a real difference. */
  const declared = new Set(offsets);
  const hex = runtime.toString("hex");
  for (let index = hex.indexOf(address); index !== -1; index = hex.indexOf(address, index + 1)) {
    if (index % 2 !== 0) continue;
    if (!declared.has(index / 2)) failures.push(`EXTRA_REPLACEMENT:${index / 2}`);
  }

  if (replacedOffsets.length !== EXECUTOR_IMMEDIATE_COUNT) {
    failures.push(`MISSING_REPLACEMENT:count=${replacedOffsets.length}`);
  }

  return {
    ok: failures.length === 0,
    failures: failures.sort(),
    replacements: replacedOffsets.length,
    replacedOffsets,
    normalizedSha256: sha256(normalized),
    embeddedAddress: replacedOffsets.length > 0 ? `0x${address}` : null,
  };
}

/* ---------------------------------------------------------------------------------------------
 * F19 — manifest-driven normalization for the AUTHORITATIVE artifact.
 *
 * `normalizeRuntimeBytecode` above enforces the LOCAL 0.10.0 fixture's constants: its runtime
 * length, its solc version, its 28 offsets and its replacement count. Judging the current official
 * artifact with those constants judges it by the old fixture's layout. This function takes every
 * such value from the reviewed manifest instead, so an authoritative artifact whose layout differs
 * from the fixture in any respect can still verify.
 *
 * The fixture normalizer is retained for offline self-tests only and is never applied to the live
 * deployed implementation.
 * ------------------------------------------------------------------------------------------- */

export type NormalizationManifest = {
  schema: string;
  version: number;
  runtimeByteLength: number;
  compilerVersion: string;
  metadataModel: string;
  acceptedMetadataStructure: string;
  immutableReferenceKind: string;
  wordByteLength: number;
  deploymentValueShape: string;
  primaryImmutableReferences: {
    id: string;
    kind: string;
    offset: number;
    byteLength: number;
    expectedArtifactPlaceholderBytes: string;
    compilerReferenceId: string;
  }[];
  requiredPrecedingOpcode: string;
  expectedReplacementCount: number;
  metadataTrailerByteLength: number;
  metadataTrailerSha256: string;
  supplementaryImmutableReferences: {
    id: string;
    kind: string;
    offset: number;
    byteLength: number;
    expectedDeployedBytes: string;
    expectedArtifactPlaceholderBytes: string;
    compilerReferenceId: string;
  }[];
};

/* Structural validation of a manifest, independent of any runtime. Every bound the comparison
 * depends on is checked here so a malformed manifest can never reach the comparison. */
/* F35 — the compiler's own immutable-reference output for this build, digest-bound and selected
 * by the artifact provenance tuple. Every reference the normalization manifest claims must appear
 * here identically, so an invented reference id cannot authorize normalizing arbitrary bytes. */
export function validateCompilerReferenceManifest(manifest: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(manifest)) return ["compiler reference manifest must be an object"];
  for (const field of COMPILER_REFERENCE_MANIFEST_FIELDS) {
    if (!(field in manifest)) errors.push(`compiler reference manifest is missing ${field}`);
  }
  for (const key of Object.keys(manifest)) {
    if (!COMPILER_REFERENCE_MANIFEST_FIELDS.includes(key)) {
      errors.push(`compiler reference manifest has an unpermitted field ${key}`);
    }
  }
  if (manifest.schema !== COMPILER_REFERENCE_MANIFEST_SCHEMA)
    errors.push("compiler reference manifest schema mismatch");
  if (manifest.version !== 2) errors.push("compiler reference manifest version must be 2");
  if (typeof manifest.solcLongVersion !== "string" || manifest.solcLongVersion.length === 0) {
    errors.push("compiler reference manifest requires the exact long compiler version");
  }
  /* Every immutable id must resolve to a declaration: WHERE an immutable lives says nothing about
   * what value belongs there, and the value is what normalization writes. */
  if (!Array.isArray(manifest.immutableDeclarations) || manifest.immutableDeclarations.length === 0) {
    errors.push("compiler reference manifest requires its immutable declarations");
  } else {
    for (const [index, declaration] of manifest.immutableDeclarations.entries()) {
      if (!isObject(declaration)) {
        errors.push(`compiler immutable declaration ${index} must be an object`);
        continue;
      }
      for (const field of COMPILER_IMMUTABLE_DECLARATION_FIELDS) {
        if (!(field in declaration)) errors.push(`compiler immutable declaration ${index} is missing ${field}`);
      }
      if (declaration.mutability !== "immutable") {
        errors.push(`compiler immutable declaration ${index} is not an immutable`);
      }
    }
  }
  if (manifest.provenanceSubject !== "CURRENT_OFFICIAL_ARTIFACT_BUILD") {
    errors.push("compiler reference manifest must cite the current official artifact build");
  }
  /* An incomplete reference list cannot establish that a byte range is compiler-generated: the
   * range might simply be missing from it. */
  if (manifest.referencesComplete !== true) {
    errors.push("compiler reference manifest must record a COMPLETE reference set");
  }
  if (typeof manifest.buildId !== "string" || (manifest.buildId as string).length === 0) {
    errors.push("compiler reference manifest requires the build identity it was emitted for");
  }
  if (typeof manifest.compilerVersion !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(manifest.compilerVersion)) {
    errors.push("compiler reference manifest compilerVersion must be a semantic version");
  }
  if (typeof manifest.sourceContentSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(manifest.sourceContentSha256)) {
    errors.push("compiler reference manifest requires its source content hash");
  }
  if (!Array.isArray(manifest.entries)) {
    errors.push("compiler reference manifest entries must be an array");
    return errors;
  }
  const ids = new Set<string>();
  let previous = -1;
  for (const [index, entry] of manifest.entries.entries()) {
    if (!isObject(entry)) {
      errors.push(`compiler reference entry ${index} must be an object`);
      continue;
    }
    for (const field of COMPILER_REFERENCE_ENTRY_FIELDS) {
      if (!(field in entry)) errors.push(`compiler reference entry ${index} is missing ${field}`);
    }
    for (const key of Object.keys(entry)) {
      if (!COMPILER_REFERENCE_ENTRY_FIELDS.includes(key)) {
        errors.push(`compiler reference entry ${index} has an unpermitted field ${key}`);
      }
    }
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      errors.push(`compiler reference entry ${index} requires an id`);
    } else if (ids.has(entry.id)) {
      errors.push(`compiler reference entry ${index} duplicates id ${entry.id}`);
    } else {
      ids.add(entry.id);
    }
    if (typeof entry.offset !== "number" || !Number.isInteger(entry.offset) || entry.offset < 0) {
      errors.push(`compiler reference entry ${index} offset must be a non-negative integer`);
    } else {
      if (entry.offset <= previous) errors.push("compiler reference entries must be strictly ascending by offset");
      previous = entry.offset;
    }
    if (typeof entry.byteLength !== "number" || !Number.isInteger(entry.byteLength) || entry.byteLength <= 0) {
      errors.push(`compiler reference entry ${index} byteLength must be a positive integer`);
    }
    if (typeof entry.artifactPlaceholderBytes !== "string" || !/^0x[0-9a-f]*$/u.test(entry.artifactPlaceholderBytes)) {
      errors.push(`compiler reference entry ${index} requires artifact placeholder bytes`);
    } else if (
      typeof entry.byteLength === "number" &&
      (entry.artifactPlaceholderBytes as string).length !== entry.byteLength * 2 + 2
    ) {
      errors.push(`compiler reference entry ${index} placeholder length disagrees with its byteLength`);
    }
    if (typeof entry.referenceKind !== "string" || entry.referenceKind.length === 0) {
      errors.push(`compiler reference entry ${index} requires a reference kind`);
    }
  }
  return errors;
}

/* F35 — every reference the normalization manifest declares must be the compiler's, at the same
 * offset, with the same length and the same artifact-side placeholder. */
export function crossLinkImmutableReferences(normalization: unknown, compilerManifest: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(normalization) || !isObject(compilerManifest)) {
    return ["immutable reference cross-link requires both manifests"];
  }
  const compilerEntries = Array.isArray(compilerManifest.entries)
    ? (compilerManifest.entries as Record<string, unknown>[])
    : [];
  const byId = new Map(compilerEntries.filter(isObject).map((entry) => [String(entry.id), entry]));
  const declared: Record<string, unknown>[] = [];
  for (const field of ["primaryImmutableReferences", "supplementaryImmutableReferences"] as const) {
    const list = normalization[field];
    if (Array.isArray(list)) declared.push(...(list.filter(isObject) as Record<string, unknown>[]));
  }
  for (const reference of declared) {
    const compilerId = String(reference.compilerReferenceId);
    const compilerEntry = byId.get(compilerId);
    if (!compilerEntry) {
      errors.push(
        `immutable reference ${String(reference.id)} names a compiler reference ${compilerId} that the compiler manifest does not contain`,
      );
      continue;
    }
    if (compilerEntry.offset !== reference.offset) {
      errors.push(`immutable reference ${String(reference.id)} offset disagrees with compiler reference ${compilerId}`);
    }
    if (compilerEntry.byteLength !== reference.byteLength) {
      errors.push(
        `immutable reference ${String(reference.id)} byteLength disagrees with compiler reference ${compilerId}`,
      );
    }
    if (
      String(compilerEntry.artifactPlaceholderBytes).toLowerCase() !==
      String(reference.expectedArtifactPlaceholderBytes).toLowerCase()
    ) {
      errors.push(
        `immutable reference ${String(reference.id)} artifact placeholder disagrees with compiler reference ${compilerId}`,
      );
    }
  }
  return errors;
}

export function validateNormalizationManifest(manifest: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(manifest)) return ["normalization manifest must be an object"];
  const value = manifest;
  for (const field of NORMALIZATION_MANIFEST_FIELDS) {
    if (!(field in value)) errors.push(`normalization manifest is missing ${field}`);
  }
  for (const key of Object.keys(value)) {
    if (!NORMALIZATION_MANIFEST_FIELDS.includes(key)) {
      errors.push(`normalization manifest has an unpermitted field ${key}`);
    }
  }
  if (value.schema !== NORMALIZATION_MANIFEST_SCHEMA) errors.push("normalization manifest schema mismatch");
  if (value.version !== 2) errors.push("normalization manifest version mismatch");

  const positiveInt = (field: string): number | null => {
    const candidate = value[field];
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate <= 0) {
      errors.push(`normalization manifest ${field} must be a positive integer`);
      return null;
    }
    return candidate;
  };
  const runtimeByteLength = positiveInt("runtimeByteLength");
  const wordByteLength = positiveInt("wordByteLength");
  if (wordByteLength !== null && wordByteLength !== UUPS_SELF_IMMUTABLE.wordByteLength) {
    errors.push(`normalization manifest wordByteLength must be ${UUPS_SELF_IMMUTABLE.wordByteLength}`);
  }
  if (typeof value.deploymentValueShape !== "string" || !DEPLOYMENT_VALUE_SHAPES.includes(value.deploymentValueShape)) {
    errors.push("normalization manifest deploymentValueShape must be a declared shape");
  }
  const expectedReplacementCount =
    typeof value.expectedReplacementCount === "number" &&
    Number.isInteger(value.expectedReplacementCount) &&
    value.expectedReplacementCount >= 0
      ? value.expectedReplacementCount
      : (errors.push("normalization manifest expectedReplacementCount must be a non-negative integer"), null);

  if (typeof value.compilerVersion !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(value.compilerVersion)) {
    errors.push("normalization manifest compilerVersion must be a semantic version");
  }
  if (typeof value.metadataModel !== "string" || value.metadataModel.length === 0) {
    errors.push("normalization manifest metadataModel must be a non-empty string");
  }
  if (
    typeof value.acceptedMetadataStructure !== "string" ||
    !ACCEPTED_METADATA_STRUCTURES.includes(value.acceptedMetadataStructure)
  ) {
    errors.push("normalization manifest acceptedMetadataStructure must be a declared structure");
  }
  if (value.metadataModel !== value.acceptedMetadataStructure) {
    errors.push("normalization manifest metadataModel and acceptedMetadataStructure disagree");
  }
  if (
    typeof value.immutableReferenceKind !== "string" ||
    !IMMUTABLE_REFERENCE_KINDS.includes(value.immutableReferenceKind)
  ) {
    errors.push("normalization manifest immutableReferenceKind must be a declared kind");
  }
  const byteLiteral = (field: string): number | null => {
    const candidate = value[field];
    if (typeof candidate !== "string" || !/^0x[0-9a-f]{2}$/u.test(candidate)) {
      errors.push(`normalization manifest ${field} must be a single 0x-prefixed byte`);
      return null;
    }
    return Number.parseInt(candidate.slice(2), 16);
  };
  byteLiteral("requiredPrecedingOpcode");

  /* F35 — primary references are typed and authenticated, exactly like the supplementary ones:
   * integers, non-negative, strictly ascending, in range, each declaring the artifact-side
   * placeholder and the compiler immutable-reference id it came from. */
  const primaryOffsets: number[] = [];
  if (!Array.isArray(value.primaryImmutableReferences)) {
    errors.push("normalization manifest primaryImmutableReferences must be an array");
  } else {
    const references = value.primaryImmutableReferences;
    const ids = new Set<string>();
    for (const [index, reference] of references.entries()) {
      if (!isObject(reference)) {
        errors.push(`primary immutable reference ${index} must be an object`);
        continue;
      }
      for (const field of PRIMARY_IMMUTABLE_REFERENCE_FIELDS) {
        if (!(field in reference)) errors.push(`primary immutable reference ${index} is missing ${field}`);
      }
      for (const key of Object.keys(reference)) {
        if (!PRIMARY_IMMUTABLE_REFERENCE_FIELDS.includes(key)) {
          errors.push(`primary immutable reference ${index} has an unpermitted field ${key}`);
        }
      }
      if (typeof reference.id !== "string" || reference.id.length === 0) {
        errors.push(`primary immutable reference ${index} requires an id`);
      } else if (ids.has(reference.id)) {
        errors.push(`primary immutable reference ${index} duplicates id ${reference.id}`);
      } else {
        ids.add(reference.id);
      }
      if (typeof reference.kind !== "string" || !IMMUTABLE_REFERENCE_KINDS.includes(reference.kind)) {
        errors.push(`primary immutable reference ${index} must declare a supported kind`);
      }
      if (typeof reference.compilerReferenceId !== "string" || reference.compilerReferenceId.length === 0) {
        errors.push(`primary immutable reference ${index} requires a compiler reference id`);
      }
      const offset = reference.offset;
      if (typeof offset !== "number" || !Number.isInteger(offset)) {
        errors.push(`primary immutable reference ${index} offset must be an integer`);
        continue;
      }
      if (offset <= 0) {
        errors.push(`primary immutable reference ${index} leaves no room for the preceding opcode`);
      }
      if (index > 0 && offset <= primaryOffsets[primaryOffsets.length - 1]) {
        errors.push("normalization manifest primary references must be strictly ascending and unique");
      }
      if (runtimeByteLength !== null && wordByteLength !== null && offset + wordByteLength > runtimeByteLength) {
        errors.push(`primary immutable reference ${index} exceeds the declared runtime length`);
      }
      if (wordByteLength !== null && reference.byteLength !== wordByteLength) {
        errors.push(`primary immutable reference ${index} byteLength must equal the address length`);
      }
      const placeholder = reference.expectedArtifactPlaceholderBytes;
      if (
        typeof placeholder !== "string" ||
        wordByteLength === null ||
        !new RegExp(`^0x[0-9a-f]{${wordByteLength * 2}}$`, "u").test(placeholder)
      ) {
        errors.push(`primary immutable reference ${index} requires the exact artifact placeholder bytes`);
      }
      primaryOffsets.push(offset);
    }
    if (expectedReplacementCount !== null && references.length !== expectedReplacementCount) {
      errors.push("normalization manifest expectedReplacementCount disagrees with the primary reference count");
    }
  }

  /* F28 — closed, typed immutable references. Each declares exactly what must already be present
   * in the deployed runtime, so no arbitrary byte range can be silently overwritten. */
  const occupied: { start: number; end: number; label: string }[] = [];
  if (wordByteLength !== null) {
    for (const offset of primaryOffsets) {
      occupied.push({ start: offset, end: offset + wordByteLength, label: "primary" });
    }
  }
  const metadataLength = typeof value.metadataTrailerByteLength === "number" ? value.metadataTrailerByteLength : null;
  if (metadataLength !== null && runtimeByteLength !== null) {
    occupied.push({ start: runtimeByteLength - metadataLength, end: runtimeByteLength, label: "metadata" });
  }
  if (typeof value.metadataTrailerByteLength !== "number" || value.metadataTrailerByteLength <= 0) {
    errors.push("normalization manifest metadataTrailerByteLength must be a positive integer");
  }
  if (typeof value.metadataTrailerSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.metadataTrailerSha256)) {
    errors.push("normalization manifest metadataTrailerSha256 must be a 64-hex digest");
  }

  if (!Array.isArray(value.supplementaryImmutableReferences)) {
    errors.push("normalization manifest supplementaryImmutableReferences must be an array");
  } else {
    const ids = new Set<string>();
    let previousOffset = -1;
    for (const [index, entry] of value.supplementaryImmutableReferences.entries()) {
      if (!isObject(entry)) {
        errors.push(`supplementary immutable reference ${index} must be an object`);
        continue;
      }
      for (const field of IMMUTABLE_REFERENCE_ENTRY_FIELDS) {
        if (!(field in entry)) errors.push(`supplementary immutable reference ${index} is missing ${field}`);
      }
      for (const key of Object.keys(entry)) {
        if (!(IMMUTABLE_REFERENCE_ENTRY_FIELDS as readonly string[]).includes(key)) {
          errors.push(`supplementary immutable reference ${index} has an unpermitted field ${key}`);
        }
      }
      if (typeof entry.id !== "string" || entry.id.length === 0) {
        errors.push(`supplementary immutable reference ${index} requires an id`);
      } else {
        if (ids.has(entry.id)) errors.push(`supplementary immutable reference ${index} duplicates id ${entry.id}`);
        ids.add(entry.id);
      }
      if (typeof entry.kind !== "string" || !SUPPLEMENTARY_REFERENCE_KINDS.includes(entry.kind)) {
        errors.push(`supplementary immutable reference ${index} declares an unimplemented kind`);
      }
      if (typeof entry.compilerReferenceId !== "string" || entry.compilerReferenceId.length === 0) {
        errors.push(`supplementary immutable reference ${index} requires its compiler reference identity`);
      }
      const offset = entry.offset;
      const byteLength = entry.byteLength;
      if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
        errors.push(`supplementary immutable reference ${index} offset must be a safe non-negative integer`);
        continue;
      }
      if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength <= 0) {
        errors.push(`supplementary immutable reference ${index} byteLength must be a safe positive integer`);
        continue;
      }
      if (offset <= previousOffset) {
        errors.push("supplementary immutable references must be strictly ascending and unique");
      }
      previousOffset = offset;
      if (runtimeByteLength !== null && offset + byteLength > runtimeByteLength) {
        errors.push(`supplementary immutable reference ${index} exceeds the declared runtime length`);
      }
      /* F35 — two authenticated sides, and nothing else. There is no free replacement value. */
      for (const bytesField of ["expectedDeployedBytes", "expectedArtifactPlaceholderBytes"] as const) {
        const declared = entry[bytesField];
        if (typeof declared !== "string" || !new RegExp(`^0x[0-9a-f]{${byteLength * 2}}$`, "u").test(declared)) {
          errors.push(`supplementary immutable reference ${index} ${bytesField} must be exactly ${byteLength} bytes`);
        }
      }
      /* No overlap with a primary offset, the metadata trailer, or another reference. */
      for (const region of occupied) {
        if (offset < region.end && region.start < offset + byteLength) {
          errors.push(`supplementary immutable reference ${index} overlaps the ${region.label} region`);
        }
      }
      occupied.push({ start: offset, end: offset + byteLength, label: `supplementary:${index}` });
    }
  }
  return [...new Set(errors)].sort();
}

export function normalizationManifestDigest(manifest: unknown): string {
  return sha256(canonicalJson(manifest));
}

export type ManifestNormalizationResult = {
  ok: boolean;
  failures: string[];
  replacements: number;
  normalizedSha256: string;
};

/* Applies exactly the manifest's plan. No local constant participates. */
export function normalizeRuntimeBytecodeFromManifest(
  runtime: Buffer,
  manifest: NormalizationManifest,
  deploymentValues: { implementationAddress: string },
): ManifestNormalizationResult {
  const failures: string[] = [];
  /* IMPLEMENTATION-ADDRESS-RELATIVE. The compiler immutable in this build is
   * UUPSUpgradeable.__self, which holds the implementation's own address; normalizing against the
   * executor address would compare the wrong value entirely. */
  if (manifest.deploymentValueShape !== "LEFT_PADDED_IMPLEMENTATION_ADDRESS_WORD") {
    return {
      ok: false,
      failures: [`UNSUPPORTED_DEPLOYMENT_VALUE_SHAPE:${String(manifest.deploymentValueShape)}`],
      replacements: 0,
      normalizedSha256: sha256(runtime),
    };
  }
  const expectedWord = deploymentValueWord(deploymentValues.implementationAddress);
  if (expectedWord === null || expectedWord.length !== manifest.wordByteLength) {
    return {
      ok: false,
      failures: ["DEPLOYMENT_VALUE_LENGTH_MISMATCH"],
      replacements: 0,
      normalizedSha256: sha256(runtime),
    };
  }
  const deployedWordHex = expectedWord.toString("hex");

  if (runtime.length !== manifest.runtimeByteLength) {
    failures.push(`LENGTH_MISMATCH:${runtime.length}!=${manifest.runtimeByteLength}`);
  }

  /* Metadata is validated against the manifest's declared structure, not the fixture's. */
  let metadata: MetadataInspection | null = null;
  try {
    metadata = inspectMetadataTrailer(runtime);
  } catch {
    failures.push("UNRECOGNIZED_METADATA:unreadable");
  }
  if (metadata) {
    /* Only the solc-only structure is accepted, and it is verified exactly: no source hash, the
     * declared compiler version, the declared trailer length and the declared trailer digest. */
    if (metadata.carriesSourceHash) failures.push("UNRECOGNIZED_METADATA:structure=withSourceHash");
    if (!metadata.valid) failures.push("UNRECOGNIZED_METADATA:invalid");
    if (metadata.solcVersion !== manifest.compilerVersion) {
      failures.push(`UNRECOGNIZED_METADATA:solc=${metadata.solcVersion}`);
    }
    const trailerLength = runtime.length - metadata.codeSectionLength;
    if (trailerLength !== manifest.metadataTrailerByteLength) {
      failures.push(`UNRECOGNIZED_METADATA:trailerLength=${trailerLength}`);
    } else {
      const trailerDigest = sha256(runtime.subarray(metadata.codeSectionLength));
      if (trailerDigest !== manifest.metadataTrailerSha256) failures.push("UNRECOGNIZED_METADATA:trailerDigest");
    }
  }

  const opcode = Number.parseInt(manifest.requiredPrecedingOpcode.slice(2), 16);
  const normalized = Buffer.from(runtime);
  const replacedOffsets: number[] = [];
  /* F35 — the primary references are typed and authenticated, exactly like the supplementary ones.
   * Each declares the artifact-side placeholder it corresponds to, so the replacement is provably
   * symmetric rather than a one-sided overwrite. */
  for (const reference of manifest.primaryImmutableReferences) {
    const offset = reference.offset;
    if (offset < 1 || offset + manifest.wordByteLength > runtime.length) {
      failures.push(`UNKNOWN_OFFSET:${offset}`);
      continue;
    }
    if (reference.byteLength !== manifest.wordByteLength) {
      failures.push(`PRIMARY_LENGTH_MISMATCH:${reference.id}`);
      continue;
    }
    if (runtime[offset - 1] !== opcode) {
      failures.push(`OPCODE_MISMATCH:${offset}`);
      continue;
    }
    /* The deployed side must be the implementation address in a left-padded word. */
    const found = runtime.subarray(offset, offset + manifest.wordByteLength).toString("hex");
    if (found !== deployedWordHex) {
      failures.push(`MISSING_REPLACEMENT:${offset}:${found}`);
      continue;
    }
    /* The artifact side must be a same-width placeholder; a shorter or longer one would mean the
     * two sides were never comparable at this offset. */
    const placeholder = reference.expectedArtifactPlaceholderBytes.toLowerCase().replace(/^0x/u, "");
    if (placeholder.length !== manifest.wordByteLength * 2 || !/^[0-9a-f]+$/u.test(placeholder)) {
      failures.push(`ARTIFACT_PLACEHOLDER_MISMATCH:${reference.id}`);
      continue;
    }
    /* CORRECTION 2 — write the EXACT authenticated artifact placeholder, byte for byte. A global
     * replacement byte would fill the range with one value, which reproduces a real placeholder
     * only when that placeholder happens to be one repeated byte. */
    Buffer.from(placeholder, "hex").copy(normalized, offset);
    replacedOffsets.push(offset);
  }

  for (const entry of manifest.supplementaryImmutableReferences) {
    if (entry.offset + entry.byteLength > runtime.length) {
      failures.push(`UNKNOWN_OFFSET:supplementary:${entry.offset}`);
      continue;
    }
    /* F28 — verify what is actually there before replacing it. Never normalize arbitrary bytes
     * merely because a range is listed: that would let a real difference be hidden. */
    const present = runtime.subarray(entry.offset, entry.offset + entry.byteLength).toString("hex");
    const expected = entry.expectedDeployedBytes.toLowerCase().replace(/^0x/u, "");
    if (present !== expected) {
      failures.push(`SUPPLEMENTARY_VALUE_MISMATCH:${entry.id}:${entry.offset}`);
      continue;
    }
    /* F35 — normalize to the AUTHENTICATED artifact placeholder, never to a free value the
     * record chose. Both sides therefore land on the same bytes, or neither does. */
    const placeholder = Buffer.from(entry.expectedArtifactPlaceholderBytes.replace(/^0x/u, ""), "hex");
    if (placeholder.length !== entry.byteLength) {
      failures.push(`ARTIFACT_PLACEHOLDER_MISMATCH:${entry.id}`);
      continue;
    }
    normalized.fill(placeholder, entry.offset, entry.offset + entry.byteLength);
  }

  /* Any occurrence of the deployment WORD outside the declared offsets means the manifest is
   * incomplete; normalizing it silently would hide a real difference.
   *
   * Note this scans for the full left-padded word, not for the bare address. The runtime also
   * contains PUSH20 occurrences of the configured executor address — ordinary compile-time
   * constants which carry no immutableReferences entry, are part of exact code identity, and must
   * never be normalized. Scanning for the word cannot match them. */
  const declared = new Set(manifest.primaryImmutableReferences.map((reference) => reference.offset));
  const hex = runtime.toString("hex");
  for (let index = hex.indexOf(deployedWordHex); index !== -1; index = hex.indexOf(deployedWordHex, index + 1)) {
    if (index % 2 !== 0) continue;
    if (!declared.has(index / 2)) failures.push(`EXTRA_REPLACEMENT:${index / 2}`);
  }

  if (replacedOffsets.length !== manifest.expectedReplacementCount) {
    failures.push(`MISSING_REPLACEMENT:count=${replacedOffsets.length}`);
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    replacements: replacedOffsets.length,
    normalizedSha256: sha256(normalized),
  };
}

/* ---------------------------------------------------------------------------------------------
 * F20 — the canonical authoritative pricing manifest.
 * ------------------------------------------------------------------------------------------- */

export type PricingManifest = {
  schema: string;
  version: number;
  provenanceSubject: string;
  /* F34 — one entry per exact variant, each carrying exactly one cost. */
  entries: {
    canonicalName: string;
    enforcementName: string;
    operandMode: string;
    operandTypes: string[];
    costKeyType: string;
    resultType: string;
    arity: number;
    cost: number;
    sourceReference: string;
  }[];
};

/* The digest a record pins for its pricing manifest, recomputed from the canonical serialization
 * so a manifest edited after review stops matching. */
export function pricingManifestDigest(manifest: unknown): string {
  return sha256(canonicalJson(manifest));
}

export function validatePricingManifest(manifest: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(manifest)) return ["pricing manifest must be an object"];
  const value = manifest;
  for (const field of PRICING_MANIFEST_FIELDS)
    if (!(field in value)) errors.push(`pricing manifest is missing ${field}`);
  for (const key of Object.keys(value)) {
    if (!PRICING_MANIFEST_FIELDS.includes(key)) errors.push(`pricing manifest has an unpermitted field ${key}`);
  }
  if (value.schema !== PRICING_MANIFEST_SCHEMA) errors.push("pricing manifest schema mismatch");
  if (value.version !== 1) errors.push("pricing manifest version mismatch");
  if (value.provenanceSubject !== "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE") {
    errors.push("pricing manifest must cite the current official operation price schedule");
  }
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    errors.push("pricing manifest entries must be a non-empty array");
    return [...new Set(errors)].sort();
  }

  /* F34 — one entry per VARIANT, and the variant identity must be unique. */
  const variantIds: string[] = [];
  const translation = new Map<string, string>();
  for (const [index, entry] of value.entries.entries()) {
    if (!isObject(entry)) {
      errors.push(`pricing entry ${index} must be an object`);
      continue;
    }
    for (const field of PRICING_ENTRY_FIELDS) {
      if (!(field in entry)) errors.push(`pricing entry ${index} is missing ${field}`);
    }
    /* Closed: an undeclared cost dimension smuggled in as an extra field could not be compared, so
     * it may not be permitted. */
    for (const key of Object.keys(entry)) {
      if (!PRICING_ENTRY_FIELDS.includes(key)) errors.push(`pricing entry ${index} has an unpermitted field ${key}`);
    }
    for (const field of ["canonicalName", "enforcementName", "sourceReference", "costKeyType", "resultType"] as const) {
      if (typeof entry[field] !== "string" || (entry[field] as string).length === 0) {
        errors.push(`pricing entry ${index} ${field} must be a non-empty string`);
      }
    }
    if (typeof entry.resultType === "string" && entry.resultType.includes("|")) {
      errors.push(`pricing entry ${index} resultType must be a single type, not a compound description`);
    }
    if (typeof entry.operandMode !== "string" || !OPERAND_MODES.includes(entry.operandMode)) {
      errors.push(`pricing entry ${index} declares an unknown operand mode`);
    }
    if (!Array.isArray(entry.operandTypes)) {
      errors.push(`pricing entry ${index} operandTypes must be an array`);
    } else if (entry.operandTypes.some((type) => typeof type !== "string" || type.length === 0)) {
      errors.push(`pricing entry ${index} operandTypes must be non-empty type names`);
    } else if (typeof entry.arity === "number" && entry.operandTypes.length !== entry.arity) {
      errors.push(`pricing entry ${index} arity disagrees with its operand type list`);
    }
    if (typeof entry.arity !== "number" || !Number.isInteger(entry.arity) || entry.arity < 0) {
      errors.push(`pricing entry ${index} arity must be a non-negative integer`);
    }
    /* F34 — a cost that is not a safe integer cannot be compared exactly. */
    if (
      typeof entry.cost !== "number" ||
      !Number.isInteger(entry.cost) ||
      entry.cost < 0 ||
      !Number.isSafeInteger(entry.cost)
    ) {
      errors.push(`pricing entry ${index} cost must be a safe non-negative integer`);
    }
    if (typeof entry.canonicalName === "string" && typeof entry.enforcementName === "string") {
      const known = translation.get(entry.canonicalName);
      if (known !== undefined && known !== entry.enforcementName) {
        errors.push(`pricing manifest gives ${entry.canonicalName} two different enforcement names`);
      }
      translation.set(entry.canonicalName, entry.enforcementName);
    }
    if (
      typeof entry.canonicalName === "string" &&
      typeof entry.operandMode === "string" &&
      typeof entry.costKeyType === "string"
    ) {
      const id = `${entry.canonicalName}.${entry.operandMode}.${entry.costKeyType}`;
      if (variantIds.includes(id)) errors.push(`pricing manifest duplicates the variant ${id}`);
      variantIds.push(id);
    }
  }

  /* The enforcement -> canonical translation must remain injective. */
  const seenEnforcement = new Map<string, string>();
  for (const [canonical, enforcement] of translation) {
    const previous = seenEnforcement.get(enforcement);
    if (previous !== undefined && previous !== canonical) {
      errors.push(`pricing manifest translation is not injective on ${enforcement}`);
    }
    seenEnforcement.set(enforcement, canonical);
  }

  /* F34 — canonical entry ordering, so two manifests of one schedule serialize identically. */
  const ordered = [...variantIds].sort();
  if (JSON.stringify(ordered) !== JSON.stringify(variantIds)) {
    errors.push("pricing manifest entries must be in canonical variant order");
  }
  return [...new Set(errors)].sort();
}

export type PricingComparison = {
  /* Exact variant identities, not operation names. */
  usedVariants: string[];
  missingFromManifest: string[];
  missingFromCalculator: string[];
  costMismatches: string[];
  operandMismatches: string[];
  operandTypeMismatches: string[];
  arityMismatches: string[];
  resultTypeMismatches: string[];
  translationMismatches: string[];
  officialOnlyUnusedBySg4: string[];
};

export function variantId(variant: { canonicalOperation: string; operandMode: string; costKeyType: string }): string {
  return `${variant.canonicalOperation}.${variant.operandMode}.${variant.costKeyType}`;
}

/* F27 — compatibility over the EXACT SG-4 used-variant closure.
 *
 * Operation names are not variants: SG-4 uses scalar AND non-scalar FheLt, two select widths and
 * three TrivialEncrypt result types. Each used variant must be priced by the authoritative schedule
 * AND by the installed calculator, with matching cost, operand mode, arity, result type and an
 * exact injective canonical/enforcement translation. Official variants SG-4 does not use are
 * reported separately and never block. */
export function compareCalculatorAgainstPricingManifest(
  installed: CostTable,
  manifest: PricingManifest,
  closure: readonly {
    canonicalOperation: string;
    enforcementOperation: string;
    operandMode: string;
    costKeyType: string;
    operandTypes: readonly string[];
    resultType: string;
    arity: number;
  }[] = SG4_PRICING_VARIANT_CLOSURE,
): PricingComparison {
  const byVariant = new Map(
    manifest.entries.map((entry) => [`${entry.canonicalName}.${entry.operandMode}.${entry.costKeyType}`, entry]),
  );
  const missingFromManifest: string[] = [];
  const missingFromCalculator: string[] = [];
  const costMismatches: string[] = [];
  const operandMismatches: string[] = [];
  const operandTypeMismatches: string[] = [];
  const arityMismatches: string[] = [];
  const resultTypeMismatches: string[] = [];
  const translationMismatches: string[] = [];
  const usedVariants: string[] = [];
  const usedManifestVariants = new Set<string>();

  for (const variant of closure) {
    const id = variantId(variant);
    usedVariants.push(id);
    const authoritative = byVariant.get(id);
    if (!authoritative) {
      /* The variant may exist under the same operation but a different mode; report that
       * specifically, because "the price is missing" and "the mode is missing" are different
       * defects with different remedies. */
      const sameOperation = manifest.entries.some((entry) => entry.canonicalName === variant.canonicalOperation);
      if (sameOperation) operandMismatches.push(`${id}:variant_absent_from_authoritative_schedule`);
      else missingFromManifest.push(id);
      continue;
    }
    usedManifestVariants.add(id);
    if (authoritative.enforcementName !== variant.enforcementOperation) {
      translationMismatches.push(`${id}:${authoritative.enforcementName}!=${variant.enforcementOperation}`);
    }
    if (authoritative.arity !== variant.arity) {
      arityMismatches.push(`${id}:${authoritative.arity}!=${variant.arity}`);
    }
    /* F34 — the REAL result type, not "the cost key appears somewhere in a list of result types". */
    if (authoritative.resultType !== variant.resultType) {
      resultTypeMismatches.push(`${id}:${authoritative.resultType}!=${variant.resultType}`);
    }
    if (JSON.stringify(authoritative.operandTypes) !== JSON.stringify([...variant.operandTypes])) {
      operandTypeMismatches.push(
        `${id}:[${authoritative.operandTypes.join(",")}]!=[${[...variant.operandTypes].join(",")}]`,
      );
    }
    const installedGroups = installed.get(variant.canonicalOperation);
    const installedCost = installedGroups?.get(variant.operandMode as CostGroup)?.get(variant.costKeyType);
    if (installedCost === undefined) {
      missingFromCalculator.push(id);
      continue;
    }
    if (installedCost !== authoritative.cost) {
      costMismatches.push(`${id}:${installedCost}!=${authoritative.cost}`);
    }
  }

  /* Every authoritative variant the closure does not use. Reported, never blocking. */
  const officialOnlyUnusedBySg4: string[] = [];
  for (const entry of manifest.entries) {
    const id = `${entry.canonicalName}.${entry.operandMode}.${entry.costKeyType}`;
    if (!usedManifestVariants.has(id)) officialOnlyUnusedBySg4.push(id);
  }

  return {
    usedVariants: usedVariants.sort(),
    missingFromManifest: [...new Set(missingFromManifest)].sort(),
    missingFromCalculator: [...new Set(missingFromCalculator)].sort(),
    costMismatches: costMismatches.sort(),
    operandMismatches: operandMismatches.sort(),
    operandTypeMismatches: operandTypeMismatches.sort(),
    arityMismatches: arityMismatches.sort(),
    resultTypeMismatches: resultTypeMismatches.sort(),
    translationMismatches: translationMismatches.sort(),
    officialOnlyUnusedBySg4: officialOnlyUnusedBySg4.sort(),
  };
}

/* Every blocking finding of the comparison, as one list. */
export function pricingComparisonBlockers(comparison: PricingComparison): string[] {
  return [
    ...comparison.missingFromManifest.map((entry) => `MISSING_AUTHORITATIVE_PRICE:${entry}`),
    ...comparison.missingFromCalculator.map((entry) => `MISSING_CALCULATOR_PRICE:${entry}`),
    ...comparison.costMismatches.map((entry) => `COST_MISMATCH:${entry}`),
    ...comparison.operandMismatches.map((entry) => `OPERAND_MISMATCH:${entry}`),
    ...comparison.operandTypeMismatches.map((entry) => `OPERAND_TYPE_MISMATCH:${entry}`),
    ...comparison.arityMismatches.map((entry) => `ARITY_MISMATCH:${entry}`),
    ...comparison.resultTypeMismatches.map((entry) => `RESULT_TYPE_MISMATCH:${entry}`),
    ...comparison.translationMismatches.map((entry) => `TRANSLATION_MISMATCH:${entry}`),
  ].sort();
}

/* ---------------------------------------------------------------------------------------------
 * F23 — minimal ABI encoding/decoding for caller-applicability getters. No signer, no provider.
 * ------------------------------------------------------------------------------------------- */

export function encodeAbiArguments(types: readonly string[], values: readonly unknown[]): string {
  if (types.length !== values.length) throw new Error("ABI encoding: argument count mismatch");
  let encoded = "";
  for (const [index, type] of types.entries()) {
    const value = values[index];
    if (type === "address") {
      if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(value)) {
        throw new Error("ABI encoding: malformed address argument");
      }
      encoded += value.toLowerCase().replace(/^0x/u, "").padStart(64, "0");
    } else if (type === "uint256") {
      if (typeof value !== "string" || !/^[0-9]+$/u.test(value)) {
        throw new Error("ABI encoding: uint256 argument must be a decimal string");
      }
      encoded += BigInt(value).toString(16).padStart(64, "0");
    } else if (type === "bool") {
      if (typeof value !== "boolean") throw new Error("ABI encoding: bool argument must be a boolean");
      encoded += (value ? 1 : 0).toString(16).padStart(64, "0");
    } else {
      throw new Error(`ABI encoding: unsupported argument type ${type}`);
    }
  }
  return encoded;
}

/* Decodes strictly to the DECLARED return type, enforcing canonical encoding. */
export function decodeAbiReturn(type: string, returnData: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof returnData !== "string") return { ok: false };
  const hex = returnData.toLowerCase().replace(/^0x/u, "");
  if (hex.length !== 64 || !/^[0-9a-f]{64}$/u.test(hex)) return { ok: false };
  if (type === "bool") {
    if (/^0{63}[01]$/u.test(hex)) return { ok: true, value: hex.endsWith("1") };
    return { ok: false };
  }
  if (type === "address") {
    if (!/^0{24}/u.test(hex)) return { ok: false };
    return { ok: true, value: `0x${hex.slice(24)}` };
  }
  if (type === "uint256") return { ok: true, value: BigInt(`0x${hex}`).toString(10) };
  return { ok: false };
}

export function readInstalledRuntimeBytecode(artifactJson: string): Buffer {
  const artifact = JSON.parse(artifactJson) as { deployedBytecode: string | { object: string } };
  const raw =
    typeof artifact.deployedBytecode === "string" ? artifact.deployedBytecode : artifact.deployedBytecode.object;
  return Buffer.from(raw.toLowerCase().replace(/^0x/u, ""), "hex");
}

/* ---------------------------------------------------------------------------------------------
 * Manifest, lockfile, and stale-constant guards.
 * ------------------------------------------------------------------------------------------- */

export type PinCheck = { ok: boolean; reason: string | null; specifier: string | null };

export function checkDirectPin(manifestJson: string): PinCheck {
  const manifest = JSON.parse(manifestJson) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const direct = manifest.devDependencies?.[AUTHORITY_ROOT.package] ?? manifest.dependencies?.[AUTHORITY_ROOT.package];
  if (direct === undefined) return { ok: false, reason: "MISSING_DIRECT_PIN", specifier: null };
  if (/^[\^~><=*]|\s|\|\|/u.test(direct)) return { ok: false, reason: "RANGE_SPECIFIER_REJECTED", specifier: direct };
  if (direct !== AUTHORITY_ROOT.version) return { ok: false, reason: "VERSION_DRIFT", specifier: direct };
  return { ok: true, reason: null, specifier: direct };
}

export function checkLockfilePin(lockfile: string): PinCheck {
  const importer = new RegExp(
    `'${AUTHORITY_ROOT.package}':\\s*\\n\\s*specifier: ([^\\n]+)\\n\\s*version: ([^\\n]+)`,
    "u",
  ).exec(lockfile);
  if (!importer) return { ok: false, reason: "MISSING_LOCKFILE_IMPORTER_ENTRY", specifier: null };
  const [, specifier, version] = importer;
  if (specifier.trim() !== AUTHORITY_ROOT.version || version.trim() !== AUTHORITY_ROOT.version) {
    return { ok: false, reason: "LOCKFILE_DRIFT", specifier: specifier.trim() };
  }
  if (!lockfile.includes(AUTHORITY_ROOT.integrity)) {
    return { ok: false, reason: "INTEGRITY_MISMATCH", specifier: specifier.trim() };
  }
  return { ok: true, reason: null, specifier: specifier.trim() };
}

export type StaleGuardResult = {
  ok: boolean;
  offenders: string[];
  registeredAddress: string;
  scannedPaths: string[];
  missingScopePaths: string[];
};

/* SG-4 code must never import, alias, or embed the plugin's hardcoded HCULimit constants.
 *
 * The guard is not a substring scan for one address. It covers the complete SG-4 changed and
 * runtime source scope, detects symbol and import use as well as either literal address value, and
 * permits the registered values only inside the guard's own definition and its tests. */
export function checkStaleAddressUsage(
  files: readonly { path: string; content: string }[],
  scope: readonly string[] = SG4_GUARDED_SOURCE_SCOPE,
): StaleGuardResult {
  const staleSepolia = STALE_PLUGIN_HCU_LIMIT.sepoliaValue.toLowerCase();
  const staleMainnet = STALE_PLUGIN_HCU_LIMIT.mainnetValue.toLowerCase();
  const offenders: string[] = [];
  const scannedPaths: string[] = [];

  const normalize = (path: string): string => path.replace(/\\/gu, "/").replace(/^\.\//u, "");

  for (const file of files) {
    const path = normalize(file.path);
    scannedPaths.push(path);
    const isDefinitionFile = SG4_STALE_GUARD_DEFINITION_FILES.includes(path);
    const lowered = file.content.toLowerCase();

    if (!isDefinitionFile) {
      if (lowered.includes(staleSepolia)) offenders.push(`${path}:STALE_SEPOLIA_ADDRESS_LITERAL`);
      if (lowered.includes(staleMainnet)) offenders.push(`${path}:STALE_MAINNET_ADDRESS_LITERAL`);
      for (const entry of SG4_STALE_AUTHORITY_SYMBOL_PATTERNS) {
        if (new RegExp(entry.pattern, "u").test(file.content)) offenders.push(`${path}:SYMBOL:${entry.id}`);
      }
    }

    /* Even the definition files may not import the plugin's constants module: registering a value
     * is a literal, importing the module is a live dependency on the stale authority. */
    if (/from\s+["'][^"']*@fhevm\/hardhat-plugin[^"']*constants["']/u.test(file.content)) {
      offenders.push(`${path}:IMPORT:@fhevm/hardhat-plugin constants`);
    }
    if (/require\(\s*["'][^"']*@fhevm\/hardhat-plugin[^"']*constants["']\s*\)/u.test(file.content)) {
      offenders.push(`${path}:REQUIRE:@fhevm/hardhat-plugin constants`);
    }
    /* An alias that routes a plugin HCULimit constant into an authority position. */
    if (/HCULimit(?:Address)?\s*(?:as|:)\s*(?:authority|AUTHORITY)/u.test(file.content)) {
      offenders.push(`${path}:ALIASED_AS_AUTHORITY`);
    }
  }

  /* A file that is in scope but was not presented for scanning is itself a failure: silently
   * shrinking the scope is how a scan stops proving anything. */
  const missingScopePaths = scope.filter((path) => !scannedPaths.includes(path)).sort();
  for (const path of missingScopePaths) offenders.push(`${path}:NOT_SCANNED`);

  return {
    ok: offenders.length === 0,
    offenders: [...new Set(offenders)].sort(),
    registeredAddress: staleSepolia,
    scannedPaths: scannedPaths.sort(),
    missingScopePaths,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Offline preflight.
 * ------------------------------------------------------------------------------------------- */

export type Check = { id: string; status: "PASS" | "FAIL"; detail: string };

function check(id: string, condition: boolean, detail: string): Check {
  return { id, status: condition ? "PASS" : "FAIL", detail };
}

export function gitValue(...args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
    maxBuffer: 4 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout.trim() : "UNRESOLVED";
}

export function runOfflinePreflight(): { schema: string; mode: string; verdict: string; checks: Check[] } {
  const checks: Check[] = [];

  /* Repository identity. */
  const topLevel = gitValue("rev-parse", "--show-toplevel");
  checks.push(check("REPOSITORY_IDENTITY", topLevel === ROOT, topLevel));
  const branch = gitValue("branch", "--show-current");
  checks.push(check("BRANCH_MAIN", branch === "main", branch));

  /* Deterministic protocol digests. */
  const sg4Digest = sha256(serializeProtocol());
  checks.push(check("SG4_BENCHMARK_PROTOCOL_DIGEST", sg4Digest === EXPECTED_SG4_PROTOCOL_SHA256, sg4Digest));
  const authorityDigest = sha256(serializeAuthorityProtocol());
  checks.push(
    check("SG4_HCU_AUTHORITY_PROTOCOL_DIGEST", authorityDigest === EXPECTED_AUTHORITY_PROTOCOL_SHA256, authorityDigest),
  );

  /* Authority root: manifest, lockfile, installed package. */
  const manifestJson = readFileSync(join(ROOT, "package.json"), "utf8");
  const directPin = checkDirectPin(manifestJson);
  checks.push(check("AUTHORITY_ROOT_DIRECT_PIN", directPin.ok, directPin.reason ?? `exact ${directPin.specifier}`));

  const lockPin = checkLockfilePin(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));
  checks.push(check("AUTHORITY_ROOT_LOCKFILE_PIN", lockPin.ok, lockPin.reason ?? `locked ${lockPin.specifier}`));

  let installedVersion = "UNRESOLVED";
  try {
    installedVersion = (JSON.parse(readFileSync(join(HOST_CONTRACTS, "package.json"), "utf8")) as { version: string })
      .version;
  } catch {
    installedVersion = "NOT_RESOLVABLE_FROM_ROOT";
  }
  checks.push(
    check(
      "AUTHORITY_ROOT_INSTALLED_VERSION",
      installedVersion === AUTHORITY_ROOT.version,
      `installed ${installedVersion}`,
    ),
  );

  /* Installed file hashes. */
  const hashFailures: string[] = [];
  for (const [label, path] of Object.entries(SOURCE_FILES)) {
    const expected = (EXPECTED_SOURCE_HASHES as Record<string, string>)[label];
    let actual = "UNREADABLE";
    try {
      actual = sha256(readFileSync(path));
    } catch {
      actual = "UNREADABLE";
    }
    if (actual !== expected) hashFailures.push(`${label}:${actual}`);
  }
  checks.push(check("INSTALLED_SOURCE_HASHES", hashFailures.length === 0, hashFailures.join(",") || "all match"));

  const calculatorHash = sha256(readFileSync(CALCULATOR_FILE));
  checks.push(check("CALCULATOR_HASH", calculatorHash === EXPECTED_CALCULATOR_HASH, calculatorHash));
  const costTableSource = readFileSync(COST_TABLE_FILE, "utf8");
  const costTableHash = sha256(readFileSync(COST_TABLE_FILE));
  checks.push(check("COST_TABLE_HASH", costTableHash === EXPECTED_COST_TABLE_HASH, costTableHash));

  /* Operation tables: parse both installed representations and compare. */
  const hcuLimitSource = readFileSync(SOURCE_FILES["@fhevm/host-contracts:contracts/HCULimit.sol"], "utf8");
  const installedTable = parseInstalledCostTable(costTableSource);
  const authorityTable = parseAuthorityCostTable(hcuLimitSource);
  const comparison = compareOperationTables(installedTable, authorityTable);

  checks.push(
    check(
      "INSTALLED_TABLE_MATCHES_COMMITTED_SET",
      JSON.stringify([...installedTable.keys()].sort()) === JSON.stringify([...EXPECTED_INSTALLED_OPERATIONS]),
      `${installedTable.size} operations`,
    ),
  );
  checks.push(
    check(
      "AUTHORITY_TABLE_MATCHES_COMMITTED_SET",
      JSON.stringify([...authorityTable.keys()].sort()) === JSON.stringify([...EXPECTED_AUTHORITY_OPERATIONS]),
      `${authorityTable.size} operations`,
    ),
  );
  checks.push(check("TABLE_TRANSLATION_UNAMBIGUOUS", !comparison.ambiguousTranslation, "injective"));
  checks.push(
    check(
      "TABLE_SET_SYMMETRY",
      comparison.installedOnly.length === 0 && comparison.authorityOnly.length === 0,
      `installedOnly=[${comparison.installedOnly}] authorityOnly=[${comparison.authorityOnly}]`,
    ),
  );
  checks.push(
    check(
      "TABLE_COST_AGREEMENT",
      comparison.costMismatches.length === 0,
      comparison.costMismatches.join(",") || "zero cost differences",
    ),
  );
  checks.push(
    check(
      "TABLE_OPERAND_AGREEMENT",
      comparison.operandMismatches.length === 0,
      comparison.operandMismatches.join(",") || "operand dimensions agree",
    ),
  );

  /* Executor events must not introduce an operation the calculator cannot price. */
  const eventNames = parseExecutorEventNames(
    readFileSync(SOURCE_FILES["@fhevm/mock-utils:fhevm/coprocessor/CoprocessorEvents.ts"], "utf8"),
  );
  const unknownEvents = eventNames.filter((name) => !installedTable.has(name));
  checks.push(check("NO_UNKNOWN_EXECUTOR_EVENT", unknownEvents.length === 0, unknownEvents.join(",") || "all priced"));

  /* Unsupported operations must be absent everywhere. */
  const guardHits = UNSUPPORTED_OPERATION_GUARD.filter(
    (name) => installedTable.has(name) || authorityTable.has(name) || eventNames.includes(name),
  );
  checks.push(
    check(
      "UNSUPPORTED_OPERATIONS_ABSENT",
      guardHits.length === 0,
      guardHits.join(",") || UNSUPPORTED_OPERATION_GUARD.join("/"),
    ),
  );

  /* SG-4 coverage: every harness operation resolves to a priced authority operation. */
  const priced = new Set([...authorityTable.keys()].map((name) => OPERATION_NAME_TRANSLATIONS[name] ?? name));
  const uncovered = SG4_CANONICAL_OPERATION_VARIANTS.filter((entry) => !priced.has(entry.canonicalOperation)).map(
    (entry) => entry.canonicalOperation,
  );
  checks.push(check("SG4_OPERATION_COVERAGE_COMPLETE", uncovered.length === 0, uncovered.join(",") || "complete"));

  /* Two independent controls, established from executable code. */
  const limits = extractLimits(hcuLimitSource);
  checks.push(
    check(
      "TWO_INDEPENDENT_CONTROLS",
      limits.totalLimit === TRANSACTION_TOTAL_HCU_LIMIT &&
        limits.depthLimit === TRANSACTION_DEPTH_HCU_LIMIT &&
        limits.totalEnforced &&
        limits.depthEnforced,
      `total=${limits.totalLimit} depth=${limits.depthLimit}`,
    ),
  );
  checks.push(
    check(
      "DEPTH_SCOPE_FROM_CODE_NOT_COMMENT",
      limits.depthScope === "PER_TRANSACTION" && limits.depthUsesTransientStorage,
      `docstringClaimsPerBlock=${limits.depthDocstringClaimsPerBlock} scope=${limits.depthScope}`,
    ),
  );

  /* The narrow constant scan is exercised only to record that it is not a basis for absence. */
  const limitConstants = enumerateLimitConstants(hcuLimitSource);
  const surface = enumerateAuthoritySurface(hcuLimitSource);
  checks.push(
    check(
      "NARROW_CONSTANT_SCAN_IS_NOT_AN_ABSENCE_PROOF",
      NARROW_CONSTANT_SCAN_IS_NOT_EXHAUSTIVE && surface.declarations.length > limitConstants.length,
      `narrow scan sees ${limitConstants.length} declarations, exhaustive enumeration sees ${surface.declarations.length}`,
    ),
  );
  checks.push(
    check(
      "AUTHORITY_SURFACE_ENUMERATION_COMPLETE",
      surface.enumerationComplete && surface.contractName === "HCULimit",
      surface.enumerationComplete
        ? `${surface.declarations.length} declarations, ${surface.callableFunctions.length} callable, ${surface.errors.length} errors, ${surface.mappings.length} mappings, ${surface.structFields.length} struct fields`
        : surface.parseFailures.join(" | "),
    ),
  );
  /* Offline, absence is unavailable: the deployed implementation has not been identified. */
  const offlineBlockOrBatch = classifyBlockOrBatchControl({
    surface,
    codeIdentityVerified: false,
    implementationIdentity: "NOT_YET_IDENTIFIED_PENDING_LIVE_CODE_IDENTITY",
  });
  checks.push(
    check(
      "BLOCK_OR_BATCH_UNRESOLVED_WITHOUT_LIVE_CODE_IDENTITY",
      offlineBlockOrBatch.authorityState === "UNRESOLVED" && offlineBlockOrBatch.blocking,
      `${offlineBlockOrBatch.authorityState}, blocking=${offlineBlockOrBatch.blocking}`,
    ),
  );

  /* Exclusive threshold rules, verified behaviourally. */
  const exclusive =
    evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD - 1n).pass &&
    !evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD).pass &&
    !evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD + 1n).pass &&
    evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD - 1n).pass &&
    !evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD).pass &&
    !evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD + 1n).pass;
  checks.push(check("EXCLUSIVE_SAFETY_BOUNDS", exclusive, "equality at either boundary is NO_GO"));
  checks.push(
    check(
      "BOTH_METRICS_REQUIRED",
      evaluateCombinedHcu({ globalHCU: 1n }).verdict === "NO_GO" &&
        evaluateCombinedHcu({ maxHCUDepth: 1n }).verdict === "NO_GO" &&
        evaluateCombinedHcu({ globalHCU: 1n, maxHCUDepth: 1n }).verdict === "GO",
      "neither metric may substitute for the other",
    ),
  );

  /* Authority state machine. */
  const protocol = deriveAuthorityProtocol();
  const controls = protocol.applicableLimitStateMachine.controls;
  checks.push(
    check(
      "BLOCK_OR_BATCH_STATE_EXPLICIT",
      controls.some(
        (control) =>
          control.metricId === "BLOCK_OR_BATCH_HCU" &&
          control.authorityState === "UNRESOLVED" &&
          control.value === null &&
          control.blocking,
      ),
      "unresolved and blocking, no bare null",
    ),
  );
  checks.push(
    check(
      "NO_UNRESOLVED_TREATED_AS_ABSENT",
      controls.every((control) => control.blocking === controlIsBlocking(control.authorityState)),
      "unresolved and unbound local expectations both remain blocking",
    ),
  );
  checks.push(
    check(
      "NO_CONTROL_CLAIMS_A_LIVE_BINDING_OFFLINE",
      controls.every((control) => control.liveDeploymentBinding === "PENDING_LIVE_DEPLOYMENT_BINDING"),
      "offline preparation binds nothing to a deployment",
    ),
  );

  /* The version/schedule discrepancy and the missing immutable provenance both block. */
  checks.push(
    check(
      "OPERATION_SCHEDULE_AUTHORITY_UNRESOLVED_AND_BLOCKING",
      protocol.scheduleAuthority.state === "UNRESOLVED" &&
        protocol.scheduleAuthority.blocking &&
        protocol.scheduleAuthority.resolvedByChoosingTheLocalPackage === false,
      `local=${protocol.scheduleAuthority.localPackageSchedule.operationCount} expectedOfficial=${protocol.scheduleAuthority.previouslyIdentifiedCurrentOfficialScheduleExpectation.operationCount}`,
    ),
  );
  checks.push(
    check(
      "IMMUTABLE_PROVENANCE_PENDING_REVERIFICATION_AND_BLOCKING",
      String(protocol.provenance.state) !== "RESOLVED" &&
        protocol.provenance.blocking &&
        protocol.provenance.isAControl &&
        protocol.provenance.recordedFromPriorReview &&
        !protocol.provenance.independentlyReverified,
      "prior-reviewed tuples recorded; unreverified provenance blocks a live PASS",
    ),
  );
  checks.push(
    check(
      "BENCHMARK_GATE_RECORDS_EVERY_CURRENT_BLOCKER",
      protocol.benchmarkExecutionGate.currentlyBlockedBy.length >= 5 &&
        !protocol.benchmarkExecutionGate.permanentBenchmarkExecutionAllowed,
      protocol.benchmarkExecutionGate.currentlyBlockedBy.join("; "),
    ),
  );

  /* Bytecode normalization self-test against the pinned artifact. */
  const runtime = readInstalledRuntimeBytecode(
    readFileSync(SOURCE_FILES["@fhevm/host-contracts:artifacts/contracts/HCULimit.sol/HCULimit.json"], "utf8"),
  );
  checks.push(check("ARTIFACT_RUNTIME_SHA256", sha256(runtime) === EXPECTED_RUNTIME_SHA256, sha256(runtime)));
  const metadata = inspectMetadataTrailer(runtime);
  checks.push(
    check(
      "ARTIFACT_METADATA_STRUCTURE",
      metadata.valid &&
        metadata.solcVersion === EXPECTED_METADATA.solcVersion &&
        BigInt(metadata.codeSectionLength) === EXPECTED_CODE_SECTION_BYTE_LENGTH,
      `solc=${metadata.solcVersion} code=${metadata.codeSectionLength}`,
    ),
  );
  const normalization = normalizeRuntimeBytecode(
    runtime,
    protocol.bytecodeVerification.artifactEmbeddedExecutorAddress,
  );
  checks.push(
    check(
      "NORMALIZATION_SELFTEST",
      normalization.ok &&
        normalization.replacements === EXECUTOR_IMMEDIATE_COUNT &&
        normalization.normalizedSha256 === EXPECTED_NORMALIZED_RUNTIME_SHA256,
      `${normalization.replacements} replacements, ${normalization.failures.join(",") || "no failures"}`,
    ),
  );

  /* Stale HCULimit constant must be registered and unused across the complete SG-4 scope. */
  const sg4Sources = SG4_GUARDED_SOURCE_SCOPE.map((relative) => ({
    path: relative,
    content: readFileSync(join(ROOT, relative), "utf8"),
  }));
  const staleGuard = checkStaleAddressUsage(sg4Sources);
  checks.push(
    check(
      "STALE_HCU_LIMIT_CONSTANT_UNUSED",
      staleGuard.ok,
      staleGuard.offenders.join(",") || `not used across ${staleGuard.scannedPaths.length} scoped files`,
    ),
  );
  checks.push(
    check(
      "STALE_GUARD_SCOPE_COMPLETE",
      staleGuard.missingScopePaths.length === 0 && staleGuard.scannedPaths.length === SG4_GUARDED_SOURCE_SCOPE.length,
      staleGuard.missingScopePaths.join(",") ||
        `${staleGuard.scannedPaths.length} of ${SG4_GUARDED_SOURCE_SCOPE.length}`,
    ),
  );
  checks.push(
    check(
      "AUTHORITY_ADDRESS_NOT_TAKEN_FROM_PLUGIN",
      protocol.onChainCorroboration.staleConstantProhibition.mayBeUsedAsAuthority === false,
      `registered ${STALE_PLUGIN_HCU_LIMIT.sepoliaValue}`,
    ),
  );

  /* Live mode must remain prepared-only. */
  checks.push(
    check(
      "LIVE_MODE_NOT_EXECUTED",
      protocol.liveMode.status === "PREPARED_NOT_EXECUTED" &&
        protocol.liveMode.walletRequested === false &&
        protocol.liveMode.signingRequested === false &&
        protocol.liveMode.transactionSubmitted === false,
      "prepared, read-only, no wallet or signing path",
    ),
  );
  checks.push(
    check(
      "LIVE_MODE_CLEAN_WORKTREE_POLICY",
      protocol.liveMode.cleanWorktreeRequired === true &&
        protocol.liveMode.preparationLineage.cleanIndexRequired === true &&
        protocol.liveMode.preparationLineage.verifiedAt === "CLEAN_HEAD_B" &&
        protocol.liveMode.branchRequired === "main",
      "live mode requires branch main, a clean worktree and index, and a verified A->B lineage at HEAD B",
    ),
  );
  /* F39 — there is no static plan to check. The offline question is whether the GENERATOR only
   * ever emits read-only, pinned-block calls, so a reference record is planned and inspected. */
  const referencePlan = generateLiveCallPlan(offlinePlanReferenceRecord() as AuthorityBindingRecord);
  let planReadOnly = true;
  let planDetail = referencePlan.map((call) => `${call.callId}:${call.method}`).join(",");
  try {
    assertLiveCallPlanIsReadOnly(referencePlan);
  } catch (error) {
    planReadOnly = false;
    planDetail = error instanceof Error ? error.message : "plan is not read-only";
  }
  checks.push(check("LIVE_CALL_PLAN_READ_ONLY", planReadOnly, planDetail));
  checks.push(
    check(
      "LIVE_CALL_PLAN_ENFORCED_BY_TRANSPORT",
      LIVE_CALL_PLAN_POLICY.enforcedByTransport === true &&
        LIVE_CALL_PLAN_POLICY.exhaustionRequiredForPass === true &&
        LIVE_CALL_PLAN_POLICY.allowListRemainsIndependent === true,
      "the guarded transport consumes the generated plan and refuses any divergence",
    ),
  );
  checks.push(
    check(
      "ERC1967_RESOLUTION_MECHANISM_VALID",
      referencePlan.some(
        (call) => call.method === "eth_getStorageAt" && call.callId === "ERC1967_IMPLEMENTATION_SLOT",
      ) &&
        LIVE_RPC_ALLOWED_METHODS.includes("eth_getStorageAt") &&
        protocol.onChainCorroboration.erc1967Resolution.mechanism ===
          "ETH_GET_STORAGE_AT_EXACT_ERC1967_SLOT_AT_THE_PINNED_BLOCK",
      `slot ${ERC1967_IMPLEMENTATION_SLOT} read with eth_getStorageAt at the pinned block`,
    ),
  );
  /* Selectors are recomputed from their signatures, so a mistyped literal fails here. */
  let selectorDetail = "recomputed";
  let selectorsOk = true;
  try {
    for (const signature of Object.keys(READ_ONLY_SELECTORS) as (keyof typeof READ_ONLY_SELECTORS)[]) {
      selectorFor(signature);
    }
  } catch (error) {
    selectorsOk = false;
    selectorDetail = error instanceof Error ? error.message : "selector recomputation failed";
  }
  checks.push(check("READ_ONLY_SELECTORS_RECOMPUTED", selectorsOk, selectorDetail));
  /* The live path must be implemented rather than an unconditional refusal, and it must remain
   * unreachable without the exact acknowledgement. */
  checks.push(
    check(
      "LIVE_VERIFIER_IMPLEMENTED_NOT_A_REFUSAL",
      typeof runLiveAuthorityVerification === "function" &&
        runLiveAuthorityVerification.constructor.name === "AsyncFunction" &&
        EVIDENCE_WRITTEN_BY_THE_LIVE_VERIFIER === false &&
        /* An unconditional refusal would never reach the plan assertion or the transport. */
        !/is prepared but not authorized/u.test(runLiveAuthorityVerification.toString()),
      "implemented async verifier, acknowledgement-gated, writes no evidence",
    ),
  );
  /* F9 — the two-commit lineage replaces the unsatisfiable self-referential binding. */
  const lineage = checkPreparationLineage(createGitLineageProbe());
  checks.push(
    check(
      "PREPARATION_LINEAGE_BLOCKS_LIVE_RUN",
      lineage.result !== "VERIFIED" && lineage.blockers.includes("PREPARATION_BINDING_RECORD_ABSENT"),
      `${lineage.result}: ${lineage.blockers.join(",") || "none"}`,
    ),
  );
  checks.push(
    check(
      "PREPARATION_BINDING_IS_NOT_SELF_REFERENTIAL",
      PREPARATION_LINEAGE_MODEL.selfReferentialBindingRejected &&
        PREPARATION_LINEAGE_MODEL.model === "TWO_COMMIT_IMPLEMENTATION_THEN_AUTHORITY_BINDING" &&
        PREPARATION_LINEAGE_MODEL.bindingRecordMustNotContainItsOwnCommitOrTree &&
        PREPARATION_LINEAGE_MODEL.bindingCommitMustHaveExactlyOneParent &&
        !SG4_IMPLEMENTATION_PATHS.includes(BINDING_RECORD_PATH),
      `A then B, authority-binding record at ${BINDING_RECORD_PATH}`,
    ),
  );
  checks.push(
    check(
      "PREPARATION_BINDING_RECORD_ABSENT_AND_BLOCKING",
      PREPARATION_LINEAGE_MODEL.bindingRecordCreatedDuringThisPreparation === false &&
        !existsSync(join(ROOT, BINDING_RECORD_PATH)) &&
        protocol.liveMode.liveBindingAbsenceIsBlocking === true,
      "binding record not created during preparation; its absence blocks",
    ),
  );
  /* A lineage-only record — the rejected preparation-only shape — must not validate: it carries no
   * late-bound authority inputs, so accepting it would leave the gate unresolvable. */
  const preparationOnlyRecord = {
    schema: BINDING_RECORD_SCHEMA,
    recordVersion: BINDING_RECORD_VERSION,
    lineage: {
      implementationCommit: "a".repeat(40),
      implementationTree: "b".repeat(40),
      benchmarkProtocolSha256: EXPECTED_SG4_PROTOCOL_SHA256,
      authorityProtocolSha256: EXPECTED_AUTHORITY_PROTOCOL_SHA256,
      permittedBindingPath: BINDING_RECORD_PATH,
      bindingPurpose: "Bind the reviewed SG-4 implementation commit to a live authority verification.",
    },
  };
  const missingSections = Object.keys(AUTHORITY_BINDING_RECORD_SHAPE.sections).filter(
    (section) => section !== "lineage",
  );
  const preparationOnlyErrors = validateAuthorityBindingRecord(preparationOnlyRecord);
  checks.push(
    check(
      "BINDING_RECORD_VALIDATOR_REJECTS_PREPARATION_ONLY_SHAPE",
      preparationOnlyErrors.length > 0 &&
        missingSections.every((section) =>
          preparationOnlyErrors.some((error) => error.includes(`is missing ${section}`)),
        ) &&
        validateAuthorityBindingRecord({ ...preparationOnlyRecord, schema: "other" }).length > 0 &&
        validateAuthorityBindingRecord("not an object").length > 0,
      `lineage-only record rejected for ${missingSections.length} missing late-bound sections`,
    ),
  );

  /* F10 — network ceiling semantics recorded separately and unresolved. */
  checks.push(
    check(
      "NETWORK_LIMIT_SEMANTICS_UNRESOLVED_AND_SEPARATE",
      LIMIT_SEMANTICS_AUTHORITY.resolvedState === "UNRESOLVED" &&
        LIMIT_SEMANTICS_AUTHORITY.blocking &&
        LIMIT_SEMANTICS_AUTHORITY.localInstalled.semantics !==
          LIMIT_SEMANTICS_AUTHORITY.priorReviewedCurrentDeployment.semantics,
      `local ${LIMIT_SEMANTICS_AUTHORITY.localInstalled.comparisonOperator} vs prior-reviewed current ${LIMIT_SEMANTICS_AUTHORITY.priorReviewedCurrentDeployment.comparisonOperator}`,
    ),
  );
  checks.push(
    check(
      "INTERNAL_SAFETY_POLICY_INDEPENDENT_OF_NETWORK_SEMANTICS",
      LIMIT_SEMANTICS_AUTHORITY.internalSafetyPolicyIsIndependent &&
        LIMIT_SEMANTICS_AUTHORITY.internalSafetyComparisonRemainsStrict &&
        !evaluateSafety("globalHCU", TOTAL_SAFETY_THRESHOLD).pass &&
        !evaluateSafety("maxHCUDepth", DEPTH_SAFETY_THRESHOLD).pass,
      "equality at 15000000 / 3750000 stays NO-GO under either network semantics",
    ),
  );

  /* F11 — the prior-reviewed immutable tuples are recorded and still block. */
  checks.push(
    check(
      "IMMUTABLE_PROVENANCE_RECORDED_FROM_PRIOR_REVIEW",
      protocol.provenance.state === "EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION" &&
        protocol.provenance.required.length === 6 &&
        protocol.provenance.required.every((entry) => entry.repository !== null && entry.commit !== null) &&
        protocol.provenance.required.every((entry) => entry.reverified === false),
      `${protocol.provenance.required.length} subjects recorded, none reverified`,
    ),
  );

  /* F12 — the local fixture is a self-test target only. */
  checks.push(
    check(
      "LOCAL_FIXTURE_IS_NOT_CURRENT_DEPLOYMENT_AUTHORITY",
      ARTIFACT_IDENTITY_ROOTS.localInstalledFixture.mayBeSolePassHashForCurrentDeployment === false &&
        EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256 === null &&
        ARTIFACT_IDENTITY_ROOTS.currentOfficialArtifact.state === "UNRESOLVED",
      "local 0.10.0 normalized hash is a self-test target; deployed expectation is UNRESOLVED",
    ),
  );

  /* Exclusive safety comparison declarations, inspected as committed strings rather than only as
   * helper behaviour. */
  const benchmark = JSON.parse(serializeProtocol()) as {
    limits: { hcuMaximumFraction: { comparison: string }; hcuDepthMaximumFraction: { comparison: string } };
  };
  const totalComparison = benchmark.limits.hcuMaximumFraction.comparison;
  const depthComparison = benchmark.limits.hcuDepthMaximumFraction.comparison;
  checks.push(
    check(
      "EXCLUSIVE_COMPARISON_DECLARATIONS",
      totalComparison === "maxHcu*4 < authoritativeTransactionHcuCeiling*3" &&
        depthComparison === "maxHcuDepth*4 < authoritativeTransactionHcuDepthCeiling*3" &&
        !totalComparison.includes("<=") &&
        !depthComparison.includes("<="),
      `${totalComparison} ; ${depthComparison}`,
    ),
  );

  const failed = checks.filter((entry) => entry.status === "FAIL");
  return {
    schema: "zama-szn4.sg4-hcu-authority-preflight.v1",
    mode: "OFFLINE_PREFLIGHT",
    verdict: failed.length === 0 ? "PASS" : "BLOCKED",
    checks,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Live read-only authority verification — PREPARED, NOT EXECUTED.
 * ------------------------------------------------------------------------------------------- */

/* F39 — a planned call is exact. `targetRole` is resolved to an address at execution time (the
 * authority address is only known once it has been derived from the verified executor), and `data`
 * is the complete calldata the plan commits to issuing. */
export type LiveCall = {
  step: number;
  callId: string;
  method: string;
  targetRole: "AUTHORITY" | "AUTHORITY_IMPLEMENTATION" | "EXECUTOR" | "NONE";
  data: string | null;
  purpose: string;
  boundToPinnedBlock: boolean;
  /* INVARIANT H — the COMPLETE canonical request, not a description of one.
   *
   * `params` is the exact parameter vector, with two placeholders resolved at issue time because
   * neither is knowable when the plan is built: `$TARGET` becomes the target role's VERIFIED
   * address, and `$PINNED_BLOCK` becomes the block actually pinned. Everything else is literal.
   *
   * `callObjectKeys` closes the eth_call transaction object: a request carrying `from`, `gas`,
   * `value` or a state override is not the planned request, and comparing only `to` and `data`
   * would let those through. */
  params: readonly unknown[];
  parameterCount: number;
  callObjectKeys: readonly string[] | null;
  expectedResponse:
    | "ADDRESS_WORD"
    | "BLOCK_OR_NULL"
    | "CHAIN_ID_HEX"
    | "HEX_CODE"
    | "STORAGE_WORD"
    | "ABI_STRING"
    | "UINT256_WORD"
    | "ABI_BOOL";
};

/* The two placeholders a plan may carry. Both are resolved from VERIFIED state at issue time. */
export const PLAN_TARGET_PLACEHOLDER = "$TARGET";
export const PLAN_PINNED_BLOCK_PLACEHOLDER = "$PINNED_BLOCK";

/* The only keys a planned eth_call transaction object may carry. */
export const PERMITTED_CALL_OBJECT_KEYS: readonly string[] = ["data", "to"];

export class LiveCallPlanViolationError extends Error {
  constructor(public readonly detail: string) {
    super(`live call plan violated: ${detail}`);
    this.name = "LiveCallPlanViolationError";
  }
}

/* The record's declaration for one critical call, already validated against its canonical spec. */
export function interfaceCall(record: AuthorityBindingRecord, callId: string): Record<string, unknown> | null {
  const iface = record.onChainInterface as Record<string, unknown> | undefined;
  const manifest = isObject(iface?.interfaceManifest) ? (iface?.interfaceManifest as Record<string, unknown>) : null;
  const entries = Array.isArray(manifest?.entries) ? (manifest?.entries as Record<string, unknown>[]) : [];
  return entries.find((entry) => isObject(entry) && entry.callId === callId) ?? null;
}

/* Complete calldata for a declared interface call: recomputed selector plus encoded arguments.
 * Nothing is hard-coded here, so the manifest and execution cannot disagree. */
export function interfaceCalldata(entry: Record<string, unknown>): string {
  const signature = String(entry.signature);
  const selector = keccakSelector(signature);
  const types = Array.isArray(entry.argumentTypes) ? (entry.argumentTypes as string[]) : [];
  const values = Array.isArray(entry.argumentValues) ? (entry.argumentValues as unknown[]) : [];
  return types.length === 0 ? selector : `${selector}${encodeAbiArguments(types, values)}`;
}

/* F32 — the exact plan for a specific validated record. A fixed list cannot describe the real
 * sequence, because it depends on the authority deployment model and on how many applicability
 * subjects actually expose a getter. */
/* F39 — a shape-only reference used exclusively by the OFFLINE preflight to inspect what the plan
 * generator emits. It carries no authoritative fact, is never used by the live path, and its
 * signatures are the canonical ones the interface specs already fix. */
export function offlinePlanReferenceRecord(): Record<string, unknown> {
  const call = (callId: string, signature: string) => {
    const spec = INTERFACE_CALL_SPECS.find((candidate) => candidate.callId === callId);
    return {
      argumentTypes: [],
      argumentValues: [],
      callId,
      returnType: spec?.returnType ?? "uint256",
      selector: keccakSelector(signature),
      signature,
      targetRole: spec?.targetRole ?? "AUTHORITY",
    };
  };
  return {
    authority: { deploymentModel: "ERC1967_PROXY" },
    limits: {
      getterAvailability: {
        blockOrBatchCap: "UNRESOLVED",
        transactionDepth: "UNRESOLVED",
        transactionTotal: "UNRESOLVED",
      },
    },
    onChainInterface: {
      callerApplicability: [],
      interfaceManifest: {
        entries: [
          call("AUTHORITY_RECIPROCAL_EXECUTOR_GETTER", "getFHEVMExecutorAddress()"),
          call("AUTHORITY_VERSION", "getVersion()"),
          call("EXECUTOR_AUTHORITY_GETTER", "getHCULimitAddress()"),
          call("EXECUTOR_VERSION", "getVersion()"),
        ],
        provenanceSubject: "CURRENT_OFFICIAL_AUTHORITY_SOURCE",
        schema: INTERFACE_MANIFEST_SCHEMA,
        version: 1,
      },
      limitGetterSpecs: [],
    },
  };
}

export function generateLiveCallPlan(record: AuthorityBindingRecord): LiveCall[] {
  const authority = record.authority as Record<string, unknown>;
  const iface = record.onChainInterface as Record<string, unknown>;
  const limits = record.limits as Record<string, unknown>;
  const availability = (limits.getterAvailability ?? {}) as Record<string, unknown>;
  const declared = (callId: string): string | null => {
    const entry = interfaceCall(record, callId);
    if (entry === null) return null;
    try {
      return interfaceCalldata(entry);
    } catch {
      return null;
    }
  };

  /* Every planned call is built through these three helpers, so no call can be planned with an
   * incomplete request by accident. */
  const codeCall = (step: number, callId: string, role: LiveCall["targetRole"], purpose: string): LiveCall => ({
    step,
    callId,
    method: "eth_getCode",
    targetRole: role,
    data: null,
    purpose,
    boundToPinnedBlock: true,
    params: [PLAN_TARGET_PLACEHOLDER, PLAN_PINNED_BLOCK_PLACEHOLDER],
    parameterCount: 2,
    callObjectKeys: null,
    expectedResponse: "HEX_CODE",
  });
  const ethCall = (
    step: number,
    callId: string,
    role: LiveCall["targetRole"],
    data: string | null,
    purpose: string,
    expectedResponse: LiveCall["expectedResponse"],
  ): LiveCall => ({
    step,
    callId,
    method: "eth_call",
    targetRole: role,
    data,
    purpose,
    boundToPinnedBlock: true,
    /* The transaction object is CLOSED: exactly `to` and `data`, nothing else. */
    params: [{ to: PLAN_TARGET_PLACEHOLDER, data }, PLAN_PINNED_BLOCK_PLACEHOLDER],
    parameterCount: 2,
    callObjectKeys: [...PERMITTED_CALL_OBJECT_KEYS],
    expectedResponse,
  });

  const plan: LiveCall[] = [
    {
      step: 1,
      callId: "CHAIN_ID",
      method: "eth_chainId",
      targetRole: "NONE",
      data: null,
      purpose: "confirm chain 11155111",
      boundToPinnedBlock: false,
      params: [],
      parameterCount: 0,
      callObjectKeys: null,
      expectedResponse: "CHAIN_ID_HEX",
    },
    {
      step: 2,
      callId: "PINNED_BLOCK",
      method: "eth_getBlockByNumber",
      targetRole: "NONE",
      data: null,
      purpose: "pin one finalized block",
      boundToPinnedBlock: false,
      /* The exact static parameter vector: the finalized tag, and no transaction bodies. */
      params: [PINNED_BLOCK_FINALITY_POLICY.blockTag, false],
      parameterCount: 2,
      callObjectKeys: null,
      expectedResponse: "BLOCK_OR_NULL",
    },
    codeCall(3, "EXECUTOR_CODE", "EXECUTOR", "executor runtime code identity"),
    ethCall(4, "EXECUTOR_VERSION", "EXECUTOR", declared("EXECUTOR_VERSION"), "executor version", "ABI_STRING"),
    ethCall(
      5,
      "EXECUTOR_AUTHORITY_GETTER",
      "EXECUTOR",
      declared("EXECUTOR_AUTHORITY_GETTER"),
      "derive the authority address from the verified executor",
      "ADDRESS_WORD",
    ),
    codeCall(6, "AUTHORITY_CODE", "AUTHORITY", "authority runtime code identity"),
  ];
  let step = 7;
  if (authority.deploymentModel === "ERC1967_PROXY") {
    plan.push({
      step: step++,
      callId: "ERC1967_IMPLEMENTATION_SLOT",
      method: "eth_getStorageAt",
      targetRole: "AUTHORITY",
      data: null,
      purpose: "ERC-1967 implementation slot of the authority proxy",
      boundToPinnedBlock: true,
      /* The exact slot is part of the planned request, so a read of any other slot diverges. */
      params: [PLAN_TARGET_PLACEHOLDER, ERC1967_IMPLEMENTATION_SLOT, PLAN_PINNED_BLOCK_PLACEHOLDER],
      parameterCount: 3,
      callObjectKeys: null,
      expectedResponse: "STORAGE_WORD",
    });
    plan.push(
      codeCall(step++, "AUTHORITY_IMPLEMENTATION_CODE", "AUTHORITY_IMPLEMENTATION", "authority implementation code"),
    );
  }
  plan.push(
    ethCall(
      step++,
      "AUTHORITY_RECIPROCAL_EXECUTOR_GETTER",
      "AUTHORITY",
      declared("AUTHORITY_RECIPROCAL_EXECUTOR_GETTER"),
      "reciprocal linkage back to the configured executor",
      "ADDRESS_WORD",
    ),
  );
  plan.push(
    ethCall(step++, "AUTHORITY_VERSION", "AUTHORITY", declared("AUTHORITY_VERSION"), "authority version", "ABI_STRING"),
  );
  const limitFields: [string, string][] = [
    ["transactionTotal", "TRANSACTION_TOTAL_HCU_GETTER"],
    ["transactionDepth", "TRANSACTION_DEPTH_HCU_GETTER"],
    ["blockOrBatchCap", "BLOCK_OR_BATCH_HCU_GETTER"],
  ];
  for (const [field, callId] of limitFields) {
    if (availability[field] !== "AVAILABLE_AND_READ_ON_CHAIN") continue;
    plan.push(ethCall(step++, callId, "AUTHORITY", declared(callId), `${field} HCU limit getter`, "UINT256_WORD"));
  }
  const applicability = Array.isArray(iface.callerApplicability)
    ? (iface.callerApplicability as Record<string, unknown>[])
    : [];
  for (const subject of SG4_APPLICABILITY_SUBJECTS) {
    const spec = applicability.find((entry) => entry.subject === subject);
    if (!spec || spec.state !== "AVAILABLE") continue;
    /* CORRECTION 5 — the calldata, the target role and the decoder all come from the INTERFACE
     * MANIFEST entry, exactly as they do for every other planned call. The policy object states
     * which subjects are applicable; it does not construct their calls. */
    const callId = callerApplicabilityCallId(subject);
    const entry = interfaceCall(record, callId);
    const returnType = entry === null ? null : String(entry.returnType);
    plan.push(
      ethCall(
        step++,
        callId,
        entry !== null && entry.targetRole === "EXECUTOR" ? "EXECUTOR" : "AUTHORITY",
        declared(callId),
        `caller applicability for ${subject}`,
        returnType === "bool" ? "ABI_BOOL" : returnType === "address" ? "ADDRESS_WORD" : "UINT256_WORD",
      ),
    );
  }
  return plan;
}

/* INVARIANT H — resolve a planned request's placeholders against VERIFIED state, producing the
 * exact request the transport must see. */
export function resolvePlannedRequest(
  call: LiveCall,
  resolveRole: (role: string) => string | null,
  pinnedBlockHex: string | null,
): { ok: true; params: unknown[] } | { ok: false; reason: string } {
  const target = call.targetRole === "NONE" ? null : resolveRole(call.targetRole);
  if (call.targetRole !== "NONE" && target === null) {
    return { ok: false, reason: `target role ${call.targetRole} is not resolved` };
  }
  if (call.boundToPinnedBlock && pinnedBlockHex === null) {
    return { ok: false, reason: "the planned call requires a pinned block before one was pinned" };
  }
  const substitute = (value: unknown): unknown => {
    if (value === PLAN_TARGET_PLACEHOLDER) return target;
    if (value === PLAN_PINNED_BLOCK_PLACEHOLDER) return pinnedBlockHex;
    if (isObject(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, substitute(entry)]));
    }
    return value;
  };
  return { ok: true, params: call.params.map(substitute) };
}

/* Case-insensitive where the JSON-RPC value is hex, exact everywhere else. Deep, so an extra key
 * anywhere in the request is a divergence rather than something the comparison skipped. */
export function requestsAreIdentical(planned: unknown, issued: unknown): boolean {
  if (typeof planned === "string" && typeof issued === "string") {
    return /^0x[0-9a-fA-F]*$/u.test(planned) ? planned.toLowerCase() === issued.toLowerCase() : planned === issued;
  }
  if (Array.isArray(planned) || Array.isArray(issued)) {
    if (!Array.isArray(planned) || !Array.isArray(issued) || planned.length !== issued.length) return false;
    return planned.every((entry, index) => requestsAreIdentical(entry, issued[index]));
  }
  if (isObject(planned) || isObject(issued)) {
    if (!isObject(planned) || !isObject(issued)) return false;
    const plannedKeys = Object.keys(planned).sort();
    const issuedKeys = Object.keys(issued).sort();
    if (JSON.stringify(plannedKeys) !== JSON.stringify(issuedKeys)) return false;
    return plannedKeys.every((key) => requestsAreIdentical(planned[key], issued[key]));
  }
  return planned === issued;
}

/* F39 — the canonical digest of a plan. Two runs that planned the same calls produce the same
 * digest, and a result carrying a different one did not run this plan. */
export function livePlanDigest(plan: readonly LiveCall[]): string {
  return sha256(
    canonicalJson(
      /* Everything relevant to request equality is in the digest, so a divergence cannot
       * disappear from it. */
      plan.map((call) => ({
        boundToPinnedBlock: call.boundToPinnedBlock,
        callId: call.callId,
        callObjectKeys: call.callObjectKeys,
        data: call.data,
        expectedResponse: call.expectedResponse,
        method: call.method,
        parameterCount: call.parameterCount,
        params: call.params,
        step: call.step,
        targetRole: call.targetRole,
      })),
    ),
  );
}

/* The sanitized ordered call log: method, target, calldata and block parameter. Addresses and
 * calldata are public chain data; no endpoint, header or credential is representable here. */
export function sanitizeCallLog(log: readonly JsonRpcCall[]): Record<string, unknown>[] {
  /* INVARIANT H — the COMPLETE ordered request vector. Addresses, calldata, block tags and slots
   * are public chain data; no endpoint, header or credential is representable in a JsonRpcCall, so
   * retaining the whole parameter vector leaks nothing and makes every divergence visible in the
   * digest. */
  return log.map((call, index) => ({
    index,
    method: call.method,
    parameterCount: call.params.length,
    params: call.params.map((param) =>
      typeof param === "string" && /^0x[0-9a-fA-F]*$/u.test(param) ? param.toLowerCase() : param,
    ),
  }));
}

export function liveCallLogDigest(log: readonly JsonRpcCall[]): string {
  return sha256(canonicalJson(sanitizeCallLog(log)));
}

export function assertLiveCallPlanIsReadOnly(plan: readonly LiveCall[]): void {
  for (const call of plan) {
    if (!LIVE_RPC_ALLOWED_METHODS.includes(call.method)) {
      throw new Error(`live plan contains a method outside the read-only allow-list: ${call.method}`);
    }
    if (LIVE_RPC_FORBIDDEN_METHOD_PREFIXES.some((prefix) => call.method.startsWith(prefix))) {
      throw new Error(`live plan contains a forbidden method: ${call.method}`);
    }
  }
  /* If the plan resolves an implementation at all, it must do so through eth_getStorageAt. A
   * DIRECT deployment has no such step, and demanding one would contradict its reviewed model. */
  const resolution = plan.find((call) => call.purpose.includes("ERC-1967"));
  if (resolution && resolution.method !== "eth_getStorageAt") {
    throw new Error("ERC-1967 implementation resolution must use eth_getStorageAt");
  }
}

/* ---------------------------------------------------------------------------------------------
 * Read-only JSON-RPC execution boundary.
 *
 * The verifier never constructs a URL from anything but the committed protocol endpoint, and never
 * reads one from the environment or from a parameter. The transport is injectable purely so the
 * behaviour above can be tested against an in-memory fake with no network access; the injected
 * object carries a `send` function and nothing else — no URL, address, key, or credential.
 * ------------------------------------------------------------------------------------------- */

export type JsonRpcCall = { method: string; params: readonly unknown[] };
export type ReadOnlyTransport = { send(call: JsonRpcCall): Promise<unknown> };

export class ForbiddenRpcMethodError extends Error {
  constructor(method: string) {
    super(`forbidden RPC method refused by the read-only guard: ${method}`);
    this.name = "ForbiddenRpcMethodError";
  }
}

export class PinnedBlockBindingError extends Error {
  constructor(method: string, found: unknown, pinned: string) {
    super(`${method} was not bound to the pinned block (found ${JSON.stringify(found)}, expected ${pinned})`);
    this.name = "PinnedBlockBindingError";
  }
}

export function assertMethodAllowed(method: string): void {
  if (LIVE_RPC_FORBIDDEN_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix))) {
    throw new ForbiddenRpcMethodError(method);
  }
  if (!LIVE_RPC_ALLOWED_METHODS.includes(method)) throw new ForbiddenRpcMethodError(method);
}

/* Position of the block tag in each bound method's parameter list. */
const PINNED_BLOCK_PARAMETER_INDEX: Readonly<Record<string, number>> = {
  eth_call: 1,
  eth_getCode: 1,
  eth_getStorageAt: 2,
};

export function assertBoundToPinnedBlock(call: JsonRpcCall, pinnedBlockHex: string): void {
  const index = PINNED_BLOCK_PARAMETER_INDEX[call.method];
  if (index === undefined) return;
  const found = call.params[index];
  if (found !== pinnedBlockHex) throw new PinnedBlockBindingError(call.method, found, pinnedBlockHex);
}

export type RoleResolver = (role: string) => string | null;

export type GuardedTransport = {
  send(call: JsonRpcCall): Promise<unknown>;
  methodsUsed(): string[];
  callLog(): JsonRpcCall[];
  bindToPinnedBlock(pinnedBlockHex: string): void;
  /* F39 — install the record-derived plan. Every subsequent call must be the next planned call. */
  enforcePlan(plan: readonly LiveCall[], resolveRole: RoleResolver): void;
  planCursor(): number;
  planViolations(): string[];
};

/* Wraps a transport so that no forbidden method can be issued and, once a block has been pinned,
 * no block-bound method can be issued against any other block. */
export function createGuardedTransport(inner: ReadOnlyTransport): GuardedTransport {
  const log: JsonRpcCall[] = [];
  let pinned: string | null = null;
  let plan: readonly LiveCall[] | null = null;
  let resolveRole: RoleResolver = () => null;
  let cursor = 0;
  const violations: string[] = [];

  /* F39 — match one issued call against the plan position it must occupy. The plan is a runtime
   * invariant: a divergence throws here, at the moment the call is issued, rather than being
   * noticed by a test afterwards. */
  const enforce = (call: JsonRpcCall): void => {
    if (plan === null) return;
    if (cursor >= plan.length) {
      const detail = `unplanned extra call ${call.method} at position ${cursor}`;
      violations.push(detail);
      throw new LiveCallPlanViolationError(detail);
    }
    const planned = plan[cursor];
    const fail = (reason: string): never => {
      const detail = `step ${planned.step} (${planned.callId}): ${reason}`;
      violations.push(detail);
      throw new LiveCallPlanViolationError(detail);
    };
    if (call.method !== planned.method) fail(`expected ${planned.method}, issued ${call.method}`);
    if (call.params.length !== planned.parameterCount) {
      fail(`expected ${planned.parameterCount} parameters, issued ${call.params.length}`);
    }
    /* INVARIANT H — resolve the planned request against VERIFIED state and DEEP-COMPARE the whole
     * thing. An extra transaction-object key, a state override, a wrong slot, a wrong block tag or
     * a wrong target are all one check, because they are all the same divergence: the issued
     * request is not the planned request. */
    const resolved = resolvePlannedRequest(planned, resolveRole, pinned);
    if (!resolved.ok) fail(resolved.reason);
    else if (!requestsAreIdentical(resolved.params, call.params)) {
      fail(`expected params ${JSON.stringify(resolved.params)}, issued ${JSON.stringify(call.params)}`);
    }
    cursor += 1;
  };

  return {
    async send(call: JsonRpcCall): Promise<unknown> {
      /* The hard read-only allow-list is a SEPARATE defense and runs first: it holds whether or
       * not a plan was installed. */
      assertMethodAllowed(call.method);
      if (pinned !== null) assertBoundToPinnedBlock(call, pinned);
      enforce(call);
      /* Recorded only once the call actually reached the transport, so a request that was never
       * issued is never reported as a method the verification used. */
      const response = await inner.send(call);
      log.push({ method: call.method, params: [...call.params] });
      return response;
    },
    methodsUsed: () => [...new Set(log.map((call) => call.method))].sort(),
    callLog: () => log.map((call) => ({ method: call.method, params: [...call.params] })),
    bindToPinnedBlock: (pinnedBlockHex: string) => {
      pinned = pinnedBlockHex;
    },
    enforcePlan: (installed: readonly LiveCall[], resolver: RoleResolver) => {
      plan = installed;
      resolveRole = resolver;
      /* Calls already issued before the plan was installed still have to occupy their planned
       * positions, so the cursor is replayed rather than reset. */
      cursor = 0;
      for (const issued of log) enforce(issued);
    },
    planCursor: () => cursor,
    planViolations: () => [...violations],
  };
}

/* The only transport that touches a network. Built from the committed endpoint and nothing else.
 * Constructing it performs no I/O; `send` is the only place a request is issued. */
/* Response integrity, independent of transport. Exported so it is directly testable without any
 * network: a malformed, mismatched or oversized response is rejected here.
 *
 * Errors are deliberately terse. The body is unsanitized third-party content and is never echoed. */
export function parseJsonRpcResponse(input: {
  method: string;
  expectedId: number;
  statusCode: number;
  body: Buffer;
}): { ok: true; result: unknown } | { ok: false; reason: string } {
  if (input.statusCode < 200 || input.statusCode > 299) {
    return { ok: false, reason: `RPC HTTP status ${input.statusCode} for ${input.method}` };
  }
  if (input.body.length > RPC_RESPONSE_POLICY.maximumResponseBytes) {
    return { ok: false, reason: `RPC response exceeded the maximum size for ${input.method}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body.toString("utf8")) as unknown;
  } catch {
    return { ok: false, reason: `unparseable RPC response for ${input.method}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: `RPC response was not a JSON object for ${input.method}` };
  }
  const body = parsed as Record<string, unknown>;
  if (body.jsonrpc !== RPC_RESPONSE_POLICY.requireJsonRpcVersion) {
    return { ok: false, reason: `RPC response carried the wrong jsonrpc version for ${input.method}` };
  }
  if (body.id !== input.expectedId) {
    return { ok: false, reason: `RPC response id did not match the request for ${input.method}` };
  }
  const hasResult = "result" in body;
  const hasError = "error" in body;
  if (hasResult === hasError) {
    return {
      ok: false,
      reason: hasResult
        ? `RPC response carried both result and error for ${input.method}`
        : `RPC response carried neither result nor error for ${input.method}`,
    };
  }
  if (hasError) return { ok: false, reason: `RPC error for ${input.method}` };
  return { ok: true, result: body.result };
}

export function createCommittedEndpointTransport(): ReadOnlyTransport {
  const endpoint = new URL(LIVE_RPC_ENDPOINT);
  if (endpoint.protocol !== "https:") throw new Error("the committed RPC endpoint must be https");
  /* Unique and monotonically increasing, so a response can only satisfy its own request. */
  let nextId = 0;
  return {
    async send(call: JsonRpcCall): Promise<unknown> {
      assertMethodAllowed(call.method);
      /* Imported lazily so that neither offline preflight nor any test loads the network module. */
      const { request } = await import("node:https");
      const id = ++nextId;
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method: call.method, params: call.params });
      return new Promise((resolve, reject) => {
        const req = request(
          {
            protocol: endpoint.protocol,
            hostname: endpoint.hostname,
            port: endpoint.port || 443,
            path: endpoint.pathname,
            method: "POST",
            headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
            timeout: 30_000,
          },
          (response) => {
            const status = response.statusCode ?? 0;
            /* Redirects are refused outright rather than followed to an unreviewed origin. */
            if (status >= 300 && status < 400) {
              response.destroy();
              reject(new Error(`RPC redirect refused for ${call.method}`));
              return;
            }
            const chunks: Buffer[] = [];
            let received = 0;
            let aborted = false;
            response.on("data", (chunk: Buffer) => {
              received += chunk.length;
              if (received > RPC_RESPONSE_POLICY.maximumResponseBytes) {
                aborted = true;
                response.destroy();
                reject(new Error(`RPC response exceeded the maximum size for ${call.method}`));
                return;
              }
              chunks.push(chunk);
            });
            response.on("end", () => {
              if (aborted) return;
              const outcome = parseJsonRpcResponse({
                method: call.method,
                expectedId: id,
                statusCode: status,
                body: Buffer.concat(chunks),
              });
              if (outcome.ok) resolve(outcome.result);
              else reject(new Error(outcome.reason));
            });
          },
        );
        req.on("timeout", () => req.destroy(new Error(`RPC timeout for ${call.method}`)));
        req.on("error", () => reject(new Error(`RPC transport failure for ${call.method}`)));
        req.write(payload);
        req.end();
      });
    },
  };
}

/* ---------------------------------------------------------------------------------------------
 * Preparation lineage: two commits, no self-reference.
 *
 * The previous model stored the preparation commit and tree in a tracked source file and required a
 * clean HEAD to equal them. That is unsatisfiable by construction: writing the values changes the
 * tree, and committing that change changes the commit, so the recorded values can never equal the
 * clean HEAD that contains them.
 *
 * The replacement verifies a lineage instead of an identity. Commit A carries the implementation
 * and claims nothing about itself. Commit B adds exactly one binding record naming A's commit and
 * A's tree, and changes nothing else. B never records its own commit or tree, because the verifier
 * reads B from HEAD and A from HEAD^.
 * ------------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------------
 * The authority-binding record.
 *
 * It carries the implementation lineage AND every late-bound authority input. Commit A cannot know
 * the official artifact hash, the reverified provenance, the operation schedule or the enforcement
 * semantics; commit B supplies them as reviewed data rather than as code, so the gate is reachable
 * without any implementation edit after A.
 * ------------------------------------------------------------------------------------------- */

export type BindingFacet = { artifactId: string; origin: string };

export type AuthorityBindingRecord = {
  /* INVARIANTS B/C/D — the authenticated bytes every authoritative fact is recomputed from. */
  sourceMaterial?: Record<string, unknown>;
  authorityEnumeration?: Record<string, unknown>;
  enforcementProof?: Record<string, unknown>;
  schema: string;
  recordVersion: number;
  lineage: Record<string, unknown>;
  authorityResolution: Record<string, unknown>;
  provenance: { reverificationStatus: string; entries: Record<string, unknown>[] };
  artifact: Record<string, unknown>;
  executor: Record<string, unknown>;
  authority: Record<string, unknown>;
  operationSchedule: Record<string, unknown>;
  limits: Record<string, unknown>;
  blockOrBatch: Record<string, unknown>;
  onChainInterface: Record<string, unknown>;
  facets: Record<string, BindingFacet>;
};

const SHAPE = AUTHORITY_BINDING_RECORD_SHAPE;
const HEX40 = /^[0-9a-f]{40}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const DECIMAL = /^[0-9]+$/u;
const SELECTOR = /^0x[0-9a-f]{8}$/u;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* Checks a section is present, an object, and carries exactly its declared field set. */
function checkSection(
  value: Record<string, unknown>,
  section: keyof typeof SHAPE.sections,
  errors: string[],
): Record<string, unknown> | null {
  const body = value[section];
  if (!isObject(body)) {
    errors.push(`binding record section ${section} must be an object`);
    return null;
  }
  const declared = SHAPE.sections[section] as readonly string[];
  for (const field of declared) {
    if (!(field in body)) errors.push(`binding record ${section} is missing ${field}`);
  }
  for (const key of Object.keys(body)) {
    if (!declared.includes(key)) errors.push(`binding record ${section} has an unpermitted field ${key}`);
  }
  return body;
}

/* Full closed validation of the authority-binding record.
 *
 * Nothing here reads git or the network. A record that claims RESOLVED without every supporting
 * proof field is rejected: that is the whole point of the late-bound design. */
/* F37 — a proof must belong to something already pinned.
 *
 * `sourceRangeSha256` on its own asserts that SOME 32 bytes hash to that value; every 32 bytes do.
 * The proof therefore has to name an enforcement function the digest-bound enforcement manifest
 * actually contains, at that manifest's source path, carrying that manifest's source content hash.
 */
export function applicabilityProofParentErrors(
  proof: Record<string, unknown>,
  record: Record<string, unknown>,
  label: string,
): string[] {
  const errors: string[] = [];
  const enforcement = record.enforcementProof as Record<string, unknown> | undefined;
  const manifest = isObject(enforcement?.manifest) ? (enforcement?.manifest as Record<string, unknown>) : null;
  if (manifest === null) {
    errors.push(`binding record ${label} has no digest-bound enforcement manifest to belong to`);
    return errors;
  }
  if (proof.sourceContentSha256 !== manifest.sourceContentSha256) {
    errors.push(`binding record ${label} does not carry the enforcement manifest source content hash`);
  }
  const entries = Array.isArray(manifest.entries) ? (manifest.entries as Record<string, unknown>[]) : [];
  const parent = String(proof.parentEnforcementFunction);
  const known = new Set(entries.filter(isObject).map((entry) => String(entry.enforcementFunction)));
  const paths = new Set(entries.filter(isObject).map((entry) => String(entry.sourcePath)));
  if (!known.has(parent)) {
    errors.push(`binding record ${label} names an enforcement function the proof manifest does not contain`);
  }
  if (!paths.has(String(proof.sourcePath))) {
    errors.push(`binding record ${label} names a source path the proof manifest does not contain`);
  }
  return errors;
}

/* ===============================================================================================
 * AUTHENTICATED SOURCE MATERIAL AND ITS DETERMINISTIC EXTRACTORS  (INVARIANTS B, C, D)
 *
 * One chain, followed identically for every authoritative fact:
 *
 *     record.sourceMaterial[subject].bytesBase64
 *       -> sha256(bytes) must equal the SELECTED provenance tuple's contentSha256
 *       -> a versioned deterministic extractor
 *       -> a canonical typed manifest
 *       -> compared against the record's reviewed claim
 *
 * Nothing below trusts a record-supplied table, list, boolean or digest. Where the bytes are
 * absent, the dependent fact stays UNRESOLVED and blocks; it never falls back to a local fixture.
 * ============================================================================================= */

export type AuthenticatedMaterial = { subject: string; bytes: Buffer; contentSha256: string };

export type MaterialAuthentication = { ok: true; material: AuthenticatedMaterial } | { ok: false; reason: string };

/* Authenticate one supplied blob against the tuple that selected it. */
export function authenticateSourceMaterial(record: AuthorityBindingRecord, subject: string): MaterialAuthentication {
  const section = record.sourceMaterial as Record<string, unknown> | undefined;
  const supplied = isObject(section) ? (section[subject] as Record<string, unknown> | undefined) : undefined;
  if (!isObject(supplied)) return { ok: false, reason: `SOURCE_MATERIAL_ABSENT:${subject}` };
  for (const field of SOURCE_MATERIAL_FIELDS) {
    if (!(field in supplied)) return { ok: false, reason: `SOURCE_MATERIAL_INCOMPLETE:${subject}:${field}` };
  }
  for (const key of Object.keys(supplied)) {
    if (!SOURCE_MATERIAL_FIELDS.includes(key)) {
      return { ok: false, reason: `SOURCE_MATERIAL_UNPERMITTED_FIELD:${subject}:${key}` };
    }
  }
  if (supplied.subject !== subject) return { ok: false, reason: `SOURCE_MATERIAL_SUBJECT_MISMATCH:${subject}` };
  if (typeof supplied.encoding !== "string" || !SOURCE_MATERIAL_ENCODINGS.includes(supplied.encoding)) {
    return { ok: false, reason: `SOURCE_MATERIAL_ENCODING_UNSUPPORTED:${subject}` };
  }
  if (typeof supplied.bytesBase64 !== "string" || supplied.bytesBase64.length === 0) {
    return { ok: false, reason: `SOURCE_MATERIAL_BYTES_ABSENT:${subject}` };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(supplied.bytesBase64, "base64");
  } catch {
    return { ok: false, reason: `SOURCE_MATERIAL_BYTES_UNDECODABLE:${subject}` };
  }
  /* A round-trip guard: base64 that does not re-encode to itself is not the bytes it claims. */
  if (bytes.toString("base64") !== supplied.bytesBase64) {
    return { ok: false, reason: `SOURCE_MATERIAL_BYTES_NOT_CANONICAL:${subject}` };
  }
  const digest = sha256(bytes);
  if (supplied.contentSha256 !== digest) {
    return { ok: false, reason: `SOURCE_MATERIAL_DIGEST_MISMATCH:${subject}` };
  }
  /* THE AUTHENTICATION: the bytes must be the ones the SELECTED provenance tuple names. */
  const tuple = selectedProvenanceTuple(record, SOURCE_MATERIAL_PROVENANCE[subject]);
  if (tuple === null) return { ok: false, reason: `SOURCE_MATERIAL_UNSELECTED:${subject}` };
  if (provenanceContentSha256(tuple) !== digest) {
    return { ok: false, reason: `SOURCE_MATERIAL_NOT_THE_SELECTED_SOURCE:${subject}` };
  }
  return { ok: true, material: { subject, bytes, contentSha256: digest } };
}

/* ---------------------------------------------------------------------------------------------
 * INVARIANT B — the FULL authoritative price schedule, extracted from authenticated bytes.
 *
 * The source form is the upstream operators-prices table: one entry per operation, each with a
 * cost group ("scalar" / "nonScalar" / "types") mapping a cost-key type to an integer price. The
 * extractor produces one canonical entry per (operation, group, type) VARIANT — the whole schedule,
 * not the SG-4 subset — so completeness is a property of the parse rather than a claim.
 * ------------------------------------------------------------------------------------------- */

export type ExtractedPriceVariant = {
  canonicalName: string;
  operandMode: string;
  costKeyType: string;
  cost: number;
};

export type ExtractedPriceSchedule = {
  extractorId: string;
  extractorVersion: number;
  sourceContentSha256: string;
  operations: string[];
  variants: ExtractedPriceVariant[];
  failures: string[];
};

const PRICE_OPERATION_BLOCK = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*\{\s*$/u;
const PRICE_GROUP_BLOCK = /^\s*(scalar|nonScalar|types)\s*:\s*\{\s*$/u;
const PRICE_ENTRY = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*([0-9][0-9_]*)\s*,?\s*$/u;
const PRICE_CLOSE = /^\s*\}\s*,?\s*$/u;

export function extractPriceSchedule(material: AuthenticatedMaterial): ExtractedPriceSchedule {
  const failures: string[] = [];
  const variants: ExtractedPriceVariant[] = [];
  const operations: string[] = [];
  const lines = material.bytes.toString("utf8").split(/\r?\n/u);

  let operation: string | null = null;
  let group: string | null = null;
  let depth = 0;
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0 || line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
    if (operation === null) {
      const match = PRICE_OPERATION_BLOCK.exec(line);
      if (match) {
        operation = match[1];
        if (operations.includes(operation)) failures.push(`DUPLICATE_OPERATION:${operation}:line${index + 1}`);
        operations.push(operation);
        depth = 1;
      }
      continue;
    }
    if (group === null) {
      const groupMatch = PRICE_GROUP_BLOCK.exec(line);
      if (groupMatch) {
        group = groupMatch[1];
        depth = 2;
        continue;
      }
      if (PRICE_CLOSE.test(line)) {
        operation = null;
        depth = 0;
        continue;
      }
      /* Anything else inside an operation block is an unrecognised dimension. Failing closed here
       * is the point: an unparsed line could carry a price nobody compared. */
      failures.push(`UNRECOGNIZED_OPERATION_MEMBER:${operation}:line${index + 1}`);
      continue;
    }
    const entry = PRICE_ENTRY.exec(line);
    if (entry) {
      const cost = Number.parseInt(entry[2].replace(/_/gu, ""), 10);
      if (!Number.isSafeInteger(cost) || cost < 0) {
        failures.push(`UNSAFE_COST:${operation}.${group}.${entry[1]}:line${index + 1}`);
        continue;
      }
      variants.push({ canonicalName: operation, operandMode: group, costKeyType: entry[1], cost });
      continue;
    }
    if (PRICE_CLOSE.test(line)) {
      group = null;
      depth = 1;
      continue;
    }
    failures.push(`UNRECOGNIZED_COST_LINE:${operation}.${group}:line${index + 1}`);
  }
  if (operation !== null || group !== null || depth !== 0) failures.push("UNTERMINATED_SCHEDULE_BLOCK");
  if (variants.length === 0) failures.push("EMPTY_SCHEDULE");

  variants.sort((left, right) =>
    `${left.canonicalName}.${left.operandMode}.${left.costKeyType}`.localeCompare(
      `${right.canonicalName}.${right.operandMode}.${right.costKeyType}`,
    ),
  );
  return {
    extractorId: PRICE_SCHEDULE_EXTRACTOR.id,
    extractorVersion: PRICE_SCHEDULE_EXTRACTOR.version,
    sourceContentSha256: material.contentSha256,
    operations: [...operations].sort(),
    variants,
    failures: [...new Set(failures)].sort(),
  };
}

/* ---------------------------------------------------------------------------------------------
 * INVARIANT D — the authority source parser.
 *
 * Recomputes the enumeration the record used to assert: declarations, callable functions, errors,
 * storage surfaces, enforcement functions, exact byte ranges and their digests, whether the parse
 * left any residue, and the block/batch conclusion derived from all of it.
 * ------------------------------------------------------------------------------------------- */

export type SourceRange = { startByte: number; endByte: number; sha256: string };

export type ParsedAuthoritySource = {
  parserId: string;
  parserVersion: number;
  sourceContentSha256: string;
  declarations: string[];
  callableFunctions: string[];
  errors: string[];
  storageStructFields: string[];
  storagePrimitives: string[];
  enforcementFunctions: string[];
  mappings: string[];
  declarationRanges: Record<string, SourceRange>;
  enforcementRanges: Record<string, SourceRange>;
  constantValues: Record<string, string>;
  /* The comparison each enforcement body actually performs against its ceiling. `>` means the
   * configured value is itself accepted (an inclusive ceiling); `>=` means it is not. */
  enforcementOperators: Record<string, string>;
  derivedLimitSemantics: string;
  parseCompleteness: string;
  blockOrBatchConclusion: "ABSENT" | "PRESENT" | "UNRESOLVED";
  residue: string[];
};

const DECLARATION_LINE =
  /^\s*(?:uint256|uint128|uint64)\s+(?:public\s+|internal\s+|private\s+)?constant\s+([A-Z][A-Z0-9_]*)\s*=\s*([0-9][0-9_]*)\s*;/u;
const FUNCTION_LINE = /^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u;
const ERROR_LINE = /^\s*error\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u;
const MAPPING_LINE = /^\s*mapping\s*\([^)]*\)\s+(?:public\s+|internal\s+|private\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*;/u;
/* An ordinary value-type state declaration, with optional visibility and mutability. A constant
 * with an initialiser is matched by DECLARATION_LINE first; this covers the rest. Anything outside
 * these forms — a custom type, an unusual modifier order, an inline initialiser the parser does not
 * model — is deliberately NOT matched, and becomes residue. */
const STRUCT_FIELD_LINE =
  /^\s{4,}(?:uint8|uint16|uint32|uint64|uint128|uint256|int256|bool|address|bytes32)\s+(?:public\s+|internal\s+|private\s+)?(?:immutable\s+|transient\s+)?([a-zA-Z_][A-Za-z0-9_]*)\s*;/u;
const STORAGE_PRIMITIVE = /\b(tload|tstore|sload|sstore)\b/gu;

/* A function is an ENFORCEMENT function when its body compares a running total against one of the
 * declared ceiling constants. That is a property of the parsed body, not of its name. */
/* Lines a purpose-built HCU-surface parser can account for without classifying them as surface:
 * pragmas, imports, licence headers, braces, the contract header itself, visibility-only lines and
 * empty lines. Everything else must be classified or become residue. */
const IGNORABLE_LINE =
  /^\s*(?:$|\}|\{|pragma\s|import\s|using\s|\/\/|contract\s|abstract\s+contract\s|interface\s|library\s|struct\s|enum\s|constructor\s*\(|receive\s*\(|fallback\s*\()/u;

/* Anything that could plausibly bear on an HCU or block/batch ceiling. A line matching this that
 * the parser cannot fully classify is a hard residue, not a shrug. */
const HCU_RELEVANT_HINT = /\b(?:HCU|HOMOMORPHIC|COMPUTE_UNIT|BLOCK|BATCH|LIMIT|CEILING|MAX_)/iu;

export function parseAuthoritySource(material: AuthenticatedMaterial): ParsedAuthoritySource {
  const rawText = material.bytes.toString("utf8");
  /* CORRECTION 3 — classify the COMMENT-STRIPPED source, so no declaration hides in a comment and
   * no comment is mistaken for one. Offsets still refer to the original bytes. */
  const stripped = stripSolidityComments(rawText);
  const lines = stripped.split(/\r?\n/u);
  const rawLines = rawText.split(/\r?\n/u);
  const declarations: string[] = [];
  const callableFunctions: string[] = [];
  const errors: string[] = [];
  const mappings: string[] = [];
  const storageStructFields: string[] = [];
  const enforcementFunctions: string[] = [];
  const declarationRanges: Record<string, SourceRange> = {};
  const enforcementRanges: Record<string, SourceRange> = {};
  const constantValues: Record<string, string> = {};
  const enforcementOperators: Record<string, string> = {};
  const residue: string[] = [];
  const storagePrimitives = new Set<string>();

  /* Byte offsets come from the ORIGINAL bytes, so a range digest is over real source. */
  const lineStart: number[] = [];
  let offset = 0;
  for (const line of rawLines) {
    lineStart.push(offset);
    offset += Buffer.byteLength(line, "utf8") + 1;
  }
  const rangeFor = (index: number, endIndex: number): SourceRange => {
    const startByte = lineStart[index];
    const endByte = Math.min(
      lineStart[endIndex] + Buffer.byteLength(rawLines[endIndex] ?? "", "utf8"),
      material.bytes.length,
    );
    return { startByte, endByte, sha256: sha256(material.bytes.subarray(startByte, endByte)) };
  };

  /* Every line index the parse accounted for. A line neither ignorable nor classified is residue. */
  const accounted = new Set<number>();
  const accountFor = (from: number, to: number): void => {
    for (let cursor = from; cursor <= to; cursor++) accounted.add(cursor);
  };

  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(STORAGE_PRIMITIVE)) storagePrimitives.add(match[1]);

    const declaration = DECLARATION_LINE.exec(line);
    if (declaration) {
      declarations.push(declaration[1]);
      constantValues[declaration[1]] = declaration[2].replace(/_/gu, "");
      declarationRanges[declaration[1]] = rangeFor(index, index);
      accounted.add(index);
      continue;
    }
    const error = ERROR_LINE.exec(line);
    if (error) {
      errors.push(error[1]);
      accounted.add(index);
      continue;
    }
    const mapping = MAPPING_LINE.exec(line);
    if (mapping) {
      mappings.push(mapping[1]);
      accounted.add(index);
      continue;
    }
    const fn = FUNCTION_LINE.exec(line);
    if (fn) {
      callableFunctions.push(fn[1]);
      /* Walk the body to its matching close brace, counting braces on real lines only. */
      let depth = 0;
      let endIndex = index;
      let seenOpen = false;
      for (let cursor = index; cursor < lines.length; cursor++) {
        for (const character of lines[cursor]) {
          if (character === "{") {
            depth += 1;
            seenOpen = true;
          } else if (character === "}") depth -= 1;
        }
        endIndex = cursor;
        if (seenOpen && depth === 0) break;
      }
      if (!seenOpen || depth !== 0) {
        residue.push(`UNTERMINATED_FUNCTION:${fn[1]}:line${index + 1}`);
        accountFor(index, endIndex);
        continue;
      }
      const body = lines.slice(index, endIndex + 1).join("\n");
      /* Enforcement is decided by what the body DOES: it compares against a declared ceiling and
       * reverts. Naming alone establishes nothing. */
      const comparesCeiling = declarations.some((name) => new RegExp(`\\b${name}\\b`, "u").test(body));
      if (comparesCeiling && /\brevert\b/u.test(body) && /[><]=?/u.test(body)) {
        enforcementFunctions.push(fn[1]);
        enforcementRanges[fn[1]] = rangeFor(index, endIndex);
        const ceiling = declarations.find((name) => new RegExp(`\\b${name}\\b`, "u").test(body));
        const comparison = ceiling === undefined ? null : new RegExp(`(>=|>|<=|<)\\s*${ceiling}\\b`, "u").exec(body);
        if (comparison !== null) enforcementOperators[fn[1]] = comparison[1];
      }
      accountFor(index, endIndex);
      continue;
    }
    const field = STRUCT_FIELD_LINE.exec(line);
    if (field) {
      storageStructFields.push(field[1]);
      accounted.add(index);
      continue;
    }
    /* A modifier is an enforcement surface: it can gate or wrap a ceiling check. The parser does
     * not analyse modifier bodies, so declaring one is a hard residue rather than a silent skip. */
    if (/^\s*modifier\s+([A-Za-z_][A-Za-z0-9_]*)/u.test(line)) {
      residue.push(`UNSUPPORTED_MODIFIER_SURFACE:line${index + 1}`);
      accounted.add(index);
      continue;
    }
  }

  /* CORRECTION 3 — everything the classification did not account for. A line that is merely
   * structural is ignorable; anything else is residue, and anything that even mentions an
   * HCU/ceiling/block/batch concept is a hard residue whatever its form. */
  for (const [index, line] of lines.entries()) {
    if (accounted.has(index)) continue;
    if (IGNORABLE_LINE.test(line)) continue;
    if (HCU_RELEVANT_HINT.test(line)) {
      residue.push(`UNSUPPORTED_HCU_RELEVANT_DECLARATION:line${index + 1}`);
      continue;
    }
    residue.push(`UNCLASSIFIED_SOURCE_LINE:line${index + 1}`);
  }

  const sorted = (values: string[]) => [...new Set(values)].sort();
  const parseCompleteness = residue.length === 0 ? "PARSED_COMPLETE_NO_RESIDUE" : "PARTIAL";
  const parsed: ParsedAuthoritySource = {
    parserId: AUTHORITY_SOURCE_PARSER.id,
    parserVersion: AUTHORITY_SOURCE_PARSER.version,
    sourceContentSha256: material.contentSha256,
    declarations: sorted(declarations),
    callableFunctions: sorted(callableFunctions),
    errors: sorted(errors),
    storageStructFields: sorted(storageStructFields),
    storagePrimitives: sorted([...storagePrimitives]),
    enforcementFunctions: sorted(enforcementFunctions),
    mappings: sorted(mappings),
    declarationRanges,
    enforcementRanges,
    constantValues,
    enforcementOperators,
    /* INVARIANT D — the ceiling semantics are DERIVED from the operators the source actually uses. */
    derivedLimitSemantics: (() => {
      const operators = [...new Set(Object.values(enforcementOperators))];
      if (operators.length !== 1) return "UNRESOLVED";
      if (operators[0] === ">") return "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN";
      if (operators[0] === ">=") return "CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_OR_EQUAL";
      return "UNRESOLVED";
    })(),
    parseCompleteness,
    blockOrBatchConclusion: "ABSENT",
    residue: sorted(residue),
  };
  /* CORRECTION 3 — ABSENT is a conclusion about a COMPLETE enumeration. A partial parse cannot
   * establish that something is not there; it can only establish that it was not seen. Reporting
   * PRESENT would be as much an invention as reporting ABSENT, so it is UNRESOLVED and blocks. */
  parsed.blockOrBatchConclusion =
    parseCompleteness === "PARSED_COMPLETE_NO_RESIDUE"
      ? deriveBlockOrBatchConclusion({
          declarations: parsed.declarations,
          callableFunctions: parsed.callableFunctions,
          errors: parsed.errors,
          mappings: parsed.mappings,
          storageStructFields: parsed.storageStructFields,
          storagePrimitives: parsed.storagePrimitives,
        })
      : "UNRESOLVED";
  return parsed;
}

/* ---------------------------------------------------------------------------------------------
 * INVARIANT C — the artifact build extractor.
 *
 * Consumes the authenticated official build artifact and independently recomputes the compiler
 * immutable-reference manifest and the expected normalized runtime digest. The record's expected
 * hash is then a claim to compare against, not a value to believe.
 * ------------------------------------------------------------------------------------------- */

export type ExtractedArtifactBuild = {
  extractorId: string;
  extractorVersion: number;
  sourceContentSha256: string;
  buildInfoId: string;
  solcLongVersion: string;
  inputSourceSha256: string;
  runtimeByteLength: number;
  runtimeSha256: string;
  compilerVersion: string;
  buildId: string;
  compilerReferenceManifest: Record<string, unknown>;
  normalizationManifest: Record<string, unknown>;
  expectedNormalizedRuntimeSha256: string;
  failures: string[];
};

export function extractArtifactBuild(
  material: AuthenticatedMaterial,
  deployment: { implementationAddress: string },
  authenticatedSourceSha256: string | null,
): ExtractedArtifactBuild {
  const failures: string[] = [];
  const pinned = REPRODUCED_OFFICIAL_BUILD;
  const empty = (reason: string): ExtractedArtifactBuild => {
    failures.push(reason);
    return {
      extractorId: ARTIFACT_BUILD_EXTRACTOR.id,
      extractorVersion: ARTIFACT_BUILD_EXTRACTOR.version,
      sourceContentSha256: material.contentSha256,
      buildInfoId: "UNRESOLVED",
      runtimeByteLength: 0,
      runtimeSha256: "UNRESOLVED",
      compilerVersion: "UNRESOLVED",
      solcLongVersion: "UNRESOLVED",
      buildId: "UNRESOLVED",
      inputSourceSha256: "UNRESOLVED",
      compilerReferenceManifest: {},
      normalizationManifest: {},
      expectedNormalizedRuntimeSha256: "UNRESOLVED",
      failures: [...new Set(failures)].sort(),
    };
  };

  let buildInfo: Record<string, unknown>;
  try {
    buildInfo = JSON.parse(material.bytes.toString("utf8")) as Record<string, unknown>;
  } catch {
    return empty("BUILD_INFO_UNPARSEABLE");
  }
  if (!isObject(buildInfo)) return empty("BUILD_INFO_NOT_AN_OBJECT");

  /* The obsolete bespoke envelope is refused explicitly rather than falling through to a confusing
   * "missing field" error. Production consumes the compiler's own document or nothing. */
  if ("deployedBytecode" in buildInfo || "immutableReferences" in buildInfo) {
    return empty("BUILD_INFO_IS_THE_OBSOLETE_CUSTOM_ENVELOPE_NOT_HARDHAT_BUILD_INFO");
  }
  if (!("input" in buildInfo) || !("output" in buildInfo)) {
    return empty("BUILD_INFO_NOT_HARDHAT_SHAPED");
  }

  if (buildInfo._format !== "hh-sol-build-info-1") {
    return empty(`BUILD_INFO_FORMAT_MISMATCH:${String(buildInfo._format)}`);
  }

  /* ----- build identity ----- */
  const buildId = typeof buildInfo.id === "string" ? buildInfo.id : "UNRESOLVED";
  if (buildId !== pinned.buildInfoId) failures.push(`BUILD_INFO_ID_MISMATCH:${buildId}`);
  const compilerVersion = typeof buildInfo.solcVersion === "string" ? buildInfo.solcVersion : "UNRESOLVED";
  const solcLongVersion = typeof buildInfo.solcLongVersion === "string" ? buildInfo.solcLongVersion : "UNRESOLVED";
  if (compilerVersion !== pinned.solcVersion) failures.push(`SOLC_VERSION_MISMATCH:${compilerVersion}`);
  if (solcLongVersion !== pinned.solcLongVersion) failures.push(`SOLC_LONG_VERSION_MISMATCH:${solcLongVersion}`);

  const input = buildInfo.input as Record<string, unknown>;
  const output = buildInfo.output as Record<string, unknown>;
  if (!isObject(input) || !isObject(output)) return empty("BUILD_INFO_INPUT_OR_OUTPUT_MALFORMED");

  if (input.language !== "Solidity") {
    failures.push(`BUILD_INFO_LANGUAGE_UNSUPPORTED:${String(input.language)}`);
  }
  const inputSources = isObject(input.sources) ? (input.sources as Record<string, unknown>) : null;
  if (inputSources === null) failures.push("BUILD_INFO_INPUT_SOURCES_ABSENT");
  const outputContracts = isObject(output.contracts) ? (output.contracts as Record<string, unknown>) : null;
  if (outputContracts === null) failures.push("BUILD_INFO_OUTPUT_CONTRACTS_ABSENT");
  const outputSources = isObject(output.sources) ? (output.sources as Record<string, unknown>) : null;
  if (outputSources === null) failures.push("BUILD_INFO_OUTPUT_SOURCES_ABSENT");

  /* ----- the compiler input settings must have requested what we are about to read ----- */
  const settings = isObject(input.settings) ? (input.settings as Record<string, unknown>) : null;
  if (settings === null) {
    failures.push("BUILD_INFO_SETTINGS_ABSENT");
  } else {
    const selection = isObject(settings.outputSelection) ? (settings.outputSelection as Record<string, unknown>) : null;
    if (selection === null) {
      failures.push("BUILD_INFO_OUTPUT_SELECTION_MALFORMED");
    } else {
      let requestedDeployedBytecode = false;
      let requestedAst = false;
      let structurallyValid = true;
      for (const [sourceSelector, contractSelection] of Object.entries(selection)) {
        if (!isObject(contractSelection)) {
          structurallyValid = false;
          continue;
        }
        const sourceMatches = sourceSelector === "*" || sourceSelector === pinned.selectedSourcePath;
        for (const [contractSelector, outputs] of Object.entries(contractSelection)) {
          if (!Array.isArray(outputs) || !outputs.every((entry) => typeof entry === "string")) {
            structurallyValid = false;
            continue;
          }
          if (!sourceMatches) continue;
          const outputNames = outputs as string[];
          if (contractSelector === "" && (outputNames.includes("ast") || outputNames.includes("*"))) {
            requestedAst = true;
          }
          if (
            (contractSelector === "*" || contractSelector === pinned.selectedContractName) &&
            (outputNames.includes("evm.deployedBytecode") || outputNames.includes("*"))
          ) {
            requestedDeployedBytecode = true;
          }
        }
      }
      if (!structurallyValid) failures.push("BUILD_INFO_OUTPUT_SELECTION_MALFORMED");
      if (!requestedDeployedBytecode) failures.push("BUILD_INFO_OUTPUT_SELECTION_MISSING:evm.deployedBytecode");
      if (!requestedAst) failures.push("BUILD_INFO_OUTPUT_SELECTION_MISSING:ast");
    }
  }

  /* ----- CROSS-LINK: the build must have compiled the AUTHENTICATED source ----- */
  const selectedInput = inputSources === null ? null : inputSources[pinned.selectedSourcePath];
  let inputSourceSha256 = "UNRESOLVED";
  if (!isObject(selectedInput) || typeof selectedInput.content !== "string") {
    failures.push(`BUILD_INFO_INPUT_SOURCE_ABSENT:${pinned.selectedSourcePath}`);
  } else {
    inputSourceSha256 = sha256(Buffer.from(selectedInput.content, "utf8"));
    /* CLARIFICATION 6 — the build must have compiled the source the record INDEPENDENTLY
     * authenticated. Without this a correctly shaped, genuinely reproducible build of a different
     * HCULimit would satisfy the gate. The pinned expectation for that source lives in the
     * provenance layer, which the tuple check already enforces. */
    if (authenticatedSourceSha256 === null) {
      failures.push("BUILD_INFO_SOURCE_CROSS_LINK_UNRESOLVED");
    } else if (inputSourceSha256 !== authenticatedSourceSha256) {
      failures.push("BUILD_INFO_COMPILED_A_DIFFERENT_HCULIMIT_SOURCE");
    }
  }

  /* ----- the selected contract ----- */
  const contracts = outputContracts;
  const bySource = contracts === null ? null : contracts[pinned.selectedSourcePath];
  const contract =
    isObject(bySource) && isObject((bySource as Record<string, unknown>)[pinned.selectedContractName])
      ? ((bySource as Record<string, unknown>)[pinned.selectedContractName] as Record<string, unknown>)
      : null;
  if (contract === null) {
    return empty(`BUILD_INFO_CONTRACT_ABSENT:${pinned.selectedSourcePath}:${pinned.selectedContractName}`);
  }
  const evm = isObject(contract.evm) ? (contract.evm as Record<string, unknown>) : null;
  const deployedBytecode =
    evm !== null && isObject(evm.deployedBytecode) ? (evm.deployedBytecode as Record<string, unknown>) : null;
  if (deployedBytecode === null) return empty("BUILD_INFO_DEPLOYED_BYTECODE_ABSENT");

  const objectHex = typeof deployedBytecode.object === "string" ? deployedBytecode.object : null;
  if (objectHex === null || !/^(0x)?[0-9a-fA-F]*$/u.test(objectHex) || objectHex.length < 4) {
    return empty("BUILD_INFO_RUNTIME_ABSENT");
  }
  const runtime = Buffer.from(objectHex.replace(/^0x/u, ""), "hex");
  if (runtime.length !== REPRODUCED_RUNTIME_BYTE_LENGTH) {
    failures.push(`RUNTIME_LENGTH_MISMATCH:${runtime.length}`);
  }

  /* ----- the compiler's own immutable references ----- */
  const immutableReferences = isObject(deployedBytecode.immutableReferences)
    ? (deployedBytecode.immutableReferences as Record<string, unknown>)
    : null;
  if (immutableReferences === null) return empty("BUILD_INFO_IMMUTABLE_REFERENCES_ABSENT");

  /* ----- resolve every immutable id through the AST to its declaration ----- */
  const declarationFor = (astId: number): Record<string, unknown> | null => {
    if (outputSources === null) return null;
    for (const [sourcePath, entry] of Object.entries(outputSources)) {
      if (!isObject(entry)) continue;
      const found = findAstNode((entry as Record<string, unknown>).ast, astId);
      if (found !== null) return { ...found, declarationSource: sourcePath };
    }
    return null;
  };
  if (declarationFor(UUPS_SELF_IMMUTABLE.compilerAstId) === null) {
    failures.push(`BUILD_INFO_OUTPUT_SOURCES_AST_MISSING:${UUPS_SELF_IMMUTABLE.compilerAstId}`);
  }

  const compilerEntries: {
    artifactPlaceholderBytes: string;
    astId: number;
    byteLength: number;
    id: string;
    offset: number;
    referenceKind: string;
  }[] = [];
  const immutableDeclarations: Record<string, unknown>[] = [];

  for (const [astIdText, entries] of Object.entries(immutableReferences)) {
    const astId = Number.parseInt(astIdText, 10);
    if (!Number.isInteger(astId)) {
      failures.push(`IMMUTABLE_ID_MALFORMED:${astIdText}`);
      continue;
    }
    const declaration = declarationFor(astId);
    if (declaration === null) {
      failures.push(`IMMUTABLE_DECLARATION_NOT_FOUND_IN_AST:${astId}`);
      continue;
    }
    if (declaration.nodeType !== "VariableDeclaration" || declaration.mutability !== "immutable") {
      failures.push(`IMMUTABLE_DECLARATION_NOT_AN_IMMUTABLE_VARIABLE:${astId}`);
    }
    immutableDeclarations.push({
      astId,
      declarationSource: String(declaration.declarationSource),
      mutability: String(declaration.mutability),
      name: String(declaration.name),
      nodeType: String(declaration.nodeType),
      stateVariable: declaration.stateVariable === true,
      typeString: String(
        isObject(declaration.typeDescriptions)
          ? (declaration.typeDescriptions as Record<string, unknown>).typeString
          : "UNRESOLVED",
      ),
    });
    if (!Array.isArray(entries)) {
      failures.push(`IMMUTABLE_REFERENCE_LIST_MALFORMED:${astId}`);
      continue;
    }
    for (const [index, reference] of entries.entries()) {
      if (!isObject(reference)) {
        failures.push(`IMMUTABLE_REFERENCE_MALFORMED:${astId}:${index}`);
        continue;
      }
      const offset = Number(reference.start);
      const byteLength = Number(reference.length);
      compilerEntries.push({
        artifactPlaceholderBytes: `0x${runtime.subarray(offset, offset + byteLength).toString("hex")}`,
        astId,
        byteLength,
        id: `solc:immutable:${astId}:${offset}`,
        offset,
        referenceKind: byteLength === UUPS_SELF_IMMUTABLE.wordByteLength ? "PUSH32_WORD_IMMUTABLE" : "UNSUPPORTED",
      });
    }
  }
  if (compilerEntries.length === 0) return empty("BUILD_INFO_IMMUTABLE_REFERENCES_EMPTY");
  compilerEntries.sort((left, right) => left.offset - right.offset);
  immutableDeclarations.sort((left, right) => Number(left.astId) - Number(right.astId));

  /* The reproduced build's immutable is UUPSUpgradeable.__self, and that is what makes the value an
   * IMPLEMENTATION address. If the declaration is anything else, the deployment value shape below
   * would be wrong and normalization must not proceed on a guess. */
  const self = immutableDeclarations.find((entry) => Number(entry.astId) === UUPS_SELF_IMMUTABLE.compilerAstId);
  if (!self) {
    failures.push(`UUPS_SELF_IMMUTABLE_ABSENT:${UUPS_SELF_IMMUTABLE.compilerAstId}`);
  } else {
    if (self.name !== UUPS_SELF_IMMUTABLE.declarationName) failures.push("UUPS_SELF_IMMUTABLE_NAME_MISMATCH");
    if (String(self.declarationSource) !== UUPS_SELF_IMMUTABLE.declarationSource) {
      failures.push(`UUPS_SELF_IMMUTABLE_SOURCE_MISMATCH:${String(self.declarationSource)}`);
    }
    if (self.typeString !== UUPS_SELF_IMMUTABLE.declarationTypeString) {
      failures.push("UUPS_SELF_IMMUTABLE_TYPE_MISMATCH");
    }
    if (self.stateVariable !== UUPS_SELF_IMMUTABLE.stateVariable) failures.push("UUPS_SELF_IMMUTABLE_NOT_STATE");
  }
  for (const entry of compilerEntries) {
    if (entry.astId !== UUPS_SELF_IMMUTABLE.compilerAstId) {
      failures.push(`UNEXPECTED_COMPILER_IMMUTABLE:${entry.astId}`);
    }
    if (entry.referenceKind !== "PUSH32_WORD_IMMUTABLE") {
      failures.push(`UNSUPPORTED_IMMUTABLE_WIDTH:${entry.id}:${entry.byteLength}`);
    }
    if (entry.offset < 1 || entry.offset + entry.byteLength > runtime.length) {
      failures.push(`IMMUTABLE_REFERENCE_OUT_OF_RANGE:${entry.id}`);
      continue;
    }
    /* PUSH32 immediately precedes a 32-byte word immutable. */
    if (runtime[entry.offset - 1] !== 0x7f) failures.push(`IMMUTABLE_REFERENCE_OPCODE:${entry.id}`);
    /* The artifact side of a solc immutable is a zero word. */
    if (entry.artifactPlaceholderBytes !== UUPS_SELF_IMMUTABLE.artifactPlaceholderWordHex) {
      failures.push(`ARTIFACT_PLACEHOLDER_NOT_A_ZERO_WORD:${entry.id}`);
    }
  }
  const offsets = compilerEntries.map((entry) => entry.offset);
  if (JSON.stringify(offsets) !== JSON.stringify([...UUPS_SELF_IMMUTABLE.offsets])) {
    failures.push(`IMMUTABLE_OFFSETS_MISMATCH:${offsets.join(",")}`);
  }
  for (let index = 1; index < compilerEntries.length; index++) {
    const previous = compilerEntries[index - 1];
    if (previous.offset + previous.byteLength > compilerEntries[index].offset) {
      failures.push(`IMMUTABLE_REFERENCE_OVERLAP:${previous.id}`);
    }
  }

  /* ----- metadata trailer ----- */
  const metadata = ((): MetadataInspection | null => {
    try {
      return inspectMetadataTrailer(runtime);
    } catch {
      return null;
    }
  })();
  if (metadata === null) return empty("ARTIFACT_METADATA_UNREADABLE");
  if (metadata.carriesSourceHash) failures.push("ARTIFACT_METADATA_STRUCTURE_UNSUPPORTED");
  const trailer = runtime.subarray(metadata.codeSectionLength);
  if (trailer.length !== REPRODUCED_METADATA_TRAILER.trailerByteLength) {
    failures.push(`METADATA_TRAILER_LENGTH:${trailer.length}`);
  }
  if (`0x${trailer.toString("hex")}` !== REPRODUCED_METADATA_TRAILER.trailerHex) {
    failures.push("METADATA_TRAILER_BYTES_MISMATCH");
  }

  const compilerReferenceManifest = {
    buildId,
    compilerVersion,
    entries: compilerEntries,
    immutableDeclarations,
    provenanceSubject: "CURRENT_OFFICIAL_ARTIFACT_BUILD",
    referencesComplete: true,
    schema: COMPILER_REFERENCE_MANIFEST_SCHEMA,
    solcLongVersion,
    sourceContentSha256: material.contentSha256,
    version: 2,
  };

  const primary = compilerEntries.map((entry, index) => ({
    byteLength: entry.byteLength,
    compilerReferenceId: entry.id,
    expectedArtifactPlaceholderBytes: entry.artifactPlaceholderBytes,
    id: `PRIMARY_UUPS_SELF_${index}`,
    kind: "PUSH32_WORD_IMMUTABLE",
    offset: entry.offset,
  }));

  const normalizationManifest = {
    acceptedMetadataStructure: "CBOR_SOLC_ONLY_NO_SOURCE_HASH",
    compilerVersion,
    deploymentValueShape: "LEFT_PADDED_IMPLEMENTATION_ADDRESS_WORD",
    expectedReplacementCount: primary.length,
    immutableReferenceKind: "PUSH32_WORD_IMMUTABLE",
    metadataModel: "CBOR_SOLC_ONLY_NO_SOURCE_HASH",
    metadataTrailerByteLength: trailer.length,
    metadataTrailerSha256: sha256(trailer),
    primaryImmutableReferences: primary,
    requiredPrecedingOpcode: UUPS_SELF_IMMUTABLE.requiredPrecedingOpcode,
    runtimeByteLength: runtime.length,
    schema: NORMALIZATION_MANIFEST_SCHEMA,
    supplementaryImmutableReferences: [] as Record<string, unknown>[],
    version: 2,
    wordByteLength: UUPS_SELF_IMMUTABLE.wordByteLength,
  };

  /* ----- the expected deployed normalized digest, RECOMPUTED -----
   *
   * The artifact runtime carries zero words at the immutable offsets. The DEPLOYED runtime carries
   * the implementation address left-padded to a word. Reconstruct the deployed form, then normalize
   * it back to the artifact placeholder and hash. The 30 executor PUSH20 constants are untouched
   * throughout: they are code, not deployment-dependent values. */
  const deployedForm = Buffer.from(runtime);
  /* An address that was never supplied is DEFERRED, not malformed: a DIRECT authority's
   * implementation address is only knowable from the live chain, so the digest stays UNRESOLVED
   * and Step 8 recomputes it. An address that WAS supplied but is ill-formed is a real failure. */
  const addressSupplied = deployment.implementationAddress.length > 0;
  const word = addressSupplied ? deploymentValueWord(deployment.implementationAddress) : null;
  if (addressSupplied && word === null) {
    failures.push("IMPLEMENTATION_ADDRESS_MALFORMED");
  } else if (word !== null) {
    for (const reference of primary) word.copy(deployedForm, reference.offset);
  }
  const normalization =
    word === null
      ? { ok: false, failures: [] as string[], replacements: 0, normalizedSha256: "UNRESOLVED" }
      : normalizeRuntimeBytecodeFromManifest(deployedForm, normalizationManifest as never, {
          implementationAddress: deployment.implementationAddress,
        });
  failures.push(...normalization.failures.map((entry) => `ARTIFACT_NORMALIZATION:${entry}`));

  return {
    extractorId: ARTIFACT_BUILD_EXTRACTOR.id,
    extractorVersion: ARTIFACT_BUILD_EXTRACTOR.version,
    sourceContentSha256: material.contentSha256,
    buildInfoId: buildId,
    runtimeByteLength: runtime.length,
    runtimeSha256: sha256(runtime),
    compilerVersion,
    solcLongVersion,
    buildId,
    inputSourceSha256,
    compilerReferenceManifest,
    normalizationManifest,
    expectedNormalizedRuntimeSha256: normalization.ok ? normalization.normalizedSha256 : "UNRESOLVED",
    failures: [...new Set(failures)].sort(),
  };
}

/* The deployment-dependent value for a UUPS `__self` immutable: the implementation address, left
 * padded to a 32-byte word. */
export function deploymentValueWord(implementationAddress: string): Buffer | null {
  const address = implementationAddress.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{40}$/u.test(address)) return null;
  return Buffer.from("00".repeat(UUPS_SELF_IMMUTABLE.leadingZeroByteLength) + address, "hex");
}

/* Depth-first search for an AST node by id. Solc AST nodes nest under varying keys, so the walk is
 * structural rather than schema-specific. */
export function findAstNode(ast: unknown, astId: number): Record<string, unknown> | null {
  if (Array.isArray(ast)) {
    for (const child of ast) {
      const found = findAstNode(child, astId);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isObject(ast)) return null;
  const node = ast as Record<string, unknown>;
  if (node.id === astId && typeof node.nodeType === "string") return node;
  for (const value of Object.values(node)) {
    if (typeof value !== "object" || value === null) continue;
    const found = findAstNode(value, astId);
    if (found !== null) return found;
  }
  return null;
}

/* ---------------------------------------------------------------------------------------------
 * THE ONE DERIVATION.
 *
 * Everything authoritative a run needs comes from here, and everything here comes from
 * authenticated bytes. Both the record validator and the live verifier call it, so there is no
 * second path by which a record-supplied value could reach a verdict.
 * ------------------------------------------------------------------------------------------- */

export type DerivedAuthority = {
  blockers: string[];
  priceSchedule: ExtractedPriceSchedule | null;
  authoritySource: ParsedAuthoritySource | null;
  artifactBuild: ExtractedArtifactBuild | null;
};

export function deriveAuthorityFromSourceMaterial(
  record: AuthorityBindingRecord,
  /* The IMPLEMENTATION address, resolved by the live chain before Step 8 (the ERC-1967 slot for a
   * proxy, the authority address itself for a direct deployment). Offline callers that only need
   * the price schedule and the source parse may leave it unresolved; the artifact extraction then
   * reports a malformed implementation address and blocks, which is the honest outcome. */
  deployment: { implementationAddress: string | null } = { implementationAddress: null },
): DerivedAuthority {
  const blockers: string[] = [];
  const derived: DerivedAuthority = {
    blockers,
    priceSchedule: null,
    authoritySource: null,
    artifactBuild: null,
  };
  /* Offline, the implementation address comes from the record's own pinned policy. The live run
   * overrides it with the address the chain resolved; the implementation-address policy requires
   * the two to agree, so this cannot become a way to normalize against a convenient value. */
  const authority = (record.authority ?? {}) as Record<string, unknown>;
  const policy = isObject(authority.implementationAddressPolicy)
    ? (authority.implementationAddressPolicy as Record<string, unknown>)
    : null;
  const pinnedImplementation =
    typeof policy?.expectedImplementationAddress === "string" ? policy.expectedImplementationAddress : null;
  const implementationAddress = deployment.implementationAddress ?? pinnedImplementation;

  for (const subject of SOURCE_MATERIAL_SUBJECTS) {
    const authentication = authenticateSourceMaterial(record, subject);
    if (!authentication.ok) {
      blockers.push(authentication.reason);
      continue;
    }
    if (subject === "priceSchedule") {
      const schedule = extractPriceSchedule(authentication.material);
      blockers.push(...schedule.failures.map((entry) => `PRICE_SCHEDULE_EXTRACTION:${entry}`));
      derived.priceSchedule = schedule;
    } else if (subject === "authoritySource") {
      const parsed = parseAuthoritySource(authentication.material);
      blockers.push(...parsed.residue.map((entry) => `AUTHORITY_SOURCE_PARSE:${entry}`));
      derived.authoritySource = parsed;
    } else {
      /* The build extraction is cross-linked to the INDEPENDENTLY authenticated authority source,
       * so a correctly shaped and reproducible build of a different HCULimit cannot satisfy it. */
      const authoritySourceTuple = selectedProvenanceTuple(record, "CURRENT_OFFICIAL_AUTHORITY_SOURCE");
      const build = extractArtifactBuild(
        authentication.material,
        { implementationAddress: implementationAddress ?? "" },
        provenanceContentSha256(authoritySourceTuple),
      );
      blockers.push(...build.failures.map((entry) => `ARTIFACT_BUILD_EXTRACTION:${entry}`));
      derived.artifactBuild = build;
    }
  }
  return derived;
}

/* The record's reviewed CLAIMS, compared field by field against what the extractors derived. */
export function compareClaimsAgainstDerivation(record: AuthorityBindingRecord, derived: DerivedAuthority): string[] {
  const errors: string[] = [];
  const artifact = (record.artifact ?? {}) as Record<string, unknown>;
  const schedule = (record.operationSchedule ?? {}) as Record<string, unknown>;
  const enumeration = (record.authorityEnumeration ?? {}) as Record<string, unknown>;
  const enforcement = (record.enforcementProof ?? {}) as Record<string, unknown>;
  const blockOrBatch = (record.blockOrBatch ?? {}) as Record<string, unknown>;

  /* ----- INVARIANT B: the pricing claim must BE the extracted full schedule ----- */
  if (derived.priceSchedule !== null) {
    const extracted = derived.priceSchedule;
    const claimed = isObject(schedule.pricingManifest)
      ? ((schedule.pricingManifest as Record<string, unknown>).entries as Record<string, unknown>[] | undefined)
      : undefined;
    if (!Array.isArray(claimed)) {
      errors.push("binding record pricing manifest carries no entries to compare against the extracted schedule");
    } else {
      const claimedIds = claimed
        .filter(isObject)
        .map((entry) => `${String(entry.canonicalName)}.${String(entry.operandMode)}.${String(entry.costKeyType)}`);
      const extractedIds = extracted.variants.map(
        (variant) => `${variant.canonicalName}.${variant.operandMode}.${variant.costKeyType}`,
      );
      /* Completeness: a record carrying only the SG-4 subset is not the schedule. */
      const missing = extractedIds.filter((id) => !claimedIds.includes(id));
      const spurious = claimedIds.filter((id) => !extractedIds.includes(id));
      if (missing.length > 0) {
        errors.push(
          `binding record pricing manifest is incomplete against the extracted schedule: ${missing.slice(0, 6).join(",")}${missing.length > 6 ? ` +${missing.length - 6}` : ""}`,
        );
      }
      if (spurious.length > 0) {
        errors.push(
          `binding record pricing manifest declares variants the extracted schedule does not price: ${spurious.slice(0, 6).join(",")}`,
        );
      }
      const costByVariant = new Map(extractedIds.map((id, index) => [id, extracted.variants[index].cost]));
      for (const entry of claimed.filter(isObject)) {
        const id = `${String(entry.canonicalName)}.${String(entry.operandMode)}.${String(entry.costKeyType)}`;
        const extractedCost = costByVariant.get(id);
        if (extractedCost !== undefined && entry.cost !== extractedCost) {
          errors.push(`binding record pricing entry ${id} cost disagrees with the extracted schedule`);
        }
      }
    }
  }

  /* ----- INVARIANT D: the enumeration claim must BE the parser output ----- */
  if (derived.authoritySource !== null) {
    const parsed = derived.authoritySource;
    const manifest = isObject(enumeration.manifest) ? (enumeration.manifest as Record<string, unknown>) : null;
    if (manifest === null) {
      errors.push("binding record carries no enumeration manifest to compare against the parsed source");
    } else {
      for (const [field, expected] of [
        ["declarations", parsed.declarations],
        ["callableFunctions", parsed.callableFunctions],
        ["errors", parsed.errors],
        ["mappings", parsed.mappings],
        ["storageStructFields", parsed.storageStructFields],
        ["storagePrimitives", parsed.storagePrimitives],
      ] as [string, string[]][]) {
        const claimed = Array.isArray(manifest[field]) ? (manifest[field] as string[]) : null;
        if (claimed === null || JSON.stringify([...claimed].sort()) !== JSON.stringify(expected)) {
          errors.push(`binding record enumeration ${field} disagrees with the parsed authority source`);
        }
      }
      if (manifest.parseCompleteness !== parsed.parseCompleteness) {
        errors.push("binding record enumeration parseCompleteness disagrees with the parser");
      }
    }
    /* INVARIANT D — the ceiling semantics claim is compared against the derivation. */
    const limits = (record.limits ?? {}) as Record<string, unknown>;
    if (parsed.derivedLimitSemantics === "UNRESOLVED") {
      errors.push("binding record limit semantics cannot be derived: the parsed enforcement paths disagree");
    } else if (limits.semantics !== parsed.derivedLimitSemantics) {
      errors.push(
        `binding record limits.semantics ${String(limits.semantics)} disagrees with the parsed enforcement operator (${parsed.derivedLimitSemantics})`,
      );
    }
    if (limits.enforcementOperator !== undefined) {
      const operators = [...new Set(Object.values(parsed.enforcementOperators))];
      if (operators.length === 1 && limits.enforcementOperator !== operators[0]) {
        errors.push("binding record limits.enforcementOperator disagrees with the parsed source");
      }
    }

    /* The block/batch state must be the PARSER's conclusion, not the record's. */
    if (parsed.blockOrBatchConclusion === "UNRESOLVED") {
      /* CORRECTION 3 — a partial parse blocks. No block/batch state may be claimed from an
       * enumeration that did not account for the whole source. */
      errors.push(
        `binding record claims a block/batch state but the authority source parse is ${parsed.parseCompleteness}: ${parsed.residue.slice(0, 4).join(",")}`,
      );
    }
    const expectedState =
      parsed.blockOrBatchConclusion === "ABSENT" ? "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION" : "PROVEN_PRESENT";
    if (parsed.blockOrBatchConclusion !== "UNRESOLVED" && blockOrBatch.state !== expectedState) {
      errors.push(
        `binding record block/batch state ${String(blockOrBatch.state)} disagrees with the parser conclusion ${parsed.blockOrBatchConclusion}`,
      );
    }
    /* Enforcement-proof entries must name functions the parser actually found, with the parser's
     * constant values and the parser's recomputed source ranges. */
    const entries =
      isObject(enforcement.manifest) && Array.isArray((enforcement.manifest as Record<string, unknown>).entries)
        ? ((enforcement.manifest as Record<string, unknown>).entries as Record<string, unknown>[])
        : [];
    for (const entry of entries.filter(isObject)) {
      const fn = String(entry.enforcementFunction);
      if (!parsed.enforcementFunctions.includes(fn)) {
        errors.push(`binding record enforcement entry names ${fn}, which the parsed source does not enforce with`);
        continue;
      }
      const constantName = String(entry.constantName);
      const parsedValue = parsed.constantValues[constantName];
      if (parsedValue === undefined) {
        errors.push(`binding record enforcement entry names constant ${constantName}, absent from the parsed source`);
      } else if (parsedValue !== entry.constantValue) {
        errors.push(`binding record enforcement entry ${constantName} value disagrees with the parsed source`);
      }
      const declarationRange = parsed.declarationRanges[constantName];
      if (declarationRange !== undefined && entry.declarationSourceRangeSha256 !== declarationRange.sha256) {
        errors.push(`binding record enforcement entry ${constantName} declaration range digest was not recomputed`);
      }
      const enforcementRange = parsed.enforcementRanges[fn];
      if (enforcementRange !== undefined && entry.enforcementSourceRangeSha256 !== enforcementRange.sha256) {
        errors.push(`binding record enforcement entry ${fn} enforcement range digest was not recomputed`);
      }
    }
  }

  /* ----- INVARIANT C: the artifact claims must BE the extractor output ----- */
  if (derived.artifactBuild !== null) {
    const build = derived.artifactBuild;
    if (
      build.expectedNormalizedRuntimeSha256 !== "UNRESOLVED" &&
      artifact.implementationNormalizedRuntimeSha256 !== build.expectedNormalizedRuntimeSha256
    ) {
      errors.push(
        "binding record expected normalized runtime digest was not recomputed from the authenticated artifact build",
      );
    }
    if (artifact.compilerVersion !== build.compilerVersion) {
      errors.push("binding record artifact compilerVersion disagrees with the authenticated build");
    }
    if (canonicalJson(artifact.normalizationManifest) !== canonicalJson(build.normalizationManifest)) {
      errors.push("binding record normalization manifest disagrees with the one derived from the artifact build");
    }
    if (canonicalJson(artifact.compilerReferenceManifest) !== canonicalJson(build.compilerReferenceManifest)) {
      errors.push("binding record compiler reference manifest disagrees with the authenticated build output");
    }
  }
  return errors;
}

/* ---------------------------------------------------------------------------------------------
 * INVARIANT F — verify the measurement toolchain root from the INSTALLATION.
 *
 * Not from the binding record: a record claiming a measurement root cannot also be the evidence
 * for it. The installed package manifest gives the version, the lockfile gives the resolution and
 * integrity, and the execution-relevant files give the content that actually computes HCU.
 * ------------------------------------------------------------------------------------------- */

export type MeasurementRootVerification = {
  result: "VERIFIED" | "MISMATCH" | "UNRESOLVED";
  installedVersion: string;
  lockfileIntegrity: string;
  executionRelevantFiles: string[];
  failures: string[];
};

export function verifyMeasurementToolchainRoot(): MeasurementRootVerification {
  const failures: string[] = [];
  let installedVersion = "UNRESOLVED";
  try {
    const manifest = JSON.parse(readFileSync(join(MOCK_UTILS, "package.json"), "utf8")) as { version?: string };
    installedVersion = typeof manifest.version === "string" ? manifest.version : "UNRESOLVED";
  } catch {
    failures.push("MEASUREMENT_PACKAGE_MANIFEST_UNREADABLE");
  }
  if (installedVersion !== MEASUREMENT_TOOLCHAIN_ROOT.version) {
    failures.push(`MEASUREMENT_INSTALLED_VERSION:${installedVersion}`);
  }

  let lockfileIntegrity = "UNRESOLVED";
  try {
    const lockfile = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");
    const pattern = new RegExp(
      `'${MEASUREMENT_TOOLCHAIN_ROOT.package}@${MEASUREMENT_TOOLCHAIN_ROOT.version}':\\s*\\n\\s*resolution: \\{integrity: (sha512-[A-Za-z0-9+/=]+)\\}`,
      "u",
    );
    const match = pattern.exec(lockfile);
    lockfileIntegrity = match ? match[1] : "UNRESOLVED";
  } catch {
    failures.push("MEASUREMENT_LOCKFILE_UNREADABLE");
  }
  if (lockfileIntegrity !== MEASUREMENT_TOOLCHAIN_ROOT.integrity) {
    failures.push("MEASUREMENT_LOCKFILE_INTEGRITY_MISMATCH");
  }

  /* Only the files that can change a computed HCU number: the calculator and the table it reads. */
  const executionRelevantFiles: string[] = [];
  const expectedByLabel: Readonly<Record<string, { path: string; digest: string }>> = {
    "@fhevm/mock-utils:fhevm/coprocessor/HCUByOperator.ts": {
      path: COST_TABLE_FILE,
      digest: EXPECTED_COST_TABLE_HASH,
    },
    "@fhevm/mock-utils:fhevm/coprocessor/hcu.ts": { path: CALCULATOR_FILE, digest: EXPECTED_CALCULATOR_HASH },
  };
  for (const label of MEASUREMENT_EXECUTION_RELEVANT_FILES) {
    const entry = expectedByLabel[label];
    if (entry === undefined) {
      failures.push(`MEASUREMENT_EXECUTION_FILE_UNDECLARED:${label}`);
      continue;
    }
    let actual = "UNREADABLE";
    try {
      actual = sha256(readFileSync(entry.path));
    } catch {
      actual = "UNREADABLE";
    }
    executionRelevantFiles.push(`${label}:${actual}`);
    if (actual !== entry.digest) failures.push(`MEASUREMENT_EXECUTION_FILE_DRIFT:${label}`);
  }

  return {
    result: failures.length === 0 ? "VERIFIED" : "MISMATCH",
    installedVersion,
    lockfileIntegrity,
    executionRelevantFiles: executionRelevantFiles.sort(),
    failures: [...new Set(failures)].sort(),
  };
}

type ImmutableProvenanceEntry = (typeof IMMUTABLE_PROVENANCE.required)[number];
type SourceFileImmutableProvenanceEntry = Extract<
  ImmutableProvenanceEntry,
  { path: string; contentSha256: string | null }
>;
type ReproducedBuildImmutableProvenanceEntry = Extract<
  ImmutableProvenanceEntry,
  { kind: typeof REPRODUCED_BUILD_PROVENANCE_KIND; buildInfoSha256: string }
>;

function isSourceFileImmutableProvenanceEntry(
  entry: ImmutableProvenanceEntry | undefined,
): entry is SourceFileImmutableProvenanceEntry {
  return entry !== undefined && "path" in entry && "contentSha256" in entry;
}

function isReproducedBuildImmutableProvenanceEntry(
  entry: ImmutableProvenanceEntry | undefined,
): entry is ReproducedBuildImmutableProvenanceEntry {
  return entry !== undefined && "kind" in entry && entry.kind === REPRODUCED_BUILD_PROVENANCE_KIND;
}

export function validateAuthorityBindingRecord(record: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(record)) return ["binding record must be a JSON object"];
  const value = record;

  const topLevel = ["schema", "recordVersion", ...Object.keys(SHAPE.sections)];
  for (const field of topLevel) if (!(field in value)) errors.push(`binding record is missing ${field}`);
  for (const key of Object.keys(value)) {
    if (!topLevel.includes(key)) errors.push(`binding record has an unpermitted field ${key}`);
  }
  if (value.schema !== BINDING_RECORD_SCHEMA) errors.push("binding record schema mismatch");
  if (value.recordVersion !== BINDING_RECORD_VERSION) errors.push("binding record version mismatch");

  /* ----- lineage ----- */
  const lineage = checkSection(value, "lineage", errors);
  if (lineage) {
    for (const field of ["implementationCommit", "implementationTree"] as const) {
      if (typeof lineage[field] !== "string" || !HEX40.test(lineage[field] as string)) {
        errors.push(`binding record lineage ${field} must be a 40-hex object name`);
      }
    }
    if (lineage.benchmarkProtocolSha256 !== EXPECTED_SG4_PROTOCOL_SHA256) {
      errors.push("binding record benchmark protocol digest mismatch");
    }
    if (lineage.authorityProtocolSha256 !== EXPECTED_AUTHORITY_PROTOCOL_SHA256) {
      errors.push("binding record authority protocol digest mismatch");
    }
    if (lineage.permittedBindingPath !== BINDING_RECORD_PATH) errors.push("binding record permitted path mismatch");
    if (typeof lineage.bindingPurpose !== "string" || lineage.bindingPurpose.length === 0) {
      errors.push("binding record bindingPurpose must be a non-empty string");
    }
  }

  /* ----- authority resolution ----- */
  const resolution = checkSection(value, "authorityResolution", errors);
  const claimsResolved = isObject(resolution) && resolution.status === "RESOLVED";
  if (resolution) {
    if (resolution.status !== "RESOLVED" && resolution.status !== "UNRESOLVED") {
      errors.push("binding record authorityResolution.status must be RESOLVED or UNRESOLVED");
    }
    if (typeof resolution.reviewedIndependently !== "boolean") {
      errors.push("binding record authorityResolution.reviewedIndependently must be a boolean");
    }
    if (typeof resolution.reviewStatement !== "string" || resolution.reviewStatement.length === 0) {
      errors.push("binding record authorityResolution.reviewStatement must be a non-empty string");
    }
    if (claimsResolved && resolution.reviewedIndependently !== true) {
      errors.push("binding record claims RESOLVED without independent review");
    }
  }

  /* ----- provenance (F22) -----
   *
   * Exact, unique subjects with no extras, and every tuple pinned against the protocol's
   * prior-reviewed constants. An intentional supersession is a reviewed amendment, never an
   * arbitrary tuple silently accepted here. */
  const provenance = checkSection(value, "provenance", errors);
  const expectedProvenance = new Map(IMMUTABLE_PROVENANCE.required.map((entry) => [entry.subject as string, entry]));
  if (provenance) {
    if (provenance.reverificationStatus !== "REVERIFIED" && provenance.reverificationStatus !== "PENDING") {
      errors.push("binding record provenance.reverificationStatus must be REVERIFIED or PENDING");
    }

    /* Reviewed amendments, keyed by subject. */
    const amendedSubjects = new Set<string>();
    const amendmentBySubject = new Map<string, Record<string, unknown>>();
    if (!Array.isArray(provenance.amendments)) {
      errors.push("binding record provenance.amendments must be an array");
    } else {
      for (const [index, amendment] of provenance.amendments.entries()) {
        if (!isObject(amendment)) {
          errors.push(`binding record provenance amendment ${index} must be an object`);
          continue;
        }
        const subject = amendment.subject;
        const expected = typeof subject === "string" ? expectedProvenance.get(subject) : undefined;
        /* Reproduced-build evidence is pinned as a build-info identity, not as a source-file
         * tuple. The amendment schema is intentionally source-file-only, so reject this case
         * before any path/contentSha256 requirements can be applied to it. */
        if (isReproducedBuildImmutableProvenanceEntry(expected)) {
          errors.push(`binding record provenance amendment ${index} may not amend a REPRODUCED_BUILD entry`);
          continue;
        }
        for (const field of SHAPE.amendmentFields) {
          if (!(field in amendment)) errors.push(`binding record provenance amendment ${index} is missing ${field}`);
        }
        for (const key of Object.keys(amendment)) {
          if (!(SHAPE.amendmentFields as readonly string[]).includes(key)) {
            errors.push(`binding record provenance amendment ${index} has an unpermitted field ${key}`);
          }
        }
        if (typeof subject !== "string" || !(SHAPE.provenanceSubjects as readonly string[]).includes(subject)) {
          errors.push(`binding record provenance amendment ${index} names an unknown subject`);
          continue;
        }
        if (amendedSubjects.has(subject)) {
          errors.push(`binding record provenance carries more than one amendment for ${subject}`);
        }
        /* The amendment must name the EXACT superseded tuple, not merely the old commit. */
        if (isReproducedBuildImmutableProvenanceEntry(expected)) {
          errors.push(`binding record provenance amendment ${index} may not amend a REPRODUCED_BUILD entry`);
        } else if (isSourceFileImmutableProvenanceEntry(expected)) {
          if (amendment.supersedesCommit !== expected.commit) {
            errors.push(`binding record provenance amendment ${index} does not supersede the prior-reviewed commit`);
          }
          if (amendment.supersedesPath !== expected.path || amendment.supersedesRepository !== expected.repository) {
            errors.push(`binding record provenance amendment ${index} does not name the exact superseded tuple`);
          }
          /* An amendment that changes nothing is not an amendment. */
          if (
            amendment.repository === expected.repository &&
            amendment.tag === expected.tag &&
            amendment.commit === expected.commit &&
            amendment.path === expected.path &&
            amendment.contentSha256 === expected.contentSha256
          ) {
            errors.push(`binding record provenance amendment ${index} changes nothing`);
          }
        }
        if (typeof amendment.reviewRecordSha256 !== "string" || !HEX64.test(amendment.reviewRecordSha256)) {
          errors.push(`binding record provenance amendment ${index} requires a canonical review-record digest`);
        }
        if (typeof amendment.repository !== "string" || !amendment.repository.startsWith("https://")) {
          errors.push(`binding record provenance amendment ${index} repository must be an https URL`);
        }
        if (typeof amendment.path !== "string" || amendment.path.length === 0) {
          errors.push(`binding record provenance amendment ${index} requires a path`);
        }
        if (amendment.tag !== null && typeof amendment.tag !== "string") {
          errors.push(`binding record provenance amendment ${index} tag must be a string or null`);
        }
        if (typeof amendment.reviewedBy !== "string" || amendment.reviewedBy.length === 0) {
          errors.push(`binding record provenance amendment ${index} requires an explicit reviewer`);
        }
        if (typeof amendment.reason !== "string" || amendment.reason.length === 0) {
          errors.push(`binding record provenance amendment ${index} requires an explicit reason`);
        }
        if (typeof amendment.commit !== "string" || !HEX40.test(amendment.commit)) {
          errors.push(`binding record provenance amendment ${index} commit must be a 40-hex object name`);
        }
        if (typeof amendment.contentSha256 !== "string" || !HEX64.test(amendment.contentSha256)) {
          errors.push(`binding record provenance amendment ${index} contentSha256 must be a 64-hex digest`);
        }
        amendedSubjects.add(subject);
        amendmentBySubject.set(subject, amendment);
      }
      /* An amendment whose subject carries no entry amends nothing. */
      if (Array.isArray(provenance.entries)) {
        const entrySubjects = new Set(provenance.entries.filter(isObject).map((entry) => entry.subject as string));
        for (const subject of amendedSubjects) {
          if (!entrySubjects.has(subject)) {
            errors.push(`binding record provenance amendment for ${subject} is unused`);
          }
        }
      }
    }

    if (!Array.isArray(provenance.entries)) {
      errors.push("binding record provenance.entries must be an array");
    } else {
      const seen = new Set<string>();
      for (const [index, entry] of provenance.entries.entries()) {
        if (!isObject(entry)) {
          errors.push(`binding record provenance entry ${index} must be an object`);
          continue;
        }
        /* A reproduced build is not a committed file: it carries build evidence instead of a
         * repository `path`, so it is closed against its own field set. */
        const isReproducedBuild = REPRODUCED_BUILD_SUBJECTS.includes(String(entry.subject));
        const entryFields: readonly string[] = isReproducedBuild
          ? REPRODUCED_BUILD_ENTRY_FIELDS
          : SHAPE.provenanceEntryFields;
        for (const field of entryFields) {
          if (!(field in entry)) errors.push(`binding record provenance entry ${index} is missing ${field}`);
        }
        for (const key of Object.keys(entry)) {
          if (!entryFields.includes(key)) {
            errors.push(`binding record provenance entry ${index} has an unpermitted field ${key}`);
          }
        }
        const subject = entry.subject;
        if (typeof subject !== "string" || !(SHAPE.provenanceSubjects as readonly string[]).includes(subject)) {
          errors.push(`binding record provenance entry ${index} names an unknown subject`);
          continue;
        }
        if (seen.has(subject)) errors.push(`binding record provenance duplicates the ${subject} subject`);
        seen.add(subject);

        if (isReproducedBuild) {
          /* The reproduction was performed twice from clean checkouts and agreed byte for byte, so
           * every one of these is a PINNED expectation. A record cannot nominate an arbitrary
           * 64-hex build digest and mark it reverified. */
          const pinned = REPRODUCED_OFFICIAL_BUILD;
          if (entry.kind !== REPRODUCED_BUILD_PROVENANCE_KIND) {
            errors.push(`binding record provenance ${subject} must declare kind ${REPRODUCED_BUILD_PROVENANCE_KIND}`);
          }
          const expectedFacts: [string, unknown][] = [
            ["repository", pinned.repository],
            ["tag", pinned.tag],
            ["commit", pinned.commit],
            ["buildRoot", pinned.buildRoot],
            ["selectedSourcePath", pinned.selectedSourcePath],
            ["selectedContractName", pinned.selectedContractName],
            ["buildInfoId", pinned.buildInfoId],
            /* CL4 — the CONTENT digests are Commit A's expectation of the external build, and only
             * the real bytes can produce them. They are enforced at the gate (validateAuthorityResult)
             * rather than here, so a record that supplies a different build is BLOCKED rather than
             * malformed. Every other reproduction fact is structural and is checked right here. */
            ["solcVersion", pinned.solcVersion],
            ["solcLongVersion", pinned.solcLongVersion],
            ["dependencyLockSha256", pinned.dependencyLockSha256],
            ["hardhatConfigSha256", pinned.hardhatConfigSha256],
            ["generatedHostAddressesSha256", pinned.generatedHostAddressesSha256],
            ["aclAddress", pinned.aclAddress],
            ["fhevmExecutorAddress", pinned.fhevmExecutorAddress],
            ["reproductionCommand", pinned.reproductionCommand],
          ];
          for (const [field, expectedValue] of expectedFacts) {
            if (entry[field] !== expectedValue) {
              errors.push(`binding record provenance ${subject} ${field} does not match the pinned reproduced build`);
            }
          }
          if (typeof entry.reverified !== "boolean") {
            errors.push(`binding record provenance ${subject} reverified must be a boolean`);
          }
          /* A reproduced build is committed at no repository path, so claiming one is an error. */
          if ("path" in entry && entry.path !== null) {
            errors.push(`binding record provenance ${subject} may not claim a repository path`);
          }
          continue;
        }
        if (typeof entry.reverified !== "boolean") {
          errors.push(`binding record provenance entry ${index} reverified must be a boolean`);
        }

        /* The tuple must equal the prior-reviewed expectation, unless a reviewed amendment for
         * this subject supersedes it. Arbitrary tuples are never accepted. */
        const expected = expectedProvenance.get(subject);
        const amendment = amendmentBySubject.get(subject);
        if (amendment) {
          /* F29 — a superseded entry must match the amendment EXACTLY in every tuple field. An
           * amendment exempts a subject from the prior-reviewed tuple; it never licenses an
           * arbitrary entry. */
          if ("kind" in entry && entry.kind === REPRODUCED_BUILD_PROVENANCE_KIND) {
            errors.push(`binding record provenance ${subject} may not use a source-file amendment`);
          } else {
            for (const tupleField of ["repository", "tag", "commit", "path", "contentSha256"] as const) {
              if (entry[tupleField] !== amendment[tupleField]) {
                errors.push(`binding record provenance ${subject} ${tupleField} does not match its amendment`);
              }
            }
          }
        }
        if (!amendedSubjects.has(subject) && isReproducedBuildImmutableProvenanceEntry(expected)) {
          if (entry.buildInfoSha256 !== expected.buildInfoSha256) {
            errors.push(`binding record provenance ${subject} buildInfoSha256 does not match the prior-reviewed tuple`);
          }
        } else if (!amendedSubjects.has(subject) && isSourceFileImmutableProvenanceEntry(expected)) {
          if (entry.repository !== expected.repository) {
            errors.push(`binding record provenance ${subject} repository does not match the prior-reviewed tuple`);
          }
          if (entry.tag !== expected.tag) {
            errors.push(`binding record provenance ${subject} tag does not match the prior-reviewed tuple`);
          }
          if (entry.commit !== expected.commit) {
            errors.push(`binding record provenance ${subject} commit does not match the prior-reviewed tuple`);
          }
          if (entry.path !== expected.path) {
            errors.push(`binding record provenance ${subject} path does not match the prior-reviewed tuple`);
          }
          /* Two subjects have a known expected content hash; the others are established by
           * reverification and must at least be well formed. */
          if (expected.contentSha256 !== null && entry.contentSha256 !== expected.contentSha256) {
            errors.push(`binding record provenance ${subject} contentSha256 does not match the prior-reviewed tuple`);
          }
        }
        if ("kind" in entry && entry.kind === REPRODUCED_BUILD_PROVENANCE_KIND) {
          if (typeof entry.buildInfoSha256 !== "string" || !HEX64.test(entry.buildInfoSha256)) {
            errors.push(`binding record provenance entry ${index} buildInfoSha256 must be a 64-hex digest`);
          }
        } else if (typeof entry.contentSha256 !== "string" || !HEX64.test(entry.contentSha256)) {
          errors.push(`binding record provenance entry ${index} contentSha256 must be a 64-hex digest`);
        }
      }
      /* Exact set: nothing missing, nothing extra. */
      for (const subject of SHAPE.provenanceSubjects) {
        if (!seen.has(subject)) errors.push(`binding record provenance is missing the ${subject} subject`);
      }
      if (provenance.entries.length !== SHAPE.provenanceSubjects.length) {
        errors.push("binding record provenance must carry exactly the declared subjects and no others");
      }
      if (claimsResolved) {
        if (provenance.reverificationStatus !== "REVERIFIED") {
          errors.push("binding record claims RESOLVED while provenance reverification is still PENDING");
        }
        for (const [index, entry] of provenance.entries.entries()) {
          if (!isObject(entry)) continue;
          if (entry.reverified !== true) {
            errors.push(`binding record claims RESOLVED while provenance entry ${index} is not reverified`);
          }
          /* A reproduced build carries its content hash as `buildInfoSha256`; it has no committed
           * file and therefore no `contentSha256`. */
          const entryContentHash = REPRODUCED_BUILD_SUBJECTS.includes(String(entry.subject))
            ? entry.buildInfoSha256
            : entry.contentSha256;
          if (typeof entryContentHash !== "string" || !HEX64.test(entryContentHash)) {
            errors.push(`binding record claims RESOLVED without a reverified content hash for entry ${index}`);
          }
        }
      }
    }
  }

  /* ----- artifact ----- */
  const artifact = checkSection(value, "artifact", errors);
  if (artifact) {
    for (const field of ["id", "release", "compilerVersion", "metadataModel"] as const) {
      if (typeof artifact[field] !== "string" || (artifact[field] as string).length === 0) {
        errors.push(`binding record artifact.${field} must be a non-empty string`);
      }
    }
    if (artifact.id === ARTIFACT_IDENTITY_ROOTS.localInstalledFixture.id) {
      errors.push("binding record artifact.id may not be the local installed fixture");
    }
    if (
      typeof artifact.implementationNormalizedRuntimeSha256 !== "string" ||
      !HEX64.test(artifact.implementationNormalizedRuntimeSha256 as string)
    ) {
      errors.push("binding record artifact.implementationNormalizedRuntimeSha256 must be a 64-hex digest");
    }
    /* INVARIANT E — provenance is decided by PROVENANCE.
     *
     * This used to refuse any artifact whose normalized digest equalled the local 0.10.0 fixture's,
     * inferring staleness from value equality. A legitimate official artifact that happened to
     * normalize to the same bytes would have been rejected for a coincidence, and the check bought
     * nothing: the digest is now RECOMPUTED from the authenticated build the selected tuple names,
     * so what the old fixture happens to hash to is irrelevant either way. */
    if (
      typeof artifact.normalizationManifestSha256 !== "string" ||
      !HEX64.test(artifact.normalizationManifestSha256 as string)
    ) {
      errors.push("binding record artifact.normalizationManifestSha256 must be a 64-hex digest");
    }
    /* F19 — the manifest is fully validated AND its digest is recomputed from the canonical
     * serialization. A digest never validates merely by being 64 hex characters. */
    const manifest = artifact.normalizationManifest;
    for (const error of validateNormalizationManifest(manifest)) errors.push(`binding record ${error}`);
    if (isObject(manifest)) {
      if (artifact.normalizationManifestSha256 !== normalizationManifestDigest(manifest)) {
        errors.push("binding record normalizationManifestSha256 does not recompute from the manifest");
      }
      if (manifest.compilerVersion !== artifact.compilerVersion) {
        errors.push("binding record artifact compilerVersion disagrees with its normalization manifest");
      }
      if (manifest.metadataModel !== artifact.metadataModel) {
        errors.push("binding record artifact metadataModel disagrees with its normalization manifest");
      }
    }
    /* F22 — the artifact is cross-linked to its provenance subject. */
    if (artifact.provenanceSubject !== "CURRENT_OFFICIAL_AUTHORITY_SOURCE") {
      errors.push("binding record artifact must cite the current official authority source subject");
    }
  }

  /* ----- executor deployment chain ----- */
  const executor = checkSection(value, "executor", errors);
  if (executor) {
    if (executor.address !== SEPOLIA_EXECUTOR_ADDRESS) {
      errors.push("binding record executor.address must be the committed executor address");
    }
    /* F21 — the executor model is restricted to DIRECT. A proxied executor would need its
     * implementation resolved, read, code-identified and version-checked, and getHCULimitAddress()
     * bound to that chain; none of that exists, so the model is refused rather than half-checked. */
    if (
      typeof executor.deploymentModel !== "string" ||
      !EXECUTOR_DEPLOYMENT_MODELS.includes(executor.deploymentModel)
    ) {
      errors.push(
        "binding record executor.deploymentModel must be DIRECT; a proxied executor is not supported and is refused rather than partially verified",
      );
    }
    if (typeof executor.expectedRuntimeSha256 !== "string" || !HEX64.test(executor.expectedRuntimeSha256 as string)) {
      errors.push("binding record executor.expectedRuntimeSha256 must be a 64-hex digest");
    }
    if (typeof executor.expectedVersion !== "string" || (executor.expectedVersion as string).length === 0) {
      errors.push("binding record executor.expectedVersion must be a non-empty string");
    }
    /* F22 — the executor is cross-linked to the installed Solidity configuration that names it. */
    if (executor.provenanceSubject !== "INSTALLED_SOLIDITY_CONFIGURATION") {
      errors.push("binding record executor must cite the installed Solidity configuration subject");
    }
  }

  /* ----- authority deployment chain ----- */
  const authority = checkSection(value, "authority", errors);
  if (authority) {
    if (authority.addressDerivation !== "FROM_VERIFIED_EXECUTOR_GETTER") {
      errors.push("binding record authority.addressDerivation must derive from the verified executor");
    }
    if (typeof authority.deploymentModel !== "string" || !DEPLOYMENT_MODELS.includes(authority.deploymentModel)) {
      errors.push("binding record authority.deploymentModel must be a declared deployment model");
    }
    if (
      typeof authority.implementationResolutionMechanism !== "string" ||
      !IMPLEMENTATION_RESOLUTION_MECHANISMS.includes(authority.implementationResolutionMechanism)
    ) {
      errors.push("binding record authority.implementationResolutionMechanism must be a declared mechanism");
    }
    if (authority.deploymentModel === "ERC1967_PROXY") {
      if (authority.implementationResolutionMechanism !== "ERC1967_STORAGE_SLOT") {
        errors.push("a proxied authority must resolve its implementation from the ERC-1967 storage slot");
      }
      if (authority.implementationSlot !== ERC1967_IMPLEMENTATION_SLOT) {
        errors.push("binding record authority.implementationSlot must be the exact ERC-1967 slot");
      }
      if (
        typeof authority.expectedProxyRuntimeSha256 !== "string" ||
        !HEX64.test(authority.expectedProxyRuntimeSha256 as string)
      ) {
        errors.push("a proxied authority requires authority.expectedProxyRuntimeSha256");
      }
    } else {
      if (authority.implementationResolutionMechanism !== "NOT_APPLICABLE_DIRECT_DEPLOYMENT") {
        errors.push("a direct authority may not declare an implementation resolution mechanism");
      }
      if (authority.implementationSlot !== null) errors.push("a direct authority must record implementationSlot null");
      if (authority.expectedProxyRuntimeSha256 !== null) {
        errors.push("a direct authority must record expectedProxyRuntimeSha256 null");
      }
    }

    /* F38 — the implementation-address policy. A proxied authority must declare one; a direct
     * authority has no separate implementation and must declare none. */
    const policy = authority.implementationAddressPolicy;
    if (authority.deploymentModel !== "ERC1967_PROXY") {
      if (policy !== null) errors.push("a direct authority must record implementationAddressPolicy null");
    } else if (!isObject(policy)) {
      errors.push("a proxied authority requires a closed implementationAddressPolicy");
    } else {
      for (const key of Object.keys(policy)) {
        if (!IMPLEMENTATION_ADDRESS_POLICY_FIELDS.includes(key)) {
          errors.push(`binding record implementationAddressPolicy has an unpermitted field ${key}`);
        }
      }
      for (const field of IMPLEMENTATION_ADDRESS_POLICY_FIELDS) {
        if (!(field in policy)) errors.push(`binding record implementationAddressPolicy is missing ${field}`);
      }
      if (typeof policy.kind !== "string" || !IMPLEMENTATION_ADDRESS_POLICY_KINDS.includes(policy.kind)) {
        errors.push("binding record implementationAddressPolicy.kind must be a declared policy kind");
      }
      /* Either policy is a reviewed decision, so both carry the review evidence. */
      if (typeof policy.reviewedBy !== "string" || (policy.reviewedBy as string).length === 0) {
        errors.push("binding record implementationAddressPolicy requires an independent reviewer");
      }
      if (typeof policy.reviewRecordSha256 !== "string" || !HEX64.test(policy.reviewRecordSha256 as string)) {
        errors.push("binding record implementationAddressPolicy requires a canonical review-record digest");
      }
      const conditions = policy.permittedConditions;
      if (!Array.isArray(conditions)) {
        errors.push("binding record implementationAddressPolicy.permittedConditions must be an array");
      } else if (policy.kind === "EXACT_PINNED_ADDRESS") {
        if (conditions.length !== 0) {
          errors.push("an exact-address policy permits no upgrade conditions");
        }
        if (
          typeof policy.expectedImplementationAddress !== "string" ||
          !ADDRESS.test(policy.expectedImplementationAddress)
        ) {
          errors.push("an exact-address policy requires the pinned implementation address");
        }
      } else if (policy.kind === "REVIEWED_CODE_IDENTICAL_UPGRADE") {
        if (policy.expectedImplementationAddress !== null) {
          errors.push("a code-identical upgrade policy pins no address and must record null");
        }
        if (conditions.length === 0) {
          errors.push("a code-identical upgrade policy requires its permitted conditions");
        }
        for (const condition of conditions) {
          if (typeof condition !== "string" || !IMPLEMENTATION_ADDRESS_PERMITTED_CONDITIONS.includes(condition)) {
            errors.push(
              `binding record implementationAddressPolicy permits an undeclared condition ${String(condition)}`,
            );
          }
        }
        const sorted = [...(conditions as string[])].sort();
        if (JSON.stringify(sorted) !== JSON.stringify(conditions)) {
          errors.push("binding record implementationAddressPolicy conditions must be sorted and unique");
        }
        /* A code-identical upgrade is only reviewable if identity itself is one of the conditions. */
        if (!(conditions as string[]).includes("NORMALIZED_RUNTIME_IDENTITY_UNCHANGED")) {
          errors.push("a code-identical upgrade policy must require unchanged normalized runtime identity");
        }
      }
      /* The digest covers everything except itself, so a reviewed policy cannot be edited after
       * review without the digest ceasing to recompute. */
      if (typeof policy.policyDigest !== "string" || !HEX64.test(policy.policyDigest as string)) {
        errors.push("binding record implementationAddressPolicy requires a 64-hex policy digest");
      } else {
        const covered = Object.fromEntries(Object.entries(policy).filter(([key]) => key !== "policyDigest"));
        if (policy.policyDigest !== sha256(canonicalJson(covered))) {
          errors.push("binding record implementationAddressPolicy digest does not recompute from the policy");
        }
      }
    }
    if (
      typeof authority.expectedImplementationVersion !== "string" ||
      (authority.expectedImplementationVersion as string).length === 0
    ) {
      errors.push("binding record authority.expectedImplementationVersion must be a non-empty string");
    }
    if (
      typeof authority.expectedImplementationNormalizedRuntimeSha256 !== "string" ||
      !HEX64.test(authority.expectedImplementationNormalizedRuntimeSha256 as string)
    ) {
      errors.push("binding record authority.expectedImplementationNormalizedRuntimeSha256 must be a 64-hex digest");
    }
    if (
      artifact &&
      authority.expectedImplementationNormalizedRuntimeSha256 !== artifact.implementationNormalizedRuntimeSha256
    ) {
      errors.push("the authority implementation hash disagrees with the artifact hash; that is cross-version mixing");
    }
  }

  /* ----- operation schedule ----- */
  const schedule = checkSection(value, "operationSchedule", errors);
  if (schedule) {
    /* F20 — a canonical pricing manifest with costs, operand modes, arity and result types, whose
     * digest recomputes from its canonical serialization. */
    for (const error of validatePricingManifest(schedule.pricingManifest)) errors.push(`binding record ${error}`);
    if (typeof schedule.pricingManifestSha256 !== "string" || !HEX64.test(schedule.pricingManifestSha256 as string)) {
      errors.push("binding record operationSchedule.pricingManifestSha256 must be a 64-hex digest");
    } else if (isObject(schedule.pricingManifest)) {
      if (schedule.pricingManifestSha256 !== pricingManifestDigest(schedule.pricingManifest)) {
        errors.push("binding record pricingManifestSha256 does not recompute from the pricing manifest");
      }
    }
    if (typeof schedule.source !== "string" || (schedule.source as string).length === 0) {
      errors.push("binding record operationSchedule.source must be a non-empty string");
    }
    /* F22 — cross-linked to the official price-schedule provenance subject. */
    if (schedule.provenanceSubject !== "CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE") {
      errors.push("binding record operationSchedule must cite the current official price schedule subject");
    }
  }

  /* Looked up early so the limits and block/batch blocks can reference it. */
  const enforcementProofSection = value.enforcementProof;

  /* ----- F36: one selected-provenance resolution, and every cross-link checked against it -----
   *
   * The selection is the entries as they stand after amendments, which the amendment rules already
   * force to agree. Every reference below is compared to the exact tuple, never to a subject name.
   */
  const selected = selectedProvenanceMap(value as unknown as AuthorityBindingRecord);

  /* INVARIANTS B/C/D — authenticate the supplied bytes and recompute every authoritative fact from
   * them, then compare the record's reviewed claims against what was derived. A record whose
   * claims disagree with its own authenticated sources is INVALID. */
  const derived = deriveAuthorityFromSourceMaterial(value as unknown as AuthorityBindingRecord);
  for (const blocker of derived.blockers) errors.push(`binding record ${blocker}`);
  for (const error of compareClaimsAgainstDerivation(value as unknown as AuthorityBindingRecord, derived)) {
    errors.push(error);
  }
  const authorityTuple = selected.get("CURRENT_OFFICIAL_AUTHORITY_SOURCE") ?? null;
  const priceTuple = selected.get("CURRENT_OFFICIAL_OPERATION_PRICE_SCHEDULE") ?? null;
  const configTuple = selected.get("INSTALLED_SOLIDITY_CONFIGURATION") ?? null;
  const crossLink = (id: string, actual: unknown, expected: string | null): void => {
    if (expected === null) {
      errors.push(`binding record cross-link ${id} has no selected provenance tuple to bind to`);
      return;
    }
    if (actual !== expected) {
      errors.push(`binding record cross-link ${id} must equal the selected tuple ${expected}`);
    }
  };

  if (artifact) {
    /* F35 — the compiler's immutable-reference output, digest-bound and cross-linked. */
    for (const error of validateCompilerReferenceManifest(artifact.compilerReferenceManifest)) {
      errors.push(`binding record ${error}`);
    }
    if (
      typeof artifact.compilerReferenceManifestSha256 !== "string" ||
      !HEX64.test(artifact.compilerReferenceManifestSha256 as string)
    ) {
      errors.push("binding record artifact.compilerReferenceManifestSha256 must be a 64-hex digest");
    } else if (artifact.compilerReferenceManifestSha256 !== sha256(canonicalJson(artifact.compilerReferenceManifest))) {
      errors.push("binding record compilerReferenceManifestSha256 does not recompute from the manifest");
    }
    if (isObject(artifact.compilerReferenceManifest)) {
      crossLink(
        "IMMUTABLE_REFERENCE_SOURCE",
        (artifact.compilerReferenceManifest as Record<string, unknown>).sourceContentSha256,
        provenanceContentSha256(selected.get("CURRENT_OFFICIAL_ARTIFACT_BUILD") ?? null),
      );
      if (
        (artifact.compilerReferenceManifest as Record<string, unknown>).compilerVersion !== artifact.compilerVersion
      ) {
        errors.push("binding record compiler reference manifest was emitted by a different compiler version");
      }
    }
    for (const error of crossLinkImmutableReferences(
      artifact.normalizationManifest,
      artifact.compilerReferenceManifest,
    )) {
      errors.push(`binding record ${error}`);
    }
    crossLink("ARTIFACT_SOURCE", artifact.sourceReference, sourceFileCanonicalReference(authorityTuple));
    crossLink("ARTIFACT_RELEASE", artifact.release, authorityTuple?.tag ?? null);
  }
  if (executor) {
    crossLink(
      "EXECUTOR_CONFIGURATION_SOURCE",
      executor.configurationSourceReference,
      sourceFileCanonicalReference(configTuple),
    );
  }
  if (schedule) {
    crossLink("PRICE_SCHEDULE_SOURCE", schedule.source, sourceFileCanonicalReference(priceTuple));
    const pricing = schedule.pricingManifest;
    if (isObject(pricing) && Array.isArray(pricing.entries)) {
      const expected = sourceFileCanonicalReference(priceTuple);
      for (const [index, entry] of pricing.entries.entries()) {
        if (!isObject(entry)) continue;
        crossLink(`PRICING_ENTRY_SOURCE[${index}]`, entry.sourceReference, expected);
      }
    }
  }
  /* The record's claim about the installed calculator and cost table must equal the calculator and
   * cost table SG-4 actually measures with; otherwise it describes a toolchain nobody used. */
  crossLink(
    "CALCULATOR_CONTENT",
    provenanceContentSha256(selected.get("INSTALLED_CALCULATOR") ?? null),
    EXPECTED_CALCULATOR_HASH,
  );
  crossLink(
    "COST_TABLE_CONTENT",
    provenanceContentSha256(selected.get("INSTALLED_OPERATION_COST_TABLE") ?? null),
    EXPECTED_COST_TABLE_HASH,
  );

  /* ----- limits and enforcement semantics ----- */
  const limits = checkSection(value, "limits", errors);
  if (limits) {
    const semantics = limits.semantics as LiveLimitSemantics;
    if (typeof semantics !== "string" || !LIVE_LIMIT_SEMANTICS_VALUES.includes(semantics)) {
      errors.push("binding record limits.semantics must be a declared enum value");
    }
    if (claimsResolved && semantics === "UNRESOLVED") {
      errors.push("binding record claims RESOLVED with UNRESOLVED limit semantics");
    }
    if (limits.enforcementOperator !== ">" && limits.enforcementOperator !== ">=") {
      errors.push("binding record limits.enforcementOperator must be > or >=");
    }
    if (typeof limits.configuredCeilingInclusive !== "boolean") {
      errors.push("binding record limits.configuredCeilingInclusive must be a boolean");
    }
    /* Operator, inclusivity and enum must agree. */
    const expectedInclusive = semantics === "CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN";
    const expectedOperator = expectedInclusive ? ">" : ">=";
    if (semantics !== "UNRESOLVED") {
      if (limits.configuredCeilingInclusive !== expectedInclusive) {
        errors.push("binding record limits inclusivity contradicts the declared semantics");
      }
      if (limits.enforcementOperator !== expectedOperator) {
        errors.push("binding record limits enforcement operator contradicts the declared semantics");
      }
    }
    if (!Array.isArray(limits.enforcementPaths) || limits.enforcementPaths.length === 0) {
      errors.push("binding record limits.enforcementPaths must be a non-empty array");
    }
    /* The two per-transaction ceilings have ONE source: they are protocol-pinned, and the record
     * must carry exactly those values, so record, on-chain reading, result field and PASS
     * validator can never refer to different numbers. */
    if (limits.expectedTransactionTotal !== TRANSACTION_TOTAL_HCU_LIMIT.toString(10)) {
      errors.push("binding record limits.expectedTransactionTotal must equal the protocol-pinned transaction total");
    }
    if (limits.expectedTransactionDepth !== TRANSACTION_DEPTH_HCU_LIMIT.toString(10)) {
      errors.push("binding record limits.expectedTransactionDepth must equal the protocol-pinned transaction depth");
    }
    for (const field of ["expectedTransactionTotal", "expectedTransactionDepth"] as const) {
      if (typeof limits[field] !== "string" || !DECIMAL.test(limits[field] as string)) {
        errors.push(`binding record limits.${field} must be a decimal string`);
      }
    }

    /* F24 — availability. The mandatory controls may never be a generic NOT_APPLICABLE. */
    const availability = limits.getterAvailability;
    if (!isObject(availability)) {
      errors.push("binding record limits.getterAvailability must be an object");
    } else {
      for (const field of SHAPE.getterAvailabilityFields) {
        if (!(field in availability)) {
          errors.push(`binding record getterAvailability is missing ${field}`);
          continue;
        }
        const declared = availability[field];
        const mandatory = (SHAPE.mandatoryLimitFields as readonly string[]).includes(field);
        const permitted = mandatory ? MANDATORY_LIMIT_AVAILABILITY : OPTIONAL_LIMIT_AVAILABILITY;
        if (typeof declared !== "string" || !permitted.includes(declared)) {
          errors.push(
            mandatory
              ? `binding record getterAvailability.${field} is mandatory and must be AVAILABLE_AND_READ_ON_CHAIN or ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT; a generic NOT_APPLICABLE may not stand in`
              : `binding record getterAvailability.${field} must be a declared availability state`,
          );
        }
      }
      for (const key of Object.keys(availability)) {
        if (!(SHAPE.getterAvailabilityFields as readonly string[]).includes(key)) {
          errors.push(`binding record getterAvailability has an unpermitted field ${key}`);
        }
      }
    }

    /* F24 — artifact-only proof needs machine-verifiable enforcement evidence, not prose. */
    const evidence = limits.enforcementEvidence;
    if (!isObject(evidence)) {
      errors.push("binding record limits.enforcementEvidence must be an object");
    } else {
      for (const key of Object.keys(evidence)) {
        if (!(SHAPE.mandatoryLimitFields as readonly string[]).includes(key)) {
          errors.push(`binding record enforcementEvidence has an unpermitted field ${key}`);
        }
      }
      for (const field of SHAPE.mandatoryLimitFields) {
        const declared = isObject(availability) ? availability[field] : undefined;
        const needsEvidence = declared === "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT";
        const entry = evidence[field];
        if (!needsEvidence) {
          if (entry !== undefined && entry !== null) {
            errors.push(`binding record enforcementEvidence.${field} is only permitted for artifact-only proof`);
          }
          continue;
        }
        if (!isObject(entry)) {
          errors.push(`binding record enforcementEvidence.${field} is required when the getter is absent`);
          continue;
        }
        for (const evidenceField of ENFORCEMENT_EVIDENCE_FIELDS) {
          if (!(evidenceField in entry)) {
            errors.push(`binding record enforcementEvidence.${field} is missing ${evidenceField}`);
          }
        }
        for (const key of Object.keys(entry)) {
          if (!(ENFORCEMENT_EVIDENCE_FIELDS as readonly string[]).includes(key)) {
            errors.push(`binding record enforcementEvidence.${field} has an unpermitted field ${key}`);
          }
        }
        if (entry.comparisonOperator !== ">" && entry.comparisonOperator !== ">=") {
          errors.push(`binding record enforcementEvidence.${field} comparisonOperator must be > or >=`);
        }
        if (typeof entry.constantName !== "string" || entry.constantName.length === 0) {
          errors.push(`binding record enforcementEvidence.${field} requires a constant name`);
        }
        const expectedValue =
          field === "transactionTotal"
            ? TRANSACTION_TOTAL_HCU_LIMIT.toString(10)
            : TRANSACTION_DEPTH_HCU_LIMIT.toString(10);
        if (entry.constantValue !== expectedValue) {
          errors.push(`binding record enforcementEvidence.${field} constantValue must equal the declared limit`);
        }
        if (typeof entry.revertErrorName !== "string" || entry.revertErrorName.length === 0) {
          errors.push(`binding record enforcementEvidence.${field} requires the revert error name`);
        }
        if (typeof entry.sourcePath !== "string" || entry.sourcePath.length === 0) {
          errors.push(`binding record enforcementEvidence.${field} requires the source path`);
        }
        if (typeof limits.enforcementOperator === "string" && entry.comparisonOperator !== limits.enforcementOperator) {
          errors.push(`binding record enforcementEvidence.${field} operator disagrees with the declared semantics`);
        }
        /* The evidence must correspond to an entry of the digest-bound proof manifest. */
        const controlId = field === "transactionTotal" ? "TRANSACTION_TOTAL_HCU" : "TRANSACTION_DEPTH_HCU";
        const proofEntries =
          isObject(enforcementProofSection) && isObject((enforcementProofSection as Record<string, unknown>).manifest)
            ? (((enforcementProofSection as Record<string, unknown>).manifest as Record<string, unknown>)
                .entries as unknown[])
            : [];
        const proofEntry = Array.isArray(proofEntries)
          ? proofEntries.find((candidate) => isObject(candidate) && candidate.controlId === controlId)
          : undefined;
        if (!isObject(proofEntry)) {
          errors.push(`binding record enforcementEvidence.${field} has no entry in the enforcement proof manifest`);
        } else if (
          proofEntry.constantName !== entry.constantName ||
          proofEntry.constantValue !== entry.constantValue ||
          proofEntry.comparisonOperator !== entry.comparisonOperator
        ) {
          errors.push(`binding record enforcementEvidence.${field} disagrees with the enforcement proof manifest`);
        }
      }
    }
  }

  /* ----- enforcement proof manifest (F31) ----- */
  const enforcementProof = checkSection(value, "enforcementProof", errors);
  if (enforcementProof) {
    const manifest = enforcementProof.manifest;
    if (!isObject(manifest)) {
      errors.push("binding record enforcementProof.manifest must be an object");
    } else {
      for (const field of ENFORCEMENT_PROOF_MANIFEST_FIELDS) {
        if (!(field in manifest)) errors.push(`binding record enforcementProof manifest is missing ${field}`);
      }
      if (manifest.schema !== ENFORCEMENT_PROOF_MANIFEST_SCHEMA) {
        errors.push("binding record enforcementProof manifest schema mismatch");
      }
      if (manifest.provenanceSubject !== "CURRENT_OFFICIAL_AUTHORITY_SOURCE") {
        errors.push("binding record enforcementProof manifest must cite the official authority source");
      }
      if (manifest.version !== 1) errors.push("binding record enforcementProof manifest version must be 1");
      for (const key of Object.keys(manifest)) {
        if (!ENFORCEMENT_PROOF_MANIFEST_FIELDS.includes(key)) {
          errors.push(`binding record enforcementProof manifest has an unpermitted field ${key}`);
        }
      }
      if (typeof manifest.sourceContentSha256 !== "string" || !HEX64.test(manifest.sourceContentSha256)) {
        errors.push("binding record enforcementProof manifest requires its source content hash");
      } else {
        crossLink("ENFORCEMENT_PROOF_SOURCE", manifest.sourceContentSha256, provenanceContentSha256(authorityTuple));
      }
      if (!Array.isArray(manifest.entries)) {
        errors.push("binding record enforcementProof manifest entries must be an array");
      } else {
        const seenControls = new Set<string>();
        const orderedIds: string[] = [];
        for (const [index, entry] of manifest.entries.entries()) {
          if (!isObject(entry)) {
            errors.push(`binding record enforcementProof entry ${index} must be an object`);
            continue;
          }
          for (const key of Object.keys(entry)) {
            if (!ENFORCEMENT_PROOF_ENTRY_FIELDS.includes(key)) {
              errors.push(`binding record enforcementProof entry ${index} has an unpermitted field ${key}`);
            }
          }
          for (const field of ENFORCEMENT_PROOF_ENTRY_FIELDS) {
            if (!(field in entry)) errors.push(`binding record enforcementProof entry ${index} is missing ${field}`);
          }
          for (const digestField of ["declarationSourceRangeSha256", "enforcementSourceRangeSha256"] as const) {
            if (typeof entry[digestField] !== "string" || !HEX64.test(entry[digestField] as string)) {
              errors.push(`binding record enforcementProof entry ${index} ${digestField} must be a 64-hex digest`);
            }
          }
          if (typeof entry.controlId !== "string" || !LIMIT_CONTROL_IDS.includes(entry.controlId)) {
            errors.push(`binding record enforcementProof entry ${index} names an unknown control`);
            continue;
          }
          /* F37 — one control, one proof. Two entries for one control leave the reader to choose. */
          if (seenControls.has(entry.controlId)) {
            errors.push(`binding record enforcementProof declares control ${entry.controlId} more than once`);
          }
          seenControls.add(entry.controlId);
          orderedIds.push(entry.controlId);
          for (const field of ["constantName", "enforcementFunction", "revertErrorName", "sourcePath"] as const) {
            if (typeof entry[field] !== "string" || (entry[field] as string).length === 0) {
              errors.push(`binding record enforcementProof entry ${index} requires ${field}`);
            }
          }
          if (typeof entry.constantValue !== "string" || !DECIMAL.test(entry.constantValue as string)) {
            errors.push(`binding record enforcementProof entry ${index} requires a decimal constant value`);
          }
          if (entry.comparisonOperator !== ">" && entry.comparisonOperator !== ">=") {
            errors.push(`binding record enforcementProof entry ${index} comparisonOperator must be > or >=`);
          }
          /* The two range digests describe two different ranges; equal digests mean one range was
           * reused for both claims. */
          if (entry.declarationSourceRangeSha256 === entry.enforcementSourceRangeSha256) {
            errors.push(
              `binding record enforcementProof entry ${index} reuses one source range for the declaration and the enforcement`,
            );
          }
        }
        if (JSON.stringify([...orderedIds].sort()) !== JSON.stringify(orderedIds)) {
          errors.push("binding record enforcementProof entries must be in canonical control order");
        }
      }
      if (typeof enforcementProof.manifestSha256 !== "string" || !HEX64.test(enforcementProof.manifestSha256)) {
        errors.push("binding record enforcementProof.manifestSha256 must be a 64-hex digest");
      } else if (enforcementProof.manifestSha256 !== sha256(canonicalJson(manifest))) {
        errors.push("binding record enforcementProof manifestSha256 does not recompute from the manifest");
      }
    }
  }

  /* ----- authority enumeration manifest (F31) ----- */
  const enumeration = checkSection(value, "authorityEnumeration", errors);
  if (enumeration) {
    const manifest = enumeration.manifest;
    if (!isObject(manifest)) {
      errors.push("binding record authorityEnumeration.manifest must be an object");
    } else {
      for (const field of ENUMERATION_MANIFEST_FIELDS) {
        if (!(field in manifest)) errors.push(`binding record enumeration manifest is missing ${field}`);
      }
      if (manifest.schema !== ENUMERATION_MANIFEST_SCHEMA) {
        errors.push("binding record enumeration manifest schema mismatch");
      }
      for (const key of Object.keys(manifest)) {
        if (!ENUMERATION_MANIFEST_FIELDS.includes(key)) {
          errors.push(`binding record enumeration manifest has an unpermitted field ${key}`);
        }
      }
      if (manifest.version !== 1) errors.push("binding record enumeration manifest version must be 1");
      if (manifest.enumerationComplete !== true) {
        errors.push("binding record enumeration manifest must record a COMPLETE enumeration");
      }
      /* F37 — completeness is a parse property, not a boolean somebody typed. */
      if (
        typeof manifest.parseCompleteness !== "string" ||
        !ENUMERATION_PARSE_COMPLETENESS_STATES.includes(manifest.parseCompleteness)
      ) {
        errors.push("binding record enumeration manifest requires a declared parse-completeness state");
      } else if (manifest.enumerationComplete === true && manifest.parseCompleteness !== "PARSED_COMPLETE_NO_RESIDUE") {
        errors.push("a COMPLETE enumeration requires a parse that left no unaccounted residue");
      }
      if (manifest.provenanceSubject !== "CURRENT_OFFICIAL_AUTHORITY_SOURCE") {
        errors.push("binding record enumeration manifest must cite the current official authority source");
      }
      if (typeof manifest.sourceContentSha256 !== "string" || !HEX64.test(manifest.sourceContentSha256)) {
        errors.push("binding record enumeration manifest requires its source content hash");
      } else {
        crossLink("ENUMERATION_SOURCE", manifest.sourceContentSha256, provenanceContentSha256(authorityTuple));
      }
      for (const listField of ENUMERATION_MANIFEST_LIST_FIELDS) {
        const list = manifest[listField];
        if (!Array.isArray(list)) {
          errors.push(`binding record enumeration manifest ${listField} must be an array`);
          continue;
        }
        if (list.some((entry) => typeof entry !== "string" || entry.length === 0)) {
          errors.push(`binding record enumeration manifest ${listField} must contain non-empty names`);
          continue;
        }
        const names = list as string[];
        const ordered = [...new Set(names)].sort();
        if (JSON.stringify(ordered) !== JSON.stringify(names)) {
          errors.push(`binding record enumeration manifest ${listField} must be sorted and unique`);
        }
        /* F37 — an "exhaustive" enumeration whose surfaces are empty enumerated nothing. */
        const minimum = (ENUMERATION_MINIMUM_SURFACE as Record<string, number>)[listField];
        if (minimum !== undefined && names.length < minimum) {
          errors.push(
            `binding record enumeration manifest ${listField} lists ${names.length} entries; a complete enumeration of the authority has at least ${minimum}`,
          );
        }
      }
      if (typeof enumeration.manifestSha256 !== "string" || !HEX64.test(enumeration.manifestSha256)) {
        errors.push("binding record authorityEnumeration.manifestSha256 must be a 64-hex digest");
      } else if (enumeration.manifestSha256 !== sha256(canonicalJson(manifest))) {
        errors.push("binding record enumeration manifestSha256 does not recompute from the manifest");
      }
    }
  }

  /* ----- block/batch ----- */
  const blockOrBatch = checkSection(value, "blockOrBatch", errors);
  if (blockOrBatch) {
    const state = blockOrBatch.state;
    if (state !== "PROVEN_PRESENT" && state !== "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION" && state !== "UNRESOLVED") {
      errors.push("binding record blockOrBatch.state must be a resolved authority state or UNRESOLVED");
    }
    if (state === "PROVEN_PRESENT") {
      if (typeof blockOrBatch.value !== "string" || !DECIMAL.test(blockOrBatch.value)) {
        errors.push("a present block/batch control requires a decimal value");
      }
    } else if (blockOrBatch.value !== null) {
      errors.push("a non-present block/batch control must record a null value");
    }
    /* F31 — prose may explain a proof; it may not constitute one. Absence must be backed by the
     * complete enumeration manifest, and presence by an enforcement-proof entry. */
    if (typeof blockOrBatch.proof !== "string" || (blockOrBatch.proof as string).length === 0) {
      errors.push("binding record blockOrBatch.proof must be a non-empty statement");
    }
    const enumerationManifest = isObject(enumeration) ? enumeration.manifest : undefined;
    /* F37 — the conclusion is derived from the enumeration by the verifier. The record supplies the
     * enumerated surface; it does not get to supply the answer. */
    const derivedConclusion = isObject(enumerationManifest) ? deriveBlockOrBatchConclusion(enumerationManifest) : null;
    if (state === "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION") {
      if (!isObject(enumerationManifest) || enumerationManifest.enumerationComplete !== true) {
        errors.push(
          "binding record claims block/batch PROVEN_ABSENT without a complete authority enumeration manifest",
        );
      } else if (derivedConclusion !== "ABSENT") {
        errors.push(
          "binding record claims block/batch PROVEN_ABSENT but its own enumeration names a block- or batch-scoped surface",
        );
      }
    }
    if (state === "PROVEN_PRESENT") {
      const entries =
        isObject(enforcementProof) && isObject(enforcementProof.manifest)
          ? ((enforcementProof.manifest as Record<string, unknown>).entries as unknown[])
          : [];
      const entry = Array.isArray(entries)
        ? entries.find((candidate) => isObject(candidate) && candidate.controlId === "BLOCK_OR_BATCH_HCU")
        : undefined;
      if (!isObject(entry)) {
        errors.push("binding record claims block/batch PROVEN_PRESENT without an enforcement-proof entry");
      } else {
        /* F37 — presence is cross-checked field by field, not merely by the entry existing. */
        if (entry.constantValue !== blockOrBatch.value) {
          errors.push("binding record block/batch value disagrees with its enforcement-proof entry");
        }
        if (
          typeof limits?.enforcementOperator === "string" &&
          entry.comparisonOperator !== limits.enforcementOperator
        ) {
          errors.push("binding record block/batch operator disagrees with the declared semantics");
        }
        if (typeof entry.sourcePath !== "string" || (entry.sourcePath as string).length === 0) {
          errors.push("binding record block/batch enforcement-proof entry requires its source path");
        }
        if (typeof entry.enforcementFunction !== "string" || (entry.enforcementFunction as string).length === 0) {
          errors.push("binding record block/batch enforcement-proof entry requires its enforcement function");
        }
      }
      if (derivedConclusion === "ABSENT") {
        errors.push(
          "binding record claims block/batch PROVEN_PRESENT but its own enumeration names no block- or batch-scoped surface",
        );
      }
    }
    if (claimsResolved && state === "UNRESOLVED") {
      errors.push("binding record claims RESOLVED with an UNRESOLVED block/batch control");
    }
  }

  /* ----- on-chain interface ----- */
  const iface = checkSection(value, "onChainInterface", errors);
  if (iface) {
    /* F40 — the closed interface manifest. Every critical call the verifier issues is declared
     * here, with its role, canonical signature, recomputed selector and return type. Execution
     * consumes these entries, so a manifest that disagreed with execution would break the run
     * rather than sit beside it as decoration. */
    const interfaceManifest = iface.interfaceManifest;
    if (!isObject(interfaceManifest)) {
      errors.push("binding record onChainInterface.interfaceManifest must be an object");
    } else {
      for (const field of INTERFACE_MANIFEST_FIELDS) {
        if (!(field in interfaceManifest)) errors.push(`binding record interface manifest is missing ${field}`);
      }
      if (interfaceManifest.schema !== INTERFACE_MANIFEST_SCHEMA) {
        errors.push("binding record interface manifest schema mismatch");
      }
      if (interfaceManifest.version !== 1) errors.push("binding record interface manifest version must be 1");
      const entries = interfaceManifest.entries;
      if (!Array.isArray(entries)) {
        errors.push("binding record interface manifest entries must be an array");
      } else {
        const seenIds = new Set<string>();
        const seenSignatures = new Set<string>();
        for (const [index, entry] of entries.entries()) {
          if (!isObject(entry)) {
            errors.push(`binding record interface manifest entry ${index} must be an object`);
            continue;
          }
          const callId = String(entry.callId);
          const spec = INTERFACE_CALL_SPECS.find((candidate) => candidate.callId === callId);
          const isDynamic = callId.startsWith(CALLER_APPLICABILITY_CALL_PREFIX);
          if (!spec && !isDynamic) {
            errors.push(`binding record interface manifest entry ${index} declares an unknown call id ${callId}`);
            continue;
          }
          if (seenIds.has(callId)) {
            errors.push(`binding record interface manifest declares call id ${callId} more than once`);
          }
          seenIds.add(callId);
          if (!isDynamic) {
            /* A static critical call is closed against the static field list. */
            for (const key of Object.keys(entry)) {
              if (!INTERFACE_CALL_FIELDS.includes(key)) {
                errors.push(`binding record interface manifest entry ${index} has an unpermitted field ${key}`);
              }
            }
            for (const field of INTERFACE_CALL_FIELDS) {
              if (!(field in entry)) {
                errors.push(`binding record interface manifest entry ${index} is missing ${field}`);
              }
            }
          }
          if (isDynamic) {
            /* CORRECTION 5 — a dynamic applicability call is closed exactly like a static one, but
             * against its own field list: it carries the subject it resolves, and a static call
             * does not. */
            for (const key of Object.keys(entry)) {
              if (!DYNAMIC_INTERFACE_CALL_FIELDS.includes(key)) {
                errors.push(`binding record interface manifest entry ${index} has an unpermitted field ${key}`);
              }
            }
            for (const field of DYNAMIC_INTERFACE_CALL_FIELDS) {
              if (!(field in entry)) errors.push(`binding record interface call ${callId} is missing ${field}`);
            }
            const subject = String(entry.subject);
            if (!SG4_APPLICABILITY_SUBJECTS.includes(subject)) {
              errors.push(`binding record interface call ${callId} names an unknown applicability subject`);
            } else if (callId !== callerApplicabilityCallId(subject)) {
              errors.push(`binding record interface call ${callId} does not match its declared subject`);
            }
            if (typeof entry.targetRole !== "string" || !CONTRACT_ROLES.includes(entry.targetRole)) {
              errors.push(`binding record interface call ${callId} requires a verified target role`);
            }
            if (typeof entry.returnType !== "string" || !DYNAMIC_INTERFACE_RETURN_TYPES.includes(entry.returnType)) {
              errors.push(`binding record interface call ${callId} must return a decodable answer type`);
            }
            const signature = entry.signature;
            if (typeof signature !== "string" || !new RegExp(CANONICAL_SIGNATURE_GRAMMAR, "u").test(signature)) {
              errors.push(`binding record interface call ${callId} requires a canonical signature`);
              continue;
            }
            if (typeof entry.selector !== "string" || !SELECTOR.test(entry.selector)) {
              errors.push(`binding record interface call ${callId} selector must be a 4-byte hex value`);
            } else if (keccakSelector(signature) !== entry.selector) {
              errors.push(`binding record interface call ${callId} selector does not recompute from its signature`);
            }
            const argumentTypes = entry.argumentTypes;
            const argumentValues = entry.argumentValues;
            if (!Array.isArray(argumentTypes) || !Array.isArray(argumentValues)) {
              errors.push(`binding record interface call ${callId} requires argument type and value arrays`);
            } else if (argumentTypes.length !== argumentValues.length) {
              errors.push(`binding record interface call ${callId} argument types and values must correspond`);
            } else {
              const declaredTypes = signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"));
              const expectedTypes = declaredTypes.length === 0 ? [] : declaredTypes.split(",");
              if (JSON.stringify(expectedTypes) !== JSON.stringify(argumentTypes)) {
                errors.push(`binding record interface call ${callId} argument types disagree with its signature`);
              }
            }
            continue;
          }
          /* Past the dynamic branch, the entry is a STATIC critical call and has a canonical spec. */
          if (!spec) continue;
          /* The ROLE is not the record's to choose: it decides which contract is queried. */
          if (entry.targetRole !== spec.targetRole) {
            errors.push(`binding record interface call ${callId} must target ${spec.targetRole}`);
          }
          /* Nor is the return type: it decides how the answer is decoded. */
          if (entry.returnType !== spec.returnType) {
            errors.push(`binding record interface call ${callId} must return ${spec.returnType}`);
          }
          const signature = entry.signature;
          if (typeof signature !== "string" || !new RegExp(CANONICAL_SIGNATURE_GRAMMAR, "u").test(signature)) {
            errors.push(`binding record interface call ${callId} requires a canonical signature`);
            continue;
          }
          /* Where the canonical spec fixes the signature it is fixed; only the limit getters,
           * whose names only the deployed artifact knows, are the record's to supply. */
          if (spec.signature.length > 0 && signature !== spec.signature) {
            errors.push(`binding record interface call ${callId} must use the signature ${spec.signature}`);
          }
          if (seenSignatures.has(`${String(entry.targetRole)}:${signature}`)) {
            errors.push(`binding record interface manifest declares ${signature} twice for one role`);
          }
          seenSignatures.add(`${String(entry.targetRole)}:${signature}`);
          if (typeof entry.selector !== "string" || !SELECTOR.test(entry.selector)) {
            errors.push(`binding record interface call ${callId} selector must be a 4-byte hex value`);
          } else if (keccakSelector(signature) !== entry.selector) {
            errors.push(`binding record interface call ${callId} selector does not recompute from its signature`);
          }
          const argumentTypes = entry.argumentTypes;
          const argumentValues = entry.argumentValues;
          if (!Array.isArray(argumentTypes) || !Array.isArray(argumentValues)) {
            errors.push(`binding record interface call ${callId} requires argument type and value arrays`);
          } else if (argumentTypes.length !== argumentValues.length) {
            errors.push(`binding record interface call ${callId} argument types and values must correspond`);
          } else {
            const declared = signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"));
            const expectedTypes = declared.length === 0 ? [] : declared.split(",");
            if (JSON.stringify(expectedTypes) !== JSON.stringify(argumentTypes)) {
              errors.push(`binding record interface call ${callId} argument types disagree with its signature`);
            }
          }
        }
        /* CORRECTION 5 — every AVAILABLE applicability subject must have its interface entry, and
         * the entry and the policy must be the SAME call. Two declarations that could differ is the
         * defect. */
        const applicabilitySpecs = Array.isArray(iface.callerApplicability)
          ? (iface.callerApplicability as Record<string, unknown>[])
          : [];
        for (const candidateSpec of applicabilitySpecs) {
          if (!isObject(candidateSpec) || candidateSpec.state !== "AVAILABLE") continue;
          const spec = candidateSpec as Record<string, unknown>;
          const subject = String(spec.subject);
          const callId = callerApplicabilityCallId(subject);
          const dynamic = entries.filter(isObject).find((candidate) => candidate.callId === callId);
          if (!dynamic) {
            errors.push(`binding record interface manifest is missing ${callId} for the available subject`);
            continue;
          }
          for (const field of ["signature", "selector", "targetRole", "returnType"] as const) {
            if (dynamic[field] !== spec[field]) {
              errors.push(`binding record callerApplicability ${subject} ${field} disagrees with ${callId}`);
            }
          }
          for (const field of ["argumentTypes", "argumentValues"] as const) {
            if (JSON.stringify(dynamic[field]) !== JSON.stringify(spec[field])) {
              errors.push(`binding record callerApplicability ${subject} ${field} disagrees with ${callId}`);
            }
          }
        }

        /* Every mandatory critical call must be declared: execution has no fallback. */
        for (const callId of MANDATORY_INTERFACE_CALL_IDS) {
          if (!seenIds.has(callId)) {
            errors.push(`binding record interface manifest is missing the mandatory call ${callId}`);
          }
        }
        /* And every limit getter that is read on chain must have its interface entry. */
        const limits = value.limits as Record<string, unknown> | undefined;
        const availability = (isObject(limits) ? (limits.getterAvailability ?? {}) : {}) as Record<string, unknown>;
        for (const [field, controlId] of [
          ["transactionTotal", "TRANSACTION_TOTAL_HCU"],
          ["transactionDepth", "TRANSACTION_DEPTH_HCU"],
          ["blockOrBatchCap", "BLOCK_OR_BATCH_HCU"],
        ] as const) {
          if (availability[field] !== "AVAILABLE_AND_READ_ON_CHAIN") continue;
          const callId = LIMIT_CONTROL_INTERFACE_CALLS[controlId];
          if (!seenIds.has(callId)) {
            errors.push(`binding record interface manifest is missing ${callId} for the on-chain ${field} getter`);
          }
        }
      }
      if (interfaceManifest.provenanceSubject !== "CURRENT_OFFICIAL_AUTHORITY_SOURCE") {
        errors.push("binding record interface manifest must cite the current official authority source");
      }
    }
    /* F31 — closed limit-getter specifications. A bare signature cannot record the target role,
     * the argument list or the return type, so each control declares all of them and anything
     * parameterized or non-uint256 is refused rather than called with a selector alone. */
    const getterSpecs = iface.limitGetterSpecs;
    if (!Array.isArray(getterSpecs)) {
      errors.push("binding record onChainInterface.limitGetterSpecs must be an array");
    } else {
      const seenControls = new Set<string>();
      for (const [index, spec] of getterSpecs.entries()) {
        if (!isObject(spec)) {
          errors.push(`binding record limitGetterSpec ${index} must be an object`);
          continue;
        }
        for (const field of LIMIT_GETTER_SPEC_FIELDS) {
          if (!(field in spec)) errors.push(`binding record limitGetterSpec ${index} is missing ${field}`);
        }
        for (const key of Object.keys(spec)) {
          if (!(LIMIT_GETTER_SPEC_FIELDS as readonly string[]).includes(key)) {
            errors.push(`binding record limitGetterSpec ${index} has an unpermitted field ${key}`);
          }
        }
        const controlId = spec.controlId;
        if (typeof controlId !== "string" || !LIMIT_CONTROL_IDS.includes(controlId)) {
          errors.push(`binding record limitGetterSpec ${index} names an unknown control`);
          continue;
        }
        if (seenControls.has(controlId)) errors.push(`binding record duplicates the ${controlId} getter spec`);
        seenControls.add(controlId);
        /* F40 — an HCU ceiling is held by the authority contract. A getter declaring the executor
         * would be read from a contract that does not hold the value, and execution would silently
         * call the authority anyway; the role is therefore restricted rather than reconciled. */
        if (typeof spec.targetRole !== "string" || !LIMIT_GETTER_PERMITTED_ROLES.includes(spec.targetRole)) {
          errors.push(
            `binding record limitGetterSpec ${index} must target ${LIMIT_GETTER_PERMITTED_ROLES.join(" or ")}`,
          );
        }
        if (spec.state === "AVAILABLE_AND_READ_ON_CHAIN") {
          const signature = spec.signature;
          if (typeof signature !== "string" || !new RegExp(CANONICAL_SIGNATURE_GRAMMAR, "u").test(signature)) {
            errors.push(`binding record limitGetterSpec ${index} requires a canonical signature`);
          } else if (typeof spec.selector !== "string" || keccakSelector(signature) !== spec.selector) {
            errors.push(`binding record limitGetterSpec ${index} selector does not match its signature`);
          } else if (!signature.endsWith("()")) {
            errors.push(`binding record limitGetterSpec ${index} must be a zero-argument getter`);
          }
          if (!Array.isArray(spec.argumentTypes) || spec.argumentTypes.length !== 0) {
            errors.push(`binding record limitGetterSpec ${index} must declare no arguments`);
          }
          if (!Array.isArray(spec.argumentValues) || spec.argumentValues.length !== 0) {
            errors.push(`binding record limitGetterSpec ${index} must declare no argument values`);
          }
          if (spec.returnType !== "uint256") {
            errors.push(`binding record limitGetterSpec ${index} must return uint256`);
          }
          /* F40 — the spec and the interface manifest entry execution consumes must be the same
           * call. Two declarations of one getter that could differ is exactly the defect. */
          const manifestEntries =
            isObject(iface.interfaceManifest) &&
            Array.isArray((iface.interfaceManifest as Record<string, unknown>).entries)
              ? ((iface.interfaceManifest as Record<string, unknown>).entries as Record<string, unknown>[])
              : [];
          const callId = LIMIT_CONTROL_INTERFACE_CALLS[controlId];
          const manifestEntry = manifestEntries.find((entry) => isObject(entry) && entry.callId === callId);
          if (!manifestEntry) {
            errors.push(`binding record limitGetterSpec ${index} has no ${callId} interface manifest entry`);
          } else if (manifestEntry.signature !== spec.signature || manifestEntry.selector !== spec.selector) {
            errors.push(`binding record limitGetterSpec ${index} disagrees with its interface manifest entry`);
          } else if (manifestEntry.targetRole !== spec.targetRole) {
            errors.push(`binding record limitGetterSpec ${index} target role disagrees with its interface entry`);
          }
        } else {
          for (const field of ["signature", "selector"] as const) {
            if (spec[field] !== null) {
              errors.push(`binding record limitGetterSpec ${index} must record ${field} as null when not available`);
            }
          }
        }
        /* The spec state must agree with the declared availability. */
        if (limits && isObject(limits.getterAvailability)) {
          const field =
            controlId === "TRANSACTION_TOTAL_HCU"
              ? "transactionTotal"
              : controlId === "TRANSACTION_DEPTH_HCU"
                ? "transactionDepth"
                : "blockOrBatchCap";
          if ((limits.getterAvailability as Record<string, unknown>)[field] !== spec.state) {
            errors.push(`binding record limitGetterSpec ${index} state disagrees with limits.getterAvailability`);
          }
        }
      }
      for (const controlId of LIMIT_CONTROL_IDS) {
        if (!seenControls.has(controlId)) errors.push(`binding record is missing the ${controlId} getter spec`);
      }
    }

    /* F23 — caller applicability is a closed specification per SG-4 subject. A bare signature or a
     * null can no longer establish anything: the subject, the ABI arguments and their values, the
     * return type and its interpretation are all declared, or an artifact-bound proof is required. */
    const applicability = iface.callerApplicability;
    if (!Array.isArray(applicability)) {
      errors.push("binding record onChainInterface.callerApplicability must be an array");
    } else {
      const subjects = new Set<string>();
      for (const [index, spec] of applicability.entries()) {
        if (!isObject(spec)) {
          errors.push(`binding record callerApplicability ${index} must be an object`);
          continue;
        }
        for (const field of CALLER_APPLICABILITY_FIELDS) {
          if (!(field in spec)) errors.push(`binding record callerApplicability ${index} is missing ${field}`);
        }
        for (const key of Object.keys(spec)) {
          if (!(CALLER_APPLICABILITY_FIELDS as readonly string[]).includes(key)) {
            errors.push(`binding record callerApplicability ${index} has an unpermitted field ${key}`);
          }
        }
        const subject = spec.subject;
        if (typeof subject !== "string" || !SG4_APPLICABILITY_SUBJECTS.includes(subject)) {
          errors.push(`binding record callerApplicability ${index} names an unknown SG-4 subject`);
        } else {
          if (subjects.has(subject)) errors.push(`binding record callerApplicability duplicates ${subject}`);
          subjects.add(subject);
        }
        if (typeof spec.subjectAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(spec.subjectAddress)) {
          errors.push(`binding record callerApplicability ${index} requires the subject address`);
        }
        /* Which EVM address expression the enforcement layer actually checks. */
        const contextProof = spec.callContextProof;
        if (!isObject(contextProof)) {
          errors.push(`binding record callerApplicability ${index} requires a call-context proof`);
        } else {
          for (const field of APPLICABILITY_PROOF_FIELDS) {
            if (!(field in contextProof)) {
              errors.push(`binding record callerApplicability ${index} call-context proof is missing ${field}`);
            }
          }
          if (typeof contextProof.sourceRangeSha256 !== "string" || !HEX64.test(contextProof.sourceRangeSha256)) {
            errors.push(
              `binding record callerApplicability ${index} call-context proof requires a source-range digest`,
            );
          }
          for (const error of applicabilityProofParentErrors(
            contextProof,
            value,
            `callerApplicability ${index} call-context proof`,
          )) {
            errors.push(error);
          }
        }
        if (isObject(spec.absenceProof)) {
          for (const field of APPLICABILITY_PROOF_FIELDS) {
            if (!(field in (spec.absenceProof as Record<string, unknown>))) {
              errors.push(`binding record callerApplicability ${index} absence proof is missing ${field}`);
            }
          }
          for (const error of applicabilityProofParentErrors(
            spec.absenceProof as Record<string, unknown>,
            value,
            `callerApplicability ${index} absence proof`,
          )) {
            errors.push(error);
          }
        }
        const state = spec.state;
        if (typeof state !== "string" || !CALLER_APPLICABILITY_STATES.includes(state)) {
          errors.push(`binding record callerApplicability ${index} state must be a declared state`);
          continue;
        }
        /* The subject's address must come from a declared source; the benchmark harness is not
         * deployed before the gate, so its relevance is resolved without a deployed address. */
        if (
          typeof spec.subjectAddressSource !== "string" ||
          !SUBJECT_ADDRESS_SOURCES.includes(spec.subjectAddressSource)
        ) {
          errors.push(`binding record callerApplicability ${index} requires a declared subject address source`);
        }
        if (state === "AVAILABLE") {
          if (typeof spec.targetRole !== "string" || !CONTRACT_ROLES.includes(spec.targetRole)) {
            errors.push(`binding record callerApplicability ${index} requires a verified target role`);
          }
          const signature = spec.signature;
          if (typeof signature !== "string" || signature.length === 0) {
            errors.push(`binding record callerApplicability ${index} requires a signature`);
          } else if (typeof spec.selector !== "string" || keccakSelector(signature) !== spec.selector) {
            errors.push(`binding record callerApplicability ${index} selector does not match its signature`);
          }
          if (!Array.isArray(spec.argumentTypes) || !Array.isArray(spec.argumentValues)) {
            errors.push(`binding record callerApplicability ${index} requires argumentTypes and argumentValues`);
          } else {
            if (spec.argumentTypes.length !== spec.argumentValues.length) {
              errors.push(`binding record callerApplicability ${index} argument count mismatch`);
            }
            for (const type of spec.argumentTypes) {
              if (typeof type !== "string" || !SUPPORTED_ABI_ARGUMENT_TYPES.includes(type)) {
                errors.push(`binding record callerApplicability ${index} declares an unsupported argument type`);
              }
            }
            /* The declared signature must agree with the declared argument types. */
            if (typeof signature === "string") {
              const declared = `(${(spec.argumentTypes as string[]).join(",")})`;
              if (!signature.endsWith(declared)) {
                errors.push(`binding record callerApplicability ${index} signature disagrees with its argument types`);
              }
            }
          }
          if (typeof spec.returnType !== "string" || !SUPPORTED_ABI_RETURN_TYPES.includes(spec.returnType)) {
            errors.push(`binding record callerApplicability ${index} requires a supported return type`);
          }
          /* F30 — a closed interpretation enum, tied to its exact return type. */
          const interpretation = spec.interpretation;
          if (typeof interpretation !== "string" || !APPLICABILITY_INTERPRETATIONS.includes(interpretation)) {
            errors.push(`binding record callerApplicability ${index} requires a declared interpretation enum`);
          } else if (APPLICABILITY_INTERPRETATION_RETURN_TYPE[interpretation] !== spec.returnType) {
            errors.push(`binding record callerApplicability ${index} interpretation does not match its return type`);
          }
          /* Accepted results must be canonical values of the declared return type. */
          if (!Array.isArray(spec.acceptedResults) || spec.acceptedResults.length === 0) {
            errors.push(`binding record callerApplicability ${index} requires a non-empty accepted-result set`);
          } else {
            for (const accepted of spec.acceptedResults) {
              const ok =
                spec.returnType === "bool"
                  ? typeof accepted === "boolean"
                  : spec.returnType === "uint256"
                    ? typeof accepted === "string" &&
                      /^[0-9]+$/u.test(accepted) &&
                      BigInt(accepted) < UINT256_EXCLUSIVE_UPPER_BOUND
                    : typeof accepted === "string" && /^0x[0-9a-f]{40}$/u.test(accepted);
              if (!ok)
                errors.push(
                  `binding record callerApplicability ${index} accepted result is not a canonical ${String(spec.returnType)}`,
                );
            }
          }
          /* F30 — the subject must actually be the address the call passes. */
          const argumentIndex = spec.subjectArgumentIndex;
          if (Array.isArray(spec.argumentTypes) && spec.argumentTypes.length > 0) {
            if (typeof argumentIndex !== "number" || !Number.isInteger(argumentIndex) || argumentIndex < 0) {
              errors.push(`binding record callerApplicability ${index} requires subjectArgumentIndex`);
            } else if (argumentIndex >= spec.argumentTypes.length) {
              errors.push(`binding record callerApplicability ${index} subjectArgumentIndex is out of range`);
            } else if ((spec.argumentTypes as string[])[argumentIndex] !== "address") {
              errors.push(`binding record callerApplicability ${index} subject argument must be an address`);
            } else if (
              String((spec.argumentValues as unknown[])[argumentIndex]).toLowerCase() !==
              String(spec.subjectAddress).toLowerCase()
            ) {
              errors.push(`binding record callerApplicability ${index} queries an address other than its subject`);
            }
          } else if (argumentIndex !== null) {
            errors.push(
              `binding record callerApplicability ${index} must record subjectArgumentIndex null for a zero-argument getter`,
            );
          }
          /* uint256 arguments must be in range. */
          if (Array.isArray(spec.argumentTypes) && Array.isArray(spec.argumentValues)) {
            for (const [position, type] of (spec.argumentTypes as string[]).entries()) {
              if (type !== "uint256") continue;
              const value = (spec.argumentValues as unknown[])[position];
              if (
                typeof value !== "string" ||
                !/^[0-9]+$/u.test(value) ||
                BigInt(value) >= UINT256_EXCLUSIVE_UPPER_BOUND
              ) {
                errors.push(`binding record callerApplicability ${index} uint256 argument is out of range`);
              }
            }
          }
          if (spec.absenceProof !== null) {
            errors.push(`binding record callerApplicability ${index} may not carry an absence proof when AVAILABLE`);
          }
        } else {
          /* ABSENT_DOCUMENTED or NOT_APPLICABLE_WITH_PROOF both need an artifact-bound proof. */
          /* F30 — structured, artifact-bound evidence. Prose may explain it; it is not it. */
          const proof = spec.absenceProof;
          if (!isObject(proof)) {
            errors.push(`binding record callerApplicability ${index} requires an artifact-bound absence proof`);
          } else {
            for (const field of APPLICABILITY_PROOF_FIELDS) {
              if (!(field in proof))
                errors.push(`binding record callerApplicability ${index} proof is missing ${field}`);
            }
            for (const key of Object.keys(proof)) {
              if (!(APPLICABILITY_PROOF_FIELDS as readonly string[]).includes(key)) {
                errors.push(`binding record callerApplicability ${index} proof has an unpermitted field ${key}`);
              }
            }
            if (typeof proof.sourceRangeSha256 !== "string" || !HEX64.test(proof.sourceRangeSha256)) {
              errors.push(`binding record callerApplicability ${index} proof requires a source-range digest`);
            }
            if (typeof proof.checkedAddressExpression !== "string" || proof.checkedAddressExpression.length === 0) {
              errors.push(`binding record callerApplicability ${index} proof must name the checked address expression`);
            }
          }
          for (const field of ["signature", "selector", "targetRole"] as const) {
            if (spec[field] !== null) {
              errors.push(
                `binding record callerApplicability ${index} must record ${field} as null when not AVAILABLE`,
              );
            }
          }
        }
      }
      /* Every SG-4 subject must be covered; a missing subject is not "not applicable". */
      for (const subject of SG4_APPLICABILITY_SUBJECTS) {
        if (!subjects.has(subject)) errors.push(`binding record callerApplicability is missing the ${subject} subject`);
      }
    }
  }

  /* ----- facets ----- */
  const facets = checkSection(value, "facets", errors);
  if (facets) {
    for (const facet of ARTIFACT_IDENTITY_ROOTS.facets) {
      const entry = facets[facet];
      if (!isObject(entry)) {
        errors.push(`binding record facet ${facet} must be an object`);
        continue;
      }
      for (const field of SHAPE.facetFields) {
        if (!(field in entry)) errors.push(`binding record facet ${facet} is missing ${field}`);
      }
      for (const key of Object.keys(entry)) {
        if (!(SHAPE.facetFields as readonly string[]).includes(key)) {
          errors.push(`binding record facet ${facet} has an unpermitted field ${key}`);
        }
      }
      if (artifact && entry.artifactId !== artifact.id) {
        errors.push(`binding record facet ${facet} names a different artifact; that is cross-version mixing`);
      }
      if (typeof entry.origin !== "string" || !FACET_ORIGINS.includes(entry.origin)) {
        errors.push(`binding record facet ${facet} origin must be a declared origin`);
      }
      if (claimsResolved && FACET_ORIGINS_FORBIDDEN_FOR_PASS.includes(entry.origin as string)) {
        errors.push(
          `binding record claims RESOLVED while facet ${facet} still originates from ${String(entry.origin)}`,
        );
      }
    }
  }

  return [...new Set(errors)].sort();
}

/* Retained name for the lineage-only portion so existing callers and tests keep working. */
export function validateBindingRecord(record: unknown): string[] {
  return validateAuthorityBindingRecord(record);
}

/* Everything the lineage check needs from git, behind an interface so tests can supply a fake and
 * no test shells out. */
export type LineageProbe = {
  branch(): string;
  worktreeClean(): boolean;
  indexClean(): boolean;
  revParse(rev: string): string;
  /* Number of parents of a commit. A binding commit must have exactly one; a merge commit whose
   * first parent happens to be A would otherwise satisfy the HEAD^ check. */
  parentCount(rev: string): number;
  changedPaths(fromCommit: string, toCommit: string): string[];
  blobAt(commit: string, path: string): string | null;
  readBindingRecord(): unknown | null;
};

export function createGitLineageProbe(): LineageProbe {
  return {
    branch: () => gitValue("branch", "--show-current"),
    worktreeClean: () => gitValue("status", "--porcelain") === "",
    indexClean: () => gitValue("diff", "--cached", "--name-only") === "",
    revParse: (rev) => gitValue("rev-parse", rev),
    parentCount: (rev) => {
      const parents = gitValue("rev-list", "--parents", "-n", "1", rev);
      if (parents === "UNRESOLVED") return -1;
      /* `rev-list --parents -n 1` prints "<commit> <parent>..."; parents are the remainder. */
      return parents.trim().split(/\s+/u).length - 1;
    },
    changedPaths: (from, to) =>
      gitValue("diff", "--name-only", `${from}..${to}`)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .sort(),
    blobAt: (commit, path) => {
      const value = gitValue("rev-parse", `${commit}:${path}`);
      return value === "UNRESOLVED" ? null : value;
    },
    readBindingRecord: () => {
      try {
        return JSON.parse(readFileSync(join(ROOT, BINDING_RECORD_PATH), "utf8")) as unknown;
      } catch {
        return null;
      }
    },
  };
}

export type LineageResult = {
  result: "VERIFIED" | "BROKEN" | "UNRESOLVED";
  blockers: string[];
  /* The validated record, available only when the lineage verified. Everything late-bound is read
   * from here rather than from local source. */
  record: AuthorityBindingRecord | null;
};

/* Verifies the A -> B lineage at clean HEAD B. Fail-closed: anything that cannot be established
 * yields a blocker, and any contradiction yields BROKEN. */
export function checkPreparationLineage(probe: LineageProbe): LineageResult {
  const blockers: string[] = [];
  let broken = false;
  const fail = (reason: string): void => {
    broken = true;
    blockers.push(reason);
  };

  if (probe.branch() !== PREPARATION_LINEAGE_MODEL.branchRequired) blockers.push("BRANCH_IS_NOT_MAIN");
  if (!probe.worktreeClean()) blockers.push("WORKTREE_IS_NOT_CLEAN");
  if (!probe.indexClean()) blockers.push("INDEX_IS_NOT_CLEAN");

  const record = probe.readBindingRecord();
  if (record === null) {
    blockers.push("PREPARATION_BINDING_RECORD_ABSENT");
    return { result: "UNRESOLVED", blockers: blockers.sort(), record: null };
  }

  const recordErrors = validateAuthorityBindingRecord(record);
  if (recordErrors.length > 0) {
    for (const error of recordErrors) fail(`BINDING_RECORD_INVALID:${error}`);
    return { result: "BROKEN", blockers: blockers.sort(), record: null };
  }
  const binding = (record as AuthorityBindingRecord).lineage as {
    implementationCommit: string;
    implementationTree: string;
  };

  const headCommit = probe.revParse("HEAD");
  const headTree = probe.revParse("HEAD^{tree}");
  const parentCommit = probe.revParse("HEAD^");

  /* B must be an ordinary single-parent commit. A merge whose first parent is A would otherwise
   * satisfy the HEAD^ check while dragging in an entire unreviewed second history. */
  const parents = probe.parentCount("HEAD");
  if (parents !== 1) fail(`BINDING_COMMIT_MUST_HAVE_EXACTLY_ONE_PARENT:${parents}`);

  /* The binding record must not name HEAD itself: that would reintroduce the self-reference. */
  if (binding.implementationCommit === headCommit) fail("BINDING_RECORD_IS_SELF_REFERENTIAL");
  if (binding.implementationTree === headTree) fail("BINDING_TREE_FALSELY_EQUALS_IMPLEMENTATION_TREE");

  /* HEAD^ must be A. A third commit after B makes HEAD^ equal B, not A, so this also catches an
   * unreviewed commit appended to the lineage. */
  if (parentCommit !== binding.implementationCommit) fail("HEAD_PARENT_IS_NOT_THE_IMPLEMENTATION_COMMIT");

  const implementationTree = probe.revParse(`${binding.implementationCommit}^{tree}`);
  if (implementationTree !== binding.implementationTree) fail("RECORDED_IMPLEMENTATION_TREE_MISMATCH");

  /* B may change exactly the one dedicated binding-record path and nothing else. */
  const changed = probe.changedPaths(binding.implementationCommit, headCommit);
  if (changed.length !== 1 || changed[0] !== BINDING_RECORD_PATH) {
    fail(`BINDING_COMMIT_CHANGED_MORE_THAN_THE_BINDING_RECORD:${changed.join(",") || "nothing"}`);
  }

  /* Every implementation and runtime path must have the identical blob at A and at B. */
  const drifted: string[] = [];
  for (const path of SG4_IMPLEMENTATION_PATHS) {
    const atA = probe.blobAt(binding.implementationCommit, path);
    const atB = probe.blobAt(headCommit, path);
    if (atA === null || atB === null || atA !== atB) drifted.push(path);
  }
  if (drifted.length > 0) fail(`IMPLEMENTATION_BLOB_DRIFT:${drifted.sort().join(",")}`);

  if (broken) return { result: "BROKEN", blockers: blockers.sort(), record: null };
  if (blockers.length > 0) return { result: "UNRESOLVED", blockers: blockers.sort(), record: null };
  return { result: "VERIFIED", blockers: [], record: record as AuthorityBindingRecord };
}

/* ---------------------------------------------------------------------------------------------
 * Minimal ABI decoding for the four read-only getters. No provider, no contract object, no signer.
 * ------------------------------------------------------------------------------------------- */

export function selectorFor(signature: keyof typeof READ_ONLY_SELECTORS): string {
  const committed = READ_ONLY_SELECTORS[signature];
  /* Recompute rather than trust the literal: a mistyped selector would call something else. */
  const computed = keccakSelector(signature);
  if (computed !== committed) {
    throw new Error(`selector drift for ${signature}: committed ${committed}, computed ${computed}`);
  }
  return committed;
}

function keccakSelector(signature: string): string {
  /* `id` is keccak256 over the UTF-8 signature; only the hashing primitive is used. */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { id } = require("ethers") as { id: (value: string) => string };
  return id(signature).slice(0, 10);
}

export function decodeAddressWord(word: unknown): string | null {
  if (typeof word !== "string") return null;
  const hex = word.toLowerCase().replace(/^0x/u, "");
  if (!/^[0-9a-f]{64}$/u.test(hex)) return null;
  if (!/^0{24}/u.test(hex)) return null;
  const address = hex.slice(24);
  if (/^0{40}$/u.test(address)) return null;
  return `0x${address}`;
}

/* Strict uint256 decoding: exactly one 32-byte word, nothing else. A short, long, or malformed
 * return is null rather than a coerced number. */
export function decodeUint256(returnData: unknown): bigint | null {
  if (typeof returnData !== "string") return null;
  const hex = returnData.toLowerCase().replace(/^0x/u, "");
  if (hex.length !== 64 || !/^[0-9a-f]{64}$/u.test(hex)) return null;
  return BigInt(`0x${hex}`);
}

export function decodeAbiString(returnData: unknown): string | null {
  if (typeof returnData !== "string") return null;
  const hex = returnData.replace(/^0x/u, "");
  if (hex.length < 128) return null;
  const buffer = Buffer.from(hex, "hex");
  const offset = Number(BigInt(`0x${hex.slice(0, 64)}`));
  if (offset + 32 > buffer.length) return null;
  const length = Number(BigInt(`0x${buffer.subarray(offset, offset + 32).toString("hex")}`));
  if (offset + 32 + length > buffer.length) return null;
  return buffer.subarray(offset + 32, offset + 32 + length).toString("utf8");
}

function hexCodeToBuffer(code: unknown): Buffer | null {
  if (typeof code !== "string") return null;
  const hex = code.toLowerCase().replace(/^0x/u, "");
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]*$/u.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

/* ---------------------------------------------------------------------------------------------
 * Live read-only authority verification.
 *
 * Implemented completely, executed nowhere in this preparation phase. It writes no file, creates no
 * evidence, submits nothing, and signs nothing. Every check that cannot be completed contributes a
 * blocker and the corresponding result field is spelled UNRESOLVED rather than omitted.
 * ------------------------------------------------------------------------------------------- */

export const EVIDENCE_WRITTEN_BY_THE_LIVE_VERIFIER = false;

export type CodeIdentityResult = "VERIFIED" | "MISMATCH" | "BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED";

/* Code identity is asserted only against the resolved current official artifact.
 *
 * While that artifact is unresolved the outcome is BLOCKED — not PASS, and not FAIL either, because
 * differing from the local 0.10.0 fixture says nothing about the current deployment. The local
 * fixture hash is never accepted as the authoritative expectation. */
export function classifyCodeIdentity(input: {
  normalizedSha256: string;
  normalizationOk: boolean;
  expectedAuthoritativeSha256: string | null;
}): CodeIdentityResult {
  if (input.expectedAuthoritativeSha256 === null) return "BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED";
  if (input.expectedAuthoritativeSha256 === ARTIFACT_IDENTITY_ROOTS.localInstalledFixture.normalizedRuntimeSha256) {
    /* The local self-test fixture may never be promoted to the current-deployment expectation. */
    return "BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED";
  }
  if (!input.normalizationOk) return "MISMATCH";
  return input.normalizedSha256 === input.expectedAuthoritativeSha256 ? "VERIFIED" : "MISMATCH";
}

export type LiveVerificationOptions = {
  /* Test seam only. Omitted in production, in which case the committed endpoint is used. There is
   * deliberately no RPC, executor, authority, or address parameter anywhere in this type. */
  transport?: ReadOnlyTransport;
  /* Test seam only: supply a lineage probe instead of shelling out to git. */
  lineageProbe?: LineageProbe;
};

export type AuthorityResult = Record<string, unknown>;

/* ---------------------------------------------------------------------------------------------
 * F33/F36 — the SELECTED provenance tuple for a subject.
 *
 * "Selected" means: the entry as it stands after any reviewed amendment has been applied. Every
 * cross-link in the record is checked against this one resolution, so a label can never stand in
 * for a tuple and an amendment can never leave two different answers in play.
 * ------------------------------------------------------------------------------------------- */

export type SourceFileProvenanceTuple = {
  kind: "SOURCE_FILE";
  subject: string;
  repository: string;
  tag: string | null;
  commit: string;
  path: string;
  contentSha256: string | null;
};

export type ReproducedBuildProvenanceTuple = {
  kind: "REPRODUCED_BUILD";
  subject: string;
  repository: string;
  tag: string | null;
  commit: string;
  buildInfoSha256: string | null;
};

export type ProvenanceTuple = SourceFileProvenanceTuple | ReproducedBuildProvenanceTuple;

export function provenanceContentSha256(tuple: ProvenanceTuple | null): string | null {
  if (tuple === null) return null;
  return tuple.kind === "REPRODUCED_BUILD" ? tuple.buildInfoSha256 : tuple.contentSha256;
}

/* F37 — the block/batch conclusion, DERIVED from the enumerated surface.
 *
 * The record used to assert the conclusion and the verifier used to believe it. Now the verifier
 * reads the enumeration the record supplied and reaches the conclusion itself: if no declaration,
 * callable, error, mapping or storage field names a block- or batch-scoped quantity, the control
 * is absent; if one does, it is present. The record cannot assert its way past this.
 */
export function deriveBlockOrBatchConclusion(manifest: Record<string, unknown>): "ABSENT" | "PRESENT" {
  const pattern = new RegExp(BLOCK_OR_BATCH_SURFACE_PATTERN, "u");
  const surface: string[] = [];
  for (const field of ENUMERATION_MANIFEST_LIST_FIELDS) {
    const list = manifest[field];
    if (Array.isArray(list)) surface.push(...list.map((entry) => String(entry)));
  }
  return surface.some((name) => pattern.test(name)) ? "PRESENT" : "ABSENT";
}

export function selectedProvenanceTuple(record: AuthorityBindingRecord, subject: string): ProvenanceTuple | null {
  const provenance = record.provenance as Record<string, unknown> | undefined;
  if (!isObject(provenance)) return null;
  const entries = Array.isArray(provenance.entries) ? (provenance.entries as Record<string, unknown>[]) : [];
  const entry = entries.find((candidate) => isObject(candidate) && candidate.subject === subject);
  if (!entry) return null;
  /* A reproduced build is committed at no path, and the content it authenticates is the build-info
   * document, so `buildInfoSha256` is its content hash. */
  const isReproducedBuild = REPRODUCED_BUILD_SUBJECTS.includes(subject);
  const contentSha256 = isReproducedBuild ? entry.buildInfoSha256 : entry.contentSha256;
  if (isReproducedBuild) {
    return {
      kind: "REPRODUCED_BUILD",
      subject,
      repository: typeof entry.repository === "string" ? entry.repository : "UNRESOLVED",
      tag: typeof entry.tag === "string" ? entry.tag : null,
      commit: typeof entry.commit === "string" ? entry.commit : "UNRESOLVED",
      buildInfoSha256: typeof contentSha256 === "string" ? contentSha256 : null,
    };
  }
  return {
    kind: "SOURCE_FILE",
    subject,
    repository: typeof entry.repository === "string" ? entry.repository : "UNRESOLVED",
    tag: typeof entry.tag === "string" ? entry.tag : null,
    commit: typeof entry.commit === "string" ? entry.commit : "UNRESOLVED",
    path: typeof entry.path === "string" ? entry.path : "UNRESOLVED",
    contentSha256: typeof contentSha256 === "string" ? contentSha256 : null,
  };
}

/* The canonical string form of a selected tuple. Every source reference in the record must be
 * exactly this string for its subject — never a label, a substring or free prose. */
export function canonicalSourceReference(tuple: SourceFileProvenanceTuple): string {
  if (tuple.kind !== "SOURCE_FILE") {
    throw new Error("REPRODUCED_BUILD_HAS_NO_SOURCE_FILE_CANONICAL_REFERENCE");
  }
  return `${tuple.repository}@${tuple.commit}:${tuple.path}`;
}

export function sourceFileCanonicalReference(tuple: ProvenanceTuple | null): string | null {
  if (tuple === null) return null;
  if (tuple.kind !== "SOURCE_FILE") {
    throw new Error("REPRODUCED_BUILD_HAS_NO_SOURCE_FILE_CANONICAL_REFERENCE");
  }
  return canonicalSourceReference(tuple);
}

export function selectedProvenanceMap(record: AuthorityBindingRecord): Map<string, ProvenanceTuple> {
  const map = new Map<string, ProvenanceTuple>();
  for (const subject of AUTHORITY_BINDING_RECORD_SHAPE.provenanceSubjects) {
    const tuple = selectedProvenanceTuple(record, subject);
    if (tuple !== null) map.set(subject, tuple);
  }
  return map;
}

export async function runLiveAuthorityVerification(
  acknowledgement: string | undefined,
  options: LiveVerificationOptions = {},
): Promise<AuthorityResult> {
  if (acknowledgement !== LIVE_ACKNOWLEDGEMENT) {
    throw new Error("live read-only authority verification requires the exact acknowledgment");
  }

  const protocol = deriveAuthorityProtocol();

  const blockers: string[] = [];
  const failures: string[] = [];

  /* Step 0 — repository identity and exact preparation binding, before anything else.
   *
   * A run that cannot bind to the reviewed preparation can never pass, so the committed-endpoint
   * transport is not even constructed for it: the network is left alone rather than queried for a
   * result that is already blocked. An injected transport is a test fake and is always used. */
  const lineage = checkPreparationLineage(options.lineageProbe ?? createGitLineageProbe());
  const bindingBlockers = lineage.blockers;
  blockers.push(...bindingBlockers);
  if (lineage.result === "BROKEN") failures.push(`PREPARATION_LINEAGE_BROKEN:${lineage.blockers.join("|")}`);

  let guarded: GuardedTransport;
  if (options.transport !== undefined) {
    guarded = createGuardedTransport(options.transport);
  } else if (bindingBlockers.length > 0) {
    blockers.push("NETWORK_TRANSPORT_WITHHELD_UNTIL_PREPARATION_BINDING_IS_SATISFIED");
    guarded = createGuardedTransport({
      send: async (call) => {
        throw new Error(`network transport withheld before the preparation binding is satisfied: ${call.method}`);
      },
    });
  } else {
    guarded = createGuardedTransport(createCommittedEndpointTransport());
  }

  /* Offline material.
   *
   * The installed CALCULATOR is legitimately local: it is what SG-4 measures with, and its
   * provenance is recorded. The local HCULimit.sol AUTHORITY fixture is deliberately NOT parsed
   * here: no fact derived from it may reach the live verdict, so the live path never computes one.
   * Its integrity is still reported below, as a self-test, through the source-hash comparison.
   *
   * The installed COST TABLE is a different thing entirely: it is the calculator SG-4 actually
   * measures with, so it is PASS-relevant and is parsed. */
  const installedTable = parseInstalledCostTable(readFileSync(COST_TABLE_FILE, "utf8"));

  /* INVARIANT F — two questions, cleanly separated by what a file can actually change.
   *
   * PASS-relevant: the exact files that compute an HCU number. Everything else — the plugin's
   * constants, the Solidity config, the obsolete local HCULimit fixture — is repository hygiene:
   * reported, never blocking, because none of it can change a measurement or a deployed ceiling. */
  const measurementRoot = verifyMeasurementToolchainRoot();
  const installedSourceHashesResult = measurementRoot.result === "VERIFIED" ? "MATCH" : "MISMATCH";
  if (installedSourceHashesResult === "MISMATCH") {
    failures.push(`MEASUREMENT_TOOLCHAIN_ROOT_UNVERIFIED:${measurementRoot.failures.join("|")}`);
  }
  const hygieneFailures: string[] = [];
  for (const label of REPOSITORY_HYGIENE_FILES) {
    const path = (SOURCE_FILES as Record<string, string>)[label];
    if (path === undefined) continue;
    const expected = (EXPECTED_SOURCE_HASHES as Record<string, string>)[label];
    let actual = "UNREADABLE";
    try {
      actual = sha256(readFileSync(path));
    } catch {
      actual = "UNREADABLE";
    }
    if (actual !== expected) hygieneFailures.push(label);
  }
  const localFixtureSelfTestResult = hygieneFailures.length === 0 ? "MATCH" : "MISMATCH";

  const staleGuard = checkStaleAddressUsage(
    SG4_GUARDED_SOURCE_SCOPE.map((relative) => ({
      path: relative,
      content: readFileSync(join(ROOT, relative), "utf8"),
    })),
  );
  const staleAddressGuardResult = staleGuard.ok ? "NOT_USED" : "REJECTED";
  if (!staleGuard.ok) failures.push(`STALE_AUTHORITY_CONSTANT_USED:${staleGuard.offenders.join("|")}`);

  /* The validated authority-binding record is the ONLY source of authoritative source-derived
   * facts. The local 0.10.0 material below is a fixture: it is never promoted to the deployed
   * authority surface, and never supplies limit values, enforcement paths or the operation
   * schedule for a PASS. */
  const binding = lineage.record;
  const authorityBindingRecordResult: "VALID" | "INVALID" | "ABSENT" | "UNRESOLVED" =
    binding !== null
      ? "VALID"
      : lineage.blockers.includes("PREPARATION_BINDING_RECORD_ABSENT")
        ? "ABSENT"
        : lineage.result === "BROKEN"
          ? "INVALID"
          : "UNRESOLVED";
  if (authorityBindingRecordResult !== "VALID")
    blockers.push(`AUTHORITY_BINDING_RECORD_${authorityBindingRecordResult}`);

  const bindingArtifact = (binding?.artifact ?? {}) as Record<string, unknown>;
  const bindingExecutor = (binding?.executor ?? {}) as Record<string, unknown>;
  const bindingAuthority = (binding?.authority ?? {}) as Record<string, unknown>;
  const bindingLimits = (binding?.limits ?? {}) as Record<string, unknown>;
  const bindingBlockOrBatch = (binding?.blockOrBatch ?? {}) as Record<string, unknown>;
  const bindingInterface = (binding?.onChainInterface ?? {}) as Record<string, unknown>;
  /* INVARIANTS B/C/D — the live path consumes DERIVED values. The record's own fields are never
   * read for an authoritative fact; they were already compared against these during validation. */
  const derivation =
    binding === null
      ? { blockers: [], priceSchedule: null, authoritySource: null, artifactBuild: null }
      : deriveAuthorityFromSourceMaterial(binding, { implementationAddress: null });
  for (const blocker of derivation.blockers) blockers.push(blocker);
  /* Set at Step 8, from an extraction performed against the address the CHAIN resolved. It cannot
   * be known before then: the authoritative digest is a function of the implementation address. */
  let expectedDeployedNormalizedHash: string | null = EXPECTED_DEPLOYED_NORMALIZED_RUNTIME_SHA256;
  const authorityDeploymentModel =
    typeof bindingAuthority.deploymentModel === "string" ? bindingAuthority.deploymentModel : "UNRESOLVED";
  const executorDeploymentModel =
    typeof bindingExecutor.deploymentModel === "string" &&
    EXECUTOR_DEPLOYMENT_MODELS.includes(bindingExecutor.deploymentModel)
      ? bindingExecutor.deploymentModel
      : "UNRESOLVED";
  let implementationResolutionResult = "UNRESOLVED";
  let implementationAddressPolicyResult = "UNRESOLVED";

  /* F39 — the plan is generated from the VALIDATED record and installed on the transport before
   * any dependent call is issued. Roles resolve as the derivation chain establishes them, so a
   * call to an address the chain has not yet verified cannot match its planned target. */
  const livePlan: LiveCall[] = binding !== null ? generateLiveCallPlan(binding) : [];
  let planEnforcementResult: "ENFORCED_EXACT" | "VIOLATED" | "NOT_APPLICABLE_PLAN_UNRESOLVED" | "UNRESOLVED" =
    binding === null ? "NOT_APPLICABLE_PLAN_UNRESOLVED" : "UNRESOLVED";
  const roleAddresses: Record<string, string | null> = {
    AUTHORITY: null,
    AUTHORITY_IMPLEMENTATION: null,
    EXECUTOR: SEPOLIA_EXECUTOR_ADDRESS,
    NONE: null,
  };
  /* INVARIANT H — the plan must install and validate BEFORE the first network request. If it
   * cannot, zero calls are issued: a run that cannot state what it intends to ask may not ask. */
  let planInstalled = false;
  if (binding !== null) {
    try {
      assertLiveCallPlanIsReadOnly(livePlan);
      for (const call of livePlan) {
        if (call.method === "eth_call" && (call.data === null || !/^0x[0-9a-f]{8}/u.test(call.data))) {
          throw new Error(`planned call ${call.callId} has no resolvable calldata`);
        }
        if (call.callObjectKeys !== null) {
          const object = call.params[0];
          if (
            !isObject(object) ||
            JSON.stringify(Object.keys(object).sort()) !== JSON.stringify([...call.callObjectKeys].sort())
          ) {
            throw new Error(`planned call ${call.callId} carries a non-canonical transaction object`);
          }
        }
      }
      guarded.enforcePlan(livePlan, (role) => roleAddresses[role] ?? null);
      planInstalled = true;
    } catch (error) {
      planEnforcementResult = "VIOLATED";
      failures.push(`LIVE_CALL_PLAN_UNUSABLE:${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  if (!planInstalled) {
    /* Recorded here rather than left to the abort path, so the reason survives into the result. */
    blockers.push("LIVE_CALL_PLAN_NOT_INSTALLED_NO_REQUEST_ISSUED");
  }

  /* Result fields default to the explicit "did not complete" spelling. */
  let pinnedBlockNumber = "UNRESOLVED";
  let pinnedBlockHash = "UNRESOLVED";
  let pinnedBlockFinality: "FINALIZED" | "UNRESOLVED" = "UNRESOLVED";
  let executorCodeHash = "UNRESOLVED";
  let executorVersion = "UNRESOLVED";
  let executorCodeIdentityResult: "VERIFIED" | "MISMATCH" | "UNRESOLVED" = "UNRESOLVED";
  let executorVersionResult: "MATCHES_BINDING_RECORD" | "MISMATCH" | "UNRESOLVED" = "UNRESOLVED";
  let authorityAddress = "UNRESOLVED";
  let authorityCodeHash = "UNRESOLVED";
  let authorityCodeIdentityResult: "VERIFIED" | "MISMATCH" | "UNRESOLVED" = "UNRESOLVED";
  let authorityImplementationAddress = "UNRESOLVED";
  let authorityVersion = "UNRESOLVED";
  let authorityVersionResult: "MATCHES_BINDING_RECORD" | "MISMATCH" | "UNRESOLVED" = "UNRESOLVED";
  let normalizedImplementationHash = "UNRESOLVED";
  let codeIdentityResult: "VERIFIED" | "MISMATCH" | "BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED" | "UNRESOLVED" =
    "UNRESOLVED";
  let reciprocalLinkageResult: "VERIFIED" | "BROKEN" | "UNRESOLVED" = "UNRESOLVED";
  let callerExemptionResult: string = "UNRESOLVED";
  const callerApplicabilityResults: Record<string, unknown>[] = [];
  let unsupportedByCalculator: string[] = [];
  let pricingComparison: PricingComparison | null = null;
  const emptyReading = (): Record<string, unknown> => ({
    getterAvailability: "UNRESOLVED",
    onChainValue: "UNRESOLVED",
    result: "UNRESOLVED",
  });
  let totalHcuOnChainReading = emptyReading();
  let depthHcuOnChainReading = emptyReading();
  let blockOrBatchOnChainReading = emptyReading();

  /* F40 — calldata for a critical call, taken from the record's declared interface manifest.
   * The manifest was validated against its canonical spec, so this cannot call something else. */
  const declaredCalldata = (callId: string): string => {
    const entry = binding === null ? null : interfaceCall(binding, callId);
    if (entry === null) {
      failures.push(`INTERFACE_CALL_NOT_DECLARED:${callId}`);
      throw new Error(`the binding record declares no interface call ${callId}`);
    }
    return interfaceCalldata(entry);
  };

  /* Reads one declared limit getter and compares it to the binding record. A getter the verified
   * authoritative interface genuinely does not expose may be established from the record ONLY when
   * the record explicitly documents its absence and the exact enforcement path. */
  const readLimitGetter = async (
    field: "transactionTotal" | "transactionDepth" | "blockOrBatchCap",
    expected: string | null,
    pinnedHex: string,
  ): Promise<Record<string, unknown>> => {
    const availability = ((bindingLimits.getterAvailability ?? {}) as Record<string, unknown>)[field];
    const specs = Array.isArray(bindingInterface.limitGetterSpecs)
      ? (bindingInterface.limitGetterSpecs as Record<string, unknown>[])
      : [];
    const controlId =
      field === "transactionTotal"
        ? "TRANSACTION_TOTAL_HCU"
        : field === "transactionDepth"
          ? "TRANSACTION_DEPTH_HCU"
          : "BLOCK_OR_BATCH_HCU";
    const spec = specs.find((entry) => isObject(entry) && entry.controlId === controlId);
    const signature = spec && typeof spec.signature === "string" ? spec.signature : undefined;
    const mandatory = field !== "blockOrBatchCap";

    /* F24 — a generic NOT_APPLICABLE can never satisfy a mandatory per-transaction control. */
    if (availability === "NOT_APPLICABLE_WITH_ARTIFACT_PROOF") {
      if (mandatory) {
        failures.push(`MANDATORY_LIMIT_DECLARED_NOT_APPLICABLE:${field}`);
        return emptyReading();
      }
      return {
        getterAvailability: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
        onChainValue: "NOT_APPLICABLE",
        result: "NOT_APPLICABLE_WITH_ARTIFACT_PROOF",
      };
    }
    if (availability === "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT") {
      /* Established by code identity plus machine-verifiable enforcement evidence in the record —
       * already validated there — never by a fallback to local source. */
      const evidence = ((bindingLimits.enforcementEvidence ?? {}) as Record<string, unknown>)[field];
      if (expected === null || !isObject(evidence)) {
        blockers.push(`LIMIT_ARTIFACT_PROOF_INCOMPLETE:${field}`);
        return emptyReading();
      }
      return {
        getterAvailability: "ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT",
        onChainValue: "NOT_READ_NO_GETTER",
        result: "VERIFIED_FROM_CODE_IDENTIFIED_ARTIFACT_NO_GETTER",
      };
    }
    if (availability !== "AVAILABLE_AND_READ_ON_CHAIN" || typeof signature !== "string") {
      blockers.push(`LIMIT_GETTER_AVAILABILITY_UNRESOLVED:${field}`);
      return emptyReading();
    }
    const selector = spec && typeof spec.selector === "string" ? spec.selector : undefined;
    if (typeof selector !== "string" || keccakSelector(signature) !== selector) {
      failures.push(`LIMIT_GETTER_SELECTOR_INVALID:${field}`);
      return { getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN", onChainValue: "UNRESOLVED", result: "MISMATCH" };
    }
    /* F40 — the target is DERIVED from the spec's validated role rather than assumed. A limit
     * getter may only declare AUTHORITY, so this is the verified authority address; a record
     * declaring any other role was already rejected. */
    const role = typeof spec?.targetRole === "string" ? spec.targetRole : "UNRESOLVED";
    const target = roleAddresses[role];
    if (typeof target !== "string") {
      failures.push(`LIMIT_GETTER_TARGET_ROLE_UNRESOLVED:${field}:${role}`);
      return { getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN", onChainValue: "UNRESOLVED", result: "MISMATCH" };
    }
    const raw = await guarded.send({
      method: "eth_call",
      params: [{ to: target, data: declaredCalldata(LIMIT_CONTROL_INTERFACE_CALLS[controlId]) }, pinnedHex],
    });
    const decoded = decodeUint256(raw);
    if (decoded === null) {
      failures.push(`LIMIT_GETTER_MALFORMED_RESULT:${field}`);
      return { getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN", onChainValue: "UNRESOLVED", result: "MISMATCH" };
    }
    const onChainValue = decoded.toString(10);
    if (expected === null) {
      blockers.push(`LIMIT_GETTER_EXPECTATION_MISSING:${field}`);
      return { getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN", onChainValue, result: "UNRESOLVED" };
    }
    if (onChainValue !== expected) {
      failures.push(`ON_CHAIN_LIMIT_MISMATCH:${field}:${onChainValue}!=${expected}`);
      return { getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN", onChainValue, result: "MISMATCH" };
    }
    return {
      getterAvailability: "AVAILABLE_AND_READ_ON_CHAIN",
      onChainValue,
      result: "MATCHES_BINDING_RECORD_ON_CHAIN",
    };
  };

  try {
    /* INVARIANT H — zero requests unless a complete plan was installed and validated first. With
     * no valid binding record there IS no plan, so there is nothing the verifier may legitimately
     * ask; a run that cannot state its intended requests does not issue any. */
    if (!planInstalled) {
      throw new Error("no validated live call plan was installed; no request is issued");
    }
    /* Step 1 — chain identity. */
    const chainIdHex = await guarded.send({ method: "eth_chainId", params: [] });
    if (typeof chainIdHex !== "string" || BigInt(chainIdHex) !== SEPOLIA_CHAIN_ID) {
      failures.push("CHAIN_ID_MISMATCH");
      throw new Error("chain identity did not match; no further call is meaningful");
    }

    /* Step 2 — pin exactly one FINALIZED block. A reorg-eligible head makes the result
     * unreproducible, so there is no fallback to "latest". */
    const block = (await guarded.send({
      method: "eth_getBlockByNumber",
      params: [PINNED_BLOCK_FINALITY_POLICY.blockTag, false],
    })) as { number?: string; hash?: string } | null;
    if (!block || typeof block.number !== "string" || typeof block.hash !== "string") {
      blockers.push("FINALIZED_BLOCK_NOT_AVAILABLE");
      throw new Error("no finalized block could be pinned");
    }
    const pinnedHex = block.number;
    pinnedBlockNumber = BigInt(pinnedHex).toString(10);
    pinnedBlockHash = block.hash.toLowerCase();
    pinnedBlockFinality = "FINALIZED";
    guarded.bindToPinnedBlock(pinnedHex);

    /* Step 3 — executor code IDENTITY, not merely code existence. */
    const executorCode = hexCodeToBuffer(
      await guarded.send({ method: "eth_getCode", params: [SEPOLIA_EXECUTOR_ADDRESS, pinnedHex] }),
    );
    if (!executorCode) {
      failures.push("EXECUTOR_HAS_NO_CODE");
      throw new Error("configured executor carries no code at the pinned block");
    }
    executorCodeHash = sha256(executorCode);
    const expectedExecutorHash = bindingExecutor.expectedRuntimeSha256;
    if (typeof expectedExecutorHash !== "string") {
      executorCodeIdentityResult = "UNRESOLVED";
      blockers.push("EXECUTOR_CODE_IDENTITY_UNRESOLVED");
    } else if (expectedExecutorHash !== executorCodeHash) {
      executorCodeIdentityResult = "MISMATCH";
      failures.push("EXECUTOR_CODE_IDENTITY_MISMATCH");
    } else {
      executorCodeIdentityResult = "VERIFIED";
    }
    if (executorCodeIdentityResult !== "VERIFIED" && DERIVATION_CHAIN_POLICY.stopOnExecutorCodeIdentityMismatch) {
      /* Read-only calls are still a derivation chain: deriving the authority from an unverified
       * executor would attribute authority to an unverified contract. */
      throw new Error("executor code identity is not verified; the derivation chain stops here");
    }

    /* Step 4 — executor version coherence against the binding record. */
    /* F40 — the calldata comes from the DECLARED interface manifest, recomputed from its canonical
     * signature. There is no parallel hard-coded selector path. */
    executorVersion =
      decodeAbiString(
        await guarded.send({
          method: "eth_call",
          params: [{ to: SEPOLIA_EXECUTOR_ADDRESS, data: declaredCalldata("EXECUTOR_VERSION") }, pinnedHex],
        }),
      ) ?? "UNRESOLVED";
    if (executorVersion === "UNRESOLVED") blockers.push("EXECUTOR_VERSION_NOT_RESOLVED");
    if (typeof bindingExecutor.expectedVersion !== "string") {
      executorVersionResult = "UNRESOLVED";
    } else if (executorVersion !== bindingExecutor.expectedVersion) {
      executorVersionResult = "MISMATCH";
      failures.push("EXECUTOR_VERSION_MISMATCH");
    } else {
      executorVersionResult = "MATCHES_BINDING_RECORD";
    }
    if (executorVersionResult !== "MATCHES_BINDING_RECORD" && DERIVATION_CHAIN_POLICY.stopOnExecutorVersionMismatch) {
      throw new Error("executor version is not verified; the derivation chain stops here");
    }

    /* Step 5 — derive the authority from the verified executor only. */
    const derived = decodeAddressWord(
      await guarded.send({
        method: "eth_call",
        params: [{ to: SEPOLIA_EXECUTOR_ADDRESS, data: declaredCalldata("EXECUTOR_AUTHORITY_GETTER") }, pinnedHex],
      }),
    );
    if (!derived) {
      blockers.push("AUTHORITY_ADDRESS_NOT_DERIVED_FROM_EXECUTOR");
      throw new Error("authority address could not be derived from the verified executor");
    }
    /* CORRECTION 4 — no equality check against the stale plugin constant.
     *
     * The address was DERIVED from the verified executor. If the executor genuinely returns the
     * same value the obsolete plugin literal happens to carry, that is a coincidence about the
     * literal, not evidence about the deployment — and failing on it would refuse a correct
     * authority for a numeric accident. The stale constant is forbidden as a SOURCE, which the
     * source-origin guard enforces; it is not forbidden as a value. Whether this derived address is
     * the right authority is decided below, by code identity, version and reciprocal linkage. */
    authorityAddress = derived;
    roleAddresses.AUTHORITY = derived;

    /* Step 6 — authority code identity at the derived address. */
    const authorityCode = hexCodeToBuffer(
      await guarded.send({ method: "eth_getCode", params: [authorityAddress, pinnedHex] }),
    );
    if (!authorityCode) {
      failures.push("AUTHORITY_HAS_NO_CODE");
      throw new Error("authority carries no code at the pinned block");
    }
    authorityCodeHash = sha256(authorityCode);

    /* Step 7 — implementation resolution strictly under the reviewed deployment model. ERC-1967 is
     * never assumed; a direct deployment is handled as a direct deployment. */
    if (authorityDeploymentModel === "ERC1967_PROXY") {
      const expectedProxyHash = bindingAuthority.expectedProxyRuntimeSha256;
      if (typeof expectedProxyHash !== "string") {
        authorityCodeIdentityResult = "UNRESOLVED";
        blockers.push("AUTHORITY_PROXY_CODE_IDENTITY_UNRESOLVED");
      } else if (expectedProxyHash !== authorityCodeHash) {
        authorityCodeIdentityResult = "MISMATCH";
        failures.push("AUTHORITY_PROXY_CODE_IDENTITY_MISMATCH");
      } else {
        authorityCodeIdentityResult = "VERIFIED";
      }
      if (authorityCodeIdentityResult !== "VERIFIED" && DERIVATION_CHAIN_POLICY.stopOnAuthorityProxyIdentityMismatch) {
        throw new Error("authority proxy identity is not verified; the derivation chain stops here");
      }
      const implementationWord = await guarded.send({
        method: "eth_getStorageAt",
        params: [authorityAddress, ERC1967_IMPLEMENTATION_SLOT, pinnedHex],
      });
      const implementation = decodeAddressWord(implementationWord);
      if (!implementation) {
        blockers.push("ERC1967_IMPLEMENTATION_SLOT_EMPTY_OR_MALFORMED");
        throw new Error("ERC-1967 implementation slot did not resolve to an address");
      }
      /* F38 — the declared, closed, digest-bound implementation-address policy. The record can
       * genuinely carry it now, so this check is reachable rather than dead. */
      const policy = bindingAuthority.implementationAddressPolicy as Record<string, unknown> | undefined;
      if (!isObject(policy)) {
        implementationAddressPolicyResult = "UNRESOLVED";
        blockers.push("AUTHORITY_IMPLEMENTATION_ADDRESS_POLICY_UNRESOLVED");
      } else if (policy.kind === "EXACT_PINNED_ADDRESS") {
        const pinnedAddress = String(policy.expectedImplementationAddress).toLowerCase();
        if (pinnedAddress === implementation) {
          implementationAddressPolicyResult = "EXACT_MATCH";
        } else {
          implementationAddressPolicyResult = "MISMATCH";
          failures.push(`AUTHORITY_IMPLEMENTATION_ADDRESS_MISMATCH:${implementation}!=${pinnedAddress}`);
        }
      } else {
        /* A reviewed code-identical upgrade permits the ADDRESS to move; it never permits the
         * code to differ, and the normalized comparison below still decides that. */
        implementationAddressPolicyResult = "PERMITTED_CODE_IDENTICAL_CHANGE";
      }
      if (
        implementationAddressPolicyResult === "MISMATCH" &&
        DERIVATION_CHAIN_POLICY.stopOnImplementationAddressPolicyViolation
      ) {
        throw new Error("the authority implementation address violates its reviewed policy");
      }
      authorityImplementationAddress = implementation;
      roleAddresses.AUTHORITY_IMPLEMENTATION = implementation;
      implementationResolutionResult = "VERIFIED_ERC1967_STORAGE_SLOT";
    } else if (authorityDeploymentModel === "DIRECT") {
      /* The authority IS the implementation; there is no slot to read, and its code identity is
       * decided by the authoritative normalized comparison below — never assumed here. */
      authorityImplementationAddress = authorityAddress;
      roleAddresses.AUTHORITY_IMPLEMENTATION = authorityAddress;
      implementationResolutionResult = "NOT_APPLICABLE_DIRECT_DEPLOYMENT";
      /* A directly deployed authority has no separate implementation to pin. */
      implementationAddressPolicyResult = "NOT_APPLICABLE_DIRECT_DEPLOYMENT";
    } else {
      blockers.push("AUTHORITY_DEPLOYMENT_MODEL_UNRESOLVED");
      throw new Error("the authority deployment model is not established by a reviewed binding record");
    }

    /* Step 8 — implementation runtime code and exact normalized comparison against the resolved
     * current official artifact. The local 0.10.0 fixture is never the comparison target. */
    const implementationCode =
      authorityImplementationAddress === authorityAddress
        ? authorityCode
        : hexCodeToBuffer(
            await guarded.send({ method: "eth_getCode", params: [authorityImplementationAddress, pinnedHex] }),
          );
    if (!implementationCode) {
      failures.push("AUTHORITY_IMPLEMENTATION_HAS_NO_CODE");
      throw new Error("authority implementation carries no code at the pinned block");
    }
    /* The authoritative manifest and expected digest are RECOMPUTED here, from the authenticated
     * build-info, against the implementation address the chain just resolved. Nothing is read from
     * the record, and nothing could have been computed earlier: the digest depends on that address.
     *
     * The 30 PUSH20 executor constants in this runtime are compile-time code, not immutables, and
     * remain byte-for-byte part of the comparison. */
    const liveDerivation =
      binding === null
        ? null
        : deriveAuthorityFromSourceMaterial(binding, { implementationAddress: authorityImplementationAddress });
    for (const blocker of liveDerivation?.blockers ?? []) blockers.push(blocker);
    const recordManifest = liveDerivation?.artifactBuild?.normalizationManifest as NormalizationManifest | undefined;
    if (!recordManifest) {
      blockers.push("NORMALIZATION_MANIFEST_UNRESOLVED");
      throw new Error("no authenticated normalization manifest; authoritative identity cannot be computed");
    }
    if (
      liveDerivation?.artifactBuild !== undefined &&
      liveDerivation.artifactBuild !== null &&
      liveDerivation.artifactBuild.expectedNormalizedRuntimeSha256 !== "UNRESOLVED"
    ) {
      expectedDeployedNormalizedHash = liveDerivation.artifactBuild.expectedNormalizedRuntimeSha256;
    }
    const normalization = normalizeRuntimeBytecodeFromManifest(implementationCode, recordManifest, {
      implementationAddress: authorityImplementationAddress,
    });
    normalizedImplementationHash = normalization.normalizedSha256;
    codeIdentityResult = classifyCodeIdentity({
      normalizedSha256: normalization.normalizedSha256,
      normalizationOk: normalization.ok,
      expectedAuthoritativeSha256: expectedDeployedNormalizedHash,
    });
    if (codeIdentityResult === "BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED") {
      blockers.push("CURRENT_OFFICIAL_ARTIFACT_IDENTITY_UNRESOLVED");
    } else if (codeIdentityResult === "MISMATCH") {
      failures.push(`NORMALIZED_CODE_IDENTITY_MISMATCH:${normalization.failures.join("|") || "digest"}`);
    }
    if (authorityDeploymentModel === "DIRECT") {
      /* F32 — derived, not assigned. */
      authorityCodeIdentityResult =
        codeIdentityResult === "VERIFIED" ? "VERIFIED" : codeIdentityResult === "MISMATCH" ? "MISMATCH" : "UNRESOLVED";
    }
    /* F38 — the chain stops HERE when the implementation is not the reviewed artifact. Every call
     * below reads a fact FROM that implementation: its version, its reciprocal link, its ceilings
     * and its exemptions. Asking an unverified contract those questions and recording the answers
     * would attribute them to the authority the record describes. */
    if (codeIdentityResult !== "VERIFIED" && DERIVATION_CHAIN_POLICY.stopOnImplementationIdentityMismatch) {
      throw new Error("authority implementation identity is not verified; the derivation chain stops here");
    }

    /* Step 9 — reciprocal linkage. */
    const reciprocal = decodeAddressWord(
      await guarded.send({
        method: "eth_call",
        params: [{ to: authorityAddress, data: declaredCalldata("AUTHORITY_RECIPROCAL_EXECUTOR_GETTER") }, pinnedHex],
      }),
    );
    if (reciprocal === null) reciprocalLinkageResult = "UNRESOLVED";
    else if (reciprocal !== SEPOLIA_EXECUTOR_ADDRESS.toLowerCase()) {
      reciprocalLinkageResult = "BROKEN";
      failures.push("RECIPROCAL_LINKAGE_BROKEN");
    } else reciprocalLinkageResult = "VERIFIED";
    if (reciprocalLinkageResult === "UNRESOLVED") blockers.push("RECIPROCAL_LINKAGE_NOT_RESOLVED");

    /* Step 10 — authority version coherence against the binding record. */
    authorityVersion =
      decodeAbiString(
        await guarded.send({
          method: "eth_call",
          params: [{ to: authorityAddress, data: declaredCalldata("AUTHORITY_VERSION") }, pinnedHex],
        }),
      ) ?? "UNRESOLVED";
    if (authorityVersion === "UNRESOLVED") blockers.push("AUTHORITY_VERSION_NOT_RESOLVED");
    if (typeof bindingAuthority.expectedImplementationVersion !== "string") {
      authorityVersionResult = "UNRESOLVED";
    } else if (authorityVersion !== bindingAuthority.expectedImplementationVersion) {
      authorityVersionResult = "MISMATCH";
      failures.push("AUTHORITY_VERSION_MISMATCH");
    } else {
      authorityVersionResult = "MATCHES_BINDING_RECORD";
    }

    /* Steps 11-13 — the actual on-chain HCU limits, read from the verified interface and compared
     * to the binding record. Numeric values are never taken from local source. */
    totalHcuOnChainReading = await readLimitGetter(
      "transactionTotal",
      typeof bindingLimits.expectedTransactionTotal === "string" ? bindingLimits.expectedTransactionTotal : null,
      pinnedHex,
    );
    depthHcuOnChainReading = await readLimitGetter(
      "transactionDepth",
      typeof bindingLimits.expectedTransactionDepth === "string" ? bindingLimits.expectedTransactionDepth : null,
      pinnedHex,
    );
    blockOrBatchOnChainReading = await readLimitGetter(
      "blockOrBatchCap",
      typeof bindingBlockOrBatch.value === "string" ? bindingBlockOrBatch.value : null,
      pinnedHex,
    );

    /* Step 14 — caller applicability, resolved for EVERY SG-4 subject from its declared
     * specification. Calldata is encoded from the declared ABI argument types and values, and only
     * the declared return type is decoded. An unknown result is never "not exempt". */
    const specs = Array.isArray(bindingInterface.callerApplicability)
      ? (bindingInterface.callerApplicability as Record<string, unknown>[])
      : [];
    for (const subject of SG4_APPLICABILITY_SUBJECTS) {
      const spec = specs.find((entry) => isObject(entry) && entry.subject === subject);
      if (!spec) {
        callerApplicabilityResults.push({
          result: "UNRESOLVED",
          state: "UNRESOLVED",
          subject,
          subjectAddress: "UNRESOLVED",
        });
        blockers.push(`CALLER_APPLICABILITY_UNRESOLVED:${subject}`);
        continue;
      }
      const subjectAddress = typeof spec.subjectAddress === "string" ? spec.subjectAddress : "UNRESOLVED";
      if (spec.state !== "AVAILABLE") {
        /* Documented absence or non-applicability, each already required to carry an
         * artifact-bound proof by the record validator. */
        callerApplicabilityResults.push({
          result: "NOT_APPLICABLE_WITH_PROOF",
          state: spec.state as string,
          subject,
          subjectAddress,
        });
        continue;
      }
      /* CORRECTION 5 — one path. The interface manifest entry supplies the calldata, the target
       * role and the return type; there is no parallel construction from the policy object. */
      const applicabilityCallId = callerApplicabilityCallId(subject);
      const interfaceEntry = binding === null ? null : interfaceCall(binding, applicabilityCallId);
      if (interfaceEntry === null) {
        callerApplicabilityResults.push({
          result: "UNKNOWN_EXEMPTION",
          state: "AVAILABLE",
          subject,
          subjectAddress,
        });
        failures.push(`CALLER_APPLICABILITY_INTERFACE_CALL_NOT_DECLARED:${subject}`);
        continue;
      }
      /* The target is a verified ROLE; its address comes from the verified deployment chain. */
      const targetAddress = roleAddresses[String(interfaceEntry.targetRole)] ?? authorityAddress;
      let calldata: string;
      try {
        calldata = declaredCalldata(applicabilityCallId);
      } catch {
        callerApplicabilityResults.push({
          result: "UNKNOWN_EXEMPTION",
          state: "AVAILABLE",
          subject,
          subjectAddress,
        });
        failures.push(`CALLER_APPLICABILITY_CALLDATA_INVALID:${subject}`);
        continue;
      }
      const raw = await guarded.send({
        method: "eth_call",
        params: [{ to: targetAddress, data: calldata }, pinnedHex],
      });
      const decoded = decodeAbiReturn(String(interfaceEntry.returnType), raw);
      if (!decoded.ok) {
        callerApplicabilityResults.push({
          result: "MALFORMED",
          state: "AVAILABLE",
          subject,
          subjectAddress,
        });
        failures.push(`CALLER_APPLICABILITY_MALFORMED_RESULT:${subject}`);
        continue;
      }
      const accepted = spec.acceptedResults as unknown[];
      const asComparable = typeof decoded.value === "boolean" ? decoded.value : String(decoded.value);
      const isAccepted = accepted.some((entry) =>
        typeof entry === "boolean" ? entry === asComparable : String(entry) === String(asComparable),
      );
      if (!isAccepted) {
        callerApplicabilityResults.push({
          result: "UNKNOWN_EXEMPTION",
          state: "AVAILABLE",
          subject,
          subjectAddress,
        });
        failures.push(`CALLER_APPLICABILITY_UNEXPECTED_RESULT:${subject}`);
        continue;
      }
      /* F30 — every interpretation is implemented explicitly against its declared return type.
       * There is no default branch, so no value is exempt-by-accident. */
      let exempt: boolean;
      switch (spec.interpretation) {
        case "BOOL_TRUE_MEANS_EXEMPT":
          exempt = decoded.value === true;
          break;
        case "BOOL_FALSE_MEANS_EXEMPT":
          exempt = decoded.value === false;
          break;
        case "UINT_NONZERO_MEANS_EXEMPT":
          exempt = String(decoded.value) !== "0";
          break;
        case "ADDRESS_NONZERO_MEANS_EXEMPT":
          exempt = String(decoded.value) !== `0x${"0".repeat(40)}`;
          break;
        default:
          callerApplicabilityResults.push({
            result: "UNKNOWN_EXEMPTION",
            state: "AVAILABLE",
            subject,
            subjectAddress,
          });
          failures.push(`CALLER_APPLICABILITY_UNKNOWN_INTERPRETATION:${subject}`);
          continue;
      }
      callerApplicabilityResults.push({
        result: exempt ? "EXEMPT" : "NOT_EXEMPT",
        state: "AVAILABLE",
        subject,
        subjectAddress,
      });
    }

    /* The operation schedule comes from the binding record's manifest for the SAME artifact — never
     * from parsing the local 0.10.0 source. Compatibility with the installed calculator is checked
     * against that manifest and fails closed. */
    /* F25/F26/F27 — the ONE shared comparison. Coverage, unsupported variants and every
     * compatibility result field derive from it, over the exact SG-4 used-variant closure. No
     * local fixture table participates. */
    if (codeIdentityResult === "VERIFIED" && binding !== null) {
      const pricing = (binding.operationSchedule as Record<string, unknown>).pricingManifest as
        | PricingManifest
        | undefined;
      if (pricing) {
        pricingComparison = compareCalculatorAgainstPricingManifest(installedTable, pricing);
        unsupportedByCalculator = [
          ...pricingComparison.missingFromCalculator,
          ...pricingComparison.missingFromManifest,
        ].sort();
        const blocking = pricingComparisonBlockers(pricingComparison);
        if (blocking.length > 0) failures.push(`SG4_VARIANT_COMPATIBILITY:${blocking.join("|")}`);
      }
    }
  } catch (error) {
    /* Every abort above already recorded a blocker or a failure; the throw only stops further
     * calls. An unexpected throw is recorded rather than swallowed. */
    const message = error instanceof Error ? error.message : "unknown live verification failure";
    if (blockers.length === 0 && failures.length === 0) blockers.push(`LIVE_VERIFICATION_ABORTED:${message}`);
  }

  /* ----- Late-bound resolution.
   *
   * Every authoritative source-derived fact below comes from the validated binding record for the
   * artifact whose bytecode was identified on chain. None comes from the local 0.10.0 fixture.
   * `bound` requires BOTH a verified code identity AND a valid record: a matching hash alone does
   * not make locally parsed data official. */
  const recordResolved =
    binding !== null && (binding.authorityResolution as Record<string, unknown>).status === "RESOLVED";
  const bound = codeIdentityResult === "VERIFIED" && recordResolved;

  /* Block/batch comes from the record's classification for that artifact, corroborated on chain
   * when the deployment exposes a cap getter. */
  const recordedBlockState = bindingBlockOrBatch.state;
  const blockOrBatchControl: ControlDeclaration = bound
    ? {
        metricId: "BLOCK_OR_BATCH_HCU",
        scope: "PER_BLOCK_OR_BATCH",
        unit: "HCU",
        authorityState:
          recordedBlockState === "PROVEN_PRESENT"
            ? "PROVEN_PRESENT"
            : recordedBlockState === "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION"
              ? "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION"
              : "UNRESOLVED",
        value: typeof bindingBlockOrBatch.value === "string" ? bindingBlockOrBatch.value : null,
        absenceReason:
          recordedBlockState === "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION" ? String(bindingBlockOrBatch.proof) : null,
        verificationMethod: `ENUMERATION of the authoritative artifact recorded in the reviewed authority-binding record: ${String(bindingBlockOrBatch.proof)}`,
        sourceImplementation: `${String(bindingArtifact.id)}@${authorityImplementationAddress}@block:${pinnedBlockNumber}`,
        applicabilityConclusion:
          recordedBlockState === "PROVEN_PRESENT"
            ? "APPLICABLE_TO_EVERY_SG4_MEASURED_BLOCK_OR_BATCH"
            : "NOT_ENFORCED_BY_THE_VERIFIED_IMPLEMENTATION_THEREFORE_NOT_BLOCKING",
        liveDeploymentBinding: "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION",
        blocking:
          recordedBlockState !== "PROVEN_PRESENT" && recordedBlockState !== "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION",
      }
    : {
        metricId: "BLOCK_OR_BATCH_HCU",
        scope: "PER_BLOCK_OR_BATCH",
        unit: "HCU",
        authorityState: "UNRESOLVED",
        value: null,
        absenceReason: null,
        verificationMethod:
          "Not established: no validated authority-binding record for a code-identified deployed implementation. The local 0.10.0 fixture may not supply this classification.",
        sourceImplementation: "NOT_YET_IDENTIFIED_PENDING_LIVE_CODE_IDENTITY",
        applicabilityConclusion: "UNRESOLVED_THEREFORE_BLOCKING",
        liveDeploymentBinding: "PENDING_LIVE_DEPLOYMENT_BINDING",
        blocking: true,
      };
  if (blockOrBatchControl.blocking) blockers.push("BLOCK_OR_BATCH_CONTROL_UNRESOLVED");

  /* Operation-schedule authority and immutable provenance are late-bound from the record too. */
  const operationScheduleAuthorityState = bound ? "RESOLVED" : "UNRESOLVED";
  if (operationScheduleAuthorityState === "UNRESOLVED") blockers.push("OPERATION_SCHEDULE_AUTHORITY_UNRESOLVED");
  const bindingProvenance = (binding?.provenance ?? {}) as Record<string, unknown>;
  const immutableProvenanceState =
    binding !== null && bindingProvenance.reverificationStatus === "REVERIFIED" && recordResolved
      ? "RESOLVED"
      : String(protocol.provenance.state);
  if (immutableProvenanceState !== "RESOLVED") blockers.push("IMMUTABLE_PROVENANCE_NOT_REVERIFIED");

  /* Network ceiling semantics come from the record's code-derived facts for that same artifact. */
  /* INVARIANT D — derived from the authenticated source, not read from the record. */
  const recordedSemantics = derivation.authoritySource?.derivedLimitSemantics ?? bindingLimits.semantics;
  const liveLimitSemantics: LiveLimitSemantics =
    bound && typeof recordedSemantics === "string" && LIVE_LIMIT_SEMANTICS_VALUES.includes(recordedSemantics)
      ? (recordedSemantics as LiveLimitSemantics)
      : "UNRESOLVED";
  if (liveLimitSemantics === "UNRESOLVED") blockers.push("NETWORK_LIMIT_SEMANTICS_UNRESOLVED");
  const greatestTotal = greatestAcceptedValue(liveLimitSemantics, TRANSACTION_TOTAL_HCU_LIMIT);
  const greatestDepth = greatestAcceptedValue(liveLimitSemantics, TRANSACTION_DEPTH_HCU_LIMIT);

  /* Every facet must cite the same artifact AND declare a non-local origin. A facet whose fact was
   * read from the local fixture is labelled as such and can never satisfy a PASS. */
  const authoritativeArtifactId = bound ? String(bindingArtifact.id) : "UNRESOLVED";

  /* F33 — the deployed authority root, derived from the record's SELECTED current-official
   * provenance tuple. Nothing here comes from a locally installed package: the deployed authority
   * is not a package, and the local 0.10.0 fixture is not the deployed authority. */
  const deployedAuthorityRoot = ((): Record<string, string> => {
    const unresolved = Object.fromEntries(
      DEPLOYED_AUTHORITY_ROOT_POLICY.fields.map((field) => [field, "UNRESOLVED"]),
    ) as Record<string, string>;
    if (!bound || binding === null) return unresolved;
    const selected = selectedProvenanceTuple(binding, DEPLOYED_AUTHORITY_ROOT_POLICY.provenanceSubject);
    if (selected === null || selected.kind !== "SOURCE_FILE") return unresolved;
    return {
      artifactId: authoritativeArtifactId,
      commit: String(selected.commit ?? "UNRESOLVED"),
      contentSha256: String(provenanceContentSha256(selected) ?? "UNRESOLVED"),
      path: String(selected.path ?? "UNRESOLVED"),
      repository: String(selected.repository ?? "UNRESOLVED"),
      tag: String(selected.tag ?? "UNRESOLVED"),
    };
  })();

  const facetOrigin = (corroboratedOnChain: boolean): string =>
    bound
      ? corroboratedOnChain
        ? "AUTHORITATIVE_BINDING_RECORD_ON_CHAIN_CORROBORATED"
        : "AUTHORITATIVE_BINDING_RECORD"
      : "UNRESOLVED";
  const limitValuesCorroborated =
    totalHcuOnChainReading.result === "MATCHES_BINDING_RECORD_ON_CHAIN" &&
    depthHcuOnChainReading.result === "MATCHES_BINDING_RECORD_ON_CHAIN";
  const facetArtifactBinding = {
    blockOrBatch: {
      artifactId: authoritativeArtifactId,
      origin: facetOrigin(blockOrBatchOnChainReading.result === "MATCHES_BINDING_RECORD_ON_CHAIN"),
    },
    codeIdentity: { artifactId: authoritativeArtifactId, origin: facetOrigin(true) },
    limitSemantics: { artifactId: authoritativeArtifactId, origin: facetOrigin(limitValuesCorroborated) },
    limitValues: { artifactId: authoritativeArtifactId, origin: facetOrigin(limitValuesCorroborated) },
    operationSchedule: { artifactId: authoritativeArtifactId, origin: facetOrigin(false) },
  };
  /* F26 — the local 0.10.0 fixture comparison deliberately contributes NOTHING here. It is an
   * offline self-test only; a mismatch in an unused old authority fixture must not invalidate a
   * current-official live authority result. */

  /* F25/F26 — coverage and unsupported status derive ONLY from the shared authoritative
   * comparison. The removed legacy `operationSchedule.manifest` field is gone, and no
   * UNSUPPORTED_OPERATION_GUARD name list participates: a variant is unsupported exactly when the
   * used-variant closure is not priced by both the authoritative schedule and the calculator. */
  const sg4CoverageResult =
    pricingComparison === null
      ? "UNRESOLVED"
      : pricingComparisonBlockers(pricingComparison).length === 0
        ? "COMPLETE"
        : "INCOMPLETE";
  if (sg4CoverageResult === "INCOMPLETE") failures.push("SG4_COVERAGE_INCOMPLETE");
  if (sg4CoverageResult === "UNRESOLVED") blockers.push("SG4_COVERAGE_UNRESOLVED");

  /* Both per-transaction controls are promoted only when the record supplies the values for the
   * code-identified artifact AND the on-chain reading corroborates them. Local limit values and
   * local enforcement paths are never promoted to PROVEN_PRESENT. */
  const perTransactionControl = (
    metricId: string,
    recordedValue: unknown,
    reading: Record<string, unknown>,
  ): ControlDeclaration => {
    /* F24 — only an on-chain reading or an artifact-proven absence may promote a control. A
     * NOT_APPLICABLE reading never can. */
    const corroborated = PROMOTING_LIMIT_RESULTS.includes(String(reading.result));
    const proven = bound && typeof recordedValue === "string" && corroborated;
    return {
      metricId,
      scope: "PER_TRANSACTION",
      unit: "HCU",
      authorityState: proven ? "PROVEN_PRESENT" : "LOCAL_EXPECTED_PENDING_LIVE_BINDING",
      value:
        typeof recordedValue === "string"
          ? recordedValue
          : (metricId === "TRANSACTION_TOTAL_HCU" ? TRANSACTION_TOTAL_HCU_LIMIT : TRANSACTION_DEPTH_HCU_LIMIT).toString(
              10,
            ),
      absenceReason: null,
      verificationMethod: proven
        ? `Value and enforcement path taken from the reviewed authority-binding record for artifact ${authoritativeArtifactId}, corroborated on chain at block ${pinnedBlockNumber}.`
        : "Local expectation from the installed fixture; not bound to the deployed implementation and not corroborated on chain.",
      sourceImplementation: proven
        ? `${authoritativeArtifactId}@${authorityImplementationAddress}@block:${pinnedBlockNumber}`
        : "@fhevm/host-contracts@0.10.0 contracts/HCULimit.sol (LOCAL_INSTALLED_FIXTURE)",
      applicabilityConclusion: proven ? "APPLICABLE_TO_EVERY_SG4_MEASURED_TRANSACTION" : "PENDING_LIVE_BINDING",
      liveDeploymentBinding: proven ? "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION" : "PENDING_LIVE_DEPLOYMENT_BINDING",
      blocking: !proven,
    };
  };
  const totalControl = perTransactionControl(
    "TRANSACTION_TOTAL_HCU",
    bindingLimits.expectedTransactionTotal,
    totalHcuOnChainReading,
  );
  const depthControl = perTransactionControl(
    "TRANSACTION_DEPTH_HCU",
    bindingLimits.expectedTransactionDepth,
    depthHcuOnChainReading,
  );
  if (totalControl.blocking) blockers.push("TRANSACTION_TOTAL_CONTROL_NOT_BOUND");
  if (depthControl.blocking) blockers.push("TRANSACTION_DEPTH_CONTROL_NOT_BOUND");
  if (pinnedBlockFinality !== "FINALIZED") blockers.push("PINNED_BLOCK_NOT_FINALIZED");
  /* Aggregate applicability across every SG-4 subject; unknown or unresolved fails closed. */
  const applicabilityStates = callerApplicabilityResults.map((entry) => String(entry.result));
  if (applicabilityStates.length === 0) callerExemptionResult = "UNRESOLVED";
  else if (applicabilityStates.includes("UNKNOWN_EXEMPTION") || applicabilityStates.includes("MALFORMED")) {
    callerExemptionResult = "UNKNOWN_EXEMPTION";
  } else if (applicabilityStates.includes("UNRESOLVED")) callerExemptionResult = "UNRESOLVED";
  else if (applicabilityStates.includes("EXEMPT")) callerExemptionResult = "EXEMPT";
  else if (applicabilityStates.every((entry) => entry === "NOT_APPLICABLE_WITH_PROOF")) {
    callerExemptionResult = "NOT_APPLICABLE_WITH_PROOF";
  } else callerExemptionResult = "NOT_EXEMPT";
  if (callerExemptionResult === "UNKNOWN_EXEMPTION") failures.push("CALLER_EXEMPTION_UNKNOWN");
  else if (callerExemptionResult === "UNRESOLVED") blockers.push("CALLER_EXEMPTION_UNRESOLVED");
  else if (callerExemptionResult === "EXEMPT") {
    /* F30 — an SG-4-relevant caller exempt from the enforced ceiling means the ceiling is not the
     * authority for SG-4's measured transactions. That is a contradiction of the recorded
     * authority, so it is a FAIL rather than a blocker. */
    failures.push("RELEVANT_CALLER_IS_EXEMPT_FROM_THE_ENFORCED_CEILING");
  }

  const controlState = (control: ControlDeclaration): Record<string, unknown> => ({
    authorityState: control.authorityState,
    blocking: control.blocking,
    liveDeploymentBinding: control.liveDeploymentBinding,
    ...(control.value === null ? {} : { value: control.value }),
    scope: control.scope,
  });

  /* CL4 — the official build must be the pinned independent reproduction. Until the real external
   * build-info is supplied by the binding record, this blocks: the run has simply not established
   * that it verified the build Commit A pinned. */
  if (derivation.artifactBuild === null) {
    blockers.push("REPRODUCED_BUILD_UNRESOLVED");
  } else if (derivation.artifactBuild.sourceContentSha256 !== REPRODUCED_OFFICIAL_BUILD.buildInfoSha256) {
    blockers.push(`OFFICIAL_BUILD_IS_NOT_THE_PINNED_REPRODUCTION:${derivation.artifactBuild.sourceContentSha256}`);
  }

  /* F39 — the plan is a runtime invariant. Its verdict is computed from what the transport
   * actually enforced, never from a post-hoc comparison. */
  const planViolations = guarded.planViolations();
  const actualLog = guarded.callLog();
  if (planEnforcementResult !== "VIOLATED") {
    if (binding === null) {
      planEnforcementResult = "NOT_APPLICABLE_PLAN_UNRESOLVED";
    } else if (planViolations.length > 0) {
      planEnforcementResult = "VIOLATED";
    } else if (guarded.planCursor() === livePlan.length && actualLog.length === livePlan.length) {
      planEnforcementResult = "ENFORCED_EXACT";
    } else {
      /* The chain stopped at a broken link, so the plan is legitimately unfinished. That is never
       * a PASS, and it is not a violation either. */
      planEnforcementResult = "UNRESOLVED";
      blockers.push(`LIVE_CALL_PLAN_NOT_EXHAUSTED:${guarded.planCursor()}/${livePlan.length}`);
    }
  }
  if (planEnforcementResult === "VIOLATED") {
    failures.push(`LIVE_CALL_PLAN_VIOLATED:${planViolations.join("|") || "divergence"}`);
  }

  const finalVerdict = failures.length > 0 ? "FAIL" : blockers.length > 0 ? "BLOCKED" : "PASS";

  const result: AuthorityResult = {
    accountAuthorizationRequested: false,
    authoritativeArtifactId,
    authorityAddress,
    authorityBindingRecordResult,
    authorityCodeHash,
    authorityCodeIdentityResult,
    authorityDeploymentModel,
    authorityImplementationAddress,
    authorityProtocolDigest: sha256(serializeAuthorityProtocol()),
    /* F33 — three separate identities, each reported for what it actually is. */
    measurementToolchainRoot: {
      executionRelevantFiles: measurementRoot.executionRelevantFiles,
      verificationResult: measurementRoot.result,
      calculatorPath: MEASUREMENT_TOOLCHAIN_ROOT.calculatorPath,
      costTablePath: MEASUREMENT_TOOLCHAIN_ROOT.costTablePath,
      integrity: MEASUREMENT_TOOLCHAIN_ROOT.integrity,
      package: MEASUREMENT_TOOLCHAIN_ROOT.package,
      version: MEASUREMENT_TOOLCHAIN_ROOT.version,
    },
    deployedAuthorityRoot,
    localAuthorityFixtureRoot: {
      integrity: LOCAL_AUTHORITY_FIXTURE_ROOT.integrity,
      package: LOCAL_AUTHORITY_FIXTURE_ROOT.package,
      passRelevant: false,
      version: LOCAL_AUTHORITY_FIXTURE_ROOT.version,
    },
    liveCallCount: actualLog.length,
    liveCallLogDigest: actualLog.length === 0 ? "UNRESOLVED" : liveCallLogDigest(actualLog),
    livePlanCallCount: livePlan.length,
    /* CL4 — the identity of the official build this run actually consumed, and whether it is the
     * one Commit A pinned. The bytes are external (CL3); the expectation is not. */
    reproducedBuildInfoSha256: derivation.artifactBuild?.sourceContentSha256 ?? "UNRESOLVED",
    reproducedBuildResult:
      derivation.artifactBuild === null
        ? "UNRESOLVED"
        : derivation.artifactBuild.sourceContentSha256 === REPRODUCED_OFFICIAL_BUILD.buildInfoSha256
          ? "MATCHES_PINNED_REPRODUCED_BUILD"
          : "MISMATCH",
    livePlanDigest: livePlan.length === 0 ? "UNRESOLVED" : livePlanDigest(livePlan),
    planEnforcementResult,
    authorityTableHash:
      bound && binding !== null
        ? pricingManifestDigest((binding.operationSchedule as Record<string, unknown>).pricingManifest)
        : "UNRESOLVED",
    authorityVersion,
    authorityVersionResult,
    benchmarkProtocolDigest: sha256(serializeProtocol()),
    blockOrBatchControlState: controlState(blockOrBatchControl),
    blockOrBatchOnChainReading,
    calculatorHash: sha256(readFileSync(CALCULATOR_FILE)),
    callerApplicabilityResults,
    callerExemptionResult,
    chainId: SEPOLIA_CHAIN_ID.toString(10),
    codeIdentityResult,
    depthHcuOnChainReading,
    depthHcuLimit: TRANSACTION_DEPTH_HCU_LIMIT.toString(10),
    depthSafetyThreshold: DEPTH_SAFETY_THRESHOLD.toString(10),
    implementationResolutionResult,
    implementationAddressPolicyResult,
    executorAddress: SEPOLIA_EXECUTOR_ADDRESS,
    executorCodeHash,
    executorCodeIdentityResult,
    executorDeploymentModel,
    executorVersion,
    executorVersionResult,
    expectedDeployedNormalizedHash: expectedDeployedNormalizedHash ?? "UNRESOLVED",
    facetArtifactBinding,
    finalVerdict,
    gate: "SG-4",
    greatestAcceptedDepthHcu: greatestDepth === null ? "UNRESOLVED" : greatestDepth.toString(10),
    greatestAcceptedTotalHcu: greatestTotal === null ? "UNRESOLVED" : greatestTotal.toString(10),
    immutableProvenanceState,
    installedSourceHashesResult,
    localFixtureSelfTestResult,
    installedTableHash: sha256(readFileSync(COST_TABLE_FILE)),
    liveLimitSemantics,
    normalizedImplementationHash,
    operationCompatibilityResult:
      pricingComparison !== null
        ? {
            /* F20 — the AUTHORITATIVE comparison: installed calculator versus the record's pricing
             * manifest over the SG-4 operation closure. Official operations SG-4 never uses are
             * reported, not treated as blocking mismatches. Nothing here comes from the local
             * HCULimit fixture. */
            arityMismatches: pricingComparison.arityMismatches,
            authorityOnly: pricingComparison.officialOnlyUnusedBySg4,
            costMismatches: pricingComparison.costMismatches,
            installedOnly: pricingComparison.missingFromManifest,
            operandMismatches: pricingComparison.operandMismatches,
            operandTypeMismatches: pricingComparison.operandTypeMismatches,
            resultTypeMismatches: pricingComparison.resultTypeMismatches,
            shared: pricingComparison.usedVariants,
            translationMismatches: pricingComparison.translationMismatches,
            unsupportedByCalculator,
          }
        : {
            /* F26 — unbound, nothing authoritative is known. The local fixture comparison is NOT
             * serialized here: it is an offline self-test and has no bearing on the live result. */
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
          },
    operationScheduleAuthorityState,
    pinnedBlockFinality,
    pinnedBlockHash,
    pinnedBlockNumber,
    preparationLineageResult: lineage.result,
    protocolVersion: AUTHORITY_PROTOCOL_VERSION,
    reciprocalLinkageResult,
    rpcMethodsUsed: guarded.methodsUsed(),
    safetyBoundExclusivity: "EXCLUSIVE",
    schema: AUTHORITY_RESULT_SCHEMA,
    sg4CoverageResult,
    signingRequested: false,
    staleAddressGuardResult,
    status:
      finalVerdict === "PASS"
        ? "LIVE_READ_ONLY_AUTHORITY_VERIFICATION_COMPLETE"
        : `LIVE_READ_ONLY_AUTHORITY_VERIFICATION_${finalVerdict}: ${[...failures, ...blockers].sort().join("; ")}`,
    totalHcuLimit: TRANSACTION_TOTAL_HCU_LIMIT.toString(10),
    totalHcuOnChainReading,
    totalSafetyThreshold: TOTAL_SAFETY_THRESHOLD.toString(10),
    transactionDepthControlState: controlState(depthControl),
    transactionSubmitted: false,
    transactionTotalControlState: controlState(totalControl),
    unsupportedOperations: [...new Set(unsupportedByCalculator)].sort(),
    walletRequested: false,
  };

  /* Fail closed: the verifier must not emit a result its own validator rejects, and it must never
   * emit PASS while any validation error stands. */
  const errors = validateAuthorityResult(result);
  if (finalVerdict === "PASS" && errors.length > 0) {
    throw new Error(`live verification computed PASS but its result failed validation: ${errors.join("; ")}`);
  }
  const structuralErrors = validateResultAgainstSchema(result);
  if (structuralErrors.length > 0) {
    throw new Error(`live verification produced a structurally invalid result: ${structuralErrors.join("; ")}`);
  }
  return result;
}

/* ---------------------------------------------------------------------------------------------
 * Strict closed result validation.
 *
 * Two layers. `validateResultAgainstSchema` enforces the schema itself — required fields, closed
 * property sets, const, enum, type, and pattern, recursively through nested objects and arrays.
 * `validateAuthorityResult` adds the PASS coherence rules on top. No network-fetched dependency is
 * used; the recursion is explicit.
 * ------------------------------------------------------------------------------------------- */

type SchemaNode = Record<string, unknown>;

function validateNode(node: SchemaNode, value: unknown, path: string, errors: string[]): void {
  if ("const" in node) {
    if (value !== node.const) errors.push(`${path} must equal ${JSON.stringify(node.const)}`);
    return;
  }
  if ("enum" in node) {
    const allowed = node.enum as readonly unknown[];
    if (!allowed.includes(value)) errors.push(`${path} must be one of ${JSON.stringify(allowed)}`);
    return;
  }
  switch (node.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`${path} must be an object`);
        return;
      }
      const record = value as Record<string, unknown>;
      const properties = (node.properties ?? {}) as Record<string, SchemaNode>;
      for (const field of (node.required ?? []) as readonly string[]) {
        if (!(field in record)) errors.push(`${path}.${field} is required`);
      }
      if (node.additionalProperties === false) {
        for (const key of Object.keys(record)) {
          if (!(key in properties)) errors.push(`${path}.${key} is not a permitted property`);
        }
      }
      for (const [key, child] of Object.entries(properties)) {
        if (key in record) validateNode(child, record[key], `${path}.${key}`, errors);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        errors.push(`${path} must be an array`);
        return;
      }
      const items = node.items as SchemaNode | undefined;
      if (items) value.forEach((entry, index) => validateNode(items, entry, `${path}[${index}]`, errors));
      return;
    }
    case "string": {
      if (typeof value !== "string") {
        errors.push(`${path} must be a string`);
        return;
      }
      if (typeof node.pattern === "string" && !new RegExp(node.pattern, "u").test(value)) {
        errors.push(`${path} must match ${node.pattern}`);
      }
      return;
    }
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${path} must be a boolean`);
      return;
    default:
      return;
  }
}

export function validateResultAgainstSchema(result: Record<string, unknown>): string[] {
  const errors: string[] = [];
  validateNode(deriveAuthorityProtocol().resultSchema as unknown as SchemaNode, result, "result", errors);
  return errors.sort();
}

/* Full validation: schema closure plus every PASS coherence condition. A non-PASS result is held
 * only to the schema and the sanitation rules, so BLOCKED stays representable while UNRESOLVED
 * checks stand. */
export function validateAuthorityResult(result: Record<string, unknown>): string[] {
  const schema = deriveAuthorityProtocol().resultSchema;
  const errors: string[] = [...validateResultAgainstSchema(result)];

  /* Sanitation applies to every verdict. */
  for (const forbidden of schema.forbiddenProperties) {
    if (forbidden in result) errors.push(`forbidden sensitive field ${forbidden}`);
  }

  /* A value may accompany only a state that carries one, in every control state. */
  for (const field of [
    "blockOrBatchControlState",
    "transactionTotalControlState",
    "transactionDepthControlState",
  ] as const) {
    const state = result[field] as
      | { authorityState?: string; value?: string; blocking?: boolean; liveDeploymentBinding?: string }
      | undefined;
    if (!state) continue;
    const carriesValue =
      state.authorityState === "PROVEN_PRESENT" || state.authorityState === "LOCAL_EXPECTED_PENDING_LIVE_BINDING";
    if (!carriesValue && state.value !== undefined) {
      errors.push(`${field}: only a PROVEN_PRESENT control may carry a value`);
    }
    if (carriesValue && state.value === undefined) {
      errors.push(`${field}: a PROVEN_PRESENT control requires a value`);
    }
    if (state.authorityState === "UNRESOLVED" && state.blocking !== true) {
      errors.push(`${field}: an UNRESOLVED control must be blocking`);
    }
    if (
      state.authorityState === "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION" &&
      state.liveDeploymentBinding !== "BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION"
    ) {
      errors.push(`${field}: proven absence requires a verified deployed implementation`);
    }
  }
  if ((result.blockOrBatchControlState as { authorityState?: string } | undefined)?.authorityState === "UNRESOLVED") {
    errors.push("unresolved block/batch control is blocking");
  }
  if (result.staleAddressGuardResult === "REJECTED") {
    errors.push("authority result derived from the stale HCULimit constant is rejected");
  }

  if (result.finalVerdict !== "PASS") return [...new Set(errors)].sort();

  /* ----- PASS coherence. Every condition below must hold for a PASS to stand. ----- */
  const require = (condition: boolean, message: string): void => {
    if (!condition) errors.push(message);
  };

  require(result.codeIdentityResult === "VERIFIED", "PASS requires verified executor/authority code identity");

  /* F12 — identity must come from the resolved current official artifact, never the local fixture,
   * and every facet must cite that same artifact. */
  const expectedDeployed = result.expectedDeployedNormalizedHash;
  require(typeof expectedDeployed === "string" &&
    /^[0-9a-f]{64}$/u.test(
      expectedDeployed,
    ), "PASS requires a resolved current official artifact hash; the local fixture cannot stand in");
  require(result.normalizedImplementationHash ===
    expectedDeployed, "PASS requires the deployed normalized hash to equal the resolved official artifact hash");
  require(result.authoritativeArtifactId !==
    ARTIFACT_IDENTITY_ROOTS.localInstalledFixture
      .id, "PASS may not name the local installed fixture as the authoritative artifact");
  require(typeof result.authoritativeArtifactId === "string" &&
    result.authoritativeArtifactId !== "UNRESOLVED", "PASS requires a resolved authoritative artifact identity");
  const facets = result.facetArtifactBinding as Record<string, { artifactId?: string; origin?: string }> | undefined;
  require(facets !== undefined &&
    ARTIFACT_IDENTITY_ROOTS.facets.every(
      (facet) => facets[facet]?.artifactId === result.authoritativeArtifactId,
    ), "PASS requires code identity, limit values, limit semantics, operation schedule, and block/batch to be bound to the same artifact");
  /* F14 — a matching code hash does not make locally parsed data official. */
  require(facets !== undefined &&
    ARTIFACT_IDENTITY_ROOTS.facets.every(
      (facet) => !FACET_ORIGINS_FORBIDDEN_FOR_PASS.includes(facets[facet]?.origin ?? "UNRESOLVED"),
    ), "PASS requires every facet to originate from the authoritative binding record, never from the local installed fixture");

  /* F13 / F17 — the late-bound record must be present and valid. */
  require(result.authorityBindingRecordResult === "VALID", "PASS requires a valid authority-binding record");

  /* F16 — the whole deployment chain is verified, not merely resolved. */
  require(result.executorCodeIdentityResult ===
    "VERIFIED", "PASS requires verified executor code identity against the binding record");
  require(result.executorVersionResult ===
    "MATCHES_BINDING_RECORD", "PASS requires the executor version to match the binding record");
  require(result.authorityCodeIdentityResult ===
    "VERIFIED", "PASS requires verified authority code identity against the binding record");
  require(result.authorityVersionResult ===
    "MATCHES_BINDING_RECORD", "PASS requires the authority version to match the binding record");
  require(DEPLOYMENT_MODELS.includes(
    String(result.executorDeploymentModel),
  ), "PASS requires a reviewed executor deployment model");
  require(DEPLOYMENT_MODELS.includes(
    String(result.authorityDeploymentModel),
  ), "PASS requires a reviewed authority deployment model");

  /* F15/F24 — the two MANDATORY per-transaction readings must be read on chain or proven from the
   * code-identified artifact. A NOT_APPLICABLE may never stand in for either. */
  for (const [field, label] of [
    ["totalHcuOnChainReading", "total"],
    ["depthHcuOnChainReading", "depth"],
  ] as const) {
    const reading = result[field] as { result?: string } | undefined;
    require(PROMOTING_LIMIT_RESULTS.includes(
      String(reading?.result),
    ), `PASS requires the ${label} HCU limit read on chain or proven from the code-identified artifact; NOT_APPLICABLE may not stand in`);
  }
  /* The OPTIONAL block/batch control may be genuinely non-applicable, with an artifact proof. */
  const blockReading = result.blockOrBatchOnChainReading as { result?: string } | undefined;
  require(PROMOTING_LIMIT_RESULTS.includes(String(blockReading?.result)) ||
    blockReading?.result ===
      "NOT_APPLICABLE_WITH_ARTIFACT_PROOF", "PASS requires the block/batch reading to match the binding record or be not applicable with an artifact proof");
  /* F23 — every SG-4 subject must have resolved. */
  const applicabilityResults =
    (result.callerApplicabilityResults as { subject?: string; result?: string }[] | undefined) ?? [];
  require(SG4_APPLICABILITY_SUBJECTS.every((subject) => {
    const entry = applicabilityResults.find((candidate) => candidate.subject === subject);
    return entry !== undefined && entry.result !== "UNRESOLVED" && entry.result !== "MALFORMED";
  }), "PASS requires resolved caller applicability for every SG-4 subject");
  require(result.callerExemptionResult !== "UNKNOWN_EXEMPTION" &&
    result.callerExemptionResult !==
      "UNRESOLVED", "PASS requires resolved caller applicability; an unknown exemption fails closed");

  /* F18B — the pinned block must be finalized. */
  require(result.pinnedBlockFinality === "FINALIZED", "PASS requires a finalized pinned block");

  /* F10 — semantics resolved from the verified deployed implementation, and internally coherent. */
  const semantics = result.liveLimitSemantics as LiveLimitSemantics;
  require(semantics !== "UNRESOLVED", "PASS requires resolved network limit semantics");
  const expectedGreatestTotal = greatestAcceptedValue(semantics, TRANSACTION_TOTAL_HCU_LIMIT);
  const expectedGreatestDepth = greatestAcceptedValue(semantics, TRANSACTION_DEPTH_HCU_LIMIT);
  require(expectedGreatestTotal !== null &&
    result.greatestAcceptedTotalHcu ===
      expectedGreatestTotal.toString(
        10,
      ), "PASS requires the greatest accepted total to be coherent with the resolved semantics");
  require(expectedGreatestDepth !== null &&
    result.greatestAcceptedDepthHcu ===
      expectedGreatestDepth.toString(
        10,
      ), "PASS requires the greatest accepted depth to be coherent with the resolved semantics");

  /* F9 — the two-commit lineage must be verified. */
  require(result.preparationLineageResult === "VERIFIED", "PASS requires a verified preparation A->B lineage");

  require(result.reciprocalLinkageResult === "VERIFIED", "reciprocal linkage must be VERIFIED for a PASS result");
  require(result.staleAddressGuardResult === "NOT_USED", "PASS requires the stale-address guard to report NOT_USED");
  require(result.installedSourceHashesResult === "MATCH", "PASS requires matching installed source hashes");
  require(result.sg4CoverageResult === "COMPLETE", "PASS requires complete SG-4 coverage");
  require(result.operationScheduleAuthorityState ===
    "RESOLVED", "PASS requires the operation-schedule authority to be resolved");
  require(result.immutableProvenanceState === "RESOLVED", "PASS requires resolved immutable provenance");
  require(result.authorityProtocolDigest ===
    EXPECTED_AUTHORITY_PROTOCOL_SHA256, "PASS requires the committed authority protocol digest");
  require(result.benchmarkProtocolDigest ===
    EXPECTED_SG4_PROTOCOL_SHA256, "PASS requires the committed benchmark protocol digest");
  require(result.calculatorHash === EXPECTED_CALCULATOR_HASH, "PASS requires the expected calculator hash");
  require(result.installedTableHash === EXPECTED_COST_TABLE_HASH, "PASS requires the expected installed table hash");
  /* F32 — implementation resolution must match the reviewed authority deployment model, rather
   * than always asserting the ERC-1967 constant. */
  require(result.authorityDeploymentModel === "ERC1967_PROXY"
    ? result.implementationResolutionResult === "VERIFIED_ERC1967_STORAGE_SLOT"
    : result.implementationResolutionResult ===
        "NOT_APPLICABLE_DIRECT_DEPLOYMENT", "PASS requires an implementation-resolution result matching the reviewed deployment model");
  require(EXECUTOR_DEPLOYMENT_MODELS.includes(
    String(result.executorDeploymentModel),
  ), "PASS requires a supported executor deployment model");

  require(/^[0-9]+$/u.test(String(result.pinnedBlockNumber)), "PASS requires a resolved pinned block number");
  require(/^0x[0-9a-f]{64}$/u.test(String(result.pinnedBlockHash)), "PASS requires a resolved pinned block hash");
  require(/^[0-9a-f]{64}$/u.test(String(result.executorCodeHash)), "PASS requires a resolved executor code hash");
  require(/^[0-9a-f]{64}$/u.test(String(result.authorityCodeHash)), "PASS requires a resolved authority code hash");
  require(/^0x[0-9a-fA-F]{40}$/u.test(
    String(result.authorityAddress),
  ), "PASS requires an authority address derived from the verified executor");
  require(/^0x[0-9a-fA-F]{40}$/u.test(
    String(result.authorityImplementationAddress),
  ), "PASS requires a resolved authority implementation address");
  /* CORRECTION 4 — no equality check against the stale plugin literal here either. The address was
   * derived from the verified executor and confirmed by code identity, version and reciprocal
   * linkage; what an obsolete constant happens to equal says nothing about it. The stale value is
   * forbidden as a SOURCE, which `staleAddressGuardResult` covers below. */

  /* F33 — the MEASUREMENT toolchain must be exact: every HCU number SG-4 reports comes from it. */
  const toolchain = result.measurementToolchainRoot as Record<string, unknown> | undefined;
  require(toolchain?.package ===
    MEASUREMENT_TOOLCHAIN_ROOT.package, "PASS requires the exact measurement-toolchain package");
  require(toolchain?.version ===
    MEASUREMENT_TOOLCHAIN_ROOT.version, "PASS requires the exact measurement-toolchain version");
  require(toolchain?.integrity ===
    MEASUREMENT_TOOLCHAIN_ROOT.integrity, "PASS requires the exact measurement-toolchain integrity");
  /* INVARIANT F — verified from the installation, not asserted by the record. */
  require(toolchain?.verificationResult ===
    "VERIFIED", "PASS requires the measurement toolchain root to have been independently verified");
  require(Array.isArray(toolchain?.executionRelevantFiles) &&
    (toolchain.executionRelevantFiles as string[]).length ===
      MEASUREMENT_EXECUTION_RELEVANT_FILES.length, "PASS requires every execution-relevant measurement file to be reported");

  /* F33 — the DEPLOYED authority root is whatever the reviewed record selected. It is required to
   * be fully resolved and cross-linked, and it may never be the local fixture package. */
  const deployed = result.deployedAuthorityRoot as Record<string, unknown> | undefined;
  for (const field of DEPLOYED_AUTHORITY_ROOT_POLICY.fields) {
    require(typeof deployed?.[field] === "string" &&
      String(deployed[field]).length > 0 &&
      deployed[field] !== "UNRESOLVED", `PASS requires a resolved deployed-authority-root ${field}`);
  }
  require(/^[0-9a-f]{40}$/u.test(
    String(deployed?.commit),
  ), "PASS requires a deployed-authority-root commit naming an exact upstream revision");
  require(/^[0-9a-f]{64}$/u.test(
    String(deployed?.contentSha256),
  ), "PASS requires a deployed-authority-root content digest");
  require(String(deployed?.artifactId) ===
    String(
      result.authoritativeArtifactId,
    ), "PASS requires the deployed authority root to name the same artifact the result verified");
  require(!String(deployed?.repository).includes(
    LOCAL_AUTHORITY_FIXTURE_ROOT.package,
  ), "PASS may not derive the deployed authority root from the local fixture package");

  /* F34 — every blocking compatibility class must be empty in a PASS. The validator checks the
   * SERIALIZED result, so a reader who never ran the verifier can reject a false PASS. */
  const compat = result.operationCompatibilityResult as Record<string, unknown> | undefined;
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
    require(Array.isArray(compat?.[field]) &&
      (compat[field] as unknown[]).length ===
        0, `PASS requires an empty ${field} in the operation compatibility result`);
  }
  require(Array.isArray(compat?.shared) &&
    JSON.stringify(compat.shared) ===
      JSON.stringify(
        SG4_PRICING_VARIANT_CLOSURE.map(variantId).sort(),
      ), "PASS requires the serialized used-variant closure to be the exact SG-4 closure");

  /* F38 — the implementation address satisfied its reviewed policy, or the deployment model has
   * no separate implementation to pin. An UNRESOLVED policy is never a PASS. */
  require(["EXACT_MATCH", "NOT_APPLICABLE_DIRECT_DEPLOYMENT", "PERMITTED_CODE_IDENTICAL_CHANGE"].includes(
    String(result.implementationAddressPolicyResult),
  ), "PASS requires the authority implementation address to satisfy its reviewed policy");
  require(result.authorityDeploymentModel === "ERC1967_PROXY"
    ? result.implementationAddressPolicyResult !== "NOT_APPLICABLE_DIRECT_DEPLOYMENT"
    : result.implementationAddressPolicyResult ===
        "NOT_APPLICABLE_DIRECT_DEPLOYMENT", "PASS requires the implementation-address policy result to match the reviewed deployment model");

  /* CL4 — the official build must BE the one Commit A pinned from the independent reproduction.
   * Only the real external build-info bytes hash to it, so this is the condition that keeps an
   * arbitrary or merely well-formed build out of a PASS. */
  require(result.reproducedBuildResult ===
    "MATCHES_PINNED_REPRODUCED_BUILD", "PASS requires the official artifact build to match the pinned independently reproduced build");
  require(result.reproducedBuildInfoSha256 ===
    REPRODUCED_OFFICIAL_BUILD.buildInfoSha256, "PASS requires the pinned reproduced build-info digest");

  /* F39 — the verifier itself must have consumed its own generated plan, exactly and completely. */
  require(result.planEnforcementResult ===
    "ENFORCED_EXACT", "PASS requires the verifier to have enforced its generated live call plan exactly");
  require(typeof result.livePlanCallCount === "number" &&
    result.livePlanCallCount > 0, "PASS requires a generated live call plan with at least one call");
  require(result.liveCallCount ===
    result.livePlanCallCount, "PASS requires the issued call count to equal the planned call count");
  require(/^[0-9a-f]{64}$/u.test(String(result.livePlanDigest)), "PASS requires a canonical live call plan digest");
  require(/^[0-9a-f]{64}$/u.test(String(result.liveCallLogDigest)), "PASS requires a canonical live call log digest");

  /* F33 — the local fixture root is reported, and reporting it may never gate the PASS. */
  const fixtureRoot = result.localAuthorityFixtureRoot as Record<string, unknown> | undefined;
  require(fixtureRoot?.passRelevant === false, "the local authority fixture root may never be PASS-relevant");

  const totalState = result.transactionTotalControlState as { authorityState?: string; value?: string } | undefined;
  const depthState = result.transactionDepthControlState as { authorityState?: string; value?: string } | undefined;
  require(totalState?.authorityState === "PROVEN_PRESENT" &&
    totalState.value ===
      TRANSACTION_TOTAL_HCU_LIMIT.toString(
        10,
      ), "PASS requires the transaction-total control proven present with the exact limit");
  require(depthState?.authorityState === "PROVEN_PRESENT" &&
    depthState.value ===
      TRANSACTION_DEPTH_HCU_LIMIT.toString(
        10,
      ), "PASS requires the transaction-depth control proven present with the exact limit");

  const blockState = result.blockOrBatchControlState as { authorityState?: string } | undefined;
  require(blockState?.authorityState === "PROVEN_PRESENT" ||
    blockState?.authorityState ===
      "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION", "PASS requires the block/batch control to be resolved, never UNRESOLVED");

  const compatibility = result.operationCompatibilityResult as Record<string, unknown[]> | undefined;
  require((compatibility?.costMismatches ?? []).length === 0, "PASS requires zero operation cost mismatches");
  require((compatibility?.operandMismatches ?? []).length === 0, "PASS requires zero operand mismatches");
  /* `installedOnly` carries SG-4 variants missing from the authoritative schedule: blocking. */
  require((compatibility?.installedOnly ?? []).length === 0, "PASS requires every SG-4 variant to be priced");
  /* `authorityOnly` carries official variants SG-4 never uses — FheSum and FheIsIn in the current
   * 29-operation schedule. F20/F27: they are reported, and they do NOT block. A legitimate current
   * official schedule must be able to PASS. */
  require((compatibility?.shared ?? []).length >
    0, "PASS requires the SG-4 used-variant closure to have been compared");
  require((compatibility?.unsupportedByCalculator ?? []).length ===
    0, "PASS requires every deployed operation to be priceable by the installed calculator");
  require((result.unsupportedOperations as unknown[] | undefined)?.length ===
    0, "PASS requires no unsupported operation");

  const methods = (result.rpcMethodsUsed as string[] | undefined) ?? [];
  require(methods.every((method) =>
    LIVE_RPC_ALLOWED_METHODS.includes(method),
  ), "PASS requires every RPC method used to be on the read-only allow-list");
  /* ERC-1967 slot resolution is required exactly when the reviewed record declares a proxy. A
   * DIRECT deployment has no slot to read, and demanding one would contradict its reviewed model. */
  if (result.authorityDeploymentModel === "ERC1967_PROXY") {
    require(methods.includes("eth_getStorageAt"), "PASS requires ERC-1967 resolution through eth_getStorageAt");
  } else {
    require(!methods.includes(
      "eth_getStorageAt",
    ), "a direct authority deployment must not read an ERC-1967 implementation slot");
  }
  /* F30 — a relevant caller exempt from the enforced ceiling contradicts the recorded authority:
   * the ceiling would not govern SG-4's measured transactions at all. */
  require(result.callerExemptionResult !==
    "EXEMPT", "PASS requires that no SG-4-relevant caller is exempt from the enforced ceiling");

  require(result.walletRequested === false, "walletRequested must be false");
  require(result.accountAuthorizationRequested === false, "accountAuthorizationRequested must be false");
  require(result.signingRequested === false, "signingRequested must be false");
  require(result.transactionSubmitted === false, "transactionSubmitted must be false");

  return [...new Set(errors)].sort();
}

export const AUTHORITY_VERIFIER_METADATA = {
  protocolVersion: AUTHORITY_PROTOCOL_VERSION,
  chainId: SEPOLIA_CHAIN_ID.toString(10),
  executor: SEPOLIA_EXECUTOR_ADDRESS,
} as const;

if (require.main === module) {
  if (process.argv[2] === "live") {
    /* Implemented, acknowledgement-gated, and currently unable to reach a network: the verifier
     * withholds the committed-endpoint transport until the preparation commit and tree are
     * recorded. It writes no evidence in this phase. */
    void runLiveAuthorityVerification(process.env.SG4_AUTHORITY_LIVE_ACK)
      .then((result) => {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        if (result.finalVerdict !== "PASS") process.exitCode = 1;
      })
      .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : "live verification failed"}\n`);
        process.exitCode = 1;
      });
  } else {
    const report = runOfflinePreflight();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.verdict !== "PASS") process.exitCode = 1;
  }
}
