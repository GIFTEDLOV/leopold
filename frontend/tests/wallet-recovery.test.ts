import { describe, expect, it, vi } from "vitest";
import { reconnectExistingWallet, type ExistingWalletConnection } from "../lib/auth/wallet-recovery";

const VERIFIED = "0x1111111111111111111111111111111111111111" as const;
const WRONG = "0x2222222222222222222222222222222222222222" as const;

function wallet(overrides: Partial<ExistingWalletConnection> = {}): ExistingWalletConnection {
  return {
    id: "verified-wallet",
    address: VERIFIED,
    isConnected: vi.fn().mockResolvedValue(true),
    sync: vi.fn().mockResolvedValue(undefined),
    connector: { getConnectedAccounts: vi.fn().mockResolvedValue([VERIFIED]) },
    ...overrides,
  };
}

describe("existing financial wallet recovery", () => {
  it("syncs a disconnected wallet before switching primary state", async () => {
    const target = wallet({
      isConnected: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    });
    const switchWallet = vi.fn().mockResolvedValue(undefined);
    const onProviderAccount = vi.fn();

    const result = await reconnectExistingWallet({
      wallet: target,
      verifiedAddress: VERIFIED,
      isPrimary: false,
      switchWallet,
      onProviderAccount,
    });

    expect(target.sync).toHaveBeenCalledOnce();
    expect(switchWallet).toHaveBeenCalledOnce();
    expect(onProviderAccount).toHaveBeenCalledWith(VERIFIED);
    expect(result).toEqual({ connected: true, activeAddress: VERIFIED });
  });

  it("does not consider primary-wallet selection enough without provider connection", async () => {
    const target = wallet({
      isConnected: vi.fn().mockResolvedValue(false),
      sync: vi.fn().mockResolvedValue(undefined),
      connector: { getConnectedAccounts: vi.fn().mockResolvedValue([WRONG]) },
    });
    const switchWallet = vi.fn().mockResolvedValue(undefined);

    const result = await reconnectExistingWallet({
      wallet: target,
      verifiedAddress: VERIFIED,
      isPrimary: true,
      switchWallet,
      onProviderAccount: vi.fn(),
    });

    expect(target.sync).toHaveBeenCalledOnce();
    expect(switchWallet).not.toHaveBeenCalled();
    expect(result).toEqual({ connected: false, activeAddress: WRONG });
  });

  it("does not sync a connected wallet whose provider account is wrong", async () => {
    const target = wallet({
      isConnected: vi.fn().mockResolvedValue(true),
      sync: vi.fn().mockResolvedValue(undefined),
      connector: { getConnectedAccounts: vi.fn().mockResolvedValue([WRONG]) },
    });

    const result = await reconnectExistingWallet({
      wallet: target,
      verifiedAddress: VERIFIED,
      isPrimary: true,
      switchWallet: vi.fn(),
      onProviderAccount: vi.fn(),
    });

    expect(target.sync).not.toHaveBeenCalled();
    expect(result).toEqual({ connected: false, activeAddress: WRONG });
  });

  it("rechecks the provider account after switching Dynamic primary state", async () => {
    const target = wallet({
      connector: { getConnectedAccounts: vi.fn().mockResolvedValueOnce([VERIFIED]).mockResolvedValueOnce([WRONG]) },
    });

    const result = await reconnectExistingWallet({
      wallet: target,
      verifiedAddress: VERIFIED,
      isPrimary: false,
      switchWallet: vi.fn().mockResolvedValue(undefined),
      onProviderAccount: vi.fn(),
    });

    expect(result).toEqual({ connected: false, activeAddress: WRONG });
  });

  it("propagates sync cancellation and performs no automatic retry", async () => {
    const target = wallet({
      isConnected: vi.fn().mockResolvedValue(false),
      sync: vi.fn().mockRejectedValue(new Error("cancelled")),
    });

    await expect(
      reconnectExistingWallet({
        wallet: target,
        verifiedAddress: VERIFIED,
        isPrimary: false,
        switchWallet: vi.fn(),
        onProviderAccount: vi.fn(),
      }),
    ).rejects.toThrow("cancelled");
    expect(target.sync).toHaveBeenCalledOnce();
  });
});
