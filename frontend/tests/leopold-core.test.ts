import { describe, expect, it } from "vitest";

import { formatUsdcAmount, parseUsdcAmount, parseUsdcAmountWithinBalance } from "../lib/leopold/amounts";
import rawManifest from "../../config/leopold-frontend-contracts.json";
import {
  CANONICAL_USDC,
  LEOPOLD_CHAIN_ID,
  leopoldConfig,
  loadLeopoldConfig,
  type RawLeopoldManifest,
} from "../lib/leopold/config";
import { classifyLeopoldError } from "../lib/leopold/errors";
import { isVaultRoundOpen, ROUND_STATE_LABELS } from "../lib/leopold/reads";
import { transactionStageLabel } from "../lib/leopold/transactions";
import { privateBalanceLabel } from "../lib/leopold/private-balance";

describe("Leopold frontend core", () => {
  it("loads the official Sepolia manifest", () => {
    expect(leopoldConfig.chainId).toBe(LEOPOLD_CHAIN_ID);
    expect(leopoldConfig.canonicalUsdc.address).toBe(CANONICAL_USDC);
    expect(leopoldConfig.lcUsdc.status).toBe("configured");
    expect(leopoldConfig.registry.status).toBe("configured");
    expect(leopoldConfig.ready).toBe(true);
    expect(leopoldConfig.vaults).toHaveLength(4);
    expect(leopoldConfig.vaults.map((vault) => vault.roundDurationSeconds)).toEqual([
      86_400, 604_800, 2_592_000, 604_800,
    ]);
  });

  it("fails closed on a manifest with missing official addresses", () => {
    const missing = structuredClone(rawManifest) as RawLeopoldManifest;
    missing.contracts.lcUsdc = null;
    missing.contracts.registry = null;
    missing.contracts.compoundComet = null;
    missing.officialVaults = missing.officialVaults.map((vault) => ({
      ...vault,
      vault: null,
      adapter: null,
      bondEscrow: null,
    }));
    const config = loadLeopoldConfig(missing);
    expect(config.lcUsdc.status).toBe("missing");
    expect(config.registry.status).toBe("missing");
    expect(config.ready).toBe(false);
  });

  it("classifies an invalid and wrong-chain manifest without accepting addresses", () => {
    const invalid = structuredClone(rawManifest) as RawLeopoldManifest;
    invalid.contracts.lcUsdc = "not-an-address";
    expect(loadLeopoldConfig(invalid).lcUsdc.status).toBe("invalid");
    invalid.network.chainId = 1;
    expect(loadLeopoldConfig(invalid).canonicalUsdc.status).toBe("wrong-chain");
  });

  it.each([
    ["0.000001", 1n],
    ["1", 1_000_000n],
    ["1234567.123456", 1_234_567_123_456n],
  ])("parses %s using exact six-decimal bigint arithmetic", (input, expected) => {
    expect(parseUsdcAmount(input)).toBe(expected);
    expect(formatUsdcAmount(expected)).toBe(input);
  });

  it.each(["0", "0.000000", "-1", "1.0000001", "1e2", "NaN"])("rejects unsafe amount %s", (input) => {
    expect(() => parseUsdcAmount(input)).toThrow();
  });

  it("enforces the available balance", () => {
    expect(parseUsdcAmountWithinBalance("1", 1_000_000n)).toBe(1_000_000n);
    expect(() => parseUsdcAmountWithinBalance("1.000001", 1_000_000n)).toThrow("INSUFFICIENT_USDC");
  });

  it("accepts the exact private uint64 limit and rejects overflow", () => {
    expect(parseUsdcAmount("18446744073709.551615")).toBe(0xffff_ffff_ffff_ffffn);
    expect(() => parseUsdcAmount("18446744073709.551616")).toThrow("AMOUNT_EXCEEDS_PRIVATE_USDC_LIMIT");
  });

  it("maps wallet, network, round, relayer, and liquidity failures to product language", () => {
    expect(classifyLeopoldError(new Error("User rejected request")).code).toBe("USER_REJECTED");
    expect(classifyLeopoldError(new Error("wrong chain")).code).toBe("WRONG_NETWORK");
    expect(classifyLeopoldError(new Error("WRONG_NETWORK:wallet-client-1")).code).toBe("WRONG_NETWORK");
    expect(classifyLeopoldError(new Error("WALLET_MISMATCH: RPC Request failed")).code).toBe("WALLET_MISMATCH");
    expect(classifyLeopoldError(new Error("WALLET_MISMATCH: RPC Request failed")).message).toBe(
      "Switch back to your verified financial wallet to continue.",
    );
    expect(classifyLeopoldError(new Error("WALLET_DISCONNECTED: RPC Request failed")).code).toBe("WALLET_DISCONNECTED");
    expect(classifyLeopoldError(new Error("WALLET_DISCONNECTED: RPC Request failed")).message).toBe(
      "Connect your verified financial wallet to continue.",
    );
    expect(classifyLeopoldError(new Error("WALLET_SESSION:USER_DISCONNECTED")).code).toBe("WALLET_DISCONNECTED");
    expect(classifyLeopoldError(new Error("WALLET_SESSION:ACCOUNT_CHANGED")).code).toBe("WALLET_DISCONNECTED");
    expect(classifyLeopoldError(new Error("WALLET_SESSION:WRONG_NETWORK")).code).toBe("WRONG_NETWORK");
    expect(classifyLeopoldError(new Error("WALLET_SESSION:WALLETCLIENT_ACCOUNT_MISMATCH")).code).toBe(
      "WALLET_SIGNER_MISMATCH",
    );
    expect(
      classifyLeopoldError(
        new Error(
          "RPC Request failed. URL: https://sepolia.drpc.org Method: eth_getTransactionCount Details: chain is not available on free plan",
        ),
      ).code,
    ).toBe("WALLET_RPC_UNAVAILABLE");
    expect(classifyLeopoldError(new Error("fetch failed")).code).toBe("RPC_FAILURE");
    expect(
      classifyLeopoldError({ code: 4001, message: "Request failed", cause: { message: "User rejected request" } }).code,
    ).toBe("USER_REJECTED");
    expect(
      classifyLeopoldError({ code: -32603, message: "RPC failed", cause: { message: "apiKey=secret" } })
        .technicalDetail,
    ).not.toContain("secret");
    expect(classifyLeopoldError(new Error("RoundNotOpen")).code).toBe("ROUND_CLOSED");
    expect(classifyLeopoldError(new Error("ROUND_CLOSED:Daily:1")).code).toBe("ROUND_CLOSED");
    expect(classifyLeopoldError(new Error("SAVE:SIMULATION: execution reverted")).code).toBe(
      "TRANSACTION_SIMULATION_FAILED",
    );
    expect(classifyLeopoldError(new Error("SAVE:WALLET_SIGNATURE: User rejected request")).code).toBe("USER_REJECTED");
    expect(classifyLeopoldError(new Error("SAVE:RECEIPT:status=reverted")).code).toBe("TRANSACTION_REVERTED");
    expect(classifyLeopoldError(new Error("WITHDRAW:ROUND_ADVANCE_SIMULATION: execution reverted")).code).toBe(
      "TRANSACTION_SIMULATION_FAILED",
    );
    expect(classifyLeopoldError(new Error("WITHDRAW:ROUND_ADVANCE_WALLET_SIGNATURE: User rejected request")).code).toBe(
      "USER_REJECTED",
    );
    expect(classifyLeopoldError(new Error("WITHDRAW:ROUND_ADVANCE_RECEIPT:status=reverted")).code).toBe(
      "TRANSACTION_REVERTED",
    );
    expect(classifyLeopoldError(new Error("relayer timeout")).code).toBe("RELAYER_UNAVAILABLE");
    expect(classifyLeopoldError(new Error("NOT_ENTITLED: balance handle is not authorized")).code).toBe(
      "UNAUTHORIZED_CIPHERTEXT",
    );
    expect(classifyLeopoldError(new Error("DECRYPTION_FAILED: KMS response invalid")).code).toBe("DECRYPTION_FAILED");
    expect(classifyLeopoldError(new Error("NO_CIPHERTEXT")).code).toBe("WRONG_HANDLE");
    expect(classifyLeopoldError(new Error("InsufficientManagedAssets")).code).toBe("PRIVATE_LIQUIDITY_UNAVAILABLE");
  });

  it("recognizes the exact open interval for vault deposits", () => {
    const round = { state: 1, opensAt: 100n, closesAt: 200n };
    expect(isVaultRoundOpen(round, 99n)).toBe(false);
    expect(isVaultRoundOpen(round, 100n)).toBe(true);
    expect(isVaultRoundOpen(round, 199n)).toBe(true);
    expect(isVaultRoundOpen(round, 200n)).toBe(false);
    expect(isVaultRoundOpen({ ...round, state: 2 }, 150n)).toBe(false);
  });

  it("uses one consistent transaction and settlement vocabulary", () => {
    expect(Object.values(transactionStageLabel)).toEqual([
      "Ready",
      "Waiting for wallet",
      "Submitted",
      "Confirming",
      "Simulating approval",
      "Waiting for approval signature",
      "Approval submitted",
      "Confirming approval",
      "Refreshing USDC allowance",
      "Simulating private conversion",
      "Waiting for private conversion signature",
      "Private conversion submitted",
      "Confirming private conversion",
      "Encrypting private deposit",
      "Simulating vault deposit",
      "Waiting for vault deposit signature",
      "Vault deposit submitted",
      "Confirming vault deposit",
      "Vault deposit receipt confirmed",
      "Refreshing vault state",
      "Checking withdrawal eligibility",
      "Preparing withdrawal",
      "Confirm preparation",
      "Withdrawal preparation submitted",
      "Confirming withdrawal preparation",
      "Refreshing round state",
      "Simulating withdrawal",
      "Waiting for withdrawal signature",
      "Withdrawal submitted",
      "Confirming withdrawal",
      "Withdrawal receipt confirmed",
      "Private processing",
      "Complete",
      "Failed",
    ]);
    expect(ROUND_STATE_LABELS[7]).toBe("Finalizing private draw");
    expect(ROUND_STATE_LABELS[10]).toBe("Settled");
  });

  it("does not render unresolved private balance as zero", () => {
    expect(privateBalanceLabel("NOT_REVEALED", null)).toBe("•••••• USDC");
    expect(privateBalanceLabel("REVEAL_FAILED", 0n)).toBe("•••••• USDC");
    expect(privateBalanceLabel("DECRYPTING", null)).toBe("Revealing…");
    expect(privateBalanceLabel("REVEALED", 1_000_000n)).toBe("1 USDC");
    expect(privateBalanceLabel("REVEALED", 0n)).toBe("0 USDC");
  });
});
