import { useEffect, useMemo, useState } from 'react';

// Dynamický mozog: porovnáva APY Lido vs Rocket Pool a robí WMA-based split.
// Data source: simulovaný fetch (v prípade dostupnosti reálneho endpointu ho vieme napojiť neskôr).
// Clamp: 30% až 70% pre každý protokol.

export interface DynamicYieldSplit {
  lidoApy: number;              // % ročne
  rocketApy: number;            // % ročne
  lidoPct: number;              // 30..70
  rocketPct: number;            // 30..70 (= 100 - lidoPct)
  wmaLido: number;              // WMA APY
  wmaRocket: number;            // WMA APY
  updatedAt: number;
}

const CACHE_KEY = 'dyn-yield-split-wma-v1';
const REFRESH_MS = 60_000;

interface WmaState { lido: number; rocket: number; }

function loadWma(): WmaState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.lido === 'number' && typeof p?.rocket === 'number') return p;
  } catch { /* ignore */ }
  return null;
}
function persistWma(s: WmaState) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

async function fetchApy(): Promise<{ lido: number; rocket: number }> {
  // Primárny zdroj: DefiLlama yields. Fallback: konzervatívne priemery.
  try {
    const r = await fetch('https://yields.llama.fi/pools');
    const j = await r.json();
    const pools: Array<{ project: string; symbol: string; apyBase?: number; apy?: number; chain: string }> = j?.data ?? [];
    const lido = pools.find(p => p.project === 'lido' && /steth/i.test(p.symbol) && p.chain === 'Ethereum');
    const rp = pools.find(p => p.project === 'rocket-pool' && /reth/i.test(p.symbol) && p.chain === 'Ethereum');
    const lidoApy = lido?.apyBase ?? lido?.apy ?? 3.1;
    const rpApy = rp?.apyBase ?? rp?.apy ?? 2.9;
    return { lido: lidoApy, rocket: rpApy };
  } catch {
    return { lido: 3.1, rocket: 2.9 };
  }
}

function computeSplit(wmaLido: number, wmaRocket: number): { lidoPct: number; rocketPct: number } {
  const total = wmaLido + wmaRocket;
  if (total <= 0) return { lidoPct: 50, rocketPct: 50 };
  // Amplifikuj rozdiel (softmax-like): najlepší dostane viac.
  const diff = wmaLido - wmaRocket;                // v % bodoch
  const bias = Math.max(-20, Math.min(20, diff * 40)); // 0.5% rozdiel APY = ±20 bodov
  let lidoPct = 50 + bias;
  lidoPct = Math.max(30, Math.min(70, lidoPct));
  return { lidoPct, rocketPct: 100 - lidoPct };
}

export function useDynamicYieldSplit(): DynamicYieldSplit {
  const [state, setState] = useState<DynamicYieldSplit>(() => {
    const wma = loadWma() ?? { lido: 3.1, rocket: 2.9 };
    const split = computeSplit(wma.lido, wma.rocket);
    return {
      lidoApy: wma.lido, rocketApy: wma.rocket,
      wmaLido: wma.lido, wmaRocket: wma.rocket,
      lidoPct: split.lidoPct, rocketPct: split.rocketPct,
      updatedAt: 0,
    };
  });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const raw = await fetchApy();
      if (cancelled) return;
      const prev = loadWma() ?? { lido: raw.lido, rocket: raw.rocket };
      // WMA α=0.3
      const α = 0.3;
      const wmaLido = prev.lido * (1 - α) + raw.lido * α;
      const wmaRocket = prev.rocket * (1 - α) + raw.rocket * α;
      persistWma({ lido: wmaLido, rocket: wmaRocket });
      const split = computeSplit(wmaLido, wmaRocket);
      setState({
        lidoApy: raw.lido, rocketApy: raw.rocket,
        wmaLido, wmaRocket,
        lidoPct: split.lidoPct, rocketPct: split.rocketPct,
        updatedAt: Date.now(),
      });
    };
    tick();
    const id = window.setInterval(tick, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return state;
}

// Smart routing pre Lido: Natívny mint (2 tx) vs Direct DEX swap (1 tx + discount).
export interface SmartRouteResult {
  route: 'native' | 'dex';
  nativeOutput: number;    // wstETH z natívnej cesty (po gas)
  dexOutput: number;       // wstETH z DEX swapu (po gas + discount)
  gasNativeUsd: number;
  gasDexUsd: number;
  reason: string;
}

export function computeLidoSmartRoute(params: {
  ethAmount: number;
  ethPriceUsd: number;
  gasGweiFast: number;      // aktuálna Fast gwei
  wstEthPerEth: number;     // konverzný pomer wstETH/ETH (napr. 0.86)
  dexDiscountBps: number;   // negatívny = discount (kupuješ pod peg); pozitívny = premium
}): SmartRouteResult {
  const { ethAmount, ethPriceUsd, gasGweiFast, wstEthPerEth, dexDiscountBps } = params;
  // Native: stake (85k) + wrap (55k) = 140k gas
  const gasNativeUsd = (gasGweiFast * 1e-9) * 140_000 * ethPriceUsd;
  // DEX: single swap ~ 165k gas
  const gasDexUsd = (gasGweiFast * 1e-9) * 165_000 * ethPriceUsd;

  const nativeWst = Math.max(0, ethAmount - gasNativeUsd / ethPriceUsd) * wstEthPerEth;
  // dex: 1 wstETH kupuješ za (wstEthPerEth * (1 + dexDiscountBps/10000)) ETH
  const effectiveRate = wstEthPerEth * (1 + dexDiscountBps / 10_000);
  const dexWst = Math.max(0, ethAmount - gasDexUsd / ethPriceUsd) / (1 / wstEthPerEth) / (1 + dexDiscountBps / 10_000);
  // Zjednodušene: dexOut = (ethAfterGas) * wstEthPerEth * (1 - dexDiscountBps/10000)
  const dexOut = Math.max(0, ethAmount - gasDexUsd / ethPriceUsd) * wstEthPerEth * (1 - dexDiscountBps / 10_000);

  const route: 'native' | 'dex' = dexOut > nativeWst ? 'dex' : 'native';
  const reason = route === 'dex'
    ? 'Priamy SWAP ETH → wstETH na DEXe (ušetríš na gas a získaš zľavu voči pegu).'
    : 'Natívny Mint cez Lido (gas je nízky, swap by mal nevýhodný slippage).';

  return {
    route,
    nativeOutput: nativeWst,
    dexOutput: dexOut,
    gasNativeUsd,
    gasDexUsd,
    reason,
  };
}
