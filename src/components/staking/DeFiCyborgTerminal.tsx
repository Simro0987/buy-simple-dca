import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bot, Lock, Cog, RefreshCw, Shield, AlertTriangle, Loader2, ClipboardCopy, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCyborgMarketData } from '@/hooks/useCyborgTerminalData';
import { usePortfolio } from '@/contexts/PortfolioContext';
import type { PortfolioData } from '@/lib/portfolioData';
import { DATA_UNAVAILABLE, formatDisplayApy } from '@/lib/defiLlamaAggregator';
import { buildCyborgExecutionUpdate } from '@/lib/cyborgPortfolio';
import {
  computeUsdcLoan,
  resolveCyborgState,
  type CyborgAction,
} from '@/lib/cyborgTerminalEngine';

interface Props {
  lang: Lang;
  portfolioData: PortfolioData;
}

const NEUTRAL_FG = 50;
const NEUTRAL_RSI = 50;

const ACTION_LABEL: Record<CyborgAction, { sk: string; en: string }> = {
  DEPOSIT_BORROW: { sk: 'Nasadiť kolaterál + požičať USDC', en: 'Deploy collateral + borrow USDC' },
  HOLD: { sk: 'Držať', en: 'Hold' },
  REPAY_DEBT: { sk: 'Splatiť dlh', en: 'Repay debt' },
  WITHDRAW: { sk: 'Stiahnuť kolaterál', en: 'Withdraw collateral' },
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function marketStateLabel(
  state: number | undefined,
  fg: number | null,
  sk: boolean,
): string {
  if (fg != null) {
    if (fg < 40) return sk ? 'Strach (F&G < 40)' : 'Fear (F&G < 40)';
    if (fg > 75) return sk ? 'Extrémna eufória (F&G > 75)' : 'Extreme euphoria (F&G > 75)';
    return sk ? `Stabilný trh (F&G ${fg})` : `Stable market (F&G ${fg})`;
  }
  return sk ? `Stav ${state ?? '—'}` : `State ${state ?? '—'}`;
}

export function DeFiCyborgTerminal({ lang, portfolioData }: Props) {
  const sk = lang === 'sk';
  const { updatePortfolioBalances } = usePortfolio();
  const { market, marketLoading, updating, refresh, netYield, unavailable, displayApys } =
    useCyborgMarketData();

  const [collateralPct, setCollateralPct] = useState(50);
  const [ltvPct, setLtvPct] = useState(25);
  const [slidersTouched, setSlidersTouched] = useState(false);

  const { weEth, inf } = portfolioData.coldReserve;
  const { rEth, mSol } = portfolioData.activeMotor;
  const { lbtc } = portfolioData;
  const ethPrice = portfolioData.prices.eth;
  const solPrice = portfolioData.prices.sol;
  const btcPrice = portfolioData.prices.btc;

  const motorUsd = portfolioData.totalMotorUsd;
  const coldUsd = portfolioData.totalColdUsd;

  const deployREth = rEth.qty * (collateralPct / 100);
  const deployMSol = mSol.qty * (collateralPct / 100);

  const marketState = useMemo(() => {
    if (!market?.ready) return null;
    const fg = market.fearGreed ?? NEUTRAL_FG;
    const rsi = market.btcRsi ?? NEUTRAL_RSI;
    const yieldForState = netYield ?? 0;
    return resolveCyborgState(fg, rsi, yieldForState, ltvPct);
  }, [market, netYield, ltvPct]);

  const usingNeutralSignals = market?.ready && (market.fearGreed === null || market.btcRsi === null);

  useEffect(() => {
    if (!marketState || slidersTouched) return;
    setCollateralPct(marketState.sliders.collateralPct);
    setLtvPct(marketState.sliders.ltvPct);
  }, [marketState?.state, marketState?.sliders.collateralPct, marketState?.sliders.ltvPct, slidersTouched]);

  useEffect(() => {
    if (!market) return;
    setSlidersTouched(false);
  }, [market?.fetchedAt]);

  const usdcLoan = computeUsdcLoan(rEth.qty, mSol.qty, ethPrice, solPrice, collateralPct, ltvPct);

  const copyPlan = useCallback(async () => {
    const action = marketState?.action ?? 'HOLD';
    const actionText = sk ? ACTION_LABEL[action].sk : ACTION_LABEL[action].en;
    const stateText = marketStateLabel(marketState?.state, market?.fearGreed ?? null, sk);

    const plan = [
      '--- DEFI CYBORG PLAN ---',
      `Market State: ${stateText}`,
      `Action: ${actionText}`,
      `Deploy: ${collateralPct}% of collateral`,
      `Assets: ${deployREth.toFixed(4)} rETH / ${deployMSol.toFixed(2)} mSOL`,
      `Target LTV: ${ltvPct}%`,
      `Borrow: $${usdcLoan.toFixed(2)} USDC`,
      'Buy: LBTC',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(plan);
      toast.success(sk ? 'Plán skopírovaný do schránky' : 'Plan copied to clipboard');
    } catch {
      toast.error(sk ? 'Kopírovanie zlyhalo' : 'Copy failed');
    }
  }, [sk, marketState, market?.fearGreed, collateralPct, deployREth, deployMSol, ltvPct, usdcLoan]);

  const confirmExecution = useCallback(() => {
    const update = buildCyborgExecutionUpdate({
      rEthQty: rEth.qty,
      mSolQty: mSol.qty,
      collateralPct,
      ltvPct,
      ethPrice,
      solPrice,
      btcPrice,
    });

    if (
      (update.rEthQty ?? 0) <= 0 &&
      (update.mSolQty ?? 0) <= 0 &&
      (update.lbtcQty ?? 0) <= 0 &&
      (update.usdcBorrowed ?? 0) <= 0
    ) {
      toast.error(sk ? 'Žiadne množstvo na aktualizáciu' : 'Nothing to update');
      return;
    }

    updatePortfolioBalances(update);
    toast.success(sk ? 'Portfólio aktualizované!' : 'Portfolio updated!');
  }, [
    rEth.qty, mSol.qty, collateralPct, ltvPct, ethPrice, solPrice, btcPrice,
    updatePortfolioBalances, sk,
  ]);

  if (portfolioData.loading) {
    return (
      <div className="glass-card p-3 sm:p-4 space-y-3 border border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          <span className="text-sm font-semibold text-foreground">
            {sk ? 'Načítavam portfólio…' : 'Loading portfolio…'}
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
    : marketLoading
      ? (sk ? 'Načítavam trhové signály na pozadí…' : 'Loading market signals in background…')
      : (sk ? 'Portfólio pripravené · čakám na trhové signály' : 'Portfolio ready · awaiting market signals');

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
              {sk ? 'Zostatky z Portfólia · DefiLlama APY' : 'Balances from Portfolio · DefiLlama APY'}
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
          {sk ? 'Obnoviť APY' : 'Refresh APY'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>
          {sk ? 'APY aktualizácia' : 'APY updated'}:{' '}
          <span className="text-foreground font-mono tabular-nums">
            {market ? formatTime(market.fetchedAt) : '—:—:—'}
          </span>
        </span>
        {market?.fearGreed != null ? (
          <span>F&G: <strong className="text-foreground">{market.fearGreed}</strong></span>
        ) : market?.ready && (
          <span className="text-amber-400/90">F&G: {DATA_UNAVAILABLE}</span>
        )}
        {market?.btcRsi != null ? (
          <span>RSI(w): <strong className="text-foreground">{market.btcRsi}</strong></span>
        ) : market?.ready && (
          <span className="text-amber-400/90">RSI(w): {DATA_UNAVAILABLE}</span>
        )}
        {netYield != null ? (
          <span>Net: <strong className="text-emerald-400">{Math.min(netYield, 50).toFixed(2)}%</strong></span>
        ) : market?.ready && (
          <span className="text-amber-400/90">Net: {DATA_UNAVAILABLE}</span>
        )}
        {marketLoading && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {sk ? 'Trh…' : 'Market…'}
          </span>
        )}
      </div>

      {unavailable.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unavailable.map(src => (
            <span
              key={src}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {src}: {DATA_UNAVAILABLE}
            </span>
          ))}
        </div>
      )}

      <div className={`rounded-xl border p-3 text-[11px] leading-snug font-medium ${marketState?.bannerClass ?? 'border-border/40 bg-muted/20 text-muted-foreground'}`}>
        {banner}
        {usingNeutralSignals && marketState && (
          <p className="mt-1.5 text-[10px] font-normal text-muted-foreground">
            {sk
              ? 'F&G/RSI nedostupné — použité neutrálne hodnoty (50). LTV a zostatky z portfólia sú aktívne.'
              : 'F&G/RSI unavailable — using neutral defaults (50). LTV and portfolio balances remain active.'}
          </p>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-sky-400" />
          <h3 className="text-xs font-semibold text-foreground">Cold Reserve</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <BalanceRow
            icon={<Lock className="w-3.5 h-3.5 text-sky-300" />}
            label="weETH"
            sublabel={sk ? 'Z portfólia · ether.fi' : 'From portfolio · ether.fi'}
            qty={weEth.qty}
            usd={weEth.usd}
            decimals={4}
          />
          <BalanceRow
            icon={<Lock className="w-3.5 h-3.5 text-violet-300" />}
            label="INF"
            sublabel={sk ? 'Z portfólia · Sanctum' : 'From portfolio · Sanctum'}
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

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Cog className="w-3.5 h-3.5 text-emerald-400" />
            <h3 className="text-xs font-semibold text-foreground">Active Motor</h3>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copyPlan()}
            disabled={motorUsd <= 0}
            className="h-9 px-3 text-[11px] font-bold touch-manipulation border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
          >
            <ClipboardCopy className="w-3.5 h-3.5 mr-1.5" />
            {sk ? '📋 Kopírovať Plán (Copy Plan)' : '📋 Copy Plan'}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <BalanceRow
            icon={<Cog className="w-3.5 h-3.5 text-[#627EEA]" />}
            label="rETH"
            sublabel={`Rocket Pool · ${formatDisplayApy(displayApys.rocketPool)}`}
            qty={rEth.qty}
            usd={rEth.usd}
            decimals={4}
          />
          <BalanceRow
            icon={<Cog className="w-3.5 h-3.5 text-[#9945FF]" />}
            label="mSOL"
            sublabel={`Marinade · Kamino ${formatDisplayApy(displayApys.kamino)}`}
            qty={mSol.qty}
            usd={mSol.usd}
            decimals={2}
          />
        </div>

        <div className="rounded-lg border border-border/40 bg-background/30 px-3 py-2 flex justify-between text-[11px]">
          <span className="text-muted-foreground">LBTC</span>
          <span className="font-mono tabular-nums text-foreground">
            {lbtc.qty.toFixed(6)} · {formatUsd(lbtc.usd)}
          </span>
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
            hint={ltvPct > 45 ? (sk ? '⚠ LTV nad 45 %' : '⚠ LTV above 45%') : `${ltvPct}%`}
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
            Morpho borrow: {formatDisplayApy(displayApys.usdcBorrow)}
            {' · '}
            LBTC yield: {formatDisplayApy(displayApys.lbtc)}
            {netYield == null && market?.ready && (
              <span className="text-amber-400/90">
                {' · '}
                {sk ? 'Net yield vyžaduje oba APY' : 'Net yield needs both APYs'}
              </span>
            )}
          </p>
        </div>
      </section>

      <Button
        type="button"
        onClick={confirmExecution}
        disabled={motorUsd <= 0}
        className="w-full h-12 text-sm font-bold touch-manipulation bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
      >
        <CheckCircle2 className="w-4 h-4 mr-2" />
        {sk ? '✅ Potvrdiť realizáciu (Update Portfolio)' : '✅ Confirm Execution (Update Portfolio)'}
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
