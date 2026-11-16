// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {DeployAgentSwapModule} from "../script/DeployAgentSwapModule.s.sol";

interface VmT {
    function chainId(uint256) external;
    function setEnv(string calldata, string calldata) external;
    function expectRevert(bytes calldata) external;
    function etch(address, bytes calldata) external;
}

contract DeployScriptTest {
    VmT constant vm = VmT(address(uint160(uint256(keccak256("hevm cheat code")))));

    function _env() internal {
        address safe = address(0x5AFE);
        address router = address(0x7007);
        vm.etch(safe, hex"00");
        vm.etch(router, hex"00");
        vm.setEnv("SAFE_ADDRESS", "0x0000000000000000000000000000000000005AFE");
        vm.setEnv("SWAP_ROUTER", "0x0000000000000000000000000000000000007007");
        vm.setEnv("AGENT_ADDRESS", "0x00000000000000000000000000000000000A11CE");
        vm.setEnv("ALLOW_MAINNET", "false");
    }

    function test_refusesMainnetByDefault() public {
        _env();
        vm.chainId(42161);
        DeployAgentSwapModule s = new DeployAgentSwapModule();
        vm.expectRevert(bytes("Refusing non-testnet chain: set ALLOW_MAINNET=true"));
        s.run();
    }

    function test_deploysOnArbitrumSepolia() public {
        _env();
        vm.chainId(421614);
        DeployAgentSwapModule s = new DeployAgentSwapModule();
        address m = address(s.run());
        require(m.code.length > 0, "not deployed");
    }
}
