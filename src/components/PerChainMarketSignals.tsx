import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { useTokenAnalysis, TokenAnalysis } from '@/hooks/useTokenAnalysis';
import { useChainFilter, passesChainFilter } from '@/hooks/useChainFilter';

type Signal = 'bullish' | 'neutral' | 'bearish';

interface SignalCard {
  symbol: string;
  color: string;
  rsi: number;
  rsiSignal: Signal;
  trendPct: number;
  trendSignal: Signal;
  volatility: number;
  sentiment: Signal;
  stakingMomentum: 'up' | 'flat' | 'down';
  notes: string[];
}

const COLORS: Record<string, string> = {
  BTC: '#f7931a',
  ETH: '#627eea',
  SOL: '#14f195',
};

function rsiToSignal(rsi: number): Signal {
  if (rsi > 70) return 'bearish'; // overbought
  if (rsi < 30) return 'bullish'; // oversold
  return 'neutral';
}

function trendToSignal(pct: number): Signal {
  if (pct > 5) return 'bullish';
  if (pct < -5) return 'bearish';
  return 'neutral';
}

function combineSentiment(rsi: Signal, trend: Signal, macd: Signal): Signal {
  const score = [rsi, trend, macd].reduce((s, v) => s + (v === 'bullish' ? 1 : v === 'bearish' ? -1 : 0), 0);
  if (score >= 2) return 'bullish';
  if (score <= -2) return 'bearish';
  return 'neutral';
}

function buildCard(t: TokenAnalysis): SignalCard {
  const rsiSignal = rsiToSignal(t.rsi14);
  const trendSignal = t.trend === 'up' ? 'bullish' : t.trend === 'down' ? 'bearish' : 'neutral';
  const macdSignal: Signal = t.macdSignal === 'bullish' ? 'bullish' : t.macdSignal === 'bearish' ? 'bearish' : 'neutral';
  const sentiment = combineSentiment(rsiSignal, trendSignal, macdSignal);

  // Heuristic staking momentum (only ETH/SOL have staking)
  let stakingMomentum: 'up' | 'flat' | 'down' = 'flat';
  if (t.symbol === 'ETH' || t.symbol === 'SOL') {
    if (t.stakingPct >= 5) stakingMomentum = 'up';
    else if (t.stakingPct <= 3) stakingMomentum = 'down';
  }

  const notes: string[] = [];
  if (t.rsi14 > 70) notes.push('RSI prepredané');
  else if (t.rsi14 < 30) notes.push('RSI prekúpené (zóna nákupu)');
  if (t.bollingerPosition === 'upper') notes.push('Cena pri hornom Bollinger pásme');
  if (t.bollingerPosition === 'lower') notes.push('Cena pri spodnom Bollinger pásme');
  if (t.volatility > 0.05) notes.push('Vysoká volatilita');
  if (notes.length === 0) notes.push('Stabilný trh, bez extrémov');

  return {
    symbol: t.symbol,
    color: COLORS[t.symbol] ?? '#888',
    rsi: t.rsi14,
    rsiSignal,
    trendPct: t.priceChange7d ?? 0,
    trendSignal,
    volatility: t.volatility,
    sentiment,
    stakingMomentum,
    notes,
  };
}

function signalClasses(s: Signal): { bg: string; text: string; label: string } {
  switch (s) {
    case 'bullish': return { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-500', label: 'BULLISH' };
    case 'bearish': return { bg: 'bg-destructive/15 border-destructive/30', text: 'text-destructive', label: 'BEARISH' };
    case 'neutral': return { bg: 'bg-muted/30 border-border', text: 'text-muted-foreground', label: 'NEUTRAL' };
  }
}

function SignalIcon({ signal, className }: { signal: Signal; className?: string }) {
  if (signal === 'bullish') return <TrendingUp className={className} />;
  if (signal === 'bearish') return <TrendingDown className={className} />;
  return <Minus className={className} />;
}

export function PerChainMarketSignals() {
  const { data: analysis, isLoading } = useTokenAnalysis();
  const { chain } = useChainFilter();

  const cards = useMemo<SignalCard[]>(() => {
    if (!analysis) return [];
    return analysis
      .filter(t => passesChainFilter(t.symbol, chain))
      .filter(t => ['BTC', 'ETH', 'SOL'].includes(t.symbol))
      .map(buildCard);
  }, [analysis, chain]);

  if (isLoading) {
    return (
      <div className="glass-card p-4 text-xs text-muted-foreground">Načítavam trhové signály…</div>
    );
  }

  if (cards.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Per-chain trhové signály</h2>
      </div>
      <div className="space-y-2">
        {cards.map(c => {
          const overall = signalClasses(c.sentiment);
          const rsi = signalClasses(c.rsiSignal);
          const trend = signalClasses(c.trendSignal);
          return (
            <div key={c.symbol} className={`glass-card p-3 space-y-2 border ${overall.bg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="font-bold text-sm text-foreground">{c.symbol}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${overall.bg} ${overall.text}`}>
                  {overall.label}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className={`rounded-md border p-2 ${rsi.bg}`}>
                  <p className="text-[9px] text-muted-foreground uppercase">RSI</p>
                  <div className="flex items-center gap-1">
                    <SignalIcon signal={c.rsiSignal} className={`w-3 h-3 ${rsi.text}`} />
                    <span className={`text-xs font-bold ${rsi.text}`}>{c.rsi.toFixed(0)}</span>
                  </div>
                </div>
                <div className={`rounded-md border p-2 ${trend.bg}`}>
                  <p className="text-[9px] text-muted-foreground uppercase">Trend 7d</p>
                  <div className="flex items-center gap-1">
                    <SignalIcon signal={c.trendSignal} className={`w-3 h-3 ${trend.text}`} />
                    <span className={`text-xs font-bold ${trend.text}`}>
                      {c.trendPct >= 0 ? '+' : ''}{c.trendPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <p className="text-[9px] text-muted-foreground uppercase">
                    {c.symbol === 'BTC' ? 'Volatilita' : 'Staking'}
                  </p>
                  <p className="text-xs font-bold text-foreground">
                    {c.symbol === 'BTC'
                      ? `${(c.volatility * 100).toFixed(1)}%`
                      : c.stakingMomentum === 'up' ? '↑ rastie' : c.stakingMomentum === 'down' ? '↓ klesá' : '→ stabilné'}
                  </p>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t border-border/50">
                {c.notes.join(' · ')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
