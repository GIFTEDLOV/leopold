/* SG-4 binding candidate generator.
 *
 * This is the only SG-4 closure component that writes a repository file. It creates exactly the
 * untracked binding candidate; it never stages or commits it. Every RPC method below is explicitly
 * read-only and every state read uses the single finalized block captured at the start.
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ROOT,
  EXPECTED_AUTHORITY_PROTOCOL_SHA256,
  EXPECTED_SG4_PROTOCOL_SHA256,
  authorityBindingCanonicalSha256,
  createCommittedEndpointTransport,
  decodeAbiString,
  decodeAddressWord,
  decodePackedHcuStorageWord,
  decodeUint48,
  deriveAuthorityFromSourceMaterial,
  deriveExecutorFromSourceMaterial,
  gitValue,
  interfaceCall,
  interfaceCalldata,
  normalizeRuntimeBytecodeFromManifest,
  sha256,
  validateAuthorityBindingRecord,
  type AuthorityBindingRecord,
} from "./sg4-hcu-authority";
import {
  BINDING_RECORD_PATH,
  HISTORICAL_BINDING_RECORD_PATH,
  HISTORICAL_BINDING_RECORD_SCHEMA,
  HISTORICAL_BINDING_RECORD_VERSION,
  HISTORICAL_BINDING_RECORD_FILE_SHA256,
  HISTORICAL_BINDING_RECORD_CANONICAL_SHA256,
  HISTORICAL_BINDING_IMPLEMENTATION_COMMIT,
  V2_BINDING_TARGET_ID,
  V2_BINDING_TARGET_SCOPE,
  V2_BINDING_RECORD_PATH,
  BINDING_RECORD_SCHEMA,
  BINDING_RECORD_VERSION,
  ERC1967_IMPLEMENTATION_SLOT,
  HCU_LIMIT_STORAGE_SLOT,
  LIVE_RPC_ALLOWED_METHODS,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_EXECUTOR_ADDRESS,
} from "./sg4-hcu-authority-protocol";

const READ_ONLY_METHODS = new Set(LIVE_RPC_ALLOWED_METHODS);

function fail(message: string): never {
  throw new Error(`SG4 binding generation refused: ${message}`);
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) fail(`${name} is required`);
  return process.argv[index + 1];
}

function strictCode(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/u.test(value)) fail(`${label} returned malformed code`);
  return value.toLowerCase();
}

function strictWord(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/u.test(value)) fail(`${label} returned a malformed word`);
  return value.toLowerCase();
}

function declaredCalldata(record: AuthorityBindingRecord, callId: string): string {
  const entry = interfaceCall(record, callId);
  if (entry === null) fail(`binding source declares no interface call ${callId}`);
  return interfaceCalldata(entry);
}

async function main(): Promise<void> {
  const target = argument("--target");
  if (target !== V2_BINDING_TARGET_ID) fail(`unsupported binding target ${target}; expected ${V2_BINDING_TARGET_ID}`);
  const sourcePath = resolve(argument("--source-record"));
  if (sourcePath !== resolve(join(ROOT, HISTORICAL_BINDING_RECORD_PATH))) {
    fail(`V2 source record must be the preserved historical record at ${HISTORICAL_BINDING_RECORD_PATH}`);
  }
  const sourceBytes = readFileSync(sourcePath);
  if (sha256(sourceBytes) !== HISTORICAL_BINDING_RECORD_FILE_SHA256)
    fail("historical source record byte digest mismatch");
  const legacy = JSON.parse(sourceBytes.toString("utf8")) as Record<string, unknown>;
  if (
    legacy.schema !== HISTORICAL_BINDING_RECORD_SCHEMA ||
    legacy.recordVersion !== HISTORICAL_BINDING_RECORD_VERSION
  ) {
    fail("historical source record schema/version mismatch");
  }
  if (authorityBindingCanonicalSha256(legacy) !== HISTORICAL_BINDING_RECORD_CANONICAL_SHA256) {
    fail("historical source record canonical digest mismatch");
  }
  const historicalLineage = legacy.lineage as Record<string, unknown>;
  if (
    historicalLineage.implementationCommit !== HISTORICAL_BINDING_IMPLEMENTATION_COMMIT ||
    historicalLineage.permittedBindingPath !== HISTORICAL_BINDING_RECORD_PATH
  ) {
    fail("historical source record lineage mismatch");
  }

  const head = gitValue("rev-parse", "HEAD");
  const tree = gitValue("rev-parse", "HEAD^{tree}");
  if (gitValue("diff", "--name-only") !== "" || gitValue("diff", "--cached", "--name-only") !== "") {
    fail("tracked worktree or index is not clean");
  }
  if (gitValue("ls-files", "--others", "--exclude-standard") !== "") fail("preparation contains an untracked file");
  if (gitValue("ls-files", "--", V2_BINDING_RECORD_PATH) !== "") fail("V2 binding path is already tracked");

  const record = {
    ...legacy,
    schema: BINDING_RECORD_SCHEMA,
    recordVersion: BINDING_RECORD_VERSION,
    integrity: {
      canonicalization: "CANONICAL_JSON_SHA256_WITH_DIGEST_FIELD_NULL",
      canonicalSha256: null,
    },
    lineage: {
      ...(legacy.lineage as Record<string, unknown>),
      implementationCommit: head,
      implementationTree: tree,
      benchmarkProtocolSha256: EXPECTED_SG4_PROTOCOL_SHA256,
      authorityProtocolSha256: EXPECTED_AUTHORITY_PROTOCOL_SHA256,
      permittedBindingPath: V2_BINDING_RECORD_PATH,
      bindingPurpose: `Bind the reviewed SG-4 implementation commit to a live authority verification for ${V2_BINDING_TARGET_ID}.`,
    },
    bindingTarget: {
      id: V2_BINDING_TARGET_ID,
      scope: V2_BINDING_TARGET_SCOPE,
      supersedes: {
        path: HISTORICAL_BINDING_RECORD_PATH,
        fileSha256: HISTORICAL_BINDING_RECORD_FILE_SHA256,
        canonicalSha256: HISTORICAL_BINDING_RECORD_CANONICAL_SHA256,
        schema: HISTORICAL_BINDING_RECORD_SCHEMA,
        recordVersion: HISTORICAL_BINDING_RECORD_VERSION,
        implementationCommit: HISTORICAL_BINDING_IMPLEMENTATION_COMMIT,
      },
    },
  } as unknown as AuthorityBindingRecord;

  const transport = createCommittedEndpointTransport();
  const methods = new Set<string>();
  const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
    if (!READ_ONLY_METHODS.has(method)) fail(`RPC method ${method} is not read-only allow-listed`);
    methods.add(method);
    return transport.send({ method, params });
  };

  const chainId = await rpc("eth_chainId", []);
  if (typeof chainId !== "string" || BigInt(chainId) !== SEPOLIA_CHAIN_ID) fail("RPC chain is not Sepolia");
  const block = (await rpc("eth_getBlockByNumber", ["finalized", false])) as Record<string, unknown> | null;
  if (
    block === null ||
    typeof block.number !== "string" ||
    typeof block.hash !== "string" ||
    typeof block.stateRoot !== "string" ||
    typeof block.timestamp !== "string"
  ) {
    fail("RPC did not return a complete finalized block header");
  }
  const blockHex = block.number.toLowerCase();
  const blockDecimal = BigInt(blockHex).toString(10);

  const executorAddress = SEPOLIA_EXECUTOR_ADDRESS.toLowerCase();
  const executorProxyCode = strictCode(await rpc("eth_getCode", [executorAddress, blockHex]), "executor proxy");
  const executorSlotWord = strictWord(
    await rpc("eth_getStorageAt", [executorAddress, ERC1967_IMPLEMENTATION_SLOT, blockHex]),
    "executor implementation slot",
  );
  const executorImplementation = decodeAddressWord(executorSlotWord);
  if (executorImplementation === null) fail("executor implementation slot is empty");
  const executorImplementationCode = strictCode(
    await rpc("eth_getCode", [executorImplementation, blockHex]),
    "executor implementation",
  );
  const executorVersion = decodeAbiString(
    await rpc("eth_call", [{ to: executorAddress, data: declaredCalldata(record, "EXECUTOR_VERSION") }, blockHex]),
  );
  const authorityAddress = decodeAddressWord(
    await rpc("eth_call", [
      { to: executorAddress, data: declaredCalldata(record, "EXECUTOR_AUTHORITY_GETTER") },
      blockHex,
    ]),
  );
  if (executorVersion === null || authorityAddress === null) fail("executor getters did not decode");

  const authorityProxyCode = strictCode(await rpc("eth_getCode", [authorityAddress, blockHex]), "HCULimit proxy");
  const authoritySlotWord = strictWord(
    await rpc("eth_getStorageAt", [authorityAddress, ERC1967_IMPLEMENTATION_SLOT, blockHex]),
    "HCULimit implementation slot",
  );
  const authorityImplementation = decodeAddressWord(authoritySlotWord);
  if (authorityImplementation === null) fail("HCULimit implementation slot is empty");
  const authorityImplementationCode = strictCode(
    await rpc("eth_getCode", [authorityImplementation, blockHex]),
    "HCULimit implementation",
  );
  const reciprocal = decodeAddressWord(
    await rpc("eth_call", [
      { to: authorityAddress, data: declaredCalldata(record, "AUTHORITY_RECIPROCAL_EXECUTOR_GETTER") },
      blockHex,
    ]),
  );
  const authorityVersion = decodeAbiString(
    await rpc("eth_call", [{ to: authorityAddress, data: declaredCalldata(record, "AUTHORITY_VERSION") }, blockHex]),
  );
  if (reciprocal === null || authorityVersion === null) fail("HCULimit identity getters did not decode");

  const getter = async (callId: string): Promise<string> => {
    const value = decodeUint48(
      await rpc("eth_call", [{ to: authorityAddress, data: declaredCalldata(record, callId) }, blockHex]),
    );
    if (value === null) fail(`${callId} did not return a strict uint48`);
    return value.toString(10);
  };
  const getterValues = {
    globalHCUCapPerBlock: await getter("BLOCK_OR_BATCH_HCU_GETTER"),
    maxHCUDepthPerTx: await getter("TRANSACTION_DEPTH_HCU_GETTER"),
    maxHCUPerTx: await getter("TRANSACTION_TOTAL_HCU_GETTER"),
  };
  const hcuRawWord = strictWord(
    await rpc("eth_getStorageAt", [authorityAddress, HCU_LIMIT_STORAGE_SLOT, blockHex]),
    "HCULimit packed storage",
  );
  const packed = decodePackedHcuStorageWord(hcuRawWord);
  if (packed === null) fail("HCULimit packed storage is not five strict uint48 fields");
  const decodedFields = Object.fromEntries(Object.entries(packed).map(([name, value]) => [name, value.toString(10)]));
  for (const field of Object.keys(getterValues) as (keyof typeof getterValues)[]) {
    if (getterValues[field] !== decodedFields[field]) fail(`getter/storage mismatch for ${field}`);
  }

  const executorDerivation = deriveExecutorFromSourceMaterial(record, {
    implementationAddress: executorImplementation,
  });
  const authorityDerivation = deriveAuthorityFromSourceMaterial(record, {
    implementationAddress: authorityImplementation,
  });
  if (executorDerivation.blockers.length > 0 || authorityDerivation.blockers.length > 0) {
    fail(
      `authenticated source derivation failed: ${[...executorDerivation.blockers, ...authorityDerivation.blockers].join("|")}`,
    );
  }
  const executorManifest = executorDerivation.executorBuild?.normalizationManifest;
  const authorityManifest = authorityDerivation.artifactBuild?.normalizationManifest;
  if (executorManifest === undefined || authorityManifest === undefined) fail("normalization manifests are unresolved");
  const executorNormalized = normalizeRuntimeBytecodeFromManifest(
    Buffer.from(executorImplementationCode.slice(2), "hex"),
    executorManifest as never,
    { implementationAddress: executorImplementation },
  );
  const authorityNormalized = normalizeRuntimeBytecodeFromManifest(
    Buffer.from(authorityImplementationCode.slice(2), "hex"),
    authorityManifest as never,
    { implementationAddress: authorityImplementation },
  );
  if (!executorNormalized.ok || !authorityNormalized.ok) fail("runtime normalization failed");

  record.snapshot = {
    network: "sepolia",
    chainId: SEPOLIA_CHAIN_ID.toString(10),
    finalityMode: "finalized",
    blockNumberDecimal: blockDecimal,
    blockNumberHex: blockHex,
    blockHash: String(block.hash).toLowerCase(),
    stateRoot: String(block.stateRoot).toLowerCase(),
    blockTimestamp: BigInt(block.timestamp).toString(10),
    capturedAt: new Date().toISOString(),
    rpcMethods: [...methods].sort(),
    contractAddresses: { executor: executorAddress, hcuLimit: authorityAddress },
    durabilityModel: "PINNED_BLOCK_RPC_REPLAY",
  };
  record.stateEvidence = {
    executor: {
      address: executorAddress,
      proxyRuntimeBytecode: executorProxyCode,
      proxyRuntimeSha256: sha256(Buffer.from(executorProxyCode.slice(2), "hex")),
      implementationSlotWord: executorSlotWord,
      implementationAddress: executorImplementation,
      implementationRuntimeBytecode: executorImplementationCode,
      implementationRuntimeSha256: sha256(Buffer.from(executorImplementationCode.slice(2), "hex")),
      normalizedImplementationRuntimeSha256: executorNormalized.normalizedSha256,
      version: executorVersion,
      reciprocalAddress: authorityAddress,
    },
    authority: {
      address: authorityAddress,
      proxyRuntimeBytecode: authorityProxyCode,
      proxyRuntimeSha256: sha256(Buffer.from(authorityProxyCode.slice(2), "hex")),
      implementationSlotWord: authoritySlotWord,
      implementationAddress: authorityImplementation,
      implementationRuntimeBytecode: authorityImplementationCode,
      implementationRuntimeSha256: sha256(Buffer.from(authorityImplementationCode.slice(2), "hex")),
      normalizedImplementationRuntimeSha256: authorityNormalized.normalizedSha256,
      version: authorityVersion,
      reciprocalAddress: reciprocal,
    },
    hcuStorage: {
      storageSlot: HCU_LIMIT_STORAGE_SLOT,
      rawWord: hcuRawWord,
      fieldOrderLeastToMostSignificant: [
        "globalHCUCapPerBlock",
        "usedBlockHCU",
        "lastSeenBlockNumber",
        "maxHCUDepthPerTx",
        "maxHCUPerTx",
      ],
      fieldWidthBits: 48,
      byteOrder: "BIG_ENDIAN_WORD_LSB_FIRST_PACKED_FIELDS",
      decodedFields,
      getterValues,
    },
  };
  record.integrity.canonicalSha256 = authorityBindingCanonicalSha256(record);
  const errors = validateAuthorityBindingRecord(record);
  if (errors.length > 0) fail(`fresh record validation failed: ${errors.join(" | ")}`);

  const destination = join(ROOT, BINDING_RECORD_PATH);
  mkdirSync(join(ROOT, "scripts/sg4-hcu-authority-bindings"), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(
    `${JSON.stringify(
      {
        result: "FRESH_BINDING_CANDIDATE_CREATED",
        implementationCommit: head,
        implementationTree: tree,
        snapshot: record.snapshot,
        rpcMethods: [...methods].sort(),
        bindingSha256: sha256(readFileSync(destination)),
        canonicalSha256: record.integrity.canonicalSha256,
      },
      null,
      2,
    )}\n`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "SG4 binding generation failed"}\n`);
    process.exitCode = 1;
  });
}
