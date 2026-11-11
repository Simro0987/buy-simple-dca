import { AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import type { BtcIndicators, FeedStatus } from '@/hooks/useBtcIndicators';
import { boostPlan, boostGate, UNWIND_LADDER, semaforPhase, MACRO_ATH } from '@/lib/btcSmartTurbo';
import { fmtQty, fmtInd } from '@/lib/formatNumber';
import { RecordActionButton } from './RecordActionButton';

const usd = (n?: number | null, d = 0) => n == null || !Number.isFinite(n) ? '…' : `$${n.toLocaleString('sk-SK', { maximumFractionDigits: d })}`;
const dot = (s?: FeedStatus) => s === 'down' ? '🔴 Nedostupné' : '🟢 Live';

function Row({ label, value, source, status }: { label: string; value: string; source?: string | null; status?: FeedStatus }) {
  return (
    <div className="flex items-center justify-between gap-2 whitespace-nowrap text-[10px] font-mono">
      <span className="text-slate-400 truncate">{label}</span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-slate-100">{value}</span>
        <span className="text-slate-500">{source ?? '—'}</span>
        <span className={status !== 'down' ? 'text-gain' : 'text-warning'}>{dot(status)}</span>
      </span>
    </div>
  );
}

/** Box všetkých API a indikátorov — hodnota, aktívny zdroj, stav pripojenia. */
export function BtcIndicatorBox({ data }: { data?: BtcIndicators }) {
  if (!data) return <p className="text-[10px] text-slate-500 font-mono">Načítavam indikátory (multi-API waterfall)…</p>;
  const c = data.candles;
  return (
    <div className="rounded-xl border border-purple-500/30 bg-slate-950/70 p-2.5 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-300">API & indikátory</p>
      <Row label="Cena BTC" value={usd(data.price.value)} source={data.price.source} status={data.price.status} />
      <Row label="24h zmena" value={data.price.change24h == null ? '—' : `${data.price.change24h.toFixed(2)} %`} source={data.price.changeSource ?? data.price.source} status={data.price.change24h == null ? 'down' : 'live'} />
      <Row label="ATH" value={usd(data.price.ath)} source={data.price.athSource ?? data.price.source} status={data.price.ath ? 'live' : 'down'} />
      <Row label="14D RSI" value={fmtInd(data.rsi14, 1)} source={c.source} status={c.status} />
      <Row label="200D SMA" value={usd(data.sma200)} source={c.source} status={c.status} />
      <Row label="Volatilita 30D" value={data.vol30 == null ? '—' : `${data.vol30.toFixed(1)} %`} source={c.source} status={c.status} />
      <Row label="MVRV" value={fmtInd(data.mvrv.value, 2)} source={data.mvrv.source} status={data.mvrv.status} />
      <Row label="MVRV Z-Score" value={fmtInd(data.mvrv.z, 2)} source={data.mvrv.source} status={data.mvrv.status} />
      <Row label="Fear & Greed" value={data.fearGreed.value == null ? '—' : String(Math.round(data.fearGreed.value))} source={data.fearGreed.source} status={data.fearGreed.status} />
      <Row label="DeFi pooly & APY" value={data.pools ? `${data.pools.count} · ${fmtInd(data.pools.bestApy, 2)} %` : 'Aave V3'} source="DefiLlama" status={data.pools ? 'live' : 'down'} />
      {data.mobula?.map((m) => <Row key={m.symbol} label={`Mobula ${m.symbol}`} value={usd(m.price, m.price < 100 ? 2 : 0)} source="Mobula v2" status="live" />)}
    </div>
  );
}

export function BtcTurboLayer3(p: {
  depositBtc: number; price?: number | null; existingCollBtc: number; existingDebtUsd: number;
  avgPrice?: number | null; chain?: string | null; stable: string; rsi?: number | null; sma200?: number | null;
  onRecord: (extraCollBtc: number, debtUsd: number) => boolean;
}) {
  const gate = boostGate(p.price, p.sma200, p.rsi);
  const plan = p.price ? boostPlan({ depositBtc: p.depositBtc, price: p.price, existingCollBtc: p.existingCollBtc, existingDebtUsd: p.existingDebtUsd, existingAvgPrice: p.avgPrice, enabled: gate.allowed }) : null;
  const chain = p.chain ?? 'Arbitrum';
  return (
    <div className="space-y-2">
      {gate.belowSma
        ? <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-[11px] text-red-200 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />Cena BTC je pod 200D SMA ({usd(p.sma200)}). Boost zakázaný — iba čistý spotový vklad.</div>
        : gate.rsiGreen
          ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300"><Zap className="w-3 h-3" />RSI {p.rsi?.toFixed(1)} &lt; 35 · Boost 1.40x odporúčaný</span>
          : <span className="inline-flex rounded-full border border-slate-700 px-2.5 py-1 text-[10px] text-slate-400">RSI {p.rsi?.toFixed(1) ?? '…'} · Boost povolený (nad 200D SMA)</span>}
      {plan && <div className="rounded-lg border border-purple-500/30 bg-slate-950/60 p-2.5 space-y-1 text-[11px] font-mono">
        <div className="flex flex-wrap justify-between gap-x-2 min-w-0"><span className="text-slate-400">Týždenný vklad</span><span className="text-slate-100">{fmtQty(p.depositBtc)} BTC · {usd(plan.depositUsd, 2)}</span></div>
        <div className="flex flex-wrap justify-between gap-x-2 min-w-0"><span className="text-slate-400">Kolaterál po Booste {gate.allowed ? '1.40x' : '1.00x'}</span><span className="text-slate-100">{fmtQty(plan.boostedCollBtc)} BTC</span></div>
        <div className="flex flex-wrap justify-between gap-x-2 min-w-0"><span className="text-slate-400">Automatický dlh ({p.stable})</span><span className="text-slate-100">{usd(plan.newDebtUsd, 2)}</span></div>
        <div className="flex flex-wrap justify-between gap-x-2 min-w-0"><span className="text-slate-400">DCA priemer BTC</span><span className="text-slate-100">{usd(plan.avgPrice)}</span></div>
        <div className="flex flex-wrap justify-between gap-x-2 min-w-0"><span className="text-slate-400">Zlúčená pozícia</span><span className="text-slate-100">{fmtQty(plan.totalColl)} BTC · dlh {usd(plan.totalDebt, 2)}</span></div>
        <div className="flex flex-wrap justify-between gap-x-2 min-w-0"><span className="text-slate-400">Likvidačná cena (78 %)</span><span className="text-loss font-semibold">{plan.liqPrice == null ? 'Bez dlhu' : usd(plan.liqPrice)}</span></div>
      </div>}
      {plan && p.depositBtc > 0 && <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] text-slate-100">
        {gate.allowed
          ? <>Prejdi do DeFi Savera (Aave V3 - {chain}), vlož {fmtQty(p.depositBtc)} WBTC/cbBTC, klikni na BOOST a nastav páku presne na 1.40x (požičať {p.stable}). Tvoja pozícia bude zlikvidovaná, ak BTC spadne na cenu {usd(plan.liqPrice)}.</>
          : <>Prejdi do DeFi Savera (Aave V3 - {chain}) a vlož {fmtQty(p.depositBtc)} WBTC/cbBTC iba ako čistý spotový vklad — bez Boostu.</>}
      </p>}
      <RecordActionButton actionId={`BTC:build:turbo-boost`} symbol={p.stable} amount={plan?.newDebtUsd ?? 0}
        debtAsset="BTC" debtUsd={plan?.newDebtUsd ?? 0}
        disabled={!plan || !gate.allowed || plan.newDebtUsd <= 0}
        performAction={() => !!plan && p.onRecord(plan.boostedCollBtc - p.depositBtc, plan.newDebtUsd)}
        label="Zaznamenať Boost 1.40x v DeFi Savere" doneLabel="Boost zaznamenaný" toastMessage="Boost 1.40x zaznamenaný; vykonanie over v DeFi Savere." />
    </div>
  );
}

const PHASES = [
  { cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200', text: () => '🟢 Trh je stabilný. Nechaj bežať Auto-Repay a statických Take-Profit robotov.' },
  { cls: 'border-amber-500/40 bg-amber-500/10 text-amber-200', text: (px: string) => `🟡 Trh sa zahrieva! V DeFi Savere nastav/posuň 1. Take-Profit Unwind na aktuálnu cenu BTC (${px}) pre splatanie 33 % dlhu.` },
  { cls: 'border-orange-500/50 bg-orange-500/10 text-orange-200', text: (px: string) => `🟠 Silná eufória! Nastav 2. Take-Profit Unwind na aktuálnu cenu BTC (${px}) pre splatanie ďalších 33 % dlhu.` },
  { cls: 'border-red-500/60 bg-red-500/15 text-red-200', text: (px: string) => `🚨 KRITICKÁ BUBLINA (OVERRIDE)! Ignoruj statický plán! Zruš robotov v DeFi Savere, okamžite urob manuálny 100 % Repay pri cene ${px} a vyber čistý WBTC do Cold Storage.` },
];

export function BtcAutomationLayer4(p: { price?: number | null; fg?: number | null; mvrv?: number | null; mvrvZ?: number | null; debtUsd: number }) {
  // Semafor: prahy 1.5 / 2.2 / 3.0 sa vyhodnocujú na MVRV Z-Score (4-ročné okno).
  const phase = semaforPhase(p.fg, p.mvrvZ);
  const ph = PHASES[phase];
  return (
    <div className="space-y-3 text-[11px]">
      <div className="rounded-lg border border-emerald-500/30 bg-slate-950/60 p-2.5">
        <p className="text-[10px] font-semibold uppercase text-emerald-300 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />Blok A · Ochrana nadol</p>
        <p className="text-slate-200 mt-1">Uisti sa, že v DeFi Savere beží Auto-Repay (Trigger HF 1.20 → Target HF 1.50).</p>
      </div>
      <div className="rounded-lg border border-purple-500/30 bg-slate-950/60 p-2.5 space-y-1 font-mono">
        <p className="text-[10px] font-semibold uppercase text-purple-300 font-sans">Blok B · Statický rebrík z makro ATH {usd(MACRO_ATH)}</p>
        {UNWIND_LADDER.map((s, i) => (
          <div key={s.mult} className="flex justify-between gap-2">
            <span className={p.price != null && p.price >= s.price ? 'text-gain' : 'text-slate-400'}>Cieľ {i + 1} ({s.mult.toFixed(2)}x = {usd(s.price)})</span>
            <span className="text-slate-200 text-right">{s.label}{p.debtUsd > 0 && s.repayPct < 100 ? ` · ${usd(p.debtUsd * s.repayPct / 100, 2)}` : ''}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase text-slate-300">Blok C · Live Strážca (F&G {p.fg ?? '…'} · MVRV {p.mvrv?.toFixed(2) ?? '…'} · Z {p.mvrvZ?.toFixed(2) ?? '…'})</p>
        <div role={phase === 3 ? 'alert' : undefined} className={`rounded-lg border px-3 py-2 ${ph.cls}`}>
          <p className="font-semibold">Fáza {phase}</p>
          <p>{ph.text(usd(p.price))}</p>
        </div>
      </div>
    </div>
  );
}
