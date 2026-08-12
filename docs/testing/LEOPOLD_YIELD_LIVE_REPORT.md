# Leopold Compound III Live Report

## Result

The official Compound Sepolia faucet funded canonical Circle Sepolia USDC, a disposable signer supplied 1 USDC to the
official USDC-base Comet, genuine index interest increased the position, and `withdraw(base, MaxUint256)` returned the
complete position without a queue or cooldown. The final implementation probe then exercised lcUSDC wrap, confidential
Leopold deposit, owner decryption and cross-user denial, aggregate proof/unwrap, direct Comet supply, genuine-surplus
harvest, immediate withdrawal, aggregate replenishment, pause, emergency unwind, final withdrawal, and public unwrap.
Exact receipts and code hashes are in `evidence/cp1/LEOPOLD_COMPOUND_LIVE.json`.

Key live identities:

- Circle Sepolia USDC: `0x1c7D…7238` (6 decimals).
- Comet: `0xAec1…0b6e`; base token equality verified.
- final probe lcUSDC: `0x70ca…4209`.
- final probe Weekly vault: `0x09A7…cbDB`.
- isolated adapter: `0x5813…8707`.

The first venue probe supplied 1,000,000 base units. At block 11,469,508, `balanceOf` was 999,999 because of Comet's
six-decimal principal/index rounding. At block 11,469,512, normal accrual raised it to 1,000,000; the effective supply
index derived from the official formula rose from `1371804181015426` to `1371804774854514`. Full withdrawal later
returned 1,000,007 base units and left zero balance, borrow, collateral, and allowance.

The end-to-end vault deployed 625,000 aggregate base units. Managed value reached 625,001 while basis stayed 625,000.
Only one unit was harvested and wrapped into the prize category. A 1.5-USDC encrypted withdrawal completed from the
liquid buffer; a 0.375-USDC objective replenishment followed. Emergency unwind used Comet's canonical MaxUint full-exit
path. The harness discovered that unwinding immediately after a fresh six-decimal redemption can realize a one-unit
rounding shortfall; the final proof waited for normal index recovery and then closed with zero basis, managed assets,
shortfall, borrow, approvals, and user principal. Failed oversized withdrawals preserved liabilities throughout.

## Live HCU

| Operation                    | Total HCU | Max depth HCU |       Gas |
| ---------------------------- | --------: | ------------: | --------: |
| private deposit              | 3,470,256 |       955,032 | 1,301,146 |
| aggregate deployment request | 2,359,064 |     1,666,000 |   629,523 |
| deployment finalization      |   324,032 |       162,032 |   722,656 |
| genuine-yield harvest        | 1,072,064 |       531,032 |   569,553 |
| immediate withdrawal         | 3,522,128 |       955,032 |   971,806 |
| replenishment request        | 1,443,032 |     1,297,000 |   250,495 |
| replenishment finalization   |   910,096 |       531,032 |   922,361 |
| emergency unwind             |   910,160 |       531,032 |   608,918 |

Every operation remains below 20,000,000 transaction HCU and 5,000,000 depth HCU. Strategy epochs are one vault-level
operation, so participant growth does not multiply these costs.

## Scope accuracy

This is live Sepolia integration evidence, not an external audit or mainnet yield guarantee. The probe vault is a
disposable Weekly configuration, not the official four-vault registry deployment. Final source adds conservative
post-probe hardening (basis-clamped replenishment, narrower getter, registry Comet consistency); the evidence records
both live code hashes and final source hashes rather than claiming byte identity.
