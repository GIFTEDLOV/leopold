import { describe, expect, it } from "vitest";
import { addMoneyButtonDisabled, financialControlsEnabled, getAuthHydrationPhase } from "../lib/auth/hydration";

describe("auth hydration boundary", () => {
  it("keeps server and first client render in the same initializing phase", () => {
    expect(getAuthHydrationPhase(false)).toBe("AUTH_INITIALIZING");
    expect(getAuthHydrationPhase(false)).toBe("AUTH_INITIALIZING");
  });

  it("ignores browser-authenticated values until client initialization completes", () => {
    expect(financialControlsEnabled(false, true)).toBe(false);
    expect(addMoneyButtonDisabled(false, false, false)).toBe(true);
    expect(addMoneyButtonDisabled(false, true, false)).toBe(true);
    expect(getAuthHydrationPhase(false)).toBe(getAuthHydrationPhase(false));
    expect(financialControlsEnabled(true, true)).toBe(true);
    expect(addMoneyButtonDisabled(true, true, false)).toBe(false);
  });

  it("re-locks financial controls when the authenticated session is cleared", () => {
    expect(financialControlsEnabled(true, true)).toBe(true);
    expect(financialControlsEnabled(true, false)).toBe(false);
  });
});
