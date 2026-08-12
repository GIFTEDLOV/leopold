// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadSafeTransactions, persistSafeTransaction } from "../lib/leopold/transactions";

describe("privacy-safe transaction persistence", () => {
  beforeEach(() => localStorage.clear());

  it("persists only public lifecycle metadata and isolates wallets", () => {
    persistSafeTransaction({
      id: "tx-1",
      kind: "save",
      hash: `0x${"1".repeat(64)}`,
      chainId: 11_155_111,
      account: "0x1111111111111111111111111111111111111111",
      stage: "confirming",
      updatedAt: 1,
    });
    const raw = localStorage.getItem("leopold.public-transactions.v1") ?? "";
    expect(raw).not.toMatch(/amount|balance|proof|handle|cipher|result/iu);
    expect(loadSafeTransactions("0x1111111111111111111111111111111111111111")).toHaveLength(1);
    expect(loadSafeTransactions("0x2222222222222222222222222222222222222222")).toHaveLength(0);
  });
});
