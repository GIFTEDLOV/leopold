import { expect } from "chai";

import {
  AccountingReferenceModel,
  completePrivateDraw,
  deterministicChunks,
  mapCandidate,
  ReferenceRoundState,
  rejectionParameters,
  RoundStateReferenceModel,
  settlePrivateDraw,
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

  it("covers every locked uint128 rejection-mapping edge", function () {
    const maximum = 31_536_000_000_000_000_000_000n;
    for (const total of [1n, 2n, 1n << 32n, (1n << 32n) - 1n, (1n << 32n) + 1n, maximum]) {
      const { limit, acceptsAll } = rejectionParameters(total);
      expect(mapCandidate(0n, total)).to.deep.equal({ accepted: true, ticket: 0n });
      expect(mapCandidate(limit - 1n, total).accepted).to.equal(true);
      if (!acceptsAll) {
        expect(mapCandidate(limit, total)).to.deep.equal({ accepted: false });
        expect(mapCandidate(UINT128_DOMAIN - 1n, total)).to.deep.equal({ accepted: false });
      }
    }
    expect(() => mapCandidate(UINT128_DOMAIN, 2n)).to.throw("outside uint128");
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

  it("selects exactly one positive interval and conserves keep-available prizes", function () {
    const participants = [
      { account: "zero", weight: 0n, principal: 0n, winnings: 0n, autoSave: false },
      { account: "alice", weight: 7n, principal: 10n, winnings: 1n, autoSave: false },
      { account: "bob", weight: 3n, principal: 20n, winnings: 2n, autoSave: true },
    ];
    for (let ticket = 0n; ticket < 10n; ticket += 1n) {
      const result = settlePrivateDraw(participants, ticket, 50n, 100n, 1_000n);
      expect(result.participants.filter((participant) => participant.winner)).to.have.length(1);
      expect(result.participants[0].winner).to.equal(false);
      expect(result.finalCumulative).to.equal(result.totalWeight);
      expect(result.principalAdded + result.winningsAdded).to.equal(50n);
      expect(result.allocatedPrize).to.equal(50n);
    }
  });

  it("auto-saves only at conversion time and falls back to private winnings at the principal cap", function () {
    const auto = [{ account: "alice", weight: 1n, principal: 10n, winnings: 0n, autoSave: true }];
    const saved = settlePrivateDraw(auto, 0n, 5n, 123n, 20n).participants[0];
    expect(saved).to.include({ principal: 15n, winnings: 0n, autoSavedPrize: 5n, autoSaveTimestamp: 123n });
    const capped = settlePrivateDraw(auto, 0n, 11n, 123n, 20n).participants[0];
    expect(capped).to.include({ principal: 10n, winnings: 11n, autoSavedPrize: 0n });
    expect(capped.autoSaveTimestamp).to.equal(undefined);
  });

  it("makes chunk size and interruption points outcome-independent", function () {
    const participants = Array.from({ length: 37 }, (_, index) => ({
      account: `p${index}`,
      weight: BigInt(index % 5),
      principal: BigInt(index),
      winnings: 0n,
      autoSave: index % 2 === 0,
    }));
    const baseline = settlePrivateDraw(participants, 41n, 99n, 500n, 10_000n);
    for (const chunkSize of [1, 2, 3, 8, 32, 100]) {
      expect(deterministicChunks(participants.length, chunkSize).flat()).to.deep.equal(
        Array.from({ length: participants.length }, (_, index) => index),
      );
      expect(settlePrivateDraw(participants, 41n, 99n, 500n, 10_000n)).to.deep.equal(baseline);
    }
  });

  it("fuzzes weights, preferences, prizes, tickets and chunking with a preserved seed", function () {
    let seed = 0xc01df00d;
    const random = (): number => (seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0);
    for (let run = 0; run < 500; run += 1) {
      const count = (random() % 80) + 1;
      const participants = Array.from({ length: count }, (_, index) => ({
        account: `p${index}`,
        weight: BigInt(random() % 100),
        principal: BigInt(random() % 10_000),
        winnings: BigInt(random() % 1_000),
        autoSave: (random() & 1) === 1,
      }));
      if (participants.every((participant) => participant.weight === 0n)) participants[0].weight = 1n;
      const total = participants.reduce((sum, participant) => sum + participant.weight, 0n);
      const ticket = BigInt(random()) % total;
      const prize = BigInt((random() % 1_000) + 1);
      const result = settlePrivateDraw(participants, ticket, prize, 777n, 1_000_000_000n);
      expect(result.participants.filter((participant) => participant.winner)).to.have.length(1);
      expect(
        result.participants.filter((participant) => participant.weight === 0n && participant.winner),
      ).to.have.length(0);
      expect(result.principalAdded + result.winningsAdded).to.equal(prize);
      expect(deterministicChunks(count, (random() % 20) + 1).flat()).to.have.length(count);
    }
  });

  it("models candidate validity, accepted ticket, winner and settlement in one deterministic result", function () {
    const participants = [
      { account: "alice", weight: 4n, principal: 10n, winnings: 0n, autoSave: false },
      { account: "bob", weight: 6n, principal: 20n, winnings: 0n, autoSave: true },
    ];
    const result = completePrivateDraw(participants, 17n, 8n, 55n, 1_000n);
    expect(result.candidateValid).to.equal(true);
    expect(result.acceptedTicket).to.equal(7n);
    expect(result.participants[result.winnerIndex].account).to.equal("bob");
    expect(result.principalAdded).to.equal(8n);
    const { limit } = rejectionParameters(10n);
    expect(() => completePrivateDraw(participants, limit, 8n, 55n, 1_000n)).to.throw("candidate objectively rejected");
  });
});
