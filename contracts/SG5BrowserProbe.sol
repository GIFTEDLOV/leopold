// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title SG-5 browser FHE capability probe
/// @notice Minimal non-production contract for browser encryption, submission, readback, and user decryption.
/// @dev This contract has no funds, randomness, winner selection, or production protocol behavior.
contract SG5BrowserProbe is ZamaEthereumConfig {
    euint64 private _value;

    /// @notice Stores one caller-supplied encrypted value and authorizes only this caller to decrypt it.
    function submit(externalEuint64 encryptedValue, bytes calldata inputProof) external {
        _value = FHE.fromExternal(encryptedValue, inputProof);
        FHE.allowThis(_value);
        FHE.allow(_value, msg.sender);
    }

    /// @notice Returns the encrypted probe result handle.
    function getValue() external view returns (euint64) {
        return _value;
    }
}
