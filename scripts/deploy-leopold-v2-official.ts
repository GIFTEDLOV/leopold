import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getCreateAddress, JsonRpcProvider, type InterfaceAbi, type TransactionRequest } from "ethers";
import { ethers, network } from "hardhat";
import { vars } from "hardhat/config";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const policy = require("./leopold-v2-official-deployment-policy.cjs");

const ROOT = path.resolve(__dirname, "..");
const KEEPER_ENV_PATH = path.join(ROOT, "keeper/.env");
const V1_MANIFEST_PATH = path.join(ROOT, "config/leopold-frontend-contracts.json");
const V2_BINDING_PATH = path.join(ROOT, "scripts/sg4-hcu-authority-bindings/v2.json");
const V2_RELEASE_PATH = path.join(ROOT, "config/leopold-v2-release.json");
const V2_EVIDENCE_PATH = path.join(ROOT, "evidence/deployment/LEOPOLD_OFFICIAL_V2_DEPLOYMENT.json");
const V2_KEEPER_MANIFEST_PATH = path.join(ROOT, "config/leopold-v2-official-manifest.json");
const JOURNAL_PATH = path.resolve(
  process.env.LEOPOLD_V2_OFFICIAL_DEPLOYMENT_JOURNAL ?? "/tmp/leopold-v2-official-deployment-journal.json",
);
const DRY_RUN = process.env.LEOPOLD_V2_OFFICIAL_DRY_RUN === "1";

const WRAPPER_RUNTIME_SHA256 = "3346df4a1411a5170f3a3ff189dd4828805897f85d6766970eac75b73b7ca438";
const ADAPTER_RUNTIME_SHA256 = "ac244dfaf00045224206e4763438222c1e1336adfaac74086293e88d6872d45e";
const ABI = {
  wrapper: [
    "function underlying() view returns (address)",
    "function rate() view returns (uint256)",
    "function decimals() view returns (uint8)",
  ],
  vault: [
    "function ASSET() view returns (address)",
    "function UNDERLYING() view returns (address)",
    "function STRATEGY() view returns (address)",
    "function SETTLEMENT_BOND_ESCROW() view returns (address)",
    "function ROUND_DURATION() view returns (uint64)",
    "function VAULT_ID() view returns (uint8)",
    "function VAULT_TYPE() view returns (uint8)",
    "function VAULT_NAME() view returns (bytes32)",
    "function activeRoundId() view returns (uint256)",
    "function roundInfo(uint256) view returns (uint64,uint64,uint8,uint128,uint64,uint256,uint256,uint256)",
  ],
  escrow: [
    "function VAULT() view returns (address)",
    "function BOND_AMOUNT() view returns (uint256)",
    "function REWARD_PER_PARTICIPANT_PASS() view returns (uint256)",
    "function REFUND_PER_COMPLETED_PARTICIPANT() view returns (uint256)",
  ],
  adapter: [
    "function vault() view returns (address)",
    "function asset() view returns (address)",
    "function COMET() view returns (address)",
    "function guardian() view returns (address)",
    "function marketIntegrity() view returns (bool)",
    "function positionIntegrity() view returns (bool)",
  ],
  comet: ["function baseToken() view returns (address)", "function baseScale() view returns (uint256)"],
};

type EnvMap = Record<string, string>;
type ReceiptRecord = {
  readonly label: string;
  readonly hash: string;
  readonly nonce: number;
  readonly submittedAt: string;
  readonly blockNumber?: number;
  readonly blockHash?: string;
  readonly gasUsed?: string;
  readonly status?: number;
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readEnvFile(filePath: string): EnvMap {
  if (!existsSync(filePath)) throw new Error("OFFICIAL_V2_KEEPER_ENV_FILE_MISSING");
  const result: EnvMap = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    result[key] = value;
  }
  return result;
}

function gitValue(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function loadArtifact(name: string): { abi: InterfaceAbi; bytecode: string; deployedBytecode: string } {
  const filePath = path.join(ROOT, `artifacts/contracts/${name}.sol/${name}.json`);
  const artifact = JSON.parse(readFileSync(filePath, "utf8")) as {
    abi: InterfaceAbi;
    bytecode: string;
    deployedBytecode: string;
  };
  if (!/^0x[0-9a-f]*$/iu.test(artifact.bytecode) || !/^0x[0-9a-f]*$/iu.test(artifact.deployedBytecode)) {
    throw new Error(`OFFICIAL_V2_ARTIFACT_MALFORMED:${name}`);
  }
  return artifact;
}

function artifactRuntimeSha256(name: string): string {
  return sha256(Buffer.from(loadArtifact(name).deployedBytecode.slice(2), "hex"));
}

function sourceSha256(relativePath: string): string {
  return sha256(readFileSync(path.join(ROOT, relativePath)));
}

function atomicWrite(filePath: string, text: string, mode = 0o600): void {
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, text, { encoding: "utf8", mode });
  renameSync(temporary, filePath);
}

function knownDisposableAddresses(): string[] {
  const filePath = path.join(ROOT, "evidence/deployment/LEOPOLD_DISPOSABLE_V2_PROOF_ABORTED.json");
  if (!existsSync(filePath)) return [];
  const evidence = JSON.parse(readFileSync(filePath, "utf8")) as { topology?: Record<string, string> };
  return Object.values(evidence.topology ?? {});
}

async function loadPreconditions(): Promise<{
  readonly keeperAddress: string;
  readonly rpcUrls: readonly string[];
  readonly deployer: string;
  readonly candidateTree: string;
  readonly nonce: number;
  readonly addressPlan: ReturnType<typeof policy.deploymentAddressPlan>;
  readonly block: { number: number; hash: string; timestamp: number };
  readonly v1ManifestBytes: Buffer;
}> {
  if (network.name !== "sepolia") throw new Error("OFFICIAL_V2_DEPLOYMENT_REQUIRES_SEPOLIA");
  const chainId = (await ethers.provider.getNetwork()).chainId;
  policy.assertChainId(chainId);

  const keeperEnv = readEnvFile(KEEPER_ENV_PATH);
  const { keeperAddress, rpcUrls } = policy.assertKeeperConfiguration(keeperEnv, policy.EXPECTED_DEPLOYER);
  const configuredPrimary = vars.get("SEPOLIA_RPC_URL");
  if (keeperEnv.SEPOLIA_RPC_URL !== configuredPrimary)
    throw new Error("OFFICIAL_V2_PRIMARY_RPC_CONFIGURATION_MISMATCH");

  const provenance = {
    branch: gitValue("branch", "--show-current"),
    commit: gitValue("rev-parse", "HEAD"),
    tree: gitValue("rev-parse", "HEAD^{tree}"),
    clean: gitValue("status", "--porcelain", "--untracked-files=all") === "",
  };
  policy.assertCleanProvenance(provenance);
  const candidateTree = gitValue("rev-parse", `${policy.OFFICIAL_V2_CANDIDATE_SHA}^{tree}`);
  policy.assertCandidateIdentity(policy.OFFICIAL_V2_CANDIDATE_SHA, candidateTree);
  for (const relativePath of ["contracts/LeopoldVaultV2.sol", "contracts/LeopoldSettlementBondEscrowV2.sol"]) {
    const currentBlob = gitValue("hash-object", path.join(ROOT, relativePath));
    const candidateBlob = gitValue("rev-parse", `${policy.OFFICIAL_V2_CANDIDATE_SHA}:${relativePath}`);
    if (currentBlob !== candidateBlob) throw new Error(`OFFICIAL_V2_SOURCE_DRIFT:${relativePath}`);
  }
  policy.assertSourceHashes({
    "contracts/LeopoldVaultV2.sol": sourceSha256("contracts/LeopoldVaultV2.sol"),
    "contracts/LeopoldSettlementBondEscrowV2.sol": sourceSha256("contracts/LeopoldSettlementBondEscrowV2.sol"),
  });

  policy.assertArtifactHashes({
    vault: artifactRuntimeSha256("LeopoldVaultV2"),
    escrow: artifactRuntimeSha256("LeopoldSettlementBondEscrowV2"),
  });
  policy.assertBindingHashes({
    file: sha256(readFileSync(V2_BINDING_PATH)),
    canonical: (JSON.parse(readFileSync(V2_BINDING_PATH, "utf8")) as { integrity: { canonicalSha256: string } })
      .integrity.canonicalSha256,
  });
  const release = JSON.parse(readFileSync(V2_RELEASE_PATH, "utf8")) as {
    contracts: { deploymentAddresses: unknown };
    deploymentBoundary: { officialV1ManifestUnchanged: boolean; officialDeploymentPerformed: boolean };
  };
  if (release.contracts.deploymentAddresses !== null || !release.deploymentBoundary.officialV1ManifestUnchanged) {
    throw new Error("OFFICIAL_V2_RELEASE_BOUNDARY_ALREADY_CROSSED");
  }
  if (release.deploymentBoundary.officialDeploymentPerformed)
    throw new Error("OFFICIAL_V2_DEPLOYMENT_ALREADY_RECORDED");

  const deployer = policy.EXPECTED_DEPLOYER;
  const nonce = Number(await ethers.provider.getTransactionCount(deployer, "pending"));
  const addressPlan = policy.deploymentAddressPlan(deployer, nonce);
  policy.assertFreshAddresses(addressPlan, knownDisposableAddresses());

  const providers: JsonRpcProvider[] = rpcUrls.map(
    (url: string) => new JsonRpcProvider(url, Number(policy.SEPOLIA_CHAIN_ID), { staticNetwork: true }),
  );
  const blocks = await Promise.all(providers.map((provider: JsonRpcProvider) => provider.getBlock("finalized")));
  if (blocks.some((block) => block === null)) throw new Error("OFFICIAL_V2_FINALIZED_BLOCK_MISSING");
  const nonNullBlocks = blocks.filter((block): block is NonNullable<typeof block> => block !== null);
  const first = nonNullBlocks[0];
  if (first === undefined || first.hash === null) throw new Error("OFFICIAL_V2_FINALIZED_BLOCK_INVALID");
  if (nonNullBlocks.some((block) => block.hash !== first.hash || block.number !== first.number)) {
    throw new Error("OFFICIAL_V2_RPC_FINALIZED_BLOCK_DISAGREEMENT");
  }
  const latest = { number: first.number, hash: first.hash, timestamp: first.timestamp };
  const v1ManifestBytes = readFileSync(V1_MANIFEST_PATH);
  const plannedAddresses = Object.values(addressPlan) as string[];
  const codeResults = await Promise.all(
    providers.flatMap((provider: JsonRpcProvider) =>
      plannedAddresses.map((address: string) => provider.getCode(address)),
    ),
  );
  if (codeResults.some((code) => code !== "0x")) throw new Error("OFFICIAL_V2_ADDRESS_REUSE_OR_COLLISION");
  return { keeperAddress, rpcUrls, deployer, candidateTree, nonce, addressPlan, block: latest, v1ManifestBytes };
}

async function sendOnce(label: string, request: TransactionRequest, journal: ReceiptRecord[]): Promise<ReceiptRecord> {
  if (existsSync(JOURNAL_PATH) && journal.length === 0)
    throw new Error("OFFICIAL_V2_DEPLOYMENT_JOURNAL_ALREADY_EXISTS");
  const signer = await ethers.provider.getSigner();
  const tx = await signer.sendTransaction(request);
  const submitted: ReceiptRecord = { label, hash: tx.hash, nonce: tx.nonce, submittedAt: new Date().toISOString() };
  journal.push(submitted);
  atomicWrite(
    JOURNAL_PATH,
    `${JSON.stringify({ schema: "leopold.official-v2-deployment-journal.v1", entries: journal }, null, 2)}\n`,
  );
  let receipt;
  try {
    receipt = await tx.wait();
  } catch {
    receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    if (receipt === null) throw new Error(`OFFICIAL_V2_DEPLOYMENT_OUTCOME_UNKNOWN_NO_REBROADCAST:${label}:${tx.hash}`);
  }
  const reconciled = await ethers.provider.getTransactionReceipt(tx.hash);
  if (reconciled === null || reconciled.status !== 1)
    throw new Error(`OFFICIAL_V2_DEPLOYMENT_FAILED:${label}:${tx.hash}`);
  const finalRecord: ReceiptRecord = {
    ...submitted,
    blockNumber: reconciled.blockNumber,
    blockHash: reconciled.blockHash,
    gasUsed: reconciled.gasUsed.toString(),
    status: Number(reconciled.status),
  };
  journal[journal.length - 1] = finalRecord;
  atomicWrite(
    JOURNAL_PATH,
    `${JSON.stringify({ schema: "leopold.official-v2-deployment-journal.v1", entries: journal }, null, 2)}\n`,
  );
  return finalRecord;
}

async function main(): Promise<void> {
  const preconditions = await loadPreconditions();
  const wrapperArtifact = loadArtifact("LeopoldConfidentialUSDC");
  const vaultArtifact = loadArtifact("LeopoldVaultV2");
  const deployerSigner = await ethers.getSigners().then((signers) => signers[0]);
  if (
    deployerSigner === undefined ||
    (await deployerSigner.getAddress()).toLowerCase() !== preconditions.deployer.toLowerCase()
  ) {
    throw new Error("OFFICIAL_V2_DEPLOYER_SIGNER_MISMATCH");
  }
  const constructorArguments = {
    wrapper: [],
    vault: {
      vaultId: policy.OFFICIAL_V2_CONFIGURATION.vaultId,
      vaultType: policy.OFFICIAL_V2_CONFIGURATION.vaultType,
      vaultName: ethers.encodeBytes32String(policy.OFFICIAL_V2_CONFIGURATION.vaultName),
      roundDurationSeconds: policy.OFFICIAL_V2_CONFIGURATION.roundDurationSeconds,
      firstRoundOpensAt: preconditions.block.timestamp,
      compoundComet: policy.COMPOUND_COMET,
      strategyGuardian: preconditions.deployer,
      minimumStrategyEpochAge: policy.OFFICIAL_V2_CONFIGURATION.strategyMinimumEpochAgeSeconds,
      settlementBondAmountWei: policy.OFFICIAL_V2_CONFIGURATION.bondWei,
      settlementRewardPerParticipantPassWei: policy.OFFICIAL_V2_CONFIGURATION.rewardPerParticipantPassWei,
    },
  };
  if (DRY_RUN) {
    console.log(
      JSON.stringify(
        {
          result: "OFFICIAL_V2_DRY_RUN_PASS",
          candidate: policy.OFFICIAL_V2_CANDIDATE_SHA,
          tree: preconditions.candidateTree,
          deployer: preconditions.deployer,
          keeperAddress: preconditions.keeperAddress,
          rpcEndpointCount: preconditions.rpcUrls.length,
          block: preconditions.block,
          predictedAddresses: preconditions.addressPlan,
          constructorArguments,
          compiler: {
            version: "0.8.27",
            optimizerRuns: 1,
            viaIR: true,
            evmVersion: "cancun",
            metadataBytecodeHash: "none",
          },
          artifactRuntimeHashes: {
            vault: artifactRuntimeSha256("LeopoldVaultV2"),
            escrow: artifactRuntimeSha256("LeopoldSettlementBondEscrowV2"),
          },
        },
        null,
        2,
      ),
    );
    return;
  }
  if (existsSync(V2_EVIDENCE_PATH) || existsSync(V2_KEEPER_MANIFEST_PATH)) {
    throw new Error("OFFICIAL_V2_EVIDENCE_OR_KEEPER_MANIFEST_ALREADY_EXISTS");
  }

  const journal: ReceiptRecord[] = [];
  const wrapperFactory = new ethers.ContractFactory(wrapperArtifact.abi, wrapperArtifact.bytecode, deployerSigner);
  const wrapperTxRequest = await wrapperFactory.getDeployTransaction();
  const wrapperDeployment = await sendOnce("official-v2-wrapper", wrapperTxRequest, journal);
  const wrapperAddress = getCreateAddress({ from: preconditions.deployer, nonce: wrapperDeployment.nonce });
  const wrapper = new ethers.Contract(wrapperAddress, ABI.wrapper, ethers.provider);

  const vaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, deployerSigner);
  const vaultTxRequest = await vaultFactory.getDeployTransaction(
    constructorArguments.vault.vaultId,
    constructorArguments.vault.vaultType,
    constructorArguments.vault.vaultName,
    constructorArguments.vault.roundDurationSeconds,
    wrapperAddress,
    constructorArguments.vault.firstRoundOpensAt,
    constructorArguments.vault.compoundComet,
    constructorArguments.vault.strategyGuardian,
    constructorArguments.vault.minimumStrategyEpochAge,
    constructorArguments.vault.settlementBondAmountWei,
    constructorArguments.vault.settlementRewardPerParticipantPassWei,
  );
  const vaultDeployment = await sendOnce("official-v2-vault", vaultTxRequest, journal);
  const vaultAddress = getCreateAddress({ from: preconditions.deployer, nonce: vaultDeployment.nonce });
  const vault = new ethers.Contract(vaultAddress, ABI.vault, ethers.provider);
  const [adapterAddress, escrowAddress] = (await Promise.all([vault.STRATEGY(), vault.SETTLEMENT_BOND_ESCROW()])) as [
    string,
    string,
  ];
  policy.assertFreshAddresses(
    { wrapper: wrapperAddress, vault: vaultAddress, adapter: adapterAddress, escrow: escrowAddress },
    knownDisposableAddresses(),
  );

  const escrow = new ethers.Contract(escrowAddress, ABI.escrow, ethers.provider);
  const adapter = new ethers.Contract(adapterAddress, ABI.adapter, ethers.provider);
  const comet = new ethers.Contract(policy.COMPOUND_COMET, ABI.comet, ethers.provider);
  const [
    underlying,
    rate,
    decimals,
    vaultAsset,
    vaultUnderlying,
    vaultStrategy,
    vaultEscrow,
    roundDuration,
    vaultId,
    vaultType,
    vaultName,
    activeRoundId,
    escrowVault,
    bondAmount,
    reward,
    refund,
    adapterVault,
    adapterAsset,
    adapterComet,
    guardian,
    marketIntegrity,
    positionIntegrity,
    baseToken,
    baseScale,
  ] = await Promise.all([
    wrapper.underlying(),
    wrapper.rate(),
    wrapper.decimals(),
    vault.ASSET(),
    vault.UNDERLYING(),
    vault.STRATEGY(),
    vault.SETTLEMENT_BOND_ESCROW(),
    vault.ROUND_DURATION(),
    vault.VAULT_ID(),
    vault.VAULT_TYPE(),
    vault.VAULT_NAME(),
    vault.activeRoundId(),
    escrow.VAULT(),
    escrow.BOND_AMOUNT(),
    escrow.REWARD_PER_PARTICIPANT_PASS(),
    escrow.REFUND_PER_COMPLETED_PARTICIPANT(),
    adapter.vault(),
    adapter.asset(),
    adapter.COMET(),
    adapter.guardian(),
    adapter.marketIntegrity(),
    adapter.positionIntegrity(),
    comet.baseToken(),
    comet.baseScale(),
  ]);
  policy.assertExternalConfiguration({ usdc: underlying, comet: baseToken });
  if (
    rate !== 1n ||
    decimals !== 6n ||
    vaultAsset.toLowerCase() !== wrapperAddress.toLowerCase() ||
    vaultUnderlying.toLowerCase() !== policy.CANONICAL_USDC.toLowerCase() ||
    vaultStrategy.toLowerCase() !== adapterAddress.toLowerCase() ||
    vaultEscrow.toLowerCase() !== escrowAddress.toLowerCase() ||
    roundDuration !== BigInt(policy.OFFICIAL_V2_CONFIGURATION.roundDurationSeconds) ||
    vaultId !== BigInt(policy.OFFICIAL_V2_CONFIGURATION.vaultId) ||
    vaultType !== BigInt(policy.OFFICIAL_V2_CONFIGURATION.vaultType) ||
    ethers.decodeBytes32String(vaultName) !== policy.OFFICIAL_V2_CONFIGURATION.vaultName ||
    activeRoundId !== 1n ||
    escrowVault.toLowerCase() !== vaultAddress.toLowerCase() ||
    bondAmount.toString() !== policy.OFFICIAL_V2_CONFIGURATION.bondWei ||
    reward.toString() !== policy.OFFICIAL_V2_CONFIGURATION.rewardPerParticipantPassWei ||
    refund.toString() !== policy.OFFICIAL_V2_CONFIGURATION.refundPerCompletedParticipantWei ||
    adapterVault.toLowerCase() !== vaultAddress.toLowerCase() ||
    adapterAsset.toLowerCase() !== policy.CANONICAL_USDC.toLowerCase() ||
    adapterComet.toLowerCase() !== policy.COMPOUND_COMET.toLowerCase() ||
    guardian.toLowerCase() !== preconditions.deployer.toLowerCase() ||
    !marketIntegrity ||
    !positionIntegrity ||
    baseScale !== 1_000_000n
  )
    throw new Error("OFFICIAL_V2_TOPOLOGY_OR_CONSTRUCTOR_MISMATCH");

  const runtimeCode = async (address: string, expected: string, label: string) => {
    const code = await ethers.provider.getCode(address);
    if (code === "0x") throw new Error(`OFFICIAL_V2_RUNTIME_MISSING:${label}`);
    const digest = sha256(Buffer.from(code.slice(2), "hex"));
    policy.assertRuntimeHash(digest, expected, label);
    return { address, bytes: (code.length - 2) / 2, sha256: digest, keccak256: ethers.keccak256(code) };
  };
  const runtime = {
    wrapper: await runtimeCode(wrapperAddress, WRAPPER_RUNTIME_SHA256, "wrapper"),
    vault: await runtimeCode(vaultAddress, policy.V2_VAULT_RUNTIME_SHA256, "vault"),
    escrow: await runtimeCode(escrowAddress, policy.V2_ESCROW_RUNTIME_SHA256, "escrow"),
    adapter: await runtimeCode(adapterAddress, ADAPTER_RUNTIME_SHA256, "adapter"),
  };
  policy.assertV1ManifestUntouched(preconditions.v1ManifestBytes, readFileSync(V1_MANIFEST_PATH));

  const evidence = {
    schema: "leopold.official-v2-sepolia-deployment.v1",
    classification: "OFFICIAL V2 SEPOLIA TESTNET DEPLOYMENT",
    implementation: "v2",
    releaseEnvironment: "SEPOLIA_TESTNET",
    candidate: {
      commit: policy.OFFICIAL_V2_CANDIDATE_SHA,
      tree: preconditions.candidateTree,
      sg4Binding: {
        path: "scripts/sg4-hcu-authority-bindings/v2.json",
        fileSha256: policy.V2_BINDING_FILE_SHA256,
        canonicalSha256: policy.V2_BINDING_CANONICAL_SHA256,
      },
    },
    chainId: Number(policy.SEPOLIA_CHAIN_ID),
    deployer: preconditions.deployer,
    keeperAddress: preconditions.keeperAddress,
    wrapper: wrapperAddress,
    vault: vaultAddress,
    escrow: escrowAddress,
    adapter: adapterAddress,
    canonicalUsdc: policy.CANONICAL_USDC,
    compoundComet: policy.COMPOUND_COMET,
    deployments: { wrapper: wrapperDeployment, vault: vaultDeployment },
    constructorArguments,
    runtimeHashes: { wrapper: runtime.wrapper, vault: runtime.vault, escrow: runtime.escrow, adapter: runtime.adapter },
    compiler: { version: "0.8.27", optimizerRuns: 1, viaIR: true, evmVersion: "cancun", metadataBytecodeHash: "none" },
    deployment: {
      blockNumber: vaultDeployment.blockNumber,
      blockHash: vaultDeployment.blockHash,
      timestamp: new Date().toISOString(),
      finalizedSnapshot: preconditions.block,
    },
    topology: {
      wrapperUnderlying: underlying,
      wrapperRate: rate.toString(),
      wrapperDecimals: Number(decimals),
      vaultEscrow,
      vaultAdapter: vaultStrategy,
      adapterVault,
      adapterAsset,
      adapterComet,
      compoundBaseToken: baseToken,
      compoundBaseScale: baseScale.toString(),
      marketIntegrity,
      positionIntegrity,
    },
    cadence: policy.OFFICIAL_V2_CONFIGURATION,
    migrationPerformed: false,
    v1Preservation: {
      manifestPath: "config/leopold-frontend-contracts.json",
      unchanged: true,
      migrationPerformed: false,
    },
    sourceProvenance: {
      branchAtPreparation: "v2/official-deployment-prep",
      candidateCommit: policy.OFFICIAL_V2_CANDIDATE_SHA,
      candidateTree: preconditions.candidateTree,
    },
    deploymentJournalPath: JOURNAL_PATH,
  };
  policy.validateOfficialManifest(evidence);
  const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(V2_EVIDENCE_PATH, evidenceText, { encoding: "utf8", mode: 0o644 });
  const keeperManifest = {
    schema: "leopold.frontend-contract-manifest.v1",
    network: { name: "ethereum-sepolia", chainId: Number(policy.SEPOLIA_CHAIN_ID) },
    deploymentStatus: "OFFICIAL_SEPOLIA_DEPLOYED",
    authorityBinding: {
      targetId: "LEOPOLD_V2_SEPOLIA",
      targetScope: "LEOPOLD_V2_RELEASE",
      path: "scripts/sg4-hcu-authority-bindings/v2.json",
      schema: "zama-szn4.sg4-hcu-authority-binding.v5",
      recordVersion: 5,
    },
    officialVaults: [
      {
        id: policy.OFFICIAL_V2_CONFIGURATION.vaultId,
        type: "DAILY",
        name: policy.OFFICIAL_V2_CONFIGURATION.vaultName,
        roundDurationSeconds: policy.OFFICIAL_V2_CONFIGURATION.roundDurationSeconds,
        vault: vaultAddress,
        bondEscrow: escrowAddress,
        implementation: "v2",
        automaticEntry: true,
      },
    ],
    v1ManifestPath: "config/leopold-frontend-contracts.json",
    migrationPerformed: false,
  };
  writeFileSync(V2_KEEPER_MANIFEST_PATH, `${JSON.stringify(keeperManifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  console.log(`OFFICIAL_V2_DEPLOYMENT_PASS ${vaultAddress} ${escrowAddress}`);
  console.log(`OFFICIAL_V2_EVIDENCE_SHA256 ${sha256(evidenceText)}`);
  console.log(`OFFICIAL_V2_KEEPER_MANIFEST_SHA256 ${sha256(JSON.stringify(keeperManifest, null, 2) + "\n")}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "UNKNOWN_FAILURE";
  console.error(`OFFICIAL_V2_DEPLOYMENT_FAILED ${message}`);
  process.exitCode = 1;
});
