# Reviewer Independence Policy

| Classification                     | Meaning                                                                                                     | May authorize                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SELF_REVIEW`                      | Implementer and reviewer are the same person/tool/session.                                                  | Local iteration only.                                                                                                   |
| `FRESH_SESSION_ADVERSARIAL_REVIEW` | Fresh context and explicit adversarial recomputation, but potentially the same operator/model/organization. | Internal checkpoint evidence when supplemented by deterministic validators; never claimed organizationally independent. |
| `CROSS_MODEL_REVIEW`               | A different model/tool reviews retained evidence and diffs with disclosed operator overlap.                 | Internal security-gate closure with deterministic evidence and owner acceptance.                                        |
| `EXTERNAL_INDEPENDENT_REVIEW`      | Independent human/security organization with no implementation responsibility.                              | Recommended and non-blocking for Sepolia/testnet release; mandatory for mainnet/production-capital release.             |

Ordinary development may continue after self-review and green automation. A security-gate closure needs at least a
fresh-session adversarial or cross-model review plus reproducible evidence and explicit disclosure. For the current
Leopold Sepolia/testnet/hackathon release, the project owner may explicitly authorize release progression without a
completed external review when the owner decision and deterministic evidence are retained. This waiver is environment-
and release-specific; it does not authorize mainnet or production-capital release.

No project artifact may claim OpenZeppelin certification or equivalent unless that organization actually performed and
issued it.

## Current project-owner release decision

| Field                                      | Decision                                                           |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Decision date                              | `2026-09-01`                                                       |
| Authorized by                              | `PROJECT_RELEASE_OWNER`                                            |
| Exact candidate SHA                        | `9cca5ce5fb17ffa6287204fac181033920194c7f`                         |
| Target                                     | `SEPOLIA_TESTNET_HACKATHON`                                        |
| Waiver scope                               | `THIS_SEPOLIA_TESTNET_RELEASE_ONLY`                                |
| Disposable proof evidence SHA-256          | `2ce8bbb22f2b74f34a324a575d5c483c43cc0bceaa2b533eb6984dac25feff1f` |
| Automated/security gate status             | `DETERMINISTIC_GATES_PASS_SG4_A2_TO_B_AND_MAIN_BOUNDARY_PENDING`   |
| Mainnet/production-capital external review | `MANDATORY`                                                        |

This is a project-owner waiver of the external-review requirement for this Sepolia/testnet release only. It is not an
external audit, certification, or waiver of SG-4 authority, deployment identity, compiler, HCU, accounting, privacy,
V1-freeze, or other release gates. The machine-readable record is
`evidence/governance/LEOPOLD_SEPOLIA_PROJECT_OWNER_RELEASE_DECISION.json`.

The 2026-08-04 `CP0 — Independent Security and Engineering Review` is preserved as a project-owner-supplied independent
review source. Its recovered transcription is not claimed byte-identical, and this CP0 remediation is implemented and
self-checked by Codex; the distinction is recorded rather than relabelled.
