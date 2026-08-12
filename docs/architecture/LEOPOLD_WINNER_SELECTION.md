# Leopold Winner Selection

## Round domain

`closeRound` snapshots the append-only participant-array length in O(1). Later registrations belong to the open round
and cannot enter the historical traversal domain. Addresses are processed only in array-index order.

## Two-pass bounded settlement

Selection and allocation use separate contract-owned cursors. A caller chooses only a positive requested count no larger
than the measured protocol limit; the caller cannot supply an index, participant, subset, ticket, or order. Every call
resumes at the stored cursor.

For participant `i`, the vault derives the exact encrypted weight from cumulative observations at the two public round
boundaries. It computes encrypted `end = cumulative + weight` and:

`winner_i = ticket >= cumulative && ticket < end && weight > 0`

The predicate is stored without external ACL. Traversal never stops at a winning interval and always reaches the fixed
round-close snapshot. Public cursor progress therefore identifies only ordinary deterministic processing.

## Fail-closed reconciliation

The vault accumulates encrypted weights and an encrypted count of winner predicates. At the final selection index it
publishes only the encrypted conjunction:

`selectionCumulative == publicAggregateTwab && encryptedWinnerCount == 1`

Allocation cannot begin until a valid KMS public-decryption proof establishes that this objective boolean is true. A
false result enters `RECONCILIATION_FAILED`; it cannot allocate prize value. Any caller may then execute the narrow
recovery transition, which rolls the full prize into the active round, finalizes only the completed selection-pass
reward, refunds unused allocation-pass collateral, and marks the source round settled.

## Replay and interruption

State and cursor advance in the same transaction. EVM serialization prevents concurrent callers from processing the same
index. Zero/oversized chunks revert, completed phases reject replay, and interruption does not alter ordering or winner
predicates.
