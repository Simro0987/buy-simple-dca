import type { PortfolioData } from '@/lib/portfolioData';
import { ensurePortfolioData } from '@/lib/portfolioData';
import { sumTacticalDeployedQty } from '@/lib/hcdExitStrategy';
import type { LedgerSymbol } from '@/lib/stakingLedger';

export function safeBalance(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function normalizeTokenSymbol(symbol: string | null | undefined): string {
  return String(symbol ?? '').trim().toUpperCase();
}

/** Wallet token shown when required derivative is missing (e.g. wstETH → ETH). */
export function resolveWalletTokenForRequirement(requiredToken: string | null | undefined): string {
  const token = normalizeTokenSymbol(requiredToken);
  if (['WSTETH', 'WEETH', 'RETH', 'WETH', 'STETH'].includes(token)) return 'ETH';
  if (['MSOL', 'JITOSOL', 'BSOL', 'JITO SOL'].includes(token)) return 'SOL';
  if (['LBTC', 'WBTC', 'CBBTC'].includes(token)) return 'BTC';
  if (['USDC', 'USDT', 'DAI', 'SDAI', 'SUSDE'].includes(token)) return 'USDC';
  if (token === 'ETH' || token === 'SOL' || token === 'BTC') return token;
  return String(requiredToken ?? 'ETH').trim() || 'ETH';
}

function ledgerSymbolForToken(token: string): LedgerSymbol | null {
  const upper = normalizeTokenSymbol(token);
  if (upper === 'ETH' || upper === 'WETH' || upper === 'WSTETH' || upper === 'WEETH' || upper === 'RETH' || upper === 'STETH') {
    return 'ETH';
  }
  if (upper === 'SOL' || upper === 'MSOL' || upper === 'JITOSOL' || upper === 'BSOL') return 'SOL';
  if (upper === 'BTC' || upper === 'LBTC' || upper === 'WBTC' || upper === 'CBBTC') return 'BTC';
  return null;
}

function protocolPatternsForToken(token: string): RegExp[] {
  const upper = normalizeTokenSymbol(token);
  if (upper === 'RETH') return [/rocket\s*pool/i, /reth/i];
  if (upper === 'MSOL') return [/marinade/i, /msol/i];
  if (upper === 'WSTETH' || upper === 'STETH') return [/lido/i, /wsteth/i, /steth/i];
  if (upper === 'WEETH') return [/ether\.?fi/i, /weeth/i];
  if (upper === 'LBTC') return [/lombard/i, /lbtc/i];
  if (upper === 'WETH') return [/aave/i, /morpho/i, /weth/i];
  if (upper === 'JITOSOL' || upper === 'JITO SOL') return [/jito/i];
  if (upper === 'BSOL') return [/blazestake/i, /bsol/i];
  return [];
}

function sumLedgerByPatterns(
  portfolio: PortfolioData,
  symbol: LedgerSymbol,
  patterns: RegExp[],
): number {
  const entries = portfolio.assets?.[symbol]?.stakedEntries ?? [];
  if (!patterns.length) return 0;
  return entries
    .filter(entry => patterns.some(pattern => pattern.test(String(entry?.protocol ?? ''))))
    .reduce((sum, entry) => sum + safeBalance(entry?.amount), 0);
}

/**
 * Strict balance lookup — only PortfolioData fields and ledger entries. No targets or layer deltas.
 */
export function getPortfolioTokenBalance(
  portfolio: PortfolioData | null | undefined,
  tokenSymbol: string | null | undefined,
): number {
  if (!portfolio) return 0;

  const safe = ensurePortfolioData(portfolio);
  const token = normalizeTokenSymbol(tokenSymbol);
  if (!token) return 0;

  const ledgerSymbol = ledgerSymbolForToken(token);
  if (!ledgerSymbol) return 0;

  if (token === 'ETH') return safeBalance(safe.assets?.ETH?.liquidQty);
  if (token === 'SOL') return safeBalance(safe.assets?.SOL?.liquidQty);
  if (token === 'BTC') return safeBalance(safe.assets?.BTC?.liquidQty);

  const patterns = protocolPatternsForToken(token);
  if (patterns.length > 0) {
    return sumLedgerByPatterns(safe, ledgerSymbol, patterns);
  }

  if (token === 'WETH') {
    return sumLedgerByPatterns(safe, 'ETH', [/aave/i, /morpho/i]);
  }

  return 0;
}

export interface TokenRequirementCheck {
  requiredToken: string;
  requiredAmount: number;
  requiredTokenBalance: number;
  walletToken: string;
  walletBalance: number;
  hasEnoughToken: boolean;
}

export function evaluateTokenRequirement(
  portfolio: PortfolioData | null | undefined,
  requiredToken: string | null | undefined,
  requiredAmount: number | null | undefined,
): TokenRequirementCheck {
  const reqToken = String(requiredToken ?? '').trim() || 'ETH';
  const required = safeBalance(requiredAmount);
  const requiredTokenBalance = getPortfolioTokenBalance(portfolio, reqToken);
  const walletToken = resolveWalletTokenForRequirement(reqToken);
  const walletBalance = getPortfolioTokenBalance(portfolio, walletToken);
  const hasEnoughToken = required <= 0 || requiredTokenBalance >= required;

  return {
    requiredToken: reqToken,
    requiredAmount: required,
    requiredTokenBalance,
    walletToken,
    walletBalance,
    hasEnoughToken,
  };
}

/** Collateral supply qty strictly from PortfolioData ledger — never layer targets. */
export function getPortfolioCollateralQty(
  portfolio: PortfolioData | null | undefined,
  symbol: 'ETH' | 'SOL',
  mode: 'lending' | 'alchemix',
): number {
  if (!portfolio) return 0;
  const safe = ensurePortfolioData(portfolio);
  if (mode === 'alchemix') {
    return safeBalance(safe.alchemixReserve?.eth?.qty);
  }
  if (mode === 'lending') {
    return sumTacticalDeployedQty(safe.assets?.[symbol]?.stakedEntries ?? [], symbol);
  }
  return 0;
}
