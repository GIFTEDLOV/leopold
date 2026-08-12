"use strict";

class History {
  observations = [];

  update(delta, timestamp) {
    const previous = this.observations.at(-1);
    if (previous && timestamp < previous.timestamp) throw new Error("non-chronological mutation");
    const cumulative = previous ? previous.cumulative + previous.balance * (timestamp - previous.timestamp) : 0n;
    const balance = (previous?.balance ?? 0n) + delta;
    if (balance < 0n) throw new Error("negative balance");
    if (previous?.timestamp === timestamp) {
      previous.balance = balance;
      previous.cumulative = cumulative;
    } else {
      this.observations.push({ timestamp, balance, cumulative });
    }
  }

  cumulativeAt(timestamp) {
    const values = this.observations;
    if (!values.length || timestamp < values[0].timestamp) return 0n;
    let low = 0;
    let high = values.length;
    while (low + 1 < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (values[middle].timestamp <= timestamp) low = middle;
      else high = middle;
    }
    const observation = values[low];
    return observation.cumulative + observation.balance * (timestamp - observation.timestamp);
  }

  twab(start, end) {
    return this.cumulativeAt(end) - this.cumulativeAt(start);
  }
}

class SparseHistoricalSegmentTree {
  constructor(depth) {
    if (!Number.isInteger(depth) || depth < 1 || depth > 32) throw new Error("invalid depth");
    this.depth = depth;
    this.capacity = 2 ** depth;
    this.nodes = new Map();
    this.slots = new Map();
    this.nextSlot = 0;
  }

  register(account, explicitSlot) {
    if (this.slots.has(account)) throw new Error("duplicate account");
    const slot = explicitSlot ?? this.nextSlot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.capacity) throw new Error("slot exhausted");
    if ([...this.slots.values()].includes(slot)) throw new Error("duplicate slot");
    this.slots.set(account, slot);
    this.nextSlot = Math.max(this.nextSlot, slot + 1);
    return slot;
  }

  update(account, delta, timestamp) {
    const slot = this.slots.get(account);
    if (slot === undefined) throw new Error("unknown account");
    const leaf = this.leafIndex(slot);
    const current = this.history(leaf).observations.at(-1)?.balance ?? 0n;
    if (current + delta < 0n) throw new Error("negative user balance");
    for (let node = leaf; node >= 1; node >>= 1) this.history(node).update(delta, timestamp);
  }

  weight(account, start, end) {
    const slot = this.slots.get(account);
    if (slot === undefined) throw new Error("unknown account");
    return this.history(this.leafIndex(slot)).twab(start, end);
  }

  prefix(account, start, end) {
    const slot = this.slots.get(account);
    if (slot === undefined) throw new Error("unknown account");
    let node = this.leafIndex(slot);
    let sum = 0n;
    while (node > 1) {
      if ((node & 1) === 1) sum += this.history(node - 1).twab(start, end);
      node >>= 1;
    }
    return sum;
  }

  total(start, end) {
    return this.history(1).twab(start, end);
  }

  interval(account, start, end) {
    const prefix = this.prefix(account, start, end);
    const weight = this.weight(account, start, end);
    return { prefix, weight, upper: prefix + weight };
  }

  winner(account, start, end, ticket) {
    const { prefix, weight, upper } = this.interval(account, start, end);
    return weight > 0n && prefix <= ticket && ticket < upper;
  }

  canonicalPrefixNodeCount(slot) {
    let node = this.leafIndex(slot);
    let count = 0;
    while (node > 1) {
      if ((node & 1) === 1) count += 1;
      node >>= 1;
    }
    return count;
  }

  leafIndex(slot) {
    return 2 ** this.depth + slot;
  }

  history(node) {
    let history = this.nodes.get(node);
    if (!history) {
      history = new History();
      this.nodes.set(node, history);
    }
    return history;
  }
}

module.exports = { History, SparseHistoricalSegmentTree };
