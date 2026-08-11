# Leopold CP1 HCU and Performance Record

The permanent CP0 live measurement establishes `FHE.randEuint128()` at 25,000 HCU and 25,000 HCU depth, against the
verified 20,000,000 transaction and 5,000,000 depth ceilings. CP1 does not rewrite that evidence.

| Primitive                    | Foundation operation shape                                             | Status                                                         |
| ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| balance-change TWAB accrual  | cast64->128, mul128-scalar, add128, then balance/accounting operations | mock execution passed; live receipt measurement required       |
| historical observation query | public binary search plus at most cast, mul-scalar, add per boundary   | mock execution passed; two boundaries per user weight          |
| round close                  | global cast/mul/add then aggregate sub and public ACL                  | mock public-decrypt/finalize passed; live measurement required |
| random candidate             | rand128                                                                | measured 25,000 HCU in locked SG-4 evidence                    |
| candidate validity           | lt128-scalar plus public-decrypt authorization                         | API compiled; live combined measurement required               |
| modulo mapping               | rem128-public scalar                                                   | API compiled; live combined measurement required               |
| participant selection step   | two boundary queries plus prefix add/comparisons/selects               | design only; benchmark before implementation acceptance        |

The next benchmark harness must use `hre.fhevm.computeTransactionHCU(receipt)`, authenticate the active price schedule
and both ceilings as SG-4 did, cover worst-case observation lookup and selection chunk size, and retain the 75% internal
safety policy. Mock gas or operation counting is not represented as live HCU authority.
