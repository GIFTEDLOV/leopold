# Evidence Standard

## Purpose

Every checkpoint claim must be supported by a retained artifact that an independent reviewer can verify without relying
on narrative assertions.

## Required artifact fields

Each raw text artifact must contain:

1. gate or condition identifier;
2. UTC timestamp;
3. repository path;
4. current Git commit or `UNCOMMITTED` when captured before the first commit;
5. exact command or command group executed;
6. complete stdout and stderr;
7. explicit PASS or FAIL conclusion;
8. SHA-256 digest stored in a sibling `.sha256` file.

## File naming

Use uppercase gate identifiers followed by a concise description:

```text
evidence/<checkpoint>/<GATE>_<DESCRIPTION>.txt
evidence/<checkpoint>/<GATE>_<DESCRIPTION>.txt.sha256
```

Examples:

```text
evidence/cp0/CG1_CG2_MANIFEST_AND_ALLOWLIST.txt
evidence/cp0/CG3_KEEPER_CREDENTIAL_ISOLATION.txt
```

## Integrity rules

- Never edit a raw evidence file after its digest is generated.
- When a gate is rerun, replace the artifact only when the new run is the authoritative result.
- Regenerate the sibling digest after every authoritative rerun.
- Do not claim historical evidence that was not retained.
- Record failed runs when they materially explain a remediation decision.
- Never include private keys, mnemonics, API keys, secret-bearing RPC URLs, or populated environment files.
- Redact secrets before capture; do not rely on later deletion.
- Transaction hashes, public contract addresses, package integrity hashes, and public deployment manifests are allowed.

## Evidence index

`evidence/INDEX.md` is the authoritative index. Each entry must include:

- condition or gate;
- status;
- artifact path;
- SHA-256 digest;
- capture timestamp;
- brief scope statement.

The index must distinguish:

- `PASS`: evidence exists and the gate passed;
- `FAIL`: evidence exists and the gate failed;
- `PENDING`: evidence has not yet been captured;
- `SUPERSEDED`: retained only for history and not authoritative.

## Checkpoint rule

A checkpoint cannot receive GO on the basis of an undocumented terminal result. The evidence artifact and its digest
must be committed or otherwise immutably retained before sign-off.
