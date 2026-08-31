import { beforeEach, describe, expect, it, vi } from "vitest";

const publicDecrypt = vi.fn();
const createInstance = vi.fn(async () => ({ publicDecrypt }));

vi.mock("@zama-fhe/relayer-sdk/node", () => ({
  createInstance,
  SepoliaConfig: { aclContractAddress: "0x0000000000000000000000000000000000000001" },
}));

describe("public proof provider", () => {
  beforeEach(() => {
    createInstance.mockClear();
    publicDecrypt.mockReset();
  });

  it("requests only the exact public handle and returns proof bytes", async () => {
    publicDecrypt.mockResolvedValue({ abiEncodedClearValues: "0x1234", decryptionProof: "0xabcd" });
    const { ZamaPublicProofProvider } = await import("../src/public-proof.js");
    const provider = new ZamaPublicProofProvider("https://example.invalid/rpc");
    await expect(provider.publicDecrypt(`0x${"11".repeat(32)}`)).resolves.toEqual({
      abiEncodedClearValues: "0x1234",
      decryptionProof: "0xabcd",
    });
    expect(createInstance).toHaveBeenCalledWith(expect.objectContaining({ network: "https://example.invalid/rpc" }));
    expect(publicDecrypt).toHaveBeenCalledWith([`0x${"11".repeat(32)}`]);
  });

  it("uses the next configured RPC only after proof retrieval fails", async () => {
    const firstDecrypt = vi.fn().mockRejectedValue(new Error("first RPC unavailable"));
    const secondDecrypt = vi.fn().mockResolvedValue({
      abiEncodedClearValues: "0x12",
      decryptionProof: "0x34",
    });
    createInstance
      .mockResolvedValueOnce({ publicDecrypt: firstDecrypt })
      .mockResolvedValueOnce({ publicDecrypt: secondDecrypt });
    const { ZamaPublicProofProvider } = await import("../src/public-proof.js");
    const provider = new ZamaPublicProofProvider(["https://first.invalid", "https://second.invalid"]);
    await expect(provider.publicDecrypt(`0x${"22".repeat(32)}`)).resolves.toEqual({
      abiEncodedClearValues: "0x12",
      decryptionProof: "0x34",
    });
    expect(firstDecrypt).toHaveBeenCalledTimes(1);
    expect(secondDecrypt).toHaveBeenCalledTimes(1);
  });
});
