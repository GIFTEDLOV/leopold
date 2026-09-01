"use strict";

const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

const EXTERNAL_REVIEW_CLASSIFICATION = "EXTERNAL_INDEPENDENT_REVIEW";
const SEPOLIA_TESTNET_TARGET = "SEPOLIA_TESTNET_HACKATHON";
const MAINNET_PRODUCTION_CAPITAL_TARGET = "MAINNET_PRODUCTION_CAPITAL";

function reviewPolicyBlockers({
  target,
  independentReview,
  projectOwnerAuthorization,
  expectedCandidateSha,
  expectedProofSha,
}) {
  const blockers = [];
  if (independentReview?.classification !== EXTERNAL_REVIEW_CLASSIFICATION) {
    blockers.push("EXTERNAL_REVIEW_CLASSIFICATION_MISSING");
  }

  if (target === SEPOLIA_TESTNET_TARGET) {
    if (independentReview?.required !== false || independentReview?.status !== "RECOMMENDED_NON_BLOCKING") {
      blockers.push("SEPOLIA_EXTERNAL_REVIEW_NOT_EXPLICITLY_NON_BLOCKING");
    }
    if (independentReview?.mainnetProductionCapitalRequired !== true) {
      blockers.push("MAINNET_EXTERNAL_REVIEW_REQUIREMENT_NOT_PRESERVED");
    }
    const owner = projectOwnerAuthorization;
    if (owner?.decision !== "AUTHORIZED_FOR_SEPOLIA_TESTNET_RELEASE_PROGRESSION") {
      blockers.push("PROJECT_OWNER_DECISION_MISSING");
    }
    if (owner?.authorizedBy !== "PROJECT_RELEASE_OWNER") blockers.push("PROJECT_OWNER_IDENTITY_MISSING");
    if (owner?.decisionDate !== "2026-09-01") blockers.push("PROJECT_OWNER_DECISION_DATE_MISMATCH");
    if (owner?.target !== SEPOLIA_TESTNET_TARGET) blockers.push("PROJECT_OWNER_TARGET_MISMATCH");
    if (owner?.waiverScope !== "THIS_SEPOLIA_TESTNET_RELEASE_ONLY") blockers.push("PROJECT_OWNER_SCOPE_TOO_BROAD");
    if (!SHA1.test(owner?.candidateSha ?? "") || owner.candidateSha !== expectedCandidateSha) {
      blockers.push("PROJECT_OWNER_CANDIDATE_SHA_MISMATCH");
    }
    if (
      !SHA256.test(owner?.disposableProofEvidenceSha256 ?? "") ||
      owner.disposableProofEvidenceSha256 !== expectedProofSha
    ) {
      blockers.push("PROJECT_OWNER_PROOF_SHA_MISMATCH");
    }
    if (owner?.mainnetExternalReviewRequirement !== "MANDATORY") {
      blockers.push("PROJECT_OWNER_MAINNET_REQUIREMENT_MISSING");
    }
    if (owner?.noExternalAuditClaim !== true) blockers.push("EXTERNAL_AUDIT_CLAIM_GUARD_MISSING");
    return blockers;
  }

  if (target === MAINNET_PRODUCTION_CAPITAL_TARGET) {
    if (independentReview?.required !== true || independentReview?.status !== "ACCEPTED") {
      blockers.push("MAINNET_EXTERNAL_INDEPENDENT_REVIEW_REQUIRED");
    }
    if (typeof independentReview?.acceptedBy !== "string" || independentReview.acceptedBy.length === 0) {
      blockers.push("MAINNET_EXTERNAL_REVIEW_ACCEPTOR_MISSING");
    }
    return blockers;
  }

  blockers.push(`UNSUPPORTED_RELEASE_TARGET:${target ?? "missing"}`);
  return blockers;
}

function assertReleaseReviewPolicy(input) {
  const blockers = reviewPolicyBlockers(input);
  if (blockers.length > 0) throw new Error(`RELEASE_REVIEW_POLICY_BLOCKED:${blockers.join(",")}`);
  return {
    target: input.target,
    externalIndependentReview: input.target === SEPOLIA_TESTNET_TARGET ? "RECOMMENDED_NON_BLOCKING" : "ACCEPTED",
  };
}

module.exports = {
  EXTERNAL_REVIEW_CLASSIFICATION,
  MAINNET_PRODUCTION_CAPITAL_TARGET,
  SEPOLIA_TESTNET_TARGET,
  assertReleaseReviewPolicy,
  reviewPolicyBlockers,
};
