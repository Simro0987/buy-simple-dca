// Orchestrator hook for the ETH DeFi Mozog:
//   - on-chain rates (viem)
//   - gas fee data (viem)
//   - CoinGecko ETH price
//   - APYs from DefiLlama with risk-adjusted WMA split
//   - aggregator routing (CowSwap, 1inch, Jumper, Uniswap) for Lido & Rocket

import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect, useState } from 'react';
import {
  fetchOnChainRates,
  fetchGasFeeData,
  fetchEthPriceUsd,
  GAS_LIMITS,
  gasCostUsd,
} from '@/lib/ethOnChain';
import {
  fetchAllSwapQuotes,
  nativeMintQuote,
  pickBestRoute,
  RouteQuote,
} from '@/lib/ethAggregators';

const RISK_PENALTY_BPS = 50; // 0.50% APY haircut for Lido (extra EarnETH SC risk)
const WMA_ALPHA = 0.3;
const CACHE_WMA = 'eth-defi-brain-wma-v3';

// ── APY fetch ───────────────────────────────────────────────────────────────
interface RawApy { lido: number; rocket: number; }

async function fetchRawApy(): Promise<RawApy> {
  try {
    const r = await Promise.race([
      fetch('https://yields.llama.fi/pools').then(x => x.json()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pools: any[] = (r as any)?.data ?? [];
    const lido = pools.find(p =>
      p.project === 'lido' && /steth/i.test(p.symbol) && p.chain === 'Ethereum');
    const rp = pools.find(p =>
      p.project === 'rocket-pool' && /reth/i.test(p.symbol) && p.chain === 'Ethereum');
    return {
      lido:   Number(lido?.apyBase ?? lido?.apy ?? 3.1),
      rocket: Number(rp?.apyBase ?? rp?.apy ?? 2.9),
    };
  } catch {
    return { lido: 3.1, rocket: 2.9 };
  }
}

function loadWma(): RawApy | null {
  try { const raw = localStorage.getItem(CACHE_WMA); if (raw) return JSON.parse(raw); }
  catch { /* ignore */ }
  return null;
}
function persistWma(v: RawApy) {
  try { localStorage.setItem(CACHE_WMA, JSON.stringify(v)); } catch { /* ignore */ }
}

// ── Split (risk-adjusted, clamp 30-70) ──────────────────────────────────────
function computeSplit(riskAdjLido: number, rocket: number): { lidoPct: number; rocketPct: number } {
  const diff = riskAdjLido - rocket;
  const bias = Math.max(-20, Math.min(20, diff * 40));
  const lidoPct = Math.max(30, Math.min(70, 50 + bias));
  return { lidoPct, rocketPct: 100 - lidoPct };
}

// ── Public hook state ───────────────────────────────────────────────────────
export interface EthDefiBrainState {
  loading: boolean;
  lidoLoading: boolean;
  rocketLoading: boolean;
  ethPriceUsd: number;
  gas: {
    baseFeeGwei: number;
    fastGwei: number;
    source: 'live' | 'fallback';
  };
  rates: { wstEthPerEth: number; stEthPerEth: number; rEthPerEth: number; source: 'onchain' | 'fallback' };
  apy: {
    lidoNet: number;         // real (display) APY
    lidoRiskAdj: number;     // internal (used for split)
    rocket: number;
    wmaLido: number;
    wmaRocket: number;
  };
  split: { lidoPct: number; rocketPct: number };
  routes: {
    lido:   { candidates: RouteQuote[]; best: RouteQuote | null };
    rocket: { candidates: RouteQuote[]; best: RouteQuote | null };
  };
  gasCosts: {
    nativeMintLido: number; // mint stETH
    nativeMintLidoPlusWrap: number; // stETH → wstETH
    nativeMintRp: number;
    dexSwap: number;
    earnDeposit: number;
  };
}

// ── Master hook ─────────────────────────────────────────────────────────────
export function useEthDefiBrain(lidoEthAmount: number, rocketEthAmount: number): EthDefiBrainState {
  const oracles = useQuery({
    queryKey: ['eth-defi-oracles-v1'],
    queryFn: async () => {
      const ethPrice = await fetchEthPriceUsd();
      const [rates, gas, apy] = await Promise.all([
        fetchOnChainRates(),
        fetchGasFeeData(ethPrice || 3500),
        fetchRawApy(),
      ]);
      return { ethPrice: ethPrice || gas.ethPriceUsd, rates, gas, apy };
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  // Risk-adjusted WMA
  const [wma, setWma] = useState<RawApy>(() => loadWma() ?? { lido: 3.1, rocket: 2.9 });
  useEffect(() => {
    if (!oracles.data) return;
    const raw = oracles.data.apy;
    const prev = loadWma() ?? raw;
    const next: RawApy = {
      lido:   prev.lido   * (1 - WMA_ALPHA) + raw.lido   * WMA_ALPHA,
      rocket: prev.rocket * (1 - WMA_ALPHA) + raw.rocket * WMA_ALPHA,
    };
    persistWma(next);
    setWma(next);
  }, [oracles.data]);

  const ethPriceUsd = oracles.data?.ethPrice ?? 3500;
  const fastGwei = oracles.data?.gas.fastGwei ?? 9;

  const gasCosts = useMemo(() => ({
    nativeMintLido:         gasCostUsd(GAS_LIMITS.nativeMintLido, fastGwei, ethPriceUsd),
    nativeMintLidoPlusWrap: gasCostUsd(GAS_LIMITS.nativeMintLido + GAS_LIMITS.wrapStEth, fastGwei, ethPriceUsd),
    nativeMintRp:           gasCostUsd(GAS_LIMITS.nativeMintRp, fastGwei, ethPriceUsd),
    dexSwap:                gasCostUsd(GAS_LIMITS.dexSwap, fastGwei, ethPriceUsd),
    earnDeposit:            gasCostUsd(GAS_LIMITS.earnDeposit, fastGwei, ethPriceUsd),
  }), [fastGwei, ethPriceUsd]);

  const rates = oracles.data?.rates ?? { wstEthPerEth: 0.855, stEthPerEth: 1, rEthPerEth: 0.905, source: 'fallback' as const };

  // ── Routes (fetched independently, keyed by amount rounded to 4 decimals) ─
  const lidoQ = useQuery({
    queryKey: ['eth-defi-routes-lido', lidoEthAmount.toFixed(4), ethPriceUsd.toFixed(0), fastGwei.toFixed(1)],
    enabled: lidoEthAmount > 0 && ethPriceUsd > 0,
    queryFn: async () => {
      const stETHQuotes = await fetchAllSwapQuotes({
        ethAmount: lidoEthAmount, ethPriceUsd, tokenOut: 'stETH',
        gasUsd: gasCosts.dexSwap, tokenPriceEthRatio: 1.0,
      }, 1.0);
      const wstQuotes = await fetchAllSwapQuotes({
        ethAmount: lidoEthAmount, ethPriceUsd, tokenOut: 'wstETH',
        gasUsd: gasCosts.dexSwap, tokenPriceEthRatio: rates.wstEthPerEth,
      }, rates.wstEthPerEth);
      const nativeStEth = nativeMintQuote({
        ethAmount: lidoEthAmount, ethPriceUsd, tokenOut: 'stETH',
        ratio: 1.0, gasUsd: gasCosts.nativeMintLido,
      });
      return [nativeStEth, ...stETHQuotes, ...wstQuotes];
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const rocketQ = useQuery({
    queryKey: ['eth-defi-routes-rp', rocketEthAmount.toFixed(4), ethPriceUsd.toFixed(0), fastGwei.toFixed(1)],
    enabled: rocketEthAmount > 0 && ethPriceUsd > 0,
    queryFn: async () => {
      const swap = await fetchAllSwapQuotes({
        ethAmount: rocketEthAmount, ethPriceUsd, tokenOut: 'rETH',
        gasUsd: gasCosts.dexSwap, tokenPriceEthRatio: rates.rEthPerEth,
      }, rates.rEthPerEth);
      const native = nativeMintQuote({
        ethAmount: rocketEthAmount, ethPriceUsd, tokenOut: 'rETH',
        ratio: rates.rEthPerEth, gasUsd: gasCosts.nativeMintRp,
      });
      return [native, ...swap];
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const lidoNet = oracles.data?.apy.lido ?? 3.1;
  const rocket  = oracles.data?.apy.rocket ?? 2.9;
  const lidoRiskAdj = Math.max(0, lidoNet - RISK_PENALTY_BPS / 100);

  const wmaLidoRiskAdj = Math.max(0, wma.lido - RISK_PENALTY_BPS / 100);
  const split = computeSplit(wmaLidoRiskAdj, wma.rocket);

  return {
    loading: oracles.isLoading,
    lidoLoading: lidoQ.isFetching,
    rocketLoading: rocketQ.isFetching,
    ethPriceUsd,
    gas: {
      baseFeeGwei: oracles.data?.gas.baseFeeGwei ?? 8,
      fastGwei,
      source: oracles.data?.gas.source ?? 'fallback',
    },
    rates,
    apy: { lidoNet, lidoRiskAdj, rocket, wmaLido: wma.lido, wmaRocket: wma.rocket },
    split,
    routes: {
      lido:   { candidates: lidoQ.data ?? [],   best: pickBestRoute(lidoQ.data ?? []) },
      rocket: { candidates: rocketQ.data ?? [], best: pickBestRoute(rocketQ.data ?? []) },
    },
    gasCosts,
  };
}
