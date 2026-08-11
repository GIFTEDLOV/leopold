# Leopold Exact TWAB Model

## Semantics

For user `u`, vault `v`, and completed round `[a,b)`, exact weight is:

`W(u,v,a,b) = C(u,v,b) - C(u,v,a) = integral[a,b] balance(u,v,t) dt`.

Every balance change first accrues the old balance through the transaction timestamp and then changes the balance. Thus
a deposit starts weight at its credit timestamp, a withdrawal stops future weight at its actual transfer timestamp,
prior weight remains, and zero intervals contribute zero. Actions sharing a timestamp execute in transaction order but
add no elapsed weight between them. Round end is exclusive: actions require `timestamp < closesAt`.

## Observation construction

Each public-timestamp observation stores encrypted balance and encrypted cumulative balance-time. At time `t`:

`C(t) = C_i + widen128(B_i) * (t - t_i)`

where observation `i` is the last timestamp not after `t`. Same-timestamp changes replace the last balance without
adding a second observation. Binary search uses only public timestamps and is logarithmic; no closed rounds are looped.

This solves inactivity: a user untouched for any number of daily/weekly/monthly rounds retains the same observation, and
interpolation at every public boundary remains exact. No user is touched on close and no per-user round reset exists.
Historical closed-round weights are immutable because later observations cannot change the prior interpolation segment.

## Aggregate proof

The vault independently keeps encrypted total principal balance `G` and cumulative `CG`. On every total change it
applies `CG' = CG + widen128(G) * elapsed` before changing `G`. At close it accrues exactly to `closesAt`; aggregate
round weight is `CG(close) - CG(open)`. Linearity proves this equals the sum of individual weights without multiplying
by participant count.

Only the final aggregate handle is made publicly decryptable. The verified clear value is bounded by
`31,536,000,000,000,000,000,000` (75 bits). Individual observations and weights never become public.

## Numeric domain

- token/balance categories: `euint64`;
- widen before every time multiplication: `FHE.asEuint128(euint64)`;
- cumulative/round weights: `euint128`;
- pool cap: `1,000,000,000,000,000` base units, enforced on encrypted proposed total;
- duration cap: `31,536,000` seconds, enforced in constructor;
- launch durations are 86,400 / 604,800 / 2,592,000 / 604,800 seconds.

The implementation and independent brute segment evaluator are compared across 100 randomized 40-action histories,
including equal timestamps, full/partial withdrawals, empty intervals, missed rounds, and cross-vault movement.
