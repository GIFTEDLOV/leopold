# Leopold Phase 2B V2 pre-deployment checkpoint

Status: local-only, reviewed before any Sepolia deployment. This record is not a deployment authorization.

## Scope and isolation

The V2 implementation is a separate, non-upgradeable `LeopoldVaultV2` plus `LeopoldSettlementBondEscrowV2` pair. The
frozen V1 contracts and historical checkpoints are not modified and are not used as migration targets. V2 has no
implicit principal, TWAB, refund, reward, bond-credit, or wallet migration path. Users must explicitly fund and register
the V2 wallet they intend to use.

## Reproducible local evidence

- Production Solidity settings are the repository optimizer/via-IR/Cancun settings; the V2 vault runtime is
  byte-for-byte equal to the frozen V1 runtime and is validated by `scripts/validate-leopold-auto-entry-bytecode.cjs`.
- `LeopoldVaultV2`: 23,531 runtime bytes, 1,045 EIP-170 bytes of headroom, 38,979 creation bytes.
- `LeopoldSettlementBondEscrowV2`: 7,711 runtime bytes, 16,865 EIP-170 bytes of headroom, 8,259 creation bytes.
- Source SHA-256: `LeopoldVaultV2` `ff12019fccf541bf2a48d4b18269d275f77f2bfb2bcbf315610d0cceb88af1e7`;
  `LeopoldSettlementBondEscrowV2` `5c67e94da167dab81c439294d493375b449151999cb2110c76a870a8891df181`.
- Four-participant V2 selection and allocation remain below 15,000,000 total HCU and 3,750,000 depth.
- Keeper RPC identity is checked with `eth_chainId` on every configured endpoint. Planning snapshots pin block number
  and hash and fail closed on endpoint disagreement.
- The keeper journal is schema v3, fsync/rename durable, append-only per attempt, and preserves replay relationships,
  receipt identity, nonce, calldata digest, confirmation depth, and transition history.

## Operational boundary

No V2 address is added to the official V1 manifest by this checkpoint. A future disposable deployment requires a new
manifest entry carrying both `"implementation": "v2"` and `"automaticEntry": true`, topology verification, independent
review sign-off, a funded dedicated keeper key, and monitored crash/reorg drills. Deployment remains intentionally out
of scope here.
