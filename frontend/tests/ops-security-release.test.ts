import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, securityHeaders } from "../lib/ops/security-headers";

describe("operations surface and release hardening", () => {
  it("publishes the required browser security headers without general unsafe-eval", () => {
    const headers = Object.fromEntries(securityHeaders.map((header) => [header.key, header.value]));
    const csp = buildContentSecurityPolicy();

    expect(headers["Content-Security-Policy"]).toBe(csp);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/(?:^|\s)'unsafe-eval'(?:\s|;|$)/u);
    expect(csp).toContain("ethereum-sepolia-rpc.publicnode.com");
    expect(csp).toContain("relayer.testnet.zama.org");
    expect(csp).toContain("dynamicauth.com");
    expect(csp).toContain("dynamic-static-assets.com");
    expect(csp).toContain("cdn.jsdelivr.net");
    expect(csp).toContain("walletconnect.com");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("keeps /ops public-only and presents availability separately from fund ownership", () => {
    const source = readFileSync(new URL("../app/ops/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("Leopold Protocol Status");
    expect(source).toContain("Service availability does not affect ownership of funds held by the protocol.");
    expect(source).toContain("manifest digest");
    expect(source).toContain("P-01");
    expect(source).not.toContain("decryptPrivateValue");
    expect(source).not.toContain("walletIdentity");
    expect(source).not.toContain("email");
    expect(source).not.toContain("username");
  });

  it("wires deterministic manifest, freeze, bytecode, P-01, frontend, and dependency gates into CI", () => {
    const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    const validator = readFileSync(
      new URL("../../scripts/validate-leopold-production-release.cjs", import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("pnpm release:validate");
    expect(workflow).toContain("pnpm closure:validate");
    expect(workflow).toContain("rejects the high-width wrap vector");
    expect(workflow).toContain("pnpm check:frontend");
    expect(workflow).toContain("pnpm audit:prod");
    expect(validator).toContain("superseded official address reintroduced");
    expect(validator).toContain("headroom < 1_024");
    expect(validator).toContain("P-01 release regression gate drift");
  });
});
