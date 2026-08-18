import { beforeEach, describe, expect, it, vi } from "vitest";

import { CANONICAL_USDC, leopoldConfig, requireConfiguredAddress } from "../lib/leopold/config";
import { classifyLeopoldError } from "../lib/leopold/errors";
import { savePrivately, type ActionClients } from "../lib/leopold/actions";
import { encryptPrivateAmount } from "../lib/leopold/zama";

vi.mock("../lib/leopold/zama", () => ({
  decryptPublicValue: vi.fn(),
  encryptPrivateAmount: vi.fn(),
}));

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const OTHER_ACCOUNT = "0x2222222222222222222222222222222222222222" as const;
const HASH = `0x${"a".repeat(64)}` as `0x${string}`;
const ENCRYPTED_VALUE = `0x${"1".repeat(64)}` as `0x${string}`;
const INPUT_PROOF = "0x1234" as `0x${string}`;

const LC_USDC = requireConfiguredAddress(leopoldConfig.lcUsdc, "Private USDC");
const DAILY_VAULT = requireConfiguredAddress(leopoldConfig.vaults[0].vault, "Daily vault");

function makeClients({
  simulateContract = vi.fn(async () => ({ request: { gas: 200_000n } })),
  waitForTransactionReceipt = vi.fn(async () => ({ status: "success" as const })),
  getChainId = vi.fn(async () => 11_155_111),
  walletAccount = ACCOUNT,
}: {
  simulateContract?: ReturnType<typeof vi.fn>;
  waitForTransactionReceipt?: ReturnType<typeof vi.fn>;
  getChainId?: ReturnType<typeof vi.fn>;
  walletAccount?: typeof ACCOUNT | typeof OTHER_ACCOUNT;
} = {}) {
  const writeContract = vi.fn(async () => HASH);
  const clients = {
    publicClient: { simulateContract, waitForTransactionReceipt },
    walletClient: { account: { address: walletAccount }, getChainId, writeContract },
    ethereum: { request: vi.fn() },
    account: ACCOUNT,
  } as unknown as ActionClients;
  return { clients, simulateContract, waitForTransactionReceipt, getChainId, writeContract };
}

describe("confidential vault save action", () => {
  beforeEach(() => {
    vi.mocked(encryptPrivateAmount).mockReset();
    vi.mocked(encryptPrivateAmount).mockResolvedValue({
      encryptedValue: ENCRYPTED_VALUE,
      inputProof: INPUT_PROOF,
    });
  });

  it("encrypts for lcUSDC and simulates the official vault callback before signing", async () => {
    const probe = makeClients();
    const stages: string[] = [];

    await expect(
      savePrivately(probe.clients, LC_USDC, DAILY_VAULT, 1_000_000n, (stage) => stages.push(stage)),
    ).resolves.toBe(HASH);

    expect(encryptPrivateAmount).toHaveBeenCalledWith(
      probe.clients.ethereum,
      ACCOUNT,
      LC_USDC,
      1_000_000n,
      probe.clients.walletClient,
    );
    expect(probe.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: LC_USDC,
        functionName: "confidentialTransferAndCall",
        args: [DAILY_VAULT, ENCRYPTED_VALUE, INPUT_PROOF, "0x"],
      }),
    );
    expect(probe.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: LC_USDC,
        functionName: "confidentialTransferAndCall",
        args: [DAILY_VAULT, ENCRYPTED_VALUE, INPUT_PROOF, "0x"],
        gas: 200_000n,
      }),
    );
    expect(stages).toEqual([
      "save-encrypting",
      "save-simulating",
      "save-signature",
      "save-submitted",
      "save-confirming",
      "save-receipt",
    ]);
  });

  it("rejects a non-official token or vault before encryption and signing", async () => {
    const probe = makeClients();
    await expect(savePrivately(probe.clients, CANONICAL_USDC, DAILY_VAULT, 1_000_000n)).rejects.toThrow(
      "CONFIGURATION_MISSING:private token target",
    );
    await expect(savePrivately(probe.clients, LC_USDC, OTHER_ACCOUNT, 1_000_000n)).rejects.toThrow(
      "CONFIGURATION_MISSING:official vault target",
    );
    expect(encryptPrivateAmount).not.toHaveBeenCalled();
    expect(probe.writeContract).not.toHaveBeenCalled();
  });

  it("preserves input-encryption and simulation failures without requesting a signature", async () => {
    const encryptionError = new Error("input proof unavailable");
    vi.mocked(encryptPrivateAmount).mockRejectedValueOnce(encryptionError);
    const encryptionProbe = makeClients();
    await expect(savePrivately(encryptionProbe.clients, LC_USDC, DAILY_VAULT, 1_000_000n)).rejects.toThrow(
      "SAVE:ENCRYPT_INPUT: input proof unavailable",
    );
    expect(encryptionProbe.writeContract).not.toHaveBeenCalled();

    const simulationError = new Error("RoundNotOpen()");
    const simulationProbe = makeClients({ simulateContract: vi.fn().mockRejectedValue(simulationError) });
    await expect(savePrivately(simulationProbe.clients, LC_USDC, DAILY_VAULT, 1_000_000n)).rejects.toThrow(
      "SAVE:SIMULATION: RoundNotOpen()",
    );
    expect(simulationProbe.writeContract).not.toHaveBeenCalled();
    expect(classifyLeopoldError(new Error("SAVE:SIMULATION: RoundNotOpen()")).code).toBe("ROUND_CLOSED");
  });

  it("does not sign if the wallet account or chain changes after encryption", async () => {
    let currentAccount: typeof ACCOUNT | typeof OTHER_ACCOUNT = ACCOUNT;
    const accountProbe = makeClients();
    Object.defineProperty(accountProbe.clients.walletClient, "account", {
      get: () => {
        const result = { address: currentAccount };
        currentAccount = OTHER_ACCOUNT;
        return result;
      },
    });
    await expect(savePrivately(accountProbe.clients, LC_USDC, DAILY_VAULT, 1_000_000n)).rejects.toThrow(
      "WALLET_SIGNER_MISMATCH:save-confidential-transfer",
    );
    expect(accountProbe.writeContract).not.toHaveBeenCalled();

    const chainProbe = makeClients({ getChainId: vi.fn().mockResolvedValueOnce(11_155_111).mockResolvedValueOnce(1) });
    await expect(savePrivately(chainProbe.clients, LC_USDC, DAILY_VAULT, 1_000_000n)).rejects.toThrow(
      "WRONG_NETWORK:save-confidential-transfer:wallet-client-1",
    );
    expect(chainProbe.writeContract).not.toHaveBeenCalled();
  });

  it("keeps a reverted receipt in the save-specific stage", async () => {
    const probe = makeClients({ waitForTransactionReceipt: vi.fn(async () => ({ status: "reverted" as const })) });
    await expect(savePrivately(probe.clients, LC_USDC, DAILY_VAULT, 1_000_000n)).rejects.toThrow(
      "SAVE:RECEIPT:status=reverted",
    );
    expect(classifyLeopoldError(new Error("SAVE:RECEIPT:status=reverted")).code).toBe("TRANSACTION_REVERTED");
  });
});
