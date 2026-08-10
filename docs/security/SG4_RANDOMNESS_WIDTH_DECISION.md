# SG-4 permanent randomness width decision

This record is subordinate to the locked SG-4 authority binding. It does not change the SG-4 authority source, price
schedule, provenance, or binding. The live sample records are in `evidence/sg4/SG4_RANDOMNESS_BENCHMARK.json` and are
validated by `scripts/validate-sg4-randomness-evidence.ts`.

## Benchmark scope

The runner consumes only the three primitive RNG rows already present in `sg4-benchmark-protocol/v2`, in the protocol's
order: `RNG_64`, `RNG_128`, and `RNG_256`. Each row uses the existing `SG4FheBenchmarkHarness` method, with two window-1
warm-ups and ten measured samples across three windows. The resulting subset is 36 transactions: 30 measured and 6
warm-up. Deployment and any setup transaction are excluded from measured samples.

Each measured method performs exactly one priced randomness operation, stores the ciphertext, and calls `FHE.allowThis`
for contract-internal continued use. There is no decryption, public-decryption authorization, caller ACL, admin ACL,
keeper ACL, seed parameter, bounded-randomness substitution, or winner-selection logic.

The live evidence passed on Sepolia chain `11155111`: harness deployment transaction
`0xc531559db233eeb133645a7e40981ed3a833b2a0af1ce3e8622de6e1d95c5fe6`, deployment block `11459404`, harness
`0x0931553a972344F078E8c3768247E342c866D842`, and evidence SHA-256
`b7d55b6a7947ef961ef87942bfefe23d331df21e94835f3a0a6cd7917a4bf8f4`. All 36 transactions succeeded, all 36 were
unique, and the independent receipt replay also passed. Window ranges were `11459405–11459423`, `11459444–11459452`,
and `11459474–11459482`.

The authenticated schedule predicts these totals:

| Method   | Priced operation | Result     | Predicted total HCU | Predicted depth HCU |
| -------- | ---------------- | ---------- | ------------------: | ------------------: |
| `rng64`  | `FheRand`        | `euint64`  |              24,000 |              24,000 |
| `rng128` | `FheRand`        | `euint128` |              25,000 |              25,000 |
| `rng256` | `FheRand`        | `euint256` |              30,000 |              30,000 |

`FHE.allowThis` is ACL bookkeeping, not an additional priced coprocessor operation. Every receipt must contain exactly
one `FheRand` event and no other priced event. Both HCU controls are assessed independently against the locked strict
safety thresholds of 15,000,000 total HCU and 3,750,000 depth HCU.

## Exact TWAB envelope

The supported production envelope is six-decimal cUSDT, a one-billion-whole-token pool, exact one-second accounting, and
a 365-day round:

```text
MAX_POOL_BASE_UNITS = 1,000,000,000 * 1,000,000
                    = 1,000,000,000,000,000
MAX_ROUND_SECONDS   = 365 * 24 * 60 * 60
                    = 31,536,000
MAX_AGGREGATE_TWAB  = MAX_POOL_BASE_UNITS * MAX_ROUND_SECONDS
                    = 31,536,000,000,000,000,000,000
```

The bound is independent of participant count because the instantaneous sum of balances is capped by the pool ceiling. A
single participant may hold the complete pool. The aggregate and every non-negative cumulative prefix therefore require
75 bits. The accepted ticket is in `[0, MAX_AGGREGATE_TWAB - 1]` and also requires 75 bits.

Balances may remain `euint64` because the 50-bit base-unit pool bound fits. The balance must be widened to `euint128`
before multiplication by elapsed time; multiplying in `euint64` first is forbidden. Per-user TWAB, aggregate TWAB,
prefix weight, random candidate, and accepted ticket are `euint128`.

## Random-ticket domain and modulo bias

For a draw total `T`, where `1 <= T <= MAX_AGGREGATE_TWAB`, the production candidate is uniform over `[0, 2^128 - 1]`.
Direct `R % T` is not accepted because it is biased whenever `T` does not divide `2^128`.

The unbiased encrypted construction is:

```text
N = 2^128
q = floor(N / T)
L = q * T
VALID = (R < L)
ACCEPTED_TICKET = R mod T, only after VALID is confirmed true
```

The accepted set has exactly `q` representatives for every ticket, so conditional on acceptance every ticket has
probability `1/T`. `N`, `q`, and `L` are computed in public `uint256` arithmetic. For non-divisors, `L <= N - 1` before
conversion to the `uint128` comparison scalar. If `T` divides `N`, `L = N` is not representable in `uint128`; validity
is set true without comparing to `L`, and the encrypted remainder is then computed. `T=0` is a no-draw case and `T=1` is
an encrypted-zero case.

At the maximum supported total:

```text
q = 10,790,283,070,806,014
L = 340,282,366,920,938,457,504,000,000,000,000,000,000
rejected candidates = 5,959,374,607,431,768,211,456
```

The guaranteed acceptance lower bound used by the domain proof is `(2^128 - MAX_AGGREGATE_TWAB + 1) / 2^128`, which is
strictly greater than one-half; expected attempts are therefore bounded above by its reciprocal. Rejection is an
encrypted validity decision, not an invitation for a caller, keeper, admin, or participant to sample until satisfied.

## Width safety table

| Width      |                                                   Domain capacity | HCU result | TWAB safe?                                  | Random-domain safe?                                                                                        | Verdict                        |
| ---------- | ----------------------------------------------------------------: | ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `euint64`  |                           `2^64 - 1 = 18,446,744,073,709,551,615` | 24,000 HCU | No; 64 bits cannot hold the 75-bit envelope | No; cannot represent the required ticket domain                                                            | **UNSAFE**                     |
| `euint128` | `2^128 - 1 = 340,282,366,920,938,463,463,374,607,431,768,211,455` | 25,000 HCU | Yes; 53 bits of capacity headroom           | Yes; installed `lt`/`rem` path supports rejection sampling                                                 | **SAFE**                       |
| `euint256` |                                                       `2^256 - 1` | 30,000 HCU | Yes                                         | No in the pinned API; `rand` exists but required ordered comparison and public-scalar remainder are absent | **UNSAFE for production flow** |

The smallest safe width is `euint128`. Benchmark cost cannot override the exact domain proof, and `euint256` is not a
valid production substitute while the pinned API lacks the complete encrypted rejection-sampling operation set.

## Retry-attack constraints

The production draw must maintain one active candidate and one accepted ticket. A candidate may be replaced only after
an objectively false encrypted-validity result. Once validity is confirmed, the accepted ticket is immutable. No
external caller controls a seed or reroll; failed transactions cannot be used as a favorable-result oracle; and the
encrypted ticket is never decryptable by a human. Full winner-selection implementation is intentionally outside this
record.

## Decision

The live evidence validator and independent receipt replay passed, and all measured samples passed both HCU controls. The
locked production width is **`euint128`**. This record does not authorize wiring the width into a prize-pool contract,
implementing winner traversal, implementing settlement, or starting SG-5.
