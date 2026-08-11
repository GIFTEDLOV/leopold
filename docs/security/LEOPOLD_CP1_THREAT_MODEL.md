# Leopold CP1 Threat Model

## Protected assets and trust

Principal solvency, exact eligibility, private values/winner, unbiased immutable randomness, and permissionless progress
are protected. Users, sponsors, callers, keepers, registry owner, adapters, tokens, callbacks, and frontends are
untrusted except for the explicitly reverified official wrapper mechanics. Zama ACL/KMS/coprocessor and the pinned
compiler stack are external trust assumptions inherited from CP0.

## Threat/control register

| Threat                                                  | Foundation control / residual gate                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Principal theft or prize consumption                    | encrypted category separation; withdrawal bounded by user and liquid principal; adapter not enabled              |
| Balance/TWAB inference, cross-user decrypt, ACL leakage | user-scoped ACL; aggregate-only public reveal; ACL matrix and deny test                                          |
| Cross-vault contamination/TWAB carry                    | independent deployments/storage/custody; movement is withdraw then timestamped deposit                           |
| Sponsor manipulation/withdrawal/reroll                  | underlying transfer plus exact wrap; irrevocable success point; no outcome authority or withdrawal               |
| Yield double counting/adapter loss                      | no live adapter; typed actual-amount interface; reconciliation and live-adapter gate                             |
| Liquidity shortfall                                     | immediate encrypted zero transfer unless both principal/liquid categories suffice; conservative buffer gate      |
| Stale input/replay/duplicate withdrawal                 | proof bound to contract+wallet; accounting uses actual transfer and replaces entitlement                         |
| Candidate replacement/reroll                            | one candidate; only verified false validity permits retry; accepted ticket immutable/private                     |
| Settlement reorder/grief/replay                         | deterministic append order/cursor/chunk design; full selector not yet enabled                                    |
| Participant/HCU exhaustion                              | 10,000 hard cap and bounded transactions; Sybil admission and live HCU remain open                               |
| TWAB boundary/history corruption                        | cumulative checkpoints, same-time replace, exclusive close, randomized independent model                         |
| Overflow                                                | pool/duration/aggregate caps; explicit euint128 widening before multiplication                                   |
| Auto-save winner/log leakage                            | all-entry branchless update design; no winner field/event; implementation gated on HCU proof                     |
| Malicious callback/reentrancy/refund failure            | only immutable asset, transient guard, no external call/value movement inside callback; revert on malformed data |
| Admin seizure/keeper escalation                         | vault has no admin/keeper; registry owner changes discovery status only                                          |
| Paused/stuck/empty rounds                               | bounded permissionless close/finalize/draw; EMPTY terminal; token-level pause remains external risk              |
| Inactivity over many rounds                             | interpolation; no per-user close/reset or missed-round loop                                                      |

Pinned OZ 0.5.1 callback refunds are best-effort. Leopold's callback never transfers/burns token balance and returns an
encrypted false only after branchless accounting selects zero, leaving the received balance available for refund. A
revert reverts the entire transfer. This is narrower than persistent operator approval, but token hooks/upgrades and
Sepolia live callback behavior require a pre-deployment integration gate.

Open CP0 risks R-003, R-005, R-010, R-011, R-012, and R-014 remain open. No claim here closes them or substitutes for
the required external security audit.
