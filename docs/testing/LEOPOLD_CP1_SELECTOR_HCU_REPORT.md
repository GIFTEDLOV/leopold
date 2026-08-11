# Leopold CP1 Selector Live HCU Report

## Authority and evidence

The dedicated non-custodial harness was deployed on Ethereum Sepolia at block `11,466,267` and measured from receipt
coprocessor events with pinned `hre.fhevm.computeTransactionHCU(receipt)`. The final harness is
`0x50599142900e81871db569481a46040646FBcD50`; deployment transaction is
`0x5607c1a27c5588e4be96ce218ecc11a9d8c7c677af1aaba3bbf96a98818b6164`.

Canonical transaction/block/gas fields, source and artifact SHA-256 values, configuration, and proof results are in
`evidence/cp1/LEOPOLD_SELECTOR_HCU_LIVE.json`, whose SHA-256 is
`a0118d72591f3cf227239a649b9284a3991991da04693278c45e68d7453cfe3c`.

## Live results

| Circuit                        |  Total HCU | Depth HCU |       Gas |
| ------------------------------ | ---------: | --------: | --------: |
| User TWAB query                |  2,170,096 | 1,215,032 |   393,745 |
| Global close accrual           |  1,215,096 | 1,215,032 |   348,498 |
| Candidate generation           |     25,064 |    25,000 |   306,659 |
| Candidate validity             |    149,032 |   149,000 |   291,836 |
| Accepted-ticket modulo         |  1,943,032 | 1,943,000 |   274,934 |
| One participant selection      |  3,216,096 | 1,901,064 |   514,460 |
| Four-participant selection     | 12,864,288 | 2,678,064 | 1,125,673 |
| Winnings-only allocation       |    541,064 |   217,032 |   386,494 |
| Uniform auto-save allocation   |  2,854,128 |   955,032 |   692,655 |
| Four uniform allocation steps  | 11,416,416 | 2,579,064 | 1,575,298 |
| Aggregate public authorization |    172,000 |   172,000 |   301,889 |
| Aggregate proof verification   |          0 |         0 |   373,222 |
| Boolean public authorization   |    120,000 |   120,000 |   287,533 |
| Boolean proof verification     |          0 |         0 |   356,166 |

Both aggregate and boolean public-decryption results received authentic proofs and transitioned onchain. No accepted
ticket, individual TWAB, winner, or winnings value was publicly decrypted.

## Chunk decision

Leopold retains 25% headroom: total HCU must remain below 15,000,000 and depth below 3,750,000, versus enforced
20,000,000/5,000,000 ceilings. Four-participant selection uses 85.8% of the internal total threshold and 71.4% of the
internal depth threshold. Four allocation steps use 76.1% and 68.8%, respectively. Both protocol chunk limits are
therefore four. The final-selection reconciliation adds only the fixed boolean comparisons/conjunction and remains
inside the unused envelope.

One production participant across both passes accounts for approximately 6,070,224 HCU split over two transactions.

## Scaling model

With four participants per transaction, selection and allocation require `2 * ceil(n / 4)` cursor transactions:

| Participants | Selection tx | Allocation tx | Combined tx |
| -----------: | -----------: | ------------: | ----------: |
|           10 |            3 |             3 |           6 |
|          100 |           25 |            25 |          50 |
|        1,000 |          250 |           250 |         500 |
|       10,000 |        2,500 |         2,500 |       5,000 |
|       50,000 |       12,500 |        12,500 |      25,000 |

This demonstrates bounded resumability, not wall-clock completion promises. Incentives and high-population liveness
remain production risks.

## Observation history scaling

Local receipt measurements at 1/2/8/32/128/512 public timestamps produced constant `955,032` HCU and depth. Gas was
`129,224 / 130,044 / 131,534 / 136,986 / 142,426 / 147,866`, confirming logarithmic public-index growth and constant FHE
work. The live user-query result above is higher because it includes both round boundaries.
