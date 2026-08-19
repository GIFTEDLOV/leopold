import { normalizeWalletAddress, walletsMatch } from "./readiness";
import type { Address } from "viem";

export type ExistingWalletConnection = {
  id: string;
  address: string;
  isConnected(): Promise<boolean>;
  sync(): Promise<void>;
  connector: {
    getConnectedAccounts(): Promise<string[]>;
  };
};

export type ExistingWalletRecoveryResult = {
  connected: boolean;
  activeAddress: Address | null;
};

export async function reconnectExistingWallet({
  wallet,
  verifiedAddress,
  isPrimary,
  switchWallet,
  onProviderAccount,
}: {
  wallet: ExistingWalletConnection;
  verifiedAddress: Address;
  isPrimary: boolean;
  switchWallet(): Promise<void>;
  onProviderAccount(address: Address | null): void;
}): Promise<ExistingWalletRecoveryResult> {
  if (!(await wallet.isConnected())) await wallet.sync();
  const [activeAccount] = await wallet.connector.getConnectedAccounts();
  const activeAddress = normalizeWalletAddress(activeAccount ?? null);
  onProviderAccount(activeAddress);
  if (!walletsMatch(activeAddress, verifiedAddress)) return { connected: false, activeAddress };
  if (!isPrimary) await switchWallet();
  if (!(await wallet.isConnected())) return { connected: false, activeAddress };
  const [finalAccount] = await wallet.connector.getConnectedAccounts();
  const finalAddress = normalizeWalletAddress(finalAccount ?? null);
  onProviderAccount(finalAddress);
  return {
    connected: walletsMatch(finalAddress, verifiedAddress),
    activeAddress: finalAddress,
  };
}
