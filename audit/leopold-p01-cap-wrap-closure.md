# Leopold P-01 Confidential Pool-Cap Arithmetic Closure

## Scope and baseline

This report closes only Audit Pass 1 potential finding P-01: conditional `euint64` wraparound in the Leopold
principal-cap predicate. It is not a new general audit.

- Starting commit: `3fe21c54ea551d86e05f2f8963fecc9588937133`
- Audit Pass 1 report: `audit/leopold-core-security-audit-pass1.md`
- Preserved Audit Pass 1 SHA-256: `c8716fca9f0f2fd4f231069f630670e6771214575a3a94ae51993a67103672b7`
- P-01 final classification: `CONFIRMED_AND_CORRECTED`
- Final severity: **Medium, conditional**. Accounting impact is material if the input can be supplied, but the official
  Sepolia asset supply does not currently make the required high-width transfer economically/reachably available.

No deployment or public-chain transaction was performed.

## Original expression

The original deposit predicate in `LeopoldVault.onConfidentialTransferReceived` was:

```solidity
euint64 proposedTotal = FHE.add(_totalPrincipal, amount);
ebool withinCap = FHE.le(proposedTotal, MAX_POOL_BASE_UNITS);
```

The same add-before-cap structure appeared in winner auto-save allocation:

```solidity
ebool autoFits = FHE.le(FHE.add(_totalPrincipal, prize), MAX_POOL_BASE_UNITS);
```

`MAX_POOL_BASE_UNITS` is `1_000_000_000_000_000`.

## Verified arithmetic semantics

The pinned dependency is `@fhevm/solidity@0.11.1`. Its `FHE.add` overload for two `euint64` operands delegates directly
to `Impl.add`, which delegates to the FHEVM executor's `fheAdd`. There is no checked-overflow condition in that path.

The pinned OpenZeppelin confidential library independently confirms the semantics: `FHESafeMath.tryAdd` and
`tryIncrease` detect overflow by comparing the modular result with the prior value, and `saturatingAdd` explicitly
handles the overflow case. Those wrappers would be unnecessary if raw `FHE.add` were checked or reverting.

First-party Zama documentation likewise states that encrypted integer arithmetic is unchecked and wraps on overflow:

- <https://docs.zama.ai/fhevm/smart-contract/types>

Exact installed sources used:

- `node_modules/@fhevm/solidity/lib/FHE.sol`
- `node_modules/@fhevm/solidity/lib/Impl.sol`
- `node_modules/@openzeppelin/confidential-contracts/utils/FHESafeMath.sol`
- `node_modules/@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol`
- `node_modules/@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol`

Conclusion: `euint64` addition is modular modulo `2^64` under the pinned production semantics and the repository mock
runtime.

## Deterministic reproduction

A test-only asset callback was added to the existing mock asset. It verifies a caller-bound `externalEuint64`, grants
the vault transient access, and invokes the real production callback. It does not alter the production vault ABI or
production asset.

The exact vector was:

```text
current total principal = 10
amount                  = 2^64 - 10 + 1
                        = 18,446,744,073,709,551,607
mathematical sum        = 2^64 + 1
euint64 sum             = 1
pool cap                = 1,000,000,000,000,000
```

Before the correction, the invariant-oriented test failed deterministically:

```text
AssertionError: expected 1 to equal 10
0 passing
1 failing
```

The result proves that the old vault expression can observe a wrapped value below the cap while the mathematical sum is
above the cap. The runtime did not contradict the pinned arithmetic semantics.

The test-only callback bypasses the official wrapper's asset-balance path. It therefore proves the arithmetic defect at
the vault's declared callback input boundary, not present-day economic exploitability by an ordinary Sepolia user.

## Exploit preconditions and reachability

The official wrapper limits each confidential supply state to the `uint64` domain and transfers no more than the
sender's confidential balance. When all principal remains wrapped, that supply invariant prevents the specific sum from
crossing `2^64`.

However, the vault can unwrap confidential principal and deploy the resulting public USDC to Compound while
`_totalPrincipal` remains unchanged. That burns wrapper supply without reducing vault principal. A later wrapper balance
and the already-accounted deployed principal are therefore not necessarily bounded by one current confidential
total-supply value. The stronger precondition is availability and control of enough canonical underlying USDC to
construct the high-width transfer after principal has already been accounted/deployed.

At Audit Pass 1's read point, canonical Sepolia USDC total supply was below `2^64` base units, so the vector was
unreachable under current external supply and attacker-capital assumptions. That is an external, changeable condition
and is insufficient as a permanent contract invariant. P-01 is therefore not disproven.

## Correction

The cap is now checked before addition:

```solidity
euint64 remainingCapacity = FHE.sub(MAX_POOL_BASE_UNITS, _totalPrincipal);
ebool withinCap = FHE.le(amount, remainingCapacity);
```

Winner auto-save uses the equivalent predicate:

```solidity
ebool autoFits = FHE.le(prize, FHE.sub(MAX_POOL_BASE_UNITS, _totalPrincipal));
```

The positive-amount requirement remains unchanged. Principal widths, public ABI, round state machine, privacy
permissions, TWAB, randomness, settlement, and vault isolation are unchanged.

## Invariant proof

Required invariant:

```text
0 <= _totalPrincipal <= MAX_POOL_BASE_UNITS
```

The only writes to `_totalPrincipal` are:

1. Constructor initialization to zero.
2. Accepted deposit addition.
3. Withdrawal subtraction.
4. Accepted winner auto-save addition.

Induction:

- Initialization establishes the invariant.
- For deposits, `amount <= MAX_POOL_BASE_UNITS - _totalPrincipal` is required before `amount` is selected as
  `acceptedAmount`. Therefore the subsequent addition cannot overflow and cannot exceed the cap.
- For auto-save, `prize <= MAX_POOL_BASE_UNITS - _totalPrincipal` is required before any amount is selected as
  `autoSaved`. The same result follows.
- Withdrawal selects no more than the caller's principal and available liquid principal, then subtracts the amount from
  total principal. It cannot increase the total.
- Rejected and zero transfers select an accepted amount of zero.

The subtraction used to compute remaining capacity cannot underflow because its right operand is maintained at or below
the cap. Even the old add-before-cap code stored only a wrapped `proposedTotal` that had passed `<= cap`; therefore the
stored total invariant, as distinct from economic correctness, was already maintained. The correction does not create a
new subtraction-underflow state.

## Boundary regression

Permanent regression coverage is in `test/LeopoldVaultFoundation.ts`, supported by the test-only callback in
`contracts/mocks/MockLeopoldAsset.sol`.

Covered cases:

| Case                                     | Result                                                      |
| ---------------------------------------- | ----------------------------------------------------------- |
| Ordinary deposit of `10`                 | Accepted; principal becomes `10`                            |
| Exact remaining capacity `MAX_POOL - 10` | Accepted; principal becomes exact cap                       |
| Remaining capacity plus one              | Rejected and confidential assets refunded                   |
| High-width vector `2^64 - 10 + 1`        | Rejected; principal remains `10`                            |
| Zero amount                              | Rejected; principal and token balance unchanged             |
| Withdraw one at cap                      | Principal becomes `MAX_POOL - 1`                            |
| Deposit one after withdrawal             | Accepted; exact cap restored                                |
| Second unit after restored cap           | Rejected                                                    |
| Rejected transfer principal state        | Unchanged by direct decryption                              |
| Rejected transfer liquid/total state     | Full withdrawal followed by exact-cap re-deposit succeeds   |
| Rejected transfer eligible accounting    | Closed aggregate TWAB equals the independent expected value |

Focused foundation result:

```text
14 passing
```

The pre-fix high-width regression failed with actual principal `1`; the same test passes after the correction with
principal `10`.

## Validation results

| Gate                                                                  | Result                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Compile / TypeChain                                                   | Pass                                                                            |
| Solidity lint                                                         | Pass                                                                            |
| Repository TypeScript build                                           | Pass                                                                            |
| ESLint                                                                | Pass with 0 errors and 10 pre-existing unused-disable warnings                  |
| Focused FHE/vault/randomness/TWAB/settlement/strategy/reference suite | 108 passing                                                                     |
| Full contract suite                                                   | 563 passing, 1 Sepolia-only pending                                             |
| Bytecode validator                                                    | Pass                                                                            |
| Selector HCU evidence validator                                       | Pass; digest `a0118d72591f3cf227239a649b9284a3991991da04693278c45e68d7453cfe3c` |
| Compound evidence validator                                           | Pass; digest `e18adbf393983ae178978f9034a0130d9d683a1fd6bdc5f65b8dd6c32e68640d` |
| ABI comparison to frozen vault                                        | Equal                                                                           |
| Official frontend manifest SHA-256                                    | Preserved at `579da28f3fb61a5b4fe89174b1a1dda23b0af0baaf44743af33766d516683e9a` |
| Old contract-freeze runtime validator                                 | Expected fail: `LeopoldVault runtime length drift`                              |

The old freeze failure is required evidence of an intentional non-upgradeable production-bytecode change. The freeze
record must not be rewritten as though the currently deployed addresses already contain the corrected runtime.

The repository-wide Prettier check reports only the mandated byte-identical Audit Pass 1 report. That report was not
reformatted. All P-01 changed files and this closure report pass a targeted Prettier check.

## Bytecode impact

| Measurement            |       Before |        After |   Change |
| ---------------------- | -----------: | -----------: | -------: |
| `LeopoldVault` runtime | 23,539 bytes | 23,531 bytes | -8 bytes |
| EIP-170 headroom       |  1,037 bytes |  1,045 bytes | +8 bytes |
| Required headroom      |  1,024 bytes |  1,024 bytes |     Pass |

Corrected runtime SHA-256: `96020d75ea78c1adb8c80f56544e7ab381934f3563242946825fe343e3ddf301`.

## HCU impact

Using the pinned `@fhevm/mock-utils@0.4.2` operation table for `Uint64`:

- old predicate: non-scalar `FheAdd` 162,000 + scalar `FheLe` 119,000 = 281,000 HCU;
- corrected predicate: `TrivialEncrypt` 32 + non-scalar `FheSub` 162,000 + non-scalar `FheLe` 149,000 = 311,032 HCU;
- exact incremental cost: **30,032 HCU per cap predicate**.

The actual corrected production-vault four-participant settlement benchmark reported:

```text
selection:  13,089,448 total HCU; 2,786,064 depth HCU
allocation: 12,491,672 total HCU; 2,374,032 depth HCU
```

Both remain below the repository's 15,000,000 total and 3,750,000 depth safety thresholds. The correction changes one
arithmetic and one comparison form; it does not add a new settlement pass or loop.

## Deployment impact

The official vaults are non-upgradeable. Corrected production operation therefore requires new addresses.

| Component                                      | Replacement required | Reason                                                                                                              |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Four `LeopoldVault` deployments                | Yes                  | Corrected runtime is in the vault bytecode                                                                          |
| Four `LeopoldCompoundAdapter` deployments      | Yes                  | Each vault constructor creates its adapter; adapter `vault` is immutable and old adapters authorize only old vaults |
| Four `LeopoldSettlementBondEscrow` deployments | Yes                  | Each vault constructor creates its escrow; escrow `VAULT` is immutable and points to its creating vault             |
| `LeopoldVaultRegistry`                         | Yes                  | Constructor stores and validates exactly four vault addresses; no replacement setter exists                         |
| `LeopoldConfidentialUSDC`                      | No                   | Wrapper is not bound to one vault and its code is unchanged; corrected vaults can reuse it                          |
| Canonical USDC / Compound Comet                | No                   | External immutable dependencies are unchanged                                                                       |

No deployment was performed. Migration and user-state transition design are a separate release task and are not
implemented here.

### Direct official-address locations requiring update after deployment

- `config/leopold-frontend-contracts.json`
- `evidence/deployment/LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json`
- `docs/deployment/LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.md`
- `evidence/deployment/LEOPOLD_LIVE_BROWSER_E2E.json`
- `evidence/deployment/LEOPOLD_LIVE_E2E_CLOSURE.json`

### Freeze and digest consumers requiring refresh/revalidation

- `evidence/closure/LEOPOLD_CONTRACT_FREEZE.json`
- `docs/security/LEOPOLD_PRE_FRONTEND_CONTRACT_FREEZE.md`
- `docs/frontend/LEOPOLD_LIVE_BROWSER_E2E_REPORT.md`
- `docs/frontend/LEOPOLD_LIVE_E2E_CLOSURE_REPORT.md`
- `docs/auth/LEOPOLD_LIVE_AUTH_E2E_REPORT.md`
- `evidence/auth/LEOPOLD_LIVE_AUTH_E2E.json`
- `scripts/leopold-live-closure.ts`

These locations were identified only; none was updated in this closure because no corrected official deployment exists
yet.

## Final status

`P01_FINAL_CLASSIFICATION=CONFIRMED_AND_CORRECTED`

The old expression is demonstrably modular at the high-width boundary. The new expression enforces remaining capacity
before addition, preserves the maintained total-principal invariant, adds no subtraction-underflow state, keeps the ABI
and state machine unchanged, improves EIP-170 headroom, and passes the full contract suite. Corrected production use
requires redeployment of the four vault families and registry, but not `LeopoldConfidentialUSDC`.
