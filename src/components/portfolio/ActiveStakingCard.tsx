/**
 * "Active Staking" — dynamic list of every executed stake across all tokens.
 * Sources: the global active-staking store (Stake section confirmations) merged
 * with the cloud staking ledger. Scales automatically to any new token.
 */
import { Lock, Percent, Trash2 } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { Bento, Label } from '@/components/modern-portfolio/primitives';
import { useActiveStakes, stakeId } from '@/stores/activeStakingStore';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import { useSolStakingApy, useLidoApr } from '@/hooks/useStakingApr';

interface Row {
  id: string;
  symbol: string;
  protocol: string;
  amount: number;
  apy?: number;
}

export function ActiveStakingCard({ lang }: { lang: Lang }) {
  const sk = lang === 'sk';
  const { records, remove } = useActiveStakes();
  const { entries } = useStakingLedger();
  const { data: solApy } = useSolStakingApy();
  const { data: lidoApr } = useLidoApr();

  const liveApy = (symbol: string, protocol: string): number | undefined => {
    const p = protocol.toLowerCase();
    if (symbol === 'SOL' && (p.includes('helius') || p.includes('native'))) return solApy?.apy;
    if (symbol === 'ETH' && (p.includes('lido') || p.includes('steth'))) return lidoApr?.apr;
    return undefined;
  };

  const map = new Map<string, Row>();
  for (const e of entries) {
    const id = stakeId(e.symbol, e.protocol);
    map.set(id, { id, symbol: e.symbol, protocol: e.protocol, amount: e.amount });
  }
  for (const r of records) {
    const existing = map.get(r.id);
    map.set(r.id, {
      id: r.id,
      symbol: r.symbol,
      protocol: r.protocol,
      amount: existing ? Math.max(existing.amount, r.amount) : r.amount,
      apy: r.apy,
    });
  }
  const rows = [...map.values()]
    .filter(r => r.amount > 0)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <Bento delay={0.45} className="p-4 sm:p-5 space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-bold text-white">
            {sk ? 'Aktívny Staking' : 'Active Staking'}
          </span>
        </div>
        <Label>{rows.length} {sk ? 'pozícií' : 'positions'}</Label>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-white/35 text-center py-4">
          {sk
            ? 'Žiadny aktívny staking. Potvrď exekúciu v sekcii Stake.'
            : 'No active staking yet. Confirm an execution in the Stake section.'}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const apy = r.apy ?? liveApy(r.symbol, r.protocol);
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 transition-all duration-300 ease-in-out hover:border-purple-500/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{r.symbol}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                      {sk ? 'Exekuované' : 'Executed'}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-white/40 mt-0.5">{r.protocol}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm text-white">
                    {r.amount.toFixed(4)} <span className="text-white/40">{r.symbol}</span>
                  </p>
                  <p className="flex items-center justify-end gap-1 text-[11px] font-mono text-purple-300">
                    <Percent className="w-3 h-3" />
                    {apy != null ? `${apy.toFixed(2)}%` : '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  title={sk ? 'Odstrániť zo zoznamu' : 'Remove from list'}
                  className="shrink-0 rounded-lg p-1.5 text-white/25 transition-colors hover:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Bento>
  );
}
