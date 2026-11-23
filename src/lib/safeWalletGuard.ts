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
import { publicAppUrl } from '@/lib/runtimeConfig';

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
  /**
   * True ONLY when an on-chain guard or module was detected on the Safe. The off-chain
   * `validateAgentTransactionWithSafeGuard()` policy is always active, but it is NOT an on-chain lock.
   */
  zodiacRolesGuardActive: boolean;
  /** Guard contract currently set on the Safe (eth_getStorageAt of the Safe guard slot), if any. */
  onChainGuard?: string | null;
  /** Modules enabled on the Safe (getModulesPaginated), e.g. a Zodiac Roles modifier. */
  onChainModules?: string[];
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
  const origin = params.appUrl || publicAppUrl();

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
      zodiacRolesGuardActive: false,
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
  /** Guard contract set on the Safe (null = no guard). */
  guard?: string | null;
  /** Enabled modules (e.g. Zodiac Roles). Modules can execute WITHOUT owner signatures - review them! */
  modules?: string[];
  chainChecked: SupportedChainId;
  errorReasonSk?: string;
  errorReasonEn?: string;
}

/** keccak256("guard_manager.guard.address") - storage slot where Safe >= 1.3 keeps its guard. */
export const SAFE_GUARD_STORAGE_SLOT =
  '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8';
const SEL_GET_THRESHOLD = '0xe75235b8';
const SEL_GET_OWNERS = '0xa0e67e2b';
const SEL_VERSION = '0xffa1ad74';
// getModulesPaginated(address start = SENTINEL(0x1), uint256 pageSize = 20)
const CALL_GET_MODULES =
  '0xcc2f8452' +
  '0000000000000000000000000000000000000000000000000000000000000001' +
  '0000000000000000000000000000000000000000000000000000000000000014';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Decodes an ABI-encoded `address[]` that starts at `wordOffset` (in 32-byte words) of `hex`. */
export function decodeAbiAddressArray(hex: string, wordOffset = 0): string[] {
  const body = hex.startsWith('0x') ? hex.slice(2) : hex;
  const word = (i: number) => body.slice(i * 64, (i + 1) * 64);
  const offsetWords = parseInt(word(wordOffset), 16) / 32;
  if (!Number.isFinite(offsetWords)) return [];
  const len = parseInt(word(offsetWords), 16);
  if (!Number.isFinite(len) || len < 0 || len > 1000) return [];
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    const w = word(offsetWords + 1 + i);
    if (w.length !== 64) return [];
    out.push(`0x${w.slice(24)}`);
  }
  return out;
}

function decodeAbiString(hex: string): string | undefined {
  try {
    const body = hex.startsWith('0x') ? hex.slice(2) : hex;
    const len = parseInt(body.slice(64, 128), 16);
    if (!Number.isFinite(len) || len <= 0 || len > 64) return undefined;
    const bytes = body.slice(128, 128 + len * 2);
    let out = '';
    for (let i = 0; i < bytes.length; i += 2) out += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
    return out;
  } catch {
    return undefined;
  }
}

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error || typeof json.result !== 'string') {
    throw new Error(json.error?.message || 'RPC error');
  }
  return json.result;
}

function failVerification(
  chain: SupportedChainId,
  sk: string,
  en: string,
  isContract = false,
): OnChainSafeVerification {
  return {
    isContract,
    isSafeContract: false,
    threshold: 0,
    owners: [],
    ownersCount: 0,
    chainChecked: chain,
    errorReasonSk: sk,
    errorReasonEn: en,
  };
}

/**
 * Verifies ON-CHAIN (public RPC, no API key needed) that an address is a deployed Safe Smart Account:
 * `eth_getCode` + `getThreshold()` + `getOwners()` (+ `VERSION()`, guard slot, modules).
 *
 * FAIL-CLOSED: any RPC error, timeout or unexpected answer => `isSafeContract: false`.
 * (Previously network errors returned `isSafeContract: true`, i.e. any address was accepted.)
 */
export async function verifySafeContractOnChain(
  address: string,
  chainId: SupportedChainId = 'arbitrum',
): Promise<OnChainSafeVerification> {
  const parsed = parseSafeAddressInput(address);
  if (!parsed.valid) {
    return failVerification(
      chainId,
      'Neplatný formát Ethereum/EVM adresy (očakáva sa 0x… alebo arb1:0x…).',
      'Invalid EVM address format (expected 0x… or arb1:0x…).',
    );
  }

  const effectiveChain = parsed.chain ?? chainId;
  const chainInfo = SAFE_SUPPORTED_CHAINS.find((c) => c.id === effectiveChain);
  if (!chainInfo || !chainInfo.rpcUrl || !chainInfo.chainIdNumeric) {
    return failVerification(
      effectiveChain,
      `Sieť ${chainInfo?.name ?? effectiveChain} nepodporuje Safe{Wallet} (EVM) overenie. Vyber Arbitrum, Ethereum, Base, Optimism, Polygon, BSC alebo Avalanche.`,
      `${chainInfo?.name ?? effectiveChain} does not support Safe{Wallet} (EVM) verification. Pick an EVM chain.`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const rpc = chainInfo.rpcUrl;
  const addr = parsed.address;

  try {
    const bytecode = await rpcCall(rpc, 'eth_getCode', [addr, 'latest'], controller.signal);
    if (!bytecode || bytecode === '0x' || bytecode.length <= 4) {
      return failVerification(
        effectiveChain,
        `Adresa ${formatShortAddress(addr)} na sieti ${chainInfo.name} nie je Safe kontrakt (je to bežná peňaženka/EOA alebo Safe je na inej sieti). Skontroluj sieť alebo vytvor Safe na app.safe.global.`,
        `Address ${formatShortAddress(addr)} on ${chainInfo.name} is not a Safe contract (plain EOA, or the Safe lives on another chain). Check the network or create a Safe on app.safe.global.`,
      );
    }

    const threshHex = await rpcCall(
      rpc,
      'eth_call',
      [{ to: addr, data: SEL_GET_THRESHOLD }, 'latest'],
      controller.signal,
    );
    const ownersHex = await rpcCall(
      rpc,
      'eth_call',
      [{ to: addr, data: SEL_GET_OWNERS }, 'latest'],
      controller.signal,
    );
    const threshold = threshHex.length >= 66 ? parseInt(threshHex.slice(-64), 16) : 0;
    const owners = decodeAbiAddressArray(ownersHex);
    if (!threshold || owners.length === 0 || threshold > owners.length) {
      return failVerification(
        effectiveChain,
        `Kontrakt ${formatShortAddress(addr)} nevyzerá ako Safe (getOwners/getThreshold neodpovedá správne).`,
        `Contract ${formatShortAddress(addr)} does not look like a Safe (getOwners/getThreshold answered unexpectedly).`,
        true,
      );
    }

    // Optional extras - failures here do not reject the Safe, they only leave fields empty.
    let safeVersion: string | undefined;
    let guard: string | null | undefined;
    let modules: string[] | undefined;
    try {
      safeVersion = decodeAbiString(
        await rpcCall(rpc, 'eth_call', [{ to: addr, data: SEL_VERSION }, 'latest'], controller.signal),
      );
    } catch { /* ignore */ }
    try {
      const slot = await rpcCall(
        rpc,
        'eth_getStorageAt',
        [addr, SAFE_GUARD_STORAGE_SLOT, 'latest'],
        controller.signal,
      );
      const g = `0x${slot.slice(-40)}`;
      guard = g.toLowerCase() === ZERO_ADDRESS ? null : g;
    } catch { /* ignore */ }
    try {
      const modsHex = await rpcCall(
        rpc,
        'eth_call',
        [{ to: addr, data: CALL_GET_MODULES }, 'latest'],
        controller.signal,
      );
      modules = decodeAbiAddressArray(modsHex, 0);
    } catch { /* ignore */ }

    return {
      isContract: true,
      isSafeContract: true,
      threshold,
      owners,
      ownersCount: owners.length,
      safeVersion,
      guard,
      modules,
      chainChecked: effectiveChain,
    };
  } catch {
    return failVerification(
      effectiveChain,
      `Nepodarilo sa overiť Safe na sieti ${chainInfo.name} (RPC nedostupné alebo timeout). Skús znova o chvíľu.`,
      `Could not verify the Safe on ${chainInfo.name} (RPC unavailable or timed out). Please retry.`,
    );
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

/**
 * Method names (bare identifier, case-insensitive) that move funds out of the Safe or change who
 * controls it. Matched against the identifier BEFORE any "(" so "transfer", "transfer(address,uint256)"
 * and " Transfer " are all caught.
 */
const FORBIDDEN_METHOD_NAMES = new Set(
  [
    'transfer',
    'transferFrom',
    'safeTransfer',
    'safeTransferFrom',
    'safeBatchTransferFrom',
    'send',
    'sendValue',
    'withdrawTo',
    'permit',
    'increaseAllowance',
    'setApprovalForAll',
    'addOwnerWithThreshold',
    'removeOwner',
    'swapOwner',
    'changeThreshold',
    'setGuard',
    'setModuleGuard',
    'enableModule',
    'disableModule',
    'setFallbackHandler',
    'setup',
    'execTransaction',
    'execTransactionFromModule',
    'execTransactionFromModuleReturnData',
    'multiSend',
    'delegatecall',
    'selfdestruct',
  ].map((m) => m.toLowerCase()),
);

export function isForbiddenAgentMethod(methodName: string): boolean {
  const ident = methodName.trim().split('(')[0].trim().toLowerCase();
  if (!ident) return false;
  if (FORBIDDEN_METHOD_NAMES.has(ident)) return true;
  // Generic catch-alls: anything that sends/withdraws "to" an arbitrary address.
  return /^(withdraw|send|bridge|transfer).*to$/i.test(ident);
}

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
    if (isForbiddenAgentMethod(tx.methodName)) {
      return {
        allowed: false,
        code: 'BLOCKED_FORBIDDEN_METHOD',
        reasonSk: `ZABLOKOVANÉ (Safe Guard): Volanie metódy "${tx.methodName}" je na čiernej listine pre všetkých AI agentov.`,
        reasonEn: `BLOCKED (Safe Guard): Method "${tx.methodName}" is blacklisted for all AI agents.`,
      };
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

  // 4. Enforce single-trade size cap relative to portfolio (fail-closed on bad numbers)
  if (
    !Number.isFinite(tx.amountUsd) ||
    tx.amountUsd < 0 ||
    !Number.isFinite(portfolioTotalUsd) ||
    portfolioTotalUsd <= 0
  ) {
    return {
      allowed: false,
      code: 'BLOCKED_TRADE_EXCEEDS_CAP',
      reasonSk: 'ZABLOKOVANÉ (Risk Limit): Neplatná suma obchodu alebo neznáma hodnota portfólia.',
      reasonEn: 'BLOCKED (Risk Limit): Invalid trade amount or unknown portfolio value.',
    };
  }
  if (tx.amountUsd > 0) {
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

  // NOTE: there is no calldata builder for real swaps yet. The previous version proposed a
  // meaningless `to: safe, data: 0x` transaction which owners could have signed by mistake.
  // Until real, decoded & simulated calldata exists, nothing is proposed to Safe{Wallet}.
  // Real agent execution must go through the on-chain Zodiac Roles scope (see SAFE_AGENT_PERMISSIONS.md).
  void SafeAppsSDK;
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
    parsed.zodiacRolesGuardActive = Boolean(
      parsed.onChainGuard || (Array.isArray(parsed.onChainModules) && parsed.onChainModules.length > 0),
    );
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
        zodiacRolesGuardActive: Boolean(
          session.onChainGuard ||
            (Array.isArray(session.onChainModules) && session.onChainModules.length > 0),
        ),
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
