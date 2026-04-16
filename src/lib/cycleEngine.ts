/**
 * Cycle-Trigger Profit Engine
 * Combines market cycle phase with profit-taking levels to dynamically adjust sell %
 * and generate re-entry signals during bear markets.
 */

import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';
import { PROFIT_CONFIGS, TokenProfitConfig, ProfitLevel, computeProfitPct, isLevelExecuted } from '@/lib/profitTaking';

// ──── Market Cycle Phases ────
export type CyclePhase =
  | 'bear_capitulation'
  | 'early_accumulation'
  | 'mid_bull'
  | 'late_bull'
  | 'distribution';

export interface CyclePhaseInfo {
  phase: CyclePhase;
  label: string;
  color: string;
  emoji: string;
  confidence: number; // 0-100
  profitMultiplier: number; // 1.0 = normal, 1.5 = sell 50% more
  btcSellAllowed: boolean;
  stablePct: number; // % of proceeds to stablecoins (override)
}

export function detectCyclePhase(
  cycleScore: number,
  advancedData?: AdvancedMarketData | null,
): CyclePhaseInfo {
  const fundingRate = advancedData?.tradingMetrics?.fundingRate ?? 0;
  const whaleFlow = advancedData?.whaleActivity?.netFlow ?? 'neutral';
  const socialSentiment = advancedData?.socialSentiment ?? 'neutral';

  // Adjust score based on advanced metrics
  let adjustedScore = cycleScore;
  if (fundingRate > 0.03) adjustedScore += 8; // overheated funding
  if (fundingRate < -0.02) adjustedScore -= 8; // shorts paying
  if (whaleFlow === 'outflow') adjustedScore += 5;
  if (whaleFlow === 'inflow') adjustedScore -= 5;
  if (socialSentiment === 'bullish') adjustedScore += 3;
  if (socialSentiment === 'bearish') adjustedScore -= 3;
  adjustedScore = Math.max(0, Math.min(100, adjustedScore));

  // Confidence based on indicator agreement
  const confidence = Math.min(95, 50 + Math.abs(adjustedScore - 50));

  if (adjustedScore <= 15) {
    return {
      phase: 'bear_capitulation', label: 'Kapitulácia', color: '#10B981',
      emoji: '🟢', confidence, profitMultiplier: 0.5, btcSellAllowed: false, stablePct: 0,
    };
  }
  if (adjustedScore <= 35) {
    return {
      phase: 'early_accumulation', label: 'Akumulácia', color: '#3B82F6',
      emoji: '🔵', confidence, profitMultiplier: 0.7, btcSellAllowed: false, stablePct: 20,
    };
  }
  if (adjustedScore <= 60) {
    return {
      phase: 'mid_bull', label: 'Rastový trh', color: '#F59E0B',
      emoji: '🟡', confidence, profitMultiplier: 1.0, btcSellAllowed: false, stablePct: 30,
    };
  }
  if (adjustedScore <= 80) {
    return {
      phase: 'late_bull', label: 'Neskorý rast', color: '#F97316',
      emoji: '🟠', confidence, profitMultiplier: 1.5, btcSellAllowed: false, stablePct: 40,
    };
  }
  return {
    phase: 'distribution', label: 'Distribúcia / Top Risk', color: '#EF4444',
    emoji: '🔴', confidence, profitMultiplier: 2.0, btcSellAllowed: true, stablePct: 50,
  };
}

// ──── Smart Sell Calculation ────
export interface SmartSellAction {
  tokenId: string;
  symbol: string;
  profitPct: number;
  baseSellPct: number;
  adjustedSellPct: number;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  btcPct: number; // % to BTC
  stablePct: number; // % to stablecoins
}

export function computeSmartSells(
  configs: TokenProfitConfig[],
  currentPrices: Record<string, number>,
  avgCosts: Record<string, number>,
  holdings: Record<string, number>,
  cyclePhase: CyclePhaseInfo,
  advancedData?: AdvancedMarketData | null,
): SmartSellAction[] {
  const actions: SmartSellAction[] = [];
  const fundingRate = advancedData?.tradingMetrics?.fundingRate ?? 0;
  const whaleFlow = advancedData?.whaleActivity?.netFlow ?? 'neutral';

  for (const config of configs) {
    const avgCost = avgCosts[config.id] ?? 0;
    const currentPrice = currentPrices[config.id] ?? 0;
    if (avgCost <= 0 || currentPrice <= 0) continue;

    const pPct = computeProfitPct(currentPrice, avgCost);

    for (let i = 0; i < config.levels.length; i++) {
      const level = config.levels[i];
      if (isLevelExecuted(config.id, level.profitPct)) continue;

      // Check if previous level is executed (sequential rule)
      const prevExecuted = i === 0 || isLevelExecuted(config.id, config.levels[i - 1].profitPct);
      if (!prevExecuted) break;

      if (pPct < level.profitPct) break; // not reached

      // BTC special logic
      if (config.id === 'btc' || config.symbol === 'BTC') {
        if (!cyclePhase.btcSellAllowed) {
          // Only sell BTC in extreme euphoria
          if (cyclePhase.phase !== 'distribution') continue;
        }
      }

      // Calculate adjusted sell %
      let adjustedSell = level.sellPct * cyclePhase.profitMultiplier;

      // Extra adjustments for specific conditions
      const reasons: string[] = [];

      if (cyclePhase.phase === 'late_bull' || cyclePhase.phase === 'distribution') {
        reasons.push('trh v neskorej fáze');
      }

      if (fundingRate > 0.03) {
        adjustedSell *= 1.2;
        reasons.push('funding prehriaty');
      }

      if (whaleFlow === 'outflow') {
        adjustedSell *= 1.15;
        reasons.push('whale výpredaj');
      }

      // Cap at reasonable max
      adjustedSell = Math.min(adjustedSell, level.sellPct * 2.5);
      adjustedSell = Math.round(adjustedSell * 10) / 10;

      // Determine urgency
      let urgency: SmartSellAction['urgency'] = 'low';
      if (cyclePhase.phase === 'distribution') urgency = 'critical';
      else if (cyclePhase.phase === 'late_bull') urgency = 'high';
      else if (adjustedSell > level.sellPct) urgency = 'medium';

      // Profit distribution
      const btcPct = cyclePhase.phase === 'distribution'
        ? 100 - cyclePhase.stablePct
        : level.btcPct;
      const stablePct = 100 - btcPct;

      const reason = reasons.length > 0
        ? `${config.symbol} +${pPct.toFixed(0)}% a ${reasons.join(', ')} → predaj ${adjustedSell}%`
        : `${config.symbol} dosiahol +${level.profitPct}% → predaj ${adjustedSell}%`;

      actions.push({
        tokenId: config.id,
        symbol: config.symbol,
        profitPct: pPct,
        baseSellPct: level.sellPct,
        adjustedSellPct: adjustedSell,
        reason,
        urgency,
        btcPct,
        stablePct,
      });

      break; // only first unreached level per token
    }
  }

  // Sort by urgency
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return actions;
}

// ──── Re-Entry Engine ────
export interface ReEntrySignal {
  active: boolean;
  phase: number; // 1-4 (which deployment stage)
  deployPct: number; // % of stablecoin war chest to deploy
  reason: string;
  conditions: string[];
}

export function computeReEntry(
  cycleScore: number,
  fearGreedValue: number,
  btcDrawdownPct: number, // negative, e.g. -30
  advancedData?: AdvancedMarketData | null,
): ReEntrySignal {
  const conditions: string[] = [];
  let buyScore = 0;

  if (fearGreedValue < 25) {
    buyScore += 30;
    conditions.push(`Fear & Greed = ${fearGreedValue} (extrémny strach)`);
  } else if (fearGreedValue < 40) {
    buyScore += 15;
    conditions.push(`Fear & Greed = ${fearGreedValue} (strach)`);
  }

  if (btcDrawdownPct < -30) {
    buyScore += 30;
    conditions.push(`BTC -${Math.abs(btcDrawdownPct).toFixed(0)}% od ATH`);
  } else if (btcDrawdownPct < -20) {
    buyScore += 15;
    conditions.push(`BTC -${Math.abs(btcDrawdownPct).toFixed(0)}% od ATH`);
  }

  // RSI-like proxy from cycle score
  if (cycleScore < 20) {
    buyScore += 20;
    conditions.push('Cycle score oversold');
  }

  const fundingRate = advancedData?.tradingMetrics?.fundingRate ?? 0;
  if (fundingRate < -0.01) {
    buyScore += 10;
    conditions.push('Negatívny funding (shorty platia)');
  }

  if (buyScore < 40) {
    return { active: false, phase: 0, deployPct: 0, reason: '', conditions: [] };
  }

  // Staged re-entry: 4 phases
  let phase = 1;
  let deployPct = 25;
  if (buyScore >= 80) { phase = 4; deployPct = 25; } // deploy all 4 tranches
  else if (buyScore >= 65) { phase = 3; deployPct = 25; }
  else if (buyScore >= 50) { phase = 2; deployPct = 25; }

  return {
    active: true,
    phase,
    deployPct,
    reason: `Buy zóna detegovaná (skóre: ${buyScore}) → nasaď ${deployPct}% stablecoinov (fáza ${phase}/4)`,
    conditions,
  };
}

// ──── Stablecoin War Chest ────
export interface WarChestStatus {
  mode: 'accumulate' | 'deploy' | 'hold';
  label: string;
  stablePctTarget: number; // target % of profits to stables
  description: string;
}

export function getWarChestMode(phase: CyclePhase): WarChestStatus {
  switch (phase) {
    case 'distribution':
      return {
        mode: 'accumulate',
        label: '🛡️ War Chest: Akumuluj',
        stablePctTarget: 50,
        description: 'Top Risk → 50% BTC / 50% Stablecoins. Buduj rezervu na re-entry.',
      };
    case 'late_bull':
      return {
        mode: 'accumulate',
        label: '🟠 War Chest: Zvyšuj',
        stablePctTarget: 40,
        description: 'Neskorý rast → zvýš podiel stablecoinov v profitoch.',
      };
    case 'bear_capitulation':
    case 'early_accumulation':
      return {
        mode: 'deploy',
        label: '🟢 War Chest: Nasadzuj',
        stablePctTarget: 0,
        description: 'Buy zóna → nasaď stablecoiny na nákup. Staged re-entry (25% kroky).',
      };
    default:
      return {
        mode: 'hold',
        label: '🟡 War Chest: Drž',
        stablePctTarget: 30,
        description: 'Neutrálny trh → drž existujúce stablecoiny, štandardné rozdelenie ziskov.',
      };
  }
}
