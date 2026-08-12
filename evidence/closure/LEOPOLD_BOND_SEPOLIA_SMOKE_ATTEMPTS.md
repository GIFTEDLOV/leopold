# Leopold bond Sepolia smoke attempts

Date: 2026-08-12

This is an append-only failure/partial-execution record, **not** PASS evidence. The smoke script writes canonical JSON
evidence only after every required reconciliation check succeeds; therefore no `LEOPOLD_BOND_SEPOLIA_SMOKE.json` was
created.

Three controlled attempts were made against Sepolia with the configured repository RPC/signer:

1. The first attempt terminated with `UND_ERR_CONNECT_TIMEOUT` while communicating with an external HTTPS endpoint.
2. The second attempt stopped making network progress and was terminated after bounded polling; it returned no failed
   transaction receipt.
3. The instrumented attempt successfully mined these transactions before the Zama encryption/relayer connection closed:
   - disposable bond-enabled vault deployment: `0x0f5f8679cb3fd1b94dcc276cf8aa8d9fa01486df948aac62ac6c949d1d610aa5`;
   - canonical USDC approval for the already live-proven lcUSDC:
     `0xa4b792fdae3d43389cd71466cc63974dcccf237065297c4091e9c20267a05d29`;
   - lcUSDC wrap: `0xe31073f71372dfde7202020a669b338763bcd025f39085a8511824a3c3a8764e`.

The third attempt then failed during `createEncryptedInput(...).encrypt()` with `UND_ERR_SOCKET: other side closed`,
before the private deposit or bond lifecycle was submitted. No contract revert was observed. Local mock-FHE tests cover
the complete save -> register -> close -> private settlement -> reward -> refund -> next-round -> withdraw lifecycle;
historical immutable live evidence separately covers the same lcUSDC, private deposit/withdrawal, Compound deployment,
yield, replenishment, pause, and emergency behavior at its source-bound commit.

The complete bond-enabled live smoke remains an evidence gap and must be repeated when the external FHE relayer is
available. These transactions must never be relabeled as a complete smoke.
