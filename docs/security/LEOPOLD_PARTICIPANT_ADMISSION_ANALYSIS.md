# Leopold Participant Admission Analysis

## Decision: remove the permanent registry cap

The CP1 foundation's 10,000-address cap created a permanent Sybil denial: an attacker could fill all entries and exclude
every later user. It has been removed.

The append-only array uses `uint256` indexes. Round close snapshots its length in O(1), TWAB remains observation-based,
and no transaction traverses the complete array. Selection and allocation are permissionless and use HCU-derived bounded
cursors. Registry growth therefore increases total settlement transactions but cannot make any one call unbounded or
deny later registration.

## Why no admission condition was added

A plaintext minimum deposit would disclose a value condition. An encrypted minimum cannot conditionally append to a
public Solidity array without exposing the predicate. KYC, administrator allowlists, and centralized admission are
prohibited. A new ETH bond/fee would be an unapproved economic policy and could still be Sybil-filled by a funded actor.

Registration consumes public transaction gas, which is friction but is not represented as full Sybil prevention.
Permissionless progress and removal of permanent exclusion are the production foundation. Linear total-work griefing
from many registered addresses remains an explicit residual for incentive/keeper economics, not a hidden hard cap.
