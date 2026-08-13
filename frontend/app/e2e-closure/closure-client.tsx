"use client";

import { useEffect } from "react";

import { getZamaSdk } from "@/lib/leopold/zama";

type ClosureProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

type ClosureApi = {
  encrypt(
    account: `0x${string}`,
    contractAddress: `0x${string}`,
    amount: string,
  ): Promise<{
    encryptedValue: `0x${string}`;
    inputProof: `0x${string}`;
  }>;
  publicDecrypt(handle: `0x${string}`): Promise<{
    clear: string | boolean;
    abiEncodedClearValues: `0x${string}`;
    decryptionProof: `0x${string}`;
  }>;
  decrypt(account: `0x${string}`, contractAddress: `0x${string}`, handle: `0x${string}`): Promise<{ clear: string }>;
};

declare global {
  interface Window {
    __leopoldClosureProviders?: Record<string, ClosureProvider>;
    __leopoldClosureApi?: ClosureApi;
    __leopoldClosureReady?: boolean;
  }
}

function providerFor(account: `0x${string}`): ClosureProvider {
  const provider = window.__leopoldClosureProviders?.[account.toLowerCase()];
  if (!provider) throw new Error("CLOSURE_PROVIDER_MISSING");
  return provider;
}

export default function LeopoldClosureClient() {
  useEffect(() => {
    const api: ClosureApi = {
      async encrypt(account, contractAddress, amount) {
        const sdk = await getZamaSdk(providerFor(account), account);
        const encrypted = await sdk.encrypt({
          values: [{ value: BigInt(amount), type: "euint64" }],
          contractAddress,
          userAddress: account,
        });
        return {
          encryptedValue: encrypted.encryptedValues[0] as `0x${string}`,
          inputProof: encrypted.inputProof as `0x${string}`,
        };
      },
      async publicDecrypt(handle) {
        const accounts = Object.keys(window.__leopoldClosureProviders ?? {});
        const account = accounts[0] as `0x${string}` | undefined;
        if (!account) throw new Error("CLOSURE_PUBLIC_PROVIDER_MISSING");
        const sdk = await getZamaSdk(providerFor(account), account);
        const decrypted = await sdk.decryption.decryptPublicValues([handle]);
        const clear = decrypted.clearValues[handle];
        return {
          clear: typeof clear === "boolean" ? clear : String(clear),
          abiEncodedClearValues: decrypted.abiEncodedClearValues,
          decryptionProof: decrypted.decryptionProof,
        };
      },
      async decrypt(account, contractAddress, handle) {
        const sdk = await getZamaSdk(providerFor(account), account);
        const decrypted = await sdk.decryption.decryptValues([{ encryptedValue: handle, contractAddress }]);
        return { clear: String(decrypted[handle]) };
      },
    };
    window.__leopoldClosureApi = api;
    window.__leopoldClosureReady = true;
  }, []);

  return <main data-testid="leopold-closure-route">Leopold disposable E2E FHE route</main>;
}
