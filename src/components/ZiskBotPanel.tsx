import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  Lock,
  Bitcoin,
  Download,
  Upload,
  Layers,
  Activity,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import {
  loadZiskBotState,
  subscribeZiskBot,
  exportZiskLearnedSyncBundle,
  importZiskLearnedSyncBundle,
  computeZiskAllocatorUtility,
  type ZiskBotState,
  type ZiskLearnedEntry,
} from '@/lib/ziskBotEngine';

interface Props {
  lang: Lang;
}

export function ZiskBotPanel({ lang }: Props) {
  const sk = lang === 'sk';
  const [zisk, setZisk] = useState<ZiskBotState>(() => loadZiskBotState());
  const [importJsonText, setImportJsonText] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);

  useEffect(() => {
    return subscribeZiskBot(() => {
      setZisk(loadZiskBotState());
    });
  }, []);

  const learnedMap = useMemo(() => {
    const m: Record<string, ZiskLearnedEntry> = {};
    for (const l of zisk.learned) m[l.key] = l;
    return m;
  }, [zisk.learned]);

  const allocUtility = useMemo(
    () => computeZiskAllocatorUtility(zisk.positions, learnedMap),
    [zisk.positions, learnedMap],
  );

  const handleExportLearnSync = () => {
    const bundle = exportZiskLearnedSyncBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learned-${zisk.instanceId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      sk
        ? 'Zisk Bot `zisk-learned/1` stav exportovaný (iba naučené skóre rel/expRet/vol/mdd a váhy signálov — žiadne kľúče)!'
        : 'Zisk Bot `zisk-learned/1` state exported!',
    );
  };

  const handleImportLearnSync = () => {
    try {
      const parsed = JSON.parse(importJsonText.trim());
      const res = importZiskLearnedSyncBundle(parsed);
      setZisk(res.updatedState);
      setImportJsonText('');
      setShowImportBox(false);
      toast.success(
        sk
          ? `Learn-Sync zlúčený váženým priemerom (wavg): ${res.mergedLearnedCount} stratégií a ${res.mergedSignalsCount} signálov!`
          : `Learn-Sync merged via weighted average: ${res.mergedLearnedCount} strategies and ${res.mergedSignalsCount} signals!`,
      );
    } catch (e) {
      toast.error(
        sk
          ? `Chyba importu zisk-learned/1: ${(e as Error).message}`
          : `Import error: ${(e as Error).message}`,
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Zisk Bot Header Banner */}
      <div className="rounded-2xl border border-[#14F195]/40 bg-[#14F195]/[0.05] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#14F195]/20 border border-[#14F195]/40 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-[#14F195]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-foreground">
                  Zisk Bot · Treasury, Delta-Neutral Funding &amp; Yield Optimizer
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#14F195]/20 text-[#14F195] border border-[#14F195]/40 text-[10px] font-mono font-bold">
                  SWARM NODE ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {sk
                  ? 'Plne integrovaný Zisk Bot v kolektívnej neurónovej sieti: Delta-Neutral Funding (INJ, TIA, Helix ATOM), Solana Measured Lending (Jupiter Lend, Kamino), Akash AKT rezerva a automatické zlievanie výnosu do čistého BTC v Safe peňaženke.'
                  : 'Fully integrated Zisk Bot inside the collective neural swarm: Delta-Neutral Funding (INJ, TIA, Helix ATOM), Solana Measured Lending (Jupiter Lend, Kamino), Akash AKT reserve, and automatic BTC harvesting.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <Lock className="w-3 h-3" />
              No-Transfer LOCKED
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[10px] font-mono font-bold flex items-center gap-1">
              <Bitcoin className="w-3 h-3" />
              +{zisk.btcHarvestedFromYieldAndFunding.toFixed(5)} ₿
            </span>
          </div>
        </div>

        {/* 4 Key Zisk Bot Telemetry Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase block">
              {sk ? 'Hodnota Portfólia (Zisk)' : 'Portfolio Value'}
            </span>
            <span className="text-sm font-black text-foreground font-mono">
              ${zisk.currentValueUsd.toFixed(2)}
            </span>
            <span className="text-[9px] text-emerald-300 block font-mono">
              Štart ${zisk.startUsd.toFixed(0)} · Peak ${zisk.peakUsd.toFixed(2)}
            </span>
          </div>

          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase block">
              Drawdown &amp; De-Risk
            </span>
            <span className="text-sm font-black text-amber-400 font-mono">
              DD {zisk.currentDrawdownPct.toFixed(2)}%
            </span>
            <span className="text-[9px] text-muted-foreground block">
              {zisk.drawdownDeRiskActive
                ? sk
                  ? 'De-Risk aktívny (≥ 6% DD → Stable)'
                  : 'De-Risk active (>= 6% DD)'
                : sk
                  ? 'V norme (< 6% DD)'
                  : 'Normal (< 6% DD)'}
            </span>
          </div>

          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase block">
              Allocator Utility (90d)
            </span>
            <span className="text-sm font-black text-[#14F195] font-mono">
              +{allocUtility.utility.toFixed(2)}%
            </span>
            <span className="text-[9px] text-muted-foreground block font-mono">
              Vyhodnotené: {zisk.evaluatedOpportunitiesCount} príl.
            </span>
          </div>

          <div className="rounded-xl bg-black/40 border border-white/[0.07] p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase block">
              Akash Hosting Rezerva
            </span>
            <span className="text-sm font-black text-sky-400 font-mono">
              {zisk.akashHostingReserveMonths.toFixed(1)} mes. (AKT)
            </span>
            <span className="text-[9px] text-muted-foreground block">
              Min. politika: 2 mesiace
            </span>
          </div>
        </div>
      </div>

      {/* ACTIVE ZISK BOT POSITIONS (Funding Capture, Solana Measured Lending, Native Staking, De-Risk Sleeve) */}
      <div className="glass-card p-4 space-y-3 border border-white/[0.08]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#14F195]" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {sk
                ? `Aktívne Pozície Zisk Bota (${zisk.positions.length}) · Výnos automaticky smeruje do BTC`
                : `Active Zisk Bot Positions (${zisk.positions.length}) · Yield auto-routes to BTC`}
            </h3>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            INJ Baseline APR: {zisk.injBaseApr.toFixed(2)}%
          </span>
        </div>

        <div className="space-y-2">
          {zisk.positions.map((pos) => {
            const learned = learnedMap[pos.id];
            return (
              <div
                key={pos.id}
                className="rounded-xl bg-secondary/50 border border-border/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-foreground">{pos.id}</span>
                    <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-[#14F195] border border-[#14F195]/30">
                      {pos.token} · {pos.chain.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{pos.venue}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono">
                    <span>Páka: {pos.leverage.toFixed(1)}x</span>
                    {pos.liqDistPct !== null && (
                      <span className="text-emerald-300">Liq odstup: {pos.liqDistPct.toFixed(1)}%</span>
                    )}
                    {learned && (
                      <span className="text-sky-300">
                        Spoľahlivosť (rel): {(learned.rel * 100).toFixed(0)}% (n={learned.n})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-end justify-between gap-1 shrink-0 font-mono">
                  <span className="text-xs font-bold text-foreground">${pos.usd.toFixed(2)}</span>
                  <span className="text-[10px] text-emerald-400">
                    {pos.netApr > 0 ? `${pos.netApr.toFixed(2)}% APR` : 'De-Risk Rezerva'} · +${pos.accruedYieldUsd.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* COLLECTIVE SWARM SIGNAL WEIGHTS (`signal_weights.json`) & LEARNED RELIABILITY (`learned.json`) */}
      <div className="glass-card p-4 space-y-3 border border-sky-500/30">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {sk
                ? 'Naučené Váhy Signálov (`signal_weights.json`) zdieľané v celej Swarm sieti'
                : 'Learned Signal Weights (`signal_weights.json`) shared across Swarm Mesh'}
            </h3>
          </div>
          <span className="text-[10px] font-mono text-sky-300">
            Learn Index #{zisk.learnIdx} · P2P Sync Active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {zisk.signalWeights.map((sw) => (
            <div
              key={sw.signal}
              className="rounded-lg bg-secondary/60 border border-border/60 px-2.5 py-1.5 flex items-center justify-between text-xs font-mono"
            >
              <span className="text-muted-foreground">{sw.signal}</span>
              <span className="font-bold text-foreground">{(sw.w * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>

        {/* Export / Import `zisk-learned/1` (learn-sync.js compatibility) */}
        <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {sk
              ? 'Kompatibilné s `node learn-sync.js export / import` (`format: "zisk-learned/1"`, vážený priemer `wavg`):'
              : 'Compatible with `node learn-sync.js export / import` (`format: "zisk-learned/1"`, weighted average `wavg`):'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportLearnSync}
              className="px-3 py-1.5 rounded-lg bg-[#14F195] text-black text-xs font-bold flex items-center gap-1.5 hover:bg-[#14F195]/90"
            >
              <Download className="w-3.5 h-3.5" />
              {sk ? 'Exportovať learned.json' : 'Export learned.json'}
            </button>
            <button
              type="button"
              onClick={() => setShowImportBox((v) => !v)}
              className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-sky-400" />
              {sk ? 'Importovať z inej inštancie' : 'Import from Peer Instance'}
            </button>
          </div>
        </div>

        {showImportBox && (
          <div className="space-y-2 pt-2">
            <textarea
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              rows={4}
              placeholder='{"format": "zisk-learned/1", "instanceId": "srv2", "learned": {...}, "signalWeights": {...}}'
              className="w-full rounded-xl bg-black/50 border border-border p-2.5 text-xs font-mono text-foreground focus:outline-none focus:border-[#14F195]"
            />
            <button
              type="button"
              onClick={handleImportLearnSync}
              className="w-full py-2 rounded-xl bg-sky-500 text-black font-bold text-xs"
            >
              {sk ? 'Zlúčiť naučené skóre cez vážený priemer (wavg)' : 'Merge Learned State via wavg'}
            </button>
          </div>
        )}
      </div>

      {/* ZISK BOT RISK GUARDRAILS & MULTI-CHAIN TREASURY ADDRESSES */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {sk
              ? 'Bezpečnostné Limity Zisk Bota & Sledované Verejné Treasury Adresy'
              : 'Zisk Bot Safety Limits & Monitored Public Treasury Addresses'}
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-lg bg-secondary/40 p-2 border border-border/50">
            <span className="text-muted-foreground block">Max Cap na Token</span>
            <span className="font-mono font-bold text-foreground">≤ {zisk.riskLimits.maxTokenCapPct}%</span>
          </div>
          <div className="rounded-lg bg-secondary/40 p-2 border border-border/50">
            <span className="text-muted-foreground block">Funding Sleeve Cap</span>
            <span className="font-mono font-bold text-foreground">≤ {zisk.riskLimits.maxFundingSleevePct}% (INJ ≤ 8%)</span>
          </div>
          <div className="rounded-lg bg-secondary/40 p-2 border border-border/50">
            <span className="text-muted-foreground block">Moonshot + Meme Cap</span>
            <span className="font-mono font-bold text-foreground">≤ {zisk.riskLimits.maxMoonshotMemeJointCapPct}% (Liq ≥ $150k)</span>
          </div>
          <div className="rounded-lg bg-secondary/40 p-2 border border-border/50">
            <span className="text-muted-foreground block">Stop-Loss / Kill DD</span>
            <span className="font-mono font-bold text-emerald-400">
              SL {zisk.riskLimits.stopLossPct}% · Kill {zisk.riskLimits.maxDrawdownKillPct}%
            </span>
          </div>
        </div>

        <div className="space-y-1 pt-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
            {sk
              ? 'Verejné Read-Only Treasury Adresy z config.json (žiadne seedy ani privátne kľúče):'
              : 'Public Read-Only Treasury Addresses from config.json (zero seeds or private keys):'}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {Object.entries(zisk.publicAddresses).map(([chainKey, addr]) => (
              <div
                key={chainKey}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/[0.06] text-[10px] font-mono"
              >
                <span className="uppercase font-bold text-[#14F195]">{chainKey}:</span>
                <span className="text-muted-foreground truncate">{addr}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
