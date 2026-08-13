# Leopold live browser E2E report

## Result

This report records the official Sepolia financial smoke against the frozen four-vault deployment. The result is
**PARTIAL**: the user-controlled private financial path reached a confirmed save, exact public bond registration, and
withdrawal, but the official Weekly round remains open for its frozen 604,800-second duration. The asynchronous Make
Public unwrap also did not reach `Complete` within the browser wait. No draw, refund, reward, or public canonical-USDC
return is claimed.

The test did not deploy a short-round disposable instance and did not use operator progression tooling. It therefore
preserves the distinction between official deployment evidence and a hypothetical short-round draw proof.

## Environment and identity

- Chain: Ethereum Sepolia, chain ID `11155111`.
- Browser: Google Chrome for Testing `151.0.7922.34`, Playwright `1.62.1`.
- Browser automation: direct Playwright fallback; the `agent-browser` executable was unavailable.
- Local URL: `http://localhost:3000`.
- User wallet and protected deployment signer address: `0x57357D26D1f56eca4556d271078A0239a7696Bbf`.
- No private key was written to the repository, evidence, logs, or screenshots.
- Chromium was made runnable with user-space shared libraries under `/tmp`; no sudo or host modification was used.

## Browser versus operator actions

The deployment, bytecode verification, manifest generation, live read validation, and receipt inspection were
operator-side tasks. Connecting the wallet, reading public USDC, initiating Make Private, revealing the private balance,
saving 0.5 USDC, entering the Weekly round with the exact bond, and withdrawing 0.5 USDC were browser-driven user
actions. No operator close, RNG, settlement, refund, reward, or draw progression was used.

## Official browser journey

1. The browser opened Leopold and connected the protected Sepolia test wallet.
2. The Add Money view read canonical Circle USDC and displayed `1.943648 USDC` before conversion. The official faucet
   surface was opened and attempted; the wallet was already funded and no new faucet receipt was observed.
3. Make Private for `1 USDC` completed with the exact approval and wrapper transactions:
   - approval: `0xda182d92a873fb8af28fabcc2ff47b778dedb31fd5b75e8635ef75dbf60b6ecc`, block `11475812`;
   - wrap: `0x9e8af67f8fd75d07462eb48afbd2324d7a5e7c9cc52c1e2ebcd08fac505a3409`, block `11475813`.
4. The private balance was masked before authorization and revealed as `1 USDC` after authorization. No private handle
   was captured in evidence.
5. The browser saved `0.5 USDC` in Weekly. Receipt:
   `0x00f6acab4e561126eb8c5669ccb0685d165bd2a984397302aa88c012b39ce5e4`, block `11475871`.
6. The browser entered round `1` and paid exactly `0.005 ETH` to the Weekly escrow. Receipt:
   `0xbfd0032cc20b9452ddce4c2e95d5930b02046a181379ded5c10b41a19b749275`, block `11475872`.
7. The live vault returned a nonzero registration-time eligibility start (`1786570716`); earlier savings were not
   included as eligibility history.
8. The browser withdrew `0.5 USDC`. Receipt: `0x0c0f94db19e3540379d64ec70a365f83a06016c7bcf7b4ab867155a1972efbf4`, block
   `11475877`.
9. Make Public was initiated, but asynchronous unwrap did not reach `Complete` within 180 seconds. No completion receipt
   was observed and the UI did not report false success.

## Live official state

After the smoke, the official Weekly vault reported round `1` as `OPEN`, with a seven-day duration, opens-at
`1786553292`, closes-at `1787158092`, and no settled aggregate or prize. The bond escrow reported the test wallet as
registered, with `5000000000000000` wei deposited, zero rewards, zero refunds, and `finalized=false`.

The exact bond profile remains `0.005 ETH`, reward per participant pass `0.00125 ETH`, and normal two-pass refund
`0.0025 ETH`. Refund and reward were not attempted because the official round was still open.

## Relayer and privacy

The current Zama relayer v2 key URL returned HTTP 200 with metadata status `succeeded`; browser private reveal worked. A
minimal Node SDK probe timed out, and the asynchronous wrapper unwrap did not complete in the browser wait. This is
recorded as an external relayer/async-processing limitation, not as a successful unshield.

The browser demonstrated that private balances remain masked until wallet authorization and that the authorized wallet
can reveal its own value. A cross-wallet unauthorized decrypt was not run in this funded official smoke, so it is not
claimed as live evidence. No exact private TWAB or private handle was published.

## Round lifecycle boundary

The official Weekly vault duration is frozen at `604800` seconds. No safe frozen acceleration mechanism was available
during this phase. Consequently, encrypted ticket generation, close, permissionless settlement, private result, refund,
reward, and Round-2 isolation were not fabricated. The contract suite and deployment validator cover the corresponding
invariants; a separate disposable short-round deployment would be required for immediate draw E2E and is not part of the
official manifest.

## Visual and route verification

The following official-config routes returned HTTP 200 and were visually inspected: `/`, `/app`, `/app/vaults`,
`/app/vaults/weekly`, `/app/prizes`, `/app/rewards`, `/app/activity`, `/app/profile`, `/app/help`, `/transparency`, and
`/ops`. The UI showed configured official state, with no `not configured`, historical cUSDT, disposable vault, or
placeholder-address labels.

Screenshots are stored under `evidence/deployment/screenshots/`. The machine-readable action record is
[LEOPOLD_LIVE_BROWSER_E2E.json](../../evidence/deployment/LEOPOLD_LIVE_BROWSER_E2E.json).

The final manifest SHA-256 is `579da28f3fb61a5b4fe89174b1a1dda23b0af0baaf44743af33766d516683e9a`; the official
deployment evidence SHA-256 is `173e21ec27700c6adf74a33c87d07bbd618c078052913e79f4a2102b749d994d`.

## Regression status

- Fixture E2E: `2 passed`, `2 skipped` because the SG5 live acknowledgement was not supplied.
- Frontend unit tests: `22 passed`.
- Frontend typecheck, lint, and build: passed.
- Keeper unit tests: `6 passed`; typecheck, lint, build, and fixture probe passed. The first probe invocation was
  sandbox-blocked on its temporary IPC pipe and passed on the permissioned rerun.
- Full contract/security suite: `562 passing`, `1 pending`.

No unified authentication work was started.
