import { useCallback, useState } from 'react';
import { Copy, Check, Wallet, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Lang } from '@/lib/i18n';
import { useSolStakingApy } from '@/hooks/useStakingApr';
import { useAssetLayers, layerFor, splitLayers } from '@/hooks/useAssetLayers';
import { layerTarget, grandTotalOf } from '@/lib/dynamicTargets';
import { useLiveMarketData } from '@/hooks/useLiveMarketData';
import { TokenValue } from './TokenValue';
import { RecordActionButton } from './RecordActionButton';
import { useDefiActions } from '@/stores/defiActionStore';
import { usePortfolioAssets } from '@/hooks/usePortfolioAssets';

// ============================================================================
// DeFi Mozog — SOL (Ledger Native v2)
//  Vrstva 1: 20% likvidná rezerva & gas
//  Vrstva 2: 80% natívny staking cez Ledger (Helius) — žiadne LST riziko
// ============================================================================

const GAS_RESERVE_PCT = 20;
const STAKE_PCT = 80;
const CONFIRM_KEY = 'sol-defi-brain-confirmed-v2';

interface ConfirmedState {
  layer2?: { nativeSol: number; ts: number };
}

function loadConfirmed(): ConfirmedState {
  try { const raw = localStorage.getItem(CONFIRM_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function persistConfirmed(s: ConfirmedState) {
  try { localStorage.setItem(CONFIRM_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function fmt(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0.0000';
  if (n < 0.0001) return n.toExponential(3);
  return String(n);
}

function LayerCard({ icon, title, subtitle, executed, children }: {
  icon: React.ReactNode; title: string; subtitle: string; executed?: boolean; children: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur-sm transition ${
        executed
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-slate-950/60 to-slate-950/40 hover:border-purple-400/40'
      }`}
    >
      {!executed && <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-purple-500/15 blur-3xl" />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${executed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-purple-500/15 text-purple-300'}`}>
            {icon}
          </div>
          <div>
            <div className="text-base font-semibold text-white">{title}</div>
            <div className="text-[12px] text-slate-400">{subtitle}</div>
          </div>
        </div>
        {executed && <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">✅ Exekuované</span>}
      </div>
      <div className="relative mt-4 space-y-3">{children}</div>
    </div>
  );
}

interface Props { lang: Lang }

export function SolDefiBrain({ lang: _lang }: Props) {
  const { byToken } = usePortfolioAssets();
  const sol = byToken.SOL;
  const availableSol = sol ? sol.liquidQty + sol.stakedQty + sol.collateralQty : 0;
  const { data: prices } = useLiveMarketData();
  const { store, reset } = useDefiActions();
  const actionId = 'SOL:build:layer2-native';
  const { data: solApy } = useSolStakingApy();
  // Už stakované/kolaterálové SOL — nesmie sa stakovať druhýkrát.
  const layers = useAssetLayers();
  const solLayers = splitLayers(availableSol, layerFor(layers, 'SOL'), 0);
  const grandTotal = grandTotalOf(solLayers);

  const gasReserve = grandTotal * (GAS_RESERVE_PCT / 100);
  // Dynamický cieľ: zvyšok do 80 % z Grand Total, zastropovaný Liquid zostatkom.
  const stakeT = layerTarget({
    grandTotal,
    liquid: solLayers.liquid,
    allocated: solLayers.staked + solLayers.collateral,
    targetPct: STAKE_PCT,
  });
  const working = stakeT.suggested;

  const [confirmed, setConfirmed] = useState<ConfirmedState>(() => loadConfirmed());

  const resetAll = useCallback(() => {
    persistConfirmed({}); setConfirmed({}); reset('SOL:');
    toast({ title: 'Plán resetnutý', description: 'Karty sú znovu aktívne (pozície v portfóliu ostávajú).' });
  }, [reset]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/60 via-slate-950/80 to-slate-950/60 p-5 shadow-[0_0_40px_-15px_rgba(139,92,246,0.5)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-purple-300/80">DeFi Mozog · SOL</div>
            <TokenValue amount={availableSol} symbol="SOL" price={prices?.sol} size="xl" />
            <div className="text-xs text-slate-400">Dostupný zostatok · natívny Ledger režim</div>
          </div>
          <button type="button" onClick={resetAll} className="rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-slate-200">
            Reset plánu
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-black/30 p-3">
            <div className="text-[11px] text-slate-500">Rezerva ({GAS_RESERVE_PCT}%)</div>
            <TokenValue amount={gasReserve} symbol="SOL" price={prices?.sol} size="sm" />
          </div>
          <div className="rounded-xl bg-black/30 p-3">
            <div className="text-[11px] text-slate-500">Zostáva dostakovať ({STAKE_PCT}%)</div>
            <TokenValue amount={working} symbol="SOL" price={prices?.sol} size="sm" />
            <div className="mt-0.5 text-[10px] text-slate-500">
              už stakované {fmt(stakeT.allocated)} / cieľ {fmt(stakeT.target)}
            </div>
          </div>
        </div>
      </div>

      {/* Vrstva 1 */}
      <LayerCard
        icon={<Wallet className="h-5 w-5 text-purple-400" />}
        title="Vrstva 1 · Likvidná rezerva & Gas"
        subtitle={`${GAS_RESERVE_PCT}% - Nedotknutý buffer pre exekúcie a priority fees.`}
      >
        <div className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3">
          <div className="text-[13px] text-slate-300">Rezerva v peňaženke</div>
          <div className="flex items-center gap-2">
            <TokenValue amount={gasReserve} symbol="SOL" price={prices?.sol} size="sm" copy />
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-200/80">
          ⚠️ Táto rezerva pokrýva priority fees a rebalanc pri exekúciách. Nikdy ju nedelegovať.
        </div>
      </LayerCard>

      {/* Vrstva 2 */}
      <LayerCard
        icon={<ShieldCheck className="h-5 w-5 text-purple-400" />}
        title="Vrstva 2 - Core Staking (Ledger Native)"
        subtitle="80% kapitálu - Bezpečný natívny staking priamo cez Ledger (napr. Helius). Žiadne LST smart contract riziko."
        executed={!!confirmed.layer2 || !!store[actionId]}
      >
        <div className="flex items-center justify-between rounded-xl bg-black/30 px-4 py-3">
          <div className="text-[13px] text-slate-300">Cieľová delegácia</div>
          <div className="flex items-center gap-2">
            <TokenValue amount={working} symbol="SOL" price={prices?.sol} size="sm" copy />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-purple-500/15 px-3 py-1 text-[12px] font-semibold text-purple-300">
            ~ {(solApy?.apy ?? 4.5).toFixed(2)}% APY
          </span>
          <span className="rounded-full bg-slate-800/60 px-3 py-1 text-[11px] text-slate-400">
            Ledger + Helius natívna delegácia
          </span>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[12px] text-emerald-200">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>Tento staking je plne non-custodial. Kľúče neopúšťajú váš Ledger.</span>
        </div>

        <RecordActionButton actionId={actionId} symbol="SOL" amount={working}
          stakeProtocol="Ledger Native Staking (Helius)" stakeApy={solApy?.apy}
          disabled={!!confirmed.layer2 || working <= 0} fullyAllocated={stakeT.fullyAllocated}
          label="Potvrdiť manuálnu delegáciu v Ledgeri" doneLabel="Zaznamenané"
          toastMessage="Delegácia SOL zaznamenaná." />
      </LayerCard>
    </div>
  );
}
