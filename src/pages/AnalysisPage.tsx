import { useState } from 'react';
import { Lang } from '@/lib/i18n';
import { useTokenAnalysis, TokenAnalysis } from '@/hooks/useTokenAnalysis';
import { formatPrice, formatUsd } from '@/lib/crypto';
import { Sparkline } from '@/components/Sparkline';
import { TodayDecisions } from '@/components/decision/TodayDecisions';
import {
  TrendingUp, TrendingDown, Minus, Activity, ChevronDown, ChevronUp,
  BarChart3, Shield, Layers, Zap, AlertTriangle,
} from 'lucide-react';

interface Props { lang: Lang; }

function SignalBadge({ value, positive, negative }: { value: string; positive?: boolean; negative?: boolean }) {
  const cls = positive ? 'bg-gain/15 text-gain' : negative ? 'bg-loss/15 text-loss' : 'bg-muted text-muted-foreground';
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{value}</span>;
}

function IndicatorRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function GaugeBar({ value, min = 0, max = 100, color }: { value: number; min?: number; max?: number; color: string }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function TokenCard({ token, sk }: { token: TokenAnalysis; sk: boolean }) {
  const [open, setOpen] = useState(false);
  const TrendIcon = token.trend === 'up' ? TrendingUp : token.trend === 'down' ? TrendingDown : Minus;
  const trendColor = token.trend === 'up' ? 'text-gain' : token.trend === 'down' ? 'text-loss' : 'text-muted-foreground';

  const overallSignal = (() => {
    let score = 0;
    if (token.rsi14 < 30) score += 2; else if (token.rsi14 < 45) score += 1; else if (token.rsi14 > 70) score -= 2; else if (token.rsi14 > 55) score -= 1;
    if (token.macdSignal === 'bullish') score += 1; else if (token.macdSignal === 'bearish') score -= 1;
    if (token.bollingerPosition === 'lower') score += 1; else if (token.bollingerPosition === 'upper') score -= 1;
    if (token.trend === 'up') score += 1; else if (token.trend === 'down') score -= 1;
    if (score >= 2) return { label: sk ? 'NAKUPUJ' : 'BUY', positive: true, negative: false };
    if (score <= -2) return { label: sk ? 'PREDAJ' : 'SELL', positive: false, negative: true };
    return { label: sk ? 'DRŽ' : 'HOLD', positive: false, negative: false };
  })();

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <button onClick={() => setOpen(!open)} className="w-full p-4 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: token.color + '20', color: token.color }}
        >
          {token.symbol.slice(0, 2)}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">{token.symbol}</span>
            <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
            <SignalBadge value={overallSignal.label} positive={overallSignal.positive} negative={overallSignal.negative} />
          </div>
          <p className="text-xs text-muted-foreground">{formatPrice(token.price)}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-medium ${token.change24h >= 0 ? 'text-gain' : 'text-loss'}`}>
            {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
          </p>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground mt-1 ml-auto" /> : <ChevronDown className="w-4 h-4 text-muted-foreground mt-1 ml-auto" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Sparkline */}
          {token.sparkline7d.length > 5 && (
            <div className="h-16">
              <Sparkline data={token.sparkline7d} color={token.color} height={64} />
            </div>
          )}

          {/* Price changes */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: '24h', val: token.change24h },
              { label: '7d', val: token.change7d },
              { label: '30d', val: token.change30d },
            ].map((p) => (
              <div key={p.label} className="bg-secondary/50 rounded-lg p-2">
                <p className="text-[9px] text-muted-foreground">{p.label}</p>
                <p className={`text-sm font-bold ${p.val >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {p.val >= 0 ? '+' : ''}{p.val.toFixed(1)}%
                </p>
              </div>
            ))}
          </div>

          {/* Technical Analysis */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              {sk ? 'Technická analýza' : 'Technical Analysis'}
            </h3>
            <IndicatorRow label="RSI (14)">
              <GaugeBar value={token.rsi14} color={token.rsi14 < 30 ? '#22c55e' : token.rsi14 > 70 ? '#ef4444' : token.color} />
              <SignalBadge
                value={token.rsi14.toFixed(0)}
                positive={token.rsi14 < 30}
                negative={token.rsi14 > 70}
              />
            </IndicatorRow>
            <IndicatorRow label="MACD">
              <SignalBadge
                value={token.macdSignal === 'bullish' ? (sk ? 'Býčí' : 'Bullish') : token.macdSignal === 'bearish' ? (sk ? 'Medvedí' : 'Bearish') : (sk ? 'Neutrálny' : 'Neutral')}
                positive={token.macdSignal === 'bullish'}
                negative={token.macdSignal === 'bearish'}
              />
            </IndicatorRow>
            <IndicatorRow label="Bollinger">
              <SignalBadge
                value={token.bollingerPosition === 'upper' ? (sk ? 'Horné' : 'Upper') : token.bollingerPosition === 'lower' ? (sk ? 'Dolné' : 'Lower') : (sk ? 'Stred' : 'Middle')}
                positive={token.bollingerPosition === 'lower'}
                negative={token.bollingerPosition === 'upper'}
              />
            </IndicatorRow>
            <IndicatorRow label={sk ? 'Trend' : 'Trend'}>
              <TrendIcon className={`w-4 h-4 ${trendColor}`} />
              <span className={`text-xs font-medium ${trendColor}`}>
                {token.trend === 'up' ? (sk ? 'Rastúci' : 'Up') : token.trend === 'down' ? (sk ? 'Klesajúci' : 'Down') : (sk ? 'Bokom' : 'Sideways')}
              </span>
            </IndicatorRow>
            <IndicatorRow label={sk ? 'Volatilita (ročná)' : 'Volatility (ann.)'}>
              <span className="text-xs font-medium text-foreground">{token.volatility30d.toFixed(0)}%</span>
            </IndicatorRow>
            <IndicatorRow label={sk ? 'Podpora' : 'Support'}>
              <span className="text-xs font-bold text-gain">{formatPrice(token.support)}</span>
            </IndicatorRow>
            <IndicatorRow label={sk ? 'Odpor' : 'Resistance'}>
              <span className="text-xs font-bold text-loss">{formatPrice(token.resistance)}</span>
            </IndicatorRow>
          </div>

          {/* Fibonacci */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Fibonacci
            </h3>
            <div className="grid grid-cols-4 gap-1">
              {token.fibLevels.map((f) => (
                <div key={f.level} className="bg-secondary/50 rounded p-1.5 text-center">
                  <p className="text-[8px] text-muted-foreground">{f.level}</p>
                  <p className="text-[10px] font-bold text-foreground">{formatPrice(f.price)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Fundamentals */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              {sk ? 'Fundamenty' : 'Fundamentals'}
            </h3>
            <IndicatorRow label={sk ? 'Trhová kap.' : 'Market Cap'}>
              <span className="text-xs font-medium text-foreground">{formatUsd(token.marketCap)}</span>
            </IndicatorRow>
            <IndicatorRow label={sk ? 'Objem 24h' : 'Volume 24h'}>
              <span className="text-xs font-medium text-foreground">{formatUsd(token.totalVolume)}</span>
            </IndicatorRow>
            <IndicatorRow label={sk ? 'Staking %' : 'Staking %'}>
              <GaugeBar value={token.stakingPct} color={token.color} />
              <span className="text-xs font-medium text-foreground">{token.stakingPct}%</span>
            </IndicatorRow>
            <IndicatorRow label={sk ? 'Zdravie siete' : 'Network'}>
              <SignalBadge
                value={token.networkHealth === 'strong' ? (sk ? 'Silná' : 'Strong') : token.networkHealth === 'moderate' ? (sk ? 'Stredná' : 'Moderate') : (sk ? 'Slabá' : 'Weak')}
                positive={token.networkHealth === 'strong'}
                negative={token.networkHealth === 'weak'}
              />
            </IndicatorRow>
            <IndicatorRow label={sk ? 'Od ATH' : 'From ATH'}>
              <span className="text-xs font-bold text-loss">{token.athChangePercentage.toFixed(1)}%</span>
            </IndicatorRow>
          </div>
        </div>
      )}
    </div>
  );
}

export function AnalysisPage({ lang }: Props) {
  const { data, isLoading, error } = useTokenAnalysis();
  const sk = lang === 'sk';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <BarChart3 className="w-5 h-5" />
        {sk ? 'Analýza' : 'Analysis'}
      </h1>
      <p className="text-xs text-muted-foreground">
        {sk ? 'Technická a fundamentálna analýza podľa tokenu' : 'Technical & fundamental analysis per token'}
      </p>

      <TodayDecisions lang={lang} />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : error || !data || data.length === 0 ? (
        <div className="glass-card p-6 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-warning mx-auto" />
          <p className="text-sm font-medium text-foreground">
            {sk ? 'Dáta momentálne nedostupné' : 'Data currently unavailable'}
          </p>
          <p className="text-xs text-muted-foreground">
            {sk ? 'Skúste to znova o chvíľu. API môže byť dočasne nedostupné.' : 'Try again in a moment. API may be temporarily unavailable.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((token) => (
            <TokenCard key={token.id} token={token} sk={sk} />
          ))}
        </div>
      )}
    </div>
  );
}
