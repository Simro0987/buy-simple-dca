import { useMemo } from 'react';
import { Zap, TrendingUp, TrendingDown, Activity, Copy, Info } from 'lucide-react';
import { toast } from 'sonner';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import {
  calcUnifiedExecution,
  fixedExecution,
  type CoinKey,
} from '@/lib/dynamicExecution';
import { formatPrice, formatLimitPrice, type PriceData } from '@/lib/crypto';

interface Props {
  score: number;
  prices: PriceData | undefined;
  /** Týždenná alokácia v USD (z Final Score × kapitál). Rozdelí sa medzi BTC/ETH/SOL. */
  investableUsd: number;
}

const COIN_PRICE_KEY: Record<CoinKey, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
};

// Cieľové portfólio váhy: BTC 64% / ETH 25% / SOL 11% (bez HYPE).
const TARGET_WEIGHTS: Record<CoinKey, number> = {
  btc: 0.64,
  eth: 0.25,
  sol: 0.11,
};

const COIN_LABEL_WEIGHT: Record<CoinKey, string> = {
  btc: '64%',
  eth: '25%',
  sol: '11%',
};

/**
 * Plne automatický engine.
 * - Market% / Limit% sú **rovnaké pre všetky tokeny** (riadi ich Score + agregované 14D momentum).
 * - Limit Distance % je **per-coin** (riadi ho 14D volatilita daného tokenu).
 */
export function DynamicExecutionCard({ score, prices, investableUsd }: Props) {
  const { data: metrics, isLoading } = usePerCoinMetrics();

  const result = useMemo(() => {
    if (!metrics) {
      const fallback = {
        btc: fixedExecution('btc'),
        eth: fixedExecution('eth'),
        sol: fixedExecution('sol'),
      };
      return {
        executions: fallback,
        sharedMarketPct: 60,
        sharedLimitPct: 40,
        sharedMomentumAvg: 0,
        sharedMomentumAdj: 0,
        base: { marketPct: 60, limitPct: 40, distance: -4 },
      };
    }
    return calcUnifiedExecution(score, metrics);
  }, [metrics, score]);

  const { executions, sharedMarketPct, sharedLimitPct, sharedMomentumAvg, sharedMomentumAdj, base } = result;
  const coins: CoinKey[] = ['btc', 'eth', 'sol'];

  // "Prečo Market/Limit?" — vychádza zo skóre a momenta
  const splitReason = useMemo(() => {
    const scorePart =
      score <= 25 ? `Skóre ${score} → trh je lacný, base ${base.marketPct}/${base.limitPct} (viac market).`
      : score <= 45 ? `Skóre ${score} → mierne lacný, base ${base.marketPct}/${base.limitPct}.`
      : score <= 60 ? `Skóre ${score} → neutrálny, base ${base.marketPct}/${base.limitPct}.`
      : score <= 75 ? `Skóre ${score} → drahší, base ${base.marketPct}/${base.limitPct} (viac limit).`
      : `Skóre ${score} → veľmi drahý, base ${base.marketPct}/${base.limitPct} (najviac limit).`;
    const momPart =
      sharedMomentumAdj === 0
        ? `Priemerné 14D momentum ${sharedMomentumAvg.toFixed(1)}% — bez úpravy.`
        : sharedMomentumAvg > 0
        ? `Priemerné 14D momentum +${sharedMomentumAvg.toFixed(1)}% (uptrend) → +${sharedMomentumAdj}% k market% (chyť trend).`
        : `Priemerné 14D momentum ${sharedMomentumAvg.toFixed(1)}% (downtrend) → +${sharedMomentumAdj}% k market% (defenzívne nakupuj pokles).`;
    return `${scorePart} ${momPart}`;
  }, [score, base, sharedMomentumAvg, sharedMomentumAdj]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Skopírované');
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Dynamic Execution Engine</h3>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-primary/15 text-primary">
          AUTO
        </span>
      </div>

      {isLoading && (
        <p className="text-[11px] text-muted-foreground">Načítavam 14D volatilitu a momentum…</p>
      )}

      {/* JEDNOTNÝ Market / Limit split (rovnaký pre všetky tokeny) */}
      <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Market / Limit split (všetky tokeny)
          </p>
          <span className="text-[10px] tabular-nums font-bold text-foreground">
            M{Math.round(sharedMarketPct)} / L{Math.round(sharedLimitPct)}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-background/50 overflow-hidden flex">
          <div className="h-full bg-primary" style={{ width: `${sharedMarketPct}%` }} />
          <div className="h-full bg-emerald-500/70" style={{ width: `${sharedLimitPct}%` }} />
        </div>
        <div className="flex items-start gap-1.5 pt-1 border-t border-border">
          <Info className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-foreground/80 leading-snug">
            <span className="font-semibold">Prečo {Math.round(sharedMarketPct)}/{Math.round(sharedLimitPct)}? </span>
            {splitReason}
          </p>
        </div>
      </div>

      {/* PER-COIN: alokácia USD → Market / Limit + distance */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Rozdelenie alokácie podľa tokenov
          </p>
          <span className="text-[10px] tabular-nums text-foreground font-semibold">
            Σ ${investableUsd.toFixed(0)}
          </span>
        </div>
        {coins.map(c => {
          const e = executions[c];
          const price = prices?.[COIN_PRICE_KEY[c]]?.usd ?? 0;
          const limitPrice = price * (1 + e.limitDistancePct / 100);
          const MomIcon = e.momentum30d >= 0 ? TrendingUp : TrendingDown;
          const momColor = e.momentum30d >= 0 ? 'text-emerald-400' : 'text-rose-400';

          // Suma pre tento token podľa cieľovej váhy v portfóliu
          const coinUsd = investableUsd * TARGET_WEIGHTS[c];
          const marketUsd = coinUsd * (e.marketPct / 100);
          const limitUsd = coinUsd * (e.limitPct / 100);

          return (
            <div key={c} className="bg-secondary/40 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-foreground">{e.symbol}</span>
                  <span className="text-[9px] text-muted-foreground">váha {COIN_LABEL_WEIGHT[c]}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] tabular-nums">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Activity className="w-3 h-3" /> vol {e.volatility30d.toFixed(2)}%
                  </span>
                  <span className={`flex items-center gap-1 ${momColor}`}>
                    <MomIcon className="w-3 h-3" />
                    {e.momentum30d >= 0 ? '+' : ''}{e.momentum30d.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Suma pre token */}
              <div className="flex items-center justify-between bg-background/40 rounded px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">Alokácia tokenu</p>
                <p className="text-sm font-bold text-foreground tabular-nums">
                  ${coinUsd.toFixed(2)}
                </p>
              </div>

              {/* Market / Limit rozdelenie sumy */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-primary/10 rounded p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-primary font-semibold">MARKET {e.marketPct}%</p>
                    <button
                      onClick={() => copy(marketUsd.toFixed(2))}
                      className="p-0.5 rounded text-primary hover:bg-primary/20 active:scale-95"
                      aria-label={`Kopíruj market USD ${e.symbol}`}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-foreground tabular-nums">
                    ${marketUsd.toFixed(2)}
                  </p>
                  <p className="text-[9px] text-muted-foreground">teraz, za trhovú cenu</p>
                </div>
                <div className="bg-emerald-500/10 rounded p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-emerald-400 font-semibold">LIMIT {e.limitPct}%</p>
                    <button
                      onClick={() => copy(limitUsd.toFixed(2))}
                      className="p-0.5 rounded text-emerald-400 hover:bg-emerald-500/20 active:scale-95"
                      aria-label={`Kopíruj limit USD ${e.symbol}`}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-foreground tabular-nums">
                    ${limitUsd.toFixed(2)}
                  </p>
                  <p className="text-[9px] text-muted-foreground">limit @ {e.limitDistancePct.toFixed(1)}%</p>
                </div>
              </div>

              {/* Limit cena (kopírovateľná) */}
              <div className="flex items-center justify-between gap-2 bg-background/40 rounded px-2 py-1.5">
                <div>
                  <p className="text-[10px] text-muted-foreground">Limit cena ({e.limitDistancePct.toFixed(1)}%)</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {price > 0 ? formatPrice(limitPrice) : '—'}
                  </p>
                </div>
                <button
                  onClick={() => price > 0 && copy(limitPrice.toFixed(2))}
                  disabled={price <= 0}
                  className="p-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={`Kopíruj limit cenu ${e.symbol}`}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[10px] text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground/80">Prečo? </span>
                {e.rationale}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
