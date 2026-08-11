// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,max-states-count,gas-struct-packing,named-parameters-mapping */
/* solhint-disable gas-indexed-events,gas-strict-inequalities */

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/interfaces/IERC7984ERC20Wrapper.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

/// @title Leopold confidential prize-savings vault
/// @notice One non-upgradeable implementation deployed independently for each official vault.
/// @dev Winner traversal/allocation and adapter integration are deliberately later slices.
contract LeopoldVault is ZamaEthereumConfig, ReentrancyGuardTransient, IERC7984Receiver {
    using SafeERC20 for IERC20;

    uint64 public constant MAX_POOL_BASE_UNITS = 1_000_000_000_000_000;
    uint64 public constant MAX_ROUND_DURATION = 31_536_000;
    uint128 public constant MAX_AGGREGATE_TWAB = 31_536_000_000_000_000_000_000;
    uint32 public constant MAX_PARTICIPANTS = 10_000;

    enum VaultType {
        DAILY,
        WEEKLY,
        MONTHLY,
        BOOST
    }

    enum RoundState {
        UNINITIALIZED,
        OPEN,
        AGGREGATE_PENDING,
        AGGREGATE_FINALIZED,
        EMPTY,
        CANDIDATE_VALIDITY_PENDING,
        CANDIDATE_REJECTED,
        TICKET_ACCEPTED,
        WINNER_PROCESSING,
        WINNINGS_ALLOCATED,
        SETTLED
    }

    enum AutoSavePreference {
        KEEP_AVAILABLE,
        AUTO_SAVE
    }

    struct Observation {
        uint64 timestamp;
        euint64 balance;
        euint128 cumulative;
    }

    struct Round {
        uint64 opensAt;
        uint64 closesAt;
        RoundState state;
        euint128 startCumulative;
        euint128 aggregateTwab;
        uint128 publicAggregateTwab;
        uint64 publicPrize;
        euint128 candidate;
        ebool candidateValid;
        euint128 acceptedTicket;
        uint32 selectionCursor;
        euint64 reservedPrize;
    }

    uint8 public immutable VAULT_ID;
    VaultType public immutable VAULT_TYPE;
    bytes32 public immutable VAULT_NAME;
    uint64 public immutable ROUND_DURATION;
    IERC7984ERC20Wrapper public immutable ASSET;
    address public immutable UNDERLYING;
    uint256 public immutable WRAP_RATE;

    uint256 public activeRoundId;
    mapping(uint256 roundId => Round) private _rounds;

    address[] private _participants;
    mapping(address account => bool) public isParticipant;
    mapping(address account => Observation[]) private _observations;
    mapping(address account => euint64) private _principal;
    mapping(address account => euint64) private _winnings;
    mapping(address account => AutoSavePreference) public autoSavePreference;
    mapping(uint256 roundId => mapping(address account => euint128)) private _materializedWeight;

    euint64 private _totalPrincipal;
    euint64 private _liquidPrincipal;
    euint64 private _deployedPrincipal;
    euint64 private _liquidPrizeAssets;
    euint64 private _realizedSurplus;
    euint64 private _reservedPrize;
    euint64 private _winningsLiability;
    euint64 private _globalBalance;
    euint128 private _globalCumulative;
    uint64 private _globalTimestamp;

    mapping(uint256 roundId => euint64) private _sponsoredPrize;
    mapping(uint256 roundId => uint64) public publicSponsoredPrize;

    error InvalidAddress();
    error InvalidConfiguration();
    error InvalidRound();
    error InvalidRoundState(RoundState actual, RoundState expected);
    error RoundStillOpen();
    error RoundNotOpen();
    error ParticipantAlreadyRegistered();
    error ParticipantNotRegistered();
    error ParticipantLimitReached();
    error UnauthorizedAsset();
    error InvalidCallbackData();
    error InvalidSponsorRound();
    error InvalidSponsorAmount();
    error AggregateOutOfDomain();
    error InvalidCleartextEncoding();
    error CandidateNotPending();
    error WeightUnavailable();

    event ParticipantRegistered(address indexed account, uint32 indexed participantIndex);
    event DepositProcessed(address indexed account, uint256 indexed roundId);
    event WithdrawalProcessed(address indexed account, uint256 indexed roundId);
    event SponsorContributionCommitted(
        address indexed sponsor,
        uint256 indexed roundId,
        uint64 confidentialAssetBaseUnits
    );
    event RoundClosed(uint256 indexed roundId, uint256 indexed nextRoundId);
    event AggregateFinalized(uint256 indexed roundId, uint128 aggregateTwab);
    event RandomCandidateGenerated(uint256 indexed roundId, uint32 indexed attempt);
    event CandidateObjectivelyRejected(uint256 indexed roundId);
    event TicketAccepted(uint256 indexed roundId);
    event AutoSavePreferenceSet(address indexed account, AutoSavePreference preference);

    mapping(uint256 roundId => uint32) public candidateAttempts;

    constructor(
        uint8 vaultId,
        VaultType vaultType,
        bytes32 vaultName,
        uint64 roundDuration,
        IERC7984ERC20Wrapper asset,
        uint64 firstRoundOpensAt
    ) {
        if (address(asset) == address(0)) revert InvalidAddress();
        if (
            vaultId == 0 ||
            vaultId > 4 ||
            vaultName == bytes32(0) ||
            roundDuration == 0 ||
            roundDuration > MAX_ROUND_DURATION ||
            firstRoundOpensAt == 0
        ) revert InvalidConfiguration();

        address underlying = asset.underlying();
        uint256 rate = asset.rate();
        if (underlying == address(0) || rate == 0 || asset.decimals() != 6) revert InvalidConfiguration();

        VAULT_ID = vaultId;
        VAULT_TYPE = vaultType;
        VAULT_NAME = vaultName;
        ROUND_DURATION = roundDuration;
        ASSET = asset;
        UNDERLYING = underlying;
        WRAP_RATE = rate;

        euint64 zero64 = FHE.asEuint64(0);
        euint128 zero128 = FHE.asEuint128(0);
        _totalPrincipal = zero64;
        _liquidPrincipal = zero64;
        _deployedPrincipal = zero64;
        _liquidPrizeAssets = zero64;
        _realizedSurplus = zero64;
        _reservedPrize = zero64;
        _winningsLiability = zero64;
        _globalBalance = zero64;
        _globalCumulative = zero128;
        FHE.allowThis(zero64);
        FHE.allowThis(zero128);

        activeRoundId = 1;
        _globalTimestamp = firstRoundOpensAt;
        _initializeRound(1, firstRoundOpensAt, zero128);
    }

    function registerParticipant() external {
        if (!_isActiveRoundOpen()) revert RoundNotOpen();
        if (isParticipant[msg.sender]) revert ParticipantAlreadyRegistered();
        if (_participants.length >= MAX_PARTICIPANTS) revert ParticipantLimitReached();
        isParticipant[msg.sender] = true;
        _participants.push(msg.sender);
        emit ParticipantRegistered(msg.sender, uint32(_participants.length - 1));
    }

    /// @inheritdoc IERC7984Receiver
    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata data
    ) external nonReentrant returns (ebool) {
        if (msg.sender != address(ASSET)) revert UnauthorizedAsset();
        if (data.length != 0) revert InvalidCallbackData();
        if (!isParticipant[from]) revert ParticipantNotRegistered();
        if (!_isActiveRoundOpen()) revert RoundNotOpen();

        _accrueGlobal(uint64(block.timestamp));
        euint64 proposedTotal = FHE.add(_totalPrincipal, amount);
        ebool withinCap = FHE.le(proposedTotal, MAX_POOL_BASE_UNITS);
        ebool positive = FHE.gt(amount, uint64(0));
        ebool accepted = FHE.and(withinCap, positive);
        euint64 acceptedAmount = FHE.select(accepted, amount, FHE.asEuint64(0));

        euint64 newUserBalance = FHE.add(_principal[from], acceptedAmount);
        _checkpointUser(from, newUserBalance, uint64(block.timestamp));
        _principal[from] = newUserBalance;
        _totalPrincipal = FHE.add(_totalPrincipal, acceptedAmount);
        _liquidPrincipal = FHE.add(_liquidPrincipal, acceptedAmount);
        _globalBalance = FHE.add(_globalBalance, acceptedAmount);
        _persistPrincipalState(from);
        FHE.allowTransient(accepted, msg.sender);

        emit DepositProcessed(from, activeRoundId);
        return accepted;
    }

    function withdraw(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant returns (euint64) {
        if (!isParticipant[msg.sender]) revert ParticipantNotRegistered();
        if (!_isActiveRoundOpen()) revert RoundNotOpen();

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        ebool withinUserBalance = FHE.le(requested, _principal[msg.sender]);
        ebool withinLiquidPrincipal = FHE.le(requested, _liquidPrincipal);
        euint64 eligible = FHE.select(FHE.and(withinUserBalance, withinLiquidPrincipal), requested, FHE.asEuint64(0));

        FHE.allowTransient(eligible, address(ASSET));
        euint64 sent = ASSET.confidentialTransfer(msg.sender, eligible);

        _accrueGlobal(uint64(block.timestamp));
        euint64 newUserBalance = FHE.sub(_principal[msg.sender], sent);
        _checkpointUser(msg.sender, newUserBalance, uint64(block.timestamp));
        _principal[msg.sender] = newUserBalance;
        _totalPrincipal = FHE.sub(_totalPrincipal, sent);
        _liquidPrincipal = FHE.sub(_liquidPrincipal, sent);
        _globalBalance = FHE.sub(_globalBalance, sent);
        _persistPrincipalState(msg.sender);
        FHE.allow(sent, msg.sender);

        emit WithdrawalProcessed(msg.sender, activeRoundId);
        return sent;
    }

    /// @notice Adds a public sponsor amount by wrapping the official public underlying directly into this vault.
    /// @dev Commitment is final when this transaction succeeds; there is intentionally no sponsor-withdraw path.
    function contributeSponsor(uint256 roundId, uint64 confidentialAssetBaseUnits) external nonReentrant {
        if (!_isActiveRoundOpen()) revert RoundNotOpen();
        if (roundId != activeRoundId && roundId != activeRoundId + 1) revert InvalidSponsorRound();
        if (confidentialAssetBaseUnits == 0) revert InvalidSponsorAmount();
        uint64 previous = publicSponsoredPrize[roundId];
        if (uint256(previous) + confidentialAssetBaseUnits > MAX_POOL_BASE_UNITS) revert InvalidSponsorAmount();

        uint256 underlyingAmount = uint256(confidentialAssetBaseUnits) * WRAP_RATE;
        IERC20 underlying = IERC20(UNDERLYING);
        underlying.safeTransferFrom(msg.sender, address(this), underlyingAmount);
        underlying.forceApprove(address(ASSET), underlyingAmount);
        euint64 wrapped = ASSET.wrap(address(this), underlyingAmount);
        underlying.forceApprove(address(ASSET), 0);

        _sponsoredPrize[roundId] = FHE.add(_sponsoredPrize[roundId], wrapped);
        _liquidPrizeAssets = FHE.add(_liquidPrizeAssets, wrapped);
        publicSponsoredPrize[roundId] = previous + confidentialAssetBaseUnits;
        FHE.allowThis(_sponsoredPrize[roundId]);
        FHE.allowThis(_liquidPrizeAssets);

        emit SponsorContributionCommitted(msg.sender, roundId, confidentialAssetBaseUnits);
    }

    function closeRound() external {
        Round storage round = _rounds[activeRoundId];
        if (round.state != RoundState.OPEN) revert InvalidRoundState(round.state, RoundState.OPEN);
        if (block.timestamp < round.closesAt) revert RoundStillOpen();

        uint256 closingRoundId = activeRoundId;
        _accrueGlobal(round.closesAt);
        euint128 aggregate = FHE.sub(_globalCumulative, round.startCumulative);
        round.aggregateTwab = aggregate;
        round.publicPrize = publicSponsoredPrize[closingRoundId];
        round.reservedPrize = _sponsoredPrize[closingRoundId];
        _reservedPrize = FHE.add(_reservedPrize, round.reservedPrize);
        round.state = RoundState.AGGREGATE_PENDING;
        FHE.allowThis(aggregate);
        FHE.allowThis(round.reservedPrize);
        FHE.allowThis(_reservedPrize);
        FHE.makePubliclyDecryptable(aggregate);

        uint256 nextRoundId = closingRoundId + 1;
        activeRoundId = nextRoundId;
        _initializeRound(nextRoundId, round.closesAt, _globalCumulative);
        emit RoundClosed(closingRoundId, nextRoundId);
    }

    function finalizeAggregate(
        uint256 roundId,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        Round storage round = _rounds[roundId];
        if (round.state != RoundState.AGGREGATE_PENDING) {
            revert InvalidRoundState(round.state, RoundState.AGGREGATE_PENDING);
        }
        if (abiEncodedCleartexts.length != 32) revert InvalidCleartextEncoding();
        uint256 clearValue = abi.decode(abiEncodedCleartexts, (uint256));
        if (clearValue > MAX_AGGREGATE_TWAB) revert AggregateOutOfDomain();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(round.aggregateTwab);
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);
        round.publicAggregateTwab = uint128(clearValue);
        round.state = clearValue == 0 ? RoundState.EMPTY : RoundState.AGGREGATE_FINALIZED;
        emit AggregateFinalized(roundId, uint128(clearValue));
    }

    function generateRandomCandidate(uint256 roundId) external {
        Round storage round = _rounds[roundId];
        if (round.state != RoundState.AGGREGATE_FINALIZED && round.state != RoundState.CANDIDATE_REJECTED) {
            revert InvalidRoundState(round.state, RoundState.AGGREGATE_FINALIZED);
        }
        uint128 totalWeight = round.publicAggregateTwab;
        if (totalWeight == 0 || totalWeight > MAX_AGGREGATE_TWAB) revert AggregateOutOfDomain();

        euint128 candidate = FHE.randEuint128();
        round.candidate = candidate;
        FHE.allowThis(candidate);
        uint32 attempt = ++candidateAttempts[roundId];

        uint256 domain = uint256(1) << 128;
        uint256 limit = (domain / totalWeight) * totalWeight;
        if (limit == domain) {
            euint128 ticket = FHE.rem(candidate, totalWeight);
            round.acceptedTicket = ticket;
            round.state = RoundState.TICKET_ACCEPTED;
            FHE.allowThis(ticket);
            emit RandomCandidateGenerated(roundId, attempt);
            emit TicketAccepted(roundId);
            return;
        }

        ebool valid = FHE.lt(candidate, uint128(limit));
        round.candidateValid = valid;
        round.state = RoundState.CANDIDATE_VALIDITY_PENDING;
        FHE.allowThis(valid);
        FHE.makePubliclyDecryptable(valid);
        emit RandomCandidateGenerated(roundId, attempt);
    }

    function finalizeCandidateValidity(
        uint256 roundId,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        Round storage round = _rounds[roundId];
        if (round.state != RoundState.CANDIDATE_VALIDITY_PENDING) revert CandidateNotPending();
        if (abiEncodedCleartexts.length != 32) revert InvalidCleartextEncoding();
        bool valid = abi.decode(abiEncodedCleartexts, (bool));
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(round.candidateValid);
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        if (!valid) {
            round.state = RoundState.CANDIDATE_REJECTED;
            emit CandidateObjectivelyRejected(roundId);
            return;
        }
        euint128 ticket = FHE.rem(round.candidate, round.publicAggregateTwab);
        round.acceptedTicket = ticket;
        round.state = RoundState.TICKET_ACCEPTED;
        FHE.allowThis(ticket);
        emit TicketAccepted(roundId);
    }

    function materializeMyRoundWeight(uint256 roundId) external returns (euint128) {
        Round storage round = _rounds[roundId];
        if (round.state == RoundState.UNINITIALIZED || round.state == RoundState.OPEN) revert WeightUnavailable();
        euint128 start = _cumulativeAt(msg.sender, round.opensAt);
        euint128 end = _cumulativeAt(msg.sender, round.closesAt);
        euint128 weight = FHE.sub(end, start);
        _materializedWeight[roundId][msg.sender] = weight;
        FHE.allowThis(weight);
        FHE.allow(weight, msg.sender);
        return weight;
    }

    function setAutoSavePreference(AutoSavePreference preference) external {
        autoSavePreference[msg.sender] = preference;
        emit AutoSavePreferenceSet(msg.sender, preference);
    }

    function participantCount() external view returns (uint256) {
        return _participants.length;
    }

    function participantAt(uint256 index) external view returns (address) {
        return _participants[index];
    }

    function observationCount(address account) external view returns (uint256) {
        return _observations[account].length;
    }

    function observationAt(address account, uint256 index) external view returns (uint64, euint64, euint128) {
        Observation storage observation = _observations[account][index];
        return (observation.timestamp, observation.balance, observation.cumulative);
    }

    function principalOf(address account) external view returns (euint64) {
        return _principal[account];
    }

    function winningsOf(address account) external view returns (euint64) {
        return _winnings[account];
    }

    function materializedWeightOf(uint256 roundId, address account) external view returns (euint128) {
        return _materializedWeight[roundId][account];
    }

    function aggregateTwabHandle(uint256 roundId) external view returns (euint128) {
        return _rounds[roundId].aggregateTwab;
    }

    function roundReservedPrizeHandle(uint256 roundId) external view returns (euint64) {
        return _rounds[roundId].reservedPrize;
    }

    function candidateValidityHandle(uint256 roundId) external view returns (ebool) {
        return _rounds[roundId].candidateValid;
    }

    function roundInfo(uint256 roundId) external view returns (uint64, uint64, RoundState, uint128, uint64, uint32) {
        Round storage round = _rounds[roundId];
        return (
            round.opensAt,
            round.closesAt,
            round.state,
            round.publicAggregateTwab,
            round.publicPrize,
            round.selectionCursor
        );
    }

    function encryptedAccounting()
        external
        view
        returns (euint64, euint64, euint64, euint64, euint64, euint64, euint64)
    {
        return (
            _totalPrincipal,
            _liquidPrincipal,
            _deployedPrincipal,
            _realizedSurplus,
            _reservedPrize,
            _liquidPrizeAssets,
            _winningsLiability
        );
    }

    function _initializeRound(uint256 roundId, uint64 opensAt, euint128 startCumulative) private {
        Round storage round = _rounds[roundId];
        round.opensAt = opensAt;
        round.closesAt = opensAt + ROUND_DURATION;
        round.state = RoundState.OPEN;
        round.startCumulative = startCumulative;
        FHE.allowThis(startCumulative);
    }

    function _isActiveRoundOpen() private view returns (bool) {
        Round storage round = _rounds[activeRoundId];
        return round.state == RoundState.OPEN && block.timestamp >= round.opensAt && block.timestamp < round.closesAt;
    }

    function _accrueGlobal(uint64 timestamp) private {
        uint64 elapsed = timestamp - _globalTimestamp;
        if (elapsed != 0) {
            euint128 widenedBalance = FHE.asEuint128(_globalBalance);
            euint128 delta = FHE.mul(widenedBalance, uint128(elapsed));
            _globalCumulative = FHE.add(_globalCumulative, delta);
            _globalTimestamp = timestamp;
            FHE.allowThis(_globalCumulative);
        }
    }

    function _checkpointUser(address account, euint64 newBalance, uint64 timestamp) private {
        Observation[] storage observations = _observations[account];
        euint128 cumulative;
        if (observations.length == 0) {
            cumulative = FHE.asEuint128(0);
        } else {
            Observation storage previous = observations[observations.length - 1];
            uint64 elapsed = timestamp - previous.timestamp;
            cumulative = previous.cumulative;
            if (elapsed != 0) {
                euint128 widenedBalance = FHE.asEuint128(previous.balance);
                cumulative = FHE.add(cumulative, FHE.mul(widenedBalance, uint128(elapsed)));
            }
            if (elapsed == 0) {
                previous.balance = newBalance;
                previous.cumulative = cumulative;
                FHE.allowThis(newBalance);
                FHE.allowThis(cumulative);
                return;
            }
        }
        observations.push(Observation({timestamp: timestamp, balance: newBalance, cumulative: cumulative}));
        FHE.allowThis(newBalance);
        FHE.allowThis(cumulative);
    }

    function _cumulativeAt(address account, uint64 timestamp) private returns (euint128) {
        Observation[] storage observations = _observations[account];
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
        euint128 widenedBalance = FHE.asEuint128(observation.balance);
        return FHE.add(observation.cumulative, FHE.mul(widenedBalance, uint128(elapsed)));
    }

    function _persistPrincipalState(address account) private {
        FHE.allowThis(_principal[account]);
        FHE.allow(_principal[account], account);
        FHE.allowThis(_totalPrincipal);
        FHE.allowThis(_liquidPrincipal);
        FHE.allowThis(_globalBalance);
    }
}
