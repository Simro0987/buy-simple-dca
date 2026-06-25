import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Bot, ChevronDown, ClipboardCopy, Info, Layers, Loader2, Lock, RefreshCw, Unlock, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { usePortfolio, type DecisionConfirmMeta, type PortfolioBalanceUpdate } from '@/contexts/PortfolioContext';
import { useStakingSplitApys } from '@/contexts/StakingApyContext';
import { useHcdIndicators } from '@/hooks/useHcdIndicators';
import { useCyborgMarketData } from '@/hooks/useCyborgTerminalData';
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
  getTimingWindow,
  overheatedWarning,
} from '@/lib/stakeAdvisor';
import { DATA_UNAVAILABLE } from '@/lib/defiLlamaAggregator';
import { HcdLearningLog } from '@/components/staking/HcdLearningLog';
import { useAlchemixAutonomy } from '@/hooks/useAlchemixAutonomy';
import {
  computeAlchemixRedistribution,
  isAlchemixApyBelowFloor,
  lockAlchemixAutonomous,
  type AlchemixRedistribution,
} from '@/lib/hcdAlchemixAutonomy';
import { capturePortfolioSnapshot } from '@/lib/hcdSilentTracker';
import { temperamentLabel } from '@/lib/hcdTemperament';
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
  usdMode,
}: {
  prefix: string;
  amount: number;
  suffix?: string;
  lang: Lang;
  decimals?: number;
  muted?: boolean;
  usdMode?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        muted ? 'border-border/40 bg-muted/25 opacity-80' : 'border-violet-500/35 bg-violet-500/5'
      }`}
    >
      <p className="text-[11px] font-mono font-semibold text-foreground tabular-nums flex flex-wrap items-center gap-1.5">
        <span>{prefix}</span>
        {usdMode ? (
          <>
            <span>{formatUsd(amount)}</span>
            <CopyAmountButton lang={lang} value={amount} decimals={2} />
            <span>USD</span>
          </>
        ) : (
          <>
            <span>{amount.toFixed(decimals)}</span>
            <CopyAmountButton lang={lang} value={amount} decimals={decimals} />
            {suffix && <span>{suffix}</span>}
          </>
        )}
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
  autonomousMode,
  onAutonomous,
}: {
  lang: Lang;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onRevert: () => void;
  autonomousMode?: boolean;
  onAutonomous?: () => void;
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

  if (autonomousMode && onAutonomous) {
    return (
      <Button
        type="button"
        size="sm"
        onClick={onAutonomous}
        disabled={disabled}
        className="h-8 text-[10px] font-semibold touch-manipulation bg-amber-600 hover:bg-amber-500 text-white"
      >
        {sk ? '🤖 Autonómny rebalans' : '🤖 Autonomous rebalance'}
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
  autonomousMode,
  onAutonomous,
  redistributionLines,
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
  autonomousMode?: boolean;
  onAutonomous?: () => void;
  redistributionLines?: Array<{ label: string; qty: number; decimals: number; suffix: string }>;
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
          autonomousMode={autonomousMode}
          onAutonomous={onAutonomous}
        />
      </div>

      {redistributionLines && redistributionLines.length > 0 && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] font-bold text-amber-200">
            {sk ? 'Presun kapitálu (HCD Mozog)' : 'Capital routing (HCD brain)'}
          </p>
          {redistributionLines.map(line => (
            <CyborgCommandLine
              key={line.label}
              prefix={line.label}
              amount={line.qty}
              suffix={line.suffix}
              lang={lang}
              decimals={line.decimals}
              muted={lineMuted}
            />
          ))}
        </div>
      )}

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
            prefix={sk ? 'Kúpte za:' : 'Buy for:'}
            amount={projectedLbtcUsd}
            lang={lang}
            usdMode
            muted={lineMuted}
          />
          <p className="text-[9px] text-muted-foreground tabular-nums">
            {sk ? 'Kombinovaný úver ETH+SOL' : 'Combined ETH+SOL borrow'}: {combinedBorrowUsdc.toFixed(2)} USDC · ~{projectedLbtcQty.toFixed(6)} LBTC
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

function CoreCyborgActionPlan({
  sk,
  lang,
  layerPct,
  stakeQty,
  stakeLabel,
  stakeUsd,
  stakeDecimals,
  routing,
  apyText,
  planConfirmed,
  onConfirmPlan,
  onRevertPlan,
  execDisabled,
}: {
  sk: boolean;
  lang: Lang;
  layerPct: number;
  stakeQty: number;
  stakeLabel: string;
  stakeUsd: number;
  stakeDecimals: number;
  routing: { token: string; network: string; protocol: string };
  apyText?: string | null;
  planConfirmed: boolean;
  onConfirmPlan: () => void;
  onRevertPlan: () => void;
  execDisabled: boolean;
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
            : 'border-teal-500/30 bg-teal-500/5'
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-300">
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

      <div className="space-y-1 text-[10px] text-muted-foreground leading-snug">
        <p>
          {sk ? 'Požadovaný stake' : 'Required stake'}:{' '}
          <span className="text-foreground font-semibold">{layerPct.toFixed(1)}%</span>
          {' · '}
          <span className="font-mono text-foreground tabular-nums">
            {stakeQty.toFixed(stakeDecimals)} {stakeLabel} ({formatUsd(stakeUsd)})
          </span>
        </p>
        {apyText && (
          <p>
            APY:{' '}
            <span className="font-mono font-semibold text-emerald-400 tabular-nums">{apyText}</span>
          </p>
        )}
      </div>

      <CyborgCommandLine
        prefix={sk ? 'Stake presne:' : 'Stake exactly:'}
        amount={stakeQty}
        suffix={stakeLabel}
        lang={lang}
        decimals={stakeDecimals}
        muted={lineMuted}
      />
    </div>
  );
}

function CoreLayerExecution({
  symbol,
  lang,
  layer,
  totalQty,
  assetPrice,
  rebalanceLocked,
  apyText,
  buildDecisionMeta,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  layer: HcdLayerTarget;
  totalQty: number;
  assetPrice: number;
  rebalanceLocked: boolean;
  apyText?: string | null;
  buildDecisionMeta: () => DecisionConfirmMeta;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed } = usePortfolio();
  const layerPct = layer.pctTarget;
  const stakeDecimals = symbol === 'SOL' ? 2 : 4;
  const stakeLabel = symbol === 'ETH' ? 'ETH' : 'SOL';
  const stakeQty = totalQty * (layerPct / 100);
  const stakeUsd = stakeQty * assetPrice;
  const planKey = planKeyForLayer(layer.id);
  const planConfirmed = isExecutionConfirmed(planKey);
  const routing = symbol === 'ETH'
    ? { token: 'rETH', network: 'Ethereum L1', protocol: 'Rocket Pool' }
    : { token: 'mSOL', network: 'Solana', protocol: 'Marinade' };

  const buildPlanUpdate = useCallback((): PortfolioBalanceUpdate => (
    symbol === 'ETH' ? { rEthQty: stakeQty } : { mSolQty: stakeQty }
  ), [symbol, stakeQty]);

  const handleConfirmPlan = useCallback(() => {
    confirmExecutionStep(planKey, buildPlanUpdate(), buildDecisionMeta());
    toast.success(sk ? 'Exekúcia potvrdená · baseline aktualizovaný' : 'Execution confirmed · baseline updated');
  }, [confirmExecutionStep, planKey, buildPlanUpdate, buildDecisionMeta, sk]);

  const handleRevertPlan = useCallback(() => {
    revertExecutionStep(planKey);
    toast.success(sk ? 'Exekúcia vrátená späť' : 'Execution reverted');
  }, [revertExecutionStep, planKey, sk]);

  return (
    <Collapsible
      defaultOpen
      className={`rounded-xl border transition-colors duration-500 ${
        planConfirmed ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-teal-500/30 bg-teal-500/5'
      }`}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-teal-500/5 transition-colors">
        <span className="text-[11px] font-semibold text-teal-200">
          {sk ? 'Exekúcia · Core Fortress' : 'Execution · Core Fortress'}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        <CoreCyborgActionPlan
          sk={sk}
          lang={lang}
          layerPct={layerPct}
          stakeQty={stakeQty}
          stakeLabel={stakeLabel}
          stakeUsd={stakeUsd}
          stakeDecimals={stakeDecimals}
          routing={routing}
          apyText={apyText}
          planConfirmed={planConfirmed}
          onConfirmPlan={handleConfirmPlan}
          onRevertPlan={handleRevertPlan}
          execDisabled={rebalanceLocked}
        />
      </CollapsibleContent>
    </Collapsible>
  );
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
  buildDecisionMeta,
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
  buildDecisionMeta: () => DecisionConfirmMeta;
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
    confirmExecutionStep(planKey, buildPlanUpdate(), buildDecisionMeta());
    toast.success(sk ? 'Exekúcia potvrdená · baseline aktualizovaný' : 'Execution confirmed · baseline updated');
  }, [confirmExecutionStep, planKey, buildPlanUpdate, buildDecisionMeta, sk]);

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
  indicators,
  ltvMax,
  stakedEntries,
  buildDecisionMeta,
  autonomyLocked,
  autonomyRedistribution,
}: {
  lang: Lang;
  layer: HcdLayerTarget;
  totalEthQty: number;
  ethPrice: number;
  rebalanceLocked: boolean;
  alchemixApyPct: number;
  indicators: HcdIndicators;
  ltvMax: number;
  stakedEntries: StakedEntry[];
  buildDecisionMeta: () => DecisionConfirmMeta;
  autonomyLocked: boolean;
  autonomyRedistribution: AlchemixRedistribution | null;
}) {
  const sk = lang === 'sk';
  const { confirmExecutionStep, revertExecutionStep, isExecutionConfirmed, executeAlchemixAutonomousRebalance } = usePortfolio();
  const layerPct = autonomyLocked ? 0 : layer.pctTarget;
  const targetQty = totalEthQty * (layer.pctTarget / 100);
  const targetUsd = targetQty * ethPrice;
  const planKey = planKeyForLayer(layer.id);
  const planConfirmed = isExecutionConfirmed(planKey) || autonomyLocked;
  const exitAlert = computeAlchemixRebalanceAlert(alchemixApyPct);
  const showAutonomous = isAlchemixApyBelowFloor(alchemixApyPct) && !autonomyLocked;

  const alchemixDeployedQty = stakedEntries
    .filter(e => /alchemix/i.test(e.protocol))
    .reduce((s, e) => s + e.amount, 0);
  const freedEthQty = Math.max(targetQty, alchemixDeployedQty);

  const previewRedistribution = useMemo(
    () => (freedEthQty > 0 ? computeAlchemixRedistribution(freedEthQty, indicators) : null),
    [freedEthQty, indicators],
  );

  const redistributionLines = useMemo(() => {
    const dist = autonomyRedistribution ?? previewRedistribution;
    if (!dist) return [];
    const tacticalUsd = dist.tacticalEthQty * ethPrice;
    const usdcBorrow = tacticalUsd * (ltvMax / 100);
    return [
      {
        label: sk ? '→ Vrstva 2 (Core):' : '→ Layer 2 (Core):',
        qty: dist.coreEthQty,
        decimals: 4,
        suffix: 'ETH',
      },
      {
        label: sk ? '→ Vrstva 3 (Taktická):' : '→ Layer 3 (Tactical):',
        qty: dist.tacticalEthQty,
        decimals: 4,
        suffix: 'ETH',
      },
      ...(usdcBorrow > 0 ? [{
        label: sk ? '→ Borrow max:' : '→ Borrow max:',
        qty: usdcBorrow,
        decimals: 2,
        suffix: 'USDC',
      }] : []),
    ];
  }, [autonomyRedistribution, previewRedistribution, ethPrice, ltvMax, sk]);

  const handleConfirmPlan = useCallback(() => {
    confirmExecutionStep(planKey, { alchemixEthQty: targetQty }, buildDecisionMeta());
    toast.success(sk ? 'Exekúcia potvrdená · baseline aktualizovaný' : 'Execution confirmed · baseline updated');
  }, [confirmExecutionStep, planKey, targetQty, buildDecisionMeta, sk]);

  const handleAutonomousRebalance = useCallback(() => {
    if (!previewRedistribution || freedEthQty <= 0) return;
    const tacticalUsd = previewRedistribution.tacticalEthQty * ethPrice;
    const usdcBorrow = tacticalUsd * (ltvMax / 100);

    const withdrawQty = alchemixDeployedQty > 0
      ? Math.min(freedEthQty, alchemixDeployedQty)
      : 0;

    executeAlchemixAutonomousRebalance({
      withdrawAlchemixEth: withdrawQty,
      coreEthQty: previewRedistribution.coreEthQty,
      tacticalEthQty: previewRedistribution.tacticalEthQty,
      usdcBorrowed: usdcBorrow,
    }, buildDecisionMeta());

    lockAlchemixAutonomous(previewRedistribution);

    toast.success(sk
      ? 'Autonómny rebalans dokončený · Vrstva 4 zamknutá'
      : 'Autonomous rebalance complete · Layer 4 locked');
  }, [
    previewRedistribution, freedEthQty, ethPrice, ltvMax,
    executeAlchemixAutonomousRebalance, buildDecisionMeta, sk,
  ]);

  const handleRevertPlan = useCallback(() => {
    revertExecutionStep(planKey);
    toast.success(sk ? 'Exekúcia vrátená späť' : 'Execution reverted');
  }, [revertExecutionStep, planKey, sk]);

  if (autonomyLocked) {
    return (
      <div className="rounded-xl border border-border/50 bg-muted/30 p-3 space-y-2 opacity-80">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-[11px] font-semibold text-muted-foreground">
            {sk ? 'Autonómny rebalans · HCD Mozog' : 'Autonomous rebalance · HCD brain'}
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          {sk
            ? 'Vrstva 4 je zamknutá na 0 %. Kapitál bol presunutý podľa rizika HCD mozgu.'
            : 'Layer 4 is locked at 0%. Capital was routed per HCD brain risk profile.'}
        </p>
        {redistributionLines.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {redistributionLines.map(line => (
              <p key={line.label} className="text-[10px] font-mono text-foreground/80 tabular-nums">
                {line.label} {line.qty.toFixed(line.decimals)} {line.suffix}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

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
          autonomousMode={showAutonomous}
          onAutonomous={handleAutonomousRebalance}
          redistributionLines={showAutonomous ? redistributionLines : undefined}
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
  buildDecisionMeta,
  alchemixAutonomyLocked,
  alchemixRedistribution,
}: {
  symbol: HcdSymbol;
  lang: Lang;
  totalPortfolioQty: number;
  price: number;
  layers: HcdLayerTarget[];
  rebalanceLocked: boolean;
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
  buildDecisionMeta: () => DecisionConfirmMeta;
  alchemixAutonomyLocked: boolean;
  alchemixRedistribution: AlchemixRedistribution | null;
}) {
  const sk = lang === 'sk';
  const { isExecutionConfirmed } = usePortfolio();
  const apys = useStakingSplitApys();
  const decimals = symbol === 'SOL' ? 2 : 3;
  const totalUsd = totalPortfolioQty * price;

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
          const apy = layerApy(layer, apys);
          const isTactical = layer.id.includes('tactical');
          const isAlchemix = layer.id.includes('alchemix');
          const isCore = layer.id.includes('core');
          const isInfoOnly = !isTactical && !isAlchemix && !isCore;
          const planKey = planKeyForLayer(layer.id);
          const corePlanConfirmed = isCore && isExecutionConfirmed(planKey);
          const isAlchemixLocked = isAlchemix && alchemixAutonomyLocked;
          const displayPct = isAlchemixLocked ? 0 : layer.pctTarget;

          return (
            <div
              key={layer.id}
              className={`rounded-xl border p-2.5 sm:p-3 space-y-2 min-w-0 ${
                isAlchemixLocked
                  ? 'border-border/40 bg-muted/30 opacity-75'
                  : corePlanConfirmed
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
                    <span className={`text-xs font-semibold ${isAlchemixLocked ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {sk ? layer.nameSk : layer.nameEn}
                    </span>
                    {isAlchemixLocked && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-muted-foreground bg-muted/50 border border-border/50 px-1.5 py-0.5 rounded">
                        <Lock className="w-3 h-3" />
                        {sk ? 'HCD Mozog' : 'HCD brain'}
                      </span>
                    )}
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
                  <p className={`font-mono text-sm font-bold tabular-nums ${
                    isAlchemixLocked ? 'text-muted-foreground' : 'text-violet-200'
                  }`}>
                    {displayPct.toFixed(1)}%
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
                  buildDecisionMeta={buildDecisionMeta}
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
                  indicators={indicators}
                  ltvMax={ltvMax}
                  stakedEntries={stakedEntries}
                  buildDecisionMeta={buildDecisionMeta}
                  autonomyLocked={alchemixAutonomyLocked}
                  autonomyRedistribution={alchemixRedistribution}
                />
              )}

              {isCore && (
                <CoreLayerExecution
                  symbol={symbol}
                  lang={lang}
                  layer={layer}
                  totalQty={totalPortfolioQty}
                  assetPrice={price}
                  rebalanceLocked={rebalanceLocked}
                  apyText={apy}
                  buildDecisionMeta={buildDecisionMeta}
                />
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
  const { indicators, rebalance, borrowLoading, borrowRates, temperamentPct } = useHcdIndicators(lang);
  const { market, marketLoading, updating, refresh, unavailable, terminalApys } = useCyborgMarketData();
  const { locked: alchemixAutonomyLocked, redistribution: alchemixRedistribution } = useAlchemixAutonomy();
  const win = getTimingWindow(marketScore);
  const [isEmergencyUnlocked, setIsEmergencyUnlocked] = useState(false);
  const rebalanceLocked = (!rebalance.unlocked || win.locked) && !isEmergencyUnlocked;
  const ltvMax = getHcdLtvMax(indicators, temperamentPct);
  const ltvRestricted = indicators.volatilityRegime === 'high' || indicators.borrowWarning;

  const ethSlice = portfolioData.assets?.ETH ?? EMPTY_SLICE;
  const solSlice = portfolioData.assets?.SOL ?? EMPTY_SLICE;
  const ethTotalQty = portfolioData.totalEthPortfolio;
  const solTotalQty = portfolioData.totalSolPortfolio;
  const ethPrice = portfolioData.prices?.eth ?? 0;
  const solPrice = portfolioData.prices?.sol ?? 0;
  const btcPrice = portfolioData.prices?.btc ?? 0;

  const portfolioUsd = portfolioData.ethBaseline.totalUsd + portfolioData.solBaseline.totalUsd;

  const ethLayers = useMemo(
    () => computeHcdLayerTargets('ETH', indicators, temperamentPct) ?? [],
    [indicators, temperamentPct],
  );
  const solLayers = useMemo(
    () => computeHcdLayerTargets('SOL', indicators, temperamentPct) ?? [],
    [indicators, temperamentPct],
  );

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

  const buildDecisionMeta = useCallback((): DecisionConfirmMeta => ({
    marketConditions: {
      fearGreed: market?.fearGreed ?? null,
      btcRsi: market?.btcRsi ?? null,
      volatilityRegime: indicators.volatilityRegime,
      borrowApyPct: indicators.borrowApyPct,
      targetLtvPct: indicators.targetLtvPct,
      temperamentPct,
      portfolioUsd,
      netYieldPct: netYield,
    },
    balanceSnapshot: capturePortfolioSnapshot(portfolioData, cyborgUsdcDebt),
  }), [market?.fearGreed, market?.btcRsi, indicators, temperamentPct, portfolioUsd, netYield, portfolioData, cyborgUsdcDebt]);

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
      `Buy: ${formatUsd(projectedLbtcUsd)} (LBTC projected)`,
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
    combinedBorrowUsdc, projectedLbtcUsd,
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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 min-w-0">
        {[
          { l: sk ? 'Volatilita' : 'Volatility', v: `${fmtNum(indicators.volatilityPct)}%`, sub: indicators.volatilityRegime, loading: false },
          { l: sk ? 'Cieľové LTV' : 'Target LTV', v: `${indicators.targetLtvPct ?? 30}%`, sub: `max ${ltvMax}%`, loading: false },
          { l: 'USDC Borrow', v: borrowRates?.unavailable.length === 2 ? '0%' : `${fmtNum(indicators.borrowApyPct, 2)}%`, sub: indicators.borrowWarning ? 'warn' : (borrowRates?.unavailable.length ? 'partial' : 'live'), loading: false },
          { l: sk ? 'Gas vrstva' : 'Gas layer', v: `${fmtNum(indicators.gasLayerPct)}%`, sub: indicators.gasStress, loading: false },
          { l: sk ? 'Temperament' : 'Temperament', v: `${temperamentPct}%`, sub: temperamentLabel(temperamentPct, sk), loading: false },
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

      <HcdLearningLog lang={lang} portfolioData={portfolioData} usdcDebt={cyborgUsdcDebt} />

      {/* ── HCD Vrstvy s integrovanou exekúciou ── */}
      <AssetHcdCard
        symbol="ETH"
        lang={lang}
        totalPortfolioQty={ethTotalQty}
        price={ethSlice.currentPrice ?? 0}
        layers={ethLayers}
        rebalanceLocked={rebalanceLocked}
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
        buildDecisionMeta={buildDecisionMeta}
        alchemixAutonomyLocked={alchemixAutonomyLocked}
        alchemixRedistribution={alchemixRedistribution}
      />

      <AssetHcdCard
        symbol="SOL"
        lang={lang}
        totalPortfolioQty={solTotalQty}
        price={solSlice.currentPrice ?? 0}
        layers={solLayers}
        rebalanceLocked={rebalanceLocked}
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
        buildDecisionMeta={buildDecisionMeta}
        alchemixAutonomyLocked={false}
        alchemixRedistribution={null}
      />

      <p className="text-[10px] text-muted-foreground leading-snug">
        {sk
          ? 'HCD mozog riadi indikátory a limity LTV. Exekúcia (presné príkazy, borrow, Alchemix) je priamo vo Vrstve 3 a 4. Rebalans len v kvartálnych mesiacoch.'
          : 'HCD brain drives indicators and LTV limits. Execution (exact commands, borrow, Alchemix) lives in Layers 3 and 4. Rebalance only in quarterly months.'}
      </p>
    </div>
  );
}
