# Leopold CP1 Slice 2 Dependency Snapshot

Captured 2026-08-11 with `pnpm audit --json` over the complete workspace, including development dependencies.

| Severity | CP1 foundation | Slice 2 | Change |
| -------- | -------------: | ------: | -----: |
| Critical |              1 |       1 |      0 |
| High     |             57 |      57 |      0 |
| Moderate |             54 |      54 |      0 |
| Low      |             12 |      12 |      0 |
| Total    |            124 |     124 |      0 |

Dependency count remains 1,108. Advisory identities, severity, and paths match the CP1 foundation snapshot. The Critical
remains the development-only `solidity-coverage > sc-istanbul > handlebars` path. No dependency version or lockfile was
changed by this slice, and no new production/deployment/signing/confidential-SDK/build-integrity stop condition was
found.

HOLD_PIN decisions and R-003/R-005/R-010/R-011/R-012/R-014 remain open. Review remains mandatory no later than the
2026-08-26 contract/security freeze and earlier on any defined dependency, lockfile, FHE/Zama/OpenZeppelin, auth,
deployment-tooling, or exploitability trigger.
