# CP0 Independent-Review Remediation and Risk Register

This is the current authoritative disposition of the recovered 2026-08-04 CP0 review. It does not rewrite historical
GO/NO-GO documents.

## Current qualified decisions

- Stage 0.4 foundation: `GO` (historical foundation gate CG-4).
- CP0 repository creation: `CONDITIONAL GO` (historical decision, superseded by the final decision below).
- CP0 Stage 1 benchmarks: historical `NO-GO` until SG-4; superseded by closed SG-4 and the permanent benchmark.
- CP0 final feasibility/security consolidation: `GO TO PRODUCTION IMPLEMENTATION`, contingent on the committed final
  artifact and validator passing. This does not authorize production release.

## M and L findings

| ID  | Disposition | Verifiable control                                                                                                                                                                     |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | PASS        | Full pnpm audit including dev dependencies; raw JSON receipt; checkpoint re-audit policy below.                                                                                        |
| M-2 | PASS        | Risk rows below use evidence-backed controls or remain explicitly Open.                                                                                                                |
| M-3 | PASS        | Registry/lock receipts and explicit `HOLD_PIN` decisions in `evidence/cp0/CP0_VERSION_CURRENCY.json`.                                                                                  |
| M-4 | PASS        | Non-ambiguous SDK matrix in `docs/architecture/CP0_SDK_AND_CHAIN_OWNERSHIP.md`.                                                                                                        |
| M-5 | PASS        | Official template repository `ls-remote` receipt in the final closure artifact.                                                                                                        |
| M-6 | PASS        | Agent/credential policy plus tracked-secret scan.                                                                                                                                      |
| M-7 | PASS        | Forced compile output plus named `CP0 R-008 clears transient FHE composition state between transactions` test.                                                                         |
| M-8 | PASS        | Review classifications and authorization levels in the reviewer-independence policy.                                                                                                   |
| L-1 | PASS        | All current decisions above are gate-qualified.                                                                                                                                        |
| L-2 | PASS        | GitHub `GIFTEDLOV` and Git author `Emory <142720896+GIFTEDLOV@users.noreply.github.com>` are the deliberate public identity of the same project author/operator. History is unchanged. |
| L-3 | PASS        | `docs/governance/EVIDENCE_STANDARD.md` requires artifact path, digest, Git identity, UTC time, and command/test ID.                                                                    |
| L-4 | PASS        | Compiler/Cancun rationale and reconsideration triggers are recorded in the architecture decision.                                                                                      |
| L-5 | PASS        | Chain/relayer ownership, chain ID, fail-closed behavior, and browser/keeper boundary are recorded and linked to SG-5/SG-2 evidence.                                                    |

## Full dependency re-audit policy

Run the complete audit (never production-only) on every dependency or lockfile change, every checkpoint transition,
before a live deployment, and at security freeze. Findings are triaged by execution surface: deployment-host tools,
build inputs, browser production dependencies, keeper production dependencies, and unreachable/test-only paths. A
nonzero advisory count is not hidden. Coverage and other vulnerable developer tools must receive only trusted repository
inputs and must not run on a secret-bearing deployment host until relevant High/Critical advisories are remediated or an
independent exploitability review accepts a compensating control.

## Risk register re-rating

The supplied recovered excerpt did not include the original prose titles for R-003, R-005, R-010, R-011, or R-012. Their
identifiers are retained without invented titles. The before-CP1 requirement permits a truthful Open disposition.

| Risk  | Current rating | Status                           | Verifiable control/evidence                                                                                                                                        | Re-evaluation trigger                                                  |
| ----- | -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| R-003 | HIGH           | OPEN_NONBLOCKING_PRODUCTION_RISK | Original detailed statement not recovered; CP0 validator prevents accidental “Controlled” status and the risk remains visible.                                     | Recover original bytes; each CP1 checkpoint; before production freeze. |
| R-005 | HIGH           | OPEN_NONBLOCKING_PRODUCTION_RISK | Original detailed statement not recovered; no scope/architecture assertion is treated as a control.                                                                | Recover original bytes; each CP1 checkpoint; before production freeze. |
| R-008 | MEDIUM         | PASS                             | Forced 0.8.27/Cancun compile evidence and named two-transaction encrypted composition regression; SG-4 proves HCU depth uses transaction-cleared `tload`/`tstore`. | Compiler/EVM/FHEVM/OZ change or new transient-storage composition.     |
| R-010 | HIGH           | OPEN_NONBLOCKING_PRODUCTION_RISK | Original detailed statement not recovered; deterministic gate register retains it Open.                                                                            | Recover original bytes; relevant production design checkpoint.         |
| R-011 | HIGH           | OPEN_NONBLOCKING_PRODUCTION_RISK | Original detailed statement not recovered; deterministic gate register retains it Open.                                                                            | Recover original bytes; relevant production design checkpoint.         |
| R-012 | HIGH           | OPEN_NONBLOCKING_PRODUCTION_RISK | Original detailed statement not recovered; deterministic gate register retains it Open.                                                                            | Recover original bytes; relevant production design checkpoint.         |
| R-014 | HIGH           | OPEN_NONBLOCKING_PRODUCTION_RISK | Capacity is not “controlled by schedule”; weekly checkpoint/no-go review and deterministic cut order are measurable controls.                                      | Weekly and every checkpoint; immediately on critical-path slip.        |

Open risks do not assert safety. They are nonblocking for a feasibility-stage GO because their unknown/prod-design
aspects remain explicit requirements for CP1 and production freeze.

## Checkpoint NO-GO cut order

1. Stop new implementation, preserve evidence, and re-plan; never weaken confidentiality, randomness, principal,
   withdrawal, or settlement invariants to recover schedule.
2. Remove optional keeper automation and convenience while retaining a permissionless/manual protocol path.
3. Defer optional evaluator polish, analytics, and nonessential automation.
4. Apply a product-scope cut only if a previously authorized contingency explicitly names it. No such pre-authorized
   core protocol cut was recovered, so unresolved critical-path failure remains NO-GO and escalates to the owner.

The complete product remains the target; this order is contingency governance, not advance permission to cut scope.

## H-7 — cUSDTMock external dependency

Disposition: `PASS` / `CLOSED_BY_EVIDENCE` for CP0 feasibility.

The official Zama protocol registry identifies Sepolia cUSDTMock `0x4E7B06D78965594eB5EF5414c357ca21E1554491`,
underlying USDTMock `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0`, and wrapper registry
`0x2f0750Bbb0A246059d80e94c454586a7F27a128e`. At finalized block `0xaee1df`, all three had code; the wrapper reported
the expected underlying, names/symbols and six decimals matched, and a read-only `eth_call` simulation of
`mint(address,uint256)` for one base unit succeeded. The official source states public minting with a one million-token
per-call cap. This proves evaluator onboarding feasibility without sending a mint transaction. Production must
pin/reverify the asset at its deployment checkpoint.

## H-8 — schedule/capacity

Disposition: `PASS` as a review-remediation gate; R-014 remains `OPEN_NONBLOCKING_PRODUCTION_RISK` at HIGH.

As of 2026-08-10, the project has 26 calendar days until the recorded 2026-09-05 programme deadline. Remaining locked
workstreams include confidential pool/accounting, exact TWAB checkpoints, euint128 unbiased winner selection and retry
lifecycle, cUSDT custody/yield/principal separation, withdrawals, bounded resumable settlement, production frontend, and
audit/release evidence. Weekly and checkpoint no-go review plus the cut order above are the controls. The schedule
itself is not one.

## Residual production invariants

CP0 feasibility does not implement the protocol. Production must preserve confidential deposits/balances/TWAB/ticket, no
ticket decryptability, no discretionary reroll, exact TWAB, principal/yield/prize separation, withdrawals,
permissionless bounded resumable ordered replay-safe settlement, and an untrusted optional keeper.
