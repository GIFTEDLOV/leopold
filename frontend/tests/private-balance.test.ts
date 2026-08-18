import { beforeEach, describe, expect, it, vi } from "vitest";

import { LEOPOLD_CHAIN_ID, leopoldConfig } from "../lib/leopold/config";
import { decryptPrivateValue } from "../lib/leopold/zama";
import {
  privateBalanceDiagnostic,
  privateBalanceLabel,
  isZeroBalanceHandle,
  readCurrentPrivateBalanceHandle,
  revealPrivateBalanceFromCurrentHandle,
  samePrivateBalanceIdentity,
  type PrivateBalanceClients,
} from "../lib/leopold/private-balance";

vi.mock("../lib/leopold/zama", () => ({
  decryptPrivateValue: vi.fn(),
}));

const ACCOUNT = "0x82a983325de92aede126c18e9fe3b53da1ab3329" as const;
const OTHER_ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8" as const;
const ZERO_HANDLE = `0x${"0".repeat(64)}` as const;
const H1 = `0x${"1".repeat(64)}` as const;
const H2 = `0x${"2".repeat(64)}` as const;
const LIVE_HANDLE = "0x3154516a75e67a34d8e59191127f416a85839a0a5dff0000000000aa36a70500" as const;

function clients({
  account = ACCOUNT,
  handle = H1,
  walletChain = LEOPOLD_CHAIN_ID,
  publicChain = LEOPOLD_CHAIN_ID,
}: {
  account?: `0x${string}`;
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
      walletClient: { account: { address: account }, getChainId },
      ethereum: { request },
      account,
    } as unknown as PrivateBalanceClients,
    readContract,
    getChainId,
    request,
  };
}

describe("Zama-reference confidential private balance flow", () => {
  beforeEach(() => {
    vi.mocked(decryptPrivateValue).mockReset();
  });

  it("reads H1 from lcUSDC, decrypts H1, and accepts only the current H1 result", async () => {
    vi.mocked(decryptPrivateValue).mockResolvedValue(1_000_000n);
    const initial = clients({ handle: H1 });
    const current = clients({ handle: H1 });
    const stages: string[] = [];

    await expect(
      revealPrivateBalanceFromCurrentHandle({
        clients: initial.clients,
        getCurrentClients: () => current.clients,
        token: TOKEN,
        onStage: (stage) => stages.push(stage),
      }),
    ).resolves.toMatchObject({ identity: { handle: H1, account: ACCOUNT, token: TOKEN }, value: 1_000_000n });

    expect(initial.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN,
        functionName: "confidentialBalanceOf",
        args: [ACCOUNT],
      }),
    );
    expect(decryptPrivateValue).toHaveBeenCalledWith(
      initial.clients.ethereum,
      ACCOUNT,
      TOKEN,
      H1,
      initial.clients.walletClient,
    );
    expect(stages).toEqual([
      "READING_HANDLE",
      "AWAITING_DECRYPT_AUTHORIZATION",
      "DECRYPTING",
      "REVALIDATING_HANDLE",
      "REVEALED",
    ]);
    expect(initial.request).not.toHaveBeenCalled();
  });

  it("enters the decrypt path for the exact live-style nonzero handle", async () => {
    vi.mocked(decryptPrivateValue).mockResolvedValue(1_000_000n);
    const initial = clients({ handle: LIVE_HANDLE });
    const current = clients({ handle: LIVE_HANDLE });

    await expect(
      revealPrivateBalanceFromCurrentHandle({
        clients: initial.clients,
        getCurrentClients: () => current.clients,
        token: TOKEN,
      }),
    ).resolves.toMatchObject({ identity: { handle: LIVE_HANDLE }, value: 1_000_000n });

    expect(isZeroBalanceHandle(LIVE_HANDLE)).toBe(false);
    expect(decryptPrivateValue).toHaveBeenCalledWith(
      initial.clients.ethereum,
      ACCOUNT,
      TOKEN,
      LIVE_HANDLE,
      initial.clients.walletClient,
    );
  });

  it("models a successful wrap as H0 to H1 and discovers H1 from a fresh chain read", async () => {
    const before = clients({ handle: ZERO_HANDLE });
    const after = clients({ handle: H1 });

    await expect(readCurrentPrivateBalanceHandle(before.clients, TOKEN)).resolves.toMatchObject({
      handle: ZERO_HANDLE,
    });
    await expect(readCurrentPrivateBalanceHandle(after.clients, TOKEN)).resolves.toMatchObject({ handle: H1 });
    expect(after.readContract).toHaveBeenCalledTimes(1);
  });

  it("discards an H1 result when the current chain handle becomes H2 during decryption", async () => {
    let resolveDecrypt!: (value: bigint) => void;
    vi.mocked(decryptPrivateValue).mockImplementation(
      () =>
        new Promise<bigint>((resolve) => {
          resolveDecrypt = resolve;
        }),
    );
    const initial = clients({ handle: H1 });
    const current = clients({ handle: H2 });
    const pending = revealPrivateBalanceFromCurrentHandle({
      clients: initial.clients,
      getCurrentClients: () => current.clients,
      token: TOKEN,
    });

    await vi.waitFor(() =>
      expect(decryptPrivateValue).toHaveBeenCalledWith(
        initial.clients.ethereum,
        ACCOUNT,
        TOKEN,
        H1,
        initial.clients.walletClient,
      ),
    );
    resolveDecrypt(1_000_000n);
    await expect(pending).rejects.toThrow("PRIVATE_BALANCE:STALE_HANDLE");
  });

  it("rejects a wallet switch and never accepts the old wallet's plaintext", async () => {
    vi.mocked(decryptPrivateValue).mockResolvedValue(1_000_000n);
    const initial = clients({ handle: H1 });
    const current = clients({ account: OTHER_ACCOUNT, handle: H1 });

    await expect(
      revealPrivateBalanceFromCurrentHandle({
        clients: initial.clients,
        getCurrentClients: () => current.clients,
        token: TOKEN,
      }),
    ).rejects.toThrow("PRIVATE_BALANCE:STALE_HANDLE");
  });

  it("rejects a chain switch during current-handle revalidation", async () => {
    vi.mocked(decryptPrivateValue).mockResolvedValue(1_000_000n);
    const initial = clients({ handle: H1 });
    const current = clients({ handle: H1, walletChain: 1 });

    await expect(
      revealPrivateBalanceFromCurrentHandle({
        clients: initial.clients,
        getCurrentClients: () => current.clients,
        token: TOKEN,
      }),
    ).rejects.toThrow("PRIVATE_BALANCE:WRONG_NETWORK");
  });

  it("treats the canonical zero handle as a legitimate zero without a signature", async () => {
    const initial = clients({ handle: ZERO_HANDLE });
    const current = clients({ handle: ZERO_HANDLE });

    await expect(
      revealPrivateBalanceFromCurrentHandle({
        clients: initial.clients,
        getCurrentClients: () => current.clients,
        token: TOKEN,
      }),
    ).resolves.toMatchObject({ identity: { handle: ZERO_HANDLE }, value: 0n });
    expect(decryptPrivateValue).not.toHaveBeenCalled();
    expect(initial.request).not.toHaveBeenCalled();
  });

  it("keeps a nonzero unresolved or failed result hidden and displays a real zero only when revealed", () => {
    expect(privateBalanceLabel("NOT_REVEALED", 0n)).toBe("•••••• USDC");
    expect(privateBalanceLabel("DECRYPTING", null)).toBe("Revealing…");
    expect(privateBalanceLabel("REVEAL_FAILED", 0n)).toBe("•••••• USDC");
    expect(privateBalanceLabel("REVEALED", 0n)).toBe("0 USDC");
    expect(privateBalanceLabel("REVEALED", 1_000_000n)).toBe("1 USDC");
  });

  it("keeps authorization and relayer failures as failures rather than zero", async () => {
    const initial = clients({ handle: H1 });
    const current = clients({ handle: H1 });
    vi.mocked(decryptPrivateValue).mockRejectedValueOnce(new Error("NOT_ENTITLED"));
    await expect(
      revealPrivateBalanceFromCurrentHandle({
        clients: initial.clients,
        getCurrentClients: () => current.clients,
        token: TOKEN,
      }),
    ).rejects.toThrow("NOT_ENTITLED");
    expect(privateBalanceLabel("REVEAL_FAILED", null)).toBe("•••••• USDC");

    vi.mocked(decryptPrivateValue).mockRejectedValueOnce(new Error("RELAYER_REQUEST_FAILED"));
    await expect(
      revealPrivateBalanceFromCurrentHandle({
        clients: initial.clients,
        getCurrentClients: () => current.clients,
        token: TOKEN,
      }),
    ).rejects.toThrow("RELAYER_REQUEST_FAILED");
  });

  it("treats a missing decrypt result as failure rather than zero", async () => {
    const initial = clients({ handle: H1 });
    const current = clients({ handle: H1 });
    vi.mocked(decryptPrivateValue).mockRejectedValueOnce(new Error("PRIVATE_BALANCE:RESULT_MISSING"));

    await expect(
      revealPrivateBalanceFromCurrentHandle({
        clients: initial.clients,
        getCurrentClients: () => current.clients,
        token: TOKEN,
      }),
    ).rejects.toThrow("PRIVATE_BALANCE:RESULT_MISSING");
    expect(privateBalanceLabel("REVEAL_FAILED", null)).toBe("•••••• USDC");
  });

  it("compares the full identity tuple and exposes no secret material in diagnostics", () => {
    const left = { chainId: LEOPOLD_CHAIN_ID, account: ACCOUNT, token: TOKEN, handle: H1 } as const;
    const right = { ...left };
    expect(samePrivateBalanceIdentity(left, right)).toBe(true);
    expect(samePrivateBalanceIdentity(left, { ...right, handle: H2 })).toBe(false);
    expect(
      privateBalanceDiagnostic({
        chainId: LEOPOLD_CHAIN_ID,
        account: ACCOUNT,
        token: leopoldConfig.lcUsdc.address,
        handle: H1,
        stage: "DECRYPTING",
        error: "RELAYER_REQUEST_FAILED",
      }),
    ).not.toMatch(/privateKey|signature|plaintext|jwt|secret/iu);
  });
});
