# Leopold Settlement Tree Spike 2

Date: 2026-08-12  
HEAD: `8f30ba74a1fcbfa2cbb45aa420a90b3ec65f7951`  
Scope: research only; no production contracts changed; no commit or push.

## 1. Executive verdict

Spike 2 stops at Critical Gate A. A normal time-separated deposit or partial withdrawal updates every historical
aggregate node and is already above Leopold's conservative 15,000,000-HCU target at depth 16 (18,989,544 HCU). At depth
20 it hard-reverts at the 20,000,000-HCU transaction ceiling. Depths 24, 28, and 32 also hard-revert. A checkpointed
result session cannot make ordinary Save/Withdraw practical, so it was not implemented.

## 2. Spike-1 HCU root cause

Spike 1's full materialization combined: two historical endpoint queries for prefix/weight, encrypted upper-bound and
ticket comparisons, encrypted select, ACL work, encrypted winnings/principal accounting, and a uniform Auto-Save
checkpoint over every tree node. The populated worst-case path measured 19,370,832 HCU at depth 6 and exceeded the hard
20M ceiling at depth 7. The sparse d10 full path also exceeded 20M. The critical cost is not only the prefix query: a
time-separated node update performs encrypted balance add/sub plus widened-balance multiply and cumulative add for each
of `depth + 1` nodes. Sequential depth rose with historical query chains; d16 prefix reached 4,404,032 and the d16
winner predicate reached 4,903,032, close to the 5M hard sequential-depth ceiling.

Spike-1 measured representative operation costs: initial tree update d10/d16/d20/d24/d32 was respectively 1,782,704 /
2,755,088 / 3,403,344 / 4,051,600 / 5,348,112 HCU; later d10 and d16 updates were 12,287,352 and 18,989,544. Historical
prefix d10/d16 was 5,190,672 / 8,305,056. Winner predicate d10/d16 was 7,114,736 / 10,229,120. The existing production
chunk evidence is 12,864,288 HCU for selection chunk four and 11,416,416 for Auto-Save allocation chunk four.
Registration is not HCU-priced (zero HCU in the mock; about 113,123 gas).

## 3. Large-depth update benchmarks

Measurements use the pinned `@fhevm/hardhat-plugin@0.4.2` mock and `computeTransactionHCU`, with hard limits 20M total /
5M sequential depth and Leopold safety targets 15M / 3.75M. The temporal deposit is a subsequent deposit after ten
seconds; withdrawal is a partial encrypted withdrawal after another ten seconds. The same encrypted add/sub path is used
for full withdrawal and re-deposit; no operation-specific optimization changes its HCU shape.

| depth |      capacity |     initial deposit |   subsequent deposit |   partial withdrawal | sequential-depth observation       |
| ----: | ------------: | ------------------: | -------------------: | -------------------: | ---------------------------------- |
|    10 |         1,024 | 1,782,704 / 162,032 | 12,287,352 / 955,032 | 12,287,352 / 955,032 | succeeds; under 15M                |
|    16 |        65,536 | 2,755,088 / 162,032 | 18,989,544 / 955,032 | 18,989,544 / 955,032 | total safety and depth safety fail |
|    20 |     1,048,576 | 3,403,344 / 162,032 |    hard total revert |    hard total revert | no safe normal mutation            |
|    24 |    16,777,216 | 4,051,600 / 162,032 |    hard total revert |    hard total revert | no safe normal mutation            |
|    28 |   268,435,456 | 4,699,856 / 162,032 |    hard total revert |    hard total revert | no safe normal mutation            |
|    32 | 4,294,967,296 | 5,348,112 / 162,032 |    hard total revert |    hard total revert | no safe normal mutation            |

The first deposit is deceptively cheap because there is no elapsed historical observation to multiply. It cannot be used
as the normal Save benchmark. A normal user cannot be asked to progress a ten-transaction tree update, and eligibility
cannot be deferred without changing the product semantics. This independently satisfies hard rejection condition 1.

## 4. Capacity/exhaustion analysis

For the requested logical capacities, depth is `log2(capacity)` and every update touches depth plus one nodes:

|             capacity | depth | measured/derived update status    | honest prefix depth | registration gas lower bound |
| -------------------: | ----: | --------------------------------- | ------------------: | ---------------------------: |
|     2^20 = 1,048,576 |    20 | hard-reverts after first mutation |                  20 |              118,618,062,848 |
|    2^24 = 16,777,216 |    24 | hard-reverts after first mutation |                  24 |           ≈1,895,407,232,000 |
|   2^28 = 268,435,456 |    28 | hard-reverts after first mutation |                  28 |                    ≈30.35e12 |
| 2^32 = 4,294,967,296 |    32 | hard-reverts after first mutation |                  32 |          485,859,585,425,408 |

The registration estimate uses the measured ~113,123 gas per slot and is deliberately a lower bound; it excludes
calldata, base fees, failed transactions, and parallel accounts. At 30M gas/block, filling 2^20 requires at least about
3,954 blocks (roughly 13 hours at 12 seconds/block) if every block were dedicated to registrations. 2^32 requires about
16.2M blocks (roughly 6.2 years at 12 seconds/block) at that unrealistic maximum throughput. The larger domain is
economically harder to exhaust, but its normal updates cannot execute. The only executable/safe depths have capacities
that are practical denial targets. No finite capacity passes both the HCU and anti-exhaustion requirements.

## 5. Resumable result architecture

Not implemented. The intended session would checkpoint an encrypted prefix accumulator, leaf weight, cursor/path,
round/user/slot binding, then finalize encrypted `select(isWinner, prize, 0)`. That could reduce per-transaction result
HCU, but it cannot reduce the `O(depth)` encrypted mutation required by every normal deposit, withdrawal, and Auto-Save
conversion. Implementing it after Gate A failure would create misleading evidence and violate the required stop rule.

## 6. Session binding

Not exercised in Spike 2. Spike 1 proved only helper-domain input-proof binding and per-(round,user) duplicate flags.
Production binding remains required for vault, round close timestamps, immutable slot, accepted ticket, public T, and
closed-round prize. No new state machine is claimed.

## 7. Depth benchmarks

No multi-transaction result benchmark was run because the normal-update gate failed. The existing Spike-1 result data
remains valid: populated full materialization succeeds only through depth 6 at the hard ceiling (19,370,832 HCU), and
depth 7 fails. This report does not relabel that single-transaction evidence as a checkpointed result.

## 8. Round-progression proof

The tree conceptually permits `close → exact T → accepted ticket → final state → next round` without user traversal, but
Spike 2 does not claim a production implementation. This theoretical O(1) close benefit cannot compensate for unusable
large-depth financial updates.

## 9. Sybil analysis

Known-slot prefix work is logarithmic and does not iterate participant arrays. A million zero-weight slots would not
make one honest user's conceptual prefix query linear. However, a depth sufficient for that property is exactly where
normal updates exceed HCU. The architecture therefore fails the combined viability requirement even though its
asymptotic result query is attractive.

## 10. Prize reserve binding

Not implemented in Spike 2. Spike 1's external encrypted prize/ticket inputs were explicitly harness plumbing and could
be replayed across round IDs. A production successor would need a public round-level reservation/escrow amount, one-way
debit, encrypted payout select, and no winner-specific public accounting. This remains open, not silently accepted.

## 11. Unclaimed prize model

Spike 1 established the safe policy direction: an unmaterialized winner's prize may remain an indefinite closed-round
liability; future rounds must proceed without consuming or identifying it. Capital is locked by the sum of all unclaimed
closed-round prizes. No expiry or rollover was added.

## 12. Winnings accounting

Spike 1's helper uses one encrypted accounting path for winner and loser, with encrypted zero for losers and a public
per-round/user replay flag. It does not prove custody or cross-round reserve binding. No change was made.

## 13. Auto-Save

Spike 1 correctly tested actual materialization-time accrual and uniform encrypted-zero updates, but that update itself
touches every aggregate node. This is the direct reason result materialization is more expensive than a prefix-only
query. Automatic Auto-Save would become lazy and caller-timed; the resulting timing/differencing leakage remains
unacceptable without a complete product decision. No Spike-2 implementation was attempted.

## 14. Third-party progression

Not implemented. Spike 1 showed a third-party caller receives no payout ACL and winner/loser control flow is uniform for
a fixed public slot/history. It also documented behavioral leakage from target/timing and later aggregate changes.

## 15. Behavioral privacy

The prior cryptographic result privacy observations remain: no clear winner, ticket, prefix, weight, or payout is
exposed; behavioral anonymity can still be weakened by who is materialized, when, later withdrawals, and Auto-Save
aggregate differencing. No new result session changes this assessment.

## 16. Cross-contract ACL

Not proven beyond Spike 1's cross-helper mock rejection and target-only user ACL. No production vault/helper bridge or
disposable Sepolia ACL probe was run. This is another reason a PASS is unavailable, independently of HCU.

## 17. Storage/griefing

Spike 1 estimated three Solidity slots per new node observation and two ciphertext handles per node. A depth-20 mutation
therefore appends at least 21 observations (63 data slots and 42 handles), before mappings, array heads, preferences,
and round state. A future resumable session would need bounded initiation (preferably user-start/permissionless-advance)
to avoid unpaid storage griefing; no design was selected.

## 18. Bytecode

No production bytecode changed. Current candidate vault remains runtime 23,064 bytes, creation 31,764, leaving 1,512
bytes below EIP-170. Spike-1 helper remains runtime 10,948 bytes, creation 11,896, leaving 13,628 bytes. The vault still
meets its frozen 1,024-byte minimum, but no result-session machinery was added.

## 19. Comparison to current production settlement

| depth |      capacity | Spike-1 result                                               | Spike-2 result | normal update                                        |
| ----: | ------------: | ------------------------------------------------------------ | -------------- | ---------------------------------------------------- |
|     4 |            16 | single full path within hard limit, 14,188,640 populated HCU | not attempted  | safe measured shape                                  |
|     6 |            64 | 19,370,832, above safety                                     | not attempted  | below depth-16 update result but not Sybil-resistant |
|     7 |           128 | hard revert                                                  | not attempted  | no useful safety margin                              |
|    10 |         1,024 | hard full-result revert                                      | not attempted  | later update 12,287,352                              |
|    16 |        65,536 | hard full-result depth revert                                | not attempted  | later update 18,989,544                              |
|    20 |     1,048,576 | hard full-result depth/total failure                         | not attempted  | hard total revert                                    |
|    24 |    16,777,216 | hard failure                                                 | not attempted  | hard total revert                                    |
|    28 |   268,435,456 | hard failure                                                 | not attempted  | hard total revert                                    |
|    32 | 4,294,967,296 | hard failure                                                 | not attempted  | hard total revert                                    |

Current production has O(n) mandatory selection/allocation settlement and permanent Sybil amplification. The tree
removes that global traversal in theory, but fails the ordinary-update requirement in practice. No tradeoff is accepted.

## 20. Exact production recommendation

Do not replace production settlement with this tree family. Do not implement a resumable result session on top of a tree
whose normal updates fail at depth 20. Any future attempt must first reduce update cost substantially while preserving
exact historical TWAB, then re-run the same depth-20/24/28/32 gate before researching lazy result materialization.

Potential future research directions are moment-based aggregate representations or a different exact authenticated
structure, but neither may defer eligibility, use approximate TWAB, introduce a participant cap, or create a global
pending-update queue. The existing production settlement scalability issue remains open.

## 21. Production-file integrity proof

The pre-existing dirty-file checksum manifest was re-run after the spike and every entry returned `OK`. HEAD remained
`8f30ba74a1fcbfa2cbb45aa420a90b3ec65f7951`; the index remained empty. No production contract, frontend, package
manifest, lockfile, compiler setting, optimizer setting, deployment, commit, or push was performed. Spike 1 files were
preserved; the temporary depth-28 benchmark extension was restored afterward. Additional untracked research files
`contracts/spikes/LeopoldHistoricalMomentTreeSpike2.sol`, `contracts/spikes/LeopoldMomentTreeVaultAclProbe.sol`, and
`test/spikes/LeopoldHistoricalMomentTreeSpike2.ts` appeared in the shared research directory during this run and were
not modified or discarded.

SPIKE 2 FAILED — LARGE-DEPTH EXACT TWAB TREE UPDATES EXCEED SAFE HCU
