# Leopold Private Settlement

## Uniform allocation

After reconciliation, allocation traverses the same complete snapshot. Every participant executes the same encrypted
winner selection, prize split, accounting updates, ACL calls, and observation checkpoint. There is no clear winner
address, winner event, early stop, winner-only external transfer, or clear branch on the encrypted predicate.

The public round prize is safe to convert to an encrypted scalar; its amount is not the private fact. Leopold currently
uses the encrypted reserved-prize handle so the winner-specific allocation remains encrypted throughout.

## Keep available

`KEEP_AVAILABLE` adds encrypted prize-or-zero to the participant's private winnings and the aggregate winnings
liability. The user may later request an encrypted withdrawal. Actual ERC-7984 transfer output reduces only that user's
winnings, winnings liability, and liquid prize assets, preventing duplicate withdrawal or principal consumption.

## Auto-save

`AUTO_SAVE` preference is resolved from the last public timestamped observation strictly before the winning round's
close, so an exact-boundary action belongs to the next round and interruption or a later preference change cannot alter
settlement. It adds encrypted prize-or-zero to principal during that participant's allocation transaction. TWAB accrues
before the increment, so eligibility starts at the actual conversion block timestamp. Every participant receives an
observation checkpoint, including encrypted-zero losers, preventing a unique winner-address storage transition.

If the encrypted global principal cap would be exceeded, the auto-save amount confidentially falls back to private
winnings. This prevents a public settlement failure from revealing the winner and preserves the pool-domain proof.
Allocation requires the current accumulation round to be genuinely open; otherwise callers must first advance the
permissionless round close. This prevents global cumulative time from moving beyond an unclosed boundary.

## Conservation

For each encrypted participant step:

`prizeForParticipant = autoSaved + kept`

and globally:

`reservedPrize -> principalLiability + liquidPrincipal` for auto-save, or

`reservedPrize -> winningsLiability` for keep-available.

Auto-save also reclassifies backing assets from liquid prize assets to liquid principal. No source-specific behavior
distinguishes sponsor, rollover, or future genuine-yield prize funds.

## Observable surface

Public preference, cursor, fixed participant range, transaction sender, gas, and ordinary ciphertext/ACL activity are
observable. Each iteration has the same control-flow shape. Allocation chunks occur at different public timestamps, so
later aggregate disclosures may add statistical information about a chunk; they do not expose a clear winner predicate
or a winner-specific write. This residual is tracked for privacy review.
