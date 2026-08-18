"use client";

import type { Address, Hex, WalletClient } from "viem";

type BrowserEthereum = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

let activeIdentity = "";
let cachedSdk: import("@zama-fhe/sdk").ZamaSDK | null = null;
let cachedSigner: WalletClient | BrowserEthereum | null = null;

export async function getZamaSdk(ethereum: BrowserEthereum, account: Address, walletClient?: WalletClient) {
  const identity = account.toLowerCase();
  const signer = walletClient ?? ethereum;
  if (cachedSdk && activeIdentity === identity && cachedSigner === signer) return cachedSdk;
  const [{ ZamaSDK, createConfig, memoryStorage }, { sepolia }, { web }, { ViemProvider, ViemSigner }, viem, chains] =
    await Promise.all([
      import("@zama-fhe/sdk"),
      import("@zama-fhe/sdk/chains"),
      import("@zama-fhe/sdk/web"),
      import("@zama-fhe/sdk/viem"),
      import("viem"),
      import("viem/chains"),
    ]);
  const publicClient = viem.createPublicClient({ chain: chains.sepolia, transport: viem.http(sepolia.network) });
  const signerWalletClient =
    walletClient ??
    viem.createWalletClient({
      account,
      chain: chains.sepolia,
      transport: viem.custom(ethereum as never),
    });
  cachedSdk = new ZamaSDK(
    createConfig({
      chains: [sepolia],
      relayers: { [sepolia.id]: web({ timeout: 300_000 }) },
      provider: new ViemProvider({ publicClient }),
      signer: new ViemSigner({ walletClient: signerWalletClient, ethereum: ethereum as never }),
      storage: memoryStorage,
      permitStorage: memoryStorage,
      runtime: { singleThread: true, wasmAssetLoadMode: "embedded-base64" },
    }),
  );
  activeIdentity = identity;
  cachedSigner = signer;
  return cachedSdk;
}

export function clearPrivateSession(): void {
  cachedSdk = null;
  activeIdentity = "";
  cachedSigner = null;
}

export async function encryptPrivateAmount(
  ethereum: BrowserEthereum,
  account: Address,
  contractAddress: Address,
  amount: bigint,
  walletClient?: WalletClient,
): Promise<{ encryptedValue: Hex; inputProof: Hex }> {
  const sdk = await getZamaSdk(ethereum, account, walletClient);
  const encrypted = await sdk.encrypt({
    values: [{ value: amount, type: "euint64" }],
    contractAddress,
    userAddress: account,
  });
  const encryptedValue = encrypted.encryptedValues[0];
  if (typeof encryptedValue !== "string" || typeof encrypted.inputProof !== "string") {
    throw new Error("RELAYER_INVALID_ENCRYPTED_INPUT");
  }
  return { encryptedValue: encryptedValue as Hex, inputProof: encrypted.inputProof as Hex };
}

export async function decryptPrivateValue(
  ethereum: BrowserEthereum,
  account: Address,
  contractAddress: Address,
  handle: Hex,
  walletClient?: WalletClient,
): Promise<bigint> {
  let sdk: Awaited<ReturnType<typeof getZamaSdk>>;
  try {
    sdk = await getZamaSdk(ethereum, account, walletClient);
  } catch (error) {
    throw new Error("PRIVATE_BALANCE:SDK_NOT_READY", { cause: error });
  }
  const request = [{ encryptedValue: handle, contractAddress }];
  const values = await sdk.decryption.decryptValues(request);
  const clear = values[handle];
  if (typeof clear === "bigint") return clear;
  if (typeof clear === "string" && /^\d+$/u.test(clear)) return BigInt(clear);
  throw new Error("PRIVATE_BALANCE:RESULT_MISSING");
}

export async function decryptPublicValue(
  ethereum: BrowserEthereum,
  account: Address,
  handle: Hex,
  walletClient?: WalletClient,
): Promise<{ clear: bigint; abiEncodedClearValues: Hex; decryptionProof: Hex }> {
  const sdk = await getZamaSdk(ethereum, account, walletClient);
  const result = await sdk.decryption.decryptPublicValues([handle]);
  const clear = result.clearValues[handle];
  const clearValue =
    typeof clear === "bigint" ? clear : typeof clear === "string" && /^\d+$/u.test(clear) ? BigInt(clear) : null;
  if (
    clearValue === null ||
    typeof result.abiEncodedClearValues !== "string" ||
    typeof result.decryptionProof !== "string"
  ) {
    throw new Error("RELAYER_INVALID_PUBLIC_DECRYPTION_RESULT");
  }
  return {
    clear: clearValue,
    abiEncodedClearValues: result.abiEncodedClearValues as Hex,
    decryptionProof: result.decryptionProof as Hex,
  };
}
