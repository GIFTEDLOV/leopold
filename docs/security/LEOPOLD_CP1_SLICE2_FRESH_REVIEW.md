# Leopold CP1 Slice 2 Fresh-Session Adversarial Review

Classification: internal fresh-session adversarial review under the existing M-8 framework. This is not an external,
independent, OpenZeppelin, or audit-firm review.

## Attacks performed

| Surface                                | Result                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Winner control-flow and cursor leakage | full snapshotted domain processed; no early stop or caller index/order                                     |
| Chunk manipulation and replay          | zero/oversize rejected; stored cursors serialize callers; terminal phases reject replay                    |
| Participant snapshot                   | O(1) close count; N+1 registration cannot enter N traversal                                                |
| Stale/cross-vault proofs               | exact stored handle and phase bind proof; mismatched value, vault, and duplicate proof rejected            |
| Aggregate-T inference                  | exact low-anonymity limitation documented; no false registered-count anonymity claim                       |
| Candidate reroll                       | pending/accepted replacement blocked; only objectively rejected state regenerates                          |
| Ticket/winnings ACL                    | ticket contract-only and nonpublic; user-only winnings ACL; outsider decryptions denied                    |
| Conservation                           | one reconciled predicate; reserve moves once to winnings or principal; actual withdrawal output reconciled |
| Auto-save timing/privacy               | uniform checkpoint for every entry; round-close preference history; conversion uses actual timestamp       |
| Withdrawal after winnings              | duplicate request transfers encrypted zero and leaves principal untouched                                  |
| Sybil fill                             | permanent admission cap removed; O(1) close/bounded progress; linear total-work grief remains explicit     |
| HCU grief                              | live four-entry selection/allocation below 75% safety thresholds; caller cannot exceed chunk four          |

## Findings corrected

1. Allocation could previously accrue global TWAB after an expired but unclosed current round, making the later close
   timestamp precede the global cursor. Allocation now requires a genuinely open active round; close/catch-up is
   permissionless and bounded.
2. Reading the latest mutable auto-save preference would let transaction interruption timing affect settlement.
   Preferences now use public timestamped observations resolved at the winning round's close.
3. The foundation participant cap enabled permanent Sybil admission denial. It was removed; only live-HCU-derived
   processing limits remain.
4. Final individual/global consistency was previously assumed. Allocation is now gated by a publicly proven encrypted
   conjunction of aggregate equality and exactly one winner predicate.
5. Auto-save preference lookup initially included an action timestamped exactly at round close. It now uses the last
   observation strictly before close, matching the vault's `[open, close)` financial boundary.

## Residuals

Exact aggregate disclosure at low economic participation, linear total settlement work, per-round uniform observation
growth, allocation-chunk statistical inference, incentive design, live official-wrapper custody, yield integration, and
external review remain explicit risks. None permits a clear winner branch or an unbounded transaction in this slice.
