# Leopold Multi-Vault Architecture

## Decision

Deploy four ordinary, independent `LeopoldVault` contracts from the same reviewed bytecode and register their addresses
in one `LeopoldVaultRegistry`. Deployment coordination is offchain and deterministic; the registry constructor validates
all four identities and durations. There are no clones, proxies, upgrade hooks, or implementation administrators.

This avoids proxy/initializer risk while preserving code uniformity. Each deployment has separate storage, token
custody, principal liabilities, user balances and observations, global TWAB, participants, rounds, sponsor buckets,
prize reserves, winnings, draw state, and cursors. The registry owner can only mark discovery status active/deprecated.
It cannot move funds, change vault configuration, close rounds, replace candidates, settle, or decrypt anything.

## Contract boundaries

| Boundary                      | Reason                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `LeopoldVault`                | Keep financial/FHE operations together; avoids cross-contract ACL churn and partial accounting |
| `LeopoldVaultRegistry`        | Public official-address discovery and deprecation only; contains no user data                  |
| `LeopoldCompoundAdapter`      | One immutable direct-Comet account per vault; public aggregate USDC only                       |
| `ILeopoldYieldAdapter`        | Narrow actual-amount strategy boundary; receives no user identity or FHE ACL                   |
| Internal TWAB/draw components | Libraries/internal state are safer than FHE-bearing module contracts                           |

The integrated vault uses size-oriented optimizer settings (`runs: 1`, `viaIR`) and compiles to 24,496 runtime bytes, 80
bytes below the 24,576-byte EIP-170 limit. This extremely narrow margin is a release gate: later slices must remeasure
it and should prefer libraries or adjacent non-FHE boundaries over vault growth.

## Registry authority

The registry is the frontend's single authoritative source for vault ID, name/type, duration, asset, address, and
status. It rejects zero, duplicate, out-of-order, wrong-type, and wrong-duration entries. It intentionally registers
exactly four.

## Participant registry

Each vault has a contract-owned append-only address array. Registration order is transaction order; callers cannot
choose selection order. The registry has no permanent admission cap; round-close snapshots are O(1), while every
selection/allocation transaction is bounded by an HCU-derived chunk limit. See the participant-admission analysis.
Registration is explicit because encrypted positivity cannot safely drive public array insertion. A Sybil can still
consume slots; the production admission/fee policy is a residual gate and must not reveal deposit amounts.

## Public/private classification

Public: official addresses/configuration/status, vault/round IDs and times, lifecycle states, sponsor address and
committed amount, public prize, finalized aggregate TWAB, processing cursor, participant addresses and transaction
metadata.

Private: deposit/withdrawal amount, principal, balance, individual TWAB/odds, candidate/ticket, predicates, winner,
winnings, and encrypted accounting totals. Address participation and timing/gas/transaction graph are unavoidable public
metadata and are outside value confidentiality.

Public strategy facts additionally include epoch lifecycle, aggregate amount after authorized declassification, Compound
position, principal basis, managed assets, aggregate redemption, and harvested surplus. These never include a user
identifier or individual amount. Each vault creates its own adapter, so even though all four use the same Comet market,
their supplier accounts and books cannot subsidize one another.
