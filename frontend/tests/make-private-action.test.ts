import { describe, expect, it, vi } from "vitest";

import { makePrivate, type ActionClients } from "../lib/leopold/actions";
import { classifyLeopoldError } from "../lib/leopold/errors";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const WRAPPER = "0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8" as const;
const APPROVAL_HASH = `0x${"a".repeat(64)}` as const;
const WRAP_HASH = `0x${"b".repeat(64)}` as const;

function makeClients({
  allowance = [0n, 1_000_000n],
  simulateContract = vi.fn(async () => ({ request: { gas: 100_000n } })),
}: {
  allowance?: bigint[];
  simulateContract?: ReturnType<typeof vi.fn>;
} = {}) {
  const readContract = vi.fn();
  for (const value of allowance) readContract.mockResolvedValueOnce(value);
  const writeContract = vi.fn().mockResolvedValueOnce(APPROVAL_HASH).mockResolvedValueOnce(WRAP_HASH);
  const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });
  const clients = {
    publicClient: { readContract, simulateContract, waitForTransactionReceipt },
    walletClient: { account: { address: ACCOUNT }, writeContract },
    ethereum: { request: vi.fn() },
    account: ACCOUNT,
  } as unknown as ActionClients;
  return { clients, readContract, simulateContract, writeContract, waitForTransactionReceipt };
}

describe("authenticated Make Private sequence", () => {
  it("parses 1 USDC as 1,000,000 units and simulates approval and wrap before signing", async () => {
    const probe = makeClients();

    await expect(makePrivate(probe.clients, WRAPPER, 1_000_000n)).resolves.toEqual([APPROVAL_HASH, WRAP_HASH]);

    expect(probe.simulateContract).toHaveBeenCalledTimes(2);
    expect(probe.simulateContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "approve", args: [WRAPPER, 1_000_000n] }),
    );
    expect(probe.simulateContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "wrap", args: [ACCOUNT, 1_000_000n] }),
    );
    expect(probe.writeContract).toHaveBeenCalledTimes(2);
    expect(probe.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "approve", gas: 100_000n }),
    );
    expect(probe.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "wrap", gas: 100_000n }),
    );
  });

  it("does not sign wrap when its read-only simulation exposes the exact revert", async () => {
    const error = { message: "execution reverted", cause: { reason: "ERC20: transfer amount exceeds allowance" } };
    const simulateContract = vi
      .fn()
      .mockResolvedValueOnce({ request: { gas: 100_000n } })
      .mockRejectedValueOnce(error);
    const probe = makeClients({ simulateContract });

    await expect(makePrivate(probe.clients, WRAPPER, 1_000_000n)).rejects.toMatchObject({
      message: expect.stringContaining("ACTION_SIMULATION_FAILED:make-private-wrap"),
    });
    expect(probe.writeContract).toHaveBeenCalledTimes(1);
    expect(classifyLeopoldError(new Error("ACTION_SIMULATION_FAILED:make-private-wrap", { cause: error })).code).toBe(
      "TRANSACTION_SIMULATION_FAILED",
    );
    expect(
      classifyLeopoldError(new Error("ACTION_SIMULATION_FAILED:make-private-wrap", { cause: error })).technicalDetail,
    ).toContain("transfer amount exceeds allowance");
  });

  it("does not sign wrap when approval receipt state is not visible through the read client", async () => {
    const probe = makeClients({ allowance: [0n, 0n] });

    await expect(makePrivate(probe.clients, WRAPPER, 1_000_000n)).rejects.toThrow(
      "ACTION_CONFIRMATION_FAILED:make-private-approval-allowance:0",
    );
    expect(probe.writeContract).toHaveBeenCalledTimes(1);
    expect(probe.simulateContract).toHaveBeenCalledTimes(1);
  });

  it("skips approval when allowance is already sufficient", async () => {
    const probe = makeClients({ allowance: [1_000_000n] });
    probe.writeContract.mockReset().mockResolvedValue(WRAP_HASH);

    await expect(makePrivate(probe.clients, WRAPPER, 1_000_000n)).resolves.toEqual([WRAP_HASH]);
    expect(probe.simulateContract).toHaveBeenCalledTimes(1);
    expect(probe.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "wrap", args: [ACCOUNT, 1_000_000n] }),
    );
    expect(probe.writeContract).toHaveBeenCalledTimes(1);
  });
});
