# Leopold Liquidity Buffer

Immediate withdrawal reliability dominates yield maximization. Candidate liquid targets were evaluated against ordinary,
bursty, one-large-user, near-draw, Auto-Save, constrained-liquidity, and shortfall scenarios.

| Liquid target | Strategy share | Assessment                                             |
| ------------: | -------------: | ------------------------------------------------------ |
|          100% |             0% | maximal liquidity, no base yield                       |
|           75% |            25% | selected conservative hackathon production setting     |
|           60% |            40% | higher exposure and more replenishment correlation     |
|           50% |            50% | insufficiently conservative for immediate-only savings |
|           40% |            60% | rejected; strategy liquidity dominates withdrawals     |

The encrypted target is `floor(totalPrincipal × 7,500 / 10,000)`. Only encrypted excess becomes a deployment unwrap
request. Callers choose neither amount nor user. If liquid Private USDC is insufficient, a user withdrawal safely sends
zero; there is no queue and no use of prize, sponsor, winnings, or another vault. Replenishment is aggregate and epoch
aged so a public Compound withdrawal need not mirror one private request.

The 75% choice is calibration, not a guarantee. Before mainnet-like deployment it requires observed withdrawal data,
Compound liquidity monitoring, stress tests, and governance review.
