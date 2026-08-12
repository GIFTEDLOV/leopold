# CP1 Yield FRESH_SESSION_ADVERSARIAL_REVIEW

Classification: fresh-session adversarial review under M-8; not externally independent and not an audit.

Attacks covered wrong base token/scale, Comet proxy dependence, supply/withdraw pause, approval residue, borrow or
collateral creation, aggregate proof replay, low-participation inference, epoch griefing, external position donation,
basis drift, double harvest, six-decimal rounding, concealed loss, insufficient liquidity, cross-vault subsidy, pause
abuse, and emergency exit.

Findings corrected in scope:

1. `balanceOf`-sized emergency withdrawal could leave rounding principal. The adapter now uses Comet's canonical MaxUint
   full-position withdrawal.
2. An unsolicited Comet position transfer could resemble index yield. The adapter snapshots signed Comet principal and
   fails harvest/deployment closed when it changes unexpectedly.
3. A replenishment deficit larger than recoverable basis would create an unfinalizable proof. The encrypted deficit is
   now clamped to public adapter basis before declassification.
4. Global `viaIR` changed unrelated SG-2 behavior. Size-oriented compilation is isolated to LeopoldVault and its
   registry dependency; SG-2 regression passes under original settings.
5. Integrated runtime approached EIP-170. The CP1 runtime was 24,496 bytes with only 80 bytes remaining. The
   pre-frontend bond-enabled candidate is 23,539 bytes with a deterministic 23,552-byte ceiling and 1,037 current
   headroom.

Residuals: Comet governance/proxy and pause risk; public aggregate inference at low participation; relayer/proof
liveness; six-decimal rounding; 75% calibration needs real usage; settlement Sybil economics remain unresolved;
settlement remains four participants per transaction over a fresh, round-scoped bonded set; dependency HOLD_PIN and
Stage-0 risks remain open.
