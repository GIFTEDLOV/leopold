# Leopold V2 official deployment-attempt recovery

The official V2 deployment runner uses a one-shot deployment journal. If a deployment transaction succeeds but a later
verifier fails, the topology is recorded as an unresolved deployment attempt. It is never silently reclassified as a
successful deployment.

`pnpm deploy:v2:official:adopt` is a read-only adoption verifier. It requires the unresolved attempt record and
deployment journal, checks both configured Sepolia RPCs at a common finalized block, reconciles deployment receipts and
CREATE-derived addresses, verifies the reviewed build-info runtime templates with constructor immutable slots
normalized, checks each immutable value separately, and confirms that the controlled keeper and smoke wallets have not
sent transactions.

The verifier emits `PENDING_EXPLICIT_APPROVAL`. It does not write the official V2 manifest, change the V1 manifest,
submit a transaction, or create a release checkpoint. Adoption evidence may be written only after the original failure,
subsequent read-only verification, and explicit project-owner approval are recorded.

An adoption record must retain:

- the exact candidate and deployment-preparation SHAs;
- every successful deployment transaction, nonce, block, constructor argument, and derived address;
- the original runner failure;
- the assertion that no participant or keeper activity occurred while unresolved;
- the read-only verification result and finalized RPC snapshot;
- explicit adoption approval as a separate release decision.

The original failed attempt remains part of the audit trail even when the topology is later adopted.
