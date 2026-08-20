# Leopold Core Protocol / FHE / Deployment Security Audit — Pass 1

## 1. Executive summary

This is an independent, read-only, adversarial review of the frozen Leopold
protocol core. It is not an OpenZeppelin audit and must not be represented as
one. The review covered the current repository at commit
`3fe21c54ea551d86e05f2f8963fecc9588937133`, the pinned installed dependencies,
the checked-in deployment evidence, and read-only Sepolia calls. No contract,
frontend, test, dependency, deployment, or chain state was modified.

No confirmed Critical, High, Medium, or Low exploitable finding was established.
One conditional potential finding is ready for triage: raw encrypted `euint64`
addition is used before the pool-cap comparison in deposit acceptance and
auto-save allocation. Zama's pinned FHE arithmetic is modular, so a supported
input near the `uint64` boundary can wrap before the comparison. The currently
deployed canonical Sepolia USDC supply is below the single-asset amount needed
to reach the deposit wrap threshold, so this was not classified as a currently
reachable deployed exploit. The mechanism should nevertheless be hardened or
formally bounded before the contract freeze is reopened.

The principal security properties that were directly supported by source,
tests, deployment evidence, and installed Zama/OZ implementations are:

- principal, realized yield, sponsorship, rollover, prize reserve, winnings,
  and settlement bond accounting are separate in the contract model;
- no admin/keeper/frontend path can select a winner, reroll accepted
  randomness, or decrypt private protocol state;
- the accepted random ticket remains encrypted and is not emitted;
- winner identity is not emitted or publicly decrypted;
- exact TWAB is stored per vault and closed-round snapshots are immutable;
- four official vaults use independent escrow, adapter, round, and TWAB state;
- settlement is permissionless, round-scoped, two-pass, bounded by the
  registered snapshot, resumable, and replay-guarded;
- current official Sepolia addresses, registry membership, asset, Comet,
  adapter, escrow, duration, and read-only integrity checks matched the
  checked-in manifest.

The final disposition is:

**CORE AUDIT PASS 1 COMPLETE — FINDINGS READY FOR TRIAGE**

## 2. Scope

### Exact audited commit

`3fe21c54ea551d86e05f2f8963fecc9588937133`

Commit subject: `fix(auth): bind wallet uniqueness to verified ownership`.

The production Solidity contract tree is unchanged from the frozen contract
source commit referenced by the official deployment evidence. The current HEAD
contains the frontend authentication change, but no production protocol-core
diff relative to that freeze was found.

### Production source

- `contracts/LeopoldVault.sol`
- `contracts/LeopoldConfidentialUSDC.sol`
- `contracts/LeopoldSettlementBondEscrow.sol`
- `contracts/LeopoldVaultRegistry.sol`
- `contracts/LeopoldCompoundAdapter.sol`
- `contracts/interfaces/ICompoundComet.sol`
- `contracts/interfaces/ILeopoldYieldAdapter.sol`

Non-production contracts were inventoried but not treated as deployed
production trust boundaries: `contracts/mocks/`, `contracts/benchmarks/`,
`contracts/spikes/`, `contracts/FHECounter.sol`, `contracts/SG2PublicDecrypt.sol`,
and `contracts/SG5BrowserProbe.sol`.

### Deployment and evidence source

- `evidence/deployment/LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json`
- `config/leopold-frontend-contracts.json`
- `docs/deployment/LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.md`
- `evidence/closure/LEOPOLD_CONTRACT_FREEZE.json`
- `evidence/cp1/LEOPOLD_COMPOUND_LIVE.json`
- `scripts/validate-leopold-bytecode.cjs`
- `scripts/validate-leopold-contract-freeze.cjs`
- `scripts/validate-leopold-compound-evidence.ts`
- `scripts/validate-leopold-selector-hcu-evidence.ts`

### Methodology

The review used source and line-level searches, direct inspection of pinned
dependency source, Solidity tests and reference models, static validation
scripts, TypeScript/frontend checks, and read-only JSON-RPC calls to Sepolia.
No signer, transaction, deployment, configuration mutation, or broadcast was
used. The RPC calls were limited to chain ID, bytecode, view calls, and static
configuration/integrity reads.

## 3. Trust assumptions and limitations

The audit assumes the intended official asset and deployed addresses are the
ones in the checked-in official manifest. Circle USDC, Compound III governance,
the FHEVM host/coprocessor, the relayer/public decryption service, and the
Ethereum consensus/proposer set remain external trust boundaries. A pause,
blacklist, market-liquidity failure, or governance change in those systems can
make an otherwise-correct withdrawal or strategy operation unavailable.

The tests use local FHE mocks and cannot by themselves prove production
coprocessor behavior, production ZK input proofs, gas/HCU capacity at every
possible participant count, or malicious behavior by every external token and
protocol. Those limitations are listed as coverage gaps below.

## 4. Architecture and trust-boundary inventory

| Component | Role | Important trust boundary |
|---|---|---|
| `LeopoldVault` | Four-vault principal, TWAB, round, encrypted prize, selection, allocation, and settlement orchestration | FHEVM host, confidential token, adapter, escrow |
| `LeopoldConfidentialUSDC` | ERC-7984 confidential wrapper over canonical USDC | OpenZeppelin confidential token implementation and canonical USDC |
| `LeopoldCompoundAdapter` | Compound III/Comet supply, withdraw, harvest, pause, and emergency exit | Comet governance, Comet liquidity, canonical USDC |
| `LeopoldSettlementBondEscrow` | Round-scoped registration bonds, settlement progress credit, refunds, and incentives | ETH receiver behavior and vault-only progress/finalization |
| `LeopoldVaultRegistry` | Official-vault discovery and active flag | Owner can change discovery status, not vault economics or custody |
| FHEVM host contracts | Encrypted handle storage, ACL, input proof, public decryption proof verification | Protocol dependency; not Leopold-controlled |
| Compound III Comet | External yield market | Compound governance/pause/reserve/accounting |
| Circle USDC | Official public settlement asset | Issuer pause/blacklist/transfer semantics |
| frontend/keeper | User interaction and off-chain orchestration | Not treated as a security boundary |

No proxy, upgrade hook, `delegatecall`, `selfdestruct`, arbitrary target call,
generic rescue/sweep, or debug/test state-changing path was found in the
production Leopold contracts.

## 5. Asset inventory and deployment inventory

### Value buckets

The source separates these buckets:

- `P`: encrypted user principal and the corresponding public liquidity/basis
  accounting;
- `Y`: realized adapter surplus harvested into the prize side;
- `S`: explicit sponsor contributions;
- `R`: rollover of a closed round's remaining prize reserve;
- `B`: round-scoped ETH bond custody in the escrow;
- `W`: encrypted winnings or auto-saved prize principal;
- `I`: settlement progress incentives and bond refunds.

Prize reserve is sourced from realized yield, sponsor contributions, and
rollover. The source does not use encrypted principal as prize money. Adapter
deployment uses a liquidity buffer and tracks expected principal/basis; harvest
only accepts an externally reported surplus after the adapter's principal
accounting has been checked.

### Official Sepolia addresses

Network: Sepolia, chain ID `11155111`.

| Component | Address |
|---|---|
| Canonical USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Compound III Comet | `0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e` |
| `lcUSDC` | `0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8` |
| Registry | `0x08560A59A28B9e3b7F5fe7C3cce17ddD9F115530` |
| Daily escrow / adapter / vault | `0x3c80D1Db7718c787BCfb9be6A16dB4b4AdcB5755` / `0x99dAdA9526A58f3BDdd44171441980e3A61E4c2F` / `0xa84C40BBeD3010D0D4CD44465920d5156fa5E6c4` |
| Weekly escrow / adapter / vault | `0xfa8718a6a238749c35eE9D2daBFF87E65253fd10` / `0xE88712Affce2CDe86dEBcb78A6bd985c4ad5A3aA` / `0xf3c842CdF26E960b63B67e392136D6B0D3ab2244` |
| Monthly escrow / adapter / vault | `0x21088B76dD21AF354E74f0e9848346b7780D70db` / `0x7d457e52195c4ab18f3Fc1Bc5b3B908D035fC996` / `0x1136D6c399d09Fa66474582DE6E4941bA3303ad6` |
| Boost escrow / adapter / vault | `0x6E78CA9E693c4ad73c40AA967aab25C3Fd772c9a` / `0x0dB787ae292C880ABBB6F733ad3d4d5A7098ECf1` / `0x98D971557843CE17dc1387d2256Ab3dbAaC204f9` |

The user-supplied `lcUSDC` string omitted the final `8`; the checked-in
manifest and live calls use the 42-character address ending in `...b6e8`.

## 6. Privilege and external-call matrix

The following matrix covers every production state-changing entry point. “Open”
means any EOA or contract can call it, subject to state and input checks.

| Method(s) | Caller policy | Assets at risk | Encrypted state at risk | Replay protection | External calls |
|---|---|---|---|---|---|
| `LeopoldVault.acceptBondRegistration` | Escrow only; active open round | No principal transfer; bond remains escrow-owned | Eligibility and TWAB | One registration per account/round | Escrow callback/state |
| `onConfidentialTransferReceived` | Confidential asset only, callback | Confidential principal; rejected amount is refunded atomically by ERC-7984 wrapper | Principal, liquid principal, TWAB | Token callback and accepted amount are per transfer | FHE transient ACL; wrapper callback |
| `withdraw` | Open, but caller-bound encrypted input and caller balance | Principal | Caller principal, eligible balance, TWAB | Input proof and balance check; state updates after transfer; `nonReentrant` | Confidential transfer |
| `contributeSponsor` | Open; canonical underlying allowance and round bounds | Sponsor USDC only | Sponsor/prize/liquid accounting | Round and cap checks; `nonReentrant` | `transferFrom`, wrap |
| `openStrategyEpoch`, `requestStrategyAmount`, cancel methods | Open with age/epoch/state checks | No direct value in open/request; pending strategy state | Strategy encrypted accounting | Epoch IDs, age, and phase | None or adapter view |
| `finalizeStrategyDeployment`, `finalizeStrategyReplenishment` | Open with authenticated public result/proof | Public USDC and strategy basis | Strategy transition/deployed state | Pending epoch, result proof, phase | Wrapper finalize, adapter |
| `harvestStrategyYield` | Open; epoch/adapter checks | Realized strategy surplus | Prize reserve and yield accounting | Adapter basis and harvest state; `nonReentrant` | Adapter, wrapper |
| `setStrategyPaused` | Guardian only | Strategy availability, not custody | Strategy phase only | Pause state | Adapter pause |
| `emergencyUnwindStrategy` | Open only while adapter paused | Strategy public assets | Principal/recovered/shortfall accounting | Pause and active epoch checks; `nonReentrant` | Adapter emergency exit, wrapper |
| `closeRound` | Open after exact close time | Prize reserve transition; no caller reward | Round aggregate/prize snapshot | Round phase/closed flag | FHE public decrypt request |
| `finalizeAggregate` | Open with authenticated public proof | No direct asset movement | Aggregate public value | Pending decrypt/round phase | FHE proof verification |
| `generateRandomCandidate` | Open after closed aggregate | No direct asset movement | One candidate per round | Candidate phase and no prior candidate | `FHE.randEuint128()` |
| `finalizeCandidateValidity` | Open with public validity proof | No direct asset movement | Candidate validity/ticket | Candidate phase and proof | FHE public decrypt proof |
| `processSelection`, `finalizeSelectionReconciliation` | Open, bounded participant chunks | No direct asset movement until allocation | Encrypted winner predicate/count/weight | Cursor, pass, and reconciliation state | FHE comparisons/aggregates, proof |
| `processAllocation` | Open, bounded participant chunks | Prize reserve and winning/auto-save entitlement | Principal, winnings, prize reserve, TWAB | Allocation cursor and selected winner state | FHE selects; confidential token for auto-save |
| `finalizeSettlement`, `recoverFailedReconciliation`, `settleEmptyRound` | Open with complete/empty/failure phase | Escrow credit/refund state | No winner selection mutation | Finalized flag and phase | Escrow |
| `withdrawWinnings` | Caller-bound entitlement and encrypted amount | Winnings only | Caller winnings/liquid winnings | Balance check, update, `nonReentrant` | Confidential transfer |
| `materializeMyRoundWeight`, `setAutoSavePreference` | Caller only for own projection/preference | No direct value (weight materialization is view-like state) | Caller round weight/autosave | Round snapshot and caller key | FHE materialization |
| Adapter `deployAssets`, `withdrawPrincipal`, `harvest`, `emergencyExit` | Vault only; `setPaused` guardian only | Adapter USDC/Comet position | Expected principal, basis, shortfall | `nonReentrant`; pause/market/position checks | Comet, USDC |
| Escrow `registerForRound` | Open, exact `msg.value`, active round | Bond ETH | Registration/progress/reward state | One registration per account/round; `nonReentrant` | Vault callback |
| Escrow `creditProgress`, `finalizeRound` | Vault only | Bond pool/reward liability | Progress/finalized state | Pass/cursor and finalized flag | None/ETH accounting |
| Escrow `claimBondRefund`, `withdrawSettlementRewards` | Caller’s own round/refund/reward balance | Caller bond/reward only | Caller escrow balances | Delete-before-call and `nonReentrant` | ETH call |
| Registry `setOfficialVaultActive` | Registry owner only | Discovery status, not funds | None | Ownable | None |
| Wrapper inherited wrap/unwrap/finalize and ERC-7984 transfers | Standard token permissions; unwrap request owner/recipient | USDC and confidential balances | Token balances/unwrap request handles | Allowance, request deletion, proof; inherited non-reentrancy where applicable | USDC, public decrypt proof |

Registry ownership is a discovery trust boundary only. No registry setter can
change an immutable vault's asset, duration, adapter, escrow, or economics.
The adapter guardian can pause strategy operations but has no principal
withdrawal authority. No admin can select a winner, manufacture yield, or
decrypt encrypted values through a Leopold entry point.

## 7. FHE permission matrix

The installed pinned implementation was inspected directly at
`node_modules/@fhevm/solidity/lib/FHE.sol`,
`node_modules/@fhevm/solidity/lib/Impl.sol`,
`node_modules/@fhevm/host-contracts/contracts/FHEVMExecutor.sol`, and
`node_modules/@fhevm/host-contracts/contracts/InputVerifier.sol`.
`FHE.fromExternal` verifies an input proof in the caller/contract/chain context;
the EIP-712 input context includes the user address and dapp contract. It is not
a generic ciphertext import.

| Value | Type | Created/persisted | Contract allowed | User allowed | Public decrypt | Transient | Reason |
|---|---|---|---|---|---|---|---|
| Per-account principal | `euint64` | Confidential callback; vault mapping | Vault | Owning account only through ACL | No | Token callback/transfer only | Private balance and withdrawal authorization |
| Per-account winnings | `euint64` | Allocation; vault mapping | Vault | Owning account only | No | Withdrawal transfer only | Private prize entitlement |
| Per-account eligible balance/cumulative weight | `euint64`/`euint128` | TWAB checkpoints | Vault | No general user ACL | No | No | Prevent cross-user and cross-vault reads |
| Total principal/liquid principal | `euint64` | Vault accounting | Vault | No | No | Operation-specific token allowance | Solvency and cap accounting |
| Liquid prize/reserved prize | `euint64` | Sponsor, harvest, close, rollover | Vault | No | No | Token operations only | Private prize accounting |
| Round aggregate TWAB | `euint128` | Closed-round snapshot | Vault | No general user ACL | Aggregate only after intended public decrypt | No | Required divisor/selection domain; exact aggregate is intentionally public after close |
| Candidate random value | `euint128` | `FHE.randEuint128()` | Vault | No | No | No | Candidate plaintext/ticket stays private |
| Accepted ticket | `euint128` | Candidate finalization | Vault | No | No | No | Ticket never publicly decrypted |
| Candidate validity | encrypted boolean | Candidate validation | Vault | No | Yes, validity only | No | Public proof reveals only whether rejection sampling accepts |
| Winner predicate/count/selected cumulative | encrypted types | Selection | Vault | No | No | No | Prevent winner identity disclosure |
| Selection/aggregate reconciliation booleans | encrypted boolean | Selection/finalization | Vault | No | Yes, consistency only | No | State-machine integrity, not identity |
| Strategy transition/deployed/harvest accounting | encrypted asset widths | Adapter epochs | Vault | No | No | Token operation only | Keep strategy values private while enforcing public proof boundaries |
| External encrypted amount input | `externalEuint*` | Caller input | Verified by FHE host for caller+dapp | Caller proof authority | No | Yes during operation | Prevent replay across users, contracts, and chains |

`FHE.allowThis` is used for persisted contract state; `FHE.allowTransient` is
used for the current confidential token operation. `FHE.makePubliclyDecryptable`
is used only for values intentionally exposed to public proof verification:
closed aggregate, candidate validity, reconciliation, and public strategy
finalization values. No accepted ticket, winner address, private balance,
private winnings, or private decryption key is made publicly decryptable.

The installed `FHE.sol` implementation performs raw encrypted integer
arithmetic modulo the encrypted type width. The installed
`@openzeppelin/confidential-contracts` `FHESafeMath.sol` provides safe variants,
but Leopold does not use those wrappers in the cap expressions noted in P-01.
This is the sole potential FHE arithmetic issue recorded in this pass.

## 8. State-machine model

### Strategy state

`IDLE → DEPLOYMENT_REQUESTED → DEPLOYMENT_RESULT_PENDING → IDLE` and
`IDLE → REPLENISHMENT_REQUESTED → REPLENISHMENT_RESULT_PENDING → IDLE` are the
normal paths. Epoch cancellation is allowed only for the documented aging or
expired conditions. `PAUSED` gates strategy deployment/harvest and permits the
emergency unwind path; it does not grant a new asset authority.

### Round state

`OPEN → CLOSE_PENDING/closed aggregate → AGGREGATE_FINALIZED → RANDOM_PENDING →
CANDIDATE_PENDING → CANDIDATE_ACCEPTED → SELECTION_PENDING → SELECTION_RECONCILED
→ ALLOCATION_PENDING → SETTLEMENT_PENDING → FINALIZED`.

The empty aggregate path terminates through `settleEmptyRound`. A failed public
reconciliation has a bounded recovery path. A closed round remains settleable
after the next round opens; current-round allocation and withdrawal operations
do not mutate closed-round snapshots. There is no reopen, second close, second
candidate, accepted-ticket replacement, or repeat allocation path.

Bond registration is round-scoped and occurs once per account per round.
Escrow progress is credited per pass and participant count. Finalization and
refund/reward claims use explicit flags and delete-before-ETH-call behavior.

## 9. Exact TWAB review

The implementation checkpoints an observation by first accruing the prior
balance from its last timestamp to the current timestamp, then applying the new
balance at the current timestamp. A withdrawal therefore preserves cumulative
weight already earned and stops future accumulation. Same-timestamp changes
replace the observation balance without creating a zero-duration interval.

Closed-round snapshots are taken once at close. The cumulative lookup clamps to
the round opening/closing boundaries, uses monotonic observation timestamps, and
uses binary search plus interpolation. Registration time gates eligibility, so
pre-registration savings do not acquire prize weight. Multiple deposits and
withdrawals compose as piecewise-constant balance integrals.

Tests cover opening/closing boundaries, same-timestamp operations, registration,
withdrawal, interpolation, monotonic observations, zero balance, and the
reference model. The review specifically checked `opensAt - 1`, `opensAt`,
`opensAt + 1`, registration, `closesAt - 1`, `closesAt`, `closesAt + 1`, and
withdrawal preservation. No cross-vault TWAB storage path was found.

## 10. Randomness and private winner selection

The implementation uses `FHE.randEuint128()` in a state-changing transaction.
It does not use caller-provided seeds, `blockhash`, timestamps, or a fallback
PRNG. It computes the `2^128` rejection domain in a Solidity `uint256`, handles
the non-representable `2^128` boundary specially, computes `q*T`, and accepts
only candidates below `L=q*T` before applying encrypted `R mod T`.

The pinned Zama documentation describes encrypted randomness as transaction
only and generated by the FHEVM encrypted CSPRNG: [Zama encrypted
randomness](https://docs.zama.ai/fhevm/smart-contract/random). The installed
source was also inspected, so this conclusion does not rely on documentation
memory.

For `T=0`, settlement terminates through the empty path. `T=1`, powers of two,
divisors of `2^128`, and the maximum configured aggregate are covered by tests
and the integer model. Invalid candidates cannot be accepted; valid candidates
cannot be replaced; the ticket remains encrypted.

Selection performs encrypted interval comparisons against each participant's
prefix interval. It processes the fixed closed participant snapshot rather than
letting the settlement caller choose ordering. Reconciliation proves exactly one
winner and cumulative-weight consistency. No winner identity or accepted ticket
is emitted or returned by a public getter. Allocation is guarded by the
reconciled result and a one-time cursor/finalization state.

## 11. Value-conservation model

The audited transitions preserve the following high-level accounting:

| Transition | Source bucket | Destination bucket | Principal subsidy check |
|---|---|---|---|
| Deposit | User public USDC via confidential wrapper | `P` and liquid principal | Cap and accepted callback amount; no prize credit |
| Withdrawal | `P` / liquid principal | User public USDC | Caller-bound encrypted balance; no prize debit |
| Sponsor | Sponsor USDC | `S` / liquid prize | Explicit contribution only |
| Adapter deploy | `P` liquid | Comet position and adapter basis | Buffer preserves withdrawal liquidity |
| Harvest | Realized Comet surplus over tracked basis | `Y` / prize reserve | Harvest is surplus-only and checked against public result |
| Close | Current prize | Closed round reserve | Snapshot only; no principal transfer |
| Rollover | Closed reserve | Next round sponsor/prize source `R` | Reserved amount is moved once |
| Allocation | Prize reserve | `W` or auto-saved `P` | Winnings cannot exceed reserved prize |
| Bond registration | `B` caller `msg.value` | Escrow bond liability | Exact round bond; no token/principal access |
| Settlement progress | Escrow bond pool | `I` credited reward | Reward per pass and total credits bounded by bond |
| Bond refund | Escrow bond liability | Original registrant | Claim is one-time and round-scoped |

Direct token or ETH donations can create unaccounted surplus/dust. They do not
create a code path that debits principal into prize or settlement obligations,
but they can make raw balance-based operational accounting less intuitive. The
OpenZeppelin wrapper source also documents that direct underlying donations can
inflate inferred total supply and that fee-on-transfer tokens are unsupported;
the official asset is standard Circle USDC with six decimals.

Forced ETH cannot satisfy a caller's bond liability or prove settlement
completion because escrow stores round-scoped registration/progress/finalization
state. A rejecting ETH receiver causes its own refund/reward call to fail
atomically; it cannot make another account's claim or the round state complete.

## 12. Findings by severity

### Confirmed findings

None established in this pass.

### Potential finding

#### P-01 — Encrypted pool-cap check can be bypassed by `uint64` wraparound

`ID=P-01`  
`TITLE=Encrypted pool-cap check can be bypassed by uint64 wraparound`  
`SEVERITY=MEDIUM (potential/conditional)`  
`CONFIDENCE=High for code mechanism; Low for current deployed reachability`  
`AFFECTED_FILE=contracts/LeopoldVault.sol`  
`AFFECTED_LINES=319-323, 328-329, 1016-1018`  
`AFFECTED_CONTRACT=LeopoldVault`  
`AFFECTED_DEPLOYMENT=All four official vaults share the implementation pattern`  
`INVARIANT_BROKEN=If a near-wrap valid encrypted amount is accepted, the configured principal cap and principal/prize accounting can cease to be fail-closed.`

`ATTACK_PRECONDITIONS=` The attacker must hold or otherwise validly submit a
confidential `euint64` amount large enough that `currentTotal + amount` wraps
modulo `2^64` while the wrapped result is at or below the cap. The amount must
also pass the confidential token's caller-bound input proof and transfer
authority checks. The same arithmetic pattern exists in auto-save allocation
for a sufficiently large prize value.

`ATTACK_SEQUENCE=` A valid confidential transfer invokes
`onConfidentialTransferReceived`; the function computes
`proposedTotal = FHE.add(_totalPrincipal, amount)` and then checks
`FHE.le(proposedTotal, MAX_POOL_BASE_UNITS)`. Because pinned raw FHE arithmetic
wraps at the encrypted width, a sum beyond `2^64 - 1` can become a small value,
pass the cap predicate, and be selected into principal/liquid accounting. The
allocation path computes the analogous sum before `autoFits`.

`IMPACT=` Potential cap bypass, wrapped principal/liquid accounting, and a
possible mismatch between economic assets and encrypted accounting. This is
not a currently demonstrated deployed theft: the latest read-only Sepolia
canonical USDC total supply was `10,742,087,269,654,168,781` base units, below
`2^64 = 18,446,744,073,709,551,616`, and a realistic attacker must first obtain
the required valid confidential balance. The feasibility can change as asset
supply and balances change, and the contract itself does not encode the proof
that the precondition is impossible.

`WHY_EXISTING_TESTS_MISSED_IT=` Existing cap tests cover ordinary amounts,
zero, maximum configured pool, and rejection/refund behavior, but do not create
a valid production-like ciphertext near the `euint64` wrap boundary. Local FHE
mock arithmetic tests also do not establish a global supply bound.

`RECOMMENDED_FIX=` Before reopening the contract freeze, use the pinned
confidential safe-math facilities or an overflow-safe encrypted comparison. At
minimum, independently constrain the incoming amount and prove that the sum
cannot wrap before comparing it with the pool cap. Add a regression using a
valid high-width confidential input and cover the corresponding auto-save prize
path. Do not rely on frontend amount validation.

`CONTRACT_FREEZE_IMPACT=yes`  
`REDEPLOYMENT_REQUIRED=unknown` (a contract-side fix would normally require a
new implementation/deployment and a migration decision; no fix was applied)  
`EVIDENCE=` Installed `node_modules/@fhevm/solidity/lib/FHE.sol` and the
first-party type documentation state that encrypted integer operations are
unchecked/modular. `LeopoldVault.sol` uses raw `FHE.add` at the cited locations
before the cap comparison. `node_modules/@openzeppelin/confidential-contracts/utils/FHESafeMath.sol`
contains the relevant safe-operation alternative.

This is recorded as a potential finding rather than a confirmed deployed
exploit because the required current-asset reachability was not established.

## 13. Accepted and design risks

These are not classified as vulnerabilities in this pass:

1. The exact aggregate TWAB becomes publicly decryptable after close. The
   design analysis in `docs/security/LEOPOLD_AGGREGATE_PRIVACY_ANALYSIS.md`
   identifies this as required for the plaintext divisor/rejection-sampling
   boundary and says it does not reveal individual balances or the winner.
2. Registration timestamps, participant count, public sponsor/prize metadata,
   strategy status/yield, and round timing are public. They can support traffic
   analysis but do not expose encrypted account balances or winner identity.
3. A winner can reveal their own identity by claiming winnings or selecting
   auto-save behavior. The protocol does not emit the winner identity during
   selection.
4. Compound governance and Circle USDC issuer actions can pause, blacklist, or
   otherwise restrict external asset movement. The adapter detects pause,
   market, position, and shortfall conditions; it cannot remove that external
   dependency.
5. Registry ownership can alter whether a vault is presented as official. It
   cannot alter immutable vault economics or custody. The deployed owner is not
   an admin of user principal through the vault.
6. Direct public-token donations, direct confidential-token donations, forced
   ETH, and rounding dust can remain operational surplus/dust. No user-facing
   withdrawal or prize claim is made solvent solely by those raw balances.
7. Sybil participants are not eliminated. Each registered account costs the
   exact bond, induces bounded two-pass work, and can make settlement less
   attractive. Registration is round-scoped and old participants do not create
   future-round obligations.
8. The largest deployed vault runtime has only 1,037 bytes of EIP-170 headroom.
   This is deployment operational risk, not a current correctness exploit.

## 14. Test coverage review and gaps

### Executed checks

- `pnpm test`: **562 passing, 1 pending**.
- `node scripts/validate-leopold-bytecode.cjs`: `LEOPOLD_BYTECODE_VALID`.
- `node scripts/validate-leopold-contract-freeze.cjs`: `LEOPOLD_CONTRACT_FREEZE_VALID`.
- `pnpm cp1:selector:hcu:validate`: `LEOPOLD_SELECTOR_HCU_EVIDENCE_VALID`.
- `pnpm cp1:compound:validate`: `LEOPOLD_COMPOUND_LIVE_EVIDENCE_VALID`.
- `pnpm lint:sol`: pass.
- `pnpm build:ts`: pass.
- `pnpm --filter @zama-szn4/frontend test`: **183 tests passing**.
- `pnpm --filter frontend typecheck`: pass.
- `pnpm prettier:check`: pass.
- TypeScript lint completed without errors; the root lint reported only
  existing unused-disable warnings in SG2/SG4/SG5 scripts.

### Invariant coverage map

| Invariant | Covered | Existing evidence | Missing case |
|---|---|---|---|
| Principal is never prize money | Yes/partial | Deposit, sponsor, harvest, allocation, reference-model tests | High-width cap-wrap regression |
| Principal withdrawable | Yes/partial | Withdraw, adapter, emergency, liquidity tests | Full malicious external-token failure matrix |
| Private balances/TWAB/odds | Yes/partial | FHE permission and privacy tests | Production coprocessor proof and leakage fuzzing |
| Accepted ticket never public | Yes | Randomness/private settlement tests | Explicit event/getter ABI negative assertion could be permanent |
| Winner identity never emitted | Yes | Event/source review and private settlement tests | Claim-side self-disclosure documentation |
| No role decrypts accepted ticket | Yes/partial | ACL tests and source review | Explicit admin/keeper matrix test |
| Exact TWAB isolated per vault | Yes | Four-vault and TWAB model tests | Cross-vault adversarial fuzzing |
| Four-vault solvency isolation | Yes/partial | Registry/foundation and per-vault tests | Cross-vault donation and failure fuzzing |
| Settlement bounded/resumable/replay-safe | Yes/partial | Settlement, HCU, bond, replay tests | Maximum gas/HCU participant stress on production-like limits |
| Bond separate from token buckets | Yes | Escrow/bond tests and forced ETH cases | More malicious ETH receiver variants |
| Registration round-scoped | Yes | Bond and round tests | Long-history state-growth fuzzing |
| Withdrawal preserves earned TWAB | Yes | TWAB reference/model tests | Production proof-backed fuzzing |
| Closed-round TWAB immutable | Yes | Close/new-round tests | Storage mutation invariant fuzzing |
| No accepted reroll | Yes | Candidate phase/replay tests | ABI-level negative search is recommended |

### Coverage gaps / false confidence controls

- No permanent test currently constructs a valid confidential input near the
  `euint64` boundary for P-01.
- Local mocks cannot emulate every production FHE input proof, ACL host failure,
  encrypted overflow behavior, or public decryption service failure.
- ERC-20 tests do not fully emulate a malicious fee-on-transfer, false-return,
  rebasing, blacklist, or arbitrary callback token. Official asset and wrapper
  constraints make this a deployment assumption, not a proof for arbitrary
  future registry assets.
- Adapter tests cover pause, position, market, deployment, harvest, and
  shortfall behavior, but not every malicious Comet proxy implementation.
- No exhaustive production-HCU/gas stress proves a bound for arbitrary N; the
  settlement design has bounded chunks and existing selector-HCU evidence, but
  Sybil economics remain a design risk.
- Existing tests assert many encrypted handles/state transitions, but assertions
  in a local mock are not equivalent to a production public-decryption or ACL
  proof.

## 15. Deployment verification

Read-only Sepolia calls confirmed:

- chain ID `11155111`;
- bytecode present at every official address;
- registry owner and official active entries;
- canonical asset on all wrappers/vaults/adapters;
- Comet base token canonical USDC, base scale `1,000,000`, and no current
  supply/withdraw pause;
- four durations exactly `86,400`, `604,800`, `2,592,000`, and `604,800`;
- each vault's adapter and escrow match the manifest;
- each adapter's vault, guardian, Comet, asset, market integrity, position
  integrity, pause state, basis, principal, and shortfall match the expected
  deployment at the read point;
- official vaults are registry IDs 1–4 with the expected Daily, Weekly, Monthly,
  and Boost types;
- current official adapters reported zero deployed basis/expected principal and
  zero shortfall at the read point.

Checked-in digest results:

- `config/leopold-frontend-contracts.json`:
  `579da28f3fb61a5b4fe89174b1a1dda23b0af0baaf44743af33766d516683e9a` — matches
  the expected manifest digest;
- `evidence/deployment/LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json`:
  `173e21ec27700c6adf74a33c87d07bbd618c078052913e79f4a2102b749d994d`;
- `evidence/closure/LEOPOLD_CONTRACT_FREEZE.json`:
  `a717c54c12601e7ed343c01c9f430d644e94b9873259606ca5ad888c4b3ad137`;
- `evidence/cp1/LEOPOLD_COMPOUND_LIVE.json`:
  `e18adbf393983ae178978f9034a0130d9d683a1fd6bdc5f65b8dd6c32e68640d`.

Deployment integrity is **PASS at the read point**. Live state can of course
change after this audit, so this is not a perpetual attestation.

## 16. Bytecode and compiler review

The bytecode validator reported:

| Contract | Runtime bytes | EIP-170 headroom |
|---|---:|---:|
| Largest `LeopoldVault` | 23,539 | 1,037 |
| Escrow | 4,270 | 20,306 |
| `lcUSDC` | 10,565 | 14,011 |
| Adapter | 5,535 | 19,041 |
| Registry | 1,334 | 23,242 |

EIP-170 limit is 24,576 bytes. The accepted largest-vault maximum in the
validator is 23,552 bytes. The largest runtime SHA-256 was
`e3ad2c181dff40a9b35ea5764f2d2d51bf6b0a30ec17a67bda7bf48f238df7a3`.

Compiler settings are Solidity `0.8.27`, optimizer enabled (default runs 800),
metadata hash disabled, Cancun EVM; the vault and registry use via-IR with
optimizer runs 1 as specified by the Hardhat configuration. The freeze and
bytecode validators passed, and no deployment/address/ABI/manifest diff was
introduced by this audit.

## 17. Dependency and supply-chain review

Security-relevant pinned versions include:

- `@fhevm/solidity` `0.11.1`;
- `@fhevm/host-contracts` `0.10.0`;
- `@fhevm/mock-utils` / `@fhevm/hardhat-plugin` `0.4.2`;
- `@openzeppelin/contracts` `5.6.1`;
- `@openzeppelin/confidential-contracts` `0.5.1`;
- `encrypted-types` `0.0.4`;
- `@zama-fhe/relayer-sdk` `0.4.1`;
- frontend/keeper `@zama-fhe/sdk` `3.4.0`;
- Dynamic frontend packages `5.3.0`;
- Hardhat `2.28.6`, ethers `6.17.0`.

`pnpm-lock.yaml` is lockfile v9. No unexpected git/path override, local patched
security-critical package, duplicate incompatible FHE/OZ production version, or
Privy package was found in the current production dependency/runtime paths.
WalletConnect packages are transitive frontend dependencies; they are not
protocol contract owners. Browser-extension storage is outside application
source and deployment ownership.

First-party documentation checked where semantics mattered:

- [Zama encrypted randomness](https://docs.zama.ai/fhevm/smart-contract/random)
- [Zama ACL](https://docs.zama.ai/fhevm/smart-contract/acl)
- [Zama encrypted types and arithmetic](https://docs.zama.ai/fhevm/smart-contract/types)
- [Zama encrypted inputs](https://docs.zama.ai/fhevm/smart-contract/inputs)
- [Zama FHE operation example](https://docs.zama.ai/protocol/examples/basic/fhe-operations/fheadd)
- [OpenZeppelin confidential token](https://docs.openzeppelin.com/confidential-contracts/token)
- [OpenZeppelin confidential token API](https://docs.openzeppelin.com/confidential-contracts/api/token)
- [Compound helper functions](https://docs.compound.finance/helper-functions/)
- [Compound governance](https://docs.compound.finance/governance/)
- [Compound collateral and borrowing](https://docs.compound.finance/collateral-and-borrowing/)

Installed package source was treated as authoritative where it was more exact
than prose, especially for FHE input context, raw arithmetic, ACL operations,
ERC-7984 callback/refund behavior, unwrap finalization, and `FHESafeMath`.

## 18. Adversarial checklist result

The following checklist was reasoned through against source and available
tests. “Covered” means rejected/handled by code or exercised by existing tests;
“gap” means the production-like adversarial variant should be added.

| Cases | Result |
|---|---|
| zero deposit/withdraw, max deposit, full/over-withdraw | Covered; over-withdraw is rejected |
| duplicate entry, no/wrong bond, early/double close | Covered/rejected |
| RNG before close/twice, validation twice, invalid acceptance | Covered/rejected |
| settlement before acceptance, duplicate participant, early finalization | Covered/rejected |
| duplicate refund/incentive/prize claim | Covered/rejected by flags and deletion |
| zero sponsor/boundary sponsor, forced ETH, direct token donation | Covered or modeled; donation is dust/design risk |
| reentrancy receiver, rejecting ETH receiver, external call failure | Covered in escrow/token/adapter tests; no unsafe partial commit found |
| malicious settlement caller and caller replacement | Permissionless but bounded/round-scoped; no caller authority to bias result |
| participant withdrawal after entry, old-round/new-round mutation | Covered; TWAB preserved and closed data immutable |
| cross-vault call/state confusion | Source isolation and tests pass; broader fuzz gap remains |
| ciphertext from another user/vault/contract, proof replay | Host context binding and existing proof tests; explicit exhaustive matrix gap |
| unauthorized decrypt, winner/ticket event/getter leakage | No path found; source/event audit pass |
| close timestamp and T = 0/1/power-of-two/max | Covered by tests/model and source arithmetic review |
| rounding/dust, adapter no-liquidity, Comet paused/failing | Covered/modelled; external governance remains design risk |
| public USDC pause/blacklist and malicious token semantics | Official deployment checked; arbitrary-token adversarial gap |
| high-width FHE cap wrap | **Potential finding P-01; missing regression** |

## 19. Required remediations and recommended hardening

### Required triage

1. Resolve P-01 before the next contract-core release decision. Prefer a
   safe encrypted addition/comparison or a proof-backed invariant that makes
   wraparound impossible. Add the high-width input regression.
2. If the fix changes bytecode or ABI, reopen the contract freeze and perform a
   new deployment/address/manifest/bytecode review. No deployment was made in
   this audit.

### Recommended hardening

1. Add a production-like cross-caller/cross-vault encrypted-input replay test
   with explicit proof context assertions.
2. Add ABI/event negative assertions for accepted-ticket and winner identity
   disclosure, including revert-data and public-getter review.
3. Add adversarial ERC-20 and Comet mocks that return false, transfer less,
   pause, blacklist, rebase, or fail after an attempted state transition.
4. Add forced-ETH and direct-token-donation invariant fuzzing around escrow,
   wrapper inferred supply, and all conservation buckets.
5. Add a maximum practical participant gas/HCU stress campaign and document the
   economic threshold at which permissionless settlement is not rational.
6. Preserve the current separation of registry discovery authority, strategy
   guardian authority, vault authority, escrow authority, and FHE host ACL.

## 20. Audit limitations

This pass cannot prove that future external state will remain unchanged, that
Compound governance or Circle will never pause/blacklist, that every public
RPC response is honest, or that a local FHE mock is identical to the production
coprocessor. No browser, wallet, frontend, or Dynamic behavior is a security
boundary for the protocol conclusions. The current frontend production build
was not run because pre-existing generated `.next` content was present and the
read-only audit forbids overwriting generated repository content; frontend unit,
typecheck, lint, and repository TypeScript checks were run.

## 21. Final verdict

**CORE AUDIT PASS 1 COMPLETE — FINDINGS READY FOR TRIAGE**

