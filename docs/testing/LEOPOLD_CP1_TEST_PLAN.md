# Leopold CP1 Test Plan

## Implemented suites

- `LeopoldReferenceModels.ts`: exact checkpoint/brute TWAB comparison over 100 deterministic randomized histories,
  multi-vault movement, missed rounds, aggregate linearity, accounting conservation, rejection boundaries/uniformity,
  and legal/illegal round transitions.
- `LeopoldVaultFoundation.ts`: callback custody, registration/order, cap/refund, partial/full/duplicate withdrawal,
  sponsor commitment, ACL deny, exact individual/global TWAB, aggregate proof finalization, missed rounds, isolation,
  duration/config validation, exactly four official configurations, duplicate rejection, and registry admin limits.

## Required next-slice tests

Add full selector chunk interruption/resume/replay tests; exactly-one/no-zero-weight winner invariants; branchless
winnings and auto-save privacy traces; adapter loss/harvest/withdrawal invariants; live official-wrapper
callback/withdraw paths; HCU measurements for each final circuit; participant-cap/admission stress; and end-to-end
four-vault concurrent rounds.

Every checkpoint must run `pnpm check:all`, SG-4/SG-5 validators, and `pnpm cp0:validate`. Historical evidence files are
hash-locked and excluded from formatting edits.
