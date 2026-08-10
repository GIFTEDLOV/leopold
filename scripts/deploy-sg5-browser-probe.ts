import { ethers } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("SG5BrowserProbe", deployer);
  const contract = await factory.deploy();
  const deploymentTx = contract.deploymentTransaction();
  if (!deploymentTx) throw new Error("missing deployment transaction");
  const receipt = await deploymentTx.wait();
  const address = await contract.getAddress();
  const runtime = await ethers.provider.getCode(address);

  console.log(
    JSON.stringify({
      chainId: (await ethers.provider.getNetwork()).chainId.toString(),
      deployer: await deployer.getAddress(),
      transactionHash: deploymentTx.hash,
      blockNumber: receipt?.blockNumber ?? null,
      contractAddress: address,
      runtimeByteLength: (runtime.length - 2) / 2,
      compiler: "0.8.27",
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "SG-5 probe deployment failed");
  process.exitCode = 1;
});
