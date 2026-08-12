# Leopold Yield Threat Model

| Threat                         | Control / residual                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| wrong USDC or Comet            | immutable constructor validation of `baseToken` and `baseScale`; deployment evidence                |
| approval abuse                 | exact approval around one call, then zero                                                           |
| borrow/collateral exposure     | adapter exposes supply/withdraw only; live probe confirms zero borrow/collateral                    |
| basis drift/double harvest     | actual deltas, unchanged basis on harvest, surplus-only subtraction                                 |
| concealed loss                 | explicit `managed < basis` shortfall; liabilities never written down                                |
| cross-vault subsidy            | independent vault and adapter accounts; no shared accounting                                        |
| proof replay/cross-purpose     | active epoch, state, wrapper request handle, FHE signature binding                                  |
| timing/low-anonymity inference | age and aggregate-only movement; documented residual at small anonymity sets                        |
| strategy pause/liquidity       | 75% liquid buffer; immediate withdrawals from liquid remain; no queue                               |
| Comet proxy/governance change  | external dependency; pause new deployment and emergency unwind                                      |
| wrapper/proof liveness         | permissionless finalization and expiry recovery; authentic proof still required after burn          |
| reentrancy/external failure    | non-reentrant vault/adapter paths; revert preserves pre-call accounting                             |
| donation manipulation          | stored Comet signed-principal snapshot detects external position transfers and fails harvest closed |
| admin seizure                  | guardian can only pause; all redeemed value returns to the immutable vault                          |

Fresh-session review must recheck proxy implementation, pauses, approvals, source/asset identity, proof binding,
rounding, buffer correlation, emergency accounting, and runtime size before deployment.
