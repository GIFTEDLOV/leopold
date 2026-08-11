# Leopold Accounting Model

## Per-vault categories

The authoritative categories are encrypted `euint64` values: total principal liability, liquid principal, deployed
principal, liquid prize assets, realized surplus, reserved prize, and winnings liability. Sponsor amounts are
additionally public by product decision. Categories never reconcile across vaults.

Required equations and controls:

1. `principal liability = liquid principal + deployed principal`.
2. A principal withdrawal is eligible only up to both the user's principal and liquid-principal category.
3. Sponsor funding and realized surplus never increase principal.
4. Reserving a prize consumes each source exactly once; allocating winnings moves reserved prize to winnings liability.
5. Auto-save moves winnings liability to liquid principal and principal liability only at actual processing time.
6. Token assets must cover principal, prize, and winnings categories independently; no category may mask another
   deficit.

The plaintext `AccountingReferenceModel` enforces these equations after every action. Adapter deploy/return/harvest and
full prize/winnings transitions remain typed architecture, not falsely implemented value paths in this slice.

## Sponsored prize commitment

`contributeSponsor(roundId, units)` accepts only the open current round or deterministic next-round bucket. It transfers
the public underlying into the vault and calls the official wrapper, so the public committed amount is mechanically tied
to assets received. The commitment point is successful completion of this transaction. There is no cancellation or
sponsor-withdraw entrypoint before or after close. The per-round sponsor cap is enforced at `MAX_POOL_BASE_UNITS` and
sponsor funds never affect balances or TWAB.

## Withdrawals

Withdrawals are immediate-only, encrypted, partial/full, replay-safe inputs bound to the vault and wallet, and
independent of prior-round settlement. The vault selects zero if the request exceeds principal or liquid-principal
accounting, then reduces liability/TWAB only by the encrypted amount actually transferred by ERC-7984. A repeated
request cannot duplicate entitlement. If an open round has expired but is not closed, anyone (including the withdrawing
user) must first call the permissionless bounded `closeRound` operation.

## Yield boundary

`ILeopoldYieldAdapter` requires encrypted actual deployed/withdrawn/surplus amounts, controlled/liquid asset reports,
pause, and emergency exit. No ERC-4626 compatibility is assumed. A live cUSDT route, loss semantics, ACL transfer
review, and liquidity-buffer calibration are explicit later gates.
