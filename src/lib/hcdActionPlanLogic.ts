import {
  buildAlchemixCandidate,
  formatAlchemixDecisionReason,
  formatAlchemixPlanInstruction as buildAlchemixPlanText,
  selectBestAlchemixCandidate,
  type AlchemixStrategyCandidate,
} from '@/lib/alchemixCollateralScoring';
import type { AlchemixRoutingSnapshot } from '@/lib/alchemixProtocolRouting';
import { ALCHEMIX_APP_URL } from '@/lib/alchemixProtocolRouting';
import {
  buildCollateralCandidate,
  formatCollateralDecisionReason,
  formatCollateralPlanInstruction,
  selectBestCollateralCandidate,
  type ArbitrumCollateralCandidate,
} from '@/lib/arbitrumCollateralScoring';
import type { ArbitrumRoutingSnapshot } from '@/lib/arbitrumProtocolRouting';
import {
  AAVE_ARBITRUM_MARKET_LABEL,
  AAVE_ARBITRUM_V3_URL,
  ARBITRUM_WEETH,
  ARBITRUM_WSTETH,
  FALLBACK_MORPHO_VAULT_LABEL,
  MORPHO_ARBITRUM_VAULTS_URL,
} from '@/lib/arbitrumProtocolRouting';
import {
  buildKaminoCandidate,
  formatKaminoDecisionReason,
  formatKaminoPlanInstruction as buildKaminoPlanText,
  selectBestKaminoCandidate,
  FALLBACK_KAMINO_VAULT_LABEL,
  type KaminoCollateralCandidate,
} from '@/lib/kaminoCollateralScoring';
import type { KaminoRoutingSnapshot } from '@/lib/kaminoProtocolRouting';
import { KAMINO_VAULTS_URL } from '@/lib/kaminoProtocolRouting';
import {
  getHcdLtvMax,
  type HcdIndicators,
  type HcdLayerTarget,
} from '@/lib/hcdArchitecture';
import { EXIT_ALCHEMIX_APY_FLOOR } from '@/lib/hcdExitStrategy';
import type { StakedEntry } from '@/lib/stakingLedger';

const FALLBACK_WINNER = buildCollateralCandidate({
  protocolId: 'morpho',
  protocolName: 'Morpho',
  sourceUrl: MORPHO_ARBITRUM_VAULTS_URL,
  collateralToken: 'weETH',
  collateralAddress: ARBITRUM_WEETH,
  maxLtvPct: 86,
  supplyApyPct: 2.4,
  baseYieldPct: 4.38,
  usdcBorrowApyPct: 3.3,
  venueLabel: FALLBACK_MORPHO_VAULT_LABEL,
});

const FALLBACK_RUNNER_UP = buildCollateralCandidate({
  protocolId: 'aave',
  protocolName: 'Aave V3',
  sourceUrl: AAVE_ARBITRUM_V3_URL,
  collateralToken: 'wstETH',
  collateralAddress: ARBITRUM_WSTETH,
  maxLtvPct: 75,
  supplyApyPct: 0,
  baseYieldPct: 3.4,
  usdcBorrowApyPct: 5.5,
  venueLabel: AAVE_ARBITRUM_MARKET_LABEL,
});

const FALLBACK_KAMINO_WINNER = buildKaminoCandidate({
  venueKind: 'auto-yield',
  venueLabel: FALLBACK_KAMINO_VAULT_LABEL,
  sourceUrl: KAMINO_VAULTS_URL,
  collateralToken: 'mSOL',
  apyPct: 4.2,
  tvlUsd: 695_000,
  maxLtvPct: 0,
  ilRiskPct: 20,
  usdcBorrowApyPct: 5.8,
});

const FALLBACK_ALCHEMIX_WINNER = buildAlchemixCandidate({
  strategyId: 'transmuter',
  strategyLabel: 'Alchemix ETH Transmuter',
  network: 'Ethereum',
  sourceUrl: ALCHEMIX_APP_URL,
  yieldPct: 2.2,
  ltvPct: 50,
  pegStabilityPct: 92,
});

export type ArbitrumTacticalWinner = ArbitrumCollateralCandidate & {
  network: 'Arbitrum';
  decisionReasonSk: string;
  decisionReasonEn: string;
};

export type KaminoTacticalWinner = KaminoCollateralCandidate & {
  network: 'Solana';
  decisionReasonSk: string;
  decisionReasonEn: string;
};

export type AlchemixTacticalWinner = AlchemixStrategyCandidate & {
  decisionReasonSk: string;
  decisionReasonEn: string;
};

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
  alchemixWinner: AlchemixTacticalWinner;
  alchemixRouting: AlchemixRoutingSnapshot | null;
}

export interface SolLayerPlanState {
  layers: HcdLayerTarget[];
  kaminoWinner: KaminoTacticalWinner;
  kaminoRouting: KaminoRoutingSnapshot | null;
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

function toTacticalWinner(candidate: ArbitrumCollateralCandidate): ArbitrumTacticalWinner {
  return {
    ...candidate,
    network: 'Arbitrum',
    decisionReasonSk: formatCollateralDecisionReason(candidate, true),
    decisionReasonEn: formatCollateralDecisionReason(candidate, false),
  };
}

function toKaminoWinner(candidate: KaminoCollateralCandidate): KaminoTacticalWinner {
  return {
    ...candidate,
    network: 'Solana',
    decisionReasonSk: formatKaminoDecisionReason(candidate, true),
    decisionReasonEn: formatKaminoDecisionReason(candidate, false),
  };
}

function toAlchemixWinner(candidate: AlchemixStrategyCandidate): AlchemixTacticalWinner {
  return {
    ...candidate,
    decisionReasonSk: formatAlchemixDecisionReason(candidate, true),
    decisionReasonEn: formatAlchemixDecisionReason(candidate, false),
  };
}

/** Gas buffer line for Cyborg Action Plan (network-specific SOL/ETH caps). */
export function formatGasBufferPlanLine(
  symbol: 'ETH' | 'SOL',
  totalBalance: number | null | undefined,
  sk: boolean,
): string {
  const { bufferQty, availableQty } = computeGasBuffer(symbol, totalBalance);
  const cap = symbol === 'ETH' ? MAX_GAS_CAP_ETH : MAX_GAS_CAP_SOL;
  const decimals = symbol === 'ETH' ? 4 : 2;
  return sk
    ? `Gas buffer: ${bufferQty.toFixed(decimals)} ${symbol} (2 % · max ${cap}) · k dispozícii ${availableQty.toFixed(decimals)} ${symbol}`
    : `Gas buffer: ${bufferQty.toFixed(decimals)} ${symbol} (2% · max ${cap}) · available ${availableQty.toFixed(decimals)} ${symbol}`;
}

export function selectKaminoTacticalWinner(
  routing?: KaminoRoutingSnapshot | null,
): KaminoTacticalWinner {
  const winner = routing?.winner ?? selectBestKaminoCandidate(routing?.candidates);
  if (winner) return toKaminoWinner(winner);
  return toKaminoWinner(FALLBACK_KAMINO_WINNER);
}

export function selectAlchemixTacticalWinner(
  routing?: AlchemixRoutingSnapshot | null,
): AlchemixTacticalWinner {
  const winner = routing?.winner ?? selectBestAlchemixCandidate(routing?.candidates);
  if (winner) return toAlchemixWinner(winner);
  return toAlchemixWinner(FALLBACK_ALCHEMIX_WINNER);
}

export function formatKaminoPlanInstruction(
  winner: KaminoTacticalWinner,
  sk: boolean,
  routing?: KaminoRoutingSnapshot | null,
  gasBufferLine?: string | null,
): string {
  const extra = gasBufferLine ? [gasBufferLine] : [];
  const primary = buildKaminoPlanText(winner, sk, extra);
  const runnerUp = selectBestKaminoCandidate(
    (routing?.candidates ?? [FALLBACK_KAMINO_WINNER]).filter(
      c => c.venueLabel !== winner.venueLabel || c.collateralToken !== winner.collateralToken,
    ),
  );
  if (!runnerUp) return primary;
  const compareLine = sk
    ? `Porovnanie: ${winner.venueLabel} skóre ${winner.combinedScore.toFixed(1)} vs ${runnerUp.venueLabel} ${runnerUp.combinedScore.toFixed(1)}`
    : `Compare: ${winner.venueLabel} score ${winner.combinedScore.toFixed(1)} vs ${runnerUp.venueLabel} ${runnerUp.combinedScore.toFixed(1)}`;
  return `${primary}\n${compareLine}`;
}

export function formatAlchemixPlanInstruction(
  winner: AlchemixTacticalWinner,
  sk: boolean,
  gasBufferLine?: string | null,
): string {
  const extra = gasBufferLine ? [gasBufferLine] : [];
  return buildAlchemixPlanText(winner, sk, extra);
}

/** Pick best (token + protocol) from scored Arbitrum routing snapshot. */
export function selectArbitrumTacticalWinner(
  routing?: ArbitrumRoutingSnapshot | null,
): ArbitrumTacticalWinner {
  const winner = routing?.winner ?? selectBestCollateralCandidate(routing?.candidates);
  if (winner) return toTacticalWinner(winner);
  return toTacticalWinner(FALLBACK_WINNER);
}

export function formatArbitrumPlanInstruction(
  winner: ArbitrumTacticalWinner,
  sk: boolean,
  routing?: ArbitrumRoutingSnapshot | null,
): string {
  const primary = formatCollateralPlanInstruction(winner, sk);
  const runnerUp = selectBestCollateralCandidate(
    (routing?.candidates ?? [FALLBACK_WINNER, FALLBACK_RUNNER_UP]).filter(
      c => !(c.protocolId === winner.protocolId && c.collateralToken === winner.collateralToken),
    ),
  );
  if (!runnerUp) return primary;

  const compareLine = sk
    ? `Porovnanie: ${winner.collateralToken}/${winner.protocolName} skóre ${winner.combinedScore.toFixed(1)} (LTV ${winner.maxLtvPct}%) vs ${runnerUp.collateralToken}/${runnerUp.protocolName} ${runnerUp.combinedScore.toFixed(1)} (LTV ${runnerUp.maxLtvPct}%)`
    : `Compare: ${winner.collateralToken}/${winner.protocolName} score ${winner.combinedScore.toFixed(1)} (LTV ${winner.maxLtvPct}%) vs ${runnerUp.collateralToken}/${runnerUp.protocolName} ${runnerUp.combinedScore.toFixed(1)} (LTV ${runnerUp.maxLtvPct}%)`;
  return `${primary}\n${compareLine}`;
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
  alchemixRouting?: AlchemixRoutingSnapshot | null;
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
  const alchemixWinner = selectAlchemixTacticalWinner(input.alchemixRouting);

  return {
    effectiveLayers,
    alchemixLocked,
    alchemixRedirectedPct: alchemixLocked ? alchemixPct : 0,
    bullish,
    arbitrumWinner,
    arbitrumRouting: input.arbitrumRouting ?? null,
    alchemixWinner,
    alchemixRouting: input.alchemixRouting ?? null,
  };
}

export function buildSolLayerPlanState(input: {
  layers: HcdLayerTarget[];
  kaminoRouting?: KaminoRoutingSnapshot | null;
}): SolLayerPlanState {
  const layers = input.layers ?? [];
  const kaminoWinner = selectKaminoTacticalWinner(input.kaminoRouting);
  return {
    layers,
    kaminoWinner,
    kaminoRouting: input.kaminoRouting ?? null,
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

export interface CapitalFunnelResult {
  availableQty: number;
  takeProfitPercent: number;
  profitUsd: number;
  takeProfitTargetUsdc: number;
  workingCapitalQty: number;
  hasEarnedProfit: boolean;
}

export interface SymbolProfitSnapshot {
  profitUsd: number;
  hasCostBasis: boolean;
  principalUsd: number;
}

/** Resolve earned profit (USD) for ETH/SOL — principal protected when no cost basis exists. */
export function resolveSymbolEarnedProfit(input: {
  metricsAsset?: { invested?: number; value?: number; pnl?: number } | null;
}): SymbolProfitSnapshot {
  const invested = input.metricsAsset?.invested ?? 0;
  const value = input.metricsAsset?.value ?? 0;
  const hasCostBasis = Number.isFinite(invested) && invested > 0;
  if (!hasCostBasis) {
    return { profitUsd: 0, hasCostBasis: false, principalUsd: 0 };
  }
  const rawPnl = input.metricsAsset?.pnl;
  const profitUsd = Math.max(
    0,
    Number.isFinite(rawPnl) ? (rawPnl ?? 0) : (value - invested),
  );
  return { profitUsd, hasCostBasis: true, principalUsd: invested };
}

/** Dynamic Take Profit % — conservative temperament secures more profit as USDC. */
export function computeTakeProfitPercent(temperamentPct: number | null | undefined): number {
  const t = safeQty(temperamentPct);
  if (t > 70) return 0.05;
  if (t >= 30) return 0.10;
  return 0.20;
}

/** Gas-buffered available balance + profit-only Take Profit; working capital stays full available. */
export function computeCapitalFunnel(
  availableQty: number | null | undefined,
  temperamentPct: number | null | undefined,
  profitUsd: number | null | undefined,
): CapitalFunnelResult {
  const avail = safeQty(availableQty);
  const profit = Math.max(0, profitUsd ?? 0);
  const takeProfitPercent = computeTakeProfitPercent(temperamentPct);
  const takeProfitTargetUsdc = profit > 0 ? profit * takeProfitPercent : 0;
  return {
    availableQty: avail,
    takeProfitPercent,
    profitUsd: profit,
    takeProfitTargetUsdc,
    workingCapitalQty: avail,
    hasEarnedProfit: profit > 0 && takeProfitTargetUsdc > 0,
  };
}

export interface TakeProfitUsdcDelta {
  targetUsdc: number;
  deltaUsdc: number;
  targetMet: boolean;
}

export function computeTakeProfitUsdcDelta(
  takeProfitTargetUsdc: number | null | undefined,
  currentUsdcBalance: number | null | undefined,
): TakeProfitUsdcDelta {
  const targetUsdc = safeQty(takeProfitTargetUsdc);
  const currentUsdc = safeQty(currentUsdcBalance);
  if (targetUsdc <= 0) {
    return { targetUsdc: 0, deltaUsdc: 0, targetMet: false };
  }
  if (currentUsdc >= targetUsdc) {
    return { targetUsdc, deltaUsdc: 0, targetMet: true };
  }
  return { targetUsdc, deltaUsdc: Math.max(0, targetUsdc - currentUsdc), targetMet: false };
}

export const TAKE_PROFIT_PLAN_SK = 'Presun: Zabezpečenie zisku do USDC.';
export const TAKE_PROFIT_PLAN_EN = 'Move: Secure profits into USDC.';
export const TAKE_PROFIT_NO_PROFIT_SK = 'Zatiaľ žiadny vygenerovaný zisk na výber.';
export const TAKE_PROFIT_NO_PROFIT_EN = 'No earned profit available to withdraw yet.';
export const TAKE_PROFIT_FULFILLED_SK = 'Take Profit cieľ splnený';
export const TAKE_PROFIT_FULFILLED_EN = 'Take Profit target met';
