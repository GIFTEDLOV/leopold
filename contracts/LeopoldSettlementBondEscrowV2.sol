// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,named-parameters-mapping,gas-indexed-events,gas-strict-inequalities,max-states-count */

import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface ILeopoldBondedRoundVaultV2 {
    function activeRoundId() external view returns (uint256);

    function acceptBondRegistration(uint256 roundId, address account) external;
}

/// @title V2 isolated settlement-bond escrow with prepaid automatic-entry credit
/// @notice Bonds reimburse permissionless private-settlement work and never enter vault asset accounting.
contract LeopoldSettlementBondEscrowV2 is ReentrancyGuardTransient {
    struct AutoEntryPreference {
        bool enabledBeforeEffectiveRound;
        bool enabledAtAndAfterEffectiveRound;
        uint256 effectiveRound;
    }

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
    mapping(address account => uint256) public automationBondCredit;
    mapping(address account => AutoEntryPreference) public autoEntryPreference;

    address[] private _autoEntryAccounts;
    mapping(address account => uint256) private _autoEntryAccountIndexPlusOne;

    uint256 public totalDeposited;
    uint256 public totalNativeFunded;
    uint256 public totalAutomationCredit;
    uint256 public totalUnresolvedLiability;
    uint256 public totalRewardLiability;
    uint256 public totalRefundLiability;
    uint256 public totalAutomationCreditWithdrawn;
    uint256 public totalRewardsWithdrawn;
    uint256 public totalRefundsWithdrawn;

    error UnauthorizedVault();
    error InvalidConfiguration();
    error InvalidBondAmount();
    error InvalidCreditAmount();
    error AlreadyRegistered();
    error AutoEntryNotEnabled();
    error InsufficientAutomationBondCredit();
    error AutoEntryAccountStillActive();
    error AutoEntryAccountNotEnumerable();
    error InvalidProgress();
    error InvalidRoundFinalization();
    error RefundUnavailable();
    error NothingToWithdraw();
    error NativeTransferFailed();
    error DirectNativeTransferRejected();

    event RoundBondPosted(uint256 indexed roundId, address indexed account, uint256 amount);
    event AutomationBondCreditDeposited(address indexed account, uint256 amount, uint256 availableCredit);
    event AutomationBondCreditWithdrawn(address indexed account, uint256 amount, uint256 availableCredit);
    event AutoEntryPreferenceScheduled(address indexed account, bool enabled, uint256 indexed effectiveRound);
    event DelegatedRoundRegistration(uint256 indexed roundId, address indexed account, address indexed caller);
    event AutoEntryAccountPruned(address indexed account, address indexed caller);
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
        totalNativeFunded += msg.value;
        _registerForRound(roundId, msg.sender);
    }

    /// @notice Funds future delegated registrations without exposing or moving confidential principal.
    function depositAutomationBondCredit() external payable nonReentrant {
        if (msg.value == 0) revert InvalidCreditAmount();
        automationBondCredit[msg.sender] += msg.value;
        totalAutomationCredit += msg.value;
        totalNativeFunded += msg.value;
        _syncAutoEntryAccount(msg.sender, ILeopoldBondedRoundVaultV2(VAULT).activeRoundId());
        emit AutomationBondCreditDeposited(msg.sender, msg.value, automationBondCredit[msg.sender]);
    }

    /// @notice Withdraws only unreserved credit to its owning wallet.
    function withdrawAutomationBondCredit(uint256 amount) external nonReentrant {
        uint256 available = automationBondCredit[msg.sender];
        if (amount == 0 || amount > available) revert InvalidCreditAmount();
        unchecked {
            automationBondCredit[msg.sender] = available - amount;
            totalAutomationCredit -= amount;
        }
        totalAutomationCreditWithdrawn += amount;
        _syncAutoEntryAccount(msg.sender, ILeopoldBondedRoundVaultV2(VAULT).activeRoundId());
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert NativeTransferFailed();
        emit AutomationBondCreditWithdrawn(msg.sender, amount, available - amount);
    }

    /// @notice Schedules auto-entry to change only at the next round boundary.
    function setAutoEntry(bool enabled) external {
        uint256 activeRound = ILeopoldBondedRoundVaultV2(VAULT).activeRoundId();
        AutoEntryPreference storage preference = autoEntryPreference[msg.sender];
        preference.enabledBeforeEffectiveRound = _isAutoEntryEnabled(preference, activeRound);
        preference.enabledAtAndAfterEffectiveRound = enabled;
        preference.effectiveRound = activeRound + 1;

        _syncAutoEntryAccount(msg.sender, activeRound);
        emit AutoEntryPreferenceScheduled(msg.sender, enabled, activeRound + 1);
    }

    /// @notice Registers an opted-in wallet while preserving that wallet as the participant and refund owner.
    function registerForRoundFor(address account, uint256 roundId) external nonReentrant {
        if (!isAutoEntryEnabled(account, roundId)) revert AutoEntryNotEnabled();
        uint256 available = automationBondCredit[account];
        if (available < BOND_AMOUNT) revert InsufficientAutomationBondCredit();
        unchecked {
            automationBondCredit[account] = available - BOND_AMOUNT;
            totalAutomationCredit -= BOND_AMOUNT;
        }
        _syncAutoEntryAccount(account, roundId);
        _registerForRound(roundId, account);
        emit DelegatedRoundRegistration(roundId, account, msg.sender);
    }

    function isAutoEntryEnabled(address account, uint256 roundId) public view returns (bool) {
        return _isAutoEntryEnabled(autoEntryPreference[account], roundId);
    }

    function autoEntryAccountCount() external view returns (uint256) {
        return _autoEntryAccounts.length;
    }

    function autoEntryAccountAt(uint256 index) external view returns (address) {
        return _autoEntryAccounts[index];
    }

    /// @notice Removes a no-longer-funded or no-longer-enabled account from keeper discovery in O(1).
    function pruneAutoEntryAccount(address account) external {
        uint256 indexPlusOne = _autoEntryAccountIndexPlusOne[account];
        if (indexPlusOne == 0) revert AutoEntryAccountNotEnumerable();
        uint256 activeRound = ILeopoldBondedRoundVaultV2(VAULT).activeRoundId();
        if (_shouldDiscoverAutoEntry(account, activeRound)) revert AutoEntryAccountStillActive();
        _removeAutoEntryAccount(account, indexPlusOne);
        emit AutoEntryAccountPruned(account, msg.sender);
    }

    function _isAutoEntryEnabled(AutoEntryPreference storage preference, uint256 roundId) private view returns (bool) {
        if (preference.effectiveRound == 0 || roundId < preference.effectiveRound) {
            return preference.enabledBeforeEffectiveRound;
        }
        return preference.enabledAtAndAfterEffectiveRound;
    }

    function _shouldDiscoverAutoEntry(address account, uint256 activeRound) private view returns (bool) {
        if (automationBondCredit[account] < BOND_AMOUNT) return false;
        AutoEntryPreference storage preference = autoEntryPreference[account];
        return _isAutoEntryEnabled(preference, activeRound) || preference.enabledAtAndAfterEffectiveRound;
    }

    function _syncAutoEntryAccount(address account, uint256 activeRound) private {
        uint256 indexPlusOne = _autoEntryAccountIndexPlusOne[account];
        if (_shouldDiscoverAutoEntry(account, activeRound)) {
            if (indexPlusOne == 0) {
                _autoEntryAccounts.push(account);
                _autoEntryAccountIndexPlusOne[account] = _autoEntryAccounts.length;
            }
            return;
        }
        if (indexPlusOne != 0) _removeAutoEntryAccount(account, indexPlusOne);
    }

    function _removeAutoEntryAccount(address account, uint256 indexPlusOne) private {
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _autoEntryAccounts.length - 1;
        if (index != lastIndex) {
            address moved = _autoEntryAccounts[lastIndex];
            _autoEntryAccounts[index] = moved;
            _autoEntryAccountIndexPlusOne[moved] = indexPlusOne;
        }
        _autoEntryAccounts.pop();
        delete _autoEntryAccountIndexPlusOne[account];
    }

    function _registerForRound(uint256 roundId, address account) private {
        if (account == address(0)) revert AutoEntryNotEnabled();
        if (isRegistered[roundId][account]) revert AlreadyRegistered();

        isRegistered[roundId][account] = true;
        RoundLedger storage round = _rounds[roundId];
        ++round.registered;
        round.deposited += BOND_AMOUNT;
        totalDeposited += BOND_AMOUNT;
        totalUnresolvedLiability += BOND_AMOUNT;

        ILeopoldBondedRoundVaultV2(VAULT).acceptBondRegistration(roundId, account);
        emit RoundBondPosted(roundId, account, BOND_AMOUNT);
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
        return totalAutomationCredit + totalUnresolvedLiability + totalRewardLiability + totalRefundLiability;
    }

    function accountingInvariantHolds() external view returns (bool) {
        uint256 roundLiability = totalUnresolvedLiability + totalRewardLiability + totalRefundLiability;
        return
            totalDeposited == roundLiability + totalRewardsWithdrawn + totalRefundsWithdrawn &&
            totalNativeFunded ==
                totalAutomationCredit +
                    roundLiability +
                    totalAutomationCreditWithdrawn +
                    totalRewardsWithdrawn +
                    totalRefundsWithdrawn;
    }

    receive() external payable {
        revert DirectNativeTransferRejected();
    }

    fallback() external payable {
        revert DirectNativeTransferRejected();
    }
}
