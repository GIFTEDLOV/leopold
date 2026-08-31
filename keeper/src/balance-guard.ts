export function assertKeeperBalanceWithinLimits(
  balanceWei: bigint,
  minimumBalanceWei: bigint,
  maximumBalanceWei: bigint,
): void {
  if (minimumBalanceWei < 0n) {
    throw new Error("Keeper minimum balance must not be negative");
  }

  if (maximumBalanceWei <= 0n) {
    throw new Error("Keeper maximum balance must be greater than zero");
  }

  if (minimumBalanceWei > maximumBalanceWei) {
    throw new Error("Keeper minimum balance must not exceed its ceiling");
  }

  if (balanceWei < minimumBalanceWei) {
    throw new Error(`Keeper balance ${balanceWei} is below the configured minimum ${minimumBalanceWei}`);
  }

  if (balanceWei > maximumBalanceWei) {
    throw new Error(`Keeper balance ${balanceWei} exceeds the configured ceiling ` + `${maximumBalanceWei}`);
  }
}

/** Compatibility alias retained for the credential-only probe. */
export function assertKeeperBalanceWithinLimit(balanceWei: bigint, maximumBalanceWei: bigint): void {
  assertKeeperBalanceWithinLimits(balanceWei, 0n, maximumBalanceWei);
}
