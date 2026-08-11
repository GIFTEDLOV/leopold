# Leopold Draw and Round State Machines

## Round pipeline

Per-round states are monotonic:

`OPEN -> AGGREGATE_PENDING -> EMPTY`

or

`OPEN -> AGGREGATE_PENDING -> AGGREGATE_FINALIZED -> CANDIDATE_VALIDITY_PENDING -> CANDIDATE_REJECTED -> ... -> TICKET_ACCEPTED -> WINNER_PROCESSING -> WINNINGS_ALLOCATED -> SETTLED`.

When a round closes, the next round opens immediately at the exact prior boundary while the old round progresses
independently. One `closeRound` closes one round, so catching up after missed keeper activity is bounded and
permissionless. Replay/phase mismatch reverts. No keeper role exists. Empty rounds never generate candidates.

The foundation implements through `TICKET_ACCEPTED`; later states are typed but have no placeholder transition
functions.

## Unbiased mapping

For public nonzero `T`, `N=2^128`, `q=floor(N/T)`, and `L=q*T`, all public arithmetic uses `uint256`.
`R=FHE.randEuint128()` is generated only in a state-changing transaction. If `L=N`, all candidates are valid and no
unrepresentable uint128 comparison is attempted. Otherwise `L <= 2^128-1`, and only encrypted `R < uint128(L)` is
publicly decrypted. An accepted ticket is `FHE.rem(R,T)`, using the pinned API's public plaintext divisor.

`T=0` is EMPTY; `T=1` and every divisor of `2^128` accept every candidate. Rejected candidates alone permit
regeneration. Accepted candidates/tickets are immutable. Candidate and ticket receive contract ACL only—never user,
registry owner, keeper, sponsor, frontend, or public ACL. Enumeration over an analogous 8-bit domain proves equal
preimage counts, while 128-bit boundary/property tests cover maximum `T`, `L=N`, and the first rejected value.

## Selection and private allocation design (next slice)

Process the append-only participant array by deterministic cursor and fixed maximum chunk size. For each address,
compute exact closed-round weight, maintain an encrypted prefix, and branchlessly test membership in
`[prefix,prefix+weight)`. Zero weight cannot match. Every processed entry receives a fresh encrypted
selection/allocation update, and no winner address or winner-specific event is stored/emitted. Resume uses the same
cursor/prefix and replayed chunks revert or no-op.

For auto-save, process all participant entries in deterministic chunks. Each entry receives branchless winnings and
principal updates—even encrypted zero—and an observation at that entry's actual processing timestamp. This avoids a
unique winner transition and retroactive TWAB. Full HCU/storage proof is required before enabling these typed states.
