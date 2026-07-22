import type { AssetCategory } from "@/lib/portfolioStorage";
import type { YieldSatelliteMetrics } from "@/lib/yieldSatelliteMetrics";
import type { SupportResistanceLevels } from "@/lib/supportResistanceLevels";
import { formatSupportResistanceSummary } from "@/lib/supportResistanceLevels";
import {
  LIMIT_VALIDITY_INSTRUCTION,
  SEVEN_DAY_CALIBRATION_NARRATIVE,
} from "@/lib/limitDepthEngine";
import { formatDecimal, formatSignedPct } from "@/lib/numberFormat";

export interface LimitReasoningInput {
  symbol: string;
  category: AssetCategory;
  spotPrice: number;
  limitPrice: number;
  rsi14?: number | null;
  atr14dPct?: number | null;
  ema50?: number | null;
  distSma200Pct?: number | null;
  priceVsSma14Pct?: number | null;
  fundamentalScore?: number | null;
  filtersPassedCount?: number | null;
  fearGreedValue?: number;
  safetyBrakeActive?: boolean;
  atrMultiplier?: number;
  yieldSatelliteMetrics?: YieldSatelliteMetrics | null;
  supportResistance?: SupportResistanceLevels | null;
  supportSnapNote?: string | null;
  limitDepthNarrative?: string | null;
  macroTrendNarrative?: string | null;
}

export function computeBelowSpotPercent(
  spotPrice: number,
  limitPrice: number,
): number {
  if (spotPrice <= 0 || limitPrice <= 0) return 0;
  return Math.round(((spotPrice - limitPrice) / spotPrice) * 1000) / 10;
}

export function formatBelowSpotLabel(pct: number): string {
  if (pct <= 0) return "na úrovni spotu";
  return `−${formatDecimal(pct, 1)}% pod spotom`;
}

function emaDeviationPct(spot: number, ema50: number): number | null {
  if (spot <= 0 || ema50 <= 0) return null;
  return Math.round(((spot - ema50) / ema50) * 1000) / 10;
}

function rsiTone(rsi: number): string {
  if (rsi < 35) return "oversold — limit blízko dna";
  if (rsi < 50) return "mierne oversold — limit má zmysel";
  if (rsi > 65) return "prekúpené — limit čaká na korekciu";
  return "neutrálne — limit ako poistka";
}

function buildCoreReasoning(input: LimitReasoningInput, belowPct: number): string {
  const ema50 = input.ema50 ?? 0;
  const distSma = input.distSma200Pct ?? 0;
  const atr = input.atr14dPct ?? 0;
  const emaDev = emaDeviationPct(input.spotPrice, ema50);
  const emaText =
    emaDev == null
      ? "50D EMA nie je k dispozícii"
      : emaDev >= 0
        ? `${formatDecimal(emaDev, 1)}% nad 50D EMA`
        : `${formatDecimal(Math.abs(emaDev), 1)}% pod 50D EMA`;
  const smaText =
    distSma >= 0
      ? `${formatDecimal(distSma, 1)}% nad 200D SMA`
      : `${formatDecimal(Math.abs(distSma), 1)}% pod 200D SMA`;

  const brakeNote = input.safetyBrakeActive
    ? "Safety Brake posúva limit hlbšie pod trh."
    : "Bez Safety Brake — štandardná hĺbka pullbacku.";

  return (
    `BTC Core: ${smaText}, ${emaText}. ` +
    `Limit ${formatBelowSpotLabel(belowPct)} (ATR ${formatDecimal(atr, 1)}%, cieľ ${formatDecimal(belowPct, 1)}% pod spotom). ` +
    `F&G ${Math.round(input.fearGreedValue ?? 50)}. ${brakeNote}`
  );
}

function buildSatelliteReasoning(
  input: LimitReasoningInput,
  belowPct: number,
): string {
  const metrics = input.yieldSatelliteMetrics;
  if (metrics) {
    return metrics.whyExecutionText;
  }

  const rsi = input.rsi14 ?? 50;
  const atr = input.atr14dPct ?? 0;
  const mult = input.atrMultiplier ?? 1.8;
  const depth = formatDecimal(mult * atr, 1);

  return (
    `${input.symbol} Satellite: RSI ${rsi.toFixed(0)} (${rsiTone(rsi)}). ` +
    `ATR ${formatDecimal(atr, 1)}% → limit Spot − ${mult}×ATR (−${depth}% hĺbka). ` +
    `Finálna vzdialenosť ${formatBelowSpotLabel(belowPct)} od aktuálnej ceny.`
  );
}

function buildYieldReasoning(input: LimitReasoningInput, belowPct: number): string {
  const metrics = input.yieldSatelliteMetrics;
  if (metrics) {
    return metrics.whyExecutionText;
  }

  const rsi = input.rsi14 ?? 50;
  const atr = input.atr14dPct ?? 0;
  const mult = input.atrMultiplier ?? 2.5;
  const ma = input.priceVsSma14Pct;
  const fund = input.fundamentalScore ?? 0;
  const filters = input.filtersPassedCount ?? 0;
  const maText =
    ma == null
      ? "MA14 N/A"
      : `${formatSignedPct(ma, 1)} vs MA14`;

  return (
    `${input.symbol} Yield: ${maText}, RSI ${rsi.toFixed(0)}, fundament ${Math.round(fund)} (${filters}/3 filter). ` +
    `Limit ${formatBelowSpotLabel(belowPct)} cez ${mult}×ATR (${formatDecimal(atr, 1)}%) — ` +
    `hľadáme likvidačný knot bez preplatenia altcoinu.`
  );
}

export function buildDynamicLimitReasoning(input: LimitReasoningInput): string {
  if (input.spotPrice <= 0 || input.limitPrice <= 0) {
    return "Čakáme na live cenu pre výpočet limitného cieľa.";
  }

  const belowPct = computeBelowSpotPercent(input.spotPrice, input.limitPrice);

  let base: string;
  switch (input.category) {
    case "core":
      base = buildCoreReasoning(input, belowPct);
      break;
    case "satellite":
      base = buildSatelliteReasoning(input, belowPct);
      break;
    case "yield":
      base = buildYieldReasoning(input, belowPct);
      break;
    default:
      base = buildSatelliteReasoning(input, belowPct);
  }

  const srSummary = input.supportResistance
    ? formatSupportResistanceSummary(input.supportResistance)
    : null;

  const parts = [SEVEN_DAY_CALIBRATION_NARRATIVE, base];
  if (srSummary && srSummary !== "S/R úrovne sa načítavajú…") {
    parts.push(`S/R: ${srSummary}.`);
  }
  if (input.supportSnapNote) {
    parts.push(input.supportSnapNote);
  }
  if (input.macroTrendNarrative) {
    parts.push(input.macroTrendNarrative);
  }
  if (input.limitDepthNarrative) {
    parts.push(input.limitDepthNarrative);
  }
  parts.push(LIMIT_VALIDITY_INSTRUCTION);

  return parts.join(" ");
}
