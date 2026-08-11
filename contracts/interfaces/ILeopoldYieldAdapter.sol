// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec */

import {euint64} from "@fhevm/solidity/lib/FHE.sol";

/// @title Leopold yield-adapter boundary
/// @notice A deliberately narrow boundary for a future reviewed cUSDT-compatible strategy.
/// @dev Implementations must return actual encrypted amounts and preserve caller/adapter ACLs.
interface ILeopoldYieldAdapter {
    function asset() external view returns (address);

    function controlledAssets() external view returns (euint64);

    function liquidAssets() external view returns (euint64);

    function deployAssets(euint64 amount) external returns (euint64 deployed);

    function withdrawAssets(euint64 amount) external returns (euint64 withdrawn);

    function harvest() external returns (euint64 realizedSurplus);

    function pause() external;

    function emergencyExit() external returns (euint64 recovered);
}
