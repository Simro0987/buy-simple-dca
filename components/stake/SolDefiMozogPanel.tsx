"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Fuel,
  Layers,
  Route,
  Sparkles,
  Vault,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyValueButton } from "@/components/ui/CopyValueButton";
import {
  DefiLoadingState,
  DefiRouteRow,
  LayerShell,
  MetricTile,
  RiskBadge,
} from "@/components/stake/defiShared";
import { formatSolGasEstimate } from "@/hooks/useSolanaGasEstimator";
import { useSolDefiMozog } from "@/hooks/useSolDefiMozog";
import { interactiveButton } from "@/lib/motion";
import { formatDecimal, formatPct, formatUsd } from "@/lib/numberFormat";
import { applySolDefiMozogExecution } from "@/lib/solDefi/portfolioExecution";
import { useAppStore } from "@/src/store/useAppStore";

interface SolDefiMozogPanelProps {
  onToast?: (message: string) => void;
}

export function SolDefiMozogPanel({ onToast }: SolDefiMozogPanelProps) {
  const portfolioAssets = useAppStore((state) => state.portfolioAssets);
  const portfolioData = useAppStore((state) => state.portfolioData);
  const setPortfolioData = useAppStore((state) => state.setPortfolioData);
  const dcaSnapshot = useAppStore((state) => state.globalLiveData.dcaSnapshot);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const [layerConfirmed, setLayerConfirmed] = useState<Record<string, boolean>>({});
  const [portfolioExecuted, setPortfolioExecuted] = useState(false);

  const solAsset = useMemo(
    () => portfolioAssets.find((a) => a.symbol === "SOL"),
    [portfolioAssets],
  );

  const availableSol = solAsset?.balance ?? 0;
  const fallbackSolPrice =
    solAsset?.unitPrice ?? dcaSnapshot?.tokens?.SOL?.price ?? 150;

  const snapshot = useSolDefiMozog({ availableSol, fallbackSolPrice });

  useEffect(() => {
    if (snapshot.loading) return;
    const best = snapshot.jitoRoutes.find((r) => r.recommended);
    setSelectedRouteId((prev) => prev ?? best?.id ?? snapshot.jitoRoutes[0]?.id ?? null);
  }, [snapshot.loading, snapshot.jitoRoutes]);

  const executePortfolio = useCallback(() => {
    if (portfolioExecuted) return;

    const jitoOutput =
      snapshot.jitoWinner?.route.outputAmount ??
      snapshot.allocation.jitoSol * snapshot.mintRate.jitoSolPerSol;

    const updated = applySolDefiMozogExecution(portfolioData, {
      marinadeSol: snapshot.allocation.marinadeSol,
      jitoSolInput: snapshot.allocation.jitoSol,
      jitoSolOutput: jitoOutput,
      solPriceUsd: snapshot.solPriceUsd,
      gasReserveSol: snapshot.allocation.gasReserveSol,
    });

    setPortfolioData(updated);
    setPortfolioExecuted(true);
    onToast?.(
      "Portfólio aktualizované — Marinade Native (Staked SOL) + Jito Restaked (JitoSOL)",
    );
  }, [portfolioData, portfolioExecuted, setPortfolioData, snapshot, onToast]);

  const confirmLayer = useCallback(
    (layerId: string, label: string) => {
      setLayerConfirmed((prev) => ({ ...prev, [layerId]: true }));
      onToast?.(`${label} — exekúcia pripravená`);
    },
    [onToast],
  );

  const tryExecutePortfolio = useCallback(
    (nextConfirmed: Record<string, boolean>, withVault: boolean) => {
      const gasOk = nextConfirmed.gas;
      const coreOk = nextConfirmed.core;
      const vaultOk = withVault ? nextConfirmed.vault : true;
      if (gasOk && coreOk && vaultOk) {
        executePortfolio();
      }
    },
    [executePortfolio],
  );

  if (snapshot.loading) return <DefiLoadingState />;

  const { allocation, protocols, marinadeWinner, jitoWinner, restaking, wma } = snapshot;
  const selectedRoute = snapshot.jitoRoutes.find((r) => r.id === selectedRouteId);
  const marinadeApy = protocols.find((p) => p.id === "marinade")?.apyPct ?? 0;
  const jitoApy = protocols.find((p) => p.id === "jito")?.apyPct ?? 0;
  const jitoSolOutput =
    jitoWinner?.route.outputAmount ??
    allocation.jitoSol * snapshot.mintRate.jitoSolPerSol;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-[#111113] to-emerald-500/5 p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400/80">
              DeFi Mozog
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
              <Brain className="h-5 w-5 text-violet-400" />
              Stake · SOL
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Marinade Native, JitoSOL a Jupiter Smart Routing
            </p>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-emerald-400/80" />
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Dostupný zostatok"
            value={`${formatDecimal(allocation.gasReserveSol + allocation.coreStakingSol, 4)} SOL`}
            sub={formatUsd(snapshot.availableUsd)}
            accent="emerald"
          />
          <MetricTile
            label="Base Fee"
            value={`${snapshot.gas.baseFeeLamports.toLocaleString()} lamports`}
            sub={snapshot.gas.source === "live" ? "live" : "odhad"}
          />
          <MetricTile
            label="Network Gas"
            value={formatSolGasEstimate(snapshot.gas.totalFeeUsd)}
            sub={`priority ${snapshot.gas.priorityFeeLamports} lamports`}
            accent="violet"
          />
          <MetricTile
            label="Blended APY"
            value={formatPct(
              (marinadeApy * wma.marinadeSharePct + jitoApy * wma.jitoSharePct) / 100,
              2,
            )}
            sub="Marinade + Jito"
            accent="emerald"
          />
        </div>
      </div>

      <section className="rounded-3xl border border-white/5 bg-[#111113] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
              Dynamická alokácia trhu
            </p>
            <h3 className="text-sm font-bold text-white">Marinade vs. Jito</h3>
          </div>
          <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold text-violet-300">
            {wma.marinadeSharePct}/{wma.jitoSharePct}
          </span>
        </div>
        <input
          type="range"
          min={30}
          max={70}
          step={5}
          value={wma.marinadeSharePct}
          readOnly
          className="h-1.5 w-full cursor-default appearance-none rounded-full bg-zinc-800 accent-violet-500"
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {protocols.map((protocol) => (
            <div
              key={protocol.id}
              className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
            >
              <p className="text-[10px] font-bold text-white">{protocol.label}</p>
              <p className="text-[9px] text-zinc-500">{protocol.token}</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-sm font-bold tabular-nums text-emerald-300">
                  {formatPct(protocol.apyPct, 2)}
                </p>
                <p className="text-[10px] font-semibold text-violet-300">
                  {protocol.sharePct} %
                </p>
              </div>
              <p className="mt-1 text-[8px] text-zinc-600">
                {formatDecimal(
                  protocol.id === "marinade"
                    ? allocation.marinadeSol
                    : allocation.jitoSol,
                  4,
                )}{" "}
                SOL
              </p>
            </div>
          ))}
        </div>
      </section>

      <LayerShell
        layer="Vrstva 1"
        title="Likvidná rezerva & Gas"
        subtitle="Vyhradená rezerva — výhradne plyn pre exekúciu DCA/LMT. Nikdy sa nestakuje."
        accent="amber"
      >
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[10px] leading-relaxed text-amber-100/80">
            {allocation.gasReservePct} % kapitálu ({formatDecimal(allocation.gasReserveSol, 4)}{" "}
            SOL) je uzamknuté pre gas buffer a take-profit exekúcie.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-amber-400" />
            <div>
              <p className="text-xs font-bold text-white">
                {formatDecimal(allocation.gasReserveSol, 4)} SOL
              </p>
              <p className="text-[9px] text-zinc-500">rezerva · {allocation.gasReservePct} %</p>
            </div>
          </div>
          <CopyValueButton
            compact
            value={formatDecimal(allocation.gasReserveSol, 6)}
            label="Kopírovať gas rezervu SOL"
          />
        </div>
        <motion.button
          type="button"
          {...interactiveButton}
          disabled={layerConfirmed.gas}
          onClick={() => confirmLayer("gas", "Vrstva 1 · Gas rezerva")}
          className={`mt-3 w-full rounded-2xl border px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            layerConfirmed.gas
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
          }`}
        >
          {layerConfirmed.gas ? "Rezerva potvrdená" : "Potvrdiť gas rezervu"}
        </motion.button>
      </LayerShell>

      <LayerShell
        layer="Vrstva 2"
        title="Core Staking · Smart Routing"
        subtitle="Marinade Native delegácia + JitoSOL cez Jupiter Aggregator V6."
        accent="violet"
      >
        <div className="mb-3 grid grid-cols-2 gap-2">
          <MetricTile
            label="Marinade Native"
            value={`${formatDecimal(allocation.marinadeSol, 4)} SOL`}
            sub="priama delegácia"
            accent="emerald"
          />
          <MetricTile
            label="Jito"
            value={`${formatDecimal(allocation.jitoSol, 4)} SOL`}
            sub="JitoSOL"
            accent="violet"
          />
        </div>

        {marinadeWinner ? (
          <div className="mb-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <p className="text-[10px] font-bold text-emerald-300">{marinadeWinner.message}</p>
            <p className="mt-1 text-[9px] text-emerald-200/70">
              Vstup: {formatDecimal(marinadeWinner.inputSol, 4)} SOL · net{" "}
              {formatUsd(marinadeWinner.netValueUsd)} · {formatSolGasEstimate(marinadeWinner.gasUsd)}
            </p>
            <div className="mt-2">
              <CopyValueButton
                compact
                value={formatDecimal(marinadeWinner.inputSol, 6)}
                label="Kopírovať vstupné SOL (Marinade)"
              />
            </div>
          </div>
        ) : null}

        {jitoWinner ? (
          <div className="mb-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <p className="text-[10px] font-bold text-emerald-300">{jitoWinner.message}</p>
            <p className="mt-1 text-[9px] text-emerald-200/70">
              Čistá hodnota: {formatUsd(jitoWinner.route.netValueUsd)} · výstup{" "}
              {formatDecimal(jitoWinner.route.outputAmount, 4)} JitoSOL ·{" "}
              {formatSolGasEstimate(jitoWinner.route.gasUsd)}
              {jitoWinner.netGainVsRunnerUp > 0
                ? ` · +${formatUsd(jitoWinner.netGainVsRunnerUp)} vs. runner-up`
                : ""}
            </p>
          </div>
        ) : null}

        <div className="mb-2 flex items-center gap-2">
          <Route className="h-3.5 w-3.5 text-violet-400" />
          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            Smart Routing
          </p>
        </div>

        {snapshot.marinadeRoutes.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-600">
              Sekcia A · Marinade Native
            </p>
            <div className="space-y-2">
              {snapshot.marinadeRoutes.map((route) => (
                <DefiRouteRow
                  key={route.id}
                  label={route.label}
                  recommended={route.recommended}
                  detailLine={`${formatSolGasEstimate(route.gasUsd)} · net ${formatUsd(route.netValueUsd)} · výstup ${formatDecimal(route.outputAmount, 4)}`}
                  effectiveApyPct={route.effectiveApyPct}
                  selected={route.id === selectedRouteId}
                  onSelect={() => setSelectedRouteId(route.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {snapshot.jitoRoutes.length > 0 ? (
          <div className="mb-2">
            <p className="mb-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-600">
              Sekcia B · Jito / JitoSOL
            </p>
            <div className="space-y-2">
              {snapshot.jitoRoutes.map((route) => (
                <DefiRouteRow
                  key={route.id}
                  label={route.label}
                  recommended={route.recommended}
                  detailLine={`${formatSolGasEstimate(route.gasUsd)} · net ${formatUsd(route.netValueUsd)} · výstup ${formatDecimal(route.outputAmount, 4)} JitoSOL`}
                  effectiveApyPct={route.effectiveApyPct}
                  selected={route.id === selectedRouteId}
                  onSelect={() => setSelectedRouteId(route.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {selectedRoute ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-3 py-2">
            <p className="text-[10px] text-zinc-400">
              Vybraná trasa:{" "}
              <span className="font-bold text-violet-200">{selectedRoute.label}</span>
              {" · "}Vstupné SOL:{" "}
              <span className="font-bold text-violet-200">
                {formatDecimal(selectedRoute.inputSol, 6)}
              </span>
            </p>
            <CopyValueButton
              compact
              value={formatDecimal(selectedRoute.inputSol, 6)}
              label="Kopírovať vstupné SOL"
            />
          </div>
        ) : null}

        <motion.button
          type="button"
          {...interactiveButton}
          disabled={layerConfirmed.core || allocation.coreStakingSol <= 0}
          onClick={() => {
            const next = { ...layerConfirmed, core: true };
            setLayerConfirmed(next);
            onToast?.("Vrstva 2 · Core Staking — exekúcia pripravená");
            if (!vaultEnabled) tryExecutePortfolio(next, false);
          }}
          className={`mt-3 w-full rounded-2xl border px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            layerConfirmed.core
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
          }`}
        >
          {layerConfirmed.core
            ? "Core staking pripravený"
            : `Exekuovať core staking (${formatDecimal(allocation.coreStakingSol, 4)} SOL)`}
        </motion.button>
      </LayerShell>

      <LayerShell
        layer="Vrstva 3"
        title="Jito Restaking · Vault Výber"
        subtitle="100 % JitoSOL zo Sekcie B → odporúčaný VRT vault na jito.network/restaking."
        accent="emerald"
      >
        {restaking ? (
          <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Vault className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-xs font-bold text-white">{restaking.vault.label}</p>
                  <p className="text-[9px] text-zinc-500">JitoSOL → VRT Restaking</p>
                </div>
              </div>
              <RiskBadge level={restaking.vault.riskLevel} />
            </div>

            <div className="mt-2 flex items-start gap-2 rounded-xl border border-orange-500/20 bg-orange-500/5 px-2.5 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
              <p className="text-[9px] leading-relaxed text-orange-200/80">
                Restaking smart kontrakty nesú dodatočné protokolové a slashing riziko oproti
                natívnemu JitoSOL stakingu.
              </p>
            </div>

            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              {restaking.message}
            </p>

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-emerald-300">
                JitoSOL: {formatDecimal(jitoSolOutput, 4)} · APY boost +{formatPct(restaking.vault.apyPct, 1)}
              </p>
              <CopyValueButton
                compact
                value={formatDecimal(jitoSolOutput, 6)}
                label="Kopírovať JitoSOL sumu"
              />
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={vaultEnabled}
                onChange={(e) => setVaultEnabled(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/20 bg-zinc-900 accent-emerald-500"
              />
              <span className="text-[10px] text-zinc-400">
                Aktivovať restaking deposit do {restaking.vault.label}
              </span>
            </label>
          </div>
        ) : null}

        <motion.button
          type="button"
          {...interactiveButton}
          disabled={!vaultEnabled || layerConfirmed.vault || !restaking}
          onClick={() => {
            const next = { ...layerConfirmed, vault: true };
            setLayerConfirmed(next);
            onToast?.("Vrstva 3 · Jito Restaking — exekúcia pripravená");
            tryExecutePortfolio(next, true);
          }}
          className={`mt-3 w-full rounded-2xl border px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            layerConfirmed.vault
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : vaultEnabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                : "border-white/5 bg-white/[0.02] text-zinc-600"
          }`}
        >
          {layerConfirmed.vault
            ? portfolioExecuted
              ? "Portfólio aktualizované"
              : "Restaking pripravený"
            : "Potvrdiť restaking vault"}
        </motion.button>
      </LayerShell>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <Layers className="h-3.5 w-3.5 text-violet-400" />
          <span>
            Pipeline: Rezerva ({allocation.gasReservePct} %) → Core (
            {formatDecimal(allocation.coreStakingSol, 4)} SOL) →{" "}
            {vaultEnabled && restaking
              ? `Restaking (${restaking.vault.label})`
              : "bez restakingu"}
          </span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-zinc-600" />
        </div>
      </div>
    </motion.div>
  );
}
