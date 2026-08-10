import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { deriveProtocol } from "../scripts/sg4-protocol";

const root = resolve(__dirname, "..");
const harness = readFileSync(resolve(root, "contracts/benchmarks/SG4FheBenchmarkHarness.sol"), "utf8");
type Binding = {
  operationSchedule: {
    pricingManifest: {
      entries: Array<{ canonicalName: string; arity: number; resultType: string; cost: number }>;
    };
  };
};
const binding = JSON.parse(readFileSync(resolve(root, "scripts/sg4-hcu-authority-binding.json"), "utf8")) as Binding;

describe("SG-4 permanent randomness benchmark harness", function () {
  it("consumes exactly the preregistered three RNG circuit rows", function () {
    const protocol = deriveProtocol();
    const circuits = protocol.circuits.filter((circuit) => circuit.id.startsWith("RNG_"));
    expect(circuits.map((circuit) => circuit.id)).to.deep.equal(["RNG_64", "RNG_128", "RNG_256"]);
    expect(circuits.map((circuit) => circuit.operations)).to.deep.equal([
      ["FHE.randEuint64()", "STORE._result64", "FHE.allowThis(euint64)"],
      ["FHE.randEuint128()", "STORE._result128", "FHE.allowThis(euint128)"],
      ["FHE.randEuint256()", "STORE._last256", "FHE.allowThis(euint256)"],
    ]);
    const rows = (protocol.runPlan as unknown as Array<{ circuitId: string; classification: string }>).filter((row) =>
      row.circuitId.startsWith("RNG_"),
    );
    expect(rows).to.have.length(36);
    expect(rows.filter((row) => row.classification === "MEASURED")).to.have.length(30);
    expect(rows.filter((row) => row.classification === "WARMUP")).to.have.length(6);
  });

  it("uses the authenticated FheRand costs and has no extra FHE operation", function () {
    const entries = binding.operationSchedule.pricingManifest.entries as Array<Record<string, unknown>>;
    const costs = new Map(
      entries
        .filter((entry) => entry.canonicalName === "FheRand" && entry.arity === 0)
        .map((entry) => [entry.resultType, entry.cost]),
    );
    expect(costs.get("euint64")).to.equal(24000);
    expect(costs.get("euint128")).to.equal(25000);
    expect(costs.get("euint256")).to.equal(30000);
    expect(harness).not.to.match(/FHE\.allow\(/u);
  });

  it("keeps all three random tickets confidential and rejects caller-seeded or bounded paths", function () {
    for (const [method, randomCall, storage] of [
      ["rng64", "FHE.randEuint64()", "_store64"],
      ["rng128", "FHE.randEuint128()", "_store128"],
      ["rng256", "FHE.randEuint256()", "_last256"],
    ] as const) {
      const body = harness.match(new RegExp(`function ${method}\\([\\s\\S]*?\\n    \\}`, "u"))?.[0] ?? "";
      expect(body, `${method} body missing`).to.include(randomCall);
      expect(body, `${method} body missing storage`).to.include(storage);
      expect(body, `${method} permits caller seed`).not.to.match(/seed|randomness|msg\.sender/u);
      expect(body, `${method} uses bounded randomness`).not.to.match(/randEuint(?:64|128|256)\([^)]{1,}\)/u);
      expect(body, `${method} grants caller ACL`).not.to.match(/FHE\.allow\(/u);
      expect(body, `${method} makes ticket public`).not.to.include("makePubliclyDecryptable");
      expect(body, `${method} has a public decrypt path`).not.to.include("publicDecrypt");
      expect(body).to.include("onlyOperator");
    }
    expect(harness).to.include("FHE.allowThis(value)");
    expect(harness).to.not.include("FHE.allow(value");
    expect(harness).to.not.include("FHE.allow(_result");
    expect(harness).to.include("function rng64(uint64 runSequence)");
    expect(harness).to.include("function rng128(uint64 runSequence)");
    expect(harness).to.include("function rng256(uint64 runSequence)");
  });
});
