import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ethers, fhevm, network } from "hardhat";
import type { TransactionResponse } from "ethers";
import { retrySafeFheOperation } from "./leopold-fhe-retry";

const TOPOLOGY = process.env.LEOPOLD_V2_DISPOSABLE_TOPOLOGY ?? "/tmp/leopold-v2-disposable-topology-v3.json";
const WALLETS = "/tmp/leopold-v2-disposable-wallets.json";
const OUTPUT = path.resolve(
  process.env.LEOPOLD_V2_PARTICIPANT_SETUP_OUTPUT ?? "/tmp/leopold-v2-participant-setup.json",
);
const DEPOSIT = 1_000n;
const BOND = ethers.parseEther("0.0001");
const CREDIT = BOND * 2n;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function record(label: string, tx: TransactionResponse) {
  process.stdout.write(`SUBMITTED ${label} ${tx.hash}\n`);
  const receipt = await tx.wait();
  if (receipt === null || receipt.status !== 1) throw new Error(`PARTICIPANT_SETUP_FAILED:${label}`);
  return {
    label,
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    gasUsed: receipt.gasUsed.toString(),
  };
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("PARTICIPANT_SETUP_REQUIRES_SEPOLIA");
  await retrySafeFheOperation("cli-fhe-initialize", () => fhevm.initializeCLIApi(), {
    onRetry: (diagnostic) => process.stderr.write(`FHE_HELPER_RETRY ${JSON.stringify(diagnostic)}\n`),
  });
  const topology = JSON.parse(await readFile(TOPOLOGY, "utf8")) as {
    contracts: { wrapper: { address: string }; vault: { address: string }; escrow: { address: string } };
    sourceCommitSha?: string;
    sourceBranch?: string;
  };
  if (!topology.sourceCommitSha || !/^[0-9a-f]{40}$/u.test(topology.sourceCommitSha)) {
    throw new Error("PARTICIPANT_SETUP_TOPOLOGY_PROVENANCE_MISSING");
  }
  const expectedSourceSha = process.env.LEOPOLD_REVIEWED_SOURCE_SHA;
  if (!expectedSourceSha || topology.sourceCommitSha !== expectedSourceSha) {
    throw new Error("PARTICIPANT_SETUP_TOPOLOGY_PROVENANCE_MISMATCH");
  }
  const walletFile = JSON.parse(await readFile(WALLETS, "utf8")) as {
    participants: Array<{ address: string; privateKey: string }>;
  };
  if (walletFile.participants.length !== 2) throw new Error("EXPECTED_TWO_PARTICIPANTS");
  const wrapper = new ethers.Contract(
    topology.contracts.wrapper.address,
    [
      "function approve(address,uint256) returns (bool)",
      "function wrap(address,uint256) returns (bool)",
      "function confidentialBalanceOf(address) view returns (bytes32)",
      "function confidentialTransferAndCall(address,bytes32,bytes,bytes) returns (bool)",
    ],
    ethers.provider,
  );
  const usdc = new ethers.Contract(
    USDC,
    ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
    ethers.provider,
  );
  const escrow = new ethers.Contract(
    topology.contracts.escrow.address,
    [
      "function depositAutomationBondCredit() payable",
      "function setAutoEntry(bool)",
      "function isAutoEntryEnabled(address,uint256) view returns (bool)",
      "function autoEntryPreference(address) view returns (bool,bool,uint256)",
      "function automationBondCredit(address) view returns (uint256)",
      "function isRegistered(uint256,address) view returns (bool)",
    ],
    ethers.provider,
  );
  const vault = new ethers.Contract(
    topology.contracts.vault.address,
    [
      "function activeRoundId() view returns (uint256)",
      "function roundInfo(uint256) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
      "function principalOf(address) view returns (bytes32)",
    ],
    ethers.provider,
  );
  const beforeRound = await vault.getFunction("roundInfo")(1);
  if ((await vault.getFunction("activeRoundId")()) !== 1n || BigInt(beforeRound[2]) !== 1n)
    throw new Error(`ROUND_1_NOT_OPEN:${beforeRound[2]}`);
  const latest = await ethers.provider.getBlock("latest");
  if (
    latest === null ||
    BigInt(latest.timestamp) < BigInt(beforeRound[0]) ||
    BigInt(latest.timestamp) >= BigInt(beforeRound[1])
  ) {
    throw new Error("ROUND_1_BOOTSTRAP_WINDOW_CLOSED");
  }
  const participants: Record<string, unknown>[] = [];
  for (const [index, definition] of walletFile.participants.entries()) {
    const signer = new ethers.Wallet(definition.privateKey, ethers.provider);
    if (signer.address.toLowerCase() !== definition.address.toLowerCase())
      throw new Error("PARTICIPANT_KEY_ADDRESS_MISMATCH");
    const txs = [];
    const publicBalance = (await usdc.getFunction("balanceOf")(signer.address)) as bigint;
    const existingWrappedHandle = (await wrapper.getFunction("confidentialBalanceOf")(signer.address)) as string;
    const alreadyWrapped = existingWrappedHandle !== ethers.ZeroHash;
    if (publicBalance < DEPOSIT && !alreadyWrapped) throw new Error(`PARTICIPANT_USDC_SHORTFALL:${index + 1}`);
    if (!alreadyWrapped) {
      txs.push(
        await record(
          `participant-${index + 1}-approve-usdc`,
          await usdc.connect(signer).getFunction("approve")(topology.contracts.wrapper.address, DEPOSIT),
        ),
      );
      txs.push(
        await record(
          `participant-${index + 1}-wrap`,
          await wrapper.connect(signer).getFunction("wrap")(signer.address, DEPOSIT),
        ),
      );
    }
    const principalHandle = (await vault.getFunction("principalOf")(signer.address)) as string;
    if (principalHandle === ethers.ZeroHash) {
      const encrypted = await retrySafeFheOperation(
        `participant-${index + 1}-encrypt-save`,
        async () =>
          fhevm.createEncryptedInput(topology.contracts.wrapper.address, signer.address).add64(DEPOSIT).encrypt(),
        { onRetry: (diagnostic) => process.stderr.write(`FHE_HELPER_RETRY ${JSON.stringify(diagnostic)}\n`) },
      );
      txs.push(
        await record(
          `participant-${index + 1}-save-private`,
          await wrapper.connect(signer).getFunction("confidentialTransferAndCall(address,bytes32,bytes,bytes)")(
            topology.contracts.vault.address,
            encrypted.handles[0],
            encrypted.inputProof,
            "0x",
          ),
        ),
      );
    }
    const currentCredit = (await escrow.getFunction("automationBondCredit")(signer.address)) as bigint;
    if (currentCredit < CREDIT) {
      txs.push(
        await record(
          `participant-${index + 1}-fund-automation-credit`,
          await escrow.connect(signer).getFunction("depositAutomationBondCredit")({ value: CREDIT - currentCredit }),
        ),
      );
    }
    const preferenceBefore = await escrow.getFunction("autoEntryPreference")(signer.address);
    if (!(preferenceBefore[1] === true && BigInt(preferenceBefore[2]) === 2n)) {
      txs.push(
        await record(
          `participant-${index + 1}-enable-auto-entry`,
          await escrow.connect(signer).getFunction("setAutoEntry")(true),
        ),
      );
    }
    const preference = await escrow.getFunction("autoEntryPreference")(signer.address);
    const credit = await escrow.getFunction("automationBondCredit")(signer.address);
    const registeredRound1 = await escrow.getFunction("isRegistered")(1, signer.address);
    if (registeredRound1) throw new Error("ROUND_1_MANUAL_OR_UNEXPECTED_REGISTRATION");
    if ((await escrow.getFunction("isAutoEntryEnabled")(signer.address, 1)) !== false)
      throw new Error("ROUND_1_RETROACTIVE_AUTO_ENTRY");
    if ((await escrow.getFunction("isAutoEntryEnabled")(signer.address, 2)) !== true)
      throw new Error("ROUND_2_AUTO_ENTRY_NOT_SCHEDULED");
    if (BigInt(preference[2]) !== 2n || preference[1] !== true || credit !== CREDIT)
      throw new Error("AUTO_ENTRY_ACTIVATION_STATE_MISMATCH");
    participants.push({
      address: signer.address,
      txs,
      activation: { enabledRound1: false, enabledRound2: true, effectiveRound: preference[2].toString() },
      automationCredit: credit.toString(),
      registeredRound1,
    });
  }
  const afterRound = await vault.getFunction("roundInfo")(1);
  const evidence = {
    schema: "leopold.disposable-v2-participant-setup.v1",
    classification: "DISPOSABLE V2 SEPOLIA PROOF — NOT OFFICIAL DEPLOYMENT",
    sourceCheckpoint: topology.sourceCommitSha,
    sourceBranch: topology.sourceBranch,
    network: { name: network.name, chainId: "11155111" },
    topology: topology.contracts,
    bootstrapRound: {
      roundId: "1",
      state: "OPEN",
      participantCountBefore: beforeRound[5].toString(),
      participantCountAfter: afterRound[5].toString(),
      usersRegistered: false,
    },
    participants,
    bondAmountWei: BOND.toString(),
    automationCreditPerParticipantWei: CREDIT.toString(),
  };
  const text = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(OUTPUT, text, { encoding: "utf8", mode: 0o600 });
  await writeFile(`${OUTPUT}.sha256`, `${sha256(text)}  ${path.basename(OUTPUT)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`PARTICIPANT_SETUP_PASS ${OUTPUT} ${sha256(text)}`);
}

main().catch((error: unknown) => {
  console.error(`PARTICIPANT_SETUP_FAILED ${error instanceof Error ? error.message : "unknown failure"}`);
  process.exitCode = 1;
});
