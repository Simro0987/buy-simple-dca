// Orchestrator for the SOL DeFi Mozog — mirrors useEthDefiBrain.
// APY from DefiLlama (Marinade Native + JitoSOL), SOL price via CoinGecko/Binance,
// gas via Solana RPC prioritization fees, swap routing via Jupiter V6.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTokenPrice } from '@/lib/apiManager';
import {
  fetchSolGas, computeSolGasCosts, fetchJitoRate,
  type SolGasData, type SolGasCosts,
} from '@/lib/solOnChain';
import {
  fetchJupiterQuote, nativeMintQuote, pickBestSolRoute,
  type SolRoute,
} from '@/lib/jupAggregator';

const RISK_PENALTY_BPS = 100; // 1.00% APY haircut for Jito (restaking SC risk)
const WMA_ALPHA = 0.3;
const CACHE_WMA = 'sol-defi-brain-wma-v1';

interface RawApy { marinade: number; jito: number; }

async function fetchSolApy(): Promise<RawApy> {
  try {
    const r = await Promise.race([
      fetch('https://yields.llama.fi/pools').then(x => x.json()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pools: any[] = (r as any)?.data ?? [];
    const marinade = pools.find(p =>
      p.chain === 'Solana' && /marinade/i.test(p.project ?? '') && /msol/i.test(p.symbol ?? ''));
    const jito = pools.find(p =>
      p.chain === 'Solana' && (/jito/i.test(p.project ?? '') || /jitosol/i.test(p.symbol ?? '')));
    return {
      marinade: Number(marinade?.apyBase ?? marinade?.apy ?? 7.2),
      jito:     Number(jito?.apyBase ?? jito?.apy ?? 7.8),
    };
  } catch {
    return { marinade: 7.2, jito: 7.8 };
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

// Clamp 30-70% around baseline 50/50, biased by risk-adjusted APY diff.
function computeSplit(marinade: number, riskAdjJito: number): { marinadePct: number; jitoPct: number } {
  const diff = marinade - riskAdjJito;
  const bias = Math.max(-20, Math.min(20, diff * 40));
  const marinadePct = Math.max(30, Math.min(70, 50 + bias));
  return { marinadePct, jitoPct: 100 - marinadePct };
}

export interface SolDefiBrainState {
  loading: boolean;
  jitoLoading: boolean;
  solPriceUsd: number;
  gas: SolGasData;
  gasCosts: SolGasCosts;
  rates: { jitoSolPerSol: number; mSolPerSol: number; source: 'live' | 'fallback' };
  apy: {
    marinade: number;
    jito: number;          // display (raw)
    jitoRiskAdj: number;   // internal (used for split)
    wmaMarinade: number;
    wmaJito: number;
  };
  split: { marinadePct: number; jitoPct: number };
  routes: {
    jito: { candidates: SolRoute[]; best: SolRoute | null };
  };
  vault: { name: string; reason: string; tvlUsd: number; apy: number };
}

export function useSolDefiBrain(marinadeSol: number, jitoSol: number): SolDefiBrainState {
  const oracles = useQuery({
    queryKey: ['sol-defi-oracles-v1'],
    queryFn: async () => {
      const [price, gas, apy, jitoRate] = await Promise.all([
        fetchTokenPrice('SOL'),
        fetchSolGas(),
        fetchSolApy(),
        fetchJitoRate(),
      ]);
      return { price: price || 150, gas, apy, jitoRate };
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: false,
  });

  const [wma, setWma] = useState<RawApy>(() => loadWma() ?? { marinade: 7.2, jito: 7.8 });
  useEffect(() => {
    if (!oracles.data) return;
    const raw = oracles.data.apy;
    const prev = loadWma() ?? raw;
    const next: RawApy = {
      marinade: prev.marinade * (1 - WMA_ALPHA) + raw.marinade * WMA_ALPHA,
      jito:     prev.jito     * (1 - WMA_ALPHA) + raw.jito     * WMA_ALPHA,
    };
    persistWma(next); setWma(next);
  }, [oracles.data]);

  const solPriceUsd = oracles.data?.price ?? 150;
  const gas: SolGasData = oracles.data?.gas ?? { baseFeeLamports: 5000, priorityMicroLamports: 20_000, source: 'fallback' };
  const gasCosts = useMemo(() => computeSolGasCosts(gas, solPriceUsd), [gas, solPriceUsd]);

  const jitoSolPerSol = oracles.data?.jitoRate.jitoSolPerSol ?? 0.855;
  const mSolPerSol = 0.870; // conservative fallback; Marinade Native = 1:1 delegation anyway
  const rates = {
    jitoSolPerSol,
    mSolPerSol,
    source: (oracles.data?.jitoRate.source ?? 'fallback') as 'live' | 'fallback',
  };

  // Jupiter routing for Jito path (native vs swap)
  const jitoQ = useQuery({
    queryKey: ['sol-defi-routes-jito', jitoSol.toFixed(4), solPriceUsd.toFixed(0)],
    enabled: jitoSol > 0 && solPriceUsd > 0,
    retry: false,
    refetchInterval: 60_000,
    staleTime: 45_000,
    queryFn: async () => {
      const swap = await fetchJupiterQuote({
        solAmount: jitoSol,
        tokenOut: 'JitoSOL',
        fallbackRatio: jitoSolPerSol,
        gasUsd: gasCosts.jupiterSwapUsd,
      });
      const native = nativeMintQuote({
        solAmount: jitoSol,
        tokenOut: 'JitoSOL',
        ratio: jitoSolPerSol,
        gasUsd: gasCosts.jitoDepositUsd,
        source: oracles.data?.jitoRate.source === 'live' ? 'onchain' : 'fallback',
      });
      return [native as SolRoute, swap as SolRoute];
    },
  });

  const marinadeApy = oracles.data?.apy.marinade ?? 7.2;
  const jitoApy = oracles.data?.apy.jito ?? 7.8;
  const jitoRiskAdj = Math.max(0, jitoApy - RISK_PENALTY_BPS / 100);
  const wmaJitoRiskAdj = Math.max(0, wma.jito - RISK_PENALTY_BPS / 100);
  const split = computeSplit(wma.marinade, wmaJitoRiskAdj);

  const ratioForToken = (t: 'JitoSOL' | 'mSOL') => t === 'JitoSOL' ? jitoSolPerSol : mSolPerSol;
  const bestJito = pickBestSolRoute(jitoQ.data ?? [], solPriceUsd, ratioForToken);

  // Recommended restaking vault — mocked ranking. Real API can be plugged later.
  const vault = {
    name: 'Kyros Restaking Vault',
    reason: 'Najlepší pomer vysokého TVL a výnosu (Node Consensus Networks)',
    tvlUsd: 45_000_000,
    apy: 9.6,
  };

  return {
    loading: oracles.isLoading,
    jitoLoading: jitoQ.isFetching,
    solPriceUsd,
    gas,
    gasCosts,
    rates,
    apy: { marinade: marinadeApy, jito: jitoApy, jitoRiskAdj, wmaMarinade: wma.marinade, wmaJito: wma.jito },
    split,
    routes: { jito: { candidates: jitoQ.data ?? [], best: bestJito } },
    vault,
  };
}
