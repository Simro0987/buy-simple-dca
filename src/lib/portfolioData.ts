import type { PriceData } from '@/lib/crypto';
import type { PortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import type { StakedEntry, LedgerSymbol } from '@/lib/stakingLedger';

export type ProtocolToken = 'rETH' | 'mSOL' | 'LBTC' | 'Alchemix ETH';

export interface ProtocolBalance {
  symbol: ProtocolToken;
  qty: number;
  usd: number;
  role: 'alchemix' | 'motor';
}

export interface AssetSlice {
  symbol: LedgerSymbol;
  holdings: number;
  liquidQty: number;
  stakedQty: number;
  currentPrice: number;
  liquidUsd: number;
  stakedUsd: number;
  totalUsd: number;
  stakedEntries: StakedEntry[];
}

export interface AggregatedAssetBaseline {
  /** Read-only 100% baseline: wallet native + all DeFi positions */
  totalQty: number;
  totalUsd: number;
  walletQty: number;
  stakedQty: number;
  /** rETH (ETH) or mSOL (SOL) across core + tactical layers */
  motorQty: number;
  /** ETH layer 4 only */
  alchemixQty: number;
  otherStakedQty: number;
}

export interface PortfolioData {
  loading: boolean;
  /** True when holdings/ledger are available (independent of live price refresh) */
  balancesReady: boolean;
  prices: { btc: number; eth: number; sol: number };
  assets: Record<LedgerSymbol, AssetSlice>;
  alchemixReserve: { eth: ProtocolBalance };
  activeMotor: { rEth: ProtocolBalance; mSol: ProtocolBalance };
  lbtc: ProtocolBalance;
  totalAlchemixUsd: number;
  totalMotorUsd: number;
  /** Aggregated 100% ETH baseline (wallet + DeFi); invariant when moving between layers */
  ethBaseline: AggregatedAssetBaseline;
  /** Aggregated 100% SOL baseline (wallet + DeFi); invariant when moving between layers */
  solBaseline: AggregatedAssetBaseline;
  totalEthPortfolio: number;
  totalSolPortfolio: number;
}

const EMPTY_ASSET = (symbol: LedgerSymbol): AssetSlice => ({
  symbol,
  holdings: 0,
  liquidQty: 0,
  stakedQty: 0,
  currentPrice: 0,
  liquidUsd: 0,
  stakedUsd: 0,
  totalUsd: 0,
  stakedEntries: [],
});

function sumByProtocol(entries: StakedEntry[], patterns: RegExp[]): number {
  return entries
    .filter(e => patterns.some(p => p.test(e.protocol)))
    .reduce((s, e) => s + e.amount, 0);
}

function protocolBalance(
  symbol: ProtocolToken,
  qty: number,
  price: number,
  role: 'alchemix' | 'motor',
): ProtocolBalance {
  return { symbol, qty, usd: qty * price, role };
}

/**
 * Read-only aggregated baseline: wallet native + all on-ledger DeFi positions.
 * Moving tokens between layers only shifts walletQty ↔ stakedQty; totalQty (= holdings) stays fixed.
 */
export function computeEthAggregatedBaseline(
  slice: AssetSlice,
  rEthQty: number,
  alchemixEthQty: number,
): AggregatedAssetBaseline {
  const walletQty = slice.liquidQty;
  const stakedQty = slice.stakedQty;
  const otherStakedQty = Math.max(0, stakedQty - rEthQty - alchemixEthQty);
  const totalQty = slice.holdings;
  return {
    totalQty,
    totalUsd: totalQty * slice.currentPrice,
    walletQty,
    stakedQty,
    motorQty: rEthQty,
    alchemixQty: alchemixEthQty,
    otherStakedQty,
  };
}

export function computeSolAggregatedBaseline(
  slice: AssetSlice,
  mSolQty: number,
): AggregatedAssetBaseline {
  const walletQty = slice.liquidQty;
  const stakedQty = slice.stakedQty;
  const otherStakedQty = Math.max(0, stakedQty - mSolQty);
  const totalQty = slice.holdings;
  return {
    totalQty,
    totalUsd: totalQty * slice.currentPrice,
    walletQty,
    stakedQty,
    motorQty: mSolQty,
    alchemixQty: 0,
    otherStakedQty,
  };
}

export function buildPortfolioData(input: {
  metrics: PortfolioMetrics;
  prices: PriceData | undefined;
  pricesLoading: boolean;
  breakdown: Array<{
    symbol: string;
    value: number;
    liquidQty: number;
    stakedQty: number;
    stakedEntries: StakedEntry[];
  }>;
}): PortfolioData {
  const ethPrice = input.prices?.ethereum?.usd ?? 0;
  const solPrice = input.prices?.solana?.usd ?? 0;
  const btcPrice = input.prices?.bitcoin?.usd ?? 0;

  const assets = { BTC: EMPTY_ASSET('BTC'), ETH: EMPTY_ASSET('ETH'), SOL: EMPTY_ASSET('SOL') } as Record<
    LedgerSymbol,
    AssetSlice
  >;

  for (const sym of ['BTC', 'ETH', 'SOL'] as LedgerSymbol[]) {
    const metric = input.metrics.assets.find(a => a.symbol === sym);
    const row = input.breakdown.find(b => b.symbol === sym);
    const priceFromFeed = sym === 'BTC' ? btcPrice : sym === 'ETH' ? ethPrice : solPrice;
    const currentPrice = priceFromFeed > 0 ? priceFromFeed : (metric?.currentPrice ?? 0);
    const holdings = metric?.holdings ?? 0;
    const liquidQty = row?.liquidQty ?? holdings;
    const stakedQty = row?.stakedQty ?? 0;
    const stakedEntries = row?.stakedEntries ?? [];

    assets[sym] = {
      symbol: sym,
      holdings,
      liquidQty,
      stakedQty,
      currentPrice,
      liquidUsd: liquidQty * currentPrice,
      stakedUsd: stakedQty * currentPrice,
      totalUsd: holdings * currentPrice,
      stakedEntries,
    };
  }

  const ethEntries = assets.ETH.stakedEntries;
  const solEntries = assets.SOL.stakedEntries;
  const btcEntries = assets.BTC.stakedEntries;

  const rEthLedger = sumByProtocol(ethEntries, [/rocket\s*pool/i, /reth/i]);
  const mSolLedger = sumByProtocol(solEntries, [/marinade/i, /msol/i]);
  const alchemixLedger = sumByProtocol(ethEntries, [/alchemix/i]);
  const lbtcLedger = sumByProtocol(btcEntries, [/lombard/i, /lbtc/i]);

  const rEthQty = rEthLedger;
  const mSolQty = mSolLedger;
  const alchemixEthQty = alchemixLedger;
  const lbtcQty = lbtcLedger;

  const alchemixReserve = {
    eth: protocolBalance('Alchemix ETH', alchemixEthQty, ethPrice, 'alchemix'),
  };

  const activeMotor = {
    rEth: protocolBalance('rETH', rEthQty, ethPrice, 'motor'),
    mSol: protocolBalance('mSOL', mSolQty, solPrice, 'motor'),
  };

  const lbtc = protocolBalance('LBTC', lbtcQty, btcPrice, 'motor');

  const totalAlchemixUsd = alchemixReserve.eth.usd;
  const totalMotorUsd = activeMotor.rEth.usd + activeMotor.mSol.usd;

  const ethBaseline = computeEthAggregatedBaseline(assets.ETH, rEthQty, alchemixEthQty);
  const solBaseline = computeSolAggregatedBaseline(assets.SOL, mSolQty);

  /** Portfolio metrics ready — prices may still be refreshing in background */
  const balancesReady = !input.metrics.loading;

  return {
    loading: input.metrics.loading || input.pricesLoading,
    balancesReady,
    prices: { btc: btcPrice, eth: ethPrice, sol: solPrice },
    assets,
    alchemixReserve,
    activeMotor,
    lbtc,
    totalAlchemixUsd,
    totalMotorUsd,
    ethBaseline,
    solBaseline,
    totalEthPortfolio: ethBaseline.totalQty,
    totalSolPortfolio: solBaseline.totalQty,
  };
}

/** Aggregated baseline totals used by Portfolio + Stake (wallet + DeFi). */
export function getAggregatedPortfolioTotals(data: PortfolioData) {
  const ethQty = data.totalEthPortfolio
    ?? data.ethBaseline?.totalQty
    ?? data.assets?.ETH?.holdings
    ?? 0;
  const solQty = data.totalSolPortfolio
    ?? data.solBaseline?.totalQty
    ?? data.assets?.SOL?.holdings
    ?? 0;
  const ethPrice = data.prices?.eth ?? data.assets?.ETH?.currentPrice ?? 0;
  const solPrice = data.prices?.sol ?? data.assets?.SOL?.currentPrice ?? 0;

  return {
    ethQty,
    solQty,
    ethPrice,
    solPrice,
    ethUsd: data.ethBaseline?.totalUsd ?? ethQty * ethPrice,
    solUsd: data.solBaseline?.totalUsd ?? solQty * solPrice,
    portfolioUsd: (data.ethBaseline?.totalUsd ?? ethQty * ethPrice)
      + (data.solBaseline?.totalUsd ?? solQty * solPrice),
  };
}
