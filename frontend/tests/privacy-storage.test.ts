// @vitest-environment jsdom
import { readFileSync } from "node:fs";
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

  it("never persists private plaintext, signatures, credentials, or confidential handles", () => {
    persistSafeTransaction({
      id: "tx-safe",
      kind: "save",
      hash: `0x${"2".repeat(64)}`,
      chainId: 11_155_111,
      account: "0x1111111111111111111111111111111111111111",
      stage: "private",
      updatedAt: 2,
    });
    const raw = localStorage.getItem("leopold.public-transactions.v1") ?? "";
    expect(raw).not.toMatch(
      /amount|balance|plaintext|private.?key|signature|jwt|token|cipher|proof|handle|decryption|winnings|prize.?result/iu,
    );
  });

  it("keeps application auth and private-session modules out of browser credential storage and logs", () => {
    const sources = [
      "../components/auth-provider.tsx",
      "../components/financial-provider.tsx",
      "../lib/leopold/zama.ts",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/document\.cookie|indexedDB|localStorage|sessionStorage/iu);
      expect(source).not.toMatch(/console\.(log|debug|info)/u);
    }
  });
});
