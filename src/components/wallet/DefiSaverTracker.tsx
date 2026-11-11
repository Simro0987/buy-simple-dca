import { useCallback, useEffect, useState } from 'react';
import { Wallet, ShieldCheck, Radar, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Lang } from '@/lib/i18n';
import { useLiveMarketData } from '@/hooks/useLiveMarketData';
import { useYieldScanner } from '@/hooks/useYieldScanner';
import { Button } from '@/components/ui/button';
import { TokenValue } from '@/components/staking/TokenValue';

const KEY = 'defi-saver-tracker-v1';
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;

interface TrackerState {
  address: string;
  tracking: boolean;
}

function load(): TrackerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { address: typeof p.address === 'string' ? p.address : '', tracking: !!p.tracking };
    }
  } catch { /* ignore */ }
  return { address: '', tracking: false };
}

/**
 * DeFi Saver DSProxy / Smart Wallet tracker.
 * Balances are simulated for now (deterministic from the address) but the shape
 * matches what a real Web3 RPC / position reader will return later.
 */
function simulatePosition(address: string) {
  let h = 0;
  for (let i = 2; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) % 100000;
  const collateralBtc = 0.02 + (h % 800) / 10000;      // 0.02 – 0.10 BTC
  const collateralEth = 0.4 + (h % 1200) / 1000;       // 0.4 – 1.6 ETH
  const debtUsdc = 200 + (h % 900);                    // $200 – $1100
  return { collateralBtc, collateralEth, debtUsdc };
}

export function DefiSaverTracker({ lang }: { lang: Lang }) {
  const sk = lang === 'sk';
  const [state, setState] = useState<TrackerState>(() => load());
  const [draft, setDraft] = useState(state.address);
  const { data: prices } = useLiveMarketData();
  const { data: scan, isError: yieldError } = useYieldScanner();

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const valid = EVM_RE.test(draft.trim());

  const track = useCallback(() => {
    if (!valid) {
      toast.error(sk ? 'Neplatná adresa (0x… 42 znakov).' : 'Invalid address (0x… 42 chars).');
      return;
    }
    setState({ address: draft.trim(), tracking: true });
    toast.success(sk ? 'Sledovanie portfólia aktivované.' : 'Portfolio tracking activated.');
  }, [draft, valid, sk]);

  const disconnect = useCallback(() => {
    setState({ address: '', tracking: false });
    setDraft('');
    toast.success(sk ? 'Sledovanie zrušené.' : 'Tracking disconnected.');
  }, [sk]);

  const pos = state.tracking ? simulatePosition(state.address) : null;
  const btcUsd = pos && prices ? pos.collateralBtc * prices.btc : null;
  const ethUsd = pos && prices ? pos.collateralEth * prices.eth : null;
  const totalUsd = btcUsd != null && ethUsd != null ? btcUsd + ethUsd : null;
  const ltv = pos && totalUsd ? (pos.debtUsdc / totalUsd) * 100 : null;

  return (
    <section className="rounded-2xl border border-accent/25 bg-accent/5 backdrop-blur-sm p-4 space-y-3 transition-all duration-300 ease-in-out">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">DeFi Saver · Sledovanie</h3>
        {state.tracking && (
          <span className="ml-auto flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
            <ShieldCheck className="w-3 h-3" />
            {sk ? 'Pripojené: Sledovanie aktívne' : 'Connected: tracking active'}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="defi-saver-address" className="block text-[11px] text-muted-foreground">
          DeFi Saver DSProxy / Smart Wallet address (0x...)
        </label>
        <Input
          id="defi-saver-address"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={state.tracking}
          placeholder="0x…"
          className="font-mono text-xs bg-background/60 border-accent/25 disabled:opacity-70"
        />
        {!state.tracking && draft.length > 0 && !valid && (
          <p className="text-[10px] text-red-300">{sk ? 'Adresa musí mať formát 0x + 40 znakov.' : 'Address must be 0x + 40 chars.'}</p>
        )}
      </div>

      {state.tracking ? (
        <Button variant="outline"
          type="button"
          onClick={disconnect}
          className="w-full text-xs transition-all duration-300 ease-in-out"
        >
          <span className="inline-flex items-center gap-1.5"><Unlink className="w-3.5 h-3.5" />{sk ? 'Odpojiť sledovanie' : 'Disconnect tracking'}</span>
        </Button>
      ) : (
        <Button
          type="button"
          onClick={track}
          disabled={!valid}
          className="w-full bg-accent text-accent-foreground text-xs transition-all duration-300 ease-in-out hover:bg-accent/90"
        >
          {sk ? 'Sledovať Portfólio' : 'Track portfolio'}
        </Button>
      )}

      {pos && (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
              <p className="text-[10px] text-slate-500">{sk ? 'Kolaterál' : 'Collateral'}</p>
              <TokenValue amount={pos.collateralBtc} symbol="BTC" price={prices?.btc} size="sm" />
            </div>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
              <p className="text-[10px] text-slate-500">{sk ? 'Kolaterál' : 'Collateral'}</p>
              <TokenValue amount={pos.collateralEth} symbol="ETH" price={prices?.eth} size="sm" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-[11px]">
            <span className="text-slate-500">{sk ? 'Dlh / LTV' : 'Debt / LTV'}</span>
            <span className="font-mono text-slate-100">
              {pos.debtUsdc.toLocaleString('sk-SK', { maximumFractionDigits: 2 })} USDC
              {ltv != null && <span className={`ml-2 ${ltv > 33 ? 'text-red-300' : 'text-emerald-300'}`}>{ltv.toFixed(1)}%</span>}
            </span>
          </div>
          <p className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Radar className="w-3 h-3 text-purple-400" />
            {scan?.bestEthRoute
              ? (sk
                  ? `Live APY ${scan.bestEthRoute.protocol} ${scan.bestEthRoute.symbol}: ${scan.bestEthRoute.supplyApy.toFixed(2)} %`
                  : `Live APY ${scan.bestEthRoute.protocol} ${scan.bestEthRoute.symbol}: ${scan.bestEthRoute.supplyApy.toFixed(2)}%`)
              : (yieldError ? 'Dáta výnosov nedostupné' : 'Načítavam výnosy…')}
          </p>
          <p className="text-[10px] text-amber-300/80">
            {sk
              ? 'Simulované zostatky · iba sledovanie · bez prístupu k prostriedkom'
              : 'Position balances are simulated for now; prices and APY are live. Ready to swap for on-chain RPC.'}
          </p>
        </div>
      )}
    </section>
  );
}
