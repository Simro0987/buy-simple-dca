import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Bot, ChevronDown, ClipboardCopy, Info, Layers, Loader2, Lock, RefreshCw, Unlock, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { usePortfolio, type PortfolioBalanceUpdate } from '@/contexts/PortfolioContext';
import { useStakingSplitApys } from '@/contexts/StakingApyContext';
import { useHcdIndicators } from '@/hooks/useHcdIndicators';
import { useCyborgMarketData } from '@/hooks/useCyborgTerminalData';
import { GranularExecutionButtons } from '@/components/staking/GranularExecutionButtons';
import { CopyAmountButton } from '@/components/staking/CopyAmountButton';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  computeHcdLayerTargets,
  getHcdLtvMax,
  rebalanceLockMessage,
  type HcdLayerTarget,
  type HcdSymbol,
  type HcdIndicators,
} from '@/lib/hcdArchitecture';
import type { StakedEntry } from '@/lib/stakingLedger';
import {
  computeAlchemixRebalanceAlert,
  computeTacticalWithdrawAlert,
  sumTacticalDeployedQty,
  type ExitStrategyAlert,
} from '@/lib/hcdExitStrategy';
import { useDefiApys } from '@/hooks/useDefiApys';
import {
  computeAdvice,
  getTimingWindow,
  overheatedWarning,
  type AdvisorResult,
} from '@/lib/stakeAdvisor';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import { DATA_UNAVAILABLE } from '@/lib/defiLlamaAggregator';
import {
  computeNetYield,
  computeProjectedLbtcQty,
  computeTotalLbtcApy,
  formatLbtcYieldLabel,
  resolveCyborgState,
  type CyborgAction,
} from '@/lib/cyborgTerminalEngine';

interface Props {
  lang: Lang;
  marketScore: number;
}

const NEUTRAL_FG = 50;
const NEUTRAL_RSI = 50;
const EMPTY_SLICE = { liquidQty: 0, currentPrice: 0 };


const ACTION_LABEL: Record<CyborgAction, { sk: string; en: string }> = {
  DEPOSIT_BORROW: { sk: 'Nasadiť kolaterál + požičať USDC', en: 'Deploy collateral + borrow USDC' },
  HOLD: { sk: 'Držať', en: 'Hold' },
  REPAY_DEBT: { sk: 'Splatiť dlh', en: 'Repay debt' },
  WITHDRAW: { sk: 'Stiahnuť kolaterál', en: 'Withdraw collateral' },
};

function fmtNum(value: number | null | undefined, digits = 1): string {
  const n = value ?? 0;
  return Number.isFinite(n) ? n.toFixed(digits) : '0';
}

function apyLabel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DATA_UNAVAILABLE;
  return `${value.toFixed(2)}%`;
}

function layerApy(layer: HcdLayerTarget, apys: { rEth: number; mSol: number }): string | null {
  const rEthApy = apys.rEth ?? 0;
  const mSolApy = apys.mSol ?? 0;
  if (layer.id.includes('core') && layer.asset === 'rETH') return `${rEthApy.toFixed(2)}%`;
  if (layer.id.includes('core') && layer.asset === 'mSOL') return `${mSolApy.toFixed(2)}%`;
  return null;
}

function tacticalCollateralQty(totalQty: number, layer: HcdLayerTarget | undefined): number {
  return totalQty * ((layer?.pctTarget ?? 0) / 100);
}

function tacticalBorrowUsdc(collateralQty: number, price: number, ltvMax: number): number {
  return collateralQty * price * (ltvMax / 100);
}

function buildLayerUpdate(layer: HcdLayerTarget, qty: number): PortfolioBalanceUpdate {
  if (layer.ledgerProtocol?.includes('Rocket')) return { rEthQty: qty };
  if (layer.ledgerProtocol?.includes('Marinade')) return { mSolQty: qty };
  if (layer.ledgerProtocol?.includes('Alchemix')) return { alchemixEthQty: qty };
  if (layer.ledgerProtocol?.includes('Aave')) return { rEthQty: qty };
  if (layer.ledgerProtocol?.includes('Kamino')) return { mSolQty: qty };
  return {};
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function marketStateLabel(state: number | undefined, fg: number | null, sk: boolean): string {
  if (fg != null) {
    if (fg < 40) return sk ? 'Strach (F&G < 40)' : 'Fear (F&G < 40)';
    if (fg > 75) return sk ? 'Extrémna eufória (F&G > 75)' : 'Extreme euphoria (F&G > 75)';
    return sk ? `Stabilný trh (F&G ${fg})` : `Stable market (F&G ${fg})`;
  }
  return sk ? `Stav ${state ?? '—'}` : `State ${state ?? '—'}`;
}

function CyborgCommandLine({
  prefix,
  amount,
  suffix,
  lang,
  decimals = 2,
  muted,
}: {
  prefix: string;
  amount: number;
  suffix?: string;
  lang: Lang;
  decimals?: number;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        muted ? 'border-border/40 bg-muted/25 opacity-80' : 'border-violet-500/35 bg-violet-500/5'
      }`}
    >
      <p className="text-[11px] font-mono font-semibold text-foreground tabular-nums flex flex-wrap items-center gap-1.5">
        <span>{prefix}</span>
        <span>{amount.toFixed(decimals)}</span>
        <CopyAmountButton lang={lang} value={amount} decimals={decimals} />
        {suffix && <span>{suffix}</span>}
      </p>
    </div>
  );
}

function ManualPlanConfirm({
  lang,
  confirmed,
  disabled,
  onConfirm,
  onRevert,
}: {
  lang: Lang;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onRevert: () => void;
}) {
  const sk = lang === 'sk';

  if (confirmed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRevert}
        disabled={disabled}
        className="h-8 text-[10px] font-semibold touch-manipulation border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
      >
        {sk ? 'Aktualizované' : 'Updated'}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={onConfirm}
      disabled={disabled}
      className="h-8 text-[10px] font-semibold touch-manipulation bg-violet-600 hover:bg-violet-500 text-white"
    >
      {sk ? '✅ Potvrdiť exekúciu' : '✅ Confirm execution'}
    </Button>
  );
}

function ExitStrategyBanner({ alert, sk }: { alert: ExitStrategyAlert; sk: boolean }) {
  const variantClass = {
    urgent: 'border-red-500/60 bg-red-500/15 text-red-100',
    warning: 'border-amber-500/50 bg-amber-500/10 text-amber-100',
    opportunity: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100',
  }[alert.variant];

  const withdrawDecimals = alert.decimals ?? 4;
  const withdrawLabel = alert.tokenLabel ?? '';

  return (
    <div className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${variantClass}`}>
      <p className="text-[11px] font-bold leading-snug">{sk ? alert.commandSk : alert.commandEn}</p>
      {alert.reasonSk && alert.reasonEn && (
        <p className="text-[10px] opacity-90 leading-snug">{sk ? alert.reasonSk : alert.reasonEn}</p>
      )}
      {alert.showLtvWithdrawLine && alert.withdrawQty != null && alert.withdrawQty > 0 && (
        <p className="text-[10px] font-mono font-semibold tabular-nums">
          {sk
            ? `Odporúčaný výber: ${alert.withdrawQty.toFixed(withdrawDecimals)} ${withdrawLabel} pre návrat k LTV 20%.`
            : `Recommended withdrawal: ${alert.withdrawQty.toFixed(withdrawDecimals)} ${withdrawLabel} to return to 20% LTV.`}
        </p>
      )}
      {alert.repayUsdc != null && alert.repayUsdc > 0 && (
        <p className="text-[10px] font-mono font-semibold tabular-nums">
          {sk ? 'Splaťte USDC' : 'Repay USDC'}: {alert.repayUsdc.toFixed(2)}
        </p>
      )}
    </div>
  );
}

function CyborgRoutingMeta({
  token,
  network,
  protocol,
}: {
  token: string;
  network: string;
  protocol: string;
}) {
  return (
    <p className="text-[10px] font-mono text-foreground/90 leading-snug">
      [Token: {token} | Sieť: {network} | Protokol: {protocol}]
    </p>
  );
}

function CyborgActionPlan({
  sk,
  layerPct,
  collateralQty,
  collateralLabel,
  collateralUsd,
  safeBorrowUsdc,
  ltvMax,
  ltvRestricted,
  showBorrowFlow,
  combinedBorrowUsdc,
  projectedLbtcQty,
  projectedLbtcUsd,
  lbtcYieldText,
  terminalApys,
  lang,
  collateralDecimals,
  routing,
  exitAlert,
  planConfirmed,
  onConfirmPlan,
  onRevertPlan,
  execDisabled,
  showBorrowCommand = true,
}: {
  sk: boolean;
  layerPct: number;
  collateralQty: number;
  collateralLabel: string;
  collateralUsd: number;
  safeBorrowUsdc: number;
  ltvMax: number;
  ltvRestricted: boolean;
  showBorrowFlow: boolean;
  combinedBorrowUsdc: number;
  projectedLbtcQty: number;
  projectedLbtcUsd: number;
  lbtcYieldText: string;
  terminalApys: { usdcBorrow: number; lbtcSupply: number };
  lang: Lang;
  collateralDecimals: number;
  routing: { token: string; network: string; protocol: string };
  exitAlert?: ExitStrategyAlert | null;
  planConfirmed: boolean;
  onConfirmPlan: () => void;
  onRevertPlan: () => void;
  execDisabled: boolean;
  showBorrowCommand?: boolean;
}) {
  const [flashBorder, setFlashBorder] = useState(false);
  const wasConfirmedRef = useRef(planConfirmed);

  useEffect(() => {
    if (planConfirmed && !wasConfirmedRef.current) {
      setFlashBorder(true);
      const timer = window.setTimeout(() => setFlashBorder(false), 3000);
      wasConfirmedRef.current = planConfirmed;
      return () => window.clearTimeout(timer);
    }
    wasConfirmedRef.current = planConfirmed;
  }, [planConfirmed]);

  const lineMuted = planConfirmed;

  return (
    <div
      className={`rounded-xl border p-3 space-y-3 transition-colors duration-500 ${
        flashBorder
          ? 'border-emerald-500/70 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
          : planConfirmed
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-violet-500/30 bg-violet-500/5'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
        {sk ? 'Cyborg Action Plan' : 'Cyborg Action Plan'}
        {planConfirmed && (
          <span className="ml-2 normal-case font-semibold text-emerald-400">
            · {sk ? 'Exekuované' : 'Executed'}
          </span>
        )}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CyborgRoutingMeta
          token={routing.token}
          network={routing.network}
          protocol={routing.protocol}
        />
        <ManualPlanConfirm
          lang={lang}
          confirmed={planConfirmed}
          disabled={execDisabled}
          onConfirm={onConfirmPlan}
          onRevert={onRevertPlan}
        />
      </div>

      {exitAlert?.active && <ExitStrategyBanner alert={exitAlert} sk={sk} />}

      <div className="space-y-1 text-[10px] text-muted-foreground leading-snug">
        <p>
          {sk ? 'Požadovaný kolaterál' : 'Required collateral'}:{' '}
          <span className="text-foreground font-semibold">{layerPct.toFixed(1)}%</span>
          {' · '}
          <span className="font-mono text-foreground tabular-nums">
            {collateralQty.toFixed(collateralDecimals)} {collateralLabel} ({formatUsd(collateralUsd)})
          </span>
        </p>
        <p>
          {sk ? 'Bezpečný úver' : 'Safe borrow'} (LTV {ltvMax}%):
          {' '}
          <span className={`font-mono font-semibold tabular-nums ${ltvRestricted ? 'text-amber-400' : 'text-emerald-400'}`}>
            {safeBorrowUsdc.toFixed(2)} USDC
          </span>
        </p>
      </div>

      <CyborgCommandLine
        prefix={sk ? 'Vložte presne:' : 'Deposit exactly:'}
        amount={collateralQty}
        suffix={collateralLabel}
        lang={lang}
        decimals={collateralDecimals}
        muted={lineMuted}
      />

      {showBorrowCommand && (
        <CyborgCommandLine
          prefix={sk ? 'Požičajte si max:' : 'Borrow max:'}
          amount={safeBorrowUsdc}
          suffix="USDC"
          lang={lang}
          decimals={2}
          muted={lineMuted}
        />
      )}

      {showBorrowFlow && combinedBorrowUsdc > 0 && (
        <>
          <CyborgCommandLine
            prefix={sk ? 'Kúpte LBTC za:' : 'Buy LBTC:'}
            amount={projectedLbtcQty}
            suffix="LBTC"
            lang={lang}
            decimals={6}
            muted={lineMuted}
          />
          <p className="text-[9px] text-muted-foreground tabular-nums">
            {sk ? 'Kombinovaný úver ETH+SOL' : 'Combined ETH+SOL borrow'}: {combinedBorrowUsdc.toFixed(2)} USDC · {formatUsd(projectedLbtcUsd)}
          </p>
          <p className="text-[9px] text-muted-foreground" title={lbtcYieldText}>
            Morpho borrow: {apyLabel(terminalApys.usdcBorrow)} · {lbtcYieldText}
          </p>
        </>
      )}
    </div>
  );
}

function planKeyForLayer(layerId: string): string {
  return `hcd-plan-${layerId}`;
}

function TacticalLayerExecution({
  symbol,
  lang,
  layer,
  totalQty,
  assetPrice,
  ltvMax,
  ltvRestricted,
  rebalanceLocked,
  showBorrowFlow,
  combinedBorrowUsdc,
  projectedLbtcQty,
  projectedLbtcUsd,
  terminalApys,
  lbtcYieldText,
  usdcDebt,
  indicators,
  stakedEntries,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  layer: HcdLayerTarget;
  totalQty: number;
  assetPrice: number;
  ltvMax: number;
  ltvRestricted: boolean;
  rebalanceLocked: boolean;
  showBorrowFlow: boolean;
  combinedBorrowUsdc: number;
  projectedLbtcQty: number;
  projectedLbtcUsd: number;
  terminalApys: { usdcBorrow: number; lbtcSupply: number };
  lbtcYieldText: string;
  usdcDebt: number;
  indicators: HcdIndicators;
  stakedEntries: StakedEntry[];
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const collateralDecimals = symbol === 'SOL' ? 2 : 4;
  const motorLabel = symbol === 'ETH' ? 'rETH' : 'mSOL';
  const layerPct = layer.pctTarget;
  const collateralQty = totalQty * (layerPct / 100);
  const deployedCollateralQty = sumTacticalDeployedQty(stakedEntries, symbol);
  const collateralUsd = collateralQty * assetPrice;
  const safeBorrowUsdc = collateralUsd * (ltvMax / 100);
  const planKey = planKeyForLayer(layer.id);
  const planConfirmed = isExecutionConfirmed(planKey);

  const exitAlert = computeTacticalWithdrawAlert({
    indicators,
    collateralQty,
    deployedCollateralQty,
    collateralPrice: assetPrice,
    usdcDebt,
    tokenLabel: motorLabel,
    decimals: collateralDecimals,
  });
  const routing = symbol === 'ETH'
    ? { token: 'rETH', network: 'Arbitrum', protocol: 'Morpho' }
    : { token: 'mSOL', network: 'Solana', protocol: 'Kamino' };

  const buildPlanUpdate = useCallback((): PortfolioBalanceUpdate => {
    const update: PortfolioBalanceUpdate = {};
    if (symbol === 'ETH') {
      update.rEthQty = collateralQty;
      if (showBorrowFlow && projectedLbtcQty > 0) update.lbtcQty = projectedLbtcQty;
    } else {
      update.mSolQty = collateralQty;
    }
    if (safeBorrowUsdc > 0) update.usdcBorrowed = safeBorrowUsdc;
    return update;
  }, [symbol, collateralQty, safeBorrowUsdc, showBorrowFlow, projectedLbtcQty]);

  const handleConfirmPlan = useCallback(() => {
    confirmExecutionStep(planKey, buildPlanUpdate());
    toast.success(sk ? 'Exekúcia potvrdená · baseline aktualizovaný' : 'Execution confirmed · baseline updated');
  }, [confirmExecutionStep, planKey, buildPlanUpdate, sk]);

  const handleRevertPlan = useCallback(() => {
    revertExecutionStep(planKey);
    toast.success(sk ? 'Exekúcia vrátená späť' : 'Execution reverted');
  }, [revertExecutionStep, planKey, sk]);

  return (
    <Collapsible
      defaultOpen
      className={`rounded-xl border transition-colors duration-500 ${
        planConfirmed ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-violet-500/30 bg-violet-500/5'
      }`}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-violet-500/5 transition-colors">
        <span className="text-[11px] font-semibold text-violet-200">
          {sk ? 'Exekúcia · Taktický motor' : 'Execution · Tactical motor'}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <CyborgActionPlan
          sk={sk}
          layerPct={layerPct}
          collateralQty={collateralQty}
          collateralLabel={motorLabel}
          collateralUsd={collateralUsd}
          safeBorrowUsdc={safeBorrowUsdc}
          ltvMax={ltvMax}
          ltvRestricted={ltvRestricted}
          showBorrowFlow={showBorrowFlow}
          combinedBorrowUsdc={combinedBorrowUsdc}
          projectedLbtcQty={projectedLbtcQty}
          projectedLbtcUsd={projectedLbtcUsd}
          lbtcYieldText={lbtcYieldText}
          terminalApys={terminalApys}
          lang={lang}
          collateralDecimals={collateralDecimals}
          routing={routing}
          exitAlert={exitAlert}
          planConfirmed={planConfirmed}
          onConfirmPlan={handleConfirmPlan}
          onRevertPlan={handleRevertPlan}
          execDisabled={rebalanceLocked}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function AlchemixLayerExecution({
  lang,
  layer,
  totalEthQty,
  ethPrice,
  rebalanceLocked,
  alchemixApyPct,
}: {
  lang: Lang;
  layer: HcdLayerTarget;
  totalEthQty: number;
  ethPrice: number;
  rebalanceLocked: boolean;
  alchemixApyPct: number;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const layerPct = layer.pctTarget;
  const targetQty = totalEthQty * (layerPct / 100);
  const targetUsd = targetQty * ethPrice;
  const planKey = planKeyForLayer(layer.id);
  const planConfirmed = isExecutionConfirmed(planKey);
  const exitAlert = computeAlchemixRebalanceAlert(alchemixApyPct);

  const handleConfirmPlan = useCallback(() => {
    confirmExecutionStep(planKey, { alchemixEthQty: targetQty });
    toast.success(sk ? 'Exekúcia potvrdená · baseline aktualizovaný' : 'Execution confirmed · baseline updated');
  }, [confirmExecutionStep, planKey, targetQty, sk]);

  const handleRevertPlan = useCallback(() => {
    revertExecutionStep(planKey);
    toast.success(sk ? 'Exekúcia vrátená späť' : 'Execution reverted');
  }, [revertExecutionStep, planKey, sk]);

  return (
    <Collapsible
      defaultOpen
      className={`rounded-xl border transition-colors duration-500 ${
        planConfirmed ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-sky-500/30 bg-sky-500/5'
      }`}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-sky-500/5 transition-colors">
        <span className="text-[11px] font-semibold text-sky-200">
          {sk ? 'Exekúcia · Alchemix Vault' : 'Execution · Alchemix Vault'}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <CyborgActionPlan
          sk={sk}
          layerPct={layerPct}
          collateralQty={targetQty}
          collateralLabel="ETH"
          collateralUsd={targetUsd}
          safeBorrowUsdc={0}
          ltvMax={0}
          ltvRestricted={false}
          showBorrowFlow={false}
          combinedBorrowUsdc={0}
          projectedLbtcQty={0}
          projectedLbtcUsd={0}
          lbtcYieldText=""
          terminalApys={{ usdcBorrow: 0, lbtcSupply: 0 }}
          lang={lang}
          collateralDecimals={4}
          routing={{ token: 'ETH', network: 'Ethereum L1', protocol: 'Alchemix' }}
          exitAlert={exitAlert}
          planConfirmed={planConfirmed}
          onConfirmPlan={handleConfirmPlan}
          onRevertPlan={handleRevertPlan}
          execDisabled={rebalanceLocked}
          showBorrowCommand={false}
        />
        <p className="text-[9px] text-muted-foreground mt-2 px-1">
          {sk ? `${layer.protocol} · Bez likvidácie` : `${layer.protocol} · No liquidation`}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssetHcdCard({
  symbol,
  lang,
  totalPortfolioQty,
  price,
  layers,
  rebalanceLocked,
  advised,
  ltvMax,
  ltvRestricted,
  showBorrowFlow,
  combinedBorrowUsdc,
  projectedLbtcQty,
  projectedLbtcUsd,
  terminalApys,
  lbtcYieldText,
  usdcDebt,
  indicators,
  stakedEntries,
  alchemixApyPct,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  totalPortfolioQty: number;
  price: number;
  layers: HcdLayerTarget[];
  rebalanceLocked: boolean;
  advised: AdvisorResult | null;
  ltvMax: number;
  ltvRestricted: boolean;
  showBorrowFlow: boolean;
  combinedBorrowUsdc: number;
  projectedLbtcQty: number;
  projectedLbtcUsd: number;
  terminalApys: { usdcBorrow: number; lbtcSupply: number };
  lbtcYieldText: string;
  usdcDebt: number;
  indicators: HcdIndicators;
  stakedEntries: StakedEntry[];
  alchemixApyPct: number;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const apys = useStakingSplitApys();
  const decimals = symbol === 'SOL' ? 2 : 3;
  const totalUsd = totalPortfolioQty * price;
  const deployQty = advised?.breakdown.recommendedQty ?? totalPortfolioQty;

  return (
    <div className="glass-card p-3 sm:p-4 space-y-3 border border-violet-500/25 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-violet-300 shrink-0" />
          <h3 className="text-sm font-bold text-foreground">{symbol} · HCD Vrstvy</h3>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
            {totalPortfolioQty.toFixed(decimals)} {symbol} · {formatUsd(totalUsd)}
          </p>
          <p
            className="text-[9px] text-muted-foreground/90 flex items-center justify-end gap-1 mt-0.5"
            title={sk
              ? 'Agregovaný zostatok (Peňaženka + DeFi pozície)'
              : 'Aggregated balance (Wallet + DeFi positions)'}
          >
            <Info className="w-3 h-3 shrink-0 text-violet-400/80" />
            {sk ? 'Agregovaný zostatok (Peňaženka + DeFi)' : 'Aggregated (Wallet + DeFi)'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {(layers ?? []).map(layer => {
          const qty = deployQty * (layer.pctTarget / 100);
          const usd = qty * price;
          const stepKey = `hcd-${layer.id}`;
          const confirmed = isExecutionConfirmed(stepKey);
          const apy = layerApy(layer, apys);
          const isTactical = layer.id.includes('tactical');
          const isAlchemix = layer.id.includes('alchemix');
          const isInfoOnly = !isTactical && !isAlchemix;
          const canExecute = !rebalanceLocked && !!layer.ledgerProtocol && qty > 0 && isInfoOnly;

          return (
            <div
              key={layer.id}
              className={`rounded-xl border p-2.5 sm:p-3 space-y-2 min-w-0 ${
                confirmed && isInfoOnly
                  ? 'border-border/30 bg-muted/20 opacity-75'
                  : 'border-border/50 bg-background/30'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300/90">
                      Vrstva {layer.layer}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {sk ? layer.nameSk : layer.nameEn}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 break-words">
                    {layer.asset} · {layer.protocol}
                    {layer.borrow && ` → Borrow: ${layer.borrow}`}
                    {apy && ` · APY ${apy}`}
                  </p>
                  {(layer.noteSk || layer.noteEn) && (
                    <p className="text-[9px] text-emerald-400/80 mt-0.5">
                      {sk ? layer.noteSk : layer.noteEn}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm font-bold text-violet-200 tabular-nums">
                    {layer.pctTarget.toFixed(1)}%
                  </p>
                  <p className="text-[9px] text-muted-foreground tabular-nums">
                    {layer.pctMin}–{layer.pctMax}%
                  </p>
                </div>
              </div>

              {isTactical && (
                <TacticalLayerExecution
                  symbol={symbol}
                  lang={lang}
                  layer={layer}
                  totalQty={totalPortfolioQty}
                  assetPrice={price}
                  ltvMax={ltvMax}
                  ltvRestricted={ltvRestricted}
                  rebalanceLocked={rebalanceLocked}
                  showBorrowFlow={showBorrowFlow}
                  combinedBorrowUsdc={combinedBorrowUsdc}
                  projectedLbtcQty={projectedLbtcQty}
                  projectedLbtcUsd={projectedLbtcUsd}
                  terminalApys={terminalApys}
                  lbtcYieldText={lbtcYieldText}
                  usdcDebt={usdcDebt}
                  indicators={indicators}
                  stakedEntries={stakedEntries}
                />
              )}

              {isAlchemix && symbol === 'ETH' && (
                <AlchemixLayerExecution
                  lang={lang}
                  layer={layer}
                  totalEthQty={totalPortfolioQty}
                  ethPrice={price}
                  rebalanceLocked={rebalanceLocked}
                  alchemixApyPct={alchemixApyPct}
                />
              )}

              {isInfoOnly && layer.ledgerProtocol && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1 border-t border-border/30">
                  <p className="text-[10px] font-mono text-foreground tabular-nums">
                    {qty.toFixed(decimals)} {symbol} · {formatUsd(usd)}
                  </p>
                  <GranularExecutionButtons
                    lang={lang}
                    value={qty}
                    decimals={decimals}
                    confirmed={confirmed}
                    disabled={!canExecute}
                    onConfirm={() => {
                      confirmExecutionStep(stepKey, buildLayerUpdate(layer, qty));
                      toast.success(sk ? 'HCD vrstva potvrdená' : 'HCD layer confirmed');
                    }}
                    onRevert={() => {
                      revertExecutionStep(stepKey);
                      toast.success(sk ? 'Akcia vrátená späť' : 'Action reverted');
                    }}
                  />
                </div>
              )}

              {isInfoOnly && !layer.ledgerProtocol && (
                <p className="text-[9px] text-muted-foreground italic">
                  {sk ? 'Likvidná rezerva — bez on-chain stake' : 'Liquid reserve — no on-chain stake'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HcdStakePanel({ lang, marketScore }: Props) {
  const sk = lang === 'sk';
  const { portfolioData, isExecutionConfirmed, cyborgUsdcDebt } = usePortfolio();
  const { data: defiApys } = useDefiApys();
  const { entries } = useStakingLedger();
  const { indicators, rebalance, borrowLoading, borrowRates } = useHcdIndicators(lang);
  const { market, marketLoading, updating, refresh, unavailable, terminalApys } = useCyborgMarketData();
  const win = getTimingWindow(marketScore);
  const [isEmergencyUnlocked, setIsEmergencyUnlocked] = useState(false);
  const rebalanceLocked = (!rebalance.unlocked || win.locked) && !isEmergencyUnlocked;
  const ltvMax = getHcdLtvMax(indicators);
  const ltvRestricted = indicators.volatilityRegime === 'high' || indicators.borrowWarning;

  const ethSlice = portfolioData.assets?.ETH ?? EMPTY_SLICE;
  const solSlice = portfolioData.assets?.SOL ?? EMPTY_SLICE;
  const ethTotalQty = portfolioData.totalEthPortfolio;
  const solTotalQty = portfolioData.totalSolPortfolio;
  const ethPrice = portfolioData.prices?.eth ?? 0;
  const solPrice = portfolioData.prices?.sol ?? 0;
  const btcPrice = portfolioData.prices?.btc ?? 0;

  const portfolioUsd = portfolioData.ethBaseline.totalUsd + portfolioData.solBaseline.totalUsd;

  const ethLayers = useMemo(() => computeHcdLayerTargets('ETH', indicators) ?? [], [indicators]);
  const solLayers = useMemo(() => computeHcdLayerTargets('SOL', indicators) ?? [], [indicators]);

  const ethTacticalLayer = ethLayers.find(layer => layer.id.includes('tactical'));
  const solTacticalLayer = solLayers.find(layer => layer.id.includes('tactical'));
  const alchemixApyPct = defiApys?.alchemixVault ?? 2.2;
  const ethStakedEntries = portfolioData.assets?.ETH?.stakedEntries ?? [];
  const solStakedEntries = portfolioData.assets?.SOL?.stakedEntries ?? [];

  const deployREth = tacticalCollateralQty(ethTotalQty, ethTacticalLayer);
  const deployMSol = tacticalCollateralQty(solTotalQty, solTacticalLayer);
  const ethBorrowUsdc = tacticalBorrowUsdc(deployREth, ethPrice, ltvMax);
  const solBorrowUsdc = tacticalBorrowUsdc(deployMSol, solPrice, ltvMax);
  const combinedBorrowUsdc = ethBorrowUsdc + solBorrowUsdc;
  const projectedLbtcQty = computeProjectedLbtcQty(combinedBorrowUsdc, btcPrice);
  const projectedLbtcUsd = projectedLbtcQty * btcPrice;

  const ethTacticalPlanKey = ethTacticalLayer ? planKeyForLayer(ethTacticalLayer.id) : '';
  const isLbtcSupplied = ethTacticalPlanKey
    ? isExecutionConfirmed(ethTacticalPlanKey)
    : false;
  const totalLbtcApy = computeTotalLbtcApy(isLbtcSupplied, terminalApys?.lbtcSupply ?? 0);
  const netYield = computeNetYield(totalLbtcApy, terminalApys?.usdcBorrow ?? 0);
  const lbtcYieldText = formatLbtcYieldLabel(isLbtcSupplied, terminalApys?.lbtcSupply ?? 0, sk);

  const marketState = useMemo(() => {
    if (!market?.ready) return null;
    const fg = market.fearGreed ?? NEUTRAL_FG;
    const rsi = market.btcRsi ?? NEUTRAL_RSI;
    return resolveCyborgState(fg, rsi, netYield, ltvMax);
  }, [market, netYield, ltvMax]);

  const usingNeutralSignals = market?.ready && (market.fearGreed === null || market.btcRsi === null);

  const ethAdvice = useMemo(() => computeAdvice({
    symbol: 'ETH',
    liquidQty: ethSlice.liquidQty ?? 0,
    pricePerUnit: ethSlice.currentPrice ?? 0,
    marketScore,
    ledgerEntries: entries ?? [],
  }), [ethSlice, marketScore, entries]);

  const solAdvice = useMemo(() => computeAdvice({
    symbol: 'SOL',
    liquidQty: solSlice.liquidQty ?? 0,
    pricePerUnit: solSlice.currentPrice ?? 0,
    marketScore,
    ledgerEntries: entries ?? [],
  }), [solSlice, marketScore, entries]);

  const copyPlan = useCallback(async () => {
    const action = marketState?.action ?? 'HOLD';
    const actionText = sk ? ACTION_LABEL[action].sk : ACTION_LABEL[action].en;
    const stateText = marketStateLabel(marketState?.state, market?.fearGreed ?? null, sk);
    const plan = [
      '--- HCD CYBORG MATRIX ---',
      `Market State: ${stateText}`,
      `Action: ${actionText}`,
      `ETH Layer 3: ${(ethTacticalLayer?.pctTarget ?? 0).toFixed(1)}% · ${deployREth.toFixed(4)} rETH`,
      `SOL Layer 3: ${(solTacticalLayer?.pctTarget ?? 0).toFixed(1)}% · ${deployMSol.toFixed(2)} mSOL`,
      `Safe LTV: ${ltvMax}% (HCD brain max)`,
      `ETH Borrow: $${ethBorrowUsdc.toFixed(2)} USDC`,
      `SOL Borrow: $${solBorrowUsdc.toFixed(2)} USDC`,
      `Combined Borrow: $${combinedBorrowUsdc.toFixed(2)} USDC`,
      `Buy: ${projectedLbtcQty.toFixed(6)} LBTC (projected)`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(plan);
      toast.success(sk ? 'Plán skopírovaný do schránky' : 'Plan copied to clipboard');
    } catch {
      toast.error(sk ? 'Kopírovanie zlyhalo' : 'Copy failed');
    }
  }, [
    sk, marketState, market?.fearGreed, ethTacticalLayer, solTacticalLayer,
    deployREth, deployMSol, ltvMax, ethBorrowUsdc, solBorrowUsdc,
    combinedBorrowUsdc, projectedLbtcQty,
  ]);

  if (portfolioData.loading || borrowLoading) {
    return (
      <div className="glass-card p-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {sk ? 'Načítavam dáta…' : 'Loading data…'}
      </div>
    );
  }

  const showMarketBanner = marketState != null && marketState.state !== 3;
  const marketBannerText = marketState
    ? (sk ? marketState.bannerSk : marketState.bannerEn)
    : marketLoading
      ? (sk ? 'Načítavam trhové signály…' : 'Loading market signals…')
      : (sk ? 'Portfólio pripravené · čakám na trhové signály' : 'Portfolio ready · awaiting market signals');

  const terminalApysSafe = {
    usdcBorrow: terminalApys?.usdcBorrow ?? 0,
    lbtcSupply: terminalApys?.lbtcSupply ?? 0,
  };

  return (
    <div className="glass-card p-3 sm:p-4 space-y-3 border border-violet-500/20 min-w-0 relative">
      {updating && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-background/90 border border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
          {sk ? 'Aktualizujem…' : 'Updating…'}
        </div>
      )}

      {/* ── HCD Mozog (centrálny riadiaci panel) ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-violet-300" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground leading-tight">HCD Cyborg Matrix</h2>
            <p className="text-[10px] text-muted-foreground truncate">
              {sk ? 'HCD mozog · granulárna exekúcia vo vrstvách' : 'HCD brain · granular layer execution'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={updating}
            className="h-9 px-2.5 text-[11px] touch-manipulation"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${updating ? 'animate-spin' : ''}`} />
            {sk ? 'Obnoviť' : 'Refresh'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copyPlan()}
            disabled={portfolioUsd <= 0}
            className="h-9 px-2.5 text-[11px] touch-manipulation"
          >
            <ClipboardCopy className="w-3.5 h-3.5 mr-1" />
            {sk ? 'Plán' : 'Plan'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>
          APY: <span className="text-foreground font-mono tabular-nums">{market ? formatTime(market.fetchedAt) : '—'}</span>
        </span>
        {market?.fearGreed != null && <span>F&G: <strong className="text-foreground">{market.fearGreed}</strong></span>}
        {market?.btcRsi != null && <span>RSI: <strong className="text-foreground">{market.btcRsi}</strong></span>}
        {market?.ready && (
          <span>
            Net: <strong className={netYield < 0 ? 'text-red-400' : 'text-emerald-400'}>{netYield.toFixed(2)}%</strong>
          </span>
        )}
      </div>

      {unavailable.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unavailable.map(src => (
            <span key={src} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {src}: {DATA_UNAVAILABLE}
            </span>
          ))}
        </div>
      )}

      {win.phase === 'overheated' && (
        <div className="rounded-xl border border-loss/40 bg-loss/5 p-3">
          <p className="text-[11px] text-loss font-semibold">{overheatedWarning(lang)}</p>
        </div>
      )}

      <div
        className={`rounded-xl border px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 text-[11px] leading-snug ${
          rebalanceLocked && !isEmergencyUnlocked
            ? 'border-red-500/50 bg-red-500/10 text-red-200'
            : isEmergencyUnlocked
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
        }`}
      >
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {isEmergencyUnlocked ? (
            <Unlock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          ) : rebalanceLocked ? (
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          ) : (
            <Zap className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <p className="min-w-0">
            {isEmergencyUnlocked
              ? (sk
                ? '🔓 Núdzové odomknutie aktívne — exekúcia povolená mimo kvartálneho okna.'
                : '🔓 Emergency override active — execution allowed outside quarterly window.')
              : rebalanceLockMessage(lang, rebalance)}
          </p>
        </div>
        <Button
          type="button"
          variant={isEmergencyUnlocked ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsEmergencyUnlocked(v => !v)}
          className={`shrink-0 h-8 px-2.5 text-[10px] font-semibold touch-manipulation ${
            isEmergencyUnlocked
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-100 hover:bg-amber-500/30'
              : 'border-red-500/40 text-red-200 hover:bg-red-500/15'
          }`}
        >
          {isEmergencyUnlocked ? (
            <><Lock className="w-3 h-3 mr-1" />{sk ? 'Zamknúť' : 'Lock'}</>
          ) : (
            <><Unlock className="w-3 h-3 mr-1" />{sk ? '🔓 Núdzový Override' : '🔓 Emergency Override'}</>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
        {[
          { l: sk ? 'Volatilita' : 'Volatility', v: `${fmtNum(indicators.volatilityPct)}%`, sub: indicators.volatilityRegime, loading: false },
          { l: sk ? 'Cieľové LTV' : 'Target LTV', v: `${indicators.targetLtvPct ?? 30}%`, sub: `max ${ltvMax}%`, loading: false },
          { l: 'USDC Borrow', v: borrowRates?.unavailable.length === 2 ? '0%' : `${fmtNum(indicators.borrowApyPct, 2)}%`, sub: indicators.borrowWarning ? 'warn' : (borrowRates?.unavailable.length ? 'partial' : 'live'), loading: false },
          { l: sk ? 'Gas vrstva' : 'Gas layer', v: `${fmtNum(indicators.gasLayerPct)}%`, sub: indicators.gasStress, loading: false },
        ].map(item => (
          <div key={item.l} className="rounded-lg border border-border/50 bg-background/40 p-2 min-w-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide truncate">{item.l}</p>
            {item.loading ? (
              <p className="font-mono text-sm font-bold text-muted-foreground animate-pulse">…</p>
            ) : (
              <p className="font-mono text-sm font-bold text-foreground tabular-nums">{item.v}</p>
            )}
            <p className="text-[9px] text-muted-foreground capitalize truncate">{item.sub}</p>
          </div>
        ))}
      </div>

      {(borrowRates?.unavailable.length ?? 0) > 0 && (
        <p className="text-[10px] text-amber-400/90">
          {sk
            ? `Borrow zdroje nedostupné (${borrowRates?.unavailable.join(', ')}). Zobrazené 0 % do načítania live dát.`
            : `Borrow sources unavailable (${borrowRates?.unavailable.join(', ')}). Showing 0% until live data loads.`}
        </p>
      )}

      {indicators.borrowWarning && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-red-200 leading-snug">
            <p className="font-bold">{sk ? 'VAROVANIE: Net Borrow Cost > 8%' : 'WARNING: Net Borrow Cost > 8%'}</p>
            <p className="mt-1 text-red-200/80">
              {sk
                ? 'Úrok na Aave/Kamino je príliš vysoký. Zníž taktický kolaterál a splať USDC dlh. HCD mozog limituje max LTV na 20%.'
                : 'Aave/Kamino borrow rate is too high. Reduce tactical collateral and repay USDC debt. HCD brain caps max LTV at 20%.'}
            </p>
          </div>
        </div>
      )}

      {ltvRestricted && !indicators.borrowWarning && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200">
            {sk
              ? `Vysoká volatilita — HCD mozog limituje max LTV na ${ltvMax}%.`
              : `High volatility — HCD brain caps max LTV at ${ltvMax}%.`}
          </p>
        </div>
      )}

      {showMarketBanner && (
        <div className={`rounded-xl border p-3 text-[11px] leading-snug font-medium ${marketState?.bannerClass ?? 'border-border/40 bg-muted/20 text-muted-foreground'}`}>
          {marketBannerText}
          {usingNeutralSignals && (
            <p className="mt-1.5 text-[10px] font-normal text-muted-foreground">
              {sk ? 'F&G/RSI nedostupné — neutrálne hodnoty (50).' : 'F&G/RSI unavailable — neutral defaults (50).'}
            </p>
          )}
        </div>
      )}

      {/* ── HCD Vrstvy s integrovanou exekúciou ── */}
      <AssetHcdCard
        symbol="ETH"
        lang={lang}
        totalPortfolioQty={ethTotalQty}
        price={ethSlice.currentPrice ?? 0}
        layers={ethLayers}
        rebalanceLocked={rebalanceLocked}
        advised={ethAdvice.eligible ? ethAdvice : null}
        ltvMax={ltvMax}
        ltvRestricted={ltvRestricted}
        showBorrowFlow
        combinedBorrowUsdc={combinedBorrowUsdc}
        projectedLbtcQty={projectedLbtcQty}
        projectedLbtcUsd={projectedLbtcUsd}
        terminalApys={terminalApysSafe}
        lbtcYieldText={lbtcYieldText}
        usdcDebt={cyborgUsdcDebt}
        indicators={indicators}
        stakedEntries={ethStakedEntries}
        alchemixApyPct={alchemixApyPct}
      />

      <AssetHcdCard
        symbol="SOL"
        lang={lang}
        totalPortfolioQty={solTotalQty}
        price={solSlice.currentPrice ?? 0}
        layers={solLayers}
        rebalanceLocked={rebalanceLocked}
        advised={solAdvice.eligible ? solAdvice : null}
        ltvMax={ltvMax}
        ltvRestricted={ltvRestricted}
        showBorrowFlow={false}
        combinedBorrowUsdc={combinedBorrowUsdc}
        projectedLbtcQty={projectedLbtcQty}
        projectedLbtcUsd={projectedLbtcUsd}
        terminalApys={terminalApysSafe}
        lbtcYieldText={lbtcYieldText}
        usdcDebt={cyborgUsdcDebt}
        indicators={indicators}
        stakedEntries={solStakedEntries}
        alchemixApyPct={alchemixApyPct}
      />

      <p className="text-[10px] text-muted-foreground leading-snug">
        {sk
          ? 'HCD mozog riadi indikátory a limity LTV. Exekúcia (presné príkazy, borrow, Alchemix) je priamo vo Vrstve 3 a 4. Rebalans len v kvartálnych mesiacoch.'
          : 'HCD brain drives indicators and LTV limits. Execution (exact commands, borrow, Alchemix) lives in Layers 3 and 4. Rebalance only in quarterly months.'}
      </p>
    </div>
  );
}
