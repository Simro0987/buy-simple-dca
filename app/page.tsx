import { AssetList } from "@/components/AssetList";
import { BottomNav } from "@/components/BottomNav";
import { DcaMoneyModePanel } from "@/components/dca/DcaMoneyModePanel";
import { HeroSection } from "@/components/HeroSection";
import { portfolioData } from "@/lib/data";

export default function HomePage() {
  const { totalBalance, realizedDeposit, profitLoss, assets } = portfolioData;

  return (
    <div className="relative min-h-dvh bg-[#050505]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -right-32 top-1/3 h-72 w-72 rounded-full bg-purple-500/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-orange-500/5 blur-3xl" />
      </div>

      <main className="relative mx-auto max-w-lg px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-600">
              Edge Trader
            </p>
            <p className="text-sm font-medium text-zinc-400">Terminal v2.0</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/5 bg-[#111113] px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs font-medium text-emerald-400">Live</span>
          </div>
        </header>

        <div className="space-y-8">
          <HeroSection
            totalBalance={totalBalance}
            realizedDeposit={realizedDeposit}
            profitLoss={profitLoss}
          />
          <AssetList assets={assets} />
          <DcaMoneyModePanel />
        </div>
      </main>

      <BottomNav activeTab="portfolio" />
    </div>
  );
}
