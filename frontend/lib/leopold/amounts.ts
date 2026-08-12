import { formatUnits, parseUnits } from "viem";

export const USDC_DECIMALS = 6;

export function parseUsdcAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(normalized)) {
    throw new Error("INVALID_USDC_AMOUNT");
  }
  const amount = parseUnits(normalized, USDC_DECIMALS);
  if (amount <= 0n) throw new Error("AMOUNT_MUST_BE_POSITIVE");
  if (amount > 0xffff_ffff_ffff_ffffn) throw new Error("AMOUNT_EXCEEDS_PRIVATE_USDC_LIMIT");
  return amount;
}

export function formatUsdcAmount(value: bigint): string {
  return formatUnits(value, USDC_DECIMALS);
}

export function parseUsdcAmountWithinBalance(value: string, balance: bigint): bigint {
  const amount = parseUsdcAmount(value);
  if (amount > balance) throw new Error("INSUFFICIENT_USDC");
  return amount;
}
