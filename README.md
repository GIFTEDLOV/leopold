# Leopold

Leopold is a confidential prize-savings protocol for Ethereum Sepolia. Users keep their savings principal withdrawable
while periodic prize rounds distribute a prize privately. Private USDC balances, vault savings, TWAB eligibility, and
results use Zama FHEVM; public protocol activity remains auditable.

## Architecture

- `lcUSDC` is the confidential wrapper around canonical Circle Sepolia USDC.
- Four official vaults provide Daily, Weekly, Monthly, and Boost savings rounds.
- TWAB history determines private round eligibility.
- Encrypted randomness selects a winner without exposing tickets or private weights.
- Settlement is permissionless: no keeper or administrator is required to close or settle a round.
- The official deployment integrates Compound III (`Comet`) for production strategy yield, subject to the strategy
  lifecycle and public protocol state.

## Ethereum Sepolia deployment

Network: Ethereum Sepolia, chain ID `11155111`.

Use canonical Circle Sepolia USDC only: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`

The authoritative address source is [`config/leopold-frontend-contracts.json`](config/leopold-frontend-contracts.json).
The current official addresses are:

| Contract                     | Address                                      |
| ---------------------------- | -------------------------------------------- |
| Confidential USDC (`lcUSDC`) | `0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8` |
| Vault registry               | `0x64e106b0015028451065901854b343fF1639962C` |
| Compound III Comet           | `0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e` |
| Daily vault                  | `0xfC681256b9dE61aB0F4dB397463aC55Ede8bDd64` |
| Daily adapter                | `0x93bd7b8eB095eF1e59D48BC193289A0b6cdEa743` |
| Daily bond escrow            | `0x6e2c004529Ade16b5eEeCe62063D1C0ec2712dAf` |
| Weekly vault                 | `0xaaBC43dfc64eC400461e05AFC539bdD6b8Efa761` |
| Weekly adapter               | `0xF5ba3F2df06A689C1E8409c1EC59B9FdF114A1b0` |
| Weekly bond escrow           | `0x05e91Fd944d0161Fad213169B62b06b4B327fE10` |
| Monthly vault                | `0x02a202b57f3A787c87f3Cc46C12C7c90f580a7cC` |
| Monthly adapter              | `0x9C61B40D3FdE4B9BAb740cBfeB1ad5Ad39a88779` |
| Monthly bond escrow          | `0xCF3b8E37bc74D203003Df9B09B6B73f34B15C6B5` |
| Boost vault                  | `0xDd0888d150a673f34Bcbf258dc138ADB17B62165` |
| Boost adapter                | `0x98F665db7698e01423118450B32984ca70e80381` |
| Boost bond escrow            | `0x3ee5DB68F7e3689B4639B97e9C423de7d69f6D9F` |

## Judge walkthrough

1. Visit Leopold and follow onboarding.
2. Sign in with an external wallet or email.
3. Complete email, username, and profile requirements, then verify the financial wallet.
4. Obtain canonical Circle USDC from a Sepolia faucet.
5. Choose **Make Private** and authorize the exact USDC amount.
6. Save privately into a vault.
7. Enter the current prize round with its displayed entry bond.
8. Inspect the public prize reserve. During an open round, the displayed opportunity includes the stored public prize
   and legitimate sponsored prize.
9. After the round closes and permissionless settlement completes, explicitly reveal eligibility or the private result
   from the authorized wallet.
10. Claim an available bond refund, settlement reward, or winnings, then withdraw principal when desired.

Saving and round entry are separate actions. Registration starts eligibility tracking; it does not retroactively include
earlier savings. The current bond profile is `0.005 ETH` per entry on Sepolia.

## Authentication and wallet identity

Email-first and wallet-first authentication are supported. A wallet-first user links a verified email by OTP, sets a
unique Leopold username, and explicitly confirms the financial wallet before becoming ready for financial actions.
Financial-wallet identity is checked against the authenticated Dynamic identity, connected account, and Sepolia network.
Conflicts and attempted silent wallet replacement fail closed; Leopold does not silently merge accounts.

## Privacy model

### Private

- Private USDC balance
- Vault savings principal
- TWAB and round eligibility
- Winner and winnings result until the authorized user reveals it

### Public

- Wallet transactions and addresses
- Vault and round state
- Registration count and public entry bond
- Public prize reserve and sponsored prize
- Settlement lifecycle and progress
- Official contract addresses

Privacy is not anonymity: wallet activity, transaction timing, public entries, and aggregate protocol facts remain
observable. A user’s browser can see values only after the user deliberately authorizes the relevant reveal.

## Prize lifecycle

The protocol progresses through these public and confidential boundaries:

1. Save privately and separately register for the prize round.
2. Lock the entry bond and begin eligibility tracking.
3. Close the round after its configured duration.
4. Finalize the public aggregate with a FHE decryption proof.
5. Generate and validate encrypted randomness.
6. Process private ticket selection and finalize reconciliation.
7. Allocate winnings privately.
8. Finalize settlement.
9. Registered participants claim their bond refund; permissionless progressors can claim settlement rewards.

The current official Sepolia Weekly round is the recommended judge path. At the release snapshot it is round 1 with a
stored public prize of `0` and a sponsored prize of `100000` USDC base units, an effective open-round prize of
`0.1 USDC`. When `closeRound` executes, Weekly round 2 initializes immediately. It opens at round 1’s close time and
remains open for seven days while round 1 settlement is completed, so judges retain an open Weekly round during
settlement.

## Local development

Required versions:

- Node.js `22.23.2`
- pnpm `11.0.9`

Run the frontend on the normal development port:

```bash
cd frontend
pnpm dev --port 3001
```

Local authentication and financial testing must use the configured Dynamic Sandbox and an injected Sepolia wallet. Never
commit private keys, RPC credentials, session tokens, or FHE handles.

## Validation commands

```bash
cd frontend
pnpm typecheck
pnpm lint
pnpm test
pnpm build

cd ..
pnpm closure:validate
pnpm release:validate
pnpm audit:prod
```

## Security and release evidence

The repository contains protocol-specific evidence for:

- SG4 encrypted-randomness and HCU authority validation in
  [`docs/security/SG4_BENCHMARK_PROTOCOL.md`](docs/security/SG4_BENCHMARK_PROTOCOL.md),
  [`docs/security/SG4_HCU_AUTHORITY_PROTOCOL.md`](docs/security/SG4_HCU_AUTHORITY_PROTOCOL.md), and
  [`evidence/sg4/SG4_RANDOMNESS_BENCHMARK.json`](evidence/sg4/SG4_RANDOMNESS_BENCHMARK.json).
- SG5 browser FHE capability and authorized-decryption boundaries in
  [`docs/security/SG5_BROWSER_CAPABILITY_PROTOCOL.md`](docs/security/SG5_BROWSER_CAPABILITY_PROTOCOL.md) and
  [`evidence/cp0/SG5_BROWSER_CAPABILITY.json`](evidence/cp0/SG5_BROWSER_CAPABILITY.json).
- Contract freeze and corrected P-01 closure in
  [`evidence/closure/LEOPOLD_CONTRACT_FREEZE.json`](evidence/closure/LEOPOLD_CONTRACT_FREEZE.json) and
  [`evidence/closure/LEOPOLD_P01_REFREEZE.json`](evidence/closure/LEOPOLD_P01_REFREEZE.json).
- Official deployment and live/disposable browser records under [`evidence/deployment/`](evidence/deployment/).

These are repository validation and deployment records, not a claim of an external audit. Leopold must not be described
as audited by OpenZeppelin or any other third party unless a separate audit report exists.

## Testnet limitations

Leopold currently runs on Sepolia with test assets and is not a production financial service. Private values require an
explicit user-authorized reveal. Settlement is permissionless, but someone must call the settlement transactions after a
round closes; it does not happen merely because the clock elapsed. Availability depends on Sepolia, the wallet, and the
Zama FHE relayer.

See [`docs/frontend/LEOPOLD_LIVE_BROWSER_SMOKE_CHECKLIST.md`](docs/frontend/LEOPOLD_LIVE_BROWSER_SMOKE_CHECKLIST.md) for
the detailed official-browser verification checklist and [`/transparency`](frontend/app/transparency/page.tsx) for the
public privacy boundary presented by the app.
