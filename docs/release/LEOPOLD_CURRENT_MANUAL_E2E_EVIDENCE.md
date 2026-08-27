# Leopold current manual browser evidence

## Classification

Status: `MANUAL_OPERATOR_REPORTED`

This record captures the manual browser proofs supplied for the current pre-release review. It is not an automated test
result and does not replace the machine-readable evidence under `evidence/`. No OTP, email address, private key, session
token, ciphertext handle, input proof, or decrypted private value is recorded here.

Review branch: `ui/full-site-refresh`
Review commit: `180fef455f7118d3d8ee40f400915e19265119b1`
Network: Ethereum Sepolia (`11155111`)

## Completed browser proofs

The following were manually completed and reported as successful:

- Email-first authentication, including email OTP.
- Wallet-first authentication with a new email, OTP verification, username setup, and financial-wallet confirmation.
- Private USDC reveal from the authorized wallet.
- Weekly vault savings reveal from the authorized wallet.
- Weekly open-round prize projection of `0.1 USDC`.
- Wrong-network protection and recovery.
- Disconnect and reconnect recovery.
- Wrong-wallet rejection for financial actions.
- Make Public of `0.1 USDC` through the authenticated flow.

## Still separate from this record

These manual proofs do not claim that official Weekly round 1 has closed or settled. The following remain post-close
lifecycle checks:

- aggregate finalization and encrypted randomness;
- private selection, reconciliation, allocation, and settlement;
- authorized result reveal;
- bond refund and settlement reward claims; and
- any applicable winnings withdrawal.

The official Weekly round must remain untouched until its close time and a fresh on-chain settlement preflight is
completed.
