# Leopold official Sepolia deployment

Status: official four-vault Sepolia deployment populated and validated.

- Chain: Ethereum Sepolia (11155111)
- Deployment timestamp (UTC): 2026-08-12T18:16:41.173Z
- Deployer / registry owner / strategy guardian: `0x57357D26D1f56eca4556d271078A0239a7696Bbf`
- Frozen contract commit: `182787317e5b1f024d8f7f28b8bd3bef495224c1`
- Frontend integration commit: `3f396e080e70d130be58107128a1acac3c44f60d`
- Bond: 0.005 ETH
- Reward per participant pass: 0.00125 ETH
- Two-pass refund: 0.0025 ETH
- Canonical Circle Sepolia USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Direct Compound III Sepolia USDC Comet: `0xAec1F48e02Cfb822Be958B68C7957156EB3F0b6e`

## Official addresses

| Component                            | Address                                    | Deployment transaction                                             |    Block |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ | -------: |
| lcUSDC                               | 0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8 | 0x58e763e8cd41087880a6a57c98621a39c03f182963ab827ccc1780eb29678058 | 11474458 |
| Daily vault                          | 0xa84C40BBeD3010D0D4CD44465920d5156fa5E6c4 | 0x6833642227cef2c78f944e709ee89bf48e8ffa8642c8d808cce6eae8deafc345 | 11474459 |
| Weekly vault                         | 0xf3c842CdF26E960b63B67e392136D6B0D3ab2244 | 0x43dfedeb2bd9095a3b4bcb18386160a8dc2b59d5cc8f214ad358fa45f314ebed | 11474460 |
| Monthly vault                        | 0x1136D6c399d09Fa66474582DE6E4941bA3303ad6 | 0xc9d7f016a9c0762bbc030f3c12b4d44deca09c1d7a4d88d04f78d5e0b4c76539 | 11474461 |
| Boost vault                          | 0x98D971557843CE17dc1387d2256Ab3dbAaC204f9 | 0x1a44fc23b5e6b7ccf114171b8afd650a530afc9985a6614a90fa19ceff54524f | 11474462 |
| Daily adapter (child creation)       | 0x99dAdA9526A58f3BDdd44171441980e3A61E4c2F | 0x6833642227cef2c78f944e709ee89bf48e8ffa8642c8d808cce6eae8deafc345 | 11474459 |
| Weekly adapter (child creation)      | 0xE88712Affce2CDe86dEBcb78A6bd985c4ad5A3aA | 0x43dfedeb2bd9095a3b4bcb18386160a8dc2b59d5cc8f214ad358fa45f314ebed | 11474460 |
| Monthly adapter (child creation)     | 0x7d457e52195c4ab18f3Fc1Bc5b3B908D035fC996 | 0xc9d7f016a9c0762bbc030f3c12b4d44deca09c1d7a4d88d04f78d5e0b4c76539 | 11474461 |
| Boost adapter (child creation)       | 0x0dB787ae292C880ABBB6F733ad3d4d5A7098ECf1 | 0x1a44fc23b5e6b7ccf114171b8afd650a530afc9985a6614a90fa19ceff54524f | 11474462 |
| Daily bond escrow (child creation)   | 0x3c80D1Db7718c787BCfb9be6A16dB4b4AdcB5755 | 0x6833642227cef2c78f944e709ee89bf48e8ffa8642c8d808cce6eae8deafc345 | 11474459 |
| Weekly bond escrow (child creation)  | 0xfa8718a6a238749c35eE9D2daBFF87E65253fd10 | 0x43dfedeb2bd9095a3b4bcb18386160a8dc2b59d5cc8f214ad358fa45f314ebed | 11474460 |
| Monthly bond escrow (child creation) | 0x21088B76dD21AF354E74f0e9848346b7780D70db | 0xc9d7f016a9c0762bbc030f3c12b4d44deca09c1d7a4d88d04f78d5e0b4c76539 | 11474461 |
| Boost bond escrow (child creation)   | 0x6E78CA9E693c4ad73c40AA967aab25C3Fd772c9a | 0x1a44fc23b5e6b7ccf114171b8afd650a530afc9985a6614a90fa19ceff54524f | 11474462 |
| Registry                             | 0x08560A59A28B9e3b7F5fe7C3cce17ddD9F115530 | 0x524122313df8823f21d7da797f3b260247eaa754ead44f1a6484276bef62404f | 11474463 |

Each adapter and bond escrow is created inside its corresponding vault deployment transaction by the frozen constructor;
it is not a shared or proxy deployment.

## Integrity

The deployment script checked canonical USDC, six decimals, wrapper rate 1, direct Comet base token/scale, per-vault
adapter and escrow backpointers, exact durations, registry topology, immutable bond economics, active round
initialization, and normalized runtime bytecode against the frozen artifacts. The largest runtime remains 23,539 bytes
with 1,037 bytes EIP-170 headroom.

Manifest SHA-256: `579da28f3fb61a5b4fe89174b1a1dda23b0af0baaf44743af33766d516683e9a`

Deployment evidence SHA-256: `173e21ec27700c6adf74a33c87d07bbd618c078052913e79f4a2102b749d994d`

Evidence JSON:
[LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json](../../evidence/deployment/LEOPOLD_OFFICIAL_SEPOLIA_DEPLOYMENT.json)
