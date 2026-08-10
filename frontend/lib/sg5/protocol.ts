export const SG5_PROTOCOL_VERSION = "sg5-browser-capability-v2" as const;
export const SG5_PREPARATION_STATUS = "PREPARED_LIVE_BROWSER_EXECUTION_REQUIRED" as const;
export const SG5_LIVE_ACK = "I_UNDERSTAND_THIS_CONTACTS_SEPOLIA" as const;
export const SG5_PAGE_ENABLE = "ENABLED_LOCAL_ONLY" as const;
export const SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED = true as const;

export interface AssetOriginAuthority {
  dynamicAssetOriginsResolved: boolean;
  publicKeyAssetOrigin: string | null;
  publicKeyAssetPathPrefix: string | null;
  crsAssetOrigin: string | null;
  crsAssetPathPrefix: string | null;
  crsAssetRequired: boolean;
}

export const SG5_ASSET_ORIGIN_AUTHORITY: Readonly<AssetOriginAuthority> = Object.freeze({
  dynamicAssetOriginsResolved: true,
  publicKeyAssetOrigin: "https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com",
  publicKeyAssetPathPrefix: "/PUB-p1/PublicKey/",
  crsAssetOrigin: "https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com",
  crsAssetPathPrefix: "/PUB-p1/CRS/",
  crsAssetRequired: true,
});

export const SG5_LOCKED = Object.freeze({
  chainId: 11155111,
  gatewayChainId: 10901,
  contractAddress: "0xfc672ca5846896A7A135943E79dd11283c38FE78",
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
  publicKeyAsset: SG5_ASSET_ORIGIN_AUTHORITY.publicKeyAssetOrigin,
  crsAsset: SG5_ASSET_ORIGIN_AUTHORITY.crsAssetOrigin,
});

export function probeRouteEnabled(
  nodeEnvironment: string | undefined,
  pageFlag: string | undefined,
  productionGate = "",
): boolean {
  return pageFlag === SG5_PAGE_ENABLE && (nodeEnvironment !== "production" || productionGate === "1");
}

export function liveModeAcknowledged(value: string | undefined): boolean {
  return value === SG5_LIVE_ACK;
}

export type ProbeExecutionMode = "OFFLINE_STRUCTURAL" | "LIVE_SEPOLIA";
export type ProbeStatus = "STRUCTURAL_PASS_NOT_LIVE" | "CAPABILITY_COMPLETE" | "FAIL";
export type BlockerClassification = "NONE" | "BROWSER_UNAVAILABLE" | "WRONG_NETWORK";
export type FailureClassification =
  | "NONE"
  | "CAPABILITY_INCOMPLETE"
  | "BROWSER_ERROR"
  | "CONSOLE_ERROR"
  | "UNHANDLED_REJECTION"
  | "FORBIDDEN_ORIGIN"
  | "TRANSACTION_FAILED"
  | "DECRYPTION_FAILED"
  | "UNAUTHORIZED_DECRYPTION_ACCEPTED"
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
export type StatusCategory = "SUCCESS_2XX" | "REDIRECT_3XX" | "CLIENT_ERROR_4XX" | "SERVER_ERROR_5XX" | "NETWORK_FAILURE";
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

export type WasmCriticalSectionClassification = "SDK_INITIALIZATION" | "SDK_ENCRYPTION" | "SDK_DECRYPTION";

export interface SafeWasmCriticalSectionObservation {
  criticalSectionClassification: WasmCriticalSectionClassification;
  successfulInstantiateCount: number;
  successfulInstantiateStreamingCount: number;
  failedCallCount: number;
}

export interface SafeProbeObservation {
  adapterClassification: "REAL_INSTALLED_SDK" | "CONTROLLED_TEST_FAKE";
  browserEnvironmentValidated: boolean;
  observedChainId: number;
  providerReady: boolean;
  walletConnected: boolean;
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
  transactionSubmitted: boolean;
  transactionConfirmed: boolean;
  transactionStatus: "SUCCESS" | "NOT_RUN";
  transactionHash: string | null;
  transactionBlockNumber: string | null;
  resultHandleRead: boolean;
  authorizedDecryptionCompleted: boolean;
  authorizedPlaintextMatched: boolean;
  unauthorizedDecryptionAttempted: boolean;
  unauthorizedDecryptionRejected: boolean;
  forbiddenMaterialRetained: boolean;
  durationMilliseconds: number;
}

export interface SanitizedProbeResult {
  schema: "zama-szn4.sg5-browser-probe-result.v2";
  protocolVersion: typeof SG5_PROTOCOL_VERSION;
  status: ProbeStatus;
  executionMode: ProbeExecutionMode;
  adapterClassification: SafeProbeObservation["adapterClassification"];
  blockerClassification: BlockerClassification;
  failureClassification: FailureClassification;
  browserEngine: "CHROMIUM_FAMILY" | "UNKNOWN_BROWSER";
  browserVersion: "RECORDED_BY_PLAYWRIGHT";
  chainId: "11155111";
  observedChainId: string;
  sdkPackage: "@zama-fhe/sdk";
  sdkVersion: "3.4.0";
  reactSdkPackage: "@zama-fhe/react-sdk";
  reactSdkVersion: "3.4.0";
  providerReady: boolean;
  walletConnected: boolean;
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
  transactionSubmitted: boolean;
  transactionConfirmed: boolean;
  transactionStatus: "SUCCESS" | "NOT_RUN";
  transactionHash: string | null;
  transactionBlockNumber: string | null;
  resultHandleRead: boolean;
  authorizedDecryptionCompleted: boolean;
  authorizedPlaintextMatched: boolean;
  unauthorizedDecryptionAttempted: boolean;
  unauthorizedDecryptionRejected: boolean;
  forbiddenMaterialRetained: boolean;
  consoleErrorCount: string;
  pageErrorCount: string;
  unhandledRejectionCount: string;
  forbiddenNetworkRequestCount: string;
  durationMilliseconds: string;
  networkObservations: SafeNetworkObservation[];
  finalVerdict: "NOT_LIVE" | "PASS_PENDING_HARNESS" | "FAIL";
}

export interface SanitizedAggregateResult {
  schema: "zama-szn4.sg5-browser-probe-aggregate.v2";
  protocolVersion: typeof SG5_PROTOCOL_VERSION;
  status: "PASS" | "FAIL";
  executionMode: "LIVE_SEPOLIA";
  requiredColdContexts: "2";
  passedColdContexts: string;
  excludedMockContexts: string;
  wrongNetworkScenarioPassed: boolean;
  productionBuildPassed: boolean;
  contexts: SanitizedProbeResult[];
}

export interface HarnessObservationCounters {
  console: number;
  page: number;
  unhandled: number;
  forbiddenNetwork: number;
}

const RESULT_KEYS = [
  "schema", "protocolVersion", "status", "executionMode", "adapterClassification", "blockerClassification",
  "failureClassification", "browserEngine", "browserVersion", "chainId", "observedChainId", "sdkPackage",
  "sdkVersion", "reactSdkPackage", "reactSdkVersion", "providerReady", "walletConnected", "wasmRuntimeInitialized",
  "wasmProofMechanism", "wasmInstantiationCount", "wasmCriticalSections", "sdkInstanceCreated", "publicKeyRetrieved",
  "publicKeySourceClassification", "encryptedInputBuilderCreated", "encryptedWidth", "plaintextClassification",
  "encryptionCompleted", "encryptedPayloadCount", "encryptedPayloadNonempty", "inputProofPresent", "transactionSubmitted",
  "transactionConfirmed", "transactionStatus", "transactionHash", "transactionBlockNumber", "resultHandleRead",
  "authorizedDecryptionCompleted", "authorizedPlaintextMatched", "unauthorizedDecryptionAttempted",
  "unauthorizedDecryptionRejected", "forbiddenMaterialRetained", "consoleErrorCount", "pageErrorCount",
  "unhandledRejectionCount", "forbiddenNetworkRequestCount", "durationMilliseconds", "networkObservations", "finalVerdict",
] as const;
const AGGREGATE_KEYS = ["schema", "protocolVersion", "status", "executionMode", "requiredColdContexts", "passedColdContexts", "excludedMockContexts", "wrongNetworkScenarioPassed", "productionBuildPassed", "contexts"] as const;
const NETWORK_KEYS = ["originClassification", "requestCategory", "statusCategory", "durationMilliseconds", "redirectClassification", "success"] as const;
const WASM_KEYS = ["criticalSectionClassification", "successfulInstantiateCount", "successfulInstantiateStreamingCount", "failedCallCount"] as const;
const DECIMAL = /^(0|[1-9][0-9]*)$/u;
const HEX32 = /^0x[0-9a-fA-F]{64}$/u;

function assert(condition: boolean, message: string): asserts condition { if (!condition) throw new Error(message); }
function nonnegativeInteger(value: number): string { assert(Number.isSafeInteger(value) && value >= 0, "unsafe integer"); return String(value); }
function assertDecimal(value: unknown, field: string): asserts value is string { assert(typeof value === "string" && DECIMAL.test(value), `invalid decimal: ${field}`); }
function assertBoolean(value: unknown, field: string): asserts value is boolean { assert(typeof value === "boolean", `invalid boolean: ${field}`); }
function assertEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): asserts value is T { assert(typeof value === "string" && allowed.includes(value as T), `invalid ${field}`); }
function assertExactKeys(value: object, expected: readonly string[], field: string): void {
  const keys = Reflect.ownKeys(value); assert(keys.every((key) => typeof key === "string"), `${field} has symbols`);
  assert(keys.length === expected.length && expected.every((key) => keys.includes(key)), `${field} fields drifted`);
}
function assertSafeGraph(value: unknown, path = "$", seen = new Set<object>()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value !== "object") throw new Error(`${path} contains forbidden type`);
  if (seen.has(value)) throw new Error(`${path} contains a cycle`);
  seen.add(value);
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Map || value instanceof Set || value instanceof Error || value instanceof Promise) throw new Error(`${path} contains raw material`);
  if (Array.isArray(value)) { assert(Object.getPrototypeOf(value) === Array.prototype, `${path} array prototype`); for (const item of value) assertSafeGraph(item, `${path}[]`, seen); seen.delete(value); return; }
  assert(Object.getPrototypeOf(value) === Object.prototype, `${path} must be plain`);
  for (const key of Reflect.ownKeys(value)) { assert(typeof key === "string", `${path} has symbol`); const descriptor = Object.getOwnPropertyDescriptor(value, key); assert(Boolean(descriptor && descriptor.enumerable && "value" in descriptor), `${path}.${key} accessor`); assertSafeGraph(descriptor!.value, `${path}.${key}`, seen); }
  seen.delete(value);
}

function capabilityComplete(result: Record<string, unknown>): boolean {
  return result.observedChainId === "11155111" && result.providerReady === true && result.walletConnected === true &&
    result.wasmRuntimeInitialized === true && result.sdkInstanceCreated === true && result.publicKeyRetrieved === true &&
    result.encryptedInputBuilderCreated === true && result.encryptionCompleted === true && result.encryptedPayloadCount === "1" &&
    result.encryptedPayloadNonempty === true && result.inputProofPresent === true && result.transactionSubmitted === true &&
    result.transactionConfirmed === true && result.transactionStatus === "SUCCESS" && typeof result.transactionHash === "string" &&
    HEX32.test(result.transactionHash) && typeof result.transactionBlockNumber === "string" && DECIMAL.test(result.transactionBlockNumber) &&
    result.resultHandleRead === true && result.authorizedDecryptionCompleted === true && result.authorizedPlaintextMatched === true &&
    result.unauthorizedDecryptionAttempted === true && result.unauthorizedDecryptionRejected === true;
}

function errorFree(result: Record<string, unknown>): boolean {
  return result.consoleErrorCount === "0" && result.pageErrorCount === "0" && result.unhandledRejectionCount === "0" &&
    result.forbiddenNetworkRequestCount === "0" && result.forbiddenMaterialRetained === false;
}

function exactOrigin(value: string | null): boolean { if (value === null) return true; const u = new URL(value); return u.protocol === "https:" && u.origin === value && u.pathname === "/" && !u.username && !u.password && !u.port && !u.search && !u.hash; }
function pathMatches(path: string, prefix: string): boolean { return path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`); }
function validateAuthority(authority: Readonly<AssetOriginAuthority>): void {
  assert(exactOrigin(authority.publicKeyAssetOrigin) && exactOrigin(authority.crsAssetOrigin), "invalid asset origin");
  for (const prefix of [authority.publicKeyAssetPathPrefix, authority.crsAssetPathPrefix]) assert(prefix !== null && prefix.startsWith("/") && !prefix.includes("?") && !prefix.includes("#"), "invalid asset prefix");
  assert(authority.dynamicAssetOriginsResolved, "asset origins are unresolved");
}

function rawAuthority(urlText: string): string { const match = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/u.exec(urlText); if (!match) throw new Error("URL authority missing"); return match[1]; }
export function classifyNetworkUrl(urlText: string, authority: Readonly<AssetOriginAuthority> = SG5_ASSET_ORIGIN_AUTHORITY): { originClassification: OriginClassification; requestCategory: RequestCategory } {
  validateAuthority(authority); const url = new URL(urlText); assert(!url.username && !url.password && !url.hash, "URL credentials/fragments forbidden");
  const registered = ["localhost:3000", "relayer.testnet.zama.org", "ethereum-sepolia-rpc.publicnode.com", new URL(authority.publicKeyAssetOrigin!).host];
  assert(registered.includes(rawAuthority(urlText)), "unregistered network authority");
  assert((url.origin === SG5_ORIGINS.localhost && url.protocol === "http:") || (url.protocol === "https:" && url.port === ""), "unsupported URL scheme");
  if (url.origin === SG5_ORIGINS.localhost) { assert(url.port === "3000", "localhost port"); return { originClassification: "LOCALHOST", requestCategory: "LOCAL_FRONTEND_ASSET" }; }
  if (url.origin === SG5_ORIGINS.relayer) { assert(url.pathname === "/v2/keyurl" && !url.search, "unregistered relayer path"); return { originClassification: "OFFICIAL_RELAYER", requestCategory: "RELAYER_KEYURL_METADATA" }; }
  if (url.origin === SG5_ORIGINS.chainRpc) { assert(url.pathname === "/" && !url.search, "unregistered RPC path"); return { originClassification: "OFFICIAL_CHAIN_RPC", requestCategory: "SEPOLIA_RPC" }; }
  if (url.origin === authority.publicKeyAssetOrigin) {
    assert(!url.search, "asset query forbidden");
    if (pathMatches(url.pathname, authority.publicKeyAssetPathPrefix!)) return { originClassification: "OFFICIAL_PUBLIC_KEY_ASSET", requestCategory: "PUBLIC_KEY_ASSET" };
    if (pathMatches(url.pathname, authority.crsAssetPathPrefix!)) return { originClassification: "OFFICIAL_CRS_ASSET", requestCategory: "CRS_ASSET" };
    throw new Error("unregistered asset path");
  }
  throw new Error("forbidden network origin");
}
function statusCategory(status: number): StatusCategory { assert(Number.isInteger(status) && status >= 200 && status <= 599, "invalid status"); return status < 300 ? "SUCCESS_2XX" : status < 400 ? "REDIRECT_3XX" : status < 500 ? "CLIENT_ERROR_4XX" : "SERVER_ERROR_5XX"; }
export function buildResponseNetworkObservation(input: Readonly<NetworkResponseObservationInput>, authority: Readonly<AssetOriginAuthority> = SG5_ASSET_ORIGIN_AUTHORITY): SafeNetworkObservation {
  const classification = classifyNetworkUrl(input.requestUrl, authority); const category = statusCategory(input.status); let redirect: RedirectClassification = "NONE";
  if (input.redirectedToUrl) { try { const from = classifyNetworkUrl(input.requestUrl, authority); const to = classifyNetworkUrl(input.redirectedToUrl, authority); redirect = from.originClassification === to.originClassification ? "ALLOWED_SAME_ORIGIN" : "ALLOWED_REGISTERED_ORIGIN"; } catch { redirect = "FORBIDDEN"; } }
  if (input.redirectedFromUrl) { try { const from = classifyNetworkUrl(input.redirectedFromUrl, authority); const to = classifyNetworkUrl(input.requestUrl, authority); redirect = from.originClassification === to.originClassification ? "ALLOWED_SAME_ORIGIN" : "ALLOWED_REGISTERED_ORIGIN"; } catch { redirect = "FORBIDDEN"; } }
  const success = category === "SUCCESS_2XX" || (category === "REDIRECT_3XX" && redirect !== "FORBIDDEN");
  return { ...classification, statusCategory: category, durationMilliseconds: nonnegativeInteger(Math.max(0, Math.round(input.durationMilliseconds))), redirectClassification: redirect, success };
}
export function buildNetworkFailureObservation(requestUrl: string, durationMilliseconds: number, redirectedFromUrl?: string | null, authority: Readonly<AssetOriginAuthority> = SG5_ASSET_ORIGIN_AUTHORITY): SafeNetworkObservation {
  const classification = classifyNetworkUrl(requestUrl, authority); let redirect: RedirectClassification = "NONE";
  if (redirectedFromUrl) { try { const from = classifyNetworkUrl(redirectedFromUrl, authority); redirect = from.originClassification === classification.originClassification ? "ALLOWED_SAME_ORIGIN" : "ALLOWED_REGISTERED_ORIGIN"; } catch { redirect = "FORBIDDEN"; } }
  return { ...classification, statusCategory: "NETWORK_FAILURE", durationMilliseconds: nonnegativeInteger(Math.max(0, Math.round(durationMilliseconds))), redirectClassification: redirect, success: false };
}

export function hasRequiredNetworkProof(result: SanitizedProbeResult): boolean {
  const required: Array<[OriginClassification, RequestCategory]> = [["OFFICIAL_RELAYER", "RELAYER_KEYURL_METADATA"], ["OFFICIAL_PUBLIC_KEY_ASSET", "PUBLIC_KEY_ASSET"], ["OFFICIAL_CRS_ASSET", "CRS_ASSET"], ["OFFICIAL_CHAIN_RPC", "SEPOLIA_RPC"]];
  return result.networkObservations.every((entry) => entry.success && entry.redirectClassification !== "FORBIDDEN") && required.every(([origin, category]) => result.networkObservations.some((entry) => entry.originClassification === origin && entry.requestCategory === category && entry.success));
}

export function sanitizeObservation(observation: SafeProbeObservation, executionMode: ProbeExecutionMode, userAgent: string): SanitizedProbeResult {
  const chromium = /Chrom(?:e|ium)\//u.test(userAgent); const real = observation.adapterClassification === "REAL_INSTALLED_SDK";
  const result: SanitizedProbeResult = {
    schema: "zama-szn4.sg5-browser-probe-result.v2", protocolVersion: SG5_PROTOCOL_VERSION,
    status: executionMode === "OFFLINE_STRUCTURAL" ? "STRUCTURAL_PASS_NOT_LIVE" : "CAPABILITY_COMPLETE",
    executionMode, adapterClassification: observation.adapterClassification, blockerClassification: "NONE", failureClassification: "NONE",
    browserEngine: chromium ? "CHROMIUM_FAMILY" : "UNKNOWN_BROWSER", browserVersion: "RECORDED_BY_PLAYWRIGHT", chainId: "11155111",
    observedChainId: String(observation.observedChainId), sdkPackage: "@zama-fhe/sdk", sdkVersion: "3.4.0", reactSdkPackage: "@zama-fhe/react-sdk", reactSdkVersion: "3.4.0",
    providerReady: observation.providerReady, walletConnected: observation.walletConnected, wasmRuntimeInitialized: observation.wasmRuntimeInitialized,
    wasmProofMechanism: "ATTRIBUTED_SUCCESSFUL_WASM_INSTANTIATION_AND_REAL_SDK_ENCRYPTION", wasmInstantiationCount: nonnegativeInteger(observation.wasmInstantiationCount),
    wasmCriticalSections: observation.wasmCriticalSections.map((section) => ({ ...section, successfulInstantiateCount: nonnegativeInteger(section.successfulInstantiateCount), successfulInstantiateStreamingCount: nonnegativeInteger(section.successfulInstantiateStreamingCount), failedCallCount: nonnegativeInteger(section.failedCallCount) })),
    sdkInstanceCreated: observation.sdkInstanceCreated, publicKeyRetrieved: observation.publicKeyRetrieved, publicKeySourceClassification: "INSTALLED_SEPOLIA_RELAYER_CONFIGURATION",
    encryptedInputBuilderCreated: observation.encryptedInputBuilderCreated, encryptedWidth: "euint64", plaintextClassification: "FIXED_TEST_VALUE_ONE", encryptionCompleted: observation.encryptionCompleted,
    encryptedPayloadCount: nonnegativeInteger(observation.encryptedPayloadCount), encryptedPayloadNonempty: observation.encryptedPayloadNonempty, inputProofPresent: observation.inputProofPresent,
    transactionSubmitted: observation.transactionSubmitted, transactionConfirmed: observation.transactionConfirmed, transactionStatus: observation.transactionStatus, transactionHash: observation.transactionHash, transactionBlockNumber: observation.transactionBlockNumber,
    resultHandleRead: observation.resultHandleRead, authorizedDecryptionCompleted: observation.authorizedDecryptionCompleted, authorizedPlaintextMatched: observation.authorizedPlaintextMatched,
    unauthorizedDecryptionAttempted: observation.unauthorizedDecryptionAttempted, unauthorizedDecryptionRejected: observation.unauthorizedDecryptionRejected, forbiddenMaterialRetained: false,
    consoleErrorCount: "0", pageErrorCount: "0", unhandledRejectionCount: "0", forbiddenNetworkRequestCount: "0", durationMilliseconds: nonnegativeInteger(observation.durationMilliseconds), networkObservations: [],
    finalVerdict: executionMode === "OFFLINE_STRUCTURAL" ? "NOT_LIVE" : "PASS_PENDING_HARNESS",
  };
  if (executionMode === "LIVE_SEPOLIA" && (!real || !capabilityComplete(result as unknown as Record<string, unknown>))) { result.status = "FAIL"; result.failureClassification = real ? "CAPABILITY_INCOMPLETE" : "CAPABILITY_INCOMPLETE"; result.finalVerdict = "FAIL"; }
  assertSanitizedResult(result); return result;
}

export function assertSanitizedResult(value: unknown): asserts value is SanitizedProbeResult {
  assertSafeGraph(value); assert(value !== null && typeof value === "object" && !Array.isArray(value), "result object required"); assertExactKeys(value as object, RESULT_KEYS, "result"); const result = value as Record<string, unknown>;
  for (const [key, expected] of Object.entries({ schema: "zama-szn4.sg5-browser-probe-result.v2", protocolVersion: SG5_PROTOCOL_VERSION, browserVersion: "RECORDED_BY_PLAYWRIGHT", chainId: "11155111", sdkPackage: "@zama-fhe/sdk", sdkVersion: "3.4.0", reactSdkPackage: "@zama-fhe/react-sdk", reactSdkVersion: "3.4.0", wasmProofMechanism: "ATTRIBUTED_SUCCESSFUL_WASM_INSTANTIATION_AND_REAL_SDK_ENCRYPTION", publicKeySourceClassification: "INSTALLED_SEPOLIA_RELAYER_CONFIGURATION", encryptedWidth: "euint64", plaintextClassification: "FIXED_TEST_VALUE_ONE" })) assert(result[key] === expected, `invalid ${key}`);
  assertEnum(result.status, ["STRUCTURAL_PASS_NOT_LIVE", "CAPABILITY_COMPLETE", "FAIL"], "status"); assertEnum(result.executionMode, ["OFFLINE_STRUCTURAL", "LIVE_SEPOLIA"], "execution mode"); assertEnum(result.adapterClassification, ["REAL_INSTALLED_SDK", "CONTROLLED_TEST_FAKE"], "adapter"); assertEnum(result.blockerClassification, ["NONE", "BROWSER_UNAVAILABLE", "WRONG_NETWORK"], "blocker"); assertEnum(result.failureClassification, ["NONE", "CAPABILITY_INCOMPLETE", "BROWSER_ERROR", "CONSOLE_ERROR", "UNHANDLED_REJECTION", "FORBIDDEN_ORIGIN", "TRANSACTION_FAILED", "DECRYPTION_FAILED", "UNAUTHORIZED_DECRYPTION_ACCEPTED", "FORBIDDEN_MATERIAL"], "failure"); assertEnum(result.browserEngine, ["CHROMIUM_FAMILY", "UNKNOWN_BROWSER"], "browser"); assertEnum(result.transactionStatus, ["SUCCESS", "NOT_RUN"], "transaction status"); assertEnum(result.finalVerdict, ["NOT_LIVE", "PASS_PENDING_HARNESS", "FAIL"], "verdict");
  assertDecimal(result.observedChainId, "observedChainId"); assert(result.transactionHash === null || (typeof result.transactionHash === "string" && HEX32.test(result.transactionHash)), "transaction hash"); assert(result.transactionBlockNumber === null || (typeof result.transactionBlockNumber === "string" && DECIMAL.test(result.transactionBlockNumber)), "transaction block");
  for (const key of ["providerReady", "walletConnected", "wasmRuntimeInitialized", "sdkInstanceCreated", "publicKeyRetrieved", "encryptedInputBuilderCreated", "encryptionCompleted", "encryptedPayloadNonempty", "inputProofPresent", "transactionSubmitted", "transactionConfirmed", "resultHandleRead", "authorizedDecryptionCompleted", "authorizedPlaintextMatched", "unauthorizedDecryptionAttempted", "unauthorizedDecryptionRejected", "forbiddenMaterialRetained"]) assertBoolean(result[key], key);
  for (const key of ["wasmInstantiationCount", "encryptedPayloadCount", "consoleErrorCount", "pageErrorCount", "unhandledRejectionCount", "forbiddenNetworkRequestCount", "durationMilliseconds"]) assertDecimal(result[key], key);
  assert(Array.isArray(result.wasmCriticalSections) && result.wasmCriticalSections.length === 3, "WASM section count"); const seen = new Set<string>(); for (const section of result.wasmCriticalSections) { assertExactKeys(section, WASM_KEYS, "WASM section"); assertEnum(section.criticalSectionClassification, ["SDK_INITIALIZATION", "SDK_ENCRYPTION", "SDK_DECRYPTION"], "WASM section"); assert(!seen.has(section.criticalSectionClassification), "duplicate WASM section"); seen.add(section.criticalSectionClassification); assertDecimal(section.successfulInstantiateCount, "WASM success"); assertDecimal(section.successfulInstantiateStreamingCount, "WASM streaming"); assertDecimal(section.failedCallCount, "WASM failure"); }
  assert(Array.isArray(result.networkObservations) && result.networkObservations.length <= 512, "network observations"); for (const observation of result.networkObservations) { assertExactKeys(observation, NETWORK_KEYS, "network observation"); assertEnum(observation.originClassification, ["LOCALHOST", "OFFICIAL_RELAYER", "OFFICIAL_CHAIN_RPC", "OFFICIAL_PUBLIC_KEY_ASSET", "OFFICIAL_CRS_ASSET"], "origin"); assertEnum(observation.requestCategory, ["LOCAL_FRONTEND_ASSET", "SEPOLIA_RPC", "RELAYER_KEYURL_METADATA", "PUBLIC_KEY_ASSET", "CRS_ASSET"], "category"); assertEnum(observation.statusCategory, ["SUCCESS_2XX", "REDIRECT_3XX", "CLIENT_ERROR_4XX", "SERVER_ERROR_5XX", "NETWORK_FAILURE"], "status"); assertDecimal(observation.durationMilliseconds, "network duration"); assertEnum(observation.redirectClassification, ["NONE", "ALLOWED_SAME_ORIGIN", "ALLOWED_REGISTERED_ORIGIN", "FORBIDDEN"], "redirect"); assertBoolean(observation.success, "network success"); }
  if (result.status === "STRUCTURAL_PASS_NOT_LIVE") { assert(result.executionMode === "OFFLINE_STRUCTURAL" && result.adapterClassification === "CONTROLLED_TEST_FAKE" && result.finalVerdict === "NOT_LIVE", "structural contradiction"); }
  if (result.status === "CAPABILITY_COMPLETE") { assert(result.executionMode === "LIVE_SEPOLIA" && result.adapterClassification === "REAL_INSTALLED_SDK" && result.failureClassification === "NONE" && result.finalVerdict === "PASS_PENDING_HARNESS", "live contradiction"); assert(capabilityComplete(result), "live capability incomplete"); }
  if (result.status === "FAIL") assert(result.finalVerdict === "FAIL" && result.failureClassification !== "NONE", "failure contradiction");
}

export function assertSanitizedAggregateResult(value: unknown): asserts value is SanitizedAggregateResult {
  assertSafeGraph(value); assert(value !== null && typeof value === "object" && !Array.isArray(value), "aggregate object required"); assertExactKeys(value as object, AGGREGATE_KEYS, "aggregate"); const result = value as Record<string, unknown>;
  assert(result.schema === "zama-szn4.sg5-browser-probe-aggregate.v2" && result.protocolVersion === SG5_PROTOCOL_VERSION, "aggregate identity"); assert(result.status === "PASS" || result.status === "FAIL", "aggregate status"); assert(result.executionMode === "LIVE_SEPOLIA", "aggregate mode"); assert(result.requiredColdContexts === "2", "aggregate context count"); assertDecimal(result.passedColdContexts, "passed contexts"); assertDecimal(result.excludedMockContexts, "mock contexts"); assertBoolean(result.wrongNetworkScenarioPassed, "wrong network"); assertBoolean(result.productionBuildPassed, "production build"); assert(Array.isArray(result.contexts) && result.contexts.length === 2, "aggregate contexts"); for (const context of result.contexts) assertSanitizedResult(context); const passing = result.contexts.filter((context) => context.status === "CAPABILITY_COMPLETE" && errorFree(context as unknown as Record<string, unknown>) && hasRequiredNetworkProof(context)).length; assert(result.passedColdContexts === String(passing), "aggregate pass count"); assert(result.excludedMockContexts === "0", "mock context present"); if (result.status === "PASS") assert(passing === 2 && result.wrongNetworkScenarioPassed && result.productionBuildPassed, "aggregate PASS contradiction");
}

export function attachHarnessObservations(source: SanitizedProbeResult, observations: readonly SafeNetworkObservation[], counters: HarnessObservationCounters): SanitizedProbeResult {
  assertSanitizedResult(source); assertSafeGraph(observations); for (const value of Object.values(counters)) assert(Number.isSafeInteger(value) && value >= 0, "unsafe harness counter"); const failed = counters.console > 0 || counters.page > 0 || counters.unhandled > 0 || counters.forbiddenNetwork > 0;
  const result: SanitizedProbeResult = { ...source, consoleErrorCount: nonnegativeInteger(counters.console), pageErrorCount: nonnegativeInteger(counters.page), unhandledRejectionCount: nonnegativeInteger(counters.unhandled), forbiddenNetworkRequestCount: nonnegativeInteger(counters.forbiddenNetwork), networkObservations: observations.map((observation) => ({ ...observation })), ...(failed ? { status: "FAIL" as const, failureClassification: counters.forbiddenNetwork > 0 ? "FORBIDDEN_ORIGIN" as const : counters.unhandled > 0 ? "UNHANDLED_REJECTION" as const : counters.page > 0 ? "BROWSER_ERROR" as const : "CONSOLE_ERROR" as const, finalVerdict: "FAIL" as const } : {}) };
  assertSanitizedResult(result); return result;
}

export function controlledStructuralObservation(): SafeProbeObservation {
  return { adapterClassification: "CONTROLLED_TEST_FAKE", browserEnvironmentValidated: true, observedChainId: 0, providerReady: false, walletConnected: false, wasmInstantiationCount: 0, wasmCriticalSections: [{ criticalSectionClassification: "SDK_INITIALIZATION", successfulInstantiateCount: 0, successfulInstantiateStreamingCount: 0, failedCallCount: 0 }, { criticalSectionClassification: "SDK_ENCRYPTION", successfulInstantiateCount: 0, successfulInstantiateStreamingCount: 0, failedCallCount: 0 }, { criticalSectionClassification: "SDK_DECRYPTION", successfulInstantiateCount: 0, successfulInstantiateStreamingCount: 0, failedCallCount: 0 }], wasmRuntimeInitialized: false, sdkInstanceCreated: false, publicKeyRetrieved: false, encryptedInputBuilderCreated: false, encryptionCompleted: false, encryptedPayloadCount: 0, encryptedPayloadNonempty: false, inputProofPresent: false, transactionSubmitted: false, transactionConfirmed: false, transactionStatus: "NOT_RUN", transactionHash: null, transactionBlockNumber: null, resultHandleRead: false, authorizedDecryptionCompleted: false, authorizedPlaintextMatched: false, unauthorizedDecryptionAttempted: false, unauthorizedDecryptionRejected: false, forbiddenMaterialRetained: false, durationMilliseconds: 0 };
}
