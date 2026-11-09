/**
 * Bezpečný výnos pre ticker z DefiLlama Yields — prioritizácia podľa rizika:
 *   1. Single-sided Lending / Liquid Staking (Aave, Kamino, Morpho, Lido, Jito…)
 *   2. Iné single-sided pooly (bez IL)
 *   3. DEX LP pooly — len ak neexistuje nič single-sided
 *   4. Natívny staking fallback pre PoS tokeny (odhad, označený „~“)
 * V rámci tieru: vyradiť outliery > 100 % APY, víťaz = najvyšší TVL.
 */
import { useQuery } from '@tanstack/react-query';

interface LlamaPool {
  symbol?: string;
  project?: string;
  chain?: string;
  apy?: number;
  tvlUsd?: number;
  exposure?: string;
  ilRisk?: string;
}

export type YieldStrategy = 'Lending' | 'Liquid Staking' | 'Staking' | 'Vault' | 'DEX LP' | 'Earn' | 'Cold Storage' | 'Governance Hold' | 'Privacy Hold' | 'Speculative Hold' | 'sAAVE Staking' | 'sENA Staking' | 'vePENDLE Lock';

export interface YieldEntry {
  apy: number;
  project: string;      // zobrazovaný protokol / miesto
  chain: string;
  strategy: YieldStrategy;
  tvl: number;
  estimated: boolean;   // true = natívny fallback, nie živý pool
}

const LENDING: Record<string, string> = {
  'aave-v3': 'Aave V3', 'aave-v2': 'Aave V2', 'kamino-lend': 'Kamino', 'morpho-blue': 'Morpho',
  'compound-v3': 'Compound V3', 'spark': 'Spark', 'sparklend': 'Spark', 'marginfi': 'marginfi',
  'save': 'Save', 'venus-core-pool': 'Venus', 'fluid-lending': 'Fluid', 'euler-v2': 'Euler',
  'hyperlend-pooled': 'HyperLend', 'justlend': 'JustLend',
};
const LIQUID_STAKING: Record<string, string> = {
  'lido': 'Lido', 'rocket-pool': 'Rocket Pool', 'jito-liquid-staking': 'Jito', 'jito': 'Jito',
  'marinade-liquid-staking': 'Marinade', 'marinade-native': 'Marinade Native', 'sanctum-infinity': 'Sanctum',
  'binance-staked-eth': 'Binance wBETH', 'binance-staked-sol': 'Binance BNSOL', 'coinbase-wrapped-staked-eth': 'Coinbase cbETH',
  'ether.fi-stake': 'ether.fi', 'kinetiq': 'Kinetiq', 'stakedhype': 'StakedHYPE', 'linear-protocol': 'LiNEAR',
  'meta-pool': 'Meta Pool', 'tensorplex-stake': 'Tensorplex', 'stader': 'Stader', 'frax-ether': 'Frax Ether',
};

/** Symboly reprezentujúce rovnaké aktívum single-sided (wrapped / LST). */
const ALIASES: Record<string, string[]> = {
  BTC: ['WBTC', 'CBBTC', 'TBTC', 'LBTC', 'BTCB'],
  ETH: ['WETH', 'STETH', 'WSTETH', 'RETH', 'CBETH', 'WEETH', 'WBETH', 'FRXETH', 'SFRXETH'],
  SOL: ['WSOL', 'MSOL', 'JITOSOL', 'BNSOL', 'INF', 'JUPSOL'],
  HYPE: ['WHYPE', 'KHYPE', 'STHYPE'],
  NEAR: ['WNEAR', 'STNEAR', 'LINEAR'],
  TAO: ['STTAO', 'WTAO'],
};

/** Záložné single-sided stratégie; nikdy neodporúčajú LP pre uvedené tokeny. */
const SAFE_FALLBACK: Record<string, YieldEntry> = {
  BTC: { project: 'Ledger Nano', strategy: 'Cold Storage', apy: 0, chain: 'BTC', tvl: 0, estimated: false },
  ETH: { project: 'Native Validator', strategy: 'Staking', apy: 3.2, chain: 'ETH', tvl: 0, estimated: true },
  SOL: { project: 'Native Validator', strategy: 'Staking', apy: 7.5, chain: 'SOL', tvl: 0, estimated: true },
  NEAR: { project: 'Native Validator', strategy: 'Staking', apy: 8.5, chain: 'NEAR', tvl: 0, estimated: true },
  TAO: { project: 'Native Validator', strategy: 'Staking', apy: 16, chain: 'TAO', tvl: 0, estimated: true },
  INJ: { project: 'Native Validator', strategy: 'Staking', apy: 14, chain: 'INJ', tvl: 0, estimated: true },
  HNT: { project: 'Native Validator', strategy: 'Staking', apy: 6, chain: 'HNT', tvl: 0, estimated: true },
  HYPE: { project: 'Kinetiq', strategy: 'Staking', apy: 12, chain: 'HYPE', tvl: 0, estimated: true },
  AAVE: { project: 'Safety Module', strategy: 'sAAVE Staking', apy: 6, chain: 'AAVE', tvl: 0, estimated: true },
  UNI: { project: 'Self-Custody', strategy: 'Governance Hold', apy: 0, chain: 'UNI', tvl: 0, estimated: false },
  ENA: { project: 'Ethena', strategy: 'sENA Staking', apy: 15, chain: 'ENA', tvl: 0, estimated: true },
  PENDLE: { project: 'Pendle', strategy: 'vePENDLE Lock', apy: 10, chain: 'PENDLE', tvl: 0, estimated: true },
  XMR: { project: 'Cake Wallet / Ledger', strategy: 'Privacy Hold', apy: 0, chain: 'XMR', tvl: 0, estimated: false },
  PUMP: { project: 'Self-Custody', strategy: 'Speculative Hold', apy: 0, chain: 'PUMP', tvl: 0, estimated: false },
};

const FIXED_STRATEGY = new Set(['BTC', 'UNI', 'XMR', 'PUMP', 'HYPE']);

/** Live single-sided výnos má prednosť, inak bezpečný fallback pred LP. */
export function resolveYieldEntry(symbol: string, live?: YieldEntry | null): YieldEntry | null {
  const key = symbol.trim().toUpperCase();
  const fallback = SAFE_FALLBACK[key];
  if (fallback && (FIXED_STRATEGY.has(key) || !live || live.strategy === 'DEX LP')) return fallback;
  return live ?? null;
}

function strategyOf(project: string, single: boolean): { strategy: YieldStrategy; name: string; tier: number } {
  if (LENDING[project]) return { strategy: 'Lending', name: LENDING[project], tier: 1 };
  if (LIQUID_STAKING[project]) return { strategy: 'Liquid Staking', name: LIQUID_STAKING[project], tier: 1 };
  const name = project.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return single ? { strategy: 'Vault', name, tier: 2 } : { strategy: 'DEX LP', name, tier: 3 };
}

export async function fetchApyMap(): Promise<Record<string, YieldEntry>> {
  const res = await fetch('https://yields.llama.fi/pools');
  if (!res.ok) throw new Error('DefiLlama nedostupné');
  const j = await res.json() as { data?: LlamaPool[] };

  const symbolToToken = new Map<string, string>();
  for (const [tok, list] of Object.entries(ALIASES)) list.forEach(s => symbolToToken.set(s, tok));

  const best: Record<string, YieldEntry & { tier: number }> = {};
  const consider = (token: string, e: YieldEntry & { tier: number }) => {
    const prev = best[token];
    if (!prev || e.tier < prev.tier || (e.tier === prev.tier && e.tvl > prev.tvl)) best[token] = e;
  };

  for (const p of j.data ?? []) {
    const sym = String(p.symbol ?? '').trim().toUpperCase();
    const apy = Number(p.apy);
    const tvl = Number(p.tvlUsd);
    if (!sym || !Number.isFinite(apy) || apy < 0.1 || apy > 100 || !(tvl > 1_000_000)) continue; // < 0,1 % = prázdny výnos
    const project = String(p.project ?? '');
    const chain = String(p.chain ?? '');
    const isMulti = sym.includes('-') || p.exposure === 'multi';

    if (!isMulti) {
      const token = symbolToToken.get(sym) ?? sym;
      const s = strategyOf(project, true);
      consider(token, { apy, project: s.name, chain, strategy: s.strategy, tvl, estimated: false, tier: s.tier });
    } else {
      // LP fallback: priradiť každej nohe páru (len ak nič single-sided neexistuje).
      for (const leg of sym.split('-')) {
        const token = symbolToToken.get(leg) ?? leg;
        consider(token, { apy, project: strategyOf(project, false).name, chain, strategy: 'DEX LP', tvl, estimated: false, tier: 3 });
      }
    }
  }

  const out: Record<string, YieldEntry> = {};
  for (const [k, { tier: _t, ...e }] of Object.entries(best)) out[k] = e;
  for (const tok of Object.keys(SAFE_FALLBACK)) out[tok] = resolveYieldEntry(tok, out[tok]) ?? SAFE_FALLBACK[tok];
  return out;
}

/** „[Protokol] - [Stratégia] : X% APY“ (natívny odhad s „~“). */
export function formatYieldLine(e: YieldEntry): string {
  const pct = e.apy.toLocaleString('sk-SK', { minimumFractionDigits: e.estimated ? 1 : 0, maximumFractionDigits: e.estimated ? 1 : 2 });
  return `${e.project} - ${e.strategy} : ${e.estimated ? '~' : ''}${pct}% APY`;
}

export function useLlamaStakingApy(symbol: string, enabled = true) {
  const q = useQuery({
    queryKey: ['llama-apy-map-v4'],
    queryFn: fetchApyMap,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    enabled,
  });
  const key = symbol.trim().toUpperCase();
  const entry = resolveYieldEntry(key, q.data?.[key]);
  return { entry, isLoading: q.isLoading };
}
