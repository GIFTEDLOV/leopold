// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec */

import {FHE, euint64, euint128, externalEuint64, externalEuint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {LeopoldHistoricalMomentTreeSpike2} from "./LeopoldHistoricalMomentTreeSpike2.sol";

/// @notice Disposable local ACL probe standing in for LeopoldVault. Not production code.
contract LeopoldMomentTreeVaultAclProbe is ZamaEthereumConfig {
    LeopoldHistoricalMomentTreeSpike2 public immutable TREE;

    constructor(uint8 depth) {
        TREE = new LeopoldHistoricalMomentTreeSpike2(address(this), depth);
    }

    function register(address account, uint32 slot) external {
        TREE.register(account, slot);
    }

    function importAndUpdate(
        address account,
        externalEuint64 encryptedDelta,
        bytes calldata inputProof,
        bool increase
    ) external {
        euint64 delta = FHE.fromExternal(encryptedDelta, inputProof);
        FHE.allowTransient(delta, address(TREE));
        TREE.updateBalanceFromVault(account, delta, increase);
    }

    function fundAndRequestRound(uint256 roundId, uint64 opensAt, uint64 closesAt, uint64 prize) external {
        TREE.fundPrize(prize);
        TREE.requestRoundTotal(roundId, opensAt, closesAt, prize);
    }

    function importAndFinalizeRound(
        uint256 roundId,
        uint128 clearAggregateTwab,
        bytes calldata aggregateCleartexts,
        bytes calldata aggregateProof,
        externalEuint128 encryptedTicket,
        bytes calldata ticketProof
    ) external {
        euint128 ticket = FHE.fromExternal(encryptedTicket, ticketProof);
        FHE.allowTransient(ticket, address(TREE));
        TREE.finalizeRoundSelectionFromVault(
            roundId,
            clearAggregateTwab,
            aggregateCleartexts,
            aggregateProof,
            ticket
        );
    }
}
