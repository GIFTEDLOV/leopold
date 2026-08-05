export const SG5_PROTOCOL_VERSION = "sg5-browser-capability-v1" as const;
export const SG5_PREPARATION_STATUS = "PREPARED_LIVE_BROWSER_EXECUTION_REQUIRED" as const;
export const SG5_LIVE_ACK = "I_UNDERSTAND_THIS_CONTACTS_SEPOLIA" as const;

const protocol = {
  schema: "zama-szn4.sg5-browser-capability-protocol.v1",
  protocolVersion: SG5_PROTOCOL_VERSION,
  gate: "SG-5",
  preparationStatus: SG5_PREPARATION_STATUS,
  gateStatus: "PENDING",
  relationship: {
    sg1: "PASS_UNCHANGED",
    sg2: "PASS_UNCHANGED",
    sg3: "PASS_UNCHANGED",
    sg4: "PENDING_AUTHORITATIVE_HCU_SOURCE_AND_CEILING",
    sg5: "PENDING_LIVE_BROWSER_EXECUTION",
  },
  installedLineage: {
    next: { package: "next", version: "16.3.0" },
    react: { package: "react", version: "19.2.8" },
    typescript: { package: "typescript", version: "5.9.3" },
    playwright: { package: "@playwright/test", version: "1.62.1" },
    wagmi: { package: "wagmi", version: "3.7.6" },
    viem: { package: "viem", version: "2.55.10" },
    zamaBrowserSdk: { package: "@zama-fhe/sdk", version: "3.4.0" },
    zamaReactSdk: { package: "@zama-fhe/react-sdk", version: "3.4.0" },
    fhevmSdkRuntime: { package: "@fhevm/sdk", version: "0.13.2" },
  },
  lockedProbe: {
    network: "Ethereum Sepolia",
    chainId: "11155111",
    contractAddress: "0x332C58e28Bb31c902ddd370265eBBF1030299bC7",
    userAddress: "0x57357D26D1f56eca4556d271078A0239a7696Bbf",
    plaintextClassification: "FIXED_TEST_VALUE_ONE",
    fixedPlaintext: "1",
    encryptedWidth: "euint64",
    sdkEncryptionMethod: "ZamaSDK.encrypt",
    sdkTypedValue: { type: "euint64", value: "1" },
    requiredColdContexts: "2",
  },
  installedSepoliaConfiguration: {
    gatewayChainId: "10901",
    relayerOrigin: "https://relayer.testnet.zama.org",
    chainRpcOrigin: "https://ethereum-sepolia-rpc.publicnode.com",
    aclAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
    kmsVerifierAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
    inputVerifierAddress: "0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0",
  },
  browserRequirements: {
    realBrowserContext: true,
    requiredGlobals: ["window", "document", "navigator", "WebAssembly"],
    nodeExecutionForbidden: true,
    serviceWorkersBlocked: true,
    freshStorageEachContext: true,
    freshCacheDependenceForbidden: true,
    browserDownloadDuringPreparationForbidden: true,
    executableDiscovery: {
      installedPlaywrightMetadataFirst: true,
      playwrightResolutionContext: "FRONTEND_INSTALLED_@PLAYWRIGHT_TEST",
      playwrightResolutionMechanism: "CREATE_REQUIRE_FROM_FRONTEND_PACKAGE_JSON",
      managedExecutableMethod: "chromium.executablePath",
      apiAvailabilityDistinctFromManagedExecutableInstallation: true,
      availabilityClassifications: [
        "PLAYWRIGHT_API_UNAVAILABLE",
        "MANAGED_BROWSER_NOT_INSTALLED",
        "MANAGED_BROWSER_AVAILABLE",
        "SYSTEM_BROWSER_AVAILABLE",
      ],
      regularFileRequired: true,
      symlinkForbidden: true,
      executePermissionRequired: true,
      launchTimeIdentityRevalidationRequired: true,
      selectedPathPassedToPlaywright: true,
    },
  },
  wasmProof: {
    runtimeConfig: { singleThread: true, wasmAssetLoadMode: "embedded-base64" },
    mechanism: "ATTRIBUTED_SUCCESSFUL_WASM_INSTANTIATION_AND_REAL_SDK_ENCRYPTION",
    rule: "exclusive receiver-preserving wrappers record successful and failed WebAssembly.instantiate and instantiateStreaming calls only within separately registered SDK initialization and encryption critical sections; successful real SDK encryption and a positive successful count are both required",
    classification: "SCOPED_BROWSER_RUNTIME_OBSERVATION_TEMPORALLY_BOUND_TO_DEDICATED_ZAMA_SDK_OPERATION",
    criticalSections: ["SDK_INITIALIZATION", "SDK_ENCRYPTION"],
    concurrentInstallationForbidden: true,
    unrelatedPageWasmForbiddenDuringCriticalSections: true,
    cryptographicModuleIdentityClaimed: false,
    unexpectedWrapperReplacementFails: true,
    availabilityAloneInsufficient: true,
    rawModuleBytesRetained: false,
  },
  publicKeyProof: {
    sdkMethod: "sdk.relayer.fetchFheEncryptionKeyBytes",
    keySourceDiscoveryMethod: "GET official relayer /v2/keyurl performed internally by installed SDK",
    mustRetrieveFromObservedOfficialRelayerOrigin: true,
    assetOriginsStatus: "UNRESOLVED_FROM_INSTALLED_LOCAL_SOURCE",
    dynamicAssetOriginsResolved: false,
    publicKeyAssetOrigin: null,
    publicKeyAssetPathPrefix: null,
    crsAssetOrigin: null,
    crsAssetPathPrefix: null,
    crsAssetRequired: true,
    assetOriginResolutionRule:
      "resolve the current public-key and CRS asset origins in a separately authorized reviewed network preflight, reopen SG-5, and commit the exact origins before live execution",
    emptyOrFixtureKeyFails: true,
    responseBodyRecorded: false,
    keyBytesRecorded: false,
    keyBytesDiscardedImmediately: true,
  },
  encryptionProof: {
    builderSemantics: "SDK_TYPED_ENCRYPT_INPUT",
    contractAndUserLocked: true,
    typedValueLocked: true,
    encryptedValuesRequiredCount: "1",
    encryptedValueMustBeNonemptyHex: true,
    inputProofMustBeNonemptyHex: true,
    rawOutputRetained: false,
    mockMayPassLiveGate: false,
  },
  networkPolicy: {
    enforcement: "CSP_CLOSED_CONNECT_ALLOWLIST_PLUS_PLAYWRIGHT_POLICY_ONLY_CONTINUATION",
    officialResponsesMockedOrFulfilled: false,
    allowedOrigins: [
      { origin: "http://localhost:3000", classification: "LOCALHOST_FRONTEND" },
      { origin: "https://relayer.testnet.zama.org", classification: "OFFICIAL_SEPOLIA_RELAYER" },
      {
        origin: "https://ethereum-sepolia-rpc.publicnode.com",
        classification: "INSTALLED_SEPOLIA_CHAIN_PRESET_RPC",
      },
    ],
    requestCategories: [
      "LOCAL_FRONTEND_ASSET",
      "SEPOLIA_RPC",
      "RELAYER_KEYURL_METADATA",
      "PUBLIC_KEY_ASSET",
      "CRS_ASSET",
    ],
    statusCategories: ["SUCCESS_2XX", "REDIRECT_3XX", "CLIENT_ERROR_4XX", "SERVER_ERROR_5XX", "NETWORK_FAILURE"],
    redirectClassifications: ["NONE", "ALLOWED_SAME_ORIGIN", "ALLOWED_REGISTERED_ORIGIN", "FORBIDDEN"],
    redirectObservationSemantics: {
      originalResponseTargetRelationship: "REQUEST_REDIRECTED_TO",
      redirectedTargetProvenanceRelationship: "REQUEST_REDIRECTED_FROM",
      permittedTransitions: ["ALLOWED_SAME_ORIGIN", "ALLOWED_REGISTERED_ORIGIN"],
      permittedTransitionSuccess: true,
      permittedTransitionIsTerminalProof: false,
      requiredTerminalStatus: "SUCCESS_2XX",
      missingRedirectTargetFails: true,
      forbiddenRedirectFails: true,
      everyHopValidated: true,
    },
    requiredLiveProofCategories: ["RELAYER_KEYURL_METADATA", "PUBLIC_KEY_ASSET", "CRS_ASSET", "SEPOLIA_RPC"],
    passRequiresCommittedExactAssetOrigins: true,
    runtimeKeyurlResponseCannotExpandAllowlist: true,
    redirectsToUnknownOriginsFail: true,
    unknownExternalOriginFails: true,
    urlCanonicalizationRules: {
      credentialsForbidden: true,
      fragmentsForbidden: true,
      explicitDefaultPortsForbidden: true,
      wildcardAndSuffixMatchingForbidden: true,
      exactRegisteredHostAndSchemeRequired: true,
      registeredExternalPaths: ["OFFICIAL_SEPOLIA_RELAYER:/v2/keyurl", "INSTALLED_SEPOLIA_CHAIN_PRESET_RPC:/"],
    },
    persistedRequestFields: [
      "originClassification",
      "requestCategory",
      "statusCategory",
      "durationMilliseconds",
      "redirectClassification",
      "success",
    ],
    forbiddenPersistedRequestFields: ["path", "query", "fragment", "headers", "body", "completeUrl"],
    analyticsForbidden: true,
    telemetryForbidden: true,
  },
  pagePolicy: {
    path: "/__sg5__",
    healthPath: "/api/sg5-health",
    enabledBy: { variable: "SG5_PROBE_PAGE", exactValue: "ENABLED_LOCAL_ONLY" },
    productionModeAlwaysDisabled: true,
    arbitraryInputForbidden: true,
    walletUiForbidden: true,
    rawCryptographicDomContentForbidden: true,
    bannerRequired: true,
  },
  liveExecution: {
    acknowledgment: { variable: "SG5_LIVE_ACK", exactValue: SG5_LIVE_ACK },
    exactColdContexts: "2",
    contextsIndependent: true,
    generalTestSuiteCannotEnableLiveMode: true,
    preparationCommitAndTreeMustBeExplicitlyBound: true,
    worktreeMustBeClean: true,
    localhostPort: "3000",
    blockedUntil: ["EXACT_PUBLIC_KEY_ASSET_ORIGIN", "EXACT_CRS_ASSET_ORIGIN", "LOCAL_CHROMIUM_AVAILABLE"],
    frontendOwnership: {
      preexistingPortListenerPolicy: "REFUSE_WITHOUT_TERMINATION",
      spawnedListenerPidOrVerifiedDescendantRequired: true,
      leaderAbsenceAloneProvesExit: false,
      survivingProcessGroupMembersEnumerated: true,
      verifiedDescendantsAndPortOwnerCheckedAfterLeaderExit: true,
      procCwdExeCmdlineStartTimeAndAncestryRequired: true,
      healthWithoutSocketOwnershipFails: true,
      pidAndStartTimeRevalidatedBeforeEverySignal: true,
      gracefulSignal: "SIGTERM",
      boundedEscalationSignal: "SIGKILL",
      cleanupResultClassifications: [
        "ALREADY_EXITED",
        "TERMINATED_GRACEFULLY",
        "TERMINATED_FORCIBLY",
        "OWNERSHIP_LOST",
        "PID_REUSE_DETECTED",
        "AMBIGUOUS_PROCESS_GROUP",
      ],
    },
    cleanup: {
      events: ["NORMAL_COMPLETION", "SIGINT", "SIGTERM", "SIGHUP", "UNCAUGHT_EXCEPTION", "UNHANDLED_REJECTION"],
      idempotent: true,
      processGroupOwnedByLauncherRequired: true,
      privateRunDirectoryMode: "0700",
      containmentRevalidatedBeforeDeletion: true,
      unresolvedOwnershipRetainsPrivateRunDirectory: true,
      privateRunDirectoryDeletionRequiresVerifiedExitOrTermination: true,
    },
  },
  forbiddenActions: [
    "wallet connection",
    "eth_requestAccounts",
    "signMessage",
    "signTypedData",
    "signature request",
    "eth_sendTransaction",
    "sendTransaction",
    "writeContract",
    "transaction submission",
  ],
  forbiddenMaterial: [
    "private keys",
    "seed phrases",
    "credential values",
    "authenticated URLs",
    "raw public encryption keys",
    "ciphertexts",
    "encrypted handles",
    "input proofs",
    "signatures",
    "raw signed transactions",
    "complete SDK objects",
    "complete provider objects",
    "complete request or response objects",
    "cookies",
    "browser storage dumps",
  ],
  errorPolicy: {
    consoleErrorsAllowed: "0",
    pageErrorsAllowed: "0",
    unhandledRejectionsAllowed: "0",
    forbiddenNetworkRequestsAllowed: "0",
    walletRequestsAllowed: "0",
    accountAuthorizationRequestsAllowed: "0",
    signatureRequestsAllowed: "0",
    transactionsAllowed: "0",
  },
  resultSchema: {
    schema: "zama-szn4.sg5-browser-probe-result.v1",
    unsafeIntegerEncoding: "DECIMAL_STRING",
    additionalProperties: false,
    requiredSafeFields: [
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
    ],
    networkObservation: {
      additionalProperties: false,
      maximumRecords: "256",
      requiredFields: [
        "originClassification",
        "requestCategory",
        "statusCategory",
        "durationMilliseconds",
        "redirectClassification",
        "success",
      ],
      originAndCategoryPairs: [
        "LOCALHOST:LOCAL_FRONTEND_ASSET",
        "OFFICIAL_RELAYER:RELAYER_KEYURL_METADATA",
        "OFFICIAL_CHAIN_RPC:SEPOLIA_RPC",
        "OFFICIAL_PUBLIC_KEY_ASSET:PUBLIC_KEY_ASSET",
        "OFFICIAL_CRS_ASSET:CRS_ASSET",
      ],
      statusCategories: ["SUCCESS_2XX", "REDIRECT_3XX", "CLIENT_ERROR_4XX", "SERVER_ERROR_5XX", "NETWORK_FAILURE"],
      redirectClassifications: ["NONE", "ALLOWED_SAME_ORIGIN", "ALLOWED_REGISTERED_ORIGIN", "FORBIDDEN"],
      successConsistentWithStatusRequired: true,
    },
    aggregate: {
      schema: "zama-szn4.sg5-browser-probe-aggregate.v1",
      additionalProperties: false,
      requiredSafeFields: [
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
      ],
      passRequiresExactlyTwoIndependentRealContexts: true,
      preparationAndMockResultsCannotPass: true,
      passRequiresResolvedCommittedAssetOrigins: true,
      passRequiresCompleteKeyurlPublicKeyCrsAndRpcProofPerContext: true,
    },
  },
  futureEvidence: {
    path: "evidence/cp0/SG5_BROWSER_CAPABILITY.json",
    sidecarPath: "evidence/cp0/SG5_BROWSER_CAPABILITY.json.sha256",
    creationDuringPreparationForbidden: true,
    identityBinding: ["preparationCommit", "preparationTree", "protocolSha256"],
    requiredSafeSections: [
      "identity",
      "lineage",
      "lockedProbe",
      "coldContexts",
      "wasmProof",
      "publicKeyProof",
      "encryptionProof",
      "originObservations",
      "errorCounters",
      "authorityProhibitions",
      "verdict",
    ],
    utcTimestampsPermittedOnlyInLiveEvidence: true,
    rawCryptographicMaterialForbidden: true,
  },
  verdictRules: {
    PASS: [
      "exactly two fresh cold browser contexts independently satisfy every live requirement",
      "real installed SDK and real SDK encryption path used",
      "WASM instantiation observed and encryption completed",
      "official public key retrieval observed",
      "exact public-key and CRS origins are committed and metadata, public-key asset, CRS asset, and RPC observations succeed independently in both contexts",
      "all error and forbidden-action counters are zero",
      "identity-bound sanitized evidence and checksum validate",
    ],
    BLOCKED: [
      "browser unavailable",
      "authoritative WASM proof unavailable",
      "exact public-key or CRS asset origin unresolved",
      "official relayer or gateway outage invalidates the complete cold-context set",
    ],
    FAIL: [
      "browser or SDK logic failure",
      "forbidden origin or redirect",
      "console, page, or unhandled-rejection error",
      "raw sensitive material exposure",
      "wallet, signature, or transaction request",
      "mock-only success",
    ],
  },
  retryPolicy: {
    logicFailure: "retain failure; review code and protocol before any complete rerun",
    officialOutage: "retain every failed cold-context record; rerun the complete two-context set later",
    selectiveContextReplacementForbidden: true,
    sensitiveExposureInvalidatesEvidence: true,
  },
  reopenConditions: [
    "installed Zama browser or React SDK version changes",
    "installed Sepolia chain, relayer, RPC, gateway, or verifier configuration changes",
    "SDK encryption or public-key API changes",
    "WASM runtime or proof mechanism changes",
    "locked contract, public user, value, or encrypted width changes",
    "network allowlist, cold-context count, sanitizer, evidence schema, or verdict rule changes",
    "wallet, signing, transaction, storage, telemetry, or privacy behavior changes",
  ],
} as const;

export type SG5Protocol = typeof protocol;

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`SG5 protocol invariant failed: ${message}`);
}

export function validateProtocol(candidate: SG5Protocol = protocol): void {
  invariant(candidate.schema === "zama-szn4.sg5-browser-capability-protocol.v1", "schema");
  invariant(candidate.protocolVersion === SG5_PROTOCOL_VERSION, "protocol version");
  invariant(candidate.gate === "SG-5", "gate");
  invariant(candidate.preparationStatus === SG5_PREPARATION_STATUS, "preparation status");
  invariant(candidate.gateStatus === "PENDING", "SG-5 must remain pending");
  invariant(candidate.relationship.sg4.startsWith("PENDING_"), "SG-4 must remain pending");
  invariant(candidate.lockedProbe.chainId === "11155111", "chain ID");
  invariant(candidate.lockedProbe.contractAddress === "0x332C58e28Bb31c902ddd370265eBBF1030299bC7", "contract");
  invariant(candidate.lockedProbe.userAddress === "0x57357D26D1f56eca4556d271078A0239a7696Bbf", "user");
  invariant(candidate.lockedProbe.fixedPlaintext === "1", "fixed value");
  invariant(candidate.lockedProbe.encryptedWidth === "euint64", "encrypted width");
  invariant(candidate.lockedProbe.sdkEncryptionMethod === "ZamaSDK.encrypt", "installed encryption API");
  invariant(candidate.lockedProbe.requiredColdContexts === "2", "cold context count");
  invariant(candidate.wasmProof.availabilityAloneInsufficient, "WebAssembly availability is not proof");
  invariant(candidate.wasmProof.runtimeConfig.singleThread, "single-thread deterministic browser runtime");
  invariant(candidate.wasmProof.runtimeConfig.wasmAssetLoadMode === "embedded-base64", "bundled WASM mode");
  invariant(candidate.wasmProof.concurrentInstallationForbidden, "exclusive WASM probe");
  invariant(!candidate.wasmProof.cryptographicModuleIdentityClaimed, "WASM attribution limitation");
  invariant(candidate.wasmProof.criticalSections.join(",") === "SDK_INITIALIZATION,SDK_ENCRYPTION", "WASM sections");
  invariant(candidate.publicKeyProof.sdkMethod === "sdk.relayer.fetchFheEncryptionKeyBytes", "public key API");
  invariant(
    candidate.publicKeyProof.assetOriginsStatus === "UNRESOLVED_FROM_INSTALLED_LOCAL_SOURCE",
    "key asset origin blocker",
  );
  invariant(
    !candidate.publicKeyProof.dynamicAssetOriginsResolved,
    "asset origins must remain unresolved in preparation",
  );
  invariant(candidate.publicKeyProof.publicKeyAssetOrigin === null, "public-key asset origin must not be guessed");
  invariant(candidate.publicKeyProof.crsAssetOrigin === null, "CRS asset origin must not be guessed");
  invariant(!candidate.publicKeyProof.keyBytesRecorded, "public key recording forbidden");
  invariant(!candidate.encryptionProof.mockMayPassLiveGate, "mock cannot pass");
  invariant(candidate.networkPolicy.allowedOrigins.length === 3, "closed origin count");
  invariant(
    candidate.networkPolicy.requestCategories.join(",") ===
      "LOCAL_FRONTEND_ASSET,SEPOLIA_RPC,RELAYER_KEYURL_METADATA,PUBLIC_KEY_ASSET,CRS_ASSET",
    "closed request categories",
  );
  invariant(candidate.networkPolicy.passRequiresCommittedExactAssetOrigins, "committed asset origins required");
  invariant(candidate.networkPolicy.runtimeKeyurlResponseCannotExpandAllowlist, "keyurl cannot expand allowlist");
  invariant(
    candidate.networkPolicy.redirectObservationSemantics.originalResponseTargetRelationship === "REQUEST_REDIRECTED_TO",
    "original redirect response correlation",
  );
  invariant(
    candidate.networkPolicy.redirectObservationSemantics.requiredTerminalStatus === "SUCCESS_2XX" &&
      !candidate.networkPolicy.redirectObservationSemantics.permittedTransitionIsTerminalProof,
    "redirect transitions cannot replace terminal proof",
  );
  invariant(
    candidate.networkPolicy.redirectObservationSemantics.missingRedirectTargetFails &&
      candidate.networkPolicy.redirectObservationSemantics.forbiddenRedirectFails &&
      candidate.networkPolicy.redirectObservationSemantics.everyHopValidated,
    "broken and forbidden redirect chains fail",
  );
  invariant(candidate.networkPolicy.unknownExternalOriginFails, "unknown origin failure");
  invariant(candidate.networkPolicy.urlCanonicalizationRules.credentialsForbidden, "authenticated URL rejection");
  invariant(candidate.liveExecution.acknowledgment.exactValue === SG5_LIVE_ACK, "live acknowledgment");
  invariant(candidate.errorPolicy.consoleErrorsAllowed === "0", "console error policy");
  invariant(candidate.errorPolicy.pageErrorsAllowed === "0", "page error policy");
  invariant(candidate.errorPolicy.unhandledRejectionsAllowed === "0", "unhandled rejection policy");
  invariant(candidate.errorPolicy.forbiddenNetworkRequestsAllowed === "0", "network error policy");
  invariant(candidate.errorPolicy.accountAuthorizationRequestsAllowed === "0", "account authorization policy");
  invariant(candidate.resultSchema.networkObservation.maximumRecords === "256", "network observation bound");
  invariant(
    candidate.resultSchema.networkObservation.originAndCategoryPairs.includes(
      "OFFICIAL_RELAYER:RELAYER_KEYURL_METADATA",
    ),
    "keyurl metadata observation",
  );
  invariant(
    candidate.resultSchema.networkObservation.originAndCategoryPairs.includes(
      "OFFICIAL_PUBLIC_KEY_ASSET:PUBLIC_KEY_ASSET",
    ),
    "public-key asset observation",
  );
  invariant(
    candidate.resultSchema.networkObservation.originAndCategoryPairs.includes("OFFICIAL_CRS_ASSET:CRS_ASSET"),
    "CRS asset observation",
  );
  invariant(candidate.resultSchema.networkObservation.requiredFields.includes("success"), "network success field");
  invariant(
    candidate.resultSchema.networkObservation.requiredFields.includes("redirectClassification"),
    "redirect classification field",
  );
  invariant(candidate.resultSchema.aggregate.passRequiresExactlyTwoIndependentRealContexts, "aggregate cold contexts");
  invariant(candidate.resultSchema.aggregate.preparationAndMockResultsCannotPass, "aggregate mock exclusion");
  invariant(candidate.resultSchema.aggregate.passRequiresResolvedCommittedAssetOrigins, "aggregate asset authority");
  invariant(
    candidate.resultSchema.aggregate.passRequiresCompleteKeyurlPublicKeyCrsAndRpcProofPerContext,
    "aggregate complete asset proof",
  );
  invariant(
    candidate.liveExecution.frontendOwnership.healthWithoutSocketOwnershipFails,
    "socket ownership before health",
  );
  invariant(
    !candidate.liveExecution.frontendOwnership.leaderAbsenceAloneProvesExit &&
      candidate.liveExecution.frontendOwnership.survivingProcessGroupMembersEnumerated &&
      candidate.liveExecution.frontendOwnership.verifiedDescendantsAndPortOwnerCheckedAfterLeaderExit,
    "leaderless process-group inspection",
  );
  invariant(
    candidate.liveExecution.frontendOwnership.cleanupResultClassifications.join(",") ===
      "ALREADY_EXITED,TERMINATED_GRACEFULLY,TERMINATED_FORCIBLY,OWNERSHIP_LOST,PID_REUSE_DETECTED,AMBIGUOUS_PROCESS_GROUP",
    "closed cleanup result classifications",
  );
  invariant(candidate.liveExecution.frontendOwnership.gracefulSignal === "SIGTERM", "graceful cleanup signal");
  invariant(
    candidate.liveExecution.frontendOwnership.boundedEscalationSignal === "SIGKILL",
    "bounded escalation signal",
  );
  invariant(candidate.liveExecution.cleanup.containmentRevalidatedBeforeDeletion, "temporary containment validation");
  invariant(
    candidate.liveExecution.cleanup.unresolvedOwnershipRetainsPrivateRunDirectory &&
      candidate.liveExecution.cleanup.privateRunDirectoryDeletionRequiresVerifiedExitOrTermination,
    "unresolved cleanup retains diagnostics",
  );
  invariant(candidate.browserRequirements.executableDiscovery.regularFileRequired, "regular browser file");
  invariant(
    candidate.browserRequirements.executableDiscovery.playwrightResolutionContext ===
      "FRONTEND_INSTALLED_@PLAYWRIGHT_TEST" &&
      candidate.browserRequirements.executableDiscovery.playwrightResolutionMechanism ===
        "CREATE_REQUIRE_FROM_FRONTEND_PACKAGE_JSON" &&
      candidate.browserRequirements.executableDiscovery.managedExecutableMethod === "chromium.executablePath" &&
      candidate.browserRequirements.executableDiscovery.apiAvailabilityDistinctFromManagedExecutableInstallation,
    "frontend-scoped Playwright resolution",
  );
  invariant(
    candidate.browserRequirements.executableDiscovery.selectedPathPassedToPlaywright,
    "browser path propagation",
  );
  invariant(candidate.futureEvidence.creationDuringPreparationForbidden, "no preparation evidence");
  invariant(candidate.verdictRules.BLOCKED.includes("browser unavailable"), "missing browser blocks");
  invariant(
    candidate.verdictRules.BLOCKED.includes("exact public-key or CRS asset origin unresolved"),
    "dynamic origins block",
  );
  invariant(candidate.verdictRules.FAIL.includes("mock-only success"), "mock failure rule");
  invariant(candidate.retryPolicy.selectiveContextReplacementForbidden, "anti-cherry-picking");
  invariant(candidate.reopenConditions.length === 7, "reopen conditions");

  const serialized = JSON.stringify(candidate);
  invariant(!serialized.includes("timestamp"), "deterministic protocol must not contain timestamps");
  invariant(!serialized.includes("privateKey"), "protocol must not access credentials");
  invariant(!serialized.includes("walletClient"), "protocol must not configure a wallet");
}

export function deriveProtocol(): SG5Protocol {
  validateProtocol(protocol);
  return protocol;
}

export function serializeProtocol(candidate: SG5Protocol = deriveProtocol()): string {
  validateProtocol(candidate);
  return `${JSON.stringify(candidate, null, 2)}\n`;
}

if (require.main === module) process.stdout.write(serializeProtocol());
