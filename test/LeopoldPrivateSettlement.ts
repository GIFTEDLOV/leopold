import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";

import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { LeopoldVault, MockLeopoldAsset, MockLeopoldUnderlying } from "../types";

type Fixture = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  carol: HardhatEthersSigner;
  sponsor: HardhatEthersSigner;
  underlying: MockLeopoldUnderlying;
  asset: MockLeopoldAsset;
  vault: LeopoldVault;
};

const DAY = 86_400;

async function fixture(): Promise<Fixture> {
  const [deployer, alice, bob, carol, sponsor] = await ethers.getSigners();
  const underlying = (await (
    await ethers.getContractFactory("MockLeopoldUnderlying")
  ).deploy()) as MockLeopoldUnderlying;
  const asset = (await (
    await ethers.getContractFactory("MockLeopoldAsset")
  ).deploy(await underlying.getAddress())) as MockLeopoldAsset;
  const vault = (await (
    await ethers.getContractFactory("LeopoldVault")
  ).deploy(
    1,
    0,
    ethers.encodeBytes32String("Daily"),
    DAY,
    await asset.getAddress(),
    await time.latest(),
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    0,
  )) as LeopoldVault;
  return { deployer, alice, bob, carol, sponsor, underlying, asset, vault };
}

async function fundAndDeposit(state: Fixture, account: HardhatEthersSigner, amount: bigint): Promise<void> {
  await state.underlying.mint(account.address, amount);
  await state.underlying.connect(account).approve(await state.asset.getAddress(), amount);
  await state.asset.connect(account).wrap(account.address, amount);
  const input = fhevm.createEncryptedInput(await state.asset.getAddress(), account.address);
  input.add64(amount);
  const encrypted = await input.encrypt();
  await state.asset
    .connect(account)
    [
      "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
    ](await state.vault.getAddress(), encrypted.handles[0], encrypted.inputProof, "0x");
}

async function decrypt64(state: Fixture, account: HardhatEthersSigner, handle: string): Promise<bigint> {
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, await state.vault.getAddress(), account);
}

async function closeAndFinalizeAggregate(state: Fixture): Promise<void> {
  await time.increaseTo((await state.vault.roundInfo(1))[1]);
  await state.vault.closeRound();
  const handle = await state.vault.aggregateTwabHandle(1);
  const result = await fhevm.publicDecrypt([handle]);
  await state.vault.connect(state.carol).finalizeAggregate(1, result.abiEncodedClearValues, result.decryptionProof);
}

async function acceptTicket(state: Fixture): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await state.vault.generateRandomCandidate(1);
    if ((await state.vault.roundInfo(1))[2] === 7n) return;
    const handle = await state.vault.candidateValidityHandle(1);
    const result = await fhevm.publicDecrypt([handle]);
    await state.vault
      .connect(state.bob)
      .finalizeCandidateValidity(1, result.abiEncodedClearValues, result.decryptionProof);
    if ((await state.vault.roundInfo(1))[2] === 7n) return;
  }
  throw new Error("mock RNG unexpectedly rejected three candidates");
}

async function reconcile(state: Fixture, chunk = 1): Promise<void> {
  while ((await state.vault.roundProgress(1))[1] < (await state.vault.roundProgress(1))[0]) {
    await state.vault.processSelection(1, chunk);
  }
  const handle = await state.vault.reconciliationHandle(1);
  const result = await fhevm.publicDecrypt([handle]);
  expect(result.clearValues[handle as `0x${string}`]).to.equal(true);
  await state.vault
    .connect(state.sponsor)
    .finalizeSelectionReconciliation(1, result.abiEncodedClearValues, result.decryptionProof);
}

async function allocate(state: Fixture, chunk = 1): Promise<void> {
  while ((await state.vault.roundProgress(1))[2] < (await state.vault.roundProgress(1))[0]) {
    await state.vault.processAllocation(1, chunk);
  }
  await state.vault.finalizeSettlement(1);
}

async function sponsor(state: Fixture, amount: bigint): Promise<void> {
  await state.underlying.mint(state.sponsor.address, amount);
  await state.underlying.connect(state.sponsor).approve(await state.vault.getAddress(), amount);
  await state.vault.connect(state.sponsor).contributeSponsor(1, amount);
}

describe("Leopold private selection and settlement", function () {
  before(function () {
    if (!fhevm.isMock) this.skip();
  });

  it("removes permanent admission denial while retaining deterministic append-only ordering", async function () {
    const state = await fixture();
    const signers = await ethers.getSigners();
    for (const signer of signers) await state.vault.connect(signer).registerParticipant();
    expect(await state.vault.participantCount()).to.equal(BigInt(signers.length));
    for (let index = 0; index < signers.length; index += 1) {
      expect(await state.vault.participantAt(index)).to.equal(signers[index].address);
    }
  });

  it("snapshots the round domain and ignores later registration during settlement", async function () {
    const state = await fixture();
    await state.vault.connect(state.alice).registerParticipant();
    await fundAndDeposit(state, state.alice, 10n);
    await closeAndFinalizeAggregate(state);
    expect((await state.vault.roundProgress(1))[0]).to.equal(1n);
    await state.vault.connect(state.carol).registerParticipant();
    expect(await state.vault.participantCount()).to.equal(2n);
    expect((await state.vault.roundProgress(1))[0]).to.equal(1n);
  });

  it("binds public proofs to exact handles, vaults, rounds and one-time phases", async function () {
    const first = await fixture();
    const second = await fixture();
    for (const state of [first, second]) {
      await state.vault.connect(state.alice).registerParticipant();
      await fundAndDeposit(state, state.alice, 2n);
    }
    await time.increaseTo((await second.vault.roundInfo(1))[1]);
    for (const state of [first, second]) {
      await state.vault.closeRound();
    }
    const firstHandle = await first.vault.aggregateTwabHandle(1);
    const proof = await fhevm.publicDecrypt([firstHandle]);
    await expect(second.vault.finalizeAggregate(1, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.reverted;
    await first.vault.finalizeAggregate(1, proof.abiEncodedClearValues, proof.decryptionProof);
    await expect(first.vault.finalizeAggregate(1, proof.abiEncodedClearValues, proof.decryptionProof)).to.be.reverted;
  });

  it("rejects candidate cleartext/proof mismatch and duplicate validity finalization", async function () {
    const state = await fixture();
    await state.vault.connect(state.alice).registerParticipant();
    await fundAndDeposit(state, state.alice, 3n);
    await closeAndFinalizeAggregate(state);
    await state.vault.generateRandomCandidate(1);
    expect((await state.vault.roundInfo(1))[2]).to.equal(5n);
    const handle = await state.vault.candidateValidityHandle(1);
    const result = await fhevm.publicDecrypt([handle]);
    const actual = result.clearValues[handle as `0x${string}`] as boolean;
    const mismatched = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [!actual]);
    await expect(state.vault.finalizeCandidateValidity(1, mismatched, result.decryptionProof)).to.be.reverted;
    await state.vault.finalizeCandidateValidity(1, result.abiEncodedClearValues, result.decryptionProof);
    await expect(state.vault.finalizeCandidateValidity(1, result.abiEncodedClearValues, result.decryptionProof)).to.be
      .reverted;
  });

  it("processes the full domain, reconciles exactly, and allocates one private prize", async function () {
    const state = await fixture();
    for (const participant of [state.alice, state.bob]) await state.vault.connect(participant).registerParticipant();
    await fundAndDeposit(state, state.alice, 20n);
    await fundAndDeposit(state, state.bob, 12n);
    await state.vault.connect(state.alice).setAutoSavePreference(1);
    await sponsor(state, 25n);
    const observationsBefore = [
      await state.vault.observationCount(state.alice.address),
      await state.vault.observationCount(state.bob.address),
    ];
    await closeAndFinalizeAggregate(state);
    await acceptTicket(state);

    const vaultAddress = await state.vault.getAddress();
    expect(await state.vault.ticketAclStatus(1, vaultAddress)).to.deep.equal([true, false]);
    expect(await state.vault.ticketAclStatus(1, state.alice.address)).to.deep.equal([false, false]);
    expect(await state.vault.ticketAclStatus(1, state.deployer.address)).to.deep.equal([false, false]);

    await expect(state.vault.processSelection(1, 0)).to.be.revertedWithCustomError(state.vault, "InvalidChunkSize");
    await reconcile(state, 1);
    expect((await state.vault.roundProgress(1))[1]).to.equal(2n);
    await expect(state.vault.processSelection(1, 1)).to.be.reverted;
    await allocate(state, 1);

    const alicePrincipal = await decrypt64(state, state.alice, await state.vault.principalOf(state.alice.address));
    const aliceWinnings = await decrypt64(state, state.alice, await state.vault.winningsOf(state.alice.address));
    const bobPrincipal = await decrypt64(state, state.bob, await state.vault.principalOf(state.bob.address));
    const bobWinnings = await decrypt64(state, state.bob, await state.vault.winningsOf(state.bob.address));
    expect(alicePrincipal - 20n + (bobPrincipal - 12n) + aliceWinnings + bobWinnings).to.equal(25n);
    expect([alicePrincipal - 20n, bobWinnings].filter((value) => value === 25n)).to.have.length(1);
    expect(await state.vault.observationCount(state.alice.address)).to.equal(observationsBefore[0] + 1n);
    expect(await state.vault.observationCount(state.bob.address)).to.equal(observationsBefore[1] + 1n);
    expect((await state.vault.roundInfo(1))[2]).to.equal(10n);
  });

  it("keeps settlement replay-safe across every cursor phase", async function () {
    const state = await fixture();
    await state.vault.connect(state.alice).registerParticipant();
    await fundAndDeposit(state, state.alice, 1n);
    await sponsor(state, 9n);
    await closeAndFinalizeAggregate(state);
    await acceptTicket(state);
    await state.vault.processSelection(1, 1);
    await expect(state.vault.processSelection(1, 1)).to.be.reverted;
    const reconciliation = await fhevm.publicDecrypt([await state.vault.reconciliationHandle(1)]);
    await state.vault.finalizeSelectionReconciliation(
      1,
      reconciliation.abiEncodedClearValues,
      reconciliation.decryptionProof,
    );
    await expect(
      state.vault.finalizeSelectionReconciliation(
        1,
        reconciliation.abiEncodedClearValues,
        reconciliation.decryptionProof,
      ),
    ).to.be.reverted;
    await state.vault.processAllocation(1, 1);
    await expect(state.vault.processAllocation(1, 1)).to.be.reverted;
    await state.vault.finalizeSettlement(1);
    await expect(state.vault.finalizeSettlement(1)).to.be.reverted;
  });

  it("snapshots auto-save preference at round close and converts only in an open current round", async function () {
    const state = await fixture();
    await state.vault.connect(state.alice).registerParticipant();
    await state.vault.connect(state.alice).setAutoSavePreference(1);
    await fundAndDeposit(state, state.alice, 10n);
    await sponsor(state, 5n);
    await closeAndFinalizeAggregate(state);
    await state.vault.connect(state.alice).setAutoSavePreference(0);
    await acceptTicket(state);
    await reconcile(state);

    await time.increaseTo((await state.vault.roundInfo(2))[1]);
    await expect(state.vault.processAllocation(1, 1)).to.be.revertedWithCustomError(state.vault, "RoundNotOpen");
    await state.vault.closeRound();
    await allocate(state);
    expect(await decrypt64(state, state.alice, await state.vault.principalOf(state.alice.address))).to.equal(15n);
    expect(await decrypt64(state, state.alice, await state.vault.winningsOf(state.alice.address))).to.equal(0n);
    expect(await state.vault.preferenceObservationCount(state.alice.address)).to.equal(2n);
  });

  it("treats an exact-close preference change as next-round state", async function () {
    const state = await fixture();
    await state.vault.connect(state.alice).registerParticipant();
    await state.vault.connect(state.alice).setAutoSavePreference(1);
    await fundAndDeposit(state, state.alice, 1n);
    await sponsor(state, 2n);
    const closesAt = (await state.vault.roundInfo(1))[1];
    await time.setNextBlockTimestamp(closesAt);
    await state.vault.connect(state.alice).setAutoSavePreference(0);
    await state.vault.closeRound();
    const aggregate = await fhevm.publicDecrypt([await state.vault.aggregateTwabHandle(1)]);
    await state.vault.finalizeAggregate(1, aggregate.abiEncodedClearValues, aggregate.decryptionProof);
    await acceptTicket(state);
    await reconcile(state);
    await allocate(state);
    expect(await decrypt64(state, state.alice, await state.vault.principalOf(state.alice.address))).to.equal(3n);
    expect(await decrypt64(state, state.alice, await state.vault.winningsOf(state.alice.address))).to.equal(0n);
  });

  it("withdraws keep-available winnings once without consuming principal", async function () {
    const state = await fixture();
    await state.vault.connect(state.alice).registerParticipant();
    await fundAndDeposit(state, state.alice, 10n);
    await sponsor(state, 7n);
    await closeAndFinalizeAggregate(state);
    await acceptTicket(state);
    await reconcile(state);
    await allocate(state);
    expect(await decrypt64(state, state.alice, await state.vault.winningsOf(state.alice.address))).to.equal(7n);

    const input = fhevm.createEncryptedInput(await state.vault.getAddress(), state.alice.address);
    input.add64(7n);
    const encrypted = await input.encrypt();
    await state.vault.connect(state.alice).withdrawWinnings(encrypted.handles[0], encrypted.inputProof);
    expect(await decrypt64(state, state.alice, await state.vault.winningsOf(state.alice.address))).to.equal(0n);
    const secondInput = fhevm.createEncryptedInput(await state.vault.getAddress(), state.alice.address);
    secondInput.add64(7n);
    const second = await secondInput.encrypt();
    await state.vault.connect(state.alice).withdrawWinnings(second.handles[0], second.inputProof);
    expect(await decrypt64(state, state.alice, await state.vault.principalOf(state.alice.address))).to.equal(10n);
  });

  it("denies cross-user, admin, keeper-like, and sponsor winnings decryption", async function () {
    const state = await fixture();
    await state.vault.connect(state.alice).registerParticipant();
    await fundAndDeposit(state, state.alice, 1n);
    await sponsor(state, 3n);
    await closeAndFinalizeAggregate(state);
    await acceptTicket(state);
    await reconcile(state);
    await allocate(state);
    const handle = await state.vault.winningsOf(state.alice.address);
    for (const outsider of [state.bob, state.deployer, state.carol, state.sponsor]) {
      let denied = false;
      try {
        await fhevm.userDecryptEuint(FhevmType.euint64, handle, await state.vault.getAddress(), outsider);
      } catch {
        denied = true;
      }
      expect(denied).to.equal(true);
    }
  });

  it("keeps round N immutable while round N+1 deposits, withdrawals and registration proceed", async function () {
    const state = await fixture();
    for (const participant of [state.alice, state.bob]) await state.vault.connect(participant).registerParticipant();
    await fundAndDeposit(state, state.alice, 10n);
    await fundAndDeposit(state, state.bob, 5n);
    await sponsor(state, 4n);
    await closeAndFinalizeAggregate(state);
    await state.vault.connect(state.alice).materializeMyRoundWeight(1);
    const beforeHandle = await state.vault.materializedWeightOf(1, state.alice.address);
    const before = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      beforeHandle,
      await state.vault.getAddress(),
      state.alice,
    );

    await state.vault.connect(state.carol).registerParticipant();
    await fundAndDeposit(state, state.carol, 9n);
    const withdrawalInput = fhevm.createEncryptedInput(await state.vault.getAddress(), state.alice.address);
    withdrawalInput.add64(2n);
    const encryptedWithdrawal = await withdrawalInput.encrypt();
    await state.vault.connect(state.alice).withdraw(encryptedWithdrawal.handles[0], encryptedWithdrawal.inputProof);
    expect((await state.vault.roundProgress(1))[0]).to.equal(2n);

    await acceptTicket(state);
    await reconcile(state, 2);
    await allocate(state, 2);
    await state.vault.connect(state.alice).materializeMyRoundWeight(1);
    const afterHandle = await state.vault.materializedWeightOf(1, state.alice.address);
    const after = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      afterHandle,
      await state.vault.getAddress(),
      state.alice,
    );
    expect(after).to.equal(before);
    expect(await state.vault.observationCount(state.carol.address)).to.equal(1n);
  });

  it("allows four vaults to occupy independent lifecycle phases", async function () {
    const state = await fixture();
    const start = await time.latest();
    const vaults: LeopoldVault[] = [state.vault];
    for (const [id, kind, name, duration] of [
      [2, 1, "Weekly", 7 * DAY],
      [3, 2, "Monthly", 30 * DAY],
      [4, 3, "Boost", 7 * DAY],
    ] as const) {
      vaults.push(
        (await (
          await ethers.getContractFactory("LeopoldVault")
        ).deploy(
          id,
          kind,
          ethers.encodeBytes32String(name),
          duration,
          await state.asset.getAddress(),
          start,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          0,
        )) as LeopoldVault,
      );
    }
    for (const vault of vaults) {
      await vault.connect(state.alice).registerParticipant();
      await state.underlying.mint(state.alice.address, 1n);
      await state.underlying.connect(state.alice).approve(await state.asset.getAddress(), 1n);
      await state.asset.connect(state.alice).wrap(state.alice.address, 1n);
      const input = fhevm.createEncryptedInput(await state.asset.getAddress(), state.alice.address);
      input.add64(1n);
      const encrypted = await input.encrypt();
      await state.asset
        .connect(state.alice)
        [
          "confidentialTransferAndCall(address,bytes32,bytes,bytes)"
        ](await vault.getAddress(), encrypted.handles[0], encrypted.inputProof, "0x");
    }
    await time.increaseTo((await vaults[0].roundInfo(1))[1]);
    await vaults[0].closeRound();
    expect((await vaults[0].roundInfo(1))[2]).to.equal(2n);
    expect((await vaults[1].roundInfo(1))[2]).to.equal(1n);
    expect((await vaults[2].roundInfo(1))[2]).to.equal(1n);
    expect((await vaults[3].roundInfo(1))[2]).to.equal(1n);
    expect(await vaults[0].principalOf(state.alice.address)).not.to.equal(
      await vaults[1].principalOf(state.alice.address),
    );
  });

  it("settles an empty sponsored round by rolling the prize forward without RNG", async function () {
    const state = await fixture();
    await sponsor(state, 5n);
    await closeAndFinalizeAggregate(state);
    expect((await state.vault.roundInfo(1))[2]).to.equal(4n);
    await expect(state.vault.generateRandomCandidate(1)).to.be.reverted;
    await state.vault.settleEmptyRound(1);
    expect((await state.vault.roundInfo(1))[2]).to.equal(10n);
    expect(await state.vault.publicSponsoredPrize(2)).to.equal(5n);
  });

  it("contains no public winner event, clear winner getter, or early-stop API", async function () {
    const state = await fixture();
    const interfaceText = state.vault.interface.fragments.map((fragment) => fragment.format("full")).join("\n");
    expect(interfaceText).not.to.match(/\b(Winner|winnerAddress|acceptedTicket|processParticipantAt)\b/u);
    const source = await import("node:fs/promises").then((fs) => fs.readFile("contracts/LeopoldVault.sol", "utf8"));
    expect(source).not.to.match(/if\s*\(\s*(isWinner|winner)\s*\)/u);
  });
});
