# SG-3 Weight-Domain Analysis

## Executive decision

The minimum production envelope is locked as the supported maximum for this decision:

- cUSDT has exactly 6 decimals (`TOKEN_SCALE = 1,000,000`);
- the pool ceiling is 1,000,000,000 whole cUSDT, or 1,000,000,000,000,000 base units;
- round duration is at most 365 days, or 31,536,000 exact seconds;
- timestamps retain one-second precision;
- one participant may hold the complete pool; and
- no participant-count bound, rounding, scaling, or time compression is used.

The resulting maximum per-user and aggregate round TWAB is 31,536,000,000,000,000,000,000 base-unit-seconds and requires
75 bits. The mathematical production decision is:

| Domain value                       | Minimum safe encrypted type |
| ---------------------------------- | --------------------------- |
| User balance                       | `euint64`                   |
| Weighted delta                     | `euint128`                  |
| Per-user cumulative TWAB           | `euint128`                  |
| Aggregate round TWAB               | `euint128`                  |
| Cumulative winner-selection prefix | `euint128`                  |
| Random candidate                   | `euint128`                  |
| Accepted ticket                    | `euint128`                  |

An encrypted balance **must be widened from `euint64` to `euint128` before multiplication**. An `euint64` TWAB,
aggregate, prefix, candidate, or ticket is mathematically unsafe. SG-4 performance measurements cannot override this
decision.

## Repository commitments inspected

The requested `00_SCOPE_REGISTER.md`, `CP0_INDEPENDENT_REVIEW.md`, `03_RANDOMNESS_ARCHITECTURE_LOCK.md`, and
`01_SUCCESS_AND_RELEASE_CRITERIA.md` files are absent from the authoritative committed tree. A complete Markdown-file
search found only the template README, the temporary SG-1 template-probe note, the evidence standard, the keeper
credential policy, and the evidence registries. None states a stronger pool or duration ceiling.

Accordingly, the previously unspecified maximums are resolved by locking the supplied minimum safety envelope as the
SG-3 supported maximum. Any larger pool or longer round reopens SG-3 before implementation.

Existing terminology and commitments preserved here are:

- the application is a confidential prize-savings application;
- SG-1 and SG-2 code is temporary capability-gate code, not production protocol architecture;
- user balance and per-user TWAB are confidential;
- aggregate TWAB becomes publicly decryptable only at the permitted draw stage;
- only rejection validity may additionally be publicly decrypted for winner selection; and
- candidates and accepted tickets remain encrypted.

## Locked quantities and formulas

All calculations are integer calculations.

```text
TOKEN_DECIMALS = 6
TOKEN_SCALE = 10^6 = 1,000,000
MAX_POOL_WHOLE_TOKENS = 1,000,000,000
MAX_POOL_BASE_UNITS = MAX_POOL_WHOLE_TOKENS * TOKEN_SCALE
                    = 1,000,000,000,000,000

TIME_GRANULARITY_SECONDS = 1
MAX_ROUND_DURATION_DAYS = 365
MAX_ROUND_DURATION_SECONDS = 365 * 24 * 60 * 60
                           = 31,536,000

MAX_USER_BALANCE_BASE_UNITS = MAX_POOL_BASE_UNITS
MAX_USER_TWAB = MAX_USER_BALANCE_BASE_UNITS * MAX_ROUND_DURATION_SECONDS
              = 31,536,000,000,000,000,000,000

MAX_AGGREGATE_TWAB = MAX_POOL_BASE_UNITS * MAX_ROUND_DURATION_SECONDS
                   = 31,536,000,000,000,000,000,000

requiredBits(x) = smallest w such that x <= 2^w - 1
```

## Full calculation table

| Quantity                              |                    Exact value | Required bits |
| ------------------------------------- | -----------------------------: | ------------: |
| Token scale                           |                      1,000,000 |            20 |
| Maximum whole-token pool              |                  1,000,000,000 |            30 |
| Maximum pool base units               |          1,000,000,000,000,000 |            50 |
| Maximum elapsed seconds               |                     31,536,000 |            25 |
| Maximum balance-times-elapsed product | 31,536,000,000,000,000,000,000 |            75 |
| Maximum user cumulative TWAB          | 31,536,000,000,000,000,000,000 |            75 |
| Maximum aggregate TWAB                | 31,536,000,000,000,000,000,000 |            75 |
| Maximum prefix weight                 | 31,536,000,000,000,000,000,000 |            75 |
| Maximum accepted ticket               | 31,535,999,999,999,999,999,999 |            75 |

The elapsed-time product requires at most `50 + 25 = 75` bits, and its exact maximum also requires 75 bits. The
production multiplication operand and result are therefore `euint128`.

## Type-width decision matrix

Capacity margin is `maximum representable - MAX_AGGREGATE_TWAB`; a negative value is a deficit. Headroom bits are
`width - 75`.

| Width |                                                                                   Maximum representable |                                                                                         Capacity margin | Headroom bits |                                                 Maximum whole-token pool for 365 days |                                            Maximum seconds for 1-billion-token pool | Mathematical verdict |
| ----: | ------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------------------------------: | ------------: | ------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------: | -------------------- |
|    64 |                                                                              18,446,744,073,709,551,615 |                                                                         -31,517,553,255,926,290,448,385 |           -11 |                                                                               584,942 |                                                                              18,446 | **NO-GO**            |
|   128 |                                                     340,282,366,920,938,463,463,374,607,431,768,211,455 |                                                     340,282,366,920,938,431,927,374,607,431,768,211,455 |            53 |                                                    10,790,283,070,806,014,188,970,529 |                                                     340,282,366,920,938,463,463,374 | **GO**               |
|   256 | 115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,039,457,584,007,913,129,639,935 | 115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,007,921,584,007,913,129,639,935 |           181 | 3,671,743,063,080,802,746,815,416,825,491,118,336,290,905,145,409,708,398,004,109,081 | 115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,039,457,584 | **GO**               |

`euint64` safely stores the balance itself: its balance-only spare capacity is 18,445,744,073,709,551,615 base units. It
does not safely store any full-envelope time-weighted value.

`euint128` is the smallest available encrypted width that contains every complete TWAB and ticket domain. `euint256` is
mathematically safe but is not the production choice because it is wider than necessary and, in the installed API, lacks
required operations described below.

## Installed FHEVM API findings

Inspection was against local `@fhevm/solidity` 0.11.1 and `@fhevm/hardhat-plugin` 0.4.2 sources; no network source was
used.

- Public encrypted integer wrappers include `euint8`, `euint16`, `euint32`, `euint64`, `euint128`, and `euint256`.
- `FHE.randEuint64()`, `FHE.randEuint128()`, and `FHE.randEuint256()` exist.
- `FHE.asEuint128(euint64)` performs the required widening cast.
- `FHE.mul(euint128,uint128)` returns `euint128`.
- `FHE.lt(euint128,uint128)` returns `ebool`.
- `FHE.rem(euint128,uint128)` returns `euint128` and is the installed public-divisor remainder operation.
- Same-width and mixed-width multiplication return the declared operand/result width; multiplication does not
  automatically allocate the mathematical product width.
- Narrowing casts are present but are forbidden in this flow.
- The installed `FHE.sol` has `randEuint256()` and equality/bitwise operations for `euint256`, but no `euint256` ordered
  comparison, multiplication, or public-scalar remainder overloads. An end-to-end `euint256` rejection sampler is
  therefore blocked with this installed Solidity API and must not be invented.

The installed wrapper does not expose a checked-overflow result or an automatic checked widening operation. SG-3 does
not rely on whether the host wraps or reverts out-of-domain arithmetic: reaching an overflow is prohibited by prior
domain checks and by widening before multiplication. Product and accumulation stay strictly within `euint128`.

## Overflow and underflow proofs

### Balance storage

`MAX_POOL_BASE_UNITS = 10^15 < 2^64 - 1`, so one user holding the full pool fits in `euint64`. Every deposit must
enforce both the per-user balance bound and the public/enforced aggregate pool ceiling before mutation.

### Elapsed time

The state transition requires `effectiveTime >= lastUpdate` before subtraction. Both timestamps are exact public
seconds. Thus `elapsed = effectiveTime - lastUpdate` cannot underflow. `elapsed <= 31,536,000 < 2^25`, so it also fits
in `uint64` and converts exactly to `uint128` for the scalar multiplication overload.

### Weighted multiplication

The implementation must execute conceptually:

```text
wideBalance = FHE.asEuint128(balance)
weightedDelta = FHE.mul(wideBalance, uint128(elapsed))
```

The maximum product is the 75-bit `MAX_USER_TWAB`, below `2^128 - 1`. Multiplying in `euint64` first and widening the
result is forbidden because the overflow would already have occurred.

### User accumulation

Each user's elapsed intervals are non-overlapping because `lastUpdate` advances monotonically. Their total length is at
most the round duration and their balance never exceeds the pool. Therefore:

```text
sum(balance_i * elapsed_i) <= MAX_USER_BALANCE_BASE_UNITS * MAX_ROUND_DURATION_SECONDS
```

The cumulative sum is at most `MAX_USER_TWAB` and fits in `euint128`.

### Aggregate and prefix accumulation

At every instant, the sum of all participant balances is at most `MAX_POOL_BASE_UNITS`. Consequently:

```text
sum(user TWAB)
= integral(sum(user balances)) dt
<= MAX_POOL_BASE_UNITS * MAX_ROUND_DURATION_SECONDS
= MAX_AGGREGATE_TWAB
```

This proof does not use a participant-count limit. A single full-pool participant reaches the same bound. Any prefix of
non-negative user weights is at most the aggregate, so cumulative winner-selection prefixes also fit in `euint128`.

## Exact TWAB transition

For every deposit, withdrawal, checkpoint, or close:

1. `effectiveTime = min(currentTimestamp, roundEnd)`;
2. require `effectiveTime >= lastUpdate`;
3. `elapsed = effectiveTime - lastUpdate`;
4. `weightedDelta = widen(balance to euint128) * uint128(elapsed)`;
5. `cumulativeTwab += weightedDelta`;
6. `lastUpdate = effectiveTime`;
7. only then mutate balance.

Consequences:

- a deposit at round start adds zero historical weight and earns from that exact timestamp forward;
- a deposit immediately before close earns for exactly the remaining seconds;
- a withdrawal first accrues the old balance, then the reduced balance applies immediately to future seconds;
- partial and full withdrawals follow the same sequence;
- multiple interactions at the same timestamp have `elapsed = 0` and deterministic zero additional weight;
- zero balances add zero weight;
- after close, `effectiveTime` is always `roundEnd`, so subsequent calls add zero to the closed-round value; and
- closed-round TWAB must be snapshotted/frozen before any next-round balance handling.

## Unbiased encrypted rejection sampling

Let the publicly decrypted draw-stage aggregate be `T`, where `1 <= T <= MAX_AGGREGATE_TWAB`. Let `R` be uniformly
sampled by `FHE.randEuint128()` over `[0, 2^128 - 1]`.

```text
DOMAIN_SIZE = N = 2^128
q = floor(N / T)
REJECTION_LIMIT = L = q * T
VALID = R < L
ACCEPTED_TICKET = R mod T
```

`N`, `q`, and `L` are public draw-stage bound calculations. They must be calculated in `uint256`, because `N = 2^128` is
not representable in `uint128`. For non-divisors of `N`, `L <= 2^128 - 1`; check this before converting `L` to the
public `uint128` scalar used by `FHE.lt`. `T` is checked non-zero and at most `MAX_AGGREGATE_TWAB` before converting it
to the public scalar used by `FHE.rem`.

### Uniformity proof

The accepted candidate set is `[0, qT - 1]`, containing exactly `qT` values. For each ticket `x in [0, T - 1]`, the
accepted candidates `x, x+T, ..., x+(q-1)T` are exactly `q` distinct values. Therefore each ticket has probability
`q/(qT) = 1/T` conditional on acceptance. Direct modulo without the `R < L` rejection is forbidden.

### Boundary handling

- `T = 0`: no draw, no random candidate, and no modulo operation.
- `T = 1`: every candidate is valid and the accepted encrypted ticket is deterministically encrypted zero.
- If `T` divides `N`, `L = N` lies outside the candidate width. All candidates are valid; set encrypted `VALID` to
  encrypted true and compute the remainder. The `T = 1` specialization avoids unnecessary modulo.
- If `T` does not divide `N`, `L <= N - 1` and is safely represented as the comparison scalar.
- At the full `uint128` total boundary `T = N - 1`, `L = N - 1`; only candidate `N - 1` is invalid.
- At the permitted maximum `T = 31,536,000,000,000,000,000,000`:
  - `q = 10,790,283,070,806,014`;
  - `L = 340,282,366,920,938,457,504,000,000,000,000,000,000`;
  - rejected candidates = 5,959,374,607,431,768,211,456;
  - exact acceptance probability is `L / 2^128`; and
  - exact expected attempts are `2^128 / L`.

For every permitted `T`, the remainder `N mod T <= T - 1 <= MAX_AGGREGATE_TWAB - 1`. Hence the exact universal guarantee
is:

```text
acceptance probability >=
(N - MAX_AGGREGATE_TWAB + 1) / N
= 340,282,366,920,938,431,927,374,607,431,768,211,457
  / 340,282,366,920,938,463,463,374,607,431,768,211,456
> 1/2

expected attempts <=
N / (N - MAX_AGGREGATE_TWAB + 1)
```

The candidate and accepted ticket remain encrypted forever. Only `T` at the permitted draw stage and encrypted `VALID`
may be publicly decrypted. A true `VALID` result permanently binds the candidate and ticket; it cannot be rerolled. A
false `VALID` result permits exactly one replacement candidate, after the invalidity is proven.

## Confidentiality classification

| Value                                                 | Classification           |
| ----------------------------------------------------- | ------------------------ |
| Public timestamps, round start/end, elapsed           | Public, exact seconds    |
| Per-user balance                                      | Confidential             |
| Weighted delta and per-user TWAB                      | Confidential             |
| Aggregate TWAB before permitted draw                  | Confidential             |
| Aggregate TWAB at permitted draw                      | Publicly decryptable     |
| Uniform random candidate                              | Confidential forever     |
| Rejection limit and public aggregate bound arithmetic | Public at permitted draw |
| Rejection validity                                    | Publicly decryptable     |
| Accepted ticket                                       | Confidential forever     |
| Prefix weights and winner comparison                  | Confidential             |

## Trust assumptions and implementation hazards

Trust assumptions:

- the token enforces 6 decimals and amounts are represented in base units;
- the pool ceiling is enforced before every balance increase;
- the round-end timestamp is immutable after the round starts;
- aggregate TWAB public decryption is authorization-gated to the permitted draw stage;
- the FHE random primitive is uniform over its declared width; and
- ciphertext ACLs preserve the stated confidentiality classes.

Hazards that must fail review:

- multiplying before widening;
- storing a 75-bit value in `euint64`;
- unchecked narrowing casts;
- subtracting timestamps before checking order;
- mutating balance before accrual;
- accruing beyond `roundEnd`;
- summing user maxima without using the pool-integral invariant;
- computing `2^128` or `q*T` in `uint128`;
- direct modulo without rejection;
- modulo when `T = 0`;
- decrypting the candidate or accepted ticket;
- rerolling a valid candidate; or
- inventing unavailable `euint256` comparison/remainder APIs.

## Test-to-invariant map

`test/SG3WeightDomain.ts` covers:

- scaling, granularity, pool, duration, exact TWAB, and bit boundaries;
- `euint64`, `euint128`, and `euint256` mathematical decisions and margins;
- widening and maximum/one-over-limit behavior;
- deposits, partial/full withdrawals, same-timestamp interactions, closing, and post-close immutability;
- full-pool single-user and participant-independent aggregate/prefix proofs;
- zero, one, near-power-of-two, maximum-permitted, and full-width total boundaries;
- exhaustive uniformity for every non-zero total in a synthetic 4-bit domain;
- exact production rejection-limit, acceptance, expected-attempt, and ticket-range properties;
- deterministic JSON and decimal-string serialization; and
- local installed-API signatures plus offline/no-mutation source constraints.

## SG-4 dependencies

SG-4 must benchmark `euint64`, `euint128`, and `euint256` where the installed API permits the compared operation. It
must benchmark the complete mathematically required `euint128` production path, including cast, multiplication,
accumulation, random generation, comparison, and remainder. It must separately report that installed 0.11.1 cannot
express the same `euint256` comparison/remainder path; a random-generation-only measurement is not an equivalent
end-to-end benchmark.

Performance cannot make `euint64` mathematically safe. If the `euint128` path fails SG-4 performance or HCU limits, the
outcome is NO-GO unless an explicit approved reduction of the product envelope reopens and reruns SG-3.

## Reopen conditions

SG-3 must be reopened if any of the following changes:

- pool ceiling above 1,000,000,000 whole cUSDT;
- round duration above 365 days;
- token decimals or unit semantics;
- exact one-second timestamp resolution;
- a participant may exceed the pool ceiling;
- aggregate or prefix semantics cease to be bounded by the pool-time integral;
- the ticket domain exceeds aggregate TWAB;
- public-decryption classifications or reroll rules change;
- FHE integer, casting, random, comparison, remainder, or overflow semantics change; or
- SG-4 cannot run the required `euint128` production path within approved limits.
