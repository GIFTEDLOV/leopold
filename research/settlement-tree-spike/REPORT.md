# Leopold CP1 settlement-tree research spike

Date: 2026-08-12  
Repository: `/home/dell/zama-szn4`  
Starting/current HEAD: `8f30ba74a1fcbfa2cbb45aa420a90b3ec65f7951`  
Status: research only; production contracts were not changed by this spike.

## 1. Executive verdict

The proposed ordering idea is mathematically correct: a stable public slot plus an exact encrypted historical prefix
gives the interval `[prefix_i, prefix_i + weight_i)`, and an accepted encrypted ticket selects exactly one
positive-width interval. A sparse, fixed-universe historical segment tree avoids both global selection and global
allocation. It also preserves old-round answers after later mutations.

It is **not a viable CP1 replacement in the pinned FHEVM environment as implemented**. The hard blocker is HCU. With
uniform Auto-Save checkpointing included, a worst-case populated depth-6 (64-slot) materialization costs 19,370,832 HCU.
Depth 7 (128 slots) already reverts at the 20,000,000-HCU transaction ceiling. Depth 20 ordinary time-separated balance
updates also exceed that ceiling. A capacity small enough to execute simply recreates the forbidden participant cap; a
capacity large enough to resist exhaustion is not executable.

The spike also leaves production-integration work unproven: cross-contract ciphertext authorization from the vault,
binding the helper to the vault's already rejection-sampled ticket and backed prize reserve, and a production reserve
lifecycle. These are explicitly not hidden behind a pass verdict.

**Verdict: SPIKE PARTIAL — PINNED FHEVM HCU LIMITS MAKE A SYBIL-RESISTANT TREE DEPTH INFEASIBLE**

## 2. Baseline current settlement complexity

The current dirty candidate represents participants as one append-only `address[]`; `isParticipant` prevents duplicate
addresses. Registration is free, unconditional while the active round is open, and permanent. A round snapshots the
entire array length at close.

Per-user exact TWAB is an encrypted `euint64` balance plus immutable observations containing public timestamp, encrypted
balance, and encrypted `euint128` cumulative balance-time. Public-timestamp binary search reconstructs `C(t)` and
`TWAB(start,end) = C(end) - C(start)`. Global aggregate state uses the same continuous integral, and close publishes
only aggregate `T` after authenticated public decryption.

Randomness remains an encrypted `euint128` candidate. Rejection sampling uses the largest multiple of public `T` below
`2^128`; only the candidate-validity boolean is publicly proven when needed. The accepted ticket is `candidate mod T`,
is contract-only, and is never decrypted.

After ticket acceptance, selection traverses every snapshotted participant in chunks of at most four, saves an encrypted
winner predicate, accumulates weights and encrypted winner count, and publicly proves only reconciliation. Allocation
then traverses the same snapshot in chunks of four, uniformly moving encrypted zero or prize into winnings/Auto-Save.
Selection and allocation cursors prevent chunk replay. Finalization is a separate call.

The exact post-ticket transaction count is:

`2 * ceil(n / 4) + 2`

The two constants are reconciliation finalization and settlement finalization. From `closeRound` through settlement on
the immediate ticket-acceptance path it is `2 * ceil(n / 4) + 5`. A non-power-of-two `T` needs a candidate-validity
proof call; first-attempt acceptance is `2 * ceil(n / 4) + 6`, and every rejected candidate adds two calls. Rejection
sampling terminates probabilistically, not with a deterministic attempt count.

|     `n` | selection chunks | allocation chunks | post-ticket calls | immediate-path calls from close |
| ------: | ---------------: | ----------------: | ----------------: | ------------------------------: |
|       1 |                1 |                 1 |                 4 |                               7 |
|       4 |                1 |                 1 |                 4 |                               7 |
|      16 |                4 |                 4 |                10 |                              13 |
|      64 |               16 |                16 |                34 |                              37 |
|     256 |               64 |                64 |               130 |                             133 |
|   1,024 |              256 |               256 |               514 |                             517 |
|  10,000 |            2,500 |             2,500 |             5,002 |                           5,005 |
| 100,000 |           25,000 |            25,000 |            50,002 |                          50,005 |

Live CP1 evidence measures a full selection chunk at 12,864,288 HCU and a full Auto-Save allocation chunk at 11,416,416
HCU. Their conservative full-chunk sum is 24,280,704 HCU:

|     `n` |  conservative selection + allocation HCU |
| ------: | ---------------------------------------: |
|       1 | 6,070,224 measured one-participant steps |
|       4 |                               24,280,704 |
|      16 |                               97,122,816 |
|      64 |                              388,491,264 |
|     256 |                            1,553,965,056 |
|   1,024 |                            6,215,860,224 |
|  10,000 |                           60,701,760,000 |
| 100,000 |                          607,017,600,000 |

A registered address is revisited forever even if it never deposits or has been at zero for years. Therefore an attacker
pays registration once but imposes two future FHE traversals in every nonempty round. Chunking bounds each transaction;
it does not bound mandatory total work or keeper expenditure.

## 3. Architecture tested

The spike assigns each account one stable public `uint32` slot and uses a sparse fixed-logical-universe segment tree.
Every leaf and ancestor stores encrypted historical aggregate observations. A known slot's prefix is the sum of its
canonical left siblings. Round close queries only the root. After a ticket is fixed, any address may invoke the same
materialization call for a target account. The encrypted winner predicate selects encrypted prize or zero. Only the
target receives payout ACL; the caller does not.

The helper is immutable, has no upgrade/admin path, holds no token, and only its immutable `VAULT` may register or
mutate financial state. Four helpers therefore isolate four vault domains. The external-encrypted ticket/prize inputs in
the prototype are test harness plumbing, not a proposed production ABI: production must pass already accepted ticket
state and a backed round reserve through a proven cross-contract ACL path.

## 4. Exact TWAB mathematics

For a node with balance `B_k` after mutation at public time `t_k` and cumulative integral `C_k` at `t_k`:

`C(t) = C_k + B_k * (t - t_k)`, where `t_k` is the last observation with `t_k <= t`.

For any closed interval convention used by Leopold:

`nodeWeight(start,end) = C(end) - C(start)`.

Deposits therefore accrue only after their transaction timestamp. Withdrawals preserve all prior area and remove only
future area. Same-timestamp mutations have zero elapsed area and may replace the latest balance/cumulative observation.
The reference model uses unbounded integers; the Solidity hypothesis uses `euint64` balances and `euint128` cumulative
values and consequently inherits Leopold's required balance, duration, and aggregate-domain caps.

Across 1,000 deterministic randomized scenarios and 4,000 rounds, the pure model differentially compared every user
weight with a naïve action-log integral. It exhaustively walked every ticket in `[0,T)` for every generated nonempty
round and found exactly one winning interval, with no gaps or overlaps. It also checked zero balances, withdrawals,
re-deposits, same timestamps, delayed old-round queries, slot gaps, and exact interval boundaries.

## 5. Data-structure choice

| Candidate                                     | Finding                                                                                                                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed-capacity Fenwick                        | Correct if the entire logical capacity exists from genesis; `O(depth)` update/prefix, but fixed capacity and the same historical/HCU burden remain.                                                                         |
| Dynamically grown Fenwick                     | Rejected. An update to slot 1 at size 1 never reaches a future ancestor introduced when slot 2 appears. The reference test contains this counterexample.                                                                    |
| Checkpointed/versioned Fenwick                | Dynamic expansion needs authenticated carry/backfill from old totals or version transitions. It does not remove historical ciphertext work and adds a complex migration state machine.                                      |
| Paged/two-level Fenwick                       | Caps local work but moves the same problem to a top tree. Deferred top updates create a close-time queue attackers can spam; fixed top capacity recreates exhaustion.                                                       |
| Persistent segment tree                       | Exact sparse growth and historical roots are conceptually clean, but every encrypted mutation still touches `O(depth)` nodes and storage is at least comparable.                                                            |
| Sparse fixed-universe historical segment tree | Selected as the clearest correctness prototype. Conceptual ancestors exist from genesis; zero nodes consume no storage; update/query are `O(depth)`. HCU ultimately rejects useful depths.                                  |
| Deposit/withdrawal moment variants            | `C(t)=t*sum(delta)-sum(delta*t_delta)` reduces some repeated accrual work, but exact old-time queries still require versioned node observations. It may lower constants, not eliminate depth or fixed-universe constraints. |

## 6. Why dynamic growth is correct

The selected structure does not dynamically change topology. `capacity = 2^depth` fixes all conceptual ancestors at
deployment, while mappings instantiate only touched nodes. Adding a later slot cannot change an earlier slot's ancestor
set, so every old delta was already applied to every ancestor required by future prefix queries. This is the property
the naïvely grown Fenwick lacks.

Correct topology does not make capacity harmless. A fixed depth is a permanent slot ceiling. Depth 32 avoids short-term
exhaustion but fails HCU; executable depths are trivially exhaustible.

## 7. Historical query method

Each node has ordered observations `(public timestamp, encrypted balance, encrypted cumulative)`. A public binary search
selects the last observation at or before each requested endpoint. Only public timestamps influence control flow. The
selected encrypted values reconstruct `C(start)` and `C(end)` without decryption.

Later mutations append observations; they do not modify earlier observations. Alice can therefore materialize Round 1
after Round 2 mutations and still obtain the original prefix and weight. The Solidity test exercises that sequence.
`requestRoundTotal` now rejects `closesAt > block.timestamp`, preventing a premature future extrapolation from being
snapshotted before intervening mutations.

No encrypted branch is decrypted. Query gas can vary with public observation-history length and public slot bits; this
does not reveal balances, prefix, ticket, or winner.

## 8. Winner predicate

For slot `i`:

`prefix_i = sum(weight_j for slot_j < slot_i)`  
`upper_i = prefix_i + weight_i`  
`isWinner_i = (R >= prefix_i) AND (R < upper_i)`

An explicit `weight > 0` comparison is unnecessary: a zero-width interval cannot satisfy both inequalities. Removing it
saved FHE depth without changing semantics. Given the integrating vault's invariant `0 <= R < T` and the proven ordered
partition of `[0,T)`, exactly one predicate is true.

The prototype does not independently prove encrypted `R < T`; its harness requires the vault to supply the already
accepted rejection-sampled ticket. A production helper API must bind that existing vault ciphertext/state rather than
accept reusable external ciphertext input. This integration remains unproven.

## 9. Private materialization

`materializePrivateResultFor(roundId,user)` is permissionless and has one public control-flow shape for winners and
losers. It computes:

`payout = select(isWinner, encryptedPrize, encryptedZero)`.

It stores a ciphertext in both cases, emits the same event, and grants durable ACL only to the helper and target user.
Tests show a third-party keeper cannot decrypt the result. A public `(round,user)` flag prevents duplicate calls; it
reveals that a user checked or was checked, not the encrypted result. Input proofs reject cross-helper reuse, and payout
ACL is bound to the helper address.

The cryptographic shape is uniform, but cost differs by public slot popcount and public history. Winner versus loser for
the same slot follows the same FHE circuit. Reverts disclose invalid public state (unregistered, premature, wrong round,
duplicate), not winner status.

## 10. Prize accounting

Mathematically one and only one payout is nonzero. Every materialization subtracts encrypted payout from the round's
encrypted reserve, so losers subtract zero and the winner subtracts the prize. The public per-account replay flag
prevents double credit, and payout is split exactly once into encrypted principal or winnings.

This is only a ledger prototype. It does not custody lcUSDC or prove that the prize input was debited from Leopold's
backed reserve. The harness accepts arbitrary vault-authorized external inputs and can replay them across round IDs. A
production design must instead consume the existing round prize handle/state, bind it to one round, and preserve global
`reservedPrize`, `liquidPrizeAssets`, and winnings-liability reconciliation.

If the winner never materializes, the prize remains reserved indefinitely. Permissionless materialization-for-user lets
anyone materialize a known target, but guaranteeing discovery by processing all accounts would again be global work.
There is deliberately no public `winnerMaterialized` or reserve-zero proof because either can create winner/timing
leakage. Indefinite reservation is a real product/liquidity cost, not silent rollover.

## 11. Auto-Save analysis

The close-boundary preference is selected by public-timestamp history. Materialization computes encrypted:

`saved = select(isWinner AND closePreferenceIsAutoSave, prize, zero)`.

It uniformly updates the target's principal and every aggregate tree node with `saved` at the **actual materialization
timestamp**, including an encrypted-zero update for losers. A dedicated test withdraws the old principal, materializes
later, then proves the next interval accrues exactly `prize * elapsed` and nothing retroactively.

This uniform aggregate checkpoint is essential and makes HCU worse. Automatic Auto-Save also becomes lazy: it happens
only when the user or a third party materializes. A permissionless caller can choose the conversion time, thereby
changing the winner's future-round TWAB timing. That matches “actual conversion timestamp” but gives callers a timing
lever and can amplify aggregate-differencing leakage. Restricting to self-materialization removes third-party
convenience but lets the winner choose timing; neither restores the current protocol's automatic global allocation
without processing users.

## 12. Behavioral privacy analysis

Cryptographically, the spike emits no winner-specific event, exposes no clear ticket/prefix/weight/predicate/payout, and
gives no caller ACL. The transaction circuit is uniform for winner and loser at the same public slot/history.

Behavioral anonymity is weaker and must not be called cryptographic privacy:

- If everyone checks, the materialization set gives no additional winner distinction; later payout use may still leak
  behavior.
- If only half check, the winner lies behaviorally among those who react, subject to nonresponse.
- If only one checks, observers may infer that user is likely the winner even though chain state does not prove it.
- Immediate or very late checking creates timing correlation.
- Permissionless bulk materialization reduces sender correlation but exposes target order and costs `O(n log capacity)`
  to cover everyone.
- Dashboard-triggered materialization links account activity to result-check timing.
- For AUTO_SAVE, exact public aggregate declassification in quiet periods can reveal whether a targeted materialization
  changed aggregate principal; encrypted state alone does not prevent differencing inference.

Public gas/HCU differences are functions of public slot path and public observation history, not the encrypted result.

## 13. HCU results

Method: pinned `@fhevm/hardhat-plugin@0.4.2` mock execution and `hre.fhevm.computeTransactionHCU(receipt)`, using the
same SG-4 definitions. Authoritative ceilings are 20,000,000 total and 5,000,000 depth; Leopold's permanent 25% safety
thresholds are strict `< 15,000,000` and `< 3,750,000`.

Sparse-path measurements:

| operation                                                |       d10 total/depth |        d16 total/depth | d20                   | d24                   | d32                   |
| -------------------------------------------------------- | --------------------: | ---------------------: | --------------------- | --------------------- | --------------------- |
| registration                                             |                 0 / 0 |                  0 / 0 | 0 / 0                 | 0 / 0                 | 0 / 0                 |
| initial deposit                                          |   1,782,704 / 162,032 |    2,755,088 / 162,032 | 3,403,344 / 162,032   | 4,051,600 / 162,032   | 5,348,112 / 162,032   |
| later deposit                                            |  12,287,352 / 955,032 |   18,989,544 / 955,032 | hard total revert     | hard total revert     | hard total revert     |
| withdrawal                                               |  12,287,352 / 955,032 |   18,989,544 / 955,032 | hard total revert     | hard total revert     | hard total revert     |
| historical prefix                                        | 5,190,672 / 2,850,032 |  8,305,056 / 4,404,032 | hard depth revert     | hard depth revert     | hard depth revert     |
| root round total                                         | 1,215,064 / 1,215,032 |  1,215,064 / 1,215,032 | 1,215,064 / 1,215,032 | 1,215,064 / 1,215,032 | 1,215,064 / 1,215,032 |
| winner predicate                                         | 7,114,736 / 3,349,032 | 10,229,120 / 4,903,032 | hard depth revert     | hard depth revert     | hard depth revert     |
| payout select core                                       | 7,169,768 / 3,404,032 | 10,284,152 / 4,958,032 | hard depth revert     | hard depth revert     | hard depth revert     |
| full materialization + uniform tree Auto-Save checkpoint |     hard total revert |      hard depth revert | hard depth revert     | hard depth revert     | hard depth revert     |

Worst-case populated left-sibling paths:

| depth/capacity |     prefix total/depth | full materialization total/depth | SG-4 25% status       |
| -------------: | ---------------------: | -------------------------------: | --------------------- |
|          1 / 2 |  1,474,096 / 1,474,032 |            6,415,352 / 2,377,032 | PASS                  |
|          2 / 4 |  2,948,160 / 1,733,032 |            9,006,448 / 2,636,032 | PASS                  |
|          3 / 8 |  4,422,224 / 1,992,032 |           11,597,544 / 2,895,032 | PASS                  |
|         4 / 16 |  5,896,288 / 2,251,032 |           14,188,640 / 3,154,032 | PASS                  |
|         5 / 32 |  7,370,352 / 2,510,032 |           16,779,736 / 3,413,032 | **FAIL total safety** |
|         6 / 64 |  8,844,416 / 2,769,032 |           19,370,832 / 3,672,032 | **FAIL total safety** |
|        7 / 128 | 10,318,480 / 3,028,032 |                hard total revert | FAIL                  |
|        8 / 256 | 11,792,544 / 3,287,032 |                hard total revert | FAIL                  |
|        9 / 512 | 13,266,608 / 3,546,032 |                hard total revert | FAIL                  |
|     10 / 1,024 | 14,740,672 / 3,805,032 |                hard total revert | FAIL                  |

Only depth 4 (16 slots) keeps the complete worst-case path below both permanent safety thresholds. Depth 6 remains under
the hard ceilings but lacks the required total margin. Depth 7 cannot execute. These are mock measurements, not claimed
live Sepolia results.

Operation shape per time-separated update is, per `depth+1` node, one encrypted balance add/sub plus cumulative
widen/multiply/add; initial zero-history updates avoid elapsed-time work. Prefix queries visit at most `depth` canonical
siblings and perform two endpoint cumulative queries plus one subtraction per populated node. Winner materialization
adds leaf weight comparisons/select and, for uniform Auto-Save, another full update path.

## 14. Storage results

Each `Observation` occupies three Solidity data slots: `uint64 timestamp`, `euint64 balance`, `euint128 cumulative`.
Each new-timestamp mutation appends `depth+1` observations, or `3*(depth+1)` data slots and `2*(depth+1)` ciphertext
handles, plus an array-length word for every distinct node (initialized once and then rewritten). Registration writes
three mapping entries and advances one `nextSlot` word when applicable. Measured registration gas was about 113,123.

| case                                       | observations | observation data slots | ciphertext handles |
| ------------------------------------------ | -----------: | ---------------------: | -----------------: |
| one mutation, d10                          |           11 |                     33 |                 22 |
| one mutation, d20                          |           21 |                     63 |                 42 |
| one mutation, d32                          |           33 |                     99 |                 66 |
| 1,000 users × 1 mutation, d10              |       11,000 |                 33,000 |             22,000 |
| 1,000 users × 4 realistic mutations, d10   |       44,000 |                132,000 |             88,000 |
| 100,000 users × 1 mutation, d17            |    1,800,000 |              5,400,000 |          3,600,000 |
| 100,000 users × 4 realistic mutations, d17 |    7,200,000 |             21,600,000 |         14,400,000 |

These are lower bounds excluding mapping/array heads, registration state, preferences, rounds, and per-round result
flags. Lazy materialization adds another full path observation even for encrypted zero, because omitting it would
disclose winner/Auto-Save behavior by storage shape.

Consecutive mutations to a node at the same public timestamp can safely overwrite its last observation: elapsed time is
zero, cumulative area is unchanged, and only the final balance is needed after that timestamp. This saves observations
when transactions share a block timestamp, but it cannot be assumed for capacity planning and does not eliminate FHE
execution or replaced ciphertext creation.

## 15. Bytecode results

With the existing optimizer configuration unchanged:

| contract                         | creation bytes | runtime bytes | EIP-170 headroom |
| -------------------------------- | -------------: | ------------: | ---------------: |
| current candidate `LeopoldVault` |         31,764 |        23,064 |            1,512 |
| isolated spike helper            |         11,896 |        10,948 |           13,628 |

Putting the feature into the vault is not credible under EIP-170; the helper alone is nearly 11 KB and the vault has
only 1,512 bytes headroom. A separate immutable per-vault helper is therefore the only tested modularity shape with safe
code-size margins. It has no fund authority or upgrade path and only the vault can mutate it. However, real
vault-to-helper ciphertext authorization with the pinned ACL APIs was not implemented/proven; EOA-bound encrypted input
proofs were used by the harness. Four helper instances passed isolation tests.

## 16. Sybil analysis

Known-slot query/update cost depends on depth, not the count of other registered slots. Round close is one root query
and does not traverse users. A million zero-balance users therefore do not make an honest user's path linear. That is
the desired asymptotic property.

The fixed depth creates a different denial surface:

| adversarial slots | minimum depth/capacity | update/materialization result                                               | registration gas lower bound at 113,123 each |
| ----------------: | ---------------------: | --------------------------------------------------------------------------- | -------------------------------------------: |
|             1,000 |             10 / 1,024 | later update 12.29M; populated materialization hard-reverts                 |                115,837,952 for full capacity |
|            10,000 |            14 / 16,384 | materialization already ruled out by d10; update estimated above 15M safety |                                1,853,407,232 |
|           100,000 |           17 / 131,072 | beyond d16 materialization; later update reaches/hits hard total near d17   |                               14,827,257,856 |
|         1,000,000 |         20 / 1,048,576 | later update and materialization hard-revert                                |                              118,618,062,848 |
|  `uint32` maximum |     32 / 4,294,967,296 | major paths hard-revert                                                     |                          485,859,585,425,408 |

Only measured results are labeled measured; intermediate-depth update statements are linear-operation derivations from
the measured d10/d16 slope. A depth-20 capacity can be filled in at least about 3,954 30M-gas blocks using registration
gas alone—economically large but not objectively impossible, especially on a faucet-funded testnet. Depth 32 would make
exhaustion objectively impractical, but its financial updates and queries cannot execute. Executable/safe depths (at
most 4 under the full 25% gate) are immediately exhaustible. Thus capacity does reintroduce participant-cap denial.

Registration is only-vault in the helper, so the production vault still determines who may consume slots. That trust
boundary does not cure free public Sybil registration under Leopold's locked admission policy.

## 17. Adversarial findings

A genuinely separate read-only reviewer received the spike code/tests/model, not the implementation conclusions. Its
findings were checked against fresh runs:

1. **Critical — HCU/capacity mission failure.** Full materialization fails at practical depths; benchmark tests log
   expected failures without making the research command fail. Accepted: this is the explicit partial verdict, not a
   passing conformance suite.
2. **High — premature close snapshot.** Fixed: `closesAt` must now be at or before `block.timestamp`, with a regression
   test.
3. **High — harness ticket/prize replay across rounds.** Valid for the prototype ABI. It is documented as an unproven
   integration boundary; production must consume vault-owned accepted-ticket and backed-reserve state, not external
   inputs.
4. **High — helper does not independently enforce `ticket < T`.** Accepted only as the existing vault's
   rejection-sampler invariant; production binding is mandatory and unproven.
5. **Medium — third-party Auto-Save timing/differencing.** Confirmed and documented as behavioral privacy/fairness risk.
6. **Medium — encrypted arithmetic assumes trusted in-domain vault deltas.** Confirmed. Production integration must
   retain Leopold's euint64 balance, pool cap, duration, and euint128 aggregate bounds; the helper alone does not
   enforce them.
7. **Medium — fixed-slot exhaustion.** Confirmed and fatal when combined with HCU.
8. **Low/medium — winner-never-materializes reserve liveness.** Confirmed; reserve may remain locked indefinitely.

Additional attacks exercised or reasoned:

- zero weight cannot satisfy a zero-width interval;
- `R=0`, exact prefix, final interval end, and `R=T-1` obey half-open boundaries in exhaustive reference tests;
- duplicate accounts/slots and out-of-capacity slots revert; slots are never reassigned;
- old-round queries remain correct after future mutations;
- same-timestamp coalescing preserves exact area;
- duplicate, premature, and wrong-round materialization revert before encrypted payout work;
- third-party callers receive no decryption ACL;
- external input proof use against another helper fails;
- payout decryption cannot be copied to another helper domain;
- uniform loser updates prevent result-specific storage shape but amplify storage/HCU;
- four concurrent helpers keep balances, tickets, and payouts isolated;
- deposit-immediate-withdraw and microscopic mutation spam remain history-growth attacks paid by the sender;
- no public winner branch or winner-specific event exists.

The test suite does not claim to prove malicious-vault safety, reserve backing, live cross-contract ACL, or live-network
HCU.

## 18. Comparison against current settlement

| Property                 | Current design                                      | Tree + user-local materialization                                                               |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| exact TWAB               | Yes                                                 | Yes mathematically and in model/spike, subject to production bounds                             |
| unbiased randomness      | Existing rejection sampler                          | Reuses it; helper integration not proven                                                        |
| winner privacy           | Cryptographic, with behavioral residuals            | Cryptographic uniform call, with stronger check-timing/Auto-Save differencing residuals         |
| mandatory close work     | `O(1)` aggregate close                              | `O(1)` root query                                                                               |
| mandatory selection      | `O(n)` in chunks                                    | None globally                                                                                   |
| mandatory allocation     | `O(n)` in chunks                                    | None globally                                                                                   |
| per-user result          | Already allocated after global work                 | `O(depth)` lazy call; currently exceeds HCU at useful depth                                     |
| Sybil amplification      | Permanent `O(n)` every nonempty round               | No per-round traversal, but permanent slot exhaustion and history/state growth                  |
| HCU                      | Bounded per tx; unbounded total                     | Hard per-tx failure at useful capacity                                                          |
| storage                  | user observations + permanent participants + rounds | user/aggregate-node history: roughly `depth+1` observations per mutation/materialization        |
| bytecode                 | vault 23,064 bytes                                  | separate helper 10,948 bytes; monolithic infeasible                                             |
| Auto-Save                | Global allocation automatically applies it          | Lazy; exact conversion-time accrual, caller timing lever, costly uniform path                   |
| prize liveness           | Keeper must finish all chunks                       | Honest user can claim locally if call fits; unknown/noncalling winner leaves reserve indefinite |
| unclaimed winnings       | Allocated after global settlement                   | Encrypted reserve remains unallocated until winner materializes                                 |
| complexity/audit surface | Two cursors + reconciliation                        | Historical encrypted tree + ACL bridge + lazy reserve/result lifecycle                          |
| four-vault concurrency   | Proven in production suite                          | Helper-instance isolation tested; production bridge unproven                                    |

## 19. Open risks

- No depth simultaneously gives useful Sybil-resistant capacity and safe HCU.
- Fixed slot exhaustion remains permanent.
- Aggregate-node observation storage grows `O(mutations * depth)` and uniform materialization adds more history.
- A production vault/helper ciphertext ACL bridge is not proven with the pinned APIs.
- Ticket range/randomness and prize backing are assumed at the harness boundary, not enforced by the helper.
- A winner who is never materialized leaves the prize reserved indefinitely.
- Permissionless materialization controls Auto-Save's real accrual start and creates behavioral/differencing leakage.
- Exactness requires existing balance, duration, and cumulative-width caps; helper-local malicious deltas can wrap.
- Multi-transaction path splitting could fit HCU but introduces per-user cursors, partial state, replay/recovery rules,
  and still does not solve atomic financial mutation of all tree ancestors. It has not been proven.
- Moment/paged structures may reduce constants, but deferred aggregate updates can recreate a globally griefable close
  queue.

## 20. Exact recommendation for production

Do **not** replace `LeopoldVault` settlement with this spike and do not freeze the current linear settlement as closed.
Keep the production candidate untouched.

The next research gate should first prototype an encrypted moment representation that computes the widened encrypted
delta/moment once and updates nodes with materially fewer operations. It must benchmark worst-case populated paths,
including uniform Auto-Save, before additional product integration. In parallel, test whether a user-local resumable
prefix/materialization state machine can split query work without exposing partial predicates; it is acceptable only if
financial mutations remain atomic or have a permissionless, Sybil-independent completion rule. Reject any design whose
tree maintenance creates a global mutation queue before close.

Any successor must also use a vault-owned ticket/reserve bridge, enforce Leopold's numeric bounds, define indefinite
unclaimed-reserve policy, and quantify Auto-Save timing leakage. If no successor meets those gates, CP1 remains blocked
on settlement starvation rather than accepting either the current global `O(n)` traversal or a small fixed cap.

## 21. Files created

- `research/settlement-tree-spike/reference-model.cjs`
- `research/settlement-tree-spike/reference-model.test.cjs`
- `research/settlement-tree-spike/REPORT.md`
- `contracts/spikes/LeopoldHistoricalPrefixTreeSpike.sol`
- `test/spikes/LeopoldHistoricalPrefixTreeSpike.ts`

No production contract, existing test, package manifest, lockfile, compiler setting, optimizer setting, dependency, or
frontend file was modified by this spike.

## 22. Proof pre-existing dirty work was preserved

Before the spike, the 20 already modified/untracked files were enumerated and SHA-256 hashed. The file-list manifest
hash was `59c367c6390d662fc31a567685ee3d66e7e72e169408340e2dd4054b3cad1975`; the checksum-manifest hash was
`ea393e052eea2875ff2169a0e6b5f0465650f600773898c40bd7e7ac5524c45c`.

The closing verification runs `sha256sum -c` against that exact manifest, confirms the index remains empty, and checks
that the only paths added by this spike are the five files listed above. The final command results are reported in the
handoff response; no commit or push is performed.

SPIKE PARTIAL — PINNED FHEVM HCU LIMITS MAKE A SYBIL-RESISTANT TREE DEPTH INFEASIBLE
