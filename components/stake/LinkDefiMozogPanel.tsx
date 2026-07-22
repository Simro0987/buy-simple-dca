"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Layers,
  Lock,
  ShieldAlert,
  Sparkles,
  Vault,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { CopyValueButton } from "@/components/ui/CopyValueButton";
import {
  DefiLoadingState,
  LayerShell,
  MetricTile,
  RiskBadge,
} from "@/components/stake/defiShared";
import { useLinkDefiMozog } from "@/hooks/useLinkDefiMozog";
import { interactiveButton } from "@/lib/motion";
import { NO_LOOP_WARNING } from "@/lib/linkDefi/constants";
import { applyLinkDefiMozogExecution } from "@/lib/linkDefi/portfolioExecution";
import { formatDecimal, formatPct, formatUsd } from "@/lib/numberFormat";
import { useAppStore } from "@/src/store/useAppStore";

interface LinkDefiMozogPanelProps {
  onToast?: (message: string) => void;
}

export function LinkDefiMozogPanel({ onToast }: LinkDefiMozogPanelProps) {
  const portfolioAssets = useAppStore((state) => state.portfolioAssets);
  const portfolioData = useAppStore((state) => state.portfolioData);
  const setPortfolioData = useAppStore((state) => state.setPortfolioData);
  const dcaSnapshot = useAppStore((state) => state.globalLiveData.dcaSnapshot);

  const [layerConfirmed, setLayerConfirmed] = useState<Record<string, boolean>>({});
  const [portfolioExecuted, setPortfolioExecuted] = useState(false);

  const linkAsset = useMemo(
    () => portfolioAssets.find((a) => a.symbol === "LINK"),
    [portfolioAssets],
  );

  const availableLink = linkAsset?.balance ?? 0;
  const fallbackLinkPrice =
    linkAsset?.unitPrice ?? dcaSnapshot?.tokens?.LINK?.price ?? 15;

  const snapshot = useLinkDefiMozog({ availableLink, fallbackLinkPrice });

  const executePortfolio = useCallback(() => {
    if (portfolioExecuted || snapshot.allocation.supplyLink <= 0) return;

    const updated = applyLinkDefiMozogExecution(portfolioData, {
      supplyLink: snapshot.allocation.supplyLink,
      linkPriceUsd: snapshot.linkPriceUsd,
    });

    setPortfolioData(updated);
    setPortfolioExecuted(true);
    onToast?.("Portfólio aktualizované — LINK (Morpho Supply), Borrow = 0");
  }, [
    portfolioData,
    portfolioExecuted,
    setPortfolioData,
    snapshot.allocation.supplyLink,
    snapshot.linkPriceUsd,
    onToast,
  ]);

  const confirmExecution = useCallback(() => {
    setLayerConfirmed({ supply: true, guard: true });
    executePortfolio();
    onToast?.("Vrstva 1 · Morpho Supply — exekúcia potvrdená");
  }, [executePortfolio, onToast]);

  if (snapshot.loading) return <DefiLoadingState />;

  const { allocation, morpho } = snapshot;

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
              Supply · LINK
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Morpho Blue Arbitrum · inštitucionálny trezor · no-looping
            </p>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-emerald-400/80" />
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile
            label="Dostupný zostatok"
            value={`${formatDecimal(allocation.availableLink, 4)} LINK`}
            sub={formatUsd(snapshot.availableUsd)}
            accent="emerald"
          />
          <MetricTile
            label="Pracovný kapitál"
            value={`${allocation.workingCapitalPct} %`}
            sub="gas v ETH na Arbitrum"
            accent="violet"
          />
          <MetricTile
            label="Morpho APY"
            value={formatPct(morpho.apyPct, 2)}
            sub={`úrok + MORPHO (${morpho.source})`}
            accent="emerald"
          />
          <MetricTile
            label="Sieť"
            value={snapshot.network}
            sub="Morpho Blue Vaults"
          />
        </div>
      </div>

      <section className="rounded-3xl border border-white/5 bg-[#111113] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
              Alokácia kapitálu
            </p>
            <h3 className="text-sm font-bold text-white">100 % Supply · 0 % Borrow</h3>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
            No-Loop
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
            <p className="text-[10px] font-bold text-white">Morpho Supply</p>
            <p className="text-[9px] text-zinc-500">LINK → vault</p>
            <p className="mt-2 text-sm font-bold tabular-nums text-emerald-300">
              {formatDecimal(allocation.supplyLink, 4)} LINK
            </p>
            <p className="mt-1 text-[8px] text-zinc-600">100 % pracovného kapitálu</p>
          </div>
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-3 py-2.5">
            <p className="text-[10px] font-bold text-rose-300">Borrow / LTV</p>
            <p className="text-[9px] text-zinc-500">zakázané</p>
            <p className="mt-2 text-sm font-bold tabular-nums text-rose-300">
              {formatDecimal(allocation.borrowLink, 4)} LINK
            </p>
            <p className="mt-1 text-[8px] text-zinc-600">looping disabled</p>
          </div>
        </div>
      </section>

      <LayerShell
        layer="Vrstva 1"
        title="Inštitucionálny Trezor"
        subtitle="100 % pracovného kapitálu — Supply do Morpho Blue Vaults na Arbitrum."
        accent="violet"
      >
        <div className="mb-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Vault className="h-4 w-4 text-violet-400" />
              <div>
                <p className="text-xs font-bold text-white">{snapshot.vaultLabel}</p>
                <p className="text-[9px] text-zinc-500">{snapshot.network} · Supply only</p>
              </div>
            </div>
            <RiskBadge level="low" />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
            Výnos: úrok z požičiavania ({formatPct(morpho.baseApyPct, 2)}) + MORPHO
            odmeny ({formatPct(morpho.rewardApyPct, 2)}). Čistý supply bez pákového
            efektu.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-[10px] text-violet-200">
              Vklad:{" "}
              <span className="font-bold tabular-nums">
                {formatDecimal(allocation.supplyLink, 6)} LINK
              </span>
            </p>
            <CopyValueButton
              compact
              value={formatDecimal(allocation.supplyLink, 6)}
              label="Kopírovať 100% LINK sumu"
            />
          </div>
        </div>

        <motion.button
          type="button"
          {...interactiveButton}
          disabled={layerConfirmed.supply || allocation.supplyLink <= 0 || portfolioExecuted}
          onClick={confirmExecution}
          className={`w-full rounded-2xl border px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            layerConfirmed.supply || portfolioExecuted
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
          }`}
        >
          {portfolioExecuted
            ? "Exekúcia dokončená"
            : layerConfirmed.supply
              ? "Supply potvrdený"
              : `Potvrdiť Exekúciu (${formatDecimal(allocation.supplyLink, 4)} LINK)`}
        </motion.button>
      </LayerShell>

      <LayerShell
        layer="Vrstva 2"
        title="Ochranný panel · Zákaz Loopingu"
        subtitle="Inštitucionálna ochrana kapitálu — žiadny borrow, žiadna LTV kalkulačka."
        accent="amber"
      >
        <div className="rounded-2xl border border-orange-500/40 bg-gradient-to-br from-orange-500/15 via-rose-500/10 to-red-500/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
            <div>
              <p className="text-[11px] font-bold text-orange-200">No-Looping Guard</p>
              <p className="mt-2 text-[10px] leading-relaxed text-orange-100/90">
                {NO_LOOP_WARNING}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-3 py-2.5">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <div>
            <p className="text-[10px] font-bold text-rose-200">
              Borrow / LTV kalkulačka deaktivovaná
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-rose-100/70">
              LINK nie je LST. Leverage loop by exponenciálne zvyšoval riziko likvidácie pri
              poklese ceny. Systém povoľuje výhradne bezpečný Morpho Supply.
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          <p className="text-[9px] text-amber-100/80">
            Borrow = 0 LINK · LTV = N/A · Looping = DISABLED
          </p>
        </div>
      </LayerShell>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <Layers className="h-3.5 w-3.5 text-violet-400" />
          <span>
            Pipeline: 100 % LINK Supply → Morpho Blue ({snapshot.network}) → Borrow 0
          </span>
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-zinc-600" />
        </div>
      </div>
    </motion.div>
  );
}
