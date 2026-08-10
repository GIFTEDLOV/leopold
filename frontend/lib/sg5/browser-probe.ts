"use client";

import {
  SG5_LOCKED,
  SG5_ORIGINS,
  type SafeProbeObservation,
  type SafeWasmCriticalSectionObservation,
  type SanitizedProbeResult,
  type WasmCriticalSectionClassification,
  sanitizeObservation,
} from "./protocol";

const WASM_PROBE_INSTALLATION = Symbol("zama-szn4.sg5-wasm-probe-installation");
const PROBE_ABI = [
  { type: "function", name: "submit", stateMutability: "nonpayable", inputs: [{ name: "encryptedValue", type: "bytes32" }, { name: "inputProof", type: "bytes" }], outputs: [] },
  { type: "function", name: "getValue", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
] as const;

type BrowserEthereum = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: BrowserEthereum;
    __sg5UnauthorizedEthereum?: BrowserEthereum;
  }
}

export type WebAssemblyProbe = {
  snapshot: () => SafeWasmCriticalSectionObservation[];
  runCriticalSection: <T>(classification: WasmCriticalSectionClassification, operation: () => T | Promise<T>) => Promise<T>;
  restore: () => void;
};

type ProbeCounters = { successfulInstantiateCount: number; successfulInstantiateStreamingCount: number; failedCallCount: number };

export function assertBrowserEnvironment(): void {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof navigator === "undefined" || typeof WebAssembly !== "object") throw new Error("SG-5 requires a genuine browser with WebAssembly");
}

export function installWebAssemblyInstantiationProbe(): WebAssemblyProbe {
  assertBrowserEnvironment();
  const wasmObject = WebAssembly as typeof WebAssembly & { [WASM_PROBE_INSTALLATION]?: object };
  if (wasmObject[WASM_PROBE_INSTALLATION] !== undefined) throw new Error("SG-5 WASM probe already installed");
  const token = Object.freeze({});
  Object.defineProperty(wasmObject, WASM_PROBE_INSTALLATION, { configurable: true, enumerable: false, value: token, writable: false });
  let active: WasmCriticalSectionClassification | undefined;
  let restored = false;
  const originalInstantiate = WebAssembly.instantiate;
  const originalStreaming = WebAssembly.instantiateStreaming;
  const counters: Record<WasmCriticalSectionClassification, ProbeCounters> = {
    SDK_INITIALIZATION: { successfulInstantiateCount: 0, successfulInstantiateStreamingCount: 0, failedCallCount: 0 },
    SDK_ENCRYPTION: { successfulInstantiateCount: 0, successfulInstantiateStreamingCount: 0, failedCallCount: 0 },
    SDK_DECRYPTION: { successfulInstantiateCount: 0, successfulInstantiateStreamingCount: 0, failedCallCount: 0 },
  };
  function record<T>(value: T, section: WasmCriticalSectionClassification | undefined, key: keyof ProbeCounters): T {
    if (!section) return value;
    if (value && (typeof value === "object" || typeof value === "function") && "then" in value) void Promise.resolve(value).then(() => { counters[section][key] += 1; }, () => { counters[section].failedCallCount += 1; });
    else counters[section][key] += 1;
    return value;
  }
  const wrappedInstantiate = function (this: typeof WebAssembly, ...args: Parameters<typeof WebAssembly.instantiate>) { const section = active; try { return record(Reflect.apply(originalInstantiate, this, args), section, "successfulInstantiateCount"); } catch (error) { if (section) counters[section].failedCallCount += 1; throw error; } } as typeof WebAssembly.instantiate;
  WebAssembly.instantiate = wrappedInstantiate;
  const wrappedStreaming = function (this: typeof WebAssembly, ...args: Parameters<typeof WebAssembly.instantiateStreaming>) { const section = active; try { return record(Reflect.apply(originalStreaming, this, args), section, "successfulInstantiateStreamingCount"); } catch (error) { if (section) counters[section].failedCallCount += 1; throw error; } } as typeof WebAssembly.instantiateStreaming;
  if (typeof originalStreaming === "function") WebAssembly.instantiateStreaming = wrappedStreaming;
  return {
    snapshot: () => (["SDK_INITIALIZATION", "SDK_ENCRYPTION", "SDK_DECRYPTION"] as const).map((criticalSectionClassification) => ({ criticalSectionClassification, ...counters[criticalSectionClassification] })),
    runCriticalSection: async <T>(classification: WasmCriticalSectionClassification, operation: () => T | Promise<T>) => { if (restored || active) throw new Error("invalid nested/restored SG-5 WASM section"); active = classification; try { return await operation(); } finally { active = undefined; } },
    restore: () => { if (restored) return; if (wasmObject[WASM_PROBE_INSTALLATION] !== token || WebAssembly.instantiate !== wrappedInstantiate || (typeof originalStreaming === "function" && WebAssembly.instantiateStreaming !== wrappedStreaming)) throw new Error("SG-5 WASM wrapper changed unexpectedly"); WebAssembly.instantiate = originalInstantiate; WebAssembly.instantiateStreaming = originalStreaming; delete wasmObject[WASM_PROBE_INSTALLATION]; restored = true; },
  };
}

function asHex(value: unknown): value is `0x${string}` { return typeof value === "string" && /^0x[0-9a-fA-F]+$/u.test(value) && value.length > 2; }
function requireEthereum(): BrowserEthereum { if (!window.ethereum) throw new Error("SG5_BROWSER_PROVIDER_MISSING"); return window.ethereum; }
function requireAddress(value: unknown): `0x${string}` { if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(value)) throw new Error("SG5_WALLET_ADDRESS_INVALID"); return value as `0x${string}`; }

async function makeSdk(ethereum: BrowserEthereum, address: `0x${string}`, imports: { ZamaSDK: typeof import("@zama-fhe/sdk").ZamaSDK; createConfig: typeof import("@zama-fhe/sdk").createConfig; memoryStorage: typeof import("@zama-fhe/sdk").memoryStorage; sepolia: typeof import("@zama-fhe/sdk/chains").sepolia; web: typeof import("@zama-fhe/sdk/web").web; ViemProvider: typeof import("@zama-fhe/sdk/viem").ViemProvider; ViemSigner: typeof import("@zama-fhe/sdk/viem").ViemSigner; viem: typeof import("viem"); viemChains: typeof import("viem/chains") }) {
  const publicClient = imports.viem.createPublicClient({ chain: imports.viemChains.sepolia, transport: imports.viem.http(imports.sepolia.network) });
  const walletClient = imports.viem.createWalletClient({ account: address, chain: imports.viemChains.sepolia, transport: imports.viem.custom(ethereum as never) });
  const provider = new imports.ViemProvider({ publicClient });
  const signer = new imports.ViemSigner({ walletClient, ethereum: ethereum as never });
  const config = imports.createConfig({ chains: [imports.sepolia], relayers: { [imports.sepolia.id]: imports.web({ timeout: 300_000 }) }, provider, signer, storage: imports.memoryStorage, permitStorage: imports.memoryStorage, runtime: { singleThread: true, wasmAssetLoadMode: "embedded-base64" } });
  return { sdk: new imports.ZamaSDK(config), publicClient, provider, signer };
}

export async function executeRealInstalledSdkProbe(): Promise<SafeProbeObservation> {
  assertBrowserEnvironment(); const started = performance.now(); const ethereum = requireEthereum(); const wasmProbe = installWebAssemblyInstantiationProbe();
  const stage = (name: string) => console.info(`SG5_STAGE:${name}`);
  let publicKeyMaterial: unknown; let encryptedResult: { encryptedValues: readonly unknown[]; inputProof: unknown } | undefined; let handle: unknown;
  const observation: SafeProbeObservation = {
    adapterClassification: "REAL_INSTALLED_SDK", browserEnvironmentValidated: true, observedChainId: 0, providerReady: false, walletConnected: false,
    wasmInstantiationCount: 0, wasmCriticalSections: [], wasmRuntimeInitialized: false, sdkInstanceCreated: false, publicKeyRetrieved: false,
    encryptedInputBuilderCreated: false, encryptionCompleted: false, encryptedPayloadCount: 0, encryptedPayloadNonempty: false, inputProofPresent: false,
    transactionSubmitted: false, transactionConfirmed: false, transactionStatus: "NOT_RUN", transactionHash: null, transactionBlockNumber: null,
    resultHandleRead: false, authorizedDecryptionCompleted: false, authorizedPlaintextMatched: false, unauthorizedDecryptionAttempted: false,
    unauthorizedDecryptionRejected: false, forbiddenMaterialRetained: false, durationMilliseconds: 0,
  };
  try {
    stage("IMPORTS_START"); const [{ ZamaSDK, createConfig, memoryStorage }, { sepolia }, { web }, { ViemProvider, ViemSigner }, viem, viemChains] = await Promise.all([import("@zama-fhe/sdk"), import("@zama-fhe/sdk/chains"), import("@zama-fhe/sdk/web"), import("@zama-fhe/sdk/viem"), import("viem"), import("viem/chains")]); stage("IMPORTS_READY");
    const imports = { ZamaSDK, createConfig, memoryStorage, sepolia, web, ViemProvider, ViemSigner, viem, viemChains };
    const chainHex = await ethereum.request({ method: "eth_chainId" }); observation.observedChainId = Number(chainHex); stage("CHAIN_READY");
    if (observation.observedChainId !== SG5_LOCKED.chainId) throw new Error("SG5_WRONG_NETWORK_REFUSED");
    if (sepolia.id !== SG5_LOCKED.chainId || new URL(sepolia.relayerUrl).origin !== SG5_ORIGINS.relayer || new URL(sepolia.network).origin !== SG5_ORIGINS.chainRpc) throw new Error("installed Sepolia configuration drifted");
    observation.providerReady = true;
    const accounts = await ethereum.request({ method: "eth_requestAccounts" }); const address = requireAddress(Array.isArray(accounts) ? accounts[0] : undefined); observation.walletConnected = true; stage("WALLET_READY");
    const { sdk, publicClient, provider, signer } = await wasmProbe.runCriticalSection("SDK_INITIALIZATION", () => makeSdk(ethereum, address, imports)); observation.sdkInstanceCreated = true; stage("SDK_READY");
    stage("KEY_FETCH_START"); publicKeyMaterial = await sdk.relayer.fetchFheEncryptionKeyBytes(); const publicKey = publicKeyMaterial as { publicKeyBytes?: { bytes?: Uint8Array }; crsBytes?: { bytes?: Uint8Array } }; observation.publicKeyRetrieved = Boolean(publicKey.publicKeyBytes?.bytes instanceof Uint8Array && publicKey.publicKeyBytes.bytes.byteLength > 0 && publicKey.crsBytes?.bytes instanceof Uint8Array && publicKey.crsBytes.bytes.byteLength > 0); if (!observation.publicKeyRetrieved) throw new Error("empty official encryption material"); publicKeyMaterial = undefined; stage("KEY_FETCH_READY");
    stage("ENCRYPT_START"); encryptedResult = await wasmProbe.runCriticalSection("SDK_ENCRYPTION", () => sdk.encrypt({ values: [{ value: SG5_LOCKED.value, type: SG5_LOCKED.encryptedWidth }], contractAddress: SG5_LOCKED.contractAddress as `0x${string}`, userAddress: address })); observation.encryptedInputBuilderCreated = true; const payloads = encryptedResult.encryptedValues; observation.encryptedPayloadCount = Array.isArray(payloads) ? payloads.length : 0; observation.encryptedPayloadNonempty = observation.encryptedPayloadCount === 1 && asHex(payloads[0]); observation.inputProofPresent = asHex(encryptedResult.inputProof); observation.encryptionCompleted = observation.encryptedPayloadNonempty && observation.inputProofPresent; if (!observation.encryptionCompleted) throw new Error("browser encryption returned invalid contract material"); stage("ENCRYPT_READY");
    stage("TX_SUBMIT_START"); const txHash = await signer.writeContract({ address: SG5_LOCKED.contractAddress as `0x${string}`, abi: PROBE_ABI, functionName: "submit", args: [payloads[0] as `0x${string}`, encryptedResult.inputProof as `0x${string}`] }); observation.transactionSubmitted = true; observation.transactionHash = txHash; stage("TX_SUBMITTED");
    stage("TX_WAIT_START"); const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash }); observation.transactionConfirmed = receipt.status === "success"; observation.transactionStatus = receipt.status === "success" ? "SUCCESS" : "NOT_RUN"; observation.transactionBlockNumber = String(receipt.blockNumber); if (!observation.transactionConfirmed) throw new Error("SG5_TRANSACTION_FAILED"); stage("TX_CONFIRMED");
    handle = await provider.readContract({ address: SG5_LOCKED.contractAddress as `0x${string}`, abi: PROBE_ABI, functionName: "getValue", args: [] }); observation.resultHandleRead = asHex(handle); if (!observation.resultHandleRead) throw new Error("SG5_RESULT_HANDLE_MISSING"); stage("RESULT_READ");
    stage("AUTHORIZED_DECRYPT_START"); const clearValues = await wasmProbe.runCriticalSection("SDK_DECRYPTION", () => sdk.decryption.decryptValues([{ encryptedValue: handle as `0x${string}`, contractAddress: SG5_LOCKED.contractAddress as `0x${string}` }])); const clear = clearValues[handle as `0x${string}`]; observation.authorizedDecryptionCompleted = true; observation.authorizedPlaintextMatched = clear === 1n || clear === "1"; stage("AUTHORIZED_DECRYPT_DONE");
    const unauthorizedEthereum = window.__sg5UnauthorizedEthereum; if (!unauthorizedEthereum) throw new Error("SG5_UNAUTHORIZED_PROVIDER_MISSING"); observation.unauthorizedDecryptionAttempted = true; stage("UNAUTHORIZED_DECRYPT_START"); try { const unauthAccounts = await unauthorizedEthereum.request({ method: "eth_requestAccounts" }); const unauthAddress = requireAddress(Array.isArray(unauthAccounts) ? unauthAccounts[0] : undefined); const unauthorized = await makeSdk(unauthorizedEthereum, unauthAddress, imports); await unauthorized.sdk.decryption.decryptValues([{ encryptedValue: handle as `0x${string}`, contractAddress: SG5_LOCKED.contractAddress as `0x${string}` }]); observation.unauthorizedDecryptionRejected = false; } catch { observation.unauthorizedDecryptionRejected = true; } stage("UNAUTHORIZED_DECRYPT_DONE");
    observation.wasmCriticalSections = wasmProbe.snapshot(); observation.wasmInstantiationCount = observation.wasmCriticalSections.reduce((sum, section) => sum + section.successfulInstantiateCount + section.successfulInstantiateStreamingCount, 0); observation.wasmRuntimeInitialized = observation.wasmInstantiationCount > 0 && observation.encryptionCompleted;
    if (!observation.authorizedPlaintextMatched || !observation.unauthorizedDecryptionRejected) throw new Error(observation.authorizedPlaintextMatched ? "SG5_UNAUTHORIZED_DECRYPTION_ACCEPTED" : "SG5_DECRYPTION_FAILED");
    return observation;
  } finally { publicKeyMaterial = undefined; encryptedResult = undefined; handle = undefined; observation.wasmCriticalSections = wasmProbe.snapshot(); observation.wasmInstantiationCount = observation.wasmCriticalSections.reduce((sum, section) => sum + section.successfulInstantiateCount + section.successfulInstantiateStreamingCount, 0); observation.durationMilliseconds = Math.max(0, Math.round(performance.now() - started)); wasmProbe.restore(); }
}

export async function runRealBrowserProbe(): Promise<SanitizedProbeResult> { return sanitizeObservation(await executeRealInstalledSdkProbe(), "LIVE_SEPOLIA", navigator.userAgent); }
