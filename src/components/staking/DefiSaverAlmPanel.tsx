import { Bot, ShieldAlert, Rocket } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useStakeAlmStore } from '@/stores/stakeAlmStore';
import { BTC_CONFIG, ETH_CONFIG, weeklyDepositBoost } from '@/lib/leverageEngine';
import { TokenValue } from './TokenValue';

/**
 * Layer 4 — DeFi Saver Automation (ALM) configuration panel.
 * Auto-Repay = downside crash safety net. Auto-Boost = tied to the weekly
 * manual DCA deposit, scaling the borrow into Layer 5.
 */
export function DefiSaverAlmPanel({
  sk,
  targetLtv,
  maxLtv,
  liqPrice,
  livePrice,
  assetSymbol,
  asset,
  weeklyDeposit,
  unwind = false,
}: {
  sk: boolean;
  targetLtv: number;
  maxLtv: number;
  liqPrice: number | null;
  livePrice?: number;
  assetSymbol: string;
  asset: 'BTC' | 'ETH';
  weeklyDeposit: number;
  unwind?: boolean;
}) {
  const { configs, configure } = useStakeAlmStore();
  const { autoRepay, autoBoost } = configs[asset];
  const boostUsd = weeklyDepositBoost(weeklyDeposit, livePrice, asset === 'BTC' ? BTC_CONFIG : ETH_CONFIG, autoBoost && !unwind);

  const repayTrigger = maxLtv * 100;
  const repayTarget = targetLtv * 100;

  const fmt = (n?: number | null) =>
    n == null ? 'Bez dlhu / dáta nedostupné' : `$${n.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-purple-200">
        <Bot className="w-3.5 h-3.5 shrink-0" />
        {unwind ? 'Plán vypnutia · potvrď vykonanie v DeFi Saver. Auto-Repay ponechaj do splatenia, ak pozícia zostáva riziková.' : sk
          ? 'Konfigurácia DeFi Saver · čaká na nastavenie v peňaženke'
          : 'Automation runs on-chain in DeFi Saver — configure once, protects 24/7.'}
      </div>

      {/* Auto-Repay */}
      <div className={`rounded-xl border p-3 space-y-2 transition-all duration-300 ease-in-out ${
        autoRepay ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/60'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-slate-100">Auto-Repay</p>
              <p className="text-[11px] text-slate-400">
                {sk ? 'Bezpečnostná sieť pri páde trhu (deleveraging).' : 'Safety net during market crashes (deleveraging).'}
              </p>
            </div>
          </div>
          <Switch checked={!unwind && autoRepay} disabled={unwind} onCheckedChange={v => configure(asset, 'autoRepay', v)} aria-label="Auto-Repay" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
            <p className="text-slate-500">{sk ? 'Spustí sa pri LTV' : 'Triggers at LTV'}</p>
            <p className="font-mono font-semibold text-red-300">{repayTrigger.toFixed(0)}%</p>
          </div>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
            <p className="text-slate-500">{sk ? 'Zníži na' : 'Repays to'}</p>
            <p className="font-mono font-semibold text-emerald-300">{repayTarget.toFixed(0)}%</p>
          </div>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
            <p className="text-slate-500">{sk ? 'Likvidácia' : 'Liquidation'}</p>
            <p className="font-mono font-semibold text-slate-100">{fmt(liqPrice)}</p>
          </div>
        </div>
      </div>

      {/* Auto-Boost */}
      <div className={`rounded-xl border p-3 space-y-2 transition-all duration-300 ease-in-out ${
        autoBoost ? 'border-purple-500/40 bg-purple-500/5' : 'border-slate-800 bg-slate-950/60'
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Rocket className="w-4 h-4 text-purple-300 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-slate-100">Auto-Boost</p>
              <p className="text-[11px] text-slate-400">
                {sk
                  ? 'Striktne viazané na týždenný manuálny DCA vklad — po vklade automaticky navýši borrow do Vrstvy 5.'
                  : 'Strictly tied to the weekly manual DCA deposit — after each deposit it scales the borrow into Layer 5.'}
              </p>
            </div>
          </div>
          <Switch checked={!unwind && autoBoost} disabled={unwind} onCheckedChange={v => configure(asset, 'autoBoost', v)} aria-label="Auto-Boost" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
            <p className="text-muted-foreground">Spúšťač</p>
            <p className="font-semibold text-accent">Týždenný DCA vklad</p>
          </div>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
            <p className="text-slate-500">{sk ? 'Cieľ' : 'Target'}</p>
            <p className="font-mono font-semibold text-purple-200">{repayTarget.toFixed(0)}%</p>
          </div>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-2">
            <p className="text-slate-500">{sk ? 'Kolaterál' : 'Collateral'}</p>
            <p className="font-mono font-semibold text-slate-100">{assetSymbol}</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 font-mono">
          {livePrice
            ? `LIVE ${asset} ${fmt(livePrice)} · CoinGecko`
            : (sk ? 'Načítavam live cenu…' : 'Loading live price…')}
        </p>
        <p className="text-[10px] text-muted-foreground">Plánované navýšenie po vklade → Vrstva 5</p>
        <TokenValue amount={boostUsd} symbol="USDC" price={1} size="sm" />
      </div>
      <Button asChild variant="outline" className="w-full border-accent/30 text-accent">
        <a href="https://app.defisaver.com/" target="_blank" rel="noopener noreferrer">Otvoriť DeFi Saver</a>
      </Button>
    </div>
  );
}
