import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bot, Lock, Cog, RefreshCw, Shield, AlertTriangle,
} from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCyborgTerminalData } from '@/hooks/useCyborgTerminalData';
import {
  computeUsdcLoan,
  resolveCyborgState,
} from '@/lib/cyborgTerminalEngine';

interface Props {
  lang: Lang;
}

const DEFAULT_BALANCES = {
  weEth: 0.42,
  inf: 12.5,
  rEth: 0.85,
  mSol: 6.2,
};

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
  const { data, loading, refresh, netYield } = useCyborgTerminalData(lang);

  const [weEth, setWeEth] = useState(DEFAULT_BALANCES.weEth);
  const [inf, setInf] = useState(DEFAULT_BALANCES.inf);
  const [rEth, setREth] = useState(DEFAULT_BALANCES.rEth);
  const [mSol, setMSol] = useState(DEFAULT_BALANCES.mSol);

  const [collateralPct, setCollateralPct] = useState(50);
  const [ltvPct, setLtvPct] = useState(25);
  const [slidersTouched, setSlidersTouched] = useState(false);

  const marketState = useMemo(() => {
    if (!data) return null;
    return resolveCyborgState(data.fearGreed, data.btcRsi, netYield, ltvPct);
  }, [data, netYield, ltvPct]);

  useEffect(() => {
    if (!marketState || slidersTouched) return;
    setCollateralPct(marketState.sliders.collateralPct);
    setLtvPct(marketState.sliders.ltvPct);
  }, [marketState?.state, marketState?.sliders.collateralPct, marketState?.sliders.ltvPct, slidersTouched]);

  useEffect(() => {
    if (!data) return;
    setSlidersTouched(false);
  }, [data?.fetchedAt]);

  const ethPrice = data?.prices.eth ?? 0;
  const solPrice = data?.prices.sol ?? 0;

  const usdcLoan = computeUsdcLoan(rEth, mSol, ethPrice, solPrice, collateralPct, ltvPct);

  const coldUsd = weEth * ethPrice + inf * solPrice;
  const motorUsd = rEth * ethPrice + mSol * solPrice;

  const banner = marketState
    ? (sk ? marketState.bannerSk : marketState.bannerEn)
    : (sk ? 'Načítavam DeFi Cyborg Terminal…' : 'Loading DeFi Cyborg Terminal…');

  const handleSign = () => {
    const action = marketState?.action ?? 'HOLD';
    window.alert(
      sk
        ? `[Mock HW Wallet]\nAkcia: ${action}\nKolaterál: ${collateralPct}%\nLTV: ${ltvPct}%\nUSDC loan: ${formatUsd(usdcLoan)}`
        : `[Mock HW Wallet]\nAction: ${action}\nCollateral: ${collateralPct}%\nLTV: ${ltvPct}%\nUSDC loan: ${formatUsd(usdcLoan)}`,
    );
  };

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
          disabled={loading}
          className="h-9 px-2.5 text-[11px] shrink-0 touch-manipulation"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
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
            sublabel={sk ? 'ETH cold reserve' : 'ETH cold reserve'}
            qty={weEth}
            usd={weEth * ethPrice}
            onChange={setWeEth}
            step="0.001"
          />
          <BalanceRow
            icon={<Lock className="w-3.5 h-3.5 text-violet-300" />}
            label="INF"
            sublabel={sk ? 'SOL cold reserve' : 'SOL cold reserve'}
            qty={inf}
            usd={inf * solPrice}
            onChange={setInf}
            step="0.1"
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
            qty={rEth}
            usd={rEth * ethPrice}
            onChange={setREth}
            step="0.001"
          />
          <BalanceRow
            icon={<Cog className="w-3.5 h-3.5 text-[#9945FF]" />}
            label="mSOL"
            sublabel={`Marinade · Kamino ${data?.kaminoApy.toFixed(2) ?? '—'}% APY`}
            qty={mSol}
            usd={mSol * solPrice}
            onChange={setMSol}
            step="0.01"
          />
        </div>

        <p className="text-[10px] text-muted-foreground">
          {sk ? 'Active motor celkom' : 'Active motor total'}:{' '}
          <span className="text-foreground font-semibold tabular-nums">{formatUsd(motorUsd)}</span>
        </p>

        <div className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-4">
          <SliderBlock
            label={sk ? 'Nasadenie kolaterálu %' : 'Collateral Deployment %'}
            value={collateralPct}
            onChange={v => { setSlidersTouched(true); setCollateralPct(v); }}
            hint={`${collateralPct}% · ${formatUsd(motorUsd * (collateralPct / 100))}`}
          />
          <SliderBlock
            label={sk ? 'Cieľové LTV %' : 'Target LTV %'}
            value={ltvPct}
            onChange={v => { setSlidersTouched(true); setLtvPct(v); }}
            hint={ltvPct > 45 ? (sk ? '⚠ LTV nad 45 % — režim DANGER' : '⚠ LTV above 45% — DANGER mode') : `${ltvPct}%`}
            danger={ltvPct > 45}
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
        className="w-full h-12 text-sm font-bold touch-manipulation bg-emerald-600 hover:bg-emerald-500 text-white"
      >
        {sk ? 'Podpísať transakciu (Mock HW)' : 'Sign Transaction (Mock HW)'}
      </Button>
    </div>
  );
}

function BalanceRow({
  icon, label, sublabel, qty, usd, onChange, step,
}: {
  icon: ReactNode;
  label: string;
  sublabel: string;
  qty: number;
  usd: number;
  onChange: (v: number) => void;
  step: string;
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
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={qty}
        onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
        className="h-10 text-sm font-mono tabular-nums touch-manipulation"
      />
    </div>
  );
}

function SliderBlock({
  label, value, onChange, hint, danger,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
  danger?: boolean;
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
        onValueChange={([v]) => onChange(v)}
        className="py-2 touch-manipulation [&_[role=slider]]:h-6 [&_[role=slider]]:w-6"
      />
      <p className={`text-[10px] ${danger ? 'text-amber-400' : 'text-muted-foreground'}`}>{hint}</p>
    </div>
  );
}
