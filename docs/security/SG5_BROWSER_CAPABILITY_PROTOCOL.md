# SG-5 clean-browser FHE capability protocol v2

SG-5 is the browser-runtime capability gate for the pinned Zama stack. It is independent of the closed SG-4 authority gate and the locked SG-4 production-randomness decision. SG-5 does not implement the prize pool, winner selection, TWAB accounting, or production settlement.

## Pinned implementation

- Next.js `16.3.0`, React `19.2.8`, TypeScript `5.9.3`
- `@zama-fhe/sdk` `3.4.0`, `@zama-fhe/react-sdk` `3.4.0`, viem `2.55.10`
- `@playwright/test` `1.62.1`, `@fhevm/solidity` `0.11.1`
- Ethereum Sepolia, chain ID `11155111`
- Dedicated probe `SG5BrowserProbe` at `0xfc672ca5846896A7A135943E79dd11283c38FE78`

The probe encrypts one benign `euint64` value (`1`) using `ZamaSDK.encrypt`, submits it through `ViemSigner` over the browser EIP-1193 provider, reads the encrypted result, and checks user decryption. The probe never contains a randomness ticket or winner-selection logic.

## Browser and wallet model

The authoritative run uses the production Next bundle at `/sg5-probe` with `SG5_PROBE_PRODUCTION=1`. The route is dynamic and still requires `SG5_PROBE_PAGE=ENABLED_LOCAL_ONLY` plus the exact live acknowledgment. A fresh Playwright Chromium context has no cookies or storage origins and blocks service workers.

The test-only automation wallet is held by the Playwright Node runner. It supplies an EIP-1193 bridge to the page for account discovery, transaction signing, and EIP-712 user-decryption signatures. The frontend process receives no private key. An independent unfunded identity is exposed only for the negative decryption test and cannot submit transactions. The production wallet interface remains the ordinary browser EIP-1193 interface.

## Required scenarios

The complete set is:

1. clean load and empty-context proof;
2. SDK/WASM initialization;
3. Sepolia provider detection;
4. wrong-network refusal before FHE work;
5. browser-side encrypted input and proof construction;
6. browser-facing encrypted transaction submission and successful receipt;
7. encrypted result handle readback;
8. authorized user decryption and plaintext check;
9. unauthorized identity rejection;
10. reload and two independent clean-context repeats;
11. production-build execution.

The Playwright harness records page errors, console errors/warnings relevant to runtime, unhandled rejections, failed requests, exact registered origin/category observations, public transaction hashes and block numbers, and sanitized lifecycle stages. It never persists ciphertexts, input proofs, handles, wallet keys, signed payloads, headers, bodies, or authenticated URLs.

## Network authority

The installed Sepolia relayer configuration is used without mocking. The exact asset authority was resolved by an authorized read-only request to `/v2/keyurl`:

- relayer: `https://relayer.testnet.zama.org`
- RPC: `https://ethereum-sepolia-rpc.publicnode.com`
- public-key and CRS asset origin: `https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com`
- public-key path prefix: `/PUB-p1/PublicKey/`
- CRS path prefix: `/PUB-p1/CRS/`

The browser CSP and Playwright routing policy allow only localhost, the relayer, the Sepolia RPC, and this exact S3 origin/path authority. Unknown origins, credentials, fragments, unauthorized paths, failed critical responses, and forbidden redirects fail the run.

## Evidence and retry policy

The deterministic protocol is emitted by `pnpm sg5:protocol` and is hashed before live execution. The live runner binds the run to an exact preparation commit/tree and writes `evidence/cp0/SG5_BROWSER_CAPABILITY.json` only after the complete suite passes. Its SHA-256 sidecar is checked by the evidence validator. Failed private run directories are retained for forensic review; a failed individual context is never silently replaced.

SG-5 is closed only when the aggregate has two real Chromium contexts, the wrong-network scenario, production-build marker, all lifecycle checks, zero critical browser failures, and a valid evidence marker.
