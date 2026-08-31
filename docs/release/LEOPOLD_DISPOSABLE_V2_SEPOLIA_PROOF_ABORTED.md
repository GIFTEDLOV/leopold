# DISPOSABLE V2 SEPOLIA PROOF — NOT OFFICIAL DEPLOYMENT

Status: **aborted before participant registration**. No official deployment, production promotion, migration, or
user-fund authorization occurred.

Source checkpoint: `17ed66f1bfd696f72317e96662902eb3c3436245`

The fresh bytecode-correct topology remains preserved at wrapper `0x5499B0270BfFba67C7ce77EF87F0a1F3B87f0881`, vault
`0x5A59B9A6e95d4ede371bc2b2a1270D434af6037c`, escrow `0x2F6C4c6f8aa660826B501D43d4f54383d5431438`, and adapter
`0x01EFA68c117aC648D9325Cf16b9CcFe7eA52650D`. Its original topology evidence SHA-256 is
`1a1e2a7756ef0e0054ccdc7abfca39fda929797b5218e568ad1a95da422cb399`; the failed earlier topology evidence remains
unchanged (`2f0189d02af39dfb05c7e864f022d0b5e8642f6e7f9b6a153c5fdbc8723682da`).

The topology JSON itself records `sourceCommitSha` as `69b24a14cf7c9491c1fa0c30c378b8b771e6b70e`, while this deployment
was reviewed from `17ed66f1bfd696f72317e96662902eb3c3436245`. That provenance mismatch is retained and must be corrected
before another proof; the file was not rewritten.

## What happened

Round 1 was intended as the bootstrap/activation round, but its 90-second save window elapsed before participant setup
completed. Round 1 was closed empty by keeper 1. Round 2 likewise elapsed before encrypted saves could be submitted and
was closed empty. Because the vault preserves fixed cadence (`next.opensAt = previous.closesAt`), the keeper had to
catch up overdue empty rounds. Two keeper-generated close transactions were mined reverted at the RPC-estimated gas
limit (`534,569`, exactly the gas limit); a second keeper and an explicit-gas controlled wallet recovered subsequent
empty closes. This is preserved as evidence, not treated as a successful lifecycle proof.

Both controlled participants were funded and successfully scheduled for auto-entry effective at Round 2. Participant A’s
prior approve/wrap transactions and both participants’ credit/opt-in transactions are retained. Participant B’s
approve/wrap also succeeded. No participant sent a registration transaction. No encrypted save reached the V2 vault:
both vault principal handles remain zero, while wrapper confidential handles remain encrypted/nonzero.

The browser FHE helper route timed out during the only legally reachable later window. No Round 2 or Round 3 delegated
registration, settlement, randomness, claim, or withdrawal was attempted after that failure. Active Round 33 is
currently empty and expired; broadcasts are stopped.

## Accounting and privacy

At the final read-only snapshot (block `11606925`, hash
`0x767ea3e7d9875eee3f25c04ce8b8a2c34712866afcfc616c1afe0eabe1ca03cd`), the escrow balance was `600000000000000` wei and
exactly the same 0.0006 ETH total automation credit remained accounted. Unresolved, reward, and refund liabilities were
zero, so the escrow was solvent for the transitions actually executed. No bond reservation, reward, refund, or
withdrawal liability was created. No accepted random ticket was created, and no new FHE ACL was exercised. Therefore the
requested live privacy negative proofs and result/eligibility reveals were **not reached**, not passed by inference.

## Test/review status

The reviewed local checkpoint’s prior gates remain the last green local result: focused V2 18 passing; affected contract
suite 89 passing; keeper 64 passing; exact four-participant HCU selection total/depth 13,089,448 / 2,786,064; allocation
12,491,672 / 2,374,032; V2 vault 23,531 bytes and escrow 6,169 bytes; V1 freeze unchanged. No new local source changes
were made during this live attempt.

## Deployment decision

**Not safe to proceed to official Sepolia deployment.** The disposable proof did not establish Round 2 automatic entry,
Round 3 persistence, full settlement, FHE negative proofs, or the required keeper race/outage/restart drills. The
gas-estimation failure is an additional keeper production risk that must be fixed and regression-tested before another
disposable proof. Use the machine-readable artifact
[LEOPOLD_DISPOSABLE_V2_PROOF_ABORTED.json](../../evidence/deployment/LEOPOLD_DISPOSABLE_V2_PROOF_ABORTED.json) and
preserved `/tmp` journals/topology files for review.
