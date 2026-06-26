import type { PortfolioData } from '@/lib/portfolioData';
import type { StablesByNetwork } from '@/hooks/useStablesByNetwork';
import type { SwapAsset } from '@/lib/pendingActions';

export type ActionTokenFamily = 'ETH' | 'SOL' | 'BTC' | 'USDC';

export interface SmartValidationResult {
  sufficient: boolean;
  userBalance: number;
  requiredAmount: number;
  shortfall: number;
  shortfallUsd: number;
  tokenFamily: ActionTokenFamily;
  swapSuggestion: {
    from: SwapAsset;
    to: SwapAsset;
    amountUsd: number;
    reasonSk: string;
    reasonEn: string;
  } | null;
}

function roundQty(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeActionTokenFamily(tokenSymbol: string): ActionTokenFamily {
  const s = (tokenSymbol ?? '').toUpperCase().replace(/\s+/g, '');
  if (s === 'USDC' || s === 'USDT' || s === 'DAI' || s === 'SDAI' || s === 'SUSDE') return 'USDC';
  if (s === 'BTC' || s === 'LBTC' || s === 'WBTC' || s === 'CBBTC') return 'BTC';
  if (s === 'SOL' || s === 'MSOL' || s === 'JITOSOL' || s === 'JUPSOL' || s === 'BSOL') return 'SOL';
  if (
    s === 'ETH'
    || s === 'RETH'
    || s === 'WETH'
    || s === 'WEETH'
    || s === 'WSTETH'
    || s === 'ALETH'
  ) {
    return 'ETH';
  }
  if (s.includes('ETH')) return 'ETH';
  if (s.includes('SOL')) return 'SOL';
  return 'ETH';
}

export function mapTokenFamilyToSwapAsset(family: ActionTokenFamily): SwapAsset {
  if (family === 'USDC') return 'USDC';
  if (family === 'SOL') return 'SOL';
  if (family === 'BTC') return 'BTC';
  return 'ETH';
}

export function resolvePortfolioTokenBalance(
  portfolio: PortfolioData,
  stables: StablesByNetwork,
  tokenSymbol: string,
): number {
  const family = normalizeActionTokenFamily(tokenSymbol);
  if (family === 'USDC') {
    return roundQty(
      (stables?.ethereum ?? 0)
      + (stables?.arbitrum ?? 0)
      + (stables?.base ?? 0)
      + (stables?.solana ?? 0),
      2,
    );
  }
  if (family === 'ETH') return roundQty(portfolio.assets?.ETH?.liquidQty ?? 0, 6);
  if (family === 'SOL') return roundQty(portfolio.assets?.SOL?.liquidQty ?? 0, 4);
  return roundQty(portfolio.assets?.BTC?.liquidQty ?? 0, 8);
}

function resolveUsdPrice(portfolio: PortfolioData, family: ActionTokenFamily): number {
  if (family === 'USDC') return 1;
  if (family === 'ETH') return portfolio.prices?.eth ?? portfolio.assets?.ETH?.currentPrice ?? 0;
  if (family === 'SOL') return portfolio.prices?.sol ?? portfolio.assets?.SOL?.currentPrice ?? 0;
  return portfolio.prices?.btc ?? portfolio.assets?.BTC?.currentPrice ?? 0;
}

function pickSwapSource(
  portfolio: PortfolioData,
  stables: StablesByNetwork,
  targetFamily: ActionTokenFamily,
  shortfallUsd: number,
): SmartValidationResult['swapSuggestion'] {
  const targetAsset = mapTokenFamilyToSwapAsset(targetFamily);
  const ethUsd = (portfolio.assets?.ETH?.liquidQty ?? 0) * resolveUsdPrice(portfolio, 'ETH');
  const solUsd = (portfolio.assets?.SOL?.liquidQty ?? 0) * resolveUsdPrice(portfolio, 'SOL');
  const btcUsd = (portfolio.assets?.BTC?.liquidQty ?? 0) * resolveUsdPrice(portfolio, 'BTC');
  const usdcUsd = resolvePortfolioTokenBalance(portfolio, stables, 'USDC');

  const candidates: { asset: SwapAsset; usd: number }[] = [
    { asset: 'USDC', usd: usdcUsd },
    { asset: 'ETH', usd: ethUsd },
    { asset: 'SOL', usd: solUsd },
    { asset: 'BTC', usd: btcUsd },
  ].filter(c => c.asset !== targetAsset && c.usd > 0.01);

  candidates.sort((a, b) => b.usd - a.usd);
  const source = candidates[0];
  if (!source) return null;

  const bufferedUsd = roundQty(Math.max(shortfallUsd, 1) * 1.02, 2);
  return {
    from: source.asset,
    to: targetAsset,
    amountUsd: bufferedUsd,
    reasonSk: `Doplniť ${targetAsset} na exekúciu stratégie (chýba ~$${bufferedUsd.toFixed(2)}).`,
    reasonEn: `Top up ${targetAsset} to execute strategy (short ~$${bufferedUsd.toFixed(2)}).`,
  };
}

export function validateActionBalance(input: {
  portfolio: PortfolioData;
  stables: StablesByNetwork;
  tokenSymbol: string;
  requiredAmount: number;
  usdAmount?: number;
  skip?: boolean;
}): SmartValidationResult {
  const requiredAmount = Math.max(0, input.requiredAmount ?? 0);
  const tokenFamily = normalizeActionTokenFamily(input.tokenSymbol);

  if (input.skip || requiredAmount <= 0) {
    return {
      sufficient: true,
      userBalance: resolvePortfolioTokenBalance(input.portfolio, input.stables, input.tokenSymbol),
      requiredAmount,
      shortfall: 0,
      shortfallUsd: 0,
      tokenFamily,
      swapSuggestion: null,
    };
  }

  const userBalance = resolvePortfolioTokenBalance(input.portfolio, input.stables, input.tokenSymbol);
  const sufficient = userBalance + 1e-9 >= requiredAmount;
  const shortfall = sufficient ? 0 : roundQty(requiredAmount - userBalance, 6);
  const unitPrice = resolveUsdPrice(input.portfolio, tokenFamily);
  const shortfallUsd = input.usdAmount != null && requiredAmount > 0
    ? roundQty((input.usdAmount / requiredAmount) * shortfall, 2)
    : roundQty(shortfall * unitPrice, 2);

  return {
    sufficient,
    userBalance,
    requiredAmount,
    shortfall,
    shortfallUsd,
    tokenFamily,
    swapSuggestion: sufficient
      ? null
      : pickSwapSource(input.portfolio, input.stables, tokenFamily, shortfallUsd),
  };
}
