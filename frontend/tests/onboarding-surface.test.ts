import { describe, expect, it } from "vitest";

import { onboardingSurface } from "../lib/auth/onboarding-surface";

describe("public onboarding surface", () => {
  it("shows the public walkthrough while Dynamic is still loading anonymously", () => {
    expect(onboardingSurface({ loading: true, authenticated: false })).toBe("walkthrough");
  });

  it("does not depend on Dynamic SDK readiness for signed-out onboarding", () => {
    expect(onboardingSurface({ loading: false, authenticated: false })).toBe("walkthrough");
    expect(onboardingSurface({ loading: true, authenticated: false })).toBe("walkthrough");
  });

  it("renders authenticated onboarding only after positive authentication", () => {
    expect(onboardingSurface({ loading: true, authenticated: true })).toBe("authenticated");
    expect(onboardingSurface({ loading: false, authenticated: true })).toBe("authenticated");
  });
});
