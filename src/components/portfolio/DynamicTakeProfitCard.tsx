import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Target, History as HistoryIcon, ChevronDown, ChevronUp, Wallet, Flame } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useProfitReservoir, addTakeProfit, resetReservoir } from '@/lib/profitReservoir';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { toast } from 'sonner';
import { BentoCard } from '@/components/portfolio/ui/BentoCard';

const TOKEN_DECIMALS: Record<string, number> = { BTC: 6, ETH: 5, SOL: 3 };

function CopyChip({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(`${label ?? 'Skopírované'}: ${text}`);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex items-center gap-1 select-all font-mono tabular-nums text-xs px-2 py-1 rounded-md bg-secondary text-secondary-foreground active:bg-primary active:text-primary-foreground"
    >
      <span>{text}</span>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-60" />}
    </button>
  );
}

interface Props { lang: Lang; }

export function DynamicTakeProfitCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { metrics } = usePortfolio();
  const reservoir = useProfitReservoir();
  const [busy, setBusy] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  // Money Mode (Cycle Engine) — PARABOLIC = trh prepálený → take-profit prioritne
  const { data: prices } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycle = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });
  const parabolic = (cycle?.score ?? 0) >= 80 || cycle?.zone === 'euphoria';

  const rows = useMemo(() => {
    return metrics.assets.map(a => {
      // metrics.assets.holdings already reflects reservoir.sells (subtracted in usePortfolioMetrics)
      const adjHoldings = a.holdings;
      const originalHoldings = adjHoldings + Number(reservoir.sells[a.symbol] ?? 0);
      const avgCost = originalHoldings > 0 ? a.invested / originalHoldings : 0; // FROZEN avg buy price
      const costBasisRemaining = avgCost * adjHoldings;
      const value = adjHoldings * a.currentPrice;
      const pnl = value - costBasisRemaining;
      const pnlPct = costBasisRemaining > 0 ? (pnl / costBasisRemaining) * 100 : 0;

      const eligible = pnlPct > 10 && pnl > 0 && a.currentPrice > 0 && adjHoldings > 0;
      const sellPct = eligible ? Math.min(Math.max(pnlPct * 0.5, 5), 50) : 0;
      const sellUsd = eligible ? pnl * (sellPct / 100) : 0;
      let sellTokens = eligible && a.currentPrice > 0 ? sellUsd / a.currentPrice : 0;
      if (sellTokens > adjHoldings) sellTokens = adjHoldings;
      if (sellTokens < 0 || !Number.isFinite(sellTokens)) sellTokens = 0;

      return { symbol: a.symbol, holdings: adjHoldings, avgCost, price: a.currentPrice,
        pnl, pnlPct, eligible, sellPct, sellUsd, sellTokens };
    });
  }, [metrics.assets, reservoir.sells]);

  const anyProfit = rows.some(r => r.eligible);

  const execute = (r: typeof rows[number]) => {
    if (!r.eligible || r.sellTokens <= 0) return;
    if (busy === r.symbol) return;
    setBusy(r.symbol);
    addTakeProfit(r.symbol, r.sellTokens, r.sellUsd, r.price, r.sellPct);
    toast.success(sk
      ? `Zaznamenané: predaj ${r.sellTokens.toFixed(TOKEN_DECIMALS[r.symbol] ?? 4)} ${r.symbol} → +${formatUsd(r.sellUsd)} do rezervoáru`
      : `Logged: sell ${r.sellTokens} ${r.symbol}`);
    setTimeout(() => setBusy(null), 800);
  };

  const resetLog = () => {
    if (!confirm(sk ? 'Vymazať históriu a vrátiť späť všetky predaje?' : 'Clear history and reset?')) return;
    resetReservoir();
  };

  const log = reservoir.log.filter(e => e.kind === 'TAKE_PROFIT');


  return (
    <BentoCard
      padding="lg"
      className={`h-full overflow-hidden ${parabolic ? 'ring-2 ring-rose-500/60 shadow-[0_0_30px_-5px_rgba(244,63,94,0.45)]' : ''}`}
    >
      <div className={`h-0.5 ${parabolic ? 'bg-gradient-to-r from-rose-500 via-orange-500 to-rose-600' : 'bg-gradient-to-r from-neon-gold via-orange-500 to-neon-green'}`} />
      <div className="space-y-4 mt-4">
        {parabolic && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5">
            <Flame className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-bold text-rose-200 leading-snug">
                ⚠️ PARABOLIC — {sk ? 'trh je prepálený' : 'overheated market'} (score {cycle?.score ?? 0})
              </p>
              <p className="text-[10px] text-rose-200/80 leading-snug mt-0.5">
                {sk
                  ? 'Money Mode odporúča prioritne brať zisk. Žiadne auto-execution — každý predaj potvrď ručne v peňaženke.'
                  : 'Money Mode recommends taking profit. No auto-execution — confirm each sell manually in your wallet.'}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">
              {sk ? 'Dynamický Take Profit' : 'Dynamic Take Profit'}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30">
            <Wallet className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-muted-foreground">{sk ? 'Rezervoár' : 'Reservoir'}:</span>
            <span className="text-[11px] font-mono tabular-nums font-bold text-emerald-300">{formatUsd(reservoir.stable)}</span>
          </div>
        </div>


        {!anyProfit && (
          <p className="text-xs text-center text-muted-foreground py-3">
            {sk ? 'Všetky aktíva práve akumulujú.' : 'All assets are currently accumulating.'}
          </p>
        )}

        <div className="space-y-2">
          {rows.map(r => {
            const dec = TOKEN_DECIMALS[r.symbol] ?? 4;
            if (!r.eligible) {
              return (
                <div key={r.symbol} className="rounded-md bg-secondary/30 border border-border/40 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground w-9">{r.symbol}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {r.holdings.toFixed(dec)} · avg {formatUsd(r.avgCost)} · {formatUsd(r.price)}
                    </span>
                  </div>
                  <span className="text-[10px] text-yellow-500/80">
                    {sk ? 'Zatiaľ žiadne odporúčanie' : 'No take profit recommendation yet'}
                  </span>
                </div>
              );
            }
            const tokensStr = r.sellTokens.toFixed(dec);
            const usdStr = r.sellUsd.toFixed(2);
            return (
              <div key={r.symbol} className="rounded-lg bg-secondary/40 border border-border/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-foreground">{r.symbol}</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {r.holdings.toFixed(dec)} · avg {formatUsd(r.avgCost)} · now {formatUsd(r.price)}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tabular-nums text-gain">+{formatUsd(r.pnl)}</p>
                    <p className="text-[10px] tabular-nums text-gain">+{r.pnlPct.toFixed(2)}%</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/40 hover:bg-orange-500/20 text-[10px]">
                    {sk ? `Predaj ${r.sellPct.toFixed(0)}% zo zisku` : `Sell ${r.sellPct.toFixed(0)}% of Profit`}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300">
                    {sk ? 'Cieľ: Stablecoins' : 'Destination: Stablecoins'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-background/40 border border-border/40 px-2 py-1.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">{sk ? 'Predať tokenov' : 'Sell tokens'}</p>
                    <CopyChip text={`${tokensStr} ${r.symbol}`} label={r.symbol} />
                  </div>
                  <div className="rounded-md bg-background/40 border border-border/40 px-2 py-1.5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">{sk ? 'Hodnota v USD' : 'USD value'}</p>
                    <CopyChip text={`$${usdStr}`} label="USD" />
                  </div>
                </div>

                <Button
                  size="sm"
                  className="w-full h-8 text-[11px] bg-amber-500/90 hover:bg-amber-500 text-black font-semibold"
                  disabled={busy === r.symbol}
                  onClick={() => execute(r)}
                >
                  {busy === r.symbol
                    ? (sk ? 'Zaznamenávam…' : 'Recording…')
                    : (sk ? 'Označiť ako vykonané' : 'Mark as Executed')}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border/40 pt-2">
          <button
            onClick={() => setShowLog(s => !s)}
            className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <HistoryIcon className="w-3 h-3" />
              {sk ? 'Take-Profit história' : 'Take-Profit History'} ({log.length})
            </span>
            {showLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showLog && (
            <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
              {log.length === 0 && (
                <p className="text-[10px] text-center text-muted-foreground py-2">
                  {sk ? 'Zatiaľ žiadne záznamy.' : 'No logs yet.'}
                </p>
              )}
              {log.map((e, i) => {
                const dec = TOKEN_DECIMALS[e.symbol] ?? 4;
                return (
                  <div key={i} className="text-[10px] flex items-center justify-between rounded bg-secondary/30 px-2 py-1">
                    <span className="text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
                    <span className="font-mono tabular-nums">
                      <span className="text-foreground">{e.tokens.toFixed(dec)} {e.symbol}</span>
                      <span className="text-gain ml-2">+{formatUsd(e.usd)}</span>
                      <span className="text-orange-300 ml-2">{e.pct.toFixed(0)}%</span>
                    </span>
                  </div>
                );
              })}
              {log.length > 0 && (
                <button onClick={resetLog} className="w-full text-[10px] text-loss/80 hover:text-loss mt-1">
                  {sk ? 'Vymazať históriu a resetovať predaje' : 'Clear history & reset sells'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </BentoCard>
  );
}
