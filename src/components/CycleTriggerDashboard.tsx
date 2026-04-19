import { useState } from 'react';
import { Lang } from '@/lib/i18n';
import { TOKENS, formatUsd, formatPrice, PriceData, AthData } from '@/lib/crypto';
import { PROFIT_CONFIGS, getAvgCostBasis, computeProfitPct, isLevelExecuted, getTotalSoldPct } from '@/lib/profitTaking';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';
import {
  detectCyclePhase, computeSmartSells, computeReEntry, getWarChestMode,
  CyclePhaseInfo, SmartSellAction, ReEntrySignal,
} from '@/lib/cycleEngine';
import {
  Shield, TrendingUp, TrendingDown, AlertTriangle, ChevronDown,
  Zap, Target, ArrowDownCircle, Wallet, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  lang: Lang;
  prices?: PriceData;
  athData?: AthData;
  cycleResult?: MarketCycleResult | null;
  advancedData?: AdvancedMarketData | null;
}

function loadHoldings(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}'); } catch { return {}; }
}

const urgencyColors = {
  low: 'border-gain/30 bg-gain/5',
  medium: 'border-warning/30 bg-warning/5',
  high: 'border-orange-500/30 bg-orange-500/5',
  critical: 'border-loss/30 bg-loss/5 animate-pulse',
};

const urgencyLabels = {
  low: '🟢 Nízka', medium: '🟡 Stredná', high: '🟠 Vysoká', critical: '🔴 Kritická',
};

export function CycleTriggerDashboard({ lang, prices, athData, cycleResult, advancedData }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const sk = lang === 'sk';

  const avgCosts = getAvgCostBasis();
  const holdings = loadHoldings();

  // Detect cycle phase
  const cyclePhase = cycleResult
    ? detectCyclePhase(cycleResult.score, advancedData)
    : null;

  // Build prices map by token ID
  const priceMap: Record<string, number> = {};
  for (const t of TOKENS) {
    priceMap[t.id] = prices?.[t.coingeckoId]?.usd ?? 0;
  }

  // Compute smart sells
  const smartSells = cyclePhase
    ? computeSmartSells(PROFIT_CONFIGS, priceMap, avgCosts, holdings, cyclePhase, advancedData)
    : [];

  // Compute re-entry signal
  const fearGreedValue = cycleResult?.indicators?.find(i => i.name.includes('Strach'))?.value ?? 50;
  const btcDrawdown = athData?.bitcoin?.ath_change_percentage ?? 0;
  const reEntry = cyclePhase
    ? computeReEntry(cycleResult?.score ?? 50, fearGreedValue, btcDrawdown, advancedData)
    : null;

  // Portfolio totals for war chest USD recommendation
  const stableHoldings = holdings['usdc'] ?? holdings['usdt'] ?? holdings['stable'] ?? 0;
  const currentStableUsd = stableHoldings; // stablecoins ≈ 1 USD
  let riskAssetsUsd = 0;
  for (const t of TOKENS) {
    riskAssetsUsd += (holdings[t.id] ?? 0) * (priceMap[t.id] ?? 0);
  }
  const totalPortfolioUsd = riskAssetsUsd + currentStableUsd;

  const warChest = cyclePhase
    ? getWarChestMode(cyclePhase.phase, totalPortfolioUsd, currentStableUsd)
    : null;

  // Send Telegram alert
  const handleSendCycleAlert = async () => {
    const chatId = localStorage.getItem('telegram_chat_id')?.trim();
    if (!chatId) {
      toast.error('Nastav Telegram Chat ID v Nastaveniach');
      return;
    }

    setSendingAlert(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-cycle-alert', {
        body: {
          chatId,
          cyclePhase: cyclePhase ? { phase: cyclePhase.phase, label: cyclePhase.label, confidence: cyclePhase.confidence } : null,
          smartSells: smartSells.slice(0, 4),
          reEntry: reEntry?.active ? reEntry : null,
          warChest: warChest ? {
            mode: warChest.mode,
            label: warChest.label,
            actionLabel: warChest.actionLabel,
            recommendedMoveUsd: warChest.recommendedMoveUsd,
            currentStableUsd: warChest.currentStableUsd,
            targetStableUsd: warChest.targetStableUsd,
            stablePctTarget: warChest.stablePctTarget,
          } : null,
          cycleScore: cycleResult?.score ?? 0,
        },
      });
      if (error) throw error;
      toast.success('Cyklus alert odoslaný ✓');
    } catch (e) {
      console.error('Failed to send cycle alert:', e);
      toast.error('Nepodarilo sa odoslať alert');
    } finally {
      setSendingAlert(false);
    }
  };

  if (!cyclePhase || !prices) return null;

  return (
    <div className="space-y-3">
      {/* Cycle Phase Header */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Cyklus trhu & predajné signály</h2>
          </div>
          <button
            onClick={handleSendCycleAlert}
            disabled={sendingAlert}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30"
          >
            <Send className="w-3 h-3" />
            Telegram
          </button>
        </div>

        {/* Phase Meter */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">{cyclePhase.emoji}</span>
            <div>
              <p className="text-lg font-extrabold" style={{ color: cyclePhase.color }}>
                {cyclePhase.label}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Spoľahlivosť: {cyclePhase.confidence}%
              </p>
            </div>
          </div>

          {/* Phase Scale */}
          <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
            <div className="absolute inset-0 flex">
              <div className="flex-1 bg-emerald-500/40" />
              <div className="flex-1 bg-blue-500/40" />
              <div className="flex-1 bg-yellow-500/40" />
              <div className="flex-1 bg-orange-500/40" />
              <div className="flex-1 bg-red-500/40" />
            </div>
            <div
              className="absolute top-0 h-full w-1 bg-foreground rounded-full transition-all"
              style={{ left: `${Math.min(98, (cycleResult?.score ?? 50))}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground px-1">
            <span>🟢 Nákup</span>
            <span>🔵 Akumuluj</span>
            <span>🟡 Neutrál</span>
            <span>🟠 Profit</span>
            <span>🔴 Top Risk</span>
          </div>
        </div>
      </div>

      {/* Smart Sell Actions */}
      {smartSells.length > 0 && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-bold text-foreground">Smart predajné akcie</h3>
          </div>

          {smartSells.map((action, i) => {
            const adjusted = action.adjustedSellPct !== action.baseSellPct;
            return (
              <div key={i} className={`rounded-lg p-3 border ${urgencyColors[action.urgency]}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{action.symbol}</span>
                    <span className={`text-xs font-medium ${action.profitPct >= 0 ? 'text-gain' : 'text-loss'}`}>
                      +{action.profitPct.toFixed(1)}%
                    </span>
                  </div>
                  <span className="text-[10px]">{urgencyLabels[action.urgency]}</span>
                </div>

                <p className="text-[10px] text-muted-foreground mb-1">{action.reason}</p>

                <div className="flex items-center gap-3 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Predaj: </span>
                    <span className="text-foreground font-bold">
                      {action.adjustedSellPct}%
                      {adjusted && (
                        <span className="text-warning ml-1">(základ: {action.baseSellPct}%)</span>
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">→ </span>
                    <span className="text-foreground">{action.btcPct}% BTC / {action.stablePct}% Stable</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* War Chest Status */}
      {warChest && (
        <div className="glass-card p-3 space-y-2">
          <div className="flex items-start gap-3">
            <Wallet className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground">{warChest.label}</p>
              <p className="text-[10px] text-muted-foreground">{warChest.description}</p>
            </div>
          </div>
          {totalPortfolioUsd > 0 && (
            <div className="rounded-lg bg-secondary/50 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">Aktuálne stables</span>
                <span className="text-foreground font-medium">
                  {formatUsd(warChest.currentStableUsd)} ({totalPortfolioUsd > 0 ? ((warChest.currentStableUsd / totalPortfolioUsd) * 100).toFixed(0) : 0}%)
                </span>
              </div>
              {warChest.stablePctTarget > 0 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Cieľ ({warChest.stablePctTarget}%)</span>
                  <span className="text-foreground font-medium">{formatUsd(warChest.targetStableUsd)}</span>
                </div>
              )}
              <div className={`text-[11px] font-bold pt-1 border-t border-border ${
                warChest.recommendedMoveUsd > 0 ? 'text-warning' : 'text-gain'
              }`}>
                {warChest.recommendedMoveUsd > 0 ? '⚠️ ' : '✓ '}{warChest.actionLabel}
              </div>
            </div>
          )}
          {totalPortfolioUsd === 0 && (
            <p className="text-[10px] text-muted-foreground italic">
              Pridaj holdings v Smart Alokácii pre konkrétne USD odporúčanie.
            </p>
          )}
        </div>
      )}

      {/* Re-Entry Signal */}
      {reEntry?.active && (
        <div className="glass-card p-4 space-y-2 border-2 border-gain/30 bg-gain/5">
          <div className="flex items-center gap-2">
            <ArrowDownCircle className="w-5 h-5 text-gain" />
            <h3 className="text-sm font-bold text-gain">Re-Entry Signál aktívny!</h3>
          </div>
          <p className="text-xs text-foreground">{reEntry.reason}</p>
          <div className="space-y-1">
            {reEntry.conditions.map((c, i) => (
              <p key={i} className="text-[10px] text-muted-foreground">✓ {c}</p>
            ))}
          </div>
          <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4].map(phase => (
              <div
                key={phase}
                className={`flex-1 h-2 rounded-full ${
                  phase <= reEntry.phase ? 'bg-gain' : 'bg-secondary'
                }`}
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Fáza {reEntry.phase}/4 — nasaď 25% stablecoinov na nákup
          </p>
        </div>
      )}

      {/* Per-Token Summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="glass-card p-3 w-full flex items-center justify-between"
      >
        <span className="text-xs font-bold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Detail podľa tokenu
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="space-y-2">
          {PROFIT_CONFIGS.map(config => {
            const token = TOKENS.find(t => t.id === config.id)!;
            const currentPrice = prices?.[token.coingeckoId]?.usd ?? 0;
            const avgCost = avgCosts[config.id] ?? 0;
            const profitPct = avgCost > 0 ? computeProfitPct(currentPrice, avgCost) : 0;
            const totalSold = getTotalSoldPct(config.id);
            const remaining = 100 - totalSold;

            const smartSell = smartSells.find(s => s.tokenId === config.id);
            const nextLevel = config.levels.find(l => !isLevelExecuted(config.id, l.profitPct));

            // Risk level
            let riskLabel = '🟢 Nízke';
            let riskColor = 'text-gain';
            if (cyclePhase.phase === 'distribution') { riskLabel = '🔴 Kritické'; riskColor = 'text-loss'; }
            else if (cyclePhase.phase === 'late_bull') { riskLabel = '🟠 Vysoké'; riskColor = 'text-warning'; }
            else if (cyclePhase.phase === 'mid_bull') { riskLabel = '🟡 Stredné'; riskColor = 'text-foreground'; }

            // BTC special
            const isBtc = config.symbol === 'BTC';
            const btcProtected = isBtc && !cyclePhase.btcSellAllowed;

            return (
              <div key={config.id} className="glass-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ backgroundColor: config.color + '20', color: config.color }}
                    >
                      {config.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground">{config.symbol}</span>
                      {btcProtected && (
                        <span className="text-[9px] ml-1.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                          CHRÁNENÝ
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium ${riskColor}`}>{riskLabel}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="bg-secondary/50 rounded p-1.5">
                    <p className="text-muted-foreground">Zisk</p>
                    <p className={`font-bold ${profitPct >= 0 ? 'text-gain' : 'text-loss'}`}>
                      {avgCost > 0 ? `${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                  <div className="bg-secondary/50 rounded p-1.5">
                    <p className="text-muted-foreground">Predaj</p>
                    <p className="font-bold text-foreground">
                      {smartSell ? `${smartSell.adjustedSellPct}%` : (nextLevel ? `${nextLevel.sellPct}%` : '—')}
                    </p>
                  </div>
                  <div className="bg-secondary/50 rounded p-1.5">
                    <p className="text-muted-foreground">Zostatok</p>
                    <p className="font-bold text-foreground">{remaining.toFixed(0)}%</p>
                  </div>
                </div>

                {smartSell && smartSell.adjustedSellPct !== smartSell.baseSellPct && (
                  <p className="text-[9px] text-warning flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Cyklus zvýšil predaj z {smartSell.baseSellPct}% na {smartSell.adjustedSellPct}%
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
