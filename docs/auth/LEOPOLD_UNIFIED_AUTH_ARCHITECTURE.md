# Leopold Unified Auth Architecture

Status: code integration complete; corrected Dynamic Sandbox configuration and production deployment verified; live
provider authentication and authenticated financial regression remain interactive closure steps.

## Boundary

Leopold authentication is an offchain identity layer around the already frozen wallet/FHE financial application. The
protocol continues to use the explicit external EVM wallet as the owner of funds, confidential state, transactions, and
local decryption authorization.

The provider may know the following identity linkage:

```text
LeopoldIdentity {
  providerUserId
  verifiedEmail
  username (Dynamic custom metadata field `Leopold Username`)
  financialWallet
  optionalXCredential
}
```

None of those identity fields are written to Solidity contracts or financial transaction calldata. Leopold does not use
the provider to sign transactions, hold keys, decrypt FHE values, select winners, or submit financial actions.

## Selected provider and compatibility

The selected provider is Dynamic V4 with these pinned packages:

| Package                         | Version   |
| ------------------------------- | --------- |
| `@dynamic-labs/sdk-react-core`  | `5.3.0`   |
| `@dynamic-labs/ethereum`        | `5.3.0`   |
| `@dynamic-labs/wagmi-connector` | `5.3.0`   |
| `wagmi`                         | `2.14.11` |
| `viem`                          | `2.55.10` |
| `react` / `react-dom`           | `19.2.8`  |
| `next`                          | `16.3.0`  |

The Dynamic Wagmi bridge currently requires Wagmi 2, not Wagmi 3. The application keeps the existing Sepolia Wagmi
configuration and puts `DynamicWagmiConnector` inside that provider. Dynamic's embedded WaaS/turnkey connector options
are filtered out in code and must also be disabled in the dashboard. No Solidity or financial state-machine change is
part of this integration.

## Readiness states

The client exposes explicit states rather than treating a provider session as financial authorization:

`ANONYMOUS`, `EMAIL_AUTHENTICATED`, `WALLET_AUTHENTICATED_INCOMPLETE`, `PROFILE_INCOMPLETE`, `WALLET_REQUIRED`,
`ACCOUNT_READY`, `SESSION_EXPIRED`, and `ACCOUNT_CONFLICT`.

Financial/private actions require `ACCOUNT_READY`, a currently connected wallet equal to the provider-verified
designated financial wallet, and the Sepolia network. A single centralized guard is used by every financial write and
private reveal path.

## Email-first

The custom Leopold `/login` screen uses Dynamic's headless email OTP hooks:

```text
email → OTP → verified session → username → Leopold shell
       → first financial action → external wallet auth → explicit link
```

OTP generation, expiration, retry throttling, and attempt handling remain with Dynamic. Leopold never stores or logs
OTPs. Email-only users may view the shell and public information but cannot transact or decrypt private values.

## Wallet-first

The wallet path opens Dynamic's connect-and-sign flow. A connected wallet is not accepted merely because an injected
provider reports an address. Dynamic must authenticate ownership with a signature. The user then verifies email and
chooses a username before reaching `ACCOUNT_READY`.

## Explicit wallet linking and conflicts

For an authenticated email user, Leopold opens Dynamic's explicit link-wallet flow. After the wallet has completed
Dynamic ownership authentication, the user must confirm `Link this wallet to Leopold`; Dynamic's native
conflict/transfer views require their own explicit confirmation and ownership signature. The app records only the
designated wallet address in provider metadata; it never calls a merge/transfer API or migrates onchain positions.

An existing designated financial wallet cannot be silently replaced. A different connected wallet remains a mismatch and
financial writes stay disabled. Credential errors are mapped to a product message requiring the user to authenticate the
existing account before an explicit link.

The same rule applies to social credentials. No client-side “availability” check is used for username or credentials;
provider-side uniqueness and atomic conflict handling are required. The provider's dashboard configuration and live
account-linking E2E are still required to prove the exact deployed conflict policy.

## Username

The accepted public form is 3–20 characters from `a-z`, `0-9`, and `_`. Leopold trims, applies Unicode NFKC
normalization, lowercases, and validates before calling Dynamic's user update operation with
`metadata["Leopold Username"]`. The Dynamic dashboard must enforce the matching regex and unique field server-side.
Because only the canonical lowercase representation is submitted, case variants cannot be accepted as separate Leopold
usernames. Leopold does not implement a race-prone local availability check.

Usernames are private application identity. Leopold exposes no public username-to-wallet lookup, public financial
profile, public savings history, or username enumeration API.

## X / Twitter

X is an optional linked credential, not a required signup method or financial signer. The UI is hidden unless
`NEXT_PUBLIC_LEOPOLD_ENABLE_X_AUTH=1` and the Dynamic dashboard is configured for Twitter plus explicit social linking.
The current repository has no X credentials, so the safe default is hidden. X-first signup is not enabled.

## Wallet and private-state safety

The financial Wagmi hooks remain the transaction layer. Account and network changes cause the existing Zama private
session to be cleared. Auth sign-out also changes the identity key and clears decrypted balances, private results,
eligibility, and in-memory wallet linkage through the financial provider's cleanup effect. A wallet disconnect leaves
the email session intact but disables financial access.

The provider never receives balances, winnings, TWAB, odds, encrypted ticket plaintext, FHE handles, or decrypted
values. No auth analytics event contains financial values.

## Session and server boundary

Dynamic's production cookie mode is supported only after a Dynamic custom hostname is configured and supplied as
`NEXT_PUBLIC_DYNAMIC_API_BASE_URL`. That mode uses the provider's secure HttpOnly cookie. Dynamic Sandbox may use
browser storage according to provider behavior; that is documented as Sandbox behavior and is not claimed to be
production security.

This repository currently has no account-specific server identity API; financial writes remain wallet-controlled and the
central client guard wraps every write/reveal call. If a future server route exposes identity data, it must validate the
provider-issued signed session (issuer, audience, environment, user ID, scopes, and expiration) before returning it;
decoded client JWT claims are not an authorization mechanism.

## Fixtures and production gating

Auth fixtures are enabled only when `NODE_ENV !== production` and `NEXT_PUBLIC_LEOPOLD_AUTH_FIXTURE` is one of the
explicit fixture modes. Existing financial fixtures remain separately controlled by `NEXT_PUBLIC_LEOPOLD_DEV_FIXTURE`.
No query parameter, localStorage flag, or fixture credential bypasses production authentication; production has no
fixture route and fails closed without Dynamic configuration. The closure route remains production-disabled.

## Remaining setup

The current Sandbox environment ID is configured locally and in the `leopold` Vercel project, with exact localhost and
production CORS origins verified. Continue with a dedicated inbox OTP, external wallet signature/link confirmation,
provider conflict/uniqueness checks, and the authenticated Sepolia financial regression. Until those interactive steps
are completed, no live auth E2E pass is claimed.
