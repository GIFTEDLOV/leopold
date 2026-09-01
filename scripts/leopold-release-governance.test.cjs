"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { assertReleaseReviewPolicy, reviewPolicyBlockers } = require("./leopold-release-governance.cjs");

const candidateSha = "7c58db1933ce93b5937db9ff8dcf89a34886a706";
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

test("accepts explicit project-owner authorization for Sepolia/testnet", () => {
  assert.deepEqual(
    assertReleaseReviewPolicy({
      target: "SEPOLIA_TESTNET_HACKATHON",
      independentReview: sepoliaReview,
      projectOwnerAuthorization: ownerDecision,
      expectedCandidateSha: candidateSha,
      expectedProofSha: proofSha,
    }),
    { target: "SEPOLIA_TESTNET_HACKATHON", externalIndependentReview: "RECOMMENDED_NON_BLOCKING" },
  );
});

test("rejects Sepolia authorization with a missing owner decision", () => {
  assert.ok(
    reviewPolicyBlockers({
      target: "SEPOLIA_TESTNET_HACKATHON",
      independentReview: sepoliaReview,
      projectOwnerAuthorization: null,
      expectedCandidateSha: candidateSha,
      expectedProofSha: proofSha,
    }).includes("PROJECT_OWNER_DECISION_MISSING"),
  );
});

test("fails closed for mainnet/production-capital without external review", () => {
  assert.throws(
    () =>
      assertReleaseReviewPolicy({
        target: "MAINNET_PRODUCTION_CAPITAL",
        independentReview: sepoliaReview,
        projectOwnerAuthorization: ownerDecision,
        expectedCandidateSha: candidateSha,
        expectedProofSha: proofSha,
      }),
    /MAINNET_EXTERNAL_INDEPENDENT_REVIEW_REQUIRED/u,
  );
});

test("accepts mainnet only after an attributable external review", () => {
  assert.deepEqual(
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
    { target: "MAINNET_PRODUCTION_CAPITAL", externalIndependentReview: "ACCEPTED" },
  );
});
