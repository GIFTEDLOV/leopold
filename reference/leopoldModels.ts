export type VaultId = 1 | 2 | 3 | 4;

export type BalanceAction = {
  timestamp: bigint;
  delta: bigint;
};

type Checkpoint = {
  timestamp: bigint;
  balance: bigint;
  cumulative: bigint;
};

const key = (vaultId: VaultId, account: string): string => `${vaultId}:${account.toLowerCase()}`;

/** Exact cumulative balance-time model. Actions with equal timestamps execute in insertion order. */
export class TwabReferenceModel {
  private readonly checkpoints = new Map<string, Checkpoint[]>();
  private readonly vaultTotals = new Map<VaultId, Checkpoint[]>();

  balance(vaultId: VaultId, account: string): bigint {
    return this.last(this.checkpoints.get(key(vaultId, account)))?.balance ?? 0n;
  }

  totalBalance(vaultId: VaultId): bigint {
    return this.last(this.vaultTotals.get(vaultId))?.balance ?? 0n;
  }

  deposit(vaultId: VaultId, account: string, amount: bigint, timestamp: bigint): void {
    if (amount <= 0n) throw new Error("deposit must be positive");
    this.change(vaultId, account, amount, timestamp);
  }

  withdraw(vaultId: VaultId, account: string, amount: bigint, timestamp: bigint): void {
    if (amount <= 0n || amount > this.balance(vaultId, account)) throw new Error("invalid withdrawal");
    this.change(vaultId, account, -amount, timestamp);
  }

  move(source: VaultId, destination: VaultId, account: string, amount: bigint, timestamp: bigint): void {
    if (source === destination) throw new Error("vault move must cross vaults");
    this.withdraw(source, account, amount, timestamp);
    this.deposit(destination, account, amount, timestamp);
  }

  cumulativeAt(vaultId: VaultId, account: string, timestamp: bigint): bigint {
    return this.interpolate(this.checkpoints.get(key(vaultId, account)), timestamp);
  }

  weight(vaultId: VaultId, account: string, opensAt: bigint, closesAt: bigint): bigint {
    if (closesAt < opensAt) throw new Error("invalid interval");
    return this.cumulativeAt(vaultId, account, closesAt) - this.cumulativeAt(vaultId, account, opensAt);
  }

  aggregateWeight(vaultId: VaultId, opensAt: bigint, closesAt: bigint): bigint {
    return (
      this.interpolate(this.vaultTotals.get(vaultId), closesAt) -
      this.interpolate(this.vaultTotals.get(vaultId), opensAt)
    );
  }

  checkpointSnapshot(vaultId: VaultId, account: string): readonly Checkpoint[] {
    return [...(this.checkpoints.get(key(vaultId, account)) ?? [])];
  }

  private change(vaultId: VaultId, account: string, delta: bigint, timestamp: bigint): void {
    const userKey = key(vaultId, account);
    const user = this.checkpoints.get(userKey) ?? [];
    const userBalance = this.last(user)?.balance ?? 0n;
    if (userBalance + delta < 0n) throw new Error("negative balance");
    this.write(user, userBalance + delta, timestamp);
    this.checkpoints.set(userKey, user);

    const total = this.vaultTotals.get(vaultId) ?? [];
    const totalBalance = this.last(total)?.balance ?? 0n;
    if (totalBalance + delta < 0n) throw new Error("negative aggregate");
    this.write(total, totalBalance + delta, timestamp);
    this.vaultTotals.set(vaultId, total);
  }

  private write(checkpoints: Checkpoint[], newBalance: bigint, timestamp: bigint): void {
    const previous = this.last(checkpoints);
    if (previous && timestamp < previous.timestamp) throw new Error("actions must be chronological");
    const cumulative = previous ? previous.cumulative + previous.balance * (timestamp - previous.timestamp) : 0n;
    if (previous?.timestamp === timestamp) {
      previous.balance = newBalance;
      previous.cumulative = cumulative;
      return;
    }
    checkpoints.push({ timestamp, balance: newBalance, cumulative });
  }

  private interpolate(checkpoints: Checkpoint[] | undefined, timestamp: bigint): bigint {
    if (!checkpoints?.length || timestamp < checkpoints[0].timestamp) return 0n;
    let low = 0;
    let high = checkpoints.length;
    while (low + 1 < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (checkpoints[middle].timestamp <= timestamp) low = middle;
      else high = middle;
    }
    const observation = checkpoints[low];
    return observation.cumulative + observation.balance * (timestamp - observation.timestamp);
  }

  private last(values: Checkpoint[] | undefined): Checkpoint | undefined {
    return values?.[values.length - 1];
  }
}

export type AccountingSnapshot = {
  principalLiability: bigint;
  liquidPrincipal: bigint;
  deployedPrincipal: bigint;
  realizedSurplus: bigint;
  reservedPrize: bigint;
  sponsoredPrize: bigint;
  winningsLiability: bigint;
};

/** Plaintext conservation model; every method checks category and solvency invariants. */
export class AccountingReferenceModel {
  readonly state: AccountingSnapshot = {
    principalLiability: 0n,
    liquidPrincipal: 0n,
    deployedPrincipal: 0n,
    realizedSurplus: 0n,
    reservedPrize: 0n,
    sponsoredPrize: 0n,
    winningsLiability: 0n,
  };

  depositPrincipal(amount: bigint): void {
    this.positive(amount);
    this.state.principalLiability += amount;
    this.state.liquidPrincipal += amount;
    this.assertInvariants();
  }

  withdrawPrincipal(amount: bigint): void {
    this.positive(amount);
    if (amount > this.state.principalLiability || amount > this.state.liquidPrincipal)
      throw new Error("insufficient principal liquidity");
    this.state.principalLiability -= amount;
    this.state.liquidPrincipal -= amount;
    this.assertInvariants();
  }

  deployPrincipal(amount: bigint): void {
    this.positive(amount);
    if (amount > this.state.liquidPrincipal) throw new Error("insufficient liquid principal");
    this.state.liquidPrincipal -= amount;
    this.state.deployedPrincipal += amount;
    this.assertInvariants();
  }

  returnPrincipal(amount: bigint): void {
    this.positive(amount);
    if (amount > this.state.deployedPrincipal) throw new Error("excess principal return");
    this.state.deployedPrincipal -= amount;
    this.state.liquidPrincipal += amount;
    this.assertInvariants();
  }

  harvestGenuineSurplus(amount: bigint): void {
    this.positive(amount);
    this.state.realizedSurplus += amount;
    this.assertInvariants();
  }

  sponsor(amount: bigint): void {
    this.positive(amount);
    this.state.sponsoredPrize += amount;
    this.assertInvariants();
  }

  reservePrize(fromYield: bigint, fromSponsor: bigint): void {
    if (fromYield < 0n || fromSponsor < 0n) throw new Error("negative prize source");
    if (fromYield > this.state.realizedSurplus || fromSponsor > this.state.sponsoredPrize)
      throw new Error("unfunded prize");
    this.state.realizedSurplus -= fromYield;
    this.state.sponsoredPrize -= fromSponsor;
    this.state.reservedPrize += fromYield + fromSponsor;
    this.assertInvariants();
  }

  allocateWinnings(amount: bigint): void {
    this.positive(amount);
    if (amount > this.state.reservedPrize) throw new Error("unreserved winnings");
    this.state.reservedPrize -= amount;
    this.state.winningsLiability += amount;
    this.assertInvariants();
  }

  autoSave(amount: bigint): void {
    this.positive(amount);
    if (amount > this.state.winningsLiability) throw new Error("excess auto-save");
    this.state.winningsLiability -= amount;
    this.state.principalLiability += amount;
    this.state.liquidPrincipal += amount;
    this.assertInvariants();
  }

  assertInvariants(): void {
    for (const value of Object.values(this.state)) if (value < 0n) throw new Error("negative accounting category");
    if (this.state.liquidPrincipal + this.state.deployedPrincipal !== this.state.principalLiability) {
      throw new Error("principal reconciliation failed");
    }
  }

  private positive(amount: bigint): void {
    if (amount <= 0n) throw new Error("amount must be positive");
  }
}

export const UINT128_DOMAIN = 1n << 128n;

export function rejectionParameters(totalWeight: bigint): { quotient: bigint; limit: bigint; acceptsAll: boolean } {
  if (totalWeight <= 0n || totalWeight >= UINT128_DOMAIN) throw new Error("total weight outside source domain");
  const quotient = UINT128_DOMAIN / totalWeight;
  const limit = quotient * totalWeight;
  return { quotient, limit, acceptsAll: limit === UINT128_DOMAIN };
}

export function mapCandidate(candidate: bigint, totalWeight: bigint): { accepted: boolean; ticket?: bigint } {
  if (candidate < 0n || candidate >= UINT128_DOMAIN) throw new Error("candidate outside uint128");
  const { limit, acceptsAll } = rejectionParameters(totalWeight);
  if (!acceptsAll && candidate >= limit) return { accepted: false };
  return { accepted: true, ticket: candidate % totalWeight };
}

export enum ReferenceRoundState {
  OPEN,
  AGGREGATE_PENDING,
  AGGREGATE_FINALIZED,
  EMPTY,
  VALIDITY_PENDING,
  REJECTED,
  ACCEPTED,
  WINNER_PROCESSING,
  WINNINGS_ALLOCATED,
  SETTLED,
}

export class RoundStateReferenceModel {
  state = ReferenceRoundState.OPEN;

  close(): void {
    this.transition(ReferenceRoundState.OPEN, ReferenceRoundState.AGGREGATE_PENDING);
  }

  finalizeAggregate(totalWeight: bigint): void {
    this.transition(
      ReferenceRoundState.AGGREGATE_PENDING,
      totalWeight === 0n ? ReferenceRoundState.EMPTY : ReferenceRoundState.AGGREGATE_FINALIZED,
    );
  }

  candidate(acceptsAll: boolean): void {
    if (this.state !== ReferenceRoundState.AGGREGATE_FINALIZED && this.state !== ReferenceRoundState.REJECTED)
      throw new Error("illegal candidate generation");
    this.state = acceptsAll ? ReferenceRoundState.ACCEPTED : ReferenceRoundState.VALIDITY_PENDING;
  }

  validity(valid: boolean): void {
    this.transition(
      ReferenceRoundState.VALIDITY_PENDING,
      valid ? ReferenceRoundState.ACCEPTED : ReferenceRoundState.REJECTED,
    );
  }

  private transition(expected: ReferenceRoundState, next: ReferenceRoundState): void {
    if (this.state !== expected) throw new Error("illegal round transition");
    this.state = next;
  }
}
