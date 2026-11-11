import { useCallback, useState, useEffect } from 'react';
import { Copy, Check, Shield, Layers, AlertTriangle, Zap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Lang } from '@/lib/i18n';
import { fetchTokenPrice } from '@/lib/apiManager';
import { TokenValue } from './TokenValue';
import { RecordActionButton } from './RecordActionButton';
import { useDefiActions } from '@/stores/defiActionStore';
import { usePortfolioAssets } from '@/hooks/usePortfolioAssets';
import { fmtQty } from '@/lib/formatNumber';

// ============================================================================
// DeFi Mozog — HYPE (Hyperliquid L1 · Native Staking)
//  Vrstva 1: 100% pracovného kapitálu → HyperCore native staking
//  Vrstva 2: ZAKÁZANÝ Looping / Borrow — L1 native token, len sieťové poplatky
// ============================================================================

const CONFIRM_KEY = 'hype-defi-brain-confirmed-v1';
const HYPE_URL = 'https://app.hyperliquid.xyz/staking';

interface ConfirmedState {
  layer1?: { hypeAmount: number; ts: number };
}

function loadConfirmed(): ConfirmedState {
  try { const raw = localStorage.getItem(CONFIRM_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function persistConfirmed(s: ConfirmedState) {
  try { localStorage.setItem(CONFIRM_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function fmt(n: number): string {
  return fmtQty(n);
}

function LayerCard({ icon, title, subtitle, executed, children }: {
  icon: React.ReactNode; title: string; subtitle: string; executed?: boolean; children: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 backdrop-blur-sm transition ${
        executed
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-slate-950/60 to-slate-950/40 hover:border-purple-400/40'
      }`}
    >
      {!executed && <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl" />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${executed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-purple-500/15 text-purple-300'}`}>
            {icon}
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{title}</div>
            <div className="text-[11px] text-slate-400">{subtitle}</div>
          </div>
        </div>
        {executed && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">✅ Exekuované</span>}
      </div>
      <div className="relative mt-3 space-y-2">{children}</div>
    </div>
  );
}

interface Props { lang: Lang }

export function HypeDefiBrain({ lang: _lang }: Props) {
  const { byToken } = usePortfolioAssets();
  const holding = byToken.HYPE;
  const availableHype = holding ? holding.liquidQty + holding.stakedQty + holding.collateralQty : 0;
  const { store, reset } = useDefiActions();
  const actionId = 'HYPE:build:layer1';

  // L1 native — gas platený v HYPE je zanedbateľný; 100% pracovný kapitál.
  const working = holding?.liquidQty ?? 0;

  const [hypePriceUsd, setHypePriceUsd] = useState(0);
  useEffect(() => {
    let alive = true;
    void fetchTokenPrice('HYPE').then(p => { if (alive) setHypePriceUsd(p || 0); });
    const id = window.setInterval(() => {
      void fetchTokenPrice('HYPE').then(p => { if (alive) setHypePriceUsd(p || 0); });
    }, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const [confirmed, setConfirmed] = useState<ConfirmedState>(() => loadConfirmed());

  const resetAll = useCallback(() => {
    persistConfirmed({}); setConfirmed({}); reset('HYPE:');
    toast({ title: 'Plán resetnutý', description: 'Karty sú znovu aktívne (pozície v portfóliu ostávajú).' });
  }, [reset]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/60 via-slate-950/80 to-slate-950/60 p-5 shadow-[0_0_40px_-15px_rgba(139,92,246,0.5)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-purple-300/80">DeFi Mozog · HYPE (Hyperliquid L1)</div>
<TokenValue amount={availableHype} symbol="HYPE" price={hypePriceUsd} size="xl" />
            <div className="text-xs text-slate-400">
              Dostupný zostatok
              {hypePriceUsd > 0 && ` · ≈ $${(availableHype * hypePriceUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
            </div>
          </div>
          <button type="button" onClick={resetAll} className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200">
            Reset plánu
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-black/30 p-2">
            <div className="text-[10px] text-slate-500">Rezerva</div>
            <div className="font-mono text-sm text-amber-200">0.0000</div>
            <div className="text-[9px] text-slate-500">L1 native gas</div>
          </div>
          <div className="rounded-lg bg-black/30 p-2">
            <div className="text-[10px] text-slate-500">Pracovný (100%)</div>
            <TokenValue amount={working} symbol="HYPE" price={hypePriceUsd} size="sm" />
          </div>
          <div className="rounded-lg bg-black/30 p-2">
            <div className="text-[10px] text-slate-500">Sieť</div>
            <div className="font-mono text-sm text-slate-200">HyperCore L1</div>
          </div>
        </div>
      </div>

      {/* L1 Auto-compounding Badge */}
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-400/10 to-transparent px-3 py-2 shadow-[0_0_25px_-8px_rgba(245,158,11,0.7)]">
        <Zap className="h-4 w-4 text-amber-300" />
        <span className="text-[12px] font-semibold text-amber-100">⚡ L1 Auto-compounding (Sieťové poplatky)</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-amber-300/80">Native L1</span>
      </div>

      {/* Vrstva 1 · HyperCore Native Staking */}
      <LayerCard
        icon={<Shield className="h-4 w-4" />}
        title="Vrstva 1 · L1 Native Staking"
        subtitle="100% pracovného kapitálu · HyperCore (Hyperliquid)"
        executed={!!confirmed.layer1 || !!store[actionId]}
      >
        <div className="rounded-lg border border-amber-500/20 bg-black/30 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-amber-100">⚡ HyperCore · Native Staking</div>
            <div className="text-[10px] text-slate-500">Sieťové poplatky</div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Vstupné HYPE na Staking</span>
            <div className="flex items-center gap-2">
              <TokenValue amount={working} symbol="HYPE" price={hypePriceUsd} size="sm" copy />
            </div>
          </div>
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-50/90">
            <div className="font-semibold text-amber-200">Cyborg Action Plan</div>
            <div className="mt-1">
              Stakuj HYPE priamo v{' '}
              <a href={HYPE_URL} target="_blank" rel="noreferrer" className="underline decoration-dotted">
                Hyperliquid dApp (HyperCore)
              </a>
              . Výnos: <span className="font-semibold">podiel na sieťových poplatkoch protokolu</span>.
            </div>
          </div>
        </div>

        <RecordActionButton actionId={actionId} symbol="HYPE" amount={working}
          stakeProtocol="HYPE (Staked)" disabled={!!confirmed.layer1 || working <= 0}
          label="Potvrdiť exekúciu" doneLabel="Zaznamenané" toastMessage="Vklad HYPE zaznamenaný." />
      </LayerCard>

      {/* Vrstva 2 · No-Loop Safety Panel */}
      <LayerCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Vrstva 2 · Ochrana kapitálu (No-Loop)"
        subtitle="Borrow / Looping je pre HYPE zakázaný"
      >
        <div className="rounded-lg border-2 border-red-500/50 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" />
            <div className="text-[12px] leading-relaxed text-red-100">
              <div className="font-bold text-red-200">⚠️ Ochrana kapitálu</div>
              <div className="mt-1">
                HYPE je natívny L1 token. Akýkoľvek looping alebo borrow je{' '}
                <span className="font-semibold text-red-200">prísne zakázaný</span>. Token slúži výhradne
                na zabezpečenie siete a zber organických poplatkov.
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-md border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-400">
          <Layers className="mr-1 inline h-3 w-3" />
          Kalkulačka Borrow / LTV je pre tento token deaktivovaná systémom.
        </div>
      </LayerCard>
    </div>
  );
}
