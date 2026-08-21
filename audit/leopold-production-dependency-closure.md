# Leopold Production Dependency Audit Closure

Date: 2026-08-21

Committed baseline: `3174b4fe44ad5469341d44128c6e33f3f07aeb60`

Scope: `pnpm audit --prod` for the root, frontend, keeper, and workspace dependency graph

## Executive result

The original production audit contained 24 advisory records: 5 High, 18 Moderate, and 1 Low. Every record originated
from a transitive dependency of the frontend workspace. There were no direct-dependency advisories, keeper advisories,
root contract/tooling advisories, or advisories in the frozen Solidity dependency families.

The final machine-readable and human-readable production audits both pass with 0 High, 0 Moderate, 0 Low, and 0 Critical
advisories. No advisory allowlist or audit-policy exception was added.

The remediation preserves Dynamic `5.3.0`, Wagmi `2.14.11`, Viem `2.55.10`, Next.js `16.3.0`, Zama SDK `3.4.0`, Ethers
`6.17.0`, all FHEVM/OpenZeppelin versions, and every frozen contract source and deployment address.

## Preservation record

Before dependency work:

- Intentional hardening tracked-diff SHA256: `fae3d38e1bf2ef2f14b19cd160cc722a9faf6ae52b8cac5fadd321d1468f6182`.
- Every untracked hardening source/test/validator file was inventoried and individually hashed.
- Baseline lockfile SHA256: `6dd1a15aa7289bbcd9b3f5f89b257095f53e1a6c7bf35d6c7078bd2d4c28f153`.
- No reset, stash, clean, checkout, or destructive worktree command was used.

The hardening-only diff and all original untracked hardening file hashes were rechecked after remediation. Dependency
work is confined to `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `packages/bigint-buffer-safe/`, plus this report. The
frontend direct-dependency manifest is unchanged from the committed baseline.

## Classification model

- **A — PRODUCTION_RUNTIME_REACHABLE:** the package and advisory-relevant behavior can execute in a configured Leopold
  browser path.
- **B — PRODUCTION_RUNTIME_PRESENT_BUT_AFFECTED_CODE_UNREACHABLE:** the package is in the deployable graph, but
  Leopold's configuration and observed consumers do not invoke the affected API/path.
- **C — BUILD_OR_CONTRACT_TOOLING_ONLY:** used during build, not shipped as executable Leopold application behavior.
- **D — TRANSITIVE_OF_FROZEN_CONTRACT_DEPENDENCY:** none.
- **E — FALSE_OR_STALE_AUDIT_GRAPH_RESULT:** none. Some registry remediation metadata was stale, but the vulnerable
  packages were genuinely present.
- **F — UNKNOWN — REQUIRES REVIEW:** none.

## Original path legend

- **P1:** `frontend>wagmi>@wagmi/connectors>@metamask/sdk` (and its `@metamask/sdk-communication-layer` child).
- **P2:** `frontend>wagmi>@wagmi/connectors>@walletconnect/ethereum-provider>@walletconnect/*`.
- **P3:** `frontend>@dynamic-labs/{ethereum,sdk-react-core,wagmi-connector}>...>@dynamic-labs-wallet/core>axios`.
- **P4:**
  `frontend>@dynamic-labs/ethereum>@dynamic-labs/waas-evm>@dynamic-labs/waas>@dynamic-labs/solana-core>@solana/spl-token>@solana/buffer-layout-utils>bigint-buffer`.
- **P5:**
  `frontend>{wagmi,@zama-fhe/react-sdk,@dynamic-labs/wagmi-connector}>wagmi>@wagmi/connectors>{@coinbase/wallet-sdk,@walletconnect/...}>bn.js`.
- **P6:**
  `frontend>@dynamic-labs/ethereum>@dynamic-labs-connectors/metamask-evm>@metamask/connect-evm>...>@metamask/utils>lodash`;
  additional paths are `frontend>@dynamic-labs/sdk-react-core>{formik,yup}>lodash`.
- **P7:** `frontend>next>postcss>nanoid`.
- **P8:** `frontend>...>@walletconnect/keyvaluestorage>unstorage>anymatch>picomatch`.
- **P9:** Dynamic wallet-core, MetaMask, WalletConnect, and Solana paths ending in `uuid`.

## Advisory-by-advisory closure

| Advisory                                                                                                  | Severity | Package / original version                 | Original path (count) | Class | Runtime relevance and preconditions                                                                                                                                                                                                                                         | Remediation / final version                                                                                                                                                                             | Verification                                                                                                              |
| --------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------ | --------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-qj3p-xc97-xw74](https://github.com/advisories/GHSA-qj3p-xc97-xw74) / audit 1107594                  | Moderate | `@metamask/sdk` 0.32.0                     | P1 (3)                | A     | MetaMask/injected-wallet connector code is available at runtime; advisory concerns exposure through the malicious `debug@4.4.2` release.                                                                                                                                    | Exact transitive override to `@metamask/sdk` 0.33.1, which pins `debug` 4.3.4.                                                                                                                          | Removed from final audit; Dynamic/Wagmi provider tests and build pass.                                                    |
| [GHSA-qj3p-xc97-xw74](https://github.com/advisories/GHSA-qj3p-xc97-xw74) / audit 1107592                  | Moderate | `@metamask/sdk-communication-layer` 0.32.0 | P1 (3)                | A     | Communication-layer code is reachable when the MetaMask SDK connector is selected.                                                                                                                                                                                          | Pulled as exact 0.33.1 by the fixed MetaMask SDK.                                                                                                                                                       | Removed from final audit.                                                                                                 |
| [GHSA-x3ff-w252-2g7j](https://github.com/advisories/GHSA-x3ff-w252-2g7j) / audit 1116139                  | Moderate | `@stablelib/ed25519` 1.0.3                 | P2 (24)               | A     | Old WalletConnect relay authentication verifies Ed25519 signatures; malleability matters where signature bytes are treated as unique.                                                                                                                                       | Override the exact old WalletConnect provider 2.17.0 to compatible 2.23.2; its relay stack uses Noble and removes StableLib entirely.                                                                   | Package absent from final production graph and audit.                                                                     |
| [GHSA-42h9-826w-cgv3](https://github.com/advisories/GHSA-42h9-826w-cgv3) / audit 1123882                  | Moderate | `axios` 1.16.0                             | P3 (52)               | A     | Dynamic's browser HTTP client is reachable; adversarial recursive form structures are required.                                                                                                                                                                             | Range-limited transitive override to `axios` 1.18.0.                                                                                                                                                    | Removed from final audit; auth/provider tests and build pass.                                                             |
| [GHSA-pmv8-rq9r-6j72](https://github.com/advisories/GHSA-pmv8-rq9r-6j72) / audit 1123885                  | Moderate | `axios` 1.16.0                             | P3 (52)               | A     | Dynamic HTTP/form serialization is runtime code; exploit requires attacker-influenced deeply recursive form keys.                                                                                                                                                           | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-jqh4-m9w3-8hp9](https://github.com/advisories/GHSA-jqh4-m9w3-8hp9) / audit 1123957                  | Moderate | `axios` 1.16.0                             | P3 (52)               | B     | Affected Fetch `ReadableStream` upload/max-body path is present, but Leopold does not construct streamed Dynamic uploads.                                                                                                                                                   | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-mmx7-hfxf-jppx](https://github.com/advisories/GHSA-mmx7-hfxf-jppx) / audit 1123959                  | Moderate | `axios` 1.16.0                             | P3 (52)               | A     | Request construction is reachable; attack requires prototype pollution before request creation.                                                                                                                                                                             | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-f4gw-2p7v-4548](https://github.com/advisories/GHSA-f4gw-2p7v-4548) / audit 1123961                  | Moderate | `axios` 1.16.0                             | P3 (52)               | B     | `NO_PROXY` handling is a Node adapter path; Leopold's affected dependency is used in the browser frontend.                                                                                                                                                                  | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-gcfj-64vw-6mp9](https://github.com/advisories/GHSA-gcfj-64vw-6mp9) / audit 1123967                  | High     | `axios` 1.16.0                             | P3 (52)               | B     | Inherited proxy handling is specific to the Node HTTP adapter; no Leopold server route uses Dynamic's wallet client to issue such requests.                                                                                                                                 | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-hcpx-6fm6-wx23](https://github.com/advisories/GHSA-hcpx-6fm6-wx23) / audit 1123969                  | Moderate | `axios` 1.16.0                             | P3 (52)               | A     | Browser form serialization is present; crafted metatoken input is required.                                                                                                                                                                                                 | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-7q8q-rj6j-mhjq](https://github.com/advisories/GHSA-7q8q-rj6j-mhjq) / audit 1123971                  | Moderate | `axios` 1.16.0                             | P3 (52)               | A     | Nested request options are runtime reachable; exploitation requires prior prototype pollution.                                                                                                                                                                              | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-mwf2-3pr3-8698](https://github.com/advisories/GHSA-mwf2-3pr3-8698) / audit 1123973                  | Moderate | `axios` 1.16.0                             | P3 (52)               | B     | HTTP/2 streamed upload enforcement is a Node path not used by the frontend.                                                                                                                                                                                                 | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-xj6q-8x83-jv6g](https://github.com/advisories/GHSA-xj6q-8x83-jv6g) / audit 1138749                  | Moderate | `axios` 1.16.0                             | P3 (52)               | A     | Auth-option construction is reachable; exploitation requires polluted prototypes.                                                                                                                                                                                           | `axios` 1.18.0.                                                                                                                                                                                         | Removed from final audit.                                                                                                 |
| [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) / CVE-2025-3194 / audit 1103747  | High     | `bigint-buffer` 1.1.5                      | P4 (1)                | B     | Dynamic's Solana/WaaS branch is disabled by Leopold's external-EVM-wallet policy. In browser builds the package maps to pure JavaScript; the vulnerable native Node binding is not selected. The package was still genuinely present and could not remain in a green graph. | Replaced by private workspace package `bigint-buffer` 1.1.6-leopold.0 implementing the same four conversion exports in pure JavaScript with no native binding. Upstream has no published fixed release. | 512-byte advisory-scale conversion test passes; original package is absent from final audit graph; frontend build passes. |
| [GHSA-378v-28hj-76wf](https://github.com/advisories/GHSA-378v-28hj-76wf) / audit 1113441                  | Moderate | `bn.js` 5.2.2                              | P5 (13)               | A     | Coinbase connector parsing is runtime available; exploit requires a crafted value reaching the vulnerable infinite-loop case.                                                                                                                                               | Patch override to `bn.js` 5.2.3.                                                                                                                                                                        | Removed from final audit.                                                                                                 |
| [GHSA-378v-28hj-76wf](https://github.com/advisories/GHSA-378v-28hj-76wf) / audit 1113442                  | Moderate | `bn.js` 4.12.2                             | P2/P5 (18)            | A     | The old WalletConnect elliptic chain was runtime available.                                                                                                                                                                                                                 | Removed with WalletConnect provider 2.17.0→2.23.2; a defensive `bn.js` 4.x patch override to 4.12.3 also prevents reintroduction.                                                                       | Version/path absent from final production graph and audit.                                                                |
| [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84) / audit 1112030                  | Low      | `elliptic` 6.6.1                           | P2 (18)               | A     | Old WalletConnect cryptography was runtime available. No `elliptic` 6.6.2 package is published.                                                                                                                                                                             | Removed the package by overriding WalletConnect provider 2.17.0 to 2.23.2, whose utility stack uses Noble cryptography.                                                                                 | Package absent from final production graph and audit.                                                                     |
| [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) / audit 1115806                  | High     | `lodash` 4.17.21                           | P6 (7)                | B     | Consumers import `memoize`, `has`, casing, and map helpers; Leopold/parents do not invoke attacker-controlled `_.template` imports-key compilation.                                                                                                                         | Compatible minor override to published `lodash` 4.18.1.                                                                                                                                                 | Removed from final audit; MetaMask/Dynamic tests and build pass.                                                          |
| [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh) / audit 1115810                  | Moderate | `lodash` 4.17.21                           | P6 (7)                | B     | Audited consumers do not call affected `unset`/`omit` APIs on attacker-controlled paths.                                                                                                                                                                                    | `lodash` 4.18.1.                                                                                                                                                                                        | Removed from final audit.                                                                                                 |
| [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) / audit 1120370                  | Moderate | `lodash` 4.17.21                           | P6 (7)                | B     | Same path and preconditions as the later `unset`/`omit` advisory.                                                                                                                                                                                                           | `lodash` 4.18.1.                                                                                                                                                                                        | Removed from final audit.                                                                                                 |
| [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) / audit 1139427                  | High     | `nanoid` 3.3.16                            | P7 (1)                | C     | Introduced by Next.js→PostCSS for build processing; Leopold does not expose a custom zero-size Nano ID generator at runtime.                                                                                                                                                | Patch override to `nanoid` 3.3.18.                                                                                                                                                                      | Removed from final audit; Next production build passes.                                                                   |
| [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p) / audit 1115549                  | Moderate | `picomatch` 2.3.1                          | P8 (100)              | B     | Present below WalletConnect storage; Leopold does not expose POSIX glob patterns to this internal storage path.                                                                                                                                                             | Patch override to `picomatch` 2.3.2.                                                                                                                                                                    | Removed from final audit.                                                                                                 |
| [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) / audit 1115552                  | High     | `picomatch` 2.3.1                          | P8 (100)              | B     | Same internal storage path; no user-controlled extglob interface is exposed by Leopold.                                                                                                                                                                                     | `picomatch` 2.3.2.                                                                                                                                                                                      | Removed from final audit.                                                                                                 |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) / CVE-2026-41907 / audit 1119441 | Moderate | `uuid` 8.3.2, 9.0.1, 11.1.0                | P9 (94)               | B     | Affected APIs are v3/v5/v6 with a caller-provided output buffer. All audited Dynamic wallet-core, MetaMask SDK, and Jayson consumers call `v4()` without a buffer.                                                                                                          | Range-limited override for installed 8.x/9.x/11.1.0 lines to 11.1.1. This is the sole transitive major resolution; v11 retains CJS, ESM/browser exports and the used `v4()` API.                        | Removed from final audit; CJS consumers resolve, 194 frontend tests and production build pass.                            |

## Dependency and lockfile changes

Active pnpm overrides were added in `pnpm-workspace.yaml` for:

- `@metamask/sdk` 0.32.0 → 0.33.1;
- `@walletconnect/ethereum-provider` 2.17.0 → 2.23.2;
- `axios` 1.x vulnerable ranges → 1.18.0;
- `bigint-buffer` → the private workspace compatibility package;
- vulnerable `bn.js` 4.x → 4.12.3 and 5.x → 5.2.3;
- vulnerable `lodash` 4.x → 4.18.1;
- vulnerable `nanoid` 3.x → 3.3.18;
- vulnerable `picomatch` 2.x → 2.3.2;
- installed vulnerable `uuid` 8.x/9.x/11.1.0 → 11.1.1.

No override was removed. The pre-existing top-level `package.json` override block was left untouched; pnpm 11 records
active workspace overrides from `pnpm-workspace.yaml` in the lockfile. Final lockfile SHA256:
`08c02e6b9eb4975c8c036277e36b78e78b0c969727de42f9c50b314e2c8dc9c2`.

## No-fix advisory handling

No advisory was ignored.

- GitHub's reviewed `bigint-buffer` advisory states that no patched upstream release exists, and npm publishes no 1.1.6.
  The package's vulnerable behavior is in its native Node binding. The local replacement has no native code and
  exercises the advisory-scale input deterministically.
- The old StableLib and elliptic packages were removed by selecting the already-compatible newer WalletConnect provider
  line rather than forcing unpublished versions.
- `lodash` 4.18.1 is published and satisfies the audit's fixed range even though the initially suggested 4.17.24 version
  is not published.

## Frozen protocol verification

- Contract source changed: no.
- Deployment address/configuration changed: no.
- ABI or state-machine source changed: no.
- LeopoldVault runtime: 23,531 bytes.
- EIP-170 headroom: 1,045 bytes.
- LeopoldVault runtime SHA256: `96020d75ea78c1adb8c80f56544e7ab381934f3563242946825fe343e3ddf301`.
- Contract freeze digest: `38f11661d7871f3aeb253564f6ca7ec24d1eaded54bf2ac64be3cd7f839995c7`.
- Production manifest SHA256: `438ea670c13e888db81eef5c7a64ea2943aa6d9f2c4faac604fe09850964d5aa`.

## Verification results

- `pnpm install --frozen-lockfile`: PASS.
- `pnpm audit --prod`: PASS — no known vulnerabilities.
- `pnpm audit --prod --json`: PASS — High 0, Moderate 0, Low 0, Critical 0.
- Contract compile/freeze/bytecode/release validators: PASS.
- Contracts: 563 passing, 1 Sepolia-only pending.
- P-01 confidential cap, FHE, randomness, TWAB, settlement, and principal/strategy regressions: PASS within the full
  suite.
- Frontend typecheck and lint: PASS.
- Frontend tests: 194/194 PASS.
- Frontend production build: PASS.
- Keeper typecheck, lint, tests (6/6), build, and fixture probe: PASS.
- Repository TypeScript build: PASS.
- Local pure-JavaScript bigint compatibility tests: PASS.
- Localhost `:3001` `/ops` and `/api/health`: HTTP 200; expected public status content and security headers present;
  health payload contains none of the prohibited confidential or identity fields. Automated browser launch was
  unavailable because the host Chromium runtime lacks `libnspr4`, so this final check used rendered HTTP output; the
  previously completed hardening browser verification remains unchanged.

## Final counts

| Severity | Before | After |
| -------- | -----: | ----: |
| Critical |      0 |     0 |
| High     |      5 |     0 |
| Moderate |     18 |     0 |
| Low      |      1 |     0 |

Production dependency audit closure is complete without an allowlist, contract change, deployment change, or direct
framework-version change.
