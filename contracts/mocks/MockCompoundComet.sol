// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,immutable-vars-naming,const-name-snakecase,named-parameters-mapping */
/* solhint-disable gas-custom-errors,gas-strict-inequalities */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICompoundComet} from "../interfaces/ICompoundComet.sol";

contract MockCompoundComet is ICompoundComet {
    using SafeERC20 for IERC20;

    address public override baseToken;
    uint64 public override baseScale = 1_000_000;
    bool public override isSupplyPaused;
    bool public override isWithdrawPaused;
    mapping(address => uint256) private _balance;
    mapping(address => int104) private _principal;

    constructor(address asset_) {
        baseToken = asset_;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balance[account];
    }

    function borrowBalanceOf(address) external pure override returns (uint256) {
        return 0;
    }

    function userBasic(address account) external view override returns (int104, uint64, uint64, uint16, uint8) {
        return (_principal[account], 0, 0, 0, 0);
    }

    function supply(address asset, uint256 amount) external override {
        require(!isSupplyPaused && asset == baseToken, "supply disabled");
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        _balance[msg.sender] += amount;
        _principal[msg.sender] += int104(int256(amount));
    }

    function withdraw(address asset, uint256 amount) external override {
        if (amount == type(uint256).max) amount = _balance[msg.sender];
        require(!isWithdrawPaused && asset == baseToken && amount <= _balance[msg.sender], "withdraw disabled");
        _balance[msg.sender] -= amount;
        _principal[msg.sender] -= int104(int256(amount));
        IERC20(asset).safeTransfer(msg.sender, amount);
    }

    function addYield(address account, uint256 amount) external {
        IERC20(baseToken).safeTransferFrom(msg.sender, address(this), amount);
        _balance[account] += amount;
    }

    function imposeLoss(address account, uint256 amount) external {
        require(amount <= _balance[account], "excess loss");
        _balance[account] -= amount;
    }

    function donatePosition(address account, uint256 amount) external {
        IERC20(baseToken).safeTransferFrom(msg.sender, address(this), amount);
        _balance[account] += amount;
        _principal[account] += int104(int256(amount));
    }

    function setPaused(bool supplyPaused, bool withdrawPaused) external {
        isSupplyPaused = supplyPaused;
        isWithdrawPaused = withdrawPaused;
    }

    function setMarketConfiguration(address baseToken_, uint64 baseScale_) external {
        baseToken = baseToken_;
        baseScale = baseScale_;
    }
}
