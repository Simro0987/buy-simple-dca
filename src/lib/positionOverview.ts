import type { PortfolioData } from '@/lib/portfolioData';
import { ensurePortfolioData } from '@/lib/portfolioData';

export type PositionOverviewMode = 'staking' | 'lending' | 'alchemix' | 'yield' | 'gas';

export interface PositionOverviewInput {
  mode: PositionOverviewMode;
  symbol: 'ETH' | 'SOL';
  tokenLabel?: string;
  portfolio?: PortfolioData | null;
  usdcDebt?: number;
  stablesTotalUsd?: number;
  collateralQty?: number;
  decimals?: number;
}

export interface PositionOverviewData {
  walletQty: number;
  stakedQty: number;
  collateralQty: number;
  borrowQty: number;
  tokenSymbol: string;
  borrowSymbol: string;
  decimals: number;
  showWallet: boolean;
  showStaked: boolean;
  showCollateral: boolean;
  showBorrow: boolean;
}

export function safeQty(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function formatPositionQty(value: unknown, decimals: number): string {
  return safeQty(value).toFixed(Math.max(0, decimals));
}

function emptyOverview(input: Pick<PositionOverviewInput, 'mode' | 'symbol' | 'tokenLabel' | 'decimals'>): PositionOverviewData {
  const decimals = input.decimals ?? (input.symbol === 'SOL' ? 2 : 4);
  const tokenSymbol = input.tokenLabel?.trim() || input.symbol;
  const showWallet = true;
  const showStaked = input.mode === 'staking' || input.mode === 'lending' || input.mode === 'alchemix';
  const showCollateral = input.mode === 'lending' || input.mode === 'alchemix' || input.mode === 'yield';
  const showBorrow = input.mode === 'lending' || input.mode === 'yield';

  return {
    walletQty: 0,
    stakedQty: 0,
    collateralQty: 0,
    borrowQty: 0,
    tokenSymbol: input.mode === 'gas' || input.mode === 'yield' ? 'USDC' : tokenSymbol,
    borrowSymbol: 'USDC',
    decimals: input.mode === 'gas' || input.mode === 'yield' ? 2 : decimals,
    showWallet,
    showStaked,
    showCollateral,
    showBorrow,
  };
}

export function buildPositionOverview(input: PositionOverviewInput): PositionOverviewData {
  try {
    const mode = input.mode ?? 'staking';
    const symbol = input.symbol ?? 'ETH';
    const decimals = input.decimals ?? (symbol === 'SOL' ? 2 : 4);
    const tokenLabel = input.tokenLabel?.trim() || symbol;
    const portfolio = input.portfolio ? ensurePortfolioData(input.portfolio) : null;
    const asset = portfolio?.assets?.[symbol];

    if (mode === 'gas' || mode === 'yield') {
      const walletQty = safeQty(input.stablesTotalUsd);
      const borrowQty = safeQty(input.usdcDebt);
      return {
        walletQty,
        stakedQty: 0,
        collateralQty: 0,
        borrowQty,
        tokenSymbol: 'USDC',
        borrowSymbol: 'USDC',
        decimals: 2,
        showWallet: true,
        showStaked: false,
        showCollateral: mode === 'yield',
        showBorrow: mode === 'yield',
      };
    }

    const walletQty = safeQty(asset?.liquidQty);
    const stakedQty = safeQty(asset?.stakedQty);

    let collateralQty = safeQty(input.collateralQty);
    if (collateralQty <= 0 && portfolio) {
      if (mode === 'lending') {
        collateralQty = symbol === 'ETH'
          ? safeQty(portfolio.activeMotor?.rEth?.qty)
          : safeQty(portfolio.activeMotor?.mSol?.qty);
      } else if (mode === 'alchemix') {
        collateralQty = safeQty(portfolio.alchemixReserve?.eth?.qty);
      }
    }

    const borrowQty = safeQty(input.usdcDebt);

    return {
      walletQty,
      stakedQty,
      collateralQty,
      borrowQty,
      tokenSymbol: tokenLabel,
      borrowSymbol: 'USDC',
      decimals,
      showWallet: true,
      showStaked: mode === 'staking' || mode === 'lending' || mode === 'alchemix',
      showCollateral: mode === 'lending' || mode === 'alchemix',
      showBorrow: mode === 'lending',
    };
  } catch {
    return emptyOverview(input);
  }
}
