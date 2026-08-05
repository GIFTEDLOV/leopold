import { expect } from "chai";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { deriveProtocol, serializeProtocol, validateProtocol } from "../scripts/sg5-protocol";

const root = resolve(__dirname, "..");

describe("SG-5 deterministic browser capability protocol", function () {
  const protocol = deriveProtocol();

  it("is stable in memory and valid JSON", function () {
    const first = serializeProtocol();
    const second = serializeProtocol();
    expect(first).to.equal(second);
    expect(() => JSON.parse(first)).not.to.throw();
    expect(createHash("sha256").update(first).digest("hex")).to.have.length(64);
  });

  it("keeps SG-5 and SG-4 pending", function () {
    expect(protocol.gateStatus).to.equal("PENDING");
    expect(protocol.relationship.sg4).to.match(/^PENDING_/u);
  });

  it("rejects a mock live pass", function () {
    const candidate = JSON.parse(JSON.stringify(protocol));
    candidate.encryptionProof.mockMayPassLiveGate = true;
    expect(() => validateProtocol(candidate)).to.throw("mock cannot pass");
  });

  it("rejects width drift", function () {
    const candidate = JSON.parse(JSON.stringify(protocol));
    candidate.lockedProbe.encryptedWidth = "euint32";
    expect(() => validateProtocol(candidate)).to.throw("encrypted width");
  });

  it("uses the exact installed frontend lineage", function () {
    const frontendPackage = JSON.parse(readFileSync(resolve(root, "frontend/package.json"), "utf8"));
    expect(frontendPackage.dependencies["@zama-fhe/sdk"]).to.equal(protocol.installedLineage.zamaBrowserSdk.version);
    expect(frontendPackage.dependencies["@zama-fhe/react-sdk"]).to.equal(
      protocol.installedLineage.zamaReactSdk.version,
    );
    expect(frontendPackage.dependencies.next).to.equal(protocol.installedLineage.next.version);
    expect(frontendPackage.devDependencies["@playwright/test"]).to.equal(protocol.installedLineage.playwright.version);
  });

  it("contains no evidence artifact", function () {
    expect(() => readFileSync(resolve(root, protocol.futureEvidence.path))).to.throw();
  });
});
