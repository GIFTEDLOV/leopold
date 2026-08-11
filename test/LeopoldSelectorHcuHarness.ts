import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { LeopoldSelectorHcuHarness } from "../types";

describe("Leopold selector HCU harness", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("executes every production composite below the configured ceilings", async function () {
    const harness = (await (
      await ethers.getContractFactory("LeopoldSelectorHcuHarness")
    ).deploy()) as LeopoldSelectorHcuHarness;
    const methods = [
      "userTwabQuery",
      "globalCloseAccrual",
      "candidateGeneration",
      "candidateValidity",
      "acceptedTicketModulo",
      "participantSelectionStep",
      "participantSelectionChunk4",
      "winningsAllocationStep",
      "autoSaveAllocationStep",
      "autoSaveAllocationChunk4",
    ] as const;
    const costs = new Map<string, { total: number; depth: number }>();
    for (let index = 0; index < methods.length; index += 1) {
      const receipt = await (await harness[methods[index]](index + 1)).wait();
      expect(receipt).not.to.equal(null);
      const hcu = fhevm.computeTransactionHCU(receipt!);
      expect(hcu.globalHCU).to.be.lessThan(20_000_000);
      expect(hcu.maxHCUDepth).to.be.lessThan(5_000_000);
      costs.set(methods[index], { total: hcu.globalHCU, depth: hcu.maxHCUDepth });
    }
    expect(costs.get("participantSelectionStep")!.total).to.be.greaterThan(0);
    expect(costs.get("autoSaveAllocationStep")!.total).to.be.greaterThan(0);

    await harness.authorizeAggregatePublicDecryption(11);
    const aggregate = await fhevm.publicDecrypt([await harness.aggregateHandle()]);
    await harness.verifyAggregate(aggregate.abiEncodedClearValues, aggregate.decryptionProof);
    await expect(harness.verifyAggregate(aggregate.abiEncodedClearValues, aggregate.decryptionProof)).to.be.reverted;

    await harness.authorizeBooleanPublicDecryption(12);
    const booleanResult = await fhevm.publicDecrypt([await harness.booleanHandle()]);
    await harness.verifyBoolean(booleanResult.abiEncodedClearValues, booleanResult.decryptionProof);
    expect(await harness.aggregateVerified()).to.equal(true);
    expect(await harness.booleanVerified()).to.equal(true);
  });
});
