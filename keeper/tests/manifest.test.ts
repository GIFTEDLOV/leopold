import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { loadOfficialVaults } from "../src/manifest.js";

const directories: string[] = [];
async function manifestPath(document: unknown): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "leopold-manifest-test-"));
  directories.push(directory);
  const file = path.join(directory, "manifest.json");
  await writeFile(file, JSON.stringify(document));
  return file;
}

function document(vaults: unknown[], authorityBinding?: unknown) {
  return {
    schema: "leopold.frontend-contract-manifest.v1",
    network: { name: "ethereum-sepolia", chainId: 11_155_111 },
    deploymentStatus: "OFFICIAL_SEPOLIA_DEPLOYED",
    officialVaults: vaults,
    ...(authorityBinding === undefined ? {} : { authorityBinding }),
  };
}

const v2AuthorityBinding = {
  targetId: "LEOPOLD_V2_SEPOLIA",
  targetScope: "LEOPOLD_V2_RELEASE",
  path: "scripts/sg4-hcu-authority-bindings/v2.json",
  schema: "zama-szn4.sg4-hcu-authority-binding.v5",
  recordVersion: 5,
};

const vault = {
  id: 1,
  type: "DAILY",
  name: "Daily",
  vault: "0x0000000000000000000000000000000000000011",
  bondEscrow: "0x0000000000000000000000000000000000000022",
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("official vault manifest", () => {
  it("defaults frozen deployments to settlement-only and accepts an explicit v2 marker", async () => {
    const frozen = await loadOfficialVaults(await manifestPath(document([vault])));
    expect(frozen[0]?.automaticEntry).toBe(false);
    const automatic = await loadOfficialVaults(
      await manifestPath(document([{ ...vault, implementation: "v2", automaticEntry: true }], v2AuthorityBinding)),
    );
    expect(automatic[0]?.automaticEntry).toBe(true);
    await expect(
      loadOfficialVaults(await manifestPath(document([{ ...vault, automaticEntry: true }]))),
    ).rejects.toThrow("explicit V2");
    await expect(
      loadOfficialVaults(await manifestPath(document([{ ...vault, implementation: "v2", automaticEntry: true }]))),
    ).rejects.toThrow("authority binding selection");
  });

  it("rejects the wrong chain and duplicate vault identities", async () => {
    const wrong = document([vault]);
    wrong.network.chainId = 1;
    await expect(loadOfficialVaults(await manifestPath(wrong))).rejects.toThrow("not Sepolia");
    await expect(
      loadOfficialVaults(
        await manifestPath(
          document([vault, { ...vault, name: "Duplicate", vault: "0x0000000000000000000000000000000000000033" }]),
        ),
      ),
    ).rejects.toThrow("Duplicate official vault id");
    await expect(
      loadOfficialVaults(
        await manifestPath(
          document([
            vault,
            {
              ...vault,
              id: 2,
              name: "Second",
              vault: "0x0000000000000000000000000000000000000033",
            },
          ]),
        ),
      ),
    ).rejects.toThrow("Duplicate official bond escrow address");
  });
});
