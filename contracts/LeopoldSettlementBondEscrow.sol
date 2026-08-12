// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,named-parameters-mapping,gas-indexed-events,gas-strict-inequalities */

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface ILeopoldBondedRoundVault {
    function acceptBondRegistration(uint256 roundId, address account) external;
}

/// @title Isolated native-asset settlement bond escrow for one Leopold vault
/// @notice Bonds reimburse permissionless private-settlement work and never enter vault asset accounting.
contract LeopoldSettlementBondEscrow is ReentrancyGuardTransient {
    struct RoundLedger {
        uint256 registered;
        uint256 selectionProcessed;
        uint256 allocationProcessed;
        uint256 deposited;
        uint256 rewardsAccrued;
        uint256 refundsAccrued;
        uint256 refundPerParticipant;
        bool finalized;
    }

    address public immutable VAULT;
    uint256 public immutable BOND_AMOUNT;
    uint256 public immutable REWARD_PER_PARTICIPANT_PASS;
    uint256 public immutable REFUND_PER_COMPLETED_PARTICIPANT;

    mapping(uint256 roundId => RoundLedger) private _rounds;
    mapping(uint256 roundId => mapping(address account => bool)) public isRegistered;
    mapping(uint256 roundId => mapping(address account => bool)) public refundClaimed;
    mapping(address account => uint256) public settlementRewardCredit;

    uint256 public totalDeposited;
    uint256 public totalUnresolvedLiability;
    uint256 public totalRewardLiability;
    uint256 public totalRefundLiability;
    uint256 public totalRewardsWithdrawn;
    uint256 public totalRefundsWithdrawn;

    error UnauthorizedVault();
    error InvalidConfiguration();
    error InvalidBondAmount();
    error AlreadyRegistered();
    error InvalidProgress();
    error InvalidRoundFinalization();
    error RefundUnavailable();
    error NothingToWithdraw();
    error NativeTransferFailed();
    error DirectNativeTransferRejected();

    event RoundBondPosted(uint256 indexed roundId, address indexed account, uint256 amount);
    event SettlementRewardAccrued(
        uint256 indexed roundId,
        address indexed progressor,
        uint8 indexed pass,
        uint256 participants,
        uint256 amount
    );
    event RoundBondAccountingFinalized(uint256 indexed roundId, uint8 completedPasses, uint256 refundPerParticipant);
    event BondRefundWithdrawn(uint256 indexed roundId, address indexed account, uint256 amount);
    event SettlementRewardsWithdrawn(address indexed account, uint256 amount);

    modifier onlyVault() {
        if (msg.sender != VAULT) revert UnauthorizedVault();
        _;
    }

    constructor(address vault, uint256 bondAmount, uint256 rewardPerParticipantPass) {
        if (
            vault == address(0) ||
            rewardPerParticipantPass == 0 ||
            rewardPerParticipantPass > type(uint256).max / 2 ||
            bondAmount <= rewardPerParticipantPass * 2
        ) revert InvalidConfiguration();
        VAULT = vault;
        BOND_AMOUNT = bondAmount;
        REWARD_PER_PARTICIPANT_PASS = rewardPerParticipantPass;
        REFUND_PER_COMPLETED_PARTICIPANT = bondAmount - rewardPerParticipantPass * 2;
    }

    function registerForRound(uint256 roundId) external payable nonReentrant {
        if (msg.value != BOND_AMOUNT) revert InvalidBondAmount();
        if (isRegistered[roundId][msg.sender]) revert AlreadyRegistered();

        isRegistered[roundId][msg.sender] = true;
        RoundLedger storage round = _rounds[roundId];
        ++round.registered;
        round.deposited += msg.value;
        totalDeposited += msg.value;
        totalUnresolvedLiability += msg.value;

        ILeopoldBondedRoundVault(VAULT).acceptBondRegistration(roundId, msg.sender);
        emit RoundBondPosted(roundId, msg.sender, msg.value);
    }

    function creditProgress(uint256 roundId, uint8 pass, uint256 participants, address progressor) external onlyVault {
        if (participants == 0 || progressor == address(0)) revert InvalidProgress();
        RoundLedger storage round = _rounds[roundId];
        if (round.finalized) revert InvalidProgress();
        if (pass == 1) {
            if (round.selectionProcessed + participants > round.registered) revert InvalidProgress();
            round.selectionProcessed += participants;
        } else if (pass == 2) {
            if (round.allocationProcessed + participants > round.registered) revert InvalidProgress();
            round.allocationProcessed += participants;
        } else {
            revert InvalidProgress();
        }

        uint256 reward = participants * REWARD_PER_PARTICIPANT_PASS;
        round.rewardsAccrued += reward;
        totalUnresolvedLiability -= reward;
        totalRewardLiability += reward;
        settlementRewardCredit[progressor] += reward;
        emit SettlementRewardAccrued(roundId, progressor, pass, participants, reward);
    }

    /// @notice Finalizes after zero passes (empty), one pass (authenticated reconciliation failure), or both passes.
    function finalizeRound(uint256 roundId, uint8 completedPasses) external onlyVault {
        RoundLedger storage round = _rounds[roundId];
        if (round.finalized || completedPasses > 2) revert InvalidRoundFinalization();

        uint256 refundPerParticipant;
        if (completedPasses == 0) {
            if (round.selectionProcessed != 0 || round.allocationProcessed != 0) {
                revert InvalidRoundFinalization();
            }
            refundPerParticipant = BOND_AMOUNT;
        } else if (completedPasses == 1) {
            if (
                round.registered == 0 || round.selectionProcessed != round.registered || round.allocationProcessed != 0
            ) {
                revert InvalidRoundFinalization();
            }
            refundPerParticipant = BOND_AMOUNT - REWARD_PER_PARTICIPANT_PASS;
        } else {
            if (
                round.registered == 0 ||
                round.selectionProcessed != round.registered ||
                round.allocationProcessed != round.registered
            ) revert InvalidRoundFinalization();
            refundPerParticipant = REFUND_PER_COMPLETED_PARTICIPANT;
        }

        uint256 refunds = round.registered * refundPerParticipant;
        if (totalUnresolvedLiability < refunds) revert InvalidRoundFinalization();
        round.refundsAccrued = refunds;
        round.refundPerParticipant = refundPerParticipant;
        round.finalized = true;
        totalUnresolvedLiability -= refunds;
        totalRefundLiability += refunds;
        emit RoundBondAccountingFinalized(roundId, completedPasses, refundPerParticipant);
    }

    function claimBondRefund(uint256 roundId) external nonReentrant {
        RoundLedger storage round = _rounds[roundId];
        if (!round.finalized || !isRegistered[roundId][msg.sender] || refundClaimed[roundId][msg.sender]) {
            revert RefundUnavailable();
        }
        refundClaimed[roundId][msg.sender] = true;
        uint256 amount = round.refundPerParticipant;
        totalRefundLiability -= amount;
        totalRefundsWithdrawn += amount;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert NativeTransferFailed();
        emit BondRefundWithdrawn(roundId, msg.sender, amount);
    }

    function withdrawSettlementRewards() external nonReentrant {
        uint256 amount = settlementRewardCredit[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        settlementRewardCredit[msg.sender] = 0;
        totalRewardLiability -= amount;
        totalRewardsWithdrawn += amount;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert NativeTransferFailed();
        emit SettlementRewardsWithdrawn(msg.sender, amount);
    }

    function roundInfo(
        uint256 roundId
    ) external view returns (uint256, uint256, uint256, uint256, uint256, uint256, uint256, bool) {
        RoundLedger storage round = _rounds[roundId];
        return (
            round.registered,
            round.selectionProcessed,
            round.allocationProcessed,
            round.deposited,
            round.rewardsAccrued,
            round.refundsAccrued,
            round.refundPerParticipant,
            round.finalized
        );
    }

    function accountedLiability() external view returns (uint256) {
        return totalUnresolvedLiability + totalRewardLiability + totalRefundLiability;
    }

    receive() external payable {
        revert DirectNativeTransferRejected();
    }

    fallback() external payable {
        revert DirectNativeTransferRejected();
    }
}
