import { describe, expect, it } from "vitest";

describe("frontend compatibility probe", () => {
  it("uses the locked runtime", () => {
    expect(process.versions.node.startsWith("22.")).toBe(true);
  });
});
