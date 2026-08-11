import { expect } from "chai";

import {
  AccountingReferenceModel,
  mapCandidate,
  ReferenceRoundState,
  rejectionParameters,
  RoundStateReferenceModel,
  TwabReferenceModel,
  UINT128_DOMAIN,
} from "../reference/leopoldModels";

function bruteWeight(actions: Array<{ timestamp: bigint; delta: bigint }>, opensAt: bigint, closesAt: bigint): bigint {
  let balance = 0n;
  let cursor = opensAt;
  let weight = 0n;
  for (const action of actions) {
    if (action.timestamp < opensAt) {
      balance += action.delta;
      continue;
    }
    if (action.timestamp > closesAt) break;
    weight += balance * (action.timestamp - cursor);
    balance += action.delta;
    cursor = action.timestamp;
  }
  return weight + balance * (closesAt - cursor);
}

describe("Leopold deterministic reference models", function () {
  it("computes exact deposits, withdrawals, same-timestamp actions, and empty intervals", function () {
    const model = new TwabReferenceModel();
    model.deposit(1, "alice", 10n, 2n);
    model.deposit(1, "alice", 5n, 4n);
    model.withdraw(1, "alice", 3n, 4n);
    model.withdraw(1, "alice", 12n, 8n);
    expect(model.weight(1, "alice", 0n, 10n)).to.equal(10n * 2n + 12n * 4n);
    expect(model.weight(1, "alice", 8n, 10n)).to.equal(0n);
    expect(model.checkpointSnapshot(1, "alice")).to.have.length(3);
  });

  it("preserves exact historical weights after many missed rounds", function () {
    const model = new TwabReferenceModel();
    model.deposit(1, "alice", 7n, 3n);
    model.withdraw(1, "alice", 2n, 55n);
    for (let round = 0n; round < 10n; round += 1n) {
      const start = round * 10n;
      const end = start + 10n;
      const expected = start < 3n ? 49n : start < 50n ? 70n : start === 50n ? 60n : 50n;
      expect(model.weight(1, "alice", start, end)).to.equal(expected);
    }
  });

  it("does not transfer source-vault history during reallocation", function () {
    const model = new TwabReferenceModel();
    model.deposit(1, "alice", 100n, 0n);
    model.move(1, 2, "alice", 40n, 10n);
    expect(model.weight(1, "alice", 0n, 20n)).to.equal(1_600n);
    expect(model.weight(2, "alice", 0n, 20n)).to.equal(400n);
    expect(model.weight(2, "alice", 0n, 10n)).to.equal(0n);
  });

  it("reconciles global TWAB with the sum of individual TWAB", function () {
    const model = new TwabReferenceModel();
    model.deposit(3, "alice", 10n, 1n);
    model.deposit(3, "bob", 20n, 3n);
    model.withdraw(3, "alice", 4n, 8n);
    const individual = model.weight(3, "alice", 0n, 12n) + model.weight(3, "bob", 0n, 12n);
    expect(model.aggregateWeight(3, 0n, 12n)).to.equal(individual);
  });

  it("matches an independent brute-force segment evaluator over randomized histories", function () {
    let seed = 0x5eed1234;
    const random = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed;
    };
    for (let history = 0; history < 100; history += 1) {
      const model = new TwabReferenceModel();
      const actions: Array<{ timestamp: bigint; delta: bigint }> = [];
      let balance = 0n;
      let timestamp = 0n;
      for (let step = 0; step < 40; step += 1) {
        timestamp += BigInt(random() % 4);
        const deposit = balance === 0n || (random() & 1) === 0;
        if (deposit) {
          const amount = BigInt((random() % 50) + 1);
          model.deposit(1, "alice", amount, timestamp);
          balance += amount;
          actions.push({ timestamp, delta: amount });
        } else {
          const amount = BigInt(random() % Number(balance)) + 1n;
          model.withdraw(1, "alice", amount, timestamp);
          balance -= amount;
          actions.push({ timestamp, delta: -amount });
        }
      }
      const end = timestamp + 5n;
      expect(model.weight(1, "alice", 0n, end)).to.equal(bruteWeight(actions, 0n, end));
    }
  });

  it("conserves principal, yield, sponsor, reserve, and winnings categories", function () {
    const accounting = new AccountingReferenceModel();
    accounting.depositPrincipal(1_000n);
    accounting.deployPrincipal(700n);
    accounting.returnPrincipal(200n);
    accounting.harvestGenuineSurplus(40n);
    accounting.sponsor(60n);
    accounting.reservePrize(40n, 60n);
    accounting.allocateWinnings(100n);
    accounting.autoSave(30n);
    expect(accounting.state).to.deep.equal({
      principalLiability: 1_030n,
      liquidPrincipal: 530n,
      deployedPrincipal: 500n,
      realizedSurplus: 0n,
      reservedPrize: 0n,
      sponsoredPrize: 0n,
      winningsLiability: 70n,
    });
    expect(() => accounting.withdrawPrincipal(531n)).to.throw("insufficient principal liquidity");
  });

  it("handles rejection-sampling boundaries without representing 2^128 in uint128", function () {
    expect(rejectionParameters(1n)).to.deep.equal({
      quotient: UINT128_DOMAIN,
      limit: UINT128_DOMAIN,
      acceptsAll: true,
    });
    expect(rejectionParameters(1n << 75n).acceptsAll).to.equal(true);
    const maximumSupported = 31_536_000_000_000_000_000_000n;
    const params = rejectionParameters(maximumSupported);
    expect(params.limit).to.be.lessThanOrEqual(UINT128_DOMAIN);
    expect(mapCandidate(params.limit - 1n, maximumSupported).accepted).to.equal(true);
    if (!params.acceptsAll) expect(mapCandidate(params.limit, maximumSupported).accepted).to.equal(false);
    expect(() => rejectionParameters(0n)).to.throw("outside source domain");
  });

  it("maps every accepted candidate uniformly for tractable source-domain analogues", function () {
    // The same quotient/limit proof is enumerated over 2^8 to avoid pretending 2^128 is enumerable.
    for (let total = 1; total <= 127; total += 1) {
      const domain = 256;
      const limit = Math.floor(domain / total) * total;
      const counts = Array.from({ length: total }, () => 0);
      for (let candidate = 0; candidate < limit; candidate += 1) counts[candidate % total] += 1;
      expect(new Set(counts).size).to.equal(1);
    }
  });

  it("rejects illegal round transitions and permits objective rerolls only", function () {
    const model = new RoundStateReferenceModel();
    expect(() => model.candidate(false)).to.throw("illegal candidate generation");
    model.close();
    model.finalizeAggregate(7n);
    model.candidate(false);
    model.validity(false);
    expect(model.state).to.equal(ReferenceRoundState.REJECTED);
    model.candidate(true);
    expect(model.state).to.equal(ReferenceRoundState.ACCEPTED);
    expect(() => model.candidate(false)).to.throw("illegal candidate generation");
  });
});
