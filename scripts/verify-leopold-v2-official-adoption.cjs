const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

const { Contract, JsonRpcProvider, Wallet, getCreateAddress } = require("ethers");
const policy = require("./leopold-v2-official-deployment-policy.cjs");
const runtimeVerifier = require("./leopold-v2-runtime-verifier.cjs");

const ROOT = path.resolve(__dirname, "..");
const ATTEMPT_PATH = path.resolve(
  process.env.LEOPOLD_V2_ADOPTION_RECORD ?? "/tmp/leopold-v2-official-attempt-unresolved.json",
);
const JOURNAL_PATH = "/tmp/leopold-v2-official-deployment-journal.json";
const V1_MANIFEST_PATH = path.join(ROOT, "config/leopold-frontend-contracts.json");
const BINDING_PATH = path.join(ROOT, "scripts/sg4-hcu-authority-bindings/v2.json");
const DISPOSABLE_EVIDENCE_PATH = path.join(ROOT, "evidence/deployment/LEOPOLD_DISPOSABLE_V2_PROOF_ABORTED.json");

const ADDRESSES = {
  wrapper: "0x3AD7490852eA0cf16F654Ce854B87227b4369b91",
  vault: "0x511c8ac93BC285662B9dbDF65a0a9E2Fb11e8c86",
  adapter: "0xaF86E3a111DEE690Fa37b986D5F777689488938d",
  escrow: "0x18F5C545D7f18350BEf44aC5C34D55B7C3b95E80",
};

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
    "function ROUND_DURATION() view returns (uint256)",
    "function VAULT_ID() view returns (uint256)",
    "function VAULT_TYPE() view returns (uint256)",
    "function VAULT_NAME() view returns (bytes32)",
    "function activeRoundId() view returns (uint256)",
  ],
  adapter: [
    "function vault() view returns (address)",
    "function asset() view returns (address)",
    "function COMET() view returns (address)",
    "function guardian() view returns (address)",
    "function marketIntegrity() view returns (bool)",
    "function positionIntegrity() view returns (bool)",
  ],
  escrow: [
    "function VAULT() view returns (address)",
    "function BOND_AMOUNT() view returns (uint256)",
    "function REWARD_PER_PARTICIPANT_PASS() view returns (uint256)",
    "function REFUND_PER_COMPLETED_PARTICIPANT() view returns (uint256)",
  ],
  comet: ["function baseToken() view returns (address)", "function baseScale() view returns (uint256)"],
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readEnv(filePath) {
  const values = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator > 0) values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

function artifact(name) {
  return JSON.parse(readFileSync(path.join(ROOT, `artifacts/contracts/${name}.sol/${name}.json`), "utf8"));
}

function gitV1AtPreparation() {
  return execFileSync(
    "git",
    ["show", `${policy.OFFICIAL_V2_DEPLOYMENT_PREP_SHA}:config/leopold-frontend-contracts.json`],
    {
      cwd: ROOT,
      encoding: "buffer",
    },
  );
}

function knownDisposableAddresses() {
  if (!existsSync(DISPOSABLE_EVIDENCE_PATH)) return [];
  const evidence = JSON.parse(readFileSync(DISPOSABLE_EVIDENCE_PATH, "utf8"));
  return Object.values(evidence.topology ?? {});
}

function assertReceiptMatches(label, tx, receipt, expected) {
  if (
    tx === null ||
    receipt === null ||
    receipt.status !== 1 ||
    tx.from.toLowerCase() !== expected.deployer.toLowerCase() ||
    tx.nonce !== expected.nonce ||
    receipt.blockNumber !== expected.blockNumber ||
    receipt.contractAddress?.toLowerCase() !== expected.address.toLowerCase()
  ) {
    throw new Error(`OFFICIAL_V2_ADOPTION_DEPLOYMENT_RECEIPT_MISMATCH:${label}`);
  }
}

async function main() {
  if (!existsSync(ATTEMPT_PATH)) throw new Error("OFFICIAL_V2_UNRESOLVED_ATTEMPT_RECORD_MISSING");
  if (!existsSync(JOURNAL_PATH)) throw new Error("OFFICIAL_V2_DEPLOYMENT_JOURNAL_MISSING");
  const record = JSON.parse(readFileSync(ATTEMPT_PATH, "utf8"));
  policy.validateUnresolvedAttemptRecord(record);
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8"));
  if (
    journal.schema !== "leopold.official-v2-deployment-journal.v1" ||
    journal.entries?.length !== 2 ||
    journal.entries.map((entry) => entry.label).join(",") !== "official-v2-wrapper,official-v2-vault"
  ) {
    throw new Error("OFFICIAL_V2_ADOPTION_DEPLOYMENT_JOURNAL_NOT_DEPLOYMENT_ONLY");
  }

  const environment = readEnv(path.join(ROOT, "keeper/.env"));
  const rpcUrls = policy.parseRpcUrls(environment.SEPOLIA_RPC_URL, environment.SEPOLIA_RPC_URLS);
  const providers = rpcUrls.map(
    (url) => new JsonRpcProvider(url, Number(policy.SEPOLIA_CHAIN_ID), { staticNetwork: true }),
  );
  const deploymentBlocks = [
    record.deploymentTransactions.wrapper.blockNumber,
    record.deploymentTransactions.vault.blockNumber,
  ];
  const finalizedBlocks = await Promise.all(providers.map((provider) => provider.getBlock("finalized")));
  if (finalizedBlocks.some((block) => block === null)) throw new Error("OFFICIAL_V2_ADOPTION_FINALIZED_BLOCK_MISSING");
  const finalized = finalizedBlocks[0];
  if (
    finalized === null ||
    finalized.hash === null ||
    finalizedBlocks.some((block) => block.number !== finalized.number || block.hash !== finalized.hash)
  ) {
    throw new Error("OFFICIAL_V2_ADOPTION_FINALIZED_BLOCK_DISAGREEMENT");
  }
  if (finalized.number < Math.max(...deploymentBlocks)) {
    throw new Error(`OFFICIAL_V2_ADOPTION_FINALITY_PENDING:${finalized.number}`);
  }

  const v1Before = gitV1AtPreparation();
  const v1Current = readFileSync(V1_MANIFEST_PATH);
  policy.assertV1ManifestUntouched(v1Before, v1Current);
  policy.assertBindingHashes({
    file: sha256(readFileSync(BINDING_PATH)),
    canonical: JSON.parse(readFileSync(BINDING_PATH, "utf8")).integrity.canonicalSha256,
  });
  policy.assertFreshAddresses(record.derivedAddresses, knownDisposableAddresses());
  const derivedPlan = {
    wrapper: getCreateAddress({ from: record.deployer, nonce: record.deploymentTransactions.wrapper.nonce }),
    vault: getCreateAddress({ from: record.deployer, nonce: record.deploymentTransactions.vault.nonce }),
  };
  derivedPlan.adapter = getCreateAddress({ from: derivedPlan.vault, nonce: 1 });
  derivedPlan.escrow = getCreateAddress({ from: derivedPlan.vault, nonce: 2 });
  for (const [label, address] of Object.entries(derivedPlan)) {
    if (address.toLowerCase() !== record.derivedAddresses[label].toLowerCase()) {
      throw new Error(`OFFICIAL_V2_ADOPTION_CREATE_ADDRESS_MISMATCH:${label}`);
    }
  }

  const controlledKeys = ["KEEPER_PRIVATE_KEY", "SMOKE_PARTICIPANT_A_PRIVATE_KEY", "SMOKE_PARTICIPANT_B_PRIVATE_KEY"];
  const controlledWallets = controlledKeys.map((key) => {
    const privateKey = environment[key];
    if (!/^0x[0-9a-fA-F]{64}$/u.test(privateKey ?? "")) {
      throw new Error(`OFFICIAL_V2_ADOPTION_CONTROLLED_WALLET_MISSING:${key}`);
    }
    return { role: key, address: new Wallet(privateKey).address };
  });
  const walletNonces = await Promise.all(
    controlledWallets.map(async ({ role, address }) => ({
      role,
      address,
      nonce: await providers[0].getTransactionCount(address),
    })),
  );
  if (walletNonces.some((wallet) => wallet.nonce !== 0))
    throw new Error("OFFICIAL_V2_ADOPTION_CONTROLLED_ACTIVITY_DETECTED");

  const results = [];
  for (const [index, provider] of providers.entries()) {
    const chainId = (await provider.getNetwork()).chainId;
    policy.assertChainId(chainId);
    const txResults = {};
    for (const [label, expected] of Object.entries({
      wrapper: record.deploymentTransactions.wrapper,
      vault: record.deploymentTransactions.vault,
    })) {
      const tx = await provider.getTransaction(expected.hash);
      const receipt = await provider.getTransactionReceipt(expected.hash);
      assertReceiptMatches(label, tx, receipt, { ...expected, deployer: record.deployer });
      txResults[label] = {
        hash: expected.hash,
        nonce: tx.nonce,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        status: receipt.status,
        contractAddress: receipt.contractAddress,
      };
    }

    const wrapperCode = await provider.getCode(ADDRESSES.wrapper, finalized.number);
    const vaultCode = await provider.getCode(ADDRESSES.vault, finalized.number);
    const adapterCode = await provider.getCode(ADDRESSES.adapter, finalized.number);
    const escrowCode = await provider.getCode(ADDRESSES.escrow, finalized.number);
    const runtime = {
      wrapper: runtimeVerifier.verifyRuntimeTemplate({
        root: ROOT,
        liveCode: wrapperCode,
        sourceName: "contracts/LeopoldConfidentialUSDC.sol",
        contractName: "LeopoldConfidentialUSDC",
        label: "wrapper",
        expectedNormalizedSha256: policy.V2_WRAPPER_NORMALIZED_RUNTIME_SHA256,
      }),
      vault: runtimeVerifier.verifyRuntimeTemplate({
        root: ROOT,
        liveCode: vaultCode,
        sourceName: "contracts/LeopoldVaultV2.sol",
        contractName: "LeopoldVaultV2",
        label: "vault",
        expectedNormalizedSha256: policy.V2_VAULT_RUNTIME_SHA256,
      }),
      adapter: runtimeVerifier.verifyRuntimeTemplate({
        root: ROOT,
        liveCode: adapterCode,
        sourceName: "contracts/LeopoldCompoundAdapter.sol",
        contractName: "LeopoldCompoundAdapter",
        label: "adapter",
        expectedNormalizedSha256: policy.V2_ADAPTER_NORMALIZED_RUNTIME_SHA256,
        buildInfoAnchor: { sourceName: "contracts/LeopoldVaultV2.sol", contractName: "LeopoldVaultV2" },
      }),
      escrow: runtimeVerifier.verifyRuntimeTemplate({
        root: ROOT,
        liveCode: escrowCode,
        sourceName: "contracts/LeopoldSettlementBondEscrowV2.sol",
        contractName: "LeopoldSettlementBondEscrowV2",
        label: "escrow",
        expectedNormalizedSha256: policy.V2_ESCROW_RUNTIME_SHA256,
      }),
    };
    const wrapper = new Contract(ADDRESSES.wrapper, ABI.wrapper, provider);
    const vault = new Contract(ADDRESSES.vault, ABI.vault, provider);
    const adapter = new Contract(ADDRESSES.adapter, ABI.adapter, provider);
    const escrow = new Contract(ADDRESSES.escrow, ABI.escrow, provider);
    const comet = new Contract(policy.COMPOUND_COMET, ABI.comet, provider);
    const options = { blockTag: finalized.number };
    const [
      wrapperUnderlying,
      wrapperRate,
      wrapperDecimals,
      vaultAsset,
      vaultUnderlying,
      vaultStrategy,
      vaultEscrow,
      roundDuration,
      vaultId,
      vaultType,
      vaultName,
      activeRoundId,
      adapterVault,
      adapterAsset,
      adapterComet,
      guardian,
      marketIntegrity,
      positionIntegrity,
      escrowVault,
      bondAmount,
      reward,
      refund,
      baseToken,
      baseScale,
    ] = await Promise.all([
      wrapper.underlying(options),
      wrapper.rate(options),
      wrapper.decimals(options),
      vault.ASSET(options),
      vault.UNDERLYING(options),
      vault.STRATEGY(options),
      vault.SETTLEMENT_BOND_ESCROW(options),
      vault.ROUND_DURATION(options),
      vault.VAULT_ID(options),
      vault.VAULT_TYPE(options),
      vault.VAULT_NAME(options),
      vault.activeRoundId(options),
      adapter.vault(options),
      adapter.asset(options),
      adapter.COMET(options),
      adapter.guardian(options),
      adapter.marketIntegrity(options),
      adapter.positionIntegrity(options),
      escrow.VAULT(options),
      escrow.BOND_AMOUNT(options),
      escrow.REWARD_PER_PARTICIPANT_PASS(options),
      escrow.REFUND_PER_COMPLETED_PARTICIPANT(options),
      comet.baseToken(options),
      comet.baseScale(options),
    ]);
    policy.assertExternalConfiguration({ usdc: wrapperUnderlying, comet: adapterComet });
    policy.assertExternalConfiguration({ usdc: baseToken, comet: policy.COMPOUND_COMET });
    policy.assertImmutableValue(wrapperUnderlying, policy.CANONICAL_USDC, "wrapper.underlying");
    policy.assertImmutableValue(wrapperRate, 1n, "wrapper.rate");
    policy.assertImmutableValue(wrapperDecimals, 6n, "wrapper.decimals");
    policy.assertImmutableValue(vaultAsset, ADDRESSES.wrapper, "vault.ASSET");
    policy.assertImmutableValue(vaultUnderlying, policy.CANONICAL_USDC, "vault.UNDERLYING");
    policy.assertImmutableValue(vaultStrategy, ADDRESSES.adapter, "vault.STRATEGY");
    policy.assertImmutableValue(vaultEscrow, ADDRESSES.escrow, "vault.SETTLEMENT_BOND_ESCROW");
    policy.assertImmutableValue(roundDuration, 86_400n, "vault.ROUND_DURATION");
    policy.assertImmutableValue(vaultId, 1n, "vault.VAULT_ID");
    policy.assertImmutableValue(vaultType, 0n, "vault.VAULT_TYPE");
    policy.assertImmutableValue(
      vaultName,
      "0x4461696c79000000000000000000000000000000000000000000000000000000",
      "vault.VAULT_NAME",
    );
    policy.assertImmutableValue(activeRoundId, 1n, "vault.activeRoundId");
    policy.assertImmutableValue(adapterVault, ADDRESSES.vault, "adapter.vault");
    policy.assertImmutableValue(adapterAsset, policy.CANONICAL_USDC, "adapter.asset");
    policy.assertImmutableValue(adapterComet, policy.COMPOUND_COMET, "adapter.COMET");
    policy.assertImmutableValue(guardian, record.deployer, "adapter.guardian");
    policy.assertImmutableValue(escrowVault, ADDRESSES.vault, "escrow.VAULT");
    policy.assertImmutableValue(bondAmount, 5_000_000_000_000_000n, "escrow.BOND_AMOUNT");
    policy.assertImmutableValue(reward, 1_250_000_000_000_000n, "escrow.REWARD_PER_PARTICIPANT_PASS");
    policy.assertImmutableValue(refund, 2_500_000_000_000_000n, "escrow.REFUND_PER_COMPLETED_PARTICIPANT");
    policy.assertImmutableValue(baseToken, policy.CANONICAL_USDC, "compound.baseToken");
    policy.assertImmutableValue(baseScale, 1_000_000n, "compound.baseScale");

    const forbiddenAuthorityNames = new Set(["owner", "admin", "decryptionAuthority", "decryptionKey"]);
    const artifactNames = {
      wrapper: "LeopoldConfidentialUSDC",
      vault: "LeopoldVaultV2",
      adapter: "LeopoldCompoundAdapter",
      escrow: "LeopoldSettlementBondEscrowV2",
    };
    const unexpectedAuthorityFunctions = Object.entries(artifactNames).flatMap(([label, name]) =>
      artifact(name)
        .abi.filter((item) => item.type === "function" && forbiddenAuthorityNames.has(item.name))
        .map((item) => `${label}.${item.name}`),
    );
    if (unexpectedAuthorityFunctions.length > 0) throw new Error("OFFICIAL_V2_ADOPTION_UNEXPECTED_AUTHORITY");

    results.push({
      endpoint: index === 0 ? "primary" : "publicnode",
      chainId: chainId.toString(),
      finalized: { number: finalized.number, hash: finalized.hash, timestamp: finalized.timestamp },
      transactions: txResults,
      addresses: ADDRESSES,
      runtime,
      topology: {
        wrapperUnderlying,
        wrapperRate: wrapperRate.toString(),
        wrapperDecimals: Number(wrapperDecimals),
        vaultAsset,
        vaultUnderlying,
        vaultStrategy,
        vaultEscrow,
        adapterVault,
        adapterAsset,
        adapterComet,
        guardian,
        escrowVault,
        baseToken,
        baseScale: baseScale.toString(),
        marketIntegrity,
        positionIntegrity,
      },
    });
  }

  const comparable = (result) =>
    JSON.stringify({
      finalized: result.finalized,
      transactions: result.transactions,
      addresses: result.addresses,
      topology: result.topology,
      runtime: Object.fromEntries(
        Object.entries(result.runtime).map(([label, value]) => [
          label,
          {
            liveRuntimeBytes: value.liveRuntimeBytes,
            liveRuntimeSha256: value.liveRuntimeSha256,
            normalizedRuntimeSha256: value.normalizedRuntimeSha256,
            expectedNormalizedRuntimeSha256: value.expectedNormalizedRuntimeSha256,
          },
        ]),
      ),
    });
  if (comparable(results[0]) !== comparable(results[1])) throw new Error("OFFICIAL_V2_ADOPTION_RPC_STATE_DISAGREEMENT");

  console.log(
    JSON.stringify(
      {
        result: "OFFICIAL_V2_ADOPTION_READ_ONLY_REVERIFICATION_PASS",
        adoptionStatus: "PENDING_EXPLICIT_APPROVAL",
        adoptionApproved: false,
        originalRunnerFailure: "OFFICIAL_V2_COMPOUND_COMET_MISMATCH",
        deploymentTransactionsSucceeded: true,
        noParticipantOrKeeperActivityDuringUnresolvedState: true,
        sourceCandidateSha: record.sourceCandidateSha,
        deploymentPrepSha: record.deploymentPrepSha,
        deploymentJournalPath: JOURNAL_PATH,
        controlledWalletNonces: walletNonces,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`OFFICIAL_V2_ADOPTION_READ_ONLY_FAILED ${error instanceof Error ? error.message : "UNKNOWN_FAILURE"}`);
  process.exitCode = 1;
});
