# Leopold official Sepolia deployment

Status: official four-vault Sepolia deployment populated and validated.

- Chain: Ethereum Sepolia (11155111)
- Deployment timestamp (UTC): 2026-08-20T23:10:12.408Z
- Deployer / registry owner / strategy guardian: `0x57357D26D1f56eca4556d271078A0239a7696Bbf`
- Frozen contract commit: `0cea34f33009a1d5052a554e687ee3605a2aaf11`
- Frontend integration commit: `0cea34f33009a1d5052a554e687ee3605a2aaf11`
- Bond: 0.005 ETH
- Reward per participant pass: 0.00125 ETH
- Two-pass refund: 0.0025 ETH
- Canonical Circle Sepolia USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Direct Compound III Sepolia USDC Comet: `0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e`

## Official addresses

| Component                            | Address                                    | Deployment transaction                                             |    Block |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ | -------: |
| lcUSDC                               | 0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8 | 0x58e763e8cd41087880a6a57c98621a39c03f182963ab827ccc1780eb29678058 | 11474458 |
| Daily vault                          | 0xfC681256b9dE61aB0F4dB397463aC55Ede8bDd64 | 0x2930e73d666588b8e2bb5aabd7293ef75ec4933090ee777d8cb25801384a95bd | 11532130 |
| Weekly vault                         | 0xaaBC43dfc64eC400461e05AFC539bdD6b8Efa761 | 0x5c0123d1a3a2b2dfa0b66a1b8499ead437e3dd616abb2092e556d2999994d473 | 11532131 |
| Monthly vault                        | 0x02a202b57f3A787c87f3Cc46C12C7c90f580a7cC | 0x5a4a4b2a7f1fe341a337cc1c450833be630268aeed938895c8b9f22b614eaeb9 | 11532132 |
| Boost vault                          | 0xDd0888d150a673f34Bcbf258dc138ADB17B62165 | 0xb9dce8567fd1efeda9730c4aa7b4f939dfd23ed483aff729cc6ec7cfbd0eedf7 | 11532133 |
| Daily adapter (child creation)       | 0x93bd7b8eB095eF1e59D48BC193289A0b6cdEa743 | 0x2930e73d666588b8e2bb5aabd7293ef75ec4933090ee777d8cb25801384a95bd | 11532130 |
| Weekly adapter (child creation)      | 0xF5ba3F2df06A689C1E8409c1EC59B9FdF114A1b0 | 0x5c0123d1a3a2b2dfa0b66a1b8499ead437e3dd616abb2092e556d2999994d473 | 11532131 |
| Monthly adapter (child creation)     | 0x9C61B40D3FdE4B9BAb740cBfeB1ad5Ad39a88779 | 0x5a4a4b2a7f1fe341a337cc1c450833be630268aeed938895c8b9f22b614eaeb9 | 11532132 |
| Boost adapter (child creation)       | 0x98F665db7698e01423118450B32984ca70e80381 | 0xb9dce8567fd1efeda9730c4aa7b4f939dfd23ed483aff729cc6ec7cfbd0eedf7 | 11532133 |
| Daily bond escrow (child creation)   | 0x6e2c004529Ade16b5eEeCe62063D1C0ec2712dAf | 0x2930e73d666588b8e2bb5aabd7293ef75ec4933090ee777d8cb25801384a95bd | 11532130 |
| Weekly bond escrow (child creation)  | 0x05e91Fd944d0161Fad213169B62b06b4B327fE10 | 0x5c0123d1a3a2b2dfa0b66a1b8499ead437e3dd616abb2092e556d2999994d473 | 11532131 |
| Monthly bond escrow (child creation) | 0xCF3b8E37bc74D203003Df9B09B6B73f34B15C6B5 | 0x5a4a4b2a7f1fe341a337cc1c450833be630268aeed938895c8b9f22b614eaeb9 | 11532132 |
| Boost bond escrow (child creation)   | 0x3ee5DB68F7e3689B4639B97e9C423de7d69f6D9F | 0xb9dce8567fd1efeda9730c4aa7b4f939dfd23ed483aff729cc6ec7cfbd0eedf7 | 11532133 |
| Registry                             | 0x64e106b0015028451065901854b343fF1639962C | 0xfb8bdfdd41f9f7b3e9b9b8dcee8acdfbd4ef5f23822fa7167bc272b03b782257 | 11532134 |

Each adapter and bond escrow is created inside its corresponding vault deployment transaction by the frozen constructor;
it is not a shared or proxy deployment.

## Integrity

The deployment script checked canonical USDC, six decimals, wrapper rate 1, direct Comet base token/scale, per-vault
adapter and escrow backpointers, exact durations, registry topology, immutable bond economics, active round
initialization, and normalized runtime bytecode against the frozen artifacts. The largest runtime is 23,531 bytes with
1,045 bytes EIP-170 headroom.

Manifest SHA-256: `438ea670c13e888db81eef5c7a64ea2943aa6d9f2c4faac604fe09850964d5aa`

Deployment evidence SHA-256: `8b1962728a1863d5e9a61df93c18f3003fc003bad301b6227477778177963651`

Evidence JSON:
[LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json](../../evidence/deployment/LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json)
