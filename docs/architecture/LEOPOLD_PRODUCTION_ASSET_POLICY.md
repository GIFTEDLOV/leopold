# Leopold Production Asset and Zama Policy Record

## Documented facts

- Zama Season 4 materials do not publish a requirement that application deposits use cUSDT or that every developer
  wrapper be governance-registry verified.
- Pinned OpenZeppelin Confidential Contracts provides `ERC7984ERC20Wrapper` for developer-created ERC-20 wrappers.
- The Zama wrapper registry is governance administered; Leopold cannot self-declare registry status.
- Zama confidential-DeFi materials describe confidential aggregation followed by aggregate public routing, including
  lending as a public route.
- OpenZeppelin Confidential Contracts as a whole is supplied as-is and must not be described as formally audited.

## Leopold design inference

Leopold therefore uses a minimal custom ERC-7984 wrapper for canonical Circle Sepolia USDC and declassifies only
vault-level strategy amounts. This is compatible with the documented aggregation pattern, but is not Zama approval or an
eligibility guarantee. The product accurately calls the asset **Private USDC**; technical documentation calls it
`lcUSDC` and states it is Leopold-deployed, not Zama-issued or registry-official.
