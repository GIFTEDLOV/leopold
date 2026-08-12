// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,gas-struct-packing,named-parameters-mapping */
/* solhint-disable gas-strict-inequalities */

import {FHE, ebool, euint64, euint128, externalEuint64, externalEuint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @notice Spike-2-only exact historical moment tree. Not production code.
/// @dev For the state at public time t: cumulative(t) = t * balance(t) - moment(t),
///      where moment(t) is the encrypted sum of signed delta * mutation timestamp.
contract LeopoldHistoricalMomentTreeSpike2 is ZamaEthereumConfig {
    enum AutoSavePreference {
        KEEP_AVAILABLE,
        AUTO_SAVE
    }

    enum SessionPhase {
        NONE,
        PREFIX,
        READY,
        AUTO_SAVE_PENDING,
        COMPLETE
    }

    struct Observation {
        uint64 timestamp;
        euint64 balance;
        euint128 moment;
    }

    struct PreferenceObservation {
        uint64 timestamp;
        AutoSavePreference preference;
    }

    struct ClosedRound {
        uint64 opensAt;
        uint64 closesAt;
        bool totalPending;
        bool selectionFinal;
        uint128 publicAggregateTwab;
        uint64 publicPrize;
        euint128 aggregateTwab;
        euint128 acceptedTicket;
        euint64 encryptedPrize;
        euint64 encryptedReserve;
    }

    struct ResultSession {
        bytes32 binding;
        uint32 slot;
        uint256 cursor;
        SessionPhase phase;
        euint128 prefix;
        euint64 payout;
        euint64 autoSaveCredit;
    }

    address public immutable VAULT;
    uint8 public immutable TREE_DEPTH;
    uint256 public immutable CAPACITY;

    mapping(address account => uint32 slot) public slotOf;
    mapping(address account => bool registered) public isRegistered;
    mapping(uint32 slot => address account) public accountAt;
    mapping(uint256 node => Observation[]) private _nodeObservations;
    mapping(address account => PreferenceObservation[]) private _preferenceObservations;
    mapping(uint256 roundId => ClosedRound) private _rounds;
    mapping(uint256 roundId => mapping(address account => ResultSession)) private _sessions;
    mapping(address account => euint64 winnings) private _winnings;
    mapping(address account => euint64 principal) private _principal;
    uint256 public availablePrize;
    uint256 public irrevocablyAllocatedPrize;
    euint128 private _benchmarkWeight;

    error Unauthorized();
    error InvalidDepth();
    error InvalidSlot();
    error DuplicateRegistration();
    error InvalidRound();
    error InvalidProof();
    error InvalidPrize();
    error InvalidSession();
    error InvalidSteps();

    event SlotRegistered(address indexed account, uint32 indexed slot);
    event BalancePathUpdated(uint32 indexed slot, uint64 timestamp, bool increase);
    event RoundSelectionFinal(uint256 indexed roundId, uint128 aggregateTwab, uint64 prize);
    event ResultSessionStarted(uint256 indexed roundId, address indexed account);
    event ResultSessionAdvanced(uint256 indexed roundId, address indexed account, uint256 cursor);
    event PrivateResultFinalized(uint256 indexed roundId, address indexed account);
    event AutoSaveFinalized(uint256 indexed roundId, address indexed account);

    modifier onlyVault() {
        if (msg.sender != VAULT) revert Unauthorized();
        _;
    }

    constructor(address vault_, uint8 depth_) {
        if (vault_ == address(0)) revert Unauthorized();
        if (depth_ == 0 || depth_ > 32) revert InvalidDepth();
        VAULT = vault_;
        TREE_DEPTH = depth_;
        CAPACITY = uint256(1) << depth_;
    }

    function register(address account, uint32 slot) external onlyVault {
        if (account == address(0) || uint256(slot) >= CAPACITY) revert InvalidSlot();
        if (isRegistered[account] || accountAt[slot] != address(0)) revert DuplicateRegistration();
        isRegistered[account] = true;
        slotOf[account] = slot;
        accountAt[slot] = account;
        emit SlotRegistered(account, slot);
    }

    function updateBalance(
        address account,
        externalEuint64 encryptedDelta,
        bytes calldata inputProof,
        bool increase
    ) external onlyVault {
        if (!isRegistered[account]) revert InvalidSlot();
        euint64 delta = FHE.fromExternal(encryptedDelta, inputProof);
        uint64 timestamp = uint64(block.timestamp);

        _updateBalancePath(account, delta, increase, timestamp);
        emit BalancePathUpdated(slotOf[account], timestamp, increase);
    }

    /// @notice Exact cross-contract form used by the Spike-2 ACL probe.
    function updateBalanceFromVault(address account, euint64 delta, bool increase) external onlyVault {
        if (!isRegistered[account] || !FHE.isSenderAllowed(delta)) revert InvalidProof();
        uint64 timestamp = uint64(block.timestamp);
        _updateBalancePath(account, delta, increase, timestamp);
        emit BalancePathUpdated(slotOf[account], timestamp, increase);
    }

    function _updateBalancePath(address account, euint64 delta, bool increase, uint64 timestamp) private {
        euint128 deltaMoment = FHE.mul(FHE.asEuint128(delta), uint128(timestamp));
        uint256 node = _leaf(slotOf[account]);
        while (node != 0) {
            _updateNode(node, delta, deltaMoment, increase, timestamp);
            node >>= 1;
        }
    }

    function setAutoSavePreference(address account, AutoSavePreference preference) external onlyVault {
        PreferenceObservation[] storage observations = _preferenceObservations[account];
        uint64 timestamp = uint64(block.timestamp);
        if (observations.length != 0 && observations[observations.length - 1].timestamp == timestamp) {
            observations[observations.length - 1].preference = preference;
        } else {
            observations.push(PreferenceObservation({timestamp: timestamp, preference: preference}));
        }
    }

    function fundPrize(uint64 amount) external onlyVault {
        availablePrize += amount;
    }

    function requestRoundTotal(uint256 roundId, uint64 opensAt, uint64 closesAt, uint64 prize) external onlyVault {
        ClosedRound storage round = _rounds[roundId];
        if (
            roundId == 0 || closesAt <= opensAt || closesAt > block.timestamp || round.totalPending ||
            round.selectionFinal
        ) revert InvalidRound();
        if (prize == 0 || prize > availablePrize) revert InvalidPrize();
        availablePrize -= prize;
        irrevocablyAllocatedPrize += prize;
        round.opensAt = opensAt;
        round.closesAt = closesAt;
        round.publicPrize = prize;
        round.aggregateTwab = _nodeWeight(1, opensAt, closesAt);
        round.totalPending = true;
        FHE.allowThis(round.aggregateTwab);
        FHE.makePubliclyDecryptable(round.aggregateTwab);
    }

    function finalizeRoundSelection(
        uint256 roundId,
        uint128 clearAggregateTwab,
        bytes calldata aggregateCleartexts,
        bytes calldata aggregateProof,
        externalEuint128 encryptedTicket,
        bytes calldata ticketProof
    ) external onlyVault {
        _finalizeRoundSelection(
            roundId,
            clearAggregateTwab,
            aggregateCleartexts,
            aggregateProof,
            FHE.fromExternal(encryptedTicket, ticketProof)
        );
    }

    /// @notice Same state transition with a vault-owned ciphertext authorized transiently to this helper.
    function finalizeRoundSelectionFromVault(
        uint256 roundId,
        uint128 clearAggregateTwab,
        bytes calldata aggregateCleartexts,
        bytes calldata aggregateProof,
        euint128 acceptedTicket
    ) external onlyVault {
        if (!FHE.isSenderAllowed(acceptedTicket)) revert InvalidProof();
        _finalizeRoundSelection(roundId, clearAggregateTwab, aggregateCleartexts, aggregateProof, acceptedTicket);
    }

    function aggregateTwabHandle(uint256 roundId) external view returns (euint128) {
        return _rounds[roundId].aggregateTwab;
    }

    function _finalizeRoundSelection(
        uint256 roundId,
        uint128 clearAggregateTwab,
        bytes calldata aggregateCleartexts,
        bytes calldata aggregateProof,
        euint128 acceptedTicket
    ) private {
        ClosedRound storage round = _rounds[roundId];
        if (!round.totalPending || round.selectionFinal || clearAggregateTwab == 0) revert InvalidRound();
        if (aggregateCleartexts.length != 32 || abi.decode(aggregateCleartexts, (uint256)) != clearAggregateTwab) {
            revert InvalidProof();
        }
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(round.aggregateTwab);
        FHE.checkSignatures(handles, aggregateCleartexts, aggregateProof);
        round.publicAggregateTwab = clearAggregateTwab;
        round.acceptedTicket = acceptedTicket;
        round.encryptedPrize = FHE.asEuint64(round.publicPrize);
        round.encryptedReserve = round.encryptedPrize;
        round.selectionFinal = true;
        FHE.allowThis(round.acceptedTicket);
        FHE.allowThis(round.encryptedPrize);
        FHE.allowThis(round.encryptedReserve);
        emit RoundSelectionFinal(roundId, clearAggregateTwab, round.publicPrize);
    }

    /// @dev Only the target may allocate session storage; progression is permissionless.
    function startPrivateResult(uint256 roundId) external {
        ClosedRound storage round = _rounds[roundId];
        if (!round.selectionFinal || !isRegistered[msg.sender]) revert InvalidRound();
        ResultSession storage session = _sessions[roundId][msg.sender];
        if (session.phase != SessionPhase.NONE) revert InvalidSession();
        uint32 slot = slotOf[msg.sender];
        session.slot = slot;
        session.cursor = _leaf(slot);
        session.phase = SessionPhase.PREFIX;
        session.prefix = FHE.asEuint128(0);
        session.binding = _sessionBinding(roundId, msg.sender, slot, round);
        FHE.allowThis(session.prefix);
        emit ResultSessionStarted(roundId, msg.sender);
    }

    function advancePrivateResult(uint256 roundId, address account, uint8 maxSteps) external {
        if (maxSteps == 0 || maxSteps > 4) revert InvalidSteps();
        ClosedRound storage round = _rounds[roundId];
        ResultSession storage session = _sessions[roundId][account];
        _requireSessionBinding(roundId, account, round, session, SessionPhase.PREFIX);
        uint256 cursor = session.cursor;
        euint128 prefix = session.prefix;
        uint8 steps;
        while (cursor > 1 && steps < maxSteps) {
            if (cursor & 1 == 1) {
                prefix = FHE.add(prefix, _nodeWeight(cursor - 1, round.opensAt, round.closesAt));
            }
            cursor >>= 1;
            unchecked {
                ++steps;
            }
        }
        session.cursor = cursor;
        session.prefix = prefix;
        if (cursor == 1) session.phase = SessionPhase.READY;
        FHE.allowThis(prefix);
        emit ResultSessionAdvanced(roundId, account, cursor);
    }

    function finalizePrivateResult(uint256 roundId, address account) external {
        ClosedRound storage round = _rounds[roundId];
        ResultSession storage session = _sessions[roundId][account];
        _requireSessionBinding(roundId, account, round, session, SessionPhase.READY);
        euint128 weight = _nodeWeight(_leaf(session.slot), round.opensAt, round.closesAt);
        euint128 upper = FHE.add(session.prefix, weight);
        ebool winner = FHE.and(FHE.ge(round.acceptedTicket, session.prefix), FHE.lt(round.acceptedTicket, upper));
        euint64 zero = FHE.asEuint64(0);
        euint64 payout = FHE.select(winner, round.encryptedPrize, zero);
        ebool wantsAutoSave = FHE.asEbool(
            _preferenceAt(account, round.closesAt) == AutoSavePreference.AUTO_SAVE
        );
        euint64 saved = FHE.select(FHE.and(winner, wantsAutoSave), round.encryptedPrize, zero);
        euint64 kept = FHE.sub(payout, saved);
        _winnings[account] = FHE.add(_winnings[account], kept);
        round.encryptedReserve = FHE.sub(round.encryptedReserve, payout);
        session.payout = payout;
        session.autoSaveCredit = saved;
        session.phase = SessionPhase.AUTO_SAVE_PENDING;
        FHE.allowThis(_winnings[account]);
        FHE.allow(_winnings[account], account);
        FHE.allowThis(round.encryptedReserve);
        FHE.allowThis(payout);
        FHE.allow(payout, account);
        FHE.allowThis(saved);
        emit PrivateResultFinalized(roundId, account);
    }

    /// @notice Separate uniform transaction keeps the depth-32 moment update under the Save/Withdraw gate.
    function finalizeAutoSave(uint256 roundId, address account) external {
        ClosedRound storage round = _rounds[roundId];
        ResultSession storage session = _sessions[roundId][account];
        _requireSessionBinding(roundId, account, round, session, SessionPhase.AUTO_SAVE_PENDING);
        euint64 saved = session.autoSaveCredit;
        _updateBalancePath(account, saved, true, uint64(block.timestamp));
        _principal[account] = FHE.add(_principal[account], saved);
        session.phase = SessionPhase.COMPLETE;
        FHE.allowThis(_principal[account]);
        FHE.allow(_principal[account], account);
        emit AutoSaveFinalized(roundId, account);
    }

    function sessionInfo(
        uint256 roundId,
        address account
    ) external view returns (bytes32, uint32, uint256, SessionPhase) {
        ResultSession storage session = _sessions[roundId][account];
        return (session.binding, session.slot, session.cursor, session.phase);
    }

    function payoutOf(uint256 roundId, address account) external view returns (euint64) {
        return _sessions[roundId][account].payout;
    }

    function winningsOf(address account) external view returns (euint64) {
        return _winnings[account];
    }

    function principalOf(address account) external view returns (euint64) {
        return _principal[account];
    }

    function benchmarkNodeWeight(uint256 node, uint64 start, uint64 end) external {
        _benchmarkWeight = FHE.sub(_cumulativeAt(node, end), _cumulativeAt(node, start));
        FHE.allowThis(_benchmarkWeight);
        FHE.makePubliclyDecryptable(_benchmarkWeight);
    }

    function nodeObservationCount(uint256 node) external view returns (uint256) {
        return _nodeObservations[node].length;
    }

    function leafOf(uint32 slot) external view returns (uint256) {
        if (uint256(slot) >= CAPACITY) revert InvalidSlot();
        return _leaf(slot);
    }

    function benchmarkWeightHandle() external view returns (euint128) {
        return _benchmarkWeight;
    }

    function _updateNode(
        uint256 node,
        euint64 delta,
        euint128 deltaMoment,
        bool increase,
        uint64 timestamp
    ) private {
        Observation[] storage observations = _nodeObservations[node];
        euint64 previousBalance;
        euint128 previousMoment;
        if (observations.length == 0) {
            previousBalance = FHE.asEuint64(0);
            previousMoment = FHE.asEuint128(0);
        } else {
            Observation storage previous = observations[observations.length - 1];
            previousBalance = previous.balance;
            previousMoment = previous.moment;
        }

        euint64 balance = increase ? FHE.add(previousBalance, delta) : FHE.sub(previousBalance, delta);
        euint128 moment = increase ? FHE.add(previousMoment, deltaMoment) : FHE.sub(previousMoment, deltaMoment);
        if (observations.length != 0 && observations[observations.length - 1].timestamp == timestamp) {
            observations[observations.length - 1].balance = balance;
            observations[observations.length - 1].moment = moment;
        } else {
            observations.push(Observation({timestamp: timestamp, balance: balance, moment: moment}));
        }
        FHE.allowThis(balance);
        FHE.allowThis(moment);
    }

    function _nodeWeight(uint256 node, uint64 start, uint64 end) private returns (euint128) {
        return FHE.sub(_cumulativeAt(node, end), _cumulativeAt(node, start));
    }

    function _cumulativeAt(uint256 node, uint64 timestamp) private returns (euint128) {
        Observation[] storage observations = _nodeObservations[node];
        uint256 length = observations.length;
        if (length == 0 || timestamp < observations[0].timestamp) return FHE.asEuint128(0);
        uint256 low = 0;
        uint256 high = length;
        while (low + 1 < high) {
            uint256 middle = low + (high - low) / 2;
            if (observations[middle].timestamp <= timestamp) low = middle;
            else high = middle;
        }
        Observation storage observation = observations[low];
        return FHE.sub(FHE.mul(FHE.asEuint128(observation.balance), uint128(timestamp)), observation.moment);
    }

    function _preferenceAt(address account, uint64 timestamp) private view returns (AutoSavePreference) {
        PreferenceObservation[] storage observations = _preferenceObservations[account];
        uint256 length = observations.length;
        if (length == 0 || timestamp <= observations[0].timestamp) return AutoSavePreference.KEEP_AVAILABLE;
        uint256 low;
        uint256 high = length;
        while (low + 1 < high) {
            uint256 middle = low + (high - low) / 2;
            if (observations[middle].timestamp < timestamp) low = middle;
            else high = middle;
        }
        return observations[low].preference;
    }

    function _sessionBinding(
        uint256 roundId,
        address account,
        uint32 slot,
        ClosedRound storage round
    ) private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    address(this),
                    VAULT,
                    roundId,
                    account,
                    slot,
                    round.opensAt,
                    round.closesAt,
                    round.publicAggregateTwab,
                    round.publicPrize,
                    FHE.toBytes32(round.acceptedTicket)
                )
            );
    }

    function _requireSessionBinding(
        uint256 roundId,
        address account,
        ClosedRound storage round,
        ResultSession storage session,
        SessionPhase expected
    ) private view {
        if (
            !round.selectionFinal || session.phase != expected || session.slot != slotOf[account] ||
            session.binding != _sessionBinding(roundId, account, session.slot, round)
        ) revert InvalidSession();
    }

    function _leaf(uint32 slot) private view returns (uint256) {
        return CAPACITY + slot;
    }
}
