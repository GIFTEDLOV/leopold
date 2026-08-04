# CP0 Template Probe

`FHECounter` and its associated deployment task and tests are retained temporarily from the official Zama Hardhat
template.

Their sole purpose is to provide the SG-1 live Sepolia evidence:

1. deploy an FHE-enabled contract;
2. submit an encrypted write;
3. perform a user decryption;
4. retain addresses, transaction hashes, commands, and raw output.

They are not production protocol components and must be removed or moved outside the production contract surface after
the live-stack probe is captured.
