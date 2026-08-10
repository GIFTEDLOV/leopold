# AI Agent, Credential, and Code-Provenance Policy

## Scope

Automated coding agents are confined to the explicitly authorized repository/workspace and named temporary evidence
locations. Unrelated filesystem, account, service, and repository changes are prohibited.

## Credentials and signing

- Never commit, print, screenshot, or retain private keys, mnemonics, RPC tokens, wallet secrets, or populated `.env`
  files in evidence.
- Live signing is allowed only when the current gate/task explicitly authorizes that exact transaction class.
- Benchmark/probe credentials must be separate from future production deployer credentials.
- Keeper credentials are dedicated and isolated under `docs/operations/KEEPER_CREDENTIAL_POLICY.md`.
- Production deployment requires a reviewed, explicit transaction plan and a fresh review of the exact staged diff.
- Test fixtures may use conspicuously deterministic local-only keys, but they must never be accepted by a live-network
  configuration.

## Provenance

All code changes are attributable through Git commits and reviewable diffs. Generated evidence records the command,
timestamp, repository base, and digest. The implementing agent must disclose its role and may not label self-review as
independent. Final release requires the independent external audit package defined by the review policy.

## Validation

CP0 validation scans tracked paths and evidence structure for private-key, mnemonic, and secret-config indicators. It
reports categories and paths, never secret values. A confirmed live credential in Git is a critical stop condition.
