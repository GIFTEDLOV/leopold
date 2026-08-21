import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

const CHAIN_ID = 11_155_111n;
const DEPLOYER = "0x57357D26D1f56eca4556d271078A0239a7696Bbf";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const COMET = "0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e";
const LC_USDC = "0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8";
const BOND = ethers.parseEther("0.005");
const REWARD = ethers.parseEther("0.00125");
const EIP170_LIMIT = 24_576;
const REDEPLOYMENT_START_NONCE = 241;

const vaultDefinitions = [
  { id: 1, type: 0, name: "Daily", duration: 86_400 },
  { id: 2, type: 1, name: "Weekly", duration: 604_800 },
  { id: 3, type: 2, name: "Monthly", duration: 2_592_000 },
  { id: 4, type: 3, name: "Boost", duration: 604_800 },
] as const;

function sha256Hex(hex: string): string {
  return createHash("sha256")
    .update(Buffer.from(hex.slice(2), "hex"))
    .digest("hex");
}

function artifact(name: string): { abi: unknown[]; bytecode: string; deployedBytecode: string } {
  return JSON.parse(readFileSync(path.resolve(`artifacts/contracts/${name}.sol/${name}.json`), "utf8")) as {
    abi: unknown[];
    bytecode: string;
    deployedBytecode: string;
  };
}

async function requireCode(label: string, address: string): Promise<number> {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label}_HAS_NO_CODE`);
  return (code.length - 2) / 2;
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") throw new Error("P01_PREFLIGHT_REQUIRES_SEPOLIA");
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== CHAIN_ID) throw new Error(`UNEXPECTED_CHAIN:${chain.chainId.toString()}`);
  const [signer] = await ethers.getSigners();
  if (signer === undefined) throw new Error("DEPLOYER_SIGNER_UNAVAILABLE");
  if (signer.address.toLowerCase() !== DEPLOYER.toLowerCase()) {
    throw new Error(`UNEXPECTED_DEPLOYER:${signer.address}`);
  }

  const vaultArtifact = artifact("LeopoldVault");
  const correctedRuntimeBytes = (vaultArtifact.deployedBytecode.length - 2) / 2;
  const correctedHeadroom = EIP170_LIMIT - correctedRuntimeBytes;
  if (correctedRuntimeBytes !== 23_531 || correctedHeadroom !== 1_045) {
    throw new Error(`CORRECTED_RUNTIME_MISMATCH:${correctedRuntimeBytes}:${correctedHeadroom}`);
  }

  const [wrapperCodeBytes, usdcCodeBytes, cometCodeBytes] = await Promise.all([
    requireCode("LC_USDC", LC_USDC),
    requireCode("USDC", USDC),
    requireCode("COMET", COMET),
  ]);
  const wrapper = await ethers.getContractAt("LeopoldConfidentialUSDC", LC_USDC, signer);
  const comet = await ethers.getContractAt("ICompoundComet", COMET, signer);
  const [underlying, wrapperDecimals, rate, baseToken, baseScale, supplyPaused, withdrawPaused] = await Promise.all([
    wrapper.underlying(),
    wrapper.decimals(),
    wrapper.rate(),
    comet.baseToken(),
    comet.baseScale(),
    comet.isSupplyPaused(),
    comet.isWithdrawPaused(),
  ]);
  if (underlying.toLowerCase() !== USDC.toLowerCase() || wrapperDecimals !== 6n || rate !== 1n) {
    throw new Error("LC_USDC_CONFIGURATION_DRIFT");
  }
  if (baseToken.toLowerCase() !== USDC.toLowerCase() || baseScale !== 1_000_000n) {
    throw new Error("COMET_CONFIGURATION_DRIFT");
  }

  const latest = await ethers.provider.getBlock("latest");
  if (latest === null) throw new Error("LATEST_BLOCK_UNAVAILABLE");
  const factory = await ethers.getContractFactory("LeopoldVault", signer);
  const vaultGasEstimates: bigint[] = [];
  for (const definition of vaultDefinitions) {
    const transaction = await factory.getDeployTransaction(
      definition.id,
      definition.type,
      ethers.encodeBytes32String(definition.name),
      definition.duration,
      LC_USDC,
      latest.timestamp,
      COMET,
      DEPLOYER,
      60,
      BOND,
      REWARD,
    );
    vaultGasEstimates.push(await ethers.provider.estimateGas({ ...transaction, from: DEPLOYER }));
  }
  const registryReserveGas = 2_000_000n;
  const totalGas = vaultGasEstimates.reduce((sum, value) => sum + value, registryReserveGas);
  const feeData = await ethers.provider.getFeeData();
  const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (feePerGas === null) throw new Error("FEE_DATA_UNAVAILABLE");
  const requiredWei = totalGas * feePerGas;
  const requiredWithReserveWei = (requiredWei * 125n) / 100n;
  const balanceWei = await ethers.provider.getBalance(DEPLOYER);
  if (balanceWei < requiredWithReserveWei) {
    throw new Error(`INSUFFICIENT_SEPOLIA_ETH:${balanceWei.toString()}:${requiredWithReserveWei.toString()}`);
  }

  const [latestNonce, pendingNonce] = await Promise.all([
    ethers.provider.getTransactionCount(DEPLOYER, "latest"),
    ethers.provider.getTransactionCount(DEPLOYER, "pending"),
  ]);
  const nonceDerivedCandidates = await Promise.all(
    Array.from({ length: 5 }, async (_, index) => {
      const nonce = REDEPLOYMENT_START_NONCE + index;
      const address = ethers.getCreateAddress({ from: DEPLOYER, nonce });
      const code = await ethers.provider.getCode(address);
      return { nonce, address, codeBytes: (code.length - 2) / 2 };
    }),
  );

  console.log(
    JSON.stringify(
      {
        verdict: "LEOPOLD_P01_REDEPLOYMENT_PREFLIGHT_PASS",
        chainId: chain.chainId.toString(),
        deployer: DEPLOYER,
        correctedRuntimeBytes,
        correctedRuntimeSha256: sha256Hex(vaultArtifact.deployedBytecode),
        eip170Headroom: correctedHeadroom,
        wrapper: {
          address: LC_USDC,
          codeBytes: wrapperCodeBytes,
          underlying,
          decimals: wrapperDecimals.toString(),
          rate: rate.toString(),
        },
        usdc: { address: USDC, codeBytes: usdcCodeBytes },
        comet: {
          address: COMET,
          codeBytes: cometCodeBytes,
          baseToken,
          baseScale: baseScale.toString(),
          supplyPaused,
          withdrawPaused,
        },
        vaultGasEstimates: vaultGasEstimates.map(String),
        registryReserveGas: registryReserveGas.toString(),
        totalGas: totalGas.toString(),
        feePerGasWei: feePerGas.toString(),
        requiredWith25PercentReserveWei: requiredWithReserveWei.toString(),
        requiredWith25PercentReserveEth: ethers.formatEther(requiredWithReserveWei),
        deployerBalanceWei: balanceWei.toString(),
        deployerBalanceEth: ethers.formatEther(balanceWei),
        latestNonce,
        pendingNonce,
        nonceDerivedCandidates,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "P01_PREFLIGHT_UNKNOWN_FAILURE");
  process.exitCode = 1;
});
