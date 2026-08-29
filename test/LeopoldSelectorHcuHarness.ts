import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { HCU_DEPTH_SAFETY_THRESHOLD, HCU_TOTAL_SAFETY_THRESHOLD } from "../scripts/sg4-protocol";
import type { LeopoldSelectorHcuHarness } from "../types";

describe("Leopold selector HCU harness", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("executes every production composite below the strict SG-4 safety boundaries", async function () {
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
      // These are the existing 75% boundaries derived from the installed
      // authority limits in scripts/sg4-protocol.ts. Equality is NO-GO.
      expect(hcu.globalHCU).to.be.lessThan(Number(HCU_TOTAL_SAFETY_THRESHOLD));
      expect(hcu.maxHCUDepth).to.be.lessThan(Number(HCU_DEPTH_SAFETY_THRESHOLD));
      costs.set(methods[index], { total: hcu.globalHCU, depth: hcu.maxHCUDepth });
    }
    for (const method of methods) expect(costs.get(method)!.total).to.be.greaterThan(0);

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
