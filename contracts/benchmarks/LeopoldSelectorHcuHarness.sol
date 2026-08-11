// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,max-states-count */

import {FHE, ebool, euint64, euint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @notice Stateless-value benchmark shapes for CP1 selection/settlement. Holds no user funds.
contract LeopoldSelectorHcuHarness is ZamaEthereumConfig {
    address public immutable OPERATOR;
    uint64 public runSequence;

    euint64 private _balance;
    euint64 private _prize;
    euint64 private _winnings;
    euint64 private _principal;
    euint64 private _liability;
    euint64 private _reserved;
    euint64 private _liquidPrize;
    euint64 private _liquidPrincipal;
    euint64 private _totalPrincipal;
    euint64 private _globalBalance;
    euint64 private _winnerCount;
    euint128 private _cumulative;
    euint128 private _ticket;
    euint128 private _prefix;
    euint128 private _candidate;
    ebool private _winner;
    ebool private _publicBoolean;
    euint128 private _publicAggregate;
    bool public aggregateVerified;
    bool public booleanVerified;

    error OnlyOperator();
    error InvalidRunSequence();
    error InvalidProofState();
    error InvalidCleartextEncoding();

    event BenchmarkCompleted(bytes32 indexed circuit, uint64 indexed runSequence);

    modifier onlyOperator() {
        if (msg.sender != OPERATOR) revert OnlyOperator();
        _;
    }

    constructor() {
        OPERATOR = msg.sender;
        _balance = FHE.asEuint64(1_000_000);
        _prize = FHE.asEuint64(100_000);
        _winnings = FHE.asEuint64(1);
        _principal = FHE.asEuint64(1_000_000);
        _liability = FHE.asEuint64(100_000);
        _reserved = FHE.asEuint64(100_000);
        _liquidPrize = FHE.asEuint64(100_000);
        _liquidPrincipal = FHE.asEuint64(1_000_000);
        _totalPrincipal = FHE.asEuint64(1_000_000);
        _globalBalance = FHE.asEuint64(1_000_000);
        _winnerCount = FHE.asEuint64(0);
        _cumulative = FHE.asEuint128(1_000_000);
        _ticket = FHE.asEuint128(50_000);
        _prefix = FHE.asEuint128(0);
        _candidate = FHE.asEuint128(123_456);
        _winner = FHE.asEbool(true);
        _persist();
    }

    function userTwabQuery(uint64 sequence) external onlyOperator {
        _begin(sequence);
        euint128 widened = FHE.asEuint128(_balance);
        euint128 start = FHE.add(_cumulative, FHE.mul(widened, uint128(11)));
        euint128 end = FHE.add(_cumulative, FHE.mul(widened, uint128(86_400)));
        _prefix = FHE.sub(end, start);
        _finish("USER_TWAB_QUERY", sequence);
    }

    function globalCloseAccrual(uint64 sequence) external onlyOperator {
        _begin(sequence);
        euint128 widened = FHE.asEuint128(_globalBalance);
        euint128 closed = FHE.add(_cumulative, FHE.mul(widened, uint128(86_400)));
        _prefix = FHE.sub(closed, _cumulative);
        _finish("GLOBAL_CLOSE_ACCRUAL", sequence);
    }

    function candidateGeneration(uint64 sequence) external onlyOperator {
        _begin(sequence);
        _candidate = FHE.randEuint128();
        _finish("CANDIDATE_GENERATION", sequence);
    }

    function candidateValidity(uint64 sequence) external onlyOperator {
        _begin(sequence);
        _publicBoolean = FHE.lt(_candidate, uint128(type(uint128).max - 16));
        _finish("CANDIDATE_VALIDITY", sequence);
    }

    function acceptedTicketModulo(uint64 sequence) external onlyOperator {
        _begin(sequence);
        _ticket = FHE.rem(_candidate, uint128(31_536_000_000_000_000_000_000));
        _finish("ACCEPTED_TICKET_MODULO", sequence);
    }

    function participantSelectionStep(uint64 sequence) external onlyOperator {
        _begin(sequence);
        _participantSelectionStep();
        _finish("PARTICIPANT_SELECTION_STEP", sequence);
    }

    function participantSelectionChunk4(uint64 sequence) external onlyOperator {
        _begin(sequence);
        for (uint256 index = 0; index < 4; ++index) _participantSelectionStep();
        _finish("PARTICIPANT_SELECTION_CHUNK_4", sequence);
    }

    function _participantSelectionStep() private {
        euint128 widened = FHE.asEuint128(_balance);
        euint128 startObservation = FHE.add(_cumulative, FHE.mul(widened, uint128(11)));
        euint128 endObservation = FHE.add(_cumulative, FHE.mul(widened, uint128(86_400)));
        euint128 weight = FHE.sub(endObservation, startObservation);
        euint128 intervalEnd = FHE.add(_prefix, weight);
        ebool afterStart = FHE.ge(_ticket, _prefix);
        ebool beforeEnd = FHE.lt(_ticket, intervalEnd);
        ebool positive = FHE.gt(weight, uint128(0));
        _winner = FHE.and(FHE.and(afterStart, beforeEnd), positive);
        _winnerCount = FHE.add(_winnerCount, FHE.asEuint64(_winner));
        _prefix = intervalEnd;
    }

    function winningsAllocationStep(uint64 sequence) external onlyOperator {
        _begin(sequence);
        euint64 allocated = FHE.select(_winner, _prize, FHE.asEuint64(0));
        _winnings = FHE.add(_winnings, allocated);
        _liability = FHE.add(_liability, allocated);
        _reserved = FHE.sub(_reserved, allocated);
        _finish("WINNINGS_ALLOCATION_STEP", sequence);
    }

    function autoSaveAllocationStep(uint64 sequence) external onlyOperator {
        _begin(sequence);
        _autoSaveAllocationStep();
        _finish("AUTO_SAVE_ALLOCATION_STEP", sequence);
    }

    function autoSaveAllocationChunk4(uint64 sequence) external onlyOperator {
        _begin(sequence);
        for (uint256 index = 0; index < 4; ++index) _autoSaveAllocationStep();
        _finish("AUTO_SAVE_ALLOCATION_CHUNK_4", sequence);
    }

    function _autoSaveAllocationStep() private {
        euint64 zero = FHE.asEuint64(0);
        euint64 prize = FHE.select(_winner, _prize, zero);
        ebool fits = FHE.le(FHE.add(_totalPrincipal, prize), uint64(1_000_000_000_000_000));
        ebool autoSaveWinner = FHE.and(FHE.and(_winner, FHE.asEbool(true)), fits);
        euint64 autoSaved = FHE.select(autoSaveWinner, _prize, zero);
        euint64 kept = FHE.sub(prize, autoSaved);
        euint64 newPrincipal = FHE.add(_principal, autoSaved);
        _cumulative = FHE.add(_cumulative, FHE.mul(FHE.asEuint128(_principal), uint128(1)));
        _principal = newPrincipal;
        _winnings = FHE.add(_winnings, kept);
        _totalPrincipal = FHE.add(_totalPrincipal, autoSaved);
        _liquidPrincipal = FHE.add(_liquidPrincipal, autoSaved);
        _globalBalance = FHE.add(_globalBalance, autoSaved);
        _liability = FHE.add(_liability, kept);
        _liquidPrize = FHE.sub(_liquidPrize, autoSaved);
        _reserved = FHE.sub(_reserved, prize);
    }

    function authorizeAggregatePublicDecryption(uint64 sequence) external onlyOperator returns (euint128) {
        _begin(sequence);
        _publicAggregate = FHE.add(_cumulative, uint128(7));
        FHE.allowThis(_publicAggregate);
        FHE.makePubliclyDecryptable(_publicAggregate);
        _finish("PUBLIC_AGGREGATE_AUTHORIZE", sequence);
        return _publicAggregate;
    }

    function authorizeBooleanPublicDecryption(uint64 sequence) external onlyOperator returns (ebool) {
        _begin(sequence);
        _publicBoolean = FHE.eq(_winnerCount, _winnerCount);
        FHE.allowThis(_publicBoolean);
        FHE.makePubliclyDecryptable(_publicBoolean);
        _finish("PUBLIC_BOOLEAN_AUTHORIZE", sequence);
        return _publicBoolean;
    }

    function aggregateHandle() external view returns (euint128) {
        return _publicAggregate;
    }

    function booleanHandle() external view returns (ebool) {
        return _publicBoolean;
    }

    function verifyAggregate(bytes calldata values, bytes calldata proof) external {
        if (aggregateVerified || values.length != 32) revert InvalidProofState();
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_publicAggregate);
        FHE.checkSignatures(handles, values, proof);
        aggregateVerified = true;
    }

    function verifyBoolean(bytes calldata values, bytes calldata proof) external {
        if (booleanVerified || values.length != 32) revert InvalidProofState();
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_publicBoolean);
        FHE.checkSignatures(handles, values, proof);
        booleanVerified = true;
    }

    function _begin(uint64 sequence) private view {
        if (sequence != runSequence + 1) revert InvalidRunSequence();
    }

    function _finish(bytes32 circuit, uint64 sequence) private {
        runSequence = sequence;
        _persist();
        emit BenchmarkCompleted(circuit, sequence);
    }

    function _persist() private {
        FHE.allowThis(_balance);
        FHE.allowThis(_prize);
        FHE.allowThis(_winnings);
        FHE.allowThis(_principal);
        FHE.allowThis(_liability);
        FHE.allowThis(_reserved);
        FHE.allowThis(_liquidPrize);
        FHE.allowThis(_liquidPrincipal);
        FHE.allowThis(_totalPrincipal);
        FHE.allowThis(_globalBalance);
        FHE.allowThis(_winnerCount);
        FHE.allowThis(_cumulative);
        FHE.allowThis(_ticket);
        FHE.allowThis(_prefix);
        FHE.allowThis(_candidate);
        FHE.allowThis(_winner);
        FHE.allowThis(_publicBoolean);
        FHE.allowThis(_publicAggregate);
    }
}
