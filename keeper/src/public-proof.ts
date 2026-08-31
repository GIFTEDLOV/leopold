import { createInstance, SepoliaConfig, type FhevmInstance } from "@zama-fhe/relayer-sdk/node";

import type { PublicProof, PublicProofProvider } from "./lifecycle.js";

/** Read-only proof client. It has no Ethereum signer, user permit, or user-decrypt method. */
export class ZamaPublicProofProvider implements PublicProofProvider {
  readonly #rpcUrls: readonly string[];
  readonly #instances: Array<Promise<FhevmInstance> | undefined>;

  constructor(rpcUrls: string | readonly string[]) {
    const urls = typeof rpcUrls === "string" ? [rpcUrls] : rpcUrls;
    if (urls.length === 0) throw new Error("Public proof provider requires at least one RPC URL");
    this.#rpcUrls = [...urls];
    this.#instances = Array.from({ length: urls.length });
  }

  async publicDecrypt(handle: string): Promise<PublicProof> {
    const errors: unknown[] = [];
    for (const [index, rpcUrl] of this.#rpcUrls.entries()) {
      try {
        const instance = (this.#instances[index] ??= createInstance({ ...SepoliaConfig, network: rpcUrl }));
        const result = await (await instance).publicDecrypt([handle]);
        return {
          abiEncodedClearValues: result.abiEncodedClearValues,
          decryptionProof: result.decryptionProof,
        };
      } catch (error) {
        this.#instances[index] = undefined;
        errors.push(error);
      }
    }
    throw new AggregateError(errors, "Public proof retrieval failed across all configured RPC providers");
  }
}
