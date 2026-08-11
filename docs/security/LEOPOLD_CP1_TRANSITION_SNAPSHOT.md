# Leopold CP1 Transition Dependency and Source Snapshot

Captured 2026-08-11 at the CP1 transition. `pnpm audit --json` covered dev dependencies and returned exit 1 for
findings. Totals are unchanged from CP0: 124 advisories—1 Critical, 57 High, 54 Moderate, 12 Low—over 1,108
dependencies. Canonical advisory identity/severity/path digest is unchanged at
`7bb2cf84efe386b35a9918c5fa0c66ee9540e01f056081ac5c6524fd9f5c42ad`: no added, removed, severity-changed, or path-changed
advisory. The Critical remains the dev-only `solidity-coverage > sc-istanbul > handlebars` path. No CP1 dependency or
lockfile changed, and no new production/deployment/signing blocker was identified. Pins remain `HOLD_PIN`.

Installed implementation authority:

- `@fhevm/solidity 0.11.1`: euint128 RNG, comparison and public-scalar remainder exist; division/remainder accept only a
  plaintext RHS; widening is explicit.
- `@openzeppelin/confidential-contracts 0.5.1`: callback receives actual `sent`, returns encrypted acceptance, and
  refund is best effort; transferFrom requires time-bounded operator authority. Leopold selected transfer-and-call to
  avoid a persistent operator, with the constrained callback threat controls recorded separately.
- Current Zama docs agree on plaintext divisors and current Sepolia core addresses. Installed source wins on
  compile/API.

Official cUSDT was rechecked read-only at finalized Sepolia block 11,465,488,
`0x90c86799b2574b37c68beac7f431175a00104bef033de3fa11a3528517813c29`. Registry
`0x2f0750Bbb0A246059d80e94c454586a7F27a128e` reports wrapper `0x4E7B06D78965594eB5EF5414c357ca21E1554491` valid and
bidirectionally associated with `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0`. Wrapper metadata remains Confidential USDT
(Mock)/cUSDTMock, six decimals, rate 1; underlying remains Tether USD (Mock)/USDTMock, six decimals. All three addresses
had code. No transaction was sent.

Residual Stage-0 risks and every advisory must be revisited no later than the 2026-08-26 contract/security freeze and
again before deployment/submission. Earlier triggers: any dependency/lockfile, Zama/FHEVM/OZ pin, auth/security
dependency, deployment tooling change, or newly exploitable advisory.

Primary current sources inspected: Zama's Solidity operations and Sepolia contract-address documentation, Zama
protocol-apps commit `aa77db0d11567dab81f52a2edbd4f39abc8bb104`, its Sepolia address table and wrapper-registry
contract, and OpenZeppelin Confidential Contracts 0.5.1 installed source (`IERC7984`, `IERC7984Receiver`, `ERC7984`, and
`ERC7984ERC20Wrapper`). Current online docs informed the review; installed pinned source is implementation authority.
