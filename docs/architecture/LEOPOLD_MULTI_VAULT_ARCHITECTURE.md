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
| `ILeopoldYieldAdapter`        | Narrow future strategy boundary; no live adapter is asserted                                   |
| Internal TWAB/draw components | Libraries/internal state are safer than FHE-bearing module contracts                           |

The compiled vault runtime is 13,844 bytes and initcode is 16,298 bytes, below EVM size ceilings in this build.

## Registry authority

The registry is the frontend's single authoritative source for vault ID, name/type, duration, asset, address, and
status. It rejects zero, duplicate, out-of-order, wrong-type, and wrong-duration entries. It intentionally registers
exactly four.

## Participant registry

Each vault has a contract-owned append-only address array. Registration order is transaction order; callers cannot
choose selection order. `MAX_PARTICIPANTS = 10,000` bounds all later cursors and prevents an actually unbounded list.
Registration is explicit because encrypted positivity cannot safely drive public array insertion. A Sybil can still
consume slots; the production admission/fee policy is a residual gate and must not reveal deposit amounts.

## Public/private classification

Public: official addresses/configuration/status, vault/round IDs and times, lifecycle states, sponsor address and
committed amount, public prize, finalized aggregate TWAB, processing cursor, participant addresses and transaction
metadata.

Private: deposit/withdrawal amount, principal, balance, individual TWAB/odds, candidate/ticket, predicates, winner,
winnings, and encrypted accounting totals. Address participation and timing/gas/transaction graph are unavoidable public
metadata and are outside value confidentiality.
