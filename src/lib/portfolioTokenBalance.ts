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

/** Funding token used only for swap routing — never shown as the held balance of the required token. */
export function resolveSwapFundingToken(requiredToken: string | null | undefined): string {
  const token = normalizeTokenSymbol(requiredToken);
  if (['WSTETH', 'WEETH', 'RETH', 'WETH', 'STETH'].includes(token)) return 'ETH';
  if (['MSOL', 'JITOSOL', 'BSOL', 'JITO SOL'].includes(token)) return 'SOL';
  if (['LBTC', 'WBTC', 'CBBTC'].includes(token)) return 'BTC';
  if (['USDC', 'USDT', 'DAI', 'SDAI', 'SUSDE'].includes(token)) return 'USDC';
  if (token === 'ETH' || token === 'SOL' || token === 'BTC') return token;
  return String(requiredToken ?? 'ETH').trim() || 'ETH';
}

/** @deprecated Use resolveSwapFundingToken — kept for compatibility in tests */
export const resolveWalletTokenForRequirement = resolveSwapFundingToken;

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
 * Strict balance lookup — only PortfolioData fields and ledger entries for the exact token identity.
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
  /** Real balance of the required token identity in PortfolioData (0 if not held). */
  heldAmount: number;
  hasEnoughToken: boolean;
  /** Token amount still missing — only this deficit should be swapped. */
  swapDeficitAmount: number;
  /** USD value of the deficit only (never the full wallet balance). */
  swapDeficitUsd: number;
  /** Source token for swap routing (e.g. ETH when required is wstETH). */
  swapFromToken: string;
}

export function evaluateTokenRequirement(
  portfolio: PortfolioData | null | undefined,
  requiredToken: string | null | undefined,
  requiredAmount: number | null | undefined,
  options?: { totalUsd?: number | null; unitPriceUsd?: number | null },
): TokenRequirementCheck {
  const reqToken = String(requiredToken ?? '').trim() || 'ETH';
  const required = safeBalance(requiredAmount);
  const heldAmount = getPortfolioTokenBalance(portfolio, reqToken);
  const hasEnoughToken = required <= 0 || heldAmount >= required;
  const swapDeficitAmount = hasEnoughToken ? 0 : Math.max(0, required - heldAmount);
  const swapFromToken = resolveSwapFundingToken(reqToken);

  let unitPriceUsd = safeBalance(options?.unitPriceUsd);
  if (unitPriceUsd <= 0 && required > 0) {
    unitPriceUsd = safeBalance(options?.totalUsd) / required;
  }
  const swapDeficitUsd = swapDeficitAmount * unitPriceUsd;

  return {
    requiredToken: reqToken,
    requiredAmount: required,
    heldAmount,
    hasEnoughToken,
    swapDeficitAmount,
    swapDeficitUsd: Number.isFinite(swapDeficitUsd) ? swapDeficitUsd : 0,
    swapFromToken,
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

export function isNewCollateralPosition(collateralQty: number, debtUsd: number): boolean {
  return safeBalance(collateralQty) <= 0 && safeBalance(debtUsd) <= 0;
}

export function shouldShowRetreatWarning(input: {
  exitActive: boolean;
  variant?: 'urgent' | 'warning' | 'opportunity';
  collateralQty: number;
  debtUsd: number;
  ltvPct: number;
}): boolean {
  if (!input.exitActive) return false;
  if (input.variant !== 'urgent') return true;

  const collateral = safeBalance(input.collateralQty);
  const debt = safeBalance(input.debtUsd);
  const ltv = safeBalance(input.ltvPct);

  return collateral > 0 && debt > 0 && ltv > 0;
}
