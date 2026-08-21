# Leopold Final UI Handoff

Status: headless integration boundary frozen at commit `3ea966ba1b9b13ce4d799bfe00b990c7689a26ba` plus this handoff
pass.

This is the implementation contract for Leopold's final presentation layer. It does not authorize changes to protocol,
authentication, wallet-session, privacy, reliability, deployment, or financial behavior. The current UI remains a
working reference until the advanced visual layer replaces it.

## 1. Brand

- Product: **Leopold**
- Category: **Private Prize Savings**
- Promise: **Save privately. Win privately. Withdraw anytime.**
- Voice: calm, trustworthy, plain-language, consumer financial UX. Be precise about privacy without implying anonymity.
- Primary action: **+ Add Money**
- Primary navigation, in order: **Dashboard, Vaults, Prizes, Activity, Rewards, Profile**

Do not rename the product, reduce it to a prize demo, or present savings principal as a wager. Prize entry and the
public ETH settlement bond are separate from private savings principal.

## 2. Product thesis

Leopold lets a user convert canonical public USDC to Private USDC, save privately in one or more of four official
vaults, enter time-weighted prize rounds, reveal only their own private values, and withdraw principal independently of
prize outcomes. Genuine vault yield, sponsor contributions, and rollover fund prizes; principal does not.

The frontend is not a security boundary. It communicates and invokes the already-frozen protocol. It must not reproduce
TWAB, randomness, winner-selection, settlement, FHE permission, or strategy accounting logic.

## 3. User journey

1. A user signs in by verified email or returns through the supported wallet-first Dynamic flow.
2. The user completes required account information and chooses a unique username.
3. The user links or confirms one verified external EVM financial wallet. Leopold does not create an embedded wallet.
4. A wallet session starts only after an explicit user action. The verified account and Ethereum Sepolia are checked.
5. **+ Add Money** explains and performs the public USDC → Private USDC transition.
6. The user chooses Daily, Weekly, Monthly, or Boost. Weekly is recommended/default, never exclusive.
7. The user saves privately and may separately enter an open prize round with its public ETH bond.
8. Public round progress remains visible. Private balances, savings, outcomes, and winnings remain hidden until the user
   explicitly reveals them in the current browser session.
9. The user can withdraw private savings and can request Private USDC → public USDC through **Make Public**.
10. The user can disconnect the Leopold wallet session or sign out without silently reconnecting or replacing identity.

## 4. Routes

The final implementation must preserve these routes and their meanings:

| Route                 | Responsibility                                                                  |
| --------------------- | ------------------------------------------------------------------------------- |
| `/`                   | Brand/product landing and entry to the application                              |
| `/login`              | Email-first and supported wallet-first authentication entry                     |
| `/onboarding`         | Required profile, username, and verified financial-wallet establishment         |
| `/app`                | Dashboard                                                                       |
| `/app/vaults`         | Four-vault discovery and comparison                                             |
| `/app/vaults/[vault]` | Daily, Weekly, Monthly, or Boost detail                                         |
| `/app/prizes`         | Entered rounds, private outcome availability, and history where available       |
| `/app/activity`       | Privacy-safe public transaction lifecycle/history                               |
| `/app/rewards`        | Prize winnings, bond refunds, and settlement rewards with clear separation      |
| `/app/profile`        | Account, verified email, username, wallet session, X linkage, and Make Public   |
| `/app/help`           | Consumer explanations and support guidance                                      |
| `/ops`                | Public production status, separate from normal consumer UX                      |
| `/transparency`       | Privacy boundaries, principal safety, yield source, and deployment transparency |

Navigation labels are fixed to Dashboard, Vaults, Prizes, Activity, Rewards, and Profile. Help and Transparency may be
secondary navigation. **+ Add Money** must remain prominent in authenticated application chrome.

## 5. Page responsibilities

### Dashboard

- Present total private savings without reconstructing hidden vault values. A total may be shown only from values the
  user has explicitly revealed in the current session; otherwise show a protected/partial state.
- Present available Private USDC with Hidden, Revealing, Revealed, or Reveal failed state.
- Summarize active prize opportunities and the user's entered status.
- Show latest privacy-safe activity and the primary **+ Add Money** action.
- Never imply that an unavailable read means funds are lost.

### Vaults

- Show exactly Daily, Weekly, Monthly, and Boost from the production configuration.
- Explain duration and consumer purpose without exposing TWAB formulas or strategy internals.
- Mark Weekly as recommended/default. All four remain available.
- Show public round state and public prize reserve. Keep private savings hidden by default.

### Vault detail

- Show vault identity, public prize reserve, round countdown/state, entered status, and bounded settlement progress.
- Provide explicit Save, Withdraw, Enter Prize Round, and private-reveal actions.
- Show the user's result only after it is available and explicitly revealed.
- Do not estimate exact odds, weight, or TWAB.

### Prizes

- Show entered/not-entered status, public round progress, and whether a private outcome is available.
- Reveal only the current user's result/winnings after explicit authorization.
- Show completed history only where existing public/local records support it; do not invent historical private outcomes.
- Never expose the accepted ticket, winner identity, participant weights, or winner-selection internals.

### Activity

- Show public transaction kind, lifecycle, public hash, network, and safe recovery guidance.
- Do not persist or display private amounts, ciphertexts, proofs, decrypted values, or private result handles.
- A submitted hash may support “check transaction” recovery. It must not trigger automatic resubmission.

### Rewards

- Separate private prize winnings, public bond refunds, and public settlement rewards.
- Keep exact winnings hidden until an authorized reveal.
- Never describe settlement rewards or bond refunds as vault yield or prize principal.

### Profile

- Show the current user's verified email, username, verified external financial wallet, and wallet-session state.
- Provide explicit connect/reconnect, disconnect, and sign-out controls.
- Preserve optional X linkage. X is never a financial signer.
- Provide the **Make Public** entry point and explain authenticated asynchronous finalization.

### Add Money

- Offer **Get Test USDC** and **Make Private**.
- Explain that public USDC and the wrapper transaction are public, while the resulting Private USDC balance is
  confidential.
- Require explicit wallet action for each financial write. Never retry a write automatically.

### Transparency

- Explain what Leopold hides: private balances/savings, exact TWAB/odds, accepted ticket, winner, and winnings.
- Explain what remains public: wallet transactions/timing, Make Private boundary amount, prize entry/bond, aggregate
  vault activity, round state, and settlement progress.
- State that Leopold provides confidentiality, not anonymity.
- Explain principal safety and that prizes derive from genuine yield, sponsor contributions, and rollover—not principal.
- Link or display public official deployment verification without mixing it into routine transaction UX.

### Ops

- Show public RPC, Zama readiness, Dynamic readiness, deployment code/configuration, manifest, freeze, and security
  status.
- Use Operational, Degraded, Unavailable, and Unknown.
- Retain: “Service availability does not affect ownership of funds held by the protocol.”
- Never request authentication, wallet signatures, private decryption, or transactions from `/ops`.

## 6. Controller/API surface

Final visual components must consume `useLeopoldUiController()` from `frontend/components/leopold-ui-controller.tsx`.
They must not import Dynamic, Wagmi, Zama, raw contract actions/reads, or the legacy provider contexts directly.

The facade returns these stable high-level domains:

- `account`: fixed account state; verified email readiness; username; X status; OTP, profile, X, and sign-out commands.
- `wallet`: fixed explicit-session state; verified and connected addresses; chain; safe recovery copy; explicit link,
  confirm, connect, disconnect, switch, and read-only network retry commands.
- `balances`: public USDC and protected Private USDC state/value; explicit reveal/hide commands.
- `vaults`: four configured summaries containing public round data, protected savings/result values, public reward
  values, and explicit vault commands.
- `transactions`: fixed user-facing lifecycle, public hash, privacy-safe error, recoverability signal, and safe local
  history.
- `moneyMovement`: Get Test USDC, Make Private, Save, Withdraw, and Make Public commands.
- `ops.readHealth()`: public `/api/health` projection only.
- `refresh()`: explicit read refresh.

All financial command amounts remain decimal strings at the UI boundary. Parsing, simulation, encryption, submission,
receipt handling, refresh, and error classification remain inside the existing controller/service layers.

The facade intentionally does not expose:

- ciphertext or proof types;
- encrypted handles or private eligibility/TWAB;
- FHE ACL or relayer operations;
- Dynamic users, provider IDs, connectors, or wallet objects;
- Wagmi clients/connectors;
- raw technical diagnostics;
- rejection sampling, HCU, settlement chunks, or Compound operations.

The existing `useAuth()`, `useWalletIdentity()`, and `useFinancial()` hooks remain for the temporary UI and controller
implementation. They are not the final presentation API.

## 7. State model

These are exhaustive presentation states. The visual design may change labels and styling, but must not add alternate
financial transitions.

| Domain        | Allowed UI states                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Account       | `loading`, `signed-out`, `profile-incomplete`, `ready`                                              |
| Wallet        | `disconnected`, `connecting`, `connected`, `wrong-network`, `error`                                 |
| Private value | `hidden`, `revealing`, `revealed`, `reveal-failed`                                                  |
| Transaction   | `idle`, `awaiting-signature`, `submitted`, `confirming`, `private-processing`, `success`, `failure` |
| Vault         | `open`, `entered`, `closed`, `settling`, `settled`, `unavailable`                                   |
| Service       | `healthy`, `degraded`, `unavailable`, `unknown`                                                     |

Rules:

- Loading/unknown states fail closed for writes.
- `wrong-network` never triggers an automatic switch. Offer an explicit button.
- `disconnected` never triggers automatic wallet connection.
- A private value begins `hidden` each applicable session and returns there when identity, wallet, or network
  invalidates the reveal.
- `reveal-failed` preserves privacy and offers an explicit reveal attempt; it does not log out the account.
- One explicit financial action submits at most once. `failure` never means “automatically retry the transaction.”
- A public transaction hash permits receipt/read recovery, not blind resubmission.
- `unavailable` service or vault data must not be represented as zero.

## 8. Privacy classifications

### PUBLIC

- Vault names/types/durations and official deployment addresses.
- Round IDs, timestamps, public state, participant count, and bounded settlement progress.
- Public prize reserve, entry/bond facts, bond refund, and settlement reward.
- Public USDC balance and public blockchain transaction hashes.
- Public health, manifest, freeze, runtime size, and release status.

### USER-PRIVATE

- Current user's verified email, username, and financial-wallet association.
- Revealed Private USDC and private vault savings.
- Exact private result/winnings.
- These values may be rendered only for the authenticated current user and must not be persisted by presentation code.

### INTERNAL-ONLY

- Raw ciphertext handles, encrypted inputs, proofs, signed decrypt payloads, and decryption material.
- Exact TWAB/eligibility/odds and accepted random ticket.
- Auth, access, refresh, or provider tokens.
- Provider user IDs, wallet-to-email lookup data, Dynamic wallet objects, Wagmi clients, and connector internals.
- FHE ACL/relayer details, HCU, rejection-sampling math, settlement chunks, and Compound internals.
- Technical diagnostics that could contain provider or environment detail.

The facade's runtime development assertion and permanent tests reject known INTERNAL-ONLY field names. Final visual code
must import only the facade. Do not bypass this boundary to make a design easier.

## 9. Transaction UX

1. `idle`: action is available subject to account/wallet/vault conditions.
2. `awaiting-signature`: tell the user which explicit wallet confirmation is requested. Do not claim submission yet.
3. `submitted`: show the public transaction hash as soon as available.
4. `confirming`: wait for receipt and controller refresh. Do not submit again.
5. `private-processing`: explain that private state is updating; do not expose handles, proofs, or relayer payloads.
6. `success`: state what completed and refresh relevant display data.
7. `failure`: show the classified consumer-safe message. If a hash exists, offer a block-explorer/check-status path. A
   new write requires a new explicit user action.

Use the controller's lifecycle and error message. Do not infer success from a modal closing, a wallet popup
disappearing, or elapsed time. Do not turn temporary infrastructure failures into logout or “funds unsafe” messaging.

## 10. Responsive expectations

- Mobile-first content must work at 320 CSS pixels without horizontal scrolling for primary tasks.
- Keep **+ Add Money** reachable on mobile; a bottom action or compact header action is acceptable.
- Collapse navigation into an accessible menu while preserving all six primary destinations.
- Present tables as semantic cards/lists on narrow screens without dropping state, amount privacy, or transaction
  status.
- Dialogs must fit the viewport, preserve keyboard focus, and allow safe cancellation before submission.
- Long addresses and hashes must wrap or truncate visually while retaining accessible copy/view actions.
- Desktop layouts may be information-dense but should retain one obvious primary action per task.

## 11. Accessibility expectations

- Meet WCAG 2.2 AA for color contrast, keyboard access, focus visibility, and target sizing.
- Use semantic headings, landmarks, buttons, links, forms, labels, lists, and tables.
- Never communicate privacy, service, wallet, or transaction state by color alone.
- Use `aria-live`/status semantics for bounded async state changes without repeatedly announcing timers.
- Move focus into dialogs and return it to the invoking control on close.
- Keep revealed-value controls explicitly named (“Reveal Private USDC”, “Hide private savings”).
- Respect reduced motion. Animation may clarify state but cannot delay or conceal action outcomes.
- Countdown text must remain understandable without relying on animation and must use chain-derived round data.

## 12. Prohibited UI behaviors

- No embedded wallets.
- No wallet auto-connect or silent reconnect after explicit disconnect.
- No automatic network switching.
- No automatic retry of signatures or state-changing transactions.
- No wallet transfer, reassignment, account merge, or financial-wallet replacement path.
- No frontend-derived financial state machine, TWAB, odds, winner, randomness, settlement, or solvency result.
- No rendering, logging, analytics, URL parameters, browser persistence, or error copy containing INTERNAL-ONLY values.
- No automatic private reveal and no persistence of decrypted values.
- No public winner, ticket, exact private balance, exact private savings, or winnings disclosure.
- No “funds at risk” claim based only on RPC, Zama, Dynamic, or health-check availability.
- No conflation of savings principal, prize winnings, bond refunds, and settlement rewards.
- No removal of Daily, Weekly, Monthly, Boost, Make Private, Save, Enter, Withdraw, Make Public, claims, X linkage,
  Help, Transparency, or Ops.
- No use of port 3000 for Leopold local development; local frontend remains port 3001.

## 13. Integration instructions

1. Preserve `Providers` and their order: Dynamic (when configured) → Wagmi → Query → Auth → Wallet session → Financial.
2. Build the replacement presentation against `useLeopoldUiController()` only.
3. Keep `/login` and `/onboarding` on the facade's account commands; do not call Dynamic hooks from visual components.
4. Keep all wallet actions explicit. Use controller recovery state/copy; do not inspect connectors.
5. Render protected values from their state/value pair. Ignore a value unless state is `revealed`.
6. Render vaults from the controller list so exactly the four configured official vaults remain authoritative.
7. Use `recommended === true` for Weekly's default emphasis; never filter the other vaults.
8. Use controller commands exactly once per explicit user action and disable duplicate submission while transaction
   state is non-idle and nonterminal.
9. Use `transactions.current.hash` and history for public recovery. Never persist amounts or private fields.
10. Read operational status through `ops.readHealth()` or the server `/ops` page. Do not add private readiness probes.
11. Keep security headers, read timeout/retry behavior, no-write-retry behavior, current config, and localhost port
    intact.
12. Before removing temporary components, prove every current route/capability has an equivalent final presentation.

### Current coupling inventory

| Current unit                                                                        | Classification               | Handoff decision                                                                 |
| ----------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `leopold-ui-controller.tsx`, `lib/ui/controller.ts`                                 | A. HEADLESS_CONTROLLER_READY | Final presentation API and fixed state mappings                                  |
| `auth-provider.tsx`, `lib/auth/*`                                                   | A. HEADLESS_CONTROLLER_READY | Keep as account/auth controller; consume only through facade                     |
| `wallet-identity-provider.tsx`                                                      | A. HEADLESS_CONTROLLER_READY | Explicit wallet-session authority; consume only through facade                   |
| `lib/leopold/actions.ts`, `reads.ts`, `transactions.ts`, `withdrawal.ts`, `zama.ts` | A. HEADLESS_CONTROLLER_READY | Internal services; never import from final visual components                     |
| `lib/ops/health.ts`, `reliability.ts`, `metrics.ts`                                 | A. HEADLESS_CONTROLLER_READY | Public ops/reliability services; facade exposes safe health projection           |
| `financial-provider.tsx`                                                            | B. MOSTLY_HEADLESS           | Preserved behavior engine; raw handles/diagnostics make direct UI use prohibited |
| `providers.tsx`                                                                     | B. MOSTLY_HEADLESS           | Stable infrastructure composition; not a presentation API                        |
| `app-shell.tsx`, `wallet-gate.tsx`, `auth-flow.tsx`, `add-money-modal.tsx`          | C. UI_COUPLED                | Temporary reference presentation; replace visually, preserve behavior            |
| `vault-cards.tsx`, `vault-detail.tsx`, authenticated app pages                      | C. UI_COUPLED                | Temporary pages mix rendering and facade predecessors; replace route by route    |
| `configuration-status.tsx` fixture UI                                               | D. LEGACY/DEMO_ONLY          | Keep only for non-production fixtures; do not reproduce in final consumer UI     |
| `sg5-*`, `zama-import-probe`, `e2e-closure` components/routes                       | D. LEGACY/DEMO_ONLY          | Test/evidence surfaces, not final navigation or product UI                       |

## 14. Final acceptance criteria

- Brand, thesis, six-item navigation, **+ Add Money**, and every required route are present.
- Daily, Weekly, Monthly, and Boost are all present; Weekly is recommended/default, not exclusive.
- All current account, X, wallet-session, money movement, private reveal, prize, reward, help, transparency, and ops
  capabilities remain reachable.
- Final visual components import only the headless UI facade for product state/actions.
- Account, wallet, private value, transaction, vault, and service states use only the frozen state sets.
- No INTERNAL-ONLY field is rendered, logged, persisted, or sent to analytics.
- Private values are hidden by default, revealed only explicitly, and not persisted.
- One click creates at most one active financial write; no automatic write retry exists.
- Disconnect remains explicit and survives refresh without auto-connect. Network switching remains explicit.
- Dynamic external-wallet account semantics and unique financial-wallet ownership remain unchanged.
- No contract, ABI, deployment address, FHE, TWAB, randomness, settlement, principal, strategy, or privacy behavior
  changes.
- Existing frontend regression coverage, auth/wallet tests, health/retry tests, security-header tests, typecheck, lint,
  format, production build, dependency audit, contract freeze, and bytecode validation remain green.
- Leopold local development and verification continue on `http://localhost:3001`.
