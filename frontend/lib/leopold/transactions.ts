export type TransactionStage =
  | "ready"
  | "wallet"
  | "submitted"
  | "confirming"
  | "approval-simulating"
  | "approval-signature"
  | "approval-submitted"
  | "approval-confirming"
  | "allowance-refresh"
  | "wrap-simulating"
  | "wrap-signature"
  | "wrap-submitted"
  | "wrap-confirming"
  | "save-encrypting"
  | "save-simulating"
  | "save-signature"
  | "save-submitted"
  | "save-confirming"
  | "save-receipt"
  | "save-post-refresh"
  | "withdraw-round-check"
  | "withdraw-round-advance-simulating"
  | "withdraw-round-advance-signature"
  | "withdraw-round-advance-submitted"
  | "withdraw-round-advance-confirming"
  | "withdraw-refresh"
  | "withdraw-simulating"
  | "withdraw-signature"
  | "withdraw-submitted"
  | "withdraw-confirming"
  | "withdraw-receipt"
  | "private"
  | "complete"
  | "failed";

export const transactionStageLabel: Record<TransactionStage, string> = {
  ready: "Ready",
  wallet: "Waiting for wallet",
  submitted: "Submitted",
  confirming: "Confirming",
  "approval-simulating": "Simulating approval",
  "approval-signature": "Waiting for approval signature",
  "approval-submitted": "Approval submitted",
  "approval-confirming": "Confirming approval",
  "allowance-refresh": "Refreshing USDC allowance",
  "wrap-simulating": "Simulating private conversion",
  "wrap-signature": "Waiting for private conversion signature",
  "wrap-submitted": "Private conversion submitted",
  "wrap-confirming": "Confirming private conversion",
  "save-encrypting": "Encrypting private deposit",
  "save-simulating": "Simulating vault deposit",
  "save-signature": "Waiting for vault deposit signature",
  "save-submitted": "Vault deposit submitted",
  "save-confirming": "Confirming vault deposit",
  "save-receipt": "Vault deposit receipt confirmed",
  "save-post-refresh": "Refreshing vault state",
  "withdraw-round-check": "Checking withdrawal eligibility",
  "withdraw-round-advance-simulating": "Preparing withdrawal",
  "withdraw-round-advance-signature": "Confirm preparation",
  "withdraw-round-advance-submitted": "Withdrawal preparation submitted",
  "withdraw-round-advance-confirming": "Confirming withdrawal preparation",
  "withdraw-refresh": "Refreshing round state",
  "withdraw-simulating": "Simulating withdrawal",
  "withdraw-signature": "Waiting for withdrawal signature",
  "withdraw-submitted": "Withdrawal submitted",
  "withdraw-confirming": "Confirming withdrawal",
  "withdraw-receipt": "Withdrawal receipt confirmed",
  private: "Private processing",
  complete: "Complete",
  failed: "Failed",
};

const busyStages = new Set<TransactionStage>([
  "wallet",
  "submitted",
  "confirming",
  "approval-simulating",
  "approval-signature",
  "approval-submitted",
  "approval-confirming",
  "allowance-refresh",
  "wrap-simulating",
  "wrap-signature",
  "wrap-submitted",
  "wrap-confirming",
  "save-encrypting",
  "save-simulating",
  "save-signature",
  "save-submitted",
  "save-confirming",
  "save-receipt",
  "save-post-refresh",
  "withdraw-round-check",
  "withdraw-round-advance-simulating",
  "withdraw-round-advance-signature",
  "withdraw-round-advance-submitted",
  "withdraw-round-advance-confirming",
  "withdraw-refresh",
  "withdraw-simulating",
  "withdraw-signature",
  "withdraw-submitted",
  "withdraw-confirming",
  "withdraw-receipt",
  "private",
]);

export function transactionIsBusy(stage: TransactionStage): boolean {
  return busyStages.has(stage);
}

export type SafeTransactionRecord = {
  id: string;
  kind: string;
  hash?: `0x${string}`;
  chainId: number;
  account: `0x${string}`;
  stage: TransactionStage;
  errorStage?: TransactionStage;
  updatedAt: number;
};

const STORAGE_KEY = "leopold.public-transactions.v1";

export function loadSafeTransactions(account: string): SafeTransactionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as SafeTransactionRecord[];
    return parsed.filter((item) => item.account.toLowerCase() === account.toLowerCase()).slice(0, 20);
  } catch {
    return [];
  }
}

export function persistSafeTransaction(record: SafeTransactionRecord): void {
  if (typeof window === "undefined") return;
  const existing = loadSafeTransactions(record.account).filter((item) => item.id !== record.id);
  // Amounts, ciphertexts, proofs, decrypted values, and result handles are intentionally never persisted.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...existing].slice(0, 20)));
}
