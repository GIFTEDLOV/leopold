import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertBrowserEnvironment, installWebAssemblyInstantiationProbe } from "../lib/sg5/browser-probe";
import {
  SG5_LIVE_ACK,
  SG5_LOCKED,
  SG5_ORIGINS,
  SG5_PAGE_ENABLE,
  SG5_PREPARATION_STATUS,
  SG5_PROTOCOL_VERSION,
  assertSanitizedAggregateResult,
  assertSanitizedAggregateResultForTestAuthority,
  assertSanitizedResult,
  attachHarnessObservations,
  buildNetworkFailureObservation,
  buildResponseNetworkObservation,
  classifyRedirect,
  classifyNetworkUrl,
  controlledStructuralObservation,
  hasRequiredNetworkProof,
  liveModeAcknowledged,
  probeRouteEnabled,
  sanitizeObservation,
} from "../lib/sg5/protocol";
import { serializeProtocol } from "../../scripts/sg5-protocol";

const root = resolve(__dirname, "../..");
const browserSource = readFileSync(resolve(root, "frontend/lib/sg5/browser-probe.ts"), "utf8");
const pageSource = readFileSync(resolve(root, "frontend/app/__sg5__/page.tsx"), "utf8");
const specSource = readFileSync(resolve(root, "frontend/e2e/sg5-browser.spec.ts"), "utf8");
const launcherSource = readFileSync(resolve(root, "scripts/sg5-launcher.cjs"), "utf8");
const protocolSource = readFileSync(resolve(root, "scripts/sg5-protocol.ts"), "utf8");
const require = createRequire(import.meta.url);
const launcher = require(resolve(root, "scripts/sg5-launcher.cjs"));

function structuralResult() {
  return sanitizeObservation(controlledStructuralObservation(), "OFFLINE_STRUCTURAL", "Chromium/123.0");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mutable(value: object): Record<PropertyKey, unknown> {
  return value as unknown as Record<PropertyKey, unknown>;
}

function completeRealObservation() {
  return {
    adapterClassification: "REAL_INSTALLED_SDK" as const,
    browserEnvironmentValidated: true,
    wasmInstantiationCount: 1,
    wasmCriticalSections: [
      {
        criticalSectionClassification: "SDK_INITIALIZATION" as const,
        successfulInstantiateCount: 0,
        successfulInstantiateStreamingCount: 0,
        failedCallCount: 0,
      },
      {
        criticalSectionClassification: "SDK_ENCRYPTION" as const,
        successfulInstantiateCount: 1,
        successfulInstantiateStreamingCount: 0,
        failedCallCount: 0,
      },
    ],
    wasmRuntimeInitialized: true,
    sdkInstanceCreated: true,
    publicKeyRetrieved: true,
    encryptedInputBuilderCreated: true,
    encryptionCompleted: true,
    encryptedPayloadCount: 1,
    encryptedPayloadNonempty: true,
    inputProofPresent: true,
    durationMilliseconds: 1,
  };
}

function validPreparedAggregate() {
  return {
    schema: "zama-szn4.sg5-browser-probe-aggregate.v1",
    protocolVersion: SG5_PROTOCOL_VERSION,
    status: SG5_PREPARATION_STATUS,
    executionMode: "OFFLINE_STRUCTURAL",
    requiredColdContexts: "2",
    passedColdContexts: "0",
    blockerClassification: "DYNAMIC_ASSET_ORIGINS_UNRESOLVED",
    failureClassification: "NONE",
    excludedMockContexts: "0",
    dynamicAssetOriginsResolved: false,
    publicKeyAssetOriginCommitted: false,
    crsAssetOriginCommitted: false,
    crsAssetRequired: true,
    contexts: [],
  };
}

const futureAuthority = Object.freeze({
  dynamicAssetOriginsResolved: true,
  publicKeyAssetOrigin: "https://public-key-assets.example.invalid",
  publicKeyAssetPathPrefix: "/public-key",
  crsAssetOrigin: "https://crs-assets.example.invalid",
  crsAssetPathPrefix: "/crs",
  crsAssetRequired: true,
});

function successfulNetworkProof() {
  return [
    {
      originClassification: "OFFICIAL_RELAYER" as const,
      requestCategory: "RELAYER_KEYURL_METADATA" as const,
      statusCategory: "SUCCESS_2XX" as const,
      durationMilliseconds: "1",
      redirectClassification: "NONE" as const,
      success: true,
    },
    {
      originClassification: "OFFICIAL_PUBLIC_KEY_ASSET" as const,
      requestCategory: "PUBLIC_KEY_ASSET" as const,
      statusCategory: "SUCCESS_2XX" as const,
      durationMilliseconds: "1",
      redirectClassification: "ALLOWED_REGISTERED_ORIGIN" as const,
      success: true,
    },
    {
      originClassification: "OFFICIAL_CRS_ASSET" as const,
      requestCategory: "CRS_ASSET" as const,
      statusCategory: "SUCCESS_2XX" as const,
      durationMilliseconds: "1",
      redirectClassification: "ALLOWED_REGISTERED_ORIGIN" as const,
      success: true,
    },
    {
      originClassification: "OFFICIAL_CHAIN_RPC" as const,
      requestCategory: "SEPOLIA_RPC" as const,
      statusCategory: "SUCCESS_2XX" as const,
      durationMilliseconds: "1",
      redirectClassification: "NONE" as const,
      success: true,
    },
  ];
}

function futureCompleteContext() {
  const context = clone(sanitizeObservation(completeRealObservation(), "LIVE_SEPOLIA", "Chromium/123"));
  Object.assign(context, {
    status: "CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT",
    finalVerdict: "AWAITING_PLAYWRIGHT_HARNESS_VERDICT",
    blockerClassification: "NONE",
    networkObservations: successfulNetworkProof(),
  });
  return context;
}

function futurePassAggregate() {
  const context = futureCompleteContext();
  return {
    ...validPreparedAggregate(),
    status: "PASS",
    executionMode: "LIVE_SEPOLIA",
    blockerClassification: "NONE",
    passedColdContexts: "2",
    dynamicAssetOriginsResolved: true,
    publicKeyAssetOriginCommitted: true,
    crsAssetOriginCommitted: true,
    contexts: [clone(context), clone(context)],
  };
}

describe("SG-5 locked capability", () => {
  it("locks the protocol version", () => expect(SG5_PROTOCOL_VERSION).toBe("sg5-browser-capability-v1"));
  it("keeps preparation non-PASS", () =>
    expect(SG5_PREPARATION_STATUS).toBe("PREPARED_LIVE_BROWSER_EXECUTION_REQUIRED"));
  it("locks Sepolia", () => expect(SG5_LOCKED.chainId).toBe(11155111));
  it("locks the SG-1 counter", () =>
    expect(SG5_LOCKED.contractAddress).toBe("0x332C58e28Bb31c902ddd370265eBBF1030299bC7"));
  it("locks the public user", () => expect(SG5_LOCKED.userAddress).toBe("0x57357D26D1f56eca4556d271078A0239a7696Bbf"));
  it("locks value one as bigint", () => expect(SG5_LOCKED.value).toBe(1n));
  it("locks euint64", () => expect(SG5_LOCKED.encryptedWidth).toBe("euint64"));
  it("locks two cold contexts", () => expect(SG5_LOCKED.coldContextCount).toBe(2));
  it("locks the installed SDK lineage", () => expect(SG5_LOCKED.sdkVersion).toBe("3.4.0"));
  it("locks the exact live acknowledgment", () => expect(SG5_LIVE_ACK).toBe("I_UNDERSTAND_THIS_CONTACTS_SEPOLIA"));
});

describe("SG-5 executed sanitizer and state model", () => {
  it("produces structural-only status", () => expect(structuralResult().status).toBe("STRUCTURAL_PASS_NOT_LIVE"));
  it("cannot turn a fake into live capability success", () => {
    const result = sanitizeObservation(controlledStructuralObservation(), "LIVE_SEPOLIA", "Chromium/123.0");
    expect(result.status).toBe("FAIL");
    expect(result.finalVerdict).toBe("FAIL");
  });
  it("requires actual WASM execution count", () => {
    expect(structuralResult().wasmInstantiationCount).toBe("0");
    expect(structuralResult().wasmRuntimeInitialized).toBe(false);
  });
  it("requires public-key retrieval", () => {
    const observation = { ...controlledStructuralObservation(), publicKeyRetrieved: true };
    expect(() => sanitizeObservation(observation, "OFFLINE_STRUCTURAL", "Chromium/123.0")).toThrow();
  });
  it("requires one encrypted payload", () => {
    expect(structuralResult().encryptedPayloadCount).toBe("0");
  });
  it("requires a nonempty encrypted payload", () => {
    expect(structuralResult().encryptedPayloadNonempty).toBe(false);
  });
  it("requires input-proof presence", () => {
    expect(structuralResult().inputProofPresent).toBe(false);
  });
  it("never retains forbidden material", () => expect(structuralResult().forbiddenMaterialRetained).toBe(false));
  it("never reports a wallet request", () => expect(structuralResult().walletRequested).toBe(false));
  it("never reports an account authorization", () =>
    expect(structuralResult().accountAuthorizationRequested).toBe(false));
  it("never reports a signature request", () => expect(structuralResult().signatureRequested).toBe(false));
  it("never reports a transaction", () => expect(structuralResult().transactionSubmitted).toBe(false));
  it("encodes counters as decimal strings", () => {
    const result = structuralResult();
    expect(result.wasmInstantiationCount).toBe("0");
    expect(result.encryptedPayloadCount).toBe("0");
  });
  it("rejects unsafe counters", () => {
    const observation = { ...controlledStructuralObservation(), durationMilliseconds: Number.MAX_SAFE_INTEGER + 1 };
    expect(() => sanitizeObservation(observation, "OFFLINE_STRUCTURAL", "Chromium/123.0")).toThrow();
  });
  it("validates the complete safe shape", () => expect(() => assertSanitizedResult(structuralResult())).not.toThrow());
});

describe("SG-5 forbidden-field rejection", () => {
  for (const field of [
    "publicKeyBytes",
    "ciphertext",
    "inputProofBytes",
    "encryptedHandle",
    "signature",
    "provider",
    "sdk",
    "completeResponse",
    "headers",
    "cookies",
    "rawTransaction",
  ]) {
    it(`rejects extra ${field}`, () => {
      const candidate = { ...structuralResult(), [field]: "forbidden" };
      expect(() => assertSanitizedResult(candidate)).toThrow("fields drifted");
    });
  }
});

describe("SG-5 exhaustive result validation", () => {
  it("accepts the valid non-PASS preparation aggregate", () =>
    expect(() => assertSanitizedAggregateResult(validPreparedAggregate())).not.toThrow());

  for (const [field, value] of [
    ["wasmRuntimeInitialized", false],
    ["publicKeyRetrieved", false],
    ["encryptionCompleted", false],
    ["inputProofPresent", false],
    ["consoleErrorCount", "1"],
  ] as const) {
    it(`rejects a live capability state with ${field} drift`, () => {
      const candidate = mutable(clone(sanitizeObservation(completeRealObservation(), "LIVE_SEPOLIA", "Chromium/123")));
      candidate.status = "CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT";
      candidate.finalVerdict = "AWAITING_PLAYWRIGHT_HARNESS_VERDICT";
      candidate.blockerClassification = "NONE";
      candidate[field] = value;
      expect(() => assertSanitizedResult(candidate)).toThrow();
    });
  }

  it("rejects aggregate PASS when one cold context fails", () => {
    const context = futureCompleteContext();
    const failed = mutable(clone(context));
    failed.status = "FAIL";
    failed.finalVerdict = "FAIL";
    failed.failureClassification = "BROWSER_ERROR";
    failed.pageErrorCount = "1";
    const aggregate = {
      ...futurePassAggregate(),
      passedColdContexts: "1",
      contexts: [context, failed],
    };
    expect(() => assertSanitizedAggregateResultForTestAuthority(aggregate, futureAuthority)).toThrow();
  });

  it("accepts complete future PASS only against separately committed exact asset authority", () =>
    expect(() => assertSanitizedAggregateResultForTestAuthority(futurePassAggregate(), futureAuthority)).not.toThrow());

  it("does not expose the test authority override to development or live execution", () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      expect(() => assertSanitizedAggregateResultForTestAuthority(futurePassAggregate(), futureAuthority)).toThrow(
        "unavailable outside unit tests",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects PASS against the current unresolved asset-origin authority", () =>
    expect(() => assertSanitizedAggregateResult(futurePassAggregate())).toThrow("authority"));

  it("rejects PASS from structural or mock mode", () => {
    const aggregate = {
      ...validPreparedAggregate(),
      status: "PASS",
      blockerClassification: "NONE",
      contexts: [structuralResult(), structuralResult()],
    };
    expect(() => assertSanitizedAggregateResult(aggregate)).toThrow();
  });

  it("requires accountAuthorizationRequested", () => {
    const candidate = mutable(clone(structuralResult()));
    delete candidate.accountAuthorizationRequested;
    expect(() => assertSanitizedResult(candidate)).toThrow("fields drifted");
  });

  it("rejects account authorization", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.accountAuthorizationRequested = true;
    expect(() => assertSanitizedResult(candidate)).toThrow();
  });

  it("rejects nested ciphertext", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.status = { ciphertext: "forbidden-test-marker" };
    expect(() => assertSanitizedResult(candidate)).toThrow();
  });

  it("rejects nested proof bytes in an array", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.networkObservations = [{ inputProofBytes: [1, 2, 3] }];
    expect(() => assertSanitizedResult(candidate)).toThrow();
  });

  it("rejects symbol-keyed properties", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate[Symbol("ciphertext")] = "forbidden-test-marker";
    expect(() => assertSanitizedResult(candidate)).toThrow("symbol");
  });

  it("rejects non-enumerable properties", () => {
    const candidate = clone(structuralResult());
    Object.defineProperty(candidate, "ciphertext", { value: "forbidden-test-marker", enumerable: false });
    expect(() => assertSanitizedResult(candidate)).toThrow("non-enumerable");
  });

  it("rejects accessors without invoking them", () => {
    const candidate = clone(structuralResult());
    let invoked = false;
    Object.defineProperty(candidate, "ciphertext", {
      enumerable: true,
      get() {
        invoked = true;
        return "forbidden-test-marker";
      },
    });
    expect(() => assertSanitizedResult(candidate)).toThrow("accessor");
    expect(invoked).toBe(false);
  });

  it("rejects typed arrays", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.status = new Uint8Array([1]);
    expect(() => assertSanitizedResult(candidate)).toThrow("forbidden object type");
  });

  it("rejects SDK-like class instances", () => {
    class FakeSdk {}
    const candidate = mutable(clone(structuralResult()));
    candidate.status = new FakeSdk();
    expect(() => assertSanitizedResult(candidate)).toThrow("plain object");
  });

  it("rejects unknown nested properties", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.networkObservations = [
      {
        originClassification: "LOCALHOST",
        requestCategory: "LOCAL_FRONTEND_ASSET",
        statusCategory: "SUCCESS_2XX",
        durationMilliseconds: "1",
        redirectClassification: "NONE",
        success: true,
        unknown: false,
      },
    ];
    expect(() => assertSanitizedResult(candidate)).toThrow("fields drifted");
  });

  it("rejects cyclic objects", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.status = candidate;
    expect(() => assertSanitizedResult(candidate)).toThrow("cycle");
  });

  it("rejects sparse arrays and custom array prototypes", () => {
    const sparse = mutable(clone(structuralResult()));
    const observations = new Array(1);
    sparse.networkObservations = observations;
    expect(() => assertSanitizedResult(sparse)).toThrow("implicit or missing array entry");

    const custom = mutable(clone(structuralResult()));
    const customObservations: unknown[] = [];
    Object.setPrototypeOf(customObservations, Object.create(Array.prototype));
    custom.networkObservations = customObservations;
    expect(() => assertSanitizedResult(custom)).toThrow("unexpected array prototype");
  });

  it("rejects null-prototype records", () => {
    const candidate = Object.assign(Object.create(null), clone(structuralResult()));
    expect(() => assertSanitizedResult(candidate)).toThrow("plain object");
  });

  it("rejects authenticated URLs even in an allowed field", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.browserVersion = "https://user:secret@relayer.testnet.zama.org/v2/keyurl";
    expect(() => assertSanitizedResult(candidate)).toThrow("browserVersion");
  });

  for (const [status, blocker, failure] of [
    ["BLOCKED", "NONE", "NONE"],
    ["FAIL", "NONE", "NONE"],
    [SG5_PREPARATION_STATUS, "NONE", "NONE"],
  ] as const) {
    it(`rejects contradictory aggregate ${status}`, () => {
      const candidate = {
        ...validPreparedAggregate(),
        status,
        blockerClassification: blocker,
        failureClassification: failure,
      };
      expect(() => assertSanitizedAggregateResult(candidate)).toThrow();
    });
  }
});

describe("SG-5 executed canonical network policy", () => {
  it("classifies only the exact relayer keyurl metadata path", () =>
    expect(classifyNetworkUrl("https://relayer.testnet.zama.org/v2/keyurl")).toEqual({
      originClassification: "OFFICIAL_RELAYER",
      requestCategory: "RELAYER_KEYURL_METADATA",
    }));

  for (const url of [
    "https://user:secret@relayer.testnet.zama.org/v2/keyurl",
    "https://relayer.testnet.zama.org:443/v2/keyurl",
    "https://relayer.testnet.zama.org/v2/keyurl#fragment",
    "https://relayer.testnet.zama.org/v2/keyurl?redirect=1",
    "http://relayer.testnet.zama.org/v2/keyurl",
    "https://sub.relayer.testnet.zama.org/v2/keyurl",
    "https://%72elayer.testnet.zama.org/v2/keyurl",
    "https://relayer.testnet.zama.org/v2/other",
    "https://127.0.0.1/v2/keyurl",
  ]) {
    it(`rejects noncanonical or forbidden URL ${url}`, () => expect(() => classifyNetworkUrl(url)).toThrow());
  }

  it("attaches only closed sanitized request metadata", () => {
    const result = attachHarnessObservations(
      structuralResult(),
      [
        {
          originClassification: "LOCALHOST",
          requestCategory: "LOCAL_FRONTEND_ASSET",
          statusCategory: "SUCCESS_2XX",
          durationMilliseconds: "1",
          redirectClassification: "NONE",
          success: true,
        },
      ],
      { console: 0, page: 0, unhandled: 0, forbiddenNetwork: 0, authority: 0 },
    );
    expect(result.networkObservations).toHaveLength(1);
    expect(() => assertSanitizedResult(result)).not.toThrow();
  });

  it("classifies committed future asset paths only under an explicit reviewed authority", () => {
    expect(
      classifyNetworkUrl("https://public-key-assets.example.invalid/public-key/current.bin", futureAuthority),
    ).toEqual({
      originClassification: "OFFICIAL_PUBLIC_KEY_ASSET",
      requestCategory: "PUBLIC_KEY_ASSET",
    });
    expect(classifyNetworkUrl("https://crs-assets.example.invalid/crs/current.bin", futureAuthority)).toEqual({
      originClassification: "OFFICIAL_CRS_ASSET",
      requestCategory: "CRS_ASSET",
    });
    expect(() => classifyNetworkUrl("https://public-key-assets.example.invalid/other.bin", futureAuthority)).toThrow();
  });

  it("classifies only redirects whose source and target are independently registered", () => {
    expect(
      classifyRedirect(
        "https://relayer.testnet.zama.org/v2/keyurl",
        "https://public-key-assets.example.invalid/public-key/current.bin",
        futureAuthority,
      ),
    ).toBe("ALLOWED_REGISTERED_ORIGIN");
    expect(() =>
      classifyRedirect(
        "https://relayer.testnet.zama.org/v2/keyurl",
        "https://unregistered.example.invalid/key.bin",
        futureAuthority,
      ),
    ).toThrow();
  });

  it("records an allowed same-origin 302 as a transitional success and requires the terminal 200", () => {
    const transition = buildResponseNetworkObservation(
      {
        requestUrl: "https://public-key-assets.example.invalid/public-key/old.bin",
        status: 302,
        durationMilliseconds: 4,
        redirectedToUrl: "https://public-key-assets.example.invalid/public-key/current.bin",
      },
      futureAuthority,
    );
    const terminal = buildResponseNetworkObservation(
      {
        requestUrl: "https://public-key-assets.example.invalid/public-key/current.bin",
        status: 200,
        durationMilliseconds: 5,
        redirectedFromUrl: "https://public-key-assets.example.invalid/public-key/old.bin",
      },
      futureAuthority,
    );
    expect(transition).toMatchObject({
      statusCategory: "REDIRECT_3XX",
      redirectClassification: "ALLOWED_SAME_ORIGIN",
      success: true,
    });
    expect(terminal).toMatchObject({
      statusCategory: "SUCCESS_2XX",
      redirectClassification: "ALLOWED_SAME_ORIGIN",
      success: true,
    });
    const context = futureCompleteContext();
    context.networkObservations = [
      ...context.networkObservations.filter((entry) => entry.requestCategory !== "PUBLIC_KEY_ASSET"),
      transition,
      terminal,
    ];
    expect(hasRequiredNetworkProof(context, futureAuthority)).toBe(true);
  });

  it("records a registered-origin 302 using the original request's redirectedTo target", () => {
    const transition = buildResponseNetworkObservation(
      {
        requestUrl: "https://relayer.testnet.zama.org/v2/keyurl",
        status: 302,
        durationMilliseconds: 2,
        redirectedToUrl: "https://public-key-assets.example.invalid/public-key/current.bin",
      },
      futureAuthority,
    );
    expect(transition).toEqual({
      originClassification: "OFFICIAL_RELAYER",
      requestCategory: "RELAYER_KEYURL_METADATA",
      statusCategory: "REDIRECT_3XX",
      durationMilliseconds: "2",
      redirectClassification: "ALLOWED_REGISTERED_ORIGIN",
      success: true,
    });
    expect(() =>
      buildResponseNetworkObservation(
        {
          requestUrl: "https://relayer.testnet.zama.org/v2/keyurl",
          status: 302,
          durationMilliseconds: 2,
          redirectedFromUrl: "https://public-key-assets.example.invalid/public-key/current.bin",
        },
        futureAuthority,
      ),
    ).toThrow("cannot also be a redirected target");
  });

  it("validates every hop in an allowed multi-hop chain without treating transitions as terminal proof", () => {
    const first = buildResponseNetworkObservation(
      {
        requestUrl: "https://public-key-assets.example.invalid/public-key/first.bin",
        status: 301,
        durationMilliseconds: 1,
        redirectedToUrl: "https://public-key-assets.example.invalid/public-key/second.bin",
      },
      futureAuthority,
    );
    const second = buildResponseNetworkObservation(
      {
        requestUrl: "https://public-key-assets.example.invalid/public-key/second.bin",
        status: 307,
        durationMilliseconds: 2,
        redirectedToUrl: "https://public-key-assets.example.invalid/public-key/final.bin",
      },
      futureAuthority,
    );
    const context = futureCompleteContext();
    context.networkObservations = [
      ...context.networkObservations.filter((entry) => entry.requestCategory !== "PUBLIC_KEY_ASSET"),
      first,
      second,
    ];
    expect(hasRequiredNetworkProof(context, futureAuthority)).toBe(false);
    context.networkObservations.push(
      buildResponseNetworkObservation(
        {
          requestUrl: "https://public-key-assets.example.invalid/public-key/final.bin",
          status: 200,
          durationMilliseconds: 3,
          redirectedFromUrl: "https://public-key-assets.example.invalid/public-key/second.bin",
        },
        futureAuthority,
      ),
    );
    expect(hasRequiredNetworkProof(context, futureAuthority)).toBe(true);
  });

  it("fails closed for broken, forbidden, credentialed, port, query, and fragment redirect targets", () => {
    const broken = buildResponseNetworkObservation(
      {
        requestUrl: "https://relayer.testnet.zama.org/v2/keyurl",
        status: 302,
        durationMilliseconds: 1,
      },
      futureAuthority,
    );
    expect(broken).toMatchObject({
      statusCategory: "REDIRECT_3XX",
      redirectClassification: "NONE",
      success: false,
    });
    const complete = futureCompleteContext();
    complete.networkObservations.push({
      originClassification: "LOCALHOST",
      requestCategory: "LOCAL_FRONTEND_ASSET",
      statusCategory: "REDIRECT_3XX",
      durationMilliseconds: "1",
      redirectClassification: "NONE",
      success: false,
    });
    expect(hasRequiredNetworkProof(complete, futureAuthority)).toBe(false);
    for (const target of [
      "https://forbidden.example.invalid/key",
      "https://user:secret@public-key-assets.example.invalid/public-key/current.bin",
      "https://public-key-assets.example.invalid:444/public-key/current.bin",
      "https://public-key-assets.example.invalid/public-key/current.bin?token=x",
      "https://public-key-assets.example.invalid/public-key/current.bin#fragment",
    ]) {
      const observation = buildResponseNetworkObservation(
        {
          requestUrl: "https://relayer.testnet.zama.org/v2/keyurl",
          status: 302,
          durationMilliseconds: 1,
          redirectedToUrl: target,
        },
        futureAuthority,
      );
      expect(observation).toMatchObject({
        statusCategory: "REDIRECT_3XX",
        redirectClassification: "FORBIDDEN",
        success: false,
      });
    }
  });

  it("rejects terminal failures after an allowed redirect and contradictory observation combinations", () => {
    const context = futureCompleteContext();
    const allowed = buildResponseNetworkObservation(
      {
        requestUrl: "https://public-key-assets.example.invalid/public-key/old.bin",
        status: 302,
        durationMilliseconds: 1,
        redirectedToUrl: "https://public-key-assets.example.invalid/public-key/current.bin",
      },
      futureAuthority,
    );
    for (const failure of [
      buildResponseNetworkObservation(
        {
          requestUrl: "https://public-key-assets.example.invalid/public-key/current.bin",
          status: 404,
          durationMilliseconds: 2,
          redirectedFromUrl: "https://public-key-assets.example.invalid/public-key/old.bin",
        },
        futureAuthority,
      ),
      buildResponseNetworkObservation(
        {
          requestUrl: "https://public-key-assets.example.invalid/public-key/current.bin",
          status: 503,
          durationMilliseconds: 2,
          redirectedFromUrl: "https://public-key-assets.example.invalid/public-key/old.bin",
        },
        futureAuthority,
      ),
      buildNetworkFailureObservation(
        "https://public-key-assets.example.invalid/public-key/current.bin",
        2,
        "https://public-key-assets.example.invalid/public-key/old.bin",
        futureAuthority,
      ),
    ]) {
      context.networkObservations = [
        ...successfulNetworkProof().filter((entry) => entry.requestCategory !== "PUBLIC_KEY_ASSET"),
        allowed,
        failure,
      ];
      expect(hasRequiredNetworkProof(context, futureAuthority)).toBe(false);
    }

    for (const drift of [
      { statusCategory: "REDIRECT_3XX", redirectClassification: "NONE", success: true },
      { statusCategory: "REDIRECT_3XX", redirectClassification: "FORBIDDEN", success: true },
      { statusCategory: "SUCCESS_2XX", redirectClassification: "FORBIDDEN", success: true },
      { statusCategory: "CLIENT_ERROR_4XX", redirectClassification: "NONE", success: true },
      { statusCategory: "SERVER_ERROR_5XX", redirectClassification: "NONE", success: true },
      { statusCategory: "NETWORK_FAILURE", redirectClassification: "NONE", success: true },
    ]) {
      const candidate = mutable(clone(structuralResult()));
      candidate.networkObservations = [{ ...successfulNetworkProof()[0], ...drift }];
      expect(() => assertSanitizedResult(candidate)).toThrow("network status and success fields disagree");
    }
  });

  it("rejects every incomplete or contradictory future PASS network proof", () => {
    const mutations: Array<(candidate: ReturnType<typeof futurePassAggregate>) => void> = [
      (candidate) => {
        candidate.contexts[0].networkObservations = candidate.contexts[0].networkObservations.filter(
          (entry) => entry.requestCategory !== "PUBLIC_KEY_ASSET",
        );
      },
      (candidate) => {
        candidate.contexts[0].networkObservations = candidate.contexts[0].networkObservations.filter(
          (entry) => entry.requestCategory !== "CRS_ASSET",
        );
      },
      (candidate) => {
        candidate.contexts[0].networkObservations = candidate.contexts[0].networkObservations.filter((entry) =>
          ["RELAYER_KEYURL_METADATA", "SEPOLIA_RPC"].includes(entry.requestCategory),
        );
      },
      (candidate) => {
        mutable(candidate.contexts[0].networkObservations[0]).requestCategory = "PUBLIC_KEY_ASSET";
      },
      (candidate) => {
        const entry = candidate.contexts[0].networkObservations.find(
          (observation) => observation.requestCategory === "PUBLIC_KEY_ASSET",
        );
        if (entry) {
          entry.statusCategory = "SERVER_ERROR_5XX";
          entry.success = false;
        }
      },
      (candidate) => {
        const entry = candidate.contexts[0].networkObservations.find(
          (observation) => observation.requestCategory === "CRS_ASSET",
        );
        if (entry) {
          entry.statusCategory = "NETWORK_FAILURE";
          entry.success = false;
        }
      },
      (candidate) => {
        candidate.contexts[0].networkObservations[0].redirectClassification = "FORBIDDEN";
      },
      (candidate) => {
        mutable(candidate.contexts[0].networkObservations[0]).requestCategory = "UNKNOWN_CATEGORY";
      },
      (candidate) => {
        candidate.contexts[1].networkObservations = candidate.contexts[1].networkObservations.filter(
          (entry) => entry.requestCategory !== "PUBLIC_KEY_ASSET",
        );
      },
    ];
    for (const mutateCandidate of mutations) {
      const candidate = futurePassAggregate();
      mutateCandidate(candidate);
      expect(() => assertSanitizedAggregateResultForTestAuthority(candidate, futureAuthority)).toThrow();
    }
  });

  it("rejects incomplete and contradictory observation fields", () => {
    for (const mutateObservation of [
      (entry: Record<PropertyKey, unknown>) => delete entry.success,
      (entry: Record<PropertyKey, unknown>) => delete entry.redirectClassification,
      (entry: Record<PropertyKey, unknown>) => delete entry.durationMilliseconds,
      (entry: Record<PropertyKey, unknown>) => {
        entry.durationMilliseconds = "-1";
      },
      (entry: Record<PropertyKey, unknown>) => {
        entry.durationMilliseconds = "1.5";
      },
      (entry: Record<PropertyKey, unknown>) => {
        entry.statusCategory = "SUCCESS_2XX";
        entry.success = false;
      },
      (entry: Record<PropertyKey, unknown>) => {
        entry.unknown = true;
      },
    ]) {
      const candidate = mutable(clone(structuralResult()));
      const entry = mutable(successfulNetworkProof()[0]);
      mutateObservation(entry);
      candidate.networkObservations = [entry];
      expect(() => assertSanitizedResult(candidate)).toThrow();
    }
  });

  it("rejects mismatched origin and request categories", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.networkObservations = [
      {
        originClassification: "OFFICIAL_RELAYER",
        requestCategory: "SEPOLIA_RPC",
        statusCategory: "SUCCESS_2XX",
        durationMilliseconds: "1",
        redirectClassification: "NONE",
        success: true,
      },
    ];
    expect(() => assertSanitizedResult(candidate)).toThrow("disagree");
  });

  it("rejects an unbounded network observation list", () => {
    const candidate = mutable(clone(structuralResult()));
    candidate.networkObservations = Array.from({ length: 257 }, () => ({
      originClassification: "LOCALHOST",
      requestCategory: "LOCAL_FRONTEND_ASSET",
      statusCategory: "SUCCESS_2XX",
      durationMilliseconds: "1",
      redirectClassification: "NONE",
      success: true,
    }));
    expect(() => assertSanitizedResult(candidate)).toThrow("closed maximum");
  });

  it("turns browser, network, and authority observations into closed failures", () => {
    for (const counters of [
      { console: 1, page: 0, unhandled: 0, forbiddenNetwork: 0, authority: 0 },
      { console: 0, page: 1, unhandled: 0, forbiddenNetwork: 0, authority: 0 },
      { console: 0, page: 0, unhandled: 1, forbiddenNetwork: 0, authority: 0 },
      { console: 0, page: 0, unhandled: 0, forbiddenNetwork: 1, authority: 0 },
      { console: 0, page: 0, unhandled: 0, forbiddenNetwork: 0, authority: 1 },
    ]) {
      const result = attachHarnessObservations(structuralResult(), [], counters);
      expect(result.status).toBe("FAIL");
      expect(result.finalVerdict).toBe("FAIL");
    }
  });
});

describe("SG-5 browser and SDK source invariants", () => {
  it("refuses Node execution", () => expect(() => assertBrowserEnvironment()).toThrow("genuine browser"));
  it("imports the real installed SDK in the live path", () =>
    expect(browserSource).toContain('import("@zama-fhe/sdk")'));
  it("uses the installed Sepolia preset", () => expect(browserSource).toContain('import("@zama-fhe/sdk/chains")'));
  it("uses the browser relayer", () => expect(browserSource).toContain('import("@zama-fhe/sdk/web")'));
  it("uses a read-only ViemProvider", () => expect(browserSource).toContain("new ViemProvider({ publicClient })"));
  it("uses no wallet client", () => expect(browserSource).not.toContain("walletClient"));
  it("fetches the public key through the SDK", () =>
    expect(browserSource).toContain("sdk.relayer.fetchFheEncryptionKeyBytes()"));
  it("uses ZamaSDK.encrypt", () => expect(browserSource).toContain("sdk.encrypt({"));
  it("uses the exact typed euint64 input", () =>
    expect(browserSource).toContain("values: [{ value: SG5_LOCKED.value, type: SG5_LOCKED.encryptedWidth }]"));
  it("pins embedded single-thread WASM", () => {
    expect(browserSource).toContain("singleThread: true");
    expect(browserSource).toContain('wasmAssetLoadMode: "embedded-base64"');
  });
  it("observes actual WebAssembly initialization", () => {
    expect(browserSource).toContain("WebAssembly.instantiate =");
    expect(browserSource).toContain("WebAssembly.instantiateStreaming =");
  });
  it("does not use Node-only imports", () => expect(browserSource).not.toMatch(/from "node:/u));
  it("contains no transaction-writing API", () =>
    expect(browserSource).not.toMatch(/writeContract|sendTransaction|eth_sendTransaction|signTypedData|signMessage/u));
});

describe("SG-5 executed WebAssembly instrumentation", () => {
  const nativeInstantiate = WebAssembly.instantiate;
  const nativeStreaming = WebAssembly.instantiateStreaming;

  afterEach(() => {
    WebAssembly.instantiate = nativeInstantiate;
    WebAssembly.instantiateStreaming = nativeStreaming;
    vi.unstubAllGlobals();
  });

  function browserGlobals() {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    vi.stubGlobal("navigator", {});
  }

  it("rejects concurrent installation", () => {
    browserGlobals();
    const probe = installWebAssemblyInstantiationProbe();
    try {
      expect(() => installWebAssemblyInstantiationProbe()).toThrow("already installed");
    } finally {
      probe.restore();
    }
  });

  it("preserves receiver, argument identity, argument order, and a synchronous return value", async () => {
    browserGlobals();
    const receiver = { marker: true };
    const first = { first: true };
    const second = { second: true };
    const returned = { module: {}, instance: {} };
    WebAssembly.instantiate = function (this: unknown, ...args: unknown[]) {
      expect(this).toBe(receiver);
      expect(args[0]).toBe(first);
      expect(args[1]).toBe(second);
      return returned;
    } as unknown as typeof WebAssembly.instantiate;
    const probe = installWebAssemblyInstantiationProbe();
    try {
      const result = await probe.runCriticalSection("SDK_INITIALIZATION", () =>
        Reflect.apply(WebAssembly.instantiate, receiver, [first, second]),
      );
      expect(result).toBe(returned);
      expect(probe.snapshot()[0]).toMatchObject({ successfulInstantiateCount: 1, failedCallCount: 0 });
    } finally {
      probe.restore();
    }
  });

  it("preserves promise identity and counts success only after completion", async () => {
    browserGlobals();
    let resolvePromise: ((value: unknown) => void) | undefined;
    const originalPromise = new Promise((resolveResult) => {
      resolvePromise = resolveResult;
    });
    WebAssembly.instantiate = (() => originalPromise) as typeof WebAssembly.instantiate;
    const probe = installWebAssemblyInstantiationProbe();
    try {
      const operation = probe.runCriticalSection("SDK_ENCRYPTION", () => {
        const returned = WebAssembly.instantiate(new Uint8Array([0]));
        expect(returned).toBe(originalPromise);
        expect(probe.snapshot()[1].successfulInstantiateCount).toBe(0);
        resolvePromise?.({ module: {}, instance: {} });
        return returned;
      });
      await operation;
      expect(probe.snapshot()[1]).toMatchObject({ successfulInstantiateCount: 1, failedCallCount: 0 });
    } finally {
      probe.restore();
    }
  });

  it("preserves synchronous throws and asynchronous rejections while counting failures", async () => {
    browserGlobals();
    const synchronous = new Error("synchronous controlled failure");
    WebAssembly.instantiate = (() => {
      throw synchronous;
    }) as typeof WebAssembly.instantiate;
    const syncProbe = installWebAssemblyInstantiationProbe();
    try {
      await expect(
        syncProbe.runCriticalSection("SDK_INITIALIZATION", () => WebAssembly.instantiate(new Uint8Array([0]))),
      ).rejects.toBe(synchronous);
      expect(syncProbe.snapshot()[0]).toMatchObject({ successfulInstantiateCount: 0, failedCallCount: 1 });
    } finally {
      syncProbe.restore();
    }

    const asynchronous = new Error("asynchronous controlled failure");
    const rejected = Promise.reject(asynchronous);
    WebAssembly.instantiate = (() => rejected) as typeof WebAssembly.instantiate;
    const asyncProbe = installWebAssemblyInstantiationProbe();
    try {
      await expect(
        asyncProbe.runCriticalSection("SDK_ENCRYPTION", () => WebAssembly.instantiate(new Uint8Array([0]))),
      ).rejects.toBe(asynchronous);
      expect(asyncProbe.snapshot()[1]).toMatchObject({ successfulInstantiateCount: 0, failedCallCount: 1 });
    } finally {
      asyncProbe.restore();
    }
  });

  it("does not count WASM outside a registered critical section and restores originals", async () => {
    browserGlobals();
    WebAssembly.instantiate = (() =>
      Promise.resolve({ module: {}, instance: {} })) as unknown as typeof WebAssembly.instantiate;
    const original = WebAssembly.instantiate;
    const probe = installWebAssemblyInstantiationProbe();
    await WebAssembly.instantiate(new Uint8Array([0]));
    expect(probe.snapshot().every((section) => section.successfulInstantiateCount === 0)).toBe(true);
    probe.restore();
    expect(WebAssembly.instantiate).toBe(original);
    const second = installWebAssemblyInstantiationProbe();
    second.restore();
  });

  it("detects unexpected wrapper replacement instead of overwriting it", () => {
    browserGlobals();
    WebAssembly.instantiate = (() =>
      Promise.resolve({ module: {}, instance: {} })) as unknown as typeof WebAssembly.instantiate;
    const probe = installWebAssemblyInstantiationProbe();
    const replacement = (() =>
      Promise.resolve({ module: {}, instance: {} })) as unknown as typeof WebAssembly.instantiate;
    WebAssembly.instantiate = replacement;
    expect(() => probe.restore()).toThrow("changed unexpectedly");
    expect(WebAssembly.instantiate).toBe(replacement);
  });

  it("rejects nested critical sections", async () => {
    browserGlobals();
    const probe = installWebAssemblyInstantiationProbe();
    try {
      await expect(
        probe.runCriticalSection("SDK_INITIALIZATION", () =>
          probe.runCriticalSection("SDK_ENCRYPTION", () => Promise.resolve()),
        ),
      ).rejects.toThrow("nested");
    } finally {
      probe.restore();
    }
  });

  it("does not allow WASM success alone or real encryption without WASM to produce capability success", () => {
    const noEncryption = {
      ...completeRealObservation(),
      encryptionCompleted: false,
      encryptedPayloadNonempty: false,
      inputProofPresent: false,
    };
    expect(sanitizeObservation(noEncryption, "LIVE_SEPOLIA", "Chromium/123").status).toBe("FAIL");
    const noWasm = {
      ...completeRealObservation(),
      wasmInstantiationCount: 0,
      wasmRuntimeInitialized: false,
      wasmCriticalSections: completeRealObservation().wasmCriticalSections.map((section) => ({
        ...section,
        successfulInstantiateCount: 0,
      })),
    };
    expect(sanitizeObservation(noWasm, "LIVE_SEPOLIA", "Chromium/123").status).toBe("FAIL");
  });
});

describe("SG-5 executed launcher identity validation", () => {
  const serialized = serializeProtocol();
  const digest = createHash("sha256").update(serialized).digest("hex");
  const protocol = JSON.parse(serialized) as {
    lockedProbe: Record<string, unknown>;
    installedSepoliaConfiguration: Record<string, unknown>;
    publicKeyProof: Record<string, unknown>;
    liveExecution: {
      acknowledgment: Record<string, unknown>;
      blockedUntil: string[];
      frontendOwnership: Record<string, unknown>;
    };
    networkPolicy: { requestCategories: string[] };
    wasmProof: Record<string, unknown>;
    browserRequirements: { executableDiscovery: Record<string, unknown> };
    forbiddenActions: string[];
  };
  const execute = () => ({ status: 0, stdout: serialized, stderr: "" });

  it("hashes and accepts the exact generated protocol bytes", () =>
    expect(launcher.generateAndVerifyProtocol(digest, execute).digest).toBe(digest));
  it("rejects an arbitrary 64-hex digest", () =>
    expect(() => launcher.generateAndVerifyProtocol("0".repeat(64), execute)).toThrow("digest mismatch"));
  it("rejects a one-character digest mismatch", () =>
    expect(() =>
      launcher.generateAndVerifyProtocol(`${digest.slice(0, -1)}${digest.endsWith("0") ? "1" : "0"}`, execute),
    ).toThrow("digest mismatch"));
  it("rejects generated-byte drift", () =>
    expect(() =>
      launcher.generateAndVerifyProtocol(digest, () => ({ status: 0, stdout: `${serialized} `, stderr: "" })),
    ).toThrow());
  it("rejects malformed protocol JSON", () =>
    expect(() => launcher.generateAndVerifyProtocol(digest, () => ({ status: 0, stdout: "{", stderr: "" }))).toThrow(
      "malformed JSON",
    ));
  it("rejects unexpected protocol stderr", () =>
    expect(() =>
      launcher.generateAndVerifyProtocol(digest, () => ({ status: 0, stdout: serialized, stderr: "warning" })),
    ).toThrow("stderr"));

  for (const [field, value] of [
    ["chainId", "1"],
    ["contractAddress", "0x0000000000000000000000000000000000000000"],
    ["userAddress", "0x0000000000000000000000000000000000000000"],
    ["fixedPlaintext", "2"],
    ["encryptedWidth", "euint32"],
    ["requiredColdContexts", "1"],
  ] as const) {
    it(`rejects locked protocol drift in ${field}`, () => {
      const candidate = clone(protocol);
      candidate.lockedProbe[field] = value;
      expect(() => launcher.validateGeneratedProtocol(candidate)).toThrow("locked SG-5 probe values");
    });
  }

  it("rejects gateway drift", () => {
    const candidate = clone(protocol);
    candidate.installedSepoliaConfiguration.gatewayChainId = "1";
    expect(() => launcher.validateGeneratedProtocol(candidate)).toThrow("locked SG-5 probe values");
  });
  it("rejects missing dynamic-origin blockers", () => {
    const candidate = clone(protocol);
    candidate.liveExecution.blockedUntil = ["LOCAL_CHROMIUM_AVAILABLE"];
    expect(() => launcher.validateGeneratedProtocol(candidate)).toThrow("origin blockers");
  });
  it("rejects a false public-key origin authority status", () => {
    const candidate = clone(protocol);
    candidate.publicKeyProof.assetOriginsStatus = "RESOLVED";
    expect(() => launcher.validateGeneratedProtocol(candidate)).toThrow("origin authority");
  });
  it("rejects drift in network proof, process ownership, WASM exclusivity, and browser-file rules", () => {
    for (const mutateProtocol of [
      (candidate: typeof protocol) => {
        candidate.publicKeyProof.dynamicAssetOriginsResolved = true;
      },
      (candidate: typeof protocol) => {
        candidate.networkPolicy.requestCategories = ["LOCAL_FRONTEND_ASSET"];
      },
      (candidate: typeof protocol) => {
        candidate.liveExecution.frontendOwnership.spawnedListenerPidOrVerifiedDescendantRequired = false;
      },
      (candidate: typeof protocol) => {
        candidate.wasmProof.concurrentInstallationForbidden = false;
      },
      (candidate: typeof protocol) => {
        candidate.browserRequirements.executableDiscovery.regularFileRequired = false;
      },
    ]) {
      const candidate = clone(protocol);
      mutateProtocol(candidate);
      expect(() => launcher.validateGeneratedProtocol(candidate)).toThrow();
    }
  });
  it("rejects a drifted protocol live acknowledgment", () => {
    const candidate = clone(protocol);
    candidate.liveExecution.acknowledgment.exactValue = "wrong";
    expect(() => launcher.validateGeneratedProtocol(candidate)).toThrow("acknowledgment");
  });
  it("rejects removal of every authority prohibition", () => {
    for (const action of protocol.forbiddenActions) {
      const candidate = clone(protocol);
      candidate.forbiddenActions = candidate.forbiddenActions.filter((entry) => entry !== action);
      expect(() => launcher.validateGeneratedProtocol(candidate)).toThrow("authority prohibitions");
    }
  });
  it("rejects live execution while dynamic origins remain unresolved", () =>
    expect(() => launcher.assertLiveBlockersResolved(protocol)).toThrow("remain unresolved"));
  it("rejects a missing or wrong live acknowledgment", () => {
    expect(() => launcher.validateLiveAcknowledgment(undefined)).toThrow();
    expect(() => launcher.validateLiveAcknowledgment("wrong")).toThrow();
    expect(() => launcher.validateLiveAcknowledgment(launcher.LIVE_ACK)).not.toThrow();
  });

  const goodGit = { branch: "main", commit: "a".repeat(40), tree: "b".repeat(40), status: "" };
  const expectedGit = { commit: goodGit.commit, tree: goodGit.tree };
  it("accepts exact clean Git identity", () =>
    expect(() => launcher.validateGitIdentity(goodGit, expectedGit)).not.toThrow());
  for (const [name, mutation] of [
    ["wrong branch", { branch: "feature" }],
    ["wrong commit", { commit: "c".repeat(40) }],
    ["wrong tree", { tree: "d".repeat(40) }],
    ["dirty tracked worktree", { status: " M file" }],
    ["staged file", { status: "M  file" }],
    ["untracked file", { status: "?? file" }],
  ] as const) {
    it(`rejects ${name}`, () =>
      expect(() => launcher.validateGitIdentity({ ...goodGit, ...mutation }, expectedGit)).toThrow());
  }

  const goodRoot = {
    derivedRoot: launcher.TRUSTED_ROOT,
    cwd: launcher.TRUSTED_ROOT,
    gitRoot: launcher.TRUSTED_ROOT,
    rootIsSymlink: false,
  };
  it("accepts only the exact trusted root", () =>
    expect(() => launcher.validateTrustedRootSnapshot(goodRoot)).not.toThrow());
  it("rejects a copied root", () =>
    expect(() =>
      launcher.validateTrustedRootSnapshot({ ...goodRoot, derivedRoot: "/tmp/copied-zama-szn4" }),
    ).toThrow());
  it("rejects a symlink-substituted root", () =>
    expect(() => launcher.validateTrustedRootSnapshot({ ...goodRoot, rootIsSymlink: true })).toThrow());
});

describe("SG-5 executed launcher process and cleanup safety", () => {
  type ProcessRecord = {
    pid: number;
    ppid: number;
    processGroup: number;
    session: number;
    startTime: string;
    cwd: string;
    exe: string;
    cmdline: string;
    ancestry?: Array<{ pid: number; startTime: string }>;
  };

  const leader = Object.freeze({
    pid: 4100,
    ppid: 1,
    processGroup: 4100,
    session: 4100,
    startTime: "100",
    cwd: `${root}/frontend`,
    exe: "/usr/bin/node",
    cmdline: `${root}/frontend/node_modules/next/dist/bin/next dev`,
  });
  let group: { kind: string; leader: typeof leader; verifiedMembers: ProcessRecord[] };

  beforeEach(() => {
    group = { kind: "FRONTEND", leader, verifiedMembers: [{ ...leader }] };
  });

  function owner(overrides: Record<string, unknown> = {}) {
    return {
      ...leader,
      ancestry: [{ pid: leader.pid, startTime: leader.startTime }],
      ...overrides,
    };
  }

  function processAdapters({
    members = [leader],
    owners = [],
    known = new Map(members.map((member) => [member.pid, member])),
  }: {
    members?: ProcessRecord[];
    owners?: ProcessRecord[];
    known?: Map<number, ProcessRecord>;
  } = {}) {
    return {
      inspectProcess: (pid: number) => known.get(pid),
      enumerateProcessGroupMembers: () => members,
      resolvePortOwnerIdentities: () => owners,
    };
  }

  it("accepts the spawned frontend or a rigorously verified descendant as the sole listener", () => {
    expect(launcher.verifySpawnedListenerOwnership(group, [owner()]).pid).toBe(leader.pid);
    expect(
      launcher.verifySpawnedListenerOwnership(group, [
        owner({ pid: 4101, ppid: 4100, ancestry: [{ pid: 4100, startTime: "100" }] }),
      ]).pid,
    ).toBe(4101);
  });

  it("rejects unrelated, ambiguous, and wrong-group listener ownership", async () => {
    expect(() => launcher.verifySpawnedListenerOwnership(group, [])).toThrow("exactly one");
    expect(() => launcher.verifySpawnedListenerOwnership(group, [owner(), owner({ pid: 4101 })])).toThrow(
      "exactly one",
    );
    expect(() => launcher.verifySpawnedListenerOwnership(group, [owner({ processGroup: 9999 })])).toThrow(
      "not the verified",
    );
    await expect(
      launcher.waitForOwnedFrontend(group, {
        resolvePortOwnerIdentities: () => [owner({ pid: 9999, processGroup: 9999, session: 9999 })],
        fetchHealth: () => Promise.resolve({ ok: true }),
        delay: () => Promise.resolve(),
      }),
    ).rejects.toThrow("not the verified");
  });

  it("uses graceful SIGTERM and does not escalate after verified exit", async () => {
    let members = [leader];
    const signals: Array<[number, string]> = [];
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: (pid: number) => members.find((member) => member.pid === pid),
      enumerateProcessGroupMembers: () => members,
      resolvePortOwnerIdentities: () => [],
      signal: (pid: number, signal: string) => {
        signals.push([pid, signal]);
        members = [];
      },
    });
    expect(outcome).toBe("TERMINATED_GRACEFULLY");
    expect(signals).toEqual([[-4100, "SIGTERM"]]);
  });

  it("uses bounded SIGKILL only after revalidating the same process identity", async () => {
    const signals: Array<[number, string]> = [];
    let waits = 0;
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: () => leader,
      enumerateProcessGroupMembers: () => [leader],
      resolvePortOwnerIdentities: () => [],
      signal: (pid: number, signal: string) => signals.push([pid, signal]),
      waitForResolution: () =>
        Promise.resolve(
          ++waits === 2
            ? { classification: "ALREADY_EXITED", members: [], listenerOwners: [] }
            : { classification: "VERIFIED_ACTIVE", members: [leader], listenerOwners: [] },
        ),
    });
    expect(outcome).toBe("TERMINATED_FORCIBLY");
    expect(signals).toEqual([
      [-4100, "SIGTERM"],
      [-4100, "SIGKILL"],
    ]);
  });

  it("rejects PID reuse before SIGTERM and before SIGKILL", async () => {
    const reused = { ...leader, startTime: "101" };
    const firstSignals: Array<[number, string]> = [];
    const first = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: () => reused,
      enumerateProcessGroupMembers: () => [],
      resolvePortOwnerIdentities: () => [],
      signal: (pid: number, signal: string) => firstSignals.push([pid, signal]),
    });
    expect(first).toBe("PID_REUSE_DETECTED");
    expect(firstSignals).toEqual([]);

    let enumerations = 0;
    const secondSignals: Array<[number, string]> = [];
    const second = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: () => (enumerations < 1 ? leader : reused),
      enumerateProcessGroupMembers: () => {
        enumerations += 1;
        return enumerations === 1 ? [leader] : [];
      },
      resolvePortOwnerIdentities: () => [],
      signal: (pid: number, signal: string) => secondSignals.push([pid, signal]),
    });
    expect(second).toBe("PID_REUSE_DETECTED");
    expect(secondSignals).toEqual([]);
  });

  it("cleans a verified leaderless descendant that still owns port 3000", async () => {
    const descendant = owner({ pid: 4101, ppid: 1, ancestry: [], startTime: "101" });
    let alive = true;
    let ownerChecks = 0;
    const signals: Array<[number, string]> = [];
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: (pid: number) => (pid === descendant.pid && alive ? descendant : undefined),
      enumerateProcessGroupMembers: () => (alive ? [descendant] : []),
      resolvePortOwnerIdentities: () => {
        ownerChecks += 1;
        return alive ? [descendant] : [];
      },
      signal: (pid: number, signal: string) => {
        signals.push([pid, signal]);
        alive = false;
      },
    });
    expect(outcome).toBe("TERMINATED_GRACEFULLY");
    expect(ownerChecks).toBeGreaterThan(0);
    expect(signals).toEqual([[-4100, "SIGTERM"]]);
  });

  it("cleans leaderless descendants without listeners and uses one group decision for multiple members", async () => {
    const first = owner({ pid: 4101, ppid: 1, ancestry: [], startTime: "101" });
    const second = owner({ pid: 4102, ppid: 1, ancestry: [], startTime: "102" });
    let members = [first, second];
    const signals: Array<[number, string]> = [];
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: (pid: number) => members.find((member) => member.pid === pid),
      enumerateProcessGroupMembers: () => members,
      resolvePortOwnerIdentities: () => [],
      signal: (pid: number, signal: string) => {
        signals.push([pid, signal]);
        members = [];
      },
    });
    expect(outcome).toBe("TERMINATED_GRACEFULLY");
    expect(signals).toEqual([[-4100, "SIGTERM"]]);
  });

  it("revalidates and force-terminates a leaderless descendant that survives SIGTERM", async () => {
    const descendant = owner({ pid: 4101, ppid: 1, ancestry: [], startTime: "101" });
    let alive = true;
    let waits = 0;
    const signals: Array<[number, string]> = [];
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: (pid: number) => (pid === descendant.pid && alive ? descendant : undefined),
      enumerateProcessGroupMembers: () => (alive ? [descendant] : []),
      resolvePortOwnerIdentities: () => (alive ? [descendant] : []),
      signal: (pid: number, signal: string) => {
        signals.push([pid, signal]);
        if (signal === "SIGKILL") alive = false;
      },
      waitForResolution: () => {
        waits += 1;
        return Promise.resolve(
          alive
            ? { classification: "VERIFIED_ACTIVE", members: [descendant], listenerOwners: [descendant] }
            : { classification: "ALREADY_EXITED", members: [], listenerOwners: [] },
        );
      },
    });
    expect(waits).toBe(2);
    expect(outcome).toBe("TERMINATED_FORCIBLY");
    expect(signals).toEqual([
      [-4100, "SIGTERM"],
      [-4100, "SIGKILL"],
    ]);
  });

  it("never signals an unrelated leaderless port owner and reports ownership loss", async () => {
    const descendant = owner({ pid: 4101, ppid: 1, ancestry: [], startTime: "101" });
    const unrelated = owner({ pid: 9000, processGroup: 9000, session: 9000, startTime: "900" });
    const signals: Array<[number, string]> = [];
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      ...processAdapters({ members: [descendant], owners: [unrelated] }),
      signal: (pid: number, signal: string) => signals.push([pid, signal]),
    });
    expect(outcome).toBe("OWNERSHIP_LOST");
    expect(signals).toEqual([]);
  });

  it("returns ALREADY_EXITED only after checking that no member or listener remains", async () => {
    let ownerChecks = 0;
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: () => undefined,
      enumerateProcessGroupMembers: () => [],
      resolvePortOwnerIdentities: () => {
        ownerChecks += 1;
        return [];
      },
      signal: () => {
        throw new Error("must not signal");
      },
    });
    expect(outcome).toBe("ALREADY_EXITED");
    expect(ownerChecks).toBe(1);
  });

  it("never reports ALREADY_EXITED when a recorded descendant is alive but group enumeration omits it", async () => {
    const descendant = owner({ pid: 4101, ppid: 1, ancestry: [], startTime: "101" });
    const recordedGroup = {
      ...group,
      verifiedMembers: [{ ...leader }, { ...descendant }],
    };
    const signals: Array<[number, string]> = [];
    const outcome = await launcher.terminateOwnedProcessGroup(recordedGroup, {
      inspectProcess: (pid: number) => (pid === descendant.pid ? descendant : undefined),
      enumerateProcessGroupMembers: () => [],
      resolvePortOwnerIdentities: () => [],
      signal: (pid: number, signal: string) => signals.push([pid, signal]),
    });
    expect(outcome).toBe("AMBIGUOUS_PROCESS_GROUP");
    expect(signals).toEqual([]);
  });

  it("detects reused descendant PIDs and mixed group identity without signaling", async () => {
    const original = owner({ pid: 4101, ppid: 1, ancestry: [], startTime: "101" });
    const recordedGroup = Object.freeze({
      ...group,
      verifiedMembers: [{ ...leader }, { ...original }],
    });
    const reused = { ...original, startTime: "999" };
    const signals: Array<[number, string]> = [];
    expect(
      await launcher.terminateOwnedProcessGroup(recordedGroup, {
        inspectProcess: (pid: number) => (pid === reused.pid ? reused : undefined),
        enumerateProcessGroupMembers: () => [reused],
        resolvePortOwnerIdentities: () => [],
        signal: (pid: number, signal: string) => signals.push([pid, signal]),
      }),
    ).toBe("PID_REUSE_DETECTED");
    const unrelated = { ...original, pid: 4102, cmdline: "/usr/bin/node unrelated.js" };
    expect(
      await launcher.terminateOwnedProcessGroup(group, {
        inspectProcess: () => undefined,
        enumerateProcessGroupMembers: () => [original, unrelated],
        resolvePortOwnerIdentities: () => [],
        signal: (pid: number, signal: string) => signals.push([pid, signal]),
      }),
    ).toBe("AMBIGUOUS_PROCESS_GROUP");
    expect(signals).toEqual([]);
  });

  it("handles the leader exiting between preparation and SIGTERM and avoids unnecessary SIGKILL", async () => {
    const descendant = owner({ pid: 4101, ppid: 4100, startTime: "101" });
    let assessment = 0;
    let alive = true;
    const signals: Array<[number, string]> = [];
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: (pid: number) => {
        if (pid === leader.pid) return assessment === 0 ? leader : undefined;
        return pid === descendant.pid && alive ? descendant : undefined;
      },
      enumerateProcessGroupMembers: () => {
        assessment += 1;
        return alive ? (assessment === 1 ? [leader, descendant] : [descendant]) : [];
      },
      resolvePortOwnerIdentities: () => (alive ? [descendant] : []),
      signal: (pid: number, signal: string) => {
        signals.push([pid, signal]);
        alive = false;
      },
    });
    expect(outcome).toBe("TERMINATED_GRACEFULLY");
    expect(signals).toEqual([[-4100, "SIGTERM"]]);
  });

  it("does not escalate when the last verified descendant exits naturally during the bounded wait", async () => {
    const descendant = owner({ pid: 4101, ppid: 1, ancestry: [], startTime: "101" });
    const signals: Array<[number, string]> = [];
    const outcome = await launcher.terminateOwnedProcessGroup(group, {
      inspectProcess: (pid: number) => (pid === descendant.pid ? descendant : undefined),
      enumerateProcessGroupMembers: () => [descendant],
      resolvePortOwnerIdentities: () => [],
      signal: (pid: number, signal: string) => signals.push([pid, signal]),
      waitForResolution: () => Promise.resolve({ classification: "ALREADY_EXITED", members: [], listenerOwners: [] }),
    });
    expect(outcome).toBe("TERMINATED_GRACEFULLY");
    expect(signals).toEqual([[-4100, "SIGTERM"]]);
  });

  it("makes cleanup idempotent and preserves signal/exception exit semantics", async () => {
    const cleanup = vi.fn(() => Promise.resolve());
    const controller = { cleanup };
    for (const event of ["SIGINT", "SIGTERM", "SIGHUP", "uncaughtException", "unhandledRejection"]) {
      const listeners = new Map<string, () => void>();
      const runtime = {
        pid: 123,
        once: (name: string, handler: () => void) => listeners.set(name, handler),
        removeListener: (name: string) => listeners.delete(name),
        kill: vi.fn(),
        exit: vi.fn(),
      };
      const lifecycle = launcher.createLifecycleHandlers(controller, runtime);
      await lifecycle.dispatch(event);
      if (event.startsWith("SIG")) expect(runtime.kill).toHaveBeenCalledWith(123, event);
      else expect(runtime.exit).toHaveBeenCalledWith(1);
    }
    const resources = { groups: [group], runDirectory: undefined };
    const terminate = vi.fn(() => Promise.resolve("ALREADY_EXITED"));
    const idempotent = launcher.createCleanupController(resources, { terminateOwnedProcessGroup: terminate });
    await Promise.all([idempotent.cleanup(), idempotent.cleanup()]);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(5);
  });

  it("retains the private directory when process ownership remains unresolved", async () => {
    const remove = vi.fn();
    const controller = launcher.createCleanupController(
      { groups: [group], runDirectory: { directory: "/private" } },
      {
        terminateOwnedProcessGroup: () => Promise.resolve("OWNERSHIP_LOST"),
        removePrivateRunDirectory: remove,
      },
    );
    await expect(controller.cleanup()).rejects.toThrow("diagnostics retained");
    expect(remove).not.toHaveBeenCalled();
  });

  it("creates, validates, and removes a private contained run directory", () => {
    const record = launcher.createPrivateRunDirectory();
    expect(launcher.validatePrivateRunDirectory(record)).toBe(record.directoryRealpath);
    launcher.removePrivateRunDirectory(record);
  });

  it("rejects temporary-directory symlink substitution and containment escape", () => {
    const record = {
      directory: "/tmp/zama-szn4-sg5-safe",
      directoryRealpath: "/tmp/zama-szn4-sg5-safe",
      parentRealpath: "/tmp",
      prefix: "zama-szn4-sg5-",
    };
    expect(() =>
      launcher.validatePrivateRunDirectory(record, {
        realpathSync: (path: string) => path,
        lstatSync: () => ({ isSymbolicLink: () => true, isDirectory: () => false }),
      }),
    ).toThrow("substituted");
    expect(() =>
      launcher.validatePrivateRunDirectory(record, {
        realpathSync: (path: string) => (path === record.directory ? "/outside/escape" : path),
        lstatSync: () => ({ isSymbolicLink: () => false, isDirectory: () => true }),
      }),
    ).toThrow("containment");
    for (const dangerous of ["/", "/tmp", root]) {
      expect(() =>
        launcher.validatePrivateRunDirectory({ ...record, directory: dangerous, directoryRealpath: dangerous }),
      ).toThrow();
    }
  });
});

describe("SG-5 executed browser discovery and propagation", () => {
  function status(file: boolean, symbolic = false, executable = true) {
    return {
      isFile: () => file,
      isDirectory: () => !file,
      isSymbolicLink: () => symbolic,
      dev: 1,
      ino: 2,
      size: 3,
      mtimeMs: 4,
      executable,
    };
  }

  function adapter(records: Record<string, ReturnType<typeof status>>) {
    return {
      lstatSync: (path: string) => {
        const record = records[path];
        if (!record) throw new Error("missing");
        return record;
      },
      statSync: (path: string) => {
        const record = records[path];
        if (!record) throw new Error("missing");
        return record;
      },
      realpathSync: (path: string) => path,
      accessSync: (path: string) => {
        if (!records[path]?.executable) throw new Error("not executable");
      },
    };
  }

  it("rejects absent, stale, directory, symlink, and non-executable candidates", () => {
    expect(launcher.discoverBrowser([], adapter({}))).toBeUndefined();
    for (const record of [status(false), status(true, true), status(true, false, false)]) {
      expect(
        launcher.discoverBrowser(
          [{ path: "/browser", classification: "SYSTEM_CHROMIUM" }],
          adapter({ "/browser": record }),
        ),
      ).toBeUndefined();
    }
    expect(
      launcher.discoverBrowser([{ path: "/missing", classification: "SYSTEM_CHROMIUM" }], adapter({})),
    ).toBeUndefined();
  });

  it("accepts managed Chromium and system Chromium/Chrome as executable regular files", () => {
    for (const classification of ["PLAYWRIGHT_MANAGED", "SYSTEM_CHROMIUM", "SYSTEM_CHROME"]) {
      const selected = launcher.discoverBrowser(
        [{ path: "/browser", classification }],
        adapter({ "/browser": status(true) }),
      );
      expect(selected).toMatchObject({ path: "/browser", classification });
      expect(launcher.revalidateBrowserSelection(selected, adapter({ "/browser": status(true) }))).toEqual(selected);
    }
  });

  it("rejects a browser replaced or removed between discovery and launch", () => {
    const selected = launcher.discoverBrowser(
      [{ path: "/browser", classification: "SYSTEM_CHROMIUM" }],
      adapter({ "/browser": status(true) }),
    );
    const changed = status(true);
    changed.ino = 99;
    expect(() => launcher.revalidateBrowserSelection(selected, adapter({ "/browser": changed }))).toThrow("changed");
    expect(() => launcher.revalidateBrowserSelection(selected, adapter({}))).toThrow();
  });

  it("propagates the exact selected path to Playwright configuration", () => {
    const selection = launcher.discoverBrowser(
      [{ path: "/browser", classification: "SYSTEM_CHROMIUM" }],
      adapter({ "/browser": status(true) }),
    );
    expect(launcher.browserLaunchEnvironment(selection)).toEqual({ SG5_BROWSER_EXECUTABLE: "/browser" });
    expect(launcherSource).toContain("...browserLaunchEnvironment(browserSelection)");
    expect(readFileSync(resolve(root, "frontend/playwright.config.ts"), "utf8")).toContain(
      "executablePath: browserExecutable",
    );
  });

  it("resolves the installed Playwright API through the frontend package graph", () => {
    const resolved = launcher.resolvePlaywrightApi();
    expect(resolved.classification).toBe("PLAYWRIGHT_API_AVAILABLE");
    expect(typeof resolved.chromium.executablePath).toBe("function");
    const expectedPath = resolved.chromium.executablePath();
    expect(typeof expectedPath).toBe("string");
    expect(expectedPath.length).toBeGreaterThan(0);
    expect(launcherSource).not.toContain("frontend/node_modules/playwright-core");
    expect(launcherSource).toContain('createRequire(join(FRONTEND_ROOT, "package.json"))');
    expect(launcherSource).toContain('load("@playwright/test")');
  });

  it("distinguishes a resolved API from a missing managed executable", () => {
    const report = launcher.inspectBrowserAvailability({ systemCandidates: [] });
    expect(report.playwrightApiClassification).toBe("PLAYWRIGHT_API_AVAILABLE");
    expect(report.managedBrowserClassification).toBe("MANAGED_BROWSER_NOT_INSTALLED");
    expect(report.availabilityClassification).toBe("MANAGED_BROWSER_NOT_INSTALLED");
    expect(report.selection).toBeUndefined();
  });

  it("does not silently convert an API resolution failure into managed-browser absence", () => {
    const report = launcher.inspectBrowserAvailability({
      loadPlaywright: () => {
        throw new Error("controlled missing API");
      },
      systemCandidates: [],
      adapter: adapter({}),
    });
    expect(report).toEqual({
      playwrightApiClassification: "PLAYWRIGHT_API_UNAVAILABLE",
      managedBrowserClassification: "MANAGED_BROWSER_NOT_INSTALLED",
      availabilityClassification: "PLAYWRIGHT_API_UNAVAILABLE",
    });
  });

  it("accepts a synthetic managed executable and propagates its exact path", () => {
    const report = launcher.inspectBrowserAvailability({
      loadPlaywright: () => ({ chromium: { executablePath: () => "/browser" } }),
      systemCandidates: [],
      adapter: adapter({ "/browser": status(true) }),
    });
    expect(report).toMatchObject({
      playwrightApiClassification: "PLAYWRIGHT_API_AVAILABLE",
      managedBrowserClassification: "MANAGED_BROWSER_AVAILABLE",
      availabilityClassification: "MANAGED_BROWSER_AVAILABLE",
      selection: { path: "/browser", classification: "PLAYWRIGHT_MANAGED" },
    });
    expect(launcher.browserLaunchEnvironment(report.selection)).toEqual({ SG5_BROWSER_EXECUTABLE: "/browser" });
  });

  it("classifies invalid managed executable file types without downloading or repairing them", () => {
    for (const record of [status(false), status(true, true), status(true, false, false)]) {
      const report = launcher.inspectBrowserAvailability({
        loadPlaywright: () => ({ chromium: { executablePath: () => "/browser" } }),
        systemCandidates: [],
        adapter: adapter({ "/browser": record }),
      });
      expect(report.availabilityClassification).toBe("MANAGED_BROWSER_NOT_INSTALLED");
      expect(report.selection).toBeUndefined();
    }
  });
});

describe("SG-5 route, network, and launcher controls", () => {
  it("locks the official installed relayer origin", () =>
    expect(SG5_ORIGINS.relayer).toBe("https://relayer.testnet.zama.org"));
  it("locks the installed Sepolia RPC origin", () =>
    expect(SG5_ORIGINS.chainRpc).toBe("https://ethereum-sepolia-rpc.publicnode.com"));
  it("executes an exact local-only route gate", () => {
    expect(SG5_PAGE_ENABLE).toBe("ENABLED_LOCAL_ONLY");
    expect(probeRouteEnabled("development", SG5_PAGE_ENABLE)).toBe(true);
    expect(probeRouteEnabled("development", "wrong")).toBe(false);
    expect(probeRouteEnabled("production", SG5_PAGE_ENABLE)).toBe(false);
    expect(probeRouteEnabled(undefined, undefined)).toBe(false);
  });
  it("executes exact live acknowledgment gating", () => {
    expect(liveModeAcknowledged(SG5_LIVE_ACK)).toBe(true);
    expect(liveModeAcknowledged(undefined)).toBe(false);
    expect(liveModeAcknowledged("wrong")).toBe(false);
  });
  it("keeps direct live page execution blocked while asset origins are unresolved", () => {
    expect(pageSource).toContain("liveRequested && !SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED");
    expect(pageSource).toContain("notFound()");
  });
  it("uses a CSP closed origin list", () => {
    expect(pageSource).toContain("connect-src");
    expect(pageSource).toContain(SG5_ORIGINS.relayer);
    expect(pageSource).toContain(SG5_ORIGINS.chainRpc);
  });
  it("uses policy-only continuation and never mocks official live responses", () => {
    expect(specSource).toContain('context.route("**/*"');
    expect(specSource).toContain("route.continue()");
    expect(specSource).not.toContain("route.fulfill");
  });
  it("routes every observed request through the executed classifier", () =>
    expect(specSource).toContain("classifyNetworkUrl(request.url())"));
  it("correlates an original redirect response from redirectedTo without persisting redirect URLs", () => {
    expect(specSource).toContain("request.redirectedTo()?.url()");
    expect(specSource).toContain("request.redirectedFrom()?.url()");
    expect(specSource).toContain("buildResponseNetworkObservation");
  });
  it("requires two fresh live contexts", () => expect(specSource).toContain("browser.newContext"));
  it("requires the exact live acknowledgment", () =>
    expect(specSource).toContain("process.env.SG5_LIVE_ACK === SG5_LIVE_ACK"));
  it("retains no screenshots, trace, or video", () => {
    const config = readFileSync(resolve(root, "frontend/playwright.config.ts"), "utf8");
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('trace: "off"');
    expect(config).toContain('video: "off"');
    expect(config).toContain("SG5_PLAYWRIGHT_OUTPUT_DIR");
    expect(config).toContain("executablePath: browserExecutable");
    expect(config).not.toContain("chromium-1208");
    expect(config).not.toContain("/tmp/zama-szn4-sg5-playwright-output");
    expect(config).toContain("live execution is blocked until exact public-key and CRS origins");
  });
  it("hashes the generated protocol before comparing the expected digest", () => {
    expect(launcherSource).toContain('createHash("sha256").update(result.stdout)');
    expect(launcherSource).toContain("actualDigest !== expectedDigest");
  });
  it("never terminates a pre-existing port-3000 process", () =>
    expect(launcherSource).toContain("the launcher never terminates pre-existing processes"));
  it("does not run a live mode from ordinary tests", () => expect(specSource).toContain("test.skip(!liveAcknowledged"));
});

describe("SG-5 deterministic protocol source", () => {
  it("has no Date dependency", () => expect(protocolSource).not.toMatch(/\bDate\b/u));
  it("has no randomness", () => expect(protocolSource).not.toMatch(/Math\.random|randomBytes|crypto\.random/u));
  it("has no network import", () => expect(protocolSource).not.toMatch(/node:(http|https|net|dns)|from "viem"/u));
  it("has no provider or wallet import", () => expect(protocolSource).not.toMatch(/Hardhat|WalletClient|Provider/u));
  it("defines identity-bound future evidence", () => expect(protocolSource).toContain("protocolSha256"));
  it("records the unresolved dynamic key-asset origin blocker", () =>
    expect(protocolSource).toContain("UNRESOLVED_FROM_INSTALLED_LOCAL_SOURCE"));
  it("keeps SG-4 pending", () => expect(protocolSource).toContain("PENDING_AUTHORITATIVE_HCU_SOURCE_AND_CEILING"));
});
