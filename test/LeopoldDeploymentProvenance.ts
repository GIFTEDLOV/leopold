import { expect } from "chai";

import { assertReviewedProvenance } from "../scripts/leopold-deployment-provenance";

const sha = "17ed66f1bfd696f72317e96662902eb3c3436245";

describe("Leopold disposable deployment provenance", function () {
  const clean = { branch: "v2/disposable-sepolia-proof", commit: sha, tree: "a".repeat(40), clean: true };

  it("accepts the exact clean reviewed source tuple", function () {
    expect(() => assertReviewedProvenance(clean, sha, clean.branch)).not.to.throw();
  });

  it("rejects stale source SHA, dirty worktrees, and wrong branches", function () {
    expect(() => assertReviewedProvenance(clean, "69b24a14cf7c9491c1fa0c30c378b8b771e6b70e")).to.throw(
      "does not match reviewed SHA",
    );
    expect(() => assertReviewedProvenance({ ...clean, clean: false }, sha)).to.throw("clean reviewed worktree");
    expect(() => assertReviewedProvenance(clean, sha, "v2/pre-disposable-proof-reviewed")).to.throw("does not match");
    expect(() => assertReviewedProvenance(clean, "not-a-sha")).to.throw("full 40-character SHA");
  });
});
