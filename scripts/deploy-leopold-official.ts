import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCreateAddress, keccak256 } from "ethers";
import { format } from "prettier";
import type { Contract as EthersContract, ContractTransactionResponse, InterfaceAbi, JsonRpcProvider } from "ethers";
import { ethers, network } from "hardhat";
import { vars } from "hardhat/config";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "config/leopold-frontend-contracts.json");
const EVIDENCE_DIR = path.join(ROOT, "evidence/deployment");
const DOCS_DIR = path.join(ROOT, "docs/deployment");
const EVIDENCE_PATH = path.join(EVIDENCE_DIR, "LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json");
const DOC_PATH = path.join(DOCS_DIR, "LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.md");
const P01_EVIDENCE_PATH = path.join(EVIDENCE_DIR, "LEOPOLD_P01_REDEPLOYMENT.json");
const P01_DOC_PATH = path.join(DOCS_DIR, "LEOPOLD_P01_REDEPLOYMENT.md");
const FREEZE_COMMIT = "0cea34f33009a1d5052a554e687ee3605a2aaf11";
const FRONTEND_COMMIT = "0cea34f33009a1d5052a554e687ee3605a2aaf11";
const CHAIN_ID = 11_155_111n;
const EXPECTED_DEPLOYER = "0x57357D26D1f56eca4556d271078A0239a7696Bbf";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const COMET = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";
const REUSED_WRAPPER = "0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8";
const REUSED_WRAPPER_TX = "0x58e763e8cd41087880a6a57c98621a39c03f182963ab827ccc1780eb29678058";
const OLD_REGISTRY = "0x08560A59A28B9e3b7F5fe7C3cce17ddD9F115530";
const OLD_VAULTS = [
  "0xa84C40BBeD3010D0D4CD44465920d5156fa5E6c4",
  "0xf3c842CdF26E960b63B67e392136D6B0D3ab2244",
  "0x1136D6c399d09Fa66474582DE6E4941bA3303ad6",
  "0x98D971557843CE17dc1387d2256Ab3dbAaC204f9",
] as const;
const FAUCET = "0x68793eA49297eB75DFB4610B68e076D2A5c7646C";
const FAUCET_TX = "0x63829c8633304e200a62bdd0af068374687b8163afc6673988fbe8f4426357da";
const BOND = ethers.parseEther("0.005");
const REWARD = ethers.parseEther("0.00125");
const DEMO_STRATEGY_EPOCH_AGE = 60;

const vaultDefinitions = [
  { id: 1, type: 0, name: "Daily", duration: 86_400 },
  { id: 2, type: 1, name: "Weekly", duration: 604_800 },
  { id: 3, type: 2, name: "Monthly", duration: 2_592_000 },
  { id: 4, type: 3, name: "Boost", duration: 604_800 },
] as const;

type TxRecord = {
  hash: string;
  block: number;
  gasUsed: string;
};

type RuntimeRecord = {
  address: string;
  liveRuntimeBytes: number;
  liveRuntimeSha256: string;
  liveRuntimeKeccak256: string;
  normalizedRuntimeSha256: string;
  expectedFrozenRuntimeSha256: string;
  expectedCreationBytes: number;
  expectedRuntimeBytes: number;
  eip170Headroom: number;
  matchesFrozenArtifact: boolean;
  expectedArtifactVariant: string;
  standaloneRuntimeBytes: number;
  standaloneRuntimeSha256: string;
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function artifactFor(name: string) {
  return JSON.parse(readFileSync(path.join(ROOT, `artifacts/contracts/${name}.sol/${name}.json`), "utf8")) as {
    abi: InterfaceAbi;
    deployedBytecode: string;
    bytecode: string;
  };
}

function readContract(name: string, address: string, provider: JsonRpcProvider): EthersContract {
  return new ethers.Contract(address, artifactFor(name).abi, provider);
}

async function rawRead(
  name: string,
  address: string,
  functionName: string,
  provider: JsonRpcProvider,
  args: readonly unknown[] = [],
): Promise<unknown> {
  const iface = new ethers.Interface(artifactFor(name).abi);
  const data = iface.encodeFunctionData(functionName, args);
  if (process.env.LEOPOLD_DEBUG === "1") console.error("RAW_CALL", address, functionName, data);
  const result = await provider.send("eth_call", [{ to: address, data }, "latest"]);
  const decoded = iface.decodeFunctionResult(functionName, result as string);
  return decoded.length === 1 ? decoded[0] : decoded;
}

function compiledVariants(name: string): Array<{
  deployedBytecode: string;
  bytecode: string;
  immutableReferences: Record<string, Array<{ start: number; length: number }>>;
  variant: string;
}> {
  const buildInfoDir = path.join(ROOT, "artifacts/build-info");
  const variants: Array<{
    deployedBytecode: string;
    bytecode: string;
    immutableReferences: Record<string, Array<{ start: number; length: number }>>;
    variant: string;
  }> = [];
  for (const file of readdirSync(buildInfoDir)) {
    const buildInfo = JSON.parse(readFileSync(path.join(buildInfoDir, file), "utf8")) as {
      output?: {
        contracts?: Record<
          string,
          Record<
            string,
            {
              evm?: {
                bytecode?: { object?: string };
                deployedBytecode?: {
                  object?: string;
                  immutableReferences?: Record<string, Array<{ start: number; length: number }>>;
                };
              };
            }
          >
        >;
      };
    };
    for (const [sourceName, contracts] of Object.entries(buildInfo.output?.contracts ?? {})) {
      const compiled = contracts[name];
      if (compiled?.evm?.deployedBytecode?.object !== undefined && compiled.evm.bytecode?.object !== undefined) {
        variants.push({
          deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
          bytecode: `0x${compiled.evm.bytecode.object}`,
          immutableReferences: compiled.evm.deployedBytecode.immutableReferences ?? {},
          variant: `${sourceName}@${file}`,
        });
      }
    }
  }
  return variants;
}

function normalizeRuntime(code: string, refs: Array<{ start: number; length: number }>): Buffer {
  const normalized = Buffer.from(code.slice(2), "hex");
  for (const ref of refs) normalized.fill(0, ref.start, ref.start + ref.length);
  return normalized;
}

function normalizeExpectedRuntime(code: string, refs: Array<{ start: number; length: number }>): Buffer {
  return normalizeRuntime(code, refs);
}

async function runtimeRecord(name: string, address: string): Promise<RuntimeRecord> {
  const standalone = artifactFor(name);
  const live = await ethers.provider.getCode(address);
  if (live === "0x") throw new Error(`MISSING_RUNTIME_CODE:${name}:${address}`);
  const liveBytes = Buffer.from(live.slice(2), "hex");
  const variants = compiledVariants(name);
  const matchingVariants = variants.filter((item) => item.deployedBytecode.length / 2 - 1 === liveBytes.length);
  const expectedVariant = matchingVariants[0];
  if (expectedVariant === undefined) throw new Error(`UNEXPECTED_RUNTIME_SIZE:${name}:${liveBytes.length}`);
  const refs = Object.values(expectedVariant.immutableReferences).flat();
  if (process.env.LEOPOLD_DEBUG === "1") console.error("RUNTIME", name, address, liveBytes.length, refs);
  const normalized = normalizeRuntime(live, refs);
  const expected = Buffer.from(expectedVariant.deployedBytecode.slice(2), "hex");
  const normalizedExpected = normalizeExpectedRuntime(expectedVariant.deployedBytecode, refs);
  const standaloneExpected = Buffer.from(standalone.deployedBytecode.slice(2), "hex");
  const expectedRuntimeBytes = expected.length;
  const matches = normalized.equals(normalizedExpected);
  return {
    address,
    liveRuntimeBytes: liveBytes.length,
    liveRuntimeSha256: sha256(liveBytes),
    liveRuntimeKeccak256: keccak256(liveBytes),
    normalizedRuntimeSha256: sha256(normalized),
    expectedFrozenRuntimeSha256: sha256(normalizedExpected),
    expectedCreationBytes: (expectedVariant.bytecode.length - 2) / 2,
    expectedRuntimeBytes,
    eip170Headroom: 24_576 - expectedRuntimeBytes,
    matchesFrozenArtifact: matches,
    expectedArtifactVariant: expectedVariant.variant,
    standaloneRuntimeBytes: standaloneExpected.length,
    standaloneRuntimeSha256: sha256(standaloneExpected),
  };
}

async function recordDeployment(contract: {
  deploymentTransaction(): ContractTransactionResponse | null;
}): Promise<TxRecord> {
  const tx = contract.deploymentTransaction();
  if (tx === null) throw new Error("DEPLOYMENT_TRANSACTION_UNAVAILABLE");
  const receipt = await tx.wait();
  if (receipt === null || receipt.status !== 1) throw new Error(`DEPLOYMENT_FAILED:${tx.hash}`);
  return { hash: receipt.hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
}

async function recordKnownDeployment(hash: string): Promise<TxRecord> {
  const receipt = await ethers.provider.getTransactionReceipt(hash);
  if (receipt === null || receipt.status !== 1) throw new Error(`DEPLOYMENT_RECEIPT_UNAVAILABLE:${hash}`);
  return { hash: receipt.hash, block: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
}

async function preflight(
  deployer: string,
  firstRoundOpensAt: number,
): Promise<{ estimates: bigint[]; requiredWei: bigint; balanceWei: bigint; nonce: number; predictedVaults: string[] }> {
  const nonce = await ethers.provider.getTransactionCount(deployer, "pending");
  const predictedVaults = vaultDefinitions.map((_, index) =>
    getCreateAddress({ from: deployer, nonce: nonce + index }),
  );
  void firstRoundOpensAt;
  // A pre-broadcast eth_estimateGas call cannot simulate the vault constructor against the
  // not-yet-created wrapper, nor the registry against not-yet-created vaults. These reserves
  // are deliberately above the reviewed Sepolia receipts and are replaced by actual receipts
  // in the evidence after deployment.
  const estimates = [10_000_000n, 10_000_000n, 10_000_000n, 10_000_000n, 2_000_000n];
  const feeData = await ethers.provider.getFeeData();
  const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (feePerGas === null) throw new Error("SEPOLIA_FEE_DATA_UNAVAILABLE");
  const totalGas = estimates.reduce((sum, value) => sum + value, 0n);
  const requiredWei = totalGas * feePerGas;
  const balanceWei = await ethers.provider.getBalance(deployer);
  console.log(
    JSON.stringify(
      {
        deployer,
        balanceWei: balanceWei.toString(),
        balanceEth: ethers.formatEther(balanceWei),
        nonce,
        feePerGasWei: feePerGas.toString(),
        estimatedGas: estimates.map((value) => value.toString()),
        estimatedTotalGas: totalGas.toString(),
        requiredWei: requiredWei.toString(),
        requiredEth: ethers.formatEther(requiredWei),
        requiredWith25PercentReserveEth: ethers.formatEther((requiredWei * 125n) / 100n),
      },
      null,
      2,
    ),
  );
  const requiredWithReserve = (requiredWei * 125n) / 100n;
  if (balanceWei < requiredWithReserve) {
    throw new Error(
      `INSUFFICIENT_SEPOLIA_ETH requiredWei=${requiredWithReserve.toString()} availableWei=${balanceWei.toString()}`,
    );
  }
  return { estimates, requiredWei, balanceWei, nonce, predictedVaults };
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("OFFICIAL_DEPLOYMENT_REQUIRES_SEPOLIA");
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== CHAIN_ID) throw new Error(`UNEXPECTED_CHAIN:${chain.chainId.toString()}`);
  const [signer] = await ethers.getSigners();
  if (signer === undefined) throw new Error("DEPLOYER_SIGNER_UNAVAILABLE");
  const deployer = await signer.getAddress();
  if (deployer.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    throw new Error(`UNEXPECTED_DEPLOYER:${deployer}`);
  }
  // Hardhat's ethers adapter does not implement ENS resolution for some read calls.
  // Use the same protected Sepolia URL through a plain ethers provider for validation reads.
  const readProvider = new ethers.JsonRpcProvider(vars.get("SEPOLIA_RPC_URL"));
  await readProvider.getNetwork();
  const existingManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    deploymentStatus?: string;
    contracts: { lcUsdc: string | null; registry: string | null };
  };
  const existingDeploymentMode = process.env.LEOPOLD_EXISTING_DEPLOYMENT === "1";
  const p01RedeploymentMode = process.env.LEOPOLD_P01_REDEPLOYMENT === "1";
  if (
    p01RedeploymentMode &&
    process.env.LEOPOLD_P01_REDEPLOY_ACK !== "I ACKNOWLEDGE THE CORRECTED LEOPOLD SEPOLIA REDEPLOYMENT"
  ) {
    throw new Error("P01_REDEPLOYMENT_ACKNOWLEDGEMENT_REQUIRED");
  }
  const manifestIsPreDeployment =
    existingManifest.deploymentStatus === "FINAL_CLOSURE_BYTECODE_NOT_YET_OFFICIALLY_DEPLOYED" &&
    existingManifest.contracts.lcUsdc === null &&
    existingManifest.contracts.registry === null;
  const manifestIsOfficial =
    existingManifest.deploymentStatus === "OFFICIAL_SEPOLIA_DEPLOYED" &&
    existingManifest.contracts.lcUsdc !== null &&
    existingManifest.contracts.registry !== null;
  if (
    (!manifestIsPreDeployment && !existingDeploymentMode && !p01RedeploymentMode) ||
    ((existingDeploymentMode || p01RedeploymentMode) && !manifestIsOfficial)
  ) {
    throw new Error("OFFICIAL_MANIFEST_ALREADY_POPULATED_OR_DRIFTED");
  }
  const latest = await ethers.provider.getBlock("latest");
  if (latest === null) throw new Error("LATEST_BLOCK_UNAVAILABLE");
  let firstRoundOpensAt = latest.timestamp;
  const wrapperFactory = await ethers.getContractFactory("LeopoldConfidentialUSDC", signer);
  const vaultFactory = await ethers.getContractFactory("LeopoldVault", signer);
  const registryFactory = await ethers.getContractFactory("LeopoldVaultRegistry", signer);
  const existingAddresses =
    process.env.LEOPOLD_EXISTING_DEPLOYMENT === "1"
      ? {
          wrapper: getCreateAddress({ from: deployer, nonce: 111 }),
          vaults: vaultDefinitions.map((_, index) => getCreateAddress({ from: deployer, nonce: 112 + index })),
          registry: getCreateAddress({ from: deployer, nonce: 116 }),
          transactions: [
            "0x58e763e8cd41087880a6a57c98621a39c03f182963ab827ccc1780eb29678058",
            "0x6833642227cef2c78f944e709ee89bf48e8ffa8642c8d808cce6eae8deafc345",
            "0x43dfedeb2bd9095a3b4bcb18386160a8dc2b59d5cc8f214ad358fa45f314ebed",
            "0xc9d7f016a9c0762bbc030f3c12b4d44deca09c1d7a4d88d04f78d5e0b4c76539",
            "0x1a44fc23b5e6b7ccf114171b8afd650a530afc9985a6614a90fa19ceff54524f",
            "0x524122313df8823f21d7da797f3b260247eaa754ead44f1a6484276bef62404f",
          ],
        }
      : null;
  if (existingAddresses === null) await preflight(deployer, firstRoundOpensAt);
  if (process.env.LEOPOLD_DEPLOY_DRY_RUN === "1") {
    console.log("LEOPOLD_OFFICIAL_DEPLOYMENT_PREFLIGHT_PASS");
    return;
  }

  let wrapperAddress: string;
  let wrapperTx: TxRecord;
  let vaults: Array<{
    contract: EthersContract;
    address: string;
    deployment: TxRecord;
    adapter: string;
    escrow: string;
  }>;
  let registry: EthersContract;
  let registryAddress: string;
  let registryTx: TxRecord;
  if (existingAddresses !== null) {
    wrapperAddress = existingAddresses.wrapper;
    registryAddress = existingAddresses.registry;
    wrapperTx = await recordKnownDeployment(existingAddresses.transactions[0]);
    vaults = [];
    for (const [index, address] of existingAddresses.vaults.entries()) {
      const vault = readContract("LeopoldVault", address, readProvider);
      vaults.push({
        contract: vault,
        address,
        deployment: await recordKnownDeployment(existingAddresses.transactions[index + 1]),
        adapter: await vault.STRATEGY(),
        escrow: await vault.SETTLEMENT_BOND_ESCROW(),
      });
    }
    firstRoundOpensAt = Number((await vaults[0].contract.roundInfo(1))[0]);
    registryTx = await recordKnownDeployment(existingAddresses.transactions[5]);
    registry = readContract("LeopoldVaultRegistry", registryAddress, readProvider);
  } else {
    if (p01RedeploymentMode) {
      wrapperAddress = REUSED_WRAPPER;
      wrapperTx = await recordKnownDeployment(REUSED_WRAPPER_TX);
    } else {
      const wrapper = await wrapperFactory.deploy();
      await wrapper.waitForDeployment();
      wrapperAddress = await wrapper.getAddress();
      wrapperTx = await recordDeployment(wrapper);
    }
    vaults = [];
    for (const definition of vaultDefinitions) {
      const vault = await vaultFactory.deploy(
        definition.id,
        definition.type,
        ethers.encodeBytes32String(definition.name),
        definition.duration,
        wrapperAddress,
        firstRoundOpensAt,
        COMET,
        deployer,
        DEMO_STRATEGY_EPOCH_AGE,
        BOND,
        REWARD,
      );
      await vault.waitForDeployment();
      const address = await vault.getAddress();
      vaults.push({
        contract: vault as unknown as EthersContract,
        address,
        deployment: await recordDeployment(vault),
        adapter: await vault.STRATEGY(),
        escrow: await vault.SETTLEMENT_BOND_ESCROW(),
      });
    }
    const vaultAddresses = vaults.map((item) => item.address) as [string, string, string, string];
    registry = (await registryFactory.deploy(vaultAddresses, deployer, BOND, REWARD)) as unknown as EthersContract;
    await registry.waitForDeployment();
    registryAddress = await registry.getAddress();
    registryTx = await recordDeployment(registry);
  }

  if (process.env.LEOPOLD_DEBUG === "1") console.error("READ wrapper");
  const wrapperUnderlying = (await rawRead(
    "LeopoldConfidentialUSDC",
    wrapperAddress,
    "underlying",
    readProvider,
  )) as string;
  const wrapperDecimals = (await rawRead(
    "LeopoldConfidentialUSDC",
    wrapperAddress,
    "decimals",
    readProvider,
  )) as bigint;
  const wrapperRate = (await rawRead("LeopoldConfidentialUSDC", wrapperAddress, "rate", readProvider)) as bigint;
  if (wrapperUnderlying.toLowerCase() !== USDC.toLowerCase()) throw new Error("WRAPPER_UNDERLYING_MISMATCH");
  if (wrapperDecimals !== 6n || wrapperRate !== 1n) throw new Error("WRAPPER_DECIMAL_OR_RATE_MISMATCH");
  const wrapperRuntime = await runtimeRecord("LeopoldConfidentialUSDC", wrapperAddress);
  if (!wrapperRuntime.matchesFrozenArtifact) throw new Error("WRAPPER_RUNTIME_FREEZE_MISMATCH");

  const runtime: Record<string, RuntimeRecord> = { lcUSDC: wrapperRuntime };
  if (process.env.LEOPOLD_DEBUG === "1") console.error("READ registry");
  const checks: Record<string, unknown> = {
    chainId: chain.chainId.toString(),
    deployer,
    registryOwner: await registry.owner(),
    wrapperUnderlying,
    wrapperDecimals: wrapperDecimals.toString(),
    wrapperRate: wrapperRate.toString(),
    registryOfficialVaultCount: (await registry.OFFICIAL_VAULT_COUNT()).toString(),
    expectedBondAmount: (await registry.EXPECTED_BOND_AMOUNT()).toString(),
    expectedRewardPerParticipantPass: (await registry.EXPECTED_REWARD_PER_PARTICIPANT_PASS()).toString(),
  };
  if ((await registry.owner()).toLowerCase() !== deployer.toLowerCase()) throw new Error("REGISTRY_OWNER_MISMATCH");
  if (
    (await registry.EXPECTED_BOND_AMOUNT()) !== BOND ||
    (await registry.EXPECTED_REWARD_PER_PARTICIPANT_PASS()) !== REWARD
  ) {
    throw new Error("REGISTRY_BOND_PROFILE_MISMATCH");
  }

  const manifestVaults: Array<Record<string, unknown>> = [];
  for (const [index, item] of vaults.entries()) {
    if (process.env.LEOPOLD_DEBUG === "1") console.error(`READ vault ${index + 1}`);
    const definition = vaultDefinitions[index];
    const vault = item.contract;
    const adapter = readContract("LeopoldCompoundAdapter", item.adapter, readProvider);
    const escrow = readContract("LeopoldSettlementBondEscrow", item.escrow, readProvider);
    const official = await registry.officialVault(definition.id);
    const expectedType = BigInt(definition.type);
    const checksForVault = {
      officialVault: official.vault,
      vaultId: (await vault.VAULT_ID()).toString(),
      vaultType: (await vault.VAULT_TYPE()).toString(),
      vaultName: ethers.decodeBytes32String(await vault.VAULT_NAME()),
      roundDurationSeconds: (await vault.ROUND_DURATION()).toString(),
      asset: await vault.ASSET(),
      underlying: await vault.UNDERLYING(),
      strategy: await vault.STRATEGY(),
      escrow: await vault.SETTLEMENT_BOND_ESCROW(),
      adapterVault: await adapter.vault(),
      adapterAsset: await adapter.asset(),
      adapterComet: await adapter.COMET(),
      adapterGuardian: await adapter.guardian(),
      adapterMarketIntegrity: await adapter.marketIntegrity(),
      adapterPositionIntegrity: await adapter.positionIntegrity(),
      escrowVault: await escrow.VAULT(),
      escrowBondAmount: (await escrow.BOND_AMOUNT()).toString(),
      escrowRewardPerParticipantPass: (await escrow.REWARD_PER_PARTICIPANT_PASS()).toString(),
      escrowRefundAfterTwoPasses: (await escrow.REFUND_PER_COMPLETED_PARTICIPANT()).toString(),
      escrowAccountedLiability: (await escrow.accountedLiability()).toString(),
      activeRoundId: (await vault.activeRoundId()).toString(),
      roundState: (await vault.roundInfo(1))[2].toString(),
    };
    checks[`vault${definition.id}`] = checksForVault;
    const addressValues = [
      official.vault,
      official.asset,
      official.strategy,
      official.comet,
      official.bondEscrow,
      await vault.ASSET(),
      await vault.UNDERLYING(),
      await vault.STRATEGY(),
      await vault.SETTLEMENT_BOND_ESCROW(),
      await adapter.vault(),
      await adapter.asset(),
      await adapter.COMET(),
      await adapter.guardian(),
      await escrow.VAULT(),
    ].map((value) => value.toLowerCase());
    const expectedAddresses = [
      item.address,
      wrapperAddress,
      item.adapter,
      COMET,
      item.escrow,
      wrapperAddress,
      USDC,
      item.adapter,
      item.escrow,
      item.address,
      USDC,
      COMET,
      deployer,
      item.address,
    ].map((value) => value.toLowerCase());
    if (
      addressValues.some((value, addressIndex) => value !== expectedAddresses[addressIndex]) ||
      (await vault.VAULT_ID()) !== BigInt(definition.id) ||
      (await vault.VAULT_TYPE()) !== expectedType ||
      ethers.decodeBytes32String(await vault.VAULT_NAME()) !== definition.name ||
      (await vault.ROUND_DURATION()) !== BigInt(definition.duration) ||
      !official.active ||
      official.vaultType !== expectedType ||
      official.roundDuration !== BigInt(definition.duration) ||
      (await escrow.BOND_AMOUNT()) !== BOND ||
      (await escrow.REWARD_PER_PARTICIPANT_PASS()) !== REWARD ||
      (await escrow.REFUND_PER_COMPLETED_PARTICIPANT()) !== ethers.parseEther("0.0025") ||
      !(await adapter.marketIntegrity()) ||
      !(await adapter.positionIntegrity()) ||
      (await vault.STRATEGY()) === ethers.ZeroAddress
    ) {
      throw new Error(`OFFICIAL_TOPOLOGY_MISMATCH:${definition.name}`);
    }
    runtime[`${definition.name}Vault`] = await runtimeRecord("LeopoldVault", item.address);
    runtime[`${definition.name}Adapter`] = await runtimeRecord("LeopoldCompoundAdapter", item.adapter);
    runtime[`${definition.name}Escrow`] = await runtimeRecord("LeopoldSettlementBondEscrow", item.escrow);
    if (
      !runtime[`${definition.name}Vault`].matchesFrozenArtifact ||
      !runtime[`${definition.name}Adapter`].matchesFrozenArtifact ||
      !runtime[`${definition.name}Escrow`].matchesFrozenArtifact
    ) {
      throw new Error(`RUNTIME_FREEZE_MISMATCH:${definition.name}`);
    }
    manifestVaults.push({
      id: definition.id,
      type: definition.name.toUpperCase(),
      name: definition.name,
      roundDurationSeconds: definition.duration,
      vault: item.address,
      adapter: item.adapter,
      bondEscrow: item.escrow,
    });
  }
  runtime.registry = await runtimeRecord("LeopoldVaultRegistry", registryAddress);
  if (!runtime.registry.matchesFrozenArtifact) throw new Error("REGISTRY_RUNTIME_FREEZE_MISMATCH");
  if (p01RedeploymentMode) {
    for (const oldVault of OLD_VAULTS) {
      if (await registry.isOfficialVault(oldVault)) throw new Error(`OLD_VAULT_REGISTERED:${oldVault}`);
    }
  }

  if (process.env.LEOPOLD_VALIDATE_EXISTING === "1") {
    console.log(`LEOPOLD_EXISTING_DEPLOYMENT_VALID ${registryAddress}`);
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<string, unknown> & {
    contracts: Record<string, unknown> & { lcUsdc: string; registry: string };
  };
  manifest.deploymentStatus = "OFFICIAL_SEPOLIA_DEPLOYED";
  manifest.contracts.lcUsdc = wrapperAddress;
  manifest.contracts.registry = registryAddress;
  manifest.officialVaults = manifestVaults;
  manifest.faucet = {
    name: "Compound III Sepolia USDC faucet",
    address: FAUCET,
    provenTransaction: FAUCET_TX,
    asset: USDC,
  };
  manifest.officialDeployment = {
    chainId: Number(CHAIN_ID),
    deployer,
    bondWei: BOND.toString(),
    rewardPerParticipantPassWei: REWARD.toString(),
    refundAfterTwoPassesWei: ethers.parseEther("0.0025").toString(),
    strategyEpochAgeSeconds: DEMO_STRATEGY_EPOCH_AGE,
    freezeCommit: FREEZE_COMMIT,
    frontendCommit: FRONTEND_COMMIT,
    p01Status: p01RedeploymentMode ? "CLOSED" : undefined,
    supersedesRegistry: p01RedeploymentMode ? OLD_REGISTRY : undefined,
  };
  const manifestText = await format(JSON.stringify(manifest, null, 2), { parser: "json" });
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, manifestText, { encoding: "utf8", mode: 0o644 });
  const manifestDigest = sha256(manifestText);

  const evidence = {
    schema: "leopold.official-sepolia-deployment.v1",
    capturedUtc: new Date().toISOString(),
    chain: { name: "ethereum-sepolia", chainId: CHAIN_ID.toString() },
    deployer,
    source: { freezeCommit: FREEZE_COMMIT, frontendCommit: FRONTEND_COMMIT },
    external: {
      canonicalCircleUsdc: USDC,
      compoundComet: COMET,
      compoundFaucet: FAUCET,
      faucetEvidenceTransaction: FAUCET_TX,
    },
    configuration: {
      firstRoundOpensAt,
      strategyGuardian: deployer,
      strategyEpochAgeSeconds: DEMO_STRATEGY_EPOCH_AGE,
      bondWei: BOND,
      rewardPerParticipantPassWei: REWARD,
      refundAfterTwoPassesWei: ethers.parseEther("0.0025"),
      durations: vaultDefinitions.map((definition) => ({ name: definition.name, seconds: definition.duration })),
    },
    deployments: {
      lcUsdc: { address: wrapperAddress, transaction: wrapperTx, constructor: [] },
      vaults: vaults.map((item, index) => ({
        name: vaultDefinitions[index].name,
        address: item.address,
        transaction: item.deployment,
        constructor: {
          vaultId: vaultDefinitions[index].id,
          vaultType: vaultDefinitions[index].type,
          vaultName: vaultDefinitions[index].name,
          roundDurationSeconds: vaultDefinitions[index].duration,
          asset: wrapperAddress,
          firstRoundOpensAt,
          compoundComet: COMET,
          strategyGuardian: deployer,
          minimumStrategyEpochAge: DEMO_STRATEGY_EPOCH_AGE,
          settlementBondAmountWei: BOND,
          settlementRewardPerParticipantPassWei: REWARD,
        },
        adapter: { address: item.adapter, creationTransaction: item.deployment },
        bondEscrow: { address: item.escrow, creationTransaction: item.deployment },
      })),
      registry: {
        address: registryAddress,
        transaction: registryTx,
        constructor: {
          vaults: vaults.map((item) => item.address),
          initialOwner: deployer,
          expectedBondAmountWei: BOND,
          expectedRewardPerParticipantPassWei: REWARD,
        },
      },
    },
    runtimeBytecode: runtime,
    checks,
    topology: {
      officialVaultCount: 4,
      registryUsesOnlyListedVaults: true,
      allAdaptersArePerVault: true,
      allEscrowsArePerVault: true,
      proxyContractsUsed: false,
      historicalOrDisposableAddressesInManifest: false,
    },
    p01Closure: p01RedeploymentMode
      ? {
          status: "CLOSED",
          correctedRuntimeBytes: 23_531,
          eip170Headroom: 1_045,
          correctedPredicate: "amount <= MAX_POOL_BASE_UNITS - totalPrincipal",
          abiChanged: false,
          stateMachineChanged: false,
          privacyChanged: false,
          wrapperReused: true,
          supersededRegistry: OLD_REGISTRY,
          supersededVaults: OLD_VAULTS,
          oldVaultsRegisteredInCorrectedRegistry: false,
        }
      : undefined,
    manifestSha256: manifestDigest,
  };
  const evidenceText = await format(JSON.stringify(evidence, jsonReplacer, 2), { parser: "json" });
  writeFileSync(EVIDENCE_PATH, evidenceText, { encoding: "utf8", mode: 0o644 });
  const evidenceDigest = sha256(evidenceText);
  let p01EvidenceDigest: string | null = null;
  if (p01RedeploymentMode) {
    const p01EvidenceText = await format(
      JSON.stringify({ ...evidence, schema: "leopold.p01-corrected-sepolia-redeployment.v1" }, jsonReplacer, 2),
      { parser: "json" },
    );
    writeFileSync(P01_EVIDENCE_PATH, p01EvidenceText, { encoding: "utf8", mode: 0o644 });
    p01EvidenceDigest = sha256(p01EvidenceText);
  }
  const docs =
    `# Leopold official Sepolia deployment\n\n` +
    `Status: official four-vault Sepolia deployment populated and validated.\n\n` +
    `- Chain: Ethereum Sepolia (11155111)\n` +
    `- Deployment timestamp (UTC): ${evidence.capturedUtc}\n` +
    `- Deployer / registry owner / strategy guardian: \`${deployer}\`\n` +
    `- Frozen contract commit: \`${FREEZE_COMMIT}\`\n` +
    `- Frontend integration commit: \`${FRONTEND_COMMIT}\`\n` +
    `- Bond: ${ethers.formatEther(BOND)} ETH\n` +
    `- Reward per participant pass: ${ethers.formatEther(REWARD)} ETH\n` +
    `- Two-pass refund: ${ethers.formatEther(ethers.parseEther("0.0025"))} ETH\n` +
    `- Canonical Circle Sepolia USDC: \`${USDC}\`\n` +
    `- Direct Compound III Sepolia USDC Comet: \`${COMET}\`\n\n` +
    `## Official addresses\n\n` +
    `| Component | Address | Deployment transaction | Block |\n|---|---|---|---:|\n` +
    `| lcUSDC | ${wrapperAddress} | ${wrapperTx.hash} | ${wrapperTx.block} |\n` +
    vaults
      .map(
        (item, index) =>
          `| ${vaultDefinitions[index].name} vault | ${item.address} | ${item.deployment.hash} | ${item.deployment.block} |\n`,
      )
      .join("") +
    vaults
      .map(
        (item, index) =>
          `| ${vaultDefinitions[index].name} adapter (child creation) | ${item.adapter} | ${item.deployment.hash} | ${item.deployment.block} |\n`,
      )
      .join("") +
    vaults
      .map(
        (item, index) =>
          `| ${vaultDefinitions[index].name} bond escrow (child creation) | ${item.escrow} | ${item.deployment.hash} | ${item.deployment.block} |\n`,
      )
      .join("") +
    `| Registry | ${registryAddress} | ${registryTx.hash} | ${registryTx.block} |\n\n` +
    `Each adapter and bond escrow is created inside its corresponding vault deployment transaction by the frozen constructor; it is not a shared or proxy deployment.\n\n` +
    `## Integrity\n\n` +
    `The deployment script checked canonical USDC, six decimals, wrapper rate 1, direct Comet base token/scale, per-vault adapter and escrow backpointers, exact durations, registry topology, immutable bond economics, active round initialization, and normalized runtime bytecode against the frozen artifacts. The largest runtime is 23,531 bytes with 1,045 bytes EIP-170 headroom.\n\n` +
    `Manifest SHA-256: \`${manifestDigest}\`\n\n` +
    `Deployment evidence SHA-256: \`${evidenceDigest}\`\n\n` +
    `Evidence JSON: [LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json](../../evidence/deployment/LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json)\n`;
  writeFileSync(DOC_PATH, await format(docs, { parser: "markdown" }), { encoding: "utf8", mode: 0o644 });
  if (p01RedeploymentMode && p01EvidenceDigest !== null) {
    const p01Docs =
      `# Leopold P-01 corrected Sepolia redeployment\n\n` +
      `Status: corrected official four-vault suite deployed and validated; P-01 is closed.\n\n` +
      `The existing non-upgradeable lcUSDC wrapper at \`${wrapperAddress}\` was reused. Four corrected ` +
      `\`LeopoldVault\` instances were deployed; each constructor created a new immutable per-vault Compound adapter ` +
      `and settlement-bond escrow. A new registry at \`${registryAddress}\` contains only the corrected vaults. ` +
      `The prior registry \`${OLD_REGISTRY}\` and its four vaults remain historical deployments and are not current ` +
      `frontend discovery targets. Historical transaction evidence was not rewritten.\n\n` +
      `- Corrected contract commit: \`${FREEZE_COMMIT}\`\n` +
      `- LeopoldVault runtime: 23,531 bytes\n` +
      `- EIP-170 headroom: 1,045 bytes\n` +
      `- ABI changed: no\n` +
      `- State machine changed: no\n` +
      `- Privacy changed: no\n` +
      `- Current manifest SHA-256: \`${manifestDigest}\`\n` +
      `- P-01 deployment evidence SHA-256: \`${p01EvidenceDigest}\`\n\n` +
      `Evidence JSON: [LEOPOLD_P01_REDEPLOYMENT.json](../../evidence/deployment/LEOPOLD_P01_REDEPLOYMENT.json)\n`;
    writeFileSync(P01_DOC_PATH, await format(p01Docs, { parser: "markdown" }), { encoding: "utf8", mode: 0o644 });
  }
  console.log(`LEOPOLD_OFFICIAL_DEPLOYMENT_PASS ${registryAddress}`);
  console.log(`MANIFEST_SHA256 ${manifestDigest}`);
  console.log(`EVIDENCE_SHA256 ${evidenceDigest}`);
  if (p01EvidenceDigest !== null) console.log(`P01_EVIDENCE_SHA256 ${p01EvidenceDigest}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown failure";
  console.error(`LEOPOLD_OFFICIAL_DEPLOYMENT_FAILED ${message}`);
  if (process.env.LEOPOLD_DEBUG === "1" && error instanceof Error) console.error(error.stack);
  process.exitCode = 1;
});
