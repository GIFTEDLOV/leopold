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

  it("keeps the preregistered SG-5 protocol pending and preserves closed SG-4", function () {
    expect(protocol.gateStatus).to.equal("PENDING");
    expect(protocol.relationship.sg4).to.equal("PASS_UNCHANGED");
    expect(protocol.relationship.sg5).to.equal("PENDING_LIVE_BROWSER_EXECUTION");
  });

  it("rejects a mock live pass", function () {
    const candidate = JSON.parse(JSON.stringify(protocol));
    candidate.walletModel.frontendNeverReceivesPrivateKey = false;
    expect(() => validateProtocol(candidate)).to.throw("security invariant weakened");
  });

  it("rejects width drift", function () {
    const candidate = JSON.parse(JSON.stringify(protocol));
    candidate.lockedProbe.encryptedWidth = "euint32";
    expect(() => validateProtocol(candidate)).to.throw("SG5 probe identity drifted");
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

  it("declares the durable evidence artifact", function () {
    expect(protocol.evidence.path).to.equal("evidence/cp0/SG5_BROWSER_CAPABILITY.json");
    expect(protocol.evidence.requiredMarker).to.equal("SG5_EVIDENCE_VALID");
    expect(() => readFileSync(resolve(root, protocol.evidence.path))).not.to.throw();
  });
});
