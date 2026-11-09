import { useMstrMnav, useProxyPoolFlow } from '@/lib/mstrFundamentals';
import type { SieveResult } from '@/lib/dcaBasketEngine';

const usd = (n: number) => `$${n.toFixed(2).replace('.', ',')}`;

/** Automatické mNAV + násobič + tok cez globálny bonus_pool (MSTR karta). */
export function MstrMnavPanel({ sieve }: { sieve?: SieveResult }) {
  const q = useMstrMnav();
  const flow = useProxyPoolFlow();
  const mult = sieve?.passed === false ? 0 : sieve?.passed === true ? (sieve.multiplier ?? 1) : null;
  const multLabel = mult === null ? 'Vyhodnocujem…' : mult === 1.5 ? '150 % · DEEP BOOST' : mult === 1 ? '100 % · NORMÁL' : mult === 0.5 ? '50 % · REDUCE' : '0 % · ZAMIETNUTÉ';
  return (
    <div className="rounded-lg bg-secondary/30 ring-1 ring-border/70 px-2 py-1.5 space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold uppercase tracking-wide text-muted-foreground">mNAV prémia</span>
        {q.data ? (
          <span className="font-black tabular-nums text-foreground">{q.data.mnav.toFixed(2).replace('.', ',')}×</span>
        ) : (
          <span className="font-bold text-amber-300">{q.isLoading ? 'Načítavam...' : 'Dáta nedostupné'}</span>
        )}
      </div>
      {q.data && (
        <p className="text-[9px] text-muted-foreground">
          {q.data.method === 'scraped' ? 'Stiahnuté' : 'Vypočítané'} · {q.data.source}{q.data.estimated ? ' · odhad' : ''}
        </p>
      )}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Násobič alokácie</span>
        <span className={`font-bold ${mult === 0 ? 'text-destructive' : mult === 1.5 ? 'text-primary' : mult === 0.5 ? 'text-amber-300' : 'text-foreground'}`}>{multLabel}</span>
      </div>
      {flow.toPoolUsd > 0.01 && (
        <p className="text-[10px] font-semibold text-amber-300">{usd(flow.toPoolUsd)} → globálny bonus_pool (→ ostatné Boost tokeny / CORE BTC)</p>
      )}
      {flow.fromPoolUsd > 0.01 && (
        <p className="text-[10px] font-semibold text-primary">+{usd(flow.fromPoolUsd)} z globálneho bonus_poolu</p>
      )}
      {flow.fromReserveUsd > 0.01 && (
        <p className="text-[10px] font-semibold text-primary">+{usd(flow.fromReserveUsd)} z Hotovostnej rezervy (bonus_pool prázdny)</p>
      )}
    </div>
  );
}
