// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

/* solhint-disable use-natspec,max-states-count,gas-increment-by-one */

import {FHE, ebool, euint64, euint128, euint256} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Temporary CP0/SG-4 FHE benchmark harness
/// @notice Executes preregistered circuits without holding funds or exposing encrypted values.
/// @dev Setup calls are excluded preparation records; measured calls accept no encrypted input.
contract SG4FheBenchmarkHarness is ZamaEthereumConfig {
    uint64 public constant BALANCE_MAX_BASE_UNITS = 1_000_000_000_000_000;
    uint128 public constant ELAPSED_MAX_SECONDS = 31_536_000;
    uint128 public constant TWAB_MAX = 31_536_000_000_000_000_000_000;
    uint128 public constant T_MAX = TWAB_MAX;
    uint128 public constant T_DIVIDES_DOMAIN = 18_889_465_931_478_580_854_784;
    uint128 public constant REJECTION_LIMIT_MAX = 340_282_366_920_938_457_504_000_000_000_000_000_000;
    uint128 public constant T_POWER_MINUS_ONE = 18_889_465_931_478_580_854_783;
    uint128 public constant REJECTION_LIMIT_POWER_MINUS_ONE = 340_282_366_920_938_463_463_356_593_033_258_729_472;
    uint128 public constant T_POWER_PLUS_ONE = 18_889_465_931_478_580_854_785;
    uint128 public constant REJECTION_LIMIT_POWER_PLUS_ONE = 340_282_366_920_938_444_573_926_690_351_696_838_655;
    uint128 public constant CHUNK_WEIGHT = 492_750_000_000_000_000_000;
    uint64 public constant MAX_REGISTERED_CURSOR = 64;
    uint16 public constant CONTINUATION_SEMANTIC_SEQUENCE_SETUP = 9008;

    uint8 public constant FIRST_MATCH = 1;
    uint8 public constant MIDDLE_MATCH = 2;
    uint8 public constant LAST_MATCH = 3;
    uint8 public constant NO_MATCH_BEFORE_CHUNK_BOUNDARY = 4;
    uint8 public constant ALREADY_FOUND_BEFORE_CHUNK = 5;
    uint8 public constant CONTINUATION_MATCH_IN_LATER_CHUNK = 6;
    uint8 public constant WINNER_TRUE = 7;
    uint8 public constant WINNER_FALSE = 8;

    address public immutable OPERATOR;
    uint64 public nextRunSequence;

    euint64 private _balanceMax;
    euint64 private _zero64;
    euint128 private _balanceMax128;
    euint128 private _twabMax;
    euint128 private _twabNearMax;
    euint128 private _one128;
    euint128 private _zero128;
    euint128 private _candidateGeneral;
    euint128 private _chunkWeight;
    euint256 private _last256;
    ebool private _true;
    ebool private _false;

    euint64 private _result64;
    euint128 private _result128;
    ebool private _resultBool;
    euint128 private _publicAggregate;
    ebool private _publicValidity;

    // General rejection output is deliberately not an accepted ticket.
    euint128 private _candidateRemainder;
    ebool private _candidateValidity;
    bool public generalCandidatePending;

    // Production-intended resumable winner state.
    euint128 private _acceptedTicket;
    euint128 private _winnerPrefix;
    ebool private _winnerFound;
    euint128 private _winnerIndex;
    uint64 public winnerCursor;
    uint8 public winnerVectorId;
    uint8 public winnerRegisteredChunkSize;
    uint8 public winnerRegisteredCircuitCode;
    uint16 public winnerSetupId;
    bool public winnerInitialized;
    bool public acceptedTicketReady;

    ebool private _prizePredicate;
    uint8 public prizeVectorId;
    bool public prizeVectorInitialized;

    error OnlyOperator();
    error InvalidRunSequence();
    error InvalidInputVector();
    error WinnerStateNotReady();
    error WinnerSetupMismatch();
    error WinnerVectorExhausted();
    error PrizeVectorNotReady();

    event CircuitCompleted(
        bytes32 indexed circuitId,
        uint64 indexed runSequence,
        uint8 indexed branchCategory,
        bool completed
    );

    modifier onlyOperator() {
        if (msg.sender != OPERATOR) revert OnlyOperator();
        _;
    }

    constructor() {
        OPERATOR = msg.sender;
        _balanceMax = FHE.asEuint64(BALANCE_MAX_BASE_UNITS);
        _zero64 = FHE.asEuint64(0);
        _balanceMax128 = FHE.asEuint128(BALANCE_MAX_BASE_UNITS);
        _twabMax = FHE.asEuint128(TWAB_MAX);
        _twabNearMax = FHE.asEuint128(TWAB_MAX - 1);
        _one128 = FHE.asEuint128(1);
        _zero128 = FHE.asEuint128(0);
        _candidateGeneral = FHE.asEuint128(T_MAX + 7);
        _chunkWeight = FHE.asEuint128(CHUNK_WEIGHT);
        _true = FHE.asEbool(true);
        _false = FHE.asEbool(false);
        FHE.allowThis(_balanceMax);
        FHE.allowThis(_zero64);
        FHE.allowThis(_balanceMax128);
        FHE.allowThis(_twabMax);
        FHE.allowThis(_twabNearMax);
        FHE.allowThis(_one128);
        FHE.allowThis(_zero128);
        FHE.allowThis(_candidateGeneral);
        FHE.allowThis(_chunkWeight);
        FHE.allowThis(_true);
        FHE.allowThis(_false);
    }

    /// @notice Excluded setup transaction for one closed circuit/semantic/chunk instance.
    function setupWinnerInstance(uint16 setupId) external onlyOperator {
        uint8 circuitCode = uint8(setupId / 10);
        uint8 vectorId = uint8(setupId % 10);
        uint8 size = _registeredChunkSize(circuitCode);
        if (vectorId < FIRST_MATCH || vectorId > CONTINUATION_MATCH_IN_LATER_CHUNK) revert InvalidInputVector();
        if (size == 1 && (vectorId == MIDDLE_MATCH || vectorId == LAST_MATCH)) revert InvalidInputVector();

        (uint128 ticket, uint128 prefix, bool found, uint128 winner, uint64 cursor) = _registeredWinnerParameters(
            size,
            vectorId
        );

        _setWinnerState(setupId, circuitCode, size, vectorId, ticket, prefix, found, winner, cursor);
    }

    /// @notice Excluded setup for the dedicated two-call continuation semantics test only.
    function setupContinuationSemanticSequence() external onlyOperator {
        _setWinnerState(
            CONTINUATION_SEMANTIC_SEQUENCE_SETUP,
            4,
            8,
            CONTINUATION_MATCH_IN_LATER_CHUNK,
            12 * CHUNK_WEIGHT,
            0,
            false,
            0,
            0
        );
    }

    /// @notice Excluded setup for a guaranteed-valid draw-and-chunk resource-envelope sample.
    function setupCompositeWinnerInstance(uint16 setupId) external onlyOperator {
        uint8 circuitCode = uint8(setupId / 10);
        uint8 size;
        if (circuitCode == 7) size = 8;
        else if (circuitCode == 8) size = 32;
        else revert InvalidInputVector();
        if (uint8(setupId % 10) != 1) revert InvalidInputVector();
        _setWinnerState(setupId, circuitCode, size, FIRST_MATCH, 0, 0, true, 0, 0);
        acceptedTicketReady = false;
    }

    function _registeredWinnerParameters(
        uint8 size,
        uint8 vectorId
    ) private pure returns (uint128 ticket, uint128 prefix, bool found, uint128 winner, uint64 cursor) {
        if (vectorId == FIRST_MATCH) return (0, 0, false, 0, 0);
        if (vectorId == MIDDLE_MATCH) return (uint128(size / 2) * CHUNK_WEIGHT, 0, false, 0, 0);
        if (vectorId == LAST_MATCH) return (uint128(size - 1) * CHUNK_WEIGHT, 0, false, 0, 0);
        if (vectorId == NO_MATCH_BEFORE_CHUNK_BOUNDARY) return (uint128(size) * CHUNK_WEIGHT, 0, false, 0, 0);
        if (vectorId == ALREADY_FOUND_BEFORE_CHUNK)
            return (0, uint128(size) * CHUNK_WEIGHT, true, size > 2 ? 2 : 0, size);
        if (vectorId == CONTINUATION_MATCH_IN_LATER_CHUNK)
            return (uint128(size + size / 2) * CHUNK_WEIGHT, uint128(size) * CHUNK_WEIGHT, false, 0, size);
        revert InvalidInputVector();
    }

    function _setWinnerState(
        uint16 setupId,
        uint8 circuitCode,
        uint8 size,
        uint8 vectorId,
        uint128 ticket,
        uint128 prefix,
        bool found,
        uint128 winner,
        uint64 cursor
    ) private {
        if (cursor + size > MAX_REGISTERED_CURSOR) revert WinnerVectorExhausted();

        _acceptedTicket = FHE.asEuint128(ticket);
        _winnerPrefix = FHE.asEuint128(prefix);
        _winnerFound = FHE.asEbool(found);
        _winnerIndex = FHE.asEuint128(winner);
        FHE.allowThis(_acceptedTicket);
        FHE.allowThis(_winnerPrefix);
        FHE.allowThis(_winnerFound);
        FHE.allowThis(_winnerIndex);
        winnerCursor = cursor;
        winnerVectorId = vectorId;
        winnerRegisteredChunkSize = size;
        winnerRegisteredCircuitCode = circuitCode;
        winnerSetupId = setupId;
        winnerInitialized = true;
        acceptedTicketReady = true;
    }

    /// @notice Excluded setup transaction for the two fixed prize-select vectors.
    function setupPrizeVector(uint8 vectorId) external onlyOperator {
        if (vectorId == WINNER_TRUE) _prizePredicate = FHE.asEbool(true);
        else if (vectorId == WINNER_FALSE) _prizePredicate = FHE.asEbool(false);
        else revert InvalidInputVector();
        FHE.allowThis(_prizePredicate);
        prizeVectorId = vectorId;
        prizeVectorInitialized = true;
    }

    function rng64(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _store64(FHE.randEuint64());
        _complete("RNG_64", runSequence, 0);
    }

    function rng128(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _store128(FHE.randEuint128());
        _complete("RNG_128", runSequence, 0);
    }

    function rng256(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _last256 = FHE.randEuint256();
        FHE.allowThis(_last256);
        _complete("RNG_256", runSequence, 0);
    }

    function twabCast64To128(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _store128(FHE.asEuint128(_balanceMax));
        _complete("TWAB_CAST_64_TO_128", runSequence, 0);
    }

    function twabDelta128(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _store128(FHE.mul(FHE.asEuint128(_balanceMax), ELAPSED_MAX_SECONDS));
        _complete("TWAB_DELTA_128", runSequence, 0);
    }

    function twabAccumulate128(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        euint128 delta = FHE.mul(FHE.asEuint128(_balanceMax), ELAPSED_MAX_SECONDS - 1);
        _store128(FHE.add(delta, _balanceMax128));
        _complete("TWAB_ACCUMULATE_128", runSequence, 0);
    }

    function aggregateAdd128(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _store128(FHE.add(_twabNearMax, _one128));
        _complete("AGGREGATE_ADD_128", runSequence, 0);
    }

    function prefixAdd128(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _store128(FHE.add(_twabNearMax, _one128));
        _complete("PREFIX_ADD_128", runSequence, 0);
    }

    function drawZeroTotalNoop(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _result128 = _zero128;
        _complete("DRAW_ZERO_TOTAL_NOOP", runSequence, 1);
    }

    function drawTotalOne(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _store128(FHE.asEuint128(0));
        _complete("DRAW_TOTAL_ONE", runSequence, 2);
    }

    function rejectionValidGeneral128(uint64 runSequence, uint8 vectorCategory) external onlyOperator {
        _begin(runSequence);
        (, uint128 rejectionLimit) = _generalParameters(vectorCategory);
        _storeBool(FHE.lt(_candidateGeneral, rejectionLimit));
        _complete("REJECTION_VALID_GENERAL_128", runSequence, vectorCategory);
    }

    function ticketRemainderGeneral128(uint64 runSequence, uint8 vectorCategory) external onlyOperator {
        _begin(runSequence);
        (uint128 total, ) = _generalParameters(vectorCategory);
        _store128(FHE.rem(_candidateGeneral, total));
        _complete("TICKET_REMAINDER_GENERAL_128", runSequence, vectorCategory);
    }

    function rejectionPipelineGeneral128(uint64 runSequence, uint8 vectorCategory) external onlyOperator {
        _begin(runSequence);
        (uint128 total, uint128 rejectionLimit) = _generalParameters(vectorCategory);
        _drawGeneralCandidate(total, rejectionLimit);
        _complete("REJECTION_PIPELINE_GENERAL_128", runSequence, vectorCategory);
    }

    function rejectionPipelineAllValid128(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _drawAllValidResult();
        _complete("REJECTION_PIPELINE_ALL_VALID_128", runSequence, 4);
    }

    function winnerStep128(uint64 runSequence) external onlyOperator {
        _winnerChunk(runSequence, 1, 1, "WINNER_STEP_128");
    }

    function winnerChunk1(uint64 runSequence) external onlyOperator {
        _winnerChunk(runSequence, 1, 2, "WINNER_CHUNK_1");
    }

    function winnerChunk4(uint64 runSequence) external onlyOperator {
        _winnerChunk(runSequence, 4, 3, "WINNER_CHUNK_4");
    }

    function winnerChunk8(uint64 runSequence) external onlyOperator {
        _winnerChunk(runSequence, 8, 4, "WINNER_CHUNK_8");
    }

    function winnerChunk16(uint64 runSequence) external onlyOperator {
        _winnerChunk(runSequence, 16, 5, "WINNER_CHUNK_16");
    }

    function winnerChunk32(uint64 runSequence) external onlyOperator {
        _winnerChunk(runSequence, 32, 6, "WINNER_CHUNK_32");
    }

    function prizeOrZero(uint64 runSequence) external onlyOperator {
        if (!prizeVectorInitialized) revert PrizeVectorNotReady();
        _begin(runSequence);
        _store64(FHE.select(_prizePredicate, _balanceMax, _zero64));
        _complete("PRIZE_OR_ZERO", runSequence, prizeVectorId);
    }

    function compositeTwabUpdate(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        euint128 delta = FHE.mul(FHE.asEuint128(_balanceMax), ELAPSED_MAX_SECONDS - 1);
        _store128(FHE.add(delta, _balanceMax128));
        _complete("COMPOSITE_TWAB_UPDATE", runSequence, 0);
    }

    function compositeDrawGeneral(uint64 runSequence, uint8 vectorCategory) external onlyOperator {
        _begin(runSequence);
        (uint128 total, uint128 rejectionLimit) = _generalParameters(vectorCategory);
        _drawGeneralCandidate(total, rejectionLimit);
        _complete("COMPOSITE_DRAW_GENERAL", runSequence, vectorCategory);
    }

    function compositeDrawAllValid(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _drawAllValidResult();
        _complete("COMPOSITE_DRAW_ALL_VALID", runSequence, 4);
    }

    /// @dev Resource-envelope composite: all candidates are valid; no public-decryption stage is implied.
    function compositeDrawAndChunk8(uint64 runSequence) external onlyOperator {
        if (!winnerInitialized || winnerRegisteredCircuitCode != 7 || winnerRegisteredChunkSize != 8)
            revert WinnerSetupMismatch();
        _begin(runSequence);
        _initializeAllValidTicket();
        _executeWinnerSteps(8);
        _complete("COMPOSITE_DRAW_AND_CHUNK_8", runSequence, 4);
    }

    /// @dev Resource-envelope composite: all candidates are valid; no public-decryption stage is implied.
    function compositeDrawAndChunk32(uint64 runSequence) external onlyOperator {
        if (!winnerInitialized || winnerRegisteredCircuitCode != 8 || winnerRegisteredChunkSize != 32)
            revert WinnerSetupMismatch();
        _begin(runSequence);
        _initializeAllValidTicket();
        _executeWinnerSteps(32);
        _complete("COMPOSITE_DRAW_AND_CHUNK_32", runSequence, 4);
    }

    function publicDecryptAggregate128(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _publicAggregate = FHE.add(_twabMax, _zero128);
        FHE.allowThis(_publicAggregate);
        FHE.makePubliclyDecryptable(_publicAggregate);
        _complete("PUBLIC_DECRYPT_AGGREGATE_128", runSequence, 8);
    }

    function publicDecryptValidBool(uint64 runSequence) external onlyOperator {
        _begin(runSequence);
        _publicValidity = FHE.or(_true, _false);
        FHE.allowThis(_publicValidity);
        FHE.makePubliclyDecryptable(_publicValidity);
        _complete("PUBLIC_DECRYPT_VALID_BOOL", runSequence, 8);
    }

    function getResult64() external view onlyOperator returns (euint64) {
        return _result64;
    }

    function getResult128() external view onlyOperator returns (euint128) {
        return _result128;
    }

    function getResultBool() external view onlyOperator returns (ebool) {
        return _resultBool;
    }

    function getGeneralCandidateState() external view onlyOperator returns (euint128, ebool, bool) {
        return (_candidateRemainder, _candidateValidity, generalCandidatePending);
    }

    function getWinnerState()
        external
        view
        onlyOperator
        returns (euint128, euint128, ebool, euint128, uint64, uint16, uint8, uint8)
    {
        return (
            _acceptedTicket,
            _winnerPrefix,
            _winnerFound,
            _winnerIndex,
            winnerCursor,
            winnerSetupId,
            winnerRegisteredCircuitCode,
            winnerRegisteredChunkSize
        );
    }

    function getPublicAggregate() external view returns (euint128) {
        return _publicAggregate;
    }

    function getPublicValidity() external view returns (ebool) {
        return _publicValidity;
    }

    function _begin(uint64 runSequence) private {
        if (runSequence != nextRunSequence) revert InvalidRunSequence();
        nextRunSequence = runSequence + 1;
    }

    function _complete(string memory id, uint64 runSequence, uint8 category) private {
        emit CircuitCompleted(keccak256(bytes(id)), runSequence, category, true);
    }

    function _store64(euint64 value) private {
        _result64 = value;
        FHE.allowThis(value);
    }

    function _store128(euint128 value) private {
        _result128 = value;
        FHE.allowThis(value);
    }

    function _storeBool(ebool value) private {
        _resultBool = value;
        FHE.allowThis(value);
    }

    function _drawGeneralCandidate(uint128 total, uint128 rejectionLimit) private {
        euint128 candidate = FHE.randEuint128();
        _candidateValidity = FHE.lt(candidate, rejectionLimit);
        _candidateRemainder = FHE.rem(candidate, total);
        FHE.allowThis(_candidateValidity);
        FHE.allowThis(_candidateRemainder);
        generalCandidatePending = true;
    }

    function _generalParameters(uint8 vectorCategory) private pure returns (uint128 total, uint128 rejectionLimit) {
        if (vectorCategory == 3) return (T_MAX, REJECTION_LIMIT_MAX);
        if (vectorCategory == 5) return (T_POWER_MINUS_ONE, REJECTION_LIMIT_POWER_MINUS_ONE);
        if (vectorCategory == 6) return (T_POWER_PLUS_ONE, REJECTION_LIMIT_POWER_PLUS_ONE);
        revert InvalidInputVector();
    }

    function _drawAllValidResult() private {
        _result128 = FHE.rem(FHE.randEuint128(), T_DIVIDES_DOMAIN);
        _resultBool = _true;
        FHE.allowThis(_result128);
    }

    function _initializeAllValidTicket() private {
        _acceptedTicket = FHE.rem(FHE.randEuint128(), T_DIVIDES_DOMAIN);
        _winnerPrefix = _zero128;
        winnerCursor = 0;
        acceptedTicketReady = true;
        FHE.allowThis(_acceptedTicket);
    }

    function _winnerChunk(uint64 runSequence, uint8 size, uint8 circuitCode, string memory id) private onlyOperator {
        if (!winnerInitialized || !acceptedTicketReady) revert WinnerStateNotReady();
        if (winnerRegisteredChunkSize != size || winnerRegisteredCircuitCode != circuitCode)
            revert WinnerSetupMismatch();
        if (winnerCursor + size > MAX_REGISTERED_CURSOR) revert WinnerVectorExhausted();
        _begin(runSequence);
        _executeWinnerSteps(size);
        _complete(id, runSequence, winnerVectorId);
    }

    function _executeWinnerSteps(uint8 size) private {
        euint128 prefix = _winnerPrefix;
        ebool found = _winnerFound;
        euint128 winner = _winnerIndex;
        uint64 cursor = winnerCursor;
        for (uint8 i = 0; i < size; i++) {
            euint128 weight = _chunkWeight;
            euint128 nextPrefix = FHE.add(prefix, weight);
            ebool eligible = FHE.lt(_acceptedTicket, nextPrefix);
            ebool firstMatch = FHE.and(FHE.not(found), eligible);
            euint128 encryptedIndex = FHE.asEuint128(uint128(cursor));
            winner = FHE.select(firstMatch, encryptedIndex, winner);
            found = FHE.or(found, firstMatch);
            prefix = nextPrefix;
            cursor++;
        }
        _winnerPrefix = prefix;
        _winnerFound = found;
        _winnerIndex = winner;
        winnerCursor = cursor;
        FHE.allowThis(_winnerPrefix);
        FHE.allowThis(_winnerFound);
        FHE.allowThis(_winnerIndex);
    }

    function _registeredChunkSize(uint8 circuitCode) private pure returns (uint8) {
        if (circuitCode == 1 || circuitCode == 2) return 1;
        if (circuitCode == 3) return 4;
        if (circuitCode == 4) return 8;
        if (circuitCode == 5) return 16;
        if (circuitCode == 6) return 32;
        revert InvalidInputVector();
    }
}
