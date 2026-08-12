# Leopold Yield Privacy Boundary

## Private

Individual deposit and withdrawal amounts, principal, observations, TWAB, odds, accepted ticket, winner, winnings, and
Auto-Save result remain ciphertexts. The strategy adapter receives no participant address, balance, or FHE ACL.

## Public aggregate infrastructure

Epoch ID/state/timing, the finalized aggregate deployment or replenishment amount, wrapper unwrap, canonical USDC
movement, adapter/Comet address, supplier balance, principal basis, managed assets, harvest, shortfall, and emergency
redemption may be public. Transaction graph, participant registration, and timing remain observable.

Minimum age decouples strategy actions from user confirmation, but does not create anonymity. With one depositor, or an
N−1 Sybil coalition, aggregate subtraction can reveal or tightly bound a contribution. No participant floor is imposed:
it could trap low-volume principal and is not Sybil-proof. Demo/evaluator one-user epochs are explicitly low-anonymity
at the strategy boundary. This limitation does not decrypt core Leopold balances, TWAB, ticket, winner, or winnings.

Proofs are purpose/state/handle bound. Cross-vault, cross-epoch, stale, mismatched-cleartext, and duplicate finalization
revert. An accepted draw ticket is never reused for strategy declassification.
