// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,named-parameters-mapping,gas-indexed-events,code-complexity */

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LeopoldVault} from "./LeopoldVault.sol";
import {LeopoldCompoundAdapter} from "./LeopoldCompoundAdapter.sol";

/// @title Authoritative registry for the four official Leopold vault deployments
/// @notice Financial state remains in four isolated, normal, non-proxy LeopoldVault deployments.
contract LeopoldVaultRegistry is Ownable {
    uint8 public constant OFFICIAL_VAULT_COUNT = 4;

    struct OfficialVault {
        address vault;
        bytes32 name;
        LeopoldVault.VaultType vaultType;
        uint64 roundDuration;
        address asset;
        address strategy;
        address comet;
        bool active;
    }

    mapping(uint8 vaultId => OfficialVault) private _officialVaults;
    mapping(address vault => bool) public isOfficialVault;

    error InvalidOwner();
    error InvalidVault(uint8 vaultId);
    error DuplicateVault(address vault);

    event OfficialVaultStatusChanged(uint8 indexed vaultId, bool active);

    constructor(address[4] memory vaults, address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert InvalidOwner();
        uint64[4] memory expectedDurations = [uint64(1 days), uint64(7 days), uint64(30 days), uint64(7 days)];
        bytes32[4] memory expectedNames = [bytes32("Daily"), bytes32("Weekly"), bytes32("Monthly"), bytes32("Boost")];
        address expectedAsset;
        bool expectedStrategyEnabled;
        address expectedComet;
        for (uint8 i = 0; i < OFFICIAL_VAULT_COUNT; ++i) {
            uint8 vaultId = i + 1;
            address vaultAddress = vaults[i];
            if (vaultAddress == address(0)) revert InvalidVault(vaultId);
            if (isOfficialVault[vaultAddress]) revert DuplicateVault(vaultAddress);
            LeopoldVault vault = LeopoldVault(vaultAddress);
            if (i == 0) expectedAsset = address(vault.ASSET());
            address strategy = address(vault.STRATEGY());
            address comet;
            if (strategy != address(0)) comet = address(LeopoldCompoundAdapter(strategy).COMET());
            if (i == 0) {
                expectedStrategyEnabled = strategy != address(0);
                expectedComet = comet;
            }
            if (
                vault.VAULT_ID() != vaultId ||
                uint8(vault.VAULT_TYPE()) != i ||
                vault.VAULT_NAME() != expectedNames[i] ||
                vault.ROUND_DURATION() != expectedDurations[i] ||
                address(vault.ASSET()) != expectedAsset ||
                (strategy != address(0)) != expectedStrategyEnabled ||
                comet != expectedComet
            ) revert InvalidVault(vaultId);

            _officialVaults[vaultId] = OfficialVault({
                vault: vaultAddress,
                name: vault.VAULT_NAME(),
                vaultType: vault.VAULT_TYPE(),
                roundDuration: vault.ROUND_DURATION(),
                asset: address(vault.ASSET()),
                strategy: strategy,
                comet: comet,
                active: true
            });
            isOfficialVault[vaultAddress] = true;
        }
    }

    function officialVault(uint8 vaultId) external view returns (OfficialVault memory) {
        if (vaultId == 0 || vaultId > OFFICIAL_VAULT_COUNT) revert InvalidVault(vaultId);
        return _officialVaults[vaultId];
    }

    /// @notice Deprecation affects discovery only and grants no custody, accounting, draw, or settlement authority.
    function setOfficialVaultActive(uint8 vaultId, bool active) external onlyOwner {
        if (vaultId == 0 || vaultId > OFFICIAL_VAULT_COUNT) revert InvalidVault(vaultId);
        _officialVaults[vaultId].active = active;
        emit OfficialVaultStatusChanged(vaultId, active);
    }
}
