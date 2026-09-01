import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LeopoldSettlementBondEscrowV2,
  LeopoldVaultV2,
  MockLeopoldAsset,
  MockLeopoldUnderlying,
  MockSettlementBondVault,
} from "../types";

const BOND = ethers.parseEther("0.001");
const REWARD = ethers.parseEther("0.0002");
const DURATION = 3_600;

type LedgerFixture = {
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  keeper: HardhatEthersSigner;
  vault: MockSettlementBondVault;
  escrow: LeopoldSettlementBondEscrowV2;
};

async function ledgerFixture(): Promise<LedgerFixture> {
  const [, alice, bob, keeper] = await ethers.getSigners();
  const vault = (await (
    await ethers.getContractFactory("MockSettlementBondVault")
  ).deploy()) as MockSettlementBondVault;
  const escrow = (await (
    await ethers.getContractFactory("LeopoldSettlementBondEscrowV2")
  ).deploy(await vault.getAddress(), BOND, REWARD)) as LeopoldSettlementBondEscrowV2;
  await vault.setEscrow(await escrow.getAddress());
  return { alice, bob, keeper, vault, escrow };
}

async function productionFixture() {
  const [, alice, bob, carol, dave, keeper] = await ethers.getSigners();
  const underlying = (await (
    await ethers.getContractFactory("MockLeopoldUnderlying")
  ).deploy()) as MockLeopoldUnderlying;
  const asset = (await (
    await ethers.getContractFactory("MockLeopoldAsset")
  ).deploy(await underlying.getAddress())) as MockLeopoldAsset;
  const vault = (await (
    await ethers.getContractFactory("LeopoldVaultV2")
  ).deploy(
    1,
    0,
    ethers.encodeBytes32String("Daily"),
    DURATION,
    await asset.getAddress(),
    await time.latest(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    BOND,
    REWARD,
  )) as LeopoldVaultV2;
  const escrow = (await ethers.getContractAt(
    "LeopoldSettlementBondEscrowV2",
    await vault.SETTLEMENT_BOND_ESCROW(),
  )) as LeopoldSettlementBondEscrowV2;
  return { alice, bob, carol, dave, keeper, underlying, asset, vault, escrow };
}

async function deposit(
  underlying: MockLeopoldUnderlying,
  asset: MockLeopoldAsset,
  vault: LeopoldVaultV2,
  account: HardhatEthersSigner,
  amount: bigint,
): Promise<void> {
  await underlying.mint(account.address, amount);
  await underlying.connect(account).approve(await asset.getAddress(), amount);
  await asset.connect(account).wrap(account.address, amount);
  const encrypted = await fhevm
    .createEncryptedInput(await asset.getAddress(), account.address)
    .add64(amount)
    .encrypt();
  await asset
    .connect(account)
    [
      "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
    ](await vault.getAddress(), encrypted.handles[0], encrypted.inputProof, "0x");
}

async function withdraw(vault: LeopoldVaultV2, account: HardhatEthersSigner, amount: bigint): Promise<void> {
  const encrypted = await fhevm
    .createEncryptedInput(await vault.getAddress(), account.address)
    .add64(amount)
    .encrypt();
  await vault.connect(account).withdraw(encrypted.handles[0], encrypted.inputProof);
}

async function closeAndFinalizeAggregate(vault: LeopoldVaultV2, roundId: bigint): Promise<bigint> {
  await time.increaseTo((await vault.roundInfo(roundId))[1]);
  await vault.closeRound();
  const handle = await vault.aggregateTwabHandle(roundId);
  const proof = await fhevm.publicDecrypt([handle]);
  const aggregate = proof.clearValues[handle as `0x${string}`] as bigint;
  await vault.finalizeAggregate(roundId, proof.abiEncodedClearValues, proof.decryptionProof);
  return aggregate;
}

async function closeEmptyRound(vault: LeopoldVaultV2, roundId: bigint): Promise<void> {
  expect(await closeAndFinalizeAggregate(vault, roundId)).to.equal(0n);
  await vault.settleEmptyRound(roundId);
}

async function acceptTicket(vault: LeopoldVaultV2, roundId: bigint): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await vault.generateRandomCandidate(roundId);
    if ((await vault.roundInfo(roundId))[2] === 7n) return;
    const handle = await vault.candidateValidityHandle(roundId);
    const proof = await fhevm.publicDecrypt([handle]);
    await vault.finalizeCandidateValidity(roundId, proof.abiEncodedClearValues, proof.decryptionProof);
    if ((await vault.roundInfo(roundId))[2] === 7n) return;
  }
  throw new Error("mock RNG unexpectedly rejected five candidates");
}

describe("Leopold persistent automatic entry", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("applies enable and disable only at future round boundaries", async function () {
    const { alice, vault, escrow } = await ledgerFixture();
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND });
    await expect(escrow.connect(alice).setAutoEntry(true))
      .to.emit(escrow, "AutoEntryPreferenceScheduled")
      .withArgs(alice.address, true, 2n);
    expect(await escrow.isAutoEntryEnabled(alice.address, 1)).to.equal(false);
    expect(await escrow.isAutoEntryEnabled(alice.address, 2)).to.equal(true);

    await vault.setActiveRoundId(2);
    await escrow.connect(alice).setAutoEntry(false);
    expect(await escrow.isAutoEntryEnabled(alice.address, 2)).to.equal(true);
    expect(await escrow.isAutoEntryEnabled(alice.address, 3)).to.equal(false);

    await escrow.connect(alice).setAutoEntry(true);
    expect(await escrow.isAutoEntryEnabled(alice.address, 2)).to.equal(true);
    expect(await escrow.isAutoEntryEnabled(alice.address, 3)).to.equal(true);
    expect(await escrow.autoEntryAccountCount()).to.equal(1n);
    expect(await escrow.autoEntryAccountAt(0)).to.equal(alice.address);
  });

  it("does not create permanent scanner work for unfunded opt-outs and permits O(1) pruning", async function () {
    const { alice, bob, vault, escrow } = await ledgerFixture();
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND });
    await escrow.connect(alice).setAutoEntry(true);
    expect(await escrow.autoEntryAccountCount()).to.equal(1n);

    await vault.setActiveRoundId(2);
    await escrow.connect(alice).setAutoEntry(false);
    expect(await escrow.isAutoEntryEnabled(alice.address, 2)).to.equal(true);
    await expect(escrow.connect(bob).pruneAutoEntryAccount(alice.address)).to.be.revertedWithCustomError(
      escrow,
      "AutoEntryAccountStillActive",
    );
    await vault.setActiveRoundId(3);
    await expect(escrow.connect(bob).pruneAutoEntryAccount(alice.address))
      .to.emit(escrow, "AutoEntryAccountPruned")
      .withArgs(alice.address, bob.address);
    expect(await escrow.autoEntryAccountCount()).to.equal(0n);

    await escrow.connect(bob).setAutoEntry(false);
    expect(await escrow.autoEntryAccountCount()).to.equal(0n);
    await expect(escrow.connect(bob).pruneAutoEntryAccount(bob.address)).to.be.revertedWithCustomError(
      escrow,
      "AutoEntryAccountNotEnumerable",
    );
  });

  it("reserves exactly one prepaid bond and preserves participant ownership", async function () {
    const { alice, bob, keeper, vault, escrow } = await ledgerFixture();
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND * 2n });
    await escrow.connect(alice).setAutoEntry(true);
    await vault.setActiveRoundId(2);

    await expect(escrow.connect(keeper).registerForRoundFor(alice.address, 2))
      .to.emit(escrow, "DelegatedRoundRegistration")
      .withArgs(2n, alice.address, keeper.address);
    expect(await escrow.isRegistered(2, alice.address)).to.equal(true);
    expect(await escrow.isRegistered(2, keeper.address)).to.equal(false);
    expect(await escrow.automationBondCredit(alice.address)).to.equal(BOND);
    expect(await escrow.automationBondCredit(bob.address)).to.equal(0n);
    expect((await escrow.roundInfo(2))[3]).to.equal(BOND);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);

    await expect(escrow.connect(bob).registerForRoundFor(alice.address, 2)).to.be.revertedWithCustomError(
      escrow,
      "AlreadyRegistered",
    );
    expect(await escrow.automationBondCredit(alice.address)).to.equal(BOND);
  });

  it("keeps manual entry, auto-entry credit, and each vault strictly account-isolated", async function () {
    const first = await ledgerFixture();
    const second = await ledgerFixture();
    await first.escrow.connect(first.alice).depositAutomationBondCredit({ value: BOND });
    await first.escrow.connect(first.alice).setAutoEntry(true);
    await first.vault.setActiveRoundId(2);
    await second.vault.setActiveRoundId(2);

    expect(await second.escrow.automationBondCredit(first.alice.address)).to.equal(0n);
    expect(await second.escrow.isAutoEntryEnabled(first.alice.address, 2)).to.equal(false);
    await expect(
      second.escrow.connect(second.keeper).registerForRoundFor(first.alice.address, 2),
    ).to.be.revertedWithCustomError(second.escrow, "AutoEntryNotEnabled");

    await first.escrow.connect(first.bob).registerForRound(2, { value: BOND });
    await first.escrow.connect(first.keeper).registerForRoundFor(first.alice.address, 2);
    expect(await first.escrow.isRegistered(2, first.alice.address)).to.equal(true);
    expect(await first.escrow.isRegistered(2, first.bob.address)).to.equal(true);
    expect((await first.escrow.roundInfo(2))[0]).to.equal(2n);
    expect(await first.escrow.accountingInvariantHolds()).to.equal(true);
  });

  it("fails closed for opt-out or exhausted credit and permits only unreserved-credit withdrawal", async function () {
    const { alice, keeper, vault, escrow } = await ledgerFixture();
    await expect(escrow.connect(keeper).registerForRoundFor(alice.address, 1)).to.be.revertedWithCustomError(
      escrow,
      "AutoEntryNotEnabled",
    );
    await escrow.connect(alice).setAutoEntry(true);
    await vault.setActiveRoundId(2);
    await expect(escrow.connect(keeper).registerForRoundFor(alice.address, 2)).to.be.revertedWithCustomError(
      escrow,
      "InsufficientAutomationBondCredit",
    );

    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND + 7n });
    await escrow.connect(keeper).registerForRoundFor(alice.address, 2);
    expect(await escrow.automationBondCredit(alice.address)).to.equal(7n);
    await expect(escrow.connect(alice).withdrawAutomationBondCredit(8)).to.be.revertedWithCustomError(
      escrow,
      "InvalidCreditAmount",
    );
    await expect(escrow.connect(alice).withdrawAutomationBondCredit(7)).to.changeEtherBalances(
      [escrow, alice],
      [-7n, 7n],
    );
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
  });

  it("keeps refunds separate from automation credit across thirty rounds", async function () {
    this.timeout(120_000);
    const { alice, keeper, vault, escrow } = await ledgerFixture();
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND * 30n });
    await escrow.connect(alice).setAutoEntry(true);

    for (let roundId = 2n; roundId <= 31n; roundId += 1n) {
      await vault.setActiveRoundId(roundId);
      await escrow.connect(keeper).registerForRoundFor(alice.address, roundId);
      await vault.finalize(roundId, 0);
      expect(await escrow.accountingInvariantHolds()).to.equal(true);
    }

    expect(await escrow.automationBondCredit(alice.address)).to.equal(0n);
    expect(await escrow.totalRefundLiability()).to.equal(BOND * 30n);
    for (let roundId = 2n; roundId <= 31n; roundId += 1n) {
      await escrow.connect(alice).claimBondRefund(roundId);
    }
    expect(await escrow.automationBondCredit(alice.address)).to.equal(0n);
    expect(await escrow.accountedLiability()).to.equal(0n);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
  });

  it("conserves all native funding and liabilities through mixed multi-user transitions over thirty-five rounds", async function () {
    this.timeout(120_000);
    const { alice, bob, keeper, vault, escrow } = await ledgerFixture();
    const firstRound = 2n;
    const lastRound = 36n;
    const aliceFragment = 13n;
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND * 35n + aliceFragment });
    await escrow.connect(bob).depositAutomationBondCredit({ value: BOND * 18n });
    await escrow.connect(alice).setAutoEntry(true);
    await escrow.connect(bob).setAutoEntry(true);

    for (let roundId = firstRound; roundId <= lastRound; roundId += 1n) {
      await vault.setActiveRoundId(roundId);
      await escrow.connect(keeper).registerForRoundFor(alice.address, roundId);
      if (roundId % 2n === 0n) {
        await escrow.connect(keeper).registerForRoundFor(bob.address, roundId);
      } else {
        await escrow.connect(bob).registerForRound(roundId, { value: BOND });
      }

      if (roundId % 3n === 0n) {
        await vault.finalize(roundId, 0);
      } else if (roundId % 3n === 1n) {
        await vault.credit(roundId, 1, 2, keeper.address);
        await vault.finalize(roundId, 1);
      } else {
        await vault.credit(roundId, 1, 2, keeper.address);
        await vault.credit(roundId, 2, 2, keeper.address);
        await vault.finalize(roundId, 2);
      }

      expect(await escrow.isRegistered(roundId, alice.address)).to.equal(true);
      expect(await escrow.isRegistered(roundId, bob.address)).to.equal(true);
      expect(await escrow.isRegistered(roundId, keeper.address)).to.equal(false);
      expect(await escrow.accountingInvariantHolds()).to.equal(true);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.be.greaterThanOrEqual(
        await escrow.accountedLiability(),
      );
    }

    expect(await escrow.automationBondCredit(alice.address)).to.equal(aliceFragment);
    expect(await escrow.automationBondCredit(bob.address)).to.equal(0n);
    for (let roundId = firstRound; roundId <= lastRound; roundId += 1n) {
      await escrow.connect(alice).claimBondRefund(roundId);
      await escrow.connect(bob).claimBondRefund(roundId);
      expect(await escrow.accountingInvariantHolds()).to.equal(true);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.be.greaterThanOrEqual(
        await escrow.accountedLiability(),
      );
    }
    await escrow.connect(keeper).withdrawSettlementRewards();
    await escrow.connect(alice).withdrawAutomationBondCredit(aliceFragment);
    expect(await escrow.accountedLiability()).to.equal(0n);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
  });

  it("maintains escrow conservation under a seeded randomized thirty-two-round state machine", async function () {
    const { alice, bob, keeper, vault, escrow } = await ledgerFixture();
    const users = [alice, bob, keeper];
    let seed = 0x5eed1234;
    const next = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed;
    };

    for (let round = 1; round <= 32; round += 1) {
      await vault.setActiveRoundId(round);
      let registered = 0;
      for (const user of users) {
        if (next() % 3 === 0) continue;
        await escrow.connect(user).registerForRound(round, { value: BOND });
        registered += 1;
      }
      if (registered !== 0) {
        await vault.credit(round, 1, registered, keeper.address);
        if (next() % 2 === 0) {
          await vault.credit(round, 2, registered, keeper.address);
          await vault.finalize(round, 2);
        } else {
          await vault.finalize(round, 1);
        }
      } else {
        await vault.finalize(round, 0);
      }
      expect(await escrow.accountingInvariantHolds()).to.equal(true);
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.be.greaterThanOrEqual(
        await escrow.accountedLiability(),
      );
    }
  });

  it("preserves unchanged two-pass reward economics for delegated entries", async function () {
    const { alice, keeper, vault, escrow } = await ledgerFixture();
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND });
    await escrow.connect(alice).setAutoEntry(true);
    await vault.setActiveRoundId(2);
    await escrow.connect(keeper).registerForRoundFor(alice.address, 2);
    await vault.credit(2, 1, 1, keeper.address);
    await vault.credit(2, 2, 1, keeper.address);
    await vault.finalize(2, 2);

    expect(await escrow.settlementRewardCredit(keeper.address)).to.equal(REWARD * 2n);
    expect((await escrow.roundInfo(2))[6]).to.equal(BOND - REWARD * 2n);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
    await escrow.connect(keeper).withdrawSettlementRewards();
    await escrow.connect(alice).claimBondRefund(2);
    await expect(escrow.connect(keeper).withdrawSettlementRewards()).to.be.revertedWithCustomError(
      escrow,
      "NothingToWithdraw",
    );
    await expect(escrow.connect(alice).claimBondRefund(2)).to.be.revertedWithCustomError(escrow, "RefundUnavailable");
    expect(await escrow.accountedLiability()).to.equal(0n);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
  });

  it("refunds the unused allocation pass after delegated-entry reconciliation failure", async function () {
    const { alice, keeper, vault, escrow } = await ledgerFixture();
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND });
    await escrow.connect(alice).setAutoEntry(true);
    await vault.setActiveRoundId(2);
    await escrow.connect(keeper).registerForRoundFor(alice.address, 2);
    await vault.credit(2, 1, 1, keeper.address);
    await vault.finalize(2, 1);

    expect(await escrow.settlementRewardCredit(keeper.address)).to.equal(REWARD);
    expect((await escrow.roundInfo(2))[6]).to.equal(BOND - REWARD);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
  });

  it("rolls back credit reservation on wrong-round and closed-round delegated calls", async function () {
    const { alice, keeper, vault, escrow } = await productionFixture();
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND });
    await escrow.connect(alice).setAutoEntry(true);
    await closeEmptyRound(vault, 1n);

    await expect(escrow.connect(keeper).registerForRoundFor(alice.address, 3)).to.be.revertedWithCustomError(
      vault,
      "InvalidRound",
    );
    expect(await escrow.automationBondCredit(alice.address)).to.equal(BOND);
    await time.setNextBlockTimestamp((await vault.roundInfo(2))[1]);
    await expect(escrow.connect(keeper).registerForRoundFor(alice.address, 2)).to.be.revertedWithCustomError(
      vault,
      "RoundNotOpen",
    );
    expect(await escrow.automationBondCredit(alice.address)).to.equal(BOND);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
  });

  it("keeps round N settlement isolated while N+1 auto-entry, opt-out, and full withdrawal overlap", async function () {
    const { alice, keeper, underlying, asset, vault, escrow } = await productionFixture();
    await deposit(underlying, asset, vault, alice, 10n);
    await escrow.connect(alice).registerForRound(1, { value: BOND });
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND });
    await escrow.connect(alice).setAutoEntry(true);

    const roundOneAggregate = await closeAndFinalizeAggregate(vault, 1n);
    expect(roundOneAggregate).to.be.greaterThan(0n);
    expect((await vault.roundInfo(1))[2]).to.equal(3n);
    expect((await vault.roundInfo(2))[2]).to.equal(1n);

    await escrow.connect(keeper).registerForRoundFor(alice.address, 2);
    await escrow.connect(alice).setAutoEntry(false);
    expect(await escrow.isAutoEntryEnabled(alice.address, 2)).to.equal(true);
    expect(await escrow.isAutoEntryEnabled(alice.address, 3)).to.equal(false);
    await withdraw(vault, alice, 10n);

    await acceptTicket(vault, 1n);
    await vault.connect(keeper).processSelection(1, 1);
    const reconciliation = await fhevm.publicDecrypt([await vault.reconciliationHandle(1)]);
    await vault.finalizeSelectionReconciliation(
      1,
      reconciliation.abiEncodedClearValues,
      reconciliation.decryptionProof,
    );
    await vault.connect(keeper).processAllocation(1, 1);
    await vault.finalizeSettlement(1);

    expect((await vault.roundInfo(1))[2]).to.equal(10n);
    expect((await vault.roundInfo(2))[2]).to.equal(1n);
    expect(await vault.eligibilityStart(1, alice.address)).to.be.greaterThan(0n);
    expect(await vault.eligibilityStart(2, alice.address)).to.be.greaterThan(0n);
    expect(await vault.eligibilityStart(2, keeper.address)).to.equal(0n);
    const principal = await vault.principalOf(alice.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, principal, await vault.getAddress(), alice)).to.equal(0n);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.be.greaterThanOrEqual(
      await escrow.accountedLiability(),
    );
  });

  it("registers a zero-balance user through any keeper without changing identity or leaking weight", async function () {
    const { alice, keeper, vault, escrow } = await productionFixture();
    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND });
    await escrow.connect(alice).setAutoEntry(true);
    expect(await escrow.isAutoEntryEnabled(alice.address, 1)).to.equal(false);

    await closeEmptyRound(vault, 1n);
    const delegatedRegistration = await (await escrow.connect(keeper).registerForRoundFor(alice.address, 2)).wait();
    const registrationHcu = fhevm.computeTransactionHCU(delegatedRegistration!);
    expect(registrationHcu.globalHCU).to.be.lessThan(15_000_000);
    expect(registrationHcu.maxHCUDepth).to.be.lessThan(3_750_000);
    console.log(
      `LEOPOLD_AUTO_ENTRY_BENCHMARK ${JSON.stringify({
        delegatedRegistrationGas: delegatedRegistration!.gasUsed.toString(),
        delegatedRegistrationHcu: {
          total: registrationHcu.globalHCU,
          depth: registrationHcu.maxHCUDepth,
        },
      })}`,
    );
    expect(await vault.eligibilityStart(2, alice.address)).to.be.greaterThan(0n);
    expect(await vault.eligibilityStart(2, keeper.address)).to.equal(0n);
    await closeEmptyRound(vault, 2n);

    expect((await escrow.roundInfo(2))[0]).to.equal(1n);
    expect((await vault.roundInfo(2))[3]).to.equal(0n);
    await expect(escrow.connect(alice).claimBondRefund(2)).to.changeEtherBalances([escrow, alice], [-BOND, BOND]);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
  });

  it("keeps V2 internal principal and round-weight handles restricted to the participant", async function () {
    const { alice, bob, keeper, underlying, asset, vault, escrow } = await productionFixture();
    await deposit(underlying, asset, vault, alice, 10n);
    await escrow.connect(alice).registerForRound(1, { value: BOND });

    const principal = await vault.principalOf(alice.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, principal, await vault.getAddress(), alice)).to.equal(10n);
    for (const outsider of [bob, keeper]) {
      let denied = false;
      try {
        await fhevm.userDecryptEuint(FhevmType.euint64, principal, await vault.getAddress(), outsider);
      } catch {
        denied = true;
      }
      expect(denied).to.equal(true);
    }

    await closeAndFinalizeAggregate(vault, 1n);
    const weight = await vault.connect(alice).materializeMyRoundWeight.staticCall(1);
    await vault.connect(alice).materializeMyRoundWeight(1);
    expect(await fhevm.userDecryptEuint(FhevmType.euint128, weight, await vault.getAddress(), alice)).to.be.greaterThan(
      0n,
    );
    for (const outsider of [bob, keeper]) {
      let denied = false;
      try {
        await fhevm.userDecryptEuint(FhevmType.euint128, weight, await vault.getAddress(), outsider);
      } catch {
        denied = true;
      }
      expect(denied).to.equal(true);
    }
  });

  it("keeps accepted random tickets contract-only and never participant-decryptable", async function () {
    const source = await readFile(path.resolve("contracts/LeopoldVaultV2.sol"), "utf8");
    let cursor = 0;
    let occurrences = 0;
    while ((cursor = source.indexOf("round.acceptedTicket = ticket;", cursor)) !== -1) {
      const end = source.indexOf("emit TicketAccepted", cursor);
      expect(end).to.be.greaterThan(cursor);
      const assignmentBlock = source.slice(cursor, end);
      expect(assignmentBlock).to.include("FHE.allowThis(ticket)");
      expect(assignmentBlock).not.to.match(/FHE\.allow\(ticket,/u);
      occurrences += 1;
      cursor = end;
    }
    expect(occurrences).to.equal(2);
  });

  it("executes four-participant V2 selection and allocation within HCU ceilings", async function () {
    const { alice, bob, carol, dave, keeper, underlying, asset, vault, escrow } = await productionFixture();
    const participants = [alice, bob, carol, dave];
    for (const participant of participants) {
      await deposit(underlying, asset, vault, participant, 10n);
      await escrow.connect(participant).registerForRound(1, { value: BOND });
    }
    await closeAndFinalizeAggregate(vault, 1n);
    await acceptTicket(vault, 1n);
    const selection = await (await vault.connect(keeper).processSelection(1, 4)).wait();
    const selectionHcu = fhevm.computeTransactionHCU(selection!);
    expect(selectionHcu.globalHCU).to.be.lessThan(15_000_000);
    expect(selectionHcu.maxHCUDepth).to.be.lessThan(3_750_000);
    const reconciliation = await fhevm.publicDecrypt([await vault.reconciliationHandle(1)]);
    await vault.finalizeSelectionReconciliation(
      1,
      reconciliation.abiEncodedClearValues,
      reconciliation.decryptionProof,
    );
    const allocation = await (await vault.connect(keeper).processAllocation(1, 4)).wait();
    const allocationHcu = fhevm.computeTransactionHCU(allocation!);
    expect(allocationHcu.globalHCU).to.be.lessThan(15_000_000);
    expect(allocationHcu.maxHCUDepth).to.be.lessThan(3_750_000);
    await vault.finalizeSettlement(1);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
    console.log(
      `LEOPOLD_AUTO_ENTRY_FOUR_PARTICIPANT_HCU ${JSON.stringify({
        selection: { total: selectionHcu.globalHCU, depth: selectionHcu.maxHCUDepth },
        allocation: { total: allocationHcu.globalHCU, depth: allocationHcu.maxHCUDepth },
      })}`,
    );
  });

  it("keeps two independent V2 vaults at different lifecycle stages", async function () {
    const first = await productionFixture();
    const second = await productionFixture();
    await deposit(first.underlying, first.asset, first.vault, first.alice, 5n);
    await first.escrow.connect(first.alice).registerForRound(1, { value: BOND });
    await closeAndFinalizeAggregate(first.vault, 1n);
    await closeEmptyRound(second.vault, 1n);
    expect((await first.vault.roundInfo(1))[2]).to.equal(3n);
    expect((await second.vault.roundInfo(1))[2]).to.equal(10n);
    expect(await first.vault.getAddress()).not.to.equal(await second.vault.getAddress());
    expect(await first.escrow.VAULT()).to.equal(await first.vault.getAddress());
    expect(await second.escrow.VAULT()).to.equal(await second.vault.getAddress());
  });

  it("keeps V2 selection, reconciliation, allocation, rewards, and HCU unchanged", async function () {
    const { alice, keeper, underlying, asset, vault, escrow } = await productionFixture();
    await deposit(underlying, asset, vault, alice, 10n);
    expect(await escrow.autoEntryAccountCount()).to.equal(0n);
    expect(await vault.eligibilityStart(1, alice.address)).to.equal(0n);

    await escrow.connect(alice).depositAutomationBondCredit({ value: BOND });
    await escrow.connect(alice).setAutoEntry(true);
    await closeEmptyRound(vault, 1n);
    await escrow.connect(keeper).registerForRoundFor(alice.address, 2);
    expect(await closeAndFinalizeAggregate(vault, 2n)).to.be.greaterThan(0n);
    await acceptTicket(vault, 2n);

    await expect(vault.connect(keeper).processSelection(2, 5)).to.be.revertedWithCustomError(vault, "InvalidChunkSize");
    const selection = await (await vault.connect(keeper).processSelection(2, 1)).wait();
    const selectionHcu = fhevm.computeTransactionHCU(selection!);
    expect(selectionHcu.globalHCU).to.be.lessThan(15_000_000);
    expect(selectionHcu.maxHCUDepth).to.be.lessThan(3_750_000);
    const reconciliationHandle = await vault.reconciliationHandle(2);
    const reconciliationProof = await fhevm.publicDecrypt([reconciliationHandle]);
    await vault.finalizeSelectionReconciliation(
      2,
      reconciliationProof.abiEncodedClearValues,
      reconciliationProof.decryptionProof,
    );
    await expect(vault.connect(keeper).processAllocation(2, 5)).to.be.revertedWithCustomError(
      vault,
      "InvalidChunkSize",
    );
    const allocation = await (await vault.connect(keeper).processAllocation(2, 1)).wait();
    const allocationHcu = fhevm.computeTransactionHCU(allocation!);
    expect(allocationHcu.globalHCU).to.be.lessThan(15_000_000);
    expect(allocationHcu.maxHCUDepth).to.be.lessThan(3_750_000);
    await vault.finalizeSettlement(2);

    expect(await escrow.settlementRewardCredit(keeper.address)).to.equal(REWARD * 2n);
    expect((await escrow.roundInfo(2))[6]).to.equal(BOND - REWARD * 2n);
    expect(await escrow.accountingInvariantHolds()).to.equal(true);
    console.log(
      `LEOPOLD_AUTO_ENTRY_SETTLEMENT_HCU ${JSON.stringify({
        selection: { total: selectionHcu.globalHCU, depth: selectionHcu.maxHCUDepth },
        allocation: { total: allocationHcu.globalHCU, depth: allocationHcu.maxHCUDepth },
      })}`,
    );
  });
});
