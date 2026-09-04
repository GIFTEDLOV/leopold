import { describe, expect, it } from "vitest";

import { isNavigationItemActive } from "../components/app-shell";

describe("application shell navigation active state", () => {
  it.each([
    ["/app", "/app", true],
    ["/app", "/app/profile", false],
    ["/app/profile", "/app", false],
    ["/app/profile", "/app/profile", true],
    ["/app/classic", "/app/classic", true],
    ["/app/classic", "/app/classic/profile", false],
    ["/app/classic/profile", "/app/classic", false],
    ["/app/classic/profile", "/app/classic/profile", true],
    ["/app/classic/vaults", "/app/classic", false],
    ["/app/classic/vaults", "/app/classic/vaults", true],
    ["/app/classic/vaults/daily", "/app/classic", false],
    ["/app/classic/vaults/daily", "/app/classic/vaults", true],
  ])("marks %s active for %s as %s", (pathname, href, expected) => {
    expect(isNavigationItemActive(pathname, href)).toBe(expected);
  });
});
