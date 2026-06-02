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
  { id: 'jito_restaking', name: 'Jito Restaking', officialUrl: 'jito.network/restaking', strategies: ['restaking'], networks: ['Solana'],
    inputs: ['SOL', 'JitoSOL'], baseApy: 9.4, tvlUsdM: 720, auditedYears: 2, mevBoost: true,
    unbondingDays: 2, health: 'ok', layer: 2, category: 'Restaking' },
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

// ============= Anti-phishing URL helpers =============

/** Build the canonical https:// link for a verified domain (handles deep links). */
export function buildOfficialLink(url: string): string {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Deep link (has a path) — pin to www. and ensure trailing slash for safety
  if (url.includes('/')) {
    const trimmed = url.replace(/\/$/, '');
    return `https://www.${trimmed}/`;
  }
  return `https://${url}`;
}

/** Render-safe display version of a verified domain (with trailing slash for deep links). */
export function displayOfficialUrl(url: string): string {
  if (!url) return '';
  const stripped = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return stripped.includes('/') ? stripped.replace(/\/$/, '') + '/' : stripped;
}

// ============= Autonomous Recommended Route Engine =============

export type RouteRiskTier = 'conservative' | 'balanced' | 'aggressive';

export interface RouteStep {
  pct: number;                  // % of capital allocated at this step
  protocolId: string;
  protocolName: string;
  officialUrl: string;
  apy: number;                  // live-jittered apy for this protocol
  layer: 1 | 2 | 3;
  note?: string;
}

export interface RecommendedRoute {
  tier: RouteRiskTier;
  emoji: string;
  title: { en: string; sk: string };
  network: YieldNetwork;
  baseHopProtocolId?: string;   // optional Layer-1 staking hop before splits
  steps: RouteStep[];           // splits at the yielding layer
  blendedApy: number;
  hops: RouteHop[];
  risk: RiskAssessment;
  multiHop: boolean;
}

// Approximate USD prices (for retail gas-fee guard only)
export const ASSET_USD_PRICE: Record<YieldAsset, number> = {
  BTC: 95000, cbBTC: 95000, WBTC: 95000, LBTC: 95000,
  ETH: 3500, stETH: 3500, wstETH: 4100, weETH: 3700,
  SOL: 200, JitoSOL: 220, mSOL: 215, bSOL: 210,
};

/** Smart Gas Fee Layering — returns warning when retail user is exposed to Ethereum mainnet multi-hop fees. */
export function evaluateGasGuard(args: {
  network: YieldNetwork;
  depositUsd: number;
  multiHop: boolean;
  lang?: 'en' | 'sk';
}): { warn: boolean; message: string } | null {
  const { network, depositUsd, multiHop, lang = 'en' } = args;
  if (network !== 'Ethereum') return null;
  if (!multiHop) return null;
  if (depositUsd >= 500) return null;
  const msg =
    lang === 'sk'
      ? '⚠️ Upozornenie na gas: Viacvrstvové operácie na Ethereum Mainnet môžu výrazne pohltiť tvoje krátkodobé výnosy. Zváž migráciu na Arbitrum alebo Base L2 stratégie pre nižšie gas náklady.'
      : '⚠️ Gas Fee Notice: Multi-layer execution fees on Ethereum Mainnet may severely impact your short-term yields. Consider migrating to Arbitrum or Base L2 strategies for lower gas overhead.';
  return { warn: true, message: msg };
}

interface RecipeStep { pct: number; protocolId: string }
interface Recipe {
  tier: RouteRiskTier;
  network: YieldNetwork;
  baseProtocolId?: string;
  steps: RecipeStep[];
}

const RECIPES: Partial<Record<YieldAsset, Recipe[]>> = {
  SOL: [
    { tier: 'conservative', network: 'Solana', steps: [{ pct: 100, protocolId: 'jito' }] },
    { tier: 'balanced',     network: 'Solana', baseProtocolId: 'jito',
      steps: [{ pct: 70, protocolId: 'jito_restaking' }, { pct: 30, protocolId: 'kamino' }] },
    { tier: 'aggressive',   network: 'Solana', baseProtocolId: 'jito',
      steps: [{ pct: 50, protocolId: 'solayer' }, { pct: 50, protocolId: 'kamino' }] },
  ],
  JitoSOL: [
    { tier: 'conservative', network: 'Solana', steps: [{ pct: 100, protocolId: 'kamino' }] },
    { tier: 'balanced',     network: 'Solana',
      steps: [{ pct: 70, protocolId: 'jito_restaking' }, { pct: 30, protocolId: 'kamino' }] },
    { tier: 'aggressive',   network: 'Solana',
      steps: [{ pct: 50, protocolId: 'solayer' }, { pct: 50, protocolId: 'drift' }] },
  ],
  mSOL: [
    { tier: 'conservative', network: 'Solana', steps: [{ pct: 100, protocolId: 'marginfi' }] },
    { tier: 'balanced',     network: 'Solana',
      steps: [{ pct: 70, protocolId: 'solayer' }, { pct: 30, protocolId: 'kamino' }] },
    { tier: 'aggressive',   network: 'Solana',
      steps: [{ pct: 50, protocolId: 'solayer' }, { pct: 50, protocolId: 'drift' }] },
  ],
  bSOL: [
    { tier: 'conservative', network: 'Solana', steps: [{ pct: 100, protocolId: 'kamino' }] },
    { tier: 'balanced',     network: 'Solana',
      steps: [{ pct: 70, protocolId: 'solayer' }, { pct: 30, protocolId: 'kamino' }] },
  ],
  ETH: [
    { tier: 'conservative', network: 'Ethereum', steps: [{ pct: 100, protocolId: 'lido' }] },
    { tier: 'balanced',     network: 'Ethereum', baseProtocolId: 'lido',
      steps: [{ pct: 70, protocolId: 'eigenlayer' }, { pct: 30, protocolId: 'aave' }] },
    { tier: 'aggressive',   network: 'Ethereum', baseProtocolId: 'etherfi',
      steps: [{ pct: 50, protocolId: 'symbiotic' }, { pct: 50, protocolId: 'pendle' }] },
  ],
  stETH: [
    { tier: 'conservative', network: 'Ethereum', steps: [{ pct: 100, protocolId: 'aave' }] },
    { tier: 'balanced',     network: 'Ethereum',
      steps: [{ pct: 70, protocolId: 'eigenlayer' }, { pct: 30, protocolId: 'morpho' }] },
    { tier: 'aggressive',   network: 'Ethereum',
      steps: [{ pct: 50, protocolId: 'karak' }, { pct: 50, protocolId: 'pendle' }] },
  ],
  wstETH: [
    { tier: 'conservative', network: 'Ethereum', steps: [{ pct: 100, protocolId: 'aave' }] },
    { tier: 'balanced',     network: 'Ethereum',
      steps: [{ pct: 70, protocolId: 'eigenlayer' }, { pct: 30, protocolId: 'morpho' }] },
    { tier: 'aggressive',   network: 'Ethereum',
      steps: [{ pct: 50, protocolId: 'karak' }, { pct: 50, protocolId: 'pendle' }] },
  ],
  weETH: [
    { tier: 'conservative', network: 'Ethereum', steps: [{ pct: 100, protocolId: 'morpho' }] },
    { tier: 'balanced',     network: 'Ethereum',
      steps: [{ pct: 70, protocolId: 'eigenlayer' }, { pct: 30, protocolId: 'pendle' }] },
    { tier: 'aggressive',   network: 'Ethereum',
      steps: [{ pct: 50, protocolId: 'symbiotic' }, { pct: 50, protocolId: 'pendle' }] },
  ],
  BTC: [
    { tier: 'conservative', network: 'Ethereum', steps: [{ pct: 100, protocolId: 'babylon' }] },
    { tier: 'balanced',     network: 'Ethereum', baseProtocolId: 'lombard',
      steps: [{ pct: 70, protocolId: 'karak' }, { pct: 30, protocolId: 'morpho' }] },
    { tier: 'aggressive',   network: 'Ethereum', baseProtocolId: 'lombard',
      steps: [{ pct: 50, protocolId: 'karak' }, { pct: 50, protocolId: 'pendle' }] },
  ],
  LBTC: [
    { tier: 'conservative', network: 'Ethereum', steps: [{ pct: 100, protocolId: 'morpho' }] },
    { tier: 'balanced',     network: 'Ethereum',
      steps: [{ pct: 70, protocolId: 'karak' }, { pct: 30, protocolId: 'morpho' }] },
    { tier: 'aggressive',   network: 'Ethereum',
      steps: [{ pct: 50, protocolId: 'karak' }, { pct: 50, protocolId: 'pendle' }] },
  ],
  WBTC: [
    { tier: 'conservative', network: 'Ethereum', steps: [{ pct: 100, protocolId: 'aave' }] },
    { tier: 'balanced',     network: 'Ethereum',
      steps: [{ pct: 70, protocolId: 'karak' }, { pct: 30, protocolId: 'morpho' }] },
    { tier: 'aggressive',   network: 'Arbitrum',
      steps: [{ pct: 50, protocolId: 'dolomite' }, { pct: 50, protocolId: 'beefy' }] },
  ],
  cbBTC: [
    { tier: 'conservative', network: 'Base', steps: [{ pct: 100, protocolId: 'morpho' }] },
    { tier: 'balanced',     network: 'Ethereum',
      steps: [{ pct: 70, protocolId: 'aave' }, { pct: 30, protocolId: 'morpho' }] },
  ],
};

const TIER_TITLES: Record<RouteRiskTier, { en: string; sk: string; emoji: string }> = {
  conservative: { emoji: '🛡️', en: 'Conservative Base Route',     sk: 'Konzervatívna základná trasa' },
  balanced:     { emoji: '⚖️', en: 'Balanced Multi-Layer Route',   sk: 'Vyvážená viacvrstvová trasa' },
  aggressive:   { emoji: '⚡', en: 'Maximum Aggressive Yield',     sk: 'Maximálne agresívny výnos' },
};

export function getRecommendedRoutes(asset: YieldAsset, tick = 0, lang: 'en' | 'sk' = 'en'): RecommendedRoute[] {
  const recipes = RECIPES[asset] ?? [];
  return recipes.map((r, rIdx) => {
    const baseProto = r.baseProtocolId ? PROTOCOLS.find(p => p.id === r.baseProtocolId) : undefined;
    const stepProtos = r.steps.map(s => {
      const p = PROTOCOLS.find(x => x.id === s.protocolId)!;
      return { s, p };
    });

    const steps: RouteStep[] = stepProtos.map(({ s, p }, i) => ({
      pct: s.pct,
      protocolId: p.id,
      protocolName: p.name,
      officialUrl: p.officialUrl,
      apy: jitter(p.baseApy, tick, rIdx * 10 + i),
      layer: p.layer,
    }));

    // Blended APY: include baseProto's APY for capital that flows through it (full amount, single layer)
    // then add weighted incremental from split steps.
    const baseApy = baseProto ? jitter(baseProto.baseApy, tick, rIdx * 10 + 99) : 0;
    const splitApy = steps.reduce((sum, st) => sum + (st.pct / 100) * st.apy, 0);
    const blendedApy = baseApy + splitApy;

    // Build hop chain: [asset] -> (baseProto) -> [outputToken] -> for each split: protocol chip
    const hops: RouteHop[] = [{ kind: 'asset', label: asset }];
    if (baseProto) {
      hops.push({ kind: 'protocol', label: `⚡ ${baseProto.name}`, sublabel: baseProto.outputToken ?? baseProto.category, officialUrl: baseProto.officialUrl });
      if (baseProto.outputToken) hops.push({ kind: 'asset', label: baseProto.outputToken });
    }
    stepProtos.forEach(({ s, p }) => {
      const emoji = p.layer === 2 ? '🛡️' : p.layer === 3 ? '💰' : '⚡';
      hops.push({
        kind: 'protocol',
        label: `${emoji} ${s.pct}% · ${p.name}`,
        sublabel: p.category,
        officialUrl: p.officialUrl,
      });
    });

    const multiHop = (baseProto ? 1 : 0) + steps.length > 1;
    const involvesLst = !!baseProto?.outputToken || LST_LIKE.has(asset);
    // Tier-aligned risk
    const tierRiskInput: RiskInput = (() => {
      if (r.tier === 'conservative') {
        const p = baseProto ?? stepProtos[0].p;
        return {
          tvlUsdM: p.tvlUsdM, auditedYears: p.auditedYears, layer: p.layer,
          strategy: p.strategies[0], unbondingDays: p.unbondingDays,
          isolatedMarkets: p.isolatedMarkets, hopsCount: hops.length,
          involvesLst,
        };
      }
      // Take worst step
      const worst = stepProtos.reduce((acc, cur) =>
        cur.p.tvlUsdM < acc.p.tvlUsdM || cur.p.auditedYears < acc.p.auditedYears ? cur : acc
      , stepProtos[0]);
      return {
        tvlUsdM: worst.p.tvlUsdM, auditedYears: worst.p.auditedYears, layer: worst.p.layer,
        strategy: worst.p.strategies[0], unbondingDays: Math.max(...stepProtos.map(x => x.p.unbondingDays), baseProto?.unbondingDays ?? 0),
        isolatedMarkets: worst.p.isolatedMarkets, hopsCount: hops.length, involvesLst,
      };
    })();
    const risk = assessRisk(tierRiskInput, lang);

    const cfg = TIER_TITLES[r.tier];
    return {
      tier: r.tier,
      emoji: cfg.emoji,
      title: { en: cfg.en, sk: cfg.sk },
      network: r.network,
      baseHopProtocolId: r.baseProtocolId,
      steps,
      blendedApy,
      hops,
      risk,
      multiHop,
    } as RecommendedRoute;
  });
}

// ============= Derivative LST / LRT Depeg Engine =============

export type DerivativeAsset = 'stETH' | 'wstETH' | 'weETH' | 'JitoSOL' | 'mSOL' | 'bSOL' | 'LBTC';

export const DERIVATIVE_ASSETS: DerivativeAsset[] = ['stETH','wstETH','weETH','JitoSOL','mSOL','bSOL','LBTC'];

export const DERIVATIVE_TO_BASE: Record<DerivativeAsset, 'ETH' | 'SOL' | 'BTC'> = {
  stETH: 'ETH', wstETH: 'ETH', weETH: 'ETH',
  JitoSOL: 'SOL', mSOL: 'SOL', bSOL: 'SOL',
  LBTC: 'BTC',
};

// Deterministic synthetic price-parity oscillators (amplitude in % deviation).
// Some derivatives (weETH, JitoSOL) intentionally cross the 1% line during certain ticks
// to surface the alert UX during normal operation.
const DEPEG_OSCILLATORS: Record<DerivativeAsset, { amp: number; phase: number; freq: number }> = {
  stETH:   { amp: 0.004, phase: 0.7, freq: 0.6 },
  wstETH:  { amp: 0.005, phase: 1.3, freq: 0.55 },
  weETH:   { amp: 0.014, phase: 0.4, freq: 0.42 },   // can spike past 1.0%
  JitoSOL: { amp: 0.013, phase: 2.1, freq: 0.48 },   // can spike past 1.0%
  mSOL:    { amp: 0.006, phase: 1.8, freq: 0.62 },
  bSOL:    { amp: 0.008, phase: 0.9, freq: 0.5 },
  LBTC:    { amp: 0.007, phase: 2.5, freq: 0.45 },
};

export type PegSeverity = 'healthy' | 'critical';

export interface PegStatus {
  asset: DerivativeAsset;
  base: 'ETH' | 'SOL' | 'BTC';
  ratio: number;          // e.g. 0.9912, 1.0034
  deviationPct: number;   // signed %
  severity: PegSeverity;
}

export function isDerivative(label: string): label is DerivativeAsset {
  return (DERIVATIVE_ASSETS as string[]).includes(label);
}

export function getPegStatus(asset: DerivativeAsset, tick = 0): PegStatus {
  const cfg = DEPEG_OSCILLATORS[asset];
  const ratio = 1 + cfg.amp * Math.sin(tick * cfg.freq + cfg.phase);
  const deviationPct = (ratio - 1) * 100;
  const severity: PegSeverity = Math.abs(deviationPct) > 1.0 ? 'critical' : 'healthy';
  return { asset, base: DERIVATIVE_TO_BASE[asset], ratio, deviationPct, severity };
}

/** Returns every derivative asset in the hop chain that is currently depegged > 1%. */
export function detectRouteDepegs(hops: RouteHop[], tick = 0): PegStatus[] {
  const seen = new Set<string>();
  const out: PegStatus[] = [];
  for (const h of hops) {
    if (h.kind !== 'asset') continue;
    if (!isDerivative(h.label)) continue;
    if (seen.has(h.label)) continue;
    seen.add(h.label);
    const s = getPegStatus(h.label, tick);
    if (s.severity === 'critical') out.push(s);
  }
  return out;
}

/** Map a planner sub-allocation apyKey to the derivative asset it ultimately holds (if any). */
export const PLANNER_APYKEY_TO_DERIVATIVE: Partial<Record<PlannerSubAllocation['apyKey'], DerivativeAsset>> = {
  btcStake: 'LBTC',
  btcLst:   'LBTC',
  ethStake: 'stETH',
  ethL2:    'wstETH',
  solStake: 'JitoSOL',
  solLp:    'JitoSOL',
};

export function depegAlertMessage(lang: 'en' | 'sk', peg: PegStatus): string {
  const abs = Math.abs(peg.deviationPct).toFixed(2);
  return lang === 'sk'
    ? `🚨 KRITICKÝ DEPEG ALERT: ${peg.asset} odchýlka ${abs}% od ${peg.base}! Vysoké riziko likvidácie v aktívnych Layer 3 lending / liquidity pooloch. Mimoriadnu opatrnosť.`
    : `🚨 CRITICAL DEPEG ALERT: ${peg.asset} discount ${abs}% vs ${peg.base}! High liquidation risk detected in active Layer 3 lending/liquidity pools. Exercise extreme caution.`;
}

// ============= Dynamic Target-Driven Routing + Suitability Engine =============
// Law of Maximum Efficiency: prefer the single best risk-adjusted protocol as a
// 100% single-step path (no fragmentation). Dynamically omit any unsafe layer.
// If every layer is unsafe → return a 100% Secure HODL fallback route.

export interface BestTargetRoute {
  route: RecommendedRoute;
  globalDeployPct: number;
  bufferPct: number;
  capitalRecommendation: string;
  /** True when no live protocol layer passes the safety guard — UI must lock entry. */
  hodlFallback: boolean;
  /** Human-readable reasons that explain why layers were omitted. */
  omittedReasons: string[];
}

const HODL_WALLET_URL: Record<YieldAsset, string> = {
  BTC: 'bitcoin.org', cbBTC: 'bitcoin.org', WBTC: 'bitcoin.org', LBTC: 'bitcoin.org',
  ETH: 'ethereum.org', stETH: 'ethereum.org', wstETH: 'ethereum.org', weETH: 'ethereum.org',
  SOL: 'solana.com', JitoSOL: 'solana.com', mSOL: 'solana.com', bSOL: 'solana.com',
};

const HODL_NATIVE_NETWORK: Record<YieldAsset, YieldNetwork> = {
  BTC: 'Ethereum', cbBTC: 'Base', WBTC: 'Ethereum', LBTC: 'Ethereum',
  ETH: 'Ethereum', stETH: 'Ethereum', wstETH: 'Ethereum', weETH: 'Ethereum',
  SOL: 'Solana', JitoSOL: 'Solana', mSOL: 'Solana', bSOL: 'Solana',
};

interface ScoredProtocol {
  proto: YieldProtocol;
  apy: number;
  risk: RiskAssessment;
  score: number; // risk-adjusted yield
}

function isProtocolSafeNow(p: YieldProtocol, tick: number): { safe: boolean; reason?: string } {
  if (p.health === 'security_risk') return { safe: false, reason: `${p.name}: exploit mitigation` };
  if (p.health === 'paused')        return { safe: false, reason: `${p.name}: paused` };
  if (p.health === 'degraded')      return { safe: false, reason: `${p.name}: operator turbulence` };
  if (p.health === 'congested')     return { safe: false, reason: `${p.name}: network congestion` };
  if (p.tvlUsdM < 100 || p.auditedYears < 1) return { safe: false, reason: `${p.name}: insufficient audit/TVL` };
  if (p.outputToken && isDerivative(p.outputToken)) {
    const peg = getPegStatus(p.outputToken as DerivativeAsset, tick);
    if (peg.severity === 'critical') return { safe: false, reason: `${p.outputToken}: depeg ${peg.deviationPct.toFixed(2)}%` };
  }
  return { safe: true };
}

function buildSingleProtocolRoute(
  asset: YieldAsset,
  scored: ScoredProtocol,
  network: YieldNetwork,
): RecommendedRoute {
  const { proto, apy, risk } = scored;
  const step: RouteStep = {
    pct: 100,
    protocolId: proto.id,
    protocolName: proto.name,
    officialUrl: proto.officialUrl,
    apy,
    layer: proto.layer,
  };
  const emoji = proto.layer === 2 ? '🛡️' : proto.layer === 3 ? '💰' : '⚡';
  const hops: RouteHop[] = [
    { kind: 'asset', label: asset },
    { kind: 'protocol', label: `${emoji} 100% · ${proto.name}`, sublabel: proto.category, officialUrl: proto.officialUrl },
  ];
  if (proto.outputToken) hops.push({ kind: 'asset', label: proto.outputToken });

  return {
    tier: risk.level === 'low' ? 'conservative' : risk.level === 'medium' ? 'balanced' : 'aggressive',
    emoji,
    title: { en: `Single-protocol · ${proto.name}`, sk: `Jediný protokol · ${proto.name}` },
    network,
    steps: [step],
    blendedApy: apy,
    hops,
    risk,
    multiHop: false,
  };
}

function buildHodlFallbackRoute(asset: YieldAsset, network: YieldNetwork, lang: 'en' | 'sk'): RecommendedRoute {
  const url = HODL_WALLET_URL[asset];
  const step: RouteStep = {
    pct: 100,
    protocolId: 'hodl',
    protocolName: 'Secure HODL (Cold Storage)',
    officialUrl: url,
    apy: 0,
    layer: 1,
  };
  const hops: RouteHop[] = [
    { kind: 'asset', label: asset },
    { kind: 'protocol', label: '🛡️ 100% · HODL', sublabel: lang === 'sk' ? 'Studená peňaženka' : 'Cold storage', officialUrl: url },
  ];
  const risk: RiskAssessment = {
    score: 1,
    level: 'low',
    vectors: { smartContract: 'N/A', depeg: 'N/A', lockup: 'Low' },
    verdict: (lang === 'sk' ? VERDICTS_SK : VERDICTS_EN).low,
  };
  return {
    tier: 'conservative',
    emoji: '🛡️',
    title: { en: '100% Secure HODL', sk: '100% Bezpečný HODL' },
    network,
    steps: [step],
    blendedApy: 0,
    hops,
    risk,
    multiHop: false,
  };
}

export function getBestTargetRoute(
  asset: YieldAsset,
  strategy: Strategy,
  tick = 0,
  lang: 'en' | 'sk' = 'en',
  network?: YieldNetwork,
): BestTargetRoute | null {
  const targetNetwork = network ?? HODL_NATIVE_NETWORK[asset];
  const omittedReasons: string[] = [];

  // Match candidates by asset / network / strategy
  const candidates = PROTOCOLS.filter(p =>
    p.inputs.includes(asset) &&
    p.networks.includes(targetNetwork) &&
    p.strategies.includes(strategy)
  );

  // Dynamic Layer Omission
  const safeCandidates: YieldProtocol[] = [];
  for (const p of candidates) {
    const check = isProtocolSafeNow(p, tick);
    if (check.safe) safeCandidates.push(p);
    else if (check.reason) omittedReasons.push(check.reason);
  }

  // HODL Safety Guard fallback
  if (safeCandidates.length === 0) {
    const route = buildHodlFallbackRoute(asset, targetNetwork, lang);
    return {
      route,
      globalDeployPct: 0,
      bufferPct: 100,
      capitalRecommendation: lang === 'sk'
        ? '🛑 Všetky výnosové vrstvy sú momentálne rizikové. Odporúčame 100% kapitálu v bezpečnom HODL (studená peňaženka / natívne držanie).'
        : '🛑 All active yield layers are currently sub-optimal or dangerous. Recommend 100% capital to Secure HODL (cold storage / native wallet).',
      hodlFallback: true,
      omittedReasons,
    };
  }

  // Score by risk-adjusted yield: apy * (11 - riskScore) / 10
  const scored: ScoredProtocol[] = safeCandidates.map((proto, idx) => {
    const apy = jitter(proto.baseApy, tick, idx + 1000);
    const involvesLst = !!proto.outputToken && LST_LIKE.has(proto.outputToken);
    const risk = assessRisk({
      tvlUsdM: proto.tvlUsdM,
      auditedYears: proto.auditedYears,
      layer: proto.layer,
      strategy,
      unbondingDays: proto.unbondingDays,
      isolatedMarkets: proto.isolatedMarkets,
      hopsCount: 2,
      involvesLst,
    }, lang);
    const score = apy * (11 - risk.score) / 10;
    return { proto, apy, risk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];

  // Single-protocol full-capital route (no unnecessary fragmentation)
  const route = buildSingleProtocolRoute(asset, winner, targetNetwork);

  const globalDeployPct =
    route.risk.level === 'low' ? 100 :
    route.risk.level === 'medium' ? 80 :
    60;
  const bufferPct = 100 - globalDeployPct;

  const capitalRecommendation = lang === 'sk'
    ? `Nasadiť ${globalDeployPct}% objemu cez ${winner.proto.name} | Ponechať ${bufferPct}% v bezpečnom HODL bufferi`
    : `Deploy ${globalDeployPct}% via ${winner.proto.name} | Keep ${bufferPct}% in secure HODL buffer`;

  return { route, globalDeployPct, bufferPct, capitalRecommendation, hodlFallback: false, omittedReasons };
}

export type SuitabilityLevel = 'opportune' | 'caution' | 'critical';

export interface SuitabilityVerdict {
  level: SuitabilityLevel;
  emoji: string;
  title: string;
  text: string;
  reasons: string[];
}

const SUITABILITY_COPY = {
  en: {
    opportune: {
      title: '🟢 SUITABILITY VERDICT: MARKET ENTRY OPTIMAL',
      text: 'Baseline contract health is excellent and network parameters favor execution now.\n\n---\n\n🤔 PREČO ÁNO (Vhodné pre laika): Trh je momentálne pokojný, poplatky za zápis sú nízke a hodnota staknutých tokenov presne kopíruje skutočnú mincu (1:1). Systém funguje hladko, takže tvoj vklad hneď od prvého dňa zarába plný čistý výnos bez skrytých poplatkov.',
    },
    caution: {
      title: '⚠️ SUITABILITY VERDICT: PROCEED WITH CAUTION',
      text: 'Conditions are sub-optimal. Minor temporal locks or gas overhead may dilute initial capital efficiency.\n\n---\n\n🤔 PREČO SI DAŤ POZOR (Prečo radšej počkať): Podmienky nie sú ideálne. Buď sú na sieti príliš vysoké poplatky (vklad by ťa stál viac, než hneď zarobíš), alebo sú peniaze v protokole na nejaký čas zamknuté a nemohol by si ich v prípade núdze okamžite vybrať. Ak vkladáš malú sumu, poplatky ti môžu zožrať zisk.',
    },
    critical: {
      title: '🚨 CRITICAL WARNING: DO NOT ENTER STRATEGY NOW',
      text: 'Extreme risk vectors detected (composability threats, asset peg instability, or cascading liquidation risks). It is highly recommended to KEEP CAPITAL IN SECURE HODL until market stabilizers trigger.\n\n---\n\n🤔 PREČO SEM TERAZ NEDÁVAŤ PENIAZE (Kritické riziko): STOP! V systéme momentálne prebieha búrka. Staknutý token (napr. JitoSOL alebo weETH) stráca svoju stabilitu a jeho cena padá oproti skutočnej minci. Ak by si sem teraz vložil peniaze, hrozí, že o ne kvôli trhovému výkyvu alebo technickej chybe prídeš. Bezpečne vyčkajte v čistom HODL (držaní na peňaženke).',
    },
  },
  sk: {
    opportune: {
      title: '🟢 VERDIKT VHODNOSTI: VSTUP NA TRH OPTIMÁLNY',
      text: 'Základné zdravie kontraktov je vynikajúce a sieťové parametre podporujú okamžitú exekúciu.\n\n---\n\n🤔 PREČO ÁNO (Vhodné pre laika): Trh je momentálne pokojný, poplatky za zápis sú nízke a hodnota staknutých tokenov presne kopíruje skutočnú mincu (1:1). Systém funguje hladko, takže tvoj vklad hneď od prvého dňa zarába plný čistý výnos bez skrytých poplatkov.',
    },
    caution: {
      title: '⚠️ VERDIKT VHODNOSTI: POSTUPUJ S OPATRNOSŤOU',
      text: 'Podmienky sú sub-optimálne. Drobné časové zámky alebo gas náklady môžu znížiť počiatočnú kapitálovú efektivitu.\n\n---\n\n🤔 PREČO SI DAŤ POZOR (Prečo radšej počkať): Podmienky nie sú ideálne. Buď sú na sieti príliš vysoké poplatky (vklad by ťa stál viac, než hneď zarobíš), alebo sú peniaze v protokole na nejaký čas zamknuté a nemohol by si ich v prípade núdze okamžite vybrať. Ak vkladáš malú sumu, poplatky ti môžu zožrať zisk.',
    },
    critical: {
      title: '🚨 KRITICKÉ VAROVANIE: NEVSTUPUJ DO STRATÉGIE TERAZ',
      text: 'Detekované extrémne rizikové vektory (kompozičné hrozby, nestabilita pegov, kaskádové likvidácie). Dôrazne odporúčame PONECHAŤ KAPITÁL V BEZPEČNOM HODL kým sa trh stabilizuje.\n\n---\n\n🤔 PREČO SEM TERAZ NEDÁVAŤ PENIAZE (Kritické riziko): STOP! V systéme momentálne prebieha búrka. Staknutý token (napr. JitoSOL alebo weETH) stráca svoju stabilitu a jeho cena padá oproti skutočnej minci. Ak by si sem teraz vložil peniaze, hrozí, že o ne kvôli trhovému výkyvu alebo technickej chybe prídeš. Bezpečne vyčkajte v čistom HODL (držaní na peňaženke).',
    },
  },
};


export function evaluateSuitability(args: {
  route: RecommendedRoute;
  network: YieldNetwork;
  depositUsd: number;
  tick?: number;
  lang?: 'en' | 'sk';
}): SuitabilityVerdict {
  const { route, network, depositUsd, tick = 0, lang = 'en' } = args;
  const reasons: string[] = [];

  const depegs = detectRouteDepegs(route.hops, tick);
  const gas = evaluateGasGuard({ network, depositUsd, multiHop: route.multiHop, lang });

  const congested = route.steps.some(s => {
    const p = PROTOCOLS.find(x => x.id === s.protocolId);
    return p?.health === 'congested' || p?.health === 'degraded';
  });
  const exploited = route.steps.some(s => {
    const p = PROTOCOLS.find(x => x.id === s.protocolId);
    return p?.health === 'security_risk' || p?.health === 'paused';
  });

  let level: SuitabilityLevel = 'opportune';
  if (depegs.length > 0 || exploited || route.risk.level === 'high') {
    level = 'critical';
    if (depegs.length) reasons.push(lang === 'sk' ? `Depeg ${depegs.map(d => d.asset).join(', ')}` : `Depeg on ${depegs.map(d => d.asset).join(', ')}`);
    if (exploited) reasons.push(lang === 'sk' ? 'Aktívne exploit mitigácie' : 'Active exploit mitigations');
    if (route.risk.level === 'high') reasons.push(lang === 'sk' ? 'Vysoké kompozičné riziko' : 'High composability risk');
  } else if (gas || congested || route.risk.level === 'medium') {
    level = 'caution';
    if (gas) reasons.push(lang === 'sk' ? 'Gas overhead na Mainnete' : 'Mainnet gas overhead');
    if (congested) reasons.push(lang === 'sk' ? 'Zvýšená utilizácia siete' : 'Elevated network utilization');
    if (route.risk.level === 'medium') reasons.push(lang === 'sk' ? 'Stredné smart-contract riziko' : 'Medium smart-contract risk');
  }

  const copy = SUITABILITY_COPY[lang][level];
  return {
    level,
    emoji: level === 'opportune' ? '🟢' : level === 'caution' ? '🟡' : '🛑',
    title: copy.title,
    text: copy.text,
    reasons,
  };
}


