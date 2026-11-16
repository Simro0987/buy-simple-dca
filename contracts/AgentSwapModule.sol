// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title AgentSwapModule - swap-only permission for an AI agent key on a Safe{Wallet}
 * @notice STATUS: UNAUDITED. Use on testnets / with small amounts until independently reviewed.
 *
 * Why a MODULE and not a GUARD:
 *   A Safe Guard checks EVERY Safe transaction, including the owners' own. The previous
 *   `SafeBTCGuard.sol` therefore (a) blocked the owners from ever withdrawing their own funds,
 *   (b) blocked `setGuard` (to == safe), so it could never be removed, and (c) the kill switch
 *   froze the Safe forever. It also never checked the swap `recipient`, so an allow-listed router
 *   call could still send the output to any address, and anyone could call `checkTransaction`
 *   directly to grief the volume counters. It was removed.
 *
 *   This module instead gives the agent key ONE narrow capability, while the owners keep full
 *   control of the Safe (they can disable the module at any time with `disableModule`):
 *
 * INVARIANTS (enforced on-chain):
 *   1. The agent can NOT pass arbitrary calldata. The module itself builds the only two calls it
 *      can make: `token.approve(router, amount)` on an allow-listed token, and
 *      `router.exactInputSingle(...)` on the immutable Uniswap V3 SwapRouter02 address.
 *   2. The swap `recipient` is hard-coded to the Safe. There is no code path that transfers
 *      tokens or native coin to any other address. `value` is always 0. Operation is always CALL
 *      (never DELEGATECALL).
 *   3. Only owner-allow-listed tokens and (tokenIn, tokenOut, fee) pools - blocks the
 *      "swap into an attacker-made illiquid pool" exfiltration trick.
 *   4. Price protection: `amountOutMinimum` must be within `maxSlippageBps` of a Chainlink
 *      oracle quote (stale or non-positive prices revert) - blocks sandwich/"sell for 0" drains.
 *   5. Per-swap and per-day USD caps + cooldown.
 *   6. Exact approval, reset to 0 after each swap. Post-swap balance checks.
 *   7. The agent can `pause()` but never unpause, change limits, tokens, pools, owners,
 *      threshold, guard or modules. All admin functions are `onlySafe` (= owners' multisig tx).
 */

interface ISafe {
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success);
}

interface IERC20Min {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

contract AgentSwapModule {
    // ----------------------------------------------------------------- errors
    error OnlySafe();
    error OnlyAgent();
    error Paused();
    error Reentrancy();
    error TokenNotAllowed(address token);
    error PoolNotAllowed(address tokenIn, address tokenOut, uint24 fee);
    error InvalidAmount();
    error CooldownActive(uint256 nextAllowedAt);
    error PerSwapLimitExceeded(uint256 usdValue, uint256 limit);
    error DailyLimitExceeded(uint256 usdTotal, uint256 limit);
    error SlippageTooHigh(uint256 amountOutMinimum, uint256 requiredMinimum);
    error OracleInvalid(address feed);
    error ModuleCallFailed();
    error BalanceCheckFailed();
    error InvalidConfig();

    // ----------------------------------------------------------------- events
    event AgentSet(address indexed agent);
    event TokenSet(address indexed token, bool allowed, address usdFeed);
    event PoolSet(address indexed tokenIn, address indexed tokenOut, uint24 fee, bool allowed);
    event LimitsSet(uint256 perSwapUsd, uint256 dailyUsd, uint256 cooldown, uint256 maxSlippageBps, uint256 maxOracleAge);
    event PausedSet(bool paused, address by);
    event AgentSwap(
        address indexed tokenIn, address indexed tokenOut, uint24 fee, uint256 amountIn, uint256 amountOut, uint256 usdValue
    );

    // ----------------------------------------------------------------- storage
    struct TokenConfig {
        bool allowed;
        uint8 tokenDecimals;
        address usdFeed; // Chainlink TOKEN/USD feed
    }

    uint256 private constant BPS = 10_000;
    uint256 public constant MAX_SLIPPAGE_BPS_CAP = 500; // owners can never set > 5 %

    address public immutable safe;
    address public immutable router;

    address public agent;
    bool public paused;

    uint256 public perSwapLimitUsd;
    uint256 public dailyLimitUsd;
    uint256 public cooldownSeconds;
    uint256 public maxSlippageBps;
    uint256 public maxOracleAge;

    uint256 public lastSwapAt;
    uint256 public currentDay;
    uint256 public spentTodayUsd;

    mapping(address => TokenConfig) public tokens;
    mapping(bytes32 => bool) public allowedPools;

    uint256 private _lock = 1;

    modifier onlySafe() {
        if (msg.sender != safe) revert OnlySafe();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent || agent == address(0)) revert OnlyAgent();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(
        address _safe,
        address _router,
        address _agent,
        uint256 _perSwapLimitUsd,
        uint256 _dailyLimitUsd,
        uint256 _cooldownSeconds,
        uint256 _maxSlippageBps,
        uint256 _maxOracleAge
    ) {
        if (_safe == address(0) || _router == address(0)) revert InvalidConfig();
        safe = _safe;
        router = _router;
        agent = _agent;
        _setLimits(_perSwapLimitUsd, _dailyLimitUsd, _cooldownSeconds, _maxSlippageBps, _maxOracleAge);
        emit AgentSet(_agent);
    }

    // ----------------------------------------------------------------- agent entrypoint
    /**
     * @notice The ONLY thing the agent can do: swap an exact amount of `tokenIn` held by the Safe
     *         into `tokenOut`, with the output delivered to the Safe itself.
     */
    function swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyAgent nonReentrant returns (uint256 amountOut) {
        uint256 usdValue = _checkAndAccount(tokenIn, tokenOut, fee, amountIn, amountOutMinimum);

        uint256 inBefore = IERC20Min(tokenIn).balanceOf(safe);
        uint256 outBefore = IERC20Min(tokenOut).balanceOf(safe);

        _swapViaSafe(tokenIn, tokenOut, fee, amountIn, amountOutMinimum);

        uint256 inAfter = IERC20Min(tokenIn).balanceOf(safe);
        uint256 outAfter = IERC20Min(tokenOut).balanceOf(safe);
        if (inAfter > inBefore || inBefore - inAfter > amountIn) revert BalanceCheckFailed();
        if (outAfter < outBefore) revert BalanceCheckFailed();
        amountOut = outAfter - outBefore;
        if (amountOut < amountOutMinimum) revert BalanceCheckFailed();

        emit AgentSwap(tokenIn, tokenOut, fee, amountIn, amountOut, usdValue);
    }

    /// @dev All policy checks + limit accounting (effects before interactions).
    function _checkAndAccount(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal returns (uint256 usdValue) {
        if (paused) revert Paused();
        if (amountIn == 0 || tokenIn == tokenOut) revert InvalidAmount();

        TokenConfig memory cin = tokens[tokenIn];
        TokenConfig memory cout = tokens[tokenOut];
        if (!cin.allowed) revert TokenNotAllowed(tokenIn);
        if (!cout.allowed) revert TokenNotAllowed(tokenOut);
        if (!allowedPools[poolKey(tokenIn, tokenOut, fee)]) revert PoolNotAllowed(tokenIn, tokenOut, fee);

        if (lastSwapAt != 0 && block.timestamp < lastSwapAt + cooldownSeconds) {
            revert CooldownActive(lastSwapAt + cooldownSeconds);
        }

        // USD value (18 decimals) & limits
        usdValue = (amountIn * _price(cin.usdFeed)) / (10 ** cin.tokenDecimals);
        if (usdValue > perSwapLimitUsd) revert PerSwapLimitExceeded(usdValue, perSwapLimitUsd);

        uint256 day = block.timestamp / 1 days;
        if (day != currentDay) {
            currentDay = day;
            spentTodayUsd = 0;
        }
        if (spentTodayUsd + usdValue > dailyLimitUsd) revert DailyLimitExceeded(spentTodayUsd + usdValue, dailyLimitUsd);

        // Oracle-based minimum output (blocks "sell for 0" / sandwich drains)
        uint256 expectedOut = (usdValue * (10 ** cout.tokenDecimals)) / _price(cout.usdFeed);
        uint256 requiredMin = (expectedOut * (BPS - maxSlippageBps)) / BPS;
        if (amountOutMinimum < requiredMin) revert SlippageTooHigh(amountOutMinimum, requiredMin);

        spentTodayUsd += usdValue;
        lastSwapAt = block.timestamp;
    }

    /// @dev exact approval -> swap (recipient HARD-CODED to the Safe) -> reset approval to 0.
    function _swapViaSafe(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) internal {
        _exec(tokenIn, abi.encodeWithSelector(0x095ea7b3, router, uint256(0)));
        _exec(tokenIn, abi.encodeWithSelector(0x095ea7b3, router, amountIn));
        ISwapRouter02.ExactInputSingleParams memory p = ISwapRouter02.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: safe, // output can only land in the Safe
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });
        _exec(router, abi.encodeWithSelector(ISwapRouter02.exactInputSingle.selector, p));
        _exec(tokenIn, abi.encodeWithSelector(0x095ea7b3, router, uint256(0)));
    }

    /// @notice Emergency stop. Callable by the agent (self-stop) or the Safe. Only the Safe can unpause.
    function pause() external {
        if (msg.sender != agent && msg.sender != safe) revert OnlyAgent();
        paused = true;
        emit PausedSet(true, msg.sender);
    }

    // ----------------------------------------------------------------- owner (Safe) admin
    function unpause() external onlySafe {
        paused = false;
        emit PausedSet(false, msg.sender);
    }

    function setAgent(address _agent) external onlySafe {
        agent = _agent;
        emit AgentSet(_agent);
    }

    function setToken(address token, bool allowed, address usdFeed) external onlySafe {
        if (token == address(0) || (allowed && usdFeed == address(0))) revert InvalidConfig();
        uint8 dec = allowed ? IERC20Min(token).decimals() : 0;
        if (allowed && dec > 36) revert InvalidConfig();
        tokens[token] = TokenConfig({allowed: allowed, tokenDecimals: dec, usdFeed: allowed ? usdFeed : address(0)});
        emit TokenSet(token, allowed, usdFeed);
    }

    function setPool(address tokenIn, address tokenOut, uint24 fee, bool allowed) external onlySafe {
        allowedPools[poolKey(tokenIn, tokenOut, fee)] = allowed;
        emit PoolSet(tokenIn, tokenOut, fee, allowed);
    }

    function setLimits(
        uint256 _perSwapLimitUsd,
        uint256 _dailyLimitUsd,
        uint256 _cooldownSeconds,
        uint256 _maxSlippageBps,
        uint256 _maxOracleAge
    ) external onlySafe {
        _setLimits(_perSwapLimitUsd, _dailyLimitUsd, _cooldownSeconds, _maxSlippageBps, _maxOracleAge);
    }

    // ----------------------------------------------------------------- views / internals
    function poolKey(address tokenIn, address tokenOut, uint24 fee) public pure returns (bytes32) {
        return keccak256(abi.encode(tokenIn, tokenOut, fee));
    }

    function _setLimits(
        uint256 _perSwapLimitUsd,
        uint256 _dailyLimitUsd,
        uint256 _cooldownSeconds,
        uint256 _maxSlippageBps,
        uint256 _maxOracleAge
    ) internal {
        if (_maxSlippageBps > MAX_SLIPPAGE_BPS_CAP || _perSwapLimitUsd > _dailyLimitUsd || _maxOracleAge == 0) {
            revert InvalidConfig();
        }
        perSwapLimitUsd = _perSwapLimitUsd;
        dailyLimitUsd = _dailyLimitUsd;
        cooldownSeconds = _cooldownSeconds;
        maxSlippageBps = _maxSlippageBps;
        maxOracleAge = _maxOracleAge;
        emit LimitsSet(_perSwapLimitUsd, _dailyLimitUsd, _cooldownSeconds, _maxSlippageBps, _maxOracleAge);
    }

    function _price(address feed) internal view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(feed).latestRoundData();
        if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > maxOracleAge) {
            revert OracleInvalid(feed);
        }
        uint8 dec = IAggregatorV3(feed).decimals();
        if (dec > 18) revert OracleInvalid(feed);
        return uint256(answer) * (10 ** (18 - dec));
    }

    /// @dev Always CALL (operation 0), always value 0. Never DELEGATECALL.
    function _exec(address to, bytes memory data) internal {
        if (!ISafe(safe).execTransactionFromModule(to, 0, data, 0)) revert ModuleCallFailed();
    }
}
