import { expect } from "chai";

import { retrySafeFheOperation } from "../scripts/leopold-fhe-retry";

describe("Leopold FHE helper recovery", function () {
  it("retries bounded read/helper failures and eventually succeeds", async function () {
    let attempts = 0;
    const diagnostics: number[] = [];
    const result = await retrySafeFheOperation(
      "encrypt",
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("temporary relayer failure");
        return "encrypted";
      },
      { attempts: 3, timeoutMs: 100, sleepMs: 1, onRetry: ({ attempt }) => diagnostics.push(attempt) },
    );
    expect(result).to.equal("encrypted");
    expect(attempts).to.equal(3);
    expect(diagnostics).to.deep.equal([1, 2]);
  });

  it("fails after the timeout budget without resubmitting a transaction", async function () {
    let attempts = 0;
    let error = "";
    try {
      await retrySafeFheOperation(
        "public-decrypt",
        async () => {
          attempts += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error("unavailable");
        },
        { attempts: 2, timeoutMs: 5, sleepMs: 1 },
      );
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    expect(error).to.contain("FHE_HELPER_FAILED:public-decrypt");
    expect(attempts).to.equal(2);
  });
});
