# Leopold live browser smoke checklist

This checklist is for the reviewed official four-vault Sepolia deployment. It must not be run against historical or
disposable addresses.

1. Confirm `config/leopold-frontend-contracts.json` has non-null lcUSDC, registry, and four vault/adapter/escrow
   addresses.
2. Verify each address has Sepolia bytecode and the registry/vault/asset/adapter/escrow backpointers match the frozen
   manifest.
3. Run the configuration, ABI freeze, bytecode, frontend, and full regression validators.
4. Stop any existing frontend process, verify port 3000 is free, and start the production or development frontend only
   at `http://localhost:3000` with no development-fixture flag.
5. In a clean Chromium profile, connect an ordinary injected wallet and verify wrong-chain switching before any FHE
   work.
6. Acquire canonical Circle Sepolia USDC through Get Test USDC; record the public faucet receipt and refreshed balance.
7. Make an exact amount private; record approval if required, wrap receipt, private-processing state, and authorized
   Private USDC reveal. Confirm another wallet cannot decrypt it.
8. Open Weekly, Save privately, record the receipt, reveal principal, and confirm no strategy wait appears in the user
   success path.
9. Read the exact current public bond, enter the active Weekly round with that value, and verify registration timestamp,
   public entry, and non-retroactive eligibility copy.
10. Materialize and privately reveal current-round eligibility. Confirm rejection/error behavior for a different wallet.
11. Observe active, closed, Finalizing private draw, and settled states without exposing participant arrays, ticket, or
    winner.
12. Reveal the private result with the registered wallet. Confirm no public inference or off-chain winner persistence.
13. Claim the deterministic public bond refund when available and any independently credited settlement reward.
14. Withdraw principal to Private USDC, then request Make Public and wait for actual authenticated unwrap finalization
    before claiming completion.
15. Reload after submitted transactions and verify public lifecycle recovery without stored confidential data.
16. Switch account and network; verify every decrypted balance/result disappears immediately.
17. Inspect console, storage, URLs, network bodies, server output, and telemetry for decrypted values, handles, input
    proofs, signed permits, or confidential amounts.
18. Capture screenshots and sanitized public transaction hashes for `/`, `/app`, vaults, Weekly detail, prizes, rewards,
    activity, profile, help, transparency, and ops.

Passing this checklist is the only basis for “LIVE E2E PASSED.”
