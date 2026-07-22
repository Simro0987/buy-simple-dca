"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Fuel,
  Layers,
  Route,
  Shield,
  Sparkles,
  Vault,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyValueButton } from "@/components/ui/CopyValueButton";
import { formatDecimal, formatPct, formatUsd } from "@/lib/numberFormat";
import {
  buildStakeMozogSnapshot,
  DEFAULT_LIDO_SHARE_PCT,
  fetchEthGasSnapshot,
  STAKE_FOCUS_SYMBOL,
  type SmartRouteQuote,
  type StakeMozogSnapshot,
} from "@/lib/stakeDefiMozog";
import { interactiveButton, interactiveCard } from "@/lib/motion";
import { useAppStore } from "@/src/store/useAppStore";

interface StakeDefiMozogSectionProps {
  onToast?: (message: string) => void;
}

const LIDO_FALLBACK_APY = 2.2;
const ROCKET_FALLBACK_APY = 2.2;

function RiskBadge({ level }: { level: "low" | "medium" | "elevated" }) {
  const styles =
    level === "elevated"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : level === "medium"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";

  const label =
    level === "elevated" ? "Risk Info" : level === "medium" ? "Stredné" : "Nízke";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${styles}`}
    >
      <Shield className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function LayerShell({
  layer,
  title,
  subtitle,
  accent,
  children,
}: {
  layer: string;
  title: string;
  subtitle: string;
  accent: "violet" | "emerald" | "amber";
  children: React.ReactNode;
}) {
  const accentClass =
    accent === "violet"
      ? "from-violet-500/20 to-purple-500/5 border-violet-500/20"
      : accent === "amber"
        ? "from-amber-500/15 to-orange-500/5 border-amber-500/20"
        : "from-emerald-500/20 to-teal-500/5 border-emerald-500/20";

  return (
    <motion.section
      {...interactiveCard}
      className={`overflow-hidden rounded-3xl border bg-gradient-to-br ${accentClass} bg-[#111113] p-4`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            {layer}
          </p>
          <h3 className="mt-0.5 text-sm font-bold text-white">{title}</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function MetricTile({
  label,
  value,
  sub,
  accent = "white",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "white" | "emerald" | "violet";
}) {
  const tone =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "violet"
        ? "text-violet-300"
        : "text-white";

  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2.5">
      <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${tone}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[9px] text-zinc-600">{sub}</p> : null}
    </div>
  );
}

function RouteRow({
  route,
  onSelect,
  selected,
}: {
  route: SmartRouteQuote;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-violet-500/40 bg-violet-500/10"
          : "border-white/5 bg-white/[0.02] hover:border-violet-500/20"
      }`}
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-bold text-white">{route.label}</p>
          {route.recommended ? (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-emerald-300">
              Best
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[9px] text-zinc-500">
          Fee ~{formatUsd(route.feeUsd)} · slip {formatPct(route.slippagePct, 2)} · ~
          {route.etaMinutes} min
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold tabular-nums text-violet-300">
          {formatPct(route.effectiveApyPct, 2)}
        </p>
        <p className="text-[8px] text-zinc-600">eff. APY</p>
      </div>
    </button>
  );
}

export function StakeDefiMozogSection({ onToast }: StakeDefiMozogSectionProps) {
  const portfolioAssets = useAppStore((state) => state.portfolioAssets);
  const stakingApy = useAppStore((state) => state.globalLiveData.stakingApy);
  const dcaSnapshot = useAppStore((state) => state.globalLiveData.dcaSnapshot);

  const [lidoSharePct, setLidoSharePct] = useState(DEFAULT_LIDO_SHARE_PCT);
  const [gas, setGas] = useState<Awaited<ReturnType<typeof fetchEthGasSnapshot>> | null>(
    null,
  );
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const [layerConfirmed, setLayerConfirmed] = useState<Record<string, boolean>>({});

  const ethAsset = useMemo(
    () => portfolioAssets.find((a) => a.symbol === STAKE_FOCUS_SYMBOL),
    [portfolioAssets],
  );

  const availableEth = ethAsset?.balance ?? 0;
  const resolvedEthPrice =
    ethAsset?.unitPrice ?? dcaSnapshot?.tokens?.ETH?.price ?? 3500;

  const lidoApy = stakingApy.ETH ?? LIDO_FALLBACK_APY;
  const rocketApy = stakingApy.ETH ?? ROCKET_FALLBACK_APY;

  useEffect(() => {
    let active = true;
    void fetchEthGasSnapshot().then((snapshot) => {
      if (active) setGas(snapshot);
    });
    return () => {
      active = false;
    };
  }, []);

  const snapshot: StakeMozogSnapshot | null = useMemo(() => {
    if (!gas) return null;
    return buildStakeMozogSnapshot({
      availableEth,
      ethPriceUsd: resolvedEthPrice,
      lidoSharePct,
      lidoApyPct: lidoApy,
      rocketApyPct: rocketApy,
      gas,
    });
  }, [availableEth, resolvedEthPrice, lidoSharePct, lidoApy, rocketApy, gas]);

  useEffect(() => {
    if (!snapshot) return;
    const best = snapshot.smartRoutes.find((r) => r.recommended);
    setSelectedRouteId((prev) => prev ?? best?.id ?? snapshot.smartRoutes[0]?.id ?? null);
  }, [snapshot]);

  const confirmLayer = useCallback(
    (layerId: string, label: string) => {
      setLayerConfirmed((prev) => ({ ...prev, [layerId]: true }));
      onToast?.(`${label} — exekúcia pripravená (simulácia)`);
    },
    [onToast],
  );

  if (!snapshot) {
    return (
      <div className="rounded-3xl border border-white/5 bg-[#111113] p-6 text-center text-sm text-zinc-500">
        Načítavam DeFi Mozog…
      </div>
    );
  }

  const { allocation, protocols, smartRoutes, vaults } = snapshot;
  const selectedRoute = smartRoutes.find((r) => r.id === selectedRouteId);

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
              Stake · {STAKE_FOCUS_SYMBOL}
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
              (lidoApy * lidoSharePct + rocketApy * (100 - lidoSharePct)) / 100,
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
            {lidoSharePct}/{100 - lidoSharePct}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={lidoSharePct}
          onChange={(e) => setLidoSharePct(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-violet-500"
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
                {formatDecimal(allocation.lidoEth + allocation.rocketEth > 0
                  ? protocol.id === "lido"
                    ? allocation.lidoEth
                    : allocation.rocketEth
                  : 0, 4)}{" "}
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
            ETH) je uzamknuté pre gas buffer a take-profit exekúcie. Táto vrstva sa nesmie
            presunúť do stakingu.
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

        <div className="mb-2 flex items-center gap-2">
          <Route className="h-3.5 w-3.5 text-violet-400" />
          <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            Smart Routing
          </p>
        </div>
        <div className="space-y-2">
          {smartRoutes.map((route) => (
            <RouteRow
              key={route.id}
              route={route}
              selected={route.id === selectedRouteId}
              onSelect={() => setSelectedRouteId(route.id)}
            />
          ))}
        </div>

        {selectedRoute ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-3 py-2">
            <p className="text-[10px] text-zinc-400">
              Vybraná trasa:{" "}
              <span className="font-bold text-violet-200">{selectedRoute.label}</span>
            </p>
            <CopyValueButton
              compact
              value={`${selectedRoute.label} · ${formatDecimal(allocation.coreStakingEth, 6)} ETH → ${selectedRoute.outputToken}`}
              label="Kopírovať routing príkaz"
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
          <div
            key={vault.id}
            className="rounded-2xl border border-white/5 bg-black/20 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Vault className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-xs font-bold text-white">{vault.label}</p>
                  <p className="text-[9px] text-zinc-500">{vault.underlying}</p>
                </div>
              </div>
              <RiskBadge level={vault.riskLevel} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
              {vault.riskNote}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-emerald-300">
                +{formatPct(vault.apyBoostPct, 1)} boost ·{" "}
                <span className="font-mono text-[9px] text-zinc-600">
                  {vault.contractAddress.slice(0, 10)}…
                </span>
              </p>
              <CopyValueButton
                compact
                value={vault.contractAddress}
                label="Kopírovať vault adresu"
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
                Aktivovať vault deposit po core staku
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
          {layerConfirmed.vault
            ? "Vault deposit pripravený"
            : "Potvrdiť vault deposit"}
        </motion.button>
      </LayerShell>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <Layers className="h-3.5 w-3.5 text-violet-400" />
          <span>
            Pipeline: Gas ({allocation.gasReservePct} %) → Core (
            {formatDecimal(allocation.coreStakingEth, 4)} ETH) →{" "}
            {vaultEnabled ? "Vault" : "bez vaultu"}
          </span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-zinc-600" />
        </div>
      </div>
    </motion.div>
  );
}
