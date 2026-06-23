import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bot, Lock, Cog, RefreshCw, Shield, AlertTriangle, Loader2,
} from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCyborgTerminalData } from '@/hooks/useCyborgTerminalData';
import {
  computeUsdcLoan,
  resolveCyborgState,
} from '@/lib/cyborgTerminalEngine';

interface Props {
  lang: Lang;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function DeFiCyborgTerminal({ lang }: Props) {
  const sk = lang === 'sk';
  const { portfolioData } = usePortfolio();
  const { data, loading: marketLoading, refresh, netYield } = useCyborgTerminalData(lang);

  const [collateralPct, setCollateralPct] = useState(50);
  const [ltvPct, setLtvPct] = useState(25);
  const [slidersTouched, setSlidersTouched] = useState(false);

  const loading = portfolioData.loading || marketLoading;

  const { weEth, inf } = portfolioData.coldReserve;
  const { rEth, mSol } = portfolioData.activeMotor;
  const ethPrice = portfolioData.prices.eth;
  const solPrice = portfolioData.prices.sol;

  const marketState = useMemo(() => {
    if (!data || loading) return null;
    return resolveCyborgState(data.fearGreed, data.btcRsi, netYield, ltvPct);
  }, [data, netYield, ltvPct, loading]);

  useEffect(() => {
    if (!marketState || slidersTouched) return;
    setCollateralPct(marketState.sliders.collateralPct);
    setLtvPct(marketState.sliders.ltvPct);
  }, [marketState?.state, marketState?.sliders.collateralPct, marketState?.sliders.ltvPct, slidersTouched]);

  useEffect(() => {
    if (!data) return;
    setSlidersTouched(false);
  }, [data?.fetchedAt]);

  const usdcLoan = computeUsdcLoan(
    rEth.qty,
    mSol.qty,
    ethPrice,
    solPrice,
    collateralPct,
    ltvPct,
  );

  const motorUsd = portfolioData.totalMotorUsd;
  const coldUsd = portfolioData.totalColdUsd;

  const banner = loading
    ? (sk ? 'Načítavam portfólio a trhové dáta…' : 'Loading portfolio and market data…')
    : marketState
      ? (sk ? marketState.bannerSk : marketState.bannerEn)
      : (sk ? 'Čakám na trhové dáta…' : 'Waiting for market data…');

  const handleSign = () => {
    const action = marketState?.action ?? 'HOLD';
    window.alert(
      sk
        ? `[Mock HW Wallet]\nAkcia: ${action}\nKolaterál: ${collateralPct}%\nLTV: ${ltvPct}%\nUSDC loan: ${formatUsd(usdcLoan)}\nrETH: ${rEth.qty.toFixed(4)} · mSOL: ${mSol.qty.toFixed(2)}`
        : `[Mock HW Wallet]\nAction: ${action}\nCollateral: ${collateralPct}%\nLTV: ${ltvPct}%\nUSDC loan: ${formatUsd(usdcLoan)}\nrETH: ${rEth.qty.toFixed(4)} · mSOL: ${mSol.qty.toFixed(2)}`,
    );
  };

  if (loading) {
    return (
      <div className="glass-card p-3 sm:p-4 space-y-3 border border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          <span className="text-sm font-semibold text-foreground">
            {sk ? 'Načítavam DeFi Cyborg Terminal…' : 'Loading DeFi Cyborg Terminal…'}
          </span>
        </div>
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="glass-card p-3 sm:p-4 space-y-3 border border-emerald-500/20">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground leading-tight">
              DeFi Cyborg Terminal
            </h2>
            <p className="text-[10px] text-muted-foreground truncate">
              {sk ? 'Dynamický LBTC / Morpho deployment widget' : 'Dynamic LBTC / Morpho deployment widget'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={marketLoading}
          className="h-9 px-2.5 text-[11px] shrink-0 touch-manipulation"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${marketLoading ? 'animate-spin' : ''}`} />
          {sk ? 'Obnoviť' : 'Refresh'}
        </Button>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>
          {sk ? 'Posledná aktualizácia' : 'Last updated'}:{' '}
          <span className="text-foreground font-mono tabular-nums">
            {data ? formatTime(data.fetchedAt) : '—:—:—'}
          </span>
        </span>
        {data && (
          <>
            <span>F&G: <strong className="text-foreground">{data.fearGreed}</strong></span>
            <span>RSI(w): <strong className="text-foreground">{data.btcRsi}</strong></span>
            <span>Net: <strong className="text-emerald-400">{netYield.toFixed(2)}%</strong></span>
          </>
        )}
        {data?.usedFallback && (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {sk ? 'Záložné dáta' : 'Fallback data'}
          </span>
        )}
      </div>

      {/* Advisor banner */}
      <div className={`rounded-xl border p-3 text-[11px] leading-snug font-medium ${marketState?.bannerClass ?? 'border-border/40 bg-muted/20 text-muted-foreground'}`}>
        {banner}
      </div>

      {/* Section 1 — Cold Reserve */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-sky-400" />
          <h3 className="text-xs font-semibold text-foreground">
            {sk ? 'Cold Reserve (HW peňaženka)' : 'Cold Reserve (HW wallet)'}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <BalanceRow
            icon={<Lock className="w-3.5 h-3.5 text-sky-300" />}
            label="weETH"
            sublabel={sk ? 'ETH cold reserve · ledger' : 'ETH cold reserve · ledger'}
            qty={weEth.qty}
            usd={weEth.usd}
            decimals={4}
          />
          <BalanceRow
            icon={<Lock className="w-3.5 h-3.5 text-violet-300" />}
            label="INF"
            sublabel={sk ? 'SOL cold reserve · ledger' : 'SOL cold reserve · ledger'}
            qty={inf.qty}
            usd={inf.usd}
            decimals={2}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {sk ? 'Cold reserve celkom' : 'Cold reserve total'}:{' '}
          <span className="text-foreground font-semibold tabular-nums">{formatUsd(coldUsd)}</span>
        </p>
      </section>

      {/* Section 2 — Active Motor */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Cog className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-xs font-semibold text-foreground">
            {sk ? 'Active Motor (Morpho / Kamino)' : 'Active Motor (Morpho / Kamino)'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <BalanceRow
            icon={<Cog className="w-3.5 h-3.5 text-[#627EEA]" />}
            label="rETH"
            sublabel={`Rocket Pool · ${data?.lbtcApy.toFixed(2) ?? '—'}% LBTC ref`}
            qty={rEth.qty}
            usd={rEth.usd}
            decimals={4}
          />
          <BalanceRow
            icon={<Cog className="w-3.5 h-3.5 text-[#9945FF]" />}
            label="mSOL"
            sublabel={`Marinade · Kamino ${data?.kaminoApy.toFixed(2) ?? '—'}% APY`}
            qty={mSol.qty}
            usd={mSol.usd}
            decimals={2}
          />
        </div>

        <p className="text-[10px] text-muted-foreground">
          {sk ? 'Active motor celkom' : 'Active motor total'}:{' '}
          <span className="text-foreground font-semibold tabular-nums">{formatUsd(motorUsd)}</span>
          {' · '}
          {sk ? 'Voľné na staking' : 'Available to stake'}:{' '}
          <span className="text-foreground font-semibold tabular-nums">
            {formatUsd(portfolioData.assets.ETH.liquidUsd + portfolioData.assets.SOL.liquidUsd)}
          </span>
        </p>

        <div className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-4">
          <SliderBlock
            label={sk ? 'Nasadenie kolaterálu %' : 'Collateral Deployment %'}
            value={collateralPct}
            onChange={v => { setSlidersTouched(true); setCollateralPct(v); }}
            hint={`${collateralPct}% · ${formatUsd(motorUsd * (collateralPct / 100))}`}
            disabled={motorUsd <= 0}
          />
          <SliderBlock
            label={sk ? 'Cieľové LTV %' : 'Target LTV %'}
            value={ltvPct}
            onChange={v => { setSlidersTouched(true); setLtvPct(v); }}
            hint={ltvPct > 45 ? (sk ? '⚠ LTV nad 45 % — režim DANGER' : '⚠ LTV above 45% — DANGER mode') : `${ltvPct}%`}
            danger={ltvPct > 45}
            disabled={motorUsd <= 0}
          />
          <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
              {sk ? 'Vypočítaný USDC loan' : 'Calculated USDC loan'}
            </span>
            <span className="text-sm font-bold text-emerald-300 tabular-nums">
              {formatUsd(usdcLoan)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {sk
              ? `Borrow sadzba Morpho: ${data?.usdcBorrowApy.toFixed(2) ?? '—'}% · LBTC výnos: ${data?.lbtcApy.toFixed(2) ?? '—'}%`
              : `Morpho borrow: ${data?.usdcBorrowApy.toFixed(2) ?? '—'}% · LBTC yield: ${data?.lbtcApy.toFixed(2) ?? '—'}%`}
          </p>
        </div>
      </section>

      {/* Section 3 — Action */}
      <Button
        type="button"
        onClick={handleSign}
        disabled={motorUsd <= 0}
        className="w-full h-12 text-sm font-bold touch-manipulation bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
      >
        {sk ? 'Podpísať transakciu (Mock HW)' : 'Sign Transaction (Mock HW)'}
      </Button>
    </div>
  );
}

function BalanceRow({
  icon, label, sublabel, qty, usd, decimals,
}: {
  icon: ReactNode;
  label: string;
  sublabel: string;
  qty: number;
  usd: number;
  decimals: number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/30 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>
        </div>
        <span className="text-[10px] font-semibold text-emerald-400 tabular-nums shrink-0">
          {formatUsd(usd)}
        </span>
      </div>
      <p className="text-sm font-mono tabular-nums text-foreground">
        {qty.toFixed(decimals)} {label}
      </p>
    </div>
  );
}

function SliderBlock({
  label, value, onChange, hint, danger, disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold text-foreground">{label}</label>
        <span className={`text-[11px] font-bold tabular-nums ${danger ? 'text-amber-400' : 'text-emerald-400'}`}>
          {value}%
        </span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        className="py-2 touch-manipulation [&_[role=slider]]:h-6 [&_[role=slider]]:w-6"
      />
      <p className={`text-[10px] ${danger ? 'text-amber-400' : 'text-muted-foreground'}`}>{hint}</p>
    </div>
  );
}
