import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ethers, fhevm, network } from "hardhat";
import type { TransactionResponse } from "ethers";
import { retrySafeFheOperation } from "./leopold-fhe-retry";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "config/leopold-v2-official-manifest.json");
const ENV_PATH = path.join(ROOT, "keeper/.env");
const JOURNAL_PATH = path.resolve(
  process.env.LEOPOLD_V2_OFFICIAL_SMOKE_JOURNAL ?? "/tmp/leopold-v2-official-smoke-journal.json",
);
const OUTPUT_PATH = path.resolve(
  process.env.LEOPOLD_V2_OFFICIAL_SMOKE_OUTPUT ?? "/tmp/leopold-v2-official-smoke-setup.json",
);
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const DEPOSIT = 1_000n;
const BOND = ethers.parseEther("0.005");
const CREDIT = BOND * 2n;

type JournalEntry = {
  readonly label: string;
  readonly hash: string;
  readonly submittedAt: string;
  readonly blockNumber?: number;
  readonly blockHash?: string;
  readonly gasUsed?: string;
  readonly status?: number;
};

type Journal = { readonly schema: "leopold.official-v2-smoke-journal.v1"; entries: JournalEntry[] };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) throw new Error("OFFICIAL_V2_SMOKE_KEEPER_ENV_MISSING");
  const values: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator > 0) values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

function loadJournal(): Journal {
  if (!existsSync(JOURNAL_PATH)) return { schema: "leopold.official-v2-smoke-journal.v1", entries: [] };
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as Journal;
  if (journal.schema !== "leopold.official-v2-smoke-journal.v1" || !Array.isArray(journal.entries)) {
    throw new Error("OFFICIAL_V2_SMOKE_JOURNAL_INVALID");
  }
  return journal;
}

function persistJournal(journal: Journal): void {
  writeFileSync(JOURNAL_PATH, `${JSON.stringify(journal, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function waitAndRecord(label: string, tx: TransactionResponse, journal: Journal): Promise<JournalEntry> {
  const entry: JournalEntry = { label, hash: tx.hash, submittedAt: new Date().toISOString() };
  journal.entries.push(entry);
  persistJournal(journal);
  process.stdout.write(`SUBMITTED ${label} ${tx.hash}\n`);
  const receipt = await tx.wait();
  if (receipt === null || receipt.status !== 1) throw new Error(`OFFICIAL_V2_SMOKE_TX_FAILED:${label}`);
  const completed = {
    ...entry,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status,
  };
  journal.entries[journal.entries.length - 1] = completed;
  persistJournal(journal);
  return completed;
}

async function submitOnce(
  label: string,
  signer: ethers.Wallet,
  journal: Journal,
  createTransaction: () => Promise<TransactionResponse>,
): Promise<JournalEntry> {
  const existing = journal.entries.find((entry) => entry.label === label);
  if (existing) {
    const tx = await ethers.provider.getTransaction(existing.hash);
    if (tx === null) throw new Error(`OFFICIAL_V2_SMOKE_ORPHANED_TX_REQUIRES_OPERATOR_REVIEW:${label}`);
    const receipt = await ethers.provider.getTransactionReceipt(existing.hash);
    if (receipt === null) {
      process.stdout.write(`RECONCILE_PENDING ${label} ${existing.hash}\n`);
      const completed = await tx.wait();
      if (completed === null || completed.status !== 1) throw new Error(`OFFICIAL_V2_SMOKE_TX_FAILED:${label}`);
      const reconciled = {
        ...existing,
        blockNumber: completed.blockNumber,
        blockHash: completed.blockHash,
        gasUsed: completed.gasUsed.toString(),
        status: completed.status,
      };
      const index = journal.entries.findIndex((entry) => entry.label === label);
      journal.entries[index] = reconciled;
      persistJournal(journal);
      return reconciled;
    }
    if (receipt.status !== 1) throw new Error(`OFFICIAL_V2_SMOKE_TX_FAILED:${label}`);
    return existing;
  }
  const nonceBefore = await ethers.provider.getTransactionCount(signer.address, "pending");
  const tx = await createTransaction();
  if (tx.from.toLowerCase() !== signer.address.toLowerCase() || tx.nonce !== nonceBefore) {
    throw new Error(`OFFICIAL_V2_SMOKE_TX_PRECONDITION_CHANGED:${label}`);
  }
  return waitAndRecord(label, tx, journal);
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("OFFICIAL_V2_SMOKE_REQUIRES_SEPOLIA");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    deploymentStatus: string;
    network: { chainId: number };
    officialVaults: Array<{ implementation: string; automaticEntry: boolean; vault: string; bondEscrow: string }>;
  };
  if (manifest.deploymentStatus !== "OFFICIAL_SEPOLIA_DEPLOYED") {
    throw new Error("OFFICIAL_V2_SMOKE_MANIFEST_NOT_ADOPTED");
  }
  if (manifest.network.chainId !== 11155111 || manifest.officialVaults.length !== 1) {
    throw new Error("OFFICIAL_V2_SMOKE_MANIFEST_CHAIN_OR_VAULT_MISMATCH");
  }
  const vaultAddress = manifest.officialVaults[0]?.vault;
  const escrowAddress = manifest.officialVaults[0]?.bondEscrow;
  if (!vaultAddress || !escrowAddress || manifest.officialVaults[0]?.implementation !== "v2") {
    throw new Error("OFFICIAL_V2_SMOKE_MANIFEST_TOPOLOGY_MISSING");
  }
  if (manifest.officialVaults[0]?.automaticEntry !== true) throw new Error("OFFICIAL_V2_SMOKE_AUTO_ENTRY_NOT_ENABLED");

  const env = readEnv();
  const participantKeys = [env.SMOKE_PARTICIPANT_A_PRIVATE_KEY, env.SMOKE_PARTICIPANT_B_PRIVATE_KEY];
  if (participantKeys.some((key) => !/^0x[0-9a-fA-F]{64}$/u.test(key ?? ""))) {
    throw new Error("OFFICIAL_V2_SMOKE_PARTICIPANT_CREDENTIAL_MISSING");
  }
  const participants = participantKeys.map((key) => new ethers.Wallet(key as string, ethers.provider));
  const journal = loadJournal();
  await retrySafeFheOperation("official-smoke-fhe-initialize", () => fhevm.initializeCLIApi(), {
    onRetry: (diagnostic) => process.stderr.write(`FHE_HELPER_RETRY ${JSON.stringify(diagnostic)}\n`),
  });

  const usdc = new ethers.Contract(
    USDC,
    ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"],
    ethers.provider,
  );
  const wrapper = new ethers.Contract(
    "0x3AD7490852eA0cf16F654Ce854B87227b4369b91",
    [
      "function wrap(address,uint256) returns (bool)",
      "function confidentialBalanceOf(address) view returns (bytes32)",
      "function confidentialTransferAndCall(address,bytes32,bytes,bytes) returns (bool)",
    ],
    ethers.provider,
  );
  const vault = new ethers.Contract(
    vaultAddress,
    [
      "function activeRoundId() view returns (uint256)",
      "function roundInfo(uint256) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
      "function principalOf(address) view returns (bytes32)",
    ],
    ethers.provider,
  );
  const escrow = new ethers.Contract(
    escrowAddress,
    [
      "function BOND_AMOUNT() view returns (uint256)",
      "function depositAutomationBondCredit() payable",
      "function setAutoEntry(bool)",
      "function automationBondCredit(address) view returns (uint256)",
      "function autoEntryPreference(address) view returns (bool,bool,uint256)",
      "function isAutoEntryEnabled(address,uint256) view returns (bool)",
      "function isRegistered(uint256,address) view returns (bool)",
    ],
    ethers.provider,
  );
  const bond = (await escrow.getFunction("BOND_AMOUNT")()) as bigint;
  if (bond !== BOND) throw new Error("OFFICIAL_V2_SMOKE_BOND_MISMATCH");
  const activeRound = (await vault.getFunction("activeRoundId")()) as bigint;
  const roundOne = (await vault.getFunction("roundInfo")(1)) as readonly bigint[];
  const latest = await ethers.provider.getBlock("latest");
  if (
    activeRound !== 1n ||
    BigInt(roundOne[2]) !== 1n ||
    latest === null ||
    BigInt(latest.timestamp) < roundOne[0] ||
    BigInt(latest.timestamp) >= roundOne[1]
  ) {
    throw new Error("OFFICIAL_V2_SMOKE_BOOTSTRAP_ROUND_NOT_OPEN");
  }

  const participantEvidence: Record<string, unknown>[] = [];
  for (const [index, participant] of participants.entries()) {
    const prefix = `participant-${index + 1}`;
    const publicBalance = (await usdc.getFunction("balanceOf")(participant.address)) as bigint;
    const wrappedBefore = (await wrapper.getFunction("confidentialBalanceOf")(participant.address)) as string;
    if (publicBalance < DEPOSIT && wrappedBefore === ethers.ZeroHash) {
      throw new Error(`OFFICIAL_V2_SMOKE_USDC_SHORTFALL:${index + 1}`);
    }
    const txs: JournalEntry[] = [];
    if (wrappedBefore === ethers.ZeroHash) {
      txs.push(
        await submitOnce(`${prefix}-approve-usdc`, participant, journal, () =>
          usdc.connect(participant).getFunction("approve")(wrapper.target, DEPOSIT),
        ),
      );
      txs.push(
        await submitOnce(`${prefix}-wrap`, participant, journal, () =>
          wrapper.connect(participant).getFunction("wrap")(participant.address, DEPOSIT),
        ),
      );
    }
    const principalBefore = (await vault.getFunction("principalOf")(participant.address)) as string;
    if (principalBefore === ethers.ZeroHash) {
      const encrypted = await retrySafeFheOperation(
        `${prefix}-encrypt-save`,
        () => fhevm.createEncryptedInput(wrapper.target.toString(), participant.address).add64(DEPOSIT).encrypt(),
        {
          onRetry: (diagnostic) => process.stderr.write(`FHE_HELPER_RETRY ${JSON.stringify(diagnostic)}\n`),
        },
      );
      txs.push(
        await submitOnce(`${prefix}-save-private`, participant, journal, () =>
          wrapper.connect(participant).getFunction("confidentialTransferAndCall(address,bytes32,bytes,bytes)")(
            vaultAddress,
            encrypted.handles[0],
            encrypted.inputProof,
            "0x",
          ),
        ),
      );
    }
    const currentCredit = (await escrow.getFunction("automationBondCredit")(participant.address)) as bigint;
    if (currentCredit < CREDIT) {
      txs.push(
        await submitOnce(`${prefix}-fund-automation-credit`, participant, journal, () =>
          escrow.connect(participant).getFunction("depositAutomationBondCredit")({ value: CREDIT - currentCredit }),
        ),
      );
    }
    const preferenceBefore = (await escrow.getFunction("autoEntryPreference")(participant.address)) as readonly [
      boolean,
      boolean,
      bigint,
    ];
    if (!(preferenceBefore[1] === true && preferenceBefore[2] === 2n)) {
      txs.push(
        await submitOnce(`${prefix}-enable-auto-entry`, participant, journal, () =>
          escrow.connect(participant).getFunction("setAutoEntry")(true),
        ),
      );
    }
    const preference = (await escrow.getFunction("autoEntryPreference")(participant.address)) as readonly [
      boolean,
      boolean,
      bigint,
    ];
    const credit = (await escrow.getFunction("automationBondCredit")(participant.address)) as bigint;
    if ((await escrow.getFunction("isRegistered")(1, participant.address)) === true)
      throw new Error("OFFICIAL_V2_SMOKE_ROUND_1_REGISTERED");
    if ((await escrow.getFunction("isAutoEntryEnabled")(participant.address, 1)) !== false)
      throw new Error("OFFICIAL_V2_SMOKE_RETROACTIVE_AUTO_ENTRY");
    if ((await escrow.getFunction("isAutoEntryEnabled")(participant.address, 2)) !== true)
      throw new Error("OFFICIAL_V2_SMOKE_ROUND_2_NOT_SCHEDULED");
    if (preference[2] !== 2n || preference[1] !== true || credit !== CREDIT)
      throw new Error("OFFICIAL_V2_SMOKE_SETUP_STATE_MISMATCH");
    participantEvidence.push({
      address: participant.address,
      txs,
      effectiveRound: preference[2].toString(),
      automationCreditWei: credit.toString(),
      roundOneRegistered: false,
    });
  }

  const result = {
    schema: "leopold.official-v2-smoke-setup.v1",
    classification: "OFFICIAL V2 SEPOLIA CONTROLLED SMOKE SETUP",
    implementation: "v2",
    manifestPath: "config/leopold-v2-official-manifest.json",
    topology: { wrapper: wrapper.target, vault: vaultAddress, escrow: escrowAddress },
    participants: participantEvidence,
    bootstrapRound: { roundId: "1", state: "OPEN", manualRegistrationTransactions: 0 },
    automationCreditPerParticipantWei: CREDIT.toString(),
    principalBaseUnitsPerParticipant: DEPOSIT.toString(),
    migrationPerformed: false,
    journalPath: JOURNAL_PATH,
  };
  const text = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(OUTPUT_PATH, text, { encoding: "utf8", mode: 0o600 });
  writeFileSync(`${OUTPUT_PATH}.sha256`, `${sha256(text)}  ${path.basename(OUTPUT_PATH)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`OFFICIAL_V2_SMOKE_SETUP_PASS ${OUTPUT_PATH} ${sha256(text)}`);
}

main().catch((error: unknown) => {
  console.error(`OFFICIAL_V2_SMOKE_SETUP_FAILED ${error instanceof Error ? error.message : "UNKNOWN_FAILURE"}`);
  process.exitCode = 1;
});
