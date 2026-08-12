// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,immutable-vars-naming,gas-indexed-events,gas-strict-inequalities */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICompoundComet} from "./interfaces/ICompoundComet.sol";
import {ILeopoldYieldAdapter} from "./interfaces/ILeopoldYieldAdapter.sol";

/// @title Isolated direct-Compound III adapter for one Leopold vault
contract LeopoldCompoundAdapter is ILeopoldYieldAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable override vault;
    address public immutable override asset;
    address public immutable guardian;
    ICompoundComet public immutable COMET;
    uint256 public constant COMET_ROUNDING_TOLERANCE = 1;
    uint256 public override deployedPrincipalBasis;
    int104 public expectedCometPrincipal;
    bool public override paused;

    error Unauthorized();
    error InvalidConfiguration();
    error StrategyPaused();
    error CompoundPaused();
    error InsufficientManagedAssets();
    error UnexpectedPositionMutation();

    event AssetsDeployed(uint256 assets, uint256 basisAfter);
    event PrincipalRecovered(uint256 assets, uint256 basisAfter);
    event GenuineSurplusHarvested(uint256 assets);
    event StrategyPauseChanged(bool paused);
    event EmergencyExitCompleted(uint256 recovered, uint256 shortfall);

    modifier onlyVault() {
        if (msg.sender != vault) revert Unauthorized();
        _;
    }

    constructor(address asset_, ICompoundComet comet_, address guardian_) {
        if (asset_ == address(0) || address(comet_) == address(0) || guardian_ == address(0)) {
            revert InvalidConfiguration();
        }
        if (comet_.baseToken() != asset_ || comet_.baseScale() != 1_000_000) revert InvalidConfiguration();
        vault = msg.sender;
        asset = asset_;
        COMET = comet_;
        guardian = guardian_;
    }

    function managedAssets() public view override returns (uint256) {
        return COMET.balanceOf(address(this));
    }

    function currentShortfall() public view override returns (uint256) {
        uint256 managed = managedAssets();
        return deployedPrincipalBasis > managed ? deployedPrincipalBasis - managed : 0;
    }

    function positionIntegrity() public view returns (bool) {
        (int104 principal, , , , ) = COMET.userBasic(address(this));
        return principal == expectedCometPrincipal;
    }

    function marketIntegrity() public view returns (bool) {
        return COMET.baseToken() == asset && COMET.baseScale() == 1_000_000;
    }

    function deployAssets(uint256 amount) external override onlyVault nonReentrant returns (uint256 deployed) {
        if (paused) revert StrategyPaused();
        _requireMarketIntegrity();
        if (COMET.isSupplyPaused()) revert CompoundPaused();
        if (!positionIntegrity()) revert UnexpectedPositionMutation();
        if (currentShortfall() > COMET_ROUNDING_TOLERANCE) revert InsufficientManagedAssets();
        if (amount == 0) return 0;
        IERC20 token = IERC20(asset);
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(vault, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBalance;
        token.forceApprove(address(COMET), received);
        COMET.supply(asset, received);
        token.forceApprove(address(COMET), 0);
        deployedPrincipalBasis += received;
        _snapshotPrincipal();
        emit AssetsDeployed(received, deployedPrincipalBasis);
        return received;
    }

    function withdrawPrincipal(uint256 amount) external override onlyVault nonReentrant returns (uint256 recovered) {
        _requireMarketIntegrity();
        if (COMET.isWithdrawPaused()) revert CompoundPaused();
        if (!positionIntegrity()) revert UnexpectedPositionMutation();
        if (amount > deployedPrincipalBasis || amount > managedAssets()) revert InsufficientManagedAssets();
        recovered = _withdraw(amount);
        deployedPrincipalBasis -= amount;
        _snapshotPrincipal();
        emit PrincipalRecovered(recovered, deployedPrincipalBasis);
    }

    function harvest() external override onlyVault nonReentrant returns (uint256 realizedSurplus) {
        if (paused) revert StrategyPaused();
        _requireMarketIntegrity();
        if (!positionIntegrity()) revert UnexpectedPositionMutation();
        uint256 managed = managedAssets();
        if (managed <= deployedPrincipalBasis) return 0;
        realizedSurplus = _withdraw(managed - deployedPrincipalBasis);
        _snapshotPrincipal();
        emit GenuineSurplusHarvested(realizedSurplus);
    }

    function setPaused(bool paused_) external override {
        if (msg.sender != vault && msg.sender != guardian) revert Unauthorized();
        paused = paused_;
        emit StrategyPauseChanged(paused_);
    }

    function emergencyExit() external override onlyVault nonReentrant returns (uint256 recovered, uint256 shortfall) {
        if (!paused) revert StrategyPaused();
        uint256 basis = deployedPrincipalBasis;
        uint256 managed = managedAssets();
        // Comet balanceOf is rounded. MaxUint is Comet's canonical full-position withdrawal and avoids residue.
        recovered = managed == 0 && expectedCometPrincipal == 0 ? 0 : _withdraw(type(uint256).max);
        shortfall = basis > recovered ? basis - recovered : 0;
        deployedPrincipalBasis = 0;
        _snapshotPrincipal();
        emit EmergencyExitCompleted(recovered, shortfall);
    }

    function _withdraw(uint256 amount) private returns (uint256 recovered) {
        IERC20 token = IERC20(asset);
        uint256 beforeBalance = token.balanceOf(address(this));
        COMET.withdraw(asset, amount);
        recovered = token.balanceOf(address(this)) - beforeBalance;
        token.safeTransfer(vault, recovered);
    }

    function _snapshotPrincipal() private {
        (expectedCometPrincipal, , , , ) = COMET.userBasic(address(this));
    }

    function _requireMarketIntegrity() private view {
        if (!marketIntegrity()) revert InvalidConfiguration();
    }
}
