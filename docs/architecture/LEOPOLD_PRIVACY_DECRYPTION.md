# Leopold privacy and decryption boundary

This is the judge-facing privacy map for the deployed Leopold implementation. The authoritative deployed addresses
remain in [`config/leopold-frontend-contracts.json`](../../config/leopold-frontend-contracts.json); this document does
not introduce an alternate manifest.

## Architecture

```text
┌──────────────────────────────┐
│ Browser + Dynamic-auth wallet │
│ explicit user reveal only     │
└──────────────┬───────────────┘
               │ public reads / guarded writes / user-authorized reveal
               ▼
┌──────────────────────────────────────────────────────────┐
│ Leopold FinancialProvider → Leopold UI controller          │
│ handles/proofs stay below this boundary; clear values are │
│ session memory and auto-hide after 60s or visibility loss │
└──────────────┬───────────────────────────────────────────┘
               │ encrypted inputs, user decrypt requests,
               │ public FHE proofs, protocol ciphertext operations
               ▼
┌──────────────────────────────┐
│ Zama Relayer / KMS / FHEVM   │
│ authorized decrypt or FHE    │
│ computation, as applicable   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│ Leopold contracts                                          │
│ lcUSDC · four vaults · TWAB · encrypted draw · escrow     │
│ close → aggregate → randomness → selection →              │
│ reconciliation → allocation → settlement                  │
└───────┬──────────────────────┬───────────────────────────┘
        │                      │
        ▼                      ▼
┌───────────────────────┐  ┌──────────────────────────────┐
│ Circle Sepolia USDC   │  │ Compound III / Comet strategy │
│ canonical public asset│  │ per-vault production adapter │
└───────────────────────┘  └──────────────────────────────┘

Public audit data: addresses, round metadata, registration counts, prizes,
settlement cursors, transactions, escrow accounting.

Encrypted values: balances, principal, TWAB, ticket, predicates, winner,
winnings, and encrypted accounting values used by settlement.

User-authorized decryptions: the connected verified wallet may explicitly
reveal its own private balance, savings, eligibility, or settled result.
Protocol-only encrypted computation: the contracts and FHEVM evaluate TWAB,
randomness, selection, reconciliation, and allocation without clear values.
```

Settlement is permissionless. No keeper or administrator is needed, but a caller must advance the lifecycle after a
round closes. The official vaults use the same reviewed `LeopoldVault` bytecode with separate storage and separate
Compound III adapters; the registry does not custody funds or decrypt values.

## Privacy/decryption matrix

| Datum                                | Encrypted/public                                  | Who can decrypt                                                                | When/why it becomes public, if ever                                                                                                    | Persistence/exposure boundary                                                                                                                      |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private USDC balance                 | Encrypted `euint64` handle                        | The verified owner wallet through the Zama user-decrypt flow                   | It is never protocol-public; the user may explicitly reveal it                                                                         | Clear bigint exists only in provider/controller browser memory; cleared on 60s expiry, blur/hidden tab, logout, account or financial-wallet change |
| Vault savings principal              | Encrypted `euint64` handle                        | The verified owner wallet                                                      | It is never protocol-public; the user may explicitly reveal it                                                                         | Provider memory only; the revealed vault value and handle are cleared by the same privacy lifecycle                                                |
| TWAB / eligibility                   | Per-user encrypted `euint128`                     | The registered owner wallet after the round permits materialization            | The aggregate TWAB may be publicly proven for settlement; an individual weight remains private                                         | Individual clear weight is session-only after explicit reveal; no raw handle/proof crosses the UI controller                                       |
| Random ticket / candidate            | Encrypted `euint128`                              | Protocol FHE/KMS computation; no participant, keeper, or admin authorization   | Candidate validity is proven publicly as required; the accepted ticket remains encrypted                                               | Contract ciphertext/ACL only; never copied into UI state                                                                                           |
| Winner-selection internals           | Encrypted predicates, prefix, and winner count    | Protocol FHE/KMS computation                                                   | Reconciliation exposes only the required public objective proof, not a winner identity                                                 | Contract ciphertext/ACL only; no clear winner branch or winner event                                                                               |
| Private prize result                 | Encrypted winnings/result handle                  | The registered verified owner wallet after settlement                          | Only after that participant explicitly requests a reveal                                                                               | Provider/controller memory for the browser session; no persistence or automatic reveal                                                             |
| Winnings                             | Encrypted user winnings balance                   | The verified owner wallet for an authorized withdrawal/reveal                  | A withdrawal produces the public token transfer transaction, not a public winnings balance                                             | Encrypted contract balance; any clear preview is session-only                                                                                      |
| Round metadata                       | Public                                            | Anyone                                                                         | Public by protocol design: vault, round, timestamps, state, cursors, and registration count                                            | On-chain and permanently auditable                                                                                                                 |
| Sponsorship and public prize amounts | Public                                            | Anyone                                                                         | Sponsorship and finalized public reserve are public accounting facts; an open-round UI preview adds the separate sponsored amount once | On-chain public accounting and frontend public read model                                                                                          |
| Make Public flow                     | Encrypted input until explicit user authorization | The verified owner initiates; the protocol finalizes the authorized conversion | The resulting public USDC transfer is observable on-chain                                                                              | Clear amount is not persisted by the frontend; transaction metadata remains public                                                                 |
| Escrow/refund/reward accounting      | Public amounts and claim flags                    | Anyone                                                                         | Bond, liabilities, refund claims, and settlement reward credits are public accounting required for auditability                        | On-chain escrow state and public transaction history                                                                                               |

The strongest privacy property is the accepted random ticket: it remains encrypted and is never authorized for
participant, keeper, or administrator decryption. Public settlement proofs do not change that property.

## Browser reveal policy

The provider owns all decrypted values. After any successful private reveal it arms one session-wide 60-second expiry;
the latest reveal restarts that window. A hidden document or window blur clears every provider-held private bigint,
handle, revealed-set marker, and the Zama private session immediately. Logout, account change, verified financial-wallet
change, disconnect, and network/session identity changes perform the same clear. In-flight reveals are
generation-checked so a result from the prior identity cannot repopulate the new session. No clear private value is
written to localStorage, sessionStorage, cookies, logs, or transaction history.

## HCU guardrails

Leopold's existing HCU infrastructure is the authority for thresholds and measurement:
`hre.fhevm.computeTransactionHCU(receipt)` from the pinned FHEVM tooling, the CP1 selector evidence validator, and the
SG4 authority protocol. The installed transaction ceilings are 20,000,000 total HCU and 5,000,000 dependency-depth HCU.
The strict internal safety gates are 75% of those values: `globalHCU < 15,000,000` and `maxHCUDepth < 3,750,000`;
equality is a failure.

The existing live CP1 selector evidence records these representative values (total/depth HCU):

| Path                   | Production shape                                      |   Measured total/depth |
| ---------------------- | ----------------------------------------------------- | ---------------------: |
| TWAB user query        | euint64 → euint128 widening and interval accumulation |  2,170,096 / 1,215,032 |
| Round-close accrual    | euint128 cumulative update                            |  1,215,096 / 1,215,032 |
| Candidate generation   | production-width `euint128` randomness                |        25,064 / 25,000 |
| Candidate validity     | euint128 range predicate                              |      149,032 / 149,000 |
| Accepted-ticket modulo | euint128 remainder                                    |  1,943,032 / 1,943,000 |
| Selection chunk        | four participant encrypted steps                      | 12,864,288 / 2,678,064 |
| Allocation chunk       | four auto-save encrypted steps                        | 11,416,416 / 2,579,064 |

The deterministic selector test now applies both strict safety gates to every measured selector/allocation composite,
including TWAB, candidate, selection, and allocation paths. The CP1 evidence validator independently verifies the
captured receipt measurements and public aggregate/validity proofs. Production uses euint64 balances, euint128 TWAB /
ticket / candidate values, and the measured safe chunk size of four.

The current local FHEVM harness does not provide a stable isolated HCU receipt for the complete deployed-vault
aggregate-finalization/reconciliation sequence, so no fabricated number is reported for that path. Functional contract
tests and the required public-proof checks remain the deterministic guardrail; a new authoritative HCU measurement is
required before changing its production batching or claiming a numeric envelope.

The known sequential 32-step winner shape reaches `HCUTransactionDepthLimitExceeded` locally and is retained as a
negative boundary; it is not substituted for the production chunk-4 result.

See [`docs/security/SG4_HCU_AUTHORITY_PROTOCOL.md`](../security/SG4_HCU_AUTHORITY_PROTOCOL.md),
[`evidence/cp1/LEOPOLD_SELECTOR_HCU_LIVE.json`](../../evidence/cp1/LEOPOLD_SELECTOR_HCU_LIVE.json),
[`scripts/validate-leopold-selector-hcu-evidence.ts`](../../scripts/validate-leopold-selector-hcu-evidence.ts), and
[`test/LeopoldSelectorHcuHarness.ts`](../../test/LeopoldSelectorHcuHarness.ts) for the executable sources.
