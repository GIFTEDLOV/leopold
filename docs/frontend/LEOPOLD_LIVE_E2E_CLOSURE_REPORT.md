# Leopold live financial E2E closure report

## Result

The official Sepolia deployment remains unchanged and the official manifest remains byte-for-byte intact. The official
Weekly vault was not closed or accelerated: its frozen duration is `604800` seconds.

The missing live proof boundaries were closed against a separate disposable short-round instance using the same frozen
compiled contracts. Every disposable component is classified **DISPOSABLE E2E ONLY — NOT OFFICIAL LEOPOLD** and is
absent from the official manifest.

## Classification

- **Official deployment:** complete; no official address or Solidity change.
- **Official financial smoke:** save, exact `0.005 ETH` registration, registration-time eligibility, withdrawal, and
  frontend configuration were already live-proven. The official Weekly draw remains open by design.
- **Disposable short-round draw E2E:** passed through close, aggregate proof, candidate generation/validation,
  selection, reconciliation, allocation, finalization, private results, refunds, rewards, Round-2 isolation, and
  unshield.
- **Relayer:** browser FHE encryption and public decryption/finalization were responsive in the closing run.

Machine-readable evidence is [LEOPOLD_LIVE_E2E_CLOSURE.json](../../evidence/deployment/LEOPOLD_LIVE_E2E_CLOSURE.json).

## Disposable topology and economics

| Component        | Address                                      | Classification                       |
| ---------------- | -------------------------------------------- | ------------------------------------ |
| lcUSDC wrapper   | `0x02985F1D3A27c2cc231bD13Bd01f880dbD75306f` | Disposable only                      |
| Vault            | `0xD0a5fc945E721eFD7E0A14B40Eaa27Ac620C713A` | Disposable only; 900-second duration |
| Bond escrow      | `0x5145c624e4620f0bD27a9Acc0EEfE0BBe2e4Aaa3` | Disposable only                      |
| Compound adapter | `0x841Dc9Caf3aF98a57e9551D65a584E7dc0Ae16Af` | Disposable only                      |

The reviewed bond profile was preserved: bond `0.005 ETH`, reward per participant/pass `0.00125 ETH`, and completed
participant refund `0.0025 ETH`. The disposable adapter used canonical Sepolia USDC and the frozen Compound III Comet.

## Draw and isolation proof

Round 1 used Wallet A and Wallet B with registration-time anchors. The public aggregate `T` was nonzero (`1524000`), and
the complete permissionless lifecycle succeeded. Selection and allocation cursors both ended at `2` for two
participants. Both wallets successfully used their own private result path; exactly one private result was nonzero,
without publishing which wallet or the value.

Round 2 registered only Wallet A. Wallet B was not registered. The terminal ledger was exactly `registered=1`,
`selectionProcessed=1`, `allocationProcessed=1`; the public aggregate was `702000`. This proves no automatic Round-2
settlement work was created for the historical Wallet-B participant.

## Privacy and bond proof

Public receipts exposed lifecycle activity and aggregate state only. The review found no public winner-address event,
winner index, public accepted ticket, individual TWAB, or winner-specific bond rule. A Wallet-B attempt to decrypt
Wallet-A’s private result was rejected; Wallet A then successfully decrypted its own result. Private result values were
not written to the report or evidence.

Both Round-1 participants received the exact two-pass reward credit, withdrew it once, and claimed the exact completed
participant refund once. Duplicate reward withdrawal and duplicate refund attempts were rejected. Refund and reward
accounting were read from the isolated escrow, not inferred from its raw ETH balance.

## Unshield completion

### Previous state and root cause

The previous official smoke stopped after the authenticated unwrap request because the frontend had no phase-two
finalization. The request was not treated as success, and no duplicate request was submitted. The frozen flow is:
authenticated `unwrap` request → relayer public decrypt of the request handle → `finalizeUnwrap` with the proof.

### Final live status

The disposable closing run completed that exact sequence:

- request: `0x26ef23e9cb2f39ba036340240d2e5ac80b1b6251446bd700cd2f23d5210c6b18`;
- finalization: `0x24fae064a6b18a2ff3b6387458e6b57e50fdd4d5b87efe6ff0555a177576d662`;
- canonical USDC increase: `100` base units.

The frontend action now performs this second phase and refreshes public balance only after finalization succeeds. A
relayer failure still leaves the request hash onchain and reports private processing failure without claiming completion
or submitting a duplicate automatically.

The recovery session re-read both receipts and confirmed `UnwrapRequested` followed by `UnwrapFinalized`; the canonical
USDC balance delta was `100` base units. This is a completed live unshield proof, not an external relayer blocker.

## Browser/operator boundary

The browser SDK drove encrypted inputs, saves, registrations, withdrawals, unwrap request, public decrypt, and unwrap
finalization. Operator tooling deployed the disposable contracts, funded the two test wallets, advanced permissionless
round state, and performed receipt/read verification. No private key was recorded.

Browser environment: Chrome for Testing `151.0.7922.34`, Playwright `1.62.1`, direct Playwright fallback, localhost
`3000`, with user-space shared libraries only. No sudo or host modification was used.

## Retry notes

The closing run followed earlier harness-only failures: a test-only round expired while browser FHE initialized; one
registration used an underestimated RPC gas limit; boolean proof decoding and overloaded event lookup were corrected in
the disposable harness. The final run had no unexpected protocol reverts and no Solidity changes.

## Integrity

- Official manifest SHA-256: `579da28f3fb61a5b4fe89174b1a1dda23b0af0baaf44743af33766d516683e9a`.
- Official deployment evidence SHA-256: `173e21ec27700c6adf74a33c87d07bbd618c078052913e79f4a2102b749d994d`.
- No disposable address was written to the official manifest or official deployment evidence.

The disposable receipt audit was read-only at Sepolia block `11481162`: every recorded closure receipt had status `1`,
the disposable runtime matched the exact build-info variants used by the official frozen deployment, and the official
Weekly remained `OPEN` with its `604800`-second duration and zero aggregate/participants.

No unified authentication work was started.
