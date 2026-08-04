import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";
import "solidity-coverage";

import "./tasks/accounts";
import "./tasks/FHECounter";
import "./tasks/sg1";

const LOCAL_MNEMONIC = "test test test test test test test test test test test junk";

function selectedNetwork(): string {
  const inlineNetwork = process.argv.find((argument) => argument.startsWith("--network="));

  if (inlineNetwork !== undefined) {
    return inlineNetwork.slice("--network=".length);
  }

  const networkFlagIndex = process.argv.indexOf("--network");

  if (networkFlagIndex >= 0) {
    return process.argv[networkFlagIndex + 1] ?? "hardhat";
  }

  return process.env.HARDHAT_NETWORK ?? "hardhat";
}

function selectedTask(): string {
  const task = process.argv
    .slice(2)
    .find((argument, index, argumentsList) => !argument.startsWith("-") && argumentsList[index - 1] !== "--network");

  return task ?? "help";
}

const activeNetwork = selectedNetwork();
const activeTask = selectedTask();
const isSepolia = activeNetwork === "sepolia";
const isSg1Task = activeTask === "sg1:preflight" || activeTask === "sg1:deploy" || activeTask === "sg1:probe";
const isVerificationTask = activeTask === "verify" || activeTask.startsWith("verify:");

function optionalVariable(name: string): string {
  try {
    return vars.get(name, "").trim();
  } catch {
    throw new Error("Hardhat variable access failed; sensitive details suppressed.");
  }
}

function sepoliaVariable(name: string): string {
  const value = optionalVariable(name);

  if (isSepolia && !isSg1Task && value.length === 0) {
    throw new Error(
      `Missing required Hardhat variable ${name} for Sepolia. ` +
        `Set it with "pnpm exec hardhat vars set ${name}" or provide ` +
        `HARDHAT_VAR_${name} through a secure environment.`,
    );
  }

  return value;
}

const SEPOLIA_RPC_URL = isSepolia ? sepoliaVariable("SEPOLIA_RPC_URL") : "";
const SEPOLIA_PRIVATE_KEY = isSepolia ? sepoliaVariable("SEPOLIA_PRIVATE_KEY") : "";
const ETHERSCAN_API_KEY = isSepolia && isVerificationTask ? optionalVariable("ETHERSCAN_API_KEY") : "";

if (isSepolia && isVerificationTask && ETHERSCAN_API_KEY.length === 0) {
  throw new Error(
    "Missing required Hardhat variable ETHERSCAN_API_KEY for " +
      "Sepolia verification. Set it with " +
      '"pnpm exec hardhat vars set ETHERSCAN_API_KEY" or provide ' +
      "HARDHAT_VAR_ETHERSCAN_API_KEY through a secure environment.",
  );
}

if (SEPOLIA_RPC_URL.length > 0) {
  let structurallyValidRpcUrl = false;

  try {
    const parsedRpcUrl = new URL(SEPOLIA_RPC_URL);
    structurallyValidRpcUrl =
      (parsedRpcUrl.protocol === "http:" || parsedRpcUrl.protocol === "https:") && parsedRpcUrl.hostname.length > 0;
  } catch {
    structurallyValidRpcUrl = false;
  }

  if (!structurallyValidRpcUrl) {
    throw new Error("Sepolia RPC URL validation failed; sensitive details suppressed.");
  }
}

if (SEPOLIA_PRIVATE_KEY.length > 0 && !/^0x[0-9a-fA-F]{64}$/u.test(SEPOLIA_PRIVATE_KEY)) {
  throw new Error("Sepolia private-key validation failed; sensitive details suppressed.");
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",

  namedAccounts: {
    deployer: 0,
  },

  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    },
  },

  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS === "true",
    excludeContracts: [],
  },

  networks: {
    hardhat: {
      accounts: {
        mnemonic: LOCAL_MNEMONIC,
      },
      chainId: 31337,
      live: false,
      saveDeployments: false,
    },

    anvil: {
      accounts: {
        mnemonic: LOCAL_MNEMONIC,
        path: "m/44'/60'/0'/0/",
        count: 10,
      },
      chainId: 31337,
      live: false,
      saveDeployments: false,
      url: "http://localhost:8545",
    },

    sepolia: {
      accounts: SEPOLIA_PRIVATE_KEY.length > 0 ? [SEPOLIA_PRIVATE_KEY] : [],
      chainId: 11155111,
      live: true,
      saveDeployments: true,
      url: SEPOLIA_RPC_URL.length > 0 ? SEPOLIA_RPC_URL : "http://127.0.0.1:1",
    },
  },

  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },

  solidity: {
    version: "0.8.27",
    settings: {
      metadata: {
        bytecodeHash: "none",
      },
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
    },
  },

  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
