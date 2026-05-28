import { useMemo, useState } from 'react';
import { AlertOctagon, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePrices } from '@/hooks/usePrices';
import { useLiquidationLevels, setLiquidationLevel, evaluateLiquidations, BUFFER_PCT, type LiqSymbol } from '@/lib/liquidationLevels';
import { formatPrice } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';

const ROWS: { sym: LiqSymbol; cg: string }[] = [
  { sym: 'BTC', cg: 'bitcoin' },
  { sym: 'SOL', cg: 'solana' },
];

interface Props { lang: Lang; }

export function LiquidationLevelsCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { data: prices } = usePrices();
  const store = useLiquidationLevels();
  const [draft, setDraft] = useState<Partial<Record<LiqSymbol, string>>>({});

  const status = useMemo(() => {
    const map = {
      BTC: prices?.['bitcoin']?.usd,
      SOL: prices?.['solana']?.usd,
      ETH: prices?.['ethereum']?.usd,
    } as Partial<Record<LiqSymbol, number>>;
    return new Map(evaluateLiquidations(map).map(s => [s.symbol, s]));
  }, [prices, store]);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-rose-400" />
        <h2 className="text-sm font-bold text-foreground">
          {sk ? 'Likvidačné úrovne (DeFi)' : 'Liquidation Levels (DeFi)'}
        </h2>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {sk
          ? `Zadaj cenu, pri ktorej sa ti likviduje pozícia. Ak sa trh dostane do ${BUFFER_PCT}% pásma, dostaneš kritický alert na úvodnej stránke.`
          : `Enter the price at which your position liquidates. If market price comes within ${BUFFER_PCT}%, you get a critical alert on the Dashboard.`}
      </p>

      <div className="space-y-2">
        {ROWS.map(({ sym, cg }) => {
          const stored = store.levels[sym];
          const value = draft[sym] ?? (stored != null ? String(stored) : '');
          const market = prices?.[cg]?.usd ?? 0;
          const st = status.get(sym);
          const critical = !!st?.critical;
          const borderCls = critical
            ? 'border-rose-500/60 bg-rose-500/10 animate-pulse'
            : 'border-border bg-secondary/40';

          return (
            <div key={sym} className={`rounded-lg border ${borderCls} p-3 space-y-2 transition-colors`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">{sym}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {sk ? 'trh' : 'mkt'} {market > 0 ? formatPrice(market) : '—'}
                  </span>
                </div>
                {st && (
                  <span className={`text-[10px] font-bold tabular-nums ${critical ? 'text-rose-300' : 'text-muted-foreground'}`}>
                    {st.distancePct >= 0 ? '+' : ''}{st.distancePct.toFixed(1)}%
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder={sk ? 'Likvidačná cena USD' : 'Liquidation price USD'}
                  value={value}
                  onChange={e => setDraft(prev => ({ ...prev, [sym]: e.target.value }))}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={() => {
                    const num = parseFloat((value ?? '').replace(',', '.'));
                    setLiquidationLevel(sym, Number.isFinite(num) && num > 0 ? num : null);
                    setDraft(prev => ({ ...prev, [sym]: '' }));
                  }}
                >
                  {sk ? 'Uložiť' : 'Save'}
                </Button>
                {stored != null && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-[11px] text-muted-foreground"
                    onClick={() => { setLiquidationLevel(sym, null); setDraft(prev => ({ ...prev, [sym]: '' })); }}
                  >
                    ✕
                  </Button>
                )}
              </div>

              {stored != null && (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {sk ? 'Uložené' : 'Saved'}: <span className="text-foreground">{formatPrice(stored)}</span>
                  {' · '}{sk ? 'pásmo' : 'buffer'} {formatPrice(stored * (1 + BUFFER_PCT / 100))}
                  {critical && (
                    <span className="ml-2 inline-flex items-center gap-1 text-rose-300 font-bold">
                      <AlertOctagon className="w-3 h-3" /> {sk ? 'KRITICKÉ' : 'CRITICAL'}
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
