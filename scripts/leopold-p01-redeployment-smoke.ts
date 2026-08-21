import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm, network } from "hardhat";

import type { TransactionResponse } from "ethers";
import type { LeopoldConfidentialUSDC, LeopoldVault, LeopoldVaultRegistry } from "../types";

const CHAIN_ID = 11_155_111n;
const DEPLOYER = "0x57357D26D1f56eca4556d271078A0239a7696Bbf";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const LC_USDC = "0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8";
const AMOUNT = 1n;
const MANIFEST_PATH = path.resolve("config/leopold-frontend-contracts.json");
const OUTPUT_PATH = path.resolve("evidence/deployment/LEOPOLD_P01_BOUNDED_SMOKE.json");

type TxRecord = { hash: string; block: number; gasUsed: string; status: number };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function record(tx: TransactionResponse): Promise<TxRecord> {
  process.stdout.write(`SUBMITTED ${tx.hash}\n`);
  const receipt = await tx.wait();
  if (receipt === null || receipt.status !== 1) throw new Error(`TRANSACTION_FAILED:${tx.hash}`);
  return {
    hash: receipt.hash,
    block: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  };
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("P01_SMOKE_REQUIRES_SEPOLIA");
  if (process.env.LEOPOLD_P01_SMOKE_ACK !== "I ACKNOWLEDGE THE BOUNDED P01 DEPOSIT AND WITHDRAW SMOKE") {
    throw new Error("P01_SMOKE_ACKNOWLEDGEMENT_REQUIRED");
  }
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== CHAIN_ID) throw new Error(`UNEXPECTED_CHAIN:${chain.chainId.toString()}`);
  const [operator] = await ethers.getSigners();
  if (operator === undefined || operator.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error(`UNEXPECTED_OPERATOR:${operator?.address ?? "missing"}`);
  }

  const manifestText = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestText) as {
    contracts: { canonicalCircleUsdc: string; lcUsdc: string; registry: string };
    officialVaults: Array<{ id: number; vault: string; adapter: string; bondEscrow: string }>;
  };
  const daily = manifest.officialVaults.find((vault) => vault.id === 1);
  if (
    daily === undefined ||
    manifest.contracts.canonicalCircleUsdc.toLowerCase() !== USDC.toLowerCase() ||
    manifest.contracts.lcUsdc.toLowerCase() !== LC_USDC.toLowerCase()
  ) {
    throw new Error("CURRENT_MANIFEST_DRIFT");
  }

  const registry = (await ethers.getContractAt(
    "LeopoldVaultRegistry",
    manifest.contracts.registry,
    operator,
  )) as LeopoldVaultRegistry;
  const official = await registry.officialVault(1);
  if (!official.active || official.vault.toLowerCase() !== daily.vault.toLowerCase()) {
    throw new Error("REGISTRY_DISCOVERY_FAILED");
  }

  const vault = (await ethers.getContractAt("LeopoldVault", daily.vault, operator)) as LeopoldVault;
  const asset = (await ethers.getContractAt("LeopoldConfidentialUSDC", LC_USDC, operator)) as LeopoldConfidentialUSDC;
  const usdc = await ethers.getContractAt(
    [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
    ],
    USDC,
    operator,
  );
  const [roundId, roundInfo, underlying, rate, decimals, usdcBefore] = await Promise.all([
    vault.activeRoundId(),
    vault.roundInfo(await vault.activeRoundId()),
    asset.underlying(),
    asset.rate(),
    asset.decimals(),
    usdc.balanceOf(operator.address) as Promise<bigint>,
  ]);
  if (roundInfo[2] !== 1n) throw new Error(`DAILY_ROUND_NOT_OPEN:${roundInfo[2].toString()}`);
  if (underlying.toLowerCase() !== USDC.toLowerCase() || rate !== 1n || decimals !== 6n) {
    throw new Error("WRAPPER_RELATIONSHIP_DRIFT");
  }
  if (usdcBefore < AMOUNT) throw new Error(`INSUFFICIENT_CANONICAL_USDC:${usdcBefore.toString()}`);

  await fhevm.initializeCLIApi();
  const approve = await record(await usdc.approve(LC_USDC, AMOUNT));
  const wrap = await record(await asset.wrap(operator.address, AMOUNT));

  const encryptedDeposit = await fhevm.createEncryptedInput(LC_USDC, operator.address).add64(AMOUNT).encrypt();
  const deposit = await record(
    await asset["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      daily.vault,
      encryptedDeposit.handles[0],
      encryptedDeposit.inputProof,
      "0x",
    ),
  );
  const principalAfterDeposit = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    await vault.principalOf(operator.address),
    daily.vault,
    operator,
  );
  if (principalAfterDeposit !== AMOUNT) {
    throw new Error(`DEPOSIT_NOT_RECORDED:${principalAfterDeposit.toString()}`);
  }

  const encryptedWithdrawal = await fhevm.createEncryptedInput(daily.vault, operator.address).add64(AMOUNT).encrypt();
  const withdrawal = await record(await vault.withdraw(encryptedWithdrawal.handles[0], encryptedWithdrawal.inputProof));
  const principalAfterWithdrawal = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    await vault.principalOf(operator.address),
    daily.vault,
    operator,
  );
  if (principalAfterWithdrawal !== 0n) {
    throw new Error(`WITHDRAWAL_NOT_RECORDED:${principalAfterWithdrawal.toString()}`);
  }

  const evidence = {
    schema: "leopold.p01-bounded-deposit-withdraw-smoke.v1",
    capturedUtc: new Date().toISOString(),
    chain: { name: "ethereum-sepolia", chainId: chain.chainId.toString() },
    operator: operator.address,
    manifestSha256: sha256(manifestText),
    contracts: {
      canonicalCircleUsdc: USDC,
      lcUsdc: LC_USDC,
      registry: manifest.contracts.registry,
      dailyVault: daily.vault,
      dailyAdapter: daily.adapter,
      dailyEscrow: daily.bondEscrow,
    },
    amountBaseUnits: AMOUNT.toString(),
    round: { id: roundId.toString(), stateBefore: roundInfo[2].toString(), forcedClosePerformed: false },
    relationships: {
      registryDiscovery: true,
      wrapperUnderlying: underlying,
      wrapperRate: rate.toString(),
      wrapperDecimals: decimals.toString(),
    },
    checks: {
      principalAfterDeposit: principalAfterDeposit.toString(),
      principalAfterWithdrawal: principalAfterWithdrawal.toString(),
      depositRecorded: true,
      samePrincipalWithdrawn: true,
      adapterOrStrategyOperationPerformed: false,
      bondRegistrationPerformed: false,
      roundClosePerformed: false,
    },
    transactions: { approve, wrap, deposit, withdrawal },
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(OUTPUT_PATH, serialized, { encoding: "utf8", mode: 0o644 });
  console.log(`LEOPOLD_P01_BOUNDED_SMOKE_PASS ${daily.vault}`);
  console.log(`SMOKE_EVIDENCE_SHA256 ${sha256(serialized)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "P01_SMOKE_UNKNOWN_FAILURE");
  process.exitCode = 1;
});
