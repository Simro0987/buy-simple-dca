// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AgentSwapModule, ISwapRouter02} from "../AgentSwapModule.sol";

// Minimal cheatcode interface (no forge-std dependency).
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
    function expectRevert(bytes calldata) external;
}

contract MockERC20 {
    string public name;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, uint8 d) {
        name = n;
        decimals = d;
    }

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract MockFeed {
    int256 public answer;
    uint256 public updatedAt;
    uint8 public decimals = 8;

    function set(int256 a, uint256 t) external {
        answer = a;
        updatedAt = t;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

/// Uniswap-like router: pulls tokenIn from msg.sender, pays tokenOut at a fixed rate.
contract MockRouter {
    // out = in * num / den
    uint256 public num;
    uint256 public den;
    address public divertTo; // if set, behaves maliciously and ignores `recipient`

    function setRate(uint256 n, uint256 d) external {
        num = n;
        den = d;
    }

    function setDivert(address a) external {
        divertTo = a;
    }

    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        MockERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        out = (p.amountIn * num) / den;
        require(out >= p.amountOutMinimum, "Too little received");
        MockERC20(p.tokenOut).mint(divertTo == address(0) ? p.recipient : divertTo, out);
    }
}

/// Minimal Safe: executes module calls (CALL only) from enabled modules.
contract MockSafe {
    mapping(address => bool) public modules;

    function enableModule(address m) external {
        modules[m] = true;
    }

    function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8 op)
        external
        returns (bool ok)
    {
        require(modules[msg.sender], "GS104");
        require(op == 0, "no delegatecall in mock");
        (ok,) = to.call{value: value}(data);
    }
}

contract AgentSwapModuleTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockSafe safe;
    MockRouter router;
    MockERC20 usdc; // 6 dec
    MockERC20 wbtc; // 8 dec
    MockERC20 evil; // not allow-listed
    MockFeed usdcFeed;
    MockFeed btcFeed;
    AgentSwapModule module;

    address agent = address(0xA11CE);
    address attacker = address(0xBAD);
    uint24 constant FEE = 500;

    function setUp() public {
        vm.warp(1_700_006_400 + 1 hours); // start of a UTC day
        safe = new MockSafe();
        router = new MockRouter();
        usdc = new MockERC20("USDC", 6);
        wbtc = new MockERC20("WBTC", 8);
        evil = new MockERC20("EVIL", 18);
        usdcFeed = new MockFeed();
        btcFeed = new MockFeed();
        usdcFeed.set(1e8, block.timestamp); // $1
        btcFeed.set(100_000e8, block.timestamp); // $100k

        module = new AgentSwapModule(
            address(safe),
            address(router),
            agent,
            1_000e18, // per swap $1k
            2_000e18, // per day $2k
            1 hours,
            100, // 1 %
            1 days
        );
        safe.enableModule(address(module));

        vm.startPrank(address(safe));
        module.setToken(address(usdc), true, address(usdcFeed));
        module.setToken(address(wbtc), true, address(btcFeed));
        module.setPool(address(usdc), address(wbtc), FEE, true);
        vm.stopPrank();

        usdc.mint(address(safe), 10_000e6);
        // fair rate: 1000 USDC (1000e6) -> 0.01 BTC (1e6 sats)  => out = in / 1000
        router.setRate(1, 1000);
    }

    function _assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "not equal");
    }

    function test_agentSwap_outputLandsInSafe() public {
        vm.prank(agent);
        uint256 out = module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 1_000e6, 0.0099e8);
        _assertEq(out, 0.01e8);
        _assertEq(wbtc.balanceOf(address(safe)), 0.01e8);
        _assertEq(usdc.balanceOf(address(safe)), 9_000e6);
        _assertEq(wbtc.balanceOf(agent), 0);
        _assertEq(usdc.allowance(address(safe), address(router)), 0); // approval reset
    }

    function test_nonAgentCannotSwap() public {
        vm.prank(attacker);
        vm.expectRevert(AgentSwapModule.OnlyAgent.selector);
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 100e6, 0);
    }

    function test_unlistedTokenRejected() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AgentSwapModule.TokenNotAllowed.selector, address(evil)));
        module.swapExactInputSingle(address(usdc), address(evil), FEE, 100e6, 0);
    }

    function test_unlistedFeeTierRejected_attackerPool() public {
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(AgentSwapModule.PoolNotAllowed.selector, address(usdc), address(wbtc), uint24(10000))
        );
        module.swapExactInputSingle(address(usdc), address(wbtc), 10000, 100e6, 0);
    }

    function test_zeroMinOutRejected_sandwichProtection() public {
        vm.prank(agent);
        vm.expectRevert(); // SlippageTooHigh
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 1_000e6, 0);
    }

    function test_perSwapLimit() public {
        vm.prank(agent);
        vm.expectRevert(); // PerSwapLimitExceeded
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 1_001e6, 0.01e8);
    }

    function test_cooldownAndDailyLimit() public {
        vm.prank(agent);
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 1_000e6, 0.0099e8);
        vm.prank(agent);
        vm.expectRevert(); // CooldownActive
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 500e6, 0.00495e8);

        vm.warp(block.timestamp + 2 hours);
        usdcFeed.set(1e8, block.timestamp);
        btcFeed.set(100_000e8, block.timestamp);
        vm.prank(agent);
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 1_000e6, 0.0099e8);

        vm.warp(block.timestamp + 2 hours);
        usdcFeed.set(1e8, block.timestamp);
        btcFeed.set(100_000e8, block.timestamp);
        vm.prank(agent);
        vm.expectRevert(); // DailyLimitExceeded ($2k used)
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 10e6, 0.000099e8);
    }

    function test_staleOracleRejected() public {
        vm.warp(block.timestamp + 2 days);
        vm.prank(agent);
        vm.expectRevert(); // OracleInvalid
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 100e6, 0.00099e8);
    }

    function test_maliciousRouterDivertingOutputReverts() public {
        router.setDivert(attacker);
        vm.prank(agent);
        vm.expectRevert(AgentSwapModule.BalanceCheckFailed.selector);
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 1_000e6, 0.0099e8);
        _assertEq(usdc.balanceOf(address(safe)), 10_000e6); // whole tx reverted
    }

    function test_agentCannotAdmin() public {
        vm.startPrank(agent);
        vm.expectRevert(AgentSwapModule.OnlySafe.selector);
        module.setAgent(attacker);
        vm.expectRevert(AgentSwapModule.OnlySafe.selector);
        module.setToken(address(evil), true, address(usdcFeed));
        vm.expectRevert(AgentSwapModule.OnlySafe.selector);
        module.setPool(address(usdc), address(evil), FEE, true);
        vm.expectRevert(AgentSwapModule.OnlySafe.selector);
        module.setLimits(1e30, 1e30, 0, 500, 1 days);
        module.pause();
        vm.expectRevert(AgentSwapModule.OnlySafe.selector);
        module.unpause();
        vm.expectRevert(AgentSwapModule.Paused.selector);
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 100e6, 0.00099e8);
        vm.stopPrank();
    }

    function test_ownersCannotSetSlippageAbove5pct() public {
        vm.prank(address(safe));
        vm.expectRevert(AgentSwapModule.InvalidConfig.selector);
        module.setLimits(1e18, 2e18, 0, 501, 1 days);
    }

    function test_safeCanRevokeAgent() public {
        vm.prank(address(safe));
        module.setAgent(address(0));
        vm.prank(agent);
        vm.expectRevert(AgentSwapModule.OnlyAgent.selector);
        module.swapExactInputSingle(address(usdc), address(wbtc), FEE, 100e6, 0.00099e8);
    }
}
