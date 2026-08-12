import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm, network } from "hardhat";

import type { TransactionResponse } from "ethers";
import type { LeopoldConfidentialUSDC, LeopoldSettlementBondEscrow, LeopoldVault } from "../types";

const LC_USDC = "0x70caEB8C660AC5D5Ce52f1C2687843C7c5474209";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const COMET = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";
const FAUCET = "0x68793eA49297eB75DFB4610B68e076D2A5c7646C";
const HISTORICAL_FAUCET_TX = "0x63829c8633304e200a62bdd0af068374687b8163afc6673988fbe8f4426357da";
const OUTPUT = path.resolve("evidence/closure/LEOPOLD_BOND_SEPOLIA_SMOKE.json");
const BOND = ethers.parseEther("0.0001");
const REWARD = ethers.parseEther("0.00002");
const DEPOSIT = 1_000n;
const PRIZE = 100n;

type TxRecord = { hash: string; blockNumber: number; gasUsed: string; status: number };

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function record(tx: TransactionResponse): Promise<TxRecord> {
  process.stdout.write(`SUBMITTED ${tx.hash}\n`);
  const receipt = await tx.wait();
  if (receipt === null || receipt.status !== 1) throw new Error("live transaction failed");
  return {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  };
}

async function waitUntil(timestamp: bigint): Promise<void> {
  for (;;) {
    const block = await ethers.provider.getBlock("latest");
    if (block !== null && BigInt(block.timestamp) >= timestamp) return;
    await new Promise((resolve) => setTimeout(resolve, 12_000));
  }
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("bond smoke requires --network sepolia");
  await fhevm.initializeCLIApi();
  const [operator] = await ethers.getSigners();
  if ((await ethers.provider.getNetwork()).chainId !== 11_155_111n) throw new Error("unexpected chain");

  const usdc = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"],
    USDC,
    operator,
  );
  let usdcBalance = (await usdc.balanceOf(operator.address)) as bigint;
  let faucet: TxRecord | null = null;
  if (usdcBalance < DEPOSIT + PRIZE) {
    const oldTransaction = await ethers.provider.getTransaction(HISTORICAL_FAUCET_TX);
    if (oldTransaction === null || oldTransaction.to?.toLowerCase() !== FAUCET.toLowerCase()) {
      throw new Error("canonical faucet calldata unavailable");
    }
    faucet = await record(await operator.sendTransaction({ to: FAUCET, data: oldTransaction.data }));
    usdcBalance = (await usdc.balanceOf(operator.address)) as bigint;
  }
  if (usdcBalance < DEPOSIT + PRIZE) throw new Error("insufficient canonical Sepolia USDC");

  const asset = (await ethers.getContractAt("LeopoldConfidentialUSDC", LC_USDC, operator)) as LeopoldConfidentialUSDC;
  const latest = await ethers.provider.getBlock("latest");
  if (latest === null) throw new Error("latest block unavailable");
  const vault = (await (
    await ethers.getContractFactory("LeopoldVault", operator)
  ).deploy(
    1,
    0,
    ethers.encodeBytes32String("Daily"),
    180,
    LC_USDC,
    latest.timestamp,
    COMET,
    operator.address,
    60,
    BOND,
    REWARD,
  )) as LeopoldVault;
  const deployment = vault.deploymentTransaction();
  if (deployment === null) throw new Error("deployment transaction unavailable");
  const vaultDeployment = await record(deployment);
  process.stdout.write("STAGE vault-deployed\n");
  const vaultAddress = await vault.getAddress();
  const escrowAddress = await vault.SETTLEMENT_BOND_ESCROW();
  const escrow = (await ethers.getContractAt(
    "LeopoldSettlementBondEscrow",
    escrowAddress,
    operator,
  )) as LeopoldSettlementBondEscrow;
  const adapterAddress = await vault.STRATEGY();
  const adapter = await ethers.getContractAt("LeopoldCompoundAdapter", adapterAddress, operator);
  if (!(await adapter.marketIntegrity())) throw new Error("live Comet market-integrity check failed");

  const approveWrap = await record(await usdc.approve(LC_USDC, DEPOSIT));
  const wrap = await record(await asset.wrap(operator.address, DEPOSIT));
  const encryptedDeposit = await fhevm.createEncryptedInput(LC_USDC, operator.address).add64(DEPOSIT).encrypt();
  process.stdout.write("STAGE deposit-encrypted\n");
  const save = await record(
    await asset["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
      vaultAddress,
      encryptedDeposit.handles[0],
      encryptedDeposit.inputProof,
      "0x",
    ),
  );
  const register = await record(await escrow.registerForRound(1, { value: BOND }));
  const approveSponsor = await record(await usdc.approve(vaultAddress, PRIZE));
  const sponsor = await record(await vault.contributeSponsor(1, PRIZE));

  const roundBeforeClose = await vault.roundInfo(1);
  await waitUntil(roundBeforeClose[1]);
  const close = await record(await vault.closeRound());
  if (await escrow.isRegistered(2, operator.address)) throw new Error("prior-round registration leaked into round two");

  const aggregateHandle = await vault.aggregateTwabHandle(1);
  process.stdout.write("STAGE aggregate-public-decryption\n");
  const aggregateProof = await fhevm.publicDecrypt([aggregateHandle]);
  const aggregate = aggregateProof.clearValues[aggregateHandle as `0x${string}`] as bigint;
  if (aggregate === 0n) throw new Error("eligible aggregate unexpectedly empty");
  const finalizeAggregate = await record(
    await vault.finalizeAggregate(1, aggregateProof.abiEncodedClearValues, aggregateProof.decryptionProof),
  );

  const randomness: TxRecord[] = [];
  for (let attempts = 0; attempts < 8; attempts += 1) {
    randomness.push(await record(await vault.generateRandomCandidate(1)));
    if ((await vault.roundInfo(1))[2] === 7n) break;
    const validityHandle = await vault.candidateValidityHandle(1);
    process.stdout.write("STAGE validity-public-decryption\n");
    const validityProof = await fhevm.publicDecrypt([validityHandle]);
    randomness.push(
      await record(
        await vault.finalizeCandidateValidity(1, validityProof.abiEncodedClearValues, validityProof.decryptionProof),
      ),
    );
    if ((await vault.roundInfo(1))[2] === 7n) break;
  }
  if ((await vault.roundInfo(1))[2] !== 7n) throw new Error("ticket not accepted within smoke retry budget");

  const selection = await record(await vault.processSelection(1, 1));
  const reconciliationHandle = await vault.reconciliationHandle(1);
  process.stdout.write("STAGE reconciliation-public-decryption\n");
  const reconciliationProof = await fhevm.publicDecrypt([reconciliationHandle]);
  const reconciliation = await record(
    await vault.finalizeSelectionReconciliation(
      1,
      reconciliationProof.abiEncodedClearValues,
      reconciliationProof.decryptionProof,
    ),
  );
  const allocation = await record(await vault.processAllocation(1, 1));
  const finalization = await record(await vault.finalizeSettlement(1));

  if ((await escrow.settlementRewardCredit(operator.address)) !== REWARD * 2n) {
    throw new Error("settlement reward credit mismatch");
  }
  const rewardWithdrawal = await record(await escrow.withdrawSettlementRewards());
  const bondRefund = await record(await escrow.claimBondRefund(1));
  if ((await escrow.accountedLiability()) !== 0n) throw new Error("bond liabilities did not reconcile");

  const encryptedWithdrawal = await fhevm.createEncryptedInput(vaultAddress, operator.address).add64(DEPOSIT).encrypt();
  process.stdout.write("STAGE withdrawal-encrypted\n");
  const withdrawal = await record(await vault.withdraw(encryptedWithdrawal.handles[0], encryptedWithdrawal.inputProof));
  const principalAfter = await fhevm.userDecryptEuint(
    FhevmType.euint64,
    await vault.principalOf(operator.address),
    vaultAddress,
    operator,
  );
  if (principalAfter !== 0n) throw new Error("private principal did not reconcile");

  const source = await readFile(path.resolve("contracts/LeopoldVault.sol"));
  const evidence = {
    schema: "leopold.cp1-bond-sepolia-smoke.v1",
    capturedUtc: new Date().toISOString(),
    network: { name: network.name, chainId: "11155111" },
    sourceHeadBeforeCommit: "8f30ba74a1fcbfa2cbb45aa420a90b3ec65f7951",
    sourceSha256: sha256(source),
    operator: operator.address,
    contracts: {
      canonicalCircleUsdc: USDC,
      lcUsdc: LC_USDC,
      compoundComet: COMET,
      vault: vaultAddress,
      escrow: escrowAddress,
      adapter: adapterAddress,
    },
    configuration: { roundDurationSeconds: 180, bondWei: BOND.toString(), rewardPerPassWei: REWARD.toString() },
    checks: {
      deployedRuntimeBytes: (await ethers.provider.getCode(vaultAddress)).length / 2 - 1,
      escrowVaultBackpointer: (await escrow.VAULT()) === vaultAddress,
      adapterVaultBackpointer: (await adapter.vault()) === vaultAddress,
      adapterMarketIntegrity: await adapter.marketIntegrity(),
      exactEligibleAggregate: aggregate.toString(),
      acceptedTicketPubliclyDecrypted: false,
      winnerPubliclyDecrypted: false,
      currentRoundParticipantCount: (await vault.roundInfo(1))[5].toString(),
      nextRoundInheritedRegistration: false,
      rewardCreditBeforeWithdrawal: (REWARD * 2n).toString(),
      bondLiabilityAfterWithdrawals: (await escrow.accountedLiability()).toString(),
      principalAfterWithdrawal: principalAfter.toString(),
    },
    transactions: {
      faucet,
      vaultDeployment,
      approveWrap,
      wrap,
      save,
      register,
      approveSponsor,
      sponsor,
      close,
      finalizeAggregate,
      randomness,
      selection,
      reconciliation,
      allocation,
      finalization,
      rewardWithdrawal,
      bondRefund,
      withdrawal,
    },
    limitations: [
      "Disposable smoke reused the separately live-proven lcUSDC deployment.",
      "The new adapter was deployment/backpointer/market-integrity checked; Compound supply/harvest was not repeated because bond code does not alter the adapter and historical Compound evidence remains separately commit-bound.",
      "No browser was used; SG-5 browser capability remains separate immutable evidence.",
    ],
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(OUTPUT, serialized, { encoding: "utf8", mode: 0o600 });
  await writeFile(`${OUTPUT}.sha256`, `${sha256(serialized)}  LEOPOLD_BOND_SEPOLIA_SMOKE.json\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(`LEOPOLD_BOND_SEPOLIA_SMOKE_PASS ${vaultAddress} ${sha256(serialized)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown failure";
  process.stderr.write(`LEOPOLD_BOND_SEPOLIA_SMOKE_FAILED ${message}\n`);
  process.exitCode = 1;
});
