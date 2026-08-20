// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,max-states-count,gas-struct-packing,named-parameters-mapping */
/* solhint-disable gas-indexed-events,gas-strict-inequalities,function-max-lines */

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/interfaces/IERC7984ERC20Wrapper.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";
import {LeopoldCompoundAdapter} from "./LeopoldCompoundAdapter.sol";
import {LeopoldSettlementBondEscrow} from "./LeopoldSettlementBondEscrow.sol";
import {ICompoundComet} from "./interfaces/ICompoundComet.sol";

interface ILeopoldWrapperUnwrap {
    function unwrap(address from, address to, euint64 amount) external returns (bytes32);
}

/// @title Leopold confidential prize-savings vault
/// @notice One non-upgradeable implementation deployed independently for each official vault.
/// @dev Bounded private draw settlement and isolated aggregate Compound strategy accounting are integrated.
contract LeopoldVault is ZamaEthereumConfig, ReentrancyGuardTransient, IERC7984Receiver {
    using SafeERC20 for IERC20;

    uint64 private constant MAX_POOL_BASE_UNITS = 1_000_000_000_000_000;
    uint64 private constant MAX_ROUND_DURATION = 31_536_000;
    uint128 private constant MAX_AGGREGATE_TWAB = 31_536_000_000_000_000_000_000;
    /// @dev Temporary conservative bound; finalized from the live HCU evidence for this implementation.
    uint256 private constant MAX_SELECTION_CHUNK = 4;
    uint256 private constant MAX_ALLOCATION_CHUNK = 4;
    uint64 private constant LIQUIDITY_BUFFER_BPS = 7_500;
    uint64 private constant BPS = 10_000;
    uint64 private constant STRATEGY_PROOF_DEADLINE = 1 days;

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
        SETTLED,
        RECONCILIATION_PENDING,
        RECONCILIATION_FAILED,
        READY_TO_ALLOCATE,
        ALLOCATION_PROCESSING
    }

    enum AutoSavePreference {
        KEEP_AVAILABLE,
        AUTO_SAVE
    }

    enum StrategyEpochKind {
        NONE,
        DEPLOY,
        REPLENISH
    }

    enum StrategyEpochState {
        NONE,
        AGING,
        AMOUNT_PENDING,
        UNWRAP_PENDING,
        COMPLETED,
        CANCELLED
    }

    struct StrategyEpoch {
        StrategyEpochKind kind;
        StrategyEpochState state;
        uint64 openedAt;
        euint64 amount;
        bytes32 unwrapRequestId;
        uint64 publicAmount;
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
        RoundState state;
        euint128 aggregateTwab;
        uint128 publicAggregateTwab;
        uint64 publicPrize;
        euint128 candidate;
        ebool candidateValid;
        euint128 acceptedTicket;
        uint256 participantCountSnapshot;
        uint256 selectionCursor;
        uint256 allocationCursor;
        euint64 reservedPrize;
        euint128 selectionCumulative;
        euint64 encryptedWinnerCount;
        ebool reconciliationValid;
        euint64 eligibleBalance;
        euint128 eligibleCumulative;
        uint64 eligibleTimestamp;
    }

    uint8 public immutable VAULT_ID;
    VaultType public immutable VAULT_TYPE;
    bytes32 public immutable VAULT_NAME;
    uint64 public immutable ROUND_DURATION;
    IERC7984ERC20Wrapper public immutable ASSET;
    address public immutable UNDERLYING;
    uint256 private immutable WRAP_RATE;
    LeopoldCompoundAdapter public immutable STRATEGY;
    address private immutable STRATEGY_GUARDIAN;
    uint64 private immutable MINIMUM_STRATEGY_EPOCH_AGE;
    LeopoldSettlementBondEscrow public immutable SETTLEMENT_BOND_ESCROW;

    uint256 public activeRoundId;
    mapping(uint256 roundId => Round) private _rounds;

    mapping(uint256 roundId => address[]) private _roundParticipants;
    mapping(uint256 roundId => mapping(address account => uint64)) public eligibilityStart;
    mapping(address account => Observation[]) private _observations;
    mapping(address account => euint64) private _principal;
    mapping(address account => euint64) private _winnings;
    mapping(address account => AutoSavePreference) public autoSavePreference;
    mapping(address account => PreferenceObservation[]) private _preferenceObservations;
    mapping(uint256 roundId => mapping(address account => ebool)) private _winnerPredicate;

    euint64 private _totalPrincipal;
    euint64 private _liquidPrincipal;
    euint64 private _deployedPrincipal;
    euint64 private _principalInTransition;
    euint64 private _strategyShortfall;
    euint64 private _liquidPrizeAssets;
    euint64 private _realizedSurplus;
    euint64 private _reservedPrize;
    euint64 private _winningsLiability;
    mapping(uint256 roundId => euint64) private _sponsoredPrize;
    mapping(uint256 roundId => uint64) public publicSponsoredPrize;
    euint64 private _uncommittedYield;
    uint64 public publicUncommittedYield;
    uint256 public activeStrategyEpochId;
    mapping(uint256 epochId => StrategyEpoch) private _strategyEpochs;

    error InvalidAddress();
    error InvalidConfiguration();
    error InvalidRound();
    error InvalidRoundState(RoundState actual, RoundState expected);
    error RoundStillOpen();
    error RoundNotOpen();
    error UnauthorizedBondEscrow();
    error ParticipantAlreadyRegistered();
    error ParticipantNotRegistered();
    error UnauthorizedAsset();
    error InvalidCallbackData();
    error InvalidSponsorRound();
    error InvalidSponsorAmount();
    error AggregateOutOfDomain();
    error InvalidCleartextEncoding();
    error CandidateNotPending();
    error WeightUnavailable();
    error InvalidChunkSize();
    error ReconciliationNotPending();
    error SettlementNotReady();
    error StrategyDisabled();
    error StrategyPaused();
    error StrategyEpochPending();
    error StrategyEpochNotReady();
    error InvalidStrategyEpoch();
    error StrategyAmountOutOfDomain();

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
    event SelectionProgress(uint256 indexed roundId, uint256 cursor, uint256 participantCountSnapshot);
    event SelectionReconciliationRequested(uint256 indexed roundId);
    event SelectionReconciled(uint256 indexed roundId);
    event SelectionReconciliationFailed(uint256 indexed roundId);
    event AllocationProgress(uint256 indexed roundId, uint256 cursor, uint256 participantCountSnapshot);
    event RoundSettled(uint256 indexed roundId);
    event WinningsWithdrawalProcessed(address indexed account);
    event RoundWeightMaterialized(uint256 indexed roundId, address indexed account, bytes32 handle);
    event AutoSavePreferenceSet(address indexed account, AutoSavePreference preference);
    event StrategyEpochOpened(uint256 indexed epochId, StrategyEpochKind kind, uint64 eligibleAt);
    event StrategyAmountRequested(uint256 indexed epochId, bytes32 indexed handle);
    event StrategyUnwrapRequested(uint256 indexed epochId, bytes32 indexed requestId);
    event StrategyEpochCompleted(uint256 indexed epochId, uint64 amount);
    event StrategyEpochCancelled(uint256 indexed epochId);
    event StrategyYieldHarvested(uint64 amount);
    event StrategyEmergencyUnwound(uint64 recovered, uint64 shortfall);

    mapping(uint256 roundId => uint32) private _candidateAttempts;

    constructor(
        uint8 vaultId,
        VaultType vaultType,
        bytes32 vaultName,
        uint64 roundDuration,
        IERC7984ERC20Wrapper asset,
        uint64 firstRoundOpensAt,
        ICompoundComet compoundComet,
        address strategyGuardian,
        uint64 minimumStrategyEpochAge,
        uint256 settlementBondAmount,
        uint256 settlementRewardPerParticipantPass
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
        if (address(compoundComet) == address(0)) {
            if (strategyGuardian != address(0) || minimumStrategyEpochAge != 0) revert InvalidConfiguration();
            STRATEGY = LeopoldCompoundAdapter(address(0));
            STRATEGY_GUARDIAN = address(0);
            MINIMUM_STRATEGY_EPOCH_AGE = 0;
        } else {
            if (strategyGuardian == address(0) || minimumStrategyEpochAge == 0) revert InvalidConfiguration();
            STRATEGY = new LeopoldCompoundAdapter(underlying, compoundComet, strategyGuardian);
            STRATEGY_GUARDIAN = strategyGuardian;
            MINIMUM_STRATEGY_EPOCH_AGE = minimumStrategyEpochAge;
        }
        SETTLEMENT_BOND_ESCROW = new LeopoldSettlementBondEscrow(
            address(this),
            settlementBondAmount,
            settlementRewardPerParticipantPass
        );

        euint64 zero64 = FHE.asEuint64(0);
        euint128 zero128 = FHE.asEuint128(0);
        _totalPrincipal = zero64;
        _liquidPrincipal = zero64;
        _deployedPrincipal = zero64;
        _principalInTransition = zero64;
        _strategyShortfall = zero64;
        _liquidPrizeAssets = zero64;
        _realizedSurplus = zero64;
        _reservedPrize = zero64;
        _winningsLiability = zero64;
        _uncommittedYield = zero64;
        FHE.allowThis(zero64);
        FHE.allowThis(zero128);

        activeRoundId = 1;
        _initializeRound(1, firstRoundOpensAt);
    }

    function acceptBondRegistration(uint256 roundId, address account) external {
        if (msg.sender != address(SETTLEMENT_BOND_ESCROW)) revert UnauthorizedBondEscrow();
        if (account == address(0) || roundId != activeRoundId) revert InvalidRound();
        if (!_isActiveRoundOpen()) revert RoundNotOpen();
        if (eligibilityStart[roundId][account] != 0) revert ParticipantAlreadyRegistered();
        eligibilityStart[roundId][account] = uint64(block.timestamp);
        _roundParticipants[roundId].push(account);
        Round storage round = _rounds[roundId];
        _accrueEligible(round, uint64(block.timestamp));
        euint64 principal = _principal[account];
        if (euint64.unwrap(principal) == bytes32(0)) principal = FHE.asEuint64(0);
        round.eligibleBalance = FHE.add(round.eligibleBalance, principal);
        FHE.allowThis(round.eligibleBalance);
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
        if (!_isActiveRoundOpen()) revert RoundNotOpen();

        euint64 remainingCapacity = FHE.sub(MAX_POOL_BASE_UNITS, _totalPrincipal);
        ebool withinCap = FHE.le(amount, remainingCapacity);
        ebool positive = FHE.gt(amount, uint64(0));
        ebool accepted = FHE.and(withinCap, positive);
        euint64 acceptedAmount = FHE.select(accepted, amount, FHE.asEuint64(0));

        euint64 newUserBalance = FHE.add(_principal[from], acceptedAmount);
        _checkpointUser(from, newUserBalance, uint64(block.timestamp));
        _principal[from] = newUserBalance;
        _totalPrincipal = FHE.add(_totalPrincipal, acceptedAmount);
        _liquidPrincipal = FHE.add(_liquidPrincipal, acceptedAmount);
        if (eligibilityStart[activeRoundId][from] != 0) {
            Round storage round = _rounds[activeRoundId];
            _accrueEligible(round, uint64(block.timestamp));
            round.eligibleBalance = FHE.add(round.eligibleBalance, acceptedAmount);
            FHE.allowThis(round.eligibleBalance);
        }
        _persistPrincipalState(from);
        FHE.allowTransient(accepted, msg.sender);

        emit DepositProcessed(from, activeRoundId);
        return accepted;
    }

    function withdraw(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant returns (euint64) {
        if (!_isActiveRoundOpen()) revert RoundNotOpen();

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        ebool withinUserBalance = FHE.le(requested, _principal[msg.sender]);
        ebool withinLiquidPrincipal = FHE.le(requested, _liquidPrincipal);
        euint64 eligible = FHE.select(FHE.and(withinUserBalance, withinLiquidPrincipal), requested, FHE.asEuint64(0));

        FHE.allowTransient(eligible, address(ASSET));
        euint64 sent = ASSET.confidentialTransfer(msg.sender, eligible);

        euint64 newUserBalance = FHE.sub(_principal[msg.sender], sent);
        _checkpointUser(msg.sender, newUserBalance, uint64(block.timestamp));
        _principal[msg.sender] = newUserBalance;
        _totalPrincipal = FHE.sub(_totalPrincipal, sent);
        _liquidPrincipal = FHE.sub(_liquidPrincipal, sent);
        if (eligibilityStart[activeRoundId][msg.sender] != 0) {
            Round storage round = _rounds[activeRoundId];
            _accrueEligible(round, uint64(block.timestamp));
            round.eligibleBalance = FHE.sub(round.eligibleBalance, sent);
            FHE.allowThis(round.eligibleBalance);
        }
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
        euint64 wrapped = _wrapUnderlying(underlyingAmount);

        _sponsoredPrize[roundId] = FHE.add(_sponsoredPrize[roundId], wrapped);
        _liquidPrizeAssets = FHE.add(_liquidPrizeAssets, wrapped);
        publicSponsoredPrize[roundId] = previous + confidentialAssetBaseUnits;
        FHE.allowThis(_sponsoredPrize[roundId]);
        FHE.allowThis(_liquidPrizeAssets);

        emit SponsorContributionCommitted(msg.sender, roundId, confidentialAssetBaseUnits);
    }

    /// @notice Opens a vault-level, aggregate strategy operation; user deposits remain complete and independent.
    function openStrategyEpoch(StrategyEpochKind kind) external returns (uint256 epochId) {
        _requireStrategy();
        if (kind == StrategyEpochKind.NONE) revert InvalidStrategyEpoch();
        if (STRATEGY.paused()) revert StrategyPaused();
        StrategyEpoch storage current = _strategyEpochs[activeStrategyEpochId];
        if (
            current.state != StrategyEpochState.NONE &&
            current.state != StrategyEpochState.COMPLETED &&
            current.state != StrategyEpochState.CANCELLED
        ) revert StrategyEpochPending();
        epochId = ++activeStrategyEpochId;
        StrategyEpoch storage epoch = _strategyEpochs[epochId];
        epoch.kind = kind;
        epoch.state = StrategyEpochState.AGING;
        epoch.openedAt = uint64(block.timestamp);
        emit StrategyEpochOpened(epochId, kind, uint64(block.timestamp) + MINIMUM_STRATEGY_EPOCH_AGE);
    }

    /// @notice Derives the objective encrypted aggregate after the epoch privacy delay.
    function requestStrategyAmount(uint256 epochId) external nonReentrant {
        StrategyEpoch storage epoch = _strategyEpoch(epochId, StrategyEpochState.AGING);
        if (block.timestamp < uint256(epoch.openedAt) + MINIMUM_STRATEGY_EPOCH_AGE) revert StrategyEpochNotReady();

        euint64 target = FHE.div(FHE.mul(_totalPrincipal, LIQUIDITY_BUFFER_BPS), BPS);
        if (epoch.kind == StrategyEpochKind.DEPLOY) {
            if (STRATEGY.paused()) revert StrategyPaused();
            ebool hasExcess = FHE.gt(_liquidPrincipal, target);
            euint64 excess = FHE.select(hasExcess, FHE.sub(_liquidPrincipal, target), FHE.asEuint64(0));
            _liquidPrincipal = FHE.sub(_liquidPrincipal, excess);
            _principalInTransition = FHE.add(_principalInTransition, excess);
            epoch.amount = excess;
            FHE.allowThis(excess);
            FHE.allowTransient(excess, address(ASSET));
            bytes32 requestId = ILeopoldWrapperUnwrap(address(ASSET)).unwrap(address(this), address(this), excess);
            epoch.unwrapRequestId = requestId;
            epoch.state = StrategyEpochState.UNWRAP_PENDING;
            emit StrategyUnwrapRequested(epochId, requestId);
        } else {
            ebool belowTarget = FHE.lt(_liquidPrincipal, target);
            euint64 deficit = FHE.select(belowTarget, FHE.sub(target, _liquidPrincipal), FHE.asEuint64(0));
            uint256 publicBasis = STRATEGY.deployedPrincipalBasis() / WRAP_RATE;
            if (publicBasis > type(uint64).max) revert StrategyAmountOutOfDomain();
            ebool withinBasis = FHE.le(deficit, uint64(publicBasis));
            deficit = FHE.select(withinBasis, deficit, FHE.asEuint64(uint64(publicBasis)));
            epoch.amount = deficit;
            epoch.state = StrategyEpochState.AMOUNT_PENDING;
            FHE.allowThis(deficit);
            FHE.makePubliclyDecryptable(deficit);
            emit StrategyAmountRequested(epochId, FHE.toBytes32(deficit));
        }
        FHE.allowThis(_liquidPrincipal);
        FHE.allowThis(_principalInTransition);
    }

    /// @notice Finalizes the wrapper-bound aggregate proof and deploys the resulting public USDC.
    function finalizeStrategyDeployment(
        uint256 epochId,
        uint64 clearAmount,
        bytes calldata decryptionProof
    ) external nonReentrant {
        StrategyEpoch storage epoch = _strategyEpoch(epochId, StrategyEpochState.UNWRAP_PENDING);
        if (epoch.kind != StrategyEpochKind.DEPLOY || clearAmount > MAX_POOL_BASE_UNITS) {
            revert StrategyAmountOutOfDomain();
        }
        ASSET.finalizeUnwrap(epoch.unwrapRequestId, clearAmount, decryptionProof);
        uint256 underlyingAmount = uint256(clearAmount) * WRAP_RATE;
        IERC20 underlying = IERC20(UNDERLYING);
        underlying.forceApprove(address(STRATEGY), underlyingAmount);
        uint256 deployed = STRATEGY.deployAssets(underlyingAmount);
        underlying.forceApprove(address(STRATEGY), 0);
        if (deployed != underlyingAmount) revert StrategyAmountOutOfDomain();

        euint64 encryptedAmount = FHE.asEuint64(clearAmount);
        _principalInTransition = FHE.sub(_principalInTransition, encryptedAmount);
        _deployedPrincipal = FHE.add(_deployedPrincipal, encryptedAmount);
        epoch.publicAmount = clearAmount;
        epoch.state = StrategyEpochState.COMPLETED;
        FHE.allowThis(_principalInTransition);
        FHE.allowThis(_deployedPrincipal);
        emit StrategyEpochCompleted(epochId, clearAmount);
    }

    /// @notice Finalizes the objective buffer deficit and restores aggregate liquid Private USDC.
    function finalizeStrategyReplenishment(
        uint256 epochId,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external nonReentrant {
        StrategyEpoch storage epoch = _strategyEpoch(epochId, StrategyEpochState.AMOUNT_PENDING);
        if (epoch.kind != StrategyEpochKind.REPLENISH || abiEncodedCleartexts.length != 32) {
            revert InvalidStrategyEpoch();
        }
        uint256 decoded = abi.decode(abiEncodedCleartexts, (uint256));
        if (decoded > MAX_POOL_BASE_UNITS || decoded * WRAP_RATE > STRATEGY.deployedPrincipalBasis()) {
            revert StrategyAmountOutOfDomain();
        }
        _checkPublicProof(FHE.toBytes32(epoch.amount), abiEncodedCleartexts, decryptionProof);
        uint64 clearAmount = uint64(decoded);
        uint256 recovered = STRATEGY.withdrawPrincipal(decoded * WRAP_RATE);
        if (recovered != decoded * WRAP_RATE) revert StrategyAmountOutOfDomain();
        euint64 wrapped = _wrapUnderlying(recovered);
        _deployedPrincipal = FHE.sub(_deployedPrincipal, FHE.asEuint64(clearAmount));
        _liquidPrincipal = FHE.add(_liquidPrincipal, wrapped);
        epoch.publicAmount = clearAmount;
        epoch.state = StrategyEpochState.COMPLETED;
        FHE.allowThis(_deployedPrincipal);
        FHE.allowThis(_liquidPrincipal);
        emit StrategyEpochCompleted(epochId, clearAmount);
    }

    /// @notice Realizes only Compound assets above the adapter's unchanged principal basis.
    function harvestStrategyYield() external nonReentrant returns (uint64 harvested) {
        _requireStrategy();
        uint256 recovered = STRATEGY.harvest();
        if (recovered == 0) return 0;
        uint256 confidentialUnits = recovered / WRAP_RATE;
        if (confidentialUnits > type(uint64).max || recovered % WRAP_RATE != 0) revert StrategyAmountOutOfDomain();
        euint64 wrapped = _wrapUnderlying(recovered);
        harvested = uint64(confidentialUnits);
        _uncommittedYield = FHE.add(_uncommittedYield, wrapped);
        _realizedSurplus = FHE.add(_realizedSurplus, wrapped);
        _liquidPrizeAssets = FHE.add(_liquidPrizeAssets, wrapped);
        publicUncommittedYield += harvested;
        FHE.allowThis(_uncommittedYield);
        FHE.allowThis(_realizedSurplus);
        FHE.allowThis(_liquidPrizeAssets);
        emit StrategyYieldHarvested(harvested);
    }

    function setStrategyPaused(bool paused_) external {
        _requireStrategy();
        if (msg.sender != STRATEGY_GUARDIAN) revert InvalidAddress();
        STRATEGY.setPaused(paused_);
    }

    /// @notice Unwinds to this vault; no guardian or caller ever receives principal custody.
    function emergencyUnwindStrategy() external nonReentrant {
        _requireStrategy();
        if (!STRATEGY.paused()) revert StrategyPaused();
        uint256 basisBefore = STRATEGY.deployedPrincipalBasis();
        (uint256 recovered, uint256 shortfall) = STRATEGY.emergencyExit();
        if (recovered % WRAP_RATE != 0 || shortfall % WRAP_RATE != 0) revert StrategyAmountOutOfDomain();
        uint64 recoveredUnits = uint64(recovered / WRAP_RATE);
        uint64 shortfallUnits = uint64(shortfall / WRAP_RATE);
        if (recovered != 0) {
            _wrapUnderlying(recovered);
        }
        uint256 principalRecovered = recovered < basisBefore ? recovered : basisBefore;
        uint256 surplusRecovered = recovered - principalRecovered;
        _liquidPrincipal = FHE.add(_liquidPrincipal, FHE.asEuint64(uint64(principalRecovered / WRAP_RATE)));
        if (surplusRecovered != 0) {
            uint64 surplusUnits = uint64(surplusRecovered / WRAP_RATE);
            euint64 encryptedSurplus = FHE.asEuint64(surplusUnits);
            _uncommittedYield = FHE.add(_uncommittedYield, encryptedSurplus);
            _realizedSurplus = FHE.add(_realizedSurplus, encryptedSurplus);
            _liquidPrizeAssets = FHE.add(_liquidPrizeAssets, encryptedSurplus);
            publicUncommittedYield += surplusUnits;
            FHE.allowThis(_uncommittedYield);
            FHE.allowThis(_realizedSurplus);
            FHE.allowThis(_liquidPrizeAssets);
        }
        _deployedPrincipal = FHE.asEuint64(0);
        _strategyShortfall = FHE.add(_strategyShortfall, FHE.asEuint64(shortfallUnits));
        FHE.allowThis(_liquidPrincipal);
        FHE.allowThis(_deployedPrincipal);
        FHE.allowThis(_strategyShortfall);
        emit StrategyEmergencyUnwound(recoveredUnits, shortfallUnits);
    }

    function cancelAgingStrategyEpoch(uint256 epochId) external {
        StrategyEpoch storage epoch = _strategyEpoch(epochId, StrategyEpochState.AGING);
        epoch.state = StrategyEpochState.CANCELLED;
        emit StrategyEpochCancelled(epochId);
    }

    /// @notice Recovers an expired epoch. A burned confidential amount still requires its authentic public proof.
    function cancelExpiredStrategyEpoch(
        uint256 epochId,
        uint64 clearAmount,
        bytes calldata decryptionProof
    ) external nonReentrant {
        _requireStrategy();
        if (epochId == 0 || epochId != activeStrategyEpochId) revert InvalidStrategyEpoch();
        StrategyEpoch storage epoch = _strategyEpochs[epochId];
        if (block.timestamp < uint256(epoch.openedAt) + MINIMUM_STRATEGY_EPOCH_AGE + STRATEGY_PROOF_DEADLINE) {
            revert StrategyEpochNotReady();
        }
        if (epoch.state == StrategyEpochState.AMOUNT_PENDING) {
            epoch.state = StrategyEpochState.CANCELLED;
            emit StrategyEpochCancelled(epochId);
            return;
        }
        if (epoch.state != StrategyEpochState.UNWRAP_PENDING || clearAmount > MAX_POOL_BASE_UNITS) {
            revert InvalidStrategyEpoch();
        }
        ASSET.finalizeUnwrap(epoch.unwrapRequestId, clearAmount, decryptionProof);
        uint256 underlyingAmount = uint256(clearAmount) * WRAP_RATE;
        euint64 wrapped = _wrapUnderlying(underlyingAmount);
        _principalInTransition = FHE.sub(_principalInTransition, FHE.asEuint64(clearAmount));
        _liquidPrincipal = FHE.add(_liquidPrincipal, wrapped);
        epoch.state = StrategyEpochState.CANCELLED;
        FHE.allowThis(_principalInTransition);
        FHE.allowThis(_liquidPrincipal);
        emit StrategyEpochCancelled(epochId);
    }

    function closeRound() external {
        Round storage round = _rounds[activeRoundId];
        if (round.state != RoundState.OPEN) revert InvalidRoundState(round.state, RoundState.OPEN);
        if (block.timestamp < round.closesAt) revert RoundStillOpen();

        uint256 closingRoundId = activeRoundId;
        _accrueEligible(round, round.closesAt);
        euint128 aggregate = round.eligibleCumulative;
        round.aggregateTwab = aggregate;
        round.publicPrize = publicSponsoredPrize[closingRoundId] + publicUncommittedYield;
        round.reservedPrize = FHE.add(_sponsoredPrize[closingRoundId], _uncommittedYield);
        round.participantCountSnapshot = _roundParticipants[closingRoundId].length;
        _reservedPrize = FHE.add(_reservedPrize, round.reservedPrize);
        _realizedSurplus = FHE.sub(_realizedSurplus, _uncommittedYield);
        _uncommittedYield = FHE.asEuint64(0);
        publicUncommittedYield = 0;
        round.state = RoundState.AGGREGATE_PENDING;
        FHE.allowThis(aggregate);
        FHE.allowThis(round.reservedPrize);
        FHE.allowThis(_reservedPrize);
        FHE.allowThis(_realizedSurplus);
        FHE.allowThis(_uncommittedYield);
        FHE.makePubliclyDecryptable(aggregate);

        uint256 nextRoundId = closingRoundId + 1;
        activeRoundId = nextRoundId;
        _initializeRound(nextRoundId, round.closesAt);
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

        _checkPublicProof(FHE.toBytes32(round.aggregateTwab), abiEncodedCleartexts, decryptionProof);
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
        uint32 attempt = ++_candidateAttempts[roundId];

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
        bool valid = _checkBooleanProof(FHE.toBytes32(round.candidateValid), abiEncodedCleartexts, decryptionProof);

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

    /// @notice Processes the next deterministic participant slice without revealing the winning interval.
    /// @dev Traversal always covers the complete round-close snapshot and never stops at the winner.
    function processSelection(uint256 roundId, uint256 maxParticipants) external {
        if (maxParticipants == 0 || maxParticipants > MAX_SELECTION_CHUNK) revert InvalidChunkSize();
        Round storage round = _rounds[roundId];
        if (round.state == RoundState.TICKET_ACCEPTED) {
            round.state = RoundState.WINNER_PROCESSING;
            round.selectionCumulative = FHE.asEuint128(0);
            round.encryptedWinnerCount = FHE.asEuint64(0);
            FHE.allowThis(round.selectionCumulative);
            FHE.allowThis(round.encryptedWinnerCount);
        } else if (round.state != RoundState.WINNER_PROCESSING) {
            revert InvalidRoundState(round.state, RoundState.WINNER_PROCESSING);
        }

        uint256 cursor = round.selectionCursor;
        uint256 endCursor = cursor + maxParticipants;
        if (endCursor > round.participantCountSnapshot) endCursor = round.participantCountSnapshot;
        for (; cursor < endCursor; ++cursor) {
            address participant = _roundParticipants[roundId][cursor];
            euint128 weight = _roundWeight(roundId, participant, round);
            euint128 intervalEnd = FHE.add(round.selectionCumulative, weight);
            ebool atOrAfterStart = FHE.ge(round.acceptedTicket, round.selectionCumulative);
            ebool beforeEnd = FHE.lt(round.acceptedTicket, intervalEnd);
            ebool positiveWeight = FHE.gt(weight, uint128(0));
            ebool isWinner = FHE.and(FHE.and(atOrAfterStart, beforeEnd), positiveWeight);
            _winnerPredicate[roundId][participant] = isWinner;
            round.selectionCumulative = intervalEnd;
            round.encryptedWinnerCount = FHE.add(round.encryptedWinnerCount, FHE.asEuint64(isWinner));
            FHE.allowThis(isWinner);
            FHE.allowThis(round.selectionCumulative);
            FHE.allowThis(round.encryptedWinnerCount);
        }
        uint256 processed = cursor - round.selectionCursor;
        round.selectionCursor = cursor;
        SETTLEMENT_BOND_ESCROW.creditProgress(roundId, 1, processed, msg.sender);
        emit SelectionProgress(roundId, cursor, round.participantCountSnapshot);

        if (cursor == round.participantCountSnapshot) {
            ebool cumulativeMatches = FHE.eq(round.selectionCumulative, round.publicAggregateTwab);
            ebool exactlyOne = FHE.eq(round.encryptedWinnerCount, uint64(1));
            ebool reconciled = FHE.and(cumulativeMatches, exactlyOne);
            round.reconciliationValid = reconciled;
            round.state = RoundState.RECONCILIATION_PENDING;
            FHE.allowThis(reconciled);
            FHE.makePubliclyDecryptable(reconciled);
            emit SelectionReconciliationRequested(roundId);
        }
    }

    /// @notice Finalizes the minimal objective reconciliation boolean; any valid caller may submit the proof.
    function finalizeSelectionReconciliation(
        uint256 roundId,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        Round storage round = _rounds[roundId];
        if (round.state != RoundState.RECONCILIATION_PENDING) revert ReconciliationNotPending();
        if (abiEncodedCleartexts.length != 32) revert InvalidCleartextEncoding();
        bool valid = _checkBooleanProof(
            FHE.toBytes32(round.reconciliationValid),
            abiEncodedCleartexts,
            decryptionProof
        );
        if (!valid) {
            round.state = RoundState.RECONCILIATION_FAILED;
            emit SelectionReconciliationFailed(roundId);
            return;
        }
        round.state = RoundState.READY_TO_ALLOCATE;
        emit SelectionReconciled(roundId);
    }

    /// @notice Uniformly allocates the prize or auto-saves it across the full snapshotted domain.
    /// @dev Every participant receives the same encrypted operations, ACL calls and observation treatment.
    function processAllocation(uint256 roundId, uint256 maxParticipants) external {
        if (maxParticipants == 0 || maxParticipants > MAX_ALLOCATION_CHUNK) revert InvalidChunkSize();
        if (!_isActiveRoundOpen()) revert RoundNotOpen();
        Round storage round = _rounds[roundId];
        if (round.state == RoundState.READY_TO_ALLOCATE) {
            round.state = RoundState.ALLOCATION_PROCESSING;
        } else if (round.state != RoundState.ALLOCATION_PROCESSING) {
            revert SettlementNotReady();
        }

        _accrueEligible(_rounds[activeRoundId], uint64(block.timestamp));
        uint256 cursor = round.allocationCursor;
        uint256 endCursor = cursor + maxParticipants;
        if (endCursor > round.participantCountSnapshot) endCursor = round.participantCountSnapshot;
        for (; cursor < endCursor; ++cursor) {
            _allocateParticipant(roundId, round, _roundParticipants[roundId][cursor]);
        }
        uint256 processed = cursor - round.allocationCursor;
        round.allocationCursor = cursor;
        SETTLEMENT_BOND_ESCROW.creditProgress(roundId, 2, processed, msg.sender);
        emit AllocationProgress(roundId, cursor, round.participantCountSnapshot);
        if (cursor == round.participantCountSnapshot) round.state = RoundState.WINNINGS_ALLOCATED;
    }

    function finalizeSettlement(uint256 roundId) external {
        Round storage round = _rounds[roundId];
        if (round.state != RoundState.WINNINGS_ALLOCATED) {
            revert InvalidRoundState(round.state, RoundState.WINNINGS_ALLOCATED);
        }
        round.state = RoundState.SETTLED;
        SETTLEMENT_BOND_ESCROW.finalizeRound(roundId, 2);
        emit RoundSettled(roundId);
    }

    /// @notice Safely terminates an objectively failed reconciliation without consuming allocation rewards.
    function recoverFailedReconciliation(uint256 roundId) external {
        Round storage round = _rounds[roundId];
        if (round.state != RoundState.RECONCILIATION_FAILED) revert SettlementNotReady();
        _rollPrizeForward(round);
        round.state = RoundState.SETTLED;
        SETTLEMENT_BOND_ESCROW.finalizeRound(roundId, 1);
        emit RoundSettled(roundId);
    }

    /// @notice Rolls an empty round's entire prize into the currently open round without generating randomness.
    function settleEmptyRound(uint256 roundId) external {
        Round storage round = _rounds[roundId];
        if (round.state != RoundState.EMPTY) revert InvalidRoundState(round.state, RoundState.EMPTY);
        _rollPrizeForward(round);
        round.state = RoundState.SETTLED;
        SETTLEMENT_BOND_ESCROW.finalizeRound(roundId, 0);
        emit RoundSettled(roundId);
    }

    function _rollPrizeForward(Round storage round) private {
        uint256 destinationRoundId = activeRoundId;
        _sponsoredPrize[destinationRoundId] = FHE.add(_sponsoredPrize[destinationRoundId], round.reservedPrize);
        _reservedPrize = FHE.sub(_reservedPrize, round.reservedPrize);
        round.reservedPrize = FHE.asEuint64(0);
        publicSponsoredPrize[destinationRoundId] += round.publicPrize;
        FHE.allowThis(_sponsoredPrize[destinationRoundId]);
        FHE.allowThis(_reservedPrize);
        FHE.allowThis(round.reservedPrize);
    }

    function withdrawWinnings(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant returns (euint64) {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        ebool entitled = FHE.le(requested, _winnings[msg.sender]);
        ebool liquid = FHE.le(requested, _liquidPrizeAssets);
        euint64 eligible = FHE.select(FHE.and(entitled, liquid), requested, FHE.asEuint64(0));
        FHE.allowTransient(eligible, address(ASSET));
        euint64 sent = ASSET.confidentialTransfer(msg.sender, eligible);
        _winnings[msg.sender] = FHE.sub(_winnings[msg.sender], sent);
        _winningsLiability = FHE.sub(_winningsLiability, sent);
        _liquidPrizeAssets = FHE.sub(_liquidPrizeAssets, sent);
        FHE.allowThis(_winnings[msg.sender]);
        FHE.allow(_winnings[msg.sender], msg.sender);
        FHE.allowThis(_winningsLiability);
        FHE.allowThis(_liquidPrizeAssets);
        FHE.allow(sent, msg.sender);
        emit WinningsWithdrawalProcessed(msg.sender);
        return sent;
    }

    function materializeMyRoundWeight(uint256 roundId) external returns (euint128) {
        Round storage round = _rounds[roundId];
        if (round.state == RoundState.UNINITIALIZED || round.state == RoundState.OPEN) revert WeightUnavailable();
        uint64 startTimestamp = eligibilityStart[roundId][msg.sender];
        if (startTimestamp == 0) revert ParticipantNotRegistered();
        euint128 start = _cumulativeAt(msg.sender, startTimestamp);
        euint128 end = _cumulativeAt(msg.sender, round.closesAt);
        euint128 weight = FHE.sub(end, start);
        FHE.allowThis(weight);
        FHE.allow(weight, msg.sender);
        emit RoundWeightMaterialized(roundId, msg.sender, FHE.toBytes32(weight));
        return weight;
    }

    function setAutoSavePreference(AutoSavePreference preference) external {
        autoSavePreference[msg.sender] = preference;
        PreferenceObservation[] storage observations = _preferenceObservations[msg.sender];
        uint64 timestamp = uint64(block.timestamp);
        if (observations.length != 0 && observations[observations.length - 1].timestamp == timestamp) {
            observations[observations.length - 1].preference = preference;
        } else {
            observations.push(PreferenceObservation({timestamp: timestamp, preference: preference}));
        }
        emit AutoSavePreferenceSet(msg.sender, preference);
    }

    function principalOf(address account) external view returns (euint64) {
        return _principal[account];
    }

    function winningsOf(address account) external view returns (euint64) {
        return _winnings[account];
    }

    function aggregateTwabHandle(uint256 roundId) external view returns (euint128) {
        return _rounds[roundId].aggregateTwab;
    }

    function candidateValidityHandle(uint256 roundId) external view returns (ebool) {
        return _rounds[roundId].candidateValid;
    }

    function roundInfo(
        uint256 roundId
    ) external view returns (uint64, uint64, RoundState, uint128, uint64, uint256, uint256, uint256) {
        Round storage round = _rounds[roundId];
        return (
            round.opensAt,
            round.closesAt,
            round.state,
            round.publicAggregateTwab,
            round.publicPrize,
            round.participantCountSnapshot,
            round.selectionCursor,
            round.allocationCursor
        );
    }

    function reconciliationHandle(uint256 roundId) external view returns (ebool) {
        return _rounds[roundId].reconciliationValid;
    }

    function _initializeRound(uint256 roundId, uint64 opensAt) private {
        Round storage round = _rounds[roundId];
        round.opensAt = opensAt;
        round.closesAt = opensAt + ROUND_DURATION;
        round.state = RoundState.OPEN;
        round.eligibleBalance = FHE.asEuint64(0);
        round.eligibleCumulative = FHE.asEuint128(0);
        round.eligibleTimestamp = opensAt;
        FHE.allowThis(round.eligibleBalance);
        FHE.allowThis(round.eligibleCumulative);
    }

    function _isActiveRoundOpen() private view returns (bool) {
        Round storage round = _rounds[activeRoundId];
        return round.state == RoundState.OPEN && block.timestamp >= round.opensAt && block.timestamp < round.closesAt;
    }

    function _accrueEligible(Round storage round, uint64 timestamp) private {
        uint64 elapsed = timestamp - round.eligibleTimestamp;
        if (elapsed == 0) return;
        round.eligibleCumulative = FHE.add(
            round.eligibleCumulative,
            FHE.mul(FHE.asEuint128(round.eligibleBalance), uint128(elapsed))
        );
        round.eligibleTimestamp = timestamp;
        FHE.allowThis(round.eligibleCumulative);
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

    function _roundWeight(uint256 roundId, address account, Round storage round) private returns (euint128) {
        return
            FHE.sub(_cumulativeAt(account, round.closesAt), _cumulativeAt(account, eligibilityStart[roundId][account]));
    }

    function _allocateParticipant(uint256 roundId, Round storage round, address participant) private {
        ebool winner = _winnerPredicate[roundId][participant];
        ebool wantsAutoSave = FHE.asEbool(_preferenceAt(participant, round.closesAt) == AutoSavePreference.AUTO_SAVE);
        euint64 zero = FHE.asEuint64(0);
        euint64 prize = FHE.select(winner, round.reservedPrize, zero);
        ebool autoFits = FHE.le(prize, FHE.sub(MAX_POOL_BASE_UNITS, _totalPrincipal));
        ebool autoSaveWinner = FHE.and(FHE.and(winner, wantsAutoSave), autoFits);
        euint64 autoSaved = FHE.select(autoSaveWinner, round.reservedPrize, zero);
        euint64 kept = FHE.sub(prize, autoSaved);

        euint64 newPrincipal = FHE.add(_principal[participant], autoSaved);
        _checkpointUser(participant, newPrincipal, uint64(block.timestamp));
        _principal[participant] = newPrincipal;
        _winnings[participant] = FHE.add(_winnings[participant], kept);
        _totalPrincipal = FHE.add(_totalPrincipal, autoSaved);
        _liquidPrincipal = FHE.add(_liquidPrincipal, autoSaved);
        if (eligibilityStart[activeRoundId][participant] != 0) {
            Round storage activeRound = _rounds[activeRoundId];
            activeRound.eligibleBalance = FHE.add(activeRound.eligibleBalance, autoSaved);
            FHE.allowThis(activeRound.eligibleBalance);
        }
        _winningsLiability = FHE.add(_winningsLiability, kept);
        _liquidPrizeAssets = FHE.sub(_liquidPrizeAssets, autoSaved);
        _reservedPrize = FHE.sub(_reservedPrize, prize);
        round.reservedPrize = FHE.sub(round.reservedPrize, prize);

        FHE.allowThis(_principal[participant]);
        FHE.allow(_principal[participant], participant);
        FHE.allowThis(_winnings[participant]);
        FHE.allow(_winnings[participant], participant);
        FHE.allowThis(_totalPrincipal);
        FHE.allowThis(_liquidPrincipal);
        FHE.allowThis(_winningsLiability);
        FHE.allowThis(_liquidPrizeAssets);
        FHE.allowThis(_reservedPrize);
        FHE.allowThis(round.reservedPrize);
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

    function _persistPrincipalState(address account) private {
        FHE.allowThis(_principal[account]);
        FHE.allow(_principal[account], account);
        FHE.allowThis(_totalPrincipal);
        FHE.allowThis(_liquidPrincipal);
    }

    function _wrapUnderlying(uint256 amount) private returns (euint64 wrapped) {
        IERC20 underlying = IERC20(UNDERLYING);
        underlying.forceApprove(address(ASSET), amount);
        wrapped = ASSET.wrap(address(this), amount);
        underlying.forceApprove(address(ASSET), 0);
    }

    function _checkPublicProof(bytes32 handle, bytes calldata cleartexts, bytes calldata proof) private {
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        FHE.checkSignatures(handles, cleartexts, proof);
    }

    function _checkBooleanProof(
        bytes32 handle,
        bytes calldata cleartexts,
        bytes calldata proof
    ) private returns (bool clearValue) {
        clearValue = abi.decode(cleartexts, (bool));
        _checkPublicProof(handle, cleartexts, proof);
    }

    function _requireStrategy() private view {
        if (address(STRATEGY) == address(0)) revert StrategyDisabled();
    }

    function _strategyEpoch(
        uint256 epochId,
        StrategyEpochState expected
    ) private view returns (StrategyEpoch storage epoch) {
        _requireStrategy();
        if (epochId == 0 || epochId != activeStrategyEpochId) revert InvalidStrategyEpoch();
        epoch = _strategyEpochs[epochId];
        if (epoch.state != expected) revert StrategyEpochNotReady();
    }
}
