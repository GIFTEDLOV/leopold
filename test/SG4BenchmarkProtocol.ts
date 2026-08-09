/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import ts from "typescript";

import {
  BALANCE_MAX_BASE_UNITS,
  BUILDER_ALLOCATIONS,
  BUILDER_CIRCUITS,
  BUILDER_WINNER_INSTANCES,
  CHUNK_WEIGHT,
  CIRCUITS,
  CLOSED_WINNER_APPLICABILITY,
  CONTINUATION_SEMANTIC_SEQUENCE,
  deriveProtocol,
  EIP170_BYTE_LIMIT,
  ELAPSED_MAX_SECONDS,
  EXPECTED_CIRCUITS,
  EXPECTED_ALLOCATIONS,
  EXPECTED_COMPOSITE_CHUNK_PAIRS,
  EXPECTED_CONTINUATION_SEMANTIC_SEQUENCE,
  EXPECTED_PRIMITIVE_PAIRS,
  EXPECTED_PUBLIC_DECRYPTION_PAIRS,
  EXPECTED_VECTOR_APPLICABILITY,
  EXPECTED_WINDOWS,
  EXPECTED_WINNER_APPLICABILITY,
  EXPECTED_WINNER_INSTANCES,
  exactMean,
  independentlyDeriveExpectedRunPlan,
  nearestRankP90Index,
  projectSequentialCompletion,
  rejectionPlan,
  serializeProtocol,
  T_DIVIDES_DOMAIN,
  T_MAX,
  T_POWER_MINUS_ONE,
  T_POWER_PLUS_ONE,
  TWAB_MAX,
  validateProtocol,
  winnerStateTransition,
  WINNER_INSTANCES,
} from "../scripts/sg4-protocol";

const root = resolve(__dirname, "..");
const harnessSourcePath = "contracts/benchmarks/SG4FheBenchmarkHarness.sol";
const protocol = deriveProtocol();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function byId(id: string) {
  const found = CIRCUITS.find((entry) => entry.id === id);
  expect(found, `missing ${id}`).not.to.equal(undefined);
  return found!;
}

function expectInvalid(mutator: (candidate: any) => void): void {
  const candidate: any = clone(protocol);
  mutator(candidate);
  expect(() => validateProtocol(candidate)).to.throw("SG4 protocol invariant failed");
}

function oracleDomain(instance: { chunkSize: string; preState: { cursor: string } }) {
  return {
    chunkSize: instance.chunkSize,
    participantSliceStart: instance.preState.cursor,
    participantUniverseSize: "64",
    exclusiveUpperBound: "64",
  };
}

function resolveWinnerRunRecord(record: any) {
  const setup = EXPECTED_WINNER_INSTANCES.find(({ setupId }) => setupId === record.setupDefinitionId);
  const preState = EXPECTED_WINNER_INSTANCES.find(({ preStateId }) => preStateId === record.preStateDefinitionId);
  const participants = EXPECTED_WINNER_INSTANCES.find(
    ({ participantVectorInstanceId }) => participantVectorInstanceId === record.participantVectorInstanceId,
  );
  const expectedPost = EXPECTED_WINNER_INSTANCES.find(
    ({ expectedPostStateId }) => expectedPostStateId === record.expectedPostStateDefinitionId,
  );
  if (setup === undefined || preState === undefined || participants === undefined || expectedPost === undefined) {
    throw new Error("run-plan winner definition reference is unresolved");
  }
  const identities = [setup.id, preState.id, participants.id, expectedPost.id];
  if (new Set(identities).size !== 1) throw new Error("run-plan winner definitions are inconsistent");
  if (
    record.vectorId !== setup.id ||
    record.circuitId !== setup.circuitId ||
    record.stateEquivalenceClass !== setup.id ||
    record.semanticVectorId !== setup.semanticVectorId
  ) {
    throw new Error("run-plan winner identity linkage is inconsistent");
  }
  if (
    typeof record.setupRecordId !== "string" ||
    !record.setupRecordId.includes(record.runId.split(":").slice(1).join(":"))
  ) {
    throw new Error("run-plan setup record linkage is inconsistent");
  }
  const oraclePre =
    setup.semanticVectorId === "ALL_VALID_FIXED_WINNER"
      ? { ...setup.preState, acceptedTicketReady: true }
      : setup.preState;
  const oracle = winnerStateTransition(
    oraclePre,
    setup.participantIndices,
    setup.participantWeights,
    oracleDomain(setup),
  );
  if (JSON.stringify(oracle) !== JSON.stringify(expectedPost.expectedPostState)) {
    throw new Error("run-plan expected post-state disagrees with independent oracle");
  }
  return { definition: setup, oracle };
}

function assertNoSharedObjectIdentity(builder: unknown, expected: unknown, path = "root"): void {
  if (builder === null || expected === null || typeof builder !== "object" || typeof expected !== "object") {
    return;
  }
  expect(builder, `${path} shares object identity`).not.to.equal(expected);
  if (Array.isArray(builder) && Array.isArray(expected)) {
    expect(builder, `${path} array shape`).to.have.length(expected.length);
    for (let index = 0; index < builder.length; index++) {
      assertNoSharedObjectIdentity(builder[index], expected[index], `${path}[${index}]`);
    }
    return;
  }
  const builderRecord = builder as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  for (const key of Object.keys(expectedRecord)) {
    if (key in builderRecord) assertNoSharedObjectIdentity(builderRecord[key], expectedRecord[key], `${path}.${key}`);
  }
}

function assertDisjointObjectGraphs(builderRoots: readonly unknown[], expectedRoots: readonly unknown[]): void {
  const builderObjects = new Set<object>();
  const collect = (value: unknown, output: Set<object>): void => {
    if (value === null || typeof value !== "object" || output.has(value)) return;
    output.add(value);
    for (const child of Object.values(value)) collect(child, output);
  };
  for (const rootValue of builderRoots) collect(rootValue, builderObjects);
  const expectedObjects = new Set<object>();
  for (const rootValue of expectedRoots) collect(rootValue, expectedObjects);
  for (const expectedObject of expectedObjects) expect(builderObjects.has(expectedObject)).to.equal(false);
}

const EXPECTED_LITERAL_DECLARATIONS = [
  "EXPECTED_VECTOR_APPLICABILITY_LITERAL",
  "EXPECTED_WINNER_APPLICABILITY_LITERAL",
  "EXPECTED_CIRCUITS_LITERAL",
  "EXPECTED_PRIMITIVE_PAIRS_LITERAL",
  "EXPECTED_COMPOSITE_CHUNK_PAIRS_LITERAL",
  "EXPECTED_PUBLIC_DECRYPTION_PAIRS_LITERAL",
  "EXPECTED_WINNER_INSTANCES_LITERAL",
  "EXPECTED_CONTINUATION_SEQUENCE_LITERAL",
  "EXPECTED_WINDOWS_LITERAL",
  "EXPECTED_REPETITION_ALLOCATIONS_LITERAL",
] as const;

function unwrapLiteralExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function expectedLiteralAudit(sourceText: string): string[] {
  const source = ts.createSourceFile("sg4-protocol.ts", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declarations = new Map<string, ts.VariableDeclaration>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const errors: string[] = [];
  for (const name of EXPECTED_LITERAL_DECLARATIONS) {
    const declaration = declarations.get(name);
    if (declaration?.initializer === undefined) {
      errors.push(`${name}: missing literal declaration`);
      continue;
    }
    const initializer = unwrapLiteralExpression(declaration.initializer);
    if (!ts.isArrayLiteralExpression(initializer) && !ts.isObjectLiteralExpression(initializer)) {
      errors.push(`${name}: initializer is not a closed literal`);
      continue;
    }
    const inspectLiteral = (expression: ts.Expression, path: string): void => {
      const value = unwrapLiteralExpression(expression);
      if (
        ts.isStringLiteral(value) ||
        ts.isNumericLiteral(value) ||
        ts.isBigIntLiteral(value) ||
        ts.isNoSubstitutionTemplateLiteral(value) ||
        value.kind === ts.SyntaxKind.TrueKeyword ||
        value.kind === ts.SyntaxKind.FalseKeyword ||
        value.kind === ts.SyntaxKind.NullKeyword
      ) {
        return;
      }
      if (ts.isPrefixUnaryExpression(value) && ts.isNumericLiteral(value.operand)) return;
      if (ts.isArrayLiteralExpression(value)) {
        for (const [index, element] of value.elements.entries()) {
          if (ts.isSpreadElement(element)) errors.push(`${name}: spread element at ${path}[${index}]`);
          else inspectLiteral(element, `${path}[${index}]`);
        }
        return;
      }
      if (ts.isObjectLiteralExpression(value)) {
        for (const property of value.properties) {
          if (ts.isSpreadAssignment(property)) {
            errors.push(`${name}: spread property at ${path}`);
          } else if (ts.isPropertyAssignment(property)) {
            if (ts.isComputedPropertyName(property.name)) errors.push(`${name}: computed property at ${path}`);
            inspectLiteral(property.initializer, `${path}.${property.name.getText(source)}`);
          } else {
            errors.push(`${name}: non-literal property at ${path}`);
          }
        }
        return;
      }
      errors.push(`${name}: non-literal expression ${value.getText(source)} at ${path}`);
    };
    inspectLiteral(initializer, name);
  }
  return errors;
}

type JsonSchema = Record<string, any>;

function schemaErrors(rootSchema: JsonSchema, value: unknown, schema: JsonSchema = rootSchema, path = "$"): string[] {
  if (schema.$ref) {
    const target = schema.$ref
      .slice(2)
      .split("/")
      .reduce((current: any, segment: string) => current[segment], rootSchema);
    return schemaErrors(rootSchema, value, target, path);
  }
  if (schema.anyOf) {
    if (schema.anyOf.some((choice: JsonSchema) => schemaErrors(rootSchema, value, choice, path).length === 0))
      return [];
    return [`${path}: no anyOf branch matched`];
  }
  if (schema.const !== undefined && value !== schema.const) return [`${path}: const mismatch`];
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: enum mismatch`];
  if (schema.type === "null" && value !== null) return [`${path}: expected null`];
  if (schema.type === "string") {
    if (typeof value !== "string") return [`${path}: expected string`];
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) return [`${path}: pattern mismatch`];
  }
  if (schema.type === "boolean" && typeof value !== "boolean") return [`${path}: expected boolean`];
  if (schema.type === "array") {
    if (!Array.isArray(value)) return [`${path}: expected array`];
    if (schema.minItems !== undefined && value.length < schema.minItems) return [`${path}: too few items`];
    return value.flatMap((item, index) => schemaErrors(rootSchema, item, schema.items, `${path}[${index}]`));
  }
  const errors: string[] = [];
  if (schema.type === "object" || schema.properties || schema.required) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return [`${path}: expected object`];
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in object)) errors.push(`${path}: missing ${key}`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object))
        if (!(key in (schema.properties ?? {}))) errors.push(`${path}: unknown ${key}`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (key in object)
        errors.push(...schemaErrors(rootSchema, object[key], childSchema as JsonSchema, `${path}.${key}`));
    }
  }
  for (const child of schema.allOf ?? []) errors.push(...schemaErrors(rootSchema, value, child, path));
  if (schema.if && schemaErrors(rootSchema, value, schema.if, path).length === 0 && schema.then) {
    errors.push(...schemaErrors(rootSchema, value, schema.then, path));
  }
  return errors;
}

const digest = "a".repeat(64);
const txHash = `0x${"b".repeat(64)}`;
const address = `0x${"c".repeat(40)}`;
const commit = "d".repeat(40);
const timestamp = "2026-01-01T00:00:00.000Z";

function validSample(publicDecrypt = false): Record<string, unknown> {
  const sample: Record<string, unknown> = {
    recordId: "sample-1",
    recordDigest: digest,
    protocolVersion: protocol.protocolVersion,
    protocolDigest: digest,
    gitCommit: commit,
    gitTree: commit,
    circuitId: publicDecrypt ? "PUBLIC_DECRYPT_VALID_BOOL" : "TWAB_DELTA_128",
    vectorId: publicDecrypt ? "VALID_TRUE" : "BALANCE_MAX_ELAPSED_MAX",
    semanticVectorId: publicDecrypt ? "VALID_TRUE" : "BALANCE_MAX_ELAPSED_MAX",
    windowId: "WINDOW_1",
    runId: `${protocol.protocolVersion}:WINDOW_1:TWAB_DELTA_128:FIXED:MEASURED:1`,
    classification: "MEASURED",
    repetitionIndex: "1",
    sequenceClassification: "INDEPENDENT_PERFORMANCE_SAMPLE",
    includedInVerdictStatistics: true,
    setupRecordId: null,
    setupTransactionHash: null,
    setupBlockNumber: null,
    setupDefinitionId: null,
    preStateDefinitionId: null,
    expectedPostStateDefinitionId: null,
    participantVectorInstanceId: null,
    stateEquivalenceClass: null,
    inheritsPriorRunId: null,
    contractAddress: address,
    transactionHash: txHash,
    blockNumber: "1",
    status: "SUCCESS",
    gasUsed: "1",
    effectiveGasPrice: "1",
    calldataByteLength: "4",
    deployedBytecodeLength: null,
    hcuConsumed: "1",
    hcuDepthConsumed: "1",
    hcuSource: "PLUGIN_RECEIPT_COPROCESSOR_EVENTS",
    authoritativeHcuCeiling: "100",
    authoritativeHcuDepthCeiling: "100",
    totalSafetyThreshold: "15000000",
    depthSafetyThreshold: "3750000",
    totalSafetyResult: "PASS",
    depthSafetyResult: "PASS",
    combinedHcuVerdict: "GO",
    currentBlockGasLimit: "1000000",
    submissionTimestamp: timestamp,
    receiptTimestamp: timestamp,
    submissionToReceiptMilliseconds: "1",
    preStateVerification: "NOT_APPLICABLE",
    postStateVerification: "NOT_APPLICABLE",
    postStateCorrect: true,
    sanitizedFailureCategory: "NONE",
  };
  if (publicDecrypt) {
    sample.publicDecryption = {
      relayerReadyTimestamp: timestamp,
      publicDecryptionCompletionTimestamp: timestamp,
      receiptToRelayerMilliseconds: "1",
      totalEndToEndMilliseconds: "2",
      clearValueCorrect: true,
      proofSignatureFlowCorrect: true,
      leakageCheck: "PASS",
    };
  }
  return sample;
}

function validWinnerSample(): Record<string, unknown> {
  const instance = WINNER_INSTANCES.find(({ id }) => id === "FIRST_MATCH__WINNER_CHUNK_8")!;
  return {
    ...validSample(),
    circuitId: instance.circuitId,
    vectorId: instance.id,
    semanticVectorId: instance.semanticVectorId,
    runId: `${protocol.protocolVersion}:WINDOW_1:${instance.circuitId}:${instance.id}:MEASURED:1`,
    setupRecordId: `setup-WINDOW_1:${instance.circuitId}:${instance.id}:MEASURED:1`,
    setupTransactionHash: txHash,
    setupBlockNumber: "1",
    setupDefinitionId: instance.setupId,
    preStateDefinitionId: instance.preStateId,
    expectedPostStateDefinitionId: instance.expectedPostStateId,
    participantVectorInstanceId: instance.participantVectorInstanceId,
    stateEquivalenceClass: instance.id,
    inheritsPriorRunId: null,
    preStateVerification: "PASS",
    postStateVerification: "PASS",
  };
}

function validRawResult(): Record<string, unknown> {
  return {
    schema: "zama-szn4.sg4-benchmark-results.v2",
    protocolIdentity: {
      protocolVersion: protocol.protocolVersion,
      protocolDigest: digest,
      gitCommit: commit,
      gitTree: commit,
      digestVerifiedBeforeEveryWindow: true,
    },
    environment: {
      chainId: "11155111",
      fhevmSolidity: "0.11.1",
      fhevmHardhatPlugin: "0.4.2",
      relayerSdk: "0.4.1",
      hardhat: "2.28.6",
      ethers: "6.17.0",
    },
    hcuResolution: {
      status: "AUTHORITATIVE",
      source: "PLUGIN_RECEIPT_COPROCESSOR_EVENTS",
      transactionCeiling: "100",
      transactionDepthCeiling: "100",
      totalSafetyThreshold: "15000000",
      depthSafetyThreshold: "3750000",
      safetyBoundSemantics: "EXCLUSIVE",
      applicableBlockOrBatchCeiling: null,
      applicableBlockOrBatchCeilingState: "PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION",
      authorityVerification: {
        verdict: "PASS",
        authorityProtocolDigest: "0".repeat(64),
        pinnedBlockNumber: "1",
        pinnedBlockHash: `0x${"1".repeat(64)}`,
      },
      gasSubstituted: false,
    },
    deployments: [],
    executionWindows: [1, 2, 3].map((index) => ({
      windowId: `WINDOW_${index}`,
      firstBlock: `${index}`,
      lastBlock: `${index}`,
      priorWindowSeparationBlocks: index === 1 ? null : "20",
      sampleIds: index === 1 ? ["sample-1"] : [],
      status: "COMPLETE",
    })),
    setupRecords: [],
    rawSamples: [validSample()],
    failures: [],
    invalidatedWindows: [
      {
        recordId: "invalidation-1",
        windowId: "WINDOW_2",
        category: "CHAIN_WIDE_OUTAGE",
        originalSampleIds: ["sample-old"],
        outageEvidenceDigest: digest,
        recordDigest: digest,
      },
    ],
    rerunWindows: [
      {
        recordId: "rerun-1",
        rerunWindowId: "WINDOW_2_RERUN_1",
        invalidatedWindowId: "invalidation-1",
        completePlanReplayed: true,
        sampleIds: ["sample-new"],
        recordDigest: digest,
      },
    ],
    corrections: [
      {
        correctionId: "correction-1",
        originalRecordId: "sample-1",
        originalRecordDigest: digest,
        sanitizedReason: "METADATA CORRECTION",
        replacementRecordId: "sample-2",
        replacementRecordDigest: digest,
        originalRetained: true,
        recordDigest: digest,
      },
    ],
    circuitSummaries: [],
    verdicts: [],
    architectureDecision: {
      verdict: "BLOCKED",
      selectedChunkSize: null,
      tenThousandParticipantProjectionMilliseconds: null,
      euint128Retained: true,
      participantCapIntroduced: false,
      recordDigest: digest,
    },
    provenance: {
      appendOnly: true,
      recordsImmutable: true,
      correctionsDoNotOverwrite: true,
      individualSampleInvalidationForbidden: true,
      rootDigest: digest,
    },
  };
}

function loadHarnessAst(): any {
  for (const filename of readdirSync(resolve(root, "artifacts/build-info")).sort()) {
    const build = JSON.parse(readFileSync(resolve(root, "artifacts/build-info", filename), "utf8"));
    const source = build.output.sources[harnessSourcePath];
    if (source?.ast) return source.ast;
  }
  throw new Error("compiled harness AST unavailable");
}

function extractMeasuredOperations(ast: any, rootFunctionName: string): string[] {
  const contract = ast.nodes.find(
    (node: any) => node.nodeType === "ContractDefinition" && node.name === "SG4FheBenchmarkHarness",
  );
  const functions = new Map<number, any>();
  const states = new Set<number>();
  for (const node of contract.nodes) {
    if (node.nodeType === "FunctionDefinition") functions.set(node.id, node);
    if (node.nodeType === "VariableDeclaration" && node.stateVariable) states.add(node.id);
  }
  const rootFunction = [...functions.values()].find((node) => node.name === rootFunctionName);
  if (!rootFunction) throw new Error(`missing AST function ${rootFunctionName}`);
  const operations: string[] = [];
  const ignoredHelpers = new Set(["_begin", "_complete", "_generalParameters"]);

  const valueOf = (expression: any, environment: Map<number, bigint>): bigint | undefined => {
    if (expression?.nodeType === "Literal" && /^\d+$/u.test(expression.value ?? "")) return BigInt(expression.value);
    if (expression?.nodeType === "Identifier") return environment.get(expression.referencedDeclaration);
    return undefined;
  };

  const normalizeType = (type: string): string => {
    if (type.startsWith("int_const 0")) return "0";
    return type.replace(/^contract /u, "").replace(/ storage ref$| memory$/u, "");
  };

  const visitExpression = (expression: any, environment: Map<number, bigint>): void => {
    if (!expression || typeof expression !== "object") return;
    if (expression.nodeType === "Assignment") {
      visitExpression(expression.rightHandSide, environment);
      const left = expression.leftHandSide;
      if (left?.nodeType === "Identifier" && states.has(left.referencedDeclaration))
        operations.push(`STORE.${left.name}`);
      return;
    }
    if (expression.nodeType === "UnaryOperation") {
      visitExpression(expression.subExpression, environment);
      const subject = expression.subExpression;
      if (subject?.nodeType === "Identifier" && states.has(subject.referencedDeclaration))
        operations.push(`STORE.${subject.name}`);
      return;
    }
    if (expression.nodeType === "FunctionCall") {
      const member = expression.expression;
      if (member?.nodeType === "MemberAccess" && member.expression?.name === "FHE") {
        for (const argument of expression.arguments) visitExpression(argument, environment);
        const types = expression.arguments.map((argument: any) =>
          normalizeType(argument.typeDescriptions?.typeString ?? ""),
        );
        operations.push(`FHE.${member.memberName}(${types.join(",")})`);
        return;
      }
      const declaration = member?.referencedDeclaration;
      const called = functions.get(declaration);
      if (called && !ignoredHelpers.has(called.name)) {
        for (const argument of expression.arguments) visitExpression(argument, environment);
        const next = new Map<number, bigint>();
        called.parameters.parameters.forEach((parameter: any, index: number) => {
          const value = valueOf(expression.arguments[index], environment);
          if (value !== undefined) next.set(parameter.id, value);
        });
        visitBlock(called.body, next);
        return;
      }
      for (const argument of expression.arguments ?? []) visitExpression(argument, environment);
      return;
    }
    if (expression.nodeType === "Conditional") {
      visitExpression(expression.trueExpression, environment);
      visitExpression(expression.falseExpression, environment);
      return;
    }
    for (const value of Object.values(expression)) {
      if (value && typeof value === "object") {
        if (Array.isArray(value)) value.forEach((entry) => visitExpression(entry, environment));
        else visitExpression(value, environment);
      }
    }
  };

  const visitStatement = (statement: any, environment: Map<number, bigint>): void => {
    if (!statement) return;
    if (statement.nodeType === "VariableDeclarationStatement") {
      visitExpression(statement.initialValue, environment);
      return;
    }
    if (statement.nodeType === "ExpressionStatement") {
      visitExpression(statement.expression, environment);
      return;
    }
    if (statement.nodeType === "ForStatement") {
      const count = valueOf(statement.condition?.rightExpression, environment);
      if (count === undefined) throw new Error("unresolved measured loop bound");
      for (let index = 0n; index < count; index++) visitBlock(statement.body, environment);
      return;
    }
    if (statement.nodeType === "IfStatement") {
      visitBlock(statement.trueBody, environment);
      return;
    }
    if (statement.nodeType === "Return") {
      visitExpression(statement.expression, environment);
      return;
    }
    if (statement.nodeType === "Block") visitBlock(statement, environment);
  };

  function visitBlock(block: any, environment: Map<number, bigint>): void {
    for (const statement of block?.statements ?? []) visitStatement(statement, environment);
  }

  visitBlock(rootFunction.body, new Map());
  return operations;
}

const roots: Record<string, string> = {
  RNG_64: "rng64",
  RNG_128: "rng128",
  RNG_256: "rng256",
  TWAB_CAST_64_TO_128: "twabCast64To128",
  TWAB_DELTA_128: "twabDelta128",
  TWAB_ACCUMULATE_128: "twabAccumulate128",
  AGGREGATE_ADD_128: "aggregateAdd128",
  PREFIX_ADD_128: "prefixAdd128",
  DRAW_ZERO_TOTAL_NOOP: "drawZeroTotalNoop",
  DRAW_TOTAL_ONE: "drawTotalOne",
  REJECTION_VALID_GENERAL_128: "rejectionValidGeneral128",
  TICKET_REMAINDER_GENERAL_128: "ticketRemainderGeneral128",
  REJECTION_PIPELINE_GENERAL_128: "rejectionPipelineGeneral128",
  REJECTION_PIPELINE_ALL_VALID_128: "rejectionPipelineAllValid128",
  WINNER_STEP_128: "winnerStep128",
  WINNER_CHUNK_1: "winnerChunk1",
  WINNER_CHUNK_4: "winnerChunk4",
  WINNER_CHUNK_8: "winnerChunk8",
  WINNER_CHUNK_16: "winnerChunk16",
  WINNER_CHUNK_32: "winnerChunk32",
  PRIZE_OR_ZERO: "prizeOrZero",
  COMPOSITE_TWAB_UPDATE: "compositeTwabUpdate",
  COMPOSITE_DRAW_GENERAL: "compositeDrawGeneral",
  COMPOSITE_DRAW_ALL_VALID: "compositeDrawAllValid",
  COMPOSITE_DRAW_AND_CHUNK_8: "compositeDrawAndChunk8",
  COMPOSITE_DRAW_AND_CHUNK_32: "compositeDrawAndChunk32",
  PUBLIC_DECRYPT_AGGREGATE_128: "publicDecryptAggregate128",
  PUBLIC_DECRYPT_VALID_BOOL: "publicDecryptValidBool",
};

describe("SG-4 deterministic protocol", function () {
  it("inherits the exact SG-3 envelope and mandatory widths", function () {
    expect(BALANCE_MAX_BASE_UNITS).to.equal(1_000_000_000_000_000n);
    expect(ELAPSED_MAX_SECONDS).to.equal(31_536_000n);
    expect(TWAB_MAX).to.equal(31_536_000_000_000_000_000_000n);
    expect(protocol.sg3Domain.types.acceptedTicket).to.equal("euint128");
    expect(protocol.goNoGo.euint64MayReplaceProductionEuint128).to.equal(false);
  });

  it("registers exactly 28 circuits in exact execution order", function () {
    expect(CIRCUITS).to.have.length(28);
    expect(new Set(CIRCUITS.map(({ id }) => id)).size).to.equal(28);
    expect(protocol.executionOrder).to.deep.equal(CIRCUITS.map(({ id }) => id));
  });

  it("proves every validator authority catalogue is a closed source literal", function () {
    const source = readFileSync(resolve(root, "scripts/sg4-protocol.ts"), "utf8");
    expect(expectedLiteralAudit(source)).to.deep.equal([]);
    expect(EXPECTED_CIRCUITS).to.have.length(28);
    expect(EXPECTED_WINNER_INSTANCES).to.have.length(34);
  });

  it("rejects expectation factories, transformations, computed post-states, and builder spreads in source", function () {
    const source = readFileSync(resolve(root, "scripts/sg4-protocol.ts"), "utf8");
    const mutations = [
      source.replace(
        "export const EXPECTED_CIRCUITS_LITERAL: ExpectedCircuitDefinition[] = [",
        'export const EXPECTED_CIRCUITS_LITERAL: ExpectedCircuitDefinition[] = [expectedCircuit("RNG_64"),',
      ),
      source.replace(
        "export const EXPECTED_WINNER_INSTANCES_LITERAL: ExpectedWinnerInstance[] = [",
        'export const EXPECTED_WINNER_INSTANCES_LITERAL: ExpectedWinnerInstance[] = [expectedWinnerInstance("FIRST_MATCH"),',
      ),
      source.replace(/(participantIndices\s*:\s*)\[[^\]]+\]/u, '$1["0"].map(String)'),
      source.replace('expectedMatchPosition: "0"', "expectedMatchPosition: expectedWinnerPostState()"),
      source.replace(/(RNG_64\s*:\s*)\[\s*"FIXED"\s*\]/u, "$1[].flatMap(String)"),
      source.replace(
        "export const EXPECTED_CIRCUITS_LITERAL: ExpectedCircuitDefinition[] = [\n  {",
        "export const EXPECTED_CIRCUITS_LITERAL: ExpectedCircuitDefinition[] = [\n  { ...BUILDER_CIRCUITS[0],",
      ),
    ];
    for (const mutation of mutations) {
      expect(mutation).not.to.equal(source);
      expect(expectedLiteralAudit(mutation)).not.to.deep.equal([]);
    }
  });

  it("keeps builder and validator circuit authorities recursively identity-separated", function () {
    assertDisjointObjectGraphs(
      [
        BUILDER_CIRCUITS,
        BUILDER_WINNER_INSTANCES,
        BUILDER_ALLOCATIONS,
        CLOSED_WINNER_APPLICABILITY,
        CONTINUATION_SEMANTIC_SEQUENCE,
      ],
      [
        EXPECTED_CIRCUITS,
        EXPECTED_WINNER_INSTANCES,
        EXPECTED_ALLOCATIONS,
        EXPECTED_VECTOR_APPLICABILITY,
        EXPECTED_WINNER_APPLICABILITY,
        EXPECTED_PRIMITIVE_PAIRS,
        EXPECTED_COMPOSITE_CHUNK_PAIRS,
        EXPECTED_PUBLIC_DECRYPTION_PAIRS,
        EXPECTED_WINDOWS,
        EXPECTED_CONTINUATION_SEMANTIC_SEQUENCE,
      ],
    );
    assertNoSharedObjectIdentity(BUILDER_CIRCUITS, EXPECTED_CIRCUITS, "circuits");
    assertNoSharedObjectIdentity(BUILDER_ALLOCATIONS, EXPECTED_ALLOCATIONS, "allocations");
    assertNoSharedObjectIdentity(CLOSED_WINNER_APPLICABILITY, EXPECTED_WINNER_APPLICABILITY, "winnerApplicability");
    expect(BUILDER_CIRCUITS).not.to.equal(EXPECTED_CIRCUITS);
    for (let index = 0; index < BUILDER_CIRCUITS.length; index++) {
      const builder = BUILDER_CIRCUITS[index];
      const expected = EXPECTED_CIRCUITS[index];
      expect(builder).not.to.equal(expected);
      expect(builder.operations).not.to.equal(expected.operations);
      expect(builder.vectorIds).not.to.equal(expected.vectorIds);
      expect(builder.id).to.equal(expected.id);
      expect(builder.family).to.equal(expected.family);
      expect(builder.classification).to.equal(expected.classification);
      expect(builder.productionCritical).to.equal(expected.productionCritical);
      expect(builder.widthRole).to.equal(expected.widthRole);
      expect(builder.operations).to.deep.equal(expected.operations);
      expect(builder.vectorIds).to.deep.equal(expected.vectorIds);
      expect(builder.operations.every((operation) => typeof operation === "string")).to.equal(true);
    }
    for (const circuitId of Object.keys(EXPECTED_WINNER_APPLICABILITY)) {
      expect(CLOSED_WINNER_APPLICABILITY[circuitId]).not.to.equal(EXPECTED_WINNER_APPLICABILITY[circuitId]);
      expect(CLOSED_WINNER_APPLICABILITY[circuitId]).to.deep.equal(EXPECTED_WINNER_APPLICABILITY[circuitId]);
    }
  });

  it("keeps builder and validator winner authorities recursively identity-separated", function () {
    assertNoSharedObjectIdentity(BUILDER_WINNER_INSTANCES, EXPECTED_WINNER_INSTANCES, "winnerInstances");
    assertNoSharedObjectIdentity(
      CONTINUATION_SEMANTIC_SEQUENCE,
      EXPECTED_CONTINUATION_SEMANTIC_SEQUENCE,
      "continuationSemanticSequence",
    );
    expect(BUILDER_WINNER_INSTANCES).not.to.equal(EXPECTED_WINNER_INSTANCES);
    for (let index = 0; index < BUILDER_WINNER_INSTANCES.length; index++) {
      const builder = BUILDER_WINNER_INSTANCES[index];
      const expected = EXPECTED_WINNER_INSTANCES[index];
      expect(builder).not.to.equal(expected);
      expect(builder.preState).not.to.equal(expected.preState);
      expect(builder.expectedPostState).not.to.equal(expected.expectedPostState);
      expect(builder.participantIndices).not.to.equal(expected.participantIndices);
      expect(builder.participantWeights).not.to.equal(expected.participantWeights);
      for (const key of [
        "id",
        "circuitId",
        "semanticVectorId",
        "setupId",
        "chunkSize",
        "preStateId",
        "expectedPostStateId",
        "participantVectorInstanceId",
        "participantEntryCount",
        "expectedMatchPosition",
      ] as const) {
        expect(builder[key]).to.equal(expected[key]);
      }
      expect(builder.preState).to.deep.equal(expected.preState);
      expect(builder.participantIndices).to.deep.equal(expected.participantIndices);
      expect(builder.participantWeights).to.deep.equal(expected.participantWeights);
      expect(builder.expectedPostState).to.deep.equal(expected.expectedPostState);
      expect(expected.stateEquivalenceClass).to.equal(expected.id);
      expect(expected.participantUniverseSize).to.equal("64");
      expect(expected.exclusiveUpperBound).to.equal("64");
    }
  });

  it("rejects builder-side circuit and winner drift against separate expectation tables", function () {
    const mutations: Array<(candidate: any) => void> = [
      (candidate) => {
        candidate.circuits[0].id = "RNG_64_CHANGED";
      },
      (candidate) => {
        candidate.circuits[0].operations[0] = "FHE.randEuint128()";
      },
      (candidate) => {
        candidate.circuits[0].operations.push("FHE.allowThis(euint64)");
      },
      (candidate) => {
        candidate.circuits[0].operations.pop();
      },
      (candidate) => {
        candidate.circuits[4].operations.reverse();
      },
      (candidate) => {
        candidate.circuits[0].family = "changed-family";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].participantWeights[0] = "1";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].participantIndices[0] = "1";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].preState.prefix = "1";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].preState.acceptedTicket = "1";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].preState.found = true;
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].preState.winnerIndex = "1";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].preState.cursor = "1";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].expectedPostState.prefix = "1";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].expectedPostState.found = false;
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].expectedPostState.winnerIndex = "1";
      },
      (candidate) => {
        candidate.fixedInputs.winnerInstances[0].expectedPostState.cursor = "2";
      },
      (candidate) => {
        candidate.circuits.find((entry: any) => entry.id === "WINNER_CHUNK_4").vectorIds.pop();
      },
      (candidate) => {
        candidate.runPlan.find((entry: any) => entry.circuitId === "WINNER_CHUNK_4").vectorId =
          "FIRST_MATCH__WINNER_CHUNK_8";
      },
    ];
    for (const mutate of mutations) expectInvalid(mutate);
    expect(BUILDER_CIRCUITS.map(({ id }) => id)).to.deep.equal(EXPECTED_CIRCUITS.map(({ id }) => id));
    expect(BUILDER_WINNER_INSTANCES.map(({ id }) => id)).to.deep.equal(EXPECTED_WINNER_INSTANCES.map(({ id }) => id));
  });

  it("classifies the two-call sequence as excluded semantic continuation", function () {
    expect(CONTINUATION_SEMANTIC_SEQUENCE).to.deep.equal(EXPECTED_CONTINUATION_SEMANTIC_SEQUENCE);
    expect(CONTINUATION_SEMANTIC_SEQUENCE).not.to.equal(EXPECTED_CONTINUATION_SEMANTIC_SEQUENCE);
    expect(CONTINUATION_SEMANTIC_SEQUENCE.sequenceClassification).to.equal("SEMANTIC_CONTINUATION_VALIDATION");
    expect(CONTINUATION_SEMANTIC_SEQUENCE.excludedFromStatisticalSamples).to.equal(true);
    expect(CONTINUATION_SEMANTIC_SEQUENCE.noResetBetweenCalls).to.equal(true);
    expect(CONTINUATION_SEMANTIC_SEQUENCE.secondPre).to.deep.equal({
      ...CONTINUATION_SEMANTIC_SEQUENCE.firstPost,
      acceptedTicket: CONTINUATION_SEMANTIC_SEQUENCE.initial.acceptedTicket,
    });
  });

  it("rejects semantic continuation classification, inclusion, and reset drift", function () {
    expectInvalid((candidate) => delete candidate.fixedInputs.continuationSemanticSequence.sequenceClassification);
    expectInvalid((candidate) => {
      candidate.fixedInputs.continuationSemanticSequence.sequenceClassification = "INDEPENDENT_PERFORMANCE_SAMPLE";
    });
    expectInvalid((candidate) => {
      candidate.fixedInputs.continuationSemanticSequence.excludedFromStatisticalSamples = false;
    });
    expectInvalid((candidate) => {
      candidate.fixedInputs.continuationSemanticSequence.secondPre.cursor = "0";
    });
  });

  it("rejects inconsistent emitted-run setup, state, participant, post-state, and equivalence linkage", function () {
    const base = protocol.runPlan.find(
      (record) => record.vectorId === "FIRST_MATCH__WINNER_CHUNK_8" && record.classification === "MEASURED",
    )!;
    const incompatible = EXPECTED_WINNER_INSTANCES.find(({ id }) => id === "MIDDLE_MATCH__WINNER_CHUNK_8")!;
    for (const mutate of [
      (record: any) => {
        record.setupDefinitionId = incompatible.setupId;
      },
      (record: any) => {
        record.preStateDefinitionId = incompatible.preStateId;
      },
      (record: any) => {
        record.participantVectorInstanceId = incompatible.participantVectorInstanceId;
      },
      (record: any) => {
        record.expectedPostStateDefinitionId = incompatible.expectedPostStateId;
      },
      (record: any) => {
        record.stateEquivalenceClass = incompatible.id;
      },
      (record: any) => {
        record.circuitId = "WINNER_CHUNK_4";
      },
    ]) {
      const record = clone(base) as any;
      mutate(record);
      expect(() => resolveWinnerRunRecord(record)).to.throw("run-plan");
    }
  });

  it("registers exact general rejection totals independently", function () {
    expect(byId("REJECTION_PIPELINE_GENERAL_128").vectorIds).to.deep.equal([
      "T_MAX",
      "T_POWER_MINUS_ONE",
      "T_POWER_PLUS_ONE",
    ]);
    expect(T_POWER_MINUS_ONE + 1n).to.equal(T_DIVIDES_DOMAIN);
    expect(T_POWER_PLUS_ONE - 1n).to.equal(T_DIVIDES_DOMAIN);
    expect(rejectionPlan(T_MAX).rejectionLimit).to.equal("340282366920938457504000000000000000000");
  });

  it("locks explicit chunk-sized winner instances and two prize branches", function () {
    expect([...new Set(WINNER_INSTANCES.map(({ semanticVectorId }) => semanticVectorId))]).to.include.members([
      "FIRST_MATCH",
      "MIDDLE_MATCH",
      "LAST_MATCH",
      "NO_MATCH_BEFORE_CHUNK_BOUNDARY",
      "ALREADY_FOUND_BEFORE_CHUNK",
      "CONTINUATION_MATCH_IN_LATER_CHUNK",
    ]);
    for (const instance of WINNER_INSTANCES) {
      expect(instance.participantIndices).to.have.length(Number(instance.chunkSize));
      expect(instance.participantWeights).to.have.length(Number(instance.chunkSize));
      expect(instance.participantWeights.every((weight) => BigInt(weight) > 0n)).to.equal(true);
      const oraclePre =
        instance.semanticVectorId === "ALL_VALID_FIXED_WINNER"
          ? { ...instance.preState, acceptedTicketReady: true }
          : instance.preState;
      expect(
        winnerStateTransition(
          oraclePre,
          instance.participantIndices,
          instance.participantWeights,
          oracleDomain(instance),
        ),
      ).to.deep.equal(instance.expectedPostState);
    }
    expect(byId("PRIZE_OR_ZERO").vectorIds).to.deep.equal(["WINNER_TRUE", "WINNER_FALSE"]);
    expect(protocol.fixedInputs.maximumParticipantWeightSum).to.equal(T_MAX.toString());
  });

  it("enforces cursor, slice, universe, and explicit participant bounds in the independent oracle", function () {
    const instance = EXPECTED_WINNER_INSTANCES.find(({ id }) => id === "FIRST_MATCH__WINNER_CHUNK_4")!;
    const run = (
      preState: any,
      indices: string[],
      weights: string[],
      chunkSize: string,
      sliceStart: string,
      universe = "64",
      upperBound = "64",
    ) =>
      winnerStateTransition(preState, indices, weights, {
        chunkSize,
        participantSliceStart: sliceStart,
        participantUniverseSize: universe,
        exclusiveUpperBound: upperBound,
      });
    expect(() => run({ ...instance.preState, cursor: "64" }, ["64"], ["1"], "1", "64")).to.throw(
      "winner oracle cursor is outside",
    );
    expect(() => run({ ...instance.preState, cursor: "65" }, ["65"], ["1"], "1", "65")).to.throw(
      "winner oracle cursor is outside",
    );
    expect(() => run({ ...instance.preState, cursor: "62" }, ["62", "63", "64"], ["1", "1", "1"], "3", "62")).to.throw(
      "winner oracle participant slice exceeds",
    );
    expect(() => run(instance.preState, ["1", "2", "3", "4"], ["1", "1", "1", "1"], "4", "0")).to.throw(
      "participant index drift",
    );
    expect(() => run(instance.preState, ["0", "2", "3", "4"], ["1", "1", "1", "1"], "4", "0")).to.throw(
      "participant index drift",
    );
    expect(() => run(instance.preState, ["-1", "0", "1", "2"], ["1", "1", "1", "1"], "4", "0")).to.throw(
      "non-negative decimal",
    );
    expect(() => run(instance.preState, ["0", "1", "2", "4"], ["1", "1", "1", "1"], "4", "0", "4", "4")).to.throw(
      "participant index outside registered universe",
    );
    expect(() => run(instance.preState, ["0", "1", "2"], ["1", "1", "1"], "4", "0")).to.throw(
      "participant length differs from chunk size",
    );
    expect(() => run(instance.preState, ["0", "1", "2", "3"], ["1", "0", "1", "1"], "4", "0")).to.throw(
      "implicit or zero winner participant",
    );
    expect(() => run(instance.preState, ["0", "1", "2"], ["1", "1", "1", "1"], "4", "0")).to.throw(
      "participant length differs from chunk size",
    );
  });

  it("separates general candidates from accepted tickets", function () {
    expect(protocol.rejectionAndAcceptance).to.deep.include({
      generalRemainderIsAcceptedTicket: false,
      generalCandidateMayMutateWinnerState: false,
      validityMustBePubliclyConfirmedBeforeAcceptance: true,
      allValidCompositesUsePowerOfTwoTotal: true,
    });
  });

  it("locks exact allocations per circuit/vector pair and window", function () {
    expect(protocol.repetitions.primitiveAndSingleStep).to.deep.include({
      WINDOW_1: { warmups: "2", measured: "4" },
      WINDOW_2: { warmups: "0", measured: "3" },
      WINDOW_3: { warmups: "0", measured: "3" },
    });
    expect(protocol.repetitions.compositeAndWinnerChunk.WINDOW_1).to.deep.equal({ warmups: "1", measured: "3" });
    expect(protocol.repetitions.publicDecryption.WINDOW_3).to.deep.equal({ warmups: "0", measured: "1" });
    const pair = protocol.runPlan.filter(
      ({ circuitId, vectorId }) => circuitId === "REJECTION_PIPELINE_GENERAL_128" && vectorId === "T_MAX",
    );
    expect(pair.filter(({ classification }) => classification === "WARMUP")).to.have.length(1);
    expect(pair.filter(({ classification }) => classification === "MEASURED")).to.have.length(7);
    const continuationId = "CONTINUATION_MATCH_IN_LATER_CHUNK__WINNER_CHUNK_8";
    const continuationRuns = protocol.runPlan.filter(
      ({ circuitId, vectorId }) => circuitId === "WINNER_CHUNK_8" && vectorId === continuationId,
    );
    expect(continuationRuns).to.have.length(8);
    expect(continuationRuns.every(({ setupBefore }) => setupBefore)).to.equal(true);
    expect(new Set(continuationRuns.map(({ preStateId }) => preStateId))).to.deep.equal(
      new Set([`pre:${continuationId}`]),
    );
    expect(new Set(continuationRuns.map(({ stateEquivalenceClass }) => stateEquivalenceClass))).to.deep.equal(
      new Set([continuationId]),
    );
  });

  it("generates the independently derived 588-record immutable run plan", function () {
    expect(protocol.runPlan).to.deep.equal(independentlyDeriveExpectedRunPlan());
    expect(protocol.runPlan).to.have.length(588);
    expect(new Set(protocol.runPlan.map(({ runId }) => runId)).size).to.equal(protocol.runPlan.length);
    expect(
      protocol.runPlan.filter(({ setupBefore }) => setupBefore).every(({ setupRecordId }) => setupRecordId),
    ).to.equal(true);
    expect(protocol.executionWindows.minimumConfirmedBlockSeparation).to.equal("20");
    expect(protocol.executionWindows.individualSampleReplacementForbidden).to.equal(true);
  });

  it("uses exact integer statistics and throughput", function () {
    expect(nearestRankP90Index(5n)).to.equal(4n);
    expect(nearestRankP90Index(7n)).to.equal(6n);
    expect(nearestRankP90Index(10n)).to.equal(8n);
    expect(exactMean([1n, 2n, 8n])).to.deep.equal({ numerator: "11", denominator: "3" });
    expect(projectSequentialCompletion(10_000n, 32n, 1_000n).transactions).to.equal("313");
  });

  it("keeps missing authoritative HCU BLOCKED and never substitutes gas", function () {
    expect(protocol.instrumentation.hcuCeiling.status).to.include("EXECUTION_BLOCKER");
    expect(protocol.goNoGo.missingHcuOrCeilingVerdict).to.equal("BLOCKED_NOT_GO");
    expect(protocol.goNoGo.gasCannotReplaceHcu).to.equal(true);
  });

  it("locks resource, latency, EIP-170, and throughput limits", function () {
    expect(protocol.limits.hcuMaximumFraction).to.deep.include({ numerator: "3", denominator: "4" });
    expect(protocol.limits.gasMaximumFraction).to.deep.include({ numerator: "3", denominator: "4" });
    expect(protocol.limits.deploymentBytecodeBytesExclusiveUpperBound).to.equal(EIP170_BYTE_LIMIT.toString());
    expect(protocol.limits.latencyP90Milliseconds.winnerSelectionChunk).to.equal("300000");
    expect(protocol.limits.throughput.tenThousandParticipantMaximumMilliseconds).to.equal("86400000");
  });

  it("serializes byte-identically in separate credential-free processes", function () {
    const script = resolve(root, "scripts/sg4-protocol.ts");
    const args = ["-r", "ts-node/register/transpile-only", script];
    const directory = mkdtempSync(join(tmpdir(), "sg4-protocol-test-"));
    try {
      const outputs = ["first.json", "second.json"].map((filename) => {
        const path = join(directory, filename);
        const descriptor = openSync(path, "w");
        const child = spawnSync(process.execPath, args, {
          cwd: root,
          encoding: "utf8",
          env: { TS_NODE_TRANSPILE_ONLY: "true" },
          stdio: ["ignore", descriptor, "pipe"],
        });
        closeSync(descriptor);
        expect(child.status).to.equal(0);
        return readFileSync(path, "utf8");
      });
      expect(outputs[0]).to.equal(outputs[1]);
      const inProcess = serializeProtocol();
      expect(outputs[0]).to.equal(inProcess);
      expect(createHash("sha256").update(outputs[0]).digest("hex")).to.equal(
        createHash("sha256").update(outputs[1]).digest("hex"),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses no timestamp, runtime, network, credential, or floating-point dependency", function () {
    const source = readFileSync(resolve(root, "scripts/sg4-protocol.ts"), "utf8");
    expect(source).not.to.match(/Math\.|parseFloat|Number\(|\.toFixed\(/u);
    expect(source).not.to.match(/from ["'](?:hardhat|ethers|@fhevm|@zama-fhe|node:https|node:http|node:net|node:dns)/u);
    expect(source).not.to.match(/process\.env|fetch\(|WebSocket/u);
  });
});

describe("SG-4 exhaustive protocol validator", function () {
  const cases: Array<[string, (candidate: any) => void]> = [
    ["removed circuit", (p) => p.circuits.pop()],
    ["changed operation count", (p) => p.circuits[0].operations.pop()],
    ["reordered operation", (p) => p.circuits[0].operations.reverse()],
    ["missing vector", (p) => p.circuits[10].vectorIds.pop()],
    ["changed sample allocation", (p) => (p.repetitions.primitiveAndSingleStep.WINDOW_1.measured = "3")],
    ["changed latency limit", (p) => (p.limits.latencyP90Milliseconds.winnerSelectionChunk = "999999")],
    ["gas substituted for HCU", (p) => (p.goNoGo.gasCannotReplaceHcu = false)],
    ["weakened threshold", (p) => (p.limits.hcuMaximumFraction.numerator = "4")],
    ["changed chunk size", (p) => p.limits.throughput.chunkSizes.pop()],
    ["changed schema required", (p) => p.rawResultSchema.$defs.sample.required.pop()],
    [
      "disabled append-only correction",
      (p) => (p.rawResultSchema.$defs.provenance.properties.correctionsDoNotOverwrite.const = false),
    ],
    ["participant cap", (p) => (p.limits.throughput.participantCapAllowed = true)],
    ["euint64 ticket", (p) => (p.sg3Domain.types.acceptedTicket = "euint64")],
    ["SG-3 constant", (p) => (p.sg3Domain.maximumAggregateTwab = "1")],
  ];
  for (const [name, mutate] of cases) {
    it(`rejects ${name}`, function () {
      expectInvalid(mutate);
    });
  }

  const continuationRun = (p: any, windowId: string, classification: string, repetitionIndex: string) =>
    p.runPlan.find(
      (record: any) =>
        record.circuitId === "WINNER_CHUNK_8" &&
        record.vectorId === "CONTINUATION_MATCH_IN_LATER_CHUNK__WINNER_CHUNK_8" &&
        record.windowId === windowId &&
        record.classification === classification &&
        record.repetitionIndex === repetitionIndex,
    );

  const rejectedDefects: Array<[string, (candidate: any) => void]> = [
    [
      "measured repetition inheriting repetition one post-state",
      (p) => {
        const first = continuationRun(p, "WINDOW_1", "MEASURED", "1");
        continuationRun(p, "WINDOW_1", "MEASURED", "2").preStateId = first.expectedPostStateId;
      },
    ],
    [
      "warm-up post-state feeding measured repetition one",
      (p) => {
        const warmup = continuationRun(p, "WINDOW_1", "WARMUP", "1");
        continuationRun(p, "WINDOW_1", "MEASURED", "1").preStateId = warmup.expectedPostStateId;
      },
    ],
    [
      "window two inheriting window one state",
      (p) => {
        const prior = continuationRun(p, "WINDOW_1", "MEASURED", "3");
        continuationRun(p, "WINDOW_2", "MEASURED", "1").preStateId = prior.expectedPostStateId;
      },
    ],
    [
      "short chunk-32 participant vector",
      (p) => {
        const instance = p.fixedInputs.winnerInstances.find((entry: any) => entry.id.endsWith("__WINNER_CHUNK_32"));
        instance.participantIndices.pop();
        instance.participantWeights.pop();
      },
    ],
    [
      "implicit zero participant",
      (p) => {
        const instance = p.fixedInputs.winnerInstances.find((entry: any) => entry.id.endsWith("__WINNER_CHUNK_32"));
        instance.participantIndices.push("32");
        instance.participantWeights.push("0");
      },
    ],
    [
      "cursor outside registered participant bounds",
      (p) => {
        const instance = p.fixedInputs.winnerInstances.find(
          (entry: any) => entry.id === "CONTINUATION_MATCH_IN_LATER_CHUNK__WINNER_CHUNK_32",
        );
        instance.preState.cursor = "33";
      },
    ],
    [
      "later repetition starting found when registered false",
      (p) => {
        const found = p.fixedInputs.winnerInstances.find(
          (entry: any) => entry.id === "ALREADY_FOUND_BEFORE_CHUNK__WINNER_CHUNK_8",
        );
        continuationRun(p, "WINDOW_1", "MEASURED", "2").preStateId = found.preStateId;
      },
    ],
    [
      "later repetition using a different prefix",
      (p) => {
        const instance = p.fixedInputs.winnerInstances.find(
          (entry: any) => entry.id === "CONTINUATION_MATCH_IN_LATER_CHUNK__WINNER_CHUNK_8",
        );
        instance.preState.prefix = (BigInt(instance.preState.prefix) + 1n).toString();
      },
    ],
    ["run missing pre-state", (p) => delete continuationRun(p, "WINDOW_1", "MEASURED", "2").preStateId],
    [
      "run missing expected post-state",
      (p) => delete continuationRun(p, "WINDOW_1", "MEASURED", "2").expectedPostStateId,
    ],
    [
      "setup ID reused for incompatible state",
      (p) => {
        p.fixedInputs.winnerInstances[1].setupId = p.fixedInputs.winnerInstances[0].setupId;
      },
    ],
    [
      "builder post-state disagreeing with the independent oracle",
      (p) => {
        p.fixedInputs.winnerInstances[0].expectedPostState.winnerIndex = "63";
      },
    ],
    [
      "unsupported semantic assigned to chunk one",
      (p) => {
        p.circuits.find((entry: any) => entry.id === "WINNER_CHUNK_1").vectorIds.push("MIDDLE_MATCH__WINNER_CHUNK_1");
      },
    ],
    [
      "materially different pre-state between measured repetitions",
      (p) => {
        continuationRun(p, "WINDOW_3", "MEASURED", "2").stateEquivalenceClass = "different-state";
      },
    ],
    ["run-plan total differing from independent derivation", (p) => p.runPlan.pop()],
    [
      "same-builder reconstruction with corrupted run data",
      (p) => {
        continuationRun(p, "WINDOW_2", "MEASURED", "2").setupBefore = false;
      },
    ],
  ];

  for (const [name, mutate] of rejectedDefects) {
    it(`rejects ${name}`, function () {
      expectInvalid(mutate);
    });
  }
});

describe("SG-4 raw result Draft 2020-12 schema", function () {
  const schema = protocol.rawResultSchema;
  it("accepts ordinary, invalidation/rerun, and correction records", function () {
    expect(schemaErrors(schema, validRawResult())).to.deep.equal([]);
  });
  it("accepts public-decryption samples only with complete timing/proof-flow fields", function () {
    const result = validRawResult() as any;
    result.rawSamples = [validSample(true)];
    expect(schemaErrors(schema, result)).to.deep.equal([]);
    delete result.rawSamples[0].publicDecryption;
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
  it("requires exact setup and state linkage for independent winner samples", function () {
    const result = validRawResult() as any;
    result.rawSamples = [validWinnerSample()];
    expect(schemaErrors(schema, result)).to.deep.equal([]);
    result.rawSamples[0].inheritsPriorRunId = "prior-run";
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
    result.rawSamples[0] = validWinnerSample();
    result.rawSamples[0].preStateDefinitionId = null;
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
  it("allows explicitly excluded semantic continuation linkage but not statistical inheritance", function () {
    const result = validRawResult() as any;
    const semantic = validWinnerSample() as any;
    semantic.sequenceClassification = "SEMANTIC_CONTINUATION_VALIDATION";
    semantic.includedInVerdictStatistics = false;
    semantic.inheritsPriorRunId = "semantic-prior-run";
    result.rawSamples = [semantic];
    expect(schemaErrors(schema, result)).to.deep.equal([]);
    semantic.includedInVerdictStatistics = true;
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
  it("rejects missing HCU", function () {
    const result = validRawResult() as any;
    delete result.rawSamples[0].hcuConsumed;
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
  it("rejects gas masquerading as HCU", function () {
    const result = validRawResult() as any;
    result.rawSamples[0].hcuSource = "GAS";
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
  it("rejects unsafe numeric encodings", function () {
    const result = validRawResult() as any;
    result.rawSamples[0].gasUsed = 9_007_199_254_740_992;
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
  it("rejects ciphertext/handle and unknown fields", function () {
    const result = validRawResult() as any;
    result.rawSamples[0].encryptedHandle = "forbidden";
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
  it("rejects individual-sample invalidation semantics", function () {
    const result = validRawResult() as any;
    result.invalidatedWindows[0].individualSampleId = "sample-old";
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
  it("rejects unknown root properties", function () {
    const result = validRawResult() as any;
    result.unregistered = true;
    expect(schemaErrors(schema, result)).not.to.deep.equal([]);
  });
});

describe("SG-4 compiled-AST operation manifests", function () {
  it("recursively expands every measured helper and matches every ordered FHE/store operation", function () {
    const ast = loadHarnessAst();
    for (const definition of CIRCUITS) {
      expect(extractMeasuredOperations(ast, roots[definition.id]), definition.id).to.deep.equal(definition.operations);
    }
  });
});

describe("SG-4 local encrypted harness execution", function () {
  this.timeout(180_000);

  beforeEach(function () {
    if (!fhevm.isMock) this.skip();
  });

  async function deploy() {
    const factory = await ethers.getContractFactory("SG4FheBenchmarkHarness");
    const contract: any = await factory.deploy();
    await contract.waitForDeployment();
    let sequence = 0n;
    const run = async (name: string, ...args: unknown[]) => {
      const tx = await contract[name](sequence, ...args);
      const receipt = await tx.wait();
      sequence++;
      return receipt;
    };
    return { contract, run };
  }

  async function decrypt128(handle: string): Promise<bigint> {
    return fhevm.debugger.decryptEuint(FhevmType.euint128, handle);
  }
  async function decrypt64(handle: string): Promise<bigint> {
    return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
  }
  async function decryptBool(handle: string): Promise<boolean> {
    return fhevm.debugger.decryptEbool(handle);
  }

  const winnerMethod: Record<string, string> = {
    WINNER_STEP_128: "winnerStep128",
    WINNER_CHUNK_1: "winnerChunk1",
    WINNER_CHUNK_4: "winnerChunk4",
    WINNER_CHUNK_8: "winnerChunk8",
    WINNER_CHUNK_16: "winnerChunk16",
    WINNER_CHUNK_32: "winnerChunk32",
  };

  async function assertWinnerState(contract: any, expected: any): Promise<void> {
    const [, prefix, found, winner, cursor] = await contract.getWinnerState();
    expect(await decrypt128(prefix)).to.equal(BigInt(expected.prefix));
    expect(await decryptBool(found)).to.equal(expected.found);
    expect(await decrypt128(winner)).to.equal(BigInt(expected.winnerIndex));
    expect(cursor).to.equal(BigInt(expected.cursor));
  }

  async function assertWinnerPreState(contract: any, instance: any): Promise<void> {
    const [ticket, prefix, found, winner, cursor, setupId, circuitCode, chunkSize] = await contract.getWinnerState();
    expect(await decrypt128(ticket)).to.equal(BigInt(instance.preState.acceptedTicket));
    expect(await decrypt128(prefix)).to.equal(BigInt(instance.preState.prefix));
    expect(await decryptBool(found)).to.equal(instance.preState.found);
    expect(await decrypt128(winner)).to.equal(BigInt(instance.preState.winnerIndex));
    expect(cursor).to.equal(BigInt(instance.preState.cursor));
    expect(setupId).to.equal(BigInt(instance.setupId));
    expect(chunkSize).to.equal(BigInt(instance.chunkSize));
    expect(circuitCode).to.equal(BigInt(instance.setupId) / 10n);
    expect(await contract.winnerInitialized()).to.equal(instance.preState.readiness);
    expect(await contract.acceptedTicketReady()).to.equal(instance.preState.acceptedTicketReady);
  }

  function isExactDepthLimit(error: unknown): boolean {
    const identifier = "HCUTransactionDepthLimitExceeded";
    const selector = ethers.id(`${identifier}()`).slice(0, 10).toLowerCase();
    const pending: unknown[] = [error];
    const seen = new Set<object>();
    while (pending.length > 0) {
      const current = pending.pop();
      if (typeof current === "string") {
        if (current === identifier || current.includes(`${identifier}(`) || current.toLowerCase().includes(selector))
          return true;
        continue;
      }
      if (current === null || typeof current !== "object" || seen.has(current)) continue;
      seen.add(current);
      pending.push(...Object.values(current));
    }
    return false;
  }

  it("executes TWAB cast/delta/accumulate and aggregate/prefix near SG-3 maxima", async function () {
    const { contract, run } = await deploy();
    await run("twabCast64To128");
    expect(await decrypt128(await contract.getResult128())).to.equal(BALANCE_MAX_BASE_UNITS);
    await run("twabDelta128");
    expect(await decrypt128(await contract.getResult128())).to.equal(TWAB_MAX);
    await run("twabAccumulate128");
    expect(await decrypt128(await contract.getResult128())).to.equal(TWAB_MAX);
    await run("aggregateAdd128");
    expect(await decrypt128(await contract.getResult128())).to.equal(TWAB_MAX);
    await run("prefixAdd128");
    expect(await decrypt128(await contract.getResult128())).to.equal(TWAB_MAX);
  });

  it("executes zero, one, general-separated, and all-valid rejection paths", async function () {
    const { contract, run } = await deploy();
    await run("drawZeroTotalNoop");
    expect(await decrypt128(await contract.getResult128())).to.equal(0n);
    await run("drawTotalOne");
    expect(await decrypt128(await contract.getResult128())).to.equal(0n);
    await run("rejectionPipelineGeneral128", 3);
    expect(await contract.generalCandidatePending()).to.equal(true);
    expect(await contract.winnerInitialized()).to.equal(false);
    await expect(contract.winnerChunk1(3)).to.be.revertedWithCustomError(contract, "WinnerStateNotReady");
    const [remainder] = await contract.getGeneralCandidateState();
    expect(await decrypt128(remainder)).to.be.lessThan(T_MAX);
    await run("rejectionPipelineAllValid128");
    expect(await decrypt128(await contract.getResult128())).to.be.lessThan(T_DIVIDES_DOMAIN);
    expect(await decryptBool(await contract.getResultBool())).to.equal(true);
  });

  it("executes all six semantic cases from exact chunk-4 instances", async function () {
    const { contract, run } = await deploy();
    const instances = WINNER_INSTANCES.filter(({ circuitId }) => circuitId === "WINNER_CHUNK_4");
    expect(instances).to.have.length(6);
    for (const instance of instances) {
      await (await contract.setupWinnerInstance(BigInt(instance.setupId))).wait();
      await assertWinnerPreState(contract, instance);
      await run("winnerChunk4");
      await assertWinnerState(contract, instance.expectedPostState);
    }
  });

  it("proves real two-call continuation separately from statistical repetitions", async function () {
    const { contract, run } = await deploy();
    await (await contract.setupContinuationSemanticSequence()).wait();
    await run("winnerChunk8");
    await assertWinnerState(contract, CONTINUATION_SEMANTIC_SEQUENCE.firstPost);
    await run("winnerChunk8");
    await assertWinnerState(contract, CONTINUATION_SEMANTIC_SEQUENCE.secondPost);
  });

  it("executes registered chunk sizes from exact instances and asserts the exact chunk-32 depth error", async function () {
    const { contract, run } = await deploy();
    for (const circuitId of ["WINNER_CHUNK_1", "WINNER_CHUNK_4", "WINNER_CHUNK_8", "WINNER_CHUNK_16"]) {
      const instance = WINNER_INSTANCES.find(
        (entry) => entry.circuitId === circuitId && entry.semanticVectorId === "FIRST_MATCH",
      )!;
      await (await contract.setupWinnerInstance(BigInt(instance.setupId))).wait();
      await assertWinnerPreState(contract, instance);
      await run(winnerMethod[circuitId]);
      await assertWinnerState(contract, instance.expectedPostState);
    }
    const chunk32 = WINNER_INSTANCES.find(
      (entry) => entry.circuitId === "WINNER_CHUNK_32" && entry.semanticVectorId === "FIRST_MATCH",
    )!;
    await (await contract.setupWinnerInstance(BigInt(chunk32.setupId))).wait();
    await assertWinnerPreState(contract, chunk32);
    let thrown: unknown;
    try {
      await contract.winnerChunk32(await contract.nextRunSequence());
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "chunk 32 unexpectedly succeeded; protocol risk documentation must be reviewed").not.to.equal(
      undefined,
    );
    expect(isExactDepthLimit(thrown), "chunk 32 reverted for an unrelated reason").to.equal(true);
  });

  it("executes emitted multi-window winner samples with one exact reset per repetition", async function () {
    const { contract, run } = await deploy();
    const selected = new Set([
      "FIRST_MATCH__WINNER_CHUNK_1",
      "ALREADY_FOUND_BEFORE_CHUNK__WINNER_CHUNK_8",
      "CONTINUATION_MATCH_IN_LATER_CHUNK__WINNER_CHUNK_8",
    ]);
    const records = protocol.runPlan.filter(({ vectorId }) => typeof vectorId === "string" && selected.has(vectorId));
    expect(new Set(records.map(({ windowId }) => windowId))).to.deep.equal(
      new Set(["WINDOW_1", "WINDOW_2", "WINDOW_3"]),
    );
    for (const record of records) {
      const { definition, oracle } = resolveWinnerRunRecord(record);
      expect(record.setupBefore).to.equal(true);
      expect(record.setupDefinitionId).to.equal(definition.setupId);
      expect(record.preStateDefinitionId).to.equal(definition.preStateId);
      expect(record.participantVectorInstanceId).to.equal(definition.participantVectorInstanceId);
      expect(record.expectedPostStateDefinitionId).to.equal(definition.expectedPostStateId);
      expect(definition.participantWeights.every((weight) => BigInt(weight) > 0n)).to.equal(true);
      await (await contract.setupWinnerInstance(BigInt(record.setupDefinitionId!))).wait();
      await assertWinnerPreState(contract, definition);
      await run(winnerMethod[String(record.circuitId)]);
      await assertWinnerState(contract, oracle);
      await assertWinnerState(contract, definition.expectedPostState);
    }

    for (const windowId of ["WINDOW_1", "WINDOW_2", "WINDOW_3"]) {
      const record = protocol.runPlan.find(
        (candidate) =>
          candidate.windowId === windowId &&
          candidate.vectorId === "FIRST_MATCH__WINNER_CHUNK_32" &&
          candidate.classification === "MEASURED",
      )!;
      const { definition } = resolveWinnerRunRecord(record);
      await (await contract.setupWinnerInstance(BigInt(record.setupDefinitionId!))).wait();
      await assertWinnerPreState(contract, definition);
      let thrown: unknown;
      try {
        await contract[winnerMethod[String(record.circuitId)]](await contract.nextRunSequence());
      } catch (error) {
        thrown = error;
      }
      expect(isExactDepthLimit(thrown)).to.equal(true);
    }
  });

  it("executes both encrypted PRIZE_OR_ZERO branches", async function () {
    const { contract, run } = await deploy();
    await (await contract.setupPrizeVector(7)).wait();
    await run("prizeOrZero");
    expect(await decrypt64(await contract.getResult64())).to.equal(BALANCE_MAX_BASE_UNITS);
    await (await contract.setupPrizeVector(8)).wait();
    await run("prizeOrZero");
    expect(await decrypt64(await contract.getResult64())).to.equal(0n);
  });

  it("executes guaranteed-valid draw-and-chunk and emits metadata only", async function () {
    const { contract, run } = await deploy();
    const instance = WINNER_INSTANCES.find(({ circuitId }) => circuitId === "COMPOSITE_DRAW_AND_CHUNK_8")!;
    await (await contract.setupCompositeWinnerInstance(BigInt(instance.setupId))).wait();
    await assertWinnerPreState(contract, instance);
    const receipt = await run("compositeDrawAndChunk8");
    const [ticket] = await contract.getWinnerState();
    expect(await decrypt128(ticket)).to.be.lessThan(T_DIVIDES_DOMAIN);
    await assertWinnerState(contract, instance.expectedPostState);
    const parsed = receipt.logs
      .map((log: any) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    expect(parsed).to.have.length(1);
    expect(parsed[0].args).to.have.length(4);
  });

  it("has no custody, escape, or encrypted event fields", function () {
    const source = readFileSync(resolve(root, harnessSourcePath), "utf8");
    expect(source).not.to.match(/payable|delegatecall|selfdestruct|transferOwnership|rescue|withdraw|call\{/u);
    const event = source.match(/event CircuitCompleted\([\s\S]*?\);/u)?.[0] ?? "";
    expect(event).not.to.match(/handle|proof|signature|ciphertext|euint|ebool/u);
  });
});

describe("SG-4 scope", function () {
  /* Reviewed SG-4 HCU-authority preparation scope. Contracts are deliberately absent: the
   * amendment changes no Solidity. */
  it("changes only the reviewed SG-4 authority preparation paths", function () {
    const status = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
      cwd: root,
      encoding: "utf8",
    });
    const paths = status.stdout
      .trimEnd()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3));
    const permitted = [
      "package.json",
      "pnpm-lock.yaml",
      "docs/security/SG4_BENCHMARK_PROTOCOL.md",
      "docs/security/SG4_HCU_AUTHORITY_PROTOCOL.md",
      "scripts/sg4-protocol.ts",
      "scripts/sg4-hcu-authority-launcher.cjs",
      "scripts/sg4-hcu-authority-protocol.ts",
      "scripts/sg4-hcu-authority.ts",
      "test/SG4BenchmarkProtocol.ts",
      "test/SG4HcuAuthority.ts",
      "test/fixtures/fhevm-v0.13.2-FHEVMExecutor-4d775fb2ba96328ce842168d97046c84.build-info.json.gz",
    ];
    expect(paths.filter((path) => !permitted.includes(path))).to.deep.equal([]);
  });
});
