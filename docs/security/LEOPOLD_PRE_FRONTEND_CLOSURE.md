# Leopold pre-frontend contract closure candidate (superseded)

This pre-bond candidate is retained as architectural provenance. It is superseded by
`LEOPOLD_PRE_FRONTEND_CONTRACT_FREEZE.md`, which implements round-scoped public settlement-bond eligibility. Statements
below describe the earlier candidate only.

## Decision scope

This record is the pre-frontend closure candidate. The independent review found an unresolved permanent-participant
Sybil settlement-starvation risk, so the contract core is **not frozen** and frontend work is not authorized. It is not
a formal external audit and does not replace the mandatory external review.

## Bytecode

The exact starting artifacts used Solidity 0.8.27/Cancun, `bytecodeHash: none`, optimizer runs 800 by default, and
`viaIR`/runs 1 for the vault and registry. The 12-byte metadata trailer was not the size cause. Starting production
sizes were: Vault 24,496 runtime / 32,803 creation; lcUSDC 10,565 / 12,510; adapter 5,045 / 5,870; registry 1,164 /
3,621. The vault had only 80 bytes of EIP-170 headroom.

Source-map attribution and controlled compilation ranked the opportunities: strategy/emergency orchestration (~3.5 KB
named code), settlement/draw, deposit/withdraw/TWAB, public-proof verification, and read dispatch. The safe change was
not architectural extraction: five identical approve/wrap/reset paths now share `_wrapUnderlying`, four proof paths
share one verifier, non-integration constants are private, overlapping round status/progress reads are one ABI method,
and three non-decryptable diagnostic history getters were removed. No optimizer setting, invariant, ACL, proof check,
access check, recovery path, or privacy property changed.

After the pause-boundary fix, the final candidate vault is 23,064 runtime / 31,764 creation bytes, retaining 1,512 bytes
of EIP-170 headroom. The deterministic gate is `pnpm closure:bytecode`. Accepted runtime ceilings are Vault 23,076
(1,500-byte EIP-170 margin), lcUSDC 11,000, adapter 6,000, and registry 1,500. It additionally fails unless the largest
production runtime has at least 1,500 bytes of headroom. Final exact values are in the generated ABI freeze artifact.

## Settlement closure

At close, the append-only participant length is snapshotted. Selection and allocation each traverse the entire snapshot
in deterministic order with cursors and a maximum chunk of four. Selection materializes exact encrypted TWAB, updates an
encrypted cumulative interval, stores an encrypted winner predicate, and never stops at the winner. It then publicly
proves only `cumulative == aggregate && winnerCount == 1`. Allocation applies uniform encrypted operations and the
close-time Auto-Save preference to every participant. Finalization is a one-way state transition.

Live selector evidence gives four-selection at 12,864,288 total / 2,678,064 depth HCU and four-allocation at 11,416,416
/ 2,579,064. Internal exclusive safety ceilings are 15,000,000 / 3,750,000 against network 20,000,000 / 5,000,000.
Linear extrapolation makes chunk 8 exceed 20M total in both passes; 12 and 16 are necessarily worse. A public binary
search or path-dependent tree would reveal or narrow the winner and add storage/bytecode, so it is rejected.

After a ticket is accepted, the deterministic completion bound is `2 * ceil(n / 4) + 2` transactions: both full passes,
one reconciliation proof finalization, and one settlement finalization. Close, aggregate proof, and randomness are
preceding draw phases. Rejection sampling has no finite worst-case retry count but terminates almost surely; only an
objectively proven rejected candidate permits another attempt. Any account can advance every settlement phase. A
completed cursor cannot move backward, phase transitions prevent replay, and finalization can occur exactly once.

No onchain incentive is added in this candidate. At evaluator scale (10 participants: 8 post-ticket transactions; 100:
52), the optional keeper, sponsor, participant, or any observer can advance the draw, and no single keeper is trusted.
However, free permanent append-only registration lets an attacker add arbitrary zero-balance identities once and impose
`2 * ceil(n / 4)` costly FHE transactions on every later nonempty round. Per-transaction boundedness and permissionless
access do not guarantee an economically motivated caller. A one-time admission fee also cannot fund recurring future
round costs, a hard cap creates the prohibited final-slot/Sybil denial, and a path-dependent tree leaks winner
information. No safe minimal incentive or escape path is currently implemented.

Settlement status: `NOT CLOSED — PERMANENT SYBIL SETTLEMENT STARVATION`.

## Composition and cutoff model

The following mandatory scenarios are covered by named contract tests, reference-model properties, or explicit
state-machine review:

|     # | Scenario                                                     | Closure evidence                                                       |
| ----: | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
|   1–2 | deposit during aging/unwrap pending                          | `keeps deposits and available withdrawals independent...`              |
|   3–5 | exact close deposit/withdraw boundaries                      | `enforces the exclusive round-close boundary...`                       |
|   6–7 | withdrawal with position/replenishment                       | replenishment and immediate-withdrawal strategy tests                  |
|     8 | close while deployment pending                               | independent round and epoch storage; expiry recovery remains callable  |
|  9–11 | harvest/sponsor across open, close, settlement               | `assigns yield at close execution...`                                  |
| 12–13 | Auto-Save into next round and concurrent withdrawal ordering | close-time preference tests; serialized accounting invariants          |
| 14–19 | loss, shortfall, pause, and emergency during draw            | loss/unwind tests and `keeps draw progress live...`                    |
| 20–21 | expired/stale strategy proof                                 | active epoch, state, handle, deadline, and signature checks            |
|    22 | empty round with deployed assets                             | empty-round prize rollover is independent of adapter basis             |
|    23 | multi-round dust/rounding                                    | reference accounting/rejection boundary properties and Comet tolerance |
| 24–25 | concurrent vaults / unwind versus harvest                    | independent deployments, adapter accounts, and four-vault phase test   |
| 26–27 | old/cross-vault draw or strategy proof                       | handle/contract/state binding and cross-vault proof regression         |
| 28–29 | prize never consumes principal; withdrawals category-pure    | accounting model plus principal/winnings withdrawal tests              |
|    30 | cross-vault contamination                                    | isolated vault/adapter storage and custody tests                       |

The prize cutoff is the successful `closeRound` transaction, not merely the scheduled `closesAt` timestamp. Deposits,
withdrawals, and sponsorship stop at the exclusive close timestamp. Yield harvested after `closesAt` but before someone
executes `closeRound` is committed to the closing round; yield harvested after `closeRound` funds the newly active
round. Sponsor funds already committed to the round are included; new sponsorship can target only the open current or
next round. Next-round deposits never affect the closed cumulative endpoints. Auto-Saved winnings enter principal and
TWAB at their actual allocation timestamp in whichever round is then open.

A stalled strategy epoch does not gate round close, aggregate proof, randomness, selection, or winnings allocation.
Available liquid principal remains withdrawable. Draw state never mutates adapter basis or epoch state. A pending burn
can be recovered after its deadline with the authentic wrapper proof; an amount-pending replenishment can be cancelled.

## Value conservation

The extended `AccountingReferenceModel` checks after every action:

`principal liability = liquid principal + deployed basis + principal in transition + recognized shortfall`.

It separately checks:

`liquid prize assets = unreserved realized yield + unreserved sponsor + reserved prize + winnings liability`, and

`harvested yield + sponsor contributions = liquid prize assets + withdrawn winnings + Auto-Saved winnings`.

The model tracks allocated, withdrawn, and Auto-Saved winnings cumulatively. Deposits/withdrawals affect only principal;
harvest/sponsor affect only prize assets; keep-available allocation moves reserve to winnings; Auto-Save explicitly
reclassifies funded prize assets into liquid principal at the processing timestamp.

## External calls and Compound

All wrapper, token, and Comet value paths use transient or ordinary reentrancy guards. State that authorizes external
movement is phase-bound; any revert rolls back accounting. Underlying and Comet approvals are exact and reset to zero.
The ERC-7984 callback accepts only the immutable asset and rejects malformed data/unregistered/closed-round calls. There
is no arbitrary callback target, delegatecall, proxy, or generic executor. Uniform settlement has no token call.

The adapter constructor and every later supply, principal withdrawal, harvest, and emergency exit dynamically check
Comet `baseToken()` and `baseScale()`. Supply/withdraw pauses and signed-principal integrity are checked at use time;
managed assets and shortfall are read live. The immutable Comet address, correctness of proxy/governance code, token
semantics, liquidity, interest-index behavior, and future governance remain deployment/external assumptions. A changed
base configuration fails closed. A hostile implementation cannot be made safe by local checks; operations pause and
liquid vault principal/draw state remain isolated while governance restoration or reviewed migration is required.

## Stage-0 revisit and dependencies

The authoritative register was reloaded rather than reconstructed. Its exact description for R-003, R-005, R-010, R-011,
and R-012 is: `Original detailed statement not recovered`. All were HIGH / OPEN_NONBLOCKING_PRODUCTION_RISK. R-014 is
the HIGH/Open schedule-capacity risk: schedule is not a control; weekly checkpoint/no-go review and the cut order are
mitigations. CP1 raises external-dependency impact through Compound, changes the production asset/wrapper, and adds
aggregate public-decryption and strategy assumptions, but does not recover the missing original text.

These six remain open. Owner: project security owner. Mitigation: freeze-breaking review, immutable evidence validators,
permissionless/manual paths, and no-go cut order. Trigger: recovered source bytes, any checkpoint/dependency/protocol or
privilege change. Deadline: comprehensive review no later than 2026-08-26. Frontend impact: no known flow change; any
recovered issue requiring an interface/state change breaks this freeze before release.

The current full audit is unchanged from CP0: 124 advisories (1 Critical, 57 High, 54 Moderate, 12 Low), 1,108 total
dependencies. The Critical is dev-only `solidity-coverage > sc-istanbul > handlebars`. Production-only audit has one
High, no Critical: `next > postcss > nanoid@3.3.16`; Leopold does not call the vulnerable custom generator/zero-size
path. Fixed upstream versions exist, but there is no relevant exploit path that outweighs pinned FHE/Hardhat/Next
compatibility risk. HOLD_PIN remains. Any dependency or lockfile change requires a dedicated compatibility gate.

## HCU and storage

Permanent live evidence remains authoritative: deposit 3,470,256/955,032; withdrawal 3,522,128/955,032; TWAB query
2,170,096/1,215,032; close accrual 1,215,096/1,215,032; random candidate 25,064/25,000; validity 149,032/149,000;
accepted modulo 1,943,032/1,943,000; four-selection 12,864,288/2,678,064; four-allocation including Auto-Save
11,416,416/2,579,064; proof/final settlement FHE 0; deploy request 2,359,064/1,666,000; replenish request
1,443,032/1,297,000; emergency 910,160/531,032. Fresh local execution of the permanent selector and observation
benchmarks passes after the refactor. The refactor does not change any FHE circuit.

Storage growth is append-only: participants O(unique users/vault); user balance observations O(balance-changing user
actions); preference observations O(preference changes); rounds O(rounds); winner predicates and processed per-round
state O(snapshot participants per nonempty round); materialized weights O(user-requested round reads); strategy epochs
O(epoch attempts). Proof replay uses phase/handle state, not an additional proof-record array. Events/activity are
offchain-indexed. There is no destructive cleanup; long-term archival RPC/indexing is a frontend infrastructure
assumption. Per-transaction FHE and traversal work remains bounded despite unbounded historical storage.

## Frozen interfaces and state machines

The candidate machine-readable ABI/selector/event/error/constructor/immutable/bytecode record is
`evidence/closure/LEOPOLD_CONTRACT_FREEZE.json`. The application manifest is `config/leopold-frontend-contracts.json`.
Final official deployment addresses are intentionally null until the reviewed bytecode is deployed; disposable CP1
addresses are evidence only and must not be presented as official. Neither candidate artifact becomes authoritative
while settlement remains not closed.

| Machine         | States and legal transitions                                                                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vault           | immutable deployment → active; no upgrade/destruction. Registry active flag affects discovery only.                                                                                                                                                                                             |
| Round           | UNINITIALIZED → OPEN → AGGREGATE_PENDING → EMPTY or AGGREGATE_FINALIZED → candidate states → TICKET_ACCEPTED → WINNER_PROCESSING → RECONCILIATION_PENDING → READY_TO_ALLOCATE → ALLOCATION_PROCESSING → WINNINGS_ALLOCATED → SETTLED. False reconciliation terminates at RECONCILIATION_FAILED. |
| Randomness      | none → candidate generated → validity pending → objectively rejected (retry) or ticket accepted (immutable/private).                                                                                                                                                                            |
| Settlement      | ticket accepted → monotonic selection cursor → public boolean reconciliation → monotonic allocation cursor → exactly-once finalization.                                                                                                                                                         |
| Strategy epoch  | NONE/terminal → AGING → UNWRAP_PENDING (deploy) or AMOUNT_PENDING (replenish) → COMPLETED; AGING and expired pending states have permissionless cancellation paths.                                                                                                                             |
| Replenishment   | AGING → AMOUNT_PENDING → proof-bound redemption/wrap → COMPLETED, or after deadline → CANCELLED.                                                                                                                                                                                                |
| Pause/emergency | guardian/vault toggles adapter pause; paused blocks deploy/harvest, does not block draw/liquid withdrawals; paused → permissionless vault emergency unwind → recovered principal/surplus plus explicit shortfall.                                                                               |

All normal lifecycle callers are permissionless except user-owned encrypted withdrawals/preferences/deposits and the
guardian's pause toggle. Preconditions are phase, time, immutable identity, encrypted proof/ACL, cap, liquidity, and
market integrity checks. Encrypted values touched are principal/TWAB/ticket/winner/prize/strategy amounts; public values
are timing, cursors, aggregate TWAB, sponsor/yield totals, proof booleans, and aggregate strategy amounts. External
calls occur only on named wrapper/USDC/Comet paths. Replay encounters a later phase/cursor or reduced entitlement.
Recovery is permissionless close/proof/finalization/cancellation or paused emergency unwind; no caller receives vault
custody.

## Freeze-breaking triggers

ABI, state-machine, production Solidity, FHE dependency, OpenZeppelin Confidential Contracts, lockfile/dependency,
Compound market/base-token, wrapper, privileged role, decryption authorization, randomness, exact TWAB, settlement
algorithm, or bytecode headroom below 1,500 bytes reopens review. So does any new Critical/High production-relevant
vulnerability. The comprehensive August 26 gate remains mandatory and is not deleted by this intermediate closure.
Source-map attribution and controlled compilation ranked the opportunities: strategy/emergency orchestration (~3.5 KB
