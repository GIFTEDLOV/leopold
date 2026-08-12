// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec */

/// @title Leopold aggregate yield-adapter boundary
/// @notice Public aggregate amounts only; no adapter receives per-user state or FHE ACLs.
interface ILeopoldYieldAdapter {
    function asset() external view returns (address);
    function vault() external view returns (address);
    function managedAssets() external view returns (uint256);
    function deployedPrincipalBasis() external view returns (uint256);
    function currentShortfall() external view returns (uint256);
    function paused() external view returns (bool);
    function deployAssets(uint256 amount) external returns (uint256 deployed);
    function withdrawPrincipal(uint256 amount) external returns (uint256 recovered);
    function harvest() external returns (uint256 realizedSurplus);
    function setPaused(bool paused_) external;
    function emergencyExit() external returns (uint256 recovered, uint256 shortfall);
}
