# CP0 — Independent Security and Engineering Review

- Original date: 2026-08-04
- Original filename: `CP0_INDEPENDENT_REVIEW.md`
- Provenance: recovered from the project owner's ChatGPT project/file archive
- Recovery status: recovered transcription supplied by the project owner on 2026-08-10

This file is a recovered transcription of the substantive requirements supplied by the project owner. The original bytes
were searched for under `/home/dell`, `/home/dell/zama-recovery`, and accessible Windows user mounts but were not found.
This file is therefore not claimed to be byte-identical to the original review. Its sibling digest authenticates this
local transcription only.

## Mandatory findings before CP1

### M-1 — Development dependencies excluded from audit

Audit the complete dependency universe, including host-privileged development tools; retain machine-readable raw
evidence and re-run at dependency or lockfile changes, checkpoint transitions, and pre-deployment/security freeze.

### M-2 — Risk controls based on circular reasoning

Re-rate R-003, R-005, and R-014. Scope, architecture, and schedule decisions are not controls. Use tests, enforced
configuration, measurable checkpoint criteria, audits, or validators; otherwise retain the risk as Open.

### M-3 — Dependency/version currency unverified

For every relevant Zama/FHEVM package record the exact resolved version and lock integrity, current registry version and
receipt, and a `TRACK_CURRENT` or `HOLD_PIN` decision with rationale. An upgrade is not required merely for currency.

### M-4 — Dual SDK lineage ownership undefined

Assign non-overlapping responsibility to `@zama-fhe/relayer-sdk` and `@zama-fhe/sdk`, including contract tooling,
keeper, browser, encrypted input, user/public decryption, proofs, onchain signature verification, and settlement. Public
settlement decryption must have exactly one owner.

### M-5 — Template provenance recorded but not verified

Verify template commit `ec84e1aa1b0a3ef61d9795ef8bf367115b79272f` as belonging to the official Zama FHEVM Hardhat
template, recording repository identity, commit, branch/tag context, and method.

### M-6 — AI coding agent / deployer credential scope policy undefined

Define repository boundaries, no-secret/no-echo rules, task-specific live-signing authorization, separation of probe and
production credentials, keeper isolation, Git provenance, pre-deployment diff review, and audit provenance. Validate
that tracked source and evidence contain no private key or populated secret configuration.

### M-7 — R-008 control was an intention, not a test

Recover or reproduce the EIP-1153/transient-storage warning where applicable, preserve exact compiler output, replace
“avoid untested composition” with a named integration/regression gate, and re-rate R-008. Do not suppress the warning.

### M-8 — Reviewer independence undefined

Distinguish implementation author, same-model/self-review, fresh-session adversarial review, different-model review, and
external human/security audit. A new AI session is not organizational independence. Disclose overlap and preserve an
external independent audit requirement for final release without claiming unearned certification.

### L-1 — Decision label inconsistency

Qualify every current GO/CONDITIONAL GO/NO-GO label with its gate or stage. Retain historical documents as history.

### L-2 — Authorship identity mismatch

Record the deliberate mapping between GitHub identity `GIFTEDLOV` and Git author `Emory`, including the configured
project commit email, without rewriting history.

### L-3 — Checkpoint template asked for narrative instead of evidence paths

Require evidence artifact path, SHA-256/digest, Git commit, UTC timestamp where applicable, and command/test identifier
for every material gate. Narrative cannot substitute for evidence.

### L-4 — Solidity 0.8.27 / Cancun rationale unrecorded

Record an evidence-grounded decision for Solidity 0.8.27 and the selected Cancun EVM target, including reconsideration
triggers and verified FHEVM/OpenZeppelin/transient-storage compatibility facts.

### L-5 — Relayer/chain-preset configuration provenance unrecorded

Document Sepolia preset and relayer sources, environment/config ownership, chain ID, fail-closed invalid configuration,
wrong-network behavior, and browser-versus-keeper boundaries without exposing RPC secrets.

## Additional required dispositions

Before CP1, re-rate R-003, R-005, R-010, R-011, R-012, and R-014 with verifiable controls or move them to Open, and
record the checkpoint NO-GO cut order. R-008 is also re-rated under M-7.

H-7 requires evidence for the cUSDTMock Sepolia address, provenance, reachability, and evaluator-required mint
capability unless superseded by later authority. H-8 requires an honest schedule/capacity rating, remaining programme
window, workstreams, checkpoint/no-go mechanism, and explicit cut order; “schedule” is not itself a control.
