// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,max-line-length */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

contract MockLeopoldAsset is ZamaEthereumConfig, ERC7984ERC20Wrapper {
    constructor(IERC20 underlying_) ERC7984("Confidential Mock USDT", "cmUSDT", "") ERC7984ERC20Wrapper(underlying_) {}

    function testOnlyCallReceiver(
        address receiver,
        address from,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (ebool) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowTransient(amount, receiver);
        return IERC7984Receiver(receiver).onConfidentialTransferReceived(msg.sender, from, amount, "");
    }
}
