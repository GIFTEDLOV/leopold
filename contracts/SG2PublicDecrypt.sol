// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Temporary CP0/SG-2 public-decryption capability gate
/// @author Zama SZN 4 CP0
/// @notice Demonstrates encrypted euint64 input, public decryption, and canonical on-chain proof verification.
/// @dev This isolated probe is not production protocol code and must not hold funds or provide administrative controls.
contract SG2PublicDecrypt is ZamaEthereumConfig {
    /// @notice Exact clear value required by the SG-2 capability gate.
    uint64 public constant SG2_EXPECTED_VALUE = 42;

    /// @notice Immutable account permitted to initialize and verify this temporary probe.
    address public immutable OPERATOR;
    /// @notice Whether the sole encrypted input has been accepted.
    bool public initialized;
    /// @notice Whether canonical public-decryption verification has succeeded.
    bool public verificationSucceeded;
    /// @notice Clear value recorded only after canonical verification succeeds.
    uint64 public verifiedValue;

    euint64 private _ciphertext;

    error OnlyOperator();
    error AlreadyInitialized();
    error NotInitialized();
    error AlreadyVerified();
    error InvalidCleartextEncoding();
    error UnexpectedClearValue();

    /// @notice Emitted when the operator initializes the sole ciphertext.
    /// @param operator Address permanently bound as this probe's operator.
    event CiphertextInitialized(address indexed operator);
    /// @notice Emitted when the stored ciphertext is authorized for public decryption.
    event PublicDecryptionAuthorized();
    /// @notice Emitted after canonical KMS proof verification succeeds on-chain.
    /// @param verifiedValue Exact verified clear value recorded by the probe.
    event SG2VerificationSucceeded(uint64 indexed verifiedValue);

    modifier onlyOperator() {
        if (msg.sender != OPERATOR) revert OnlyOperator();
        _;
    }

    constructor() {
        OPERATOR = msg.sender;
    }

    /// @notice Accepts the single encrypted SG-2 value and authorizes its public decryption exactly once.
    /// @param encryptedValue Canonical external euint64 handle produced for this contract and operator.
    /// @param inputProof Canonical installed input proof bound to the encrypted handle.
    function initialize(externalEuint64 encryptedValue, bytes calldata inputProof) external onlyOperator {
        if (initialized) revert AlreadyInitialized();

        euint64 acceptedCiphertext = FHE.fromExternal(encryptedValue, inputProof);
        _ciphertext = acceptedCiphertext;
        FHE.allowThis(acceptedCiphertext);
        FHE.makePubliclyDecryptable(acceptedCiphertext);
        initialized = true;

        emit CiphertextInitialized(OPERATOR);
        emit PublicDecryptionAuthorized();
    }

    /// @notice Returns the sole ciphertext handle required by the relayer public-decryption request.
    function getCiphertext() external view returns (euint64) {
        return _ciphertext;
    }

    /// @notice Reports whether the stored ciphertext has canonical public-decryption authorization.
    function isCiphertextPubliclyDecryptable() external view returns (bool) {
        return initialized && FHE.isPubliclyDecryptable(_ciphertext);
    }

    /// @notice Verifies the relayer's ABI-encoded clear result and public-decryption proof exactly once.
    /// @param abiEncodedCleartexts The SDK-provided ordered clear values encoded as uint256 words.
    /// @param decryptionProof The SDK-provided KMS public-decryption proof.
    function verifyPublicDecryption(
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external onlyOperator {
        if (!initialized) revert NotInitialized();
        if (verificationSucceeded) revert AlreadyVerified();
        if (abiEncodedCleartexts.length != 32) revert InvalidCleartextEncoding();

        uint256 clearValue = abi.decode(abiEncodedCleartexts, (uint256));
        if (clearValue != SG2_EXPECTED_VALUE) revert UnexpectedClearValue();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_ciphertext);
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        verificationSucceeded = true;
        verifiedValue = uint64(clearValue);
        emit SG2VerificationSucceeded(verifiedValue);
    }
}
