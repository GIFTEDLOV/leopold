# Leopold Circle-USDC / Compound III Yield Architecture

## Production decision

Leopold uses canonical Circle Ethereum Sepolia USDC (`0x1c7D…7238`), a minimal Leopold-deployed ERC-7984 wrapper
(`lcUSDC`), and direct Compound III Comet (`0xAec1…0b6e`). This supersedes the production candidate based on the Zama
USDTMock wrapper because that exact underlying had no verified genuine same-asset Sepolia venue. CP0 evidence is not
changed.

Circle identifies the underlying in its official
[USDC contract-address table](https://developers.circle.com/stablecoins/usdc-contract-addresses). Compound's official
[Compound III documentation](https://docs.compound.finance/) lists the Ethereum Sepolia USDC-base deployment and defines
base suppliers as interest earners. Installed pinned OpenZeppelin/Zama source controls the wrapper implementation.

`lcUSDC` is a Leopold-deployed ERC-7984 confidential wrapper implemented using OpenZeppelin Confidential Contracts and
Zama FHEVM. It is not Zama-issued, not cUSDCMock, and not Wrapper-Registry official. It has no owner mint, seizure,
blacklist, observer, proxy, or mutable underlying.

## Boundaries

User deposits finish at the ERC-7984 receiver callback: encrypted principal and exact TWAB update immediately. Strategy
work is a separate aggregate epoch. There is no user Compound position, share token, claim token, or synchronous
deposit-to-Comet transaction.

Each vault creates one immutable `LeopoldCompoundAdapter`. The adapter validates `baseToken()` and six-decimal
`baseScale()`, supplies only canonical USDC, never borrows, uses exact temporary approvals, and sends every redemption
back to its vault. Direct Comet is smaller and clearer than CometWrapper/ERC-4626 because Leopold already owns a public
vault-level supplier position. BatcherConfidential is not used: duplicating its user deposit/claim ledger would conflict
with Leopold principal and exact TWAB. Its aggregate-decryption, strict-state, replay, cancellation, capacity, and
liveness lessons are retained.

## Epoch lifecycle

`AGING → UNWRAP_PENDING → COMPLETED` deploys objective excess above the 75% liquid target. The encrypted amount is
reserved in `principalInTransition`; the pinned wrapper burns it and makes only that aggregate handle publicly
decryptable. Authentic wrapper finalization releases exact public USDC to the vault, which supplies via its adapter.

`AGING → AMOUNT_PENDING → COMPLETED` replenishes an encrypted objective buffer deficit. Only the deficit handle becomes
publicly decryptable. Its proof is bound to the vault contract, active epoch, purpose/state, and handle. The adapter
redeems principal, then the vault wraps actual USDC back into liquid Private USDC.

Epochs have a minimum age configured immutably per vault. Demo deployments may use 60 seconds; production intent is one
hour subject to measured usage. The public-proof deadline is one day. Aging and unburned replenishment epochs can be
cancelled permissionlessly. An expired deployment can be cancelled only with the authentic proof needed to recover the
already-burned wrapper amount; this is an unavoidable public-decryption liveness dependency, not admin discretion.

## External risk

Comet is governance/proxy controlled and may pause supply/withdrawal or change implementation/configuration. Leopold can
pause new deployment, preserve withdrawals from existing liquid principal, and unwind to the same vault. It cannot write
down liabilities. Supply pause, withdrawal pause, insufficient liquidity, proof outage, and wrapper capacity are
explicit operational risks.
