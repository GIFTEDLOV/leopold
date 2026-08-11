import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type { LeopoldObservationLookupHarness } from "../types";

describe("Leopold observation lookup scaling", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("keeps FHE HCU constant while public lookup gas grows logarithmically", async function () {
    const counts = [1, 2, 8, 32, 128, 512];
    const measurements: Array<{ count: number; gas: bigint; totalHcu: number; depth: number }> = [];
    for (const count of counts) {
      const harness = (await (
        await ethers.getContractFactory("LeopoldObservationLookupHarness")
      ).deploy(count)) as LeopoldObservationLookupHarness;
      const receipt = await (await harness.lookup(count * 10 - 1)).wait();
      expect(receipt).not.to.equal(null);
      const hcu = fhevm.computeTransactionHCU(receipt!);
      measurements.push({ count, gas: receipt!.gasUsed, totalHcu: hcu.globalHCU, depth: hcu.maxHCUDepth });
    }
    expect(new Set(measurements.map((entry) => entry.totalHcu)).size).to.equal(1);
    expect(new Set(measurements.map((entry) => entry.depth)).size).to.equal(1);
    expect(measurements[5].gas).to.be.greaterThan(measurements[0].gas);
    if (process.env.REPORT_LEOPOLD_LOOKUP === "1") {
      for (const entry of measurements) {
        process.stdout.write(`${entry.count},${entry.gas},${entry.totalHcu},${entry.depth}\n`);
      }
    }
  });
});
