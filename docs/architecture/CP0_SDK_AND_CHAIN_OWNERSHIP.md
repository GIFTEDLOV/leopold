# CP0 SDK, Chain, and Toolchain Ownership

## SDK ownership matrix

| Capability                                         | Owner                                | Boundary and evidence                                                                              |
| -------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Solidity contract types and FHE calls              | `@fhevm/solidity` 0.11.1             | Contract-only API; SG-1 through SG-5 compile and live evidence.                                    |
| Hardhat contract tooling and encrypted test inputs | `@fhevm/hardhat-plugin` 0.4.2        | Local/contract tests only; not shipped to the browser.                                             |
| Keeper public decryption and proof retrieval       | `@zama-fhe/relayer-sdk` 0.4.1        | Sole settlement public-decryption lineage. SG-2 produced value 42 and an onchain-verifiable proof. |
| Onchain public-decryption proof verification       | Solidity `FHE.verifySignatures()`    | Contract verifies the proof produced by the keeper lineage; SG-2 is the live evidence.             |
| Browser encrypted input and input proof            | `@zama-fhe/sdk` 3.4.0                | Production browser lineage; SG-5 clean-context evidence.                                           |
| Browser user decryption                            | `@zama-fhe/sdk` 3.4.0                | User-authorized result only; SG-5 proves authorized success and unrelated-user rejection.          |
| React integration                                  | `@zama-fhe/react-sdk` 3.4.0          | Frontend lifecycle wrapper; it does not own settlement or keeper operations.                       |
| Production settlement public decryption            | Keeper `@zama-fhe/relayer-sdk` 0.4.1 | Exactly one owner. Browser SDKs must not substitute for this path.                                 |

The keeper and browser lineages are deliberately separate. There is no “either SDK” fallback for settlement.

## Sepolia and relayer configuration

- Expected chain ID: `11155111`.
- Contract preset source: installed `@fhevm/solidity/config/ZamaConfig.sol`, authenticated by the closed SG-4 record.
- Browser relayer source: installed `@zama-fhe/sdk` Sepolia configuration used by the SG-5 production bundle.
- Browser owner: frontend runtime configuration and the EIP-1193 wallet interface. SG-5 proves deterministic refusal
  when the provider reports the wrong chain.
- Keeper owner: keeper-only environment and `@zama-fhe/relayer-sdk`; `docs/operations/KEEPER_CREDENTIAL_POLICY.md`
  requires a dedicated credential.
- RPC/relayer secrets, if any, remain environment-owned and are never committed or exposed through `NEXT_PUBLIC_*`.
- Missing, malformed, or wrong-chain configuration is fail-closed: no encrypted transaction or settlement action may be
  submitted.

## Solidity and Cancun decision

Project contracts hold Solidity `0.8.27` with `evmVersion: "cancun"`, optimizer runs 800, and metadata bytecode hash
disabled as recorded in `hardhat.config.ts`. The current stack compiles the pinned FHEVM contracts, and SG-4 identifies
the authority implementation's transaction-scoped HCU accounting through Cancun `tload`/`tstore`. A forced compile on
2026-08-10 succeeded without warnings. This is a compatibility pin, not a claim that every dependency uses 0.8.27.

Reconsider the pin only through a coordinated checkpoint when a security advisory, network EVM-target change,
FHEVM/OpenZeppelin compatibility requirement, or dependency upgrade requires it. Such a change must rerun contract,
SG-4, browser, and transient-composition validation before adoption.

## Template provenance

- Repository: `https://github.com/zama-ai/fhevm-hardhat-template.git`
- Commit: `ec84e1aa1b0a3ef61d9795ef8bf367115b79272f`
- Branch context: `refs/heads/main`
- Method: read-only `git ls-remote` on 2026-08-10 returned the exact commit for both `HEAD` and `refs/heads/main`.

This verifies that the recorded foundation commit belongs to the expected official Zama template repository.
