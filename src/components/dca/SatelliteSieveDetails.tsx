import { useState } from 'react';
import { ChevronDown, CheckCircle2, XCircle, Loader2, PauseCircle } from 'lucide-react';
import type { SieveResult } from '@/lib/dcaBasketEngine';

const usd = (n: number) => n.toFixed(2).replace('.', ',');

/** Jednotné „ANALYTICKÉ DETAILY“ sekvenčného sita pre každý satelit. */
export function SatelliteSieveDetails({ symbol, sieve, baselineUsd, recipients }: {
  symbol: string; sieve: SieveResult; baselineUsd: number; recipients: { symbol: string; usd: number }[];
}) {
  const [open, setOpen] = useState(sieve.passed === false);
  const failed = sieve.passed === false;
  const totalRecv = recipients.reduce((s, r) => s + r.usd, 0) || 1;
  return (
    <div className="space-y-1.5">
      {failed && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-2 py-1.5 space-y-0.5">
          <p className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-destructive">
            <PauseCircle className="h-3.5 w-3.5" /> {sieve.kind === 'highbeta' || sieve.kind === 'proxy' ? 'NÁKUP ZAMIETNUTÝ' : 'DCA POZASTAVENÉ'} · {symbol}
          </p>
          <p className="text-[10px] text-foreground/90">{sieve.reason}. Alokácia = 0 %.</p>
          {baselineUsd > 0.005 && recipients.length > 0 && (
            <p className="text-[10px] font-semibold text-primary">
              {recipients.map((r) => `$${usd((baselineUsd * r.usd) / totalRecv)} presmerovaných do ${r.symbol}`).join(' · ')}
            </p>
          )}
          {baselineUsd > 0.005 && recipients.length === 0 && (
            <p className="text-[10px] font-semibold text-primary">${usd(baselineUsd)} presmerovaných do CORE (BTC)</p>
          )}
        </div>
      )}
      {sieve.kind === 'proxy' && (
        <div className="flex items-center justify-between rounded-lg bg-secondary/30 ring-1 ring-border/70 px-2 py-1.5 text-[10px] font-bold">
          <span className="text-muted-foreground">Tech. skóre <span className="text-foreground tabular-nums">{sieve.score ?? 0}/3</span></span>
          <span className={(sieve.multiplier ?? 0) === 0 ? 'text-destructive' : (sieve.multiplier ?? 0) > 1 ? 'text-primary' : (sieve.multiplier ?? 0) < 1 ? 'text-amber-300' : 'text-foreground'}>
            mNAV násobič: {sieve.passed === false ? 0 : Math.round((sieve.multiplier ?? 1) * 100)} %
          </span>
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between rounded-lg bg-secondary/30 ring-1 ring-border/70 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <span>Analytické detaily · sito</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-1">
          {sieve.checks.map((c) => (
            <div key={c.step} className={`rounded-lg px-2 py-1.5 ring-1 ${c.passed === true ? 'bg-primary/10 ring-primary/30' : c.passed === false ? 'bg-destructive/10 ring-destructive/40' : 'bg-muted/40 ring-border'}`}>
              <p className="flex items-center gap-1 text-[10px] font-bold text-foreground">
                {c.passed === true ? <CheckCircle2 className="h-3 w-3 text-primary" /> : c.passed === false ? <XCircle className="h-3 w-3 text-destructive" /> : <Loader2 className="h-3 w-3 text-muted-foreground" />}
                {c.label}
                <span className={`ml-auto text-[9px] ${c.passed === true ? 'text-primary' : c.passed === false ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {c.passed === true ? 'PREŠIEL' : c.passed === false ? 'ZLYHAL' : '—'}
                </span>
              </p>
              <p className="text-[9px] text-muted-foreground tabular-nums">{c.detail}</p>
              {c.points && (
                <ul className="mt-1 space-y-0.5">
                  {c.points.map((pt) => (
                    <li key={pt.label} className="flex items-center gap-1 text-[9px]">
                      {pt.passed === true ? <CheckCircle2 className="h-2.5 w-2.5 text-primary" /> : pt.passed === false ? <XCircle className="h-2.5 w-2.5 text-destructive" /> : <Loader2 className="h-2.5 w-2.5 text-muted-foreground" />}
                      <span className="text-foreground/90">{pt.label}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">{pt.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
