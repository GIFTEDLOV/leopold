import { describe, expect, it } from "vitest";

import {
  SG5_ASSET_ORIGIN_AUTHORITY,
  SG5_LIVE_ACK,
  SG5_LOCKED,
  SG5_ORIGINS,
  SG5_PAGE_ENABLE,
  SG5_PROTOCOL_VERSION,
  assertSanitizedResult,
  classifyNetworkUrl,
  controlledStructuralObservation,
  probeRouteEnabled,
  sanitizeObservation,
} from "../lib/sg5/protocol";

describe("SG-5 v2 protocol", () => {
  it("keeps the closed SG-4 and randomness inputs immutable", () => {
    expect(SG5_PROTOCOL_VERSION).toBe("sg5-browser-capability-v2");
    expect(SG5_LOCKED.chainId).toBe(11155111);
    expect(SG5_LOCKED.encryptedWidth).toBe("euint64");
    expect(SG5_LOCKED.contractAddress).toBe("0xfc672ca5846896A7A135943E79dd11283c38FE78");
  });

  it("requires explicit production probe gating", () => {
    expect(probeRouteEnabled("development", SG5_PAGE_ENABLE)).toBe(true);
    expect(probeRouteEnabled("production", SG5_PAGE_ENABLE)).toBe(false);
    expect(probeRouteEnabled("production", SG5_PAGE_ENABLE, "1")).toBe(true);
    expect(SG5_LIVE_ACK).toBe("I_UNDERSTAND_THIS_CONTACTS_SEPOLIA");
  });

  it("classifies only committed official origins", () => {
    expect(classifyNetworkUrl(`${SG5_ORIGINS.relayer}/v2/keyurl`, SG5_ASSET_ORIGIN_AUTHORITY).requestCategory).toBe("RELAYER_KEYURL_METADATA");
    expect(classifyNetworkUrl(`${SG5_ORIGINS.publicKeyAsset}/PUB-p1/PublicKey/example`, SG5_ASSET_ORIGIN_AUTHORITY).requestCategory).toBe("PUBLIC_KEY_ASSET");
    expect(classifyNetworkUrl(`${SG5_ORIGINS.crsAsset}/PUB-p1/CRS/example`, SG5_ASSET_ORIGIN_AUTHORITY).requestCategory).toBe("CRS_ASSET");
    expect(() => classifyNetworkUrl("https://evil.example/key", SG5_ASSET_ORIGIN_AUTHORITY)).toThrow();
  });

  it("cannot claim live capability in structural mode", () => {
    const result = sanitizeObservation(controlledStructuralObservation(), "OFFLINE_STRUCTURAL", "Mozilla/5.0 Chrome/151.0");
    assertSanitizedResult(result);
    expect(result.status).toBe("STRUCTURAL_PASS_NOT_LIVE");
    expect(result.finalVerdict).toBe("NOT_LIVE");
    expect(result.transactionSubmitted).toBe(false);
    expect(result.forbiddenMaterialRetained).toBe(false);
  });
});
