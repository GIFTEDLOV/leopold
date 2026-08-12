// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,max-states-count,gas-struct-packing,named-parameters-mapping */
/* solhint-disable gas-strict-inequalities */
/* solhint-disable gas-indexed-events,function-max-lines */

import {FHE, ebool, euint64, euint128, externalEuint64, externalEuint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @notice Research-only exact historical sparse segment tree. Not production code.
contract LeopoldHistoricalPrefixTreeSpike is ZamaEthereumConfig {
    enum AutoSavePreference {
        KEEP_AVAILABLE,
        AUTO_SAVE
    }

    struct Observation {
        uint64 timestamp;
        euint64 balance;
        euint128 cumulative;
    }

    struct PreferenceObservation {
        uint64 timestamp;
        AutoSavePreference preference;
    }

    struct Round {
        uint64 opensAt;
        uint64 closesAt;
        bool totalPending;
        bool ticketFixed;
        euint128 aggregateTwab;
        uint128 publicAggregateTwab;
        euint128 acceptedTicket;
        euint64 prize;
        euint64 reservedPrize;
    }

    address public immutable VAULT;
    uint8 public immutable TREE_DEPTH;
    uint256 public immutable CAPACITY;
    uint64 public nextSlot;

    mapping(address account => uint32 slot) public slotOf;
    mapping(address account => bool registered) public isRegistered;
    mapping(uint32 slot => address account) public accountAt;
    mapping(uint256 node => Observation[]) private _nodeObservations;
    mapping(address account => PreferenceObservation[]) private _preferenceObservations;
    mapping(uint256 roundId => Round) private _rounds;
    mapping(uint256 roundId => mapping(address account => bool)) public materialized;
    mapping(uint256 roundId => mapping(address account => euint64)) private _privatePayout;
    mapping(address account => euint64) private _principal;
    mapping(address account => euint64) private _winnings;
    euint128 private _benchmarkPrefix;
    ebool private _benchmarkWinner;
    euint64 private _benchmarkPayout;

    error Unauthorized();
    error InvalidDepth();
    error InvalidSlot();
    error DuplicateRegistration();
    error InvalidRound();
    error RoundNotReady();
    error AlreadyMaterialized();
    error InvalidCleartext();

    event SlotRegistered(address indexed account, uint32 indexed slot);
    event AggregateUpdated(uint32 indexed slot, uint64 timestamp);
    event RoundTotalRequested(uint256 indexed roundId);
    event RoundTicketFixed(uint256 indexed roundId);
    event PrivateResultMaterialized(uint256 indexed roundId, address indexed account);

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
        if (uint64(slot) >= nextSlot) nextSlot = uint64(slot) + 1;
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
        _updateBalancePath(account, delta, increase, uint64(block.timestamp));
        emit AggregateUpdated(slotOf[account], uint64(block.timestamp));
    }

    function _updateBalancePath(address account, euint64 delta, bool increase, uint64 timestamp) private {
        uint256 node = _leaf(slotOf[account]);
        while (node != 0) {
            _updateNode(node, delta, increase, timestamp);
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

    function requestRoundTotal(uint256 roundId, uint64 opensAt, uint64 closesAt) external onlyVault {
        if (roundId == 0 || closesAt <= opensAt || closesAt > block.timestamp) revert InvalidRound();
        Round storage round = _rounds[roundId];
        if (round.totalPending || round.ticketFixed) revert InvalidRound();
        round.opensAt = opensAt;
        round.closesAt = closesAt;
        round.aggregateTwab = _nodeWeight(1, opensAt, closesAt);
        round.totalPending = true;
        FHE.allowThis(round.aggregateTwab);
        FHE.makePubliclyDecryptable(round.aggregateTwab);
        emit RoundTotalRequested(roundId);
    }

    function aggregateTwabHandle(uint256 roundId) external view returns (euint128) {
        return _rounds[roundId].aggregateTwab;
    }

    function finalizeRoundTicket(
        uint256 roundId,
        uint128 clearAggregateTwab,
        bytes calldata aggregateCleartexts,
        bytes calldata aggregateProof,
        externalEuint128 encryptedTicket,
        bytes calldata ticketProof,
        externalEuint64 encryptedPrize,
        bytes calldata prizeProof
    ) external onlyVault {
        // Research harness boundary: production integration must pass the
        // already rejection-sampled, range-valid vault ticket and a prize
        // debited from the vault's backed round reserve. External inputs keep
        // this isolated helper testable; they are not the proposed vault ABI.
        Round storage round = _rounds[roundId];
        if (!round.totalPending || round.ticketFixed || clearAggregateTwab == 0) revert RoundNotReady();
        if (aggregateCleartexts.length != 32 || abi.decode(aggregateCleartexts, (uint256)) != clearAggregateTwab) {
            revert InvalidCleartext();
        }
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(round.aggregateTwab);
        FHE.checkSignatures(handles, aggregateCleartexts, aggregateProof);
        round.publicAggregateTwab = clearAggregateTwab;
        round.acceptedTicket = FHE.fromExternal(encryptedTicket, ticketProof);
        round.prize = FHE.fromExternal(encryptedPrize, prizeProof);
        round.reservedPrize = round.prize;
        round.ticketFixed = true;
        FHE.allowThis(round.acceptedTicket);
        FHE.allowThis(round.prize);
        FHE.allowThis(round.reservedPrize);
        emit RoundTicketFixed(roundId);
    }

    /// @notice Permissionless and structurally uniform for winner and loser.
    function materializePrivateResultFor(uint256 roundId, address account) external returns (euint64 payout) {
        Round storage round = _rounds[roundId];
        if (!round.ticketFixed || !isRegistered[account]) revert RoundNotReady();
        if (materialized[roundId][account]) revert AlreadyMaterialized();
        materialized[roundId][account] = true;

        euint64 saved;
        (payout, saved) = _computePayout(round, account);
        _applyPayout(roundId, round, account, payout, saved);
        emit PrivateResultMaterialized(roundId, account);
    }

    function _computePayout(Round storage round, address account) private returns (euint64 payout, euint64 saved) {
        ebool winner = _winnerPredicate(round, account);
        euint64 zero = FHE.asEuint64(0);
        payout = FHE.select(winner, round.prize, zero);
        ebool autoSave = FHE.asEbool(_preferenceAt(account, round.closesAt) == AutoSavePreference.AUTO_SAVE);
        saved = FHE.select(FHE.and(winner, autoSave), round.prize, zero);
    }

    function _winnerPredicate(Round storage round, address account) private returns (ebool winner) {
        euint128 prefix = _prefixWeight(slotOf[account], round.opensAt, round.closesAt);
        euint128 weight = _nodeWeight(_leaf(slotOf[account]), round.opensAt, round.closesAt);
        euint128 upper = FHE.add(prefix, weight);
        ebool atOrAfterStart = FHE.ge(round.acceptedTicket, prefix);
        ebool beforeEnd = FHE.lt(round.acceptedTicket, upper);
        // A zero-width interval cannot satisfy both comparisons, so an extra
        // `weight > 0` gate is algebraically redundant and only adds FHE depth.
        winner = FHE.and(atOrAfterStart, beforeEnd);
        FHE.allowThis(prefix);
        FHE.allowThis(weight);
        FHE.allowThis(upper);
        FHE.allowThis(winner);
    }

    function _applyPayout(
        uint256 roundId,
        Round storage round,
        address account,
        euint64 payout,
        euint64 saved
    ) private {
        euint64 kept = FHE.sub(payout, saved);
        _principal[account] = FHE.add(_principal[account], saved);
        // Uniformly checkpoint `saved`, including encrypted zero for losers and
        // KEEP_AVAILABLE users. Auto-Save TWAB therefore starts now, never at close.
        _updateBalancePath(account, saved, true, uint64(block.timestamp));
        _winnings[account] = FHE.add(_winnings[account], kept);
        round.reservedPrize = FHE.sub(round.reservedPrize, payout);
        _privatePayout[roundId][account] = payout;

        FHE.allowThis(payout);
        FHE.allow(payout, account);
        FHE.allowThis(_principal[account]);
        FHE.allow(_principal[account], account);
        FHE.allowThis(_winnings[account]);
        FHE.allow(_winnings[account], account);
        FHE.allowThis(round.reservedPrize);
    }

    function privatePayoutOf(uint256 roundId, address account) external view returns (euint64) {
        return _privatePayout[roundId][account];
    }

    function principalOf(address account) external view returns (euint64) {
        return _principal[account];
    }

    function winningsOf(address account) external view returns (euint64) {
        return _winnings[account];
    }

    function prefixNodeCount(uint32 slot) external view returns (uint256 count) {
        if (uint256(slot) >= CAPACITY) revert InvalidSlot();
        uint256 node = _leaf(slot);
        while (node > 1) {
            if (node & 1 == 1) ++count;
            node >>= 1;
        }
    }

    function nodeObservationCount(uint256 node) external view returns (uint256) {
        return _nodeObservations[node].length;
    }

    /// @dev Isolated research instrumentation; not proposed as production API.
    function benchmarkHistoricalPrefix(uint32 slot, uint64 start, uint64 end) external {
        _benchmarkPrefix = _prefixWeight(slot, start, end);
        FHE.allowThis(_benchmarkPrefix);
    }

    /// @dev Isolated research instrumentation; not proposed as production API.
    function benchmarkWinnerPredicate(uint256 roundId, address account) external {
        Round storage round = _rounds[roundId];
        if (!round.ticketFixed || !isRegistered[account]) revert RoundNotReady();
        _benchmarkWinner = _winnerPredicate(round, account);
        FHE.allowThis(_benchmarkWinner);
    }

    /// @dev Isolated research instrumentation; not proposed as production API.
    function benchmarkPayoutMaterialization(uint256 roundId, address account) external {
        Round storage round = _rounds[roundId];
        if (!round.ticketFixed || !isRegistered[account]) revert RoundNotReady();
        _benchmarkPayout = FHE.select(_winnerPredicate(round, account), round.prize, FHE.asEuint64(0));
        FHE.allowThis(_benchmarkPayout);
    }

    function _updateNode(uint256 node, euint64 delta, bool increase, uint64 timestamp) private {
        Observation[] storage observations = _nodeObservations[node];
        euint64 previousBalance;
        euint128 cumulative;
        if (observations.length == 0) {
            previousBalance = FHE.asEuint64(0);
            cumulative = FHE.asEuint128(0);
        } else {
            Observation storage previous = observations[observations.length - 1];
            previousBalance = previous.balance;
            cumulative = previous.cumulative;
            uint64 elapsed = timestamp - previous.timestamp;
            if (elapsed != 0) {
                cumulative = FHE.add(cumulative, FHE.mul(FHE.asEuint128(previousBalance), uint128(elapsed)));
            }
        }
        euint64 balance = increase ? FHE.add(previousBalance, delta) : FHE.sub(previousBalance, delta);
        if (observations.length != 0 && observations[observations.length - 1].timestamp == timestamp) {
            observations[observations.length - 1].balance = balance;
            observations[observations.length - 1].cumulative = cumulative;
        } else {
            observations.push(Observation({timestamp: timestamp, balance: balance, cumulative: cumulative}));
        }
        FHE.allowThis(balance);
        FHE.allowThis(cumulative);
    }

    function _nodeWeight(uint256 node, uint64 start, uint64 end) private returns (euint128) {
        return FHE.sub(_cumulativeAt(node, end), _cumulativeAt(node, start));
    }

    function _prefixWeight(uint32 slot, uint64 start, uint64 end) private returns (euint128 prefix) {
        prefix = FHE.asEuint128(0);
        uint256 node = _leaf(slot);
        while (node > 1) {
            if (node & 1 == 1) prefix = FHE.add(prefix, _nodeWeight(node - 1, start, end));
            node >>= 1;
        }
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
        uint64 elapsed = timestamp - observation.timestamp;
        if (elapsed == 0) return observation.cumulative;
        return FHE.add(observation.cumulative, FHE.mul(FHE.asEuint128(observation.balance), uint128(elapsed)));
    }

    function _preferenceAt(address account, uint64 timestamp) private view returns (AutoSavePreference) {
        PreferenceObservation[] storage observations = _preferenceObservations[account];
        uint256 length = observations.length;
        if (length == 0 || timestamp <= observations[0].timestamp) return AutoSavePreference.KEEP_AVAILABLE;
        uint256 low = 0;
        uint256 high = length;
        while (low + 1 < high) {
            uint256 middle = low + (high - low) / 2;
            if (observations[middle].timestamp < timestamp) low = middle;
            else high = middle;
        }
        return observations[low].preference;
    }

    function _leaf(uint32 slot) private view returns (uint256) {
        return CAPACITY + slot;
    }
}
