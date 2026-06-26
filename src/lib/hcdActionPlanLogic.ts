import type { ArbitrumProtocolQuote, ArbitrumRoutingSnapshot } from '@/lib/arbitrumProtocolRouting';
import {
  getHcdLtvMax,
  type HcdIndicators,
  type HcdLayerTarget,
} from '@/lib/hcdArchitecture';
import { EXIT_ALCHEMIX_APY_FLOOR } from '@/lib/hcdExitStrategy';
import type { StakedEntry } from '@/lib/stakingLedger';

/** Fallback caps when live Morpho/Aave feeds are unavailable. */
const FALLBACK_AAVE_QUOTE: ArbitrumProtocolQuote = {
  id: 'aave',
  name: 'Aave V3',
  sourceUrl: 'https://app.aave.com/?marketName=proto_arbitrum_v3',
  collateralToken: 'wstETH',
  collateralAddress: '0x5979D7b546E38E414F7E9822514be443A4800529',
  loanSymbol: 'USDC',
  usdcBorrowApyPct: 5.5,
  maxCollateralLtvPct: 75,
};

const FALLBACK_MORPHO_QUOTE: ArbitrumProtocolQuote = {
  id: 'morpho',
  name: 'Morpho',
  sourceUrl: 'https://app.morpho.org/vaults?chains=42161',
  collateralToken: 'wETH',
  collateralAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  loanSymbol: 'USDC',
  usdcBorrowApyPct: 5.0,
  maxCollateralLtvPct: 86,
};

export type ArbitrumTacticalWinner = ArbitrumProtocolQuote & { network: 'Arbitrum' };

export interface ActionPlanLtvCaps {
  targetLtvPct: number;
  maxLtvPct: number;
}

export interface EthLayerPlanState {
  effectiveLayers: HcdLayerTarget[];
  alchemixLocked: boolean;
  alchemixRedirectedPct: number;
  bullish: boolean;
  arbitrumWinner: ArbitrumTacticalWinner;
  arbitrumRouting: ArbitrumRoutingSnapshot | null;
}

/** Temperament-aware LTV caps for Action Plan math (50% → target 30%, max 33%). */
export function getActionPlanLtvCaps(
  indicators: HcdIndicators,
  temperamentPct = 50,
): ActionPlanLtvCaps {
  const targetLtvPct = indicators?.targetLtvPct ?? 30;
  const maxLtvPct = getHcdLtvMax(indicators, temperamentPct);
  return { targetLtvPct, maxLtvPct };
}

function scoreArbitrumOption(borrowApyPct: number, maxLtvPct: number): number {
  // Lower USDC borrow APY wins; tie-break with higher collateral LTV.
  return -borrowApyPct + maxLtvPct / 100;
}

function toWinner(quote: ArbitrumProtocolQuote): ArbitrumTacticalWinner {
  return { ...quote, network: 'Arbitrum' };
}

function resolveArbitrumQuotes(snapshot?: ArbitrumRoutingSnapshot | null): {
  aave: ArbitrumProtocolQuote;
  morpho: ArbitrumProtocolQuote;
} {
  return {
    aave: snapshot?.aave ?? FALLBACK_AAVE_QUOTE,
    morpho: snapshot?.morpho ?? FALLBACK_MORPHO_QUOTE,
  };
}

/** Pick Aave V3 vs Morpho on Arbitrum — lowest USDC borrow APY, tie-break higher collateral LTV. */
export function selectArbitrumTacticalWinner(
  routing?: ArbitrumRoutingSnapshot | null,
): ArbitrumTacticalWinner {
  const { aave, morpho } = resolveArbitrumQuotes(routing);
  const aaveScore = scoreArbitrumOption(aave.usdcBorrowApyPct, aave.maxCollateralLtvPct);
  const morphoScore = scoreArbitrumOption(morpho.usdcBorrowApyPct, morpho.maxCollateralLtvPct);
  return toWinner(morphoScore >= aaveScore ? morpho : aave);
}

export function formatArbitrumPlanInstruction(
  winner: ArbitrumTacticalWinner,
  sk: boolean,
  routing?: ArbitrumRoutingSnapshot | null,
): string {
  const { aave, morpho } = resolveArbitrumQuotes(routing);
  const loser = winner.id === 'morpho' ? aave : morpho;
  const routeLine = sk
    ? `Presun: ETH -> ${winner.collateralToken} | Protokol: ${winner.name} (Arbitrum) | Borrow: USDC`
    : `Route: ETH -> ${winner.collateralToken} | Protocol: ${winner.name} (Arbitrum) | Borrow: USDC`;
  const compareLine = sk
    ? `Porovnanie: ${winner.name} ${winner.usdcBorrowApyPct.toFixed(2)}% / LTV ${winner.maxCollateralLtvPct}% vs ${loser.name} ${loser.usdcBorrowApyPct.toFixed(2)}% / LTV ${loser.maxCollateralLtvPct}%`
    : `Compare: ${winner.name} ${winner.usdcBorrowApyPct.toFixed(2)}% / LTV ${winner.maxCollateralLtvPct}% vs ${loser.name} ${loser.usdcBorrowApyPct.toFixed(2)}% / LTV ${loser.maxCollateralLtvPct}%`;
  return `${routeLine} · ${compareLine}`;
}

export function isAlchemixLayerUnsuitable(
  alchemixApyPct: number,
  indicators: HcdIndicators,
  fearGreed: number | null | undefined,
  marketScore?: number,
): boolean {
  if (!Number.isFinite(alchemixApyPct) || alchemixApyPct < EXIT_ALCHEMIX_APY_FLOOR) return true;
  if (indicators?.volatilityRegime === 'high' || indicators?.borrowWarning) return true;
  if (fearGreed != null && fearGreed < 30) return true;
  if (marketScore != null && marketScore > 70) return true;
  return false;
}

export function isMarketBullish(
  fearGreed: number | null | undefined,
  marketScore: number,
): boolean {
  if (fearGreed != null && fearGreed > 55) return true;
  if (marketScore <= 40) return true;
  return false;
}

/** Redirect Layer 4 allocation into Layers 2 and 3 when Alchemix is unsuitable. */
export function applyAlchemixFallbackToLayers(
  layers: HcdLayerTarget[],
  alchemixPct: number,
  bullish: boolean,
): HcdLayerTarget[] {
  const redirect = Math.max(0, alchemixPct ?? 0);
  if (redirect <= 0) return layers;

  const coreShare = bullish ? 0.35 : 0.65;
  const tacticalShare = bullish ? 0.65 : 0.35;

  return (layers ?? []).map(layer => {
    const id = layer?.id ?? '';
    if (id.includes('alchemix')) {
      return { ...layer, pctTarget: 0 };
    }
    if (id.includes('core')) {
      return { ...layer, pctTarget: (layer.pctTarget ?? 0) + redirect * coreShare };
    }
    if (id.includes('tactical')) {
      return { ...layer, pctTarget: (layer.pctTarget ?? 0) + redirect * tacticalShare };
    }
    return layer;
  });
}

export function buildEthLayerPlanState(input: {
  layers: HcdLayerTarget[];
  alchemixApyPct: number;
  indicators: HcdIndicators;
  fearGreed: number | null | undefined;
  marketScore: number;
  arbitrumRouting?: ArbitrumRoutingSnapshot | null;
}): EthLayerPlanState {
  const layers = input.layers ?? [];
  const alchemixLayer = layers.find(l => l?.id?.includes('alchemix'));
  const alchemixPct = alchemixLayer?.pctTarget ?? 0;
  const bullish = isMarketBullish(input.fearGreed, input.marketScore);
  const alchemixLocked = isAlchemixLayerUnsuitable(
    input.alchemixApyPct,
    input.indicators,
    input.fearGreed,
    input.marketScore,
  );

  const effectiveLayers = alchemixLocked
    ? applyAlchemixFallbackToLayers(layers, alchemixPct, bullish)
    : layers;

  const arbitrumWinner = selectArbitrumTacticalWinner(input.arbitrumRouting);

  return {
    effectiveLayers,
    alchemixLocked,
    alchemixRedirectedPct: alchemixLocked ? alchemixPct : 0,
    bullish,
    arbitrumWinner,
    arbitrumRouting: input.arbitrumRouting ?? null,
  };
}

export function computeDeployedCoreQty(
  entries: StakedEntry[] | null | undefined,
  symbol: 'ETH' | 'SOL',
): number {
  const list = entries ?? [];
  if (symbol === 'ETH') {
    return list
      .filter(e => /rocket|rETH/i.test(e?.protocol ?? '') && !/aave|morpho|alchemix/i.test(e?.protocol ?? ''))
      .reduce((s, e) => s + (e?.amount ?? 0), 0);
  }
  return list
    .filter(e => /marinade|mSOL/i.test(e?.protocol ?? '') && !/kamino/i.test(e?.protocol ?? ''))
    .reduce((s, e) => s + (e?.amount ?? 0), 0);
}

export function computeDeployedAlchemixQty(entries: StakedEntry[] | null | undefined): number {
  return (entries ?? [])
    .filter(e => /alchemix/i.test(e?.protocol ?? ''))
    .reduce((s, e) => s + safeQty(e?.amount), 0);
}

export function computeDeltaQty(targetQty: number, deployedQty: number): number {
  const delta = (targetQty ?? 0) - (deployedQty ?? 0);
  if (!Number.isFinite(delta)) return 0;
  return Math.max(0, delta);
}

export function tacticalBorrowAtTargetLtv(
  collateralQty: number,
  price: number,
  targetLtvPct: number,
): number {
  const qty = collateralQty ?? 0;
  const px = price ?? 0;
  const ltv = targetLtvPct ?? 0;
  return qty * px * (ltv / 100);
}

export const ALCHEMIX_FALLBACK_PLAN_SK =
  'Nevhodné podmienky pre Alchemix. Kapitál presmerovaný do Vrstvy 2 a 3.';
export const ALCHEMIX_FALLBACK_PLAN_EN =
  'Unsuitable conditions for Alchemix. Capital redirected to Layers 2 and 3.';

/** Hybrid gas buffer — 2 % of balance with a hard native-token cap. */
export const GAS_BUFFER_PERCENT = 0.02;
export const MAX_GAS_CAP_ETH = 0.015;
export const MAX_GAS_CAP_SOL = 0.05;

export interface GasBufferResult {
  totalQty: number;
  bufferQty: number;
  availableQty: number;
}

function safeQty(value: number | null | undefined): number {
  const n = value ?? 0;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Reserve native token for fees; never allocate 100 % of wallet balance. */
export function computeGasBuffer(
  symbol: 'ETH' | 'SOL',
  totalBalance: number | null | undefined,
): GasBufferResult {
  const totalQty = safeQty(totalBalance);
  const maxCap = symbol === 'ETH' ? MAX_GAS_CAP_ETH : MAX_GAS_CAP_SOL;
  const bufferQty = Math.min(totalQty * GAS_BUFFER_PERCENT, maxCap);
  const availableQty = Math.max(0, totalQty - bufferQty);
  return { totalQty, bufferQty, availableQty };
}

/** Layer target qty from gas-buffered available balance and HCD layer %. */
export function layerTargetQty(
  availableQty: number | null | undefined,
  layerPct: number | null | undefined,
): number {
  const avail = safeQty(availableQty);
  const pct = layerPct ?? 0;
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return avail * (pct / 100);
}

/** Scale copy deltas so proposed deposits never exceed available native balance. */
export function capCopyDeltasToAvailable(
  deltas: number[],
  availableQty: number | null | undefined,
): number[] {
  const safeDeltas = (deltas ?? []).map(d => (Number.isFinite(d) ? Math.max(0, d) : 0));
  const sum = safeDeltas.reduce((s, d) => s + d, 0);
  const avail = safeQty(availableQty);
  if (sum <= avail || sum <= 0) return safeDeltas;
  const scale = avail / sum;
  return safeDeltas.map(d => d * scale);
}
