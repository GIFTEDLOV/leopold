# SG-4 HCU authority protocol

## Executive decision

This document preregisters authority protocol version `sg4-hcu-authority-protocol/v1`. It records how the SG-4 HCU
blocker is resolved, not that it has been resolved live. No live RPC call was made, no benchmark was executed, and no
evidence was created. SG-4 remains PENDING and SG-5 remains PENDING.

The previous SG-4 preregistration recorded that no locally authoritative numeric HCU ceiling existed. That premise was
incorrect. Candidate ceilings are present in installed, integrity-pinned code, and they are bindable to the live
deployment through a chain that is machine-verifiable end to end and needs no narrative source, no live transaction, and
no trust in documentation prose. **That chain has not been walked yet.** Nothing in this document is a verified fact
about the contract deployed on Sepolia.

Two independent per-transaction controls appear in the installed implementation, not one:

| Control           | Symbol                                       | Local expected value | Enforcement error                  | Measurement   |
| ----------------- | -------------------------------------------- | -------------------- | ---------------------------------- | ------------- |
| Transaction total | `MAX_HOMOMORPHIC_COMPUTE_UNITS_PER_TX`       | 20,000,000 HCU       | `HCUTransactionLimitExceeded`      | `globalHCU`   |
| Dependency depth  | `MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX` | 5,000,000 HCU        | `HCUTransactionDepthLimitExceeded` | `maxHCUDepth` |

Both are `private constant` with no getter, so each value is read from the executable enforcement path of the installed
artifact. Confirmation by address-normalized bytecode identity against the deployed implementation is **prepared and not
performed**, so both values are recorded as local expectations pending live deployment binding, and both block.

Seven things are unresolved and blocking: the block or batch control, the operation-schedule authority, the immutable
upstream provenance (recorded from prior review, pending reverification), the network ceiling semantics, the current
official artifact identity, the preparation A→B binding record, and the live read-only verification itself. The current
authority verdict is **BLOCKED**.

## Network ceilings versus internal safety boundaries

These are two different things and are recorded separately.

The **network ceiling semantics are `UNRESOLVED` and blocking.** Two sources disagree about the enforcement operator,
and therefore about whether the configured ceiling is inclusive:

| Source                                         | Operator | Configured ceiling | Greatest accepted total | Greatest accepted depth |
| ---------------------------------------------- | -------- | ------------------ | ----------------------- | ----------------------- |
| Local installed `@fhevm/host-contracts@0.10.0` | `>=`     | exclusive          | 19,999,999              | 4,999,999               |
| Prior-reviewed current deployment (v0.3)       | `>`      | **inclusive**      | 20,000,000              | 5,000,000               |

The local reading is `LOCAL_EXPECTED_PENDING_LIVE_BINDING`; the prior-reviewed reading is
`EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION`. Offline material cannot decide which the deployed implementation
uses, so neither is recorded as fact and neither is pinned as the PASS requirement.

A live PASS requires the resolved enum value — `CONFIGURED_CEILING_INCLUSIVE_REVERT_ON_GREATER_THAN` or
`CONFIGURED_CEILING_EXCLUSIVE_REVERT_ON_GREATER_THAN_OR_EQUAL`, never `UNRESOLVED` — resolved from the verified
authoritative deployed implementation, with the limit values and enforcement paths bound to that same implementation and
with the operator, the boundary, and the greatest accepted value mutually coherent.

The **internal SG-4 safety boundary is unaffected by any of that.** It is the existing 75% benchmark rule, applied to
both controls, and its comparisons are strict `<` whether or not the network ceiling turns out to be inclusive:

- total safety threshold 15,000,000; GO requires `globalHCU < 15000000`;
- depth safety threshold 3,750,000; GO requires `maxHCUDepth < 3750000`.

Both comparisons are exclusive. Equality with either boundary is NO-GO **regardless of whether the network ceiling
itself is inclusive**. Combined GO requires both to pass; neither metric may substitute for the other, a missing metric
fails rather than being skipped, and no single combined HCU number is accepted in place of the two.

## Why the depth control matters

The depth control, not the total, is what the sequential winner circuits bind against. `WINNER_CHUNK_32` was observed
locally to revert with `HCUTransactionDepthLimitExceeded` rather than `HCUTransactionLimitExceeded`. Under the previous
single-ceiling model that failure had no corresponding rule, so the protocol could have granted GO to a configuration
the network rejects. That is the defect this amendment closes.

## Authority root and why transitive is insufficient

The authority root is `@fhevm/host-contracts` version `0.10.0`, pinned as an exact direct development dependency with no
caret or tilde, with a consistent `pnpm-lock.yaml` entry and a confirmed `sha512` integrity hash.

Before this pin the package was reachable only through `@fhevm/hardhat-plugin`'s private dependency tree and was **not
resolvable from the repository root at all**. Two consequences follow, and either alone justifies the pin:

- a plugin upgrade could have replaced the authority implementation silently, with no manifest or lockfile change that
  named the authority root;
- the verifier could not have resolved the authority root by its own name, and would have had to reach into another
  package's private tree to find it.

The verifier resolves the authority root through the repository-root `node_modules`. If the direct pin is removed the
path disappears and preflight fails rather than falling back to the plugin's private copy. The verifier additionally
rejects a missing direct pin, a range specifier, version drift, lockfile drift, installed-package drift, and source-hash
drift.

## Comment versus code: the `DEPTH_PER_TX` discrepancy

The installed source documents `MAX_HOMOMORPHIC_COMPUTE_UNITS_DEPTH_PER_TX` as "Maximum homomorphic complexity units
depth per block." That docstring is wrong. Scope is established from executable code paths and enforced state
transitions:

- the symbol name ends in `_PER_TX`;
- enforcement occurs in `_adjustAndCheckFheTransactionLimitOneOp/TwoOps/ThreeOps`, which run per operation within a
  single transaction;
- operand depth is written and read with `tstore`/`tload` transient storage, which is cleared at the end of every
  transaction and therefore cannot accumulate across a block.

The discrepancy is recorded rather than silently corrected. The extractor fails closed: if the enforcement path cannot
be established, the scope is reported `UNRESOLVED` even though the constant and the docstring are both still present. A
test removes the enforcement path while leaving the comment intact and asserts that the result becomes `UNRESOLVED`, so
the comment can never establish scope on its own.

## Applicable-limit state machine

Every potential control carries a closed authority state. `null` alone never carries authority meaning.

| State                                      | Value                               | Blocking        |
| ------------------------------------------ | ----------------------------------- | --------------- |
| `PROVEN_PRESENT`                           | required                            | no              |
| `PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION` | forbidden                           | no              |
| `LOCAL_EXPECTED_PENDING_LIVE_BINDING`      | required                            | **yes**         |
| `UNRESOLVED`                               | —                                   | **yes, always** |
| `NOT_APPLICABLE`                           | forbidden, explicit reason required | no              |

Each control also carries a `liveDeploymentBinding`. `PROVEN_PRESENT` and `PROVEN_ABSENT_IN_VERIFIED_IMPLEMENTATION`
both require `BOUND_TO_VERIFIED_DEPLOYED_IMPLEMENTATION`; offline preparation makes no RPC call, so it can never produce
either.

Current prepared controls — **all three block**:

- `TRANSACTION_TOTAL_HCU` — `LOCAL_EXPECTED_PENDING_LIVE_BINDING`, local expected value 20,000,000, per transaction;
- `TRANSACTION_DEPTH_HCU` — `LOCAL_EXPECTED_PENDING_LIVE_BINDING`, local expected value 5,000,000, per transaction;
- `BLOCK_OR_BATCH_HCU` — `UNRESOLVED`, no value.

### Why block/batch is not recorded as proven absent

An earlier revision concluded absence from a scan for `uint256 private constant MAX_*`. That scan matches one exact
declaration shape and therefore proves nothing about absence. It is blind to `uint48` and every other width, to
`public`, `internal`, and `immutable` variables, to storage-struct fields, to mappings and accumulators, to getters, and
to enforcement paths. Any of those could carry a block-scoped ceiling.

Absence now requires all of:

1. the deployed implementation identified by address-normalized code identity at a pinned block;
2. a **complete** enumeration of that implementation's declaration scope — every statement classified, with any
   unclassifiable statement making the enumeration incomplete and the conclusion unavailable;
3. no block-scoped or batch-scoped declaration in the enumerated code. Comments are stripped before the scan, so a
   docstring can neither create nor remove a candidate.

Until then the control is `UNRESOLVED` and blocks. After a successful live code-identity match the verifier may classify
it as proven present (with a value extracted from the verified implementation) or proven absent. The benchmark gate
stays blocked for as long as it is unresolved.

## Immutable provenance

Package integrity pins the bytes that are installed. It does not identify the upstream revision those bytes were built
from, and it says nothing about which revision is deployed on Sepolia. Treating an unresolved upstream commit as "not a
control" and then claiming end-to-end authority does not follow, so provenance is a control.

An earlier revision went further wrong in the other direction: it claimed no already-reviewed material carried exact
immutable tuples and left every field `null`. That was factually incorrect and discarded reviewed work. The prior
reviewed authority investigation did carry exact tuples, and they are recorded here in full.

State: **`EXPECTED_FROM_PRIOR_REVIEW_PENDING_REVERIFICATION`** — recorded, and still **blocking a live PASS**.

| Subject                                   | Repository                               | Tag       | Commit                                     | Path                                                         |
| ----------------------------------------- | ---------------------------------------- | --------- | ------------------------------------------ | ------------------------------------------------------------ |
| Current official authority source         | `https://github.com/zama-ai/fhevm`       | `v0.13.2` | `07fb05fb75f0aa6cea934088640ddb4539d0b1b9` | `host-contracts/contracts/HCULimit.sol`                      |
| Current official operation-price schedule | `https://github.com/zama-ai/fhevm`       | `v0.13.2` | `07fb05fb75f0aa6cea934088640ddb4539d0b1b9` | `library-solidity/codegen/src/operatorsPrices.ts`            |
| Installed calculator                      | `https://github.com/zama-ai/fhevm-mocks` | `v0.4.2`  | `fa852da4aa4b04231e0fa748e7b4480ae756ce91` | `packages/mock-utils/src/fhevm/coprocessor/hcu.ts`           |
| Installed operation cost table            | `https://github.com/zama-ai/fhevm-mocks` | `v0.4.2`  | `fa852da4aa4b04231e0fa748e7b4480ae756ce91` | `packages/mock-utils/src/fhevm/coprocessor/HCUByOperator.ts` |
| Installed Solidity configuration          | `https://github.com/zama-ai/fhevm`       | —         | `60d3082657fcf2648774b5c4282b08bc22ecee36` | `library-solidity/config/ZamaConfig.sol`                     |

Content hashes:

- authority source `16d71ee5f899f1bfd5872bdb83e08d90f510fd529cd8a93d5001dc29f25634b8`;
- operation-price schedule `48363444ec4af98d2139572be1c3fa545c9d9cfa93d72a353237f8137cc4326a`;
- installed calculator `9baddc2fdd7c4d6423928b5b9ac568aed9d80b03913df9a1ca166cc51d1896ba`;
- installed cost table `dbe4e9cc500544a8750a37f5526e0e9907427b78ac17d3c49f079d9d21314aa1`;
- Solidity configuration expected Sepolia executor `0x92C920834Ec8941d2C77D188936E1f7A6f49c127`.

The two installed hashes are the same values the verifier independently recomputes at preflight, so the recorded
provenance and the enforced pins agree.

The known upstream roots are `zama-ai/fhevm` and `zama-ai/fhevm-mocks`. Unrelated candidate repositories are **not**
substituted for them.

Why this still blocks. Nothing above was fetched or reverified during offline preparation, every subject carries
`reverified: false`, and none of it establishes which revision is deployed behind the authority proxy. Prior-reviewed
data alone is **not** final live evidence. Reverification requires fetching each recorded repository/tag/commit/path and
confirming its content hash, confirming the installed calculator and cost table against their recorded upstream hashes,
and linking the reverified official authority source to the implementation deployed at a pinned block.

## Artifact identity: three separate roots

An earlier revision compared deployed code against a normalized runtime hash built from the local
`@fhevm/host-contracts@0.10.0` package, while the same protocol recorded that the deployed stack may differ from that
package. That either predetermines a live mismatch or promotes an old local artifact to current authority. The roots are
now separate:

| Root                      | What it is                                            | Role                                                                  |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| Local installed fixture   | pinned `@fhevm/host-contracts@0.10.0` artifact        | **offline parser and normalization self-test only**                   |
| Current official artifact | the prior-reviewed upstream artifact at `v0.13.2`     | normalized runtime hash **`UNRESOLVED`**, blocking                    |
| Verified deployed         | the implementation behind the proxy at a pinned block | established only by comparison against the resolved official artifact |

The local fixture's normalized hash `83350c6350999e2edad550d0541911100d63ffd4eb8f45d9a6e97ab165c1662b` remains the
target for the offline normalization self-test, and is **never** the acceptable PASS hash for current Sepolia. The
verifier refuses to accept it as the authoritative expectation even if it is supplied as one.

While the authoritative artifact is unresolved, live code identity is **`BLOCKED_AUTHORITATIVE_ARTIFACT_UNRESOLVED`** —
not PASS, and not an automatic FAIL merely for differing from the local fixture.

Once immutable official artifact provenance is resolved, the verifier compares the deployed implementation against that
exact official artifact, verifies compiler metadata and immutable references, normalizes only declared
deployment-specific offsets, and binds code identity, limit semantics, operation schedule, and block/batch enumeration
to that same artifact.

**A PASS may never mix versions.** The result carries an `authoritativeArtifactId` and a `facetArtifactBinding` naming
the artifact behind each of `codeIdentity`, `limitValues`, `limitSemantics`, `operationSchedule` and `blockOrBatch`, and
a PASS requires all five to equal the authoritative artifact. Deployed code from one version with limits, schedule, or
semantics from another is rejected.

### Facet origins: a matching hash does not make local data official

An earlier revision parsed the local `@fhevm/host-contracts@0.10.0` source for the authority table, the authority
surface, the block/batch classification and the total/depth limit values, then labelled every facet
`CURRENT_OFFICIAL_ARTIFACT` merely because the deployed bytecode identity was bound. That is cross-version mixing: the
facts still came from the local 0.10.0 source.

Each facet now carries an explicit **origin** alongside its artifact id:

| Origin                                               | Meaning                                                  | PASS   |
| ---------------------------------------------------- | -------------------------------------------------------- | ------ |
| `AUTHORITATIVE_BINDING_RECORD`                       | derived from the reviewed record for that exact artifact | yes    |
| `AUTHORITATIVE_BINDING_RECORD_ON_CHAIN_CORROBORATED` | as above, and confirmed by an on-chain reading           | yes    |
| `LOCAL_INSTALLED_FIXTURE`                            | read from the local 0.10.0 fixture                       | **no** |
| `UNRESOLVED`                                         | not established                                          | **no** |

The live verifier no longer parses the local source as the deployed authority surface after code identity is verified,
and never promotes local limit values, local enforcement paths or the local operation table to `PROVEN_PRESENT`. The
operation manifest, the limits, the semantics and the block/batch classification all come from the binding record for
the code-identified artifact. The local fixture keeps exactly one job: the offline parser and normalization self-tests.

### On-chain limits are read, not inferred

An earlier call plan read versions and addresses but never queried the HCU limits, deriving the numbers from local
source instead. The plan now queries, at the pinned block and using the **verified** signatures from the binding
record's interface:

- the transaction-total HCU limit;
- the transaction-depth HCU limit;
- the global block/batch cap;
- caller whitelist/exemption applicability.

Selectors are recomputed from their signatures and compared against the record — none is invented. Returned words are
decoded **strictly** as a single `uint256`; a short, long or malformed return is a failure, not a coerced number. Each
reading is compared to the record, and the result is recorded as `MATCHES_BINDING_RECORD`, `MISMATCH`, `NOT_APPLICABLE`,
or `UNRESOLVED`. The verifier fails closed on a missing getter, a malformed result, a value mismatch, an unknown
exemption, or ambiguous applicability.

If the verified authoritative implementation genuinely exposes no getter for a constant, the record must explicitly
declare `ABSENT_DOCUMENTED_IN_BINDING_RECORD` **and** the exact enforcement path; only then may code identity plus the
record establish the value. There is no fallback to local source in any case.

The configured value, the enforcement semantics, and the internal 75% safety threshold remain three separate things and
are recorded separately.

### The full deployment chain is verified

Requiring only that `executorCodeHash` and `authorityCodeHash` were syntactically resolved proved nothing: a changed
executor or proxy could still derive an address and reach a code-identified implementation. The binding record now
defines the complete chain, and the verifier checks every link at the pinned block:

- executor **code identity** against the record's expected runtime hash, not merely code existence;
- executor version coherence against the record;
- authority address derived from that verified executor;
- authority proxy or direct **code identity** against the record;
- implementation resolution **only** under the record's declared deployment model;
- authority implementation code identity against the official artifact;
- authority version coherence against the record;
- reciprocal linkage.

ERC-1967 is **never assumed**. It is used only when the independently reviewed record proves that deployment model for
that contract. A `DIRECT` deployment is handled as a direct deployment — the authority is its own implementation and no
slot is read. Any other model, or an unresolved one, fails closed.

## Operation-schedule authority

The local package narrative and the previously reviewed authority investigation disagree, and the disagreement is not
resolved by silently preferring whichever package happens to be installed.

| Source                                          | Operations | `FheSum` / `FheIsIn` |
| ----------------------------------------------- | ---------- | -------------------- |
| Local package `@fhevm/host-contracts@0.10.0`    | 27         | absent               |
| Installed calculator `@fhevm/mock-utils@0.4.2`  | 27         | absent               |
| Previously identified current official schedule | 29         | present              |

The two installed representations agree with each other. That agreement establishes nothing about the schedule the
deployed implementation enforces: the prior investigation described a deployed stack different from the local package
narrative. Offline material cannot decide between them, so the schedule authority is `UNRESOLVED` and blocking, and
permanent execution stays blocked.

Resolution requires the deployed implementation verified by code identity, its own operation surface enumerated, that
surface compared against the installed calculator with **fail-closed** handling of any operation the calculator cannot
price, and immutable provenance for the authoritative schedule. The live verifier performs that comparison and records
`unsupportedByCalculator`; a non-empty list is a failure, never a priced inference.

## Address-normalized bytecode verification

The current official v0.13.2 build is a reproduced Hardhat build. Its authoritative deployment-dependent values are the
compiler's three `UUPSUpgradeable.__self` references at offsets `17180`, `17221` and `17739`. Each is a 32-byte word
preceded by `PUSH32` (`0x7f`). The artifact contains 32 zero bytes at each location; the deployed implementation
contains `12 zero bytes || authorityImplementationAddress`. Normalization is implementation-address-relative.

The reproduced runtime also contains the Sepolia executor address `0x92C920834Ec8941d2C77D188936E1f7A6f49c127` at
exactly 30 ordinary `PUSH20` (`0x73`) locations. Those are compile-time constants, not compiler immutables. They remain
exact code-identity bytes and are never normalized by the authoritative v0.13.2 path.

Method for the current authoritative build:

1. compare the deployed implementation runtime against the runtime derived from the authenticated Hardhat build-info;
2. normalize only the three compiler-declared `__self` references, after resolving the implementation address from the
   chain;
3. verify each deployed 32-byte word, its preceding `PUSH32`, and the exact authenticated 32-byte zero placeholder;
4. verify runtime length, metadata structure, replacement count, exact replacement positions and the normalized digest;
5. leave all 30 executor `PUSH20` constants byte-for-byte unchanged; an identity difference there is a mismatch, not a
   normalization candidate.

Failure conditions: unknown or incomplete compiler references, wrong AST declaration, unknown offset, extra deployment
word, missing replacement, length mismatch, opcode mismatch, proxy/implementation ambiguity, unrecognized metadata, or
normalized-hash mismatch.

The metadata trailer is validated structurally before anything is compared. It is a 10-byte CBOR payload with a 12-byte
trailer holding only `{"solc": 0.8.24}` and **no** IPFS or bzzr source hash. Because it carries no source-dependent
value, byte-exact equality is asserted over the **full** runtime rather than only the code section. Expected values:

- runtime length 20,231 bytes;
- normalized references at offsets `17180`, `17221` and `17739`, each 32 bytes;
- executor constants at the 30 exact PUSH20 offsets listed in the reproduced-build test fixture.

### Security limits of normalized comparison

- Normalized equality proves the deployed implementation differs from the pinned artifact only at the three declared
  implementation-address-relative compiler immutable words. The 30 executor constants are not normalized; any change to
  one is an ordinary code-identity mismatch.
- Full-runtime equality is sound only because the trailer carries no source hash. If a future artifact embeds an IPFS or
  bzzr hash, the comparison must be re-derived, never relaxed.
- The comparison authenticates the implementation behind the proxy, not future upgradeability. `HCULimit` is
  UUPS-upgradeable, so an authority result is valid only at its pinned block.

## On-chain corroboration

Ordered, all bound to one pinned block number and block hash:

1. `eth_chainId` equals 11155111;
2. pin one block number and its hash; bind every later call to it;
3. `eth_getCode` at the committed executor address, non-empty;
4. derive the authority proxy from the verified executor via `FHEVMExecutor.getHCULimitAddress()`;
5. resolve the implementation with **`eth_getStorageAt`** against the exact ERC-1967 slot
   `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`;
6. `eth_getCode` for the implementation and apply address-normalized comparison;
7. verify reciprocal linkage: `HCULimit.getFHEVMExecutorAddress()` returns the configured executor;
8. verify both `getVersion()` strings;
9. confirm the embedded executor immediates equal the configured executor;
10. enumerate the verified implementation's surface, then classify the block/batch control;
11. compare the verified implementation's operation surface against the installed calculator, failing closed.

### ERC-1967 resolution mechanism

An earlier revision recorded the implementation slot as resolved by `eth_call`. That is not technically valid: a proxy
delegates `eth_call` to its implementation, so `eth_call` cannot read the proxy's own storage slot. A getter would be
acceptable only if the deployed proxy were verified to expose one and its selector were verified; no such getter is
known for `HCULimit`. The slot is therefore read directly with `eth_getStorageAt` at the pinned block, and
`eth_getStorageAt` is on the committed read-only allow-list for exactly that purpose. A zero or malformed slot word is a
blocker, never a fallback to some other resolution path.

The three read-only selectors — `getVersion()` `0x0d8e6e2c`, `getHCULimitAddress()` `0xe0786972`, and
`getFHEVMExecutorAddress()` `0x268d6d31` — are committed as literals and **recomputed** from their signatures at run
time, so a mistyped literal fails rather than silently calling something else.

The configured executor is corroborated by two independently installed sources that agree: `@fhevm/solidity`
`ZamaConfig.sol` `_getSepoliaConfig().CoprocessorAddress` and `@fhevm/hardhat-plugin` `src/internal/constants.ts`.

## Stale plugin HCULimit address

`@fhevm/hardhat-plugin@0.4.2` hardcodes `HCULimitAddress` as `0x594BB474275918AF9609814E68C61B1587c5F838` at
`src/internal/constants.ts` (symbol `constants.ZAMA_FHE_RELAYER_SDK_PACKAGE.sepolia.HCULimitAddress`). It is registered
only so it can be rejected. It is **not** authority for SG-4. The authority address must be derived from the verified
current executor. The verifier rejects any authority result traceable to the stale constant.

The guard is not a substring scan of three files. It covers the **complete SG-4 changed and runtime source scope** — the
harness, the launcher, both protocol generators, the verifier, and both test files — and a file that is in scope but not
presented for scanning is itself a failure, so the scope cannot be silently shrunk. It detects, per file:

- either registered literal address, Sepolia and mainnet;
- the plugin symbols `HCULimitAddress` and `ZAMA_FHE_RELAYER_SDK_PACKAGE`, and any plugin-derived authority helper;
- `import`/`require` of the plugin's internal constants module, in **every** file including the guard's own;
- any alias routing an `HCULimit` constant into an authority position.

`getHCULimitAddress()` — the executor's own getter, and the required derivation mechanism — is explicitly excluded from
the symbol match, so the correct mechanism is never confused with the prohibited constant. The registered values
themselves may appear only in the protocol/guard definition and in the tests.

## Cost-table compatibility

The verifier parses the actual installed representations and compares them. It never hardcodes "compatible".

- installed calculator table — `@fhevm/mock-utils` `HCUByOperator.ts`: **27 operations**;
- authoritative enforcement surface — `HCULimit.checkHCUFor*`: **27 operations**;
- executor operator events — `CoprocessorOperatorEventName`: **27 operations**;
- shared-operation cost differences: **zero**;
- operand/type dimension differences: **zero**;
- installed-only operations: none; authority-only operations: none.

One enforcement-side name is translated: `IfThenElse` → `FheIfThenElse`. Translations must be injective.

> **Discrepancy with the reviewed expectation — unresolved and blocking.** The previously reviewed authority
> investigation recorded a current official schedule of 29 operations, with `FheSum` and `FheIsIn` present, on a
> deployed stack it described as different from the local package narrative. Parsing the installed material does not
> reproduce that: both installed tables contain 27 operations, and `FheSum` and `FheIsIn` appear in **no** installed
> representation — not the calculator table, not the executor event union, not the enforcement surface. The two figures
> are recorded side by side under "Operation-schedule authority" above and the discrepancy is left `UNRESOLVED`. It is
> **not** closed by choosing the local package. `FheSum` and `FheIsIn` remain a fail-closed guard: no authoritative cost
> exists for them, so their appearance anywhere in SG-4 must fail rather than be priced by inference.

The verifier fails if an SG-4 operation lacks a mapping, an unknown executor event appears, `FheSum` or `FheIsIn`
reaches SG-4 without calculator support, a shared price changes, an operand/type dimension differs, or an enum
translation becomes ambiguous.

## SG-4 operation coverage

Every homomorphic call in `contracts/benchmarks/SG4FheBenchmarkHarness.sol` maps to a priced executor operation:
`FheRand`, `Cast`, `TrivialEncrypt`, `FheMul`, `FheAdd`, `FheLt`, `FheRem`, `FheNot`, `FheBitAnd`, `FheBitOr`,
`FheIfThenElse`. Each entry records the Solidity call, the executor operator, the operand form, the result type, and the
circuits that use it. No operation may silently disappear from coverage.

Work that consumes gas but is **not** executor compute HCU is classified explicitly so it is neither counted as HCU nor
lost: ACL authorization (`FHE.allowThis`), public-decryption authorization (`FHE.makePubliclyDecryptable`), encrypted
storage of handles, event emission, and gas-only excluded setup.

## Verifier modes

**Offline preflight** — may be run now, via `pnpm sg4:hcu-authority:preflight`. Verifies repository identity, branch,
both deterministic protocol digests, the direct authority-root pin, lockfile and installed version, installed file
hashes, calculator and table hashes, the parsed operation-table comparison, complete SG-4 operation mapping, absence of
unsupported operations, the stale-constant guard, both independent controls, exclusive threshold rules, the explicit
block/batch state, and that no unresolved control is treated as absent.

**Live read-only verification** — fully **implemented**, deliberately **not executed**. It is not an unconditional
refusal: it requires the exact acknowledgment, and with it, it runs the complete ordered plan. It is not run during this
preparation phase, and it cannot pass yet, because the preparation commit and tree are not recorded (see below) and four
controls remain unresolved.

It may use only `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, `eth_call`, and `eth_getStorageAt`, all bound to
one pinned block. A guarded transport refuses any other method outright and refuses any block-bound call issued against
a block other than the pinned one. It never submits a transaction, enumerates accounts, uses wallet, signing, debug, or
trace methods, probes balances, or probes limits empirically. It writes **no evidence** in this phase.

#### Finality

The pinned block is requested with the **`finalized`** tag. A reorg-eligible head makes an authority result
unreproducible, so there is no fallback to `latest`: if a finalized block cannot be obtained the run fails closed with
`FINALIZED_BLOCK_NOT_AVAILABLE`, and a PASS requires `pinnedBlockFinality` to be `FINALIZED`.

#### JSON-RPC response integrity and resource bounds

The committed-endpoint transport hardens every response before it is trusted:

- request ids are unique and monotonically increasing, so a response can only satisfy its own request;
- the HTTP status must be 2xx; redirects are refused outright rather than followed to an unreviewed origin;
- the body is capped at a strict maximum byte count and the connection is destroyed once it is exceeded;
- the body must parse to a JSON **object** carrying `jsonrpc: "2.0"` and the **exact** request id;
- exactly one of `result` or `error` must be present — both, or neither, is rejected;
- errors are sanitized: the raw third-party body is never echoed.

The RPC origin, executor address, and expected source roots are committed protocol values; no environment override of
any of them is accepted, and the verifier's options type carries no URL, address, endpoint, or key parameter. The
transport is injectable solely as a test seam so the whole path can be exercised against an in-memory fake with no
network access; the injected object exposes a single `send` function. Output is sanitized: no complete RPC responses,
headers, credentials, provider objects, receipts, traces, private URLs, or environment dumps are retained.

### Preparation binding — two commits, no self-reference, and a late-bound authority record

An earlier revision stored the preparation commit and tree in a tracked source file and required a clean `HEAD` to equal
them. That is **unsatisfiable by construction**: writing the values into a tracked file changes the tree, and committing
that change produces a different commit and tree, so the recorded values can never equal the clean `HEAD` that contains
them. That model is rejected.

The replacement verifies a **lineage** rather than an identity.

A second defect had to be closed with it. An earlier revision made B carry **only** the lineage. But commit A hardcodes
the official artifact hash, the limit semantics, the provenance state and the schedule state as unresolved; B may add
only the binding record and may not touch implementation source; and any later code commit becomes a third commit that
breaks the lineage. So after B, **no permitted action could ever supply the missing values** — the gate was permanently
unresolvable. A lineage-only record is now rejected by the validator for exactly that reason.

- **Commit A — implementation.** All SG-4 implementation, protocol, documentation and tests, plus the verifier support
  for a future authority-binding record. A claims nothing about its own commit or tree.
- **Commit B — authority binding.** Adds exactly one dedicated record at `scripts/sg4-hcu-authority-binding.json` and
  changes nothing else. B does not record its own commit or tree either, and does not need to: the verifier reads B from
  `HEAD` and A from `HEAD^`.

The record carries **both** the implementation lineage **and** every late-bound authority input, so the resolved facts
arrive as independently reviewed data rather than as code. Its closed sections are:

| Section               | Carries                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lineage`             | implementation commit A, tree A, both protocol digests, permitted path, binding purpose                                                                                                                |
| `authorityResolution` | `status`, `reviewedIndependently`, review statement                                                                                                                                                    |
| `provenance`          | reverification status and six discriminated entries: five `SOURCE_FILE` entries with `path`/`contentSha256`, plus one `REPRODUCED_BUILD` entry with `buildInfoSha256` and closed reproduction evidence |
| `artifact`            | id, release, compiler version, metadata model, normalization manifest + digest, normalized runtime hash                                                                                                |
| `executor`            | address, deployment model, expected runtime hash, expected version, implementation address                                                                                                             |
| `authority`           | address derivation, deployment model, expected proxy hash, resolution mechanism, slot, expected implementation version and normalized hash                                                             |
| `operationSchedule`   | canonical **pricing** manifest, its digest, source, provenance subject                                                                                                                                 |
| `limits`              | semantics enum, enforcement operator, ceiling inclusivity, enforcement paths, expected total/depth, getter availability                                                                                |
| `blockOrBatch`        | state, value, and the presence/absence proof                                                                                                                                                           |
| `onChainInterface`    | exact verified selectors, limit getters, per-subject caller applicability                                                                                                                              |
| `facets`              | artifact id and origin for each of the five facets                                                                                                                                                     |

Any other field is rejected, which is what stops a self-referential value being smuggled back in. Every selector is
**recomputed from its signature** and compared, so an invented selector fails.

Running at clean `HEAD` B, the verifier requires all of:

1. current branch is `main`;
2. worktree **and** index are clean;
3. **B has exactly one parent** — merge and octopus commits are rejected, because a merge whose first parent is A would
   otherwise satisfy the `HEAD^` check while dragging in an unreviewed second history;
4. `HEAD^` equals the recorded `implementationCommit` A;
5. `HEAD^{tree}` is B's own binding tree — it is **not** falsely required to equal A's tree, and must not equal the
   recorded implementation tree;
6. the recorded `implementationTree` equals `A^{tree}`;
7. `git diff --name-only A..B` is exactly the one dedicated binding-record path;
8. every SG-4 implementation and runtime path has the identical blob at B as at A;
9. the authority-binding record's schema, closed shape, lineage **and late-bound authority inputs** are valid;
10. no third commit or unrelated change has been introduced. A commit C appended after B makes `HEAD^` equal B rather
    than A, so check 4 fails and the gate reopens rather than silently accepting it.

**No source edit is permitted after B for normal resolution.** Any implementation edit reopens review and requires a
fresh A→B lineage — never a third-commit workaround.

**During this preparation the record is deliberately not created**, because the official material has not yet been
independently reverified and commit A does not exist. Its absence is recorded as `PREPARATION_BINDING_RECORD_ABSENT` and
blocks every live run.

### Everything the record claims is recomputed, not merely well-formed

A digest never validates because it happens to have 64 hexadecimal characters. Both internal manifests are canonically
serialized — object keys sorted, no insignificant whitespace — and their digests are **recomputed and compared**.

**The normalization manifest** carries every value needed to reproduce the comparison for the _authoritative_ artifact:
schema and version, runtime byte length, compiler version, metadata model and the exact accepted metadata structure,
immutable-reference kind, address byte length, typed primary immutable references, required preceding opcode, expected
replacement count, and any supplementary immutable references. Offsets are validated for integrality, non-negativity,
strict ordering, uniqueness and range; the opcode and authenticated artifact placeholder bytes, the runtime length, and
the compiler/metadata coherence are all checked.

The live verifier normalizes **only** through `normalizeRuntimeBytecodeFromManifest`, which takes every constant from
that manifest. The local-fixture normalizer keeps its own 0.10.0 constants and is used **solely** for offline
self-tests; it is never applied to the deployed implementation. An authoritative artifact whose runtime length,
compiler, offsets, opcode or authenticated artifact placeholder bytes differ from the fixture verifies correctly — and
the fixture normalizer rejects that same runtime, which is exactly why it cannot be the authority.

**The pricing manifest** replaces the names-only list. Every operation carries its canonical name, enforcement-side
name, scalar/non-scalar/type cost matrix, operand modes, arity, result types and source reference. Duplicate names,
missing or unknown fields, non-injective enforcement-to-canonical translations and malformed costs are all rejected.

Compatibility is then defined over the **SG-4 operation closure**: every SG-4 operation must have an authoritative price
and installed-calculator support, with matching cost, operand and type semantics. An official operation SG-4 never uses
— `FheSum` and `FheIsIn` in the current 29-operation schedule — is reported but does **not** block. It blocks only if it
enters an SG-4 circuit without calculator support. `authorityTableHash` is recomputed from the canonical pricing
manifest, and the local `HCULimit.sol` parse is retained only as an offline fixture.

### Provenance is pinned, and supersession is explicit

The provenance subjects must be exactly the six declared ones — no duplicates, no extras, none missing — and every entry
must match its discriminated prior-reviewed shape. The five `SOURCE_FILE` entries carry repository, tag, commit, path
and, where known, `contentSha256`; `CURRENT_OFFICIAL_ARTIFACT_BUILD` is the one `REPRODUCED_BUILD` entry, with no
repository artifact path and with its authenticated `buildInfoSha256` plus closed reproduction evidence. Arbitrary
tuples are not accepted.

Where reverified source-file material intentionally supersedes an expectation, it goes through an explicit `amendments`
mechanism naming the superseded commit, the reviewer and the reason. Amendments apply only to `SOURCE_FILE` provenance;
`REPRODUCED_BUILD` amendments are intentionally unsupported and rejected. A reproduced-build identity change requires a
fresh reviewed Commit-A implementation/protocol lineage, never amendment fallthrough or coercion into source-file
semantics. An amendment that does not name what it supersedes is refused. The artifact, the pricing manifest and the
executor are each cross-linked to their exact provenance subject.

### Caller applicability is a specification, not a signature

`callerExemptionGetter` is gone. Each of the three SG-4 subjects — `BENCHMARK_HARNESS`, `FHEVM_EXECUTOR`,
`TRANSACTION_SENDER` — carries a closed specification: state (`AVAILABLE` / `ABSENT_DOCUMENTED` /
`NOT_APPLICABLE_WITH_PROOF`), target contract, signature, selector, ABI argument types and exact values, the subject
address being checked, return ABI type, interpretation rule, accepted results, and an artifact-bound proof when not
available.

Calldata is ABI-encoded from the declared types without any signer, and only the declared return type is decoded,
canonically — a non-canonical bool is refused rather than coerced. A missing subject, a missing getter without proof, a
malformed return or an unexpected result all fail closed. A `null` alone can never establish non-applicability, and PASS
requires a resolved result for every subject.

### Mandatory limits cannot be waived

The transaction-total and transaction-depth controls are mandatory. Their availability may be
`AVAILABLE_AND_READ_ON_CHAIN` or `ABSENT_FROM_INTERFACE_BUT_PROVEN_FROM_THE_CODE_IDENTIFIED_ARTIFACT` — **never** a
generic `NOT_APPLICABLE`. Reading results are correspondingly distinct: `MATCHES_BINDING_RECORD_ON_CHAIN`,
`VERIFIED_FROM_CODE_IDENTIFIED_ARTIFACT_NO_GETTER`, `MISMATCH`, `UNRESOLVED`. Only the first two may promote a control.

Artifact-only proof requires **machine-verifiable** enforcement evidence — constant name, constant value, comparison
operator, revert error name and source path, with the value and operator checked against the declared limit and
semantics — not a prose string. `NOT_APPLICABLE_WITH_ARTIFACT_PROOF` survives only for genuinely optional controls such
as a proven-absent block/batch mechanism, and still requires its artifact-bound proof.

The two ceilings have **one** source: they are protocol-pinned at 20,000,000 and 5,000,000, and the record must carry
exactly those values, so the record, the on-chain reading, the result field and the PASS validator can never refer to
different numbers.

### The executor deployment model is restricted, not half-supported

A proxied executor was declarable but only half verified: its proxy runtime was hashed while its implementation was
never resolved, read, code-identified or version-checked — so `getHCULimitAddress()` derived from an unauthenticated
implementation. Rather than leave a partially supported enum, `ERC1967_PROXY` is **rejected for the executor**; only
`DIRECT` is accepted. The authority proxy path remains fully implemented and verified end to end. Reopening
executor-proxy support requires a resolution mechanism, implementation code identity against a reviewed artifact,
version and linkage verification, and `getHCULimitAddress()` bound to that verified chain.

#### Exact post-review sequence

1. **A.** commit the reviewed implementation;
2. **B.** independently reverify the immutable sources, build or obtain the official artifact, and produce the single
   authority-binding JSON at `scripts/sg4-hcu-authority-binding.json`;
3. **C.** independently review that JSON;
4. **D.** commit only that JSON as B;
5. **E.** verify the A→B lineage and the authority-binding record;
6. **F.** execute the live read-only verification.

## The reachable PASS

Every earlier pass hardened a blocker. That is only half a proof: a gate that can never pass is indistinguishable from a
gate that is merely broken. The verifier is therefore exercised end to end against a fully coherent authority-binding
record and a fake read-only transport, and it reaches an actual `PASS` — `finalVerdict: "PASS"`, status
`LIVE_READ_ONLY_AUTHORITY_VERIFICATION_COMPLETE`, zero result-validation errors and zero schema errors.

That run issues exactly **13** JSON-RPC calls, in this order:

| #   | Method                 | Purpose                                                                           |
| --- | ---------------------- | --------------------------------------------------------------------------------- |
| 1   | `eth_chainId`          | confirm chain 11155111                                                            |
| 2   | `eth_getBlockByNumber` | pin one `finalized` block number and hash                                         |
| 3   | `eth_getCode`          | executor runtime at the pinned block                                              |
| 4   | `eth_call`             | executor `getVersion()`                                                           |
| 5   | `eth_call`             | executor `getHCULimitAddress()` — the authority address is derived, never assumed |
| 6   | `eth_getCode`          | authority proxy runtime                                                           |
| 7   | `eth_getStorageAt`     | ERC-1967 implementation slot                                                      |
| 8   | `eth_getCode`          | authority implementation runtime                                                  |
| 9   | `eth_call`             | authority `getVersion()`                                                          |
| 10  | `eth_call`             | authority `getFHEVMExecutorAddress()` — reciprocal linkage                        |
| 11  | `eth_call`             | `getTransactionMaxHCU()`                                                          |
| 12  | `eth_call`             | `getTransactionMaxDepthHCU()`                                                     |
| 13  | `eth_call`             | caller-applicability getter for the one subject that exposes one                  |

The call log is compared against `generateLiveCallPlan(record)` for that same record: the verifier may not make a call
its own published plan does not declare, and the plan is re-checked against the read-only allow-list. A `DIRECT`
authority record generates — and executes — no step 7.

The PASS is not a fixture. Each of the following, applied one at a time to the same coherent record, moves the verdict
off `PASS`: an absent binding record, a dirty worktree, a dirty index, the wrong branch, a merge binding commit,
implementation drift between commit A and commit B, executor code drift, a total or depth ceiling that disagrees with
the record on chain, a broken reciprocal link, an unavailable finalized block, a wrong chain id, and an SG-4-relevant
caller that is exempt.

## Local fixture isolation

The installed `@fhevm/host-contracts@0.10.0` artifact is a self-test target and nothing else. Its comparison result is
serialized as `localFixtureSelfTestResult` and is deliberately **not** a PASS condition: a `MISMATCH` there does not
block, and no local cost, operand, normalization or identity fact reaches the verdict. With no binding record the
verifier serializes an empty compatibility result and `UNRESOLVED` hashes rather than falling back to the fixture. A
dedicated source-origin test asserts this over the implementation source itself.

## Variant compatibility, not operation-name compatibility

An operation name is not a price. SG-4 uses scalar **and** non-scalar `FheLt`, two `FheIfThenElse` result widths, three
`TrivialEncrypt` result types and three `FheRand` widths. Compatibility is therefore defined over an explicit closure of
**used variants**, each identified unambiguously by `(canonical operation, operand mode, cost key type)` and carrying
its enforcement name, result type and arity. Compound descriptions such as `euint128 | euint64` are never a type
identity.

A missing scalar price does not hide behind a present non-scalar price, and a missing `Uint64` select price does not
hide behind a present `Uint128` one. Arity drift, result-type drift and enforcement-name translation drift each block
independently. Official variants SG-4 never uses — currently `FheSum` and `FheIsIn` — are reported under `authorityOnly`
and do not block; blocking on them would have made the correct current schedule unpassable.

## Normalization can only remove what it predicted exactly

Normalization exists to remove deployment-dependent bytes, not to make two different builds compare equal. The manifest
therefore declares only structures the verifier can actually check: `CBOR_SOLC_ONLY_NO_SOURCE_HASH` metadata and
`PUSH32_WORD_IMMUTABLE` references for `UUPSUpgradeable.__self`. It pins the metadata trailer by exact byte length and
exact SHA-256, so a different trailer is a mismatch rather than a silently tolerated tail. The legacy
`PUSH20_ADDRESS_IMMEDIATE` model belongs only to the **LEGACY LOCAL 0.10.0 SELF-TEST FIXTURE** and has no authority over
the current official build.

Supplementary immutable references must name the exact deployed bytes they replace. Declaring the wrong original bytes
fails closed with `SUPPLEMENTARY_VALUE_MISMATCH`; it does not normalize a real difference away. References that overlap
a primary offset, overlap the metadata region, duplicate an id, arrive unsorted, or use an undeclared kind are rejected
by the manifest validator before any byte is touched.

## The amendment is not a bypass

A reviewed amendment may supersede only a `SOURCE_FILE` tuple, and it is deliberately expensive. It must name the
**exact** superseded tuple — repository, path and commit — carry a canonical review-record digest and an independent
reviewer, and declare the full replacement tuple. `REPRODUCED_BUILD` amendments are intentionally unsupported and
rejected: a changed reproduced-build identity requires a fresh reviewed Commit-A implementation/protocol lineage and
must never be coerced into `SOURCE_FILE` amendment semantics. The corresponding source-file provenance entry must then
match its replacement exactly. Without that last rule an amendment would merely exempt a subject from checking, and the
entry could claim anything; with it, the amendment and the entry have to agree. Duplicate amendments for one subject,
amendments that change nothing, and amendments carrying any undeclared field are all rejected.

## Applicability is a typed, proven statement

A caller-applicability check is not "call something and hope". Each subject declares its return type, one of a closed
set of interpretations (`BOOL_TRUE_MEANS_EXEMPT`, `UINT_NONZERO_MEANS_EXEMPT`, …) that must agree with that return type,
the exact accepted results in canonical form, the argument index carrying the subject address, and a call-context proof
tying the checked address to the enforcement layer. The queried address must be the declared subject; querying some
other address is rejected rather than reported as a result.

The benchmark harness's apparent circularity — its address is needed before it is deployed — is resolved explicitly by
`DETERMINISTIC_PRECOMPUTED_DEPLOYMENT_ADDRESS`, with `NOT_RELEVANT_PROVEN_FROM_ARTIFACT` as the alternative resolution.
An SG-4-relevant caller found exempt is a `FAIL`, not an informational note: an exempt caller is not subject to the
ceiling the gate is verifying.

## Structured evidence instead of prose

Every claim a reviewer would otherwise have to take on trust is a digest-authenticated manifest. Limit getters are
declared as specs — canonical signature, recomputed selector, argument types, return type and state — and a
per-transaction limit getter must be zero-argument and return `uint256`. `PROVEN_ABSENT` for the block/batch control
requires a complete authority-enumeration manifest; `PROVEN_PRESENT` requires an enforcement-proof entry. Getter
availability and getter-spec state must agree, and both proof manifests are authenticated by recomputed SHA-256.

## Three roots, not one

The single "authority root" conflated three unrelated identities and, in doing so, made a correct current-official
deployment unpassable: a live PASS required the exact package, version and integrity of the locally installed
`@fhevm/host-contracts@0.10.0`. That is a fact about `node_modules`, not about Sepolia.

| Identity                         | What it is                                                                                                             | PASS-relevant?                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `LOCAL_AUTHORITY_FIXTURE_ROOT`   | the installed `@fhevm/host-contracts` package                                                                          | **No.** Reported as `localAuthorityFixtureRoot` with `passRelevant: false`. Its exact pin remains an offline repository-hygiene control. |
| `MEASUREMENT_TOOLCHAIN_ROOT`     | `@fhevm/mock-utils@0.4.2` — the calculator and cost table SG-4 actually benchmarks with                                | **Yes.** Every measured HCU number comes from it, so a change invalidates the measurements.                                              |
| `DEPLOYED_AUTHORITY_ROOT_POLICY` | the deployed authority artifact, derived from the reviewed record's selected `CURRENT_OFFICIAL_AUTHORITY_SOURCE` tuple | **Yes**, and it is not a package at all: repository, tag, commit, path and content hash.                                                 |

`deployedAuthorityRoot` must name the same artifact the result verified, must carry an exact 40-hex upstream commit and
a 64-hex content digest, and may never be derived from the local fixture package. Changing only the local fixture — its
integrity, its version, or its self-test result — leaves a coherent PASS a PASS. Changing either real root blocks.

## One canonical variant manifest

There used to be two hand-maintained tables of the same facts: `SG4_OPERATION_COVERAGE` and
`SG4_PRICING_VARIANT_CLOSURE`. Two tables of the same facts drift, and a drift here silently changes which prices are
compared. There is now exactly one canonical statement — the coverage manifest — and the closure is a mechanical
projection of it (`deriveVariantClosure`). They cannot disagree, because there is nothing to disagree with.

The coverage manifest is per-variant. No entry carries a compound `resultType` such as `"euint128 | euint64"` (not a
type identity), and no entry combines an operation's scalar and non-scalar calls (two variants at two different prices).
Every entry declares its exact ordered operand types, its single result type and its cost-table key; arity is the
operand list's length.

The authoritative pricing manifest follows the same shape: **one entry per variant, one cost**. The previous
operation-level entry — `operandModes`, `resultTypes` and a nested `costs` map — could not say which cost belonged to
which exact triple. Each entry is now closed, so an undeclared cost dimension cannot be smuggled in as an extra field;
costs must be safe non-negative integers, so comparison is exact; and entries must be in canonical variant order, so two
manifests of one schedule serialize identically.

Comparison is per-variant and checks the **real** values: cost, operand mode, exact ordered operand types, exact result
type, arity and the injective canonical/enforcement translation. Every mismatch class — `arityMismatches`,
`costMismatches`, `installedOnly`, `operandMismatches`, `operandTypeMismatches`, `resultTypeMismatches`,
`translationMismatches`, `unsupportedByCalculator` — is serialized into the result, and a PASS requires every one of
them to be empty plus a `shared` array equal to the exact SG-4 closure. A reader who never ran the verifier can
therefore reject a false PASS.

## Normalization is bidirectional and compiler-authenticated

Three fields used to make normalization one-sided. `expectedArtifactPlaceholderBytes` was required and never read.
`replacementBytes` let a record normalize deployed bytes to any value it liked. `compilerReferenceId` was any non-empty
string, so a reference identity could simply be invented.

`replacementBytes` is gone. There is one authenticated field — the artifact-side placeholder — and normalization
replaces the deployed bytes with exactly that, so both sides land on the same value or neither does. Every reference,
primary and supplementary alike, is cross-linked to a digest-bound **compiler immutable-reference manifest**: the
compiler's own output for that build, carrying its build id, its compiler version, its complete reference set and the
selected authority source content hash. A reference whose id, offset, length or placeholder disagrees with the compiler
manifest is refused.

The bare `offsets` array is gone too. Primary PUSH20 references now get the same typed, authenticated treatment as
supplementary ones — a list of integers could never say what the artifact side holds at those offsets or which compiler
reference produced them.

## Cross-links are tuple-derived

Naming a provenance _subject_ proves nothing: two records citing the same label can describe entirely different upstream
revisions. Every cross-link is now checked against the exact **selected tuple**, resolved once, after amendments, into
one map:

| Cross-link                      | Field                                             | Selected subject                                       |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `ARTIFACT_SOURCE`               | `artifact.sourceReference`                        | current official authority source                      |
| `ARTIFACT_RELEASE`              | `artifact.release`                                | current official authority source (its tag)            |
| `EXECUTOR_CONFIGURATION_SOURCE` | `executor.configurationSourceReference`           | installed Solidity configuration                       |
| `PRICE_SCHEDULE_SOURCE`         | `operationSchedule.source`                        | current official price schedule                        |
| `PRICING_ENTRY_SOURCE`          | every pricing entry's `sourceReference`           | current official price schedule                        |
| `CALCULATOR_CONTENT`            | the calculator entry's content hash               | must equal the installed calculator SG-4 measures with |
| `COST_TABLE_CONTENT`            | the cost-table entry's content hash               | must equal the installed cost table                    |
| `ENFORCEMENT_PROOF_SOURCE`      | enforcement manifest `sourceContentSha256`        | current official authority source                      |
| `ENUMERATION_SOURCE`            | enumeration manifest `sourceContentSha256`        | current official authority source                      |
| `IMMUTABLE_REFERENCE_SOURCE`    | compiler manifest `sourceContentSha256`           | current official authority source                      |
| `APPLICABILITY_PROOF_SOURCE`    | every applicability proof's `sourceContentSha256` | current official authority source                      |

The canonical source-reference form is `<repository>@<commit>:<path>`. A subject label in one of those fields is
rejected. A reviewed amendment that supersedes a tuple therefore re-anchors every cross-link that names it — which is
the point: a cross-link that could stay behind would be a label, not a binding.

## A proof is a derivation

`enumerationComplete: true` beside empty arrays asserted a conclusion nobody could check. Three things changed.

The enumeration must be **exhaustive**: every surface list sorted, unique and non-empty to a stated minimum, with a
declared `parseCompleteness` of `PARSED_COMPLETE_NO_RESIDUE` — a parse property, not a boolean somebody typed.

The block/batch conclusion is **derived by the verifier** from that enumeration, not declared by the record. If no
declaration, callable, error, mapping or storage field names a block- or batch-scoped quantity, the control is absent;
if one does, it is present. A record claiming `PROVEN_ABSENT` while its own enumeration names such a surface is refused,
and so is the converse.

`PROVEN_PRESENT` is cross-checked field by field against its enforcement-proof entry — value, operator, source path and
enforcement function — not merely by the entry existing. Enforcement entries are closed and versioned, one per control,
and a single source range may not do duty for both the declaration and the enforcement claim.

Applicability proofs gained a **parent link**. `sourceRangeSha256` on its own asserts that some 32 bytes hash to that
value; every 32 bytes do. A proof must now name an enforcement function the digest-bound enforcement manifest actually
contains, at that manifest's source path, carrying that manifest's source content hash.

## The implementation-address policy is reachable

The runtime read `authority.expectedImplementationAddress` and `authority.implementationAddressChangePermitted` — but
the authority section is closed and never carried either field, so a valid record could not pin the proxy implementation
address and the check was dead code. Both reads are gone.

The section now carries a closed, digest-bound `implementationAddressPolicy`, in one of two kinds:

- **`EXACT_PINNED_ADDRESS`** — the implementation address is pinned exactly, and permits no upgrade conditions. A
  mismatch at the finalized block is a `FAIL`.
- **`REVIEWED_CODE_IDENTICAL_UPGRADE`** — the address may move, under stated conditions drawn from a closed set, one of
  which must be `NORMALIZED_RUNTIME_IDENTITY_UNCHANGED`. The policy permits the _address_ to change; it never permits
  the _code_ to differ, and the normalized comparison still decides that.

Either kind carries an independent reviewer and a canonical review-record digest, and a `policyDigest` covering
everything but itself — so a policy edited after review stops recomputing. The result reports
`implementationAddressPolicyResult`, and a PASS requires it to match the reviewed deployment model.

The derivation chain now also stops the moment the implementation's normalized identity is not `VERIFIED`. Everything
below that point — the version, the reciprocal link, the ceilings, the exemptions — is read _from_ the implementation,
and asking an unverified contract those questions would attribute the answers to the authority the record describes.

## The verifier enforces its own plan

The report used to claim the verifier "may not make a call its own plan does not declare". That held only in a test:
production code called `assertLiveCallPlanIsReadOnly()` with a _static_ default plan and never compared the plan to the
log.

The static plan is gone — `buildLiveCallPlan` no longer exists. The plan is generated from the validated record and
**installed on the guarded transport** before any dependent call is issued. Each planned call carries its exact method,
target role, complete calldata and pinned-block requirement. The transport consumes the plan sequentially and throws at
the moment a call diverges:

- a call the plan does not contain at this position (an extra call, even an allowed read-only one);
- a call to an address other than the planned target role's verified address;
- calldata differing from the planned selector and encoded arguments;
- a block parameter other than the pinned block where the plan requires one.

Target roles resolve as the derivation chain establishes them, so a call to an address the chain has not yet verified
cannot match its planned target. The result serializes `livePlanDigest`, `livePlanCallCount`, `liveCallLogDigest`,
`liveCallCount` and `planEnforcementResult`; a PASS requires `ENFORCED_EXACT`, equal counts and both digests resolved.
The hard read-only allow-list runs first and remains a separate defence, holding whether or not a plan is installed.

## The interface manifest is what execution consumes

`onChainInterface.selectors` was a free-form `signature → selector` map that execution never read: the verifier used
hard-coded selectors, so the record and the behaviour could not disagree because they never met. It is replaced by a
closed interface manifest covering every critical call — executor version, executor authority getter, authority version,
reciprocal executor getter, and each available limit getter — with the role, canonical signature, recomputed selector,
argument types and return type of each.

The role and return type are not the record's to choose: they decide which contract is queried and how the answer is
decoded. Where the canonical spec fixes the signature it is fixed; only the limit getters, whose names only the deployed
artifact knows, are the record's to supply. Execution takes its calldata from these entries, so no parallel hard-coded
path remains.

An HCU ceiling is held by the authority contract, so a limit getter may only declare the verified `AUTHORITY` role — a
spec declaring the executor would have been read from a contract that does not hold the value while execution called the
authority anyway. Each getter spec and its interface entry must be the same call: two declarations of one getter that
could differ was exactly the defect.

## The one chain

Every PASS-relevant question is now answered by following a single traceable chain. There is no second path, and no step
in it accepts an assertion where a derivation is possible:

```
authenticated input bytes
  -> sha256(bytes) === the SELECTED provenance tuple's contentSha256
  -> a versioned deterministic extractor / parser / build-normalizer
  -> a canonical typed manifest
  -> exact read-only verification under an enforced request plan
  -> a canonical result
  -> the PASS validator
```

No PASS-relevant fact may originate from a record-supplied assertion, a hand-maintained duplicate table, an arbitrary
string label, a syntactically valid digest nobody recomputed, the obsolete local authority fixture, a test-only
comparison, a report statement, or a coincidental equality with an old local value.

## One canonical operation source

`SG4_OPERATION_COVERAGE` is deleted. There is one machine-readable operation-variant manifest, and it lives at the
benchmark source layer where the circuits are registered:

- `OP` is the only place a circuit may name an FHE call.
- `FHE_OPERATION_SEMANTICS` gives each of those calls its exact executor semantics — canonical operation, enforcement
  operation, operand mode, ordered operand types, result type, cost-table key, arity, whether it is HCU-priced, and how
  any overload or literal was resolved.
- `deriveCanonicalOperationManifest(circuits)` walks the **registered circuits** and produces
  `SG4_CANONICAL_OPERATION_VARIANTS`.
- The HCU-authority closure is `projectPricingClosure(SG4_CANONICAL_OPERATION_VARIANTS)`.

A variant no circuit executes therefore cannot appear, and a variant some circuit executes cannot be missing, because
neither statement exists twice. An FHE call with no declared semantics is an error, not a silent omission; two circuits
describing one variant incompatibly is an error too.

Literal overloads are resolved explicitly. `FHE.asEuint128(0)` carries the statement that the integer literal resolves
to the `uint128` TrivialEncrypt overload through its `euint128` assignment target — it is not a Cast and not a bool.
Calls that execute only in the constructor or in operator-only setup entry points (`FHE.asEuint64`, `FHE.asEbool`) are
enumerated exactly under `EXCLUDED_SETUP_TRIVIAL_ENCRYPT`, rather than described by a sentence a substring check
happened to satisfy.

## Authoritative pricing is extracted, not supplied

The record no longer supplies a price table for the verifier to believe. It supplies the authenticated **bytes** of the
selected price schedule, and `extractPriceSchedule` recomputes the **full** canonical schedule from them — every
operation and variant the source prices, including the ones SG-4 never uses.

Completeness is therefore a property of the parse. An unrecognised line inside a priced block fails closed, because an
unparsed line could carry a price nobody compared. A record carrying only the SG-4 subset fails completeness against the
extraction. The used-variant closure is then compared against the extracted schedule and the measurement calculator on
exact cost, operand mode, ordered operand types, result type, arity and the injective canonical/enforcement translation.
Unused official variants are reported and non-blocking — _after_ completeness is proven, not instead of it.

No operation count is hard-coded as eternal truth. The authenticated source decides the schedule; a previously observed
count is an expectation to compare against, nothing more.

## The artifact digest is recomputed

`extractArtifactBuild` consumes the authenticated official build-info and independently recomputes the compiler
immutable-reference manifest, the normalization manifest, and the **expected deployed normalized runtime digest**. A
record's 64-hex expected hash is a claim compared against that recomputation, not a value the verifier adopts.

Normalization uses one typed model for primary and supplementary references alike. Each reference binds a compiler
reference identity, offset, byte length, the exact deployed bytes (or their deterministic derivation from the deployment
chain), the exact artifact-side placeholder bytes, its kind and its build identity. The current primary references are
the three 32-byte `PUSH32` `__self` words. Normalization verifies the deployed words and replaces them with the
**authenticated 32-byte zero placeholder** — never with a free global replacement byte. Ordinary executor `PUSH20`
constants are outside the compiler reference manifest and remain untouched.

Provenance is decided by provenance. The old check that refused any artifact whose normalized digest equalled the local
0.10.0 fixture's is gone: it inferred staleness from a coincidence, and it bought nothing once the digest is recomputed
from the build the selected tuple names.

## Source proofs are parsed, not asserted

`parseAuthoritySource` recomputes, from the authenticated authority source bytes: declarations and their values,
callable functions, errors, mappings, storage struct fields, storage primitives, enforcement functions, exact byte
ranges, range digests over those exact bytes, parse completeness, and the block/batch conclusion.

Enforcement is decided by what a body **does** — it compares a running total against a declared ceiling and reverts —
not by what it is called. The ceiling semantics are derived from the comparison operator the source actually uses: a
reverting `>` accepts the configured value, a reverting `>=` does not, and two enforcement paths that disagree yield no
statable semantics at all.

The record may carry its reviewed claims; `compareClaimsAgainstDerivation` compares every one of them against the
parser's output. A fabricated complete-looking list, an arbitrary 64-hex range digest, an invented enforcement function,
an omitted declaration or a block/batch state the enumeration does not support are each refused.

## One selected provenance graph

Amendments resolve first, then exactly one selected provenance map is built. Every source-file subject binds to the
complete tuple — repository, tag, commit, path, content hash — never to a subject label, through the canonical form
`<repository>@<commit>:<path>`. A reproduced build is not a source-file tuple: it has no generated-artifact path and is
identified through its closed reproduction evidence and `buildInfoSha256`. Source-reference functions reject it rather
than manufacturing a path.

The compiled build is now its own subject, `CURRENT_OFFICIAL_ARTIFACT_BUILD`: different bytes from the source it was
compiled from, therefore its own `buildInfoSha256`, therefore its own reproduced-build evidence. One digest cannot
authenticate two different blobs.

An amendment may target only `SOURCE_FILE` provenance: it names the exact superseded tuple and exact replacement,
carries an independent review record digest, is unique per subject, may not be a no-op, must equal its provenance entry
exactly, and re-anchors every dependent cross-link — including the authenticated source material itself.
`REPRODUCED_BUILD` amendments are intentionally unsupported and rejected; a changed reproduced-build identity requires a
fresh reviewed Commit-A implementation/protocol lineage and must never fall through into source-file amendment
semantics. Superseding to a digest with no bytes behind it is not a supersession; it is an unresolvable claim, and the
verifier says so.

## The measurement root is real and minimal

Three identities, cleanly separated by what each can actually change:

|                                  | What it is                                              | Blocking? |
| -------------------------------- | ------------------------------------------------------- | --------- |
| `deployedAuthorityRoot`          | derived only from selected official upstream provenance | yes       |
| `measurementToolchainRoot`       | the exact installed files that influence an HCU number  | yes       |
| local / stale fixture self-tests | repository hygiene                                      | **no**    |

`MEASUREMENT_EXECUTION_RELEVANT_FILES` is exactly two entries: `hcu.ts`, which computes the number, and
`HCUByOperator.ts`, the table it reads. The plugin's constants, the Solidity config and the obsolete local HCULimit
fixture are `REPOSITORY_HYGIENE_FILES` — reported, never blocking, because none of them can change a measurement or a
deployed ceiling. Pooling them into "calculator integrity" made unrelated drift block a live PASS.

`verifyMeasurementToolchainRoot()` establishes the root from the **installation**: the installed package manifest's
version, the lockfile's resolution integrity, and the content of those two files. A record claiming a measurement root
cannot also be the evidence for it.

## One interface manifest, one enforced request plan

Every `eth_call` the verifier issues — executor version, executor→authority getter, authority version, reciprocal
getter, every available limit getter and every available caller-applicability getter — comes from the one closed
interface manifest. No hard-coded selector path and no parallel applicability calldata path remain.

A planned call is the **complete canonical JSON-RPC request**: method, exact parameter count, exact parameter vector,
exact static values, target role, calldata, block parameter, the closed set of permitted transaction-object keys, the
exact ERC-1967 slot where applicable, and the expected response decoder. Two placeholders — `$TARGET` and
`$PINNED_BLOCK` — are resolved at issue time from **verified** state, so a call to an address the chain has not yet
verified cannot match its plan.

The guarded transport deep-compares the whole resolved request against the next planned one and rejects extra calls,
missing calls, reordered calls, wrong targets, wrong calldata, extra `eth_call` fields, state overrides, wrong parameter
counts, wrong block tags and wrong storage slots — all as one check, because they are all the same divergence. Plan
installation and validation must succeed **before the first request**; with no validated plan, zero requests are issued.
Exact plan exhaustion is a PASS condition, and the read-only method allow-list remains an independent first-line
defence.

## The PASS dependency graph

`PASS_DEPENDENCY_GRAPH` classifies every field the PASS validator consumes by how it was established: `RECOMPUTED` (a
deterministic extractor over authenticated bytes), `LIVE_READ` (a verified read at the pinned block under the enforced
plan), `MEASUREMENT` (the installed toolchain that computes HCU), `DERIVED` (a pure function of those), or `DIAGNOSTIC`
(reported, never blocking).

There is no class for "the record said so". Exactly two fields are `DIAGNOSTIC` — `localAuthorityFixtureRoot` and
`localFixtureSelfTestResult` — and flipping either leaves a coherent PASS a PASS.

## The official artifact build is a REPRODUCED_BUILD, not a committed file

Earlier revisions of this document described `CURRENT_OFFICIAL_ARTIFACT_BUILD` as a file committed at
`host-contracts/artifacts/contracts/HCULimit.sol/HCULimit.json`. **No such committed file exists.** Compiler output is
generated, not checked in, and pointing a provenance tuple at a repository path that carries nothing was a fiction.

The subject is now a discriminated `REPRODUCED_BUILD` provenance entry with its own closed field set. It identifies the
source tree it was built _from_ and carries **no `path` field at all**. The validator rejects any generated-artifact
path; the build is identified through its reproduction evidence and `buildInfoSha256`.

| Field                                         | Pinned value                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `repository`                                  | `https://github.com/zama-ai/fhevm`                                                       |
| `tag` / `commit`                              | `v0.13.2` / `07fb05fb75f0aa6cea934088640ddb4539d0b1b9`                                   |
| `buildRoot`                                   | `host-contracts`                                                                         |
| `selectedSourcePath` / `selectedContractName` | `contracts/HCULimit.sol` / `HCULimit`                                                    |
| `buildInfoId`                                 | `c73f6a31ecc6791fd9a8488a9facd93e`                                                       |
| `buildInfoSha256`                             | `b0d9caeb6c3d0747b0889a6d231877d475a4f1ae57c0f7352a6a3eb1ad844396`                       |
| `artifactJsonSha256`                          | `71cf5d19250a045b96bf4c84b146300e6af1fad15880c8ff4783013b0f700dbe`                       |
| `solcVersion` / `solcLongVersion`             | `0.8.24` / `0.8.24+commit.e11b9ed9`                                                      |
| `dependencyLockSha256`                        | `a776b0091003101212a877924358a50192c1d76d58cb3cad7849eb9f5fdac64c`                       |
| `hardhatConfigSha256`                         | `99c41c5aff0f395ebffb82dc031238b9a94b7d1703307d94f85dbda67dd07e93`                       |
| `generatedHostAddressesSha256`                | `fdb91c77b4e0b138dd704d8b001c4d435ea3b91ddd5bbe42db4b58a284d3d9c8`                       |
| `aclAddress`                                  | `0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D`                                             |
| `fhevmExecutorAddress`                        | `0x92C920834Ec8941d2C77D188936E1f7A6f49c127`                                             |
| `reproductionCommand`                         | `HARDHAT_NETWORK=hardhat npx hardhat compile:specific --contract contracts/HCULimit.sol` |

The build was reproduced twice from clean checkouts and was byte-for-byte identical both times. That is why the identity
is _pinned_ rather than left for a record to nominate: it is a fact Commit A establishes, not an opinion a record
supplies.

### Where the bytes live, and where the expectation lives

These are two different concerns and the architecture keeps them apart.

- **Storage and delivery.** The real Hardhat build-info stays **external**. Commit A commits no build output. The bytes
  arrive with the Commit-B binding record through `sourceMaterial.officialArtifactBuild`, authenticated against the
  selected tuple.
- **Expected identity.** Commit A pins what that build must _be_. The structural recipe facts above are enforced at
  record validation; the **content digests** — which only the real external bytes can produce — are enforced at the gate
  through `reproducedBuildResult` and `reproducedBuildInfoSha256`, backed by an
  `OFFICIAL_BUILD_IS_NOT_THE_PINNED_REPRODUCTION` blocker.

A consequence worth stating plainly: **Commit A cannot self-certify a PASS.** Every other link verifies against the
fixtures, and the run then stops at exactly one blocker — the external build. That is the honest state of a preparation
whose authoritative input has not yet been supplied.

## Production consumes real Hardhat build-info

The extractor navigates the document the compiler actually emits. The previous bespoke
`{buildId, compilerVersion, deployedBytecode, immutableReferences[]}` envelope is **rejected by name**
(`BUILD_INFO_IS_THE_OBSOLETE_CUSTOM_ENVELOPE_NOT_HARDHAT_BUILD_INFO`); a test may synthesize a build-info-_shaped_
fixture, but production accepts only the real schema.

```
input.sources["contracts/HCULimit.sol"].content
output.contracts["contracts/HCULimit.sol"].HCULimit.evm.deployedBytecode.object
output.contracts["contracts/HCULimit.sol"].HCULimit.evm.deployedBytecode.immutableReferences
output.sources[<declaration source>].ast
```

It validates `id`, `solcVersion`, `solcLongVersion`, `input.language`, and that `settings.outputSelection` actually
requested `evm.deployedBytecode` and `ast` — a document that never asked for what we are about to read is not evidence
about it.

### The source cross-link

`sha256(input.sources["contracts/HCULimit.sol"].content)` must equal the **independently authenticated**
`CURRENT_OFFICIAL_AUTHORITY_SOURCE` content hash (`16d71ee5f899f1bfd5872bdb83e08d90f510fd529cd8a93d5001dc29f25634b8`).
Absence of that cross-link is itself a failure, not a pass by omission.

Without it, a correctly shaped and genuinely reproducible build **of a different HCULimit** would satisfy the gate. The
two subjects stay distinct: `artifact.provenanceSubject` remains `CURRENT_OFFICIAL_AUTHORITY_SOURCE` (the compiled
source), while the build and its compiler references bind to `CURRENT_OFFICIAL_ARTIFACT_BUILD`. They are different bytes
with different digests and they are not collapsed.

## The compiler immutable is UUPSUpgradeable.\_\_self

The immutable set is read from `evm.deployedBytecode.immutableReferences` — the compiler's own output — and every id is
resolved through the AST to its declaration. HCULimit has exactly one:

```
AST id 605
  @openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol
  VariableDeclaration  name=__self  type=address  stateVariable=true  mutability=immutable

  {"605": [{"start": 17180, "length": 32},
           {"start": 17221, "length": 32},
           {"start": 17739, "length": 32}]}
```

Three references, **32 bytes each**, each preceded by **PUSH32 (`0x7f`)** — solc stores an `address immutable` as a full
word, not as a 20-byte address. `UUPSUpgradeable` writes `address(this)` at construction so a delegatecall can detect
that it is running through a proxy, so the value is the **implementation's own address**.

| Side                       | Value                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| Artifact (compiler output) | **32 zero bytes**                                                 |
| Deployed                   | **12 zero bytes ‖ the resolved `authorityImplementationAddress`** |

Any other AST id, width, preceding opcode, offset set, overlap, or unresolvable declaration fails closed.

## Normalization is implementation-address-relative

The live verifier already resolves `authorityImplementationAddress` before Step 8 — the ERC-1967 slot for a proxied
authority, the authority address itself for a `DIRECT` one — and **that** address is what normalization uses.
`SEPOLIA_EXECUTOR_ADDRESS` is never passed to authoritative normalization.

At each declared reference the normalizer verifies the deployed word is exactly
`12 zero bytes ‖ implementation address`, then writes the authenticated 32-byte zero placeholder. The manifest declares
`deploymentValueShape: LEFT_PADDED_IMPLEMENTATION_ADDRESS_WORD`; any other shape is refused. There is no free
`replacementByte` — the field no longer exists.

Because the artifact digest is a function of the implementation address, it **cannot** be computed before that address
is resolved. Offline record validation uses the record's pinned implementation address; the live run recomputes it at
Step 8 from the chain-resolved one, and the implementation-address policy separately requires the two to agree.

### The executor constants are code, and are never normalized

The runtime also contains **30 PUSH20 occurrences of the configured Sepolia executor address**. These are ordinary
**compile-time constants**: they carry no entry in `immutableReferences`, they are part of what makes this build this
build, and they **remain byte-for-byte inside exact code identity**. Normalizing them would erase real code identity in
precisely the place an attacker would want it erased.

The undeclared-occurrence scan searches for the full 32-byte deployment **word**, so it cannot match a 20-byte constant.
Only values the compiler itself reports as immutable are ever touched.

## Legacy 0.10.0 fixture normalization vs current official v0.13.2 normalization

Two different algorithms over two different artifacts. They are not interchangeable, and the first has no authority over
anything.

|                      | Local `@fhevm/host-contracts@0.10.0` fixture    | Current official v0.13.2 build                             |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Role                 | offline self-test target only, **non-blocking** | the authoritative deployed artifact                        |
| Runtime length       | 14,832 bytes                                    | **20,231 bytes**                                           |
| Normalized values    | 28 PUSH20 **executor-address** immediates       | **3 PUSH32 `__self` words**                                |
| Width                | 20 bytes                                        | **32 bytes**                                               |
| Preceding opcode     | `0x73`                                          | **`0x7f`**                                                 |
| Relative to          | the executor address                            | the **implementation** address                             |
| Artifact placeholder | the artifact-local executor address             | **32 zero bytes**                                          |
| Metadata trailer     | solc-only CBOR                                  | solc-only CBOR, **12 bytes**, `0xa164736f6c6343000818000a` |

The 28-offset, PUSH20, executor-relative model was read off the obsolete 0.10.0 fixture and is false for the real build
in every particular. It survives only in `normalizeRuntimeBytecode`, the offline fixture self-test, whose result is
reported as `localFixtureSelfTestResult` and can never block a live authority PASS. The two now produce different
digests for the same input — which is the point: the fixture normalizer cannot stand in for the authoritative
comparison.

## PASS / BLOCKED / FAIL

| Verdict | Meaning                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS    | Every applicable control is proven present or proven absent **and bound to the verified deployed implementation**, both limits and scopes are verified, normalized bytecode identity holds, reciprocal linkage is verified, table compatibility holds, the schedule authority and immutable provenance are resolved, and SG-4 operation coverage is complete. |
| BLOCKED | Any applicable control is `UNRESOLVED` or only a local expectation, or any required step could not be completed. BLOCKED is never GO.                                                                                                                                                                                                                         |
| FAIL    | A step completed and contradicted the committed authority: hash mismatch, broken linkage, unexpected bytecode difference, cost mismatch, or use of the stale constant.                                                                                                                                                                                        |

A missing value is BLOCKED. A local expectation is BLOCKED. Gas may never substitute for HCU. **The current verdict is
BLOCKED.**

### Result validation

The sanitized result schema is closed in both directions: unknown properties are rejected, and every declared property
is required in every result regardless of verdict. Each check that can fail to complete has an explicit `UNRESOLVED`
spelling, so omission and "could not complete" never look alike, and a BLOCKED result stays representable without
claiming a verified linkage it does not have.

Validation is explicit recursive checking — required fields, closed property sets, `const`, `enum`, `type`, and
`pattern`, through nested objects and arrays — with no network-fetched dependency. On top of that, a `PASS` must satisfy
every condition listed in the schema's `passRequires`: exact schema, protocol, gate, and chain constants; exact
authority-root package, version, and integrity; exact expected protocol and source hashes; the correct executor address;
an authority address derived from the verified executor with the stale address rejected; a pinned block number and hash;
verified executor and authority code identity; the expected normalized implementation hash; `VERIFIED` reciprocal
linkage; exact total and depth limits and scopes; a block/batch state that is resolved and never `UNRESOLVED`; operation
compatibility with no cost or operand mismatches; complete SG-4 coverage; an empty unsupported-operations array; wallet,
account, signing, and transaction flags all false; and no unknown or forbidden field. The verifier refuses to emit a
`PASS` its own validator rejects.

## Future authority evidence

Preregistered, **not created**: `evidence/cp0/SG4_HCU_AUTHORITY.json` with a `.sha256` sidecar. It must bind the
authority-preparation commit and tree, the amended SG-4 protocol digest, the HCU-authority protocol digest, the direct
dependency pin, the pinned block number and hash, source hashes, deployed code hashes, the normalized comparison, the
reciprocal linkage, both per-transaction limits, both safety thresholds, the applicable-limit state machine, the
operation-table compatibility, SG-4 operation coverage, the stale-address rejection, sanitized RPC call classifications,
and the verdict.

## Benchmark execution gate

Permanent SG-4 benchmark execution remains blocked until all of: the authority verifier passes; the authority result is
pinned to an exact block number and hash; the executor and authority implementation are verified; both limit values and
scopes are verified; table compatibility is verified; SG-4 operation coverage is complete; and no unresolved applicable
ceiling remains.

## Reopen conditions

Reopen this authority protocol before changing the authority-root package, version, or integrity; the block/batch
authority state; the configured executor address; the deployed authority implementation at a later block; the installed
calculator or cost-table hash; any installed source hash; any limit value, scope, or inclusivity semantics; the
normalization offsets or metadata structure; the safety thresholds or bound semantics; or on introducing an SG-4
operation without an authoritative cost.

## Audit checklist

- [ ] Direct authority-root pin present, exact, and lockfile-consistent.
- [ ] Installed source, calculator, and cost-table hashes match.
- [ ] Both per-transaction controls carry a local expected value and remain blocking until the live binding.
- [ ] Depth scope established from code paths and transient storage, not from the docstring.
- [ ] Block/batch ceiling recorded `UNRESOLVED` and blocking; absence never claimed from a narrow pattern scan.
- [ ] Operation-schedule authority recorded `UNRESOLVED` and blocking, with all three schedules recorded side by side.
- [ ] Immutable provenance recorded `UNRESOLVED` and blocking, with no invented commit.
- [ ] ERC-1967 implementation resolved with `eth_getStorageAt` at the exact slot, never claimed through `eth_call`.
- [ ] Live verifier implemented and exercised against a fake read-only transport, not an unconditional refusal.
- [ ] Both HCU safety comparisons committed in the strict `<` form.
- [ ] Preparation binding is a two-commit A→B lineage with no self-reference; binding record absent and blocking.
- [ ] Network ceiling semantics `UNRESOLVED`; local `>=` and prior-reviewed `>` recorded separately.
- [ ] Internal 75% safety comparisons strict regardless of network ceiling inclusivity.
- [ ] Prior-reviewed immutable provenance recorded in full, `reverified: false`, and still blocking.
- [ ] Local `0.10.0` runtime is a self-test target only, never the current-deployment PASS hash.
- [ ] Every PASS facet bound to one authoritative artifact; cross-version mixing rejected.
- [ ] The authority-binding record carries the late-bound authority inputs; a lineage-only record is rejected.
- [ ] Binding commit B has exactly one parent; merge commits rejected.
- [ ] Every facet carries an origin; `LOCAL_INSTALLED_FIXTURE` can never be a PASS origin.
- [ ] On-chain HCU limits are read from the verified interface and compared to the binding record.
- [ ] Executor and authority code identity and versions verified against the binding record.
- [ ] ERC-1967 used only when the reviewed record proves that deployment model.
- [ ] Pinned block is `finalized`; no fallback to `latest`.
- [ ] RPC responses checked for id, version, status, size, and exactly one of result/error.
- [ ] Normalization manifest authenticated by recomputed digest and used for authoritative identity.
- [ ] Pricing manifest carries costs, operand modes, arity and result types; digest recomputed.
- [ ] Compatibility defined over the SG-4 closure; unused official operations do not block.
- [ ] Executor deployment model restricted to DIRECT; proxied executor refused.
- [ ] Provenance subjects exact and unique; every tuple pinned; supersession only by reviewed amendment.
- [ ] Caller applicability specified and resolved for every SG-4 subject; no bare null.
- [ ] Mandatory per-transaction limits never NOT_APPLICABLE; artifact proof is structured evidence.
- [ ] The two ceilings have one source: protocol-pinned and required to match in the record.
- [ ] Address-normalized comparison exact, fail-closed, and limited to the 28 declared offsets.
- [ ] Metadata trailer structurally validated and free of a source hash.
- [ ] Authority address derived from the verified executor; stale plugin constant rejected.
- [ ] Reciprocal linkage verified at the pinned block.
- [ ] Operation tables parsed and compared; zero cost and operand differences.
- [ ] Every SG-4 operation priced; non-HCU work classified explicitly.
- [ ] Both safety boundaries exclusive; equality is NO-GO.
- [ ] No wallet, signing, or transaction path anywhere in the verifier.
- [ ] The verifier reaches an actual PASS end to end against a coherent record and a fake read-only transport.
- [ ] That PASS issues exactly the 13 calls its own generated plan declares, and no others.
- [ ] Every real blocker, applied alone, moves the verdict off PASS.
- [ ] `localFixtureSelfTestResult` is reported and is not a PASS condition.
- [ ] Compatibility is defined over exact used variants, never operation names.
- [ ] Unused official variants are reported and never block.
- [ ] Metadata trailer pinned by exact length and digest; only verifiable structures accepted.
- [ ] Supplementary immutable references name exact deployed bytes and fail closed on any difference.
- [ ] An amendment names the exact superseded tuple, carries a review-record digest, and the entry matches it exactly.
- [ ] Applicability interpretation matches the declared return type; the queried address is the declared subject.
- [ ] Limit getters are zero-argument `uint256` specs with recomputed selectors.
- [ ] Block/batch absence requires a complete enumeration manifest; presence requires enforcement evidence.
- [ ] Local fixture root, measurement toolchain root and deployed authority root are three separate identities.
- [ ] No local `@fhevm/host-contracts` package value is required by a live PASS.
- [ ] The deployed authority root is derived from the selected current-official provenance tuple.
- [ ] There is one canonical variant manifest; the closure is derived from it, never duplicated.
- [ ] Every pricing entry is one variant with one cost, closed fields and a safe-integer cost.
- [ ] Every mismatch class is serialized and required empty for PASS.
- [ ] Normalization replaces deployed bytes only with the authenticated artifact placeholder.
- [ ] Every immutable reference is cross-linked to a complete, digest-bound compiler-reference manifest.
- [ ] Every cross-link is checked against the exact selected tuple, never a subject label.
- [ ] The enumeration is exhaustive and parse-complete; the block/batch conclusion is derived from it.
- [ ] Applicability proofs name a real entry of the digest-bound enforcement manifest.
- [ ] The proxy implementation-address policy is carried by the record shape and enforced at the pinned block.
- [ ] The derivation chain stops as soon as implementation identity is not VERIFIED.
- [ ] The guarded transport consumes the generated plan and refuses any divergence at issue time.
- [ ] The read-only allow-list remains an independent defence.
- [ ] Every critical call is declared in the closed interface manifest and executed from it.
- [ ] Every HCU limit getter targets the verified AUTHORITY role.
- [ ] One canonical operation-variant manifest, derived from the registered benchmark circuits.
- [ ] The pricing closure is a projection of it; no second operation table exists.
- [ ] The full authoritative schedule is extracted from authenticated bytes; a subset fails completeness.
- [ ] The expected normalized runtime digest is recomputed from the authenticated build.
- [ ] Normalization replaces deployed bytes only with authenticated artifact placeholder bytes.
- [ ] The enumeration, source ranges, enforcement functions and ceiling semantics are parsed, not asserted.
- [ ] The block/batch conclusion is derived by the verifier from the parsed surface.
- [ ] The official build is its own provenance subject with its own content hash.
- [ ] Every cross-link binds a complete tuple; an amendment re-anchors the source material itself.
- [ ] Provenance is never inferred from equality with an old local value, in either direction.
- [ ] The measurement root is the two files that compute HCU, verified from the installation.
- [ ] Unrelated fixture or config drift cannot block a coherent live PASS.
- [ ] Every eth_call comes from the one interface manifest, including caller applicability.
- [ ] A planned call is the complete canonical JSON-RPC request, deep-compared at issue time.
- [ ] No validated plan means zero requests issued.
- [ ] Every PASS-consumed field is classified; no blocking field is a diagnostic.
- [ ] CURRENT_OFFICIAL_ARTIFACT_BUILD is a REPRODUCED_BUILD entry and claims no repository path.
- [ ] The real Hardhat build-info stays external and arrives with the Commit-B binding record.
- [ ] Commit A pins the build-info id, digest and full reproduction recipe.
- [ ] The build-info's HCULimit input source cross-links to the authenticated authority source.
- [ ] Immutables come from evm.deployedBytecode.immutableReferences and resolve through the AST.
- [ ] UUPSUpgradeable.\_\_self is three 32-byte PUSH32 references at 17180 / 17221 / 17739.
- [ ] The artifact placeholder is 32 zero bytes.
- [ ] The deployed value is 12 zero bytes || the resolved authorityImplementationAddress.
- [ ] Normalization is implementation-address-relative; the executor address is never passed to it.
- [ ] All 30 executor PUSH20 compile-time constants stay exact and unnormalized.
- [ ] The legacy 0.10.0 fixture normalization is a non-blocking self-test only.
- [ ] SG-4 remains PENDING; SG-5 remains PENDING.
