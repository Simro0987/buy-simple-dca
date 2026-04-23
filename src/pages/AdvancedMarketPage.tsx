import { useState } from 'react';
import { Lang } from '@/lib/i18n';
import { useAdvancedMarket, AdvancedMarketData } from '@/hooks/useAdvancedMarket';
import { useFearGreed } from '@/hooks/usePrices';
import { FearGreedGauge } from '@/components/FearGreedGauge';
import { formatPrice } from '@/lib/crypto';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PerChainMarketSignals } from '@/components/PerChainMarketSignals';
import { RiskChangeBadges } from '@/components/decision/RiskChangeBadges';
import { OpportunityCards } from '@/components/decision/OpportunityCards';
import { ExitSignalsCard } from '@/components/decision/ExitSignalsCard';
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, Activity, BarChart3,
  Calendar, Zap, Waves, Fish, Building2, AlertTriangle, Shield,
} from 'lucide-react';

interface Props { lang: Lang; }

function SignalBadge({ signal }: { signal: AdvancedMarketData['aggregatedSignal'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    strong_buy: { label: 'Silný nákup', cls: 'bg-gain/20 text-gain border-gain/30' },
    buy: { label: 'Nákup', cls: 'bg-gain/10 text-gain border-gain/20' },
    hold: { label: 'Držať', cls: 'bg-muted text-muted-foreground border-border' },
    sell: { label: 'Predaj', cls: 'bg-loss/10 text-loss border-loss/20' },
    strong_sell: { label: 'Silný predaj', cls: 'bg-loss/20 text-loss border-loss/30' },
  };
  const { label, cls } = map[signal] ?? map.hold;
  return <span className={`text-sm font-bold px-3 py-1 rounded-full border ${cls}`}>{label}</span>;
}

function SignalMeter({ score }: { score: number }) {
  // -100 to +100 mapped to 0-100%
  const pct = Math.max(0, Math.min(100, (score + 100) / 2));
  const color = score >= 30 ? 'hsl(var(--gain))' : score <= -30 ? 'hsl(var(--loss))' : 'hsl(var(--warning))';
  return (
    <div className="space-y-1">
      <div className="w-full h-3 bg-secondary rounded-full overflow-hidden relative">
        <div className="absolute left-1/2 top-0 w-px h-full bg-muted-foreground/30" />
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>Silný predaj</span>
        <span>Neutrálny</span>
        <span>Silný nákup</span>
      </div>
    </div>
  );
}

function MetricRow({ label, value, icon: Icon, positive, negative }: {
  label: string; value: string; icon?: React.ComponentType<{ className?: string }>; positive?: boolean; negative?: boolean;
}) {
  const color = positive ? 'text-gain' : negative ? 'text-loss' : 'text-foreground';
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={`text-xs font-bold ${color}`}>{value}</span>
    </div>
  );
}

function ImportanceDot({ level }: { level: 'high' | 'medium' | 'low' }) {
  const cls = level === 'high' ? 'bg-loss' : level === 'medium' ? 'bg-warning' : 'bg-muted-foreground';
  return <div className={`w-2 h-2 rounded-full ${cls}`} />;
}

export function AdvancedMarketPage({ lang }: Props) {
  const { data, isLoading, error } = useAdvancedMarket();
  const { data: fearGreed } = useFearGreed();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Activity className="w-5 h-5" /> Pokročilá analýza trhu
        </h1>
        {[1, 2, 3, 4].map(i => <div key={i} className="glass-card p-4 h-24 animate-pulse" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Activity className="w-5 h-5" /> Pokročilá analýza trhu
        </h1>
        <div className="glass-card p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Dáta momentálne nedostupné</p>
        </div>
      </div>
    );
  }

  const TrendIcon = data.btcDominance.trend === 'rising' ? TrendingUp : data.btcDominance.trend === 'falling' ? TrendingDown : Minus;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Activity className="w-5 h-5" /> Pokročilá analýza trhu
      </h1>

      {/* MAIN SIGNAL - always visible */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium">FINÁLNY SIGNÁL</p>
          <SignalBadge signal={data.aggregatedSignal} />
        </div>
        <SignalMeter score={data.signalScore} />
        <p className="text-xs text-muted-foreground leading-relaxed bg-secondary/50 rounded-lg p-3">
          💡 {data.signalExplanation}
        </p>
      </div>

      {/* Decision layer additions */}
      <RiskChangeBadges />
      <ExitSignalsCard />
      <OpportunityCards />

      {/* 1. Market Sentiment */}
      <div className="glass-card p-4 space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4" /> Sentiment trhu
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {fearGreed && (
            <FearGreedGauge value={fearGreed.value} label={fearGreed.classification} title="Fear & Greed" />
          )}
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-2">Sociálny sentiment</p>
            <p className={`text-sm font-bold ${
              data.socialSentiment === 'bullish' ? 'text-gain' : data.socialSentiment === 'bearish' ? 'text-loss' : 'text-muted-foreground'
            }`}>
              {data.socialSentiment === 'bullish' ? '🟢 Bullish' : data.socialSentiment === 'bearish' ? '🔴 Bearish' : '⚪ Neutrálny'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. BTC Dominance */}
      <div className="glass-card p-4 space-y-2">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> BTC Dominancia
        </h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{data.btcDominance.dominance.toFixed(1)}%</span>
            <TrendIcon className={`w-4 h-4 ${
              data.btcDominance.trend === 'rising' ? 'text-warning' : data.btcDominance.trend === 'falling' ? 'text-gain' : 'text-muted-foreground'
            }`} />
          </div>
          <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
            {data.btcDominance.trend === 'rising' ? '⬆️ Risk-off (BTC sila)' : data.btcDominance.trend === 'falling' ? '⬇️ Altcoin expanzia' : '➡️ Stabilná'}
          </span>
        </div>
      </div>

      {/* 3. Event Calendar */}
      <Collapsible>
        <div className="glass-card overflow-hidden">
          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Kalendár udalostí
            </h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4 space-y-2">
            {data.events.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                <ImportanceDot level={ev.importance} />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">{ev.title}</p>
                  <p className="text-[10px] text-muted-foreground">{ev.date}</p>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  {ev.category === 'macro' ? 'Makro' : ev.category === 'upgrade' ? 'Upgrade' : ev.category === 'token_unlock' ? 'Unlock' : 'Crypto'}
                </span>
              </div>
            ))}
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* 4. Advanced Trading Metrics */}
      <Collapsible>
        <div className="glass-card overflow-hidden">
          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4" /> Obchodné metriky
            </h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4">
            <MetricRow
              label="Funding Rate"
              value={`${(data.tradingMetrics.fundingRate * 100).toFixed(3)}%`}
              icon={Activity}
              positive={data.tradingMetrics.fundingRate < 0}
              negative={data.tradingMetrics.fundingRate > 0.03}
            />
            <MetricRow
              label="Open Interest"
              value={data.tradingMetrics.openInterestTrend === 'rising' ? '📈 Rastie' : data.tradingMetrics.openInterestTrend === 'falling' ? '📉 Klesá' : '➡️ Stabilný'}
              icon={BarChart3}
            />
            <MetricRow
              label="Spot Volume"
              value={data.tradingMetrics.spotVolumeTrend === 'rising' ? '📈 Rastie' : data.tradingMetrics.spotVolumeTrend === 'falling' ? '📉 Klesá' : '➡️ Stabilný'}
              icon={BarChart3}
            />
            <MetricRow
              label="Crowd Signal"
              value={data.tradingMetrics.crowdSignal === 'long_crowded' ? '🐂 Long preplnený' : data.tradingMetrics.crowdSignal === 'short_crowded' ? '🐻 Short preplnený' : '⚖️ Vyvážený'}
              icon={Zap}
              negative={data.tradingMetrics.crowdSignal === 'long_crowded'}
              positive={data.tradingMetrics.crowdSignal === 'short_crowded'}
            />
            <MetricRow
              label="Tlak"
              value={data.tradingMetrics.pressure === 'bullish' ? '🟢 Býčí' : data.tradingMetrics.pressure === 'bearish' ? '🔴 Medvedí' : '⚪ Neutrálny'}
              icon={Waves}
              positive={data.tradingMetrics.pressure === 'bullish'}
              negative={data.tradingMetrics.pressure === 'bearish'}
            />
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* 5. Liquidation Heatmap */}
      <Collapsible>
        <div className="glass-card overflow-hidden">
          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Likvidačné úrovne (BTC)
            </h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4 space-y-2">
            {data.liquidationLevels.map((lv, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  lv.side === 'long' ? 'bg-loss/15 text-loss' : 'bg-gain/15 text-gain'
                }`}>
                  {lv.side === 'long' ? 'LONG' : 'SHORT'}
                </span>
                <span className="text-xs font-bold text-foreground flex-1">{formatPrice(lv.price)}</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3].map(j => (
                    <div key={j} className={`w-2 h-4 rounded-sm ${
                      (lv.intensity === 'high' || (lv.intensity === 'medium' && j <= 2) || (lv.intensity === 'low' && j <= 1))
                        ? (lv.side === 'long' ? 'bg-loss/60' : 'bg-gain/60')
                        : 'bg-secondary'
                    }`} />
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground mt-2">
              ⚠️ Heuristické úrovne na základe aktuálnej ceny. Pre presné dáta použite Coinglass.
            </p>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* 6. Whale Activity */}
      <Collapsible>
        <div className="glass-card overflow-hidden">
          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Fish className="w-4 h-4" /> Aktivita veľrýb
            </h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4">
            <MetricRow
              label="Signál"
              value={data.whaleActivity.signal === 'accumulating' ? '🟢 Akumulácia' : data.whaleActivity.signal === 'distributing' ? '🔴 Distribúcia' : '⚪ Neutrálny'}
              positive={data.whaleActivity.signal === 'accumulating'}
              negative={data.whaleActivity.signal === 'distributing'}
            />
            <MetricRow label="Veľké tx (24h)" value={`${data.whaleActivity.largeTransactions24h}`} />
            <MetricRow
              label="Net Flow"
              value={data.whaleActivity.netFlow === 'inflow' ? '📥 Na burzy' : data.whaleActivity.netFlow === 'outflow' ? '📤 Z búrz' : '➡️ Neutrálny'}
              positive={data.whaleActivity.netFlow === 'outflow'}
              negative={data.whaleActivity.netFlow === 'inflow'}
            />
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* 7. Institutional Flow */}
      <Collapsible>
        <div className="glass-card overflow-hidden">
          <CollapsibleTrigger className="w-full p-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Inštitucionálne toky
            </h2>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4">
            {data.institutionalFlow.map((inst, i) => (
              <MetricRow
                key={i}
                label={inst.label}
                value={inst.trend === 'buying' ? '🟢 Nákup' : inst.trend === 'selling' ? '🔴 Predaj' : '⚪ Neutrálny'}
                icon={Building2}
                positive={inst.trend === 'buying'}
                negative={inst.trend === 'selling'}
              />
            ))}
            <p className="text-[10px] text-muted-foreground mt-2">
              📊 Dáta sú odvodené z verejne dostupných zdrojov a heuristík.
            </p>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
