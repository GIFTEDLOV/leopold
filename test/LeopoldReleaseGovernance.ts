import { expect } from "chai";

const { assertReleaseReviewPolicy, reviewPolicyBlockers } = require("../scripts/leopold-release-governance.cjs") as {
  assertReleaseReviewPolicy: (input: Record<string, unknown>) => unknown;
  reviewPolicyBlockers: (input: Record<string, unknown>) => string[];
};

const candidateSha = "9cca5ce5fb17ffa6287204fac181033920194c7f";
const proofSha = "2ce8bbb22f2b74f34a324a575d5c483c43cc0bceaa2b533eb6984dac25feff1f";
const sepoliaReview = {
  classification: "EXTERNAL_INDEPENDENT_REVIEW",
  required: false,
  status: "RECOMMENDED_NON_BLOCKING",
  mainnetProductionCapitalRequired: true,
  acceptedBy: null,
};
const ownerDecision = {
  decision: "AUTHORIZED_FOR_SEPOLIA_TESTNET_RELEASE_PROGRESSION",
  authorizedBy: "PROJECT_RELEASE_OWNER",
  decisionDate: "2026-09-01",
  target: "SEPOLIA_TESTNET_HACKATHON",
  waiverScope: "THIS_SEPOLIA_TESTNET_RELEASE_ONLY",
  candidateSha,
  disposableProofEvidenceSha256: proofSha,
  mainnetExternalReviewRequirement: "MANDATORY",
  noExternalAuditClaim: true,
};

describe("Leopold release review governance", function () {
  it("accepts explicit project-owner authorization for Sepolia/testnet", function () {
    expect(
      assertReleaseReviewPolicy({
        target: "SEPOLIA_TESTNET_HACKATHON",
        independentReview: sepoliaReview,
        projectOwnerAuthorization: ownerDecision,
        expectedCandidateSha: candidateSha,
        expectedProofSha: proofSha,
      }),
    ).to.deep.equal({
      target: "SEPOLIA_TESTNET_HACKATHON",
      externalIndependentReview: "RECOMMENDED_NON_BLOCKING",
    });
  });

  it("rejects Sepolia authorization with a missing owner decision", function () {
    expect(
      reviewPolicyBlockers({
        target: "SEPOLIA_TESTNET_HACKATHON",
        independentReview: sepoliaReview,
        projectOwnerAuthorization: null,
        expectedCandidateSha: candidateSha,
        expectedProofSha: proofSha,
      }),
    ).to.include("PROJECT_OWNER_DECISION_MISSING");
  });

  it("fails closed for mainnet/production-capital without external review", function () {
    expect(() =>
      assertReleaseReviewPolicy({
        target: "MAINNET_PRODUCTION_CAPITAL",
        independentReview: sepoliaReview,
        projectOwnerAuthorization: ownerDecision,
        expectedCandidateSha: candidateSha,
        expectedProofSha: proofSha,
      }),
    ).to.throw("MAINNET_EXTERNAL_INDEPENDENT_REVIEW_REQUIRED");
  });

  it("accepts mainnet only after an attributable external review", function () {
    expect(
      assertReleaseReviewPolicy({
        target: "MAINNET_PRODUCTION_CAPITAL",
        independentReview: {
          classification: "EXTERNAL_INDEPENDENT_REVIEW",
          required: true,
          status: "ACCEPTED",
          acceptedBy: "EXTERNAL_REVIEWER",
        },
        projectOwnerAuthorization: null,
        expectedCandidateSha: candidateSha,
        expectedProofSha: proofSha,
      }),
    ).to.deep.equal({ target: "MAINNET_PRODUCTION_CAPITAL", externalIndependentReview: "ACCEPTED" });
  });
});
