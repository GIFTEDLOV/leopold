import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { ContractTransactionReceipt, ContractTransactionResponse } from "ethers";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { LeopoldHistoricalPrefixTreeSpike } from "../../types";

async function deploy(depth: number): Promise<{
  vault: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  keeper: HardhatEthersSigner;
  tree: LeopoldHistoricalPrefixTreeSpike;
}> {
  const [vault, alice, bob, keeper] = await ethers.getSigners();
  const tree = (await (
    await ethers.getContractFactory("LeopoldHistoricalPrefixTreeSpike")
  ).deploy(vault.address, depth)) as LeopoldHistoricalPrefixTreeSpike;
  return { vault, alice, bob, keeper, tree };
}

async function update(
  tree: LeopoldHistoricalPrefixTreeSpike,
  vault: HardhatEthersSigner,
  account: string,
  amount: bigint,
  increase: boolean,
) {
  const input = await fhevm
    .createEncryptedInput(await tree.getAddress(), vault.address)
    .add64(amount)
    .encrypt();
  return tree.updateBalance(account, input.handles[0], input.inputProof, increase);
}

async function closeAndFixTicket(
  tree: LeopoldHistoricalPrefixTreeSpike,
  vault: HardhatEthersSigner,
  roundId: bigint,
  opensAt: bigint,
  closesAt: bigint,
  ticket: bigint,
  prize: bigint,
) {
  await tree.requestRoundTotal(roundId, opensAt, closesAt);
  const aggregateHandle = await tree.aggregateTwabHandle(roundId);
  const aggregate = await fhevm.publicDecrypt([aggregateHandle]);
  const total = aggregate.clearValues[aggregateHandle as `0x${string}`] as bigint;
  expect(ticket).to.be.lessThan(total);
  const input = fhevm.createEncryptedInput(await tree.getAddress(), vault.address);
  input.add128(ticket).add64(prize);
  const encrypted = await input.encrypt();
  await tree.finalizeRoundTicket(
    roundId,
    total,
    aggregate.abiEncodedClearValues,
    aggregate.decryptionProof,
    encrypted.handles[0],
    encrypted.inputProof,
    encrypted.handles[1],
    encrypted.inputProof,
  );
  return total;
}

async function decrypt64(tree: LeopoldHistoricalPrefixTreeSpike, account: HardhatEthersSigner, handle: string) {
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, await tree.getAddress(), account);
}

async function expectRejected(promise: Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await promise;
  } catch {
    rejected = true;
  }
  expect(rejected).to.equal(true);
}

describe("Leopold historical prefix-tree settlement spike", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("materializes exact winner/loser payouts lazily after later-round mutations", async function () {
    const { vault, alice, bob, keeper, tree } = await deploy(10);
    await tree.register(alice.address, 0);
    await tree.register(bob.address, 7); // explicit slot gap
    const opensAt = BigInt(await time.latest());
    const aliceDeposit = await (await update(tree, vault, alice.address, 10n, true)).wait();
    await time.increase(10);
    const bobDeposit = await (await update(tree, vault, bob.address, 20n, true)).wait();
    await time.increase(10);
    const aliceWithdrawal = await (await update(tree, vault, alice.address, 5n, false)).wait();
    const closesAt = BigInt(await time.latest()) + 10n;
    await time.increaseTo(closesAt);

    // Round-2 mutation happens before either Round-1 result is materialized.
    await time.increase(5);
    await update(tree, vault, bob.address, 3n, false);
    const total = await closeAndFixTicket(tree, vault, 1n, opensAt, closesAt, 0n, 77n);
    const aliceDepositAt = BigInt((await ethers.provider.getBlock(aliceDeposit!.blockNumber))!.timestamp);
    const bobDepositAt = BigInt((await ethers.provider.getBlock(bobDeposit!.blockNumber))!.timestamp);
    const aliceWithdrawalAt = BigInt((await ethers.provider.getBlock(aliceWithdrawal!.blockNumber))!.timestamp);
    const naiveAlice = 10n * (aliceWithdrawalAt - aliceDepositAt) + 5n * (closesAt - aliceWithdrawalAt);
    const naiveBob = 20n * (closesAt - bobDepositAt);
    expect(total).to.equal(naiveAlice + naiveBob);

    await expect(tree.connect(keeper).materializePrivateResultFor(1, alice.address))
      .to.emit(tree, "PrivateResultMaterialized")
      .withArgs(1n, alice.address);
    await tree.connect(keeper).materializePrivateResultFor(1, bob.address);
    expect(await decrypt64(tree, alice, await tree.privatePayoutOf(1, alice.address))).to.equal(77n);
    expect(await decrypt64(tree, bob, await tree.privatePayoutOf(1, bob.address))).to.equal(0n);
    await expect(tree.materializePrivateResultFor(1, alice.address)).to.be.revertedWithCustomError(
      tree,
      "AlreadyMaterialized",
    );
  });

  it("honors exact prefix/final boundaries and grants no caller ACL", async function () {
    const { vault, alice, bob, keeper, tree } = await deploy(10);
    await tree.register(alice.address, 0);
    await tree.register(bob.address, 1);
    const opensAt = BigInt(await time.latest());
    await update(tree, vault, alice.address, 2n, true);
    await update(tree, vault, bob.address, 3n, true);
    const closesAt = opensAt + 10n;
    await time.increaseTo(closesAt);
    await closeAndFixTicket(tree, vault, 1n, opensAt, closesAt, 20n, 9n); // Bob prefix exactly.
    await tree.connect(keeper).materializePrivateResultFor(1, alice.address);
    await tree.connect(keeper).materializePrivateResultFor(1, bob.address);
    expect(await decrypt64(tree, alice, await tree.privatePayoutOf(1, alice.address))).to.equal(0n);
    expect(await decrypt64(tree, bob, await tree.privatePayoutOf(1, bob.address))).to.equal(9n);
    await expectRejected(
      fhevm.userDecryptEuint(
        FhevmType.euint64,
        await tree.privatePayoutOf(1, bob.address),
        await tree.getAddress(),
        keeper,
      ),
    );
  });

  it("applies close-time Auto-Save only at lazy materialization time", async function () {
    const { vault, alice, tree } = await deploy(10);
    await tree.register(alice.address, 0);
    await tree.setAutoSavePreference(alice.address, 1);
    const opensAt = BigInt(await time.latest());
    await update(tree, vault, alice.address, 5n, true);
    const closesAt = opensAt + 10n;
    await time.increaseTo(closesAt);
    await tree.setAutoSavePreference(alice.address, 0);
    await update(tree, vault, alice.address, 5n, false);
    await closeAndFixTicket(tree, vault, 1n, opensAt, closesAt, 0n, 11n);
    await time.increase(100);
    const materialized = await (await tree.materializePrivateResultFor(1, alice.address)).wait();
    expect(await decrypt64(tree, alice, await tree.principalOf(alice.address))).to.equal(11n);
    expect(await decrypt64(tree, alice, await tree.winningsOf(alice.address))).to.equal(0n);
    const materializedAt = BigInt((await ethers.provider.getBlock(materialized!.blockNumber))!.timestamp);
    const futureEnd = materializedAt + 10n;
    await time.increaseTo(futureEnd);
    await tree.requestRoundTotal(2, materializedAt, futureEnd);
    const aggregateHandle = await tree.aggregateTwabHandle(2);
    const aggregate = await fhevm.publicDecrypt([aggregateHandle]);
    expect(aggregate.clearValues[aggregateHandle as `0x${string}`]).to.equal(110n);
  });

  it("keeps known-slot path length independent of registered population", async function () {
    const { alice, tree } = await deploy(20);
    await tree.register(alice.address, 999_999);
    expect(await tree.prefixNodeCount(999_999)).to.be.at.most(20n);
    expect(await tree.nextSlot()).to.equal(1_000_000n);
  });

  it("uniformly materializes zero weight and rejects premature, wrong-round, and duplicate calls", async function () {
    const { vault, alice, bob, keeper, tree } = await deploy(4);
    await tree.register(alice.address, 0);
    await tree.register(bob.address, 1);
    await expect(tree.connect(keeper).materializePrivateResultFor(1, bob.address)).to.be.revertedWithCustomError(
      tree,
      "RoundNotReady",
    );
    const opensAt = BigInt(await time.latest());
    await update(tree, vault, alice.address, 4n, true);
    const closesAt = opensAt + 10n;
    await expect(tree.requestRoundTotal(1, opensAt, closesAt)).to.be.revertedWithCustomError(tree, "InvalidRound");
    await time.increaseTo(closesAt);
    await closeAndFixTicket(tree, vault, 1n, opensAt, closesAt, 0n, 13n);
    await tree.connect(keeper).materializePrivateResultFor(1, bob.address);
    expect(await decrypt64(tree, bob, await tree.privatePayoutOf(1, bob.address))).to.equal(0n);
    await expect(tree.materializePrivateResultFor(2, bob.address)).to.be.revertedWithCustomError(tree, "RoundNotReady");
    await expect(tree.materializePrivateResultFor(1, bob.address)).to.be.revertedWithCustomError(
      tree,
      "AlreadyMaterialized",
    );
  });

  it("binds encrypted inputs and result ACLs to one helper/vault domain", async function () {
    const { vault, alice, tree: first } = await deploy(4);
    const second = (await (
      await ethers.getContractFactory("LeopoldHistoricalPrefixTreeSpike")
    ).deploy(vault.address, 4)) as LeopoldHistoricalPrefixTreeSpike;
    await first.register(alice.address, 0);
    await second.register(alice.address, 0);
    const input = await fhevm
      .createEncryptedInput(await first.getAddress(), vault.address)
      .add64(1n)
      .encrypt();
    await expect(second.updateBalance(alice.address, input.handles[0], input.inputProof, true)).to.be.reverted;

    const opensAt = BigInt(await time.latest());
    await update(first, vault, alice.address, 1n, true);
    const closesAt = opensAt + 5n;
    await time.increaseTo(closesAt);
    await closeAndFixTicket(first, vault, 1n, opensAt, closesAt, 0n, 3n);
    await first.materializePrivateResultFor(1, alice.address);
    await expectRejected(
      fhevm.userDecryptEuint(
        FhevmType.euint64,
        await first.privatePayoutOf(1, alice.address),
        await second.getAddress(),
        alice,
      ),
    );
  });

  it("keeps four helper instances and concurrent rounds isolated", async function () {
    const [vault, alice] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("LeopoldHistoricalPrefixTreeSpike");
    const trees: LeopoldHistoricalPrefixTreeSpike[] = [];
    for (let index = 0; index < 4; index += 1) {
      const tree = (await factory.deploy(vault.address, 3)) as LeopoldHistoricalPrefixTreeSpike;
      trees.push(tree);
      await tree.register(alice.address, 0);
    }
    const opensAt = BigInt(await time.latest());
    for (let index = 0; index < trees.length; index += 1) {
      await update(trees[index], vault, alice.address, BigInt(index + 1), true);
    }
    const closesAt = BigInt(await time.latest()) + 5n;
    await time.increaseTo(closesAt);
    for (let index = 0; index < trees.length; index += 1) {
      const prize = BigInt(20 + index);
      await closeAndFixTicket(trees[index], vault, 1n, opensAt, closesAt, 0n, prize);
      await trees[index].materializePrivateResultFor(1, alice.address);
      expect(await decrypt64(trees[index], alice, await trees[index].privatePayoutOf(1, alice.address))).to.equal(
        prize,
      );
    }
  });
});

describe("Leopold prefix-tree spike HCU scaling", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  function record(operation: string, depth: number, receipt: ContractTransactionReceipt | null) {
    if (receipt === null) throw new Error("missing benchmark receipt");
    const hcu = fhevm.computeTransactionHCU(receipt);
    console.log(
      `TREE_SPIKE_HCU ${JSON.stringify({ operation, depth, success: true, total: hcu.globalHCU, depthHcu: hcu.maxHCUDepth, gas: receipt.gasUsed.toString() })}`,
    );
  }

  async function measure(
    operation: string,
    depth: number,
    send: () => Promise<ContractTransactionResponse>,
  ): Promise<boolean> {
    try {
      record(operation, depth, await (await send()).wait());
      return true;
    } catch (error) {
      console.log(
        `TREE_SPIKE_HCU ${JSON.stringify({ operation, depth, success: false, reason: error instanceof Error ? error.message.split("\n")[0] : "unknown" })}`,
      );
      return false;
    }
  }

  for (const depth of [10, 16, 20, 24, 32]) {
    it(`measures encrypted paths at depth ${depth}`, async function () {
      const { vault, alice, tree } = await deploy(depth);
      const slot = depth === 32 ? 0xffff_ffff : 2 ** depth - 1;
      record("registration", depth, await (await tree.register(alice.address, slot)).wait());
      const opensAt = BigInt(await time.latest());
      expect(await measure("initial-deposit", depth, () => update(tree, vault, alice.address, 2n, true))).to.equal(
        true,
      );
      await time.increase(10);
      expect(await measure("temporal-deposit", depth, () => update(tree, vault, alice.address, 1n, true))).to.equal(
        depth <= 16,
      );
      await time.increase(10);
      expect(await measure("withdrawal", depth, () => update(tree, vault, alice.address, 1n, false))).to.equal(
        depth <= 16,
      );
      const closesAt = BigInt(await time.latest()) + 10n;
      await time.increaseTo(closesAt);
      expect(
        await measure("historical-prefix-sparse", depth, () => tree.benchmarkHistoricalPrefix(slot, opensAt, closesAt)),
      ).to.equal(depth <= 16);
      const totalReady = await measure("round-total", depth, () => tree.requestRoundTotal(1, opensAt, closesAt));
      if (!totalReady) return;
      const aggregateHandle = await tree.aggregateTwabHandle(1);
      const aggregate = await fhevm.publicDecrypt([aggregateHandle]);
      const total = aggregate.clearValues[aggregateHandle as `0x${string}`] as bigint;
      const input = fhevm.createEncryptedInput(await tree.getAddress(), vault.address);
      input.add128(0n).add64(7n);
      const encrypted = await input.encrypt();
      await tree.finalizeRoundTicket(
        1,
        total,
        aggregate.abiEncodedClearValues,
        aggregate.decryptionProof,
        encrypted.handles[0],
        encrypted.inputProof,
        encrypted.handles[1],
        encrypted.inputProof,
      );
      expect(await measure("winner-predicate", depth, () => tree.benchmarkWinnerPredicate(1, alice.address))).to.equal(
        depth <= 16,
      );
      expect(
        await measure("payout-materialization-core", depth, () =>
          tree.benchmarkPayoutMaterialization(1, alice.address),
        ),
      ).to.equal(depth <= 16);
      expect(
        await measure("full-private-materialization", depth, () => tree.materializePrivateResultFor(1, alice.address)),
      ).to.equal(false);
    });
  }

  for (const depth of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    it(`measures a populated depth-${depth} historical prefix`, async function () {
      const { vault, alice, tree } = await deploy(depth);
      const target = 2 ** depth - 1;
      await tree.register(alice.address, target);
      const opensAt = BigInt(await time.latest());
      for (let bit = 0; bit < depth; bit += 1) {
        const account = ethers.Wallet.createRandom().address;
        const siblingSlot = target ^ (1 << bit);
        await tree.register(account, siblingSlot);
        await update(tree, vault, account, 1n, true);
      }
      await update(tree, vault, alice.address, 1n, true);
      const closesAt = BigInt(await time.latest()) + 10n;
      await time.increaseTo(closesAt);
      expect(
        await measure("historical-prefix-populated", depth, () =>
          tree.benchmarkHistoricalPrefix(target, opensAt, closesAt),
        ),
      ).to.equal(true);
      await tree.requestRoundTotal(1, opensAt, closesAt);
      const aggregateHandle = await tree.aggregateTwabHandle(1);
      const aggregate = await fhevm.publicDecrypt([aggregateHandle]);
      const total = aggregate.clearValues[aggregateHandle as `0x${string}`] as bigint;
      const input = fhevm.createEncryptedInput(await tree.getAddress(), vault.address);
      input.add128(0n).add64(7n);
      const encrypted = await input.encrypt();
      await tree.finalizeRoundTicket(
        1,
        total,
        aggregate.abiEncodedClearValues,
        aggregate.decryptionProof,
        encrypted.handles[0],
        encrypted.inputProof,
        encrypted.handles[1],
        encrypted.inputProof,
      );
      expect(
        await measure("full-private-materialization-populated", depth, () =>
          tree.materializePrivateResultFor(1, alice.address),
        ),
      ).to.equal(depth <= 6);
    });
  }
});
