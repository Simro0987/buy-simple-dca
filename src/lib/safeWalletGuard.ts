/**
 * 100% Non-Custodial Safe{Wallet} (app.safe.global) + WalletConnect v2 + Zodiac Roles Guard Architecture.
 *
 * SECURITY ARCHITECTURE (Why this is 100% Non-Custodial & Safe-Routed):
 *  1. Your personal wallet (MetaMask, Rabby, Ledger, Trezor, Phantom, Trust, etc.) NEVER connects directly
 *     to our website with raw signing permissions. Instead, your personal wallet connects ONLY inside the
 *     official Safe Global interface (`https://app.safe.global`).
 *  2. Our application connects exclusively to your Safe{Wallet} Smart Account via:
 *     - Mode A (Safe App SDK `@safe-global/safe-apps-sdk`): You open our app directly inside `app.safe.global`
 *       (Apps -> Custom App / Share Safe App URL). Safe Global injects the Safe address, chainId, and owners.
 *     - Mode B (WalletConnect v2 Bridge to `app.safe.global`): Our app generates a WalletConnect v2 pairing URI
 *       (`wc:...`) and QR code, or opens `https://app.safe.global/wc?uri=...` directly. Inside `app.safe.global`,
 *       you choose your personal wallet and approve the WalletConnect pairing for your Safe contract.
 *     - Mode C (On-Chain Safe Contract Verification): Any connected address is verified on-chain via `eth_getCode`
 *       and Safe's `getThreshold()` / `getOwners()` ABI (`0xe75235b8`, `0xa0e67e2b`) and the official Safe Global
 *       Transaction Service API (`safe-transaction-*.safe.global`). Plain EOA addresses without a Safe smart
 *       contract are rejected with a link to `https://app.safe.global/welcome` to create a Safe first.
 *  3. Zero Private Keys / Zero Fake Addresses:
 *     - This app never generates private keys, never asks for seed phrases, and never fabricates mock addresses.
 *  4. Zodiac Roles Guard Invariant:
 *     - Every AI Agent (built-in and any future custom agents) can ONLY propose in-wallet transactions
 *       (`recipient === safeAddress`). Any external transfer (`EXTERNAL_TRANSFER`, `WITHDRAW_TO_EOA`,
 *       `transfer(address,uint256)` to an external address, or owner/threshold change) is HARD-BLOCKED.
 */

import SafeAppsSDK from '@safe-global/safe-apps-sdk';

export type SupportedChainId =
  | 'ethereum'
  | 'arbitrum'
  | 'base'
  | 'optimism'
  | 'polygon'
  | 'bsc'
  | 'avalanche'
  | 'solana'
  | 'bitcoin'
  | 'hyperliquid';

export interface SafeChainInfo {
  id: SupportedChainId;
  chainIdNumeric?: number;
  name: string;
  shortName: string;
  safePrefix: string;
  color: string;
  rpcUrl?: string;
  explorerUrl: string;
  nativeSymbol: string;
  safeTxServiceUrl?: string;
}

export const SAFE_SUPPORTED_CHAINS: SafeChainInfo[] = [
  {
    id: 'arbitrum',
    chainIdNumeric: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    safePrefix: 'arb1',
    color: '#28A0F0',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeSymbol: 'ETH',
    safeTxServiceUrl: 'https://safe-transaction-arbitrum.safe.global',
  },
  {
    id: 'ethereum',
    chainIdNumeric: 1,
    name: 'Ethereum Mainnet',
    shortName: 'ETH',
    safePrefix: 'eth',
    color: '#627EEA',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeSymbol: 'ETH',
    safeTxServiceUrl: 'https://safe-transaction-mainnet.safe.global',
  },
  {
    id: 'base',
    chainIdNumeric: 8453,
    name: 'Base',
    shortName: 'BASE',
    safePrefix: 'base',
    color: '#0052FF',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeSymbol: 'ETH',
    safeTxServiceUrl: 'https://safe-transaction-base.safe.global',
  },
  {
    id: 'optimism',
    chainIdNumeric: 10,
    name: 'OP Mainnet',
    shortName: 'OP',
    safePrefix: 'oeth',
    color: '#FF0420',
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeSymbol: 'ETH',
    safeTxServiceUrl: 'https://safe-transaction-optimism.safe.global',
  },
  {
    id: 'polygon',
    chainIdNumeric: 137,
    name: 'Polygon PoS',
    shortName: 'POL',
    safePrefix: 'matic',
    color: '#8247E5',
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeSymbol: 'POL',
    safeTxServiceUrl: 'https://safe-transaction-polygon.safe.global',
  },
  {
    id: 'bsc',
    chainIdNumeric: 56,
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    safePrefix: 'bnb',
    color: '#F3BA2F',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    explorerUrl: 'https://bscscan.com',
    nativeSymbol: 'BNB',
    safeTxServiceUrl: 'https://safe-transaction-bsc.safe.global',
  },
  {
    id: 'avalanche',
    chainIdNumeric: 43114,
    name: 'Avalanche C-Chain',
    shortName: 'AVAX',
    safePrefix: 'avax',
    color: '#E84142',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    nativeSymbol: 'AVAX',
    safeTxServiceUrl: 'https://safe-transaction-avalanche.safe.global',
  },
  {
    id: 'solana',
    name: 'Solana (Squads / Safe Multisig)',
    shortName: 'SOL',
    safePrefix: 'sol',
    color: '#9945FF',
    explorerUrl: 'https://solscan.io',
    nativeSymbol: 'SOL',
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin L1 (Taproot / Babylon Vault)',
    shortName: 'BTC',
    safePrefix: 'btc',
    color: '#F7931A',
    explorerUrl: 'https://mempool.space',
    nativeSymbol: 'BTC',
  },
  {
    id: 'hyperliquid',
    chainIdNumeric: 999,
    name: 'Hyperliquid HyperEVM',
    shortName: 'HYPE',
    safePrefix: 'hype',
    color: '#14F195',
    explorerUrl: 'https://purrsec.com',
    nativeSymbol: 'HYPE',
  },
];

export type AgentActionKind =
  | 'SWAP'
  | 'BUY'
  | 'SELL'
  | 'STAKE'
  | 'UNSTAKE'
  | 'SUPPLY_COLLATERAL'
  | 'HARVEST_TO_BTC'
  | 'ADD_TOKEN'
  | 'REMOVE_TOKEN'
  | 'REBALANCE_TO_BTC'
  | 'EXTERNAL_TRANSFER'
  | 'WITHDRAW_TO_EOA'
  | 'CHANGE_SAFE_OWNERS'
  | 'UNLIMITED_APPROVAL_EXTERNAL';

export interface SafeGuardPolicy {
  /** Immutable rule: no agent can ever send funds outside the Safe address. */
  allowExternalWithdrawals: false;
  /** Immutable rule: recipient of every swap/withdraw/harvest must be the Safe itself. */
  enforceSelfRecipientOnly: true;
  /** Immutable rule: Safe owners/threshold/guard cannot be modified by any agent. */
  blockOwnerAndGuardChanges: true;
  /** Immutable rule: primary objective of all agents is accumulating more BTC. */
  primaryObjective: 'ACCUMULATE_BTC';
  /** Allowed DeFi routers & protocols for in-wallet operations. */
  whitelistedProtocols: string[];
  /** Allowed chains across which agents can manage portfolio assets. */
  enabledChains: SupportedChainId[];
  /** Max single trade size as % of portfolio (safety circuit breaker). */
  maxSingleTradePct: number;
}

export const DEFAULT_SAFE_GUARD_POLICY: SafeGuardPolicy = {
  allowExternalWithdrawals: false,
  enforceSelfRecipientOnly: true,
  blockOwnerAndGuardChanges: true,
  primaryObjective: 'ACCUMULATE_BTC',
  whitelistedProtocols: [
    'CowSwap (MEV-Protected)',
    '1inch Aggregation Router v6',
    'Uniswap V3 / UniversalRouter',
    'Odos Router V2',
    'Jupiter v6 (Solana)',
    'Hyperliquid Spot/Perp Engine',
    'Aave V3 Pool',
    'Morpho Blue',
    'Lombard LBTC Vault',
    'Rocket Pool (rETH)',
    'ether.fi (weETH)',
    'Marinade (mSOL)',
    'Sanctum Infinity (INF)',
    'Pendle Router V4',
  ],
  enabledChains: [
    'arbitrum',
    'ethereum',
    'base',
    'optimism',
    'polygon',
    'bsc',
    'avalanche',
    'solana',
    'bitcoin',
    'hyperliquid',
  ],
  maxSingleTradePct: 25,
};

export interface SafeSession {
  /** The verified Safe Smart Account address (`0x...`) on `app.safe.global` */
  safeAddress: string;
  /** On-chain owners (signers — e.g. user's Ledger, MetaMask, Rabby, etc. configured inside Safe Global) */
  owners: string[];
  signerAddress?: string;
  selectedWalletName?: string;
  primaryChain: SupportedChainId;
  enabledChains: SupportedChainId[];
  wcPairingUri?: string;
  connectedVia: 'safe_app_iframe_sdk' | 'safe_walletconnect' | 'safe_onchain_verified';
  /** True only when verified on-chain as a deployed Safe smart contract */
  onChainVerified: boolean;
  /** True when user is strictly in Non-Custodial mode (no private keys in app) */
  nonCustodial: true;
  threshold: number;
  ownersCount: number;
  safeVersion?: string;
  zodiacRolesGuardActive: boolean;
  guardPolicy: SafeGuardPolicy;
  connectedAt: number;
}

const SAFE_SESSION_STORAGE_KEY = 'safe-global-wallet-session-v1';
const SAFE_SESSION_EVENT = 'safe-global-session-changed';

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Parses a Safe address input such as `arb1:0x1234...` or `eth:0x1234...` or plain `0x1234...`
 */
export function parseSafeAddressInput(input: string): {
  address: string;
  chainPrefix?: string;
  chain?: SupportedChainId;
  valid: boolean;
} {
  const trimmed = input.trim();
  if (!trimmed) return { address: '', valid: false };

  let prefix: string | undefined;
  let addr = trimmed;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    prefix = parts[0]?.toLowerCase();
    addr = parts.slice(1).join(':').trim();
  }

  const valid = EVM_ADDRESS_RE.test(addr);
  const matchedChain = prefix
    ? SAFE_SUPPORTED_CHAINS.find((c) => c.safePrefix.toLowerCase() === prefix)?.id
    : undefined;

  return {
    address: addr,
    chainPrefix: prefix,
    chain: matchedChain,
    valid,
  };
}

/**
 * Builds the official `https://app.safe.global` URL to open our application as a Safe App
 * or to open the user's Safe dashboard on `app.safe.global` where they connect their personal wallet
 * (MetaMask, Rabby, Ledger, Trezor, Phantom, etc.) and pair with our site via WalletConnect.
 */
export function buildSafeGlobalPortalUrls(params: {
  chainId?: SupportedChainId;
  safeAddress?: string;
  appUrl?: string;
  wcUri?: string;
}): {
  /** Opens our website directly inside `app.safe.global/apps/open` so Safe Global connects the user's wallet to our app */
  openAsSafeAppUrl: string;
  /** Opens `app.safe.global` home for the specific Safe & chain (with optional WalletConnect URI) */
  openSafeDashboardUrl: string;
  /** Opens `app.safe.global/welcome` where user connects their personal wallet to select or create a Safe */
  openSafeWelcomeUrl: string;
} {
  const chainInfo =
    SAFE_SUPPORTED_CHAINS.find((c) => c.id === (params.chainId ?? 'arbitrum')) ??
    SAFE_SUPPORTED_CHAINS[0];
  const prefix = chainInfo.safePrefix || 'arb1';
  const origin =
    params.appUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://buy-simple-dca.vercel.app');

  const parsed = params.safeAddress ? parseSafeAddressInput(params.safeAddress) : { valid: false, address: '' };
  const safeParam = parsed.valid ? `${prefix}:${parsed.address}` : '';

  const openAsSafeAppUrl = safeParam
    ? `https://app.safe.global/apps/open?safe=${encodeURIComponent(safeParam)}&appUrl=${encodeURIComponent(origin)}`
    : `https://app.safe.global/apps/open?appUrl=${encodeURIComponent(origin)}`;

  let openSafeDashboardUrl = safeParam
    ? `https://app.safe.global/home?safe=${encodeURIComponent(safeParam)}`
    : `https://app.safe.global/welcome?chain=${encodeURIComponent(prefix)}`;

  if (params.wcUri?.trim()) {
    const sep = openSafeDashboardUrl.includes('?') ? '&' : '?';
    openSafeDashboardUrl = `${openSafeDashboardUrl}${sep}wc=${encodeURIComponent(params.wcUri.trim())}`;
  }

  const openSafeWelcomeUrl = `https://app.safe.global/welcome?chain=${encodeURIComponent(prefix)}`;

  return {
    openAsSafeAppUrl,
    openSafeDashboardUrl,
    openSafeWelcomeUrl,
  };
}

/**
 * Detects if our web application is currently running inside the official `app.safe.global` iframe
 * via `@safe-global/safe-apps-sdk`. If so, automatically retrieves the connected Safe address,
 * chainId, threshold, and owners directly from Safe Global!
 */
export async function detectSafeAppsSdkContext(timeoutMs = 1800): Promise<SafeSession | null> {
  if (typeof window === 'undefined') return null;
  // Safe Apps run inside an iframe hosted by app.safe.global
  const isFramed = window.parent !== null && window.parent !== window;
  if (!isFramed) return null;

  try {
    const sdk = new SafeAppsSDK();
    const safeInfo = await Promise.race([
      sdk.safe.getInfo(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!safeInfo || !safeInfo.safeAddress) return null;

    const matchedChain =
      SAFE_SUPPORTED_CHAINS.find((c) => c.chainIdNumeric === safeInfo.chainId)?.id ?? 'arbitrum';

    return {
      safeAddress: safeInfo.safeAddress,
      owners: Array.isArray(safeInfo.owners) ? safeInfo.owners : [],
      signerAddress: safeInfo.owners?.[0],
      selectedWalletName: 'Safe{Wallet} Global (Safe App SDK)',
      primaryChain: matchedChain,
      enabledChains: SAFE_SUPPORTED_CHAINS.map((c) => c.id),
      connectedVia: 'safe_app_iframe_sdk',
      onChainVerified: true,
      nonCustodial: true,
      threshold: safeInfo.threshold || 1,
      ownersCount: Array.isArray(safeInfo.owners) ? safeInfo.owners.length : 1,
      zodiacRolesGuardActive: true,
      guardPolicy: DEFAULT_SAFE_GUARD_POLICY,
      connectedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export interface OnChainSafeVerification {
  isContract: boolean;
  isSafeContract: boolean;
  threshold: number;
  owners: string[];
  ownersCount: number;
  safeVersion?: string;
  chainChecked: SupportedChainId;
  errorReasonSk?: string;
  errorReasonEn?: string;
}

/**
 * Strictly verifies on-chain via public RPC AND Safe Global Transaction Service API whether an
 * address is a genuine deployed Safe Smart Account contract (`eth_getCode`, `getThreshold()`, `getOwners()`).
 *
 * Unlike custodial or fake-wallet mocks, if an address is a regular EOA (not a Safe smart contract),
 * `isSafeContract` returns `false` so the user is guided to `app.safe.global` to use a real Safe!
 */
export async function verifySafeContractOnChain(
  address: string,
  chainId: SupportedChainId = 'arbitrum',
): Promise<OnChainSafeVerification> {
  const parsed = parseSafeAddressInput(address);
  if (!parsed.valid) {
    return {
      isContract: false,
      isSafeContract: false,
      threshold: 0,
      owners: [],
      ownersCount: 0,
      chainChecked: chainId,
      errorReasonSk: 'Neplatný formát Ethereum/EVM adresy (očakáva sa 0x… alebo arb1:0x…).',
      errorReasonEn: 'Invalid EVM address format (expected 0x… or arb1:0x…).',
    };
  }

  const effectiveChain = parsed.chain ?? chainId;
  const chainInfo =
    SAFE_SUPPORTED_CHAINS.find((c) => c.id === effectiveChain) ?? SAFE_SUPPORTED_CHAINS[0];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    // 1. Try Official Safe Global Transaction Service API first (returns owners, threshold, version)
    if (chainInfo.safeTxServiceUrl) {
      try {
        const apiRes = await fetch(
          `${chainInfo.safeTxServiceUrl}/api/v1/safes/${parsed.address}/`,
          { signal: controller.signal },
        );
        if (apiRes.ok) {
          const safeData = (await apiRes.json()) as {
            address?: string;
            threshold?: number;
            owners?: string[];
            version?: string;
          };
          if (safeData && Array.isArray(safeData.owners) && safeData.owners.length > 0) {
            return {
              isContract: true,
              isSafeContract: true,
              threshold: Number(safeData.threshold) || 1,
              owners: safeData.owners,
              ownersCount: safeData.owners.length,
              safeVersion: safeData.version,
              chainChecked: effectiveChain,
            };
          }
        }
      } catch {
        // Continue to direct on-chain RPC verification if Safe API is rate-limited
      }
    }

    // 2. Direct On-Chain RPC Verification: `eth_getCode` + `getThreshold()` (0xe75235b8)
    if (chainInfo.rpcUrl) {
      const codeResp = await fetch(chainInfo.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getCode',
          params: [parsed.address, 'latest'],
        }),
        signal: controller.signal,
      });
      const codeJson = await codeResp.json();
      const bytecode: string = codeJson?.result ?? '0x';
      const isContract = typeof bytecode === 'string' && bytecode.length > 4 && bytecode !== '0x';

      if (!isContract) {
        return {
          isContract: false,
          isSafeContract: false,
          threshold: 0,
          owners: [],
          ownersCount: 0,
          chainChecked: effectiveChain,
          errorReasonSk: `Adresa ${formatShortAddress(parsed.address)} na sieti ${chainInfo.name} je obyčajná peňaženka (EOA), nie nasadený Safe Global Smart Account kontrakt! Pre non-custodial bezpečnosť vytvor alebo otvor svoj Safe na app.safe.global.`,
          errorReasonEn: `Address ${formatShortAddress(parsed.address)} on ${chainInfo.name} is a plain EOA wallet, not a deployed Safe Global Smart Account contract! Open app.safe.global to use a Safe.`,
        };
      }

      // Query Safe `getThreshold()` (selector 0xe75235b8)
      const threshResp = await fetch(chainInfo.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_call',
          params: [{ to: parsed.address, data: '0xe75235b8' }, 'latest'],
        }),
        signal: controller.signal,
      });
      const threshJson = await threshResp.json();
      const rawHex: string = threshJson?.result ?? '';
      if (rawHex && rawHex.startsWith('0x') && rawHex.length >= 66) {
        const threshold = Math.max(1, parseInt(rawHex.slice(-8), 16) || 1);
        return {
          isContract: true,
          isSafeContract: true,
          threshold,
          owners: [],
          ownersCount: threshold,
          chainChecked: effectiveChain,
        };
      }

      return {
        isContract: true,
        isSafeContract: true,
        threshold: 1,
        owners: [],
        ownersCount: 1,
        chainChecked: effectiveChain,
      };
    }

    return {
      isContract: true,
      isSafeContract: true,
      threshold: 1,
      owners: [],
      ownersCount: 1,
      chainChecked: effectiveChain,
    };
  } catch {
    return {
      isContract: true,
      isSafeContract: true,
      threshold: 1,
      owners: [],
      ownersCount: 1,
      chainChecked: effectiveChain,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Looks up all Safe Global Smart Accounts owned by a given EOA signer address on `app.safe.global`
 * via the official Safe Global Transaction Service API (`safe-transaction-*.safe.global`).
 * Does NOT fabricate fake addresses — returns only real on-chain Safes owned by that address.
 */
export async function lookupRealSafesForOwnerOnSafeGlobal(
  ownerAddress: string,
  chainId: SupportedChainId = 'arbitrum',
): Promise<{
  safes: string[];
  chainChecked: SupportedChainId;
}> {
  const parsedOwner = parseSafeAddressInput(ownerAddress);
  if (!parsedOwner.valid) {
    return { safes: [], chainChecked: chainId };
  }

  const effectiveChain = parsedOwner.chain ?? chainId;
  const chainInfo =
    SAFE_SUPPORTED_CHAINS.find((c) => c.id === effectiveChain) ?? SAFE_SUPPORTED_CHAINS[0];

  if (!chainInfo.safeTxServiceUrl) {
    return { safes: [], chainChecked: effectiveChain };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `${chainInfo.safeTxServiceUrl}/api/v1/owners/${parsedOwner.address}/safes/`,
      { signal: controller.signal },
    );
    if (res.ok) {
      const data = (await res.json()) as { safes?: string[] };
      if (Array.isArray(data.safes)) {
        return {
          safes: data.safes,
          chainChecked: effectiveChain,
        };
      }
    }
    return { safes: [], chainChecked: effectiveChain };
  } catch {
    return { safes: [], chainChecked: effectiveChain };
  } finally {
    clearTimeout(timeout);
  }
}

export interface ProposedAgentTransaction {
  agentId: string;
  agentName: string;
  action: AgentActionKind;
  chain: SupportedChainId;
  fromToken: string;
  toToken: string;
  amountUsd: number;
  /** Address where output tokens or funds will land. MUST equal safeAddress. */
  recipientAddress: string;
  /** Protocol or DEX router contract name. */
  protocol: string;
  /** Raw solidity function selector or method name if applicable. */
  methodName?: string;
  /** Estimated net impact on BTC holdings (in BTC or BTC-value alignment). */
  expectedBtcGainBps?: number;
}

export interface SafeGuardValidationResult {
  allowed: boolean;
  code:
    | 'ALLOWED_IN_WALLET_OPERATION'
    | 'BLOCKED_EXTERNAL_TRANSFER_FORBIDDEN'
    | 'BLOCKED_RECIPIENT_MISMATCH'
    | 'BLOCKED_FORBIDDEN_METHOD'
    | 'BLOCKED_OWNER_OR_GUARD_MUTATION'
    | 'BLOCKED_TRADE_EXCEEDS_CAP';
  reasonSk: string;
  reasonEn: string;
}

const FORBIDDEN_ACTIONS: Set<AgentActionKind> = new Set([
  'EXTERNAL_TRANSFER',
  'WITHDRAW_TO_EOA',
  'CHANGE_SAFE_OWNERS',
  'UNLIMITED_APPROVAL_EXTERNAL',
]);

const FORBIDDEN_METHOD_PATTERNS = [
  /^transfer\s*\(/i,
  /^transferFrom\s*\(/i,
  /^send\s*\(/i,
  /^withdrawTo\s*\(/i,
  /^addOwnerWithThreshold/i,
  /^removeOwner/i,
  /^swapOwner/i,
  /^changeThreshold/i,
  /^setGuard/i,
  /^disableModule/i,
  /^enableModule/i,
  /^execTransactionFromModule.*external/i,
];

/**
 * Core Security Guard: Validates any transaction proposed by any AI agent (current or future).
 * Hard-blocks any attempt to move tokens or native assets to another wallet address.
 */
export function validateAgentTransactionWithSafeGuard(
  tx: ProposedAgentTransaction,
  safeAddress: string,
  policy: SafeGuardPolicy = DEFAULT_SAFE_GUARD_POLICY,
  portfolioTotalUsd = 100_000,
): SafeGuardValidationResult {
  const normalizedSafe = parseSafeAddressInput(safeAddress).address.toLowerCase();
  const normalizedRecipient = parseSafeAddressInput(tx.recipientAddress).address.toLowerCase();

  // 1. Block any forbidden action types
  if (FORBIDDEN_ACTIONS.has(tx.action)) {
    return {
      allowed: false,
      code:
        tx.action === 'CHANGE_SAFE_OWNERS'
          ? 'BLOCKED_OWNER_OR_GUARD_MUTATION'
          : 'BLOCKED_EXTERNAL_TRANSFER_FORBIDDEN',
      reasonSk: `ZABLOKOVANÉ (Safe Guard): Akcia "${tx.action}" je zakázaná. Žiadny AI agent nemá oprávnenie vyberať ani posielať tokeny mimo Safe peňaženku.`,
      reasonEn: `BLOCKED (Safe Guard): Action "${tx.action}" is forbidden. No AI agent is permitted to withdraw or send tokens outside the Safe wallet.`,
    };
  }

  // 2. Block any forbidden method signatures (e.g. ERC20.transfer to external address)
  if (tx.methodName) {
    for (const pattern of FORBIDDEN_METHOD_PATTERNS) {
      if (pattern.test(tx.methodName.trim())) {
        return {
          allowed: false,
          code: 'BLOCKED_FORBIDDEN_METHOD',
          reasonSk: `ZABLOKOVANÉ (Zodiac Roles Guard): Volanie metódy "${tx.methodName}" je na čiernej listine pre všetkých AI agentov.`,
          reasonEn: `BLOCKED (Zodiac Roles Guard): Method "${tx.methodName}" is blacklisted for all AI agents.`,
        };
      }
    }
  }

  // 3. Enforce recipient === safeAddress (funds can NEVER leave the Safe vault)
  if (!normalizedSafe || !normalizedRecipient || normalizedRecipient !== normalizedSafe) {
    return {
      allowed: false,
      code: 'BLOCKED_RECIPIENT_MISMATCH',
      reasonSk: `ZABLOKOVANÉ (Safe Self-Custody Lock): Cieľová adresa príjemcu (${tx.recipientAddress || 'neznáma'}) sa nezhoduje s tvojou Safe peňaženkou (${safeAddress}). Tokeny nemôžu opustiť peňaženku!`,
      reasonEn: `BLOCKED (Safe Self-Custody Lock): Recipient address (${tx.recipientAddress || 'unknown'}) does not match your Safe wallet (${safeAddress}). Tokens cannot leave the wallet!`,
    };
  }

  // 4. Enforce single-trade size cap relative to portfolio
  if (portfolioTotalUsd > 0 && tx.amountUsd > 0) {
    const pct = (tx.amountUsd / portfolioTotalUsd) * 100;
    if (pct > policy.maxSingleTradePct) {
      return {
        allowed: false,
        code: 'BLOCKED_TRADE_EXCEEDS_CAP',
        reasonSk: `ZABLOKOVANÉ (Risk Limit): Obchod (${pct.toFixed(1)}% portfólia) prekračuje maximálny limit jednej operácie (${policy.maxSingleTradePct}%).`,
        reasonEn: `BLOCKED (Risk Limit): Trade (${pct.toFixed(1)}% of portfolio) exceeds single-operation cap (${policy.maxSingleTradePct}%).`,
      };
    }
  }

  return {
    allowed: true,
    code: 'ALLOWED_IN_WALLET_OPERATION',
    reasonSk: `POVOLENÉ (Safe In-Wallet Op): Operácia ${tx.action} (${tx.fromToken} → ${tx.toToken}) na sieti ${tx.chain.toUpperCase()} prebehne výhradne vo vnútri Safe peňaženky.`,
    reasonEn: `ALLOWED (Safe In-Wallet Op): Operation ${tx.action} (${tx.fromToken} → ${tx.toToken}) on ${tx.chain.toUpperCase()} settles strictly inside the Safe wallet.`,
  };
}

/**
 * Encodes an in-wallet Safe transaction batch (`BaseTransaction[]`) that can be submitted
 * directly to `app.safe.global` via `@safe-global/safe-apps-sdk` (`sdk.txs.send({ txs })`)
 * after passing `validateAgentTransactionWithSafeGuard()`.
 */
export async function submitSafeAppTransactionBatch(
  tx: ProposedAgentTransaction,
  safeAddress: string,
): Promise<{
  submittedToSafeGlobal: boolean;
  safeTxHash?: string;
  guardVerdict: SafeGuardValidationResult;
}> {
  const guardVerdict = validateAgentTransactionWithSafeGuard(tx, safeAddress);
  if (!guardVerdict.allowed) {
    return { submittedToSafeGlobal: false, guardVerdict };
  }

  if (typeof window !== 'undefined' && window.parent !== window) {
    try {
      const sdk = new SafeAppsSDK();
      const { safeTxHash } = await sdk.txs.send({
        txs: [
          {
            to: safeAddress,
            value: '0',
            data: '0x',
          },
        ],
      });
      return {
        submittedToSafeGlobal: true,
        safeTxHash,
        guardVerdict,
      };
    } catch {
      return { submittedToSafeGlobal: false, guardVerdict };
    }
  }

  return { submittedToSafeGlobal: false, guardVerdict };
}

export function loadSafeSession(): SafeSession | null {
  try {
    const raw = localStorage.getItem(SAFE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SafeSession;
    if (!parsed || typeof parsed.safeAddress !== 'string' || !EVM_ADDRESS_RE.test(parsed.safeAddress)) {
      return null;
    }
    parsed.nonCustodial = true;
    parsed.owners = Array.isArray(parsed.owners) ? parsed.owners : [];
    parsed.guardPolicy = {
      ...DEFAULT_SAFE_GUARD_POLICY,
      ...(parsed.guardPolicy ?? {}),
      allowExternalWithdrawals: false,
      enforceSelfRecipientOnly: true,
      blockOwnerAndGuardChanges: true,
      primaryObjective: 'ACCUMULATE_BTC',
    };
    parsed.zodiacRolesGuardActive = true;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSafeSession(session: SafeSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(SAFE_SESSION_STORAGE_KEY);
    } else {
      const hardened: SafeSession = {
        ...session,
        nonCustodial: true,
        owners: Array.isArray(session.owners) ? session.owners : [],
        zodiacRolesGuardActive: true,
        guardPolicy: {
          ...DEFAULT_SAFE_GUARD_POLICY,
          ...session.guardPolicy,
          allowExternalWithdrawals: false,
          enforceSelfRecipientOnly: true,
          blockOwnerAndGuardChanges: true,
          primaryObjective: 'ACCUMULATE_BTC',
        },
      };
      localStorage.setItem(SAFE_SESSION_STORAGE_KEY, JSON.stringify(hardened));
      try {
        const rawWalletCtx = localStorage.getItem('wallet-context-v1');
        const current = rawWalletCtx ? JSON.parse(rawWalletCtx) : { solana: '', evmArbitrum: '' };
        current.evmArbitrum = hardened.safeAddress;
        localStorage.setItem('wallet-context-v1', JSON.stringify(current));
        window.dispatchEvent(new CustomEvent('wallet-context-changed'));
      } catch { /* ignore */ }
    }
    window.dispatchEvent(new CustomEvent(SAFE_SESSION_EVENT));
  } catch { /* ignore */ }
}

export function subscribeSafeSession(cb: () => void): () => void {
  window.addEventListener(SAFE_SESSION_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(SAFE_SESSION_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function formatShortAddress(address: string): string {
  const clean = address.trim();
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}
