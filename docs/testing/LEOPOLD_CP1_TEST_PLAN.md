# Leopold CP1 Test Plan

## Implemented suites

- `LeopoldReferenceModels.ts`: exact checkpoint/brute TWAB comparison over 100 deterministic randomized histories,
  multi-vault movement, missed rounds, aggregate linearity, accounting conservation, rejection boundaries/uniformity,
  and legal/illegal round transitions.
- `LeopoldVaultFoundation.ts`: callback custody, registration/order, cap/refund, partial/full/duplicate withdrawal,
  sponsor commitment, ACL deny, exact individual/global TWAB, aggregate proof finalization, missed rounds, isolation,
  duration/config validation, exactly four official configurations, duplicate rejection, and registry admin limits.
- `LeopoldPrivateSettlement.ts`: proof binding, participant snapshot, full-domain selection, reconciliation, replay,
  private winnings, auto-save, winnings withdrawal, ACL denial, four-vault and N/N+1 concurrency, and empty rollover.
- `LeopoldSelectorHcuHarness.ts` and `LeopoldObservationLookupBenchmark.ts`: composite ceilings, public proof flow, live
  circuit equivalence, and 1/2/8/32/128/512 observation scaling.

## Remaining later-slice tests

Add adapter loss/harvest/withdrawal invariants and live official-wrapper callback/withdraw paths in the dedicated yield
and custody slice. High-population keeper incentive/liveness tests remain required beyond the bounded HCU proof.

Every checkpoint must run `pnpm check:all`, SG-4/SG-5 validators, and `pnpm cp0:validate`. Historical evidence files are
hash-locked and excluded from formatting edits.
