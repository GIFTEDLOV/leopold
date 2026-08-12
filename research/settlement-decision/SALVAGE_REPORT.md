# Leopold production-candidate salvage report

Date: 2026-08-12  
Repository: `/home/dell/zama-szn4`  
HEAD: `8f30ba74a1fcbfa2cbb45aa420a90b3ec65f7951`  
Policy: no production file was edited, discarded, staged, committed, or pushed during this decision gate.

## Outcome

The dirty production candidate is independent of the rejected encrypted-tree research and is salvageable as a coherent
pre-frontend security/bytecode candidate. It does **not** close settlement scalability and must not be frozen or
committed as frontend-safe until the selected eligibility architecture is implemented and reviewed.

Exact current production sizes after a fresh compile:

| Contract                  | Creation bytes | Runtime bytes | EIP-170 headroom | Accepted ceiling |
| ------------------------- | -------------: | ------------: | ---------------: | ---------------: |
| `LeopoldVault`            |         31,764 |        23,064 |            1,512 |           23,076 |
| `LeopoldConfidentialUSDC` |         12,510 |        10,565 |           14,011 |           11,000 |
| `LeopoldCompoundAdapter`  |          6,381 |         5,535 |           19,041 |            6,000 |
| `LeopoldVaultRegistry`    |          3,965 |         1,164 |           23,412 |            1,500 |

`LeopoldVault` therefore remains 12 bytes below its deterministic ceiling and preserves the preferred 1,500-byte
headroom target by 12 bytes.

## Complete production diff classification

Classification: **A** independent security fix; **B** EIP-170/bytecode remediation; **C** settlement-specific; **D**
experimental/unwanted for production; **E** documentation/test/tooling only.

| File                                                          | Class | Change and disposition                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.prettierignore`                                             | E     | Excludes generated freeze JSON from formatter churn. Preserve.                                                                                                                                                                                                                                                                                             |
| `contracts/LeopoldCompoundAdapter.sol`                        | A     | Adds dynamic `baseToken/baseScale` integrity checks to deploy, principal withdrawal, and harvest. Emergency exit deliberately remains available after market-identity drift. Preserve.                                                                                                                                                                     |
| `contracts/LeopoldVault.sol`                                  | A, B  | Rechecks adapter pause immediately before a matured DEPLOY epoch burns/moves liquid principal; deduplicates wrap/approval and proof-verification paths; makes internal limits private; removes redundant diagnostic getters; folds all settlement progress into `roundInfo`. Preserve, subject to the later explicit eligibility ABI/state-machine change. |
| `contracts/LeopoldVaultRegistry.sol`                          | A     | Requires each adapter's immutable `vault` and `asset` backpointers to match its vault. Preserve. This is configuration validation, not implementation-code authentication.                                                                                                                                                                                 |
| `contracts/mocks/MockCompoundComet.sol`                       | E     | Makes mock base configuration mutable so governance/config drift can be tested. Preserve with tests.                                                                                                                                                                                                                                                       |
| `reference/leopoldModels.ts`                                  | A, E  | Extends machine-checkable prize conservation across liquid prize assets, harvested yield, sponsorship, allocations, withdrawals, and Auto-Save. Preserve.                                                                                                                                                                                                  |
| `test/LeopoldCompoundYield.ts`                                | A, E  | Covers market drift, pause-after-epoch-open, lifecycle composition, cutoff semantics, emergency isolation, and proof replay. Preserve.                                                                                                                                                                                                                     |
| `test/LeopoldVaultFoundation.ts`                              | A, E  | Adds exact exclusive-close boundary tests and adapts removed diagnostic getter usage. Preserve.                                                                                                                                                                                                                                                            |
| `test/LeopoldReferenceModels.ts`                              | A, E  | Exercises the extended principal/prize conservation model. Preserve.                                                                                                                                                                                                                                                                                       |
| `test/LeopoldPrivateSettlement.ts`                            | C, E  | Adapts tests to consolidated `roundInfo`; does not change the linear production algorithm. Preserve as regression evidence, but it does not close the Sybil issue.                                                                                                                                                                                         |
| `docs/architecture/LEOPOLD_MULTI_VAULT_ARCHITECTURE.md`       | E     | Corrects the obsolete 80-byte size statement to 1,512 bytes. Preserve.                                                                                                                                                                                                                                                                                     |
| `docs/security/LEOPOLD_CP1_YIELD_FRESH_REVIEW.md`             | E     | Corrects bytecode status and explicitly keeps settlement Sybil economics open. Preserve.                                                                                                                                                                                                                                                                   |
| `docs/security/LEOPOLD_PRE_FRONTEND_CLOSURE.md`               | E     | Candidate closure record that explicitly says settlement is not closed. Preserve as draft; it is not an authoritative freeze.                                                                                                                                                                                                                              |
| `config/leopold-frontend-contracts.json`                      | E     | Candidate integration manifest with null final deployment addresses and current settlement flow. Preserve as draft only; the eligibility redesign will be freeze-breaking.                                                                                                                                                                                 |
| `evidence/closure/LEOPOLD_CONTRACT_FREEZE.json` and sidecar   | E     | Deterministic candidate ABI/bytecode evidence. Preserve as candidate evidence, not final freeze.                                                                                                                                                                                                                                                           |
| `scripts/validate-leopold-bytecode.cjs`                       | B, E  | Fail-closed production runtime ceilings, including 23,076 bytes for the vault. Preserve.                                                                                                                                                                                                                                                                   |
| `scripts/generate-leopold-contract-freeze.cjs`                | E     | Generates ABI/selectors/events/errors/bytecode hashes. Preserve.                                                                                                                                                                                                                                                                                           |
| `scripts/validate-leopold-contract-freeze.cjs`                | E     | Validates candidate freeze and requires settlement-not-closed text. Preserve.                                                                                                                                                                                                                                                                              |
| `package.json`                                                | E     | Adds the bytecode/freeze validator commands without changing dependencies or lockfile. Preserve.                                                                                                                                                                                                                                                           |
| `contracts/spikes/LeopoldHistoricalPrefixTreeSpike.sol`       | D     | Rejected encrypted prefix-tree research. Keep isolated for evidence; never merge into production.                                                                                                                                                                                                                                                          |
| `contracts/spikes/LeopoldHistoricalMomentTreeSpike2.sol`      | D     | Additional encrypted aggregate-tree experiment. Excluded by the final no-more-tree decision. Preserve as untracked research evidence only.                                                                                                                                                                                                                 |
| `contracts/spikes/LeopoldMomentTreeVaultAclProbe.sol`         | D     | Tree/helper ACL research probe. Preserve as untracked evidence only.                                                                                                                                                                                                                                                                                       |
| `test/spikes/LeopoldHistoricalPrefixTreeSpike.ts`             | D, E  | Rejected tree benchmarks/tests. Preserve only as research evidence.                                                                                                                                                                                                                                                                                        |
| `test/spikes/LeopoldHistoricalMomentTreeSpike2.ts`            | D, E  | Additional rejected tree-family tests. Preserve only as research evidence.                                                                                                                                                                                                                                                                                 |
| `research/settlement-tree-spike/REPORT.md`                    | D, E  | Spike-1 failure record. Preserve.                                                                                                                                                                                                                                                                                                                          |
| `research/settlement-tree-spike/SPIKE2_REPORT.md`             | D, E  | Spike-2 large-depth failure record. Preserve.                                                                                                                                                                                                                                                                                                              |
| `research/settlement-tree-spike/reference-model.cjs` and test | D, E  | Correct mathematical tree reference evidence, but not a production architecture. Preserve.                                                                                                                                                                                                                                                                 |

No dirty production change implements Fenwick, segment, prefix, moment, or other encrypted aggregate-tree settlement. No
production change changes participant registration, selection traversal, allocation traversal, exact TWAB, randomness,
winner privacy, or the current four-participant chunk bounds.

## Security and liveness review

The pause fix closes a real state-machine gap: an epoch opened before pause can no longer enter DEPLOY unwrap after it
ages. The check occurs before `_liquidPrincipal` is reduced or lcUSDC is burned. Replenishment remains usable because it
recovers already-deployed principal and is not new deployment.

The adapter now fails closed if the immutable Comet endpoint reports a different base token or six-decimal scale during
normal deploy/withdraw/harvest operations. Emergency exit intentionally does not apply this identity guard, so a mere
getter drift does not disable the only recovery path; Comet withdraw pause, hostile proxy implementation, liquidity, and
governance remain external availability risks.

The registry backpointer checks prevent an interface-compatible adapter belonging to another vault or asset from being
accepted as official. They do not authenticate vault/adapter bytecode or codehash; deployment ceremony must still bind
the four reviewed artifacts.

## Bytecode-remediation safety

No invariant/security check was removed for size:

- public constants became private constants but retain identical internal bounds;
- repeated exact-approval/wrap/reset sequences moved into `_wrapUnderlying` unchanged;
- repeated one-handle `FHE.checkSignatures` construction moved into `_checkPublicProof` unchanged;
- boolean cleartext decoding plus handle-bound proof checking moved into `_checkBooleanProof` unchanged;
- `roundProgress` was folded into the expanded `roundInfo` output;
- `observationAt`, preference count, and round-reserve-handle getters exposed diagnostics but enforced no state
  transition, proof, ACL, accounting, or recovery invariant.

Removing getters is an intentional ABI change and is already represented in candidate freeze evidence. The forthcoming
eligibility architecture will break the candidate freeze again, so these artifacts remain provisional.

## Verification

- Starting branch/HEAD: `main` at `8f30ba74a1fcbfa2cbb45aa420a90b3ec65f7951`; index empty; no configured remotes.
- Before analysis, all 29 modified/untracked files were hashed into an external read-only comparison manifest. Manifest
  SHA-256: `e9ec3a62bb7811a1e9ffd5724cc84a16ec22cfe174693006e298487029b1ff3a`.
- Final `sha256sum -c` revalidation returned `OK` for all 29 starting files. The only files created by this decision
  gate are `research/settlement-decision/SALVAGE_REPORT.md` and `research/settlement-decision/FINAL_DECISION_REPORT.md`.
- `pnpm compile`: PASS.
- `pnpm closure:bytecode`: PASS with vault runtime 23,064 and headroom 1,512.
- Six non-spike Leopold suites: **57 passing**.
- Solidity lint on the three changed production contracts: PASS.
- TypeScript lint on changed model/tests: PASS.
- Targeted formatting: PASS.
- CP0 immutable closure validator: PASS.
- CP1 selector/HCU evidence validator: PASS.
- Candidate contract-freeze validator: PASS.

An initial targeted test command named two nonexistent test files and failed before running tests; it made no changes.
The corrected command enumerated all six existing non-spike Leopold suites and passed.

## Salvage decision

Preserve all A/B fixes and their E evidence. Keep C regression adaptations until the settlement replacement is
implemented. Quarantine every D file under research/spike paths; do not import it into production. Do not commit the
candidate yet because round-scoped eligibility will intentionally change the ABI, state machine, accounting, tests,
manifest, and freeze evidence.
