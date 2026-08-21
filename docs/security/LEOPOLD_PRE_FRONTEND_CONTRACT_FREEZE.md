# Leopold pre-frontend contract freeze

Date: 2026-08-12 Scope: CP1 contract core, round-scoped settlement bonds, Compound integration, ABI/state machines, and
application transaction flows. This is an internal security closure, not a formal external audit.

P-01 corrected-runtime refreeze: 2026-08-21 at contract commit `0cea34f33009a1d5052a554e687ee3605a2aaf11`. The public
ABI, state machines, privacy model, four-vault topology, and immutable bond profile are unchanged.

## Decision

Leopold uses **round-scoped public settlement-bond eligibility**. Private saving and prize eligibility are separate.
Wrap, Save, Compound yield, private principal, Withdraw, and unshield remain permissionless. An account enters one named
vault round by posting that vault's exact public native-ETH bond to its immutable escrow while the round is open. It
receives no eligibility in any later round without a fresh registration and bond.

The previous free permanent-registration settlement set is removed. The failed encrypted-tree evidence remains in
`research/settlement-tree-spike/`: depth-6 materialization cost 19,370,832 HCU, depth 7 reverted, a later depth-16
normal update cost 18,989,544 HCU, and depth 20+ updates reverted. The algorithmic search is closed by
`research/settlement-decision/FINAL_DECISION_REPORT.md`; no exact private decrement-capable sampler met the pinned FHEVM
constraints without a population structure, scan, private-access leak, or unbounded rejection loop.

## Product and privacy changes

The one intentional product change is that saving no longer automatically grants prize eligibility. `Enter Prize Round`
is an explicit additional action. Registration address, vault, round, timestamp, order, and ETH bond are public.
Principal, exact eligible TWAB, odds, accepted ticket, winner, winnings, and Auto-Save result remain encrypted/private.
There is no public winner event or winner-dependent bond/refund/reward behavior.

Prize weight begins at the successful registration transaction timestamp:

`eligibleWeight(user, round) = cumulativeTWAB(close) - cumulativeTWAB(eligibilityStart)`.

It is never retroactive to round open. Deposits after registration add future weight at their actual timestamps;
withdrawals subtract only future weight and never unlock the bond early. Already-earned weight is immutable. A
zero-balance account may register and receives exact zero weight until it saves.

## Architecture

Each non-upgradeable vault deploys one immutable `LeopoldSettlementBondEscrow`. There is no proxy, delegatecall, generic
executor, mutable price administrator, seizure role, or cross-vault pool. The escrow is the only payable registration
entry. Its callback is accepted only by its immutable vault, and the vault accepts registration only from its immutable
escrow for the active open round.

The vault maintains a round-local encrypted eligible balance and cumulative TWAB. Registration first accrues the
existing eligible aggregate and then adds the account's current encrypted principal. Eligible deposits, withdrawals, and
next-round Auto-Save deltas update the same aggregate at their actual timestamps. Close accrues once to the public close
timestamp, so exact eligible `T` is available without an unpaid participant traversal. Settlement then traverses only
that round's bonded array.

The permanent financial account/observation state is not a settlement set. Round `r+1` begins with an empty eligibility
set even if round `r` had 100,000 entries.

## Bond accounting and pull payments

The immutable constructor profile defines:

- `BOND_AMOUNT`;
- `REWARD_PER_PARTICIPANT_PASS`; and
- `REFUND_PER_COMPLETED_PARTICIPANT = BOND_AMOUNT - 2 * REWARD_PER_PARTICIPANT_PASS`.

Construction requires a positive reward and `bond > 2 * reward`. Each selection entry and allocation entry shifts one
fixed reward from unresolved bond liability to the public progress caller's pull credit. It never depends on encrypted
weight, ticket, winner, prize, preference, or winnings. The same two charges apply to every nonempty-round participant.
The final refund is therefore identical for winner and loser. Empty/zero-`T` rounds perform no participant work and make
the entire bond refundable.

Rewards and refunds use checks-effects-interactions plus transient reentrancy guards. A reverting recipient cannot block
settlement; its credit remains claimable. A reentrant recipient cannot withdraw twice. Direct ETH sends revert. Forced
ETH is excluded from the authoritative ledger and remains quarantined surplus with no seizure function.

At every state:

`totalDeposited = unresolvedLiability + rewardLiability + refundLiability + rewardsWithdrawn + refundsWithdrawn`.

Raw ETH balance is deliberately not the liability ledger. Tests check this equation before work, between chunks, after
finalization, and after withdrawals. Confidential principal, Compound basis/yield, sponsor funds, prize reserve, and
private winnings never enter the escrow.

## Economic profiles

### Demo / Sepolia

The integration manifest proposes `0.005 ETH` bond, `0.00125 ETH` reward per participant per pass, and `0.0025 ETH`
normal refund. This is a faucet-compatible demonstration profile for one evaluator entry. Sepolia ETH has no production
economic Sybil meaning, and these values are not an assertion about mainnet gas.

### Production intent

Fresh local measurements are:

| Operation                         | One participant gas | Four-participant gas |                Four-participant HCU total/depth |
| --------------------------------- | ------------------: | -------------------: | ----------------------------------------------: |
| Bond registration                 |             345,437 |      281,312 average | registration adds one eligible aggregate update |
| Selection                         |             640,849 |            1,479,301 |                          13,089,448 / 2,786,064 |
| Allocation                        |             809,973 |            2,692,170 |                          12,371,544 / 2,309,032 |
| Reconciliation proof finalization |                   — |               94,171 |                                               0 |
| Settlement finalization           |                   — |              129,218 |                                               0 |

The deployment formula is:

`rewardPerPass >= ceil(max(singlePassGas, chunkGas/participants) + fixedFinalizationGas/2) * gasPriceCeiling * (1 + safetyMargin)`

and

`bondAmount > 2 * rewardPerPass + capitalCommitmentFloor`.

With the measured maximum pass and half the two fixed calls, the pre-margin base is about 910,483 gas per pass. A
production deployment must choose a documented gas-price ceiling, at least 25% safety margin, and an independently
meaningful refundable capital floor. Because parameters are immutable, sustained gas beyond the reviewed ceiling
requires a reviewed redeployment; it cannot be silently repriced by a guardian.

## Sybil and liveness model

The security claim is precise: **free/permanent settlement-work externalization is removed**. Sybil attacks are not
cryptographically impossible. A wealthy attacker can buy many entries, but must post fresh collateral every round and
fund reward credits proportional to the two passes it creates. Historical identities create zero automatic future work.

Using the demo profile and measured gas, excluding close/aggregate/randomness calls common to every round:

| Entries | Collateral | Post-ticket tx `2*ceil(n/4)+2` | Registration gas |  Settlement gas |   Rewards | Normal refundable lock |
| ------: | ---------: | -----------------------------: | ---------------: | --------------: | --------: | ---------------------: |
|      10 |   0.05 ETH |                              8 |        2,813,120 |      12,715,457 | 0.025 ETH |              0.025 ETH |
|     100 |    0.5 ETH |                             52 |       28,131,200 |     104,487,819 |  0.25 ETH |               0.25 ETH |
|   1,000 |      5 ETH |                            502 |      281,312,000 |   1,043,068,794 |   2.5 ETH |                2.5 ETH |
|  10,000 |     50 ETH |                          5,002 |    2,813,120,000 |  10,428,878,544 |    25 ETH |                 25 ETH |
| 100,000 |    500 ETH |                         50,002 |   28,131,200,000 | 104,286,976,044 |   250 ETH |                250 ETH |

Settlement gas uses full-chunk measurements plus 223,423 fixed reconciliation/finalization gas; final partial chunks may
differ. Self-progression still pays registration and transaction gas. At one settlement transaction per 12-second block,
50,002 calls alone span about 6.9 days; actual FHE throughput and block capacity determine the real bound. This
rich-attacker economic DoS remains an explicit residual, but the work is current-round, collateralized, and
permissionlessly rewarded rather than permanent and free.

After a ticket is accepted, deterministic completion is `2 * ceil(n/4) + 2` transactions. Close, aggregate proof, and
randomness precede it. Exact rejection sampling terminates almost surely but has no finite worst-case retry count. Any
account may resume either cursor. Cursor/state transitions prevent duplicate processing and duplicate reward accrual;
finalization and refund occur once. A participant cannot withdraw its bond remainder before terminal state.

The final chunk is four. Fresh production-path results remain below Leopold's 15M/3.75M safety ceilings and the 20M/5M
hard ceilings. Eight is linearly above 20M for both passes; 12 and 16 are worse. Contract calls above four fail closed
with `InvalidChunkSize`.

## Round, settlement, and escrow state machines

| Machine     | Legal transitions and callers                                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round       | `UNINITIALIZED -> OPEN -> AGGREGATE_PENDING -> EMPTY` or `AGGREGATE_FINALIZED -> candidate states -> TICKET_ACCEPTED -> WINNER_PROCESSING -> RECONCILIATION_PENDING -> READY_TO_ALLOCATE -> ALLOCATION_PROCESSING -> WINNINGS_ALLOCATED -> SETTLED`. All progress is permissionless and phase/time/proof bound. |
| Eligibility | absent -> exact-bond registration during its active OPEN round -> immutable closed entry -> terminal refundable entry. There is no transition into a later round.                                                                                                                                               |
| Bond        | unresolved deposit -> fixed completed-pass rewards plus deterministic refund, or full empty-round refund -> pull withdrawals. Vault alone reports bounded cursor work/final state; no guardian/admin path exists.                                                                                               |
| Randomness  | none -> encrypted candidate -> proof-bound rejected retry or immutable accepted private ticket. No caller/admin seed or reroll.                                                                                                                                                                                 |
| Strategy    | terminal -> AGING -> deployment unwrap or replenishment amount pending -> completed/cancelled. Pause blocks new deployment/harvest; expiry and emergency recovery remain isolated from bonds/draw.                                                                                                              |

Round close snapshots the bonded count, eligible aggregate, sponsored prize, and harvested-yield cutoff. The next round
opens immediately with fresh eligibility. A settling round's participant list, weights, ticket, reserve, reward charges,
and refunds cannot be changed by later Save, Withdraw, registration, harvest, sponsorship, pause, or emergency actions.

## Composition, isolation, and recovery

- Saving requires no bond and bond registration transfers no confidential asset.
- Withdrawal after registration updates exact future eligible TWAB but never locks principal or returns the bond early.
- An empty eligible aggregate rolls prize under the existing rule and finalizes full bond refunds without RNG/selection.
- An authenticated false reconciliation rolls the prize forward, pays only the completed selection-pass reward, and
  refunds the unused allocation-pass collateral. It cannot allocate or strand the round.
- Auto-Save still uses the close-time preference and actual allocation timestamp. If the winner also entered the newly
  active round, its encrypted saved delta begins eligible TWAB at that actual timestamp.
- Strategy pause/emergency has no escrow authority; escrow finalization is driven only by draw state.
- Every vault deploys a distinct escrow and the registry verifies its immutable `VAULT` backpointer. Weekly ETH cannot
  fund Daily work; all `(vault, round, address)` records are naturally namespaced.
- Sponsor/yield/prize/winnings accounting is unchanged and denominated in lcUSDC; bonds/rewards/refunds are ETH only.

## Reentrancy and native-asset review

Registration records the exact deposit before the trusted immutable vault callback; callback failure rolls everything
back. Refund and reward withdrawal clear liability/credit before the native call, use `nonReentrant`, and revert
atomically if the recipient rejects ETH. Settlement only calls the immutable escrow's vault-only, nonpaying accounting
methods after cursor effects. The escrow cannot call arbitrary targets, change parameters, seize funds, or affect vault
tokens. Arithmetic uses Solidity checked math. Duplicate registration, progress, finalization, refund, and reward
withdrawal are covered by phase or credit state.

## Storage growth

Each round adds one vault round record and one escrow ledger (approximately seven 32-byte ledger slots). Each bonded
entry adds an escrow registration slot, vault eligibility timestamp, round-array element, encrypted winner predicate
after selection, and refund-claimed slot when claimed—roughly three persistent slots before settlement and up to five
after it, plus events. Balance observations remain three slots per time-separated balance mutation; same-timestamp
mutations coalesce. This is attacker-paid current-round storage, not free registration. Historical state remains
immutable and is intended for archival RPC/event indexing; no destructive cleanup is introduced.

## HCU status

Permanent methodology remains unchanged. Existing operations remain within their frozen margins: deposit
3,470,256/955,032; withdrawal 3,522,128/955,032; TWAB query 2,170,096/1,215,032; close accrual 1,215,096/1,215,032;
candidate 25,064/25,000; validity 149,032/149,000; accepted modulo 1,943,032/1,943,000; deployment request
2,359,064/1,666,000; replenish 1,443,032/1,297,000; emergency 910,160/531,032. Bond registration and eligible
Save/Withdraw use the same single add/accrual shapes already present in the former global aggregate. ETH credit/refund
logic performs no FHE operation.

Fresh worst-case production-path selection is 13,089,448/2,786,064 and allocation with uniform Auto-Save is
12,491,672/2,374,032 after the overflow-safe capacity predicate. The corrected predicate adds exactly 30,032 HCU where
used. Both remain below 15M/3.75M.

## Bytecode

Solidity 0.8.27/Cancun, metadata hash disabled, optimizer runs 800 by default, and runs 1/viaIR for vault/registry are
unchanged. Final deterministic measurements are:

| Production contract           | Creation bytes | Runtime bytes | EIP-170 headroom |
| ----------------------------- | -------------: | ------------: | ---------------: |
| `LeopoldVault`                |         36,139 |        23,531 |            1,045 |
| `LeopoldSettlementBondEscrow` |          4,741 |         4,270 |           20,306 |
| `LeopoldConfidentialUSDC`     |         12,510 |        10,565 |           14,011 |
| `LeopoldCompoundAdapter`      |          6,381 |         5,535 |           19,041 |
| `LeopoldVaultRegistry`        |          4,744 |         1,334 |           23,242 |

The fail-closed vault ceiling is 23,552 bytes, preserving the mandatory 1,024-byte margin. The corrected implementation
has 1,045 bytes. Its pool-cap predicate compares the incoming amount to remaining capacity before addition, closing P-01
without changing the ABI or state machine. Proof validation, ACLs, access control, replay, reconciliation, TWAB,
emergency, principal, and prize checks remain.

The official registry constructor binds the reviewed bond and per-pass reward values across all four vault escrows; an
interface-compatible deployment with weaker economics is rejected. Freeze validation force-compiles current source
before comparing ABI/bytecode artifacts, preventing stale-artifact attestation.

## Stage-0 and new residual risks

The authoritative CP0 evidence still says `Original detailed statement not recovered` for R-003, R-005, R-010, R-011,
and R-012; all remain HIGH / `OPEN_NONBLOCKING_PRODUCTION_RISK`. R-014 remains the HIGH/open schedule-capacity risk. No
missing description is invented. HOLD_PIN, the recorded dependency advisories, Compound proxy/governance and liquidity
risk, Circle/wrapper/KMS availability, low-participation aggregate inference, and the external-audit requirement remain
open with the same project-security owner and freeze-breaking triggers.

The fresh audit matches CP0 byte-for-byte in counts: 124 advisories (1 Critical, 57 High, 54 Moderate, 12 Low) across
1,108 dependencies. The Critical path is dev-only `solidity-coverage -> sc-istanbul -> handlebars`. Production-only is
one High and no Critical (`next -> postcss -> nanoid@3.3.16`); Leopold does not call its vulnerable custom-generator
path. No package or lockfile changed. Fixed upstream versions do not presently outweigh pinned FHE/Hardhat/Next
compatibility risk, so HOLD_PIN remains and any upgrade requires a dedicated compatibility gate.

New bond residuals are:

- recurring wealthy-attacker economic DoS (accepted architectural residual; cost/work scales each round);
- gas-price spikes above the immutable calibration ceiling may weaken progress incentives (redeployment trigger);
- public eligibility/bond/timing reduces behavioral anonymity, without cryptographic winner disclosure;
- forced ETH is quarantined and permanently unrecoverable because adding a surplus-seizure role is worse;
- native receiver failure delays only that recipient's pull withdrawal, never round progression.

## Verification and live-smoke status

The corrected-runtime production test command completed **563 passing, 1 intentionally Sepolia-only pending, 0
failing**. It includes exact/fuzz TWAB, settlement, bond, solvency, 100-historical-Sybil, four-vault, Compound,
Auto-Save, pause/emergency, reentrancy, forced-ETH, selector-HCU, and the exhaustive SG-4/SG-5 protocol suites. Frontend
and keeper typecheck/lint/tests/build passed; the keeper runtime fixture also passed. CP0, selector HCU, Compound
historical live evidence, SG-4 randomness, SG-5 evidence/structural, lint, formatting, bytecode, and freeze validators
passed. The SG-4 authority preparation command remains intentionally fail-closed because its separate two-commit binding
record is absent; its exhaustive protocol tests and immutable benchmark evidence pass.

A genuinely fresh-context reviewer found one High release-integrity gap and three Medium issues in the first candidate:
stale freeze output, unrecoverable authenticated false reconciliation, registry-unbound bond pricing, and stale-artifact
validation. All were remediated and independently re-reviewed; the reviewer found no remaining Critical, High, or Medium
issue. This is not an external audit.

Three controlled disposable Sepolia smoke attempts were made. A final-source vault deployed successfully and canonical
USDC approve/lcUSDC wrap transactions mined, proving deployment under EIP-170. The external FHE relayer then repeatedly
timed out, stalled, or closed its HTTPS socket during encrypted-input generation, before private deposit/bond
registration. No contract revert occurred and no complete-live PASS artifact was created. Exact hashes and limitations
are preserved in `evidence/closure/LEOPOLD_BOND_SEPOLIA_SMOKE_ATTEMPTS.md`. The complete bonded live lifecycle must be
repeated when relayer availability returns; historical source-bound evidence still proves lcUSDC, deposit/withdrawal,
Compound supply/yield/replenishment/pause/emergency but is not relabeled as proof of the new bond code.

The P-01 corrected official suite subsequently completed a bounded live smoke against the corrected Daily vault: one
canonical-USDC base unit was wrapped, confidentially deposited, observed as private principal `1`, withdrawn, and
observed as private principal `0`. No bond, strategy, settlement, or round-close operation was performed. The new proof
is recorded separately in `evidence/deployment/LEOPOLD_P01_BOUNDED_SMOKE.json`; none of the earlier historical evidence
was rewritten.

The comprehensive security review due no later than **2026-08-26** remains mandatory and is not superseded. It must
include recovered Stage-0 source text if available and an external review before production-value deployment.

## UX and transaction-flow freeze

Normal UX is:

`Get Test USDC -> Make Private -> Choose Vault -> Save -> Enter Prize Round -> Private Savings -> Private Eligibility -> Private Result -> Withdraw`.

`Make Private` remains two wallet transactions (USDC approval + lcUSDC wrap). `Save` is one confidential transfer call.
`Enter Prize Round` is one public payable escrow transaction. Principal withdrawal is one transaction. Private
eligibility is one materialization transaction followed by wallet-local decryption of the event-carried handle. Private
result is a read plus wallet-local decryption. Unshield remains request + proof finalization. Bond refund is one pull
transaction. Strategy and settlement chunks remain infrastructure-side.

Required copy: “Refundable settlement bond. This public ETH bond is separate from your private savings. Unused
collateral is refundable; a fixed portion compensates permissionless private draw finalization.” The UI must hide HCU,
cursors, chunks, FHE handles, public proof plumbing, Compound, and lcUSDC jargon.

The canonical machine-readable interface is `evidence/closure/LEOPOLD_CONTRACT_FREEZE.json`; application configuration
is `config/leopold-frontend-contracts.json`. That manifest now names the verified P-01 corrected official Sepolia
registry and four-vault suite. Superseded official and disposable smoke addresses remain historical evidence and are not
current frontend discovery targets.

## Freeze-breaking triggers

Any ABI, state-machine, production Solidity, bond formula/profile, native-asset accounting, FHE/OpenZeppelin dependency,
lockfile, Compound market/base token, wrapper, privileged role, decryption authorization, randomness, exact TWAB,
settlement algorithm/chunk, or production bytecode change reopens this gate. So does headroom below 1,024 bytes or a new
Critical/High production-relevant vulnerability.
