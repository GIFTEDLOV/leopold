import { describe, expect, it, vi } from "vitest";

import { claimSettlementRewards, materializeEligibility, type ActionClients } from "../lib/leopold/actions";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const VAULT = "0x2222222222222222222222222222222222222222" as const;
const HASH = `0x${"1".repeat(64)}` as const;

function makeClients({
  simulateContract = vi.fn(async () => ({ request: { gas: 100_000n } })),
  writeContract = vi.fn(async () => HASH),
  waitForTransactionReceipt = vi.fn(async () => ({ status: "success" as const })),
}: {
  simulateContract?: ReturnType<typeof vi.fn>;
  writeContract?: ReturnType<typeof vi.fn>;
  waitForTransactionReceipt?: ReturnType<typeof vi.fn>;
} = {}) {
  const clients = {
    publicClient: {
      simulateContract,
      waitForTransactionReceipt,
    },
    walletClient: {
      account: { address: ACCOUNT },
      getChainId: vi.fn(async () => 11_155_111),
      writeContract,
    },
    account: ACCOUNT,
  } as unknown as ActionClients;
  return { clients, simulateContract, writeContract, waitForTransactionReceipt };
}

describe("private eligibility materialization safety", () => {
  it("simulates before signing and submits exactly once on success", async () => {
    const probe = makeClients();

    await expect(materializeEligibility(probe.clients, VAULT, 1n)).resolves.toBe(HASH);

    expect(probe.simulateContract).toHaveBeenCalledOnce();
    expect(probe.writeContract).toHaveBeenCalledOnce();
    expect(probe.waitForTransactionReceipt).toHaveBeenCalledOnce();
  });

  it("does not sign when the open-round/state simulation rejects", async () => {
    const simulationError = new Error("execution reverted: WeightUnavailable");
    const probe = makeClients({ simulateContract: vi.fn().mockRejectedValue(simulationError) });

    await expect(materializeEligibility(probe.clients, VAULT, 1n)).rejects.toThrow("ACTION_SIMULATION_FAILED");
    expect(probe.writeContract).not.toHaveBeenCalled();
  });

  it("reports a reverted receipt without retrying the write", async () => {
    const probe = makeClients({
      waitForTransactionReceipt: vi.fn(async () => ({ status: "reverted" as const })),
    });

    await expect(materializeEligibility(probe.clients, VAULT, 1n)).rejects.toThrow(
      "ACTION_REVERTED:materializeMyRoundWeight",
    );
    expect(probe.writeContract).toHaveBeenCalledOnce();
  });
});

describe("settlement reward claim safety", () => {
  const ESCROW = "0x3333333333333333333333333333333333333333" as const;

  it("confirms one successful reward claim without retrying the write", async () => {
    const probe = makeClients();

    await expect(claimSettlementRewards(probe.clients, ESCROW)).resolves.toBe(HASH);

    expect(probe.writeContract).toHaveBeenCalledOnce();
    expect(probe.waitForTransactionReceipt).toHaveBeenCalledOnce();
  });

  it("reports a reverted reward claim without automatically retrying", async () => {
    const probe = makeClients({
      waitForTransactionReceipt: vi.fn(async () => ({ status: "reverted" as const })),
    });

    await expect(claimSettlementRewards(probe.clients, ESCROW)).rejects.toThrow(
      "ACTION_REVERTED:withdrawSettlementRewards",
    );
    expect(probe.writeContract).toHaveBeenCalledOnce();
  });
});
