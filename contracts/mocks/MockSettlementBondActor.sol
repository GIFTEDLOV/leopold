// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable avoid-low-level-calls,no-complex-fallback,no-empty-blocks,one-contract-per-file */
/* solhint-disable use-natspec,reason-string,gas-custom-errors */

interface IMockBondEscrow {
    function registerForRound(uint256 roundId) external payable;

    function claimBondRefund(uint256 roundId) external;

    function withdrawSettlementRewards() external;

    function depositAutomationBondCredit() external payable;

    function withdrawAutomationBondCredit(uint256 amount) external;

    function setAutoEntry(bool enabled) external;

    function creditProgress(uint256 roundId, uint8 pass, uint256 participants, address progressor) external;

    function finalizeRound(uint256 roundId, uint8 completedPasses) external;
}

interface IMockBondVault {
    function processSelection(uint256 roundId, uint256 maxParticipants) external;

    function processAllocation(uint256 roundId, uint256 maxParticipants) external;
}

contract MockSettlementBondActor {
    IMockBondEscrow public immutable ESCROW;
    bool public rejectNative;
    bool public attemptReentry;

    constructor(IMockBondEscrow escrow) {
        ESCROW = escrow;
    }

    function configure(bool reject, bool reenter) external {
        rejectNative = reject;
        attemptReentry = reenter;
    }

    function register(uint256 roundId) external payable {
        ESCROW.registerForRound{value: msg.value}(roundId);
    }

    function progressSelection(IMockBondVault vault, uint256 roundId, uint256 count) external {
        vault.processSelection(roundId, count);
    }

    function progressAllocation(IMockBondVault vault, uint256 roundId, uint256 count) external {
        vault.processAllocation(roundId, count);
    }

    function claimRefund(uint256 roundId) external {
        ESCROW.claimBondRefund(roundId);
    }

    function withdrawRewards() external {
        ESCROW.withdrawSettlementRewards();
    }

    function depositAutomationCredit() external payable {
        ESCROW.depositAutomationBondCredit{value: msg.value}();
    }

    function withdrawAutomationCredit(uint256 amount) external {
        ESCROW.withdrawAutomationBondCredit(amount);
    }

    function setAutoEntry(bool enabled) external {
        ESCROW.setAutoEntry(enabled);
    }

    receive() external payable {
        if (rejectNative) revert();
        if (attemptReentry) {
            (bool ignored, ) = address(ESCROW).call(
                abi.encodeWithSelector(IMockBondEscrow.withdrawSettlementRewards.selector)
            );
            ignored;
        }
    }
}
