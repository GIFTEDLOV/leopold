import { expect } from "chai";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  acceptCandidate,
  deriveDomainAnalysis,
  ENCRYPTED_WIDTHS,
  MAX_AGGREGATE_TWAB,
  MAX_POOL_BASE_UNITS,
  MAX_POOL_WHOLE_TOKENS,
  MAX_ROUND_DURATION_SECONDS,
  MAX_USER_BALANCE_BASE_UNITS,
  MAX_USER_TWAB,
  maxUnsigned,
  rejectionPlan,
  requiredBits,
  requireWithin,
  serializeDomainAnalysis,
  smallestSupportedWidth,
  TIME_GRANULARITY_SECONDS,
  TOKEN_DECIMALS,
  TOKEN_SCALE,
  updateTwabBeforeBalanceMutation,
} from "../scripts/sg3-domain";

const repositoryRoot = resolve(__dirname, "..");

describe("SG-3 weight-domain derivation", function () {
  it("locks six-decimal cUSDT scaling", function () {
    expect(TOKEN_DECIMALS).to.equal(6n);
    expect(TOKEN_SCALE).to.equal(1_000_000n);
  });

  it("locks exact one-second time granularity", function () {
    expect(TIME_GRANULARITY_SECONDS).to.equal(1n);
  });

  it("supports the minimum one-billion-whole-token pool", function () {
    expect(MAX_POOL_WHOLE_TOKENS).to.equal(1_000_000_000n);
  });

  it("supports the minimum 365-day round", function () {
    expect(MAX_ROUND_DURATION_SECONDS).to.equal(365n * 24n * 60n * 60n);
  });

  it("derives the exact maximum pool base units", function () {
    expect(MAX_POOL_BASE_UNITS).to.equal(1_000_000_000_000_000n);
  });

  it("derives the exact maximum duration seconds", function () {
    expect(MAX_ROUND_DURATION_SECONDS).to.equal(31_536_000n);
  });

  it("derives the exact maximum user and aggregate TWAB", function () {
    expect(MAX_USER_TWAB).to.equal(31_536_000_000_000_000_000_000n);
    expect(MAX_AGGREGATE_TWAB).to.equal(MAX_USER_TWAB);
  });

  it("derives exact required bit lengths", function () {
    expect(requiredBits(MAX_POOL_BASE_UNITS)).to.equal(50n);
    expect(requiredBits(MAX_ROUND_DURATION_SECONDS)).to.equal(25n);
    expect(requiredBits(MAX_AGGREGATE_TWAB)).to.equal(75n);
    expect(requiredBits(0n)).to.equal(0n);
  });

  it("marks euint64 mathematically NO-GO for the complete domain", function () {
    const result = deriveDomainAnalysis();
    expect(result.widthDecisions.find((entry) => entry.widthBits === "64")?.mathematicalVerdict).to.equal("NO-GO");
  });

  it("marks euint128 mathematically GO", function () {
    const result = deriveDomainAnalysis();
    expect(result.widthDecisions.find((entry) => entry.widthBits === "128")?.mathematicalVerdict).to.equal("GO");
  });

  it("marks euint256 mathematically GO but records its installed API blocker", function () {
    const result = deriveDomainAnalysis();
    const decision = result.widthDecisions.find((entry) => entry.widthBits === "256");
    expect(decision?.mathematicalVerdict).to.equal("GO");
    expect(decision?.installedTicketApiVerdict).to.include("BLOCKED");
  });

  it("selects euint64 for balance and euint128 for TWAB and ticket", function () {
    expect(smallestSupportedWidth(requiredBits(MAX_POOL_BASE_UNITS))).to.equal(64n);
    expect(smallestSupportedWidth(requiredBits(MAX_USER_TWAB))).to.equal(128n);
    expect(smallestSupportedWidth(requiredBits(MAX_AGGREGATE_TWAB - 1n))).to.equal(128n);
  });

  it("requires multiplication widening before the product", function () {
    const result = deriveDomainAnalysis();
    expect(result.recommendedTypes.encryptedBalance).to.equal("euint64");
    expect(result.recommendedTypes.widenedBalanceOperand).to.equal("euint128");
    expect(result.recommendedTypes.weightedDelta).to.equal("euint128");
    expect(result.installedFheApi.automaticMultiplicationWidening).to.equal(false);
  });

  it("keeps every maximum value within the recommended width", function () {
    expect(MAX_POOL_BASE_UNITS <= maxUnsigned(64n)).to.equal(true);
    expect(MAX_USER_TWAB <= maxUnsigned(128n)).to.equal(true);
    expect(MAX_AGGREGATE_TWAB <= maxUnsigned(128n)).to.equal(true);
  });

  it("rejects one unit over each locked limit", function () {
    expect(() => requireWithin("pool", MAX_POOL_BASE_UNITS + 1n, MAX_POOL_BASE_UNITS)).to.throw();
    expect(() => requireWithin("TWAB", MAX_AGGREGATE_TWAB + 1n, MAX_AGGREGATE_TWAB)).to.throw();
  });

  it("gives same-timestamp updates zero weighted delta", function () {
    const update = updateTwabBeforeBalanceMutation(
      { balance: 100n, cumulativeTwab: 25n, lastUpdate: 10n },
      10n,
      100n,
      75n,
    );
    expect(update.weightedDelta).to.equal(0n);
    expect(update.cumulativeTwab).to.equal(25n);
  });

  it("accrues the old balance before applying a deposit", function () {
    const update = updateTwabBeforeBalanceMutation({ balance: 10n, cumulativeTwab: 0n, lastUpdate: 0n }, 5n, 100n, 20n);
    expect(update.weightedDelta).to.equal(50n);
    expect(update.balance).to.equal(20n);
  });

  it("starts a deposit earning at its exact timestamp", function () {
    const deposit = updateTwabBeforeBalanceMutation({ balance: 0n, cumulativeTwab: 0n, lastUpdate: 0n }, 0n, 100n, 10n);
    const later = updateTwabBeforeBalanceMutation(
      { balance: deposit.balance, cumulativeTwab: deposit.cumulativeTwab, lastUpdate: deposit.effectiveTime },
      5n,
      100n,
      deposit.balance,
    );
    expect(deposit.weightedDelta).to.equal(0n);
    expect(later.cumulativeTwab).to.equal(50n);
  });

  it("makes withdrawals reduce all future weight immediately", function () {
    const withdrawal = updateTwabBeforeBalanceMutation(
      { balance: 10n, cumulativeTwab: 0n, lastUpdate: 0n },
      5n,
      100n,
      4n,
    );
    const later = updateTwabBeforeBalanceMutation(
      {
        balance: withdrawal.balance,
        cumulativeTwab: withdrawal.cumulativeTwab,
        lastUpdate: withdrawal.effectiveTime,
      },
      10n,
      100n,
      4n,
    );
    expect(withdrawal.cumulativeTwab).to.equal(50n);
    expect(later.cumulativeTwab).to.equal(70n);
  });

  it("supports a full withdrawal", function () {
    const withdrawal = updateTwabBeforeBalanceMutation(
      { balance: 10n, cumulativeTwab: 0n, lastUpdate: 0n },
      5n,
      100n,
      0n,
    );
    const later = updateTwabBeforeBalanceMutation(
      {
        balance: withdrawal.balance,
        cumulativeTwab: withdrawal.cumulativeTwab,
        lastUpdate: withdrawal.effectiveTime,
      },
      25n,
      100n,
      0n,
    );
    expect(later.cumulativeTwab).to.equal(50n);
  });

  it("clamps accrual at round close", function () {
    const update = updateTwabBeforeBalanceMutation({ balance: 7n, cumulativeTwab: 0n, lastUpdate: 5n }, 20n, 10n, 0n);
    expect(update.effectiveTime).to.equal(10n);
    expect(update.weightedDelta).to.equal(35n);
  });

  it("keeps closed-round weight immutable after close", function () {
    const closed = updateTwabBeforeBalanceMutation({ balance: 7n, cumulativeTwab: 0n, lastUpdate: 5n }, 20n, 10n, 3n);
    const after = updateTwabBeforeBalanceMutation(
      { balance: closed.balance, cumulativeTwab: closed.cumulativeTwab, lastUpdate: closed.effectiveTime },
      30n,
      10n,
      1n,
    );
    expect(after.weightedDelta).to.equal(0n);
    expect(after.cumulativeTwab).to.equal(closed.cumulativeTwab);
  });

  it("rejects elapsed-time underflow", function () {
    expect(() =>
      updateTwabBeforeBalanceMutation({ balance: 1n, cumulativeTwab: 0n, lastUpdate: 10n }, 9n, 100n, 1n),
    ).to.throw();
  });

  it("handles maximum balance for maximum duration exactly", function () {
    const update = updateTwabBeforeBalanceMutation(
      { balance: MAX_USER_BALANCE_BASE_UNITS, cumulativeTwab: 0n, lastUpdate: 0n },
      MAX_ROUND_DURATION_SECONDS,
      MAX_ROUND_DURATION_SECONDS,
      MAX_USER_BALANCE_BASE_UNITS,
    );
    expect(update.weightedDelta).to.equal(MAX_USER_TWAB);
  });

  it("proves one user may hold the full pool", function () {
    expect(MAX_USER_BALANCE_BASE_UNITS).to.equal(MAX_POOL_BASE_UNITS);
    expect(MAX_USER_TWAB).to.equal(MAX_AGGREGATE_TWAB);
  });

  it("keeps the aggregate bound independent of participant count", function () {
    const balances = [MAX_POOL_BASE_UNITS / 2n, MAX_POOL_BASE_UNITS / 4n, MAX_POOL_BASE_UNITS / 4n];
    const aggregate = balances.reduce((sum, balance) => sum + balance * MAX_ROUND_DURATION_SECONDS, 0n);
    expect(aggregate).to.equal(MAX_AGGREGATE_TWAB);
  });

  it("keeps cumulative prefix weights within the aggregate bound", function () {
    const weights = [MAX_AGGREGATE_TWAB / 4n, MAX_AGGREGATE_TWAB / 4n, MAX_AGGREGATE_TWAB / 2n];
    let prefix = 0n;
    for (const weight of weights) {
      prefix += weight;
      expect(prefix <= MAX_AGGREGATE_TWAB).to.equal(true);
    }
    expect(prefix).to.equal(MAX_AGGREGATE_TWAB);
  });

  it("treats T=0 as no draw without modulo", function () {
    const plan = rejectionPlan(0n);
    expect(plan.noDraw).to.equal(true);
    expect(plan.rejectionLimit).to.equal(null);
    expect(acceptCandidate(0n, 0n)).to.deep.equal({ valid: false, ticket: null });
  });

  it("handles T=1 deterministically", function () {
    const plan = rejectionPlan(1n);
    expect(plan.allCandidatesValid).to.equal(true);
    expect(acceptCandidate(maxUnsigned(128n), 1n)).to.deep.equal({ valid: true, ticket: 0n });
  });

  it("handles totals near powers of two", function () {
    const totals = [(1n << 63n) - 1n, 1n << 63n, (1n << 63n) + 1n];
    for (const total of totals) {
      const plan = rejectionPlan(total);
      expect(plan.rejectionLimit !== null).to.equal(true);
      expect((plan.rejectedCandidateCount ?? total) < total).to.equal(true);
    }
  });

  it("handles the maximum permitted aggregate", function () {
    const plan = rejectionPlan(MAX_AGGREGATE_TWAB);
    expect(plan.noDraw).to.equal(false);
    expect((plan.rejectionLimit ?? (1n << 128n) + 1n) <= 1n << 128n).to.equal(true);
    expect((plan.rejectedCandidateCount ?? MAX_AGGREGATE_TWAB) < MAX_AGGREGATE_TWAB).to.equal(true);
  });

  it("handles the maximum euint128 total boundary safely", function () {
    const total = maxUnsigned(128n);
    const plan = rejectionPlan(total);
    expect(plan.rejectionLimit).to.equal(total);
    expect(acceptCandidate(total, total)).to.deep.equal({ valid: false, ticket: null });
  });

  it("computes the rejection limit exactly", function () {
    const plan = rejectionPlan(6n, 4n);
    expect(plan.domainSize).to.equal(16n);
    expect(plan.quotient).to.equal(2n);
    expect(plan.rejectionLimit).to.equal(12n);
    expect(plan.rejectedCandidateCount).to.equal(4n);
  });

  it("eliminates modulo bias by exhaustive small-domain enumeration", function () {
    const width = 4n;
    const domainSize = 1n << width;
    for (let total = 1n; total < domainSize; total += 1n) {
      const counts = new Map<bigint, bigint>();
      for (let candidate = 0n; candidate < domainSize; candidate += 1n) {
        const result = acceptCandidate(candidate, total, width);
        if (result.valid && result.ticket !== null) counts.set(result.ticket, (counts.get(result.ticket) ?? 0n) + 1n);
      }
      const expectedCount = domainSize / total;
      for (let ticket = 0n; ticket < total; ticket += 1n) expect(counts.get(ticket)).to.equal(expectedCount);
    }
  });

  it("proves the exact acceptance-probability lower bound", function () {
    const result = deriveDomainAnalysis();
    const numerator = BigInt(result.rejectionSampling.guaranteedAcceptanceProbabilityLowerBound.numerator);
    const denominator = BigInt(result.rejectionSampling.guaranteedAcceptanceProbabilityLowerBound.denominator);
    expect(numerator * 2n > denominator).to.equal(true);
    for (const total of [1n, 2n, 3n, (1n << 64n) - 1n, MAX_AGGREGATE_TWAB]) {
      const plan = rejectionPlan(total);
      expect((plan.acceptanceNumerator ?? 0n) * denominator >= numerator * plan.acceptanceDenominator).to.equal(true);
    }
  });

  it("derives the exact expected-attempt bound", function () {
    const result = deriveDomainAnalysis();
    expect(result.rejectionSampling.guaranteedExpectedAttemptsUpperBound).to.deep.equal({
      numerator: "340282366920938463463374607431768211456",
      denominator: "340282366920938431927374607431768211457",
    });
  });

  it("keeps every accepted ticket in [0,T-1]", function () {
    const total = 17n;
    for (let candidate = 0n; candidate < 256n; candidate += 1n) {
      const result = acceptCandidate(candidate, total, 8n);
      if (result.ticket !== null) {
        expect(result.ticket >= 0n).to.equal(true);
        expect(result.ticket < total).to.equal(true);
      }
    }
  });

  it("serializes deterministically", function () {
    expect(serializeDomainAnalysis()).to.equal(serializeDomainAnalysis());
  });

  it("serializes authoritative integers as decimal strings", function () {
    const parsed = JSON.parse(serializeDomainAnalysis()) as {
      assumptions: { maximumPoolBaseUnits: unknown };
      derivedBounds: { maximumAggregateTwab: unknown; requiredAggregateBits: unknown };
    };
    expect(parsed.assumptions.maximumPoolBaseUnits).to.equal("1000000000000000");
    expect(parsed.derivedBounds.maximumAggregateTwab).to.equal("31536000000000000000000");
    expect(parsed.derivedBounds.requiredAggregateBits).to.equal("75");
  });

  it("uses bigint rather than Number or floating-point authoritative arithmetic", function () {
    const source = readFileSync(resolve(repositoryRoot, "scripts/sg3-domain.ts"), "utf8");
    expect(source).not.to.match(/\bNumber\s*\(/u);
    expect(source).not.to.include("Math.");
  });

  it("has no network, provider, wallet, Hardhat, or credential dependency", function () {
    const source = readFileSync(resolve(repositoryRoot, "scripts/sg3-domain.ts"), "utf8");
    expect(source).not.to.match(/^\s*import\s/mu);
    expect(source).not.to.match(/\b(?:fetch|XMLHttpRequest|WebSocket|provider|wallet|hardhat|ethers)\b/iu);
    expect(source).not.to.include("process.env");
    expect(source).not.to.match(/(?:PRIVATE_KEY|RPC_URL|MNEMONIC|API_KEY)/u);
  });

  it("confirms the installed production APIs and euint256 limitation", function () {
    const source = readFileSync(resolve(repositoryRoot, "node_modules/@fhevm/solidity/lib/FHE.sol"), "utf8");
    expect(source).to.include("function randEuint64() internal returns (euint64)");
    expect(source).to.include("function randEuint128() internal returns (euint128)");
    expect(source).to.include("function randEuint256() internal returns (euint256)");
    expect(source).to.include("function lt(euint128 a, uint128 b) internal returns (ebool)");
    expect(source).to.include("function rem(euint128 a, uint128 b) internal returns (euint128)");
    expect(source).to.include("function mul(euint128 a, uint128 b) internal returns (euint128)");
    expect(source).not.to.include("function lt(euint256 a, uint256 b)");
    expect(source).not.to.include("function rem(euint256 a, uint256 b)");
    expect(source).not.to.include("function mul(euint256 a, uint256 b)");
  });

  it("keeps the derivation direct, offline, and mutation-free", function () {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(resolve(repositoryRoot, "scripts/sg3-domain.ts"), "utf8");
    expect(packageJson.scripts["sg3:derive"]).to.equal("ts-node --transpile-only scripts/sg3-domain.ts");
    expect(packageJson.scripts["sg3:derive"]).not.to.include("hardhat");
    expect(source).not.to.match(/(?:writeFile|appendFile|rmSync|unlink|child_process)/u);
    expect(ENCRYPTED_WIDTHS).to.deep.equal([64n, 128n, 256n]);
  });
});
