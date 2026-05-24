import { useEffect, useMemo, useState } from 'react';
import { Bitcoin, Wallet, Banknote, Check, Zap, History as HistoryIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatUsd } from '@/lib/crypto';
import { useProfitReservoir, deductReservoir } from '@/lib/profitReservoir';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { PriceData } from '@/lib/crypto';

interface Props {
  score: number;                    // Final_Score (0..100)
  btcPrice: number;                 // current BTC market price
  prices: PriceData | undefined;
  defaultAmount?: number;           // suggested planned BTC DCA in USD
}

function bandFor(score: number) {
  if (score <= 30) return { label: 'Deep Value', reservoirPct: 70, color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' };
  if (score <= 60) return { label: 'Neutral/Akumulácia', reservoirPct: 50, color: 'text-foreground', bg: 'bg-secondary', border: 'border-border' };
  return { label: 'Bullrun/Overheated', reservoirPct: 15, color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' };
}

function isoWeek(): number {
  const d = new Date();
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
}

export function BtcFundingSplitterCard({ score, btcPrice, defaultAmount = 100 }: Props) {
  const reservoir = useProfitReservoir();
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!amount && defaultAmount) setAmount(defaultAmount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAmount]);

  const band = bandFor(score);

  const split = useMemo(() => {
    const planned = Math.max(0, Number(amount) || 0);
    let fromReservoir = planned * (band.reservoirPct / 100);
    const cap = Math.max(0, reservoir.stable);
    if (fromReservoir > cap) fromReservoir = cap;
    const fromStables = Math.max(0, planned - fromReservoir);
    const effectivePct = planned > 0 ? (fromReservoir / planned) * 100 : 0;
    return { planned, fromReservoir, fromStables, effectivePct };
  }, [amount, band.reservoirPct, reservoir.stable]);

  const btcReceived = btcPrice > 0 ? split.planned / btcPrice : 0;

  const execute = async () => {
    if (busy) return;
    if (split.planned <= 0 || btcPrice <= 0) {
      toast.error('Zadaj sumu a počkaj na cenu BTC');
      return;
    }
    setBusy(true);
    try {
      // Insert DCA purchase — blends into cost basis automatically via usePortfolioMetrics
      const { error } = await supabase.from('dca_purchases').insert({
        week_number: isoWeek(),
        total_amount: split.planned,
        market_amount: split.planned,
        limit_amount: 0,
        btc_amount: btcReceived,
        eth_amount: 0,
        sol_amount: 0,
        btc_price: btcPrice,
        eth_price: 0,
        sol_price: 0,
        notes: `Split: ${split.effectivePct.toFixed(0)}% Profit / ${(100 - split.effectivePct).toFixed(0)}% Regular`,
      });
      if (error) throw error;

      if (split.fromReservoir > 0) {
        deductReservoir(
          split.fromReservoir,
          `DCA BTC Split: ${split.effectivePct.toFixed(0)}%/${(100 - split.effectivePct).toFixed(0)}%`,
        );
      }
      toast.success(`Vykonané: +${btcReceived.toFixed(6)} BTC · ${formatUsd(split.fromReservoir)} z rezervoáru`);
    } catch (e) {
      console.error(e);
      toast.error('Chyba pri ukladaní DCA');
    } finally {
      setTimeout(() => setBusy(false), 1200);
    }
  };

  const dcaLog = reservoir.log.filter(e => e.kind === 'DCA_SPLIT').slice(0, 20);

  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-emerald-500 via-amber-500 to-orange-500" />
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bitcoin className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">BTC DCA — Dynamický zdroj financovania</h3>
          </div>
          <Badge className={`text-[10px] ${band.bg} ${band.color} border ${band.border}`}>
            Score {score} · {band.label}
          </Badge>
        </div>

        {/* Amount input */}
        <label className="block">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wide">
            Plánovaná suma BTC DCA (USD)
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            className="mt-1 w-full bg-secondary border border-border rounded-lg px-3 py-2 text-lg font-semibold text-foreground tabular-nums focus:outline-none focus:border-primary"
          />
        </label>

        {/* Split panel */}
        <div className="rounded-lg border border-border/50 bg-secondary/30 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Odporúčaný zdroj ({band.reservoirPct}% z rezervoáru pri tomto skóre)
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-300 mb-1">
                <Wallet className="w-3 h-3" />
                Z Profit Reservoir
              </div>
              <p className="text-base font-bold tabular-nums text-emerald-200">{formatUsd(split.fromReservoir)}</p>
              <p className="text-[9px] text-muted-foreground">
                dostupné {formatUsd(reservoir.stable)}
              </p>
            </div>
            <div className="rounded-md bg-secondary/60 border border-border p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                <Banknote className="w-3 h-3" />
                Z bežných stables
              </div>
              <p className="text-base font-bold tabular-nums text-foreground">{formatUsd(split.fromStables)}</p>
              <p className="text-[9px] text-muted-foreground">
                {split.effectivePct.toFixed(0)}% / {(100 - split.effectivePct).toFixed(0)}%
              </p>
            </div>
          </div>

          {split.fromReservoir < split.planned * (band.reservoirPct / 100) && (
            <p className="text-[10px] text-amber-400">
              ⚠ Rezervoár nemá dosť — strop nastavený na dostupný zostatok.
            </p>
          )}
        </div>

        {/* BTC received preview */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-secondary/60 rounded-md p-2">
            <p className="text-[10px] text-muted-foreground">BTC cena</p>
            <p className="font-semibold tabular-nums">{btcPrice > 0 ? formatUsd(btcPrice) : '—'}</p>
          </div>
          <div className="bg-secondary/60 rounded-md p-2">
            <p className="text-[10px] text-muted-foreground">Získané BTC</p>
            <p className="font-semibold tabular-nums text-amber-300">{btcReceived.toFixed(6)} BTC</p>
          </div>
        </div>

        <Button
          onClick={execute}
          disabled={busy || split.planned <= 0 || btcPrice <= 0}
          className="w-full h-9 text-xs bg-amber-500/90 hover:bg-amber-500 text-black font-semibold"
        >
          {busy ? <><Zap className="w-3.5 h-3.5 mr-1.5 animate-pulse" /> Vykonávam…</>
                : <><Check className="w-3.5 h-3.5 mr-1.5" /> Označiť ako vykonané</>}
        </Button>

        {/* Log */}
        <div className="border-t border-border/40 pt-2">
          <button
            onClick={() => setShowLog(s => !s)}
            className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <HistoryIcon className="w-3 h-3" />
              DCA Split história ({dcaLog.length})
            </span>
            {showLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showLog && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {dcaLog.length === 0 && (
                <p className="text-[10px] text-center text-muted-foreground py-2">Zatiaľ žiadne záznamy.</p>
              )}
              {dcaLog.map((e, i) => (
                <div key={i} className="text-[10px] flex items-center justify-between rounded bg-secondary/30 px-2 py-1">
                  <span className="text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
                  <span className="font-mono tabular-nums">
                    <span className="text-emerald-300">−{formatUsd(e.usd)}</span>
                    {e.note && <span className="text-muted-foreground ml-2">{e.note}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
