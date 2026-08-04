# Keeper Credential and Funding Policy

## Authority model

The keeper is an untrusted, permissionless automation client.

It must not receive:

- user custody;
- protocol ownership or administration;
- emergency-control authority;
- winner-selection authority;
- randomness control;
- private-decryption authority.

## Dedicated credential

The keeper must use `KEEPER_PRIVATE_KEY`.

The keeper address must differ from:

1. the deployment address;
2. every protocol owner or administrator;
3. every emergency-control address;
4. every treasury or custody address.

The current runtime validates separation from `DEPLOYER_ADDRESS`. Additional privileged addresses must be added to the
forbidden-address validation before those roles are deployed.

## Funding ceiling

The keeper wallet funding ceiling is:

```text
100000000000000000 wei
0.1 Sepolia ETH
```

Before entering its transaction loop, the keeper must read its live balance and enforce this ceiling.

Failure to read the balance, or a balance above the ceiling, must stop transaction submission.

## Fail-closed rules

Startup must fail when:

- `KEEPER_PRIVATE_KEY` is absent or malformed;
- `SEPOLIA_RPC_URL` is absent or invalid;
- `DEPLOYER_ADDRESS` is absent or invalid;
- the keeper and deployer addresses match;
- `KEEPER_MAX_BALANCE_WEI` is absent or non-positive;
- the live keeper balance exceeds the configured ceiling.

## Secret handling

- Never commit a populated keeper environment file.
- Never print or log the keeper private key.
- Never reuse the deployment private key.
- Keep only the minimum operational Sepolia ETH in the keeper wallet.
- Store production credentials in encrypted secret storage.
- Rotate the key after any suspected display, log, commit, or host compromise.
