# Leopold final settlement architecture decision

Date: 2026-08-12  
Repository: `/home/dell/zama-szn4`  
HEAD: `8f30ba74a1fcbfa2cbb45aa420a90b3ec65f7951`

## 1. Current settlement blocker

The current production candidate computes an exact private weighted winner, but selection and allocation each traverse
the entire permanent participant snapshot in chunks of four. For `n` registered identities, a nonempty round requires
`ceil(n / 4)` selection calls and `ceil(n / 4)` allocation calls, in addition to constant lifecycle calls. Thus
mandatory participant-processing work is `2 * ceil(n / 4)`. A zero-balance identity remains in the permanent registry
and therefore adds recurring work to every later nonempty round without posting recurring capital or paying the future
processing cost.

Per-transaction HCU is bounded; economic completion is not. Permissionless calls prevent a privileged-keeper dependency,
but they do not force anyone to purchase an attacker-created, indefinitely growing amount of FHE work. This is a real
settlement-starvation exposure and blocks the contract freeze.

## 2. Failed tree evidence

The two isolated tree spikes are conclusive for the current pinned FHEVM execution model:

- Spike 1 proved the historical-TWAB and interval mathematics, but a populated depth-6/64-slot full result cost
  19,370,832 HCU and depth 7 hard-reverted.
- Spike 2 tested the prerequisite ordinary financial update before attempting checkpointed results. A time-separated
  depth-16 update cost 18,989,544 HCU, above Leopold's 15,000,000 safety target; depths 20, 24, 28, and 32
  hard-reverted.
- A shallow executable capacity recreates the forbidden admission-cap denial. A large capacity makes ordinary Save and
  Withdraw impractical or impossible. Splitting result materialization cannot repair the update gate because principal
  and TWAB eligibility must change immediately in the user's normal financial transaction.

No Fenwick, segment, prefix, moment, or similar encrypted aggregate-tree variant is recommended under the pinned model.
The exact research artifacts remain isolated and are not production dependencies.

## 3. Salvageable production fixes

The independent dirty candidate is detailed in [SALVAGE_REPORT.md](./SALVAGE_REPORT.md). Its useful changes are
salvageable:

- pause is rechecked immediately before a matured deployment request moves principal into unwrap transition;
- normal Compound operations fail closed on base-token or base-scale drift, while emergency exit remains available;
- registry construction checks adapter vault and asset backpointers;
- value-conservation and lifecycle tests are stronger;
- duplicated internal proof/wrap logic is consolidated without removing checks;
- deterministic bytecode and provisional interface-freeze validators exist.

A fresh compile measured `LeopoldVault` runtime at 23,064 bytes, leaving 1,512 bytes of EIP-170 headroom. Six non-spike
Leopold suites passed 57 tests. These fixes do not depend on a tree and do not change the current settlement algorithm.
They remain a candidate, not a final freeze, because the recommendation below deliberately changes eligibility and round
state.

## 4. Final algorithmic search

### Projected exact TWAB as dynamic point weights

For round end `E`, define

`p_i(t) = accrued_i(t) + balance_i(t) * (E - t)`.

Between balance changes its derivative is zero: accrued TWAB rises by `balance_i`, while the remaining-time term falls
by the same amount. A balance delta `d` at public time `t` changes projected final weight by exactly `d * (E - t)`. At
`E`, `p_i(E)` equals the user's exact continuous TWAB. The settlement problem can therefore be viewed as exact dynamic
weighted sampling under positive and negative point updates.

### Weighted reservoir and random-key families

Positive-only streaming is easy: after adding weight `d` to account `i`, replace the current sample with `i` with
probability `d / (T + d)`. Classical weighted-reservoir methods likewise assign positive-weight items random keys; the
Efraimidis-Spirakis construction is a one-pass algorithm for positive weights
([paper](https://utopia.duth.gr/~pefraimi/research/data/2007EncOfAlg.pdf)). Neither solves arbitrary decrements without
retaining population-wide successor information.

Formally, suppose the current exact sample `S` has distribution `Pr[S=j] = w_j/T`, and weight `d` is removed from
account `k`. If non-`k` samples are retained and a sampled `k` is replaced according to `Q`, exactness for every
`j != k` requires

`w_j/T + (w_k/T) Q_j = w_j/(T-d)`,

hence

`Q_j = w_j d / (w_k (T-d))`.

Producing `Q` is itself a weighted sample over the remaining population. A finite list of backup winners is exhausted by
adversarial decrements; an unbounded exact list is an ordered global random-key structure. In an exponential race
(`X_i ~ Exp(w_i)`), decreasing the current minimum can expose any successor. Finding it requires a scan or maintained
heap/tree, and encrypted access to that structure recreates the rejected FHE work and access-pattern problem.

### Alias, rejection, priority, and dynamic exact samplers

An alias table samples a static clear distribution efficiently, but arbitrary private updates require rebuilding or
maintaining population-wide bucket relationships. Uniform-index rejection is exact only with an unbounded loop: with
public candidate `i` and bound `M`, acceptance probability `w_i/M` gives the right conditional distribution, but
expected trials are `nM/T`. Zero-weight Sybils make it unbounded, while a fixed attempt count introduces failure or bias
and public candidates/termination leak selection information. Priority sampling has the same global-extremum maintenance
issue; it is often designed for estimators rather than an exact single draw.

Recent EBUS research does demonstrate exact dynamic discrete sampling with finite-precision weights in a clear word-RAM
model, with expected constant-time sampling and amortized constant-time updates
([Hafner and Meligrana, 2026](https://arxiv.org/html/2506.14062v2)). This is important counterevidence to any claim of
mathematical impossibility. Its efficiency relies on clear weight-exponent groups, clear bucket membership and sums,
data-dependent candidate access, and rejection loops. Making those features public leaks private weight magnitudes and
candidate information; hiding them requires scanning levels/buckets or ORAM-like encrypted indexing. Keeping acceptance
encrypted also prevents a public, exactly terminating bounded loop. It is not practical with Leopold's pinned FHEVM
operations and privacy requirements.

## 5. Exact dynamic-sampler conclusion

**ALGORITHMIC SEARCH CLOSED — NO PRACTICAL EXACT DYNAMIC SAMPLER FOUND**

This is an engineering conclusion under the pinned FHEVM model, not a theorem that dynamic sampling is impossible. Every
examined exact construction either fails arbitrary decrements, exposes private weight-dependent state/access, uses an
unbounded rejection process vulnerable to Sybils, or maintains a population-wide structure whose encrypted update/query
cost is the already-rejected tree problem. No construction meets all of: exact `weight_i/T`, arbitrary deposits and
withdrawals, exact historical TWAB, no participant cap, no `O(n)` mandatory work, no high-depth encrypted structure,
private winner/ticket, and practical pinned-FHEVM execution.

## 6. Economic eligibility options

Scores are 1 (poor) through 5 (strong). For HCU and bytecode, a higher score means lower burden. Option 1 is
round-scoped economic eligibility; Option 2 is a minimum prize-eligible position; Option 3 is uniqueness/personhood;
Option 4 is a settlement-cost bond; Option 5 is the current linear assumption.

| Criterion                |  O1 |  O2 |  O3 |  O4 |  O5 | O1 + O4 |
| ------------------------ | --: | --: | --: | --: | --: | ------: |
| Sybil resistance         |   4 |   3 |   5 |   4 |   1 |       5 |
| Cryptographic privacy    |   4 |   3 |   3 |   4 |   5 |       4 |
| Permissionlessness       |   4 |   4 |   2 |   4 |   5 |       4 |
| PoolTogether-like UX     |   3 |   3 |   2 |   3 |   5 |       3 |
| Passive eligibility      |   2 |   3 |   3 |   2 |   5 |       3 |
| Small-saver friendliness |   3 |   1 |   4 |   3 |   5 |       3 |
| Contract simplicity      |   3 |   3 |   2 |   3 |   5 |       3 |
| FHE HCU                  |   5 |   4 |   5 |   5 |   4 |       5 |
| Bytecode                 |   3 |   3 |   3 |   3 |   5 |       3 |
| Dependency risk          |   5 |   5 |   1 |   4 |   5 |       4 |
| Evaluator simplicity     |   4 |   3 |   1 |   4 |   5 |       4 |
| Production credibility   |   4 |   3 |   2 |   4 |   1 |       5 |

### Option 1 — round-scoped economic eligibility

Eligibility expires after its named round, so an attacker must pay or lock capital again to impose work again. This ends
the permanent historical-Sybil multiplier. A merely refundable token with no concurrent lock or work charge is weak: the
same capital can be cycled and honest keepers remain unpaid. A nonrefundable fee improves resistance but harms small
savers. The strongest version combines round scope with a public work bond whose processing portion is earned by the
permissionless progressor.

Enrollment is for the next round and is immutable once that round opens. A saver may enroll manually, pre-authorize
standing enrollment, or allow a relayer to submit their authorization. Financial participation never depends on
enrollment.

### Option 2 — minimum prize-eligible economic position

A public encrypted comparison could reveal only an eligibility Boolean while keeping the exact balance private, but the
Boolean still leaks whether an account is above a financial threshold. It excludes small savers, encourages splitting or
threshold timing games, and requires precise rules for withdrawals below threshold. Locking a minimum position would
violate withdraw-anytime; allowing free exit restores cheap identities or needs disqualification logic. This option does
not directly pay settlement cost and is not recommended.

## 7. Identity eligibility option

Proof-of-personhood can strongly reduce one-human-many-address attacks, but introduces a new issuer/proof-system trust
boundary, censorship and availability risk, identity-related privacy considerations, and significant evaluator/frontend
friction. Its Sybil guarantees depend on an external system rather than Leopold's financial state. It may be offered as
a future alternative eligibility provider after a dedicated review; it should not be a CP1 production dependency.

## 8. Settlement-bond option

The preferred bond is public, round-scoped, and separate from confidential principal and prize assets. Its amount
contains:

- a deterministic selection-step bounty;
- a deterministic allocation-step bounty;
- a small base lifecycle/work contribution if required; and
- an optional refundable remainder that stays locked until the account's two processing steps are complete.

Each cursor step pays the fixed stage bounty for the identity processed, regardless of weight, winner status, or
encrypted result. The caller cannot choose selection or randomness and learns nothing from the reward. Principal and
prize reserve never fund keepers. The minimum bond must be calibrated from measured worst-case gas/HCU for both stages
with margin; changing it is an economic/security parameter change requiring review, not an arbitrary guardian control.

An attacker registering `m` eligible identities must post `m` current-round bonds, and the work they create comes with
`m` processing budgets. Old identities create no future work unless re-enrolled and re-funded. This does not make
settlement constant-time—it makes its linear cost current, prepaid, permissionlessly collectible, and non-permanent.

No global refund loop is allowed. Refundable balances are pulled per enrollment after both cursor phases pass the entry,
or according to a deterministic empty-round rule. Repeated enrollment for the same `(vault, round, account)` is
rejected. Third-party bond sponsorship is acceptable only with the user's signed enrollment authorization, preventing
unsolicited storage/work creation on another user's behalf.

## 9. Privacy tradeoffs

The enrolled address, round number, and public bond are visible. That reveals an account's choice to enter a prize
round, not its balance, exact TWAB, odds, ticket, winner status, or winnings. Selection/allocation retain uniform
encrypted paths; bounty and refund behavior must depend only on public cursor completion, never on the encrypted winner
predicate.

As today, timing and low-anonymity aggregate differencing remain behavioral privacy limitations. Public enrollment can
make the anonymity set clearer, but it must not make the winner cryptographically public. The UI and security record
must distinguish these behavioral inferences from direct winner disclosure.

## 10. UX tradeoffs

The invariant change is explicit: Save no longer implies automatic prize eligibility forever. A user chooses or
pre-authorizes enrollment for each future round and supplies a separate public work bond. The UI can present this as
“Enter next prize round” with the bond and refundable portion shown, while continuing to hide FHE, tickets, chunks, and
Compound.

Standing authorization can preserve passive behavior: a user pre-funds a bounded public bond balance and signs a
narrowly scoped enrollment policy; anyone may submit it, but only one enrollment per round is valid. Security does not
depend on a relayer. If automation disappears, the saver can enroll directly and any account can later progress
settlement for the posted bounty.

Core flows—wrap, Save, yield, private balance, Withdraw, and unshield—remain available without prize enrollment or bond.
Small savers are not excluded by a confidential-balance threshold, although the public bond is a real participation
cost.

## 11. Security tradeoffs

The design converts an unpriced permanent resource claim into a priced round-scoped claim. It does not stop a wealthy
attacker buying blockspace and creating a large current round; instead it ensures the attacker cannot impose unpaid work
forever and that permissionless progressors have funds to complete that work. Parameter underpricing, bond-asset price
volatility, refund edge cases, and cursor/reward replay become new audit targets.

Eligibility must be immutable during an active round. Withdrawal remains immediate and merely reduces future TWAB
exactly as today; it does not refund or cancel that round's bond. A zero-TWAB enrolled account is still processed and
still funds its processing. This removes any incentive to use public balance thresholds or winner-dependent bond
behavior.

## 12. Recommended architecture

**ROUND-SCOPED PUBLIC SETTLEMENT-BOND ELIGIBILITY** is the selected production architecture.

Maintain a round-specific enrolled list rather than the permanent financial-account registry. Enrollment for round `r+1`
occurs before it opens and is immutable while active. The public bond pre-funds that identity's bounded selection and
allocation work. Current financial-account registration remains permanent only for account/TWAB bookkeeping and never
defines the settlement traversal set.

Exact eligible aggregate TWAB does not require a tree or close traversal. Maintain two encrypted aggregate-balance/TWAB
streams per vault:

1. `currentEligible`, covering the immutable eligibility set of the open round;
2. `nextEligible`, covering accounts already authorized for the next round.

When an account enrolls for the next round, add its current encrypted principal to `nextEligible` at the enrollment
timestamp used by that next-round schedule. Every deposit or withdrawal applies the same encrypted delta to
`currentEligible` if the account is eligible now and to `nextEligible` if it is enrolled next. These are a constant
number of aggregate updates—no participant tree. At the round boundary, promote the prepared next aggregate to current
and reset the next accumulator in constant work. The first round needs a pre-open enrollment window. Individual
observations remain the source of exact per-user `[open, close)` TWAB.

Round close snapshots exact eligible `T`; the existing unbiased encrypted rejection sampler fixes the private ticket;
next-round opening remains independent of settlement. Selection and allocation traverse only the funded current-round
enrollment list in bounded chunks and pay deterministic per-entry bounties. Thus the architecture retains linear
cryptographic work where exact private selection currently requires it, but removes permanent unpaid Sybil
amplification.

## 13. Exact invariants preserved

- exact continuous confidential TWAB and `[open, close)` boundaries;
- exact probability `weight_i / T` among enrolled accounts;
- encrypted unbiased accepted `euint128` ticket and no caller-controlled reroll;
- private balances, weights, odds, winner, and winnings;
- principal never funds prizes or settlement rewards;
- immediate withdrawal and no lock on confidential savings;
- permissionless wrap, Save, Compound yield, hold, Withdraw, and unshield;
- permissionless resumable settlement with bounded per-transaction HCU;
- no permanent participant cap and no minimum confidential balance;
- four isolated vaults, replay protection, Auto-Save, and no winner-specific public event;
- next-round opening is independent of completion of the previous round's chunks.

## 14. Exact invariant changed, if any

One product invariant changes: **holding/saving private principal no longer automatically and permanently makes an
address prize-eligible**. Prize eligibility is an explicit, public, round-scoped election backed by separate public
settlement collateral. The financial product remains permissionless; only entry into the subsidized prize draw is
conditioned.

Passive eligibility becomes opt-in automation rather than an unconditional consequence of saving. This change must be
shown plainly in product copy and transaction review.

## 15. Implementation plan

1. Specify the bond asset, fixed per-stage reward, refundable portion, calibration evidence, and empty-round behavior.
2. Add round-scoped enrollment with replay-safe user authorization and one entry per `(vault, round, account)`.
3. Separate permanent financial-account slots from round settlement entries; never traverse the former during
   settlement.
4. Add `currentEligible`/`nextEligible` exact aggregate accumulators and prove enrollment/deposit/withdraw/Auto-Save
   boundary semantics, including first-round initialization.
5. Snapshot eligible `T`, prize, and participant count at close; retain existing rejection, reconciliation, private
   payout, and chunk replay protections.
6. Pay selection/allocation bounties solely from the entry's public work budget and implement pull refunds without
   loops.
7. Adversarially test underfunding, double enrollment, signature replay, zero-TWAB entries, withdrawals, bond-price
   drift, chunk replay, empty rounds, four-vault isolation, pause/emergency, and next-round concurrency.
8. Re-benchmark HCU, gas, storage, and bytecode after implementation. Keep `LeopoldVault` runtime at or below its frozen
   23,076-byte ceiling or move narrow noncustodial eligibility/bond bookkeeping to an immutable helper with explicit
   ACL.
9. Run the complete closure matrix and a new fresh-context review before generating replacement
   ABI/state-machine/frontend manifests and any deployment evidence.

## 16. Contract-freeze implications

The contract core is **not frozen** by this decision. The selected design changes ABI, round eligibility, aggregate
state, bond accounting, settlement rewards, events, transaction flows, tests, manifest, and state-machine documentation.
The current candidate freeze artifacts are useful baselines only and must be regenerated after implementation.

The independent A/B security and size fixes should be carried forward. No tree-spike Solidity should be carried forward.
Frontend implementation remains blocked until the bonded round-eligibility architecture is implemented, measured,
adversarially reviewed, and passes the pre-frontend closure gate.
