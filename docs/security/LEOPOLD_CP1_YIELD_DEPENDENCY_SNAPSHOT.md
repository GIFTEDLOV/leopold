# CP1 Yield Dependency Snapshot — 2026-08-12

No dependency or lockfile changed. Fresh `pnpm audit --json` returned the same severity totals as the carried CP0
snapshot: 124 advisories (1 Critical, 57 High, 54 Moderate, 12 Low). The Critical remains on the development-only
`solidity-coverage > sc-istanbul > handlebars` path. No new Critical reached contracts, confidential SDK execution,
deployment signing, build integrity, or credentials. Current advisories include development/tooling paths and known
application transitive paths; they are not suppressed or marked resolved.

HOLD_PIN remains in force. R-003, R-005, R-010, R-011, R-012, R-014 and all other open production risks remain open. The
comprehensive review is due no later than 2026-08-26 and earlier on any dependency/lockfile, FHEVM/OpenZeppelin pin,
auth/security, deployment-tooling, or exploitability trigger.
