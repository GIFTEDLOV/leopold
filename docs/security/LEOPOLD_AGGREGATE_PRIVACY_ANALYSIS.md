# Leopold Aggregate-TWAB Privacy Analysis

## Decision: retain exact public aggregate with an explicit low-anonymity limitation

Leopold retains exact public finalized aggregate eligible TWAB `T`. Correct rejection sampling requires plaintext `T`
because pinned `@fhevm/solidity 0.11.1` supports division and remainder only with a plaintext right-hand divisor.

A registered-address threshold is not a defensible anonymity threshold: registered users may have zero weight, and one
active participant may coexist with many empty registrations. Revealing an encrypted positive-weight count would add a
second aggregate disclosure, and preventing small rounds from drawing would change the locked product and enable
participation griefing. No lower-disclosure mapping was found that simultaneously preserves exact fairness, unbiased
mapping, encrypted tickets, pinned-operation support, bounded retries, and practical HCU.

## Explicit limitation

Exact aggregate disclosure can reveal or tightly bound individual balance-time when a vault has one or very few
economically active participants, especially when combined with public timestamps and transaction/address metadata.
Leopold therefore promises value confidentiality, not an anonymity set or protection against all differencing attacks.
This limitation must appear in evaluator and eventual user privacy disclosures; the frontend must not present exact
aggregate disclosure as hiding a sole participant's economic activity.

## Minimized public decryptions

Permitted values are limited to finalized aggregate `T`, rejection-validity booleans, and the final objective selection
reconciliation boolean. Individual TWAB, odds, intervals, predicates, accepted ticket, winner, and winnings are never
made publicly decryptable.

Correctness is prioritized over adding a cosmetic registered-count threshold that does not measure economic anonymity.
