export type TransactionStage = "ready" | "wallet" | "submitted" | "confirming" | "private" | "complete" | "failed";

export const transactionStageLabel: Record<TransactionStage, string> = {
  ready: "Ready",
  wallet: "Waiting for wallet",
  submitted: "Submitted",
  confirming: "Confirming",
  private: "Private processing",
  complete: "Complete",
  failed: "Failed",
};

export type SafeTransactionRecord = {
  id: string;
  kind: string;
  hash?: `0x${string}`;
  chainId: number;
  account: `0x${string}`;
  stage: TransactionStage;
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
