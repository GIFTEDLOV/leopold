# Leopold Dynamic Configuration

This document separates dashboard work from code that is already present in the repository. It is intentionally an
operator checklist: no Dynamic environment ID, provider secret, email address, or OAuth secret belongs in git.

## Package set used by the repository

All Dynamic V4 React packages are pinned to `5.3.0`:

```text
@dynamic-labs/sdk-react-core 5.3.0
@dynamic-labs/ethereum      5.3.0
@dynamic-labs/wagmi-connector 5.3.0
wagmi                       2.14.11
viem                        2.55.10
```

The Dynamic core API dependency resolved by `5.3.0` is `0.0.1118`. Do not upgrade one `@dynamic-labs/*` package
independently.

## Dashboard configuration required from the operator

In the Dynamic environment used by Leopold:

1. Enable Email as an authentication provider.
2. Enable email OTP verification. Dynamic's email verification setting also enforces email uniqueness; verify that it is
   enabled in the environment.
3. Enable external EVM wallets and connect-and-sign authentication.
4. Enable Ethereum Sepolia (`11155111`) for wallet authentication.
5. Disable `Create on Sign up` for embedded wallets. Disable any automatic embedded EVM or smart-wallet substitution.
   Leopold does not call an embedded-wallet creation API.
6. Configure the required username field. Enforce: `^[a-z0-9_]{3,20}$`, required, and unique. The value sent by Leopold
   is already canonical lowercase. Dynamic-side uniqueness is the required atomic persistence guarantee; Leopold does
   not perform a client-side availability race.
7. Keep multi-wallet linking explicit. Do not enable a setting that silently replaces the primary wallet when an account
   changes. The repository opens Dynamic's link-wallet prompt and never calls a transfer or merge API itself; the
   provider's conflict/transfer confirmation and fresh ownership signature must remain enabled.
8. Leave X/Twitter disabled until OAuth credentials, redirect URLs, and explicit social linking have been reviewed. X is
   optional and is hidden by Leopold by default.
9. For production cookie authentication, configure Dynamic's custom hostname, secure HttpOnly cookie mode, allowed
   origins, and redirect URLs. Set the matching `NEXT_PUBLIC_DYNAMIC_API_BASE_URL` in the frontend deployment.
10. Ensure provider analytics and custom metadata do not receive confidential financial values. The only Leopold
    metadata used for the financial designation is the public wallet address, not a secret or decrypted value.

## Code already configured in this repository

`frontend/components/providers.tsx` configures:

- `initialAuthenticationMode: "connect-and-sign"`;
- `enableConnectOnlyFallback: false`;
- Sepolia in the existing Wagmi config;
- Dynamic's external Ethereum connector bridge;
- a `walletsFilter` that removes Dynamic WaaS/turnkey embedded connector options;
- the multi-wallet prompt widget used by the explicit link flow;
- no embedded-wallet creation call;
- no automatic financial wallet substitution.

The installed bridge is compatible with Wagmi `2.14.11`; it does not provide a Wagmi 3 integration. Network and wallet
matching are enforced by Leopold's own financial guard, so the application does not rely on Dynamic's connect-only
`networkValidationMode` setting.

The custom `/login` and `/onboarding` screens use the headless OTP and user profile hooks. Dynamic's internal auth flow
is used only for wallet selection, wallet ownership signatures, and the explicit link-wallet modal.

## Environment variables

Set these in `.env.local` for development or in the deployment secret/config store for production:

```text
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=<client-safe Dynamic environment ID>
NEXT_PUBLIC_DYNAMIC_API_BASE_URL=<optional Dynamic custom-host API base URL>
NEXT_PUBLIC_LEOPOLD_ENABLE_X_AUTH=0
```

`DYNAMIC_API_SECRET` is reserved for future server-side provider API use and must never be renamed with a `NEXT_PUBLIC_`
prefix or sent to the browser.

The following are test-only and must not be set in production:

```text
NEXT_PUBLIC_LEOPOLD_AUTH_FIXTURE=anonymous|email|wallet|profile-missing|ready|mismatch|expired|conflict|x-unavailable
NEXT_PUBLIC_LEOPOLD_DEV_FIXTURE=1
```

## What Codex cannot configure here

The repository does not contain a Dynamic dashboard credential or a provider admin API token. Therefore it cannot create
the environment, enable Email, create the unique username field, add Twitter credentials, or turn on production cookie
mode. The app intentionally fails closed until the client environment ID is supplied.
