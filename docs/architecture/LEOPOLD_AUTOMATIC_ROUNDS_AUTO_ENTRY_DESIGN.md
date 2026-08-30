# Leopold Automatic Rounds and Auto-Entry Design

Status: Phase 1 architecture and threat-model review only. No production code, contract, deployment, or configuration
change is part of this document.

Baseline: immutable functional checkpoint `2618d360627f1ebd2c8d1e1514b15f3239000ebf`.

## Executive decision

Leopold already has the right protocol shape for optional automatic settlement. Every draw transition after the clock is
permissionless, phase-bound, cursor-bound, and resumable. A small independently hosted keeper can call the existing
functions without receiving a privileged role or any private-decryption capability. The existing permissionless/manual
path must remain the correctness and liveness fallback.

The clock does not execute an EVM transaction. Therefore current rounds are not self-advancing: a caller still has to
submit `closeRound`, public FHE proof finalizations, randomness, bounded processing, and finalization transactions.
`closeRound` does initialize the next round atomically, but only after somebody calls it.

True unattended “Save & Auto-Enter” is not implementable against the frozen official deployment without changing the
registration protocol. `LeopoldSettlementBondEscrow.registerForRound` binds the participant to `msg.sender`, and the
vault accepts registrations only from its immutable escrow. A frontend preference cannot sign future ETH bond
transactions, and an auxiliary contract would become the participant instead of the user. A future protocol version
could add explicit delegated registration and a user-funded prepaid bond credit, but that is a freeze-breaking
redeployment and is not proposed for the current release.

## Scope and source of truth

The review is tied to the deployed Leopold implementation and its source/evidence, not to a generic prize protocol:

- [`LeopoldVault.sol`](../../contracts/LeopoldVault.sol) contains the round, encrypted TWAB, randomness, selection,
  allocation, and settlement state machines.
- [`LeopoldSettlementBondEscrow.sol`](../../contracts/LeopoldSettlementBondEscrow.sol) contains round registration,
  reward credits, refunds, and native-asset liability accounting.
- [`config/leopold-frontend-contracts.json`](../../config/leopold-frontend-contracts.json) is the authoritative Ethereum
  Sepolia deployment manifest. It contains the four official vaults and their isolated escrows; this design does not
  create replacement addresses.
- [`LEOPOLD_DRAW_STATE_MACHINE.md`](LEOPOLD_DRAW_STATE_MACHINE.md),
  [`LEOPOLD_WINNER_SELECTION.md`](LEOPOLD_WINNER_SELECTION.md),
  [`LEOPOLD_PRIVATE_SETTLEMENT.md`](LEOPOLD_PRIVATE_SETTLEMENT.md), and
  [`LEOPOLD_PRE_FRONTEND_CONTRACT_FREEZE.md`](../security/LEOPOLD_PRE_FRONTEND_CONTRACT_FREEZE.md) record the reviewed
  state, privacy, HCU, and bond decisions.
- [`keeper/src`](../../keeper/src) currently contains credential, balance, and runtime probes. It is not a lifecycle
  executor and does not contain a round transaction loop.

The current demo profile is `0.005 ETH` per registration, `0.00125 ETH` per completed settlement pass per participant,
and `0.0025 ETH` refundable after both passes. These values are testnet UX parameters, not production economics.

## Current lifecycle

### Round boundary and settlement

The active round is stored on each independent vault. `closeRound` requires the active round to be `OPEN` and the chain
timestamp to have reached `closesAt`. It then:

1. accrues eligible TWAB exactly to the closing boundary;
2. snapshots the aggregate encrypted TWAB, sponsored prize, uncommitted yield, and participant-array length;
3. changes the closing round to `AGGREGATE_PENDING`;
4. increments `activeRoundId`; and
5. initializes the successor at the exact old `closesAt` with the same configured duration and `OPEN` state.

Thus the next round is automatic _inside a successful close transaction_. It does not open merely because wall-clock
time passed. The successor has a new participant array and eligibility set; it does not inherit the prior round's
participant snapshot, registration timestamps, encrypted ticket, winner predicates, or settlement cursors.

For a non-empty round, settlement normally requires one transaction for each row below, plus one transaction per
selection and allocation chunk. With `n` snapshotted participants and the current maximum chunk of four, the post-ticket
completion bound is `2 * ceil(n / 4) + 2` transactions: one reconciliation proof, one final settlement, and both bounded
passes. Close, aggregate proof, candidate generation/validity, and any candidate retries precede that bound.

| Step                           | Current function and exact prerequisite                                                                                                                             | Authorization and caller safety                                                                                                  | Encrypted-data boundary                                                                                                                                                           | Unattended-service assessment and replay/race behavior                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Close                          | `closeRound()`; active round is `OPEN` and `block.timestamp >= closesAt`                                                                                            | No keeper/admin modifier; any account can call. The transaction snapshots the old round and opens the next one atomically.       | Reads and updates encrypted aggregate/prize state; no clear user balance or TWAB is required.                                                                                     | Yes. One call advances one active boundary. EVM serialization means one racer wins; stale calls revert. A delayed close can be followed by another close when the newly active round later expires.           |
| Aggregate finalization         | `finalizeAggregate(roundId, cleartexts, proof)`; round is `AGGREGATE_PENDING`, exactly one encoded clear value, value within `MAX_AGGREGATE_TWAB`                   | Permissionless, but the public Zama proof must match the round's aggregate handle.                                               | Only the aggregate total is made publicly decryptable. Individual observations and weights stay encrypted.                                                                        | Yes, with a public-decryption worker. The proof and round state are checked on-chain; replay after finalization reverts. A competing valid submission makes later submissions stale.                          |
| Empty branch                   | `settleEmptyRound(roundId)`; aggregate finalization produced `EMPTY`                                                                                                | Permissionless. Rolls the reserved prize to the current open round and finalizes escrow with zero completed passes.              | No randomness or user private value is disclosed.                                                                                                                                 | Yes. It is the terminal path for zero aggregate. Duplicate or wrong-state calls revert.                                                                                                                       |
| Candidate generation           | `generateRandomCandidate(roundId)`; round is `AGGREGATE_FINALIZED` or objectively `CANDIDATE_REJECTED`, and public aggregate is nonzero                             | Permissionless. No seed, reroll authority, keeper role, or caller-supplied randomness exists.                                    | `FHE.randEuint128()` and the candidate remain encrypted. If the rejection domain is not exact, only an encrypted validity boolean is made publicly decryptable.                   | Yes. It is safe for any worker after a fresh state read. A successful acceptance changes the phase; a duplicate call reverts.                                                                                 |
| Candidate validity             | `finalizeCandidateValidity(roundId, cleartexts, proof)`; round is `CANDIDATE_VALIDITY_PENDING`                                                                      | Permissionless only with the authentic public proof for the candidate-validity handle.                                           | The proof reveals only the objective range-validity boolean. It does not reveal the candidate or accepted ticket.                                                                 | Yes, through the public Zama proof path. A false proof result enters `CANDIDATE_REJECTED`, after which the only legal retry is a fresh contract-generated candidate. Invalid or replayed proofs revert.       |
| Selection batches              | `processSelection(roundId, maxParticipants)`; ticket accepted or selection already processing; `1 <= maxParticipants <= 4`                                          | Permissionless. The vault chooses the next slice from its cursor; the caller cannot choose users, indexes, order, or a subset.   | Each exact historical weight, accepted ticket comparison, winner predicate, cumulative interval, and winner count remain encrypted.                                               | Yes. Use chunk four where the current measured limit remains valid. Cursor and state advance atomically; two keepers cannot process the same entries. Calls after completion or with an invalid chunk revert. |
| Reconciliation                 | `finalizeSelectionReconciliation(roundId, cleartexts, proof)`; selection cursor has reached the snapshotted participant count and state is `RECONCILIATION_PENDING` | Permissionless with the authentic proof of the encrypted objective conjunction `cumulative == aggregate && winnerCount == 1`.    | Only this objective boolean is publicly decrypted. No winner address, predicate, accepted ticket, or per-user weight is exposed.                                                  | Yes, through public proof production. A true result permits allocation. A false result enters `RECONCILIATION_FAILED`; only the defined recovery path may then settle. Replay reverts.                        |
| Failed reconciliation recovery | `recoverFailedReconciliation(roundId)`; state is `RECONCILIATION_FAILED`                                                                                            | Permissionless; no caller gets prize custody.                                                                                    | Rolls the encrypted reserve forward without identifying a winner.                                                                                                                 | Yes. It pays only the completed selection-pass reward and finalizes the unused allocation collateral as specified. It is terminal and replay-safe.                                                            |
| Allocation batches             | `processAllocation(roundId, maxParticipants)`; `READY_TO_ALLOCATE` or `ALLOCATION_PROCESSING`, valid chunk, and the _current_ accumulation round is genuinely open  | Permissionless. The active-open check is deliberate: it prevents global TWAB from advancing past an unclosed current boundary.   | Every participant receives the same encrypted winner/prize/ACL/observation shape. Auto-save preference is evaluated at the winning round's close; no clear winner branch is used. | Yes, but the worker must derive the extra active-round precondition. If the active round has expired, it must be closed first. Cursor updates and escrow reward accrual are atomic; duplicate chunks revert.  |
| Final settlement               | `finalizeSettlement(roundId)`; allocation cursor is complete and state is `WINNINGS_ALLOCATED`                                                                      | Permissionless and phase-bound. Calls the immutable escrow to finalize two completed passes and the deterministic refund amount. | No new private value is disclosed; winnings remain encrypted and wallet-authorized.                                                                                               | Yes. One successful call is terminal. Competing or replayed calls revert.                                                                                                                                     |

The two exceptional transitions are part of the same state machine: `settleEmptyRound` handles a zero aggregate without
randomness, and `recoverFailedReconciliation` handles an authenticated false reconciliation without allocation. Neither
path invents a result or silently retries randomness.

### Why the product currently looks non-automatic

Ethereum contracts cannot wake themselves at a timestamp. `closesAt` is a guard, not a scheduler. In addition, public
FHE proofs are asynchronous data supplied by a caller; the chain cannot obtain a Zama proof by itself. The official
deployment therefore needs an external transaction sender for every state-changing step. The existing live closure
harness performs those calls sequentially for evidence, but it is not a continuously running service. The repository's
keeper workspace validates credential isolation and runtime dependencies only.

The result is intentionally “permissionless maintenance,” not “manual administrator control”: a user, sponsor,
settlement reward recipient, independent keeper, or any other account may advance a legal step. The lack of a caller
does not grant anyone authority over private data or funds; it only delays liveness.

## Recommended automatic settlement architecture

### Recommendation

Use an independently hosted, minimal Sepolia keeper as an optional liveness service, with a dedicated low-balance
operator key held in encrypted secret storage. It should call the existing contracts directly, use read-only RPC calls
to derive the next legal operation, and retain the public/manual fallback. Vercel may expose a health view or trigger a
stateless wake-up, but the frontend and a Vercel browser bundle must never hold the keeper key.

The keeper is not trusted for correctness. The contract remains the source of truth, and the keeper has no role, no ACL,
no vault custody, no strategy authority, and no private-decryption authority. A keeper key must remain distinct from the
deployer, registry owner, guardian, treasury, and user wallets, consistent with
[`KEEPER_CREDENTIAL_POLICY.md`](../operations/KEEPER_CREDENTIAL_POLICY.md).

### Provider comparison

| Mechanism                                 | Fit for current Leopold                                                                                                              | Main security/reliability tradeoff                                                                                                                                                                                       | Decision                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Cron + funded operator             | Good as a trigger for a short, stateless pass; unsuitable as the sole durable executor                                               | Vercel invokes a Function, does not retry a failed cron invocation, can overlap invocations, and has plan-dependent timing/duration. It requires an external lock and durable unknown-outcome ledger.                    | Use only as an optional trigger/monitor. Do not put a signing key in the browser or rely on Cron alone for settlement liveness. See [Vercel Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs) and [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). |
| Gelato                                    | Can express scheduled, event, or condition-triggered calls and can run dynamic logic                                                 | Adds provider task configuration, funding, availability, and resolver/secret-surface dependencies. A resolver still has to obtain the correct public proof and state; provider execution is not protocol authority.      | Viable as a later managed-executor option after a Sepolia task and proof-path pilot. It is not needed for the current deployment. See [Gelato task creation](https://docs.gelato.cloud/web3-functions/how-to-guides/create-a-web3-functions-task/using-the-automate-sdk).                |
| Chainlink Automation                      | Ethereum Sepolia is listed in the official Automation registration surface                                                           | Current contracts do not implement `checkUpkeep`/`performUpkeep`; an adapter or new contract would be needed. Billing, upkeep funding, service-version currency, and public-proof submission still need separate design. | Not the minimal current-contract path. Consider only with a reviewed adapter and current service verification. See [Chainlink's Automation contract tutorial](https://chain.link/tutorials/trigger-smart-contract-execution).                                                            |
| Independently hosted keeper               | Directly matches the current permissionless ABI, supports public proof fetching, durable reconciliation, and exact one-write control | Requires operational key custody, RPC redundancy, monitoring, funding limits, and deployment/incident discipline                                                                                                         | Recommended optional liveness service.                                                                                                                                                                                                                                                   |
| Permissionless user-triggered maintenance | Already supported and economically incentivized by settlement rewards                                                                | Liveness depends on someone choosing to call; no service-level timing guarantee                                                                                                                                          | Mandatory fallback and the protocol's trust-minimized baseline.                                                                                                                                                                                                                          |

The recommendation is based on protocol compatibility and failure semantics, not convenience. A third-party automation
network cannot remove the need to reconcile mined state, and it cannot make a private FHE value safe to decrypt. A
direct keeper is easier to constrain while current functions remain permissionless.

### Keeper execution algorithm

Each loop is a read/plan/reconcile cycle, never a blind sequence:

1. Read chain ID, a recent block, active round, every historical round still in a nonterminal state, relevant escrow
   cursors/liabilities, and the public handles required by the next proof step.
2. Select the lowest legal state transition according to the state machine. For allocation, first ensure the active
   round is open under the chain timestamp; if not, plan its close before allocation can mutate global TWAB.
3. Simulate the exact calldata against a fresh state. Do not precompute a cursor, proof, chunk, or round from browser
   memory.
4. For aggregate, candidate-validity, and reconciliation finalization, request only the public Zama decryption/proof
   that the contract explicitly makes public. Verify the handle/round association and clear-value domain before
   simulation. Never request private user handles or the accepted ticket.
5. Persist an operational record containing `(chainId, vault, roundId, phase, cursor, calldata digest, nonce, txHash)`.
   This record may contain public operational data only; it must not contain private balances, TWABs, tickets, winner
   predicates, or decrypted user values.
6. Submit at most one transaction for that operation. After submission, wait for the receipt and confirmations. If the
   RPC returns an unknown outcome, do not replace or retry the transaction: reconcile its hash, nonce, block inclusion,
   and authoritative contract state first.
7. On restart, a receipt or state transition marks the operation complete. A stale operation whose state was advanced by
   another keeper is also complete. Only a fresh state read and fresh simulation may create a new operation.
8. Treat a revert as a state/proof/availability result, not as permission to retry. Re-read and classify it; only a
   contract-defined candidate rejection may lead to another `generateRandomCandidate` operation.

This makes a crash between any two stages resumable. It also makes multiple keepers safe: the chain serializes state and
cursor updates, one caller succeeds, and the other observes a receipt/revert or an already-advanced state. An optional
off-chain lock reduces duplicate gas but is not a correctness dependency.

## Privacy and FHE boundaries for automation

The keeper may read public round metadata, public sponsored/prize amounts, participant counts, cursors, escrow
registration/refund flags, and the public-decryption handles intentionally exposed for aggregate/range/reconciliation
proofs. It must not receive authorization to decrypt or log:

- private USDC balances, vault principal, or winnings;
- individual TWAB/eligibility values;
- the random candidate, accepted random ticket, or winner predicates;
- winner identity or the private prize result.

`FHE.randEuint128` creates the candidate in the vault. The candidate and `acceptedTicket` receive contract-only ACLs;
the accepted ticket is never authorized for participant, keeper, admin, sponsor, frontend, or public decryption. The
only FHE outputs a settlement worker may obtain are the public aggregate, candidate-validity boolean, and reconciliation
boolean required by the deployed contract. User result/eligibility reveals remain explicit wallet-authorized actions.

## Save Only versus Prize Savings / Save & Auto-Enter

### Current semantics

Leopold intentionally separates private saving from round registration:

- **Save Only**: wrap/save private USDC into the vault. No bond is posted and no future round registration is created.
- **Prize Savings / Save & Auto-Enter (desired product)**: save privately, explicitly opt into future registrations for
  that vault, and fund the required public ETH bond mechanism.

The existing `setAutoSavePreference` is not an entry preference. It controls whether an eventual encrypted prize is kept
as winnings or added to principal, and is resolved at the winning round's close. It must not be reused or renamed as
automatic round registration.

The desired UX should make the choice explicit, show that entry is public while savings and weight remain private, and
provide a visible opt-out. Opting out must affect future rounds only. A registration already accepted for an open round
cannot be silently removed, and its bond cannot be reclaimed before terminal escrow finalization.

### What the current deployment can and cannot do

| Capability                                                               | Classification                           | Result                                                                                                                                                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic settlement of an already registered round                      | A: off-chain with current contracts      | Supported by an optional keeper; all calls are already permissionless.                                                                                                                             |
| Store a frontend-only future-entry preference                            | A: off-chain                             | Possible as a reminder or “ready for one-click entry,” but it is not automatic participation and must not be marketed as such.                                                                     |
| Register a wallet-owned user from an auxiliary caller                    | B: auxiliary contract                    | Not compatible with current identity semantics. `registerForRound` records the auxiliary contract as `msg.sender`; the vault callback and eligibility would belong to that contract, not the user. |
| Add a new helper that calls the current escrow on behalf of a user       | B                                        | Not compatible. The current vault accepts callbacks only from its immutable deployed escrow, and the current escrow has no user delegation or credit balance.                                      |
| True unattended future user registration with current official addresses | C: existing contract change/redeployment | Required. The frozen vault/escrow pair must gain explicit delegated registration and bond funding semantics, or a new vault/escrow version must be deployed.                                       |

Therefore the safe current-release behavior is Save Only plus explicit per-round entry. A future auto-entry version must
not silently change the official four-vault deployment.

## Bond economics and proposed future solution

### Current economics

The bond exists to make settlement work externalization non-free. Each registered address creates one deterministic
selection entry and one deterministic allocation entry. The escrow shifts a fixed `REWARD_PER_PARTICIPANT_PASS` from the
registered round's unresolved liability to the public progress caller for each completed pass. The remainder is
refundable and is identical for winners and losers.

For the official Sepolia profile:

- participant pays exactly `0.005 ETH` in the same `registerForRound(roundId)` transaction;
- each selection/allocation participant-pass credits `0.00125 ETH` to whoever progresses that pass;
- after both passes, `0.0025 ETH` is refundable to the registered participant;
- an empty aggregate refunds the full `0.005 ETH` because no passes ran;
- an authenticated failed reconciliation after selection refunds `0.00375 ETH`, because only one pass ran.

The registered wallet calls `claimBondRefund(roundId)` after the vault finalizes escrow accounting. A progressor calls
`withdrawSettlementRewards()` for its separate account-level credit. A user can be both participant and progressor, but
the two balances and claims are distinct.

Thirty normal consecutive entries require thirty independent registrations: `0.15 ETH` gross collateral. If every round
completes both passes and the user does not earn progress rewards, `0.075 ETH` is refunded and `0.075 ETH` is allocated
to progressors, before gas. If all thirty rounds are empty, the full gross amount is refundable. If rounds remain
unsettled, all their registered bonds remain separate liabilities. A single untracked “standing bond” cannot cover
thirty rounds safely.

### Bond design comparison

| Design                                         | Preserves the current anti-free-work property?                                                                                  | Double-liability/risk                                                                                             | Assessment                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepaid per-user, per-vault bond wallet/escrow | Yes, if every registration atomically locks exactly one `BOND_AMOUNT` and every round records its own liability                 | Low if available credit, unresolved liabilities, rewards, refunds, and withdrawals are separate ledger categories | Recommended future design. User explicitly deposits ETH credit, and any caller may consume one unit for a future opt-in registration.                           |
| Reusable standing bond                         | No if one fixed deposit is merely referenced for many rounds; it creates multiple refund/reward obligations from one collateral | High unless it is implemented as the prepaid design with a fresh per-round lock                                   | Do not implement as a shortcut. “Reusable” is safe only when a returned amount is atomically re-credited and no prior round liability remains.                  |
| User-funded automation balance                 | Potentially yes, if its bond portion is reserved per round                                                                      | General gas credit can be confused with participant bond and insolvency accounting                                | Acceptable only if split into an explicit bond-credit ledger and optional gas budget. Do not let a keeper debit it for anything other than the authorized bond. |
| Sponsor-funded registration                    | Not by default; it removes the user’s per-entry cost and lets a sponsor create unbounded work                                   | Sponsor must underwrite every round and may create a new griefing/sponsor-liability surface                       | Not recommended for the core product. A bounded, explicitly sponsored campaign would be a separate reviewed product.                                            |
| Eliminate or materially reduce the bond        | No demonstrated replacement for progress rewards and recurring-work externalization                                             | Either settlement becomes free again or rewards need an unrelated treasury                                        | Rejected. The current security property is not preserved by convenience alone.                                                                                  |

### Exact recommended future mechanism

For a new reviewed vault/escrow version, use the following semantics:

1. A user wallet explicitly deposits ETH into a per-vault `automationBondCredit`. The deposit is user-owned and
   withdrawable only to that wallet when not reserved; no private token transfer occurs.
2. The user explicitly enables auto-entry for that vault. The preference is keyed to the financial wallet and has a
   future effective round, so enabling or disabling at a boundary cannot alter a closed round.
3. Any caller can invoke a delegated `registerForRoundFor(user, roundId)` only when the user is opted in, the round is
   the current open round, the effective round boundary has passed, the user is not already registered, and available
   credit is at least the exact bond. The operation atomically debits one credit unit, creates the round liability,
   records the user as the participant, and calls the vault's registration callback.
4. The participant remains the user wallet for eligibility, FHE ACLs, refund ownership, and private result reveal. The
   keeper is only the transaction sender/progressor and cannot substitute itself.
5. Refunds are still round-local and pull-claimed by the participant. A user may explicitly top up again for future
   rounds; a refund must not be simultaneously counted as both a claimable refund and new automation credit. An optional
   explicit “recycle refund to credit” operation would have to clear the refund liability before re-crediting the
   available balance atomically.
6. The existing two progress rewards remain unchanged. The new escrow must maintain the same invariant:

   `deposited = unresolved liability + reward liability + refund liability + rewards withdrawn + refunds withdrawn`.

No public minimum savings amount should be added merely to make the keeper's work cheaper. The keeper cannot inspect
private principal, and a zero-balance opt-in must have exactly zero TWAB weight. It may still consume a user-funded bond
and create a zero-weight public registration; that is the honest privacy-preserving outcome. If the product requires
preventing even that registration, it would need a public “has private balance” signal or a new confidential admission
primitive, both of which need separate privacy review.

Withdrawals remain safe: a partial/full withdrawal only reduces future eligible TWAB at its actual transfer timestamp;
it does not return the bond early. A full withdrawal before the next round leaves no private weight for that round. The
user can opt out for later rounds, but cannot retroactively remove an already accepted registration.

## Threat model and fail-safe controls

| Threat                                      | Impact                                                                  | Required control                                                                                                                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious keeper                            | Censorship, delay, bad calldata, or misleading off-chain reports        | No keeper privilege; authoritative phase/proof/cursor checks; manual and any-caller fallback; never trust keeper-reported private data.                                                                                                |
| Offline keeper                              | Delayed close or settlement                                             | Permissionless public functions and settlement rewards remain available; monitor liveness but do not make the keeper a protocol dependency.                                                                                            |
| Duplicate keepers/racing                    | Duplicate gas or attempted double processing                            | Simulate from fresh state; one operation per phase/cursor; EVM serialization; stale callers reconcile receipt/state and do not retry.                                                                                                  |
| Stuck/reorged/unknown transaction           | Blind replacement could duplicate or conflict with later progress       | Persist hash/nonce/calldata digest; reconcile receipt, inclusion depth, nonce, and contract state before any replacement. No automatic retry on unknown outcome.                                                                       |
| User toggles auto-entry near a boundary     | Retroactive or ambiguous entry                                          | Preference has an explicit future effective round; close snapshots the old round; disable never removes an accepted entry.                                                                                                             |
| Zero-balance auto-entry spam                | Public settlement work with no meaningful weight                        | Zero balance still has encrypted zero weight; require user-funded bond credit for each entry; no keeper access to principal; monitor but do not leak a balance-existence predicate.                                                    |
| Bond exhaustion                             | Opted-in users cannot be registered; no insolvency if handled correctly | Registration checks available credit; each bond is locked per round; no credit is spent twice; surfaced as “automation funding needed,” with manual entry still possible.                                                              |
| Insufficient keeper gas                     | Liveness delay only                                                     | Low-balance ceiling, funding alerts, multiple independent callers, reward accounting, and no protocol reliance on a single key.                                                                                                        |
| User withdraws during processing            | Weight or principal accounting corruption                               | Existing timestamps/cursors and encrypted accounting serialize the action; allocation requires an actually open active round; withdrawal never edits a closed round.                                                                   |
| Account switch or stale preference          | One wallet inherits another's auto-entry                                | Key all provider state by verified financial address plus vault; read on-chain preference/credit for the current address; clear client session state on account change.                                                                |
| Keeper selectively enters users             | Censorship or unfair participation                                      | Any caller may register an opted-in user; user can call directly; registration timing and state are public; no keeper chooses winner or weight. A future design should expose an auditable opt-in event and avoid a keeper-only queue. |
| Keeper learns private financial information | Privacy breach                                                          | Keeper reads only public metadata and explicitly public proof handles; no principal/TWAB/result decryption capability; accepted ticket ACL remains contract-only.                                                                      |
| Stale frontend preference                   | Wrong wallet or round registration                                      | Frontend is advisory; the future contract checks wallet, effective round, open state, registration, and credit on-chain.                                                                                                               |

## Compatibility classification

### A — Off-chain/frontend with current deployed contracts

Automatic _settlement_ is compatible. A worker can monitor the four official vaults, close due active rounds, obtain the
three permitted public proof types, and advance bounded cursors. No contract or address change is needed. This is
optional infrastructure and cannot remove the manual fallback.

Automatic _entry_ is not compatible. A browser can store a preference, notify the user, or produce a one-click
transaction while the wallet is present, but it cannot autonomously sign future ETH bond transactions. A client-side
timer would also fail on a closed tab and would not be a protocol guarantee.

### B — Auxiliary contract with frozen Leopold contracts

An auxiliary settlement adapter is unnecessary because current calls are already permissionless. An auto-entry helper
cannot safely solve identity: calling the frozen escrow makes the helper `msg.sender`, and the frozen vault accepts only
its immutable escrow as the callback authority. The helper would either register itself, losing the user's private
identity/ACL, or require a forbidden change to the frozen vault. B is therefore rejected for auto-entry.

### C — Modify/redeploy existing Leopold contracts

True unattended auto-entry requires C under the current architecture. The paired future vault/escrow must support an
explicit user-authorized participant parameter, per-round bond-credit reservation, opt-in effective boundaries, and
unchanged refund/reward liability accounting. Because the current vault stores an immutable escrow address and the
current escrow has no delegation or credit balance, changing only one deployed contract is insufficient.

This would be a new protocol/deployment version, not a casual upgrade: official non-upgradeable contracts cannot be
patched in place. It requires a separate security review, HCU/bytecode/freeze evidence, migration plan, new addresses,
frontend compatibility, and an explicit decision about existing positions. No redeployment is authorized by this Phase 1
branch.

## Required implementation surfaces after a separate approval

### Settlement automation

- A worker package with readonly state derivation for every vault and historical pending round.
- Zama public proof client integration limited to aggregate, candidate-validity, and reconciliation handles.
- Single-write transaction journal, nonce lock, receipt/confirmation reconciliation, provider failover, and
  no-blind-retry policy.
- Funding ceiling and address separation checks from the existing keeper credential policy.
- Alerts for due rounds, proof delays, stuck nonces, repeated reverts, low ETH, RPC divergence, and unresolved escrow
  liabilities.
- Manual CLI/runbook that calls the same state-derived operations without any keeper-only ABI.

### Auto-entry protocol version

- Vault/escrow state for wallet-specific opt-in, effective future round, available bond credit, and per-round reserved
  liabilities.
- Explicit user deposit/top-up/withdraw-credit and opt-in/opt-out transactions.
- Permissionless delegated registration that preserves the user's participant address and checks all boundary
  conditions.
- Events/read methods sufficient for an indexer without exposing private principal, TWAB, ticket, result, or decryption
  capability.
- Formal liability, reentrancy, duplicate registration, account-isolation, and cross-vault tests.

### Frontend/provider

- Keep Save Only and explicit current-round entry distinct.
- Present auto-entry as enabled/disabled/funding-needed using authoritative wallet/vault/round reads.
- Never infer auto-entry from private balance or reuse `setAutoSavePreference`.
- Re-read current wallet and financial-wallet identity on reconnect/account switch; do not inherit a previous address's
  preference.
- Keep private values in the existing provider/controller boundary and maintain explicit user result/eligibility reveal.

## Migration implications

The current official round and all historical registrations remain governed by the frozen rules. No migration may
retroactively enter a closed/settled round, convert an existing `setAutoSavePreference`, or move private principal/bond
funds without an explicit user transaction.

If a future vault/escrow version is deployed, existing users should remain on the old official addresses until they
explicitly opt into a reviewed migration. A new version cannot assume it can transfer a user's private balance or
financial identity. Existing round-1/round-2 histories, result handles, refunds, and rewards remain in the old
deployment and must remain readable. Migration of any public bond credit must be a separate user-authorized operation.

## Test and evidence plan

### Current-contract settlement automation

- State-machine tests derive the next legal call from every round state, including empty and failed-reconciliation
  branches, delayed close, active-round expiry during allocation, and multiple pending historical rounds.
- Two-keeper race tests prove one cursor advancement/reward accrual, safe stale reverts, and no duplicate finalization.
- Crash tests stop after broadcast and restart from receipt/state reconciliation; unknown outcomes never trigger a blind
  second write.
- Public proof tests bind aggregate, candidate-validity, and reconciliation proofs to the correct round/handle and
  reject wrong, stale, malformed, and cross-vault proofs.
- Negative ACL tests prove no keeper/admin/participant authorization for principal, individual TWAB/eligibility,
  candidate, accepted ticket, winner predicate, or private result.
- Sepolia dry-runs should use read-only preflight, one-write receipts, bounded confirmation policy, and evidence that
  the permissionless/manual path remains usable.

### Future auto-entry version

- Save Only never changes opt-in or registration.
- Explicit opt-in is wallet/vault scoped and takes effect only in a future round.
- Opt-out cannot retroactively remove a bond or registration.
- New and old account/wallet switching never shares preference or credit.
- Delegated registration preserves the user participant address and private ACLs.
- Exact one-bond debit per round, no double liability, correct empty/failed/normal refunds, and unchanged two-pass
  reward economics.
- Thirty-round and delayed-settlement simulations confirm sufficient collateral requirements and insolvency invariants.
- Zero private savings produces zero encrypted weight; no public amount or balance-existence leak is introduced.
- Partial/full withdrawal, auto-save allocation, private result reveal, winnings withdrawal, refund, and reward claims
  remain unchanged and round-specific.

## Staged implementation proposal

1. **Freeze-preserving settlement worker:** implement the state reader, proof adapter, journal, reconciliation rules,
   and manual CLI as an optional package. Run only against a disposable fork/test deployment until live-read and funding
   evidence are complete.
2. **Permissionless liveness pilot:** operate one low-funded dedicated Sepolia keeper alongside independent manual
   calls; prove race, outage, reorg, and no-private-decrypt properties. Do not make the UI or protocol depend on it.
3. **Auto-entry design review:** specify the new vault/escrow ABI, bond-credit ledger, public event surface, account
   isolation, and zero-balance policy. Reopen contract freeze and HCU/bytecode review before coding.
4. **New deployment only after approval:** deploy a separately identified version, prove topology and runtime integrity,
   migrate no state implicitly, and enable the feature only for explicit user opt-ins.
5. **Product rollout:** add provider/controller reads and explicit Save Only versus Prize Savings controls, then test
   account switching, opt-out boundaries, private reveals, refunds, rewards, and withdrawals.

## Can this be completed before final submission?

The optional settlement worker can be completed before submission if it receives its own operational, key-custody,
Sepolia liveness, and race/reorg evidence; it is not required for protocol correctness. The true automatic entry
capability cannot safely be completed before final submission on the frozen official deployment. Implementing it would
require a new protocol version and redeployment, changing the round-registration/escrow semantics and reopening the
freeze. The current final product should therefore retain explicit entry, permissionless settlement, and the tested
manual fallback.

## PoolTogether product comparison

PoolTogether's official product materials describe the product behavior Leopold may reasonably emulate: depositing
creates ongoing prize eligibility rather than requiring a separate entry for each prize, and the protocol is designed to
progress permissionlessly without an administrator. See the official
[V4 FAQ](https://docs.pooltogether.com/welcome/faq),
[V5 introduction](https://dev.pooltogether.com/protocol/introduction/), and
[V5 design](https://dev.pooltogether.com/protocol/design/).

Leopold should converge on those product-level properties only in a reviewed future version:

- a persistent private saving position can opt into future rounds without repeated manual registration;
- routine draw maintenance is carried out by independent callers and does not depend on a privileged administrator;
- principal remains withdrawable under the vault's liquidity/accounting rules.

Leopold must remain materially different in implementation and user disclosure:

- private balances, encrypted savings, encrypted TWAB/eligibility, encrypted randomness, encrypted winner predicates,
  and private results are protected by Zama FHEVM;
- an accepted random ticket is permanently encrypted and never authorized for participant, keeper, or admin decryption;
- historical private eligibility/result reveal is an explicit authorized wallet action;
- entry is currently a separate public ETH-bonded action, and settlement progressors receive escrowed rewards while
  unused bond value is claimed separately;
- settlement is a resumable encrypted multi-stage pipeline with public proof finalizations, not a copied PoolTogether
  draw manager or winner-claim architecture.

PoolTogether is used here as a product reference only. No PoolTogether contract, registry, keeper, ticket, or
authentication architecture is transplanted into Leopold.
