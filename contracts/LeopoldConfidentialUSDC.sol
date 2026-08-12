// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,max-line-length */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";

/// @title Leopold Confidential USDC
/// @notice Minimal, non-upgradeable ERC-7984 wrapper for canonical Circle Sepolia USDC.
contract LeopoldConfidentialUSDC is ZamaEthereumConfig, ERC7984ERC20Wrapper {
    address public constant CIRCLE_SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    constructor() ERC7984("Leopold Confidential USDC", "lcUSDC", "") ERC7984ERC20Wrapper(IERC20(CIRCLE_SEPOLIA_USDC)) {
        if (decimals() != 6 || rate() != 1) revert ERC7984TotalSupplyOverflow();
    }
}
