import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import { readGitProvenance, assertReviewedProvenance } from "./leopold-deployment-provenance";
import type { TransactionResponse } from "ethers";

const CHAIN_ID = 11_155_111n;
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const COMET = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";
const OUTPUT = path.resolve(process.env.LEOPOLD_V2_DISPOSABLE_TOPOLOGY ?? "/tmp/leopold-v2-disposable-topology.json");
const BOND = ethers.parseEther("0.0001");
const REWARD = ethers.parseEther("0.00002");
const DURATION = Number(process.env.LEOPOLD_DISPOSABLE_ROUND_DURATION_SECONDS ?? "300");

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactBytecode(contractPath: string, field: "bytecode" | "deployedBytecode"): Uint8Array {
  const artifact = JSON.parse(readFileSync(contractPath, "utf8")) as Record<string, unknown>;
  const value = artifact[field];
  if (typeof value !== "string" || !/^0x[0-9a-f]*$/iu.test(value)) {
    throw new Error(`DISPOSABLE_ARTIFACT_${field.toUpperCase()}_MISSING:${contractPath}`);
  }
  return Buffer.from(value.slice(2), "hex");
}

async function record(label: string, tx: TransactionResponse) {
  const receipt = await tx.wait();
  if (receipt === null || receipt.status !== 1) throw new Error(`DISPOSABLE_DEPLOYMENT_FAILED:${label}`);
  return {
    label,
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    gasUsed: receipt.gasUsed.toString(),
    status: Number(receipt.status),
  };
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("DISPOSABLE_DEPLOYMENT_REQUIRES_SEPOLIA");
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== CHAIN_ID) throw new Error(`DISPOSABLE_DEPLOYMENT_WRONG_CHAIN:${chain.chainId}`);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DISPOSABLE_DEPLOYMENT_SIGNER_MISSING");
  const latest = await ethers.provider.getBlock("latest");
  if (latest === null) throw new Error("DISPOSABLE_DEPLOYMENT_LATEST_BLOCK_MISSING");
  if (!Number.isInteger(DURATION) || DURATION < 180 || DURATION > 900) {
    throw new Error("DISPOSABLE_ROUND_DURATION must be between 180 and 900 seconds");
  }
  const expectedSourceSha = process.env.LEOPOLD_REVIEWED_SOURCE_SHA;
  if (!expectedSourceSha) throw new Error("LEOPOLD_REVIEWED_SOURCE_SHA is required for disposable deployment");
  const provenance = readGitProvenance(process.cwd());
  assertReviewedProvenance(provenance, expectedSourceSha, process.env.LEOPOLD_REVIEWED_SOURCE_BRANCH);

  const wrapperFactory = await ethers.getContractFactory("LeopoldConfidentialUSDC", deployer);
  const wrapper = await wrapperFactory.deploy();
  const wrapperDeployment = wrapper.deploymentTransaction();
  if (wrapperDeployment === null) throw new Error("DISPOSABLE_WRAPPER_TX_MISSING");
  const wrapperTx = await record("disposable-wrapper-deploy", wrapperDeployment);
  const wrapperAddress = await wrapper.getAddress();

  const firstRoundOpensAt = BigInt(latest.timestamp) + 45n;
  const vaultFactory = await ethers.getContractFactory("LeopoldVaultV2", deployer);
  const vault = await vaultFactory.deploy(
    1,
    0,
    ethers.encodeBytes32String("DISPOSABLE V2 PROOF"),
    DURATION,
    wrapperAddress,
    firstRoundOpensAt,
    COMET,
    await deployer.getAddress(),
    1,
    BOND,
    REWARD,
  );
  const vaultDeployment = vault.deploymentTransaction();
  if (vaultDeployment === null) throw new Error("DISPOSABLE_VAULT_TX_MISSING");
  const vaultTx = await record("disposable-vault-v2-deploy", vaultDeployment);
  const vaultAddress = await vault.getAddress();
  const escrowAddress = await vault.SETTLEMENT_BOND_ESCROW();
  const adapterAddress = await vault.STRATEGY();

  const wrapperView = new ethers.Contract(
    wrapperAddress,
    [
      "function underlying() view returns (address)",
      "function rate() view returns (uint256)",
      "function decimals() view returns (uint8)",
    ],
    ethers.provider,
  );
  const vaultView = new ethers.Contract(
    vaultAddress,
    [
      "function ASSET() view returns (address)",
      "function UNDERLYING() view returns (address)",
      "function SETTLEMENT_BOND_ESCROW() view returns (address)",
      "function STRATEGY() view returns (address)",
      "function activeRoundId() view returns (uint256)",
    ],
    ethers.provider,
  );
  const escrowView = new ethers.Contract(
    escrowAddress,
    [
      "function VAULT() view returns (address)",
      "function BOND_AMOUNT() view returns (uint256)",
      "function REWARD_PER_PARTICIPANT_PASS() view returns (uint256)",
    ],
    ethers.provider,
  );
  const adapterView = new ethers.Contract(
    adapterAddress,
    [
      "function vault() view returns (address)",
      "function asset() view returns (address)",
      "function COMET() view returns (address)",
      "function marketIntegrity() view returns (bool)",
    ],
    ethers.provider,
  );
  const [
    underlying,
    rate,
    decimals,
    asset,
    vaultUnderlying,
    vaultEscrow,
    vaultStrategy,
    escrowVault,
    bondAmount,
    reward,
    adapterVault,
    adapterAsset,
    adapterComet,
    marketIntegrity,
    activeRoundId,
  ] = await Promise.all([
    wrapperView.underlying(),
    wrapperView.rate(),
    wrapperView.decimals(),
    vaultView.ASSET(),
    vaultView.UNDERLYING(),
    vaultView.SETTLEMENT_BOND_ESCROW(),
    vaultView.STRATEGY(),
    escrowView.VAULT(),
    escrowView.BOND_AMOUNT(),
    escrowView.REWARD_PER_PARTICIPANT_PASS(),
    adapterView.vault(),
    adapterView.asset(),
    adapterView.COMET(),
    adapterView.marketIntegrity(),
    vaultView.activeRoundId(),
  ]);
  const checks = {
    chainId: chain.chainId.toString(),
    canonicalUsdc: underlying.toLowerCase() === USDC.toLowerCase() && Number(decimals) === 6,
    wrapperRateOne: rate === 1n,
    vaultAsset: asset.toLowerCase() === wrapperAddress.toLowerCase(),
    vaultUnderlying: vaultUnderlying.toLowerCase() === USDC.toLowerCase(),
    vaultEscrow: vaultEscrow.toLowerCase() === escrowAddress.toLowerCase(),
    vaultStrategy: vaultStrategy.toLowerCase() === adapterAddress.toLowerCase(),
    escrowBackpointer: escrowVault.toLowerCase() === vaultAddress.toLowerCase(),
    adapterBackpointer: adapterVault.toLowerCase() === vaultAddress.toLowerCase(),
    adapterAsset: adapterAsset.toLowerCase() === USDC.toLowerCase(),
    adapterComet: adapterComet.toLowerCase() === COMET.toLowerCase(),
    marketIntegrity,
    bondAmount: bondAmount.toString() === BOND.toString(),
    rewardPerPass: reward.toString() === REWARD.toString(),
    activeRoundId: activeRoundId.toString() === "1",
  };
  if (Object.values(checks).some((value) => value === false)) throw new Error("DISPOSABLE_TOPOLOGY_CHECK_FAILED");

  const code = async (address: string) => {
    const runtime = await ethers.provider.getCode(address);
    return { bytes: (runtime.length - 2) / 2, sha256: sha256(runtime), keccak256: ethers.keccak256(runtime) };
  };
  const runtime = {
    wrapper: await code(wrapperAddress),
    vault: await code(vaultAddress),
    escrow: await code(escrowAddress),
    adapter: await code(adapterAddress),
  };
  const evidence = {
    schema: "leopold.disposable-v2-topology.v1",
    classification: "DISPOSABLE V2 SEPOLIA PROOF — NOT OFFICIAL DEPLOYMENT",
    capturedUtc: new Date().toISOString(),
    sourceCommitSha: provenance.commit,
    sourceBranch: provenance.branch,
    sourceTree: provenance.tree,
    artifactHashes: {
      vault: {
        creationBytecodeSha256: sha256(
          artifactBytecode("artifacts/contracts/LeopoldVaultV2.sol/LeopoldVaultV2.json", "bytecode"),
        ),
        deployedBytecodeSha256: sha256(
          artifactBytecode("artifacts/contracts/LeopoldVaultV2.sol/LeopoldVaultV2.json", "deployedBytecode"),
        ),
      },
      escrow: {
        creationBytecodeSha256: sha256(
          artifactBytecode(
            "artifacts/contracts/LeopoldSettlementBondEscrowV2.sol/LeopoldSettlementBondEscrowV2.json",
            "bytecode",
          ),
        ),
        deployedBytecodeSha256: sha256(
          artifactBytecode(
            "artifacts/contracts/LeopoldSettlementBondEscrowV2.sol/LeopoldSettlementBondEscrowV2.json",
            "deployedBytecode",
          ),
        ),
      },
    },
    network: { name: network.name, chainId: chain.chainId.toString() },
    disposableCadence: { roundDurationSeconds: DURATION, testOnly: true, productionCadenceUntouched: true },
    deployer: await deployer.getAddress(),
    constructorArguments: {
      wrapper: [],
      vault: [
        1,
        0,
        ethers.encodeBytes32String("DISPOSABLE V2 PROOF"),
        DURATION,
        wrapperAddress,
        firstRoundOpensAt.toString(),
        COMET,
        await deployer.getAddress(),
        1,
        BOND.toString(),
        REWARD.toString(),
      ],
    },
    contracts: {
      wrapper: { address: wrapperAddress, deployment: wrapperTx },
      vault: { address: vaultAddress, deployment: vaultTx },
      escrow: { address: escrowAddress },
      adapter: { address: adapterAddress },
    },
    topology: { canonicalUsdcAddress: USDC, compoundComet: COMET, ...checks },
    runtime,
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  const text = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(OUTPUT, text, { encoding: "utf8", mode: 0o600 });
  await writeFile(`${OUTPUT}.sha256`, `${sha256(text)}  ${path.basename(OUTPUT)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`DISPOSABLE_V2_TOPOLOGY_PASS ${vaultAddress} ${escrowAddress} ${sha256(text)}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown failure";
  console.error(`DISPOSABLE_V2_TOPOLOGY_FAILED ${message}`);
  process.exitCode = 1;
});
