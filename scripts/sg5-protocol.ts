import { createHash } from "node:crypto";

export const SG5_PROTOCOL_VERSION = "sg5-browser-capability-v2" as const;
export const SG5_PREPARATION_STATUS = "PREPARED_LIVE_BROWSER_EXECUTION_REQUIRED" as const;
export const SG5_LIVE_ACK = "I_UNDERSTAND_THIS_CONTACTS_SEPOLIA" as const;

const protocol = {
  schema: "zama-szn4.sg5-browser-capability-protocol.v2",
  protocolVersion: SG5_PROTOCOL_VERSION,
  gate: "SG-5",
  gateStatus: "PENDING",
  preparationStatus: SG5_PREPARATION_STATUS,
  relationship: {
    sg1: "PASS_UNCHANGED",
    sg2: "PASS_UNCHANGED",
    sg3: "PASS_UNCHANGED",
    sg4: "PASS_UNCHANGED",
    sg5: "PENDING_LIVE_BROWSER_EXECUTION",
  },
  installedLineage: {
    next: { package: "next", version: "16.3.0" },
    react: { package: "react", version: "19.2.8" },
    typescript: { package: "typescript", version: "5.9.3" },
    playwright: { package: "@playwright/test", version: "1.62.1" },
    viem: { package: "viem", version: "2.55.10" },
    zamaBrowserSdk: { package: "@zama-fhe/sdk", version: "3.4.0" },
    zamaReactSdk: { package: "@zama-fhe/react-sdk", version: "3.4.0" },
    fhevmSolidity: { package: "@fhevm/solidity", version: "0.11.1" },
  },
  lockedProbe: {
    network: "Ethereum Sepolia",
    chainId: "11155111",
    contractAddress: "0xfc672ca5846896A7A135943E79dd11283c38FE78",
    encryptedWidth: "euint64",
    plaintextClassification: "FIXED_TEST_VALUE_ONE",
    fixedPlaintext: "1",
    sdkEncryptionMethod: "ZamaSDK.encrypt",
    contractArtifact: "SG5BrowserProbe",
    requiredColdContexts: "2",
  },
  browserRequirements: {
    realChromium: true,
    nodeExecutionForbiddenForFHEPath: true,
    cleanContext: true,
    serviceWorkersBlocked: true,
    emptyStorageRequired: true,
    productionBundleRequired: true,
    refreshRepeatRequired: true,
  },
  browserApi: {
    sdkInitialization: "@zama-fhe/sdk ZamaSDK + createConfig",
    encryptedInput: "ZamaSDK.encrypt",
    providerAdapter: "ViemProvider + ViemSigner",
    userDecryption: "sdk.decryption.decryptValues",
    inputType: "euint64",
    boundedRandomnessNotUsed: true,
  },
  installedSepoliaConfiguration: {
    gatewayChainId: "10901",
    relayerOrigin: "https://relayer.testnet.zama.org",
    chainRpcOrigin: "https://ethereum-sepolia-rpc.publicnode.com",
  },
  assetOriginAuthority: {
    dynamicAssetOriginsResolved: true,
    publicKeyAssetOrigin: "https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com",
    publicKeyAssetPathPrefix: "/PUB-p1/PublicKey/",
    crsAssetOrigin: "https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com",
    crsAssetPathPrefix: "/PUB-p1/CRS/",
    crsAssetRequired: true,
    discovery: "authorized read-only GET /v2/keyurl",
  },
  networkPolicy: {
    allowedOrigins: [
      "http://localhost:3000",
      "https://relayer.testnet.zama.org",
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com",
    ],
    officialRelayerPathNamespace: "/v2/",
    embeddedRuntimeAssetSchemes: ["data:"],
    requiredCategories: ["RELAYER_KEYURL_METADATA", "RELAYER_RUNTIME", "PUBLIC_KEY_ASSET", "CRS_ASSET", "SEPOLIA_RPC"],
    criticalFailuresDisallowed: true,
    secretsAndBodiesNotPersisted: true,
  },
  scenarios: [
    "SG5-01_CLEAN_LOAD",
    "SG5-02_SDK_INITIALIZATION",
    "SG5-03_SEPOLIA_PROVIDER",
    "SG5-04_WRONG_NETWORK",
    "SG5-05_BROWSER_ENCRYPTION",
    "SG5-06_LIVE_ENCRYPTED_TRANSACTION",
    "SG5-07_RESULT_READBACK",
    "SG5-08_AUTHORIZED_DECRYPTION",
    "SG5-09_UNAUTHORIZED_ACCESS",
    "SG5-10_FRESH_CONTEXT_REPEAT",
    "SG5-11_PRODUCTION_BUILD",
  ],
  walletModel: {
    automation: "Node-side EIP-1193 bridge signs only through a test wallet supplied by runtime environment",
    production: "standard browser wallet/EIP-1193 interface",
    frontendNeverReceivesPrivateKey: true,
    unauthorizedIdentityMustBeRejected: true,
  },
  forbiddenMaterial: [
    "private keys",
    "seed phrases",
    "RPC secrets",
    "raw ciphertexts",
    "input proofs",
    "encrypted handles",
    "signed payloads",
    "provider objects",
    "browser storage dumps",
  ],
  productionSafety: {
    probeOnly: true,
    productionPrizePoolUntouched: true,
    noRandomTicket: true,
    noWinnerSelection: true,
    noProductionProtocolBuild: true,
  },
  evidence: {
    path: "evidence/cp0/SG5_BROWSER_CAPABILITY.json",
    sidecarPath: "evidence/cp0/SG5_BROWSER_CAPABILITY.json.sha256",
    requiredMarker: "SG5_EVIDENCE_VALID",
    rawSecretsForbidden: true,
  },
  verdict: {
    pass: [
      "two independent clean Chromium contexts",
      "production bundle lifecycle",
      "real browser SDK encryption",
      "successful Sepolia transaction",
      "readback",
      "authorized and unauthorized decryption checks",
      "wrong-network refusal",
      "zero critical browser errors",
      "validated evidence",
    ],
    retry: "preserve failed attempts; rerun complete set only",
    final: "SG5 CLOSED — VERIFIED",
  },
} as const;

export type SG5Protocol = typeof protocol;
export function validateProtocol(candidate: SG5Protocol = protocol): void {
  if (candidate.schema !== "zama-szn4.sg5-browser-capability-protocol.v2")
    throw new Error("SG5 protocol schema mismatch");
  if (candidate.protocolVersion !== SG5_PROTOCOL_VERSION) throw new Error("SG5 protocol version mismatch");
  if (candidate.relationship.sg4 !== "PASS_UNCHANGED") throw new Error("SG-4 relationship is not closed unchanged");
  if (
    candidate.lockedProbe.chainId !== "11155111" ||
    candidate.lockedProbe.contractAddress !== "0xfc672ca5846896A7A135943E79dd11283c38FE78" ||
    candidate.lockedProbe.encryptedWidth !== "euint64"
  )
    throw new Error("SG5 probe identity drifted");
  if (
    candidate.browserRequirements.productionBundleRequired !== true ||
    candidate.browserRequirements.cleanContext !== true
  )
    throw new Error("browser requirements weakened");
  if (candidate.assetOriginAuthority.dynamicAssetOriginsResolved !== true) throw new Error("asset origins unresolved");
  if (candidate.assetOriginAuthority.publicKeyAssetOrigin !== candidate.assetOriginAuthority.crsAssetOrigin)
    throw new Error("unexpected asset-origin drift");
  if (candidate.scenarios.length !== 11 || !candidate.scenarios.includes("SG5-09_UNAUTHORIZED_ACCESS"))
    throw new Error("scenario set drifted");
  if (
    candidate.walletModel.frontendNeverReceivesPrivateKey !== true ||
    candidate.productionSafety.productionPrizePoolUntouched !== true
  )
    throw new Error("security invariant weakened");
}

export function deriveProtocol(): SG5Protocol {
  validateProtocol(protocol);
  return protocol;
}
export function serializeProtocol(candidate: SG5Protocol = deriveProtocol()): string {
  validateProtocol(candidate);
  return `${JSON.stringify(candidate, null, 2)}\n`;
}
export function protocolDigest(candidate: SG5Protocol = deriveProtocol()): string {
  return createHash("sha256").update(serializeProtocol(candidate), "utf8").digest("hex");
}

if (require.main === module) {
  const value = deriveProtocol();
  process.stdout.write(`${JSON.stringify({ protocol: value, protocolSha256: protocolDigest(value) }, null, 2)}\n`);
}
