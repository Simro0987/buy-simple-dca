import { Lang } from '@/lib/i18n';

export type HcdSymbol = 'ETH' | 'SOL';
export type VolatilityRegime = 'high' | 'normal' | 'low';
export type GasStress = 'low' | 'normal' | 'high';

export const QUARTERLY_MONTH_INDICES = [2, 5, 8, 11] as const; // Mar, Jun, Sep, Dec

const QUARTERLY_MONTH_NAMES_SK = ['Marec', 'Jún', 'September', 'December'] as const;
const QUARTERLY_MONTH_NAMES_EN = ['March', 'June', 'September', 'December'] as const;

export interface HcdLayerDef {
  id: string;
  layer: number;
  nameSk: string;
  nameEn: string;
  asset: string;
  protocol: string;
  borrow?: string;
  noteSk?: string;
  noteEn?: string;
  pctMin: number;
  pctMax: number;
  ledgerProtocol?: string;
}

export interface HcdLayerTarget extends HcdLayerDef {
  pctTarget: number;
}

export interface HcdIndicators {
  volatilityPct: number;
  volatilityRegime: VolatilityRegime;
  borrowApyPct: number;
  borrowWarning: boolean;
  targetLtvPct: number;
  gasStress: GasStress;
  gasLayerPct: number;
}

export interface QuarterlyRebalanceStatus {
  unlocked: boolean;
  inQuarterlyMonth: boolean;
  currentMonthLabel: string;
  nextOpeningLabel: string;
  nextOpeningMonthIndex: number;
}

export const ETH_LAYERS: HcdLayerDef[] = [
  {
    id: 'eth-gas',
    layer: 1,
    nameSk: 'Gas + Take Profit',
    nameEn: 'Gas + Take Profit',
    asset: 'ETH',
    protocol: 'Čisté ETH',
    pctMin: 3,
    pctMax: 8,
  },
  {
    id: 'eth-core',
    layer: 2,
    nameSk: 'Core Fortress Staking',
    nameEn: 'Core Fortress Staking',
    asset: 'rETH',
    protocol: 'Rocket Pool L1',
    pctMin: 50,
    pctMax: 80,
    ledgerProtocol: 'Rocket Pool (rETH)',
  },
  {
    id: 'eth-tactical',
    layer: 3,
    nameSk: 'Taktický Kolaterál',
    nameEn: 'Tactical Collateral',
    asset: 'rETH',
    protocol: 'Morpho / Aave (Arbitrum)',
    borrow: 'USDC',
    pctMin: 10,
    pctMax: 25,
    ledgerProtocol: 'Aave V3 Lending',
  },
  {
    id: 'eth-alchemix',
    layer: 4,
    nameSk: 'Alchemix Set & Forget',
    nameEn: 'Alchemix Set & Forget',
    asset: 'ETH',
    protocol: 'Alchemix Vault',
    noteSk: 'Bez likvidácie',
    noteEn: 'No liquidation',
    pctMin: 5,
    pctMax: 15,
    ledgerProtocol: 'Alchemix Vault (ETH)',
  },
];

export const SOL_LAYERS: HcdLayerDef[] = [
  {
    id: 'sol-gas',
    layer: 1,
    nameSk: 'Gas + Take Profit',
    nameEn: 'Gas + Take Profit',
    asset: 'SOL',
    protocol: 'Čisté SOL',
    pctMin: 3,
    pctMax: 8,
  },
  {
    id: 'sol-core',
    layer: 2,
    nameSk: 'Core Fortress Staking',
    nameEn: 'Core Fortress Staking',
    asset: 'mSOL',
    protocol: 'Marinade Native',
    pctMin: 60,
    pctMax: 85,
    ledgerProtocol: 'Marinade Native (mSOL)',
  },
  {
    id: 'sol-tactical',
    layer: 3,
    nameSk: 'Taktický Kolaterál',
    nameEn: 'Tactical Collateral',
    asset: 'SOL/JitoSOL',
    protocol: 'Kamino / Project 0',
    borrow: 'USDC',
    pctMin: 10,
    pctMax: 30,
    ledgerProtocol: 'Kamino Autopilot',
  },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

export function getNextQuarterlyMonthIndex(fromMonth: number): number {
  for (const m of QUARTERLY_MONTH_INDICES) {
    if (m >= fromMonth) return m;
  }
  return QUARTERLY_MONTH_INDICES[0];
}

export function getQuarterlyRebalanceStatus(now: Date = new Date(), lang: Lang = 'sk'): QuarterlyRebalanceStatus {
  const monthIdx = now.getMonth();
  const inQuarterlyMonth = QUARTERLY_MONTH_INDICES.includes(monthIdx as typeof QUARTERLY_MONTH_INDICES[number]);
  const names = lang === 'sk' ? QUARTERLY_MONTH_NAMES_SK : QUARTERLY_MONTH_NAMES_EN;
  const nextIdx = getNextQuarterlyMonthIndex(inQuarterlyMonth ? monthIdx : monthIdx + 1);
  const nextNameIdx = QUARTERLY_MONTH_INDICES.indexOf(nextIdx as typeof QUARTERLY_MONTH_INDICES[number]);

  return {
    unlocked: inQuarterlyMonth,
    inQuarterlyMonth,
    currentMonthLabel: names[QUARTERLY_MONTH_INDICES.indexOf(monthIdx as typeof QUARTERLY_MONTH_INDICES[number])] ?? '—',
    nextOpeningLabel: names[nextNameIdx] ?? names[0],
    nextOpeningMonthIndex: nextIdx,
  };
}

export function computeHcdIndicators(input: {
  ethAtr14d?: number | null;
  solAtr14d?: number | null;
  ethVol30d?: number | null;
  solVol30d?: number | null;
  borrowApyPct?: number | null;
  ethGasUsd?: number | null;
  solGasUsd?: number | null;
}): HcdIndicators {
  const ethVol = input.ethAtr14d ?? input.ethVol30d ?? 3;
  const solVol = input.solAtr14d ?? input.solVol30d ?? 4;
  const volatilityPct = Math.max(ethVol, solVol);

  let volatilityRegime: VolatilityRegime = 'normal';
  if (volatilityPct >= 6) volatilityRegime = 'high';
  else if (volatilityPct <= 2.5) volatilityRegime = 'low';

  const borrowApyPct = input.borrowApyPct ?? 0;
  const borrowWarning = borrowApyPct > 8;

  let targetLtvPct = 30;
  if (volatilityRegime === 'high') targetLtvPct = 20;
  else if (volatilityRegime === 'low') targetLtvPct = 40;
  if (borrowWarning) targetLtvPct = Math.min(targetLtvPct, 20);

  const ethGas = input.ethGasUsd ?? 4;
  const solGas = input.solGasUsd ?? 0.01;
  const gasComposite = ethGas + solGas * 100;
  let gasStress: GasStress = 'normal';
  if (gasComposite > 8) gasStress = 'high';
  else if (gasComposite < 3) gasStress = 'low';

  const gasLayerPct = gasStress === 'high' ? 8 : gasStress === 'low' ? 3 : 5.5;

  return {
    volatilityPct,
    volatilityRegime,
    borrowApyPct,
    borrowWarning,
    targetLtvPct,
    gasStress,
    gasLayerPct,
  };
}

function resolveLayerPct(
  layer: HcdLayerDef,
  indicators: HcdIndicators,
  role: 'gas' | 'core' | 'tactical' | 'alchemix',
): number {
  const { volatilityRegime, gasLayerPct } = indicators;

  if (role === 'gas') {
    return clamp(gasLayerPct, layer.pctMin, layer.pctMax);
  }
  if (role === 'core') {
    if (volatilityRegime === 'high') return layer.pctMax;
    if (volatilityRegime === 'low') return lerp(layer.pctMin, layer.pctMax, 0.45);
    return lerp(layer.pctMin, layer.pctMax, 0.65);
  }
  if (role === 'tactical') {
    if (volatilityRegime === 'high') return layer.pctMin;
    if (volatilityRegime === 'low') return layer.pctMax;
    return lerp(layer.pctMin, layer.pctMax, 0.5);
  }
  // alchemix
  if (volatilityRegime === 'high') return layer.pctMin;
  if (volatilityRegime === 'low') return layer.pctMax;
  return lerp(layer.pctMin, layer.pctMax, 0.4);
}

function normalizeLayers(layers: HcdLayerTarget[]): HcdLayerTarget[] {
  const sum = layers.reduce((s, l) => s + l.pctTarget, 0);
  if (sum <= 0) return layers;
  return layers.map(l => ({
    ...l,
    pctTarget: Math.round((l.pctTarget / sum) * 1000) / 10,
  }));
}

export function computeHcdLayerTargets(
  symbol: HcdSymbol,
  indicators: HcdIndicators,
): HcdLayerTarget[] {
  const defs = symbol === 'ETH' ? ETH_LAYERS : SOL_LAYERS;
  const roles: Array<'gas' | 'core' | 'tactical' | 'alchemix'> =
    symbol === 'ETH' ? ['gas', 'core', 'tactical', 'alchemix'] : ['gas', 'core', 'tactical'];

  const raw = defs.map((def, i) => ({
    ...def,
    pctTarget: resolveLayerPct(def, indicators, roles[i]),
  }));

  return normalizeLayers(raw);
}

export function rebalanceLockMessage(lang: Lang, status: QuarterlyRebalanceStatus): string {
  if (status.unlocked) {
    return lang === 'sk'
      ? `Kvartálne rebalančné okno aktívne (${status.currentMonthLabel}).`
      : `Quarterly rebalance window active (${status.currentMonthLabel}).`;
  }
  return lang === 'sk'
    ? `Strategický rebalans uzamknutý. Najbližšie otvorenie: ${status.nextOpeningLabel}`
    : `Strategic rebalance locked. Next opening: ${status.nextOpeningLabel}`;
}
