export function assertKeeperBalanceWithinLimit(balanceWei: bigint, maximumBalanceWei: bigint): void {
  if (maximumBalanceWei <= 0n) {
    throw new Error("Keeper maximum balance must be greater than zero");
  }

  if (balanceWei > maximumBalanceWei) {
    throw new Error(`Keeper balance ${balanceWei} exceeds the configured ceiling ` + `${maximumBalanceWei}`);
  }
}
