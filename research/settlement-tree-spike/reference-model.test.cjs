"use strict";

const assert = require("node:assert/strict");
const { SparseHistoricalSegmentTree } = require("./reference-model.cjs");

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function integer(random, maximum) {
  return Math.floor(random() * maximum);
}

function naiveWeight(actions, account, start, end) {
  let balance = 0n;
  let timestamp = 0n;
  let cumulative = 0n;
  for (const action of actions.filter((entry) => entry.account === account)) {
    if (action.timestamp > end) break;
    const capped = action.timestamp < start ? action.timestamp : action.timestamp;
    cumulative += balance * (capped - timestamp);
    balance += action.delta;
    timestamp = capped;
  }
  const cumulativeEnd = cumulative + balance * (end - timestamp);
  balance = 0n;
  timestamp = 0n;
  cumulative = 0n;
  for (const action of actions.filter((entry) => entry.account === account)) {
    if (action.timestamp > start) break;
    cumulative += balance * (action.timestamp - timestamp);
    balance += action.delta;
    timestamp = action.timestamp;
  }
  const cumulativeStart = cumulative + balance * (start - timestamp);
  return cumulativeEnd - cumulativeStart;
}

function verifyRound(tree, accounts, actions, start, end) {
  const intervals = accounts.map((account) => ({ account, ...tree.interval(account, start, end) }));
  let cursor = 0n;
  for (const interval of intervals) {
    assert.equal(interval.prefix, cursor, "prefix partition gap or overlap");
    assert.equal(interval.weight, naiveWeight(actions, interval.account, start, end), "TWAB differential mismatch");
    assert.equal(interval.upper, interval.prefix + interval.weight);
    cursor = interval.upper;
  }
  const total = tree.total(start, end);
  assert.equal(cursor, total, "partition does not cover aggregate total");
  if (total === 0n) return;

  // Exhaust every ticket without an O(T*n) scan: the established ordered,
  // gap-free partition lets one monotonic cursor identify the sole interval.
  let intervalIndex = 0;
  for (let ticket = 0n; ticket < total; ticket += 1n) {
    while (intervals[intervalIndex].upper <= ticket) intervalIndex += 1;
    const selected = intervals[intervalIndex];
    assert.ok(selected.weight > 0n && selected.prefix <= ticket && ticket < selected.upper);
    assert.equal(tree.winner(selected.account, start, end, ticket), true);
    if (intervalIndex > 0) assert.equal(tree.winner(intervals[intervalIndex - 1].account, start, end, ticket), false);
    if (intervalIndex + 1 < intervals.length) {
      assert.equal(tree.winner(intervals[intervalIndex + 1].account, start, end, ticket), false);
    }
  }

  const boundaries = new Set([0n, total - 1n]);
  for (const interval of intervals) {
    boundaries.add(interval.prefix);
    if (interval.prefix > 0n) boundaries.add(interval.prefix - 1n);
    if (interval.weight > 0n) boundaries.add(interval.upper - 1n);
  }
  for (const ticket of boundaries) {
    if (ticket < 0n || ticket >= total) continue;
    assert.equal(
      accounts.filter((account) => tree.winner(account, start, end, ticket)).length,
      1,
      `ticket ${ticket} did not select exactly one user`,
    );
  }
}

for (let scenario = 0; scenario < 1_000; scenario += 1) {
  const random = mulberry32(0x51a7c0de ^ scenario);
  const depth = 10;
  const tree = new SparseHistoricalSegmentTree(depth);
  const accountCount = 1 + integer(random, 24);
  const accounts = [];
  for (let index = 0; index < accountCount; index += 1) {
    const account = `user-${scenario}-${index}`;
    accounts.push(account);
    tree.register(account);
  }
  // Explicit gap proves sparse slots preserve ordered zero intervals.
  const gapAccount = `gap-${scenario}`;
  const gapSlot = Math.min(tree.capacity - 1, accountCount + 3);
  if (gapSlot >= tree.nextSlot) {
    tree.register(gapAccount, gapSlot);
    accounts.push(gapAccount);
  }
  accounts.sort((left, right) => tree.slots.get(left) - tree.slots.get(right));

  const balances = new Map(accounts.map((account) => [account, 0n]));
  const actions = [];
  let timestamp = 1n;
  const roundEnds = [];
  for (let mutation = 0; mutation < 80; mutation += 1) {
    timestamp += BigInt(integer(random, 4)); // includes same-timestamp mutations
    const account = accounts[integer(random, accounts.length)];
    const balance = balances.get(account);
    const withdraw = balance > 0n && random() < 0.45;
    const amount = withdraw ? 1n + BigInt(integer(random, Number(balance))) : 1n + BigInt(integer(random, 20));
    const delta = withdraw ? -amount : amount;
    tree.update(account, delta, timestamp);
    balances.set(account, balance + delta);
    actions.push({ account, timestamp, delta });
    if (mutation % 20 === 19) roundEnds.push(timestamp);
  }
  let start = 0n;
  for (const end of roundEnds) {
    verifyRound(tree, accounts, actions, start, end);
    start = end;
  }
  // Historical round remains exact after all later mutations.
  verifyRound(tree, accounts, actions, 0n, roundEnds[0]);
}

// Dynamic Fenwick counterexample: capacity one at first update cannot populate future node 2.
const naiveFenwick = [0n, 0n, 0n];
naiveFenwick[1] += 7n;
assert.equal(naiveFenwick[2], 0n, "counterexample setup drift");
assert.notEqual(naiveFenwick[2], 7n, "naive dynamically grown Fenwick unexpectedly correct");

// One million zero-balance historical slots do not enter a known-slot prefix path.
const large = new SparseHistoricalSegmentTree(20);
large.register("honest", 999_999);
assert.ok(large.canonicalPrefixNodeCount(999_999) <= 20);

console.log("SETTLEMENT_TREE_REFERENCE_VALID scenarios=1000 rounds=4000 seed=0x51a7c0de");
