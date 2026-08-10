# Reviewer Independence Policy

| Classification                     | Meaning                                                                                                     | May authorize                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SELF_REVIEW`                      | Implementer and reviewer are the same person/tool/session.                                                  | Local iteration only.                                                                                                   |
| `FRESH_SESSION_ADVERSARIAL_REVIEW` | Fresh context and explicit adversarial recomputation, but potentially the same operator/model/organization. | Internal checkpoint evidence when supplemented by deterministic validators; never claimed organizationally independent. |
| `CROSS_MODEL_REVIEW`               | A different model/tool reviews retained evidence and diffs with disclosed operator overlap.                 | Internal security-gate closure with deterministic evidence and owner acceptance.                                        |
| `EXTERNAL_INDEPENDENT_REVIEW`      | Independent human/security organization with no implementation responsibility.                              | Production freeze/final release security sign-off.                                                                      |

Ordinary development may continue after self-review and green automation. A security-gate closure needs at least a
fresh-session adversarial or cross-model review plus reproducible evidence and explicit disclosure. Production freeze
and final release require `EXTERNAL_INDEPENDENT_REVIEW`; no project artifact may claim OpenZeppelin certification or
equivalent unless that organization actually performed and issued it.

The 2026-08-04 `CP0 — Independent Security and Engineering Review` is preserved as a project-owner-supplied independent
review source. Its recovered transcription is not claimed byte-identical, and this CP0 remediation is implemented and
self-checked by Codex; the distinction is recorded rather than relabelled.
