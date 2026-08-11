# Leopold CP1 Foundation Second-Pass Review

Review performed after implementation and targeted tests, before the foundation commit.

## Challenges and results

| Challenge                         | Result                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| Inactive users / missed rounds    | cumulative observation interpolation is exact; no user or missed-round close loop                 |
| Round boundary and same timestamp | `[open,close)` lock, accrue-old-then-change, same-time observation replacement                    |
| Aggregate reconciliation          | independent cumulative total equals randomized sum of individual weights                          |
| Cross-vault state/principal       | ordinary deployments and common-asset registry validation; no shared accounting                   |
| Sponsor principal contamination   | public underlying wraps into prize categories; explicit per-round reserve at close                |
| Withdrawal duplication/liquidity  | encrypted eligibility uses user and liquid principal; reduction uses actual token transfer        |
| Unsupported FHE assumptions       | only `rem(euint128,uint128)`; no encrypted RHS division/remainder; explicit pre-multiply widening |
| Reroll/candidate replacement      | phase checks; public objective validity only; accepted ticket immutable and contract-only ACL     |
| Winner leakage                    | no selector/allocation entrypoint, winner address, winner event, or ticket getter was introduced  |
| Admin/keeper authority            | vault has neither; registry owner controls discovery status only                                  |
| Unbounded processing              | close is one round/transaction; participant list hard-capped; timestamp lookup logarithmic        |
| Callback/reentrancy               | immutable asset, transient guard, no callback external value movement, malformed data reverts     |

## Findings corrected in pass

1. Added exact-name and common-asset checks to the four-vault registry.
2. Moved each closed sponsor bucket into an explicit encrypted per-round reserved prize and aggregate reserve.
3. Added withdrawal-during-prior-settlement and candidate immutability/objective-validity integration coverage.
4. Enforced six confidential-token decimals at vault construction because the numeric proof assumes six base decimals.

## Still gated

Full bounded winner traversal, branchless winnings/auto-save allocation, live adapter, live callback/withdraw
integration, participant Sybil admission, and live HCU for new composite circuits remain later production gates. This
review is an internal fresh adversarial pass, not an independent external audit.
