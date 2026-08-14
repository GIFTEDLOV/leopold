# Leopold Auth Security Review

Review scope: unified auth wrapper around the frozen Leopold financial core. No Solidity, official contract address,
protocol custody, FHE calculation, TWAB, draw, settlement, or accounting code is changed by this integration.

## Review results

| Area                          | Result                           | Evidence / control                                                                                                  |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Embedded wallet creation      | PASS + dashboard prerequisite    | No creation call; embedded connector options are filtered in code and dashboard setting must remain OFF             |
| Wallet ownership              | PASS                             | Dynamic connect-and-sign mode; linked wallet must be `isAuthenticated`                                              |
| Financial wallet substitution | PASS                             | Designated wallet is compared before every financial/private action; replacement rejected                           |
| Email-only financial access   | PASS                             | Central guard requires `ACCOUNT_READY`                                                                              |
| Wrong-wallet access           | PASS                             | Address mismatch returns `FINANCIAL_IDENTITY_REQUIRED`; private session cleanup follows account changes             |
| OTP handling                  | PASS                             | OTPs delegated to Dynamic headless flow; no OTP persistence or logging                                              |
| Username collision            | PASS with dashboard prerequisite | Canonical lowercase + server-side unique field; no local race-prone availability check                              |
| Silent account merge          | PASS in code; live E2E required  | App never calls merge/transfer; Dynamic's conflict/transfer UI requires explicit confirmation and a fresh signature |
| X account confusion           | PASS by default                  | X hidden until explicitly enabled and dashboard social-linking review is complete                                   |
| Private values in auth data   | PASS                             | Auth context contains identity metadata only; no balances, handles, results, TWAB, or plaintext                     |
| Logout residue                | PASS                             | Auth identity-key change invokes existing `clearPrivateSession()` cleanup                                           |
| Wallet/network switch residue | PASS                             | Existing financial cleanup remains on account and effective-chain changes                                           |
| Session verification          | CONFIGURATION REQUIRED           | Dynamic production cookie/custom-host setup is documented; no server identity API is exposed by this repo           |
| CSRF/OAuth redirect security  | CONFIGURATION REQUIRED           | Must be enabled and constrained in Dynamic dashboard/custom hostname before live auth                               |

## Attack review

- Query-string and localStorage values are never accepted as identity ownership. The financial wallet is read from the
  authenticated Wagmi/Dynamic context.
- A connected injected address without a Dynamic ownership signature does not satisfy `walletAuthenticated`.
- A provider email collision is not resolved by client-side merging.
- A wallet already designated to another identity is not stolen or silently reassigned by Leopold; the provider must
  reject or explicitly confirm any cross-account transfer.
- A changed wallet causes a mismatch and blocks writes; it does not migrate confidential positions.
- Identity changes invoke the same private-state cleanup used by the proven financial provider.
- X display metadata is not rendered as HTML or used as a financial signer.
- Provider error details are mapped to product messages; OTPs and secrets are not logged.
- Fixture auth exists only in non-production builds with an explicit fixture variable. The production app cannot be
  unlocked with a query parameter or fixture credential.

## Explicit deployment prerequisites

Before live auth testing, the operator must configure Dynamic Email OTP, email uniqueness, the lowercase unique username
field, external EVM connect-and-sign, embedded-wallet creation OFF, allowed Sepolia network, secure cookie mode/custom
hostname, origin/redirect restrictions, and any optional X credentials. Sandbox browser-storage behavior must not be
treated as equivalent to production HttpOnly cookies.

No Critical/High/Medium code finding remains in the reviewed in-scope client wrapper. Provider conflict policy, unique
username enforcement, secure cookie mode, and real wallet signatures remain external prerequisites and are not claimed
as live proof by this repository.
