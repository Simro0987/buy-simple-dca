import { useCallback, useState, useEffect } from 'react';
import { Copy, Check, Shield, Layers, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Lang } from '@/lib/i18n';
import { fetchTokenPrice } from '@/lib/apiManager';
import { TokenValue } from './TokenValue';
import { RecordActionButton } from './RecordActionButton';
import { useDefiActions } from '@/stores/defiActionStore';
import { usePortfolioAssets } from '@/hooks/usePortfolioAssets';
import { rawTokenAmount } from '@/lib/tokenAmount';

// ============================================================================
// DeFi Mozog — AAVE (Arbitrum · No-Loop Protection)
//  Vrstva 1: 100% pracovného kapitálu → Morpho Blue (Supply-only)
//  Vrstva 2: ZAKÁZANÝ Looping — bezpečnostný panel namiesto kalkulačky
//  Gas sa platí v ETH na Arbitrume, preto nie je AAVE rezerva potrebná.
// ============================================================================

const CONFIRM_KEY = 'aave-defi-brain-confirmed-v1';
const MORPHO_ARBITRUM_URL = 'https://app.morpho.org/arbitrum/earn?asset=AAVE';

interface ConfirmedState {
  layer1?: { aaveAmount: number; ts: number };
}

function loadConfirmed(): ConfirmedState {
  try { const raw = localStorage.getItem(CONFIRM_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function persistConfirmed(s: ConfirmedState) {
  try { localStorage.setItem(CONFIRM_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function fmt(n: number): string {
  return rawTokenAmount(n);
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

export function AaveDefiBrain({ lang: _lang }: Props) {
  const { byToken } = usePortfolioAssets();
  const holding = byToken.AAVE;
  const availableAave = holding ? holding.liquidQty + holding.stakedQty + holding.collateralQty : 0;
  const { store, reset } = useDefiActions();
  const actionId = 'AAVE:build:layer1';

  // Gas sa platí v ETH → 100% AAVE je pracovný kapitál.
  const working = holding?.liquidQty ?? 0;

  const [aavePriceUsd, setAavePriceUsd] = useState(0);
  useEffect(() => {
    let alive = true;
    void fetchTokenPrice('AAVE').then(p => { if (alive) setAavePriceUsd(p || 0); });
    const id = window.setInterval(() => {
      void fetchTokenPrice('AAVE').then(p => { if (alive) setAavePriceUsd(p || 0); });
    }, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const [confirmed, setConfirmed] = useState<ConfirmedState>(() => loadConfirmed());

  const resetAll = useCallback(() => {
    persistConfirmed({}); setConfirmed({}); reset('AAVE:');
    toast({ title: 'Plán resetnutý', description: 'Karty sú znovu aktívne (pozície v portfóliu ostávajú).' });
  }, [reset]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/60 via-slate-950/80 to-slate-950/60 p-5 shadow-[0_0_40px_-15px_rgba(139,92,246,0.5)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-purple-300/80">DeFi Mozog · AAVE (Arbitrum)</div>
<TokenValue amount={availableAave} symbol="AAVE" price={aavePriceUsd} size="xl" />
            <div className="text-xs text-slate-400">
              Dostupný zostatok
              {aavePriceUsd > 0 && ` · ≈ $${(availableAave * aavePriceUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
            </div>
          </div>
          <button type="button" onClick={resetAll} className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200">
            Reset plánu
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-black/30 p-2">
            <div className="text-[10px] text-slate-500">Rezerva AAVE</div>
            <div className="font-mono text-sm text-amber-200">0.0000</div>
            <div className="text-[9px] text-slate-500">Gas platený v ETH</div>
          </div>
          <div className="rounded-lg bg-black/30 p-2">
            <div className="text-[10px] text-slate-500">Pracovný (100%)</div>
            <TokenValue amount={working} symbol="AAVE" price={aavePriceUsd} size="sm" />
          </div>
          <div className="rounded-lg bg-black/30 p-2">
            <div className="text-[10px] text-slate-500">Sieť</div>
            <div className="font-mono text-sm text-slate-200">Arbitrum One</div>
          </div>
        </div>
      </div>

      {/* Vrstva 1 · Morpho Blue Supply */}
      <LayerCard
        icon={<Shield className="h-4 w-4" />}
        title="Vrstva 1 · Inštitucionálny Trezor"
        subtitle="100% pracovného kapitálu · Morpho Blue Vaults (Arbitrum)"
        executed={!!confirmed.layer1 || !!store[actionId]}
      >
        <div className="rounded-lg border border-emerald-500/20 bg-black/30 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-emerald-200">🔷 Morpho Blue Supply (AAVE)</div>
            <div className="text-[10px] text-slate-500">Supply-only</div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Vstupné AAVE na vklad</span>
            <div className="flex items-center gap-2">
              <TokenValue amount={working} symbol="AAVE" price={aavePriceUsd} size="sm" copy />
            </div>
          </div>
          <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-100/90">
            <div className="font-semibold text-emerald-300">Cyborg Action Plan</div>
            <div className="mt-1">
              Vlož AAVE do Morpho Blue vaultu na Arbitrume cez{' '}
              <a href={MORPHO_ARBITRUM_URL} target="_blank" rel="noreferrer" className="underline decoration-dotted">
                app.morpho.org/arbitrum
              </a>. Výnos: úrok z požičiavania + protokolové odmeny.
            </div>
          </div>
        </div>

        <RecordActionButton actionId={actionId} symbol="AAVE" amount={working}
          stakeProtocol="AAVE (Morpho Supply)" disabled={!!confirmed.layer1 || working <= 0}
          label="Potvrdiť exekúciu" doneLabel="Zaznamenané" toastMessage="Vklad AAVE zaznamenaný." />
      </LayerCard>

      {/* Vrstva 2 · No-Loop Safety Panel */}
      <LayerCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Vrstva 2 · Ochrana kapitálu (No-Loop)"
        subtitle="Looping je pre AAVE zakázaný"
      >
        <div className="rounded-lg border-2 border-red-500/50 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-300" />
            <div className="text-[12px] leading-relaxed text-red-100">
              <div className="font-bold text-red-200">⚠️ Ochrana kapitálu</div>
              <div className="mt-1">
                AAVE nie je LST. Looping tohto aktíva prináša{' '}
                <span className="font-semibold text-red-200">extrémne riziko likvidácie</span>.
                Povolený je len bezpečný vklad (Supply).
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
