# Leopold desktop financial integration

## Status

Phase 1 implements the browser financial flow against the frozen contract interfaces. The official `lcUSDC`, registry,
four vault, adapter, and bond-escrow addresses remain deliberately unset. Production therefore fails closed and displays
an official-deployment-pending state. No historical or disposable deployment is substituted.

The explicit development fixture (`NEXT_PUBLIC_LEOPOLD_DEV_FIXTURE=1`) exists only for deterministic browser interaction
tests. It is labeled “Development fixture — not Sepolia” in the UI and never supplies production configuration.

## Architecture and routes

The Next.js App Router application has a public landing page and a wallet-oriented desktop shell. The shell provides
persistent navigation, network/account status, and the global Add Money action.

- `/`: consumer landing page;
- `/login` and `/onboarding`: wallet-boundary explanations, without identity placeholders;
- `/app`: private-savings dashboard;
- `/app/vaults` and `/app/vaults/[vault]`: four vaults and financial actions;
- `/app/prizes`: current private-result states;
- `/app/activity`: public/session-local activity labels without confidential amounts;
- `/app/rewards`: bond refunds and settlement rewards kept semantically separate;
- `/app/profile`: wallet, privacy preferences, and Make Public;
- `/app/help`: product explanations;
- `/transparency`: privacy guarantees and limitations;
- `/ops`: public configuration and operational state only;
- `/sg5-probe`: existing gated browser-capability probe, retained unchanged in purpose.

## Wallet and network flow

The existing wagmi 3 / viem 2 injected-wallet stack is retained. The product handles disconnected, connecting, wrong
network, wallet rejection, missing provider, and RPC failure states. Ethereum Sepolia (`11155111`) is the sole financial
chain. Wallet and network changes clear all decrypted values and the cached in-memory Zama SDK identity.

## Configuration flow

`frontend/lib/leopold/config.ts` reads `config/leopold-frontend-contracts.json` directly and classifies every address as
configured, missing, invalid, or wrong-chain. Canonical USDC is pinned to `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.
Live financial writes call `requireConfiguredAddress`; missing critical addresses throw before simulation or wallet
submission.

The frontend never reads historical lcUSDC or vault addresses from live evidence. The typed manifest keeps Daily,
Weekly, Monthly, and Boost at the frozen durations of 86,400, 604,800, 2,592,000, and 604,800 seconds.

## Contract read and write layers

`frontend/lib/leopold/abis.ts` contains frontend-safe frozen ABI subsets. `reads.ts` centralizes public USDC balances,
active round state, round timing, public prize reserve, registration, eligibility start, bond amount, deterministic
refund amount, refund state, settlement cursors, rewards, and private handles.

`actions.ts` centralizes transaction submission and receipt validation for faucet acquisition, exact USDC approval,
wrap, confidential transfer-and-call Save, payable prize registration, encrypted principal withdrawal, unwrap request,
bond refund, settlement reward withdrawal, and private eligibility materialization. No page contains a raw ABI call.

## Get Test USDC

The browser does not guess a faucet ABI. It reads the repository-proven historical transaction
`0x63829c8633304e200a62bdd0af068374687b8163afc6673988fbe8f4426357da`, verifies its destination equals the official
Compound Sepolia faucet `0x68793eA49297eB75DFB4610B68e076D2A5c7646C`, and only then replays the validated calldata. A
changed/missing transaction or destination fails closed. The canonical USDC balance refreshes after confirmation.

## Make Private and Save

Make Private checks the current allowance and approves only the exact requested amount when needed. It then calls the
frozen `wrap(user, amount)` path. Save uses the pinned Zama browser SDK to encrypt an `euint64` amount for lcUSDC and
calls `confidentialTransferAndCall(vault, encryptedAmount, inputProof, 0x)`. A mined successful Save is treated as
principal success; no Compound progression is placed in the user flow.

## Prize registration and bond

The vault detail reads the exact active round and escrow `BOND_AMOUNT`, and then calls payable
`registerForRound(roundId)` with exactly that value. Copy states that the public bond is separate from savings, a fixed
portion compensates permissionless finalization, and only unused collateral is refundable. The interface says that
eligibility begins at registration and never implies that pre-registration history counts.

## Private reveal and result

Private balances and results are hidden by default. On deliberate Reveal, the app reads the handle from the configured
contract and uses `sdk.decryption.decryptValues` with the current injected wallet. Clear values live only in client
React memory. They are not logged, persisted, placed in URLs, rendered by the server, sent to an API, or included in
activity records. Wallet/network changes erase them. Re-hide only changes local presentation.

Exact eligibility first requires the frozen `materializeMyRoundWeight(roundId)` transaction and its
`RoundWeightMaterialized` event handle. The transaction action is implemented centrally; live UI completion awaits an
official deployment and browser validation of event-to-decrypt timing.

Private results read `winningsOf(user)` and decrypt only for the connected wallet. Public round data is never used to
infer the winner. In-progress settlement is presented as “Finalizing private draw”; cursor values remain operational and
never identify a participant or winner.

## Refunds, rewards, withdrawal, and Make Public

Refunds use `claimBondRefund(roundId)`. Rewards use `withdrawSettlementRewards()`. The UI distinguishes both from
private winnings, savings, and strategy yield. Principal withdrawal encrypts an exact `euint64` for the selected vault
and calls `withdraw`. Liquidity failure is presented as a temporary private-liquid-balance failure, with no queue claim.

Make Public encrypts an exact amount for lcUSDC and submits the authenticated `unwrap` request. The interface retains a
Private processing state because the frozen flow requires a later public proof and `finalizeUnwrap`. The browser never
claims completion merely because the request transaction mined.

## Transaction and error systems

All financial actions share Ready, Waiting for wallet, Submitted, Confirming, Private processing, Complete, and Failed.
Local persistence is restricted to public transaction lifecycle metadata: kind, public hash, chain, wallet, stage, and
timestamp. Amounts, handles, ciphertexts, proofs, decrypted values, and results are excluded.

The error classifier maps wrong network, insufficient ETH/USDC, wallet rejection, missing configuration, closed rounds,
relayer/KMS failure, RPC failure, and private liquidity failure into product language. Technical details are bounded and
not shown by default.

## Decimal, time, refresh, and privacy boundaries

USDC is parsed with viem `parseUnits` at six decimals and represented as `bigint`; zero, excess precision, scientific
notation, overflow above `uint64`, and over-balance values are rejected. Round timestamps come from contract reads.
Browser time may eventually animate a countdown, but is not used to decide eligibility or round openness.

Writes refresh only the affected in-memory/public state boundary. There is no uncontrolled polling. The application has
no analytics integration, confidential API route, or server-side private read. The existing SG5 health route returns
only gated probe readiness.

## Accessibility and responsive behavior

The desktop layout targets 1366×768 and larger, with a constrained content width, visible focus rings, semantic buttons,
form labels, dialog semantics, status/alert regions, text labels in addition to color, and keyboard-operable navigation.
At laptop/mobile widths, vault/stat grids collapse and navigation becomes horizontally scrollable rather than clipping.

## Test status and live work

Vitest covers manifest fail-closed behavior, invalid/wrong-chain addresses, exact monetary parsing boundaries, error
taxonomy, transaction vocabulary, settlement status, and privacy-safe storage. Playwright covers the complete financial
journey through the explicitly labeled development fixture. This fixture result must never be described as live Sepolia
E2E.

Live E2E remains blocked on the official reviewed deployment addresses and a healthy external FHE relayer. After the
manifest is populated, follow `docs/frontend/LEOPOLD_LIVE_BROWSER_SMOKE_CHECKLIST.md`. A live pass requires actual
receipts and wallet-authorized decryptions from the ordinary browser UI; no CLI financial step may substitute for it.
