# Evidence Index

**Repository:** `/home/dell/zama-szn4` **Checkpoint:** CP0 **Index status:** Active

## Authoritative evidence

| Gate        | Status | Artifact                                           | SHA-256                                                            | Captured UTC         | Scope                                                                                                                                                                    |
| ----------- | ------ | -------------------------------------------------- | ------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CG-1 / CG-2 | PASS   | `evidence/cp0/CG1_CG2_MANIFEST_AND_ALLOWLIST.txt`  | `c370145180ff3ec241b21da3d3d38b71960c89e343050b1d4ac8c56deecc91a1` | 2026-08-04T08:11:54Z | Exact manifests, locked critical versions, committed-lockfile policy, approved build-script allow-list, and no remaining ignored builds.                                 |
| CG-3        | PASS   | `evidence/cp0/CG3_KEEPER_CREDENTIAL_ISOLATION.txt` | `c49fa6ef75cd231bf014d240a48b37582f9095363d50cac007d903aedb07009d` | 2026-08-04T08:57:52Z | Dedicated keeper credential, deployer separation, 0.1 Sepolia ETH funding ceiling, six tests, runtime probe, fail-closed missing-key behavior, and secret-ignore policy. |
| CG-4        | PASS   | `evidence/cp0/CG4_FOUNDATION_GATE.txt`             | `b692e1a2bf0e8578a20c1d916b46e5346db8c521f36a35e29e0473eec8c60791` | 2026-08-04T13:37:25Z | Complete monorepo foundation gate, dependency audit, committed-tree safety scans, and validation of baseline `eb1dac3d956c4eb8e0bdd84dc8a7a7b3d47f61d2`.                 |

## Pending CP0 evidence

| Gate | Status  | Required evidence                                                                                                                    |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SG-1 | PENDING | Live Sepolia FHECounter deployment, encrypted write, user decryption, addresses, and transaction hashes.                             |
| SG-2 | PENDING | Public decryption with proof and successful on-chain signature verification using the selected SDK lineage.                          |
| SG-3 | PENDING | Weight-domain derivation for token precision, time granularity, pool bound, round duration, aggregate TWAB, and random-ticket width. |
| SG-4 | PENDING | Pre-registered permanent benchmark protocol with circuits, repetitions, HCU limits, and GO/NO-GO criteria.                           |
| SG-5 | PENDING | Playwright browser probe for SDK web runtime, WASM initialization, public-key retrieval, and encrypted input creation.               |

## Integrity verification

Run:

```bash
sha256sum -c evidence/cp0/*.sha256
```

A checkpoint decision must cite the committed artifact paths and matching digests.
