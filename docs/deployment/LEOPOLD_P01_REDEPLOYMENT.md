# Leopold P-01 corrected Sepolia redeployment

Status: corrected official four-vault suite deployed and validated; P-01 is closed.

The existing non-upgradeable lcUSDC wrapper at `0xf2B3DeC378a2e23361b9112C5A2cEDc4C666b6e8` was reused. Four corrected
`LeopoldVault` instances were deployed; each constructor created a new immutable per-vault Compound adapter and
settlement-bond escrow. A new registry at `0x64e106b0015028451065901854b343fF1639962C` contains only the corrected
vaults. The prior registry `0x08560A59A28B9e3b7F5fe7C3cce17ddD9F115530` and its four vaults remain historical
deployments and are not current frontend discovery targets. Historical transaction evidence was not rewritten.

- Corrected contract commit: `0cea34f33009a1d5052a554e687ee3605a2aaf11`
- LeopoldVault runtime: 23,531 bytes
- EIP-170 headroom: 1,045 bytes
- ABI changed: no
- State machine changed: no
- Privacy changed: no
- Current manifest SHA-256: `438ea670c13e888db81eef5c7a64ea2943aa6d9f2c4faac604fe09850964d5aa`
- P-01 deployment evidence SHA-256: `12a118e665b3885fd919d67b5efe028884d3eb61bd4d3194ec189e35cffa781c`

## Bounded live smoke

One canonical-USDC base unit was wrapped, confidentially deposited into the corrected Daily vault, verified as private
principal `1`, withdrawn, and verified as private principal `0`. No bond registration, strategy operation, settlement,
or forced round close was performed.

Bounded-smoke evidence SHA-256: `a6f8362c0d5a693b4ef602998ceb14603ae4afcaf93bb1ec39f31dbfb9767d9a`

Evidence JSON: [LEOPOLD_P01_REDEPLOYMENT.json](../../evidence/deployment/LEOPOLD_P01_REDEPLOYMENT.json)

Smoke evidence: [LEOPOLD_P01_BOUNDED_SMOKE.json](../../evidence/deployment/LEOPOLD_P01_BOUNDED_SMOKE.json)
