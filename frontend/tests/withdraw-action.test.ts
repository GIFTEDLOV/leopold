import { beforeEach, describe, expect, it, vi } from "vitest";

import { closeExpiredRound, withdrawSavings, type ActionClients } from "../lib/leopold/actions";
import { requireConfiguredAddress, leopoldConfig } from "../lib/leopold/config";
import { encryptPrivateAmount } from "../lib/leopold/zama";

vi.mock("../lib/leopold/zama", () => ({
  decryptPublicValue: vi.fn(),
  encryptPrivateAmount: vi.fn(),
}));

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const VAULT = requireConfiguredAddress(leopoldConfig.vaults[0].vault, "Daily vault");
const HASH = `0x${"a".repeat(64)}` as `0x${string}`;

function makeClients() {
  const simulateContract = vi.fn(async () => ({ request: { gas: 250_000n } }));
  const writeContract = vi.fn(async () => HASH);
  const waitForTransactionReceipt = vi.fn(
    async (): Promise<{ status: "success" | "reverted" }> => ({
      status: "success",
    }),
  );
  const clients = {
    publicClient: { simulateContract, waitForTransactionReceipt },
    walletClient: {
      account: { address: ACCOUNT },
      getChainId: vi.fn(async () => 11_155_111),
      writeContract,
    },
    ethereum: { request: vi.fn() },
    account: ACCOUNT,
  } as unknown as ActionClients;
  return { clients, simulateContract, writeContract, waitForTransactionReceipt };
}

describe("withdraw transaction actions", () => {
  beforeEach(() => {
    vi.mocked(encryptPrivateAmount).mockResolvedValue({
      encryptedValue: `0x${"1".repeat(64)}`,
      inputProof: "0x1234",
    });
  });

  it("simulates and writes closeRound using the official vault", async () => {
    const probe = makeClients();
    const stages: string[] = [];
    await expect(closeExpiredRound({ ...probe.clients, onStage: (stage) => stages.push(stage) }, VAULT)).resolves.toBe(
      HASH,
    );
    expect(probe.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: VAULT, functionName: "closeRound", args: undefined }),
    );
    expect(probe.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: VAULT, functionName: "closeRound", gas: 250_000n }),
    );
    expect(stages).toEqual([
      "withdraw-round-advance-simulating",
      "withdraw-round-advance-signature",
      "withdraw-round-advance-submitted",
      "withdraw-round-advance-confirming",
    ]);
  });

  it("simulates the normal withdrawal only after preparation", async () => {
    const probe = makeClients();
    const stages: string[] = [];
    await expect(
      withdrawSavings({ ...probe.clients, onStage: (stage) => stages.push(stage) }, VAULT, 100_000n),
    ).resolves.toBe(HASH);
    expect(probe.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: VAULT, functionName: "withdraw" }),
    );
    expect(probe.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: VAULT, functionName: "withdraw", gas: 250_000n }),
    );
    expect(stages).toContain("withdraw-simulating");
    expect(stages).toContain("withdraw-receipt");
  });

  it("preserves the receipt stage when a round-advance receipt is reverted", async () => {
    const probe = makeClients();
    probe.waitForTransactionReceipt.mockResolvedValueOnce({ status: "reverted" as const });

    await expect(closeExpiredRound(probe.clients, VAULT)).rejects.toThrow(
      "WITHDRAW:ROUND_ADVANCE_RECEIPT:status=reverted",
    );
  });
});
