import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth feature configuration", () => {
  it("exposes Dynamic X linking in production only when explicitly enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_LEOPOLD_ENABLE_X_AUTH", "1");
    vi.resetModules();

    const config = await import("../lib/auth/config");

    expect(config.dynamicXEnabled).toBe(true);
    expect(config.authFixtureMode).toBeNull();
  });

  it("keeps X linking unavailable when the explicit flag is absent", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_LEOPOLD_ENABLE_X_AUTH", "0");
    vi.resetModules();

    const config = await import("../lib/auth/config");

    expect(config.dynamicXEnabled).toBe(false);
  });
});
