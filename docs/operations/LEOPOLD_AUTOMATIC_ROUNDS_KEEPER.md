# Leopold Automatic-Rounds Keeper

Status: local Phase 2B implementation only. This document does not authorize a deployment or a funded live keeper.

## Role and trust boundary

The keeper is an optional permissionless liveness worker. It has no vault role, custody authority, private-decryption
permission, user permit, principal access, strategy authority, or deployment credential. The manual/any-caller contract
path remains available for every lifecycle operation.

The worker derives one legal write at a time from a single pinned block:

1. close an expired active round;
2. register one funded, effective, opted-in V2 account for an open active round;
3. advance the oldest unfinished historical round through its proof, randomness, selection, reconciliation, allocation,
   or finalization phase.

Expired active rounds always take priority because historical allocation requires the current accumulation round to be
open. Auto-entry takes priority over historical settlement only while the active round is still open.

## Runtime modes

From `keeper/`:

- `pnpm keeper:once` performs preflight, reconciles any outstanding transaction, and submits at most one write.
- `pnpm keeper:service` repeats the same single-write pass at `POLL_INTERVAL_MS` until graceful shutdown.

Both modes require a dedicated Sepolia key distinct from `DEPLOYER_ADDRESS`. The configured balance floor is reserved
when evaluating maximum transaction cost, and the balance ceiling limits accidental key funding. RPC URLs, private keys,
and signer configuration are redacted from structured logs.

At startup every configured endpoint is queried with `eth_chainId`; an endpoint that is not Sepolia aborts startup. With
multiple endpoints, the fallback quorum equals the endpoint count. Each planning snapshot pins a block number and hash,
rechecks that identity after all reads, and refuses to plan or broadcast on any response or same-height fork
disagreement.

The official manifest remains settlement-only unless a vault entry explicitly contains `"implementation": "v2"` and
`"automaticEntry": true`. This pair of markers is accepted only for a reviewed V2 vault/escrow pair. The gateway
verifies both the vault's immutable escrow address and the escrow's vault backpointer at a pinned block before planning.

## Journal and process lock

The V2 journal records the action key, participant/cursor when applicable, signed transaction hash, calldata digest,
nonce, timestamps, receipt block, status, and sanitized error code. It is written and synced before broadcast, then
atomically renamed. The process lock prevents two local processes from sharing one signer/journal nonce domain.

Prepared, submitted, confirmed, reverted, and unknown entries block new writes until authoritative receipt and contract
state can reconcile them. A receipt below `KEEPER_CONFIRMATIONS` remains `confirmed` and cannot sequence dependent
lifecycle work. A previously confirmed receipt that disappears after a shallow reorg is marked `reorged`; replay uses a
new attempt id and retains the old attempt and transition history. A broadcast timeout is never retried blindly. A
crash-surviving lock is intentionally not removed automatically: first prove the old process is gone, inspect the
journal, receipt, signer nonce, and current contract state, then remove the stale lock as an explicit operator action.

## Auto-entry scanning

V2 escrow discovery contains only funded accounts that are currently or prospectively enabled; an unfunded opt-out does
not create a registry entry. A permissionless `pruneAutoEntryAccount` call removes an account in O(1) once its effective
opt-in or bond credit is gone. The keeper scans a bounded circular page per vault (`KEEPER_AUTO_ENTRY_SCAN_SIZE`, 1–500)
and persists its cursor in the journal. Exact accounts attached to outstanding journal entries are always re-read even
if they are outside the current page. Historical-round discovery uses a separate bounded, persisted cursor
(`KEEPER_HISTORICAL_SCAN_SIZE`, 1–500), so a restart does not rescan all prior rounds.

## Required monitoring

Structured logs must feed alerts for low balance, balance-ceiling violations, due rounds, repeated proof failures,
unresolved journal entries, missing receipts, consumed nonces with unknown outcomes, RPC/topology failures, and escrow
liabilities that remain unresolved beyond the reviewed service window. Alerting is operational infrastructure, not a
contract correctness dependency.

## Before any live use

Do not point this worker at a new V2 Sepolia manifest until the local pre-deployment report, project-owner authorization
or recommended independent review, V2 freeze/bytecode evidence, deployment topology, keeper funding profile, and
disposable-deployment race/crash tests have all been reviewed. No UI depends on this worker and no frontend bundle may
contain its key.
