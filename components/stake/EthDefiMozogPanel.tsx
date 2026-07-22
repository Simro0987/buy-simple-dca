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
} from "@/components/stake/defiShared";
import { formatGasEstimate } from "@/hooks/useGasEstimator";
import { useEthDefiMozog } from "@/hooks/useEthDefiMozog";
import { interactiveButton } from "@/lib/motion";
import { formatDecimal, formatPct, formatUsd } from "@/lib/numberFormat";
import { STAKE_FOCUS_SYMBOL } from "@/lib/stakeDefiMozog";
import { useAppStore } from "@/src/store/useAppStore";

interface EthDefiMozogPanelProps {
  onToast?: (message: string) => void;
}

export function EthDefiMozogPanel({ onToast }: EthDefiMozogPanelProps) {
  const portfolioAssets = useAppStore((state) => state.portfolioAssets);
  const dcaSnapshot = useAppStore((state) => state.globalLiveData.dcaSnapshot);

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const [layerConfirmed, setLayerConfirmed] = useState<Record<string, boolean>>({});

  const ethAsset = useMemo(
    () => portfolioAssets.find((a) => a.symbol === STAKE_FOCUS_SYMBOL),
    [portfolioAssets],
  );

  const availableEth = ethAsset?.balance ?? 0;
  const fallbackEthPrice =
    ethAsset?.unitPrice ?? dcaSnapshot?.tokens?.ETH?.price ?? 3500;

  const snapshot = useEthDefiMozog({ availableEth, fallbackEthPrice });

  useEffect(() => {
    if (snapshot.loading) return;
    const best = snapshot.smartRoutes.find((r) => r.recommended);
    setSelectedRouteId((prev) => prev ?? best?.id ?? snapshot.smartRoutes[0]?.id ?? null);
  }, [snapshot.loading, snapshot.smartRoutes]);

  const confirmLayer = useCallback(
    (layerId: string, label: string) => {
      setLayerConfirmed((prev) => ({ ...prev, [layerId]: true }));
      onToast?.(`${label} — exekúcia pripravená (simulácia)`);
    },
    [onToast],
  );

  if (snapshot.loading) return <DefiLoadingState />;

  const { allocation, protocols, routingWinner, vaults, wma } = snapshot;
  const selectedRoute = snapshot.smartRoutes.find((r) => r.id === selectedRouteId);
  const lidoApy = protocols.find((p) => p.id === "lido")?.apyPct ?? 0;
  const rocketApy = protocols.find((p) => p.id === "rocket-pool")?.apyPct ?? 0;

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
              Stake · ETH
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Vrstvenie kapitálu, protokolová alokácia a Smart Routing
            </p>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-emerald-400/80" />
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Dostupný zostatok"
            value={`${formatDecimal(allocation.gasReserveEth + allocation.coreStakingEth, 4)} ETH`}
            sub={formatUsd(snapshot.availableUsd)}
            accent="emerald"
          />
          <MetricTile
            label="Base Fee"
            value={`${formatDecimal(snapshot.gas.baseFeeGwei, 1)} gwei`}
            sub={snapshot.gas.source === "live" ? "live" : "odhad"}
          />
          <MetricTile
            label="Fast Fee"
            value={`${formatDecimal(snapshot.gas.fastFeeGwei, 1)} gwei`}
            sub="exekúcia L1"
            accent="violet"
          />
          <MetricTile
            label="Blended APY"
            value={formatPct(
              (lidoApy * wma.lidoSharePct + rocketApy * wma.rocketSharePct) / 100,
              2,
            )}
            sub="Lido + Rocket Pool"
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
            <h3 className="text-sm font-bold text-white">Lido vs. Rocket Pool</h3>
          </div>
          <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold text-violet-300">
            {wma.lidoSharePct}/{wma.rocketSharePct}
          </span>
        </div>
        <input
          type="range"
          min={30}
          max={70}
          step={5}
          value={wma.lidoSharePct}
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
                  protocol.id === "lido" ? allocation.lidoEth : allocation.rocketEth,
                  4,
                )}{" "}
                ETH
              </p>
            </div>
          ))}
        </div>
      </section>

      <LayerShell
        layer="Vrstva 1"
        title="Gas & Take Profit"
        subtitle="Vyhradená rezerva — výhradne plyn pre exekúciu DCA/LMT. Nikdy sa nestakuje."
        accent="amber"
      >
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[10px] leading-relaxed text-amber-100/80">
            {allocation.gasReservePct} % kapitálu ({formatDecimal(allocation.gasReserveEth, 4)}{" "}
            ETH) je uzamknuté pre gas buffer a take-profit exekúcie.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-amber-400" />
            <div>
              <p className="text-xs font-bold text-white">
                {formatDecimal(allocation.gasReserveEth, 4)} ETH
              </p>
              <p className="text-[9px] text-zinc-500">rezerva · {allocation.gasReservePct} %</p>
            </div>
          </div>
          <CopyValueButton
            compact
            value={formatDecimal(allocation.gasReserveEth, 6)}
            label="Kopírovať gas rezervu ETH"
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
        title="Core Staking · Meta-Aggregator"
        subtitle="Rocket Pool + Lido/stETH/wstETH s porovnaním Smart Routing ciest."
        accent="violet"
      >
        <div className="mb-3 grid grid-cols-2 gap-2">
          <MetricTile
            label="Rocket Pool"
            value={`${formatDecimal(allocation.rocketEth, 4)} ETH`}
            sub="rETH mint"
            accent="violet"
          />
          <MetricTile
            label="Lido"
            value={`${formatDecimal(allocation.lidoEth, 4)} ETH`}
            sub="stETH / wstETH"
            accent="emerald"
          />
        </div>

        {routingWinner ? (
          <div className="mb-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <p className="text-[10px] font-bold text-emerald-300">{routingWinner.message}</p>
            <p className="mt-1 text-[9px] text-emerald-200/70">
              Čistá hodnota: {formatUsd(routingWinner.route.netValueUsd)} · výstup{" "}
              {formatDecimal(routingWinner.route.outputAmount, 4)}{" "}
              {routingWinner.route.outputToken.replace("ETH → ", "")} ·{" "}
              {formatGasEstimate(routingWinner.route.gasUsd)}
            </p>
          </div>
        ) : null}

        <div className="mb-2 flex items-center gap-2">
          <Route className="h-3.5 w-3.5 text-violet-400" />
          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            Smart Routing
          </p>
        </div>

        {snapshot.rocketRoutes.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-600">
              Sekcia A · Rocket Pool
            </p>
            <div className="space-y-2">
              {snapshot.rocketRoutes.map((route) => (
                <DefiRouteRow
                  key={route.id}
                  label={route.label}
                  recommended={route.recommended}
                  detailLine={`${formatGasEstimate(route.gasUsd)} · net ${formatUsd(route.netValueUsd)} · výstup ${formatDecimal(route.outputAmount, 4)}`}
                  effectiveApyPct={route.effectiveApyPct}
                  selected={route.id === selectedRouteId}
                  onSelect={() => setSelectedRouteId(route.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {snapshot.lidoRoutes.length > 0 ? (
          <div className="mb-2">
            <p className="mb-1.5 text-[8px] font-bold uppercase tracking-wider text-zinc-600">
              Sekcia B · Lido
            </p>
            <div className="space-y-2">
              {snapshot.lidoRoutes.map((route) => (
                <DefiRouteRow
                  key={route.id}
                  label={route.label}
                  recommended={route.recommended}
                  detailLine={`${formatGasEstimate(route.gasUsd)} · net ${formatUsd(route.netValueUsd)} · výstup ${formatDecimal(route.outputAmount, 4)}`}
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
              {" · "}Vstupné ETH:{" "}
              <span className="font-bold text-violet-200">
                {formatDecimal(selectedRoute.inputEth, 6)}
              </span>
            </p>
            <CopyValueButton
              compact
              value={formatDecimal(selectedRoute.inputEth, 6)}
              label="Kopírovať vstupné ETH"
            />
          </div>
        ) : null}

        <motion.button
          type="button"
          {...interactiveButton}
          disabled={layerConfirmed.core || allocation.coreStakingEth <= 0}
          onClick={() => confirmLayer("core", "Vrstva 2 · Core Staking")}
          className={`mt-3 w-full rounded-2xl border px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            layerConfirmed.core
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
          }`}
        >
          {layerConfirmed.core
            ? "Core staking pripravený"
            : `Exekuovať core staking (${formatDecimal(allocation.coreStakingEth, 4)} ETH)`}
        </motion.button>
      </LayerShell>

      <LayerShell
        layer="Vrstva 3"
        title="Advanced Vaults"
        subtitle="Voliteľné uloženie LST do yield vaultov s explicitným risk profilom."
        accent="emerald"
      >
        {vaults.map((vault) => (
          <div key={vault.id} className="rounded-2xl border border-white/5 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Vault className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-xs font-bold text-white">{vault.label}</p>
                  <p className="text-[9px] text-zinc-500">{vault.underlying}</p>
                </div>
              </div>
            </div>
            {vault.inheritedToken === "wstETH" ? (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-orange-500/20 bg-orange-500/5 px-2.5 py-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
                <p className="text-[9px] leading-relaxed text-orange-200/80">
                  Extra smart kontrakt (wstETH wrap) — vyššie riziko než natívny stETH mint.
                </p>
              </div>
            ) : null}
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">{vault.riskNote}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-emerald-300">
                +{formatPct(vault.apyBoostPct, 1)} boost · deposit(){" "}
                {formatGasEstimate(vault.depositGasUsd)}
              </p>
              <CopyValueButton
                compact
                value={formatDecimal(
                  snapshot.lidoRoutes.find((r) => r.recommended)?.inputEth ??
                    allocation.lidoEth,
                  6,
                )}
                label={`Kopírovať vstupné ETH pre ${vault.inheritedToken}`}
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
                Aktivovať vault deposit ({vault.inheritedToken}) po core staku
              </span>
            </label>
          </div>
        ))}
        <motion.button
          type="button"
          {...interactiveButton}
          disabled={!vaultEnabled || layerConfirmed.vault}
          onClick={() => confirmLayer("vault", "Vrstva 3 · Advanced Vault")}
          className={`mt-3 w-full rounded-2xl border px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            layerConfirmed.vault
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : vaultEnabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                : "border-white/5 bg-white/[0.02] text-zinc-600"
          }`}
        >
          {layerConfirmed.vault ? "Vault deposit pripravený" : "Potvrdiť vault deposit"}
        </motion.button>
      </LayerShell>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <Layers className="h-3.5 w-3.5 text-violet-400" />
          <span>
            Pipeline: Gas ({allocation.gasReservePct} %) → Core (
            {formatDecimal(allocation.coreStakingEth, 4)} ETH) →{" "}
            {vaultEnabled ? `Vault (${vaults[0]?.inheritedToken ?? "stETH"})` : "bez vaultu"}
          </span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-zinc-600" />
        </div>
      </div>
    </motion.div>
  );
}
