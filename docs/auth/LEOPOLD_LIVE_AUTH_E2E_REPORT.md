# Leopold Live Dynamic Auth E2E Report

> Historical checkpoint note: the interactive-auth and authenticated-browser gaps described below were subsequently
> completed manually. See
> [`docs/release/LEOPOLD_CURRENT_MANUAL_E2E_EVIDENCE.md`](../release/LEOPOLD_CURRENT_MANUAL_E2E_EVIDENCE.md) for the
> current operator-reported status. The original checkpoint text and its evidence classification are retained below for
> provenance.

## Status

`BLOCKED — interactive Sandbox identity and external wallet signer required`

This is a truthful checkpoint report, not a live-auth pass. The Dynamic Sandbox configuration, frontend mapping, public
deployment, guards, and non-interactive regression checks were verified on 2026-08-15. The live account and financial
steps were not fabricated or bypassed.

## Verified preconditions

- Dynamic Sandbox environment ID: `f740e887-1e9f-45e4-bd06-35baec8f78d5`.
- Public URL: `https://leopold-pi.vercel.app`.
- Dynamic CORS: exactly `http://localhost:3000` and `https://leopold-pi.vercel.app`.
- Effective embedded-wallet creation: disabled; no embedded chain enabled.
- External wallet login: visible and enabled; multi-wallet: enabled.
- Built-in Username: absent; custom `Leopold Username`: required, unique, text, regex `^[a-z0-9_]{3,20}$`.
- Leopold maps the custom field through `user.metadata["Leopold Username"]`.
- Vercel production routes load; internal test routes remain 404, including fixture query attempts.
- Dynamic 5.3.0/Wagmi 2.14.11 compatibility is verified by the pinned package set, current Dynamic documentation, source
  inspection, and frontend build/tests.

## Not yet performed

The following remain
`NOT RUN — no dedicated reachable Sandbox inbox and no interactive external wallet signer were available in this workspace`:

- real email OTP, invalid/resend/expiry handling, email-first onboarding;
- provider-side custom username creation, collision, case-fold collision, and account restoration;
- explicit external-wallet link confirmation and `ACCOUNT_READY`;
- wallet-first, returning-user, wrong-wallet, disconnect, sign-out, wallet-uniqueness, and no-silent-merge flows;
- X linking/login/conflict flows;
- authenticated private reveal authorization;
- authenticated Sepolia Make Private → reveal → Save → Withdraw regression, plus optional prize/Make Public checks;
- authenticated provider-data and browser-storage review.

## Interactive continuation point

Use a dedicated Sandbox test email in `http://localhost:3000/login`, complete the OTP from that inbox, choose a unique
canonical username, then connect and sign an explicitly controlled external Sepolia wallet. Do not send OTPs, wallet
private keys, session tokens, or OAuth secrets in chat or commit them to the repository.

## Integrity

- No Solidity, ABI, official Sepolia address, or official financial manifest change.
- Official manifest SHA-256 remains `579da28f3fb61a5b4fe89174b1a1dda23b0af0baaf44743af33766d516683e9a`.
- No Dynamic server token, X client secret, OTP, email address, wallet private key, or session token is recorded.
