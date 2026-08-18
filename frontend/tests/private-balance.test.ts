import { beforeEach, describe, expect, it, vi } from "vitest";

import { LEOPOLD_CHAIN_ID, leopoldConfig } from "../lib/leopold/config";
import { decryptPrivateValue } from "../lib/leopold/zama";
import {
  privateBalanceDiagnostic,
  readPrivateBalance,
  type PrivateBalanceClients,
} from "../lib/leopold/private-balance";

vi.mock("../lib/leopold/zama", () => ({
  decryptPrivateValue: vi.fn(),
}));

const ACCOUNT = "0x82a983325de92aede126c18e9fe3b53da1ab3329" as const;
const TOKEN = "0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8" as const;
const ZERO_HANDLE = `0x${"0".repeat(64)}` as const;
const BALANCE_HANDLE = `0x${"1".repeat(64)}` as const;

function clients({
  handle = BALANCE_HANDLE,
  walletChain = LEOPOLD_CHAIN_ID,
  publicChain = LEOPOLD_CHAIN_ID,
}: {
  handle?: `0x${string}`;
  walletChain?: number;
  publicChain?: number;
} = {}) {
  const readContract = vi.fn().mockResolvedValue(handle);
  const getChainId = vi.fn().mockResolvedValue(walletChain);
  const publicGetChainId = vi.fn().mockResolvedValue(publicChain);
  const request = vi.fn();
  return {
    clients: {
      publicClient: { readContract, getChainId: publicGetChainId },
      walletClient: { account: { address: ACCOUNT }, getChainId },
      ethereum: { request },
      account: ACCOUNT,
    } as unknown as PrivateBalanceClients,
    readContract,
    getChainId,
    publicGetChainId,
    request,
  };
}

describe("confidential private balance read", () => {
  beforeEach(() => {
    vi.mocked(decryptPrivateValue).mockReset();
  });

  it("reads the official current handle and decrypts it for the active financial wallet", async () => {
    vi.mocked(decryptPrivateValue).mockResolvedValue(1_000_000n);
    const probe = clients();
    const observedHandles: string[] = [];

    await expect(readPrivateBalance(probe.clients, TOKEN, (handle) => observedHandles.push(handle))).resolves.toEqual({
      handle: BALANCE_HANDLE,
      value: 1_000_000n,
    });

    expect(probe.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN,
        functionName: "confidentialBalanceOf",
        args: [ACCOUNT],
      }),
    );
    expect(observedHandles).toEqual([BALANCE_HANDLE]);
    expect(decryptPrivateValue).toHaveBeenCalledWith(probe.clients.ethereum, ACCOUNT, TOKEN, BALANCE_HANDLE);
    expect(probe.request).not.toHaveBeenCalled();
  });

  it("does not reuse a pre-wrap zero handle after a later fresh chain read", async () => {
    vi.mocked(decryptPrivateValue).mockResolvedValueOnce(0n).mockResolvedValueOnce(1_000_000n);
    const before = clients({ handle: ZERO_HANDLE });
    const after = clients({ handle: BALANCE_HANDLE });

    await expect(readPrivateBalance(before.clients, TOKEN)).resolves.toEqual({ handle: ZERO_HANDLE, value: 0n });
    await expect(readPrivateBalance(after.clients, TOKEN)).resolves.toEqual({
      handle: BALANCE_HANDLE,
      value: 1_000_000n,
    });
    expect(decryptPrivateValue).toHaveBeenNthCalledWith(2, after.clients.ethereum, ACCOUNT, TOKEN, BALANCE_HANDLE);
  });

  it("fails closed for a wrong token, wallet, or chain before decryption", async () => {
    const wrongToken = "0x1111111111111111111111111111111111111111" as const;
    const probe = clients();
    await expect(readPrivateBalance(probe.clients, wrongToken)).rejects.toThrow("PRIVATE_BALANCE:WRONG_TOKEN");

    const wrongAccount = { ...probe.clients, account: "0x1111111111111111111111111111111111111111" as const };
    await expect(readPrivateBalance(wrongAccount, TOKEN)).rejects.toThrow("PRIVATE_BALANCE:WRONG_ACCOUNT");

    const wrongChain = clients({ walletChain: 1 });
    await expect(readPrivateBalance(wrongChain.clients, TOKEN)).rejects.toThrow("PRIVATE_BALANCE:WRONG_NETWORK");
    expect(decryptPrivateValue).not.toHaveBeenCalled();
  });

  it("keeps decryption failures distinct and never turns them into zero", async () => {
    vi.mocked(decryptPrivateValue).mockRejectedValue(new Error("NOT_ENTITLED"));
    const probe = clients();

    await expect(readPrivateBalance(probe.clients, TOKEN)).rejects.toThrow("NOT_ENTITLED");
  });

  it("allows a legitimate decrypted zero without conflating it with an unresolved read", async () => {
    vi.mocked(decryptPrivateValue).mockResolvedValue(0n);
    const probe = clients({ handle: BALANCE_HANDLE });

    await expect(readPrivateBalance(probe.clients, TOKEN)).resolves.toEqual({ handle: BALANCE_HANDLE, value: 0n });
  });

  it("exposes only non-plaintext diagnostic context", () => {
    expect(
      privateBalanceDiagnostic({
        chainId: LEOPOLD_CHAIN_ID,
        account: ACCOUNT,
        token: leopoldConfig.lcUsdc.address,
        handle: BALANCE_HANDLE,
        stage: "DECRYPTED",
      }),
    ).toContain("PRIVATE_BALANCE:DECRYPTED:chain=11155111:wallet=0x82a9…3329");
  });
});
