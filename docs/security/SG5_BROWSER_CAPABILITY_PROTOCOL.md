# SG-5 Browser Capability Protocol

## Executive decision

SG-5 is **PREPARED_LIVE_BROWSER_EXECUTION_REQUIRED** and remains **PENDING**. This document preregisters a
browser-native capability probe; it contains no Sepolia result and does not authorize a deployment, wallet request,
signature, or transaction. A later reviewed Phase 1 run must execute the real installed SDK in two fresh Playwright
Chromium contexts and create separately reviewed, identity-bound evidence before SG-5 can become PASS.

SG-1, SG-2, and SG-3 remain closed and unchanged. SG-4 remains PENDING because authoritative network HCU source and
ceiling verification is unresolved. SG-5 neither resolves nor weakens SG-4.

## Capability and installed lineage

The committed frontend uses the Next.js App Router under `frontend/app`. The installed and committed lineage is Next.js
16.3.0, React 19.2.8, TypeScript 5.9.3, Playwright 1.62.1, wagmi 3.7.6, viem 2.55.10, `@zama-fhe/sdk` 3.4.0, and
`@zama-fhe/react-sdk` 3.4.0. The browser SDK transitively uses `@fhevm/sdk` 0.13.2.

The installed 3.4.0 encryption API is `ZamaSDK.encrypt`, not the legacy `fhevmjs` or encrypted-input builder surface.
The probe passes exactly one typed value:

```text
{ value: 1n, type: "euint64" }
```

The locked network is Ethereum Sepolia (chain ID 11155111). The locked contract is
`0x332C58e28Bb31c902ddd370265eBBF1030299bC7`; the locked public user is `0x57357D26D1f56eca4556d271078A0239a7696Bbf`.
These are public identifiers. No secret authority is needed or permitted.

## Browser-only architecture

`frontend/lib/sg5/browser-probe.ts` begins by requiring `window`, `document`, `navigator`, and `WebAssembly`. It
dynamically imports the real browser SDK, built-in Sepolia chain configuration, web relayer adapter, read-only
`ViemProvider`, and viem public client only after that browser check. The SDK configuration deliberately omits a signer
and wallet client and uses in-memory SDK stores.

The probe page is `/__sg5__`. It returns not-found unless `SG5_PROBE_PAGE` equals `ENABLED_LOCAL_ONLY`, and it always
returns not-found when `NODE_ENV` is `production`. It has no arbitrary input or wallet UI, shows a test-only banner, and
writes only the validated sanitized result to the DOM. The health endpoint follows the same gate. No analytics or
telemetry is present.

Offline structural mode uses a controlled adapter solely to exercise page state and sanitization. Its status is
`STRUCTURAL_PASS_NOT_LIVE`; it cannot emit live capability success. Live mode always calls the real SDK module and is
unreachable without the exact acknowledgment `SG5_LIVE_ACK=I_UNDERSTAND_THIS_CONTACTS_SEPOLIA`.

## WASM/runtime proof

The installed FHE runtime exposes `singleThread` and `wasmAssetLoadMode`. The protocol pins:

- `singleThread: true`;
- `wasmAssetLoadMode: "embedded-base64"`.

This keeps the TFHE WASM asset bundled and makes its initialization occur in the page realm rather than a worker pool.
Before SDK initialization, the probe exclusively wraps `WebAssembly.instantiate` and `WebAssembly.instantiateStreaming`.
A browser-global private marker rejects concurrent installation. The wrappers preserve receiver, argument identity and
order, return values or promises, synchronous throws, and asynchronous rejections. They record successful instantiate,
successful streaming instantiate, and failed-call counts separately for the `SDK_INITIALIZATION` and `SDK_ENCRYPTION`
critical sections and restore the exact originals in `finally`. Unexpected wrapper replacement fails instead of
overwriting another actor's function.

This is a **scoped browser runtime observation temporally bound to the dedicated Zama SDK operation**. It does not claim
cryptographic module identity. The dedicated probe page contains no other WASM component, and calls outside the active
critical section are not counted; a future change that introduces concurrent unrelated WASM must reopen this proof.

Live success requires both a positive instantiation count and successful real `ZamaSDK.encrypt` output.
`typeof WebAssembly === "object"` alone is explicitly insufficient. If this proof stops being authoritative after a
runtime change, SG-5 is BLOCKED and must be reopened rather than accepting a marker or mock.

## Sepolia public-key proof

The built-in installed Sepolia configuration identifies:

- official Sepolia relayer origin: `https://relayer.testnet.zama.org`;
- installed Sepolia chain-preset RPC origin: `https://ethereum-sepolia-rpc.publicnode.com`;
- gateway chain ID: 10901.

The installed source does **not** fix the origins that serve the large public-key and CRS assets. It fixes only the
official relayer `/v2/keyurl` discovery path; the current live response supplies one public-key URL and one CRS URL.
Because preparation may not contact that endpoint and may not invent or broadly allow origins, those two exact asset
origins are unresolved. The current page CSP intentionally does not allow unknown asset origins, so a live attempt is
fail-closed. Before live execution, a separately authorized network preflight must resolve the current origins from the
official relayer, SG-5 must reopen through a reviewed commit that adds those exact origins to the protocol and CSP, and
the live runner blocker must be removed. Neither a wildcard HTTPS allowlist nor a guessed storage origin is acceptable.

The probe explicitly calls `sdk.relayer.fetchFheEncryptionKeyBytes()`. The installed return type contains public-key and
CRS byte containers plus metadata. The probe verifies only that both byte arrays are nonempty, immediately releases the
complete return reference, and never logs, fingerprints, returns, serializes, or persists the bytes or metadata.
Playwright must independently observe successful `RELAYER_KEYURL_METADATA`, `PUBLIC_KEY_ASSET`, `CRS_ASSET`, and
`SEPOLIA_RPC` records in each context. Exact public-key and CRS origins and their path prefixes must first be
discovered, reviewed, and committed. A fixture, fulfilled response, empty response, stale service worker, generic
relayer request, or mock cannot satisfy this rule. PASS is impossible while either origin is unresolved.

Each live context starts with fresh browser storage, blocked service workers, no reuse of prior SDK state, no
screenshot, no video, and no trace. The two contexts must pass independently.

## Encrypted euint64 proof

The real call is locked to `sdk.encrypt({ values: [{ value: 1n, type: "euint64" }], contractAddress, userAddress })`.
Success requires exactly one nonempty hex encrypted value and one nonempty hex input proof. These checks occur while the
SDK result is held in a local variable. The variable is discarded in `finally`; the sanitizer receives only booleans and
counts. No encrypted value, proof, handle, or complete SDK result crosses the module boundary or enters the DOM,
console, report, screenshot, or evidence.

The probe creates no wallet client or signer. `window.ethereum.request` is replaced in the isolated test context by a
fail-closed sentinel before page code, making any account, signing, or transaction authority request fail the test.
There is no `signMessage`, `signTypedData`, `eth_requestAccounts`, `eth_sendTransaction`, `sendTransaction`, or
`writeContract` path in the probe.

## Closed network policy

The probe page installs a connect-source CSP. Offline mode permits only same-origin localhost traffic. Live mode permits
only same-origin traffic plus the exact two installed Sepolia origins above. Worker sources are limited to same-origin
and blob URLs; all analytics, telemetry, advertisements, and unrelated origins remain forbidden.

Playwright applies a policy-only route continuation: an allowed request is continued unchanged and is never fulfilled or
mocked, while a forbidden request is aborted before network access. An executed canonical URL validator rejects
credentials, fragments, explicit default or nonstandard ports, alternate schemes, suffix/wildcard hosts, IP
substitutions, unregistered paths, queries, and invalid redirect hops. The relayer category is limited to exactly
`/v2/keyurl`; the installed RPC category is limited to its exact root path. The closed categories are
`LOCAL_FRONTEND_ASSET`, `SEPOLIA_RPC`, `RELAYER_KEYURL_METADATA`, `PUBLIC_KEY_ASSET`, and `CRS_ASSET`. Every observation
contains only its origin classification, request category, status category, nonnegative decimal-string duration,
redirect classification, and success boolean. Status includes network failure, and redirect classification distinguishes
none, allowed same-origin, allowed registered-origin, and forbidden. Paths, query strings, fragments, credentials,
headers, bodies, cookies, IP addresses, complete URLs, and request/response objects are never retained.

For a 3xx response, the observer correlates the original request with its concrete redirect target through Playwright's
`request.redirectedTo()` relationship; `redirectedFrom()` is used only as provenance on the target request. An allowed
same-origin or separately registered-origin 3xx is a successful **transition**, not terminal retrieval proof. Every hop
is classified independently, and the required category is satisfied only by a final successful 2xx observation. A 3xx
without a concrete target, a forbidden target, a broken chain, or a later 4xx/5xx/network failure fails closed. Thus an
allowed redirect is not an automatic context failure, but it can never replace the final keyurl, key asset, CRS asset,
or RPC response.

The `/v2/keyurl` body can never expand the allowlist at runtime. Asset classifications remain impossible in the current
preparation because the exact origins are intentionally null and `dynamicAssetOriginsResolved` is false.

The Playwright configuration itself rejects the live acknowledgment while the compiled dynamic-origin resolution flag is
false, so bypassing the launcher cannot start the current blocked live suite. It also requires a launcher-supplied
private output directory; no predictable shared `/tmp` report path is used.

## Sanitized result

The versioned result `zama-szn4.sg5-browser-probe-result.v1` contains only fixed identity, browser family, lineage,
chain ID, runtime/encryption booleans, decimal-string counts, closed blocker/failure classifications, sanitized network
observations, authority-action false values, error counters, and a nonfinal harness verdict. Its validator traverses the
entire own-property graph with cycle detection and property descriptors. It rejects symbols, accessors, non-enumerable
additions, unexpected prototypes, class instances, binary/typed containers, functions, bigint values, cycles, unknown
nested fields, and every contradictory state transition without invoking getters.

`zama-szn4.sg5-browser-probe-aggregate.v1` is the only result shape that can ever express PASS. It requires exactly two
independently validated real live contexts, zero mock contexts, complete capability fields, zero errors and authority
actions, no blocker, `dynamicAssetOriginsResolved=true`, exact committed public-key and CRS origins, and all four
required successful network categories independently in both contexts. Structural, preparation, per-context, mock,
blocked, and failed records cannot express PASS.

Only after the origin blocker is resolved can a page-level live result be
`CAPABILITY_COMPLETE_AWAITING_HARNESS_VERDICT`; the current closed state is `BLOCKED`. Only the complete Playwright
harness aggregate may determine a later live PASS after both contexts, network observations, and zero-error rules are
checked. Preparation remains non-PASS.

## Playwright modes and error policy

The offline structural suite verifies the route state machine, browser requirement, CSP/gating, sanitizer, forbidden
fields, authority prohibitions, and the rule that a fake cannot pass live. It performs no external request.

The live suite is skipped unless the exact acknowledgment is present. It executes two separately created cold contexts.
Each context must independently prove browser execution, real SDK loading, positive scoped WASM instantiation, SDK
instance creation, official public-key retrieval, euint64 encryption, one encrypted payload, one proof, exact
keyurl/public-key-asset/CRS-asset/RPC observations, and zero console errors, page errors, unhandled rejections,
forbidden-origin requests, wallet requests, signature requests, and transactions. No measured failure may be omitted.

The current repository installation has no Playwright Chromium bundle and no system Chromium/Chrome executable.
Preparation tests therefore cannot execute the offline structural Playwright suite without a prohibited browser
download. This is a precise local validation limitation and later execution blocker, not a PASS and not a reason to
download during preparation.

## Secure launcher and port 3000

`scripts/sg5-launcher.cjs` supports `preflight`, `structural`, and `live` modes. Browser discovery resolves the
frontend-installed `@playwright/test` API with `createRequire(frontend/package.json)`, asks `chromium.executablePath()`
for the managed executable, and then checks fixed system-browser candidates. Resolving the API is deliberately distinct
from validating that its managed executable is installed: the current API resolves, but its executable path is absent,
so the current status remains `BLOCKED_NO_BROWSER`. Every candidate must be an absolute, canonical, nonsymlinked
executable regular file; device, inode, size, and modification identity are revalidated immediately before launch, and
the exact selected path is passed to Playwright. Structural and live modes require the exact nonsymlinked
`/home/dell/zama-szn4` root, reject credential-like environment variable names without reading or printing their values,
start only a localhost frontend, wait for the gated health endpoint, suppress raw child output, and print only a suite
PASS/FAIL marker.

Port 3000 is fixed. The launcher never terminates or reuses a pre-existing listener: any occupied port fails closed.
After spawning, the launcher resolves the actual listening socket owner from `/proc`, requiring exactly the spawned
frontend PID or a descendant with the same launcher-created process group/session and verified PID, start time,
ancestry, cwd, executable, and local Next entrypoint. A health response is insufficient without this ownership proof, so
an unrelated process winning the bind race is never trusted or signaled.

An exited group leader does not prove cleanup. The launcher enumerates every surviving member of its dedicated process
group, rechecks previously verified descendant PID/start-time identities, and resolves the port-3000 owner even when the
leader is absent. A leaderless but still verified group receives the same graceful cleanup. The closed outcomes are
`ALREADY_EXITED`, `TERMINATED_GRACEFULLY`, `TERMINATED_FORCIBLY`, `OWNERSHIP_LOST`, `PID_REUSE_DETECTED`, and
`AMBIGUOUS_PROCESS_GROUP`; only the first three are successful cleanup. Unresolved ownership, PID reuse, or ambiguous
membership causes no signal and cannot be reported as successful cleanup.

Each run uses a mode-0700 OS-generated `mkdtemp` directory beneath the canonical temporary parent. Before recursive
deletion, lstat and realpath checks prove the original directory remains a direct, nonsymlinked child bearing the
private prefix and is not `/`, `/tmp`, the parent, or the repository. Process identity remains in memory. The frontend
and Playwright each run in a launcher-created process group/session. Before every signal, PID, start time, process
group, session, and listener relationship are revalidated. Cleanup sends SIGTERM first, waits a bounded interval, then
sends SIGKILL only after a second identity check. SIGINT, SIGTERM, SIGHUP, uncaught exceptions, unhandled rejections,
normal completion, frontend/health failure, timeout, and Playwright failure share one awaited, idempotent cleanup
controller. The launcher exports these decision functions for adapter-based adversarial tests. The same private
directory contains all Playwright output. It is deleted only after verified absence or verified termination of all
launcher-owned processes and listeners; an unresolved lifecycle retains the private directory for sanitized diagnostics
rather than risking deletion while process ownership is uncertain.

Live mode is currently hard-blocked by the unresolved public-key and CRS asset origins. After a reviewed protocol
reopening resolves that blocker, it requires branch `main`, a clean worktree including no staged or untracked files,
absence of both the SG-5 evidence artifact and sidecar, the exact acknowledgment, and explicit expected preparation
commit, tree, and protocol SHA-256 arguments. Without invoking a package manager, it runs the deterministic generator
through the installed `ts-node` binary, caps and parses stdout, rejects stderr, validates every locked public identifier
and prohibition independently, hashes the exact bytes, and compares that digest with the reviewed argument.

## Future evidence envelope

The future artifact is preregistered as `evidence/cp0/SG5_BROWSER_CAPABILITY.json` with a SHA-256 sidecar. It is
intentionally absent now. Its envelope must bind the preparation commit, preparation tree, and deterministic SG-5
protocol digest and contain only sanitized browser/runtime classification, installed lineage, locked public identifiers,
both cold-context records, WASM/public-key/encryption structural proofs, origin classifications, error counters,
explicit false authority-action values, and final PASS/BLOCKED/FAIL. Live UTC timestamps are permitted in evidence; the
deterministic protocol contains none.

The evidence must state wallet requested false, signing requested false, transaction submitted false, and forbidden
material retained false. It must contain no raw key, ciphertext, proof, handle, complete SDK object, complete URL,
header, body, cookie, storage dump, or transaction data.

## PASS, BLOCKED, FAIL, and retry rules

PASS requires both fresh cold contexts to satisfy every locked assertion and an identity-bound, checksummed, sanitized
evidence envelope. One passing context is insufficient.

BLOCKED applies now because no usable browser exists and the installed local source does not disclose the current
public-key and CRS asset origins. It also applies when authoritative WASM proof cannot be produced or a documented
official relayer/RPC outage invalidates the complete context set. An external outage retains both full sanitized context
records and requires rerunning the entire two-context set later; one unfavorable context cannot be selectively replaced.

FAIL applies to browser/SDK logic failure, forbidden origin or redirect, any console/page/unhandled error, sensitive
exposure, wallet/signature/transaction request, or mock-only success. A logic failure is retained and cannot be
selectively retried until a reviewed code or protocol change. Sensitive exposure invalidates the evidence.

## Reopen conditions and risks

SG-5 must reopen before continuing if the browser or React SDK lineage changes; the installed Sepolia
relayer/RPC/gateway/verifier configuration changes; the encryption or key API changes; the WASM runtime/proof mechanism
changes; any locked identifier, value, or width changes; the origin list, context count, sanitizer, evidence schema,
retry rule, or verdict rule changes; or wallet, signing, transaction, persistence, telemetry, or confidentiality
behavior changes.

Primary risks are SDK/runtime drift, large public-key transfer failure, CSP incompatibility, official endpoint outage,
browser absence, accidental logging, stale browser state, and authority escalation. The closed page, in-memory storage,
cold contexts, CSP, transparent WASM proof, allowlisted result schema, fail-closed wallet sentinel, and whole-set retry
rule address these risks without claiming a live result.

## Phase 1 execution procedure

After this preparation is reviewed and committed, resolve the two asset origins through a separately authorized official
relayer discovery, reopen and recommit SG-5 with the exact origins, and resolve the local browser blocker through a
separately authorized environment change. Record the reviewed preparation commit, tree, and protocol digest. Start with
a clean tree and no existing SG-5 evidence. Provide the exact live acknowledgment and identity arguments to the
launcher. Execute the full two-context set without request fixtures, response fulfillment, or modification; the
policy-only route may only continue an exact allowed request unchanged. Retain only sanitized output, build the
identity-bound envelope and sidecar, independently review them, and only then consider updating the evidence registry.
No transaction is part of this procedure.

## Audit checklist

- [ ] SG-5 is PENDING and no live result appears in this document.
- [ ] Installed versions and Sepolia preset still match the deterministic protocol.
- [ ] The page is local-flag gated and production-disabled.
- [ ] The real live path imports `@zama-fhe/sdk` and uses `ZamaSDK.encrypt`.
- [ ] The SDK has no signer or wallet client.
- [ ] Exact public-key and CRS asset origins have been resolved, reviewed, and committed before live execution.
- [ ] Embedded single-thread WASM instantiation is observed, not inferred from availability.
- [ ] Keyurl metadata, public-key asset, CRS asset, and RPC retrievals are each observed successfully in both contexts.
- [ ] Exactly one euint64 encrypted payload and one proof are structurally present but never exposed.
- [ ] Both fresh contexts independently pass with no service-worker state.
- [ ] Current CSP permits only localhost, installed relayer, and installed chain-preset RPC; reviewed exact asset
      origins must be added before live execution.
- [ ] No request path, query, headers, bodies, redirect URL, credentials, or response bodies are retained.
- [ ] Console, page, unhandled, forbidden-origin, wallet, signing, and transaction counters are zero.
- [ ] Mock structural success cannot become live PASS.
- [ ] The launcher verifies the exact root and branch, clean identity, freshly generated protocol digest and locked
      values, evidence/sidecar absence, executable regular-file browser identity, and verified spawned ownership of
      port 3000.
- [ ] Future evidence is identity-bound, sanitized, checksummed, and separately reviewed.
- [ ] SG-4 remains PENDING and SG-1 through SG-4 plus existing evidence are unchanged.
