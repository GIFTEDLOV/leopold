# Leopold Accounting Model

## Per-vault categories

The authoritative categories are encrypted `euint64` values: total principal liability, liquid principal, deployed
principal basis, principal in transition, strategy shortfall, liquid prize assets, realized surplus, reserved prize, and
winnings liability. Sponsor amounts are additionally public by product decision. Categories never reconcile across
vaults.

Required equations and controls:

1. `principal liability = liquid principal + deployed principal basis + principal in transition + recognized shortfall`.
2. A principal withdrawal is eligible only up to both the user's principal and liquid-principal category.
3. Sponsor funding and realized surplus never increase principal.
4. Reserving a prize consumes each source exactly once; keep-available allocation moves reserved prize to winnings
   liability.
5. Auto-save moves reserved prize and liquid prize assets directly to liquid principal and principal liability only at
   actual processing time.
6. Token assets must cover principal, prize, and winnings categories independently; no category may mask another
   deficit.

The plaintext `AccountingReferenceModel` enforces these equations after every action. Aggregate deployment first moves
value from liquid to in-transition, and only authentic unwrap finalization moves it to deployed basis. Cancellation
returns it to liquid. Compound managed assets are measured independently by `Comet.balanceOf(adapter)`: value above
basis is candidate genuine surplus; value below basis is explicit shortfall. Basis is never reduced to create yield.

## Sponsored prize commitment

`contributeSponsor(roundId, units)` accepts only the open current round or deterministic next-round bucket. It transfers
the public underlying into the vault and calls the official wrapper, so the public committed amount is mechanically tied
to assets received. The commitment point is successful completion of this transaction. There is no cancellation or
sponsor-withdraw entrypoint before or after close. The per-round sponsor cap is enforced at `MAX_POOL_BASE_UNITS` and
sponsor funds never affect balances or TWAB.

An empty round rolls its complete reserve into the already-open successor without RNG. At winning selection, source
categories are indistinguishable and confer no sponsor cancellation, winner-selection, reroll, or reclaim authority.

## Withdrawals

Withdrawals are immediate-only, encrypted, partial/full, replay-safe inputs bound to the vault and wallet, and
independent of prior-round settlement. The vault selects zero if the request exceeds principal or liquid-principal
accounting, then reduces liability/TWAB only by the encrypted amount actually transferred by ERC-7984. A repeated
request cannot duplicate entitlement. If an open round has expired but is not closed, anyone (including the withdrawing
user) must first call the permissionless bounded `closeRound` operation.

Keep-available winnings use a separate encrypted withdrawal. Eligibility is bounded by the user's winnings and liquid
prize assets, and all categories are reduced only by the ERC-7984 amount actually sent.

## Yield boundary

`ILeopoldYieldAdapter` carries public vault-level actual amounts only. `LeopoldCompoundAdapter` is immutable to one
vault, canonical Circle Sepolia USDC, and the verified direct Comet market. Exact approvals are reset to zero.
Deployment adds actual USDC received to basis. Principal redemption cannot exceed both basis and managed assets. Harvest
withdraws only `managedAssets - basis`. Emergency exit returns assets to the vault, records loss without deleting
liability, and routes any value above basis to uncommitted prize yield. The launch buffer target is 75% liquid;
withdrawals remain immediate when liquid Private USDC suffices and safely transfer zero otherwise.
