// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AgentSwapModule} from "../AgentSwapModule.sol";

interface VmScript {
    function envAddress(string calldata) external view returns (address);
    function envUint(string calldata) external view returns (uint256);
    function envOr(string calldata, bool) external view returns (bool);
    function envOr(string calldata, uint256) external view returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

/**
 * Deploys ONE AgentSwapModule for ONE agent key. Deploy one module per designated agent
 * (each gets its own on-chain limits). Does NOT enable the module - the Safe owners do that.
 *
 * TESTNET ONLY by default (Sepolia 11155111, Arbitrum Sepolia 421614, Base Sepolia 84532).
 * Any other chain requires ALLOW_MAINNET=true.
 *
 *   SAFE_ADDRESS=0x... SWAP_ROUTER=0x... AGENT_ADDRESS=0x... \
 *   PER_SWAP_USD=100 DAILY_USD=300 COOLDOWN_SECONDS=3600 MAX_SLIPPAGE_BPS=100 MAX_ORACLE_AGE=86400 \
 *   forge script contracts/script/DeployAgentSwapModule.s.sol:DeployAgentSwapModule \
 *     --rpc-url $RPC_URL --account deployer --broadcast
 *
 * PER_SWAP_USD / DAILY_USD are whole USD (converted to 18 decimals here).
 */
contract DeployAgentSwapModule {
    VmScript private constant vm = VmScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (AgentSwapModule module) {
        bool testnet = block.chainid == 11155111 || block.chainid == 421614 || block.chainid == 84532;
        require(testnet || vm.envOr("ALLOW_MAINNET", false), "Refusing non-testnet chain: set ALLOW_MAINNET=true");

        address safe = vm.envAddress("SAFE_ADDRESS");
        address router = vm.envAddress("SWAP_ROUTER");
        address agent = vm.envAddress("AGENT_ADDRESS");
        require(safe.code.length > 0, "SAFE_ADDRESS has no code (not a Safe on this chain)");
        require(router.code.length > 0, "SWAP_ROUTER has no code on this chain");
        require(agent.code.length == 0, "AGENT_ADDRESS must be a plain key (EOA)");
        require(agent != safe, "agent cannot be the Safe");

        uint256 perSwap = vm.envOr("PER_SWAP_USD", uint256(100)) * 1e18;
        uint256 daily = vm.envOr("DAILY_USD", uint256(300)) * 1e18;
        uint256 cooldown = vm.envOr("COOLDOWN_SECONDS", uint256(3600));
        uint256 slippage = vm.envOr("MAX_SLIPPAGE_BPS", uint256(100));
        uint256 oracleAge = vm.envOr("MAX_ORACLE_AGE", uint256(86400));

        vm.startBroadcast();
        module = new AgentSwapModule(safe, router, agent, perSwap, daily, cooldown, slippage, oracleAge);
        vm.stopBroadcast();
    }
}
