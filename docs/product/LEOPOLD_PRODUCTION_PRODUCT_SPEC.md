# Leopold Production Product Specification

## Product lock

- Brand: **Leopold**.
- Category: **Private Prize Savings**.
- Proposition: **Save privately. Win privately. Withdraw anytime.**
- Technical description: **Confidential Prize-Savings Protocol**.
- Primary design target: desktop. Responsive/mobile adaptation follows a correct desktop product.
- Eventual desktop navigation: Dashboard, Vaults, Prizes, Activity, Rewards, Profile.
- Primary CTA: `Add Money`.

No production UI or authentication provider is part of this foundation slice.

## Official launch vaults

| ID  | Vault   | Exact protocol duration | Product behavior                                            |
| --- | ------- | ----------------------: | ----------------------------------------------------------- |
| 1   | Daily   |          86,400 seconds | frequent, generally smaller accumulation window             |
| 2   | Weekly  |         604,800 seconds | longer accumulation window                                  |
| 3   | Monthly |       2,592,000 seconds | deterministic 30 days, never a calendar month               |
| 4   | Boost   |         604,800 seconds | sponsor-forward campaign presentation plus base yield prize |

Prize size is never fixed or guaranteed. Every vault has one prize lifecycle and one private winner per non-empty round.
The same wallet may hold independent confidential positions in any subset of the four vaults. A move is a source
withdrawal followed by a destination deposit at its actual credit timestamp; historical eligibility never moves.

## Account and identity boundary

The future unified Leopold account requires a verified email, unique username, and wallet; it targets email, wallet, and
X login linked to one account. The wallet remains onchain financial authority. Email addresses, usernames, OTPs, X IDs,
sessions, and application identity links never enter these contracts.

## Launch differentiators and future compatibility

Sponsored Prize Boosts and Auto-Save Winnings are launch locks. This foundation implements sponsor commitment accounting
and privacy-preserving branchless settlement. Gift Your Chance, advanced TWAB rewards, recurring savings, and referrals
are future-compatible but not CP1-foundation critical.
