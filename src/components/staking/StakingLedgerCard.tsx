import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowUpFromLine, Plus, Trash2, Lock } from 'lucide-react';
import {
  addStake, removeStake, deleteEntry,
  PROTOCOL_PRESETS, type LedgerSymbol,
} from '@/lib/stakingLedger';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import { Lang } from '@/lib/i18n';

type Mode = 'stake' | 'unstake';

interface Props { lang: Lang }

export function StakingLedgerCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { entries, bySymbol } = useStakingLedger();

  const [mode, setMode] = useState<Mode>('stake');
  const [symbol, setSymbol] = useState<LedgerSymbol>('ETH');
  const [protocol, setProtocol] = useState<string>(PROTOCOL_PRESETS.ETH[0]);
  const [customProtocol, setCustomProtocol] = useState('');
  const [amount, setAmount] = useState('');

  const presets = useMemo(() => PROTOCOL_PRESETS[symbol], [symbol]);

  const handleSymbolChange = (s: LedgerSymbol) => {
    setSymbol(s);
    setProtocol(PROTOCOL_PRESETS[s][0]);
  };

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error(sk ? 'Zadaj kladnú hodnotu' : 'Enter a positive amount');
      return;
    }
    const finalProtocol = (customProtocol.trim() || protocol).trim();
    if (!finalProtocol) {
      toast.error(sk ? 'Zadaj protokol' : 'Pick a protocol');
      return;
    }
    if (mode === 'stake') {
      addStake(symbol, finalProtocol, amt);
      toast.success(`✅ +${amt} ${symbol} → ${finalProtocol}`);
    } else {
      const taken = removeStake(symbol, finalProtocol, amt);
      if (taken === 0) {
        toast.error(sk ? 'Žiadna pozícia na výber' : 'No position to withdraw from');
        return;
      }
      if (taken < amt) {
        toast.warning(
          sk ? `Vybrané iba ${taken} ${symbol} (zostatok bol nižší)` : `Withdrew only ${taken} ${symbol} (balance lower)`,
        );
      } else {
        toast.success(`✅ −${taken} ${symbol} ← ${finalProtocol}`);
      }
    }
    setAmount('');
    setCustomProtocol('');
  };

  const remove = (sym: LedgerSymbol, prot: string) => {
    deleteEntry(sym, prot);
    toast.success(sk ? 'Pozícia vymazaná' : 'Position removed');
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          {sk ? 'Zápis aktívneho stakingu' : 'Active Staking Ledger'}
        </h3>
        <span className="text-[10px] text-muted-foreground">{sk ? 'Manuálne · bez auto-execution' : 'Manual · no auto-execution'}</span>
      </div>

      {/* Toggle Stake / Unstake */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-secondary rounded-lg">
        <button
          onClick={() => setMode('stake')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition ${
            mode === 'stake' ? 'bg-emerald-500 text-background' : 'text-muted-foreground'
          }`}
        >
          <ArrowDownToLine className="w-3.5 h-3.5" /> 📥 {sk ? 'VKLAD / STAKE' : 'STAKE / DEPOSIT'}
        </button>
        <button
          onClick={() => setMode('unstake')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition ${
            mode === 'unstake' ? 'bg-amber-500 text-background' : 'text-muted-foreground'
          }`}
        >
          <ArrowUpFromLine className="w-3.5 h-3.5" /> 📤 {sk ? 'VÝBER / UNSTAKE' : 'UNSTAKE / WITHDRAW'}
        </button>
      </div>

      {/* Form */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {(['BTC', 'ETH', 'SOL'] as LedgerSymbol[]).map(s => (
            <button
              key={s}
              onClick={() => handleSymbolChange(s)}
              className={`py-2 rounded-md text-xs font-bold border transition ${
                symbol === s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-secondary text-muted-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground">
            {sk ? 'Protokol / Stratégia' : 'Protocol / Strategy'}
          </label>
          <select
            value={protocol}
            onChange={e => setProtocol(e.target.value)}
            className="w-full px-2 py-2 text-sm rounded-md border border-border bg-background"
          >
            {presets.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            type="text"
            value={customProtocol}
            onChange={e => setCustomProtocol(e.target.value)}
            placeholder={sk ? 'alebo vlastný názov…' : 'or custom name…'}
            className="w-full mt-1 px-2 py-1.5 text-xs rounded-md border border-border bg-background"
          />
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground">
            {sk ? `Množstvo (${symbol})` : `Amount (${symbol})`}
          </label>
          <input
            type="number"
            step="0.00000001"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`0.00000000 ${symbol}`}
            className="w-full px-2 py-2 text-sm rounded-md border border-border bg-background font-mono"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {sk ? 'Aktuálne staknuté' : 'Currently staked'}: <span className="font-mono text-foreground">{bySymbol[symbol].toFixed(8)} {symbol}</span>
          </p>
        </div>

        <button
          onClick={submit}
          className={`w-full py-2.5 rounded-lg text-sm font-bold ${
            mode === 'stake'
              ? 'bg-emerald-500 text-background'
              : 'bg-amber-500 text-background'
          }`}
        >
          {mode === 'stake'
            ? (sk ? '✅ Potvrdiť staking' : '✅ Confirm Stake')
            : (sk ? '✅ Potvrdiť výber' : '✅ Confirm Withdraw')}
        </button>
      </div>

      {/* Ledger entries */}
      {entries.length > 0 && (
        <div className="pt-2 border-t border-border space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {sk ? 'Aktívne pozície' : 'Active Positions'}
          </p>
          {entries.map(e => (
            <div key={`${e.symbol}-${e.protocol}`} className="flex items-center justify-between bg-secondary/40 rounded-md px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {e.amount.toFixed(8)} <span className="text-primary">{e.symbol}</span>
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{e.protocol}</p>
              </div>
              <button
                onClick={() => remove(e.symbol, e.protocol)}
                className="p-1.5 rounded-md hover:bg-loss/10 text-loss"
                aria-label="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-secondary/40 rounded-md px-3 py-2">
          <Plus className="w-3.5 h-3.5" />
          {sk
            ? 'Žiadna aktívna staking pozícia. Pridaj prvý vklad vyššie.'
            : 'No active staking positions. Add your first deposit above.'}
        </div>
      )}
    </div>
  );
}
