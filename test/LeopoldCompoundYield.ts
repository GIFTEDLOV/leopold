import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { LeopoldVault, MockCompoundComet, MockLeopoldAsset, MockLeopoldUnderlying } from "../types";

type State = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  underlying: MockLeopoldUnderlying;
  asset: MockLeopoldAsset;
  comet: MockCompoundComet;
  vault: LeopoldVault;
};

async function fixture(): Promise<State> {
  const [deployer, alice] = await ethers.getSigners();
  const underlying = (await (
    await ethers.getContractFactory("MockLeopoldUnderlying")
  ).deploy()) as MockLeopoldUnderlying;
  const asset = (await (
    await ethers.getContractFactory("MockLeopoldAsset")
  ).deploy(await underlying.getAddress())) as MockLeopoldAsset;
  const comet = (await (
    await ethers.getContractFactory("MockCompoundComet")
  ).deploy(await underlying.getAddress())) as MockCompoundComet;
  const vault = (await (
    await ethers.getContractFactory("LeopoldVault")
  ).deploy(
    1,
    0,
    ethers.encodeBytes32String("Daily"),
    86_400,
    await asset.getAddress(),
    await time.latest(),
    await comet.getAddress(),
    deployer.address,
    60,
    ethers.parseEther("0.001"),
    ethers.parseEther("0.0002"),
  )) as LeopoldVault;
  return { deployer, alice, underlying, asset, comet, vault };
}

async function deposit(state: State, amount: bigint): Promise<void> {
  await state.underlying.mint(state.alice.address, amount);
  await state.underlying.connect(state.alice).approve(await state.asset.getAddress(), amount);
  await state.asset.connect(state.alice).wrap(state.alice.address, amount);
  const encrypted = await fhevm
    .createEncryptedInput(await state.asset.getAddress(), state.alice.address)
    .add64(amount)
    .encrypt();
  await state.asset
    .connect(state.alice)
    [
      "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
    ](await state.vault.getAddress(), encrypted.handles[0], encrypted.inputProof, "0x");
}

async function enterCurrentRound(state: State): Promise<void> {
  const escrow = await ethers.getContractAt("LeopoldSettlementBondEscrow", await state.vault.SETTLEMENT_BOND_ESCROW());
  await escrow.connect(state.alice).registerForRound(await state.vault.activeRoundId(), {
    value: ethers.parseEther("0.001"),
  });
}

async function vaultEventArg(
  state: State,
  transaction: Promise<{ wait(): Promise<{ logs: readonly unknown[] } | null> }>,
  eventName: string,
  argument: string,
): Promise<string> {
  const receipt = await (await transaction).wait();
  for (const log of receipt!.logs) {
    try {
      const parsed = state.vault.interface.parseLog(log as Parameters<typeof state.vault.interface.parseLog>[0]);
      if (parsed?.name === eventName) return parsed.args[argument] as string;
    } catch {
      // Ignore logs emitted by the asset, adapter, or escrow.
    }
  }
  throw new Error(`missing ${eventName} event`);
}

async function deployEpoch(state: State): Promise<void> {
  await state.vault.openStrategyEpoch(1);
  await time.increase(60);
  const requestId = await vaultEventArg(
    state,
    state.vault.requestStrategyAmount(1),
    "StrategyUnwrapRequested",
    "requestId",
  );
  const handle = await state.asset.unwrapAmount(requestId);
  const proof = await fhevm.publicDecrypt([handle]);
  const amount = proof.clearValues[handle as `0x${string}`] as bigint;
  await state.vault.finalizeStrategyDeployment(1, amount, proof.decryptionProof);
}

async function withdraw(state: State, amount: bigint): Promise<void> {
  const encrypted = await fhevm
    .createEncryptedInput(await state.vault.getAddress(), state.alice.address)
    .add64(amount)
    .encrypt();
  await state.vault.connect(state.alice).withdraw(encrypted.handles[0], encrypted.inputProof);
}

describe("Leopold direct Compound strategy", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("deploys only objective excess above the 75% buffer and harvests genuine surplus once", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await enterCurrentRound(state);
    await deployEpoch(state);
    const strategyAddress = await state.vault.STRATEGY();
    const strategy = await ethers.getContractAt("LeopoldCompoundAdapter", strategyAddress);
    expect(await strategy.deployedPrincipalBasis()).to.equal(25n);
    expect(await state.comet.balanceOf(strategyAddress)).to.equal(25n);
    expect(await state.underlying.allowance(strategyAddress, await state.comet.getAddress())).to.equal(0n);

    await state.underlying.mint(state.deployer.address, 10n);
    await state.underlying.approve(await state.comet.getAddress(), 10n);
    await state.comet.addYield(strategyAddress, 10n);
    await expect(state.vault.harvestStrategyYield()).to.emit(state.vault, "StrategyYieldHarvested").withArgs(10n);
    expect(await strategy.deployedPrincipalBasis()).to.equal(25n);
    expect(await state.vault.publicUncommittedYield()).to.equal(10n);
    await expect(state.vault.harvestStrategyYield()).not.to.emit(state.vault, "StrategyYieldHarvested");
    expect(await state.vault.publicUncommittedYield()).to.equal(10n);
  });

  it("records strategy loss honestly and returns remaining principal only to its vault", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await deployEpoch(state);
    const strategyAddress = await state.vault.STRATEGY();
    await state.comet.imposeLoss(strategyAddress, 5n);
    const strategy = await ethers.getContractAt("LeopoldCompoundAdapter", strategyAddress);
    expect(await strategy.currentShortfall()).to.equal(5n);
    await state.vault.setStrategyPaused(true);
    await expect(state.vault.emergencyUnwindStrategy())
      .to.emit(state.vault, "StrategyEmergencyUnwound")
      .withArgs(20n, 5n);
    expect(await strategy.deployedPrincipalBasis()).to.equal(0n);
    expect(await state.comet.balanceOf(strategyAddress)).to.equal(0n);
  });

  it("replenishes the objective aggregate buffer without a withdrawal queue", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await deployEpoch(state);
    await withdraw(state, 50n);
    await state.vault.openStrategyEpoch(2);
    await time.increase(60);
    const handle = await vaultEventArg(
      state,
      state.vault.requestStrategyAmount(2),
      "StrategyAmountRequested",
      "handle",
    );
    const proof = await fhevm.publicDecrypt([handle]);
    expect(proof.clearValues[handle as `0x${string}`]).to.equal(12n);
    await state.vault.finalizeStrategyReplenishment(2, proof.abiEncodedClearValues, proof.decryptionProof);
    const strategy = await ethers.getContractAt("LeopoldCompoundAdapter", await state.vault.STRATEGY());
    expect(await strategy.deployedPrincipalBasis()).to.equal(13n);
    await expect(state.vault.finalizeStrategyReplenishment(2, proof.abiEncodedClearValues, proof.decryptionProof)).to.be
      .reverted;
  });

  it("rejects stale epoch progression and deployment while paused", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await state.vault.openStrategyEpoch(1);
    await expect(state.vault.requestStrategyAmount(1)).to.be.revertedWithCustomError(
      state.vault,
      "StrategyEpochNotReady",
    );
    await state.vault.cancelAgingStrategyEpoch(1);
    await expect(state.vault.requestStrategyAmount(1)).to.be.revertedWithCustomError(
      state.vault,
      "StrategyEpochNotReady",
    );
    await state.vault.setStrategyPaused(true);
    await expect(state.vault.openStrategyEpoch(1)).to.be.revertedWithCustomError(state.vault, "StrategyPaused");
  });

  it("gives two vaults separate Compound accounts and prevents cross-vault basis subsidy", async function () {
    const state = await fixture();
    const weekly = (await (
      await ethers.getContractFactory("LeopoldVault")
    ).deploy(
      2,
      1,
      ethers.encodeBytes32String("Weekly"),
      604_800,
      await state.asset.getAddress(),
      await time.latest(),
      await state.comet.getAddress(),
      state.deployer.address,
      60,
      ethers.parseEther("0.001"),
      ethers.parseEther("0.0002"),
    )) as LeopoldVault;
    expect(await weekly.STRATEGY()).not.to.equal(await state.vault.STRATEGY());
    await deposit(state, 100n);
    await deployEpoch(state);
    const dailyStrategy = await ethers.getContractAt("LeopoldCompoundAdapter", await state.vault.STRATEGY());
    const weeklyStrategy = await ethers.getContractAt("LeopoldCompoundAdapter", await weekly.STRATEGY());
    expect(await dailyStrategy.deployedPrincipalBasis()).to.equal(25n);
    expect(await weeklyStrategy.deployedPrincipalBasis()).to.equal(0n);
  });

  it("fails closed when an external Comet-position transfer tries to masquerade as yield", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await deployEpoch(state);
    const strategyAddress = await state.vault.STRATEGY();
    const strategy = await ethers.getContractAt("LeopoldCompoundAdapter", strategyAddress);
    await state.underlying.mint(state.deployer.address, 5n);
    await state.underlying.approve(await state.comet.getAddress(), 5n);
    await state.comet.donatePosition(strategyAddress, 5n);
    expect(await strategy.positionIntegrity()).to.equal(false);
    await expect(state.vault.harvestStrategyYield()).to.be.revertedWithCustomError(
      strategy,
      "UnexpectedPositionMutation",
    );
  });

  it("fails closed if Comet governance changes the base-market identity", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await deployEpoch(state);
    const strategy = await ethers.getContractAt("LeopoldCompoundAdapter", await state.vault.STRATEGY());
    await state.comet.setMarketConfiguration(await state.underlying.getAddress(), 1_000_001);
    expect(await strategy.marketIntegrity()).to.equal(false);
    await expect(state.vault.harvestStrategyYield()).to.be.revertedWithCustomError(strategy, "InvalidConfiguration");
    await state.vault.setStrategyPaused(true);
    await expect(state.vault.emergencyUnwindStrategy()).to.emit(state.vault, "StrategyEmergencyUnwound");
  });

  it("keeps deposits and available withdrawals independent of aging and pending strategy epochs", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await state.vault.openStrategyEpoch(1);
    await deposit(state, 20n);
    await time.increase(60);
    const requestId = await vaultEventArg(
      state,
      state.vault.requestStrategyAmount(1),
      "StrategyUnwrapRequested",
      "requestId",
    );
    await deposit(state, 10n);
    const handle = await state.asset.unwrapAmount(requestId);
    const proof = await fhevm.publicDecrypt([handle]);
    expect(proof.clearValues[handle as `0x${string}`]).to.equal(30n);
    await state.vault.finalizeStrategyDeployment(1, 30n, proof.decryptionProof);
    const strategy = await ethers.getContractAt("LeopoldCompoundAdapter", await state.vault.STRATEGY());
    expect(await strategy.deployedPrincipalBasis()).to.equal(30n);
    await withdraw(state, 1n);
  });

  it("prevents a pre-pause deploy epoch from moving liquid principal after pause", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await state.vault.openStrategyEpoch(1);
    await state.vault.setStrategyPaused(true);
    await time.increase(60);
    await expect(state.vault.requestStrategyAmount(1)).to.be.revertedWithCustomError(state.vault, "StrategyPaused");
    await withdraw(state, 75n);
  });

  it("assigns yield at close execution and isolates later harvest and sponsorship from the settling round", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await deployEpoch(state);
    const strategyAddress = await state.vault.STRATEGY();
    await state.underlying.mint(state.deployer.address, 15n);
    await state.underlying.approve(await state.comet.getAddress(), 15n);
    await state.comet.addYield(strategyAddress, 10n);
    await time.increaseTo((await state.vault.roundInfo(1))[1]);
    await state.vault.harvestStrategyYield();
    await state.vault.closeRound();
    expect((await state.vault.roundInfo(1))[4]).to.equal(10n);
    await state.comet.addYield(strategyAddress, 5n);
    await state.vault.harvestStrategyYield();
    expect((await state.vault.roundInfo(1))[4]).to.equal(10n);
    expect(await state.vault.publicUncommittedYield()).to.equal(5n);
    await state.underlying.mint(state.deployer.address, 3n);
    await state.underlying.approve(await state.vault.getAddress(), 3n);
    await state.vault.contributeSponsor(2, 3n);
    expect((await state.vault.roundInfo(1))[4]).to.equal(10n);
  });

  it("keeps draw progress live through pause, shortfall and emergency unwind", async function () {
    const state = await fixture();
    await deposit(state, 100n);
    await enterCurrentRound(state);
    await deployEpoch(state);
    const strategyAddress = await state.vault.STRATEGY();
    await state.comet.imposeLoss(strategyAddress, 5n);
    await time.increaseTo((await state.vault.roundInfo(1))[1]);
    await state.vault.closeRound();
    const aggregateHandle = await state.vault.aggregateTwabHandle(1);
    const aggregateProof = await fhevm.publicDecrypt([aggregateHandle]);
    await state.vault.finalizeAggregate(1, aggregateProof.abiEncodedClearValues, aggregateProof.decryptionProof);
    await state.vault.setStrategyPaused(true);
    await state.vault.emergencyUnwindStrategy();
    await state.vault.generateRandomCandidate(1);
    expect([5n, 7n]).to.include((await state.vault.roundInfo(1))[2]);
  });

  it("rejects strategy public-proof replay across vaults and completed epochs", async function () {
    const state = await fixture();
    const weeklyVault = (await (
      await ethers.getContractFactory("LeopoldVault")
    ).deploy(
      2,
      1,
      ethers.encodeBytes32String("Weekly"),
      604_800,
      await state.asset.getAddress(),
      await time.latest(),
      await state.comet.getAddress(),
      state.deployer.address,
      60,
      ethers.parseEther("0.001"),
      ethers.parseEther("0.0002"),
    )) as LeopoldVault;
    const weekly: State = { ...state, vault: weeklyVault };
    await deposit(state, 100n);
    await deposit(weekly, 100n);
    await deployEpoch(state);
    await deployEpoch(weekly);
    await withdraw(state, 50n);
    await withdraw(weekly, 50n);
    await state.vault.openStrategyEpoch(2);
    await weekly.vault.openStrategyEpoch(2);
    await time.increase(60);
    const handle = await vaultEventArg(
      state,
      state.vault.requestStrategyAmount(2),
      "StrategyAmountRequested",
      "handle",
    );
    await weekly.vault.requestStrategyAmount(2);
    const proof = await fhevm.publicDecrypt([handle]);
    await expect(weekly.vault.finalizeStrategyReplenishment(2, proof.abiEncodedClearValues, proof.decryptionProof)).to
      .be.reverted;
    await state.vault.finalizeStrategyReplenishment(2, proof.abiEncodedClearValues, proof.decryptionProof);
    await expect(state.vault.finalizeStrategyReplenishment(2, proof.abiEncodedClearValues, proof.decryptionProof)).to.be
      .reverted;
  });
});
