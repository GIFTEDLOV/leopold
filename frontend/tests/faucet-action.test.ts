import { describe, expect, it, vi } from "vitest";

import { getTestUsdc, type ActionClients } from "../lib/leopold/actions";

const FAUCET = "0x68793eA49297eB75DFB4610B68e076D2A5c7646C" as const;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const INPUT = `0x67a5cd06000000000000000000000000${USDC.slice(2).toLowerCase()}` as const;
const HASH = `0x${"a".repeat(64)}` as const;

function makeClients(overrides: Record<string, unknown> = {}): ActionClients {
  const publicClient = {
    getTransaction: vi.fn().mockResolvedValue({ to: FAUCET, input: INPUT }),
    call: vi.fn().mockResolvedValue({ data: "0x" }),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
  };
  const walletClient = {
    account: { address: ACCOUNT },
    getChainId: vi.fn().mockResolvedValue(11_155_111),
    sendTransaction: vi.fn().mockResolvedValue(HASH),
  };
  return {
    publicClient,
    walletClient,
    ethereum: { request: vi.fn() },
    account: ACCOUNT,
    ...overrides,
  } as unknown as ActionClients;
}

describe("canonical faucet action", () => {
  it("simulates the historical calldata before sending it", async () => {
    const clients = makeClients();
    await expect(getTestUsdc(clients)).resolves.toBe(HASH);

    expect(clients.publicClient.call).toHaveBeenCalledWith({ account: ACCOUNT, to: FAUCET, data: INPUT });
    expect(clients.walletClient.sendTransaction).toHaveBeenCalledWith({
      account: ACCOUNT,
      chain: undefined,
      to: FAUCET,
      data: INPUT,
    });
  });

  it("does not broadcast when the read-only simulation reverts", async () => {
    const clients = makeClients();
    const simulationError = new Error("execution reverted: rate limit");
    clients.publicClient.call = vi.fn().mockRejectedValue(simulationError);

    await expect(getTestUsdc(clients)).rejects.toBe(simulationError);
    expect(clients.walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it("does not simulate or broadcast from a Mainnet signer", async () => {
    const clients = makeClients();
    clients.walletClient.getChainId = vi.fn().mockResolvedValue(1);

    await expect(getTestUsdc(clients)).rejects.toThrow("WRONG_NETWORK:wallet-client-1");
    expect(clients.publicClient.call).not.toHaveBeenCalled();
    expect(clients.walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it("keeps the authenticated wallet-client account as the signer", async () => {
    const clients = makeClients();
    await getTestUsdc(clients);

    expect(clients.walletClient.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ account: ACCOUNT, to: FAUCET, data: INPUT }),
    );
  });
});
