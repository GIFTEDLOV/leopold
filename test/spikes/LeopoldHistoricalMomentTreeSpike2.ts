import { expect } from "chai";
import { ethers, fhevm, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { ContractTransactionReceipt, ContractTransactionResponse } from "ethers";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { LeopoldHistoricalMomentTreeSpike2, LeopoldMomentTreeVaultAclProbe } from "../../types";

const DEPTHS = [10, 16, 20, 24, 28, 32] as const;

async function deploy(depth: number) {
  const [vault, alice] = await ethers.getSigners();
  const tree = (await (
    await ethers.getContractFactory("LeopoldHistoricalMomentTreeSpike2")
  ).deploy(vault.address, depth)) as LeopoldHistoricalMomentTreeSpike2;
  const slot = depth === 32 ? 0xffff_ffff : 2 ** depth - 1;
  await tree.register(alice.address, slot);
  return { vault, alice, tree, slot };
}

async function update(
  tree: LeopoldHistoricalMomentTreeSpike2,
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

async function finalizeRound(
  tree: LeopoldHistoricalMomentTreeSpike2,
  vault: HardhatEthersSigner,
  roundId: bigint,
  opensAt: bigint,
  closesAt: bigint,
  prize: bigint,
  ticket?: bigint,
) {
  await tree.fundPrize(prize);
  await tree.requestRoundTotal(roundId, opensAt, closesAt, prize);
  const aggregateHandle = await tree.aggregateTwabHandle(roundId);
  const aggregate = await fhevm.publicDecrypt([aggregateHandle]);
  const total = aggregate.clearValues[aggregateHandle as `0x${string}`] as bigint;
  const selectedTicket = ticket ?? total - 1n;
  expect(selectedTicket).to.be.lessThan(total);
  const input = await fhevm
    .createEncryptedInput(await tree.getAddress(), vault.address)
    .add128(selectedTicket)
    .encrypt();
  await tree.finalizeRoundSelection(
    roundId,
    total,
    aggregate.abiEncodedClearValues,
    aggregate.decryptionProof,
    input.handles[0],
    input.inputProof,
  );
  return total;
}

async function decrypt64(
  tree: LeopoldHistoricalMomentTreeSpike2,
  account: HardhatEthersSigner,
  handle: string,
) {
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, await tree.getAddress(), account);
}

function record(operation: string, depth: number, receipt: ContractTransactionReceipt | null) {
  if (receipt === null) throw new Error("missing benchmark receipt");
  const hcu = fhevm.computeTransactionHCU(receipt);
  console.log(
    `TREE_SPIKE2_UPDATE_HCU ${JSON.stringify({ operation, depth, success: true, total: hcu.globalHCU, depthHcu: hcu.maxHCUDepth, gas: receipt.gasUsed.toString() })}`,
  );
  return hcu;
}

async function measure(
  operation: string,
  depth: number,
  send: () => Promise<ContractTransactionResponse>,
): Promise<{ success: true; total: number; depthHcu: number } | { success: false; reason: string }> {
  try {
    const hcu = record(operation, depth, await (await send()).wait());
    return { success: true, total: hcu.globalHCU, depthHcu: hcu.maxHCUDepth };
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : "unknown";
    console.log(`TREE_SPIKE2_UPDATE_HCU ${JSON.stringify({ operation, depth, success: false, reason })}`);
    return { success: false, reason };
  }
}

describe("Leopold Spike 2 exact historical moment tree", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("preserves exact historical TWAB after withdrawal and re-deposit", async function () {
    const { vault, alice, tree } = await deploy(10);
    const start = BigInt(await time.latest());
    const first = await (await update(tree, vault, alice.address, 10n, true)).wait();
    await time.increase(10);
    const withdrawal = await (await update(tree, vault, alice.address, 4n, false)).wait();
    await time.increase(10);
    const redeposit = await (await update(tree, vault, alice.address, 3n, true)).wait();
    const end = BigInt(await time.latest()) + 10n;
    await time.increaseTo(end);
    const leaf = await tree.leafOf(await tree.slotOf(alice.address));
    await tree.benchmarkNodeWeight(leaf, start, end);
    const handle = await tree.benchmarkWeightHandle();
    const decrypted = await fhevm.publicDecrypt([handle]);
    const firstAt = BigInt((await ethers.provider.getBlock(first!.blockNumber))!.timestamp);
    const withdrawalAt = BigInt((await ethers.provider.getBlock(withdrawal!.blockNumber))!.timestamp);
    const redepositAt = BigInt((await ethers.provider.getBlock(redeposit!.blockNumber))!.timestamp);
    const expected =
      10n * (withdrawalAt - firstAt) + 6n * (redepositAt - withdrawalAt) + 9n * (end - redepositAt);
    expect(decrypted.clearValues[handle as `0x${string}`]).to.equal(expected);
  });

  it("coalesces same-timestamp mutations without changing exact TWAB", async function () {
    const { vault, alice, tree } = await deploy(10);
    await network.provider.send("evm_setAutomine", [false]);
    try {
      const first = await update(tree, vault, alice.address, 5n, true);
      const second = await update(tree, vault, alice.address, 2n, true);
      await network.provider.send("evm_mine");
      const firstReceipt = await first.wait();
      const secondReceipt = await second.wait();
      record("same-timestamp-first", 10, firstReceipt);
      record("same-timestamp-second", 10, secondReceipt);
      const leaf = await tree.leafOf(await tree.slotOf(alice.address));
      expect(await tree.nodeObservationCount(leaf)).to.equal(1n);
    } finally {
      await network.provider.send("evm_setAutomine", [true]);
    }
  });

  it("measures prefix chunks 1 through 4 below the preferred result ceiling", async function () {
    const { vault, alice, tree } = await deploy(10);
    const opensAt = BigInt(await time.latest());
    for (let bit = 0; bit < 10; bit += 1) {
      const account = ethers.Wallet.createRandom().address;
      await tree.register(account, 1023 - 2 ** bit);
      await update(tree, vault, account, 1n, true);
    }
    await update(tree, vault, alice.address, 1n, true);
    const closesAt = BigInt(await time.latest()) + 10n;
    await time.increaseTo(closesAt);
    await finalizeRound(tree, vault, 1n, opensAt, closesAt, 5n);
    await tree.connect(alice).startPrivateResult(1);
    for (const chunk of [1, 2, 3, 4]) {
      const receipt = await (await tree.advancePrivateResult(1, alice.address, chunk)).wait();
      const hcu = record(`result-advance-${chunk}`, 10, receipt);
      expect(hcu.globalHCU).to.be.lessThanOrEqual(10_000_000);
      expect(hcu.maxHCUDepth).to.be.lessThan(3_750_000);
    }
  });

  it("irrevocably binds prizes while future rounds progress without result sessions", async function () {
    const { vault, alice, tree } = await deploy(10);
    const firstOpen = BigInt(await time.latest());
    await update(tree, vault, alice.address, 1n, true);
    const firstClose = BigInt(await time.latest()) + 5n;
    await time.increaseTo(firstClose);
    await finalizeRound(tree, vault, 1n, firstOpen, firstClose, 10n);
    expect(await tree.availablePrize()).to.equal(0n);
    expect(await tree.irrevocablyAllocatedPrize()).to.equal(10n);

    const secondOpen = firstClose;
    const secondClose = BigInt(await time.latest()) + 5n;
    await time.increaseTo(secondClose);
    await tree.fundPrize(7);
    await tree.requestRoundTotal(2, secondOpen, secondClose, 7);
    expect((await tree.sessionInfo(1, alice.address))[3]).to.equal(0n);
    expect(await tree.availablePrize()).to.equal(0n);
    expect(await tree.irrevocablyAllocatedPrize()).to.equal(17n);
    await expect(tree.requestRoundTotal(3, secondOpen, secondClose, 1)).to.be.revertedWithCustomError(
      tree,
      "InvalidPrize",
    );
  });

  for (const depth of DEPTHS) {
    it(`benchmarks the full financial mutation lifecycle at depth ${depth}`, async function () {
      const { vault, alice, tree } = await deploy(depth);
      const first = await measure("first-deposit", depth, () => update(tree, vault, alice.address, 10n, true));
      expect(first.success).to.equal(true);
      await time.increase(10);
      const subsequent = await measure("subsequent-deposit", depth, () =>
        update(tree, vault, alice.address, 5n, true),
      );
      await time.increase(10);
      const partial = await measure("partial-withdrawal", depth, () =>
        update(tree, vault, alice.address, 3n, false),
      );
      await time.increase(10);
      const full = await measure("full-withdrawal", depth, () => update(tree, vault, alice.address, 12n, false));
      await time.increase(10);
      const redeposit = await measure("re-deposit", depth, () => update(tree, vault, alice.address, 7n, true));

      for (const result of [subsequent, partial, full, redeposit]) {
        expect(result.success).to.equal(true);
        if (result.success) {
          expect(result.total).to.be.lessThanOrEqual(15_000_000);
          expect(result.depthHcu).to.be.lessThan(3_750_000);
        }
      }
    });
  }

  for (const depth of DEPTHS) {
    it(`completes a checkpointed private result at depth ${depth}`, async function () {
      const [vault, alice, , keeper] = await ethers.getSigners();
      const tree = (await (
        await ethers.getContractFactory("LeopoldHistoricalMomentTreeSpike2")
      ).deploy(vault.address, depth)) as LeopoldHistoricalMomentTreeSpike2;
      const target = depth === 32 ? 0xffff_ffff : 2 ** depth - 1;
      await tree.register(alice.address, target);
      const opensAt = BigInt(await time.latest());

      // Populate every canonical left sibling so this is the worst prefix path,
      // while the number of result operations remains depth-only.
      for (let bit = 0; bit < depth; bit += 1) {
        const account = ethers.Wallet.createRandom().address;
        const siblingSlot = target - 2 ** bit;
        await tree.register(account, siblingSlot);
        await update(tree, vault, account, 1n, true);
      }
      await tree.setAutoSavePreference(alice.address, 1);
      await update(tree, vault, alice.address, 1n, true);
      const closesAt = BigInt(await time.latest()) + 10n;
      await time.increaseTo(closesAt);
      await finalizeRound(tree, vault, 1n, opensAt, closesAt, 17n);

      const start = record("result-start", depth, await (await tree.connect(alice).startPrivateResult(1)).wait());
      expect(start.globalHCU).to.be.lessThan(1_000);
      let advanceCalls = 0;
      let aggregateHcu = start.globalHCU;
      let maximumTotal = start.globalHCU;
      let maximumDepth = start.maxHCUDepth;
      while ((await tree.sessionInfo(1, alice.address))[3] === 1n) {
        const receipt = await (await tree.connect(keeper).advancePrivateResult(1, alice.address, 4)).wait();
        const hcu = record("result-advance-4", depth, receipt);
        expect(hcu.globalHCU).to.be.lessThanOrEqual(10_000_000);
        expect(hcu.maxHCUDepth).to.be.lessThan(3_750_000);
        aggregateHcu += hcu.globalHCU;
        maximumTotal = Math.max(maximumTotal, hcu.globalHCU);
        maximumDepth = Math.max(maximumDepth, hcu.maxHCUDepth);
        advanceCalls += 1;
      }
      const finalizeReceipt = await (await tree.connect(keeper).finalizePrivateResult(1, alice.address)).wait();
      const finalizeHcu = record("result-finalize", depth, finalizeReceipt);
      aggregateHcu += finalizeHcu.globalHCU;
      maximumTotal = Math.max(maximumTotal, finalizeHcu.globalHCU);
      maximumDepth = Math.max(maximumDepth, finalizeHcu.maxHCUDepth);

      const autoSaveReceipt = await (await tree.connect(keeper).finalizeAutoSave(1, alice.address)).wait();
      const autoSaveHcu = record("result-autosave", depth, autoSaveReceipt);
      expect(autoSaveHcu.globalHCU).to.be.lessThanOrEqual(15_000_000);
      expect(autoSaveHcu.maxHCUDepth).to.be.lessThan(3_750_000);
      aggregateHcu += autoSaveHcu.globalHCU;
      maximumTotal = Math.max(maximumTotal, autoSaveHcu.globalHCU);
      maximumDepth = Math.max(maximumDepth, autoSaveHcu.maxHCUDepth);

      console.log(
        `TREE_SPIKE2_SESSION_SUMMARY ${JSON.stringify({ depth, advanceCalls, transactions: advanceCalls + 3, aggregateHcu, maximumTotal, maximumDepth })}`,
      );
      expect(await decrypt64(tree, alice, await tree.payoutOf(1, alice.address))).to.equal(17n);
      expect(await decrypt64(tree, alice, await tree.principalOf(alice.address))).to.equal(17n);
      expect(await decrypt64(tree, alice, await tree.winningsOf(alice.address))).to.equal(0n);
      await expect(tree.connect(alice).startPrivateResult(1)).to.be.revertedWithCustomError(tree, "InvalidSession");
      await expect(tree.finalizePrivateResult(1, alice.address)).to.be.revertedWithCustomError(tree, "InvalidSession");
      await expect(tree.finalizeAutoSave(1, alice.address)).to.be.revertedWithCustomError(tree, "InvalidSession");
    });
  }

  it("proves vault-to-helper transient ACL and denies the relay caller result ACL", async function () {
    const [, alice, , keeper] = await ethers.getSigners();
    const probe = (await (
      await ethers.getContractFactory("LeopoldMomentTreeVaultAclProbe")
    ).deploy(10)) as LeopoldMomentTreeVaultAclProbe;
    const tree = (await ethers.getContractAt(
      "LeopoldHistoricalMomentTreeSpike2",
      await probe.TREE(),
    )) as LeopoldHistoricalMomentTreeSpike2;
    await probe.register(alice.address, 0);
    const opensAt = BigInt(await time.latest());
    const delta = await fhevm
      .createEncryptedInput(await probe.getAddress(), alice.address)
      .add64(3n)
      .encrypt();
    await probe.connect(alice).importAndUpdate(alice.address, delta.handles[0], delta.inputProof, true);
    const closesAt = BigInt(await time.latest()) + 5n;
    await time.increaseTo(closesAt);
    await probe.fundAndRequestRound(1, opensAt, closesAt, 9);
    const aggregateHandle = await tree.aggregateTwabHandle(1);
    const aggregate = await fhevm.publicDecrypt([aggregateHandle]);
    const total = aggregate.clearValues[aggregateHandle as `0x${string}`] as bigint;
    const ticket = await fhevm
      .createEncryptedInput(await probe.getAddress(), alice.address)
      .add128(total - 1n)
      .encrypt();
    await probe
      .connect(alice)
      .importAndFinalizeRound(
        1,
        total,
        aggregate.abiEncodedClearValues,
        aggregate.decryptionProof,
        ticket.handles[0],
        ticket.inputProof,
      );
    await tree.connect(alice).startPrivateResult(1);
    while ((await tree.sessionInfo(1, alice.address))[3] === 1n) {
      await tree.connect(keeper).advancePrivateResult(1, alice.address, 4);
    }
    await tree.connect(keeper).finalizePrivateResult(1, alice.address);
    await tree.connect(keeper).finalizeAutoSave(1, alice.address);
    expect(await decrypt64(tree, alice, await tree.payoutOf(1, alice.address))).to.equal(9n);
    let callerDenied = false;
    try {
      await decrypt64(tree, keeper, await tree.payoutOf(1, alice.address));
    } catch {
      callerDenied = true;
    }
    expect(callerDenied).to.equal(true);
  });
});
