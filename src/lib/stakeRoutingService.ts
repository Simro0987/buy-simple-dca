// Stake & Yield routing engine — multi-asset LST scanner
// Mirrors the architecture used in swapRoutingService.ts (hops, health, anti-phishing verified domains).

export type YieldAsset =
  | 'BTC' | 'ETH' | 'SOL'
  | 'stETH' | 'wstETH' | 'weETH'
  | 'cbBTC' | 'WBTC' | 'LBTC'
  | 'JitoSOL' | 'mSOL' | 'bSOL';

export type YieldNetwork = 'Ethereum' | 'Solana' | 'Arbitrum' | 'Base' | 'Polygon';
export type Strategy = 'liquid_staking' | 'restaking' | 'lending' | 'liquidity';

export type Health = 'ok' | 'congested' | 'degraded' | 'security_risk' | 'paused';

export interface YieldProtocol {
  id: string;
  name: string;
  officialUrl: string;          // anti-phishing hardcoded domain
  strategies: Strategy[];
  networks: YieldNetwork[];
  inputs: YieldAsset[];         // assets it can accept
  outputToken?: string;         // LST issued (if any)
  baseApy: number;              // % nominal
  tvlUsdM: number;              // TVL in $M
  auditedYears: number;
  mevBoost: boolean;
  isolatedMarkets?: boolean;    // for lending only
  unbondingDays: number;        // 0 = instant
  health: Health;
  healthNote?: string;
  layer: 1 | 2 | 3;             // 1=base staking, 2=restaking, 3=lending/LP
  category: string;             // display tag
}

export const PROTOCOLS: YieldProtocol[] = [
  // ===== SOL — Layer 1 =====
  { id: 'jito', name: 'Jito Staking', officialUrl: 'jito.network', strategies: ['liquid_staking'], networks: ['Solana'],
    inputs: ['SOL'], outputToken: 'JitoSOL', baseApy: 7.6, tvlUsdM: 2800, auditedYears: 3, mevBoost: true,
    unbondingDays: 0, health: 'ok', layer: 1, category: 'LST' },
  { id: 'marinade', name: 'Marinade Finance', officialUrl: 'marinade.finance', strategies: ['liquid_staking'], networks: ['Solana'],
    inputs: ['SOL'], outputToken: 'mSOL', baseApy: 7.2, tvlUsdM: 1500, auditedYears: 4, mevBoost: true,
    unbondingDays: 0, health: 'ok', layer: 1, category: 'LST' },
  { id: 'blazestake', name: 'BlazeStake', officialUrl: 'stake.solblaze.org', strategies: ['liquid_staking'], networks: ['Solana'],
    inputs: ['SOL'], outputToken: 'bSOL', baseApy: 7.4, tvlUsdM: 220, auditedYears: 2, mevBoost: true,
    unbondingDays: 0, health: 'ok', layer: 1, category: 'LST' },

  // ===== SOL — Layer 2 / 3 =====
  { id: 'solayer', name: 'Solayer', officialUrl: 'solayer.org', strategies: ['restaking'], networks: ['Solana'],
    inputs: ['SOL', 'JitoSOL', 'mSOL', 'bSOL'], baseApy: 9.1, tvlUsdM: 480, auditedYears: 1, mevBoost: true,
    unbondingDays: 2, health: 'congested', healthNote: 'High demand — slot wait', layer: 2, category: 'Restaking' },
  { id: 'kamino', name: 'Kamino Finance', officialUrl: 'kamino.finance', strategies: ['lending', 'liquidity'], networks: ['Solana'],
    inputs: ['SOL', 'JitoSOL', 'mSOL', 'bSOL'], baseApy: 8.4, tvlUsdM: 2100, auditedYears: 2, mevBoost: false,
    isolatedMarkets: true, unbondingDays: 0, health: 'ok', layer: 3, category: 'Lending / LP' },
  { id: 'marginfi', name: 'Marginfi', officialUrl: 'marginfi.com', strategies: ['lending'], networks: ['Solana'],
    inputs: ['SOL', 'JitoSOL', 'mSOL'], baseApy: 5.8, tvlUsdM: 380, auditedYears: 3, mevBoost: false,
    isolatedMarkets: false, unbondingDays: 0, health: 'degraded', healthNote: 'Operator turbulence', layer: 3, category: 'Lending' },
  { id: 'drift', name: 'Drift Protocol', officialUrl: 'drift.trade', strategies: ['lending', 'liquidity'], networks: ['Solana'],
    inputs: ['SOL', 'JitoSOL'], baseApy: 6.3, tvlUsdM: 520, auditedYears: 3, mevBoost: false,
    isolatedMarkets: true, unbondingDays: 0, health: 'ok', layer: 3, category: 'Lending / LP' },

  // ===== ETH — Layer 1 =====
  { id: 'lido', name: 'Lido Finance', officialUrl: 'lido.fi', strategies: ['liquid_staking'], networks: ['Ethereum'],
    inputs: ['ETH'], outputToken: 'stETH', baseApy: 3.2, tvlUsdM: 32000, auditedYears: 5, mevBoost: true,
    unbondingDays: 0, health: 'ok', layer: 1, category: 'LST' },
  { id: 'rocketpool', name: 'Rocket Pool', officialUrl: 'rocketpool.net', strategies: ['liquid_staking'], networks: ['Ethereum'],
    inputs: ['ETH'], outputToken: 'rETH', baseApy: 3.0, tvlUsdM: 3400, auditedYears: 4, mevBoost: true,
    unbondingDays: 0, health: 'ok', layer: 1, category: 'LST' },
  { id: 'etherfi', name: 'Ether.fi', officialUrl: 'ether.fi', strategies: ['liquid_staking', 'restaking'], networks: ['Ethereum'],
    inputs: ['ETH'], outputToken: 'weETH', baseApy: 3.9, tvlUsdM: 6200, auditedYears: 2, mevBoost: true,
    unbondingDays: 0, health: 'ok', layer: 1, category: 'LRT' },

  // ===== ETH — Layer 2 (restaking) =====
  { id: 'eigenlayer', name: 'EigenLayer', officialUrl: 'eigenlayer.xyz', strategies: ['restaking'], networks: ['Ethereum'],
    inputs: ['ETH', 'stETH', 'wstETH', 'weETH'], baseApy: 4.6, tvlUsdM: 14000, auditedYears: 2, mevBoost: false,
    unbondingDays: 7, health: 'ok', layer: 2, category: 'Restaking' },
  { id: 'symbiotic', name: 'Symbiotic', officialUrl: 'symbiotic.xyz', strategies: ['restaking'], networks: ['Ethereum'],
    inputs: ['ETH', 'stETH', 'wstETH'], baseApy: 5.2, tvlUsdM: 1800, auditedYears: 1, mevBoost: false,
    unbondingDays: 7, health: 'ok', layer: 2, category: 'Restaking' },
  { id: 'karak', name: 'Karak Network', officialUrl: 'karak.network', strategies: ['restaking'], networks: ['Ethereum', 'Arbitrum'],
    inputs: ['ETH', 'stETH', 'wstETH', 'weETH', 'WBTC', 'LBTC'], baseApy: 5.7, tvlUsdM: 950, auditedYears: 1, mevBoost: false,
    unbondingDays: 7, health: 'ok', layer: 2, category: 'Restaking' },

  // ===== ETH — Layer 3 (lending / LP) =====
  { id: 'aave', name: 'Aave V3', officialUrl: 'aave.com', strategies: ['lending'], networks: ['Ethereum', 'Arbitrum', 'Base', 'Polygon'],
    inputs: ['ETH', 'stETH', 'wstETH', 'weETH', 'WBTC', 'cbBTC'], baseApy: 4.1, tvlUsdM: 18000, auditedYears: 5, mevBoost: false,
    isolatedMarkets: false, unbondingDays: 0, health: 'ok', layer: 3, category: 'Lending' },
  { id: 'morpho', name: 'Morpho Blue', officialUrl: 'morpho.org', strategies: ['lending'], networks: ['Ethereum', 'Base'],
    inputs: ['ETH', 'stETH', 'wstETH', 'weETH', 'WBTC', 'cbBTC', 'LBTC'], baseApy: 6.8, tvlUsdM: 3200, auditedYears: 2, mevBoost: false,
    isolatedMarkets: true, unbondingDays: 0, health: 'ok', layer: 3, category: 'Lending' },
  { id: 'pendle', name: 'Pendle Finance', officialUrl: 'pendle.finance', strategies: ['liquidity'], networks: ['Ethereum', 'Arbitrum', 'Base'],
    inputs: ['stETH', 'wstETH', 'weETH', 'LBTC'], baseApy: 11.4, tvlUsdM: 5400, auditedYears: 3, mevBoost: false,
    unbondingDays: 0, health: 'ok', layer: 3, category: 'Yield Tokenization' },
  { id: 'beefy', name: 'Beefy Finance', officialUrl: 'beefy.finance', strategies: ['liquidity'], networks: ['Arbitrum', 'Base', 'Polygon'],
    inputs: ['ETH', 'wstETH', 'weETH', 'WBTC'], baseApy: 9.6, tvlUsdM: 380, auditedYears: 4, mevBoost: false,
    unbondingDays: 0, health: 'ok', layer: 3, category: 'Auto-compound LP' },
  { id: 'dolomite', name: 'Dolomite', officialUrl: 'dolomite.io', strategies: ['lending'], networks: ['Arbitrum'],
    inputs: ['wstETH', 'weETH', 'WBTC'], baseApy: 7.1, tvlUsdM: 280, auditedYears: 2, mevBoost: false,
    isolatedMarkets: true, unbondingDays: 0, health: 'ok', layer: 3, category: 'Lending' },

  // ===== BTC — staking / restaking =====
  { id: 'babylon', name: 'Babylon Staking', officialUrl: 'babylonlabs.io', strategies: ['liquid_staking'], networks: ['Ethereum'],
    inputs: ['BTC'], outputToken: 'LBTC', baseApy: 6.4, tvlUsdM: 5800, auditedYears: 1, mevBoost: false,
    unbondingDays: 7, health: 'ok', layer: 1, category: 'BTC Staking' },
  { id: 'lombard', name: 'Lombard (LBTC)', officialUrl: 'lombard.finance', strategies: ['liquid_staking'], networks: ['Ethereum', 'Arbitrum'],
    inputs: ['BTC', 'WBTC', 'cbBTC'], outputToken: 'LBTC', baseApy: 7.2, tvlUsdM: 1700, auditedYears: 1, mevBoost: false,
    unbondingDays: 0, health: 'ok', layer: 1, category: 'BTC LST' },
];

export interface RouteHop {
  kind: 'asset' | 'protocol';
  label: string;
  sublabel?: string;
  officialUrl?: string;
}

export interface YieldQuote {
  protocolId: string;
  protocolName: string;
  officialUrl: string;
  network: YieldNetwork;
  strategy: Strategy;
  apy: number;          // live (with jitter)
  tvlUsdM: number;
  health: Health;
  healthNote?: string;
  unbondingDays: number;
  mevBoost: boolean;
  isolatedMarkets?: boolean;
  hops: RouteHop[];
  layer: 1 | 2 | 3;
  category: string;
}

// LST → underlying baseline staking protocol (for hop chain)
const LST_BASELINE: Record<string, { protocolId: string; protocolName: string; url: string }> = {
  stETH:   { protocolId: 'lido',       protocolName: 'Lido',         url: 'lido.fi' },
  wstETH:  { protocolId: 'lido',       protocolName: 'Lido (wrap)',  url: 'lido.fi' },
  weETH:   { protocolId: 'etherfi',    protocolName: 'Ether.fi',     url: 'ether.fi' },
  JitoSOL: { protocolId: 'jito',       protocolName: 'Jito',         url: 'jito.network' },
  mSOL:    { protocolId: 'marinade',   protocolName: 'Marinade',     url: 'marinade.finance' },
  bSOL:    { protocolId: 'blazestake', protocolName: 'BlazeStake',   url: 'stake.solblaze.org' },
  LBTC:    { protocolId: 'lombard',    protocolName: 'Lombard',      url: 'lombard.finance' },
  cbBTC:   { protocolId: 'coinbase',   protocolName: 'Coinbase Wrap',url: 'coinbase.com' },
  WBTC:    { protocolId: 'bitgo',      protocolName: 'BitGo Wrap',   url: 'bitgo.com' },
};

const LST_ASSETS: YieldAsset[] = ['stETH','wstETH','weETH','JitoSOL','mSOL','bSOL','LBTC','cbBTC','WBTC'];

export function isLst(asset: YieldAsset): boolean {
  return LST_ASSETS.includes(asset);
}

export interface ScannerFilters {
  noLockup: boolean;
  auditedOnly: boolean;
  mevOnly: boolean;
  isolatedOnly: boolean;
  excludeUnhealthy: boolean;
}

export interface ScanInput {
  asset: YieldAsset;
  network: YieldNetwork;
  strategy: Strategy;
  filters: ScannerFilters;
  /** ticks every refresh to add deterministic apy jitter */
  tick?: number;
}

function jitter(base: number, tick: number, salt: number): number {
  const s = Math.sin((tick + salt) * 1.37) * 0.5; // ±0.5%
  return Math.max(0, base + s * 0.4);
}

export function scanYieldRoutes(input: ScanInput): YieldQuote[] {
  const { asset, network, strategy, filters, tick = 0 } = input;
  const startedFromLst = isLst(asset);

  // When user starts from a native asset and asks for restaking, we skip layer-1 conceptually
  // by also surfacing layer-2 protocols (the hop chain will include the baseline).
  const allowedLayers: (1 | 2 | 3)[] =
    startedFromLst
      ? [2, 3]
      : strategy === 'restaking'
        ? [2]
        : strategy === 'liquid_staking'
          ? [1]
          : [3];

  const candidates = PROTOCOLS.filter(p => {
    if (!p.networks.includes(network)) return false;
    if (!p.strategies.includes(strategy)) return false;
    if (!allowedLayers.includes(p.layer)) return false;
    // Accept either native asset directly, or its LST baseline path
    if (!p.inputs.includes(asset)) return false;
    return true;
  });

  return candidates
    .filter(p => {
      if (filters.noLockup && p.unbondingDays > 0) return false;
      if (filters.auditedOnly && (p.tvlUsdM < 100 || p.auditedYears < 2)) return false;
      if (filters.mevOnly && !p.mevBoost) return false;
      if (filters.isolatedOnly && strategy === 'lending' && !p.isolatedMarkets) return false;
      if (filters.excludeUnhealthy && (p.health === 'security_risk' || p.health === 'paused' || p.health === 'degraded')) return false;
      return true;
    })
    .map((p, idx) => {
      const apy = jitter(p.baseApy, tick, idx);
      const hops: RouteHop[] = [{ kind: 'asset', label: asset }];

      // If user starts from native and is doing restaking, prepend baseline hop
      if (!startedFromLst && strategy === 'restaking') {
        // pick a natural baseline for the native asset
        const baselineId =
          asset === 'ETH' ? 'lido' :
          asset === 'SOL' ? 'jito' :
          asset === 'BTC' ? 'babylon' : null;
        const base = baselineId ? PROTOCOLS.find(x => x.id === baselineId) : null;
        if (base) {
          hops.push({ kind: 'protocol', label: '⚡ Hop 1 · ' + base.name, sublabel: base.outputToken ?? 'LST', officialUrl: base.officialUrl });
          hops.push({ kind: 'asset', label: base.outputToken ?? 'LST' });
        }
      }

      // If user started from an LST, show the implicit baseline as informational hop
      if (startedFromLst) {
        const baseline = LST_BASELINE[asset];
        if (baseline) {
          hops.push({ kind: 'protocol', label: 'Skipped · ' + baseline.protocolName, sublabel: 'baseline already done', officialUrl: baseline.url });
        }
      }

      const layerEmoji = p.layer === 2 ? '🛡️ Hop ' + (startedFromLst ? '1' : '2') + ' · ' : p.layer === 3 ? '💰 ' : '⚡ ';
      hops.push({ kind: 'protocol', label: layerEmoji + p.name, sublabel: p.category, officialUrl: p.officialUrl });
      if (p.outputToken) hops.push({ kind: 'asset', label: p.outputToken });

      return {
        protocolId: p.id,
        protocolName: p.name,
        officialUrl: p.officialUrl,
        network,
        strategy,
        apy,
        tvlUsdM: p.tvlUsdM,
        health: p.health,
        healthNote: p.healthNote,
        unbondingDays: p.unbondingDays,
        mevBoost: p.mevBoost,
        isolatedMarkets: p.isolatedMarkets,
        hops,
        layer: p.layer,
        category: p.category,
      } as YieldQuote;
    })
    .sort((a, b) => b.apy - a.apy);
}

// ============= Master Portfolio Yield Planner =============

export interface PlannerSubAllocation {
  key: string;
  label: string;
  protocol: string;
  officialUrl: string;
  defaultPct: number;
  apyKey: 'hodl' | 'btcStake' | 'btcLst' | 'ethStake' | 'ethL2' | 'solStake' | 'solLp';
}

export interface PlannerAsset {
  symbol: 'BTC' | 'ETH' | 'SOL';
  name: string;
  color: string;
  defaultPct: number;
  sub: PlannerSubAllocation[];
}

export const PLANNER_ASSETS: PlannerAsset[] = [
  {
    symbol: 'BTC', name: 'Bitcoin', color: '#F7931A', defaultPct: 64,
    sub: [
      { key: 'btc_hodl',    label: 'HODL (Cold Storage)', protocol: 'Hardware wallet',     officialUrl: 'bitcoin.org',     defaultPct: 42, apyKey: 'hodl' },
      { key: 'btc_stake',   label: 'Liquid Staking',      protocol: 'Babylon / LBTC',      officialUrl: 'babylonlabs.io',  defaultPct: 22, apyKey: 'btcStake' },
      { key: 'btc_lst',     label: 'Lending & Restaking', protocol: 'Lombard · Karak DeFi', officialUrl: 'lombard.finance', defaultPct: 14, apyKey: 'btcLst' },
    ],
  },
  {
    symbol: 'ETH', name: 'Ethereum', color: '#627EEA', defaultPct: 25,
    sub: [
      { key: 'eth_hodl',   label: 'HODL (Native ETH)',      protocol: 'Hardware wallet',       officialUrl: 'ethereum.org', defaultPct: 41, apyKey: 'hodl' },
      { key: 'eth_stake',  label: 'Mainnet Staking',        protocol: 'Lido stETH',            officialUrl: 'lido.fi',      defaultPct: 32, apyKey: 'ethStake' },
      { key: 'eth_l2',     label: 'Layer-2 DeFi Yield',     protocol: 'wstETH · Arbitrum',     officialUrl: 'arbitrum.io',  defaultPct: 27, apyKey: 'ethL2' },
    ],
  },
  {
    symbol: 'SOL', name: 'Solana', color: '#9945FF', defaultPct: 11,
    sub: [
      { key: 'sol_hodl',  label: 'HODL (Native SOL)',          protocol: 'Wallet',           officialUrl: 'solana.com',      defaultPct: 36, apyKey: 'hodl' },
      { key: 'sol_stake', label: 'Liquid Staking',             protocol: 'Jito JitoSOL',     officialUrl: 'jito.network',    defaultPct: 32, apyKey: 'solStake' },
      { key: 'sol_lp',    label: 'Lending & Liquidity',        protocol: 'Kamino JitoSOL/SOL LP', officialUrl: 'kamino.finance', defaultPct: 32, apyKey: 'solLp' },
    ],
  },
];

export function getLiveApyMap(tick: number): Record<PlannerSubAllocation['apyKey'], number> {
  return {
    hodl: 0,
    btcStake: jitter(6.4, tick, 1),
    btcLst:   jitter(8.2, tick, 2),
    ethStake: jitter(3.2, tick, 3),
    ethL2:    jitter(7.6, tick, 4),
    solStake: jitter(7.6, tick, 5),
    solLp:    jitter(8.1, tick, 6),
  };
}

// ============= Institutional Risk-Scoring Engine =============

export type RiskLevel = 'low' | 'medium' | 'high';
export type RiskFactor = 'Low' | 'Medium' | 'High' | 'N/A';

export interface RiskVectors {
  smartContract: RiskFactor;
  depeg: RiskFactor;
  lockup: RiskFactor;
}

export interface RiskAssessment {
  score: number;        // 1..10
  level: RiskLevel;
  vectors: RiskVectors;
  verdict: string;      // expert recommendation snippet
}

const VERDICTS_EN: Record<RiskLevel, string> = {
  low:    '💡 Protocol Verdict: Highly conservative. Ideal for core long-term generational wealth preservation with negligible smart-contract exposure.',
  medium: '💡 Protocol Verdict: Balanced allocation recommended. Standard smart-contract counterparty risk present. Monitor liquidity thresholds periodically.',
  high:   '⚠️ Protocol Verdict: Aggressive yield layering. Subject to compounding smart-contract composability risks and potential cascade liquidations. Deploy only speculatory risk capital.',
};

const VERDICTS_SK: Record<RiskLevel, string> = {
  low:    '💡 Verdikt: Vysoko konzervatívne. Ideálne pre dlhodobé generačné uchovanie hodnoty s minimálnou expozíciou voči smart-contract rizikám.',
  medium: '💡 Verdikt: Vyvážená alokácia. Štandardné smart-contract riziko prítomné. Pravidelne monitoruj likviditné prahy.',
  high:   '⚠️ Verdikt: Agresívne vrstvenie výnosov. Kompozične násobené smart-contract riziká a potenciálne kaskádové likvidácie. Nasaď iba špekulatívny kapitál.',
};

const LST_LIKE = new Set<string>(['stETH','wstETH','weETH','JitoSOL','mSOL','bSOL','LBTC','cbBTC','WBTC']);

interface RiskInput {
  tvlUsdM: number;
  auditedYears: number;
  layer: 1 | 2 | 3;
  strategy?: Strategy;
  unbondingDays: number;
  isolatedMarkets?: boolean;
  hopsCount?: number;
  involvesLst?: boolean;
}

function assessRisk(i: RiskInput, lang: 'en' | 'sk' = 'en'): RiskAssessment {
  let score = 1;

  // Smart-contract maturity (TVL + audit duration)
  let sc: RiskFactor;
  if (i.tvlUsdM < 300 || i.auditedYears < 2) { score += 3; sc = 'High'; }
  else if (i.tvlUsdM < 2000 || i.auditedYears < 4) { score += 2; sc = 'Medium'; }
  else { score += 1; sc = 'Low'; }

  // Layer composability
  if (i.layer === 2) score += 2;
  if (i.layer === 3) score += 2;

  // Composability — many hops compound risk
  if ((i.hopsCount ?? 0) >= 4) score += 1;

  // Lending isolation discount
  if (i.strategy === 'lending' && i.isolatedMarkets) score -= 1;

  // Lockup risk
  let lockup: RiskFactor = 'Low';
  if (i.unbondingDays >= 7) { score += 2; lockup = 'High'; }
  else if (i.unbondingDays > 0) { score += 1; lockup = 'Medium'; }

  // Depeg / wrapped-asset risk
  let depeg: RiskFactor = 'N/A';
  if (i.involvesLst) {
    if (i.layer >= 2) { score += 1; depeg = 'Medium'; }
    else depeg = 'Low';
  }

  score = Math.max(1, Math.min(10, score));
  const level: RiskLevel = score <= 3 ? 'low' : score <= 6 ? 'medium' : 'high';
  const verdict = (lang === 'sk' ? VERDICTS_SK : VERDICTS_EN)[level];

  return { score, level, vectors: { smartContract: sc, depeg, lockup }, verdict };
}

export function assessQuoteRisk(q: YieldQuote, lang: 'en' | 'sk' = 'en'): RiskAssessment {
  const involvesLst = q.hops.some(h => h.kind === 'asset' && LST_LIKE.has(h.label));
  return assessRisk({
    tvlUsdM: q.tvlUsdM,
    auditedYears: PROTOCOLS.find(p => p.id === q.protocolId)?.auditedYears ?? 2,
    layer: q.layer,
    strategy: q.strategy,
    unbondingDays: q.unbondingDays,
    isolatedMarkets: q.isolatedMarkets,
    hopsCount: q.hops.length,
    involvesLst,
  }, lang);
}

/** Risk for a planner sub-allocation (HODL is risk-free baseline). */
export function assessPlannerRisk(apyKey: PlannerSubAllocation['apyKey'], lang: 'en' | 'sk' = 'en'): RiskAssessment {
  if (apyKey === 'hodl') {
    return {
      score: 1, level: 'low',
      vectors: { smartContract: 'N/A', depeg: 'N/A', lockup: 'Low' },
      verdict: (lang === 'sk' ? VERDICTS_SK : VERDICTS_EN).low,
    };
  }
  const map: Record<string, RiskInput> = {
    btcStake: { tvlUsdM: 5800, auditedYears: 1, layer: 1, unbondingDays: 7 },
    btcLst:   { tvlUsdM: 1700, auditedYears: 1, layer: 3, unbondingDays: 0, involvesLst: true, hopsCount: 4 },
    ethStake: { tvlUsdM: 32000, auditedYears: 5, layer: 1, unbondingDays: 0 },
    ethL2:    { tvlUsdM: 3200, auditedYears: 2, layer: 3, unbondingDays: 0, involvesLst: true, hopsCount: 4, strategy: 'lending', isolatedMarkets: true },
    solStake: { tvlUsdM: 2800, auditedYears: 3, layer: 1, unbondingDays: 0 },
    solLp:    { tvlUsdM: 2100, auditedYears: 2, layer: 3, unbondingDays: 0, involvesLst: true, hopsCount: 4, strategy: 'liquidity' },
  };
  return assessRisk(map[apyKey] ?? map.ethStake, lang);
}

