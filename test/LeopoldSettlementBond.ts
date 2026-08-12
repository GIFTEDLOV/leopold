import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  LeopoldSettlementBondEscrow,
  LeopoldVault,
  MockLeopoldAsset,
  MockLeopoldUnderlying,
  MockSettlementBondVault,
} from "../types";

const BOND = ethers.parseEther("0.001");
const REWARD = ethers.parseEther("0.0002");
const DURATION = 3_600;

type State = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  progressor: HardhatEthersSigner;
  underlying: MockLeopoldUnderlying;
  asset: MockLeopoldAsset;
  vault: LeopoldVault;
  escrow: LeopoldSettlementBondEscrow;
};

async function fixture(vaultId = 1, assetState?: State): Promise<State> {
  const [deployer, alice, bob, progressor] = await ethers.getSigners();
  const underlying =
    assetState?.underlying ??
    ((await (await ethers.getContractFactory("MockLeopoldUnderlying")).deploy()) as MockLeopoldUnderlying);
  const asset =
    assetState?.asset ??
    ((await (
      await ethers.getContractFactory("MockLeopoldAsset")
    ).deploy(await underlying.getAddress())) as MockLeopoldAsset);
  const vault = (await (
    await ethers.getContractFactory("LeopoldVault")
  ).deploy(
    vaultId,
    vaultId - 1,
    ethers.encodeBytes32String(["Daily", "Weekly", "Monthly", "Boost"][vaultId - 1]),
    DURATION,
    await asset.getAddress(),
    await time.latest(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    BOND,
    REWARD,
  )) as LeopoldVault;
  const escrow = (await ethers.getContractAt(
    "LeopoldSettlementBondEscrow",
    await vault.SETTLEMENT_BOND_ESCROW(),
  )) as LeopoldSettlementBondEscrow;
  return { deployer, alice, bob, progressor, underlying, asset, vault, escrow };
}

async function deposit(state: State, account: HardhatEthersSigner, amount: bigint) {
  await state.underlying.mint(account.address, amount);
  await state.underlying.connect(account).approve(await state.asset.getAddress(), amount);
  await state.asset.connect(account).wrap(account.address, amount);
  const encrypted = await fhevm
    .createEncryptedInput(await state.asset.getAddress(), account.address)
    .add64(amount)
    .encrypt();
  return state.asset
    .connect(account)
    [
      "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
    ](await state.vault.getAddress(), encrypted.handles[0], encrypted.inputProof, "0x");
}

async function withdraw(state: State, account: HardhatEthersSigner, amount: bigint) {
  const encrypted = await fhevm
    .createEncryptedInput(await state.vault.getAddress(), account.address)
    .add64(amount)
    .encrypt();
  return state.vault.connect(account).withdraw(encrypted.handles[0], encrypted.inputProof);
}

async function enter(state: State, account: HardhatEthersSigner, roundId = 1n, value = BOND) {
  return state.escrow.connect(account).registerForRound(roundId, { value });
}

async function closeAndFinalizeAggregate(state: State, roundId: bigint): Promise<bigint> {
  await time.increaseTo((await state.vault.roundInfo(roundId))[1]);
  await state.vault.closeRound();
  const handle = await state.vault.aggregateTwabHandle(roundId);
  const result = await fhevm.publicDecrypt([handle]);
  const clear = result.clearValues[handle as `0x${string}`] as bigint;
  await state.vault.finalizeAggregate(roundId, result.abiEncodedClearValues, result.decryptionProof);
  return clear;
}

async function acceptTicket(state: State, roundId: bigint): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await state.vault.generateRandomCandidate(roundId);
    if ((await state.vault.roundInfo(roundId))[2] === 7n) return;
    const handle = await state.vault.candidateValidityHandle(roundId);
    const result = await fhevm.publicDecrypt([handle]);
    await state.vault.finalizeCandidateValidity(roundId, result.abiEncodedClearValues, result.decryptionProof);
    if ((await state.vault.roundInfo(roundId))[2] === 7n) return;
  }
  throw new Error("mock RNG unexpectedly rejected five candidates");
}

async function finalizeReconciliation(state: State, roundId: bigint) {
  const handle = await state.vault.reconciliationHandle(roundId);
  const result = await fhevm.publicDecrypt([handle]);
  expect(result.clearValues[handle as `0x${string}`]).to.equal(true);
  return (
    await state.vault.finalizeSelectionReconciliation(roundId, result.abiEncodedClearValues, result.decryptionProof)
  ).wait();
}

async function materializedWeight(state: State, account: HardhatEthersSigner, roundId: bigint): Promise<bigint> {
  const receipt = await (await state.vault.connect(account).materializeMyRoundWeight(roundId)).wait();
  for (const log of receipt!.logs) {
    try {
      const parsed = state.vault.interface.parseLog(log);
      if (parsed?.name === "RoundWeightMaterialized") {
        return fhevm.userDecryptEuint(FhevmType.euint128, parsed.args.handle, await state.vault.getAddress(), account);
      }
    } catch {
      // Ignore logs emitted by other contracts in the transaction.
    }
  }
  throw new Error("missing weight event");
}

describe("Leopold round-scoped settlement bonds", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("enforces exact, one-time, open-current-round registration", async function () {
    const state = await fixture();
    await expect(enter(state, state.alice, 1n, BOND - 1n)).to.be.revertedWithCustomError(
      state.escrow,
      "InvalidBondAmount",
    );
    await expect(enter(state, state.alice, 1n, BOND + 1n)).to.be.revertedWithCustomError(
      state.escrow,
      "InvalidBondAmount",
    );
    await expect(enter(state, state.alice, 2n)).to.be.revertedWithCustomError(state.vault, "InvalidRound");
    await expect(enter(state, state.alice)).to.emit(state.escrow, "RoundBondPosted");
    await expect(enter(state, state.alice)).to.be.revertedWithCustomError(state.escrow, "AlreadyRegistered");
    const closesAt = (await state.vault.roundInfo(1))[1];
    await time.setNextBlockTimestamp(closesAt);
    await expect(enter(state, state.bob)).to.be.revertedWithCustomError(state.vault, "RoundNotOpen");
    expect((await state.escrow.roundInfo(1))[3]).to.equal(BOND);
  });

  it("starts exact prize TWAB at registration and preserves earned weight through withdrawal", async function () {
    const state = await fixture();
    await deposit(state, state.alice, 10n);
    const registration = await (await enter(state, state.alice)).wait();
    const registeredAt = BigInt((await ethers.provider.getBlock(registration!.blockNumber))!.timestamp);
    await time.increase(20);
    const secondDeposit = await (await deposit(state, state.alice, 5n)).wait();
    const secondAt = BigInt((await ethers.provider.getBlock(secondDeposit!.blockNumber))!.timestamp);
    await time.increase(30);
    const withdrawal = await (await withdraw(state, state.alice, 7n)).wait();
    const withdrawalAt = BigInt((await ethers.provider.getBlock(withdrawal!.blockNumber))!.timestamp);
    const closesAt = (await state.vault.roundInfo(1))[1];
    const aggregate = await closeAndFinalizeAggregate(state, 1n);
    const expected = 10n * (secondAt - registeredAt) + 15n * (withdrawalAt - secondAt) + 8n * (closesAt - withdrawalAt);
    expect(aggregate).to.equal(expected);
    expect(await materializedWeight(state, state.alice, 1n)).to.equal(expected);
  });

  it("handles register-before-deposit and a bonded zero-weight empty round exactly", async function () {
    const active = await fixture();
    const registered = await (await enter(active, active.alice)).wait();
    const registeredAt = BigInt((await ethers.provider.getBlock(registered!.blockNumber))!.timestamp);
    await time.increase(12);
    const saved = await (await deposit(active, active.alice, 4n)).wait();
    const savedAt = BigInt((await ethers.provider.getBlock(saved!.blockNumber))!.timestamp);
    const closesAt = (await active.vault.roundInfo(1))[1];
    expect(await closeAndFinalizeAggregate(active, 1n)).to.equal(4n * (closesAt - savedAt));
    expect(savedAt).to.be.greaterThan(registeredAt);

    const empty = await fixture();
    await enter(empty, empty.alice);
    expect(await closeAndFinalizeAggregate(empty, 1n)).to.equal(0n);
    await empty.vault.settleEmptyRound(1);
    expect((await empty.escrow.roundInfo(1))[7]).to.equal(true);
    await expect(empty.escrow.connect(empty.alice).claimBondRefund(1)).to.changeEtherBalances(
      [empty.escrow, empty.alice],
      [-BOND, BOND],
    );
  });

  it("funds pull rewards and deterministic refunds only from the bond", async function () {
    const state = await fixture();
    await deposit(state, state.alice, 10n);
    await enter(state, state.alice);
    await closeAndFinalizeAggregate(state, 1n);
    await acceptTicket(state, 1n);

    const actor = await (
      await ethers.getContractFactory("MockSettlementBondActor")
    ).deploy(await state.escrow.getAddress());
    await actor.progressSelection(await state.vault.getAddress(), 1, 1);
    await finalizeReconciliation(state, 1n);
    await actor.progressAllocation(await state.vault.getAddress(), 1, 1);
    await state.vault.finalizeSettlement(1);

    expect(await state.escrow.settlementRewardCredit(await actor.getAddress())).to.equal(REWARD * 2n);
    expect(await state.escrow.accountedLiability()).to.equal(BOND);
    const round = await state.escrow.roundInfo(1);
    expect(round[4]).to.equal(REWARD * 2n);
    expect(round[5]).to.equal(BOND - REWARD * 2n);

    await actor.configure(true, false);
    await expect(actor.withdrawRewards()).to.be.revertedWithCustomError(state.escrow, "NativeTransferFailed");
    expect(await state.escrow.settlementRewardCredit(await actor.getAddress())).to.equal(REWARD * 2n);
    await actor.configure(false, true);
    await expect(actor.withdrawRewards()).to.changeEtherBalances([state.escrow, actor], [-REWARD * 2n, REWARD * 2n]);
    await expect(actor.withdrawRewards()).to.be.revertedWithCustomError(state.escrow, "NothingToWithdraw");

    const refund = BOND - REWARD * 2n;
    await expect(state.escrow.connect(state.alice).claimBondRefund(1)).to.changeEtherBalances(
      [state.escrow, state.alice],
      [-refund, refund],
    );
    await expect(state.escrow.connect(state.alice).claimBondRefund(1)).to.be.revertedWithCustomError(
      state.escrow,
      "RefundUnavailable",
    );
    expect(await state.escrow.accountedLiability()).to.equal(0n);
    expect(await ethers.provider.getBalance(await state.escrow.getAddress())).to.equal(0n);
  });

  it("rejects early refunds, direct ETH and cross-vault/cross-round reuse", async function () {
    const first = await fixture();
    const second = await fixture(2, first);
    await enter(first, first.alice);
    await expect(first.escrow.connect(first.alice).claimBondRefund(1)).to.be.revertedWithCustomError(
      first.escrow,
      "RefundUnavailable",
    );
    await expect(
      first.alice.sendTransaction({ to: await first.escrow.getAddress(), value: 1n }),
    ).to.be.revertedWithCustomError(first.escrow, "DirectNativeTransferRejected");
    await expect(second.escrow.connect(first.alice).claimBondRefund(1)).to.be.revertedWithCustomError(
      second.escrow,
      "RefundUnavailable",
    );
    expect(await second.escrow.isRegistered(1, first.alice.address)).to.equal(false);
    expect(await first.escrow.isRegistered(2, first.alice.address)).to.equal(false);

    const forced = await (await ethers.getContractFactory("MockForceNative")).deploy({ value: ethers.parseEther("1") });
    const liabilityBefore = await first.escrow.accountedLiability();
    await forced.force(await first.escrow.getAddress());
    expect(await first.escrow.accountedLiability()).to.equal(liabilityBefore);
    expect(await ethers.provider.getBalance(await first.escrow.getAddress())).to.equal(BOND + ethers.parseEther("1"));
  });

  it("removes historical Sybils from all future settlement work", async function () {
    this.timeout(180_000);
    const state = await fixture();
    for (let index = 0; index < 100; index += 1) {
      const attacker = ethers.Wallet.createRandom().connect(ethers.provider);
      await ethers.provider.send("hardhat_setBalance", [
        attacker.address,
        ethers.toBeHex(BOND + ethers.parseEther("1")),
      ]);
      await state.escrow.connect(attacker).registerForRound(1, { value: BOND });
    }
    expect((await state.escrow.roundInfo(1))[0]).to.equal(100n);
    expect(await closeAndFinalizeAggregate(state, 1n)).to.equal(0n);
    await state.vault.settleEmptyRound(1);

    await deposit(state, state.alice, 3n);
    await enter(state, state.alice, 2n);
    expect(await state.escrow.isRegistered(2, state.alice.address)).to.equal(true);
    expect((await state.escrow.roundInfo(2))[0]).to.equal(1n);
    expect(await closeAndFinalizeAggregate(state, 2n)).to.be.greaterThan(0n);
    expect((await state.vault.roundInfo(2))[5]).to.equal(1n);
    await acceptTicket(state, 2n);
    await state.vault.processSelection(2, 4);
    await finalizeReconciliation(state, 2n);
    await state.vault.processAllocation(2, 4);
    await state.vault.finalizeSettlement(2);
    expect((await state.vault.roundInfo(2))[6]).to.equal(1n);
    expect((await state.vault.roundInfo(2))[7]).to.equal(1n);
  });

  it("keeps bond liabilities algebraically solvent through partial progression", async function () {
    const state = await fixture();
    await deposit(state, state.alice, 2n);
    await deposit(state, state.bob, 1n);
    await enter(state, state.alice);
    await enter(state, state.bob);
    expect(await state.escrow.totalDeposited()).to.equal(BOND * 2n);
    expect(await state.escrow.accountedLiability()).to.equal(BOND * 2n);
    await closeAndFinalizeAggregate(state, 1n);
    await acceptTicket(state, 1n);
    await state.vault.connect(state.progressor).processSelection(1, 1);
    expect(await state.escrow.totalUnresolvedLiability()).to.equal(BOND * 2n - REWARD);
    expect(await state.escrow.totalRewardLiability()).to.equal(REWARD);
    expect(await state.escrow.accountedLiability()).to.equal(BOND * 2n);
    await state.vault.connect(state.progressor).processSelection(1, 1);
    await finalizeReconciliation(state, 1n);
    await state.vault.connect(state.progressor).processAllocation(1, 2);
    await state.vault.finalizeSettlement(1);
    expect(await state.escrow.totalUnresolvedLiability()).to.equal(0n);
    expect(await state.escrow.accountedLiability()).to.equal(BOND * 2n);
    expect((await state.escrow.totalRewardLiability()) + (await state.escrow.totalRefundLiability())).to.equal(
      BOND * 2n,
    );
  });

  it("refunds the unused allocation pass after authenticated reconciliation failure", async function () {
    const [, participant, progressor] = await ethers.getSigners();
    const vaultAuthority = (await (
      await ethers.getContractFactory("MockSettlementBondVault")
    ).deploy()) as MockSettlementBondVault;
    const escrow = (await (
      await ethers.getContractFactory("LeopoldSettlementBondEscrow")
    ).deploy(await vaultAuthority.getAddress(), BOND, REWARD)) as LeopoldSettlementBondEscrow;
    await vaultAuthority.setEscrow(await escrow.getAddress());
    await escrow.connect(participant).registerForRound(42, { value: BOND });
    await vaultAuthority.credit(42, 1, 1, progressor.address);
    await vaultAuthority.finalize(42, 1);
    const round = await escrow.roundInfo(42);
    expect(round[1]).to.equal(1n);
    expect(round[2]).to.equal(0n);
    expect(round[6]).to.equal(BOND - REWARD);
    expect(round[7]).to.equal(true);
    await expect(escrow.connect(participant).claimBondRefund(42)).to.changeEtherBalances(
      [escrow, participant],
      [-(BOND - REWARD), BOND - REWARD],
    );
    expect(await escrow.accountedLiability()).to.equal(REWARD);
  });

  it("benchmarks the final one- and four-participant bonded settlement paths", async function () {
    const single = await fixture();
    await deposit(single, single.alice, 1n);
    const singleRegistration = await (await enter(single, single.alice)).wait();
    await closeAndFinalizeAggregate(single, 1n);
    await acceptTicket(single, 1n);
    const singleSelection = await (await single.vault.processSelection(1, 1)).wait();
    await finalizeReconciliation(single, 1n);
    const singleAllocation = await (await single.vault.processAllocation(1, 1)).wait();
    await single.vault.finalizeSettlement(1);

    const state = await fixture();
    const participants = [state.deployer, state.alice, state.bob, state.progressor];
    let registrationGas = 0n;
    for (const participant of participants) {
      await deposit(state, participant, 1n);
      const registration = await (await enter(state, participant)).wait();
      registrationGas += registration!.gasUsed;
      await state.vault.connect(participant).setAutoSavePreference(1);
    }
    await closeAndFinalizeAggregate(state, 1n);
    await acceptTicket(state, 1n);
    const selection = await (await state.vault.processSelection(1, 4)).wait();
    const selectionHcu = fhevm.computeTransactionHCU(selection!);
    expect(selectionHcu.globalHCU).to.be.lessThan(15_000_000);
    expect(selectionHcu.maxHCUDepth).to.be.lessThan(3_750_000);
    const reconciliation = await finalizeReconciliation(state, 1n);
    const allocation = await (await state.vault.processAllocation(1, 4)).wait();
    const allocationHcu = fhevm.computeTransactionHCU(allocation!);
    expect(allocationHcu.globalHCU).to.be.lessThan(15_000_000);
    expect(allocationHcu.maxHCUDepth).to.be.lessThan(3_750_000);
    const finalization = await (await state.vault.finalizeSettlement(1)).wait();

    console.log(
      `LEOPOLD_BONDED_SETTLEMENT_BENCHMARK ${JSON.stringify({
        participants: 4,
        singleRegistrationGas: singleRegistration!.gasUsed.toString(),
        singleSelectionGas: singleSelection!.gasUsed.toString(),
        singleAllocationGas: singleAllocation!.gasUsed.toString(),
        averageRegistrationGas: (registrationGas / 4n).toString(),
        selectionGas: selection!.gasUsed.toString(),
        selectionGasPerParticipant: (selection!.gasUsed / 4n).toString(),
        selectionHcu: { total: selectionHcu.globalHCU, depth: selectionHcu.maxHCUDepth },
        allocationGas: allocation!.gasUsed.toString(),
        allocationGasPerParticipant: (allocation!.gasUsed / 4n).toString(),
        allocationHcu: { total: allocationHcu.globalHCU, depth: allocationHcu.maxHCUDepth },
        reconciliationGas: reconciliation!.gasUsed.toString(),
        finalizationGas: finalization!.gasUsed.toString(),
      })}`,
    );
  });
});
