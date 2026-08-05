export const SG5_PROTOCOL_VERSION = "sg5-browser-capability-v1" as const;
export const SG5_PREPARATION_STATUS = "PREPARED_LIVE_BROWSER_EXECUTION_REQUIRED" as const;
export const SG5_LIVE_ACK = "I_UNDERSTAND_THIS_CONTACTS_SEPOLIA" as const;
export const SG5_PAGE_ENABLE = "ENABLED_LOCAL_ONLY" as const;
export const SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED: boolean = false;

export interface AssetOriginAuthority {
  dynamicAssetOriginsResolved: boolean;
  publicKeyAssetOrigin: string | null;
  publicKeyAssetPathPrefix: string | null;
  crsAssetOrigin: string | null;
  crsAssetPathPrefix: string | null;
  crsAssetRequired: boolean;
}

export const SG5_ASSET_ORIGIN_AUTHORITY: Readonly<AssetOriginAuthority> = Object.freeze({
  dynamicAssetOriginsResolved: SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED,
  publicKeyAssetOrigin: null,
  publicKeyAssetPathPrefix: null,
  crsAssetOrigin: null,
  crsAssetPathPrefix: null,
  crsAssetRequired: true,
});

export const SG5_LOCKED = Object.freeze({
  chainId: 11155111,
  gatewayChainId: 10901,
  contractAddress: "0x332C58e28Bb31c902ddd370265eBBF1030299bC7",
  userAddress: "0x57357D26D1f56eca4556d271078A0239a7696Bbf",
  value: 1n,
  encryptedWidth: "euint64",
  coldContextCount: 2,
  sdkPackage: "@zama-fhe/sdk",
  sdkVersion: "3.4.0",
  reactSdkPackage: "@zama-fhe/react-sdk",
  reactSdkVersion: "3.4.0",
});

export const SG5_ORIGINS = Object.freeze({
  localhost: "http://localhost:3000",
  relayer: "https://relayer.testnet.zama.org",
  chainRpc: "https://ethereum-sepolia-rpc.publicnode.com",
});

export function probeRouteEnabled(nodeEnvironment: string | undefined, pageFlag: string | undefined): boolean {
  return nodeEnvironment !== "production" && pageFlag === SG5_PAGE_ENABLE;
}

export function liveModeAcknowledged(value: string | undefined): boolean {
  return value === SG5_LIVE_ACK;
}

export type ProbeExecutionMode = "OFFLINE_STRUCTURAL" | "LIVE_SEPOLIA";
export type ProbeStatus =
  | "STRUCTURAL_PASS_NOT_LIVE"
  | "CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT"
  | "BLOCKED"
  | "FAIL";
export type BlockerClassification =
  | "NONE"
  | "BROWSER_UNAVAILABLE"
  | "DYNAMIC_ASSET_ORIGINS_UNRESOLVED"
  | "WASM_PROOF_UNAVAILABLE";
export type FailureClassification =
  | "NONE"
  | "CAPABILITY_INCOMPLETE"
  | "MOCK_ADAPTER_IN_LIVE_MODE"
  | "BROWSER_ERROR"
  | "CONSOLE_ERROR"
  | "UNHANDLED_REJECTION"
  | "FORBIDDEN_ORIGIN"
  | "FORBIDDEN_AUTHORITY_ACTION"
  | "FORBIDDEN_MATERIAL";

export type OriginClassification =
  | "LOCALHOST"
  | "OFFICIAL_RELAYER"
  | "OFFICIAL_CHAIN_RPC"
  | "OFFICIAL_PUBLIC_KEY_ASSET"
  | "OFFICIAL_CRS_ASSET";
export type RequestCategory =
  | "LOCAL_FRONTEND_ASSET"
  | "SEPOLIA_RPC"
  | "RELAYER_KEYURL_METADATA"
  | "PUBLIC_KEY_ASSET"
  | "CRS_ASSET";
export type StatusCategory =
  | "SUCCESS_2XX"
  | "REDIRECT_3XX"
  | "CLIENT_ERROR_4XX"
  | "SERVER_ERROR_5XX"
  | "NETWORK_FAILURE";
export type RedirectClassification = "NONE" | "ALLOWED_SAME_ORIGIN" | "ALLOWED_REGISTERED_ORIGIN" | "FORBIDDEN";

export interface SafeNetworkObservation {
  originClassification: OriginClassification;
  requestCategory: RequestCategory;
  statusCategory: StatusCategory;
  durationMilliseconds: string;
  redirectClassification: RedirectClassification;
  success: boolean;
}

export interface NetworkResponseObservationInput {
  requestUrl: string;
  status: number;
  durationMilliseconds: number;
  redirectedToUrl?: string | null;
  redirectedFromUrl?: string | null;
}

export type WasmCriticalSectionClassification = "SDK_INITIALIZATION" | "SDK_ENCRYPTION";

export interface SafeWasmCriticalSectionObservation {
  criticalSectionClassification: WasmCriticalSectionClassification;
  successfulInstantiateCount: number;
  successfulInstantiateStreamingCount: number;
  failedCallCount: number;
}

export interface SafeProbeObservation {
  adapterClassification: "REAL_INSTALLED_SDK" | "CONTROLLED_TEST_FAKE";
  browserEnvironmentValidated: boolean;
  wasmInstantiationCount: number;
  wasmCriticalSections: SafeWasmCriticalSectionObservation[];
  wasmRuntimeInitialized: boolean;
  sdkInstanceCreated: boolean;
  publicKeyRetrieved: boolean;
  encryptedInputBuilderCreated: boolean;
  encryptionCompleted: boolean;
  encryptedPayloadCount: number;
  encryptedPayloadNonempty: boolean;
  inputProofPresent: boolean;
  durationMilliseconds: number;
}

export interface SanitizedProbeResult {
  schema: "zama-szn4.sg5-browser-probe-result.v1";
  protocolVersion: typeof SG5_PROTOCOL_VERSION;
  status: ProbeStatus;
  executionMode: ProbeExecutionMode;
  adapterClassification: SafeProbeObservation["adapterClassification"];
  blockerClassification: BlockerClassification;
  failureClassification: FailureClassification;
  browserEngine: "CHROMIUM_FAMILY" | "UNKNOWN_BROWSER";
  browserVersion: "RECORDED_BY_PLAYWRIGHT";
  userAgentClassification: "CHROMIUM_FAMILY" | "OTHER_BROWSER_FAMILY";
  chainId: "11155111";
  sdkPackage: "@zama-fhe/sdk";
  sdkVersion: "3.4.0";
  reactSdkPackage: "@zama-fhe/react-sdk";
  reactSdkVersion: "3.4.0";
  wasmRuntimeInitialized: boolean;
  wasmProofMechanism: "ATTRIBUTED_SUCCESSFUL_WASM_INSTANTIATION_AND_REAL_SDK_ENCRYPTION";
  wasmInstantiationCount: string;
  wasmCriticalSections: Array<{
    criticalSectionClassification: WasmCriticalSectionClassification;
    successfulInstantiateCount: string;
    successfulInstantiateStreamingCount: string;
    failedCallCount: string;
  }>;
  sdkInstanceCreated: boolean;
  publicKeyRetrieved: boolean;
  publicKeySourceClassification: "INSTALLED_SEPOLIA_RELAYER_CONFIGURATION";
  encryptedInputBuilderCreated: boolean;
  encryptedWidth: "euint64";
  plaintextClassification: "FIXED_TEST_VALUE_ONE";
  encryptionCompleted: boolean;
  encryptedPayloadCount: string;
  encryptedPayloadNonempty: boolean;
  inputProofPresent: boolean;
  forbiddenMaterialRetained: boolean;
  walletRequested: boolean;
  accountAuthorizationRequested: boolean;
  signatureRequested: boolean;
  transactionSubmitted: boolean;
  consoleErrorCount: string;
  pageErrorCount: string;
  unhandledRejectionCount: string;
  forbiddenNetworkRequestCount: string;
  durationMilliseconds: string;
  networkObservations: SafeNetworkObservation[];
  finalVerdict: "NOT_LIVE" | "AWAITING_PLAYWRIGHT_HARNESS_VERDICT" | "BLOCKED" | "FAIL";
}

export interface SanitizedAggregateResult {
  schema: "zama-szn4.sg5-browser-probe-aggregate.v1";
  protocolVersion: typeof SG5_PROTOCOL_VERSION;
  status: "PASS" | "BLOCKED" | "FAIL" | typeof SG5_PREPARATION_STATUS;
  executionMode: ProbeExecutionMode;
  requiredColdContexts: "2";
  passedColdContexts: string;
  blockerClassification: BlockerClassification;
  failureClassification: FailureClassification;
  excludedMockContexts: string;
  dynamicAssetOriginsResolved: boolean;
  publicKeyAssetOriginCommitted: boolean;
  crsAssetOriginCommitted: boolean;
  crsAssetRequired: boolean;
  contexts: SanitizedProbeResult[];
}

export interface HarnessObservationCounters {
  console: number;
  page: number;
  unhandled: number;
  forbiddenNetwork: number;
  authority: number;
}

const RESULT_KEYS = [
  "schema",
  "protocolVersion",
  "status",
  "executionMode",
  "adapterClassification",
  "blockerClassification",
  "failureClassification",
  "browserEngine",
  "browserVersion",
  "userAgentClassification",
  "chainId",
  "sdkPackage",
  "sdkVersion",
  "reactSdkPackage",
  "reactSdkVersion",
  "wasmRuntimeInitialized",
  "wasmProofMechanism",
  "wasmInstantiationCount",
  "wasmCriticalSections",
  "sdkInstanceCreated",
  "publicKeyRetrieved",
  "publicKeySourceClassification",
  "encryptedInputBuilderCreated",
  "encryptedWidth",
  "plaintextClassification",
  "encryptionCompleted",
  "encryptedPayloadCount",
  "encryptedPayloadNonempty",
  "inputProofPresent",
  "forbiddenMaterialRetained",
  "walletRequested",
  "accountAuthorizationRequested",
  "signatureRequested",
  "transactionSubmitted",
  "consoleErrorCount",
  "pageErrorCount",
  "unhandledRejectionCount",
  "forbiddenNetworkRequestCount",
  "durationMilliseconds",
  "networkObservations",
  "finalVerdict",
] as const;

const AGGREGATE_KEYS = [
  "schema",
  "protocolVersion",
  "status",
  "executionMode",
  "requiredColdContexts",
  "passedColdContexts",
  "blockerClassification",
  "failureClassification",
  "excludedMockContexts",
  "dynamicAssetOriginsResolved",
  "publicKeyAssetOriginCommitted",
  "crsAssetOriginCommitted",
  "crsAssetRequired",
  "contexts",
] as const;

const NETWORK_KEYS = [
  "originClassification",
  "requestCategory",
  "statusCategory",
  "durationMilliseconds",
  "redirectClassification",
  "success",
] as const;
const WASM_SECTION_KEYS = [
  "criticalSectionClassification",
  "successfulInstantiateCount",
  "successfulInstantiateStreamingCount",
  "failedCallCount",
] as const;
const DECIMAL = /^(0|[1-9][0-9]*)$/u;

function nonnegativeInteger(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("unsafe probe counter");
  return String(value);
}

function assertDecimal(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(`invalid decimal-string field: ${field}`);
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`invalid ${field}`);
}

function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`invalid boolean field: ${field}`);
}

function assertExactKeys(value: object, expected: readonly string[], field: string): void {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")) throw new Error(`${field} contains symbol properties`);
  const strings = keys as string[];
  if (strings.length !== expected.length || !expected.every((key) => strings.includes(key))) {
    throw new Error(`${field} fields drifted`);
  }
}

function assertSafeObjectGraph(value: unknown, path = "$", seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value !== "object") throw new Error(`${path} contains a forbidden value type`);
  if (seen.has(value)) throw new Error(`${path} contains a cycle`);
  seen.add(value);

  if (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof Error ||
    value instanceof Promise ||
    (typeof Node !== "undefined" && value instanceof Node)
  ) {
    throw new Error(`${path} contains a forbidden object type`);
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error(`${path} has an unexpected array prototype`);
    const indexedKeys = Reflect.ownKeys(value).filter((key) => key !== "length");
    if (indexedKeys.length !== value.length) throw new Error(`${path} contains an implicit or missing array entry`);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") throw new Error(`${path} contains a symbol property`);
      if (key === "length") continue;
      if (!/^(0|[1-9][0-9]*)$/u.test(key)) throw new Error(`${path} contains an array property`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(`${path} contains an unsafe array descriptor`);
      }
      assertSafeObjectGraph(descriptor.value, `${path}[${key}]`, seen);
    }
    seen.delete(value);
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype) throw new Error(`${path} must be a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") throw new Error(`${path} contains a symbol property`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${path}.${key} contains an accessor or non-enumerable property`);
    }
    assertSafeObjectGraph(descriptor.value, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function capabilityComplete(result: Record<string, unknown>): boolean {
  return (
    result.wasmRuntimeInitialized === true &&
    result.wasmInstantiationCount !== "0" &&
    result.sdkInstanceCreated === true &&
    result.publicKeyRetrieved === true &&
    result.encryptedInputBuilderCreated === true &&
    result.encryptionCompleted === true &&
    result.encryptedPayloadCount === "1" &&
    result.encryptedPayloadNonempty === true &&
    result.inputProofPresent === true
  );
}

function errorFree(result: Record<string, unknown>): boolean {
  return (
    result.consoleErrorCount === "0" &&
    result.pageErrorCount === "0" &&
    result.unhandledRejectionCount === "0" &&
    result.forbiddenNetworkRequestCount === "0" &&
    result.forbiddenMaterialRetained === false &&
    result.walletRequested === false &&
    result.accountAuthorizationRequested === false &&
    result.signatureRequested === false &&
    result.transactionSubmitted === false
  );
}

function successfulRequiredObservation(
  entry: SafeNetworkObservation,
  originClassification: OriginClassification,
  requestCategory: RequestCategory,
): boolean {
  return (
    entry.originClassification === originClassification &&
    entry.requestCategory === requestCategory &&
    entry.statusCategory === "SUCCESS_2XX" &&
    entry.success === true &&
    entry.redirectClassification !== "FORBIDDEN"
  );
}

export function hasRequiredNetworkProof(
  result: SanitizedProbeResult,
  authority: Readonly<AssetOriginAuthority>,
): boolean {
  if (
    !authority.dynamicAssetOriginsResolved ||
    authority.publicKeyAssetOrigin === null ||
    authority.publicKeyAssetPathPrefix === null ||
    (authority.crsAssetRequired && (authority.crsAssetOrigin === null || authority.crsAssetPathPrefix === null)) ||
    result.networkObservations.some(
      (entry) =>
        entry.redirectClassification === "FORBIDDEN" ||
        (entry.statusCategory === "REDIRECT_3XX" && entry.success === false) ||
        (entry.requestCategory !== "LOCAL_FRONTEND_ASSET" && entry.success === false),
    )
  ) {
    return false;
  }
  const required: Array<[OriginClassification, RequestCategory]> = [
    ["OFFICIAL_RELAYER", "RELAYER_KEYURL_METADATA"],
    ["OFFICIAL_PUBLIC_KEY_ASSET", "PUBLIC_KEY_ASSET"],
    ["OFFICIAL_CHAIN_RPC", "SEPOLIA_RPC"],
  ];
  if (authority.crsAssetRequired) required.push(["OFFICIAL_CRS_ASSET", "CRS_ASSET"]);
  return required.every(([origin, category]) =>
    result.networkObservations.some((entry) => successfulRequiredObservation(entry, origin, category)),
  );
}

export function sanitizeObservation(
  observation: SafeProbeObservation,
  executionMode: ProbeExecutionMode,
  userAgent: string,
): SanitizedProbeResult {
  const real = observation.adapterClassification === "REAL_INSTALLED_SDK";
  const complete =
    observation.browserEnvironmentValidated &&
    observation.wasmRuntimeInitialized &&
    observation.wasmInstantiationCount > 0 &&
    observation.sdkInstanceCreated &&
    observation.publicKeyRetrieved &&
    observation.encryptedInputBuilderCreated &&
    observation.encryptionCompleted &&
    observation.encryptedPayloadCount === 1 &&
    observation.encryptedPayloadNonempty &&
    observation.inputProofPresent;
  const structural = executionMode === "OFFLINE_STRUCTURAL" && !real;
  const mockLive = executionMode === "LIVE_SEPOLIA" && !real;
  const completedLive = executionMode === "LIVE_SEPOLIA" && real && complete;
  const blockedLive = completedLive && !SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED;
  const chromium = /Chrom(?:e|ium)\//u.test(userAgent);
  const status: ProbeStatus = structural
    ? "STRUCTURAL_PASS_NOT_LIVE"
    : blockedLive
      ? "BLOCKED"
      : completedLive
        ? "CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT"
        : "FAIL";
  const blockerClassification: BlockerClassification = blockedLive ? "DYNAMIC_ASSET_ORIGINS_UNRESOLVED" : "NONE";
  const failureClassification: FailureClassification =
    status === "FAIL" ? (mockLive ? "MOCK_ADAPTER_IN_LIVE_MODE" : "CAPABILITY_INCOMPLETE") : "NONE";

  const result: SanitizedProbeResult = {
    schema: "zama-szn4.sg5-browser-probe-result.v1",
    protocolVersion: SG5_PROTOCOL_VERSION,
    status,
    executionMode,
    adapterClassification: observation.adapterClassification,
    blockerClassification,
    failureClassification,
    browserEngine: chromium ? "CHROMIUM_FAMILY" : "UNKNOWN_BROWSER",
    browserVersion: "RECORDED_BY_PLAYWRIGHT",
    userAgentClassification: chromium ? "CHROMIUM_FAMILY" : "OTHER_BROWSER_FAMILY",
    chainId: "11155111",
    sdkPackage: "@zama-fhe/sdk",
    sdkVersion: "3.4.0",
    reactSdkPackage: "@zama-fhe/react-sdk",
    reactSdkVersion: "3.4.0",
    wasmRuntimeInitialized: observation.wasmRuntimeInitialized,
    wasmProofMechanism: "ATTRIBUTED_SUCCESSFUL_WASM_INSTANTIATION_AND_REAL_SDK_ENCRYPTION",
    wasmInstantiationCount: nonnegativeInteger(observation.wasmInstantiationCount),
    wasmCriticalSections: observation.wasmCriticalSections.map((section) => ({
      criticalSectionClassification: section.criticalSectionClassification,
      successfulInstantiateCount: nonnegativeInteger(section.successfulInstantiateCount),
      successfulInstantiateStreamingCount: nonnegativeInteger(section.successfulInstantiateStreamingCount),
      failedCallCount: nonnegativeInteger(section.failedCallCount),
    })),
    sdkInstanceCreated: observation.sdkInstanceCreated,
    publicKeyRetrieved: observation.publicKeyRetrieved,
    publicKeySourceClassification: "INSTALLED_SEPOLIA_RELAYER_CONFIGURATION",
    encryptedInputBuilderCreated: observation.encryptedInputBuilderCreated,
    encryptedWidth: "euint64",
    plaintextClassification: "FIXED_TEST_VALUE_ONE",
    encryptionCompleted: observation.encryptionCompleted,
    encryptedPayloadCount: nonnegativeInteger(observation.encryptedPayloadCount),
    encryptedPayloadNonempty: observation.encryptedPayloadNonempty,
    inputProofPresent: observation.inputProofPresent,
    forbiddenMaterialRetained: false,
    walletRequested: false,
    accountAuthorizationRequested: false,
    signatureRequested: false,
    transactionSubmitted: false,
    consoleErrorCount: "0",
    pageErrorCount: "0",
    unhandledRejectionCount: "0",
    forbiddenNetworkRequestCount: "0",
    durationMilliseconds: nonnegativeInteger(observation.durationMilliseconds),
    networkObservations: [],
    finalVerdict: structural
      ? "NOT_LIVE"
      : blockedLive
        ? "BLOCKED"
        : completedLive
          ? "AWAITING_PLAYWRIGHT_HARNESS_VERDICT"
          : "FAIL",
  };
  assertSanitizedResult(result);
  return result;
}

export function assertSanitizedResult(value: unknown): asserts value is SanitizedProbeResult {
  assertSafeObjectGraph(value);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("result must be an object");
  assertExactKeys(value, RESULT_KEYS, "sanitized SG-5 result");
  const result = value as Record<string, unknown>;

  const exact: Record<string, string> = {
    schema: "zama-szn4.sg5-browser-probe-result.v1",
    protocolVersion: SG5_PROTOCOL_VERSION,
    browserVersion: "RECORDED_BY_PLAYWRIGHT",
    chainId: "11155111",
    sdkPackage: "@zama-fhe/sdk",
    sdkVersion: "3.4.0",
    reactSdkPackage: "@zama-fhe/react-sdk",
    reactSdkVersion: "3.4.0",
    wasmProofMechanism: "ATTRIBUTED_SUCCESSFUL_WASM_INSTANTIATION_AND_REAL_SDK_ENCRYPTION",
    publicKeySourceClassification: "INSTALLED_SEPOLIA_RELAYER_CONFIGURATION",
    encryptedWidth: "euint64",
    plaintextClassification: "FIXED_TEST_VALUE_ONE",
  };
  for (const [key, expected] of Object.entries(exact)) if (result[key] !== expected) throw new Error(`invalid ${key}`);
  assertEnum(
    result.status,
    ["STRUCTURAL_PASS_NOT_LIVE", "CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT", "BLOCKED", "FAIL"],
    "status",
  );
  assertEnum(result.executionMode, ["OFFLINE_STRUCTURAL", "LIVE_SEPOLIA"], "executionMode");
  assertEnum(result.adapterClassification, ["REAL_INSTALLED_SDK", "CONTROLLED_TEST_FAKE"], "adapterClassification");
  assertEnum(
    result.blockerClassification,
    ["NONE", "BROWSER_UNAVAILABLE", "DYNAMIC_ASSET_ORIGINS_UNRESOLVED", "WASM_PROOF_UNAVAILABLE"],
    "blockerClassification",
  );
  assertEnum(
    result.failureClassification,
    [
      "NONE",
      "CAPABILITY_INCOMPLETE",
      "MOCK_ADAPTER_IN_LIVE_MODE",
      "BROWSER_ERROR",
      "CONSOLE_ERROR",
      "UNHANDLED_REJECTION",
      "FORBIDDEN_ORIGIN",
      "FORBIDDEN_AUTHORITY_ACTION",
      "FORBIDDEN_MATERIAL",
    ],
    "failureClassification",
  );
  assertEnum(result.browserEngine, ["CHROMIUM_FAMILY", "UNKNOWN_BROWSER"], "browserEngine");
  assertEnum(result.userAgentClassification, ["CHROMIUM_FAMILY", "OTHER_BROWSER_FAMILY"], "userAgentClassification");
  assertEnum(
    result.finalVerdict,
    ["NOT_LIVE", "AWAITING_PLAYWRIGHT_HARNESS_VERDICT", "BLOCKED", "FAIL"],
    "finalVerdict",
  );
  for (const key of [
    "wasmRuntimeInitialized",
    "sdkInstanceCreated",
    "publicKeyRetrieved",
    "encryptedInputBuilderCreated",
    "encryptionCompleted",
    "encryptedPayloadNonempty",
    "inputProofPresent",
    "forbiddenMaterialRetained",
    "walletRequested",
    "accountAuthorizationRequested",
    "signatureRequested",
    "transactionSubmitted",
  ])
    assertBoolean(result[key], key);
  for (const key of [
    "wasmInstantiationCount",
    "encryptedPayloadCount",
    "consoleErrorCount",
    "pageErrorCount",
    "unhandledRejectionCount",
    "forbiddenNetworkRequestCount",
    "durationMilliseconds",
  ])
    assertDecimal(result[key], key);

  if (!Array.isArray(result.wasmCriticalSections) || result.wasmCriticalSections.length !== 2) {
    throw new Error("wasmCriticalSections must contain the two registered SDK sections");
  }
  const sectionNames = new Set<WasmCriticalSectionClassification>();
  for (const section of result.wasmCriticalSections) {
    if (section === null || typeof section !== "object" || Array.isArray(section)) {
      throw new Error("invalid WASM critical section");
    }
    assertExactKeys(section, WASM_SECTION_KEYS, "WASM critical section");
    const record = section as Record<string, unknown>;
    assertEnum(
      record.criticalSectionClassification,
      ["SDK_INITIALIZATION", "SDK_ENCRYPTION"],
      "WASM critical section classification",
    );
    if (sectionNames.has(record.criticalSectionClassification)) throw new Error("duplicate WASM critical section");
    sectionNames.add(record.criticalSectionClassification);
    assertDecimal(record.successfulInstantiateCount, "successfulInstantiateCount");
    assertDecimal(record.successfulInstantiateStreamingCount, "successfulInstantiateStreamingCount");
    assertDecimal(record.failedCallCount, "failedCallCount");
  }

  if (!Array.isArray(result.networkObservations)) throw new Error("networkObservations must be an array");
  if (result.networkObservations.length > 256) throw new Error("networkObservations exceeds the closed maximum");
  for (const observation of result.networkObservations) {
    if (observation === null || typeof observation !== "object" || Array.isArray(observation)) {
      throw new Error("invalid network observation");
    }
    assertExactKeys(observation, NETWORK_KEYS, "network observation");
    const record = observation as Record<string, unknown>;
    assertEnum(
      record.originClassification,
      ["LOCALHOST", "OFFICIAL_RELAYER", "OFFICIAL_CHAIN_RPC", "OFFICIAL_PUBLIC_KEY_ASSET", "OFFICIAL_CRS_ASSET"],
      "origin",
    );
    assertEnum(
      record.requestCategory,
      ["LOCAL_FRONTEND_ASSET", "SEPOLIA_RPC", "RELAYER_KEYURL_METADATA", "PUBLIC_KEY_ASSET", "CRS_ASSET"],
      "request category",
    );
    assertEnum(
      record.statusCategory,
      ["SUCCESS_2XX", "REDIRECT_3XX", "CLIENT_ERROR_4XX", "SERVER_ERROR_5XX", "NETWORK_FAILURE"],
      "status category",
    );
    assertDecimal(record.durationMilliseconds, "network duration");
    assertEnum(
      record.redirectClassification,
      ["NONE", "ALLOWED_SAME_ORIGIN", "ALLOWED_REGISTERED_ORIGIN", "FORBIDDEN"],
      "redirect classification",
    );
    assertBoolean(record.success, "network observation success");
    const permittedRedirect = ["ALLOWED_SAME_ORIGIN", "ALLOWED_REGISTERED_ORIGIN"].includes(
      record.redirectClassification as string,
    );
    const consistent =
      (record.statusCategory === "SUCCESS_2XX" &&
        record.success === true &&
        record.redirectClassification !== "FORBIDDEN") ||
      (record.statusCategory === "REDIRECT_3XX" && record.success === permittedRedirect) ||
      (["CLIENT_ERROR_4XX", "SERVER_ERROR_5XX", "NETWORK_FAILURE"].includes(record.statusCategory as string) &&
        record.success === false &&
        record.redirectClassification !== "FORBIDDEN");
    if (!consistent) {
      throw new Error("network status and success fields disagree");
    }
    const categoryMatchesOrigin =
      (record.originClassification === "LOCALHOST" && record.requestCategory === "LOCAL_FRONTEND_ASSET") ||
      (record.originClassification === "OFFICIAL_RELAYER" && record.requestCategory === "RELAYER_KEYURL_METADATA") ||
      (record.originClassification === "OFFICIAL_CHAIN_RPC" && record.requestCategory === "SEPOLIA_RPC") ||
      (record.originClassification === "OFFICIAL_PUBLIC_KEY_ASSET" && record.requestCategory === "PUBLIC_KEY_ASSET") ||
      (record.originClassification === "OFFICIAL_CRS_ASSET" && record.requestCategory === "CRS_ASSET");
    if (!categoryMatchesOrigin) throw new Error("network origin and request category disagree");
  }

  const complete = capabilityComplete(result);
  const safe = errorFree(result);
  const wasmSuccessfulCalls = (result.wasmCriticalSections as SanitizedProbeResult["wasmCriticalSections"]).reduce(
    (total, section) =>
      total + BigInt(section.successfulInstantiateCount) + BigInt(section.successfulInstantiateStreamingCount),
    0n,
  );
  const wasmFailedCalls = (result.wasmCriticalSections as SanitizedProbeResult["wasmCriticalSections"]).reduce(
    (total, section) => total + BigInt(section.failedCallCount),
    0n,
  );
  if (wasmSuccessfulCalls !== BigInt(result.wasmInstantiationCount as string)) {
    throw new Error("WASM aggregate count disagrees with critical-section counts");
  }
  if (result.status !== "FAIL" && wasmFailedCalls !== 0n) {
    throw new Error("non-failure result contains a failed WASM call");
  }
  if (result.status === "STRUCTURAL_PASS_NOT_LIVE") {
    if (
      result.executionMode !== "OFFLINE_STRUCTURAL" ||
      result.adapterClassification !== "CONTROLLED_TEST_FAKE" ||
      result.finalVerdict !== "NOT_LIVE" ||
      result.blockerClassification !== "NONE" ||
      result.failureClassification !== "NONE" ||
      result.publicKeyRetrieved !== false ||
      result.encryptionCompleted !== false ||
      !safe
    )
      throw new Error("contradictory structural result");
  } else if (result.status === "CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT") {
    if (
      result.executionMode !== "LIVE_SEPOLIA" ||
      result.adapterClassification !== "REAL_INSTALLED_SDK" ||
      result.finalVerdict !== "AWAITING_PLAYWRIGHT_HARNESS_VERDICT" ||
      result.blockerClassification !== "NONE" ||
      result.failureClassification !== "NONE" ||
      !complete ||
      !safe
    )
      throw new Error("contradictory live capability result");
  } else if (result.status === "BLOCKED") {
    if (
      result.blockerClassification === "NONE" ||
      result.failureClassification !== "NONE" ||
      result.finalVerdict !== "BLOCKED"
    )
      throw new Error("contradictory blocked result");
  } else if (
    result.failureClassification === "NONE" ||
    result.blockerClassification !== "NONE" ||
    result.finalVerdict !== "FAIL"
  ) {
    throw new Error("contradictory failure result");
  }
  if (
    result.executionMode === "LIVE_SEPOLIA" &&
    result.adapterClassification !== "REAL_INSTALLED_SDK" &&
    result.status !== "FAIL"
  )
    throw new Error("mock cannot produce live success");
  if (result.encryptionCompleted && (!result.sdkInstanceCreated || !result.encryptedInputBuilderCreated))
    throw new Error("encryption dependencies are incomplete");
  if (result.inputProofPresent && !result.encryptionCompleted) throw new Error("proof without encryption");
  if (result.adapterClassification === "CONTROLLED_TEST_FAKE" && result.publicKeyRetrieved)
    throw new Error("mock public-key retrieval is forbidden");
  if (result.status !== "FAIL" && !safe) throw new Error("non-failure state contains an error or authority action");
  if (result.status === "BLOCKED" && !complete && result.blockerClassification === "DYNAMIC_ASSET_ORIGINS_UNRESOLVED")
    throw new Error("dynamic-origin blocker requires an otherwise complete live capability");
  if (result.status === "FAIL") {
    const reasonMatches =
      (result.failureClassification === "CAPABILITY_INCOMPLETE" && !complete) ||
      (result.failureClassification === "MOCK_ADAPTER_IN_LIVE_MODE" &&
        result.executionMode === "LIVE_SEPOLIA" &&
        result.adapterClassification === "CONTROLLED_TEST_FAKE") ||
      (result.failureClassification === "BROWSER_ERROR" && result.pageErrorCount !== "0") ||
      (result.failureClassification === "CONSOLE_ERROR" && result.consoleErrorCount !== "0") ||
      (result.failureClassification === "UNHANDLED_REJECTION" && result.unhandledRejectionCount !== "0") ||
      (result.failureClassification === "FORBIDDEN_ORIGIN" && result.forbiddenNetworkRequestCount !== "0") ||
      (result.failureClassification === "FORBIDDEN_AUTHORITY_ACTION" &&
        (result.walletRequested ||
          result.accountAuthorizationRequested ||
          result.signatureRequested ||
          result.transactionSubmitted)) ||
      (result.failureClassification === "FORBIDDEN_MATERIAL" && result.forbiddenMaterialRetained);
    if (!reasonMatches) throw new Error("failure classification does not match observed failure");
  }
}

function assertSanitizedAggregateResultWithAuthority(
  value: unknown,
  authority: Readonly<AssetOriginAuthority>,
): asserts value is SanitizedAggregateResult {
  assertSafeObjectGraph(value);
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("aggregate must be an object");
  assertExactKeys(value, AGGREGATE_KEYS, "aggregate SG-5 result");
  const result = value as Record<string, unknown>;
  if (result.schema !== "zama-szn4.sg5-browser-probe-aggregate.v1" || result.protocolVersion !== SG5_PROTOCOL_VERSION)
    throw new Error("invalid aggregate identity");
  assertEnum(result.status, ["PASS", "BLOCKED", "FAIL", SG5_PREPARATION_STATUS], "aggregate status");
  assertEnum(result.executionMode, ["OFFLINE_STRUCTURAL", "LIVE_SEPOLIA"], "aggregate executionMode");
  assertEnum(
    result.blockerClassification,
    ["NONE", "BROWSER_UNAVAILABLE", "DYNAMIC_ASSET_ORIGINS_UNRESOLVED", "WASM_PROOF_UNAVAILABLE"],
    "aggregate blocker",
  );
  assertEnum(
    result.failureClassification,
    [
      "NONE",
      "CAPABILITY_INCOMPLETE",
      "MOCK_ADAPTER_IN_LIVE_MODE",
      "BROWSER_ERROR",
      "CONSOLE_ERROR",
      "UNHANDLED_REJECTION",
      "FORBIDDEN_ORIGIN",
      "FORBIDDEN_AUTHORITY_ACTION",
      "FORBIDDEN_MATERIAL",
    ],
    "aggregate failure",
  );
  if (result.requiredColdContexts !== "2") throw new Error("aggregate cold-context requirement drifted");
  assertDecimal(result.passedColdContexts, "passedColdContexts");
  assertDecimal(result.excludedMockContexts, "excludedMockContexts");
  for (const key of [
    "dynamicAssetOriginsResolved",
    "publicKeyAssetOriginCommitted",
    "crsAssetOriginCommitted",
    "crsAssetRequired",
  ]) {
    assertBoolean(result[key], key);
  }
  const authorityResolved =
    authority.dynamicAssetOriginsResolved &&
    authority.publicKeyAssetOrigin !== null &&
    authority.publicKeyAssetPathPrefix !== null &&
    (!authority.crsAssetRequired || (authority.crsAssetOrigin !== null && authority.crsAssetPathPrefix !== null));
  if (
    result.dynamicAssetOriginsResolved !== authority.dynamicAssetOriginsResolved ||
    result.publicKeyAssetOriginCommitted !==
      (authority.publicKeyAssetOrigin !== null && authority.publicKeyAssetPathPrefix !== null) ||
    result.crsAssetOriginCommitted !== (authority.crsAssetOrigin !== null && authority.crsAssetPathPrefix !== null) ||
    result.crsAssetRequired !== authority.crsAssetRequired
  ) {
    throw new Error("aggregate asset-origin authority disagrees with committed policy");
  }
  if (!Array.isArray(result.contexts)) throw new Error("aggregate contexts must be an array");
  if (result.contexts.length > 2) throw new Error("aggregate context count exceeds the closed requirement");
  for (const context of result.contexts) assertSanitizedResult(context);

  const contexts = result.contexts as SanitizedProbeResult[];
  const passing = contexts.filter(
    (context) =>
      context.executionMode === "LIVE_SEPOLIA" &&
      context.adapterClassification === "REAL_INSTALLED_SDK" &&
      context.status === "CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT" &&
      context.browserEngine === "CHROMIUM_FAMILY" &&
      capabilityComplete(context as unknown as Record<string, unknown>) &&
      errorFree(context as unknown as Record<string, unknown>) &&
      hasRequiredNetworkProof(context, authority),
  ).length;
  if (result.passedColdContexts !== String(passing)) throw new Error("aggregate passing-context count mismatch");
  const mocks = contexts.filter((context) => context.adapterClassification === "CONTROLLED_TEST_FAKE").length;
  if (result.excludedMockContexts !== String(mocks)) throw new Error("aggregate mock-context count mismatch");
  if (result.status === "PASS") {
    if (
      result.executionMode !== "LIVE_SEPOLIA" ||
      contexts.length !== 2 ||
      passing !== 2 ||
      mocks !== 0 ||
      !authorityResolved ||
      result.dynamicAssetOriginsResolved !== true ||
      result.publicKeyAssetOriginCommitted !== true ||
      (result.crsAssetRequired && result.crsAssetOriginCommitted !== true) ||
      result.blockerClassification !== "NONE" ||
      result.failureClassification !== "NONE"
    )
      throw new Error("contradictory PASS aggregate");
  } else if (result.status === "BLOCKED") {
    if (result.blockerClassification === "NONE" || result.failureClassification !== "NONE")
      throw new Error("contradictory BLOCKED aggregate");
  } else if (result.status === "FAIL") {
    if (result.failureClassification === "NONE" || result.blockerClassification !== "NONE")
      throw new Error("contradictory FAIL aggregate");
  } else if (
    result.executionMode !== "OFFLINE_STRUCTURAL" ||
    result.blockerClassification !== "DYNAMIC_ASSET_ORIGINS_UNRESOLVED" ||
    result.failureClassification !== "NONE" ||
    contexts.length !== 0
  ) {
    throw new Error("contradictory PREPARED aggregate");
  }
}

export function assertSanitizedAggregateResult(value: unknown): asserts value is SanitizedAggregateResult {
  assertSanitizedAggregateResultWithAuthority(value, SG5_ASSET_ORIGIN_AUTHORITY);
}

/** Unit-test-only authority injection exercises the same logic without weakening the live validator. */
export function assertSanitizedAggregateResultForTestAuthority(
  value: unknown,
  authority: Readonly<AssetOriginAuthority>,
): asserts value is SanitizedAggregateResult {
  if (process.env.NODE_ENV !== "test") throw new Error("test authority injection is unavailable outside unit tests");
  assertSanitizedAggregateResultWithAuthority(value, authority);
}

export function attachHarnessObservations(
  source: SanitizedProbeResult,
  observations: readonly SafeNetworkObservation[],
  counters: HarnessObservationCounters,
): SanitizedProbeResult {
  assertSanitizedResult(source);
  for (const observation of observations) {
    assertSafeObjectGraph(observation);
    if (observation === null || typeof observation !== "object" || Array.isArray(observation)) {
      throw new Error("invalid network observation input");
    }
    assertExactKeys(observation, NETWORK_KEYS, "network observation input");
  }
  for (const value of Object.values(counters)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("unsafe harness counter");
  }
  const hasAuthority = counters.authority > 0;
  const failureClassification: FailureClassification = hasAuthority
    ? "FORBIDDEN_AUTHORITY_ACTION"
    : counters.forbiddenNetwork > 0
      ? "FORBIDDEN_ORIGIN"
      : counters.unhandled > 0
        ? "UNHANDLED_REJECTION"
        : counters.page > 0
          ? "BROWSER_ERROR"
          : counters.console > 0
            ? "CONSOLE_ERROR"
            : source.failureClassification;
  const failed = failureClassification !== "NONE";
  const result: SanitizedProbeResult = {
    ...source,
    status: failed ? "FAIL" : source.status,
    blockerClassification: failed ? "NONE" : source.blockerClassification,
    failureClassification,
    walletRequested: hasAuthority,
    accountAuthorizationRequested: hasAuthority,
    signatureRequested: hasAuthority,
    transactionSubmitted: hasAuthority,
    consoleErrorCount: nonnegativeInteger(counters.console),
    pageErrorCount: nonnegativeInteger(counters.page),
    unhandledRejectionCount: nonnegativeInteger(counters.unhandled),
    forbiddenNetworkRequestCount: nonnegativeInteger(counters.forbiddenNetwork),
    networkObservations: observations.map((observation) => ({ ...observation })),
    finalVerdict: failed ? "FAIL" : source.finalVerdict,
  };
  assertSanitizedResult(result);
  return result;
}

export function controlledStructuralObservation(): SafeProbeObservation {
  return {
    adapterClassification: "CONTROLLED_TEST_FAKE",
    browserEnvironmentValidated: true,
    wasmInstantiationCount: 0,
    wasmCriticalSections: [
      {
        criticalSectionClassification: "SDK_INITIALIZATION",
        successfulInstantiateCount: 0,
        successfulInstantiateStreamingCount: 0,
        failedCallCount: 0,
      },
      {
        criticalSectionClassification: "SDK_ENCRYPTION",
        successfulInstantiateCount: 0,
        successfulInstantiateStreamingCount: 0,
        failedCallCount: 0,
      },
    ],
    wasmRuntimeInitialized: false,
    sdkInstanceCreated: false,
    publicKeyRetrieved: false,
    encryptedInputBuilderCreated: false,
    encryptionCompleted: false,
    encryptedPayloadCount: 0,
    encryptedPayloadNonempty: false,
    inputProofPresent: false,
    durationMilliseconds: 0,
  };
}

export function statusCategory(status: number): StatusCategory {
  if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error("invalid HTTP status");
  if (status < 300) return "SUCCESS_2XX";
  if (status < 400) return "REDIRECT_3XX";
  if (status < 500) return "CLIENT_ERROR_4XX";
  return "SERVER_ERROR_5XX";
}

function networkDuration(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid network observation duration");
  return String(value);
}

function rawAuthority(urlText: string): string {
  const match = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/u.exec(urlText);
  if (!match) throw new Error("URL lacks a canonical authority");
  return match[1];
}

function assertAssetOriginAuthority(authority: Readonly<AssetOriginAuthority>): void {
  const exactOrigin = (value: string | null, field: string): void => {
    if (value === null) return;
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.origin !== value
    ) {
      throw new Error(`invalid committed ${field}`);
    }
  };
  exactOrigin(authority.publicKeyAssetOrigin, "public-key asset origin");
  exactOrigin(authority.crsAssetOrigin, "CRS asset origin");
  for (const [value, field] of [
    [authority.publicKeyAssetPathPrefix, "public-key asset path"],
    [authority.crsAssetPathPrefix, "CRS asset path"],
  ] as const) {
    if (value !== null && (!value.startsWith("/") || value.includes("?") || value.includes("#"))) {
      throw new Error(`invalid committed ${field}`);
    }
  }
  if (
    authority.dynamicAssetOriginsResolved !==
    (authority.publicKeyAssetOrigin !== null &&
      authority.publicKeyAssetPathPrefix !== null &&
      (!authority.crsAssetRequired || (authority.crsAssetOrigin !== null && authority.crsAssetPathPrefix !== null)))
  ) {
    throw new Error("asset origin resolution flag disagrees with committed origins");
  }
}

function pathHasRegisteredPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

export function classifyNetworkUrl(
  urlText: string,
  authority: Readonly<AssetOriginAuthority> = SG5_ASSET_ORIGIN_AUTHORITY,
): {
  originClassification: OriginClassification;
  requestCategory: RequestCategory;
} {
  assertAssetOriginAuthority(authority);
  if (typeof urlText !== "string" || urlText.length > 2048) throw new Error("invalid network URL");
  const url = new URL(urlText);
  if (url.username || url.password) throw new Error("URL credentials are forbidden");
  if (url.hash) throw new Error("URL fragments are forbidden");
  const rawUrlAuthority = rawAuthority(urlText);
  if (rawUrlAuthority.includes("@")) throw new Error("URL user-info is forbidden");
  const registeredAuthorities = [
    "localhost:3000",
    "relayer.testnet.zama.org",
    "ethereum-sepolia-rpc.publicnode.com",
    ...(authority.publicKeyAssetOrigin === null ? [] : [new URL(authority.publicKeyAssetOrigin).host]),
    ...(authority.crsAssetOrigin === null ? [] : [new URL(authority.crsAssetOrigin).host]),
  ];
  if (!registeredAuthorities.includes(rawUrlAuthority))
    throw new Error("URL authority is not an exact canonical registered authority");
  if (url.protocol !== "https:" && url.origin !== SG5_ORIGINS.localhost) throw new Error("unsupported URL scheme");
  if (url.origin === SG5_ORIGINS.localhost ? url.port !== "3000" : url.port !== "") {
    throw new Error("nonstandard ports are forbidden");
  }
  if (/:443$/u.test(rawUrlAuthority) || /:80$/u.test(rawUrlAuthority))
    throw new Error("explicit default ports are forbidden");

  if (url.origin === SG5_ORIGINS.localhost) {
    return { originClassification: "LOCALHOST", requestCategory: "LOCAL_FRONTEND_ASSET" };
  }
  if (url.origin === SG5_ORIGINS.relayer) {
    if (url.pathname !== "/v2/keyurl" || url.search) throw new Error("unregistered relayer request category");
    return { originClassification: "OFFICIAL_RELAYER", requestCategory: "RELAYER_KEYURL_METADATA" };
  }
  if (url.origin === SG5_ORIGINS.chainRpc) {
    if (url.pathname !== "/" || url.search) throw new Error("unregistered Sepolia RPC path");
    return { originClassification: "OFFICIAL_CHAIN_RPC", requestCategory: "SEPOLIA_RPC" };
  }
  if (
    authority.publicKeyAssetOrigin !== null &&
    authority.publicKeyAssetPathPrefix !== null &&
    url.origin === authority.publicKeyAssetOrigin
  ) {
    if (url.search || !pathHasRegisteredPrefix(url.pathname, authority.publicKeyAssetPathPrefix)) {
      throw new Error("unregistered public-key asset path");
    }
    return { originClassification: "OFFICIAL_PUBLIC_KEY_ASSET", requestCategory: "PUBLIC_KEY_ASSET" };
  }
  if (
    authority.crsAssetOrigin !== null &&
    authority.crsAssetPathPrefix !== null &&
    url.origin === authority.crsAssetOrigin
  ) {
    if (url.search || !pathHasRegisteredPrefix(url.pathname, authority.crsAssetPathPrefix)) {
      throw new Error("unregistered CRS asset path");
    }
    return { originClassification: "OFFICIAL_CRS_ASSET", requestCategory: "CRS_ASSET" };
  }
  throw new Error("forbidden network origin");
}

export function classifyRedirect(
  sourceUrl: string,
  targetUrl: string,
  authority: Readonly<AssetOriginAuthority> = SG5_ASSET_ORIGIN_AUTHORITY,
): RedirectClassification {
  const source = classifyNetworkUrl(sourceUrl, authority);
  const target = classifyNetworkUrl(targetUrl, authority);
  if (source.originClassification === target.originClassification) return "ALLOWED_SAME_ORIGIN";
  return "ALLOWED_REGISTERED_ORIGIN";
}

export function buildResponseNetworkObservation(
  input: Readonly<NetworkResponseObservationInput>,
  authority: Readonly<AssetOriginAuthority> = SG5_ASSET_ORIGIN_AUTHORITY,
): SafeNetworkObservation {
  const classification = classifyNetworkUrl(input.requestUrl, authority);
  const category = statusCategory(input.status);
  let redirectClassification: RedirectClassification = "NONE";

  if (category === "REDIRECT_3XX") {
    if (input.redirectedFromUrl) throw new Error("a redirect response cannot also be a redirected target response");
    if (input.redirectedToUrl) {
      try {
        redirectClassification = classifyRedirect(input.requestUrl, input.redirectedToUrl, authority);
      } catch {
        redirectClassification = "FORBIDDEN";
      }
    }
  } else {
    if (input.redirectedToUrl) throw new Error("only a 3xx response may declare a redirect target");
    if (input.redirectedFromUrl) {
      try {
        redirectClassification = classifyRedirect(input.redirectedFromUrl, input.requestUrl, authority);
      } catch {
        throw new Error("response redirect provenance is forbidden");
      }
    }
  }

  const success =
    category === "SUCCESS_2XX" ||
    (category === "REDIRECT_3XX" &&
      ["ALLOWED_SAME_ORIGIN", "ALLOWED_REGISTERED_ORIGIN"].includes(redirectClassification));
  const result: SafeNetworkObservation = {
    ...classification,
    statusCategory: category,
    durationMilliseconds: networkDuration(input.durationMilliseconds),
    redirectClassification,
    success,
  };
  assertSafeObjectGraph(result);
  return result;
}

export function buildNetworkFailureObservation(
  requestUrl: string,
  durationMilliseconds: number,
  redirectedFromUrl?: string | null,
  authority: Readonly<AssetOriginAuthority> = SG5_ASSET_ORIGIN_AUTHORITY,
): SafeNetworkObservation {
  const classification = classifyNetworkUrl(requestUrl, authority);
  let redirectClassification: RedirectClassification = "NONE";
  if (redirectedFromUrl) redirectClassification = classifyRedirect(redirectedFromUrl, requestUrl, authority);
  return {
    ...classification,
    statusCategory: "NETWORK_FAILURE",
    durationMilliseconds: networkDuration(durationMilliseconds),
    redirectClassification,
    success: false,
  };
}
