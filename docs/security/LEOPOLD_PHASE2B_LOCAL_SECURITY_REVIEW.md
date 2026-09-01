# Leopold Phase 2B Local Security Review

Status: internal local review; not an external audit and not deployment authorization.

## Version isolation

The frozen `LeopoldVault` and `LeopoldSettlementBondEscrow` sources are unchanged. Phase 2B introduces `LeopoldVaultV2`
and `LeopoldSettlementBondEscrowV2`; a future deployment must use new addresses and a separately identified manifest.
The historical contract-freeze validator still passes unchanged.

`LeopoldVaultV2` differs from the frozen vault only in its contract/interface names and the escrow class instantiated by
its constructor. Its deployed runtime SHA-256 is therefore identical to the frozen vault runtime. No round, principal,
strategy, randomness, selection, allocation, proof, or FHE ACL code changed.

## Auto-entry and accounting invariants

- Enabling or disabling is wallet/vault scoped and becomes effective at `activeRoundId + 1`.
- Disabling never removes an accepted current-round registration or unlocks its reserved bond.
- `registerForRoundFor(account, roundId)` is permissionless, but the V2 escrow checks effective opt-in and exact
  available credit before atomically reserving one `BOND_AMOUNT`.
- The immutable vault callback remains authoritative for current-round/open-state/duplicate checks; any callback revert
  restores the credit debit.
- The participant, eligibility timestamp, private ACL owner, result owner, and refund owner remain `account`, never the
  keeper/caller.
- Available automation credit, unresolved round liability, reward liability, refund liability, and cumulative
  withdrawals are separate public ledger categories.
- `totalDeposited` continues to cover only bonds committed to rounds. `totalNativeFunded` additionally records credit
  top-ups. The on-chain invariant checks both the round ledger and complete native-funding conservation.
- Refunds remain pull-claimed and never become automation credit implicitly. Recycling would require a separate explicit
  future operation.

## Privacy and permissions

Preference, credit, registration, and timing are intentionally public. The keeper reads no principal, exact TWAB,
ticket, winner predicate, winnings, or private result. A zero-balance opted-in wallet may consume its own funded bond
and receives encrypted zero weight without exposing a public balance-existence predicate.

The keeper proof adapter exposes only Zama `publicDecrypt` for the three already-public proof handles: aggregate TWAB,
candidate validity, and selection reconciliation. It has no user-decrypt or permit path. The unchanged V2 vault runtime
preserves every frozen FHE permission and proof check.

## Internal findings

No new Critical or High contract finding was identified in the local review and tests. Remaining deployment blockers and
residuals are:

- A fresh independent/external review remains recommended for Sepolia and is mandatory for mainnet/production-capital
  release. The current Sepolia waiver is a project-owner decision, not an external audit or certification.
- The V2 escrow has new ABI, bytecode, storage, and native-liability semantics and therefore needs a new freeze record,
  deployment evidence, source verification, and topology checks before use.
- Auto-entry identities and funding status are public by design. A wealthy actor can still fund many entries, but every
  accepted round consumes a full user-funded bond and settlement work remains proportionally collateralized.
- The auto-entry registry contains only funded accounts that are currently or prospectively enabled. Unfunded opt-outs
  never become enumerable work; a permissionless O(1) prune removes stale entries after a disable boundary or credit
  depletion. Keeper discovery is bounded per poll and its circular account and historical-round cursors are persisted in
  the fsync-and-rename journal so restarts resume instead of rescanning from zero.
- Every configured RPC is queried for `eth_chainId`; all must identify Sepolia. Authoritative reads use a quorum equal
  to the configured endpoint count and snapshots pin both block number and block hash, failing closed on same-height
  fork or response disagreement.
- Keeper-submitted receipts remain `confirmed` until `KEEPER_CONFIRMATIONS` is reached. A previously confirmed action
  whose receipt disappears is marked `reorged`; a replay gets a new attempt id while the prior transaction, nonce,
  calldata digest, block identity, and transition history remain intact.
- Keeper alerts require an external log/monitoring sink. The repository supplies structured events and fail-closed
  outcomes, not a hosted alert service.
- No new Sepolia deployment, live proof-path run, two-keeper live race, or reorg drill has been performed.

Conclusion: the local implementation is suitable for pre-deployment review, but is not yet safe or authorized for a new
Sepolia deployment.
