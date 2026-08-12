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

async function withdraw(fixture: Fixture, account: HardhatEthersSigner, amount: bigint) {
  const vaultAddress = await fixture.vault.getAddress();
  const input = await fhevm.createEncryptedInput(vaultAddress, account.address).add64(amount).encrypt();
  return fixture.vault.connect(account).withdraw(input.handles[0], input.inputProof);
}

async function decryptPrincipal(fixture: Fixture, account: HardhatEthersSigner): Promise<bigint> {
  const handle = await fixture.vault.principalOf(account.address);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, await fixture.vault.getAddress(), account);
}

describe("Leopold CP1 confidential vault foundation", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("records deposits from the actual ERC-7984 callback amount and rejects unregistered accounts", async function () {
    const fixture = await deployFixture();
    await fundConfidential(fixture, fixture.alice, 100n);
    await expect(deposit(fixture, fixture.alice, 100n)).to.be.revertedWithCustomError(
      fixture.vault,
      "ParticipantNotRegistered",
    );
    await fixture.vault.connect(fixture.alice).registerParticipant();
    await expect(deposit(fixture, fixture.alice, 100n))
      .to.emit(fixture.vault, "DepositProcessed")
      .withArgs(fixture.alice.address, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(100n);
  });

  it("enforces the encrypted global principal cap and preserves refunded assets", async function () {
    const fixture = await deployFixture();
    await fixture.vault.connect(fixture.alice).registerParticipant();
    await fundConfidential(fixture, fixture.alice, MAX_POOL + 1n);
    await deposit(fixture, fixture.alice, MAX_POOL);
    await deposit(fixture, fixture.alice, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(MAX_POOL);
    const tokenBalanceHandle = await fixture.asset.confidentialBalanceOf(fixture.alice.address);
    expect(
      await fhevm.userDecryptEuint(
        FhevmType.euint64,
        tokenBalanceHandle,
        await fixture.asset.getAddress(),
        fixture.alice,
      ),
    ).to.equal(1n);
  });

  it("supports partial and full immediate withdrawals without duplicate entitlement", async function () {
    const fixture = await deployFixture();
    await fixture.vault.connect(fixture.alice).registerParticipant();
    await fundConfidential(fixture, fixture.alice, 100n);
    await deposit(fixture, fixture.alice, 100n);
    await withdraw(fixture, fixture.alice, 40n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(60n);
    await withdraw(fixture, fixture.alice, 60n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(0n);
    await withdraw(fixture, fixture.alice, 1n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(0n);
  });

  it("denies cross-user decryption of private principal", async function () {
    const fixture = await deployFixture();
    await fixture.vault.connect(fixture.alice).registerParticipant();
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
    expect(await fixture.vault.roundReservedPrizeHandle(1)).not.to.equal(ethers.ZeroHash);
    const stateChanging = fixture.vault.interface.fragments
      .filter((fragment): fragment is FunctionFragment => fragment.type === "function")
      .filter((fragment) => !["view", "pure"].includes(fragment.stateMutability))
      .map((fragment) => fragment.name);
    expect(stateChanging).not.to.include("withdrawSponsor");
  });

  it("uses append-only deterministic participant order", async function () {
    const fixture = await deployFixture();
    await fixture.vault.connect(fixture.bob).registerParticipant();
    await fixture.vault.connect(fixture.alice).registerParticipant();
    expect(await fixture.vault.participantCount()).to.equal(2n);
    expect(await fixture.vault.participantAt(0)).to.equal(fixture.bob.address);
    expect(await fixture.vault.participantAt(1)).to.equal(fixture.alice.address);
    await expect(fixture.vault.connect(fixture.bob).registerParticipant()).to.be.revertedWithCustomError(
      fixture.vault,
      "ParticipantAlreadyRegistered",
    );
  });

  it("matches exact individual and aggregate TWAB after closing a round", async function () {
    const fixture = await deployFixture();
    const round = await fixture.vault.roundInfo(1);
    await fixture.vault.connect(fixture.alice).registerParticipant();
    await fundConfidential(fixture, fixture.alice, 10n);
    const receipt = await (await deposit(fixture, fixture.alice, 10n)).wait();
    const depositBlock = await ethers.provider.getBlock(receipt!.blockNumber);
    await time.increaseTo(round[1]);
    await fixture.vault.closeRound();

    const expected = 10n * (round[1] - BigInt(depositBlock!.timestamp));
    const aggregateHandle = await fixture.vault.aggregateTwabHandle(1);
    const aggregateResult = await fhevm.publicDecrypt([aggregateHandle]);
    expect(aggregateResult.clearValues[aggregateHandle as `0x${string}`]).to.equal(expected);
    await fixture.vault.finalizeAggregate(1, aggregateResult.abiEncodedClearValues, aggregateResult.decryptionProof);
    expect((await fixture.vault.roundInfo(1))[3]).to.equal(expected);

    // The new round is open while round 1 settles; withdrawing now cannot alter round 1 history.
    await withdraw(fixture, fixture.alice, 2n);
    expect(await decryptPrincipal(fixture, fixture.alice)).to.equal(8n);

    await fixture.vault.connect(fixture.alice).materializeMyRoundWeight(1);
    const weightHandle = await fixture.vault.materializedWeightOf(1, fixture.alice.address);
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
    await fixture.vault.connect(fixture.alice).registerParticipant();
    await fundConfidential(fixture, fixture.alice, 5n);
    const receipt = await (await deposit(fixture, fixture.alice, 5n)).wait();
    const depositedAt = BigInt((await ethers.provider.getBlock(receipt!.blockNumber))!.timestamp);
    await time.increaseTo(first[1] + BigInt(DAILY * 2));
    await fixture.vault.closeRound();
    await fixture.vault.closeRound();
    await fixture.vault.closeRound();
    await fixture.vault.connect(fixture.alice).materializeMyRoundWeight(1);
    const handle = await fixture.vault.materializedWeightOf(1, fixture.alice.address);
    expect(
      await fhevm.userDecryptEuint(FhevmType.euint128, handle, await fixture.vault.getAddress(), fixture.alice),
    ).to.equal(5n * (first[1] - depositedAt));
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
    )) as LeopoldVault;
    const second = { ...first, vault: secondVault };
    await first.vault.connect(first.alice).registerParticipant();
    await second.vault.connect(second.alice).registerParticipant();
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
    ).deploy(officialAddresses, fixture.deployer.address)) as LeopoldVaultRegistry;
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
      ),
    ).to.be.reverted;
  });
});
