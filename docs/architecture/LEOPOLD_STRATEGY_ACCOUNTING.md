# Leopold Direct-Comet Strategy Accounting

For each vault, `deployedPrincipalBasis` is public aggregate principal intentionally supplied. `managedAssets` is the
live Comet base-supplier balance of that vault's adapter. They are never aliases.

- `managed > basis`: only the difference is harvestable genuine Compound base interest.
- `managed == basis`: no yield.
- `managed < basis`: explicit shortfall; harvest returns zero and deployment should pause.
- principal redemption reduces basis by the intended principal amount only after actual redemption succeeds.
- harvest does not change basis and cannot repeat without new managed-asset growth.

Compound's principal/index representation may round a newly supplied six-decimal position down by one base unit. That is
not yield; the adapter reports it as a temporary managed-assets shortfall until index accrual catches up. Actual token
deltas control deployment, redemption, wrapping, and prize credit.

The adapter also snapshots Comet's signed `userBasic.principal`. Normal interest changes the index-derived present
value, not that principal. An unsolicited Comet position transfer changes principal, fails the integrity check, and
blocks deployment/harvest rather than being mislabeled as yield. A one-base-unit managed-assets tolerance covers Comet's
known six-decimal present-value rounding; larger shortfall blocks deployment.

Harvest is `Compound surplus → canonical USDC → lcUSDC → uncommitted yield/liquid prize assets`. Round close consumes
the uncommitted-yield category into exactly one reserve. Sponsor funding remains separate until reservation. Settlement
then moves reserve to private winnings or branchless Auto-Save principal. Strategy principal never enters this equation.
