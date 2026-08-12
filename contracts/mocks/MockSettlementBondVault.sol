// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,reason-string,gas-custom-errors */

interface IMockSettlementBondEscrow {
    function creditProgress(uint256 roundId, uint8 pass, uint256 participants, address progressor) external;

    function finalizeRound(uint256 roundId, uint8 completedPasses) external;
}

contract MockSettlementBondVault {
    IMockSettlementBondEscrow public escrow;

    function setEscrow(address escrowAddress) external {
        require(address(escrow) == address(0), "already set");
        escrow = IMockSettlementBondEscrow(escrowAddress);
    }

    function acceptBondRegistration(uint256, address) external view {
        require(msg.sender == address(escrow), "escrow only");
    }

    function credit(uint256 roundId, uint8 pass, uint256 participants, address progressor) external {
        escrow.creditProgress(roundId, pass, participants, progressor);
    }

    function finalize(uint256 roundId, uint8 completedPasses) external {
        escrow.finalizeRound(roundId, completedPasses);
    }
}
