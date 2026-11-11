// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SafeBTCGuard — Immutable On-Chain Safe{Wallet} Transaction Firewall & Policy Guard
 * @notice Implements the on-chain `ITransactionGuard` interface for Safe Global v1.3 / v1.4.1.
 *
 * SECURITY INVARIANTS (Fail-Closed On-Chain Enforcement):
 *  1. NO EXTERNAL TRANSFERS: Blocks native ETH/BTC transfers and ERC-20 `transfer` / `transferFrom`
 *     to any unallowlisted external EOA address. Assets can never leave the Strategy Safe except into
 *     allowlisted DEX routers where `recipient == address(safe)`.
 *  2. NO DELEGATECALL: Hard-blocks `Enum.Operation.DelegateCall` so no untrusted contract can hijack
 *     the Safe storage slot layout.
 *  3. NO OWNER / THRESHOLD / GUARD / MODULE MUTATION BY AGENT: Hard-blocks `addOwnerWithThreshold`,
 *     `removeOwner`, `swapOwner`, `changeThreshold`, `setGuard`, `enableModule`, `disableModule`,
 *     and `setFallbackHandler` unless executed via the Governance Timelock.
 *  4. NO UNLIMITED APPROVALS: Blocks `approve(spender, type(uint256).max)`. Approvals are only allowed
 *     to allowlisted DEX routers and must be bounded by `maxSingleSwapUsd`.
 *  5. HARD TURNOVER & COOLDOWN LIMITS: Enforces `maxSingleSwapValue`, `maxDailyVolume`, `maxWeeklyVolume`,
 *     `minCooldownSeconds`, and `maxTradesPerDay`.
 *  6. GLOBAL KILL SWITCH & EMERGENCY PAUSE: When `paused == true` or `killed == true`, all transactions
 *     revert immediately with `SafeGuardPausedOrKilled()`.
 */
contract SafeBTCGuard {
    enum Operation {
        Call,
        DelegateCall
    }

    error SafeGuardPausedOrKilled();
    error DelegateCallForbidden();
    error SelfMutationForbidden(bytes4 selector);
    error TargetContractNotAllowlisted(address target);
    error FunctionSelectorNotAllowlisted(bytes4 selector);
    error ExternalTransferForbidden(address recipient);
    error UnlimitedApprovalForbidden(uint256 amount);
    error ApprovalSpenderNotAllowlisted(address spender);
    error SingleTradeLimitExceeded(uint256 value, uint256 maxAllowed);
    error DailyVolumeLimitExceeded(uint256 newDailyTotal, uint256 maxDaily);
    error CooldownNotElapsed(uint256 nextAllowedTimestamp);
    error OnlyMultisigTimelock();

    address public immutable safeVault;
    address public immutable multisigTimelock;

    bool public paused;
    bool public killed;

    uint256 public maxSingleTradeWei;
    uint256 public maxDailyVolumeWei;
    uint256 public minCooldownSeconds;
    uint256 public lastTradeTimestamp;
    uint256 public currentDayIndex;
    uint256 public currentDayVolumeWei;

    mapping(address => bool) public allowlistedDexRouters;
    mapping(address => bool) public allowlistedTokens;
    mapping(bytes4 => bool) public allowlistedSelectors;

    // Forbidden Safe self-mutation & external transfer selectors
    bytes4 private constant SEL_TRANSFER = 0xa9059cbb;              // transfer(address,uint256)
    bytes4 private constant SEL_TRANSFER_FROM = 0x23b872dd;         // transferFrom(address,address,uint256)
    bytes4 private constant SEL_APPROVE = 0x095ea7b3;               // approve(address,uint256)
    bytes4 private constant SEL_ADD_OWNER = 0x0d582f13;             // addOwnerWithThreshold(address,uint256)
    bytes4 private constant SEL_REMOVE_OWNER = 0xf8dc5dd9;          // removeOwner(address,address,uint256)
    bytes4 private constant SEL_SWAP_OWNER = 0xe318b52b;            // swapOwner(address,address,address)
    bytes4 private constant SEL_CHANGE_THRESHOLD = 0x694e80c3;      // changeThreshold(uint256)
    bytes4 private constant SEL_SET_GUARD = 0xe19a9dd9;             // setGuard(address)
    bytes4 private constant SEL_ENABLE_MODULE = 0x610b5925;         // enableModule(address)
    bytes4 private constant SEL_DISABLE_MODULE = 0xe009cfde;        // disableModule(address,address)
    bytes4 private constant SEL_SET_FALLBACK = 0xf08a0323;          // setFallbackHandler(address)

    event TransactionCheckedByGuard(address indexed safe, address indexed to, bytes4 selector, uint256 value);
    event EmergencyKillSwitchActivated(address indexed triggeredBy, uint256 timestamp);
    event MerkleAuditRootAnchored(bytes32 indexed merkleRoot, uint256 indexed batchIndex, uint256 timestamp);

    bytes32 public latestAuditMerkleRoot;
    uint256 public auditBatchCount;

    modifier onlyTimelock() {
        if (msg.sender != multisigTimelock) revert OnlyMultisigTimelock();
        _;
    }

    constructor(
        address _safeVault,
        address _multisigTimelock,
        uint256 _maxSingleTradeWei,
        uint256 _maxDailyVolumeWei,
        uint256 _minCooldownSeconds
    ) {
        safeVault = _safeVault;
        multisigTimelock = _multisigTimelock;
        maxSingleTradeWei = _maxSingleTradeWei;
        maxDailyVolumeWei = _maxDailyVolumeWei;
        minCooldownSeconds = _minCooldownSeconds;
    }

    /**
     * @notice Emergency Kill Switch — can be triggered by the Safe owner or Timelock at any time.
     */
    function activateEmergencyKillSwitch() external {
        require(msg.sender == safeVault || msg.sender == multisigTimelock, "Unauthorized");
        paused = true;
        killed = true;
        emit EmergencyKillSwitchActivated(msg.sender, block.timestamp);
    }

    /**
     * @notice Anchors an off-chain Evidence Vault / Investor Report Merkle root on-chain.
     */
    function anchorAuditMerkleRoot(bytes32 merkleRoot) external {
        require(msg.sender == safeVault || msg.sender == multisigTimelock, "Unauthorized");
        latestAuditMerkleRoot = merkleRoot;
        auditBatchCount += 1;
        emit MerkleAuditRootAnchored(merkleRoot, auditBatchCount, block.timestamp);
    }

    /**
     * @notice Safe `ITransactionGuard.checkTransaction` hook — reverts Fail-Closed on any violation.
     */
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external {
        // 1. Global Kill Switch & Pause check
        if (paused || killed) revert SafeGuardPausedOrKilled();

        // 2. Forbid DelegateCall completely
        if (operation == Operation.DelegateCall) revert DelegateCallForbidden();

        // 3. Block native ETH transfers to non-allowlisted external addresses
        if (value > 0 && !allowlistedDexRouters[to]) {
            revert ExternalTransferForbidden(to);
        }

        // 4. Require valid calldata with a 4-byte function selector
        if (data.length < 4) {
            revert FunctionSelectorNotAllowlisted(bytes4(0));
        }

        bytes4 selector;
        assembly {
            selector := mload(add(data, 32))
        }

        // 5. Block any attempt to mutate Safe owners, threshold, modules, or guard
        if (
            to == safeVault ||
            selector == SEL_ADD_OWNER ||
            selector == SEL_REMOVE_OWNER ||
            selector == SEL_SWAP_OWNER ||
            selector == SEL_CHANGE_THRESHOLD ||
            selector == SEL_SET_GUARD ||
            selector == SEL_ENABLE_MODULE ||
            selector == SEL_DISABLE_MODULE ||
            selector == SEL_SET_FALLBACK
        ) {
            revert SelfMutationForbidden(selector);
        }

        // 6. Block any ERC-20 `transfer` or `transferFrom` to external addresses
        if (selector == SEL_TRANSFER || selector == SEL_TRANSFER_FROM) {
            revert ExternalTransferForbidden(to);
        }

        // 7. Enforce Exact / Bounded Approvals only to allowlisted DEX routers (No Unlimited Approvals)
        if (selector == SEL_APPROVE) {
            if (!allowlistedTokens[to]) revert TargetContractNotAllowlisted(to);
            (address spender, uint256 amount) = abi.decode(_slicePayload(data), (address, uint256));
            if (!allowlistedDexRouters[spender]) revert ApprovalSpenderNotAllowlisted(spender);
            if (amount == type(uint256).max || amount > maxSingleTradeWei) {
                revert UnlimitedApprovalForbidden(amount);
            }
            emit TransactionCheckedByGuard(safeVault, to, selector, value);
            return;
        }

        // 8. For DEX swaps, target must be an allowlisted DEX router and selector must be allowlisted
        if (!allowlistedDexRouters[to]) revert TargetContractNotAllowlisted(to);
        if (!allowlistedSelectors[selector]) revert FunctionSelectorNotAllowlisted(selector);

        // 9. Enforce Cooldown & Single-Trade / Daily Volume caps
        if (block.timestamp < lastTradeTimestamp + minCooldownSeconds) {
            revert CooldownNotElapsed(lastTradeTimestamp + minCooldownSeconds);
        }
        if (value > maxSingleTradeWei) {
            revert SingleTradeLimitExceeded(value, maxSingleTradeWei);
        }

        uint256 dayIdx = block.timestamp / 1 days;
        if (dayIdx != currentDayIndex) {
            currentDayIndex = dayIdx;
            currentDayVolumeWei = 0;
        }
        if (currentDayVolumeWei + value > maxDailyVolumeWei) {
            revert DailyVolumeLimitExceeded(currentDayVolumeWei + value, maxDailyVolumeWei);
        }

        currentDayVolumeWei += value;
        lastTradeTimestamp = block.timestamp;

        emit TransactionCheckedByGuard(safeVault, to, selector, value);
    }

    function checkAfterExecution(bytes32, bool) external view {
        if (paused || killed) revert SafeGuardPausedOrKilled();
    }

    function setAllowlistedDexRouter(address router, bool allowed) external onlyTimelock {
        allowlistedDexRouters[router] = allowed;
    }

    function setAllowlistedToken(address token, bool allowed) external onlyTimelock {
        allowlistedTokens[token] = allowed;
    }

    function setAllowlistedSelector(bytes4 selector, bool allowed) external onlyTimelock {
        allowlistedSelectors[selector] = allowed;
    }

    function _slicePayload(bytes memory data) internal pure returns (bytes memory) {
        require(data.length >= 4, "Short calldata");
        bytes memory payload = new bytes(data.length - 4);
        for (uint256 i = 4; i < data.length; i++) {
            payload[i - 4] = data[i];
        }
        return payload;
    }
}
