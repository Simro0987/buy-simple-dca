import { Info } from 'lucide-react';
import { TOKENS, formatPrice } from '@/lib/crypto';
import { useDynamicLimits } from '@/hooks/useDynamicLimits';
import { usePrices } from '@/hooks/usePrices';

/**
 * Prehľadný panel "Ako sa počíta môj limit %".
 * Ukazuje pre každý coin:
 *  - dynamickú zľavu z indikátorov (volatilita 7d)
 *  - minimálny spread oproti BTC (+1pp ETH, +2pp SOL)
 *  - finálnu limitnú cenu vs. trhovú
 */
const MIN_SPREAD: Record<string, number> = { eth: 1, sol: 2 };

export function LimitExplainerCard() {
  const limits = useDynamicLimits();
  const { data: prices } = usePrices();
  const btc = limits['btc'];

  return (
    <div className="glass-card p-4">
      <div className="flex items-start gap-2 mb-3">
        <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <h2 className="text-sm font-bold text-foreground">Ako sa počíta môj limit %</h2>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Limit zľava = dynamická hodnota z volatility (7d) + minimálny spread oproti BTC.
            ETH musí mať aspoň <span className="text-foreground font-semibold">+1 pp</span>,
            SOL aspoň <span className="text-foreground font-semibold">+2 pp</span> väčšiu zľavu ako BTC.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {TOKENS.map(t => {
          const info = limits[t.id];
          if (!info) return null;
          const price = prices?.[t.coingeckoId]?.usd ?? 0;
          const limitPrice = price * info.discountFrac;
          const minSpread = MIN_SPREAD[t.id] ?? 0;
          const btcPct = btc?.discountPct ?? 0;
          const requiredFloor = minSpread > 0 ? btcPct + minSpread : null;
          const spreadActive = requiredFloor != null && info.discountPct <= requiredFloor + 0.01;

          return (
            <div key={t.id} className="bg-secondary/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                  <span className="text-sm font-bold text-foreground">{t.symbol}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide ${
                    info.source === 'dynamic'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-amber-500/15 text-amber-400'
                  }`}>
                    {info.source === 'dynamic' ? 'Dynamický' : 'Fallback'}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold tabular-nums text-foreground">
                    −{info.discountPct.toFixed(2)} %
                  </p>
                  {price > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      limit ≈ {formatPrice(limitPrice)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-background/40 rounded p-1.5">
                  <p className="text-muted-foreground">Z indikátorov (vol. 7d)</p>
                  <p className="font-semibold text-foreground tabular-nums">
                    −{info.discountPct.toFixed(2)} %
                  </p>
                </div>
                <div className="bg-background/40 rounded p-1.5">
                  <p className="text-muted-foreground">
                    {minSpread > 0 ? `Min vs BTC (+${minSpread} pp)` : 'Bazálny min/max'}
                  </p>
                  <p className={`font-semibold tabular-nums ${spreadActive ? 'text-amber-400' : 'text-foreground'}`}>
                    {requiredFloor != null
                      ? `≥ −${requiredFloor.toFixed(2)} %`
                      : `−2 % … −5 %`}
                  </p>
                </div>
              </div>

              {spreadActive && (
                <p className="text-[10px] text-amber-400 mt-1.5 leading-snug">
                  Aktívny minimálny spread — limit je posunutý, aby bol o {minSpread} pp ďalej od trhu ako BTC.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">Vzorec:</span>{' '}
          discount = clamp(dailyVolatility × k, min, max), pričom k a hranice rastú od BTC → ETH → SOL
          (BTC 2–5 %, ETH 4–9 %, SOL 6–12 %). Následne sa vynúti minimálny spread voči BTC.
        </p>
      </div>
    </div>
  );
}
