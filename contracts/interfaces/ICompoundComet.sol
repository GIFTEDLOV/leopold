// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec */

interface ICompoundComet {
    function baseToken() external view returns (address);
    function baseScale() external view returns (uint64);
    function balanceOf(address account) external view returns (uint256);
    function borrowBalanceOf(address account) external view returns (uint256);
    function userBasic(
        address account
    )
        external
        view
        returns (
            int104 principal,
            uint64 baseTrackingIndex,
            uint64 baseTrackingAccrued,
            uint16 assetsIn,
            uint8 reserved
        );
    function isSupplyPaused() external view returns (bool);
    function isWithdrawPaused() external view returns (bool);
    function supply(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;
}
