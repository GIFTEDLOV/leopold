/*
 * Deterministic, offline CP0/SG-3 weight-domain derivation.
 *
 * Every authoritative quantity is a bigint. The JSON boundary converts every
 * integer to a decimal string so no JavaScript Number precision is involved.
 */

export const TOKEN_DECIMALS = 6n;
export const TOKEN_SCALE = 10n ** TOKEN_DECIMALS;
export const MAX_POOL_WHOLE_TOKENS = 1_000_000_000n;
export const MAX_POOL_BASE_UNITS = MAX_POOL_WHOLE_TOKENS * TOKEN_SCALE;
export const TIME_GRANULARITY_SECONDS = 1n;
export const MAX_ROUND_DURATION_DAYS = 365n;
export const SECONDS_PER_DAY = 24n * 60n * 60n;
export const MAX_ROUND_DURATION_SECONDS = MAX_ROUND_DURATION_DAYS * SECONDS_PER_DAY;
export const MAX_USER_BALANCE_BASE_UNITS = MAX_POOL_BASE_UNITS;
export const MAX_USER_TWAB = MAX_USER_BALANCE_BASE_UNITS * MAX_ROUND_DURATION_SECONDS;
export const MAX_AGGREGATE_TWAB = MAX_POOL_BASE_UNITS * MAX_ROUND_DURATION_SECONDS;
export const ENCRYPTED_WIDTHS = [64n, 128n, 256n] as const;
export const PRODUCTION_TICKET_WIDTH = 128n;

export type TwabState = Readonly<{
  balance: bigint;
  cumulativeTwab: bigint;
  lastUpdate: bigint;
}>;

export type TwabUpdate = Readonly<{
  balance: bigint;
  cumulativeTwab: bigint;
  effectiveTime: bigint;
  elapsed: bigint;
  weightedDelta: bigint;
}>;

export type RejectionPlan = Readonly<{
  noDraw: boolean;
  total: bigint;
  width: bigint;
  domainSize: bigint;
  quotient: bigint | null;
  rejectionLimit: bigint | null;
  rejectedCandidateCount: bigint | null;
  allCandidatesValid: boolean;
  rejectionLimitFitsCandidateWidth: boolean;
  acceptanceNumerator: bigint | null;
  acceptanceDenominator: bigint;
  expectedAttemptsNumerator: bigint | null;
  expectedAttemptsDenominator: bigint | null;
}>;

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`SG3 domain invariant failed: ${message}`);
}

export function maxUnsigned(width: bigint): bigint {
  invariant(width > 0n, "width must be positive");
  return (1n << width) - 1n;
}

export function requiredBits(value: bigint): bigint {
  invariant(value >= 0n, "requiredBits input must be non-negative");
  let bits = 0n;
  let maximum = 0n;
  while (maximum < value) {
    bits += 1n;
    maximum = (1n << bits) - 1n;
  }
  return bits;
}

export function smallestSupportedWidth(bits: bigint): bigint {
  for (const width of ENCRYPTED_WIDTHS) {
    if (width >= bits) return width;
  }
  throw new Error("SG3 domain invariant failed: no supported encrypted width");
}

export function requireWithin(name: string, value: bigint, maximum: bigint): void {
  invariant(value >= 0n, `${name} must be non-negative`);
  invariant(value <= maximum, `${name} exceeds its locked maximum`);
}

export function updateTwabBeforeBalanceMutation(
  state: TwabState,
  currentTimestamp: bigint,
  roundEnd: bigint,
  nextBalance: bigint,
): TwabUpdate {
  requireWithin("balance", state.balance, MAX_USER_BALANCE_BASE_UNITS);
  requireWithin("next balance", nextBalance, MAX_USER_BALANCE_BASE_UNITS);
  requireWithin("cumulative TWAB", state.cumulativeTwab, MAX_USER_TWAB);
  invariant(currentTimestamp >= 0n && roundEnd >= 0n && state.lastUpdate >= 0n, "timestamps must be non-negative");

  const effectiveTime = currentTimestamp < roundEnd ? currentTimestamp : roundEnd;
  invariant(effectiveTime >= state.lastUpdate, "effective time precedes last update");
  const elapsed = effectiveTime - state.lastUpdate;
  requireWithin("elapsed time", elapsed, MAX_ROUND_DURATION_SECONDS);

  // The production contract must first cast encrypted balance to euint128 and
  // cast this exact public elapsed value to uint128. FHE.mul then returns
  // euint128; it does not widen an euint64 result automatically.
  const weightedDelta = state.balance * elapsed;
  requireWithin("weighted delta", weightedDelta, MAX_USER_TWAB);
  invariant(state.cumulativeTwab <= MAX_USER_TWAB - weightedDelta, "cumulative TWAB addition overflows");
  const cumulativeTwab = state.cumulativeTwab + weightedDelta;

  // Balance mutation is deliberately last. At/after close, effectiveTime is
  // pinned to roundEnd, so later calls add zero to the closed-round weight.
  return { balance: nextBalance, cumulativeTwab, effectiveTime, elapsed, weightedDelta };
}

export function rejectionPlan(total: bigint, width: bigint = PRODUCTION_TICKET_WIDTH): RejectionPlan {
  invariant(width > 0n, "candidate width must be positive");
  const domainSize = 1n << width;
  requireWithin("aggregate total", total, domainSize - 1n);
  if (total === 0n) {
    return {
      noDraw: true,
      total,
      width,
      domainSize,
      quotient: null,
      rejectionLimit: null,
      rejectedCandidateCount: null,
      allCandidatesValid: false,
      rejectionLimitFitsCandidateWidth: false,
      acceptanceNumerator: null,
      acceptanceDenominator: domainSize,
      expectedAttemptsNumerator: null,
      expectedAttemptsDenominator: null,
    };
  }

  // DOMAIN_SIZE is one bit wider than the encrypted candidate domain. Compute
  // quotient and product in a public wider integer (uint256 for w=128).
  const quotient = domainSize / total;
  const rejectionLimit = quotient * total;
  const rejectedCandidateCount = domainSize - rejectionLimit;
  invariant(rejectionLimit <= domainSize, "rejection limit exceeds domain size");
  invariant(rejectedCandidateCount < total, "division remainder is not below total");

  return {
    noDraw: false,
    total,
    width,
    domainSize,
    quotient,
    rejectionLimit,
    rejectedCandidateCount,
    allCandidatesValid: rejectionLimit === domainSize,
    rejectionLimitFitsCandidateWidth: rejectionLimit <= domainSize - 1n,
    acceptanceNumerator: rejectionLimit,
    acceptanceDenominator: domainSize,
    expectedAttemptsNumerator: domainSize,
    expectedAttemptsDenominator: rejectionLimit,
  };
}

export function acceptCandidate(
  candidate: bigint,
  total: bigint,
  width: bigint = PRODUCTION_TICKET_WIDTH,
): {
  valid: boolean;
  ticket: bigint | null;
} {
  const plan = rejectionPlan(total, width);
  requireWithin("candidate", candidate, plan.domainSize - 1n);
  if (plan.noDraw) return { valid: false, ticket: null };
  if (total === 1n) return { valid: true, ticket: 0n };
  invariant(plan.rejectionLimit !== null, "non-zero total has no rejection limit");
  const valid = plan.allCandidatesValid || candidate < plan.rejectionLimit;
  return { valid, ticket: valid ? candidate % total : null };
}

function decimal(value: bigint): string {
  return value.toString(10);
}

function signedDecimal(value: bigint): string {
  return value.toString(10);
}

function deriveWidthDecision(width: bigint) {
  const maximum = maxUnsigned(width);
  const balanceFits = MAX_POOL_BASE_UNITS <= maximum;
  const completeTwabDomainFits = MAX_AGGREGATE_TWAB <= maximum;
  const margin = maximum - MAX_AGGREGATE_TWAB;
  const requiredTwabBits = requiredBits(MAX_AGGREGATE_TWAB);
  const installedFullTicketApi = width === 64n || width === 128n;
  return {
    widthBits: decimal(width),
    maximumRepresentable: decimal(maximum),
    balanceEnvelopeFits: balanceFits,
    userTwabEnvelopeFits: completeTwabDomainFits,
    aggregateTwabEnvelopeFits: completeTwabDomainFits,
    prefixWeightEnvelopeFits: completeTwabDomainFits,
    ticketEnvelopeFits: completeTwabDomainFits,
    capacityMarginAgainstMaximumTwab: signedDecimal(margin),
    unusedHeadroomBits: signedDecimal(width - requiredTwabBits),
    maximumWholeTokenPoolForLockedDuration: decimal(maximum / (TOKEN_SCALE * MAX_ROUND_DURATION_SECONDS)),
    maximumRoundDurationSecondsForLockedPool: decimal(maximum / MAX_POOL_BASE_UNITS),
    mathematicalVerdict: completeTwabDomainFits ? "GO" : "NO-GO",
    installedTicketApiVerdict: installedFullTicketApi
      ? completeTwabDomainFits
        ? "GO"
        : "MATHEMATICALLY_UNSAFE"
      : "BLOCKED: installed FHE.sol lacks euint256 ordered comparison and public-scalar remainder",
  };
}

export function deriveDomainAnalysis() {
  const requiredBalanceBits = requiredBits(MAX_POOL_BASE_UNITS);
  const requiredElapsedTimeBits = requiredBits(MAX_ROUND_DURATION_SECONDS);
  const requiredProductBits = requiredBits(MAX_USER_BALANCE_BASE_UNITS * MAX_ROUND_DURATION_SECONDS);
  const requiredTwabBits = requiredBits(MAX_USER_TWAB);
  const requiredAggregateBits = requiredBits(MAX_AGGREGATE_TWAB);
  const requiredTicketBits = requiredBits(MAX_AGGREGATE_TWAB - 1n);
  const balanceWidth = smallestSupportedWidth(requiredBalanceBits);
  const twabWidth = smallestSupportedWidth(requiredTwabBits);
  const ticketWidth = smallestSupportedWidth(requiredTicketBits);
  const productionPlan = rejectionPlan(MAX_AGGREGATE_TWAB, ticketWidth);
  const domainSize = 1n << ticketWidth;
  const lowerBoundNumerator = domainSize - MAX_AGGREGATE_TWAB + 1n;

  invariant(TOKEN_SCALE === 1_000_000n, "token scale is not six decimals");
  invariant(TIME_GRANULARITY_SECONDS === 1n, "time granularity is not one second");
  invariant(MAX_POOL_BASE_UNITS === 1_000_000_000_000_000n, "pool scaling is incorrect");
  invariant(MAX_ROUND_DURATION_SECONDS === 31_536_000n, "round duration is incorrect");
  invariant(MAX_USER_TWAB === 31_536_000_000_000_000_000_000n, "user TWAB bound is incorrect");
  invariant(MAX_AGGREGATE_TWAB === MAX_USER_TWAB, "full-pool single-user bound differs from aggregate bound");
  invariant(requiredBalanceBits === 50n, "balance bit derivation is incorrect");
  invariant(requiredElapsedTimeBits === 25n, "elapsed-time bit derivation is incorrect");
  invariant(requiredTwabBits === 75n && requiredAggregateBits === 75n, "TWAB bit derivation is incorrect");
  invariant(balanceWidth === 64n && twabWidth === 128n && ticketWidth === 128n, "recommended widths changed");
  invariant(lowerBoundNumerator * 2n > domainSize, "acceptance lower bound is not greater than one half");
  invariant(productionPlan.rejectionLimit !== null, "maximum total has no rejection limit");

  return {
    schema: "sg3-weight-domain/v1",
    status: "PASS",
    repositoryInspection: {
      requestedScopeDocumentsPresent: false,
      absentRequestedDocuments: [
        "00_SCOPE_REGISTER.md",
        "CP0_INDEPENDENT_REVIEW.md",
        "03_RANDOMNESS_ARCHITECTURE_LOCK.md",
        "01_SUCCESS_AND_RELEASE_CRITERIA.md",
      ],
      strongerCommittedPoolOrDurationCeilingFound: false,
      envelopeResolution: "The supplied minimum production envelope is locked as the SG-3 maximum supported envelope.",
    },
    assumptions: {
      tokenSymbol: "cUSDT",
      tokenDecimals: decimal(TOKEN_DECIMALS),
      tokenScale: decimal(TOKEN_SCALE),
      maximumPoolWholeTokens: decimal(MAX_POOL_WHOLE_TOKENS),
      maximumPoolBaseUnits: decimal(MAX_POOL_BASE_UNITS),
      timeGranularitySeconds: decimal(TIME_GRANULARITY_SECONDS),
      maximumRoundDurationDays: decimal(MAX_ROUND_DURATION_DAYS),
      maximumRoundDurationSeconds: decimal(MAX_ROUND_DURATION_SECONDS),
      singleParticipantMayHoldFullPool: true,
      participantCountLimitAssumed: false,
      roundingOrTimeCompressionPermitted: false,
    },
    formulas: {
      maximumPoolBaseUnits: "MAX_POOL_WHOLE_TOKENS * TOKEN_SCALE",
      maximumRoundDurationSeconds: "MAX_ROUND_DURATION_DAYS * 24 * 60 * 60",
      maximumUserTwab: "MAX_USER_BALANCE_BASE_UNITS * MAX_ROUND_DURATION_SECONDS",
      maximumAggregateTwab: "MAX_POOL_BASE_UNITS * MAX_ROUND_DURATION_SECONDS",
      requiredBits: "smallest w such that x <= 2^w - 1",
      rejectionLimit: "floor(2^w / T) * T",
      acceptanceProbability: "REJECTION_LIMIT / 2^w",
      expectedAttempts: "2^w / REJECTION_LIMIT",
    },
    derivedBounds: {
      maximumUserBalanceBaseUnits: decimal(MAX_USER_BALANCE_BASE_UNITS),
      maximumUserTwab: decimal(MAX_USER_TWAB),
      maximumAggregateTwab: decimal(MAX_AGGREGATE_TWAB),
      maximumPrefixWeight: decimal(MAX_AGGREGATE_TWAB),
      maximumAcceptedTicket: decimal(MAX_AGGREGATE_TWAB - 1n),
      requiredBalanceBits: decimal(requiredBalanceBits),
      requiredElapsedTimeBits: decimal(requiredElapsedTimeBits),
      requiredProductBits: decimal(requiredProductBits),
      requiredTwabBits: decimal(requiredTwabBits),
      requiredAggregateBits: decimal(requiredAggregateBits),
      requiredTicketBits: decimal(requiredTicketBits),
    },
    recommendedTypes: {
      encryptedBalance: `euint${decimal(balanceWidth)}`,
      publicTimestamp: "uint64",
      publicElapsed: "uint64 (checked), then exact uint128 scalar cast for FHE.mul",
      widenedBalanceOperand: `euint${decimal(twabWidth)}`,
      weightedDelta: `euint${decimal(twabWidth)}`,
      perUserTwab: `euint${decimal(twabWidth)}`,
      aggregateTwab: `euint${decimal(twabWidth)}`,
      cumulativePrefixWeight: `euint${decimal(twabWidth)}`,
      randomCandidate: `euint${decimal(ticketWidth)}`,
      acceptedTicket: `euint${decimal(ticketWidth)}`,
      rejectionValidity: "ebool",
      publicRejectionArithmetic: "uint256",
    },
    widthDecisions: ENCRYPTED_WIDTHS.map(deriveWidthDecision),
    installedFheApi: {
      source: "@fhevm/solidity 0.11.1 lib/FHE.sol",
      encryptedWidthsInspected: ["euint64", "euint128", "euint256"],
      randomGeneration: ["FHE.randEuint64()", "FHE.randEuint128()", "FHE.randEuint256()"],
      productionComparison: "FHE.lt(euint128,uint128) returns ebool",
      productionRemainder: "FHE.rem(euint128,uint128) returns euint128",
      productionMultiplication: "FHE.mul(euint128,uint128) returns euint128",
      wideningCast: "FHE.asEuint128(euint64) returns euint128",
      automaticMultiplicationWidening: false,
      encryptedOverflowPolicy:
        "Fixed-width results are not exposed as checked arithmetic; SG-3 forbids reaching overflow and requires pre-operation widening and proven bounds.",
      euint256Limitation:
        "randEuint256 exists, but euint256 ordered comparison, multiplication, and public-scalar remainder overloads are absent.",
    },
    rejectionSampling: {
      candidateWidthBits: decimal(ticketWidth),
      domainSize: decimal(domainSize),
      maximumTotal: decimal(MAX_AGGREGATE_TWAB),
      quotientAtMaximumTotal: decimal(productionPlan.quotient ?? 0n),
      rejectionLimitAtMaximumTotal: decimal(productionPlan.rejectionLimit),
      rejectedCandidatesAtMaximumTotal: decimal(productionPlan.rejectedCandidateCount ?? 0n),
      acceptanceProbabilityAtMaximumTotal: {
        numerator: decimal(productionPlan.acceptanceNumerator ?? 0n),
        denominator: decimal(productionPlan.acceptanceDenominator),
      },
      expectedAttemptsAtMaximumTotal: {
        numerator: decimal(productionPlan.expectedAttemptsNumerator ?? 0n),
        denominator: decimal(productionPlan.expectedAttemptsDenominator ?? 1n),
      },
      guaranteedAcceptanceProbabilityLowerBound: {
        numerator: decimal(lowerBoundNumerator),
        denominator: decimal(domainSize),
        proof: "2^w mod T <= T - 1 <= MAX_AGGREGATE_TWAB - 1",
        strictlyGreaterThanOneHalf: true,
      },
      guaranteedExpectedAttemptsUpperBound: {
        numerator: decimal(domainSize),
        denominator: decimal(lowerBoundNumerator),
      },
      zeroTotal: "No draw, no candidate, and no modulo operation.",
      oneTotal: "All candidates are valid and the accepted encrypted ticket is deterministically zero.",
      divisorOfDomainSize:
        "REJECTION_LIMIT equals 2^w and is not representable in w bits; set encrypted VALID to true and compute encrypted remainder, with T=1 specialized to encrypted zero.",
      nonDivisor:
        "REJECTION_LIMIT is at most 2^w - 1, is checked before uint128 conversion, VALID is FHE.lt(R, limit), and ticket is FHE.rem(R, T).",
      confidentiality:
        "R and accepted ticket remain encrypted forever; only T at the permitted draw stage and encrypted VALID may be publicly decrypted.",
      rerollRule: "A valid candidate is immutable; exactly one replacement is allowed only after VALID decrypts false.",
    },
    twabTransition: {
      sequence: [
        "effectiveTime = min(currentTimestamp, roundEnd)",
        "require effectiveTime >= lastUpdate",
        "elapsed = effectiveTime - lastUpdate",
        "weightedDelta = widen(balance to euint128) * exact uint128(elapsed)",
        "cumulativeTwab += weightedDelta",
        "lastUpdate = effectiveTime",
        "mutate balance only after accrual",
      ],
      sameTimestampDelta: "0",
      closeBehavior: "Accrual is clamped to roundEnd; later updates add zero to closed-round TWAB.",
      aggregateProof:
        "sum(user TWAB) = integral(sum(user balances)) dt <= MAX_POOL_BASE_UNITS * MAX_ROUND_DURATION_SECONDS, independent of participant count.",
    },
    privacyClassification: {
      userBalance: "CONFIDENTIAL",
      userTwab: "CONFIDENTIAL",
      aggregateTwabBeforeDraw: "CONFIDENTIAL",
      aggregateTwabAtPermittedDraw: "PUBLICLY_DECRYPTABLE",
      randomCandidate: "CONFIDENTIAL_FOREVER",
      acceptedTicket: "CONFIDENTIAL_FOREVER",
      rejectionValidity: "PUBLICLY_DECRYPTABLE",
      timestamps: "PUBLIC_EXACT_SECONDS",
    },
    reopenConditions: [
      "pool ceiling exceeds 1,000,000,000 whole cUSDT",
      "round duration exceeds 365 days",
      "token precision changes from 6 decimals",
      "time resolution changes from exact seconds",
      "aggregate or prefix semantics exceed the pool-time integral bound",
      "winner selection requires a domain larger than the aggregate TWAB",
      "installed FHE arithmetic or casting semantics change",
      "SG-4 cannot execute the required euint128 production path within accepted limits",
    ],
  };
}

export function serializeDomainAnalysis(): string {
  return `${JSON.stringify(deriveDomainAnalysis(), null, 2)}\n`;
}

if (require.main === module) {
  try {
    process.stdout.write(serializeDomainAnalysis());
  } catch {
    process.stderr.write("SG3 domain derivation failed.\n");
    process.exitCode = 1;
  }
}
