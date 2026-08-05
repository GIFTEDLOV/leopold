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

export type WebAssemblyProbe = {
  snapshot: () => SafeWasmCriticalSectionObservation[];
  runCriticalSection: <T>(
    classification: WasmCriticalSectionClassification,
    operation: () => T | Promise<T>,
  ) => Promise<T>;
  restore: () => void;
};

const WASM_PROBE_INSTALLATION = Symbol("zama-szn4.sg5-wasm-probe-installation");

type ProbeCounters = {
  successfulInstantiateCount: number;
  successfulInstantiateStreamingCount: number;
  failedCallCount: number;
};

export function assertBrowserEnvironment(): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof navigator === "undefined" ||
    typeof WebAssembly !== "object"
  ) {
    throw new Error("SG-5 requires a genuine browser with WebAssembly");
  }
}

export function installWebAssemblyInstantiationProbe(): WebAssemblyProbe {
  assertBrowserEnvironment();
  const wasmObject = WebAssembly as typeof WebAssembly & { [WASM_PROBE_INSTALLATION]?: object };
  if (wasmObject[WASM_PROBE_INSTALLATION] !== undefined) {
    throw new Error("an SG-5 WASM probe is already installed");
  }
  const installationToken = Object.freeze({});
  Object.defineProperty(wasmObject, WASM_PROBE_INSTALLATION, {
    configurable: true,
    enumerable: false,
    value: installationToken,
    writable: false,
  });
  let activeSection: WasmCriticalSectionClassification | undefined;
  let restored = false;
  const originalInstantiate = WebAssembly.instantiate;
  const originalStreaming = WebAssembly.instantiateStreaming;
  const counters: Record<WasmCriticalSectionClassification, ProbeCounters> = {
    SDK_INITIALIZATION: {
      successfulInstantiateCount: 0,
      successfulInstantiateStreamingCount: 0,
      failedCallCount: 0,
    },
    SDK_ENCRYPTION: {
      successfulInstantiateCount: 0,
      successfulInstantiateStreamingCount: 0,
      failedCallCount: 0,
    },
  };

  function recordResult<T>(
    result: T,
    section: WasmCriticalSectionClassification | undefined,
    successKey: "successfulInstantiateCount" | "successfulInstantiateStreamingCount",
  ): T {
    if (section === undefined) return result;
    if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
      void Promise.resolve(result).then(
        () => {
          counters[section][successKey] += 1;
        },
        () => {
          counters[section].failedCallCount += 1;
        },
      );
    } else {
      counters[section][successKey] += 1;
    }
    return result;
  }

  const wrappedInstantiate = function (this: typeof WebAssembly, ...args: Parameters<typeof WebAssembly.instantiate>) {
    const section = activeSection;
    try {
      return recordResult(Reflect.apply(originalInstantiate, this, args), section, "successfulInstantiateCount");
    } catch (error) {
      if (section !== undefined) counters[section].failedCallCount += 1;
      throw error;
    }
  } as typeof WebAssembly.instantiate;
  WebAssembly.instantiate = wrappedInstantiate;

  let wrappedStreaming: typeof WebAssembly.instantiateStreaming | undefined;
  if (typeof originalStreaming === "function") {
    wrappedStreaming = function (
      this: typeof WebAssembly,
      ...args: Parameters<typeof WebAssembly.instantiateStreaming>
    ) {
      const section = activeSection;
      try {
        return recordResult(
          Reflect.apply(originalStreaming, this, args),
          section,
          "successfulInstantiateStreamingCount",
        );
      } catch (error) {
        if (section !== undefined) counters[section].failedCallCount += 1;
        throw error;
      }
    } as typeof WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = wrappedStreaming;
  }

  return {
    snapshot: () =>
      (["SDK_INITIALIZATION", "SDK_ENCRYPTION"] as const).map((criticalSectionClassification) => ({
        criticalSectionClassification,
        ...counters[criticalSectionClassification],
      })),
    runCriticalSection: async <T>(
      classification: WasmCriticalSectionClassification,
      operation: () => T | Promise<T>,
    ) => {
      if (restored) throw new Error("SG-5 WASM probe has been restored");
      if (activeSection !== undefined) throw new Error("nested SG-5 WASM critical sections are forbidden");
      activeSection = classification;
      try {
        return await operation();
      } finally {
        activeSection = undefined;
      }
    },
    restore: () => {
      if (restored) return;
      activeSection = undefined;
      if (
        wasmObject[WASM_PROBE_INSTALLATION] !== installationToken ||
        WebAssembly.instantiate !== wrappedInstantiate ||
        (wrappedStreaming !== undefined && WebAssembly.instantiateStreaming !== wrappedStreaming)
      ) {
        delete wasmObject[WASM_PROBE_INSTALLATION];
        restored = true;
        throw new Error("SG-5 WASM wrappers changed unexpectedly before restoration");
      }
      WebAssembly.instantiate = originalInstantiate;
      WebAssembly.instantiateStreaming = originalStreaming;
      delete wasmObject[WASM_PROBE_INSTALLATION];
      restored = true;
    },
  };
}

function nonemptyHex(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/u.test(value) && value.length > 2;
}

export async function executeRealInstalledSdkProbe(): Promise<SafeProbeObservation> {
  assertBrowserEnvironment();
  const started = performance.now();
  const wasmProbe = installWebAssemblyInstantiationProbe();
  let publicKeyMaterial:
    | {
        publicKeyBytes: { bytes: Uint8Array };
        crsBytes: { bytes: Uint8Array };
      }
    | undefined;
  let encryptedResult: { encryptedValues: readonly unknown[]; inputProof: unknown } | undefined;

  try {
    const { sdk } = await wasmProbe.runCriticalSection("SDK_INITIALIZATION", async () => {
      const [{ ZamaSDK, createConfig, memoryStorage }, { sepolia }, { web }, { ViemProvider }, viem, viemChains] =
        await Promise.all([
          import("@zama-fhe/sdk"),
          import("@zama-fhe/sdk/chains"),
          import("@zama-fhe/sdk/web"),
          import("@zama-fhe/sdk/viem"),
          import("viem"),
          import("viem/chains"),
        ]);

      if (
        sepolia.id !== SG5_LOCKED.chainId ||
        new URL(sepolia.relayerUrl).origin !== SG5_ORIGINS.relayer ||
        new URL(sepolia.network).origin !== SG5_ORIGINS.chainRpc
      ) {
        throw new Error("installed Sepolia configuration drifted from the preregistered protocol");
      }

      const publicClient = viem.createPublicClient({
        chain: viemChains.sepolia,
        transport: viem.http(sepolia.network),
      });
      const provider = new ViemProvider({ publicClient });
      const config = createConfig({
        chains: [sepolia],
        relayers: { [sepolia.id]: web({ timeout: 300_000 }) },
        provider,
        storage: memoryStorage,
        permitStorage: memoryStorage,
        runtime: {
          singleThread: true,
          wasmAssetLoadMode: "embedded-base64",
        },
      });
      return { sdk: new ZamaSDK(config) };
    });

    publicKeyMaterial = await sdk.relayer.fetchFheEncryptionKeyBytes();
    const publicKeyRetrieved =
      publicKeyMaterial.publicKeyBytes.bytes instanceof Uint8Array &&
      publicKeyMaterial.publicKeyBytes.bytes.byteLength > 0 &&
      publicKeyMaterial.crsBytes.bytes instanceof Uint8Array &&
      publicKeyMaterial.crsBytes.bytes.byteLength > 0;
    publicKeyMaterial = undefined;
    if (!publicKeyRetrieved) throw new Error("official Sepolia public encryption key retrieval was empty");

    encryptedResult = await wasmProbe.runCriticalSection("SDK_ENCRYPTION", () =>
      sdk.encrypt({
        values: [{ value: SG5_LOCKED.value, type: SG5_LOCKED.encryptedWidth }],
        contractAddress: SG5_LOCKED.contractAddress,
        userAddress: SG5_LOCKED.userAddress,
      }),
    );

    const payloads = encryptedResult.encryptedValues;
    const payloadCount = Array.isArray(payloads) ? payloads.length : 0;
    const payloadNonempty = payloadCount === 1 && nonemptyHex(payloads[0]);
    const proofPresent = nonemptyHex(encryptedResult.inputProof);
    const wasmCriticalSections = wasmProbe.snapshot();
    const wasmCount = wasmCriticalSections.reduce(
      (total, section) => total + section.successfulInstantiateCount + section.successfulInstantiateStreamingCount,
      0,
    );

    return {
      adapterClassification: "REAL_INSTALLED_SDK",
      browserEnvironmentValidated: true,
      wasmInstantiationCount: wasmCount,
      wasmCriticalSections,
      wasmRuntimeInitialized: wasmCount > 0 && payloadNonempty && proofPresent,
      sdkInstanceCreated: true,
      publicKeyRetrieved,
      encryptedInputBuilderCreated: true,
      encryptionCompleted: payloadNonempty && proofPresent,
      encryptedPayloadCount: payloadCount,
      encryptedPayloadNonempty: payloadNonempty,
      inputProofPresent: proofPresent,
      durationMilliseconds: Math.max(0, Math.round(performance.now() - started)),
    };
  } finally {
    publicKeyMaterial = undefined;
    encryptedResult = undefined;
    wasmProbe.restore();
  }
}

export async function runRealBrowserProbe(): Promise<SanitizedProbeResult> {
  const observation = await executeRealInstalledSdkProbe();
  return sanitizeObservation(observation, "LIVE_SEPOLIA", navigator.userAgent);
}
