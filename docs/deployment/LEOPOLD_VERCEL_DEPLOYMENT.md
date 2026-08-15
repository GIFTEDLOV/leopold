# Leopold Vercel Deployment

Deployment date: 2026-08-15

## Deployment

- Vercel project: `leopold`
- Frontend root directory: `frontend`
- Framework: Next.js
- Preview URL: <https://leopold-re5y1oucr-kolofahkelvin16-6437s-projects.vercel.app>
- Production URL: <https://leopold-pi.vercel.app>
- Custom domain: none; the production URL is Vercel-assigned HTTPS.
- Vercel deployment protection was disabled for this project so the public origin can be used for CORS and OAuth website
  settings.

The preview and production deployments completed successfully. The remote build used `next build` and completed
TypeScript checking and static page generation. The local frontend typecheck, lint, tests, and production build also
passed. The broader root `pnpm check:all` run had one unrelated SG-2 helper timeout after 561 passing checks and one
pending check.

## Public route checks

The following production routes returned HTTP 200:

- `/`
- `/login`
- `/onboarding`
- `/privacy`
- `/terms`
- `/transparency`
- `/app`
- `/app/profile`

The following production-only internal/test routes returned HTTP 404:

- `/e2e-closure`
- `/sg5-probe`
- `/api/sg5-health`

Fixture query parameters did not enable test authentication or expose the internal routes. The production login page
honestly reports that authentication configuration is not yet available.

## Legal pages

`/privacy` documents external authentication processing, Dynamic's possible metadata, the boundary around confidential
financial plaintext, public blockchain activity, public prize-round registration and settlement bond, aggregate strategy
activity, initial shield/unshield amounts, and wallet control.

`/terms` documents Sepolia/testnet operation, test-asset limitations, wallet control and security responsibility,
non-custody of private keys, protocol and infrastructure availability, no guarantee of winnings, and the absence of
investment advice.

## Dynamic configuration

No Dynamic environment ID or Dynamic secret was added. The application fails closed with an authentication-configuration
message until the legitimate production or sandbox environment ID is supplied.

Add this exact production origin to Dynamic CORS:

`https://leopold-pi.vercel.app`

Keep `http://localhost:3000` for local Sandbox testing. Dynamic's generated callback/redirect URL remains the callback
value shown in the Dynamic dashboard; it is not replaced with a Vercel URL.

## X/Twitter values

- Website URL: <https://leopold-pi.vercel.app>
- Organization URL: <https://leopold-pi.vercel.app>
- Privacy Policy URL: <https://leopold-pi.vercel.app/privacy>
- Terms of Service URL: <https://leopold-pi.vercel.app/terms>

## Security and visual review

- No Dynamic, X, Vercel, wallet, RPC, or private-key secrets were added to the deployment configuration.
- Public HTML did not contain secret-like values.
- No discovered JavaScript source map returned HTTP 200.
- The official frontend contract manifest was not modified.
- Browser visual inspection could not launch because the installed Chromium runtime is missing the host library
  `libnspr4.so`; HTTPS route and content checks passed instead.
