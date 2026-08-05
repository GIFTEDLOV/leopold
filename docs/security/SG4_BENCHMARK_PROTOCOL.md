# SG-4 FHE benchmark protocol

## Executive decision

This document preregisters SG-4 protocol version `sg4-benchmark-protocol/v2`. It contains no live benchmark result, does
not close SG-4, and authorizes no deployment or network activity. The deterministic output of `pnpm sg4:protocol` is the
machine-readable authority; the temporary Solidity harness fixes the executable circuits.

SG-3 remains controlling. Balances use `euint64`; user TWAB, aggregate TWAB, prefix weight, random candidate, and
accepted ticket use `euint128`. Exact one-second accrual, a 1-billion-cUSDT pool, a 365-day duration, unbiased rejection
sampling, encrypted accepted tickets, and the no-reroll rule are unchanged. Performance cannot select `euint64` for a
75-bit domain. An operationally infeasible mandatory `euint128` path is architecture NO-GO and reopens design review.

Live execution remains blocked: installed local packages expose receipt-derived HCU calculation, but no locally
authoritative numeric Sepolia transaction, block, or batch HCU ceiling. Missing measurement or ceiling is
`BLOCKED_NOT_GO`; gas cannot substitute for HCU. Local mock execution also reports `HCUTransactionDepthLimitExceeded`
for the exact sequential 32-step winner circuit. That is a local feasibility signal, not a live result. It is retained
rather than hidden; `WINNER_CHUNK_32` cannot receive GO unless authoritative live execution succeeds within every limit.

## Installed API and instrumentation

The locked lineage is `@fhevm/solidity` 0.11.1, `@fhevm/hardhat-plugin` 0.4.2, `@zama-fhe/relayer-sdk` 0.4.1, Hardhat
2.28.6, and ethers 6.17.0. Installed declarations provide:

- `FHE.randEuint64()`, `FHE.randEuint128()`, and `FHE.randEuint256()`;
- `FHE.asEuint128(euint64)` and `FHE.asEuint128(uint128)`;
- `FHE.mul(euint128,uint128)`, `FHE.add(euint128,euint128)`, both returning `euint128`;
- `FHE.lt(euint128,uint128)` and `FHE.lt(euint128,euint128)`;
- `FHE.rem(euint128,uint128)`;
- `FHE.not`, `FHE.and`, and `FHE.or` for `ebool`;
- `FHE.select` for `euint128` winner indices and `euint64` prize masking;
- `FHE.makePubliclyDecryptable` for `euint128` and `ebool`.

Arithmetic does not widen implicitly. The harness casts the encrypted balance before multiplying. `euint256` has
randomness but not the complete installed ordered-comparison/public-divisor-remainder path needed by the ticket flow.

The plugin's `hre.fhevm.computeTransactionHCU(receipt)` derives HCU from receipt coprocessor events and the installed
`HCUByOperator` table. The live runner must prove cost-table/host compatibility, complete operation recognition, and the
authority of its source. The local HCULimit ABI exposes enforcement functions and errors but no numeric ceiling getter.
Every applicable numeric ceiling must be resolved from an authoritative machine-verifiable source before a window
begins. Unsafe, non-integral, or non-finite plugin numbers are rejected before decimal-string conversion.

## Exact circuit catalogue

The catalogue contains exactly 28 IDs in this order:

1. `RNG_64`
2. `RNG_128`
3. `RNG_256`
4. `TWAB_CAST_64_TO_128`
5. `TWAB_DELTA_128`
6. `TWAB_ACCUMULATE_128`
7. `AGGREGATE_ADD_128`
8. `PREFIX_ADD_128`
9. `DRAW_ZERO_TOTAL_NOOP`
10. `DRAW_TOTAL_ONE`
11. `REJECTION_VALID_GENERAL_128`
12. `TICKET_REMAINDER_GENERAL_128`
13. `REJECTION_PIPELINE_GENERAL_128`
14. `REJECTION_PIPELINE_ALL_VALID_128`
15. `WINNER_STEP_128`
16. `WINNER_CHUNK_1`
17. `WINNER_CHUNK_4`
18. `WINNER_CHUNK_8`
19. `WINNER_CHUNK_16`
20. `WINNER_CHUNK_32`
21. `PRIZE_OR_ZERO`
22. `COMPOSITE_TWAB_UPDATE`
23. `COMPOSITE_DRAW_GENERAL`
24. `COMPOSITE_DRAW_ALL_VALID`
25. `COMPOSITE_DRAW_AND_CHUNK_8`
26. `COMPOSITE_DRAW_AND_CHUNK_32`
27. `PUBLIC_DECRYPT_AGGREGATE_128`
28. `PUBLIC_DECRYPT_VALID_BOOL`

The JSON records every FHE call, encrypted material store, and ACL call in execution order. Tests read the compiled
Solidity AST, recursively expand internal helpers and fixed loop bounds, preserve duplicates, distinguish setup from
measured roots, and compare the extracted sequence to every JSON manifest. A Solidity operation change or protocol-only
composition change therefore fails locally. `TWAB_ACCUMULATE_128` has exactly one balance cast, one widened multiply,
one add, result storage, and ACL authorization.

Builder circuit, vector, instance, applicability, allocation, and run-plan inputs are separate from independently
authored validator expectation catalogues. The validator authority is formed by closed TypeScript source literals: all
28 expected circuits and their ordered operation manifests, all 34 expected winner instances and their explicit
participant/pre-state/post-state data, the applicability and pair tables, repetition allocations, windows, and the
semantic continuation sequence are written independently. Expected entries are not constructed by factories, `map`,
`flatMap`, spread, cloning, builder references, or computed expected-post-state helpers.

A TypeScript-AST source audit requires every authoritative `EXPECTED_*_LITERAL` initializer to be a recursively closed
array or object literal and rejects calls, transformations, spreads, computed properties, `BUILDER_*` references, and
protocol-output references. A separate runtime audit recursively proves that builder and validator arrays and objects
share no identity. Builder-side mutations are then checked against the unchanged expected literals. The 588 expected run
records are derived only from the explicit expected circuit, instance, pair, allocation, and window literals—not from
`buildProtocol` or a builder helper. Every manually authored expected winner post-state is independently checked against
the bigint/boolean state-transition oracle.

## Resumable winner state and executable vectors

The measured continuation state is stored as:

- encrypted accepted ticket (`euint128`);
- encrypted cumulative prefix (`euint128`);
- encrypted found flag (`ebool`);
- encrypted winner index (`euint128`);
- public next-participant cursor;
- fixed vector ID, initialization flag, and accepted-ticket readiness flag.

An operator-only excluded setup call accepts only a closed numeric setup ID. Each ID binds one measured circuit, one
semantic case, one chunk size, and one exact encrypted pre-state. It cannot accept caller-selected ticket, prefix,
weight, found, winner, cursor, or encrypted value. Setup emits no event and is retained as a preparation record linked
one-to-one to the following run, but its gas, HCU, and latency are excluded from the measured circuit.

Every statistical warm-up and measured sample performs its setup immediately before its measured transaction. No
encrypted benchmark state persists between statistical repetitions; a warm-up cannot supply measured state, and a window
cannot inherit another window's state. The measured chunk loads the registered stored tuple, executes exactly 1, 4, 8,
16, or 32 steps, and persists prefix, found, winner, and cursor. Repetitions of one circuit/vector instance therefore
have different run IDs but identical pre-state, participant slice, and expected post-state.

Each step is:

1. `nextPrefix = prefix + weight`;
2. `eligible = acceptedTicket < nextPrefix`;
3. `firstMatch = !found && eligible`;
4. `winner = select(firstMatch, encrypted(cursor), winner)`;
5. `found = found || firstMatch`;
6. advance prefix and public cursor.

Thus the first cumulative prefix strictly greater than the ticket wins, and an already-found winner cannot be replaced.
The public cursor does not impose a product participant cap. Every instance registers exactly `chunkSize` nonzero
participant weights and indices. The harness rejects cursor-plus-size above the closed 64-entry test envelope; it never
reads beyond the instance and has no implicit encrypted-zero participant padding.

The six semantics use executable, chunk-specific Solidity setup states with `CHUNK_WEIGHT = 492750000000000000000`:

| Vector                              | Initial state and expected behavior                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `FIRST_MATCH`                       | ticket 0, prefix 0, cursor 0; chunk 4 selects index 0                                  |
| `MIDDLE_MATCH`                      | ticket `2*weight`; chunk 4 selects index 2                                             |
| `LAST_MATCH`                        | ticket `3*weight`; chunk 4 selects index 3                                             |
| `NO_MATCH_BEFORE_CHUNK_BOUNDARY`    | ticket `4*weight`; strict comparison finds no winner in chunk 4                        |
| `ALREADY_FOUND_BEFORE_CHUNK`        | prefix `4*weight`, found true, winner 2, cursor 4; later steps preserve 2              |
| `CONTINUATION_MATCH_IN_LATER_CHUNK` | stored nonzero prefix/cursor and found false; the measured slice finds its later match |

Middle and last are assigned only where the chunk has more than one position. The two one-step circuits use first,
no-match, already-found, and continuation cases; chunks 4, 8, 16, and 32 use all six. The two all-valid composites have
their own exact 8- and 32-entry instances. This produces 34 immutable winner instances, each with exactly its chunk size
in explicit indices and nonzero weights.

Performance continuation and semantic persistence are deliberately separate. A performance continuation sample starts
from a registered post-prior-chunk pre-state (nonzero prefix/cursor) and is reset before every repetition. A dedicated
non-statistical local sequence initializes cursor zero, executes chunk 8 twice without reset, decrypts each post-state,
and proves the second call continued the first. It is explicitly classified `SEMANTIC_CONTINUATION_VALIDATION`, has
`excludedFromStatisticalSamples=true`, and its state never feeds a statistical sample. Local tests also execute chunks
1, 4, 8, and 16 and assert the exact installed identifier `HCUTransactionDepthLimitExceeded` for the unshortened 32-step
circuit; an unrelated revert does not satisfy that test.

## Rejection and accepted-ticket stages

For a general total, the measured pipeline generates an encrypted candidate, creates encrypted validity, calculates an
encrypted candidate remainder, and retains all three privately. The remainder is explicitly not an accepted ticket. It
neither initializes nor mutates winner state. No chunk can execute until a registered accepted-ticket setup exists.
Phase 1 must publicly decrypt validity at its permitted stage; only a confirmed-valid candidate may become the immutable
accepted ticket. An invalid candidate may be replaced one at a time. A confirmed-valid candidate cannot be rerolled.

`COMPOSITE_DRAW_GENERAL` ends before winner selection. `COMPOSITE_DRAW_AND_CHUNK_8` and `_32` are resource-envelope
composites using `T_DIVIDES_DOMAIN = 2^74`: every `randEuint128` candidate is valid, so remainder may safely enter the
chunk without a rejection comparison. These composites do not claim that public decryption and acceptance are atomic
with scanning. `T=0` has no randomness or modulo; `T=1` produces encrypted zero.

## Prize masking and confidentiality

`PRIZE_OR_ZERO` has two excluded setup vectors, `WINNER_TRUE` and `WINNER_FALSE`. Both execute the same measured
`FHE.select(ebool,euint64,euint64)` circuit. Local mock decryption verifies encrypted maximum prize and encrypted zero.
There is no plaintext winner branch.

The harness has no custody, token, Ether, rescue, arbitrary-call, proxy, upgrade, ownership-transfer, or user-decryption
path. Events contain only a fixed circuit-ID hash, public run sequence, public vector/category ID, and completion bool.
They contain no handles, ciphertexts, proofs, signatures, or private values.

## Fixed inputs

- balance: `1000000000000000` base units;
- elapsed: `31536000` seconds;
- maximum TWAB/total: `31536000000000000000000`;
- near maximum: maximum minus one;
- `T_DIVIDES_DOMAIN = 18889465931478580854784` (`2^74`);
- adjacent totals: `18889465931478580854783` and `18889465931478580854785`;
- candidate domain: `2^128` in public `uint256` arithmetic;
- each winner instance has exactly its chunk size in explicit nonzero weights; the maximum two-slice prefix is `T_MAX`.

The three general rejection circuits each receive full schedules separately for `T_MAX`, `T_POWER_MINUS_ONE`, and
`T_POWER_PLUS_ONE`. Chunk 4/8/16/32 circuits receive all six meaningful semantic instances; one-step circuits omit the
meaningless middle/last aliases. Prize masking receives both branches.

## Exact window schedule and order

Repetitions apply to each circuit/vector pair:

| Class                  | Window 1               | Window 2   | Window 3   | Total  |
| ---------------------- | ---------------------- | ---------- | ---------- | ------ |
| Primitive/single step  | 2 warm-up + 4 measured | 3 measured | 3 measured | 2 + 10 |
| Composite/winner chunk | 1 warm-up + 3 measured | 2 measured | 2 measured | 1 + 7  |
| Public decryption      | 1 warm-up + 2 measured | 2 measured | 1 measured | 1 + 5  |

Within each window the deterministic plan iterates the exact 28-circuit array, then each circuit's exact instance array,
then warm-ups followed by measured repetitions. Every stateful record fixes setup-record and setup-definition IDs,
pre-state and expected-post-state IDs, participant-instance ID, semantic ID, chunk size, equivalence class, and a null
prior-run inheritance reference. A future runner consumes this complete plan and may not reorder samples.

The corrected applicability matrix has 22 primitive/single-step pairs, 39 composite/winner-chunk pairs, and 2 public
decryption pairs. The independently derived count is `22*12 + 39*8 + 2*6 = 588` records. The old 628-record plan is
superseded. A validator routine separate from the builder reconstructs every expected tuple from closed expectation
tables and compares all fields. A separate bigint/boolean oracle derives every winner expected post-state from the
registered pre-state and explicit weights. That oracle independently enforces nonnegative cursor/index encoding, exact
chunk length, slice start, contiguous explicit participant indices, participant-universe and exclusive-upper-bound
limits, positive weights, bounded prefixes, and the exact final cursor.

Local emitted-plan execution tests treat each run record as authoritative: they resolve setup, pre-state, participant
instance, expected post-state, circuit, and equivalence class directly from its references. Before Solidity execution,
the independent oracle verifies the referenced post-state. The test then executes the record-linked setup, decrypts the
stored pre-state, executes the record's circuit, and compares the decrypted post-state with both the oracle result and
the referenced post-state definition.

Winner, winner-related composite, and prize setup occurs before every warm-up and measured sample. Setup records are
excluded preparation records linked one-to-one to runs. Windows 2 and 3 start at least 20 confirmed blocks after the
prior window. Samples cannot move between windows or inherit prior post-state.

Warm-ups remain in raw data but are excluded from verdict statistics. Measured failures remain. There is no outlier
removal. Only a machine-verifiable chain-wide outage can invalidate a complete window; the original window and every
sample ID remain, and the complete plan is rerun under a new linked window ID. Individual sample invalidation or
selective unfavorable replacement is forbidden. Contract, FHE, API, HCU, and correctness failures are not outages.

## Metrics and statistics

Each applicable raw sample requires protocol digest/version, commit/tree, circuit/vector/window/run identity,
classification/index, contract/transaction/block identifiers, status, gas, effective gas price, calldata/deployed-byte
lengths, HCU consumed/source/ceiling, current block gas limit, UTC submission/receipt times, receipt latency, post-state
correctness, and sanitized failure category. Public-decryption samples additionally require relayer-ready and completion
times, receipt-to-relayer and total durations, clear-value correctness, proof/signature-flow correctness, and leakage
PASS.

Stateful samples additionally require setup record/definition, pre-state, expected-post-state, participant-instance,
equivalence-class, pre/post verification, and sequence-classification fields. Independent performance samples require a
null inherited-run reference. The schema permits cross-call inheritance only for an explicitly classified semantic
continuation validation record excluded from independent performance statistics.

For each circuit/vector pair report sample/success/failure counts, min, median, nearest-rank p90, max, exact rational
mean, all raw durations, and every distinct gas/HCU value with frequency. P90 is the sorted one-based `ceil(9*n/10)`
value. Even medians and means remain exact rational numerator/denominator strings. No authoritative floating point and
no p95 claim are permitted.

## Complete raw-result JSON Schema

The deterministic protocol embeds Draft 2020-12 schema `urn:zama-szn4:sg4-benchmark-results:v2`. It defines, with
`additionalProperties: false` where applicable:

- protocol identity/digest verification and environment lineage;
- HCU authority and ceiling resolution with `gasSubstituted: false`;
- deployment, execution-window, and excluded setup records linked to exact measured runs and state definitions;
- ordinary and conditionally stricter public-decryption samples;
- sanitized failure records;
- retained invalidated windows and whole-window rerun linkage;
- append-only correction records with original/replacement IDs and digests;
- exact gas/HCU frequency and latency summary structures;
- circuit/vector GO, BLOCKED, or NO-GO verdicts;
- global architecture decision and append-only provenance.

Unsafe integers are decimal strings. Hashes, addresses, IDs, timestamps, enums, required fields, and forbidden unknown
fields are machine constrained. Corrections retain the immutable original, reference its digest, add a sanitized reason,
and create a new replacement record/digest. There is no overwrite meaning. Representative local schema tests accept
ordinary/public/invalidation/rerun/correction records and reject missing HCU, gas-as-HCU, numeric unsafe values,
handle/ciphertext fields, individual-sample invalidation, undeclared state inheritance, missing setup/state linkage, and
unknown properties.

## GO/NO-GO rules

- Every mandatory production circuit needs authoritative measured HCU and applicable numeric ceilings.
- `maxHcu*4 <= transactionCeiling*3`; `maxGas*4 <= currentBlockGasLimit*3`.
- Deployment bytecode is strictly below 24,576 bytes.
- Missing HCU authority/ceiling is BLOCKED, never GO; hard-limit exceedance is NO-GO.
- Correctness is 100%; unexpected reverts, cast/overflow errors, plaintext bypasses, semantic mismatches, valid-ticket
  rerolls, and sensitive leakage are all zero.
- P90 ceilings are 120 seconds for user TWAB, 180 seconds for rejection, 180 seconds for public decryption, 300 seconds
  for a winner chunk, and 300 seconds for draw-and-chunk.
- For chunks 1/4/8/16/32, choose the largest passing size with 25% HCU/gas headroom. Project 100, 1,000, and 10,000
  participants with exact `ceil(participants/chunkSize)*p90`. At least one size must complete 10,000 within 24 hours.
  Otherwise the architecture is NO-GO; no participant cap is introduced.
- `RNG_64/128/256` are all measured, but mandatory `euint128` failure cannot select `euint64`.
- Both public-decryption paths require relayer readiness, correct clear values, successful installed proof/signature
  flow, zero leakage, and p90 at most 180 seconds.

## Anti-cherry-picking, execution, and reopening

Circuit IDs/operations, vectors, run plan, setup timing, metrics, statistics, schemas, thresholds, outage rules, and
verdict rules are locked before live execution. The runner must verify the committed protocol digest before every
window. Raw records are append-only. No live result may change this document retroactively.

Reopen SG-4 before changing any locked field, authoritative HCU source/ceiling, installed lineage, winner transition,
ticket-acceptance stage, confidentiality rule, or protocol digest. Reopen SG-3 before changing the product envelope or
mandatory widths. Mandatory euint128 infeasibility requires architecture review, not a downgrade.

Phase 1 may start only after the HCU blocker is resolved through reviewed, machine-verifiable authority and the live
runner implements this exact plan/schema. SG-4 remains PENDING after this preparation commit.

## Audit checklist

- [ ] Protocol digest verified before every window.
- [ ] Authoritative HCU source and every applicable numeric ceiling resolved.
- [ ] Exact 588-record circuit/instance/run plan consumed without reordering.
- [ ] Excluded setup transactions recorded and not counted.
- [ ] Candidate validity accepted before general-ticket winner scanning.
- [ ] Every statistical sample reset to and verified against its exact registered pre-state.
- [ ] Dedicated two-call semantic sequence verifies real stored continuation without entering statistics.
- [ ] All raw samples retained; only whole-window outage reruns used.
- [ ] Complete JSON Schema validation and append-only provenance pass.
- [ ] HCU, gas, latency, bytecode, correctness, throughput, and decryption rules pass.
- [ ] No sensitive material appears in raw or summarized results.
