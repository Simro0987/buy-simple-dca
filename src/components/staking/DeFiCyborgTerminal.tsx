import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bot, Lock, Cog, RefreshCw, Shield, AlertTriangle, Loader2, Wallet,
} from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { navigateToTab } from '@/lib/pendingActions';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWalletContext } from '@/contexts/WalletContext';
import { useCyborgTerminalData } from '@/hooks/useCyborgTerminalData';
import { API_OFFLINE } from '@/lib/cyborgBlockchain';
import {
  computeMotorUsd,
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

function fmtUsdOrError(usd: number, err?: string, sk?: boolean): ReactNode {
  if (err) return <span className="text-destructive text-[10px]">{API_OFFLINE}</span>;
  return formatUsd(usd);
}

function fmtQtyOrError(qty: number, decimals: number, label: string, err?: string): ReactNode {
  if (err) return <span className="text-destructive text-sm">{API_OFFLINE}</span>;
  return <span className="text-sm font-mono tabular-nums text-foreground">{qty.toFixed(decimals)} {label}</span>;
}

export function DeFiCyborgTerminal({ lang }: Props) {
  const sk = lang === 'sk';
  const { hasAllAddresses } = useWalletContext();
  const {
    market, balances, loading, updating, refresh, netYield, error, hasAddresses,
  } = useCyborgTerminalData(lang);

  const [collateralPct, setCollateralPct] = useState(50);
  const [ltvPct, setLtvPct] = useState(25);
  const [slidersTouched, setSlidersTouched] = useState(false);

  const ethPrice = market?.prices.eth ?? 0;
  const solPrice = market?.prices.sol ?? 0;
  const lbtcPrice = market?.lbtcPriceUsd ?? market?.prices.btc ?? 0;

  const rEthQty = balances?.rEth.qty ?? 0;
  const mSolQty = balances?.mSol.qty ?? 0;
  const weEthQty = balances?.weEth.qty ?? 0;
  const infQty = balances?.inf.qty ?? 0;
  const lbtcQty = balances?.lbtc.qty ?? 0;

  const motorUsd = computeMotorUsd(rEthQty, mSolQty, ethPrice, solPrice);
  const coldUsd = weEthQty * ethPrice + infQty * solPrice;
  const lbtcUsd = lbtcQty * lbtcPrice;

  const marketState = useMemo(() => {
    if (!market || netYield === null || market.fearGreed === null || market.btcRsi === null) return null;
    return resolveCyborgState(market.fearGreed, market.btcRsi, netYield, ltvPct);
  }, [market, netYield, ltvPct]);

  useEffect(() => {
    if (!marketState || slidersTouched) return;
    setCollateralPct(marketState.sliders.collateralPct);
    setLtvPct(marketState.sliders.ltvPct);
  }, [marketState?.state, marketState?.sliders.collateralPct, marketState?.sliders.ltvPct, slidersTouched]);

  useEffect(() => {
    if (!market) return;
    setSlidersTouched(false);
  }, [market?.fetchedAt]);

  const usdcLoan = computeUsdcLoan(rEthQty, mSolQty, ethPrice, solPrice, collateralPct, ltvPct);

  if (!hasAddresses) {
    return (
      <div className="glass-card p-4 space-y-3 border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-foreground">
            {sk ? 'Pripojte peňaženky pre Cyborg Terminal' : 'Connect wallets for Cyborg Terminal'}
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {sk
            ? 'Zadajte Solana a EVM (Arbitrum) adresu v záložke Peňaženky. Bez nich nie je možné načítať on-chain zostatky.'
            : 'Enter your Solana and EVM (Arbitrum) address in the Wallets tab. On-chain balances require both addresses.'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigateToTab('wallets')}
          className="w-full h-11 touch-manipulation"
        >
          {sk ? 'Otvoriť Peňaženky' : 'Open Wallets'}
        </Button>
      </div>
    );
  }

  if (loading && !market) {
    return (
      <div className="glass-card p-3 sm:p-4 space-y-3 border border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          <span className="text-sm font-semibold text-foreground">
            {sk ? 'Načítavam on-chain dáta…' : 'Loading on-chain data…'}
          </span>
        </div>
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  const banner = marketState
    ? (sk ? marketState.bannerSk : marketState.bannerEn)
    : error ?? (sk ? 'Čakám na trhové dáta…' : 'Waiting for market data…');

  return (
    <div className="glass-card p-3 sm:p-4 space-y-3 border border-emerald-500/20 relative">
      {updating && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-background/90 border border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
          {sk ? 'Aktualizujem…' : 'Updating…'}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground leading-tight">DeFi Cyborg Terminal</h2>
            <p className="text-[10px] text-muted-foreground truncate">
              {sk ? 'Live on-chain · Alchemy + Solana RPC' : 'Live on-chain · Alchemy + Solana RPC'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={updating}
          className="h-9 px-2.5 text-[11px] shrink-0 touch-manipulation"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${updating ? 'animate-spin' : ''}`} />
          {sk ? 'Force Refresh' : 'Force Refresh'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>
          {sk ? 'Posledná aktualizácia' : 'Last updated'}:{' '}
          <span className="text-foreground font-mono tabular-nums">
            {market ? formatTime(market.fetchedAt) : '—:—:—'}
          </span>
        </span>
        {market?.fearGreed != null && <span>F&G: <strong className="text-foreground">{market.fearGreed}</strong></span>}
        {market?.btcRsi != null && <span>RSI(w): <strong className="text-foreground">{market.btcRsi}</strong></span>}
        {netYield != null && <span>Net: <strong className="text-emerald-400">{netYield.toFixed(2)}%</strong></span>}
        {(market?.stale || market?.errors.length) ? (
          <span className="inline-flex items-center gap-1 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {sk ? 'Cache / API' : 'Cache / API'}
          </span>
        ) : null}
      </div>

      <div className={`rounded-xl border p-3 text-[11px] leading-snug font-medium ${marketState?.bannerClass ?? 'border-border/40 bg-muted/20 text-muted-foreground'}`}>
        {banner}
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-sky-400" />
          <h3 className="text-xs font-semibold text-foreground">
            {sk ? 'Cold Reserve (on-chain)' : 'Cold Reserve (on-chain)'}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <BalanceRow
            icon={<Lock className="w-3.5 h-3.5 text-sky-300" />}
            label="weETH"
            sublabel="Arbitrum · ether.fi"
            qtyNode={fmtQtyOrError(weEthQty, 4, 'weETH', balances?.weEth.error)}
            usdNode={fmtUsdOrError(weEthQty * ethPrice, balances?.weEth.error)}
          />
          <BalanceRow
            icon={<Lock className="w-3.5 h-3.5 text-violet-300" />}
            label="INF"
            sublabel="Solana · Sanctum"
            qtyNode={fmtQtyOrError(infQty, 2, 'INF', balances?.inf.error)}
            usdNode={fmtUsdOrError(infQty * solPrice, balances?.inf.error)}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {sk ? 'Cold reserve celkom' : 'Cold reserve total'}:{' '}
          <span className="text-foreground font-semibold tabular-nums">
            {balances?.weEth.error || balances?.inf.error ? API_OFFLINE : formatUsd(coldUsd)}
          </span>
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Cog className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-xs font-semibold text-foreground">
            {sk ? 'Active Motor (on-chain)' : 'Active Motor (on-chain)'}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <BalanceRow
            icon={<Cog className="w-3.5 h-3.5 text-[#627EEA]" />}
            label="rETH"
            sublabel={`Rocket Pool · ${market?.lbtcApy != null ? `${market.lbtcApy.toFixed(2)}% LBTC ref` : API_OFFLINE}`}
            qtyNode={fmtQtyOrError(rEthQty, 4, 'rETH', balances?.rEth.error)}
            usdNode={fmtUsdOrError(rEthQty * ethPrice, balances?.rEth.error)}
          />
          <BalanceRow
            icon={<Cog className="w-3.5 h-3.5 text-[#9945FF]" />}
            label="mSOL"
            sublabel={`Marinade · Kamino ${market?.kaminoApy != null ? `${market.kaminoApy.toFixed(2)}%` : API_OFFLINE}`}
            qtyNode={fmtQtyOrError(mSolQty, 2, 'mSOL', balances?.mSol.error)}
            usdNode={fmtUsdOrError(mSolQty * solPrice, balances?.mSol.error)}
          />
        </div>

        <div className="rounded-lg border border-border/40 bg-background/30 px-3 py-2 flex justify-between text-[11px]">
          <span className="text-muted-foreground">LBTC (Arbitrum)</span>
          <span className="font-mono tabular-nums text-foreground">
            {balances?.lbtc.error
              ? API_OFFLINE
              : `${lbtcQty.toFixed(6)} · ${formatUsd(lbtcUsd)}`}
          </span>
        </div>

        <p className="text-[10px] text-muted-foreground">
          {sk ? 'Active motor celkom' : 'Active motor total'}:{' '}
          <span className="text-foreground font-semibold tabular-nums">
            {balances?.rEth.error || balances?.mSol.error ? API_OFFLINE : formatUsd(motorUsd)}
          </span>
        </p>

        <div className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-4">
          <SliderBlock
            label={sk ? 'Nasadenie kolaterálu %' : 'Collateral Deployment %'}
            value={collateralPct}
            onChange={v => { setSlidersTouched(true); setCollateralPct(v); }}
            hint={
              balances?.rEth.error || balances?.mSol.error
                ? API_OFFLINE
                : `${collateralPct}% · ${formatUsd(motorUsd * (collateralPct / 100))}`
            }
            disabled={motorUsd <= 0 || !!balances?.rEth.error || !!balances?.mSol.error}
          />
          <SliderBlock
            label={sk ? 'Cieľové LTV %' : 'Target LTV %'}
            value={ltvPct}
            onChange={v => { setSlidersTouched(true); setLtvPct(v); }}
            hint={ltvPct > 45 ? (sk ? '⚠ LTV nad 45 %' : '⚠ LTV above 45%') : `${ltvPct}%`}
            danger={ltvPct > 45}
            disabled={motorUsd <= 0 || !!balances?.rEth.error || !!balances?.mSol.error}
          />
          <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
              {sk ? 'Vypočítaný USDC loan' : 'Calculated USDC loan'}
            </span>
            <span className="text-sm font-bold text-emerald-300 tabular-nums">
              {balances?.rEth.error || balances?.mSol.error ? API_OFFLINE : formatUsd(usdcLoan)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Morpho borrow: {market?.usdcBorrowApy != null ? `${market.usdcBorrowApy.toFixed(2)}%` : API_OFFLINE}
            {' · '}
            LBTC yield: {market?.lbtcApy != null ? `${market.lbtcApy.toFixed(2)}%` : API_OFFLINE}
          </p>
        </div>
      </section>

      <Button
        type="button"
        onClick={() => {
          window.alert(
            sk
              ? `[Mock HW]\nKolaterál: ${collateralPct}% · LTV: ${ltvPct}%\nLoan: ${formatUsd(usdcLoan)}`
              : `[Mock HW]\nCollateral: ${collateralPct}% · LTV: ${ltvPct}%\nLoan: ${formatUsd(usdcLoan)}`,
          );
        }}
        disabled={motorUsd <= 0 || !!balances?.rEth.error}
        className="w-full h-12 text-sm font-bold touch-manipulation bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
      >
        {sk ? 'Podpísať transakciu (Mock HW)' : 'Sign Transaction (Mock HW)'}
      </Button>
    </div>
  );
}

function BalanceRow({
  icon, label, sublabel, qtyNode, usdNode,
}: {
  icon: ReactNode;
  label: string;
  sublabel: string;
  qtyNode: ReactNode;
  usdNode: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/30 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>
        </div>
        <span className="text-[10px] font-semibold text-emerald-400 tabular-nums shrink-0">{usdNode}</span>
      </div>
      {qtyNode}
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
