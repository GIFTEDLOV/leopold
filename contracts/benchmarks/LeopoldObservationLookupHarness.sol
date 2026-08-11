// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,gas-strict-inequalities */

import {FHE, euint64, euint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @notice Local gas/HCU benchmark for the public-index portion of cumulative-observation lookup.
contract LeopoldObservationLookupHarness is ZamaEthereumConfig {
    error InvalidObservationCount();

    uint64[] private _timestamps;
    euint64 private _balance;
    euint128 private _cumulative;
    euint128 private _result;

    constructor(uint256 count) {
        if (count == 0 || count > 512) revert InvalidObservationCount();
        for (uint256 index = 0; index < count; ++index) _timestamps.push(uint64(index * 10 + 1));
        _balance = FHE.asEuint64(1_000);
        _cumulative = FHE.asEuint128(2_000);
        FHE.allowThis(_balance);
        FHE.allowThis(_cumulative);
    }

    function lookup(uint64 timestamp) external {
        uint256 low = 0;
        uint256 high = _timestamps.length;
        while (low + 1 < high) {
            uint256 middle = low + (high - low) / 2;
            if (_timestamps[middle] <= timestamp) low = middle;
            else high = middle;
        }
        uint64 elapsed = timestamp - _timestamps[low];
        _result = FHE.add(_cumulative, FHE.mul(FHE.asEuint128(_balance), uint128(elapsed)));
        FHE.allowThis(_result);
    }
}
