import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { FunctionFragment } from "ethers";
import type { LeopoldVault, LeopoldVaultRegistry, MockLeopoldAsset, MockLeopoldUnderlying } from "../types";

type Fixture = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  sponsor: HardhatEthersSigner;
  underlying: MockLeopoldUnderlying;
  asset: MockLeopoldAsset;
  vault: LeopoldVault;
};

const DAILY = 86_400;
const MAX_POOL = 1_000_000_000_000_000n;
const BOND = ethers.parseEther("0.001");

async function deployFixture(vaultId = 1, vaultType = 0, duration = DAILY): Promise<Fixture> {
  const [deployer, alice, bob, sponsor] = await ethers.getSigners();
  const underlying = (await (
    await ethers.getContractFactory("MockLeopoldUnderlying")
  ).deploy()) as MockLeopoldUnderlying;
  const asset = (await (
    await ethers.getContractFactory("MockLeopoldAsset")
  ).deploy(await underlying.getAddress())) as MockLeopoldAsset;
  const firstRoundOpensAt = await time.latest();
  const vault = (await (
    await ethers.getContractFactory("LeopoldVault")
  ).deploy(
    vaultId,
    vaultType,
    ethers.encodeBytes32String(["Daily", "Weekly", "Monthly", "Boost"][vaultType]),
    duration,
    await asset.getAddress(),
    firstRoundOpensAt,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
    ethers.parseEther("0.001"),
    ethers.parseEther("0.0002"),
  )) as LeopoldVault;
  return { deployer, alice, bob, sponsor, underlying, asset, vault };
}

async function fundConfidential(fixture: Fixture, account: HardhatEthersSigner, amount: bigint): Promise<void> {
  await fixture.underlying.mint(account.address, amount);
  await fixture.underlying.connect(account).approve(await fixture.asset.getAddress(), amount);
  await fixture.asset.connect(account).wrap(account.address, amount);
}

async function deposit(fixture: Fixture, account: HardhatEthersSigner, amount: bigint) {
  const assetAddress = await fixture.asset.getAddress();
  const input = await fhevm.createEncryptedInput(assetAddress, account.address).add64(amount).encrypt();
  return fixture.asset
    .connect(account)
    [
      "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
    ](await fixture.vault.getAddress(), input.handles[0], input.inputProof, "0x");
}

async function testOnlyCallReceiver(fixture: Fixture, account: HardhatEthersSigner, amount: bigint) {
  const assetAddress = await fixture.asset.getAddress();
  const input = await fhevm.createEncryptedInput(assetAddress, account.address).add64(amount).encrypt();
  return fixture.asset
    .connect(account)
    .testOnlyCallReceiver(await fixture.vault.getAddress(), account.address, input.handles[0], input.inputProof);
}

async function withdraw(fixture: Fixture, account: HardhatEthersSigner, amount: bigint) {
  const vaultAddress = await fixture.vault.getAddress();
  const input = await fhevm.createEncryptedInput(vaultAddress, account.address).add64(amount).encrypt();
  return fixture.vault.connect(account).withdraw(input.handles[0], input.inputProof);
}

async function enterRound(fixture: Fixture, account: HardhatEthersSigner, roundId = 1n) {
  const escrow = await ethers.getContractAt(
    "LeopoldSettlementBondEscrow",
    await fixture.vault.SETTLEMENT_BOND_ESCROW(),
  );
  return escrow.connect(account).registerForRound(roundId, { value: BOND });
}

async function materializeWeight(fixture: Fixture, account: HardhatEthersSigner, roundId: bigint): Promise<string> {
  const receipt = await (await fixture.vault.connect(account).materializeMyRoundWeight(roundId)).wait();
  for (const log of receipt!.logs) {
    try {
      const parsed = fixture.vault.interface.parseLog(log);
      if (parsed?.name === "RoundWeightMaterialized") return parsed.args.handle as string;
    } catch {
      // Ignore logs emitted by other contracts in the transaction.
    }
  }
  throw new Error("missing RoundWeightMaterialized event");
}

async function decryptPrincipal(fixture: Fixture, account: HardhatEthersSigner): Promise<bigint> {
  const handle = await fixture.vault.principalOf(account.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, await fixture.vault.getAddress(), account);
}

async function decryptConfidentialBalance(fixture: Fixture, account: HardhatEthersSigner): Promise<bigint> {
  const handle = await fixture.asset.confidentialBalanceOf(account.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, await fixture.asset.getAddress(), account);
}

describe("Leopold CP1 confidential vault foundation", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("keeps saving permissionless and makes prize eligibility a separate bonded action", async function () {
    const fixture = await deployFixture();
    await fundConfidential(fixture, fixture.alice, 100n);
    await expect(deposit(fixture, fixture.alice, 100n))
      .to.emit(fixture.vault, "DepositProcessed")
      .withArgs(fixture.alice.address, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(100n);
    await enterRound(fixture, fixture.alice);
    expect(await fixture.vault.eligibilityStart(1, fixture.alice.address)).not.to.equal(0n);
  });

  it("preserves exact cap, cap-plus-one, zero, and withdrawal-restored capacity", async function () {
    const fixture = await deployFixture();
    await fundConfidential(fixture, fixture.alice, MAX_POOL + 2n);

    await deposit(fixture, fixture.alice, 10n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(10n);

    await deposit(fixture, fixture.alice, MAX_POOL - 10n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(MAX_POOL);

    await deposit(fixture, fixture.alice, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(MAX_POOL);
    expect(await decryptConfidentialBalance(fixture, fixture.alice)).to.equal(2n);

    await deposit(fixture, fixture.alice, 0n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(MAX_POOL);
    expect(await decryptConfidentialBalance(fixture, fixture.alice)).to.equal(2n);

    await withdraw(fixture, fixture.alice, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(MAX_POOL - 1n);
    await deposit(fixture, fixture.alice, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(MAX_POOL);

    await deposit(fixture, fixture.alice, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(MAX_POOL);
    expect(await decryptConfidentialBalance(fixture, fixture.alice)).to.equal(2n);
  });

  it("rejects the high-width wrap vector without mutating principal, liquidity, or eligible accounting", async function () {
    const fixture = await deployFixture();
    const round = await fixture.vault.roundInfo(1);
    await enterRound(fixture, fixture.alice);
    await fundConfidential(fixture, fixture.alice, MAX_POOL);
    const depositReceipt = await (await deposit(fixture, fixture.alice, 10n)).wait();
    const depositBlock = await ethers.provider.getBlock(depositReceipt!.blockNumber);

    const wrapVector = (1n << 64n) - 10n + 1n;
    await testOnlyCallReceiver(fixture, fixture.alice, wrapVector);

    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(10n);

    await time.increaseTo(round[1]);
    await fixture.vault.closeRound();
    const aggregateHandle = await fixture.vault.aggregateTwabHandle(1);
    const aggregateResult = await fhevm.publicDecrypt([aggregateHandle]);
    expect(aggregateResult.clearValues[aggregateHandle as `0x${string}`]).to.equal(
      10n * (round[1] - BigInt(depositBlock!.timestamp)),
    );

    await withdraw(fixture, fixture.alice, 10n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(0n);
    await deposit(fixture, fixture.alice, MAX_POOL);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(MAX_POOL);
  });

  it("supports partial and full immediate withdrawals without duplicate entitlement", async function () {
    const fixture = await deployFixture();
    await fundConfidential(fixture, fixture.alice, 100n);
    await deposit(fixture, fixture.alice, 100n);
    await withdraw(fixture, fixture.alice, 40n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(60n);
    await withdraw(fixture, fixture.alice, 60n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(0n);
    await withdraw(fixture, fixture.alice, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(0n);
  });

  it("enforces the exclusive round-close boundary for deposits and withdrawals", async function () {
    const beforeClose = await deployFixture();
    await fundConfidential(beforeClose, beforeClose.alice, 10n);
    const closesAt = (await beforeClose.vault.roundInfo(1))[1];
    await time.setNextBlockTimestamp(closesAt - 1n);
    await expect(deposit(beforeClose, beforeClose.alice, 10n)).to.emit(beforeClose.vault, "DepositProcessed");
    await time.setNextBlockTimestamp(closesAt);
    await expect(withdraw(beforeClose, beforeClose.alice, 1n)).to.be.revertedWithCustomError(
      beforeClose.vault,
      "RoundNotOpen",
    );

    const atClose = await deployFixture();
    await fundConfidential(atClose, atClose.alice, 10n);
    await time.setNextBlockTimestamp((await atClose.vault.roundInfo(1))[1]);
    await expect(deposit(atClose, atClose.alice, 10n)).to.be.revertedWithCustomError(atClose.vault, "RoundNotOpen");
  });

  it("denies cross-user decryption of private principal", async function () {
    const fixture = await deployFixture();
    await fundConfidential(fixture, fixture.alice, 33n);
    await deposit(fixture, fixture.alice, 33n);
    const handle = await fixture.vault.principalOf(fixture.alice.address);
    let crossUserDecryptionDenied = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint64, handle, await fixture.vault.getAddress(), fixture.bob);
    } catch {
      crossUserDecryptionDenied = true;
    }
    expect(crossUserDecryptionDenied).to.equal(true);
  });

  it("commits public sponsor funding irreversibly without changing principal", async function () {
    const fixture = await deployFixture();
    await fixture.underlying.mint(fixture.sponsor.address, 75n);
    await fixture.underlying.connect(fixture.sponsor).approve(await fixture.vault.getAddress(), 75n);
    await expect(fixture.vault.connect(fixture.sponsor).contributeSponsor(1, 75))
      .to.emit(fixture.vault, "SponsorContributionCommitted")
      .withArgs(fixture.sponsor.address, 1n, 75n);
    expect(await fixture.vault.publicSponsoredPrize(1)).to.equal(75n);
    expect(await fixture.vault.principalOf(fixture.sponsor.address)).to.equal(ethers.ZeroHash);
    await time.increaseTo((await fixture.vault.roundInfo(1))[1]);
    await fixture.vault.closeRound();
    expect((await fixture.vault.roundInfo(1))[4]).to.equal(75n);
    const stateChanging = fixture.vault.interface.fragments
      .filter((fragment): fragment is FunctionFragment => fragment.type === "function")
      .filter((fragment) => !["view", "pure"].includes(fragment.stateMutability))
      .map((fragment) => fragment.name);
    expect(stateChanging).not.to.include("withdrawSponsor");
  });

  it("uses append-only deterministic round-scoped participation", async function () {
    const fixture = await deployFixture();
    await enterRound(fixture, fixture.bob);
    await enterRound(fixture, fixture.alice);
    const escrow = await ethers.getContractAt(
      "LeopoldSettlementBondEscrow",
      await fixture.vault.SETTLEMENT_BOND_ESCROW(),
    );
    expect((await escrow.roundInfo(1))[0]).to.equal(2n);
    await expect(enterRound(fixture, fixture.bob)).to.be.revertedWithCustomError(escrow, "AlreadyRegistered");
  });

  it("matches exact individual and aggregate TWAB after closing a round", async function () {
    const fixture = await deployFixture();
    const round = await fixture.vault.roundInfo(1);
    await fundConfidential(fixture, fixture.alice, 10n);
    await deposit(fixture, fixture.alice, 10n);
    const registrationReceipt = await (await enterRound(fixture, fixture.alice)).wait();
    const registrationBlock = await ethers.provider.getBlock(registrationReceipt!.blockNumber);
    await time.increaseTo(round[1]);
    await fixture.vault.closeRound();

    const expected = 10n * (round[1] - BigInt(registrationBlock!.timestamp));
    const aggregateHandle = await fixture.vault.aggregateTwabHandle(1);
    const aggregateResult = await fhevm.publicDecrypt([aggregateHandle]);
    expect(aggregateResult.clearValues[aggregateHandle as `0x${string}`]).to.equal(expected);
    await fixture.vault.finalizeAggregate(1, aggregateResult.abiEncodedClearValues, aggregateResult.decryptionProof);
    expect((await fixture.vault.roundInfo(1))[3]).to.equal(expected);

    // The new round is open while round 1 settles; withdrawing now cannot alter round 1 history.
    await withdraw(fixture, fixture.alice, 2n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(8n);

    const weightHandle = await materializeWeight(fixture, fixture.alice, 1n);
    expect(
      await fhevm.userDecryptEuint(FhevmType.euint128, weightHandle, await fixture.vault.getAddress(), fixture.alice),
    ).to.equal(expected);

    await fixture.vault.generateRandomCandidate(1);
    expect((await fixture.vault.roundInfo(1))[2]).to.equal(5n);
    await expect(fixture.vault.generateRandomCandidate(1)).to.be.reverted;
    const validityHandle = await fixture.vault.candidateValidityHandle(1);
    const validity = await fhevm.publicDecrypt([validityHandle]);
    await fixture.vault.finalizeCandidateValidity(1, validity.abiEncodedClearValues, validity.decryptionProof);
    const postValidityState = (await fixture.vault.roundInfo(1))[2];
    if (validity.clearValues[validityHandle as `0x${string}`]) {
      expect(postValidityState).to.equal(7n);
      await expect(fixture.vault.generateRandomCandidate(1)).to.be.reverted;
    } else {
      expect(postValidityState).to.equal(6n);
      await expect(fixture.vault.generateRandomCandidate(1)).not.to.be.reverted;
    }
  });

  it("keeps inactive-user historical TWAB exact across multiple missed rounds", async function () {
    const fixture = await deployFixture();
    const first = await fixture.vault.roundInfo(1);
    await fundConfidential(fixture, fixture.alice, 5n);
    await deposit(fixture, fixture.alice, 5n);
    await enterRound(fixture, fixture.alice);
    const registeredAt = await fixture.vault.eligibilityStart(1, fixture.alice.address);
    await time.increaseTo(first[1] + BigInt(DAILY * 2));
    await fixture.vault.closeRound();
    await fixture.vault.closeRound();
    await fixture.vault.closeRound();
    const handle = await materializeWeight(fixture, fixture.alice, 1n);
    expect(
      await fhevm.userDecryptEuint(FhevmType.euint128, handle, await fixture.vault.getAddress(), fixture.alice),
    ).to.equal(5n * (first[1] - registeredAt));
  });

  it("keeps the same wallet's vault positions and TWAB isolated", async function () {
    const first = await deployFixture(1, 0, DAILY);
    const secondVault = (await (
      await ethers.getContractFactory("LeopoldVault")
    ).deploy(
      2,
      1,
      ethers.encodeBytes32String("Weekly"),
      7 * DAILY,
      await first.asset.getAddress(),
      await time.latest(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      ethers.parseEther("0.001"),
      ethers.parseEther("0.0002"),
    )) as LeopoldVault;
    const second = { ...first, vault: secondVault };
    await enterRound(first, first.alice);
    await enterRound(second, second.alice);
    await fundConfidential(first, first.alice, 100n);
    await deposit(first, first.alice, 60n);
    await deposit(second, second.alice, 40n);
    expect(await decryptPrincipal(first, first.alice)).to.equal(60n);
    expect(await decryptPrincipal(second, second.alice)).to.equal(40n);
  });

  it("rejects invalid round duration and unauthorized asset callbacks", async function () {
    const fixture = await deployFixture();
    await expect(
      (await ethers.getContractFactory("LeopoldVault")).deploy(
        1,
        0,
        ethers.encodeBytes32String("Daily"),
        31_536_001,
        await fixture.asset.getAddress(),
        await time.latest(),
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        0,
        ethers.parseEther("0.001"),
        ethers.parseEther("0.0002"),
      ),
    ).to.be.revertedWithCustomError(fixture.vault, "InvalidConfiguration");
    await expect(
      fixture.vault.onConfidentialTransferReceived(fixture.alice.address, fixture.alice.address, ethers.ZeroHash, "0x"),
    ).to.be.revertedWithCustomError(fixture.vault, "UnauthorizedAsset");
  });
});

describe("Leopold official four-vault registry", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("accepts exactly the four locked configurations and limits admin to discovery status", async function () {
    const fixture = await deployFixture();
    const start = await time.latest();
    const configs = [
      [1, 0, "Daily", DAILY],
      [2, 1, "Weekly", 7 * DAILY],
      [3, 2, "Monthly", 30 * DAILY],
      [4, 3, "Boost", 7 * DAILY],
    ] as const;
    const vaults: LeopoldVault[] = [];
    for (const [id, kind, name, duration] of configs) {
      vaults.push(
        (await (
          await ethers.getContractFactory("LeopoldVault")
        ).deploy(
          id,
          kind,
          ethers.encodeBytes32String(name),
          duration,
          await fixture.asset.getAddress(),
          start,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
          ethers.parseEther("0.001"),
          ethers.parseEther("0.0002"),
        )) as LeopoldVault,
      );
    }
    const addresses = await Promise.all(vaults.map((vault) => vault.getAddress()));
    const officialAddresses: [string, string, string, string] = [
      addresses[0],
      addresses[1],
      addresses[2],
      addresses[3],
    ];
    const registry = (await (
      await ethers.getContractFactory("LeopoldVaultRegistry")
    ).deploy(
      officialAddresses,
      fixture.deployer.address,
      ethers.parseEther("0.001"),
      ethers.parseEther("0.0002"),
    )) as LeopoldVaultRegistry;
    expect(await registry.OFFICIAL_VAULT_COUNT()).to.equal(4n);
    for (let id = 1; id <= 4; id += 1) {
      const entry = await registry.officialVault(id);
      expect(entry.vault).to.equal(await vaults[id - 1].getAddress());
      expect(entry.roundDuration).to.equal(BigInt(configs[id - 1][3]));
      expect(entry.active).to.equal(true);
    }
    await expect(registry.connect(fixture.alice).setOfficialVaultActive(1, false)).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount",
    );
    await registry.setOfficialVaultActive(1, false);
    expect((await registry.officialVault(1)).active).to.equal(false);
    expect((await vaults[0].roundInfo(1))[2]).to.equal(1n);
  });

  it("rejects duplicate or misconfigured official entries", async function () {
    const fixture = await deployFixture();
    const address = await fixture.vault.getAddress();
    await expect(
      (await ethers.getContractFactory("LeopoldVaultRegistry")).deploy(
        [address, address, address, address],
        fixture.deployer.address,
        ethers.parseEther("0.001"),
        ethers.parseEther("0.0002"),
      ),
    ).to.be.reverted;

    const start = await time.latest();
    const configs = [
      [1, 0, "Daily", DAILY],
      [2, 1, "Weekly", 7 * DAILY],
      [3, 2, "Monthly", 30 * DAILY],
      [4, 3, "Boost", 7 * DAILY],
    ] as const;
    const vaults = await Promise.all(
      configs.map(async ([id, kind, name, duration]) =>
        (await ethers.getContractFactory("LeopoldVault")).deploy(
          id,
          kind,
          ethers.encodeBytes32String(name),
          duration,
          await fixture.asset.getAddress(),
          start,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
          ethers.parseEther("0.001"),
          ethers.parseEther("0.0002"),
        ),
      ),
    );
    const addresses = (await Promise.all(vaults.map((vault) => vault.getAddress()))) as [
      string,
      string,
      string,
      string,
    ];
    await expect(
      (await ethers.getContractFactory("LeopoldVaultRegistry")).deploy(
        addresses,
        fixture.deployer.address,
        ethers.parseEther("0.002"),
        ethers.parseEther("0.0002"),
      ),
    ).to.be.reverted;
    await expect(
      (await ethers.getContractFactory("LeopoldVaultRegistry")).deploy(
        addresses,
        fixture.deployer.address,
        ethers.parseEther("0.001"),
        ethers.parseEther("0.0001"),
      ),
    ).to.be.reverted;
  });
});
