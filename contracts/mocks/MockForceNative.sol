// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/* solhint-disable use-natspec,no-empty-blocks */

contract MockForceNative {
    constructor() payable {}

    function force(address payable target) external {
        selfdestruct(target);
    }
}
