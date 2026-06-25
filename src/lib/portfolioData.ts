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

export interface PortfolioData {
  loading: boolean;
  prices: { btc: number; eth: number; sol: number };
  assets: Record<LedgerSymbol, AssetSlice>;
  alchemixReserve: { eth: ProtocolBalance };
  activeMotor: { rEth: ProtocolBalance; mSol: ProtocolBalance };
  lbtc: ProtocolBalance;
  totalAlchemixUsd: number;
  totalMotorUsd: number;
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
  role: 'cold' | 'motor',
): ProtocolBalance {
  return { symbol, qty, usd: qty * price, role };
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

  return {
    loading: input.metrics.loading || input.pricesLoading,
    prices: { btc: btcPrice, eth: ethPrice, sol: solPrice },
    assets,
    alchemixReserve,
    activeMotor,
    lbtc,
    totalAlchemixUsd,
    totalMotorUsd,
  };
}
