import { normalizeWalletAddress, walletsMatch } from "./readiness";
import { withWalletSessionTimeout } from "./wallet-identity";
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
  reason: "VERIFIED_ACCOUNT" | "ACCOUNT_SELECTION_REQUIRED" | "PROVIDER_DISCONNECTED";
  synced: boolean;
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
  const readAccounts = () =>
    withWalletSessionTimeout(wallet.connector.getConnectedAccounts(), undefined, "PROVIDER_ACCOUNT_TIMEOUT");
  let [activeAccount] = await readAccounts();
  let activeAddress = normalizeWalletAddress(activeAccount ?? null);
  onProviderAccount(activeAddress);
  if (activeAddress && !walletsMatch(activeAddress, verifiedAddress)) {
    return { connected: false, activeAddress, reason: "ACCOUNT_SELECTION_REQUIRED", synced: false };
  }

  let synced = false;
  if (!activeAddress) {
    const connected = await withWalletSessionTimeout(wallet.isConnected(), undefined, "PROVIDER_CONNECTION_TIMEOUT");
    if (!connected) {
      await withWalletSessionTimeout(wallet.sync(), undefined, "PROVIDER_SYNC_TIMEOUT");
      synced = true;
    }
    [activeAccount] = await readAccounts();
    activeAddress = normalizeWalletAddress(activeAccount ?? null);
    onProviderAccount(activeAddress);
  }
  if (!activeAddress) {
    return { connected: false, activeAddress: null, reason: "PROVIDER_DISCONNECTED", synced };
  }
  if (!walletsMatch(activeAddress, verifiedAddress)) {
    return { connected: false, activeAddress, reason: "ACCOUNT_SELECTION_REQUIRED", synced };
  }

  if (!isPrimary) await withWalletSessionTimeout(switchWallet(), undefined, "DYNAMIC_PRIMARY_TIMEOUT");
  const [finalAccount] = await readAccounts();
  const finalAddress = normalizeWalletAddress(finalAccount ?? null);
  onProviderAccount(finalAddress);
  return {
    connected: walletsMatch(finalAddress, verifiedAddress),
    activeAddress: finalAddress,
    reason: walletsMatch(finalAddress, verifiedAddress) ? "VERIFIED_ACCOUNT" : "ACCOUNT_SELECTION_REQUIRED",
    synced,
  };
}
